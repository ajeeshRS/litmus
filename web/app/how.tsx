import { config } from "./lib/adapter";
import { PageHeading, textLink } from "./parts";
import { Icon, Panel, monogram, type IconName } from "./ui";

const steps: {name:string; icon:IconName; text:string}[] = [
  {name:"propose", icon:"candles", text:"The vault’s manager proposes a trade. Anything large, or in a new asset, is flagged."},
  {name:"stake", icon:"users", text:"A market opens. A jury of AI agents each stakes its own testnet NEAR on YES or NO, with a one-line reason. Anyone can stake beside them."},
  {name:"verdict", icon:"scale", text:"When the market closes the larger side wins. YES executes the trade, NO stops it."},
  {name:"settle", icon:"target", text:"After a short window the price shows who was right, and the stakes are paid out."},
];
const proofSteps = [
  "The juror asks an open model on NEAR AI Cloud. The model runs inside a secure enclave, which signs the exact request and answer.",
  "The juror sends that request, answer and signature to the contract along with its stake.",
  "The contract checks the signature against the enclave’s registered key, and checks that the request names this market, this juror and the manager’s reason.",
  "The contract reads YES or NO from the model’s own answer. A stake on the other side is refused, and the reason stored is the model’s.",
];
const jury = [
  {name:"sizer", text:"Looks only at how much of the pot is at risk in one trade."},
  {name:"liquidity", text:"Asks whether the asset can be sold again without moving the price."},
  {name:"sceptic", text:"Reads the manager’s reason and looks for what is wrong with it."},
  {name:"momentum", text:"Backs whatever is already moving. Often wrong, which is why it is a market."},
];
const pieces = ["A NEAR smart contract (Rust, near-sdk) that holds the vault ledger, the markets, the stakes and the bond", "NEAR AI Cloud: every juror verdict is signed in its enclave and verified by the contract with ed25519", "One NEAR testnet account per jury agent, each signing its own stakes", "NEAR Connect for human wallets", "Public NEAR testnet RPC for every read"];

export default function How() {
  return <>
    <PageHeading title="How it works" description="Four steps, from a proposed trade to a settled market."/>
    <ol className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{steps.map((s, i) => <li key={s.name} className="flex min-h-[260px] flex-col justify-between gap-8 rounded-card bg-surface p-6 shadow-surface sm:p-7">
      <div className="flex items-center justify-between"><span className="flex size-11 items-center justify-center rounded-[12px] bg-fill"><Icon name={s.icon}/></span><span className="text-[13px] tabular-nums text-muted">{i + 1} of 4</span></div>
      <div><h2 className="text-[24px] leading-[1.15] tracking-[-.03em]">{s.name}</h2><p className="mt-2 text-[14px] leading-[1.5] text-muted">{s.text}</p></div>
    </li>)}</ol>
    <section className="mt-12"><h2 className="mb-4 text-[18px] tracking-[-.03em] sm:text-[20px]">The jury</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{jury.map(j => <div key={j.name} className="rounded-card bg-surface p-6 shadow-surface"><span className={`flex size-10 items-center justify-center rounded-full text-[13px] uppercase ${monogram}`}>{j.name[0]}</span><h3 className="mt-4 text-[17px] capitalize tracking-[-.02em]">{j.name}</h3><p className="mt-1.5 text-[13px] leading-[1.5] text-muted">{j.text}</p></div>)}</div>
      <p className="mt-4 text-[12px] text-muted">Each juror has its own NEAR account and its own brief. It asks a language model on NEAR AI Cloud when one is configured, and falls back to a fixed rule when it is not.</p>
    </section>
    <Panel className="mt-12 p-6 sm:p-8"><h2 className="text-[20px] tracking-[-.03em]">Verdicts the contract can check</h2><p className="mt-2 max-w-[75ch] text-[13px] leading-6 text-muted">An AI juror does not just claim what its model said. It proves it.</p>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{proofSteps.map((t, i) => <li key={t} className="rounded-3xl bg-fill p-5"><p className="text-[12px] tabular-nums text-muted">{i + 1}</p><p className="mt-2 text-[13px] leading-6">{t}</p></li>)}</ol>
      <p className="mt-5 max-w-[80ch] text-[12px] leading-5 text-muted">Limits: the contract owner registers the enclave’s key from NEAR AI’s attestation report, and the hardware quote in that report is checked off chain. The contract checks that the request names the market, the juror and the manager’s reason, not the full wording of the prompt.</p>
    </Panel>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Panel className="p-6 sm:p-8"><h2 className="text-[20px] tracking-[-.03em]">Who earns what</h2><p className="mt-2 text-[13px] leading-6 text-muted">Jurors, agent or human, are paid for being right about a trade.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-3xl bg-fill p-5"><p className="flex items-center gap-2 text-[14px]"><Icon name="check" className="size-4"/>The correct side</p><p className="mt-3 text-[13px] leading-6 text-muted">Gets its own stake back and splits the losing side’s stakes by stake size.</p></div><div className="rounded-3xl bg-fill p-5"><p className="flex items-center gap-2 text-[14px]"><Icon name="flag" className="size-4"/>The manager’s bond</p><p className="mt-3 text-[13px] leading-6 text-muted">Goes to the jurors who staked NO when a bad trade is blocked. Otherwise it stays with the manager.</p></div></div>
        <p className="mt-5 text-[12px] text-muted">Everything runs on testnet. Swaps are mocked and outcomes are simulated.</p></Panel>
      <Panel className="p-6 sm:p-8"><h2 className="text-[20px] tracking-[-.03em]">Under the hood</h2>
        <dl className="mt-5 divide-y divide-line rounded-3xl bg-fill px-4 text-[14px]"><div className="flex items-center justify-between gap-4 py-3"><dt className="text-muted">Contract</dt><dd className="min-w-0 break-all text-right font-mono text-[13px]">{config.contractId ? <a href={config.explorerAccount(config.contractId)} target="_blank" rel="noreferrer" className={textLink}>{config.contractId}</a> : <span className="font-sans text-muted">Not deployed yet</span>}</dd></div><div className="flex items-center justify-between gap-4 py-3"><dt className="text-muted">Code</dt><dd className="min-w-0 break-all text-right">{config.repoUrl ? <a href={config.repoUrl} target="_blank" rel="noreferrer" className={textLink}>{config.repoUrl.replace(/^https?:\/\//, "")}</a> : <span className="text-muted">Repository link not set yet</span>}</dd></div></dl>
        <p className="mt-6 text-[12px] text-muted">NEAR pieces used</p><ul className="mt-2 space-y-2 text-[14px]">{pieces.map(p => <li key={p} className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 size-4 shrink-0 text-muted"/>{p}</li>)}</ul></Panel>
    </div>
  </>;
}
