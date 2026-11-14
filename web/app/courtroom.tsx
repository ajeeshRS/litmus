"use client";

import { Fragment, useState, type ReactNode } from "react";
import { compareRaw, config, contractErrorText, formatNear, nearInputText, parseNear, potChange, subRaw, tx, type MarketVM, type Side, type StakeVM, type VaultVM } from "./lib/adapter";
import { useLitmus } from "./lib/store";
import type { Wallet } from "./lib/wallet";
import { Account, AssetMark, Chip, ErrorLine, Loading, PageHeading, Person, SectionHead, SideTag, Stat, StatusPill, dateTimeText, textLink, timeText, toneClass, useNow } from "./parts";
import { useWalletContext } from "./shell";
import { Button, FieldError, Icon, Panel, Segmented, focus } from "./ui";

const GAS_RESERVE = "50000000000000000000000"; // 0.05 NEAR kept back for gas

export default function Courtroom() {
  const wallet = useWalletContext();
  const {state, runDemo, refresh, loadMarket} = useLitmus();
  const {active, vault} = state;
  const loading = state.mode === "loading", live = state.mode === "live";

  return <>
    <PageHeading title="Courtroom" description="A risky trade only executes if a jury of AI agents, staking their own NEAR, clears it.">
      {live && !state.reconnecting && <StatusPill kind="live"/>}
      {state.mode === "recorded" && <StatusPill kind="recorded"/>}
      {state.reconnecting && <StatusPill kind="reconnecting"/>}
      <StatusPill kind="simulated"/>
    </PageHeading>
    <p className="sr-only" aria-live="polite">{announcement(active)}</p>
    <div className="mt-8 grid items-start gap-4 xl:grid-cols-[1fr_1.6fr]">
      <VaultPanel vault={vault} startRaw={state.sessionStartPotRaw} error={state.mode === "error" ? state.error : null} recorded={!live}/>
      <MarketPanel loading={loading} live={live} error={state.mode === "error" ? null : state.error} active={active} stakes={state.stakes} last={state.markets[0]} demo={state.demo} onRunDemo={() => void runDemo()}
        controls={active && vault ? active.phase === "open" ? <StakeControls market={active} vault={vault} wallet={wallet} live={live} onStaked={() => void refresh()}/> : active.phase === "settled" ? <ClaimButton market={active} wallet={wallet} live={live} onClaimed={() => void refresh()}/> : null : null}/>
    </div>
    <Docket markets={state.markets} stakesByMarket={state.stakesByMarket} loading={loading} recorded={state.mode === "recorded"} onExpand={id => void loadMarket(id).catch(() => {})}/>
  </>;
}

/* ---------- vault ---------- */

function VaultPanel({vault, startRaw, error, recorded}:{vault:VaultVM|null; startRaw:string|null; error:string|null; recorded:boolean}) {
  if (!vault) return <Panel className="p-6 sm:p-8"><p className="text-[13px] text-muted">Vault pot</p><div className="mt-6">{error ? <ErrorLine>{error}</ErrorLine> : <Loading what="the vault"/>}</div></Panel>;
  const change = startRaw ? potChange(startRaw, vault.potRaw) : null;
  return <Panel className="flex flex-col p-2">
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3"><p className="text-[13px] text-muted">Vault pot</p>{change && <span className={`rounded-full bg-fill px-2.5 py-1 text-[12px] tabular-nums ${toneClass(change.sign) || "text-muted"}`}>{change.text} this session</span>}</div>
      <p className="mt-6 text-[44px] leading-none tracking-[-.06em] tabular-nums sm:text-[56px]">{vault.pot}</p>
      <p className="mt-3 text-[13px] text-muted">Trades above {vault.threshold} of the pot, or in a new asset, need a market.</p>
    </div>
    <div className="flex items-center justify-between px-4 pb-2 sm:px-6"><p className="text-[13px] text-muted">Holdings</p><p className="text-[12px] text-muted">Share of pot</p></div>
    {vault.holdings.length ? vault.holdings.map(h => <div key={h.asset} className="flex items-center gap-3 rounded-[calc(var(--radius-card)-8px)] px-3 py-2.5 sm:px-4"><AssetMark id={h.asset}/><span className="min-w-0 flex-1"><span className="block text-[14px]">{h.asset}</span><span className="block truncate text-[12px] text-muted tabular-nums">{h.amount} {h.asset}</span></span><span className="text-right"><span className="block text-[14px] tabular-nums">{h.value}</span><span className="block text-[12px] text-muted tabular-nums">{h.share}</span></span></div>) : <p className="p-6 text-center text-[14px] text-muted">The vault holds nothing yet.</p>}
    <div className="m-2 mt-3 rounded-3xl bg-fill p-4">
      <div className="flex items-center gap-3"><Person name={vault.manager.accountId}/><span className="min-w-0 flex-1"><span className="block truncate text-[14px]"><Account id={vault.manager.accountId}/></span><span className="block text-[12px] text-muted">Manager, {vault.manager.kind}</span></span><Stat label="Bond posted" value={vault.bond}/></div>
    </div>
    <p className="px-4 pb-4 pt-2 text-[12px] leading-5 text-muted sm:px-6">{recorded ? "Mock swap on a test ledger. Every price in a recorded run is part of the recording." : "Mock swap on a test ledger. BTC, ETH, SOL and NEAR use live market prices. FROGE is a made-up token with a scripted price."}</p>
  </Panel>;
}

/* ---------- active market ---------- */

const steps = ["Proposed", "Open", "Verdict", "Settled"];
function Steps({phase}:{phase:MarketVM["phase"]|"idle"}) {
  const at = {idle:-1, proposed:0, instant:0, open:1, verdict:2, settled:3}[phase];
  return <ol aria-label="Market progress" className="flex gap-1">{steps.map((s, i) => <li key={s} aria-current={i === at ? "step" : undefined} className={`rounded-full px-2.5 py-1 text-[11px] transition-colors duration-300 motion-reduce:transition-none ${i === at ? "bg-raised text-ink shadow-raised" : i < at ? "bg-fill text-ink" : "bg-fill text-soft"}`}>{s}</li>)}</ol>;
}

function ProposalCard({market, compact}:{market:MarketVM; compact?:boolean}) {
  const p = market.proposal;
  return <div className={compact ? "" : "motion-safe:animate-slide-next"}>
    <p className="text-[12px] text-muted">The manager proposes</p>
    <div className="mt-2 flex items-center gap-3"><AssetMark id={p.asset} className={compact ? "size-9" : "size-11"}/><p className={`leading-none tracking-[-.045em] ${compact ? "text-[26px]" : "text-[34px] sm:text-[40px]"}`}>{p.action} {p.asset}</p></div>
    <div className="mt-4 flex flex-wrap gap-1.5"><Chip>{p.size} of the pot</Chip><Chip>{p.sizeUsd}</Chip><Chip>Quote {p.quotePrice} per {p.asset}</Chip></div>
    <p className="mt-4 w-fit max-w-[52ch] rounded-[20px] rounded-bl-[6px] bg-fill px-4 py-3 text-[14px] leading-snug">{p.reason}</p>
    {p.flags.length ? <ul aria-label="Why this trade was flagged" className="mt-3 flex flex-wrap gap-1.5">{p.flags.map(f => <li key={f}><Chip tone="down" icon="flag">{f}</Chip></li>)}</ul> : <p className="mt-3 text-[12px] text-muted">Not flagged: under the size limit, in an asset the vault already trades.</p>}
  </div>;
}

function StakesBar({market}:{market:MarketVM}) {
  return <div role="group" aria-label={`Stakes: YES ${market.yes}, ${market.yesPct}%. NO ${market.no}, ${market.noPct}%.`}>
    <div className="flex items-end justify-between gap-3 text-[13px]">
      <span className="flex items-center gap-2"><SideTag side="yes"/><span className="tabular-nums">{market.yes}</span><span className="text-muted tabular-nums">{market.hasStakes ? market.yesPct.toFixed(1) : "0.0"}%</span></span>
      <span className="flex items-center gap-2"><span className="text-muted tabular-nums">{market.hasStakes ? market.noPct.toFixed(1) : "0.0"}%</span><span className="tabular-nums">{market.no}</span><SideTag side="no"/></span>
    </div>
    <div aria-hidden="true" className="mt-3 flex h-3 gap-1 overflow-hidden rounded-full bg-fill">{market.hasStakes && <>
      <span className="h-full rounded-full bg-ink-green transition-[width] duration-300 ease-smooth motion-reduce:transition-none" style={{width:`${market.yesPct}%`}}/>
      <span className="h-full flex-1 rounded-full bg-ink-red bg-[repeating-linear-gradient(135deg,transparent_0_5px,#0000002e_5px_7px)]"/>
    </>}</div>
    <p className="mt-2.5 text-[12px] text-muted">{market.hasStakes ? "YES clears the trade, NO blocks it. The larger side wins when the market closes." : "No stakes yet. The jury agents are reading the proposal."}</p>
  </div>;
}

function StakerList({stakes, empty = "The jury has not staked yet."}:{stakes:StakeVM[]; empty?:string}) {
  if (!stakes.length) return <p className="rounded-3xl bg-fill p-5 text-[13px] text-muted">{empty}</p>;
  return <ul aria-label="Stakes from the jury" className="max-h-80 overflow-y-auto">{[...stakes].reverse().map(s => <li key={`${s.accountId}-${s.time}-${s.side}`} className="flex items-start gap-3 py-2.5 motion-safe:animate-enter">
    <Person name={s.juror ?? s.accountId} className="mt-0.5 size-8 text-[11px]"/>
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2"><span className={`min-w-0 truncate text-[13px] ${s.juror ? "capitalize" : ""}`}>{s.juror ?? <Account id={s.accountId}/>}</span><span className="flex shrink-0 items-center gap-2"><span className="text-[13px] tabular-nums">{s.amount}</span><SideTag side={s.side}/></span></div>
      {s.note && <p className="mt-1 text-[12px] leading-snug text-muted">{s.note}</p>}
      {s.proof && <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[11px] text-ink-green" title={`The contract checked the enclave's signature over this answer.\nModel: ${s.proof.model}\nEnclave key: ${s.proof.signingKey}\nRequest hash: ${s.proof.requestHash}\nResponse hash: ${s.proof.responseHash}`}><Icon name="check" className="size-3 shrink-0"/><span className="truncate">Verified on chain: signed by {s.proof.model.split("/").pop()} in NEAR AI’s enclave</span></p>}
      <p className="mt-1 truncate text-[11px] text-soft">{s.juror && <><Account id={s.accountId}/> · </>}<time dateTime={new Date(s.time).toISOString()} className="tabular-nums">{timeText(s.time)}</time>{s.proof && <> · key <span className="font-mono">{s.proof.signingKey.slice(0, 8)}…</span></>}</p>
    </div>
  </li>)}</ul>;
}

const clock = (ms:number) => {const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;};
/** Driven only by the contract's close time, so a refresh shows the same remaining time. */
function Countdown({closeTime, openedAt}:{closeTime:number; openedAt:number|null}) {
  const now = useNow(250), left = Math.max(0, closeTime - now), total = Math.max(1, closeTime - (openedAt ?? closeTime - 60000)), C = 2 * Math.PI * 34;
  return <div role="timer" aria-label={left > 0 ? `${clock(left)} until the market closes` : "Market closed, waiting for the verdict"} className="relative size-28 shrink-0">
    <svg viewBox="0 0 80 80" aria-hidden="true" className="size-full -rotate-90"><circle cx="40" cy="40" r="34" fill="none" strokeWidth="5" className="stroke-fill-strong"/><circle cx="40" cy="40" r="34" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, left / total))} className="stroke-ink transition-[stroke-dashoffset] duration-300 ease-linear motion-reduce:transition-none"/></svg>
    <span className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[24px] leading-none tracking-[-.04em] tabular-nums">{clock(left)}</span><span className="mt-1 text-[11px] text-muted">{left > 0 ? "until close" : "closing…"}</span></span>
  </div>;
}

/** The one large moment of motion on the page. */
function VerdictStamp({verdict, animate}:{verdict:"approved"|"blocked"; animate:boolean}) {
  return <div className={`my-2 mr-2 inline-flex shrink-0 -rotate-6 items-center gap-2 rounded-2xl border-[3px] border-current px-4 py-2 ${verdict === "approved" ? "text-ink-green" : "text-ink-red"} ${animate ? "motion-safe:animate-stamp" : ""}`}><Icon name={verdict === "approved" ? "check" : "close"} className="size-7"/><span className="text-[30px] font-semibold uppercase leading-none tracking-[.04em] sm:text-[38px]">{verdict === "approved" ? "Approved" : "Blocked"}</span></div>;
}

const executionText = (m:MarketVM) => m.verdict === "blocked" ? "Not executed. The funds never left the pot." : m.executed ? "Executed as a mock swap." : "Cleared. Waiting for the mock swap to execute.";

function Settlement({market}:{market:MarketVM}) {
  const s = market.settlement;
  if (!s) return <p className="rounded-3xl bg-fill p-5 text-[13px] text-muted">Not settled yet. The outcome appears after the settlement window.</p>;
  const asset = market.proposal.asset, blocked = market.verdict === "blocked", verb = s.pnlSign === "down" ? "lost" : "made";
  // The side that was right about the price, which is not always the side that won the vote.
  const winners = s.pnlSign === "down" ? "NO" : "YES", nobodyRight = market.hasStakes && (winners === "NO" ? market.noPct === 0 : market.yesPct === 0);
  return <div>
    <p className="max-w-[56ch] text-[20px] leading-[1.35] tracking-[-.025em]">{s.priceSign === "flat" ? `${asset} did not move` : `${asset} ${s.priceSign === "up" ? "rose" : "fell"} ${s.priceMoveAbs}`} after the market closed. {blocked ? <>This trade would have {verb} <span className={`tabular-nums ${toneClass(s.pnlSign)}`}>{s.pnlAbs}</span>.{s.pnlSign === "down" ? " The pot lost nothing." : ""}</> : <>The trade {verb} <span className={`tabular-nums ${toneClass(s.pnlSign)}`}>{s.pnlAbs}</span>.</>}</p>
    <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2"><Stat box label="Price move" value={s.priceMove} tone={s.priceSign}/><Stat box label={blocked ? "Would have been" : "Profit or loss"} value={s.pnl} tone={s.pnlSign}/><Stat box label="Effect on pot" value={s.potEffect} tone={s.potEffectSign}/><Stat box label={s.bond === "slashed" ? `Bond slashed, paid to ${winners}` : "Bond returned to manager"} value={s.bondAmount}/></div>
    <p className="mt-5 text-[12px] text-muted">{nobodyRight ? `Nobody staked ${winners}, so every stake was returned` : `Paid out to the jurors who were right (staked ${winners})`}</p>
    {s.payouts.length ? <ul className="mt-2 divide-y divide-line rounded-3xl bg-fill px-4">{s.payouts.map(p => <li key={p.accountId} className="flex items-center justify-between gap-3 py-3 text-[14px]"><span className="flex min-w-0 items-center gap-2.5"><Person name={p.accountId} className="size-7 text-[11px]"/><Account id={p.accountId} className="truncate"/></span><span className="tabular-nums">{p.amount}</span></li>)}</ul> : <p className="mt-2 rounded-3xl bg-fill p-5 text-[13px] text-muted">Nobody staked on the winning side.</p>}
    <p className="mt-3 text-[12px] text-muted">Simulated outcome on testnet. Mock swap, no real funds.</p>
  </div>;
}

function lastVerdictText(m:MarketVM) {
  const what = `${m.proposal.action} ${m.proposal.asset} (${m.proposal.size} of the pot)`;
  if (m.phase === "instant") return `${what}: passed instantly (under threshold).`;
  const split = `YES ${m.yesPct.toFixed(0)}%, NO ${m.noPct.toFixed(0)}%`;
  if (m.verdict === "blocked") return `${what}: blocked. ${split}.${m.settlement?.pnlSign === "down" ? ` It would have lost ${m.settlement.pnlAbs}.` : ""}`;
  if (m.verdict === "approved") return `${what}: approved. ${split}.${m.settlement ? ` Result ${m.settlement.pnl}.` : ""}`;
  return `${what}: awaiting verdict.`;
}
/** What a screen reader hears when the verdict or settlement lands. */
function announcement(m:MarketVM|null) {
  if (!m) return "";
  const what = `${m.proposal.action} ${m.proposal.asset}`;
  if (m.phase === "verdict") return `Verdict: ${m.verdict === "blocked" ? "Blocked" : "Approved"}. ${what}. ${executionText(m)}`;
  if (m.phase === "settled" && m.settlement) return `Settled. ${what}. ${m.verdict === "blocked" ? `It would have ${m.settlement.pnlSign === "down" ? "lost" : "made"} ${m.settlement.pnlAbs}.` : `Result ${m.settlement.pnl}.`}`;
  return "";
}

function MarketPanel({loading, error, active, stakes, last, demo, live, onRunDemo, controls}:{loading:boolean; live:boolean; error:string|null; active:MarketVM|null; stakes:StakeVM[]; last?:MarketVM; demo:"idle"|"running"|"done"; onRunDemo:() => void; controls:ReactNode}) {
  const phase = active?.phase ?? "idle";
  return <Panel className="flex min-h-[620px] flex-col p-6 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[13px] font-normal text-muted">{active ? "Trade under review" : "Active market"}</h2><Steps phase={phase}/></div>
    {loading && !active ? <div className="mt-6"><Loading what="the active market"/></div>
    : !active ? <div className="my-auto py-10">
        <p className="text-[34px] leading-[1.08] tracking-[-.045em] sm:text-[44px]">{demo === "running" ? "Waiting for the next proposal…" : "No trade under review."}</p>
        {demo === "running" && live && <p role="status" className="mt-3 max-w-[56ch] text-[13px] leading-6 text-muted">A live run has started on testnet. The trader resets the vault and reads market prices first, so the first proposal takes about a minute.</p>}
        {error && <div className="mt-4"><ErrorLine>{error}</ErrorLine></div>}
        <div className="mt-6 max-w-[60ch] rounded-3xl bg-fill p-5 text-[13px] leading-6"><p className="text-muted">Last verdict</p><p>{last ? lastVerdictText(last) : "No verdicts yet. The first proposal will appear here."}</p></div>
        {demo !== "running" && <><Button variant="primary" className="mt-6" onClick={onRunDemo}><Icon name="play" className="size-4"/>{demo === "done" ? "Run demo again" : "Run demo"}</Button><p className="mt-3 text-[12px] text-muted">Three trades in about two and a half minutes: two pass, and the jury blocks one bad trade.</p></>}
      </div>
    : phase === "proposed" || phase === "instant" ? <div className="mt-8">
        <ProposalCard market={active}/>
        <p role="status" className="mt-6 text-[13px] text-muted">{active.proposal.flags.length ? "Flagged. A market is opening and the jury is being called." : "Checking the trade against the vault’s limits…"}</p>
      </div>
    : phase === "open" ? <div className="mt-8">
        <div className="flex items-start justify-between gap-6"><ProposalCard market={active} compact/>{active.closeTime !== null && <Countdown closeTime={active.closeTime} openedAt={active.openedAt}/>}</div>
        <div className="mt-8"><StakesBar market={active}/></div>
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_264px]"><div><p className="mb-2 text-[12px] text-muted">The jury</p><StakerList stakes={stakes}/></div>{controls}</div>
      </div>
    : <div className="mt-8">
        <div className="flex flex-wrap items-start justify-between gap-6"><ProposalCard market={active} compact/>{active.verdict && <VerdictStamp verdict={active.verdict} animate={phase === "verdict"}/>}</div>
        <div className="mt-8"><StakesBar market={active}/></div>
        <p className="mt-6 text-[15px]">{executionText(active)}</p>
        {phase === "verdict" ? <p role="status" className="mt-2 text-[13px] text-muted">Settlement follows after the outcome window, to show whether the market was right.</p> : <>
          <div className="mt-8 border-t border-line pt-8"><Settlement market={active}/></div>
          {controls}
          {demo === "done" && <Button className="mt-6" onClick={onRunDemo}><Icon name="play" className="size-4"/>Run demo again</Button>}
        </>}
      </div>}
  </Panel>;
}

/* ---------- stake and claim ---------- */

function StakeControls({market, vault, wallet, live, onStaked}:{market:MarketVM; vault:VaultVM; wallet:Wallet; live:boolean; onStaked:() => void}) {
  const {accountId, balanceRaw, networkProblem} = wallet.wallet;
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState<Side|null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const now = useNow(500);
  if (!accountId) return <div className="rounded-3xl bg-fill p-5"><p className="text-[12px] text-muted">Stake</p><p className="mt-2 text-[14px] leading-6">Connect a testnet wallet to stake. Watching needs no wallet.</p><p className="mt-2 text-[12px] leading-5 text-muted">The jury agents stake on their own. You can stake beside them.</p></div>;

  const raw = parseNear(amount), closed = market.phase !== "open" || (market.closeTime !== null && now >= market.closeTime);
  const reason = networkProblem ? networkProblem
    : !live ? "This is a recorded run. Staking needs the live contract."
    : closed ? "This market is closed."
    : market.closeTime !== null && market.closeTime - now < 12000 ? "Too little time left to sign. Stake earlier in the next market."
    : raw === null ? "Enter an amount in NEAR."
    : compareRaw(raw, vault.minStakeRaw) < 0 ? `The minimum stake is ${vault.minStake}.`
    : balanceRaw === null ? "Checking your balance…"
    : compareRaw(raw, subRaw(balanceRaw, GAS_RESERVE)) > 0 ? "Not enough testnet NEAR for this amount plus gas."
    : "";
  const disabled = !!reason || pending !== null;
  async function stake(side:Side) {
    if (disabled || raw === null) return;
    setPending(side); setError(""); setDone("");
    try {await wallet.send(tx.stake(market.id, side, raw)); setDone(`Staked ${formatNear(raw)} on ${side === "yes" ? "YES" : "NO"}.`); onStaked();}
    catch (e) {setError(contractErrorText(e));}
    finally {setPending(null);}
  }
  return <form noValidate onSubmit={e => e.preventDefault()} className="rounded-3xl bg-fill p-5">
    <label htmlFor="stake-amount" className="block text-[12px] text-muted">Stake</label>
    <div className={`mt-2 flex items-center gap-2 rounded-2xl bg-well p-2 pl-4 shadow-well ${raw === null ? "ring-2 ring-ink-red/40" : "has-[input:focus]:ring-2 has-[input:focus]:ring-ink/15"}`}><input id="stake-amount" inputMode="decimal" autoComplete="off" aria-invalid={raw === null} aria-describedby="stake-reason" value={amount} onChange={e => {setAmount(e.target.value); setError("");}} className="min-h-10 w-full min-w-0 flex-1 bg-transparent text-[24px] tracking-[-.04em] tabular-nums outline-none"/><span className="text-[13px] text-muted">NEAR</span><Button type="button" size="sm" disabled={balanceRaw === null} onClick={() => balanceRaw && setAmount(nearInputText(subRaw(balanceRaw, GAS_RESERVE)))}>Max</Button></div>
    <p className="mt-2 text-[12px] text-muted tabular-nums">Balance {balanceRaw === null ? "…" : formatNear(balanceRaw)}. Minimum {vault.minStake}.</p>
    <div className="mt-4 grid grid-cols-2 gap-2">
      <Button type="button" variant="primary" disabled={disabled} aria-busy={pending === "yes"} onClick={() => void stake("yes")}><Icon name="check" className="size-4"/>{pending === "yes" ? "Signing…" : "Stake YES"}</Button>
      <Button type="button" variant="danger" disabled={disabled} aria-busy={pending === "no"} onClick={() => void stake("no")}><Icon name="close" className="size-4"/>{pending === "no" ? "Signing…" : "Stake NO"}</Button>
    </div>
    <p id="stake-reason" role="status" className="mt-3 min-h-5 text-[12px] leading-5 text-muted">{reason || done || "YES clears the trade. NO blocks it."}</p>
    {error && <FieldError>{error}</FieldError>}
  </form>;
}

function ClaimButton({market, wallet, live, onClaimed}:{market:MarketVM; wallet:Wallet; live:boolean; onClaimed:() => void}) {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ok:boolean; text:string}|null>(null);
  const me = wallet.wallet.accountId, mine = me ? market.settlement?.payouts.find(p => p.accountId === me) : undefined;
  if (!mine) return null;
  const reason = wallet.wallet.networkProblem ?? (live ? "" : "This is a recorded run. Claiming needs the live contract.");
  async function claim() {
    setPending(true); setMsg(null);
    try {await wallet.send(tx.claim(market.id)); setMsg({ok:true, text:`Claimed ${mine!.amount}.`}); onClaimed();}
    catch (e) {setMsg({ok:false, text:contractErrorText(e)});}
    finally {setPending(false);}
  }
  return <div className="mt-6"><Button variant="primary" disabled={pending || !!reason} aria-busy={pending} onClick={() => void claim()}>{pending ? "Signing…" : `Claim ${mine.amount}`}</Button>{msg && !msg.ok ? <FieldError>{msg.text}</FieldError> : (reason || msg) && <p role="status" className="mt-3 text-[12px] text-muted">{reason || msg?.text}</p>}</div>;
}

/* ---------- docket ---------- */

type Filter = "all"|"blocked"|"approved"|"instant";
const filters: {id:Filter; label:string}[] = [{id:"all", label:"All"}, {id:"blocked", label:"Blocked"}, {id:"approved", label:"Approved"}, {id:"instant", label:"Passed instantly"}];
const kindOf = (m:MarketVM):Filter => m.phase === "instant" ? "instant" : m.verdict === "blocked" ? "blocked" : "approved";

function VerdictCell({m}:{m:MarketVM}) {
  if (m.phase === "instant") return <span className="text-muted">Passed instantly (under threshold)</span>;
  if (!m.verdict) return <span className="text-muted">Pending</span>;
  return <span className={`inline-flex items-center gap-1.5 ${m.verdict === "approved" ? "text-ink-green" : "text-ink-red"}`}><Icon name={m.verdict === "approved" ? "check" : "close"} className="size-3.5"/>{m.verdict === "approved" ? "Approved" : "Blocked"}</span>;
}
function outcomeText(m:MarketVM) {
  const s = m.settlement;
  if (!s) return m.phase === "instant" ? "Executed as a mock swap" : "Awaiting settlement";
  return m.verdict === "blocked" ? `${m.proposal.asset} ${s.priceMove}. Would have ${s.pnlSign === "down" ? "lost" : "made"} ${s.pnlAbs}` : `${m.proposal.asset} ${s.priceMove}. ${s.pnl}`;
}

function Docket({markets, stakesByMarket, loading, recorded, onExpand}:{markets:MarketVM[]; stakesByMarket:Record<string, StakeVM[]>; loading:boolean; recorded:boolean; onExpand:(id:string) => void}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string|null>(null);
  const rows = markets.filter(m => filter === "all" || kindOf(m) === filter);
  const toggle = (id:string) => {if (open !== id) onExpand(id); setOpen(open === id ? null : id);};
  const th = "whitespace-nowrap px-3 pb-3 text-left text-[12px] font-normal text-muted";
  return <section className="mt-12">
    <SectionHead title="Docket" count={markets.length}><div className="-mx-5 flex max-w-[100vw] overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:px-0"><Segmented options={filters} value={filter} onChange={setFilter}/></div></SectionHead>
    <Panel className="p-2">
      {loading ? <div className="p-4"><Loading what="past proposals"/></div>
      : !rows.length ? <p className="p-10 text-center text-[14px] text-muted">{markets.length ? "No proposals match this filter." : "No proposals yet. Past trades and their verdicts will be listed here."}</p>
      : <div className="overflow-x-auto"><table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead><tr><th scope="col" className={`${th} pl-4 pt-4`}>Time</th><th scope="col" className={`${th} pt-4`}>Action</th><th scope="col" className={`${th} pt-4 text-right`}>Size</th><th scope="col" className={`${th} pt-4`}>Verdict</th><th scope="col" className={`${th} pt-4`}>Market split</th><th scope="col" className={`${th} pt-4`}>Outcome</th><th scope="col" className={`${th} pt-4 text-right`}>Effect on pot</th><th scope="col" className={`${th} pr-4 pt-4`}>Transaction</th></tr></thead>
          <tbody>{rows.map(m => {const isOpen = open === m.id, s = m.settlement; return <Fragment key={m.id}>
            <tr onClick={() => toggle(m.id)} className="cursor-pointer border-t border-line transition-colors hover:bg-fill">
              <td className="whitespace-nowrap py-3 pl-2 pr-3 tabular-nums"><button aria-expanded={isOpen} aria-controls={`docket-${m.id}`} aria-label={`${isOpen ? "Hide" : "Show"} details for ${m.proposal.action} ${m.proposal.asset}`} onClick={e => {e.stopPropagation(); toggle(m.id);}} className={`mr-1 inline-flex size-7 items-center justify-center rounded-full align-middle text-muted hover:bg-fill-strong hover:text-ink ${focus}`}><Icon name="chevron" className={`size-3.5 transition-transform duration-200 ease-smooth motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`}/></button>{dateTimeText(m.proposedAt)}</td>
              <td className="px-3 py-3"><span className="flex items-center gap-2 whitespace-nowrap"><AssetMark id={m.proposal.asset} className="size-6"/>{m.proposal.action} {m.proposal.asset}</span></td>
              <td className="px-3 py-3 text-right tabular-nums">{m.proposal.size}</td>
              <td className="px-3 py-3"><VerdictCell m={m}/></td>
              <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted">{m.hasStakes ? `YES ${m.yesPct.toFixed(0)}% / NO ${m.noPct.toFixed(0)}%` : "No market"}</td>
              <td className="px-3 py-3">{outcomeText(m)}</td>
              <td className={`px-3 py-3 text-right tabular-nums ${s ? toneClass(s.potEffectSign) : "text-muted"}`}>{s ? s.potEffect : "—"}{s && m.verdict === "blocked" && s.pnlSign === "down" && <span className="block whitespace-nowrap text-[11px] text-muted">avoided {s.pnl}</span>}</td>
              <td className="py-3 pl-3 pr-4">{m.explorerUrl ? <a href={m.explorerUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className={`inline-flex items-center gap-1 text-muted ${textLink}`}>Explorer<Icon name="link" className="size-3.5"/><span className="sr-only">(opens in a new tab)</span></a> : <span className="text-muted" title="Recorded runs have no on-chain transaction">{recorded ? "Recorded" : "—"}</span>}</td>
            </tr>
            {isOpen && <tr id={`docket-${m.id}`}><td colSpan={8} className="p-2 pt-0"><div className="grid gap-8 rounded-[calc(var(--radius-card)-8px)] bg-fill p-5 sm:p-6 lg:grid-cols-2">
              <div><ProposalCard market={m} compact/><p className="mt-5 text-[14px]">{m.phase === "instant" ? "Passed instantly (under threshold). Executed as a mock swap." : executionText(m)}</p>{m.phase !== "instant" && <><div className="mt-6"><StakesBar market={m}/></div><p className="mb-2 mt-6 text-[12px] text-muted">The jury</p><StakerList stakes={stakesByMarket[m.id] ?? []} empty="No stake list available for this market."/></>}</div>
              <div>{m.phase === "instant" ? <p className="text-[13px] text-muted">Small trades skip the market, so there is nothing to settle.</p> : <Settlement market={m}/>}</div>
            </div></td></tr>}
          </Fragment>;})}</tbody>
        </table></div>}
    </Panel>
  </section>;
}
