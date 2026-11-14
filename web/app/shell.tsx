"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { config, formatNear, shortAccount } from "./lib/adapter";
import { useWallet, type Wallet } from "./lib/wallet";
import { Account, ErrorLine, Person } from "./parts";
import { Brand, Button, Icon, IconButton, Modal, focus, type IconName } from "./ui";

const nav: {href:string; label:string; icon:IconName}[] = [
  {href:"/app", label:"Courtroom", icon:"scale"},
  {href:"/replay", label:"Replay", icon:"trend"},
  {href:"/how", label:"How it works", icon:"info"},
];

const WalletContext = createContext<Wallet | null>(null);
export function useWalletContext() {
  const w = useContext(WalletContext);
  if (!w) throw new Error("useWalletContext must be used inside Shell");
  return w;
}

function VaultMark({className = "size-9 rounded-xl"}:{className?:string}) {
  return <span className={`flex shrink-0 items-center justify-center bg-ink text-canvas ${className}`}><Icon name="scale" className="size-[55%]"/></span>;
}

export default function Shell({children}:{children:ReactNode}) {
  const path = usePathname();
  const wallet = useWallet();
  const {accountId, balanceRaw, connecting, error, networkProblem} = wallet.wallet;
  const [account, setAccount] = useState(false);
  const [toast, setToast] = useState("");
  const navIndex = nav.findIndex(n => n.href === path);
  const contract = config.contractId;

  async function copyContract() {
    try {await navigator.clipboard.writeText(contract); setToast("Contract id copied.");} catch {setToast("Copy isn’t available in this browser.");}
    setTimeout(() => setToast(""), 3200);
  }

  return <WalletContext.Provider value={wallet}><div className="min-h-dvh overflow-x-clip bg-canvas text-ink">
    <a href="#main" className={`sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-raised focus:px-4 focus:py-2 focus:text-[13px] focus:shadow-raised ${focus}`}>Skip to content</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col px-3 pb-4 pt-6 lg:flex">
      <div className="px-3"><Link href="/" className={`inline-flex rounded-lg ${focus}`}><Brand/></Link></div>
      <div className="mt-8 flex items-center gap-3 rounded-2xl p-2.5"><VaultMark/><span className="min-w-0 flex-1"><span className="block truncate text-[13px]">The vault</span><span className="mt-0.5 block truncate text-[11px] text-muted">{contract ? <Account id={contract}/> : "No contract set yet"}</span></span></div>
      <nav aria-label="Main" className="relative mt-6 flex flex-col gap-0.5"><span aria-hidden="true" className="absolute inset-x-0 top-0 h-10 rounded-xl bg-raised shadow-raised transition-[transform,opacity] duration-300 ease-smooth motion-reduce:transition-none" style={{transform:`translateY(calc(${Math.max(navIndex, 0)} * (100% + 2px)))`, opacity:navIndex < 0 ? 0 : 1}}/>{nav.map(n => <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} className={`relative flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] transition-colors ${focus} ${path === n.href ? "text-ink" : "text-muted hover:bg-fill hover:text-ink"}`}><Icon name={n.icon} className="size-[17px]"/>{n.label}</Link>)}</nav>
      <div className="mt-auto">{accountId
        ? <button onClick={() => setAccount(true)} className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-fill ${focus}`}><Person name={accountId} className="size-8 text-[12px]"/><span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{shortAccount(accountId)}</span><span className="block text-[11px] text-muted tabular-nums">{balanceRaw ? formatNear(balanceRaw) : "Testnet wallet"}</span></span><Icon name="down" className="size-3.5 text-soft"/></button>
        : <p className="px-3 text-[11px] leading-5 text-muted">Watching needs no wallet. Connect one only to stake.</p>}</div>
    </aside>
    {/* On desktop the content sits above the fixed sidebar, so menus that spill left aren't drawn under it. */}
    <div className="lg:relative lg:z-40 lg:ml-[240px]"><div className="min-h-dvh">
      <header className="flex h-16 items-center justify-between gap-3 px-5 sm:px-8 xl:px-12">
        <div className="hidden min-w-0 items-center gap-2 text-[13px] lg:flex"><span className="text-muted">Litmus</span><span className="text-faint">/</span><span>{nav[navIndex]?.label ?? "Page"}</span>{contract && <><span className="ml-3 rounded-full bg-fill py-1 pl-3 pr-1 text-[12px] text-muted"><Account id={contract}/><IconButton label="Copy contract id" tip="bottom" onClick={copyContract} className="ml-1 inline-flex size-6 align-middle text-muted hover:bg-fill-strong hover:text-ink"><Icon name="copy" className="size-3.5"/></IconButton></span></>}</div>
        <Link href="/" className={`flex min-w-0 items-center rounded-xl lg:hidden ${focus}`}><Brand/></Link>
        <div className="flex items-center gap-3"><span className="rounded-full bg-fill px-2.5 py-1 text-[11px] text-muted"><span className="sm:hidden">Testnet</span><span className="hidden sm:inline">NEAR testnet, mock swaps</span></span><span className="h-5 w-px bg-line"/>{accountId
          ? <Button size="sm" onClick={() => setAccount(true)} aria-haspopup="dialog"><Icon name="wallet" className="size-4"/><span className="max-w-[9rem] truncate">{shortAccount(accountId)}</span></Button>
          : <Button variant="primary" size="sm" disabled={connecting} onClick={() => void wallet.connect()}>{connecting ? "Connecting…" : "Connect wallet"}</Button>}</div>
      </header>
      {(error || networkProblem) && <div className="px-5 sm:px-8 xl:px-12"><div className="mx-auto flex max-w-[1200px] justify-center rounded-2xl bg-fill px-4 py-2.5 sm:rounded-full"><ErrorLine>{networkProblem ?? error}</ErrorLine></div></div>}
      <main id="main" className="mx-auto max-w-[1200px] px-5 pb-32 pt-8 sm:px-8 sm:pt-10 lg:pb-12 xl:px-12">
        <div key={path} className="motion-safe:animate-enter">{children}</div>
        <footer className="mt-14 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-6 text-[12px] text-muted"><span>Built on NEAR. Testnet only: swaps are mocked and no real funds are involved.</span><Link href="/" className={`rounded transition-colors hover:text-ink ${focus}`}>About Litmus</Link></footer>
      </main>
    </div></div>
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/85 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl backdrop-saturate-150 lg:hidden"><div className="relative flex"><span aria-hidden="true" className="absolute inset-y-0 left-0 rounded-xl bg-raised shadow-raised transition-[transform,opacity] duration-300 ease-smooth motion-reduce:transition-none" style={{width:`${100 / nav.length}%`, transform:`translateX(${Math.max(navIndex, 0) * 100}%)`, opacity:navIndex < 0 ? 0 : 1}}/>{nav.map(n => <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition-colors ${focus} ${path === n.href ? "text-ink" : "text-soft"}`}><Icon name={n.icon} className="size-[21px]"/>{n.label}</Link>)}</div></nav>
    {toast && <div role="status" className="fixed bottom-24 left-1/2 z-50 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-[22px] bg-raised py-2 pl-2.5 pr-4 text-[13px] text-ink shadow-toast motion-safe:animate-enter lg:bottom-8"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"><Icon name="check" className="size-3.5"/></span>{toast}</div>}
    {account && accountId && <Modal title="Wallet" onClose={() => setAccount(false)}>
      <div className="flex items-center gap-3 rounded-3xl bg-fill p-4"><Person name={accountId} className="size-10 text-[13px]"/><span className="min-w-0"><span className="block break-all text-[15px]">{accountId}</span><span className="block text-[13px] text-muted tabular-nums">{balanceRaw ? `${formatNear(balanceRaw)} on testnet` : "NEAR testnet"}</span></span></div>
      {networkProblem && <div className="mt-4"><ErrorLine>{networkProblem}</ErrorLine></div>}
      <Button className="mt-6 w-full" onClick={() => {setAccount(false); void wallet.disconnect();}}><Icon name="exit" className="size-4"/>Disconnect</Button>
    </Modal>}
  </div></WalletContext.Provider>;
}
