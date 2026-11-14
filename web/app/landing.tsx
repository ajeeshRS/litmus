"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Brand, Icon, Logo, Segmented, ThemeToggle, buttonClass, focus, monogram, type IconName } from "./ui";

const intro=[
  {tab:"propose",lead:"the manager proposes.",text:"a big trade, or one in a new asset, gets flagged before it can run."},
  {tab:"stake",lead:"the jury stakes.",text:"a swarm of AI agents each judges the trade its own way and puts its own NEAR on YES or NO. You can stake beside them."},
  {tab:"verdict",lead:"the market decides.",text:"the larger side wins. A blocked trade never touches the pot."},
  {tab:"settle",lead:"the price settles it.",text:"jurors who were right take the stakes of those who were wrong, and the manager’s bond if the trade was bad."},
];

const guards=[
  {name:"a fixed limit",text:"“Never more than 5% per trade.” Simple, but it can’t tell a sensible large trade from a reckless one, so it blocks both or neither.",ours:false},
  {name:"a vote",text:"Members approve each trade. But voters risk nothing by being wrong, and most never show up.",ours:false},
  {name:"litmus",text:"Only the risky trades are reviewed, by jurors who put their own money on the answer and lose it when they’re wrong.",ours:true},
];
const uses:{icon:IconName;title:string;text:string}[]=[
  {icon:"candles",title:"vaults run by an AI agent",text:"Give an agent room to trade without giving it free rein. Routine trades pass. Unusual ones face the jury."},
  {icon:"users",title:"shared treasuries",text:"A DAO or a club that holds funds together, and wants more than a token vote before a large move."},
  {icon:"trend",title:"copy-trading pots",text:"People who follow a trader get a check on that trader’s boldest bets."},
];
const real=["The contract and every rule in it, on NEAR testnet","Every stake, payout and bond, in testnet NEAR","Each juror’s verdict, written by a model and verified on chain","Prices for BTC, ETH, SOL and NEAR, read from the live market"];
const simulated=["The vault’s holdings: numbers in the contract, not tokens","The swap itself: the contract updates those numbers","FROGE: a made-up token whose fall is scripted for the demo"];
const faq=[
  {q:"Is real money involved?",a:"No. Litmus runs on NEAR testnet. The NEAR that jurors stake is test money, the vault’s holdings are numbers in the contract, and swaps are mocked."},
  {q:"Who are the jurors?",a:"Four AI agents, each with its own NEAR account and one thing to judge: size, liquidity, the manager’s reasoning, or momentum. Anyone with a testnet wallet can stake beside them."},
  {q:"What stops a juror lying about what its model said?",a:"The model runs inside a secure enclave on NEAR AI Cloud, which signs every answer. The juror sends that signed answer with its stake. The contract checks the signature and refuses a stake that disagrees with the model."},
  {q:"What if the jury gets it wrong?",a:"Then the jurors on the wrong side lose their stake to the ones who were right. The price move after the vote decides who was right. That window is short, so luck plays a part, and we say so."},
  {q:"Can the manager vote for its own trade?",a:"No. The contract refuses a stake from the manager’s account. A second account could still try, which is why a real version would need the total stake to scale with the size of the trade."},
];
export default function Landing() {
  const [slide,setSlide]=useState(0);
  const [dir,setDir]=useState(0);
  const slideIn=dir>0?"motion-safe:animate-slide-next":dir<0?"motion-safe:animate-slide-prev":"";
  return <div className="min-h-dvh overflow-x-clip bg-canvas text-ink">
    <header className="fixed inset-x-0 top-0 z-40 bg-canvas/70 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-4 px-5 sm:h-[88px] sm:px-10">
        <Brand/>
        <nav className="hidden items-center gap-8 text-[13px] md:flex"><a href="#how" className={`rounded transition-colors hover:text-muted ${focus}`}>How it works</a><a href="#features" className={`rounded transition-colors hover:text-muted ${focus}`}>Why it holds</a><a href="#real" className={`rounded transition-colors hover:text-muted ${focus}`}>What’s real</a><a href="#faq" className={`rounded transition-colors hover:text-muted ${focus}`}>Questions</a></nav>
        <div className="flex items-center gap-1"><Link href="/replay" className={buttonClass("ghost","sm","max-sm:hidden md:hidden")}>Replay</Link><ThemeToggle className="size-9 text-muted hover:bg-fill hover:text-ink"/><Link href="/app" className={buttonClass("primary","sm")}>Open the courtroom</Link></div>
      </div>
    </header>
    <main>
      <section className="px-5 pt-[136px] text-center motion-safe:animate-enter sm:pt-[168px]">
        <h1 className="mx-auto max-w-4xl text-balance text-[clamp(38px,10vw,48px)] leading-[1.1] tracking-[-.05em] sm:text-[clamp(48px,5vw,72px)]">every risky trade<span className="block font-serif italic tracking-[-.02em] text-soft">faces a jury of agents</span></h1>
        <p className="mx-auto mt-6 max-w-[36rem] text-balance text-[15px] leading-[1.6] text-muted sm:text-[16px]">Litmus is a vault on NEAR testnet. A big or unusual trade only executes if a jury of AI agents clears it. Each juror stakes its own NEAR, and its verdict is verified on chain. A bad one gets blocked, and the money stays in the pot.</p>
        <div className="mt-8 flex justify-center gap-3"><Link href="/app" className={buttonClass("primary")}>Watch a trade get blocked<Icon name="arrow" className="size-4"/></Link><Link href="/replay" className={buttonClass()}>See the replay</Link></div>
      </section>
      <section aria-labelledby="guards" className="mx-auto max-w-[1200px] px-5 pt-24 sm:px-10 sm:pt-32">
        <SectionTitle id="guards" title="three ways to guard a shared pot" sub="Two of them are in use everywhere. Both have a gap."/>
        <div className="mt-10 grid gap-4 md:grid-cols-3">{guards.map(g=><div key={g.name} className={`rounded-card p-7 sm:p-8 ${g.ours?"bg-surface shadow-surface":"bg-fill"}`}><p className="flex items-center gap-2.5 text-[22px] leading-none tracking-[-.03em]">{g.ours&&<Logo className="size-6"/>}{g.name}</p><p className="mt-4 text-[15px] leading-[1.55] text-muted">{g.text}</p></div>)}</div>
      </section>
      <section id="how" aria-labelledby="how-title" className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-24 sm:px-10 sm:pt-32">
        <SectionTitle id="how-title" title="one trade, start to finish" sub="Step through what happens when the manager proposes something risky."/>
        <div className="-mx-5 mt-10 flex overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:justify-center sm:px-0"><Segmented options={intro.map((t,i)=>({id:i,label:t.tab}))} value={slide} onChange={i=>{setDir(i>slide?1:-1);setSlide(i);}}/></div>
        <div className="mt-12">
          <Window status={["Proposed","Market open","Verdict in","Settled"][slide]}><div key={slide} className={`flex min-h-0 flex-1 flex-col justify-end gap-3 ${slideIn}`}>{slide===0?<>
            <p className="text-center text-[11px] text-muted">Today</p>
            <Note icon="check">Buy BTC with 3% of the pot passed instantly</Note>
            <Manager>FROGE is up 60% today. Momentum should continue.</Manager>
            <Manager className="w-[300px]"><TradeCard/></Manager>
          </>:slide===1?<>
            <Manager className="w-[300px]"><TradeCard/></Manager>
            <Note icon="users">Liquidity staked 3 NEAR on NO: “hard to exit”</Note>
            <StakeCard yes={12.5}/>
          </>:slide===2?<>
            <StakeCard yes={12.5} closed/>
            <div className="self-center py-3"><span className="inline-flex -rotate-6 items-center gap-2 rounded-2xl border-[3px] border-current px-4 py-2 text-ink-red"><Icon name="close" className="size-6"/><span className="text-[30px] font-semibold uppercase leading-none tracking-[.04em]">Blocked</span></span></div>
            <Note icon="alert">Not executed. The funds never left the pot</Note>
          </>:<>
            <Note icon="target">FROGE fell 31% after the market closed</Note>
            <div className="w-[300px] self-start rounded-[20px] bg-fill p-4 text-[14px]"><p className="text-[12px] text-muted">Buy FROGE, blocked</p><p className="mt-1.5 text-[28px] leading-none tracking-[-.045em] text-ink-red">−$1,243.35</p><p className="mt-3 text-[12px] text-muted">What the trade would have cost. The pot lost nothing.</p></div>
            <Note icon="check">The three jurors who said NO split 10 NEAR, including the manager’s 2 NEAR bond</Note>
          </>}</div></Window>
          <p key={slide} className={`mx-auto mt-10 max-w-md text-balance text-center text-[17px] leading-[1.5] tracking-[-.015em] text-muted ${slideIn}`}><span className="text-ink">{intro[slide].lead}</span> {intro[slide].text}</p>
          <p className="mt-4 text-center text-[12px] text-soft">Illustration from the recorded demo run. Simulated numbers.</p>
        </div>
      </section>
      <section id="features" aria-labelledby="features-title" className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-24 sm:px-10 sm:pt-32">
        <SectionTitle id="features-title" title="why it holds" sub="Three things keep the jury honest."/>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Tile title="a jury that always shows up" text="Four agents, four ways of judging a trade: size, liquidity, the manager’s reasoning, and momentum. Each has its own NEAR account and stakes its own money."><div className="flex h-3 gap-1 overflow-hidden rounded-full bg-fill"><span className="h-full w-[12.5%] rounded-full bg-ink-green"/><span className="h-full flex-1 rounded-full bg-ink-red"/></div><p className="mt-6 text-[48px] leading-none tracking-[-.055em]">87.5% <span className="text-[20px] tracking-[-.02em] text-muted">NO</span></p></Tile>
          <Tile title="wrong jurors pay right ones" text="Nobody judges for free. Jurors who were wrong lose their stake to those who were right. If a blocked trade would have lost money, the manager’s bond goes to the jurors who stopped it."><p className="text-[15px] text-muted">Manager’s bond</p><p className="mt-1 text-[40px] leading-none tracking-[-.05em]">2 NEAR</p><span className="mt-4 inline-flex items-center gap-2 rounded-full bg-fill px-3.5 py-2 text-[13px] text-ink-red"><Icon name="flag" className="size-4"/>Slashed on a blocked bad trade</span></Tile>
          <Tile title="verdicts you can check" text="Each AI juror’s answer is signed inside NEAR AI’s secure enclave. The contract checks that signature and refuses any stake that disagrees with what the model said."><span className="inline-flex items-center gap-2 rounded-full bg-fill px-3.5 py-2 text-[13px] text-ink-green"><Icon name="check" className="size-4"/>Verified on chain</span><p className="mt-5 font-mono text-[12px] leading-5 text-muted">ed25519_verify(<br/>&nbsp;&nbsp;enclave_key,<br/>&nbsp;&nbsp;model : request : answer<br/>)</p></Tile>
        </div>
      </section>
      <section aria-labelledby="uses" className="mx-auto max-w-[1200px] px-5 pt-24 sm:px-10 sm:pt-32">
        <SectionTitle id="uses" title="where this could be used" sub="Anywhere someone else trades money that isn’t only theirs."/>
        <div className="mt-10 grid gap-4 md:grid-cols-3">{uses.map(u=><div key={u.title} className="rounded-card bg-surface p-7 shadow-surface sm:p-8"><span className="flex size-11 items-center justify-center rounded-[12px] bg-fill"><Icon name={u.icon}/></span><h3 className="mt-6 text-[20px] leading-[1.2] tracking-[-.03em]">{u.title}</h3><p className="mt-2 text-[15px] leading-[1.55] text-muted">{u.text}</p></div>)}</div>
      </section>
      <section id="real" aria-labelledby="real-title" className="mx-auto max-w-[1200px] scroll-mt-24 px-5 pt-24 sm:px-10 sm:pt-32">
        <SectionTitle id="real-title" title="what’s real, and what isn’t yet" sub="This is a testnet demo. Here is exactly where the line is."/>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-card bg-surface p-7 shadow-surface sm:p-8"><p className="inline-flex items-center gap-2 rounded-full bg-fill px-3 py-1.5 text-[12px] text-ink-green"><Icon name="check" className="size-3.5"/>Real today</p><ul className="mt-5 space-y-3 text-[15px] leading-[1.5]">{real.map(t=><li key={t} className="flex items-start gap-3"><Icon name="check" className="mt-1 size-4 shrink-0 text-muted"/>{t}</li>)}</ul></div>
          <div className="rounded-card bg-fill p-7 sm:p-8"><p className="inline-flex items-center gap-2 rounded-full bg-fill px-3 py-1.5 text-[12px] text-muted"><Icon name="info" className="size-3.5"/>Simulated for the demo</p><ul className="mt-5 space-y-3 text-[15px] leading-[1.5] text-muted">{simulated.map(t=><li key={t} className="flex items-start gap-3"><Icon name="info" className="mt-1 size-4 shrink-0"/>{t}</li>)}</ul></div>
        </div>
      </section>
      <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-3xl scroll-mt-24 px-5 pt-24 sm:px-10 sm:pt-32">
        <SectionTitle id="faq-title" title="questions"/>
        <div className="mt-10 space-y-2">{faq.map(f=><details key={f.q} className="group rounded-3xl bg-surface shadow-surface"><summary className={`flex cursor-pointer list-none items-center justify-between gap-4 rounded-3xl px-6 py-5 text-[16px] tracking-[-.015em] [&::-webkit-details-marker]:hidden ${focus}`}>{f.q}<Icon name="down" className="size-4 shrink-0 text-muted transition-transform duration-200 ease-smooth group-open:rotate-180 motion-reduce:transition-none"/></summary><p className="px-6 pb-6 text-[15px] leading-[1.6] text-muted">{f.a}</p></details>)}</div>
      </section>
      <section className="mx-auto max-w-[1200px] px-5 pb-24 pt-24 sm:px-10 sm:pb-32 sm:pt-32">
        <div className="rounded-[clamp(28px,3vw,40px)] bg-surface px-7 py-14 text-center shadow-surface sm:py-20"><h2 className="mx-auto max-w-2xl text-balance text-[clamp(30px,6vw,48px)] leading-[1.08] tracking-[-.045em]">see a bad trade get stopped<span className="block font-serif italic tracking-[-.02em] text-soft">in about four minutes</span></h2><p className="mx-auto mt-5 max-w-md text-[15px] leading-[1.6] text-muted">No wallet needed to watch. Connect a testnet wallet if you want to stake beside the jury.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/app" className={buttonClass("primary")}>Open the courtroom<Icon name="arrow" className="size-4"/></Link><Link href="/how" className={buttonClass()}>Read how it works</Link></div></div>
      </section>
    </main>
    <footer className="mx-auto max-w-[1200px] px-5 pb-10 sm:px-10"><div className="flex flex-col gap-4 border-t border-line pt-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between"><Brand/><span>Built on NEAR. Testnet only: swaps are mocked and no real funds are involved.</span></div></footer>
  </div>;
}
function SectionTitle({id,title,sub}:{id:string;title:string;sub?:string}){return <div className="mx-auto max-w-2xl text-center"><h2 id={id} className="text-balance text-[clamp(28px,6vw,40px)] leading-[1.1] tracking-[-.04em]">{title}</h2>{sub&&<p className="mt-3 text-balance text-[15px] leading-[1.6] text-muted sm:text-[16px]">{sub}</p>}</div>;}
const mockNav:{label:string;icon:IconName}[]=[{label:"Courtroom",icon:"scale"},{label:"Replay",icon:"trend"},{label:"How it works",icon:"info"}];
function Window({status,children}:{status:string;children:ReactNode}){return <div aria-hidden="true" className="mx-auto w-full max-w-[780px] overflow-hidden rounded-[24px] bg-canvas shadow-sheet">
  <div className="relative flex h-11 items-center justify-center border-b border-line bg-surface px-4"><span className="absolute left-4 flex gap-1.5">{[0,1,2].map(i=><span key={i} className="size-2.5 rounded-full bg-fill-strong"/>)}</span><span className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1 text-[11px] text-muted"><Logo className="size-3.5"/>litmus</span></div>
  <div className="flex h-[560px]">
    <div className="hidden w-48 shrink-0 flex-col gap-0.5 p-3 sm:flex"><span className="mb-4 flex items-center gap-2 px-2 pt-1 text-[15px] font-semibold tracking-[-.035em]"><Logo className="size-6"/>litmus</span>{mockNav.map(n=><span key={n.label} className={`flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[12px] ${n.label==="Courtroom"?"bg-raised text-ink shadow-raised":"text-muted"}`}><Icon name={n.icon} className="size-4"/>{n.label}</span>)}</div>
    <div className="flex min-w-0 flex-1 flex-col bg-surface sm:my-3 sm:mr-3 sm:rounded-[20px] sm:shadow-surface">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5"><span className="flex size-8 items-center justify-center rounded-xl bg-ink text-canvas"><Icon name="scale" className="size-4"/></span><span className="min-w-0 flex-1"><span className="block text-[14px]">The vault</span><span className="block truncate text-[12px] text-muted">$10,027 pot, trades above 5% need a market</span></span><span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[11px] font-medium text-muted"><span className="size-1.5 rounded-full bg-accent"/>{status}</span></div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-5 sm:px-5">{children}</div>
      <div className="border-t border-line p-3"><div className="flex items-center gap-2 rounded-full bg-well p-1.5 pl-4 shadow-well"><span className="min-w-0 flex-1 truncate text-[13px] text-soft">Stake 1 NEAR on this trade</span><span className="flex h-8 shrink-0 items-center justify-center rounded-full bg-accent px-3 text-[12px] text-on-accent shadow-accent">YES</span><span className="flex h-8 shrink-0 items-center justify-center rounded-full bg-raised px-3 text-[12px] text-ink-red shadow-raised">NO</span></div></div>
    </div>
  </div>
</div>;}
function Manager({className="",children}:{className?:string;children:ReactNode}){return <div className="flex max-w-[88%] items-end gap-2 self-start"><span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] ${monogram}`}>A</span><div className={`min-w-0 rounded-[20px] rounded-bl-[6px] bg-fill px-4 py-3 text-[14px] leading-snug ${className}`}>{children}</div></div>;}
function Note({icon,children}:{icon:IconName;children:ReactNode}){return <p className="flex items-center gap-2 self-center rounded-full bg-fill px-3 py-1.5 text-[12px] text-muted"><Icon name={icon} className="size-3.5"/>{children}</p>;}
function TradeCard(){return <><p className="text-[12px] text-muted">Proposed trade</p><p className="mt-1 text-[22px] leading-none tracking-[-.045em]">Buy FROGE</p><div className="mt-3 flex flex-wrap gap-1.5"><span className="rounded-full bg-fill px-2.5 py-1 text-[11px] text-ink-red">40% of the pot</span><span className="rounded-full bg-fill px-2.5 py-1 text-[11px] text-ink-red">New asset</span><span className="rounded-full bg-fill px-2.5 py-1 text-[11px] text-muted">$4,010.80</span></div><p className="mt-3 text-[12px] text-muted">Flagged. The jury is being called.</p></>;}
function StakeCard({yes,closed=false}:{yes:number;closed?:boolean}){return <div className="w-full max-w-[420px] self-center rounded-[20px] bg-fill p-4"><div className="flex justify-between text-[12px]"><span className="text-ink-green">YES 1 NEAR</span><span className="text-ink-red">7 NEAR NO</span></div><div className="mt-2.5 flex h-2.5 gap-1 overflow-hidden rounded-full bg-fill-strong"><span className="h-full rounded-full bg-ink-green" style={{width:`${yes}%`}}/><span className="h-full flex-1 rounded-full bg-ink-red"/></div><p className="mt-2.5 text-[12px] text-muted">{closed?"Market closed. NO wins with 87.5%":"0:24 until the market closes"}</p></div>;}
function Tile({title,text,children}:{title:string;text:string;children:ReactNode}){return <div className="flex min-h-[320px] flex-col justify-between gap-10 rounded-[clamp(28px,3vw,40px)] bg-surface p-7 shadow-surface transition-[translate] duration-500 ease-smooth hover:-translate-y-1 motion-reduce:transition-none sm:p-9"><div>{children}</div><div><h3 className="text-[24px] leading-[1.15] tracking-[-.03em]">{title}</h3><p className="mt-2 text-[15px] leading-[1.5] text-muted">{text}</p></div></div>;}
