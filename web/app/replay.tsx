"use client";

import { useEffect, useState } from "react";
import { ErrorLine, Loading, PageHeading, Stat, StatusPill } from "./parts";
import { Panel } from "./ui";

/** Written by the replay script to public/replay.json. Plain numbers: simulation results, not chain amounts. */
type ReplayData = {
  sample?:boolean; source:string; trades:number; generated_at?:string;
  stats?:{traders:number; median_drawdown_without_pct:number; median_drawdown_with_pct:number; bad_case_drawdown_without_pct:number; bad_case_drawdown_with_pct:number; median_final_without_usd:number; median_final_with_usd:number; share_ended_higher_with_pct:number; share_smaller_drawdown_with_pct:number};
  without:{worst_drawdown_pct:number; final_value_usd:number};
  with:{worst_drawdown_pct:number; final_value_usd:number};
  series:{trade:number; without_usd:number; with_usd:number}[];
  blocked:{trade:number; action:string; asset:string; size_pct:number; would_have_cost_usd:number}[];
};
const usd = (n:number, frac = 0) => n.toLocaleString("en-US", {style:"currency", currency:"USD", minimumFractionDigits:frac, maximumFractionDigits:frac});
const pct = (n:number) => `−${Math.abs(n).toFixed(1)}%`;
const th = "whitespace-nowrap px-4 pb-3 text-left text-[12px] font-normal text-muted";

function ReplayChart({data}:{data:ReplayData}) {
  const W = 880, H = 320, L = 64, R = 128, T = 16, B = 36, pts = data.series;
  const all = pts.flatMap(p => [p.with_usd, p.without_usd]), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * .08 || 1, y0 = lo - pad, y1 = hi + pad;
  const x = (i:number) => L + i / Math.max(1, pts.length - 1) * (W - L - R), y = (v:number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const line = (k:"with_usd"|"without_usd") => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");
  const ticks = Array.from({length:5}, (_, i) => y0 + (y1 - y0) * i / 4), last = pts[pts.length - 1], blocked = new Set(data.blocked.map(b => b.trade));
  let yWith = y(last.with_usd), yWithout = y(last.without_usd);
  if (Math.abs(yWith - yWithout) < 32) {const mid = (yWith + yWithout) / 2, up = yWith <= yWithout; yWith = mid + (up ? -16 : 16); yWithout = mid + (up ? 16 : -16);}
  return <figure>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Pot value over ${data.trades} replayed trades. With Litmus it ends at ${usd(last.with_usd)}, without Litmus at ${usd(last.without_usd)}. The full data is in the table below the chart.`} className="block h-auto w-full">
      {ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-line"/><text x={L - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-soft text-[11px] tabular-nums">{usd(t)}</text></g>)}
      <text x={L} y={H - 10} className="fill-soft text-[11px]">Trade 1</text><text x={W - R} y={H - 10} textAnchor="end" className="fill-soft text-[11px]">Trade {last.trade}</text>
      <path d={line("without_usd")} fill="none" strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" className="stroke-soft"/>
      <path d={line("with_usd")} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-ink-green"/>
      {pts.map((p, i) => blocked.has(p.trade) && <circle key={p.trade} cx={x(i)} cy={y(p.with_usd)} r="4.5" strokeWidth="2" className="fill-surface stroke-ink-green"/>)}
      <text x={W - R + 12} y={yWith} dominantBaseline="middle" className="fill-ink text-[13px]">With Litmus</text><text x={W - R + 12} y={yWith + 16} dominantBaseline="middle" className="fill-soft text-[11px] tabular-nums">{usd(last.with_usd)}</text>
      <text x={W - R + 12} y={yWithout} dominantBaseline="middle" className="fill-muted text-[13px]">Without</text><text x={W - R + 12} y={yWithout + 16} dominantBaseline="middle" className="fill-soft text-[11px] tabular-nums">{usd(last.without_usd)}</text>
    </svg>
    <figcaption className="mt-3 text-[12px] text-muted">Solid line: with Litmus. Dashed line: the same trader without it. Ringed points are trades Litmus blocked.</figcaption>
    <details className="mt-4"><summary className="w-fit cursor-pointer rounded text-[13px] text-muted hover:text-ink">Show the chart data as a table</summary>
      <div className="mt-3 max-h-80 overflow-auto rounded-3xl bg-fill p-2"><table className="w-full border-collapse text-[13px]"><thead><tr><th scope="col" className={`${th} pt-3`}>Trade</th><th scope="col" className={`${th} pt-3 text-right`}>Without Litmus</th><th scope="col" className={`${th} pt-3 text-right`}>With Litmus</th></tr></thead><tbody>{pts.map(p => <tr key={p.trade} className="border-t border-line"><td className="px-4 py-2 tabular-nums">{p.trade}{blocked.has(p.trade) ? " (blocked)" : ""}</td><td className="px-4 py-2 text-right tabular-nums">{usd(p.without_usd, 2)}</td><td className="px-4 py-2 text-right tabular-nums">{usd(p.with_usd, 2)}</td></tr>)}</tbody></table></div>
    </details>
  </figure>;
}

export default function Replay() {
  const [data, setData] = useState<ReplayData|null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let on = true;
    fetch("/replay.json").then(r => r.ok ? r.json() : Promise.reject(new Error())).then((d:ReplayData) => {if (!on) return; if (!d?.series?.length) setError("The replay file has no trades in it yet. Run the replay script to fill it."); else setData(d);}).catch(() => on && setError("The replay results could not be loaded. Run the replay script to write public/replay.json."));
    return () => {on = false;};
  }, []);
  const total = data?.blocked.reduce((a, b) => a + b.would_have_cost_usd, 0) ?? 0, st = data?.stats;
  const signed = (n:number) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${usd(Math.abs(n), 2)}`;
  return <>
    <PageHeading title="Replay" description="The same traders, replayed over real prices with and without Litmus."><StatusPill kind="simulated"/>{data?.sample && <StatusPill kind="sample"/>}</PageHeading>
    {error ? <Panel className="mt-8 p-6 sm:p-8"><ErrorLine>{error}</ErrorLine></Panel> : !data ? <Panel className="mt-8 p-6 sm:p-8"><Loading what="the replay results"/></Panel> : <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Panel className="p-6 sm:p-8"><p className="text-[13px] text-muted">{st ? "Typical worst drawdown without Litmus" : "Worst drawdown without Litmus"}</p><p className="mt-6 text-[52px] leading-none tracking-[-.06em] tabular-nums text-ink-red sm:text-[68px]">{pct(st ? st.median_drawdown_without_pct : data.without.worst_drawdown_pct)}</p><p className="mt-3 text-[13px] text-muted tabular-nums">{st ? `In a bad case (1 trader in 20): ${pct(st.bad_case_drawdown_without_pct)}` : `Pot ends at ${usd(data.without.final_value_usd)}`}</p></Panel>
        <Panel className="p-6 sm:p-8"><p className="text-[13px] text-muted">{st ? "Typical worst drawdown with Litmus" : "Worst drawdown with Litmus"}</p><p className="mt-6 text-[52px] leading-none tracking-[-.06em] tabular-nums text-ink-green sm:text-[68px]">{pct(st ? st.median_drawdown_with_pct : data.with.worst_drawdown_pct)}</p><p className="mt-3 text-[13px] text-muted tabular-nums">{st ? `In a bad case (1 trader in 20): ${pct(st.bad_case_drawdown_with_pct)}` : `Pot ends at ${usd(data.with.final_value_usd)}`}</p></Panel>
      </div>
      {st && <Panel className="mt-4 p-6 sm:p-8">
        <p className="text-[13px] text-muted">Across {st.traders.toLocaleString("en-US")} simulated traders, {data.trades} trades each</p>
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
          <Stat box label="of traders had a smaller worst drawdown with Litmus" value={`${st.share_smaller_drawdown_with_pct}%`}/>
          <Stat box label="of traders ended with more money with Litmus" value={`${st.share_ended_higher_with_pct}%`}/>
          <Stat box label="typical final pot without Litmus" value={usd(st.median_final_without_usd)}/>
          <Stat box label="typical final pot with Litmus" value={usd(st.median_final_with_usd)}/>
        </div>
        <p className="mt-4 max-w-[75ch] text-[13px] leading-6 text-muted">The trade-off is plain: Litmus cut the falls, and it also blocked some trades that would have paid off, so the typical trader ended with slightly less. It limits risk. It does not pick winners.</p>
      </Panel>}
      <Panel className="mt-4 p-6 sm:p-8"><p className="mb-6 text-[13px] text-muted">{st ? `One typical trader: pot value over ${data.trades} replayed trades` : `Pot value over ${data.trades} replayed trades`}</p><ReplayChart data={data}/></Panel>
      <section className="mt-12"><h2 className="mb-4 text-[18px] tracking-[-.03em] sm:text-[20px]">{st ? "Trades Litmus blocked for that trader" : "Trades Litmus blocked"}<span className="ml-2 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-full bg-fill px-1.5 align-middle text-[11px] tracking-normal text-muted">{data.blocked.length}</span></h2>
        <Panel className="p-2">{data.blocked.length ? <div className="overflow-x-auto"><table className="w-full border-collapse text-[13px]"><thead><tr><th scope="col" className={`${th} pt-4`}>Trade</th><th scope="col" className={`${th} pt-4`}>Action</th><th scope="col" className={`${th} pt-4 text-right`}>Size</th><th scope="col" className={`${th} pt-4 text-right`}>Result if it had run</th></tr></thead>
          <tbody>{data.blocked.map(b => <tr key={b.trade} className="border-t border-line"><td className="px-4 py-3 tabular-nums text-muted">#{b.trade}</td><td className="px-4 py-3">{b.action} {b.asset}</td><td className="px-4 py-3 text-right tabular-nums">{b.size_pct}% of pot</td><td className={`px-4 py-3 text-right tabular-nums ${b.would_have_cost_usd > 0 ? "text-ink-red" : b.would_have_cost_usd < 0 ? "text-ink-green" : ""}`}>{signed(-b.would_have_cost_usd)}</td></tr>)}</tbody>
          <tfoot><tr className="border-t border-line"><th scope="row" colSpan={3} className="px-4 py-4 text-left text-[14px] font-normal">{total >= 0 ? "Net loss avoided by blocking" : "Net gain missed by blocking"}</th><td className="px-4 py-4 text-right text-[14px] tabular-nums">{usd(Math.abs(total), 2)}</td></tr></tfoot></table></div> : <p className="p-10 text-center text-[14px] text-muted">No trades were blocked in this replay.</p>}</Panel>
      </section>
      <p className="mt-6 max-w-[80ch] text-[12px] leading-5 text-muted">This is a simulation, not trading history. Source: {data.source}. {data.trades} trades replayed{data.generated_at ? `, generated ${new Date(data.generated_at).toLocaleDateString("en-GB", {day:"numeric", month:"long", year:"numeric"})}` : ""}.{data.sample ? " These are placeholder numbers until the replay script has been run." : ""}</p>
    </>}
  </>;
}
