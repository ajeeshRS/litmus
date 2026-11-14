// The jury: a small swarm of agents, each with its own NEAR account and its own brief for
// judging a trade. When a market opens, each one decides Yes or No, stakes testnet NEAR on it
// and leaves a one-line reason on chain. Jurors that turn out wrong lose their stake to the others.
//
//   node agents/jury.mjs              watch the contract and stake (needs CONTRACT_ID and JURORS)
//   node agents/jury.mjs --dry-run    ask every juror about two sample trades; touches no chain
//
// Settings come from agents/.env (see agents/.env.example). JURORS is matched to the jurors in
// order: sizer, liquidity, sceptic, momentum. The briefs and fallback rules are in jurors.mjs.
import { decide, jurors, mockTrial } from "./jurors.mjs";
import { call, cfg, llm, log, needContract, sleep, view } from "./lib.mjs";

if (process.argv.includes("--dry-run")) {
  console.log(llm.on ? `Asking ${llm.model} for every juror.` : "No LLM_API_KEY set: every juror uses its fixed rule.");
  await mockTrial({ action: "Buy", asset: "ETH", size_bps: 1500, reason: "Rotate idle USDC into ETH. The pot is mostly stablecoins.", flags: ["Size is 15% of the pot (limit 5%)"] });
  await mockTrial({ action: "Buy", asset: "FROGE", size_bps: 4000, reason: "FROGE is up 60% today. Momentum should continue.", flags: ["Size is 40% of the pot (limit 5%)", "New asset: never held before"] });
  process.exit(0);
}

needContract();
const accounts = (process.env.JURORS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (accounts.length === 0) {
  console.error("Set JURORS to a comma-separated list of testnet accounts (sizer, liquidity, sceptic, momentum).");
  process.exit(1);
}
const seated = jurors.slice(0, accounts.length).map((j, i) => ({ ...j, account: accounts[i] }));
log("jury", `watching ${cfg.contract} with ${seated.map((j) => `${j.name}=${j.account}`).join(", ")}`);
log("jury", llm.on ? `every juror asks ${llm.model}` : "every juror uses its fixed rule (no LLM_API_KEY)");

const done = new Set(); // `${marketId}:${juror}`
for (;;) {
  try {
    const m = await view("get_active_market");
    if (m && m.state === "Open" && Date.now() < m.close_time_ms - 4000) {
      // Ask everyone at once, then stake one after another so the market is watchable.
      const waiting = seated.filter((j) => !done.has(`${m.id}:${j.name}`));
      waiting.forEach((j) => done.add(`${m.id}:${j.name}`));
      const decisions = await Promise.all(waiting.map((j) => decide(j, m.proposal, { contract: cfg.contract, marketId: m.id, account: j.account })));
      // Each juror signs with its own account, so the stakes go out side by side, a moment apart.
      await Promise.all(waiting.map(async (j, i) => {
        const d = decisions[i];
        await sleep(i * 1500);
        const note = `${j.name}: ${d.note}`;
        try {
          // With a proof, the contract checks the enclave's signature and reads the side from the model's own answer.
          await call(j.account, "stake", { market_id: m.id, side: d.side, note: d.proof ? `${j.name}:` : note, proof: d.proof }, d.near);
          log(j.name, `staked ${d.near} NEAR on ${d.side.toUpperCase()} (${d.proof ? "verified on chain" : d.by}): ${d.note}`);
        } catch (e) {
          if (!d.proof || !e.contract || !/enclave key is not registered/.test(e.message)) return log(j.name, "stake failed:", e.message);
          // The enclave rotated its key and the owner has not registered the new one yet: stake unverified.
          log(j.name, "enclave key not registered on the contract; staking without a proof");
          await call(j.account, "stake", { market_id: m.id, side: d.side, note, proof: null }, d.near).catch((e2) => log(j.name, "stake failed:", e2.message));
        }
      }));
    }
    // Collect winnings from recently settled markets, so the jurors can keep staking.
    const owed = [];
    for (const s of m ? [] : await view("get_markets", { from: 0, limit: 3 })) {
      for (const j of seated) {
        const tag = `claim:${s.id}:${j.name}`;
        const payout = s.settlement?.payouts.find((x) => x.account_id === j.account && !x.claimed);
        if (!payout || done.has(tag)) continue;
        done.add(tag);
        owed.push({ j, id: s.id, payout });
      }
    }
    await Promise.all(owed.map(async ({ j, id, payout }) => {
      try {
        await call(j.account, "claim", { market_id: id });
        log(j.name, `claimed ${(Number(BigInt(payout.amount_near) / 10n ** 21n) / 1000).toFixed(2)} NEAR from market ${id}`);
      } catch (e) {
        log(j.name, "claim failed:", e.message);
      }
    }));
  } catch (e) {
    log("jury", "poll failed:", e.message);
  }
  await sleep(3000);
}
