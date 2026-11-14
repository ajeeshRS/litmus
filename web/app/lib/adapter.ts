/**
 * The only file that knows the contract's method names, field names and raw units.
 * Everything else in the app works with the view models exported from here.
 *
 * Method and field names are PROPOSED. When the contract design is final, rename here.
 *
 * Raw units:
 *   NEAR amounts  -> yoctoNEAR decimal strings (24 decimals)
 *   USD amounts   -> micro-USD decimal strings (6 decimals), may be negative
 *   ratios        -> basis points (integers)
 *   times         -> unix milliseconds
 * Raw amounts are only ever handled as BigInt. No float maths on them.
 */

export const config = {
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID?.trim() || "",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL?.trim() || "https://test.rpc.fastnear.com",
  demoTriggerUrl: process.env.NEXT_PUBLIC_DEMO_TRIGGER_URL?.trim() || "",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL?.trim() || "",
  explorerTx: (hash: string) => `https://testnet.nearblocks.io/txns/${hash}`,
  explorerAccount: (id: string) => `https://testnet.nearblocks.io/address/${id}`,
};

const METHODS = {
  getVault: "get_vault",
  getActiveMarket: "get_active_market",
  getStakes: "get_stakes",
  getMarkets: "get_markets",
  getMarket: "get_market",
  stake: "stake",
  claim: "claim",
} as const;

/* ---------- raw shapes (what the contract, or the recorded JSON, returns) ---------- */

export interface RawVault {
  pot_value_usd: string;
  holdings: { asset: string; amount: string; decimals: number; value_usd: string }[];
  manager: { account_id: string; kind: "Ai" | "Scripted" };
  bond_near: string;
  threshold_bps: number;
  min_stake_near: string;
}

export interface RawSettlement {
  price_move_bps: number;
  pnl_usd: string;
  payouts: { account_id: string; amount_near: string }[];
  bond_result: "Returned" | "Slashed";
  bond_amount_near: string;
  pot_effect_usd: string;
}

export interface RawMarket {
  id: string | number;
  /** The contract never returns "Proposed"; the recorded run uses it for the first few seconds. */
  state: "Proposed" | "Open" | "Verdict" | "Settled" | "PassedInstantly";
  proposal: {
    action: string;
    asset: string;
    size_bps: number;
    size_usd: string;
    reason: string;
    quote_price_usd: string;
    flags: string[];
  };
  proposed_at_ms: number;
  opened_at_ms: number | null;
  close_time_ms: number | null;
  yes_near: string;
  no_near: string;
  verdict: "Approved" | "Blocked" | null;
  executed: boolean;
  settlement: RawSettlement | null;
  /** A contract cannot know its own transaction hash, so live markets leave this out. */
  tx_hash?: string | null;
}

export interface RawStake {
  account_id: string;
  side: "Yes" | "No";
  amount_near: string;
  time_ms: number;
  /** The staker's one-line reason. Jury agents write "name: reason". */
  note?: string | null;
  /** Set when the contract verified the stake against an enclave-signed model answer. */
  proof?: { model: string; request_hash: string; response_hash: string; signature: string; signing_key: string } | null;
}

/* ---------- view models ---------- */

export type Side = "yes" | "no";
export type Sign = "up" | "down" | "flat";

export interface VaultVM {
  potRaw: string;
  pot: string;
  holdings: { asset: string; amount: string; value: string; sharePct: number; share: string }[];
  manager: { accountId: string; kind: string };
  bond: string;
  threshold: string;
  minStakeRaw: string;
  minStake: string;
}

export interface SettlementVM {
  priceMove: string;
  priceSign: Sign;
  pnl: string;
  /** Unsigned, for sentences like "would have lost $1,240.00". */
  pnlAbs: string;
  priceMoveAbs: string;
  pnlSign: Sign;
  payouts: { accountId: string; amount: string }[];
  bond: "returned" | "slashed";
  bondAmount: string;
  potEffect: string;
  potEffectSign: Sign;
}

export type Phase = "proposed" | "open" | "verdict" | "settled" | "instant";

export interface MarketVM {
  id: string;
  phase: Phase;
  proposal: {
    action: string;
    asset: string;
    size: string;
    sizeUsd: string;
    reason: string;
    quotePrice: string;
    flags: string[];
  };
  proposedAt: number;
  openedAt: number | null;
  closeTime: number | null;
  yes: string;
  no: string;
  yesPct: number;
  noPct: number;
  hasStakes: boolean;
  verdict: "approved" | "blocked" | null;
  executed: boolean;
  settlement: SettlementVM | null;
  explorerUrl: string | null;
}

export interface StakeVM {
  accountId: string;
  side: Side;
  amount: string;
  time: number;
  /** Juror name, when the note starts with one ("sizer: ..."). */
  juror: string | null;
  note: string | null;
  /** The contract checked this verdict against the model's enclave-signed answer. */
  proof: { model: string; signingKey: string; requestHash: string; responseHash: string } | null;
}

/* ---------- formatting (BigInt only) ---------- */

function big(raw: string | undefined | null): bigint {
  try {
    return BigInt(raw ?? "0");
  } catch {
    return 0n;
  }
}

/** Format an integer string with `decimals` implied decimals to `frac` places, rounded half up. */
export function formatUnits(raw: string, decimals: number, frac: number): string {
  let v = big(raw);
  const neg = v < 0n;
  if (neg) v = -v;
  const drop = decimals - frac;
  if (drop > 0) {
    const d = 10n ** BigInt(drop);
    v = (v + d / 2n) / d;
  } else if (drop < 0) {
    v = v * 10n ** BigInt(-drop);
  }
  const scale = 10n ** BigInt(frac);
  const whole = (v / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = frac > 0 ? "." + (v % scale).toString().padStart(frac, "0") : "";
  return (neg && v !== 0n ? "\u2212" : "") + whole + rest;
}

const usd = (raw: string) => {
  const s = formatUnits(raw, 6, 2);
  return s.startsWith("\u2212") ? "\u2212$" + s.slice(1) : "$" + s;
};
/** Prices under $1 keep more decimals, so a memecoin quote does not round to $0.01. */
const price = (raw: string) => {
  const v = big(raw) < 0n ? -big(raw) : big(raw);
  return v >= 1000000n ? usd(raw) : "$" + formatUnits(raw, 6, v >= 1000n ? 4 : 6);
};
const signedUsd = (raw: string) => (big(raw) > 0n ? "+" : "") + usd(raw);
const near = (raw: string) => formatUnits(raw, 24, 2) + " NEAR";
const signOf = (v: bigint): Sign => (v > 0n ? "up" : v < 0n ? "down" : "flat");

function bpsText(bps: number, signed = false): string {
  const abs = Math.abs(bps) / 100;
  const body = (Number.isInteger(abs) ? abs.toString() : abs.toFixed(abs < 10 ? 2 : 1)) + "%";
  if (!signed) return (bps < 0 ? "\u2212" : "") + body;
  return (bps > 0 ? "+" : bps < 0 ? "\u2212" : "") + body;
}

/** "1.5" -> yoctoNEAR string. Returns null when the text is not a valid amount. */
export function parseNear(text: string): string | null {
  const t = text.trim();
  if (!/^\d*(\.\d{0,24})?$/.test(t) || t === "" || t === ".") return null;
  const [w = "", f = ""] = t.split(".");
  return BigInt((w || "0") + f.padEnd(24, "0")).toString();
}

/** yoctoNEAR -> plain decimal text for an input field, trailing zeros removed. */
export function nearInputText(raw: string): string {
  return formatUnits(raw, 24, 4).replace(/,/g, "").replace(/\.?0+$/, "");
}

export const formatNear = near;
export const compareRaw = (a: string, b: string) => (big(a) < big(b) ? -1 : big(a) > big(b) ? 1 : 0);
export const subRaw = (a: string, b: string) => {
  const d = big(a) - big(b);
  return d > 0n ? d.toString() : "0";
};

export function potChange(startRaw: string, nowRaw: string): { text: string; sign: Sign } {
  const d = big(nowRaw) - big(startRaw);
  // Under half a cent either way reads as no change, so "$0.00" is never shown as a gain or a loss.
  const flat = d > -5000n && d < 5000n;
  return { text: flat ? "$0.00" : signedUsd(d.toString()), sign: flat ? "flat" : signOf(d) };
}

export function shortAccount(id: string): string {
  return id.length > 24 ? id.slice(0, 8) + "\u2026" + id.slice(-6) : id;
}

/* ---------- raw -> view model ---------- */

export function toVault(r: RawVault): VaultVM {
  const pot = big(r.pot_value_usd);
  return {
    potRaw: r.pot_value_usd,
    pot: usd(r.pot_value_usd),
    holdings: r.holdings.map((h) => {
      const shareBps = pot > 0n ? Number((big(h.value_usd) * 10000n) / pot) : 0;
      return {
        asset: h.asset,
        amount: formatUnits(h.amount, h.decimals, h.decimals > 6 ? 4 : 2),
        value: usd(h.value_usd),
        sharePct: shareBps / 100,
        share: bpsText(Math.round(shareBps / 10) * 10),
      };
    }),
    manager: { accountId: r.manager.account_id, kind: r.manager.kind === "Ai" ? "AI trader" : "Scripted" },
    bond: near(r.bond_near),
    threshold: bpsText(r.threshold_bps),
    minStakeRaw: r.min_stake_near,
    minStake: near(r.min_stake_near),
  };
}

const PHASES: Record<RawMarket["state"], Phase> = {
  Proposed: "proposed",
  Open: "open",
  Verdict: "verdict",
  Settled: "settled",
  PassedInstantly: "instant",
};

export function toMarket(r: RawMarket): MarketVM {
  const yes = big(r.yes_near);
  const no = big(r.no_near);
  const total = yes + no;
  const yesPct = total > 0n ? Number((yes * 10000n) / total) / 100 : 50;
  const s = r.settlement;
  return {
    id: String(r.id),
    phase: PHASES[r.state] ?? "proposed",
    proposal: {
      action: r.proposal.action,
      asset: r.proposal.asset,
      size: bpsText(r.proposal.size_bps),
      sizeUsd: usd(r.proposal.size_usd),
      reason: r.proposal.reason,
      quotePrice: price(r.proposal.quote_price_usd),
      flags: r.proposal.flags,
    },
    proposedAt: r.proposed_at_ms,
    openedAt: r.opened_at_ms,
    closeTime: r.close_time_ms,
    yes: near(r.yes_near),
    no: near(r.no_near),
    yesPct,
    noPct: total > 0n ? Math.round((100 - yesPct) * 100) / 100 : 50,
    hasStakes: total > 0n,
    verdict: r.verdict === "Approved" ? "approved" : r.verdict === "Blocked" ? "blocked" : null,
    executed: r.executed,
    settlement: s && {
      priceMove: bpsText(s.price_move_bps, true),
      priceSign: s.price_move_bps > 0 ? "up" : s.price_move_bps < 0 ? "down" : "flat",
      pnl: signedUsd(s.pnl_usd),
      pnlAbs: usd(s.pnl_usd).replace("\u2212", ""),
      priceMoveAbs: bpsText(Math.abs(s.price_move_bps)),
      pnlSign: signOf(big(s.pnl_usd)),
      payouts: s.payouts.map((p) => ({ accountId: p.account_id, amount: near(p.amount_near) })),
      bond: s.bond_result === "Slashed" ? "slashed" : "returned",
      bondAmount: near(s.bond_amount_near),
      potEffect: signedUsd(s.pot_effect_usd),
      potEffectSign: signOf(big(s.pot_effect_usd)),
    },
    explorerUrl: r.tx_hash ? config.explorerTx(r.tx_hash) : null,
  };
}

export function toStake(r: RawStake): StakeVM {
  const m = /^([a-z][a-z0-9-]{1,20}):\s*(.+)$/is.exec(r.note ?? "");
  return { accountId: r.account_id, side: r.side === "Yes" ? "yes" : "no", amount: near(r.amount_near), time: r.time_ms, juror: m ? m[1].toLowerCase() : null, note: m ? m[2] : r.note || null, proof: r.proof ? { model: r.proof.model, signingKey: r.proof.signing_key, requestHash: r.proof.request_hash, responseHash: r.proof.response_hash } : null };
}

/* ---------- RPC reads ---------- */

let rpcId = 0;

// Public RPCs rate-limit. A failed read moves on to the next endpoint, and stays there.
const RPCS = [...new Set([config.rpcUrl, "https://near-testnet.drpc.org", "https://rpc.testnet.fastnear.com"])];
let rpcAt = 0;

async function rpc<T>(method: string, params: unknown): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < RPCS.length; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(RPCS[rpcAt % RPCS.length], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`RPC answered ${res.status}`);
      const json = await res.json();
      // A contract-level answer (even an error) is final; only transport trouble moves to the next endpoint.
      if (json.result?.error) return Promise.reject(new Error(json.result.error));
      if (json.error) throw new Error(json.error.data ?? json.error.message ?? "RPC error");
      return json.result as T;
    } catch (e) {
      last = e;
      rpcAt++;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last;
}

async function view<T>(method: string, args: object = {}): Promise<T> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "optimistic",
    account_id: config.contractId,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result))) as T;
}

export const contract = {
  getVault: () => view<RawVault>(METHODS.getVault),
  getActiveMarket: () => view<RawMarket | null>(METHODS.getActiveMarket),
  getStakes: (marketId: string) => view<RawStake[]>(METHODS.getStakes, { market_id: Number(marketId) }),
  getMarkets: (from: number, limit: number) => view<RawMarket[]>(METHODS.getMarkets, { from, limit }),
  getMarket: (marketId: string) => view<RawMarket>(METHODS.getMarket, { market_id: Number(marketId) }),
};

/** Testnet balance in yoctoNEAR. Throws if the account does not exist on testnet. */
export async function getBalance(accountId: string): Promise<string> {
  const r = await rpc<{ amount: string }>("query", { request_type: "view_account", finality: "optimistic", account_id: accountId });
  return r.amount;
}

/* ---------- writes (built here, signed by the wallet in wallet.ts) ---------- */

export interface TxRequest {
  receiverId: string;
  actions: { type: "FunctionCall"; params: { methodName: string; args: object; gas: string; deposit: string } }[];
}

const GAS = "100000000000000";

export const tx = {
  stake: (marketId: string, side: Side, amountYocto: string): TxRequest => {
    // Recorded markets have ids like "m3". Only a market that exists on chain can be staked on.
    if (!/^\d+$/.test(marketId)) throw new Error("This market is part of a recorded run, so there is nothing on chain to stake on.");
    return stakeTx(marketId, side, amountYocto);
  },
  claim: (marketId: string): TxRequest => {
    if (!/^\d+$/.test(marketId)) throw new Error("This market is part of a recorded run, so there is nothing on chain to claim.");
    return claimTx(marketId);
  },
};

const stakeTx = (marketId: string, side: Side, amountYocto: string): TxRequest => ({
    receiverId: config.contractId,
    actions: [
      {
        type: "FunctionCall",
        params: { methodName: METHODS.stake, args: { market_id: Number(marketId), side: side === "yes" ? "Yes" : "No", note: null }, gas: GAS, deposit: amountYocto },
      },
    ],
});

const claimTx = (marketId: string): TxRequest => ({
    receiverId: config.contractId,
    actions: [{ type: "FunctionCall", params: { methodName: METHODS.claim, args: { market_id: Number(marketId) }, gas: GAS, deposit: "0" } }],
});

/** Pull the contract's own error text out of whatever the wallet or RPC threw. */
export function contractErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  const panic = /Smart contract panicked: ([^"\\]+)/.exec(msg);
  if (/unreachable/i.test(msg)) return "The contract rejected this transaction. The market may have closed or may not exist on chain.";
  return (panic ? panic[1] : msg || "The transaction failed.").trim();
}
