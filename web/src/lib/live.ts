import { competitionById, type Match } from '@sportradar/shared';
import { dayKey } from './time';

/** Živé skóre z veřejného scoreboardu ESPN (čte ho přímo prohlížeč). Nic se neukládá. */
export type LivePhase = 'pre' | 'live' | 'post';

export interface LiveState {
  matchId: string;
  phase: LivePhase;
  home?: number;
  away?: number;
  clock?: string;   // 'Q3 5:42' (NBA), "67'" (fotbal)
  detail?: string;  // 'Poločas', 'Prodloužení', 'Konec'…
  updatedAt: number;
}

export type LiveSport = 'nba' | 'football';

export const LIVE_INTERVAL_MS = 20_000;
export const LIVE_BEFORE_MS = 15 * 60_000;
export const LIVE_AFTER_MS = 4 * 3600_000;
export const MAX_FAILURES = 5;
const MAX_BACKOFF_MS = 300_000;

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/';
/** Soutěže, které ESPN pokrývá (česká liga cze.1 na ESPN není). */
const FOOTBALL_LIVE = new Set(['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions']);

/* ---------- parsování ---------- */

const rec = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

function toScore(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const NO_LIVE = /POSTPONED|CANCEL|ABANDON|FORFEIT/;

function describe(name: string, state: 'in' | 'post', sport: LiveSport, period: number, displayClock: string): { clock?: string; detail?: string } {
  const clock = displayClock.trim();
  if (state === 'post') {
    if (/FINAL_PEN|SHOOTOUT/.test(name)) return { detail: 'Konec po penaltách' };
    if (/AET|EXTRA/.test(name) || (sport === 'nba' && period > 4)) return { detail: 'Konec po prodloužení' };
    return { detail: 'Konec' };
  }
  if (/SUSPEND|DELAY/.test(name)) return { clock: clock || undefined, detail: 'Přerušeno' };
  if (sport === 'nba') {
    if (name === 'STATUS_HALFTIME') return { detail: 'Poločas' };
    if (name === 'STATUS_END_PERIOD') {
      return { detail: period > 4 ? 'Konec prodloužení' : `Konec ${period}. čtvrtiny` };
    }
    if (period > 4) {
      const n = period - 4;
      return { clock: clock ? `${n > 1 ? n : ''}OT ${clock}` : undefined, detail: 'Prodloužení' };
    }
    return { clock: clock ? `Q${period} ${clock}` : undefined };
  }
  if (/HALFTIME_ET|HALF_TIME_ET/.test(name)) return { detail: 'Pauza v prodloužení' };
  if (/HALFTIME|HALF_TIME/.test(name)) return { detail: 'Poločas' };
  if (/SHOOTOUT|PENALT/.test(name)) return { detail: 'Penalty' };
  if (/END_OF_EXTRA/.test(name)) return { detail: 'Konec prodloužení' };
  if (/END_OF_REG|END_OF_NORMAL/.test(name)) return { detail: 'Konec základní doby' };
  if (/EXTRA/.test(name)) return { clock: clock || undefined, detail: 'Prodloužení' };
  return { clock: clock || undefined };
}

/** Odpověď scoreboardu ESPN → živé stavy podle id zápasu (`nba:<id>` / `football:<id>`). Nevalidní vstup → prázdná mapa. */
export function parseEspnLive(json: unknown, sport: LiveSport, now: number = Date.now()): Map<string, LiveState> {
  const out = new Map<string, LiveState>();
  const events = rec(json)?.events;
  if (!Array.isArray(events)) return out;
  for (const raw of events) {
    const e = rec(raw);
    if (!e || e.id == null || e.id === '') continue;
    const status = rec(e.status);
    const type = rec(status?.type);
    const espnState = typeof type?.state === 'string' ? type.state : '';
    const name = typeof type?.name === 'string' ? type.name.toUpperCase() : '';
    if (NO_LIVE.test(name)) continue;
    const matchId = `${sport}:${String(e.id)}`;
    if (espnState === 'pre') { out.set(matchId, { matchId, phase: 'pre', updatedAt: now }); continue; }
    if (espnState !== 'in' && espnState !== 'post') continue;

    const competitors = rec((Array.isArray(e.competitions) ? e.competitions : [])[0])?.competitors;
    let home: number | undefined;
    let away: number | undefined;
    for (const c of Array.isArray(competitors) ? competitors : []) {
      const cc = rec(c);
      if (cc?.homeAway === 'home') home = toScore(cc.score);
      else if (cc?.homeAway === 'away') away = toScore(cc.score);
    }
    const period = typeof status?.period === 'number' ? status.period : 0;
    const displayClock = typeof status?.displayClock === 'string' ? status.displayClock : '';
    const d = describe(name, espnState, sport, period, displayClock);
    const s: LiveState = { matchId, phase: espnState === 'in' ? 'live' : 'post', updatedAt: now };
    if (home !== undefined) s.home = home;
    if (away !== undefined) s.away = away;
    if (d.clock) s.clock = d.clock;
    if (d.detail) s.detail = d.detail;
    out.set(matchId, s);
  }
  return out;
}

/* ---------- kandidáti a feedy ---------- */

/** Zápas, pro který existuje živý zdroj (NBA a fotbal z ESPN; česká liga ne). */
export function isLiveCapable(m: Match): boolean {
  if (m.sport === 'nba') return /^nba:\d+$/.test(m.id);
  if (m.sport === 'football') return /^football:\d+$/.test(m.id) && !!m.competitionId && FOOTBALL_LIVE.has(m.competitionId) && !!competitionById(m.competitionId);
  return false;
}

/** Zápasy, u kterých má smysl se ptát na živé skóre: start v [now − 4 h, now + 15 min], bez uloženého výsledku. */
export function liveCandidates(matches: readonly Match[], now: number): Match[] {
  return matches.filter((m) => {
    if (m.result || !isLiveCapable(m)) return false;
    const t = Date.parse(m.startsAt);
    return Number.isFinite(t) && t >= now - LIVE_AFTER_MS && t <= now + LIVE_BEFORE_MS;
  });
}

export interface LiveFeed { key: string; url: string; sport: LiveSport; matchIds: string[] }

const ymd = (key: string) => key.replace(/-/g, '');

/** Feedy ke stažení: NBA po dnech (UTC i východoamerický, podle něj ESPN zápasy řadí), fotbal po (soutěž, UTC den). */
export function buildFeeds(candidates: readonly Match[]): LiveFeed[] {
  const feeds = new Map<string, LiveFeed>();
  const add = (url: string, sport: LiveSport, id: string) => {
    const f = feeds.get(url);
    if (!f) feeds.set(url, { key: url, url, sport, matchIds: [id] });
    else if (!f.matchIds.includes(id)) f.matchIds.push(id);
  };
  for (const m of candidates) {
    if (m.sport === 'nba') {
      const days = new Set([dayKey(m.startsAt, 'UTC'), dayKey(m.startsAt, 'America/New_York')]);
      for (const d of days) add(`${ESPN}basketball/nba/scoreboard?dates=${ymd(d)}`, 'nba', m.id);
    } else if (m.sport === 'football' && m.competitionId) {
      add(`${ESPN}soccer/${m.competitionId}/scoreboard?dates=${ymd(dayKey(m.startsAt, 'UTC'))}`, 'football', m.id);
    }
  }
  return [...feeds.values()];
}

/** Prodleva před dalším dotazem: základ × 2^selhání, nejvýš 5 min. */
export function backoffDelay(base: number, failures: number): number {
  return Math.min(base * 2 ** Math.max(0, failures), MAX_BACKOFF_MS);
}

/* ---------- zobrazení ---------- */

/** Jeden řádek pod skóre: hodiny a/nebo popisek ('96\' · Prodloužení', 'Poločas', 'Konec'). */
export function formatLiveClock(s: LiveState): string {
  return [s.clock, s.detail].filter(Boolean).join(' · ');
}

/** Které číslo se oproti předchozímu stavu změnilo (první hodnota ani chybějící předchozí skóre nejsou změna). */
export function scoreChanges(prev: LiveState | undefined, next: LiveState): { home: boolean; away: boolean } {
  const ch = (a?: number, b?: number) => a !== undefined && b !== undefined && a !== b;
  return { home: ch(prev?.home, next.home), away: ch(prev?.away, next.away) };
}

/** Stejný stav bez ohledu na `updatedAt` (aby se zbytečně nepřekresloval). */
export function sameLive(a: LiveState, b: LiveState): boolean {
  return a.matchId === b.matchId && a.phase === b.phase && a.home === b.home && a.away === b.away && a.clock === b.clock && a.detail === b.detail;
}
