"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { shortAccount, type Side } from "./lib/adapter";
import { Icon, focus, monogram } from "./ui";

// Small pieces shared by the Litmus screens. Styling follows the tokens in globals.css and the components in ui.tsx.

const pills = {
  live: {text:"Live", title:"Reading the testnet contract", dot:"bg-accent"},
  recorded: {text:"Recorded run", title:"A recorded scenario from a local file, not live chain data", dot:"bg-ink"},
  reconnecting: {text:"Reconnecting", title:"The last poll failed. Showing the last good state.", dot:"bg-ink-amber motion-safe:animate-pulse"},
  simulated: {text:"Simulated", title:"Simulated, not real trading", dot:""},
  sample: {text:"Sample data", title:"Placeholder numbers until the replay script has been run", dot:"bg-ink-amber"},
};
export function StatusPill({kind}:{kind:keyof typeof pills}) {
  const p = pills[kind];
  return <span title={p.title} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[11px] font-medium text-muted">{p.dot && <span className={`size-1.5 rounded-full ${p.dot}`}/>}{p.text}</span>;
}

export function Account({id, className = ""}:{id:string; className?:string}) {
  return <span title={id} className={`font-mono text-[.92em] tracking-normal ${className}`}>{shortAccount(id)}</span>;
}
export function Person({name, className = "size-9 text-[12px]"}:{name:string; className?:string}) {
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full uppercase ${monogram} ${className}`}>{name[0]}</span>;
}

/** YES / NO marker. Always an icon and a word, never colour alone. */
export function SideTag({side, className = ""}:{side:Side; className?:string}) {
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-fill px-2.5 py-1 text-[11px] font-medium ${side === "yes" ? "text-ink-green" : "text-ink-red"} ${className}`}><Icon name={side === "yes" ? "check" : "close"} className="size-3"/>{side === "yes" ? "YES" : "NO"}</span>;
}

export function Chip({tone, icon, children}:{tone?:"up"|"down"; icon?:"flag"|"alert"; children:ReactNode}) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-[11px] tabular-nums ${tone === "up" ? "text-ink-green" : tone === "down" ? "text-ink-red" : "text-muted"}`}>{icon && <Icon name={icon} className="size-3"/>}{children}</span>;
}
export function Stat({label, value, tone, box}:{label:string; value:ReactNode; tone?:"up"|"down"|"flat"; box?:boolean}) {
  return <div className={box ? "min-w-0 rounded-2xl bg-fill p-3" : "min-w-16 text-right"}><p className={`text-[15px] tabular-nums ${tone === "up" ? "text-ink-green" : tone === "down" ? "text-ink-red" : ""}`}>{value}</p><p className="mt-0.5 text-[11px] text-muted">{label}</p></div>;
}
export const toneClass = (sign:"up"|"down"|"flat") => sign === "up" ? "text-ink-green" : sign === "down" ? "text-ink-red" : "";

// Logos: cryptocurrency-icons (CC0) for BTC, ETH, SOL and USDC; NEAR's own mark. Anything else gets a monogram.
const coins = new Set(["BTC", "ETH", "SOL", "USDC", "NEAR"]);
export function AssetMark({id, className = "size-9"}:{id:string; className?:string}) {
  if (!coins.has(id)) return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-fill-strong text-[11px] font-medium text-muted ${className}`}>{id.slice(0, 2)}</span>;
  return <span aria-hidden="true" className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${id === "NEAR" ? "dark:ring-1 dark:ring-fill-strong" : ""} ${className}`}><Image src={`/coins/${id.toLowerCase()}.svg`} alt="" width={36} height={36} unoptimized className="absolute inset-0 size-full object-contain"/></span>;
}

export function SectionHead({title, count, children}:{title:string; count?:number; children?:ReactNode}) {
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-[18px] tracking-[-.03em] sm:text-[20px]">{title}{count !== undefined && <span className="ml-2 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-full bg-fill px-1.5 align-middle text-[11px] tracking-normal text-muted">{count}</span>}</h2>{children}</div>;
}
export function PageHeading({title, description, children}:{title:string; description?:string; children?:ReactNode}) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-[34px] leading-[1.08] tracking-[-.045em] sm:text-[44px]">{title}</h1>{description && <p className="mt-3 max-w-[60ch] text-[15px] text-muted">{description}</p>}</div>{children && <div className="flex flex-wrap items-center gap-2">{children}</div>}</div>;
}
/** Loading text, so no component ever shows a bare spinner. */
export function Loading({what}:{what:string}) {
  return <p role="status" className="flex items-center gap-2.5 p-2 text-[14px] text-muted"><span aria-hidden="true" className="size-3 rounded-full border-2 border-fill-strong border-t-ink motion-safe:animate-spin"/>Loading {what}…</p>;
}
export function ErrorLine({children}:{children:ReactNode}) {
  return <p role="alert" className="flex items-start gap-2 text-[13px] leading-5 text-ink-red"><Icon name="alert" className="mt-px size-4 shrink-0"/>{children}</p>;
}
export const textLink = `rounded underline underline-offset-4 transition-colors hover:text-ink ${focus}`;

export function useNow(intervalMs:number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t);}, [intervalMs]);
  return now;
}
export const timeText = (ms:number) => new Date(ms).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false});
export function dateTimeText(ms:number) {
  const d = new Date(ms), today = d.toDateString() === new Date().toDateString();
  return (today ? "" : d.toLocaleDateString([], {day:"numeric", month:"short"}) + ", ") + d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", hour12:false});
}
