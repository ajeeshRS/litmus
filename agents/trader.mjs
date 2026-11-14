// The manager and the keeper for the demo. Proposes three trades against the live contract,
// closes each market and settles it.
//
//   node agents/trader.mjs              run once (needs CONTRACT_ID and MANAGER)
//   node agents/trader.mjs --serve      wait for the UI's "Run demo" button
//   node agents/trader.mjs --dry-run    print the three proposals and what the jury would say; touches no chain
//
// What is real and what is not:
//   - BTC, ETH, SOL and NEAR are priced from the live market (Binance, then CoinGecko), both for
//     the quote and for settlement. Whatever the market does in the window is what settles.
//   - FROGE is a made-up token for the "bad trade" round. Its price and its fall are scripted.
//   - Every blocked bad trade moves the manager's bond to the jurors. So the demo can be repeated,
//     the richest juror sends testnet NEAR back to the manager when it runs short. Demo plumbing only.
//   - With LLM_API_KEY set, a model writes each proposal (asset, size, reason) from a brief for
//     that round, within bounds. Without a key, or if a call fails, a fixed proposal is used.
import { createServer } from "node:http";
import { mockTrial } from "./jurors.mjs";
import { askJSON, attestedKeys, balance, call, cfg, llm, log, needContract, sleep, transfer, usd, view } from "./lib.mjs";

const MAJORS = { BTC: ["BTCUSDT", "bitcoin", 8], ETH: ["ETHUSDT", "ethereum", 18], SOL: ["SOLUSDT", "solana", 9], NEAR: ["NEARUSDT", "near", 24] };
const FALLBACK = { BTC: 100000, ETH: 3500, SOL: 150, NEAR: 2.5 };
const FROGE = { start: 0.0087, after: 0.006003 }; // scripted: falls 31% after the vote

/** Live prices and 24 h change for the major assets. Falls back so a demo never stalls. */
async function market() {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(Object.values(MAJORS).map((m) => m[0])))}`, { signal: AbortSignal.timeout(8000) });
    const rows = await res.json();
    const out = {};
    for (const [asset, [symbol]] of Object.entries(MAJORS)) {
      const r = rows.find((x) => x.symbol === symbol);
      out[asset] = { price: Number(r.lastPrice), change: Number(r.priceChangePercent) };
    }
    if (Object.values(out).every((x) => x.price > 0)) return { source: "Binance", ...out };
  } catch { /* try the next source */ }
  try {
    const ids = Object.values(MAJORS).map((m) => m[1]).join(",");
    const rows = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`, { signal: AbortSignal.timeout(8000) })).json();
    const out = {};
    for (const [asset, [, id]] of Object.entries(MAJORS)) out[asset] = { price: rows[id].usd, change: rows[id].usd_24h_change ?? 0 };
    return { source: "CoinGecko", ...out };
  } catch { /* fall through */ }
  log("trader", "no live price source answered; using fixed fallback prices");
  return { source: "fallback", ...Object.fromEntries(Object.entries(FALLBACK).map(([a, price]) => [a, { price, change: 0 }])) };
}

// Three rounds. Each has a brief for the model, bounds the answer must stay inside, and a fixed fallback.
const rounds = [
  {
    brief: "Open a small starter position in one major asset. Keep it small enough that it needs no review (under 5% of the pot).",
    assets: ["BTC", "ETH", "SOL"], min: 100, max: 450,
    fixed: { asset: "BTC", size_bps: 300, reason: "Start a small BTC position with idle USDC." },
  },
  {
    brief: "Most of the pot is idle stablecoins. Put a meaningful share to work in one major asset you do not hold yet. Give a concrete portfolio reason.",
    assets: ["BTC", "ETH", "SOL"], min: 1000, max: 2000,
    fixed: { asset: "ETH", size_bps: 1500, reason: "Rotate idle USDC into ETH. The pot is mostly stablecoins." },
  },
  {
    brief: "You are behind your target for the week and impatient. FROGE, a memecoin launched three days ago, is up 60% today and everyone is talking about it. Go big on it. Your reason is that it is going up.",
    assets: ["FROGE"], min: 3000, max: 4500,
    fixed: { asset: "FROGE", size_bps: 4000, reason: "FROGE is up 60% today. Momentum should continue." },
  },
];

async function proposal(round, mkt, held) {
  const assets = round.assets.filter((a) => !held.has(a)).length ? round.assets.filter((a) => !held.has(a)) : round.assets;
  const fixed = { action: "Buy", ...(assets.includes(round.fixed.asset) ? round.fixed : { ...round.fixed, asset: assets[0], reason: round.fixed.reason.replaceAll(round.fixed.asset, assets[0]) }), by: "script" };
  if (!llm.on) return fixed;
  try {
    const list = assets.map((a) => (a === "FROGE" ? "FROGE: memecoin, launched 3 days ago, +60% today, thin liquidity" : `${a}: $${mkt[a].price}, ${mkt[a].change >= 0 ? "+" : ""}${mkt[a].change.toFixed(1)}% in 24h`)).join("\n");
    const out = await askJSON(
      `You manage a small investment vault and propose its trades. ${round.brief}\nReply with JSON only, no other text: {"asset":one of ${JSON.stringify(assets)},"size_pct":a number from ${round.min / 100} to ${round.max / 100} (percent of the pot),"reason":"one or two plain sentences in your own voice, at most 200 characters"}.`,
      `The vault already holds: ${[...held].join(", ") || "only USDC"}.\nWhat you can buy:\n${list}`,
    );
    if (!assets.includes(out.asset)) throw new Error("model picked an asset outside the list");
    const size_bps = Math.round(Math.min(round.max, Math.max(round.min, Number(out.size_pct) * 100)) / 50) * 50;
    const reason = String(out.reason ?? "").replace(/\s+/g, " ").slice(0, 270);
    if (!size_bps || reason.length < 10) throw new Error("model gave no usable size or reason");
    return { action: "Buy", asset: out.asset, size_bps, reason, by: "model" };
  } catch (e) {
    log("trader", "model call failed, using the fixed proposal:", e.message);
    return fixed;
  }
}

if (process.argv.includes("--dry-run")) {
  const mkt = await market();
  console.log(`Prices from ${mkt.source}. ${llm.on ? `Proposals written by ${llm.model}.` : "No LLM_API_KEY set: fixed proposals and fixed juror rules."}`);
  const held = new Set(["NEAR"]);
  const want = [true, true, false]; // round 1 skips the jury; round 2 should pass; round 3 should be blocked
  let ok = true;
  for (const [i, round] of rounds.entries()) {
    const p = await proposal(round, mkt, held);
    if (i === 0) {
      console.log(`\nBuy ${p.asset}, ${p.size_bps / 100}% of the pot (${p.by}): "${p.reason}"\n  => under the 5% limit: passes with no market`);
    } else {
      const flags = [`Size is ${p.size_bps / 100}% of the pot (limit 5%)`, ...(p.asset === "FROGE" ? ["New asset: never held before"] : [])];
      const approved = await mockTrial({ ...p, reason: p.reason, flags });
      if (approved !== want[i]) ok = false;
    }
    held.add(p.asset);
  }
  console.log(ok ? "\nStory holds: round 2 approved, round 3 blocked." : "\nSTORY BROKEN: the verdicts are not what the demo needs.");
  process.exit(ok ? 0 : 1);
}

needContract();
const manager = process.env.MANAGER;
const owner = process.env.OWNER ?? cfg.contract;
if (!manager) {
  console.error("Set MANAGER to the trader's testnet account.");
  process.exit(1);
}

const waitUntil = async (ms) => { const d = ms - Date.now(); if (d > 0) await sleep(d + 1500); };
const units = (amount, decimals) => String(BigInt(Math.round(amount * 1e6)) * 10n ** BigInt(decimals - 6));

/** Make sure the manager can post its bond. The bond drains to the jurors, so they send some back. */
async function fundManager() {
  const vault = await view("get_vault");
  const owed = Number((BigInt(vault.bond_required_near) - BigInt(vault.bond_near)) / 10n ** 21n) / 1000;
  const need = Math.max(0, owed) + 0.5; // the bond still to post, plus gas for the run
  const have = await balance(manager);
  if (have >= need) return;
  const jurors = (process.env.JURORS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const rich = (await Promise.all(jurors.map(async (j) => ({ j, near: await balance(j) })))).sort((a, b) => b.near - a.near)[0];
  const send = Math.ceil(need - have + 2);
  if (!rich || rich.near < send + 3) throw new Error(`The trader account has ${have.toFixed(2)} NEAR and needs ${need.toFixed(2)} for its bond and gas. Top it up from the testnet faucet.`);
  await transfer(rich.j, manager, send);
  log("trader", `${rich.j} sent ${send} NEAR back to the manager so it can post its bond`);
}

let running = false;
let lastError = null;
async function run() {
  if (running) return log("trader", "a run is already in progress");
  running = true;
  lastError = null;
  try {
    if (await view("get_active_market")) throw new Error("A market is still open. Wait for it to settle.");
    await fundManager();
    let mkt = await market();
    log("trader", `prices from ${mkt.source}: ${Object.keys(MAJORS).map((a) => `${a} $${mkt[a].price}`).join(", ")}`);
    // Put the mock vault back to about $10,000 (6,000 USDC and $4,000 of NEAR), so every run starts the same.
    const seed = [["USDC", "6000000000", 6], ["NEAR", units(Math.round(4000 / mkt.NEAR.price), 24), 24], ["BTC", "0", 8], ["ETH", "0", 18], ["SOL", "0", 9]];
    // One account signs these, so they go out one after another.
    for (const [asset, amount, decimals] of seed) await call(owner, "seed_holding", { asset, amount, decimals });
    // Register the enclave key NEAR AI Cloud currently attests for the model, so jurors' proofs verify.
    if (llm.on) {
      try {
        const known = new Set((await view("get_tee_keys")).map(([k]) => k));
        for (const k of await attestedKeys()) {
          if (known.has(k)) continue;
          await call(owner, "register_tee_key", { model: llm.model, signing_key: k });
          log("keeper", `registered enclave key ${k.slice(0, 12)}… for ${llm.model}`);
        }
      } catch (e) {
        log("keeper", "could not refresh enclave keys:", e.message);
      }
    }
    const kind = llm.on ? "Ai" : "Scripted";
    if ((await view("get_vault")).manager.kind !== kind) await call(owner, "set_manager_kind", { kind });
    for (const a of Object.keys(MAJORS)) await call(owner, "set_price", { asset: a, price_usd: usd(mkt[a].price) });
    await call(owner, "set_price", { asset: "FROGE", price_usd: usd(FROGE.start) });

    const vault = await view("get_vault");
    if (BigInt(vault.bond_near) < BigInt(vault.bond_required_near)) {
      const missing = Number((BigInt(vault.bond_required_near) - BigInt(vault.bond_near)) / 10n ** 21n) / 1000;
      await call(manager, "post_bond", {}, String(missing));
      log("trader", `posted ${missing} NEAR bond`);
    }

    const held = new Set(["NEAR"]);
    for (const round of rounds) {
      await sleep(3000);
      const p = await proposal(round, mkt, held);
      held.add(p.asset);
      await call(manager, "propose", { action: p.action, asset: p.asset, size_bps: p.size_bps, reason: p.reason });
      const m = (await view("get_markets", { from: 0, limit: 1 }))[0];
      log("trader", `proposed ${p.action} ${p.asset} ${p.size_bps / 100}% (${p.by}) -> ${m.state}: ${p.reason}`);
      if (m.state !== "Open") continue;
      await waitUntil(m.close_time_ms);
      await call(owner, "resolve", { market_id: m.id });
      const v = await view("get_market", { market_id: m.id });
      log("keeper", `verdict: ${v.verdict} (yes ${Number(BigInt(v.yes_near) / 10n ** 22n) / 100}, no ${Number(BigInt(v.no_near) / 10n ** 22n) / 100})`);
      await waitUntil(v.settle_after_ms - 7000);
      // Settlement price: the live market for real assets, the script for FROGE.
      const after = p.asset === "FROGE" ? FROGE.after : (mkt = await market())[p.asset].price;
      await call(owner, "set_price", { asset: p.asset, price_usd: usd(after) });
      await waitUntil(v.settle_after_ms);
      await call(owner, "settle", { market_id: m.id });
      const s = (await view("get_market", { market_id: m.id })).settlement;
      log("keeper", `settled: move ${s.price_move_bps / 100}%, pnl ${Number(s.pnl_usd) / 1e6} USD, bond ${s.bond_result}`);
    }
    log("trader", "run finished");
  } finally {
    running = false;
  }
}

if (process.argv.includes("--serve")) {
  const port = Number(process.env.PORT ?? 8787);
  createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    // GET tells the page whether a run is in progress and why the last one stopped, if it failed.
    if (req.method === "GET") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ running, error: lastError }));
    if (req.method !== "POST") return res.writeHead(405).end();
    if (running) return res.writeHead(409).end("already running");
    run().catch((e) => { lastError = e.message; log("trader", "run failed:", e.message); });
    res.writeHead(202).end("started");
  }).listen(port, () => log("trader", `waiting for "Run demo" on http://localhost:${port}`));
} else {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
