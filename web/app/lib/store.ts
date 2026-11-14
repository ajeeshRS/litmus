"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config, contract, toMarket, toStake, toVault } from "./adapter";
import type { MarketVM, RawMarket, RawStake, RawVault, StakeVM, VaultVM } from "./adapter";

export type Mode = "loading" | "live" | "recorded" | "error";

export interface LitmusState {
  mode: Mode;
  /** True when the last poll failed. The last good state stays on screen. */
  reconnecting: boolean;
  error: string | null;
  vault: VaultVM | null;
  sessionStartPotRaw: string | null;
  active: MarketVM | null;
  stakes: StakeVM[];
  markets: MarketVM[];
  stakesByMarket: Record<string, StakeVM[]>;
  demo: "idle" | "running" | "done";
}

interface Recorded {
  initial: { vault: RawVault; markets: RawMarket[]; stakes_by_market: Record<string, RawStake[]> };
  frames: { t_ms: number; vault?: RawVault; active?: RawMarket | null; stakes?: RawStake[]; docket_add?: RawMarket; end?: boolean }[];
}

const shiftMarket = (m: RawMarket, base: number): RawMarket => ({
  ...m,
  proposed_at_ms: m.proposed_at_ms + base,
  opened_at_ms: m.opened_at_ms === null ? null : m.opened_at_ms + base,
  close_time_ms: m.close_time_ms === null ? null : m.close_time_ms + base,
});
const shiftStakes = (s: RawStake[], base: number) => s.map((x) => toStake({ ...x, time_ms: x.time_ms + base }));

const initial: LitmusState = {
  mode: "loading",
  reconnecting: false,
  error: null,
  vault: null,
  sessionStartPotRaw: null,
  active: null,
  stakes: [],
  markets: [],
  stakesByMarket: {},
  demo: "idle",
};

export function useLitmus() {
  const [state, setState] = useState<LitmusState>(initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timers = useRef<number[]>([]);
  const pollTimer = useRef<number | null>(null);
  const recorded = useRef<Recorded | null>(null);
  const alive = useRef(true);
  const marketsCache = useRef<{ key: string; age: number; rows: RawMarket[] } | null>(null);
  /** True once a recorded run starts: from then on, live polls must not write over it. */
  const recordedOwnsScreen = useRef(false);
  /** A live run in progress: which markets it has opened so far, and when it began. */
  const liveRun = useRef<{ seen: Set<string>; startedAt: number } | null>(null);
  const lastSeen = useRef<{ key: string; pot: string } | null>(null);
  const lingering = useRef<{ id: string; goneAt: number } | null>(null);

  const patch = useCallback((p: Partial<LitmusState> | ((s: LitmusState) => Partial<LitmusState>)) => {
    if (alive.current) setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
  }, []);

  /* ----- recorded source ----- */

  const loadRecorded = useCallback(async (): Promise<Recorded> => {
    if (recorded.current) return recorded.current;
    const res = await fetch("/recorded-run.json");
    if (!res.ok) throw new Error("The recorded scenario file could not be loaded.");
    recorded.current = (await res.json()) as Recorded;
    return recorded.current;
  }, []);

  const showRecordedInitial = useCallback(async () => {
    const rec = await loadRecorded();
    const now = Date.now();
    patch({
      mode: "recorded",
      reconnecting: false,
      error: null,
      vault: toVault(rec.initial.vault),
      sessionStartPotRaw: rec.initial.vault.pot_value_usd,
      active: null,
      stakes: [],
      markets: rec.initial.markets.map((m) => toMarket(shiftMarket(m, now))),
      stakesByMarket: Object.fromEntries(Object.entries(rec.initial.stakes_by_market).map(([k, v]) => [k, shiftStakes(v, now)])),
      demo: "idle",
    });
  }, [loadRecorded, patch]);

  const playRecorded = useCallback(async () => {
    recordedOwnsScreen.current = true;
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    await showRecordedInitial();
    const rec = await loadRecorded();
    const base = Date.now();
    patch({ demo: "running" });
    // Dev aid: /?speed=8 plays the recorded run 8x faster.
    const speed = Math.max(1, Number(new URLSearchParams(window.location.search).get("speed")) || 1);
    const fast = (m: RawMarket): RawMarket => shiftMarket({ ...m, proposed_at_ms: m.proposed_at_ms / speed, opened_at_ms: m.opened_at_ms && m.opened_at_ms / speed, close_time_ms: m.close_time_ms && m.close_time_ms / speed }, base);
    for (const f of rec.frames) {
      timers.current.push(
        window.setTimeout(() => {
          patch((s) => {
            const next: Partial<LitmusState> = {};
            if (f.vault) next.vault = toVault(f.vault);
            if (f.active !== undefined) next.active = f.active && toMarket(fast(f.active));
            if (f.stakes) {
              next.stakes = shiftStakes(f.stakes, base);
              const id = f.active?.id ?? s.active?.id;
              if (id) next.stakesByMarket = { ...s.stakesByMarket, [id]: next.stakes };
            }
            if (f.docket_add) {
              const m = toMarket(fast(f.docket_add));
              next.markets = [m, ...s.markets.filter((x) => x.id !== m.id)];
            }
            if (f.end) next.demo = "done";
            return next;
          });
        }, f.t_ms / speed),
      );
    }
  }, [loadRecorded, patch, showRecordedInitial]);

  /* ----- live source ----- */

  const pollOnce = useCallback(async () => {
    const [vaultRaw, activeRaw] = await Promise.all([contract.getVault(), contract.getActiveMarket()]);
    if (recordedOwnsScreen.current) return false;
    const activeId = activeRaw ? String(activeRaw.id) : null;
    // The docket only changes when a market opens or finishes, so re-read it then, and now and again.
    const key = `${activeId}:${activeRaw?.state}`;
    if (!marketsCache.current || key !== marketsCache.current.key || ++marketsCache.current.age >= 5) {
      marketsCache.current = { key, age: 0, rows: await contract.getMarkets(0, 50) };
    }
    const marketsRaw = marketsCache.current.rows;
    const stakesRaw = activeId ? await contract.getStakes(activeId) : [];
    const stakes = stakesRaw.map(toStake);
    const all = marketsRaw.map(toMarket).sort((a, b) => b.proposedAt - a.proposedAt);
    // The contract clears its active market the moment it settles. Keep that market on screen
    // for a while longer, so the settlement is seen before the panel goes idle.
    if (activeId) lingering.current = { id: activeId, goneAt: 0 };
    else if (lingering.current && !lingering.current.goneAt) lingering.current.goneAt = Date.now();
    const held = !activeId && lingering.current && Date.now() - lingering.current.goneAt < 120000 ? all.find((m) => m.id === lingering.current!.id) : undefined;
    const shown = activeRaw ? toMarket(activeRaw) : (held ?? null);
    const seen = `${marketsRaw.length}:${activeId}`;
    const reseeded = !activeId && lastSeen.current !== null && lastSeen.current.key === seen && lastSeen.current.pot !== vaultRaw.pot_value_usd;
    lastSeen.current = { key: seen, pot: vaultRaw.pot_value_usd };
    // Ask the trader whether the run is still going. If it stopped with an error, say so and give the button back.
    let demoFailed: string | null = null;
    if (liveRun.current && config.demoTriggerUrl && Date.now() - liveRun.current.startedAt > 4000) {
      try {
        const st = (await (await fetch(config.demoTriggerUrl)).json()) as { running: boolean; error: string | null };
        if (!st.running && st.error) demoFailed = st.error;
      } catch {
        /* the trader is not answering: the seven-minute limit below still applies */
      }
      if (demoFailed) liveRun.current = null;
    }
    // A live run is over once its two markets have come and gone, or after seven minutes whatever happened.
    let demoDone = false;
    if (liveRun.current) {
      if (activeId) liveRun.current.seen.add(activeId);
      if ((!activeId && liveRun.current.seen.size >= 2) || Date.now() - liveRun.current.startedAt > 420000) {
        liveRun.current = null;
        demoDone = true;
      }
    }
    patch((s) => ({
      ...(demoDone ? { demo: "done" as const } : {}),
      ...(demoFailed ? { demo: "idle" as const } : {}),
      mode: "live",
      reconnecting: false,
      error: demoFailed ? `The live run stopped: ${demoFailed}` : s.demo === "running" ? null : s.error,
      vault: toVault(vaultRaw),
      // A pot that changes with no trade in between was reset by the demo script: start counting from there.
      sessionStartPotRaw: s.sessionStartPotRaw === null || reseeded ? vaultRaw.pot_value_usd : s.sessionStartPotRaw,
      active: shown,
      stakes: activeId ? stakes : held ? (s.stakesByMarket[held.id] ?? s.stakes) : [],
      // The docket lists finished trades only.
      markets: all.filter((m) => m.id !== activeId && m.phase !== "open" && m.phase !== "verdict"),
      stakesByMarket: activeId ? { ...s.stakesByMarket, [activeId]: stakes } : s.stakesByMarket,
    }));
    return shown !== null;
  }, [patch]);

  const startPolling = useCallback(() => {
    const loop = async () => {
      let busy = stateRef.current.active !== null;
      try {
        busy = await pollOnce();
      } catch {
        patch({ reconnecting: true });
      }
      if (alive.current && stateRef.current.mode === "live" && !recordedOwnsScreen.current) pollTimer.current = window.setTimeout(loop, busy || liveRun.current ? 2000 : 10000);
    };
    pollTimer.current = window.setTimeout(loop, 2000);
  }, [patch, pollOnce]);

  useEffect(() => {
    alive.current = true;
    (async () => {
      if (config.contractId) {
        try {
          await pollOnce();
          startPolling();
          return;
        } catch {
          /* chain unreachable on first load: fall through to the recorded scenario */
        }
      }
      try {
        await showRecordedInitial();
      } catch (e) {
        patch({ mode: "error", error: e instanceof Error ? e.message : "Could not load any data." });
      }
    })();
    return () => {
      alive.current = false;
      timers.current.forEach(window.clearTimeout);
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, [patch, pollOnce, showRecordedInitial, startPolling]);

  /* ----- actions ----- */

  const runDemo = useCallback(async () => {
    if (stateRef.current.demo === "running") return;
    if (stateRef.current.mode === "live" && config.demoTriggerUrl) {
      try {
        const res = await fetch(config.demoTriggerUrl, { method: "POST" });
        // 409 means the trader is already mid-run: that is a live run too, not a reason to fall back.
        if (!res.ok && res.status !== 409) throw new Error();
        liveRun.current = { seen: new Set(), startedAt: Date.now() };
        patch({ demo: "running", error: null });
        return;
      } catch {
        /* agents unreachable: play the recorded scenario instead */
      }
    }
    try {
      await playRecorded();
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : "The demo could not start." });
    }
  }, [patch, playRecorded]);

  /** After a signed stake, pull fresh state now instead of waiting for the next poll. */
  const refresh = useCallback(async () => {
    if (stateRef.current.mode !== "live") return;
    try {
      await pollOnce();
    } catch {
      patch({ reconnecting: true });
    }
  }, [patch, pollOnce]);

  /** Full detail for a docket row (live only; recorded rows already carry everything). */
  const loadMarket = useCallback(
    async (id: string) => {
      if (stateRef.current.mode !== "live") return;
      const [m, st] = await Promise.all([contract.getMarket(id), contract.getStakes(id)]);
      const vm = toMarket(m);
      patch((s) => ({ markets: s.markets.map((x) => (x.id === id ? vm : x)), stakesByMarket: { ...s.stakesByMarket, [id]: st.map(toStake) } }));
    },
    [patch],
  );

  return { state, runDemo, refresh, loadMarket };
}
