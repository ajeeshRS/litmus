"use client";

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

export type IconName = "home" | "chat" | "vote" | "users" | "settings" | "plus" | "arrow" | "chevron" | "down" | "check" | "close" | "snow" | "in" | "out" | "trend" | "link" | "bell" | "copy" | "alert" | "candles" | "pause" | "play" | "trophy" | "exit" | "target" | "scale" | "flag" | "info" | "wallet";
const paths: Record<IconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
  chat: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 1 1 21 11.5Z" />,
  vote: <><rect x="4" y="4" width="16" height="16" rx="5"/><path d="m8 12 3 3 5-6"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/></>,
  settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="none"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>, chevron: <path d="m9 5 7 7-7 7"/>, down: <path d="m6 9 6 6 6-6"/>, check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
  snow: <><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3"/></>,
  in: <path d="M17 7 7 17m0-9v9h9"/>, out: <path d="M7 17 17 7m-9 0h9v9"/>, trend: <><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
  link: <><path d="M14 3h7v7m0-7L10 14"/><path d="M10 4H4v16h16v-6"/></>,
  bell: <><path d="M5 9a7 7 0 0 1 14 0v6l2 3H3l2-3Zm5 12h4"/></>, copy: <><rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V3H3v13h5"/></>,
  alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5m0 3.5h.01"/></>,
  candles: <><path d="M7 3v4m0 8v6M17 3v3m0 9v6"/><rect x="4.5" y="7" width="5" height="8" rx="1.5"/><rect x="14.5" y="6" width="5" height="9" rx="1.5"/></>,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></>,
  play: <path d="M7 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L8.5 4.64A1 1 0 0 0 7 5.5Z"/>,
  trophy: <><path d="M8 4h8v6a4 4 0 0 1-8 0Zm0 2H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4m-4 3v4m-4 0h8"/></>,
  exit: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/></>,
  scale: <><path d="M12 4v16M7 20h10M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0Zm14 0-3 7a3 3 0 0 0 6 0Z"/></>,
  flag: <path d="M5 21V4h12l-2.5 4L17 12H5"/>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8.5h.01"/></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18m-5 4.5h2"/></>,
  target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>,
};
export function Icon({name, className = "size-[18px]"}: {name: IconName; className?: string}) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md", className = "") {
  const style = {primary: "bg-accent text-on-accent shadow-accent hover:bg-accent-hover", secondary: "bg-raised text-ink shadow-raised hover:bg-raised/75", ghost: "text-muted hover:bg-fill hover:text-ink", danger: "bg-raised text-ink-red shadow-raised hover:bg-raised/75"}[variant];
  const sizes = {sm: "min-h-9 px-4 text-[13px]", md: "min-h-11 px-5 text-[14px]"}[size];
  return `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full tracking-[-.01em] transition-[background-color,color,box-shadow,scale] duration-200 ease-smooth active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none ${focus} ${sizes} ${style} ${className}`;
}
export function Button({children, variant = "secondary", size = "md", className = "", ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?: ButtonVariant; size?: "sm" | "md"}) {
  return <button className={buttonClass(variant, size, className)} {...props}>{children}</button>;
}
export function Logo({className = "size-7"}: {className?: string}) {
  return <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true"><rect width="32" height="32" rx="9" className="fill-accent"/><g className="fill-on-accent"><rect x="9.75" y="6" width="6.5" height="20" rx="3.25"/><circle cx="21.5" cy="22.75" r="3.25"/></g></svg>;
}
export function Brand() {
  return <span className="flex items-center gap-2 text-[19px] font-semibold leading-none tracking-[-.035em]"><Logo/>litmus</span>;
}
const tips = {top: "bottom-full left-1/2 mb-2.5 -translate-x-1/2", bottom: "top-full left-1/2 mt-2.5 -translate-x-1/2", "top-end": "bottom-full right-0 mb-2.5", "bottom-end": "top-full right-0 mt-2.5"};
export function IconButton({label, tip, children, className = "", ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {label: string; tip?: keyof typeof tips}) {
  return <button aria-label={label} className={`group relative flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,box-shadow,opacity,scale] duration-200 ease-smooth active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 motion-reduce:transition-none ${focus} ${className}`} {...props}>{children}{tip&&<span aria-hidden="true" className={`pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-xl bg-raised px-3 py-1.5 text-[12px] font-normal text-muted shadow-raised group-hover:block group-focus-visible:block ${tips[tip]}`}>{label}</span>}</button>;
}
export function Panel({children, className = ""}: {children: ReactNode; className?: string}) {
  return <section className={`rounded-card bg-surface shadow-surface ${className}`}>{children}</section>;
}
export function Segmented<T extends string | number>({options, value, onChange}: {options: {id: T; label: ReactNode}[]; value: T; onChange: (id: T) => void}) {
  const index = Math.max(0, options.findIndex(o => o.id === value));
  return <div className="relative inline-grid shrink-0 auto-cols-[1fr] grid-flow-col rounded-full bg-well p-1 shadow-well"><span aria-hidden="true" className="absolute inset-y-1 left-1 rounded-full bg-raised shadow-raised transition-transform duration-300 ease-smooth motion-reduce:transition-none" style={{width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)`}}/>{options.map(o=><button key={o.id} type="button" aria-pressed={o.id===value} onClick={()=>onChange(o.id)} className={`relative min-h-10 whitespace-nowrap rounded-full px-4 text-[13px] transition-colors duration-300 sm:px-5 sm:text-[14px] ${focus} ${o.id===value?"text-ink":"text-muted hover:text-ink"}`}>{o.label}</button>)}</div>;
}
export type Option<T extends string> = {id: T; label: string; hint?: string; icon?: ReactNode};
export function Select<T extends string>({label, options, value, onChange}: {label: string; options: Option<T>[]; value: T; onChange: (id: T) => void}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = Math.max(0, options.findIndex(o => o.id === value)), selected = options[current];
  useEffect(() => {
    if (!open) return;
    list.current?.focus({preventScroll: true});
    const away = (e: PointerEvent) => {if (!root.current?.contains(e.target as Node)) setOpen(false);};
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const show = () => {setActive(current); setOpen(true);};
  const close = () => {setOpen(false); trigger.current?.focus();};
  const pick = (i: number) => {onChange(options[i].id); close();};
  function onKey(e: KeyboardEvent) {
    const move = ({ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: options.length - 1} as Record<string, number>)[e.key];
    if (move !== undefined) {e.preventDefault(); setActive(Math.min(options.length - 1, Math.max(0, move)));}
    else if (e.key === "Enter" || e.key === " ") {e.preventDefault(); pick(active);}
    else if (e.key === "Escape") {e.preventDefault(); e.stopPropagation(); close();}
    else if (e.key === "Tab") setOpen(false);
  }
  return <div ref={root} className="relative shrink-0">
    <button ref={trigger} type="button" aria-label={`${label}: ${selected.label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => open ? close() : show()} onKeyDown={e => {if (e.key === "ArrowDown" || e.key === "ArrowUp") {e.preventDefault(); show();}}} className={`flex min-h-11 items-center gap-2 rounded-full bg-raised pr-3 text-[15px] text-ink shadow-raised transition-[background-color,scale] duration-150 ease-smooth hover:bg-raised/75 active:scale-[.97] motion-reduce:transition-none ${selected.icon ? "pl-2" : "pl-4"} ${focus}`}>{selected.icon && <span className="size-7 shrink-0">{selected.icon}</span>}{selected.label}<Icon name="down" className={`size-4 text-muted transition-transform duration-200 ease-smooth motion-reduce:transition-none ${open ? "rotate-180" : ""}`}/></button>
    <ul ref={list} id={`${id}-list`} role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={open ? `${id}-${active}` : undefined} onKeyDown={onKey} className={`absolute right-0 top-full z-50 mt-2 w-60 origin-top-right rounded-2xl bg-raised p-1.5 shadow-menu outline-none ease-smooth ${open ? "visible scale-100 opacity-100 transition-[opacity,scale] duration-180" : "invisible scale-96 opacity-0 transition-[opacity,scale,visibility] duration-130 motion-reduce:scale-100"}`}>{options.map((o, i) => <li key={o.id} id={`${id}-${i}`} role="option" aria-selected={i === current} onPointerMove={() => setActive(i)} onClick={() => pick(i)} className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 ${i === active ? "bg-fill" : ""}`}>{o.icon && <span className="size-8 shrink-0">{o.icon}</span>}<span className="min-w-0 flex-1"><span className="block text-[15px] leading-5">{o.label}</span>{o.hint && <span className="block text-[12px] leading-4 text-muted">{o.hint}</span>}</span>{i === current && <Icon name="check" className="size-4"/>}</li>)}</ul>
  </div>;
}
export function Orb({size = "md", frozen = false}: {size?: "xs" | "sm" | "md"; frozen?: boolean}) {
  const sizes = {xs:"size-5 shadow-[inset_0_-1px_2px_#0000001f]", sm:"size-8 shadow-[inset_0_-2px_4px_#0000001f]", md:"size-24 shadow-[inset_0_-8px_16px_#0000001f,0_14px_28px_-14px_#00000066]"};
  return <div aria-hidden="true" className={`flex shrink-0 items-center justify-center gap-[14%] rounded-full bg-radial-[at_35%_28%] from-white/60 to-transparent to-60% transition-colors duration-500 motion-reduce:transition-none ${sizes[size]} ${frozen ? "bg-frost" : "bg-accent"}`}>
    {[0,1].map(i=><span key={i} className={`relative -top-[5%] w-[9%] rounded-full transition-[height] duration-300 ${frozen ? "h-[3%] bg-white" : "h-[14%] bg-on-accent"}`}/>)}
  </div>;
}
export const monogram = "bg-linear-to-b from-mono-from to-mono-to font-medium text-white";
const people = [{name:"Asha",initial:"A"}, {name:"Riya",initial:"R"}, {name:"Dev",initial:"D"}, {name:"You",initial:"J"}];
export {people};
export function Avatars({count=4,members=people}: {count?: number;members?: typeof people}) {return <div className="flex -space-x-2">{members.slice(0,count).map(p=><span key={p.name} role="img" aria-label={p.name} className={`group relative flex size-8 items-center justify-center rounded-full text-[11px] ring-2 ring-surface ${monogram}`}>{p.initial}<span aria-hidden="true" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-xl bg-raised px-3 py-1.5 text-[12px] font-normal text-muted shadow-raised group-hover:block">{p.name}</span></span>)}</div>;}
export function Label({children}: {children:ReactNode}) {return <p className="text-[13px] text-muted">{children}</p>;}
export function FieldError({children}: {children:ReactNode}) {return <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] leading-5 text-ink-red"><Icon name="alert" className="mt-px size-4 shrink-0"/>{children}</p>;}
export const input = "rounded-2xl bg-well px-4 text-ink shadow-well outline-none transition-[box-shadow,background-color] duration-200 placeholder:text-soft focus:bg-raised focus:shadow-raised focus:ring-2 focus:ring-ink/15 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-ink-red/40";
export function Modal({title,children,onClose}: {title:string;children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current; const trigger=document.activeElement as HTMLElement|null;dialog?.showModal();dialog?.querySelector<HTMLElement>("input:not([type=checkbox],[type=radio]), textarea")?.focus();return()=>{dialog?.close();trigger?.focus();};},[]);
  return <dialog aria-label={title} ref={ref} onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-[480px] overflow-y-auto rounded-[32px] bg-surface p-0 text-ink shadow-sheet backdrop:bg-scrim backdrop:backdrop-blur-[2px] motion-safe:animate-enter max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"><div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-8"><div className="mb-6 flex items-start justify-between gap-4"><h2 className="text-[22px] leading-tight tracking-[-.035em]">{title}</h2><IconButton label="Close dialog" onClick={onClose} className="-mr-1 -mt-1 size-9 bg-fill text-muted hover:bg-fill-strong hover:text-ink"><Icon name="close" className="size-4"/></IconButton></div>{children}</div></dialog>;
}
