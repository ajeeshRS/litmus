// Writes public/recorded-run.json: the fallback scenario the UI plays when the chain is unreachable.
// Shapes match the raw contract shapes in app/lib/adapter.ts. Times are millisecond offsets from the
// moment "Run demo" is pressed; the player turns them into real timestamps.
// Run: node scripts/make-recorded-run.mjs
import { writeFileSync } from "node:fs";

const N = (x) => BigInt(Math.round(x * 1e6)) * 10n ** 18n + ""; // NEAR -> yocto
const U = (x) => Math.round(x * 1e6) + ""; // USD -> micro-USD
const s = (sec) => Math.round(sec * 1000);

const manager = { account_id: "trader.testnet", kind: "Scripted" };
const vault = (pot, holdings) => ({
  pot_value_usd: U(pot),
  holdings: holdings.map(([asset, amount, decimals, value]) => ({
    asset,
    amount: BigInt(Math.round(amount * 1e6)) * 10n ** BigInt(decimals - 6) + "",
    decimals,
    value_usd: U(value),
  })),
  manager,
  bond_near: N(2),
  threshold_bps: 500,
  min_stake_near: N(0.1),
});

const v0 = vault(10000, [["USDC", 6000, 6, 6000], ["NEAR", 1600, 24, 4000]]);
const v1 = vault(10000, [["USDC", 5700, 6, 5700], ["NEAR", 1600, 24, 4000], ["BTC", 0.003, 8, 300]]);
const v2 = vault(10000, [["USDC", 4200, 6, 4200], ["NEAR", 1600, 24, 4000], ["ETH", 0.428571, 18, 1500], ["BTC", 0.003, 8, 300]]);
const v3 = vault(10027, [["USDC", 4200, 6, 4200], ["NEAR", 1600, 24, 4000], ["ETH", 0.428571, 18, 1527], ["BTC", 0.003, 8, 300]]);

const market = (id, proposal, over = {}) => ({
  id,
  state: "Proposed",
  proposal,
  proposed_at_ms: 0,
  opened_at_ms: null,
  close_time_ms: null,
  yes_near: "0",
  no_near: "0",
  verdict: null,
  executed: false,
  settlement: null,
  tx_hash: null,
  ...over,
});

// Winners get their stake back plus a pro-rata share of the losing pool (and the bond, if slashed).
function payouts(stakes, winSide, extra = 0) {
  const win = stakes.filter((x) => x[1] === winSide);
  const lose = stakes.filter((x) => x[1] !== winSide).reduce((a, x) => a + x[2], 0) + extra;
  const total = win.reduce((a, x) => a + x[2], 0);
  return win.map(([account_id, , amt]) => ({ account_id, amount_near: N(amt + (lose * amt) / total) }));
}
const stakeRows = (stakes) => stakes.map(([account_id, side, amt, t, note]) => ({ account_id, side, amount_near: N(amt), time_ms: s(t), note: note ?? null }));
const sum = (stakes, side, upTo = Infinity) => N(stakes.filter((x) => x[1] === side && x[3] <= upTo).reduce((a, x) => a + x[2], 0));

// ---- history shown before the demo runs (negative offsets = before page load) ----
const J = { sizer: "sizer-jury.testnet", liq: "liq-jury.testnet", sceptic: "sceptic-jury.testnet", momo: "momo-jury.testnet" };
const h1Stakes = [[J.sizer, "Yes", 2, 0, "sizer: 10% is above the limit but the pot can absorb it."], [J.liq, "Yes", 1.5, 0, "liquidity: NEAR is a deep market. The vault can exit at any time."], [J.sceptic, "No", 1, 0, "sceptic: Sound idea, but I would have sized it smaller."]];
const h2Stakes = [[J.liq, "No", 3, 0, "liquidity: PEPE2 is new to the vault and not a deep market. Hard to exit."], [J.sceptic, "No", 2, 0, "sceptic: Copying one wallet is not a thesis."], [J.momo, "Yes", 1, 0, "momentum: PEPE2 has buyers right now. I would follow them."]];
const history = [
  market("h2", { action: "Buy", asset: "PEPE2", size_bps: 2500, size_usd: U(2500), reason: "Copying a wallet that made 9x on it last week.", quote_price_usd: U(0.0412), flags: ["Size is 25% of the pot (limit 5%)", "New asset: never held before"] }, {
    state: "Settled", proposed_at_ms: -s(3 * 3600), opened_at_ms: -s(3 * 3600 - 8), close_time_ms: -s(3 * 3600 - 68),
    yes_near: sum(h2Stakes, "Yes"), no_near: sum(h2Stakes, "No"), verdict: "Blocked", executed: false,
    settlement: { price_move_bps: -1840, pnl_usd: U(-460), payouts: payouts(h2Stakes, "No", 2), bond_result: "Slashed", bond_amount_near: N(2), pot_effect_usd: "0" },
  }),
  market("h1", { action: "Buy", asset: "NEAR", size_bps: 1000, size_usd: U(1000), reason: "Add to the core NEAR position after a 6% dip.", quote_price_usd: U(2.5), flags: ["Size is 10% of the pot (limit 5%)"] }, {
    state: "Settled", proposed_at_ms: -s(5 * 3600), opened_at_ms: -s(5 * 3600 - 8), close_time_ms: -s(5 * 3600 - 68),
    yes_near: sum(h1Stakes, "Yes"), no_near: sum(h1Stakes, "No"), verdict: "Approved", executed: true,
    settlement: { price_move_bps: 90, pnl_usd: U(9), payouts: payouts(h1Stakes, "Yes"), bond_result: "Returned", bond_amount_near: N(2), pot_effect_usd: U(9) },
  }),
];

// ---- the scenario ----
const frames = [];
const at = (t, patch) => frames.push({ t_ms: s(t), ...patch });

// Trade 1: small, under the threshold, passes instantly.
const m1 = market("m1", { action: "Buy", asset: "BTC", size_bps: 300, size_usd: U(300), reason: "Start a small BTC position with idle USDC.", quote_price_usd: U(100000), flags: [] }, { proposed_at_ms: s(1) });
at(1, { active: m1, stakes: [] });
at(8, { active: null, vault: v1, docket_add: { ...m1, state: "PassedInstantly", verdict: "Approved", executed: true } });

// Trade 2: sensible but large, goes to market, approved.
const st2 = [[J.sizer, "Yes", 2, 24, "sizer: 15% is above the limit but the pot can absorb it."], [J.liq, "Yes", 1.5, 28, "liquidity: ETH is a deep market. The vault can exit at any time."], [J.sceptic, "No", 1, 33, "sceptic: Sound idea, but I would have sized it smaller."], [J.momo, "Yes", 1, 38, "momentum: ETH has buyers right now. I would follow them."]];
const p2 = { action: "Buy", asset: "ETH", size_bps: 1500, size_usd: U(1500), reason: "Rotate idle USDC into ETH. The pot is 57% stablecoins.", quote_price_usd: U(3500), flags: ["Size is 15% of the pot (limit 5%)"] };
const m2 = market("m2", p2, { proposed_at_ms: s(14) });
const m2open = { ...m2, state: "Open", opened_at_ms: s(20), close_time_ms: s(50) };
at(14, { active: m2, stakes: [] });
at(20, { active: m2open });
for (const row of st2) at(row[3], { active: { ...m2open, yes_near: sum(st2, "Yes", row[3]), no_near: sum(st2, "No", row[3]) }, stakes: stakeRows(st2.filter((x) => x[3] <= row[3])) });
const m2verdict = { ...m2open, state: "Verdict", yes_near: sum(st2, "Yes"), no_near: sum(st2, "No"), verdict: "Approved", executed: true };
at(50, { active: m2verdict, vault: v2 });
const m2settled = { ...m2verdict, state: "Settled", settlement: { price_move_bps: 180, pnl_usd: U(27), payouts: payouts(st2, "Yes"), bond_result: "Returned", bond_amount_near: N(2), pot_effect_usd: U(27) } };
at(59, { active: m2settled, vault: v3 });
at(72, { active: null, docket_add: m2settled });

// Trade 3: a bad trade. Blocked, then settled to show what it would have cost.
const st3 = [[J.sizer, "No", 2, 91, "sizer: 40% of the pot in one trade is more than it can absorb."], [J.liq, "No", 3, 97, "liquidity: FROGE is new to the vault and not a deep market. Hard to exit."], [J.sceptic, "No", 2, 104, "sceptic: The reason is a price that already moved. That is chasing, not a thesis."], [J.momo, "Yes", 1, 111, "momentum: FROGE has buyers right now. I would follow them."]];
const p3 = { action: "Buy", asset: "FROGE", size_bps: 4000, size_usd: U(4010.8), reason: "FROGE is up 60% today. Momentum should continue.", quote_price_usd: U(0.0087), flags: ["Size is 40% of the pot (limit 5%)", "New asset: never held before"] };
const m3 = market("m3", p3, { proposed_at_ms: s(78) });
const m3open = { ...m3, state: "Open", opened_at_ms: s(86), close_time_ms: s(126) };
at(78, { active: m3, stakes: [] });
at(86, { active: m3open });
for (const row of st3) at(row[3], { active: { ...m3open, yes_near: sum(st3, "Yes", row[3]), no_near: sum(st3, "No", row[3]) }, stakes: stakeRows(st3.filter((x) => x[3] <= row[3])) });
const m3verdict = { ...m3open, state: "Verdict", yes_near: sum(st3, "Yes"), no_near: sum(st3, "No"), verdict: "Blocked", executed: false };
at(126, { active: m3verdict });
const m3settled = { ...m3verdict, state: "Settled", settlement: { price_move_bps: -3100, pnl_usd: U(-1243.35), payouts: payouts(st3, "No", 2), bond_result: "Slashed", bond_amount_near: N(2), pot_effect_usd: "0" } };
at(136, { active: m3settled, vault: { ...v3, bond_near: "0" }, docket_add: m3settled, end: true });

frames.sort((a, b) => a.t_ms - b.t_ms);
const out = { note: "Recorded scenario. Not live chain data.", initial: { vault: v0, markets: history, stakes_by_market: { h1: stakeRows(h1Stakes), h2: stakeRows(h2Stakes) } }, frames };
writeFileSync(new URL("../public/recorded-run.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`recorded-run.json: ${frames.length} frames, ${frames.at(-1).t_ms / 1000}s`);
