import { useEffect, useMemo, useRef, useState } from 'react';
import type { Match } from '@sportradar/shared';
import { LIVE_INTERVAL_MS, buildFeeds, liveCandidates, parseEspnLive, sameLive, type LiveFeed, type LiveSport, type LiveState } from './lib/live';
import { mapProxyFeed } from './lib/liveProxy';
import { createPoller } from './lib/livePoller';

export interface LiveInfo {
  /** Živé stavy podle id zápasu (jen v paměti, nic se neukládá). */
  states: ReadonlyMap<string, LiveState>;
  /** Kandidáti, jejichž zdroj je nedostupný (a nemáme o nich žádný stav). */
  unavailable: ReadonlySet<string>;
  /** Některý feed vlastní proxy je po opakovaných chybách vypnutý. */
  proxyDown: boolean;
}

const FETCH_TIMEOUT_MS = 10_000;

/** Interval dotazů: 20 s; jen ve vývojovém serveru jde zkrátit přes `?liveMs=` (testy). */
export function liveIntervalMs(): number {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const n = Number(new URLSearchParams(window.location.search).get('liveMs'));
    if (Number.isFinite(n) && n >= 200) return n;
  }
  return LIVE_INTERVAL_MS;
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, credentials: 'omit' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

const EMPTY_STATES: ReadonlyMap<string, LiveState> = new Map();

const isProxy = (f: LiveFeed) => f.sport.startsWith('proxy:');

/**
 * Živé skóre pro zobrazené zápasy v okně [začátek − 15 min, začátek + 4 h]: NBA a fotbal z ESPN,
 * NHL, extraliga a NBL přes vlastní proxy (jen je-li `proxyUrl` nastavená).
 * Dotazuje jen když existují kandidáti a záložka je vidět; nic nepersistuje.
 */
export function useLiveScores(matches: readonly Match[], now: Date, proxyUrl?: string): LiveInfo {
  const [states, setStates] = useState<ReadonlyMap<string, LiveState>>(EMPTY_STATES);
  const [down, setDown] = useState<ReadonlySet<string>>(new Set());
  const pollerRef = useRef<ReturnType<typeof createPoller> | null>(null);

  const t = now.getTime();
  const { feeds, candidates } = useMemo(() => {
    // zápasy, které už skončily (phase post), se nedotazují znovu
    const c = liveCandidates(matches, t, { proxyUrl }).filter((m) => states.get(m.id)?.phase !== 'post');
    return { feeds: buildFeeds(c, { proxyUrl }), candidates: c };
  }, [matches, t, states, proxyUrl]);
  const sig = JSON.stringify(feeds.map((f) => [f.url, f.matchIds]));
  const feedsRef = useRef<LiveFeed[]>(feeds);
  feedsRef.current = feeds;
  const candidatesRef = useRef<Match[]>(candidates);
  candidatesRef.current = candidates;

  useEffect(() => {
    const poller = createPoller({
      intervalMs: liveIntervalMs(),
      isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
      fetchJson,
      onData: (feed, json) => {
        const parsed = isProxy(feed)
          ? mapProxyFeed(json, candidatesRef.current.filter((m) => feed.matchIds.includes(m.id)))
          : parseEspnLive(json, feed.sport as LiveSport);
        setStates((prev) => {
          let next: Map<string, LiveState> | null = null;
          for (const [id, s] of parsed) {
            const old = prev.get(id);
            if (old && sameLive(old, s)) continue;
            next ??= new Map(prev);
            next.set(id, s);
          }
          return next ?? prev;
        });
      },
      onSuccess: (feed) => setDown((d) => { if (!d.has(feed.key)) return d; const n = new Set(d); n.delete(feed.key); return n; }),
      onFailure: (feed, failures, isDown) => {
        if (isDown) setDown((d) => (d.has(feed.key) ? d : new Set(d).add(feed.key)));
        if (failures < 2 && !isDown) return;
        // zdroj už opakovaně neodpovídá: nezobrazujeme zastaralé „živě“
        setStates((prev) => {
          let next: Map<string, LiveState> | null = null;
          for (const id of feed.matchIds) {
            if (prev.get(id)?.phase !== 'live') continue;
            next ??= new Map(prev);
            next.delete(id);
          }
          return next ?? prev;
        });
      },
    });
    pollerRef.current = poller;
    poller.setFeeds(feedsRef.current);
    const onVis = () => poller.visibilityChanged();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      poller.stop();
      pollerRef.current = null;
    };
  }, []);

  useEffect(() => { pollerRef.current?.setFeeds(feeds); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  const unavailable = useMemo(() => {
    const out = new Set<string>();
    if (down.size === 0) return out;
    for (const m of candidates) {
      if (states.has(m.id)) continue;
      const mine = feeds.filter((f) => f.matchIds.includes(m.id));
      if (mine.length > 0 && mine.every((f) => down.has(f.key))) out.add(m.id);
    }
    return out;
  }, [down, candidates, feeds, states]);

  const proxyDown = feeds.some((f) => isProxy(f) && down.has(f.key));
  return useMemo(() => ({ states, unavailable, proxyDown }), [states, unavailable, proxyDown]);
}
