// Replays 1,000 undisciplined traders over real price history, with and without Litmus,
// and writes web/public/replay.json for the /replay page.
//
//   node scripts/replay.mjs
//
// What it is: a simulation. Prices are real daily closes from Binance, kept as a snapshot in
// scripts/replay-prices.json. The traders are seeded
// random ones (the same trades every run). The jury uses the agents' fixed fallback rules, so no model
// is called and the result is reproducible. Each trade is held for three days, then closed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { jurors } from "../agents/jurors.mjs";

const DAYS = 124;
const HOLD = 3;
const TRADES = 40;
const START = 10_000;
const LIMIT_BPS = 500;
const MAJORS = ["BTC", "ETH", "SOL", "NEAR"];
const MEMES = ["DOGE", "PEPE", "WIF", "BONK"];

// Prices are a fixed snapshot kept in the repo, so the result is the same on every machine and
// needs no network. `--refresh` downloads a new window from Binance and overwrites the snapshot.
const SNAPSHOT = new URL("./replay-prices.json", import.meta.url);

async function closes(asset) {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${asset}USDT&interval=1d&limit=${DAYS}`);
  if (!res.ok) throw new Error(`Binance answered ${res.status} for ${asset}`);
  return (await res.json()).map((k) => ({ day: k[0], close: Number(k[4]) }));
}

async function loadPrices() {
  if (process.argv.includes("--refresh") || !existsSync(SNAPSHOT)) {
    const fresh = Object.fromEntries(await Promise.all([...MAJORS, ...MEMES].map(async (a) => [a, await closes(a)])));
    writeFileSync(SNAPSHOT, JSON.stringify(fresh));
    console.log("Downloaded a new price window from Binance.");
  }
  return JSON.parse(readFileSync(SNAPSHOT, "utf8"));
}

// Small seeded generator, so the same traders show up on every run.
let seed = 1;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (list) => list[Math.floor(rnd() * list.length)];

const prices = await loadPrices();
const days = prices.BTC.length;

/** The jury's verdict from its fixed rules: true means approved. */
function approved(p) {
  let yes = 0;
  let no = 0;
  for (const j of jurors) {
    const d = j.rule(p);
    if (d.side === "Yes") yes += Number(d.near);
    else no += Number(d.near);
  }
  return yes > no;
}

function simulate(traderSeed) {
  seed = traderSeed;
  let withV = START;
  let without = START;
  let peakW = START;
  let peakWo = START;
  let ddW = 0;
  let ddWo = 0;
  const series = [];
  const blocked = [];
  const held = new Set(["NEAR"]);

  for (let i = 0; i < TRADES; i++) {
    const t = i * HOLD;
    if (t + HOLD >= days) break;
    // Seven trades in ten are modest buys of a major asset. The rest are large bets on a memecoin.
    const meme = rnd() < 0.3;
    const asset = meme ? pick(MEMES) : pick(MAJORS);
    const size_bps = meme ? 1500 + Math.floor(rnd() * 7) * 500 : 200 + Math.floor(rnd() * 8) * 200;
    const move = prices[asset][t + HOLD].close / prices[asset][t].close - 1;
    const flags = [];
    if (size_bps > LIMIT_BPS) flags.push("Size above the limit");
    if (!held.has(asset)) flags.push("New asset: never held before");
    const proposal = { action: "Buy", asset, size_bps, flags, reason: meme ? `${asset} is up today. Momentum should continue.` : `Add to ${asset} as a core holding.` };
    const runs = flags.length === 0 || approved(proposal);

    without += without * (size_bps / 10_000) * move;
    if (runs) {
      withV += withV * (size_bps / 10_000) * move;
      held.add(asset);
    } else {
      blocked.push({ trade: i + 1, action: "Buy", asset, size_pct: size_bps / 100, would_have_cost_usd: Math.round(-withV * (size_bps / 10_000) * move * 100) / 100 });
    }

    peakW = Math.max(peakW, withV);
    peakWo = Math.max(peakWo, without);
    ddW = Math.max(ddW, (1 - withV / peakW) * 100);
    ddWo = Math.max(ddWo, (1 - without / peakWo) * 100);
    series.push({ trade: i + 1, without_usd: Math.round(without * 100) / 100, with_usd: Math.round(withV * 100) / 100 });
  }
  return { series, blocked, ddW, ddWo, finalW: withV, finalWo: without };
}

// Many traders, not one: a single random trader proves little either way.
const RUNS = 1000;
const runs = Array.from({ length: RUNS }, (_, i) => simulate(i + 1));
const sorted = (f) => runs.map(f).sort((x, y) => x - y);
const q = (list, p) => list[Math.min(list.length - 1, Math.floor(list.length * p))];
const r1 = (x) => Math.round(x * 10) / 10;
const stats = {
  traders: RUNS,
  median_drawdown_without_pct: r1(q(sorted((r) => r.ddWo), 0.5)),
  median_drawdown_with_pct: r1(q(sorted((r) => r.ddW), 0.5)),
  bad_case_drawdown_without_pct: r1(q(sorted((r) => r.ddWo), 0.95)),
  bad_case_drawdown_with_pct: r1(q(sorted((r) => r.ddW), 0.95)),
  median_final_without_usd: Math.round(q(sorted((r) => r.finalWo), 0.5)),
  median_final_with_usd: Math.round(q(sorted((r) => r.finalW), 0.5)),
  worst_final_without_usd: Math.round(q(sorted((r) => r.finalWo), 0.05)),
  worst_final_with_usd: Math.round(q(sorted((r) => r.finalW), 0.05)),
  share_ended_higher_with_pct: r1((runs.filter((r) => r.finalW > r.finalWo).length / RUNS) * 100),
  share_smaller_drawdown_with_pct: r1((runs.filter((r) => r.ddW < r.ddWo).length / RUNS) * 100),
};
// The chart shows one typical trader: the one whose drawdown without Litmus is closest to the median.
const typical = runs.reduce((best, r) => (Math.abs(r.ddWo - stats.median_drawdown_without_pct) < Math.abs(best.ddWo - stats.median_drawdown_without_pct) ? r : best));
const { series, blocked } = typical;

const day = (ms) => new Date(ms).toISOString().slice(0, 10);
const out = {
  source: `real daily closing prices from Binance, ${day(prices.BTC[0].day)} to ${day(prices.BTC[days - 1].day)}; ${RUNS} seeded random traders making ${series.length} trades each; the jury's fixed fallback rules, with no model calls; each trade held for ${HOLD} days`,
  trades: series.length,
  generated_at: new Date(prices.BTC[days - 1].day).toISOString(),
  stats,
  without: { worst_drawdown_pct: r1(typical.ddWo), final_value_usd: series.at(-1).without_usd },
  with: { worst_drawdown_pct: r1(typical.ddW), final_value_usd: series.at(-1).with_usd },
  series,
  blocked,
};
writeFileSync(new URL("../web/public/replay.json", import.meta.url), JSON.stringify(out, null, 1));

console.log(stats);
const lost = blocked.filter((b) => b.would_have_cost_usd > 0).length;
console.log(`Typical trader: ${blocked.length} of ${series.length} trades blocked (${lost} would have lost, ${blocked.length - lost} would have gained). Drawdown ${out.without.worst_drawdown_pct}% without, ${out.with.worst_drawdown_pct}% with.`);
