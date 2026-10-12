/**
 * Normalizovaný výstup vlastní proxy (Cloudflare Worker `live-proxy/`) pro živé skóre
 * NHL, české extraligy a NBL. Sdílí ho Worker i webový klient.
 */
export type LiveFeedSource = 'nhl' | 'elh' | 'nbl';
export type LiveGamePhase = 'pre' | 'live' | 'post';

export interface LiveGame {
  /** Id zápasu v naší aplikaci (`nhl:<gameId>`, `cz-hockey:<hokejId>`); NBL ho nemá (páruje se podle jmen). */
  id?: string;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  phase: LiveGamePhase;
  /** Např. '3. třetina 12:34', '2. čtvrtina 4:05'. */
  clock?: string;
  /** Např. 'Přestávka po 1. třetině', 'Prodloužení', 'Konec po nájezdech'. */
  detail?: string;
  /** ISO 8601 UTC, je-li známo. */
  startsAt?: string;
}

export interface LiveFeed {
  source: LiveFeedSource;
  fetchedAt: string;
  games: LiveGame[];
}

const PHASES = new Set<string>(['pre', 'live', 'post']);
const SOURCES = new Set<string>(['nhl', 'elh', 'nbl']);
const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const score = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1000;

/** Bezpečné přečtení odpovědi proxy: nevalidní hry se zahodí, nevalidní obálka → undefined. */
export function parseLiveFeed(json: unknown): LiveFeed | undefined {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const o = json as Record<string, unknown>;
  if (typeof o.source !== 'string' || !SOURCES.has(o.source) || !Array.isArray(o.games)) return undefined;
  const games: LiveGame[] = [];
  for (const raw of o.games.slice(0, 200)) {
    if (!raw || typeof raw !== 'object') continue;
    const g = raw as Record<string, unknown>;
    if (!str(g.home) || !str(g.away) || typeof g.phase !== 'string' || !PHASES.has(g.phase)) continue;
    const out: LiveGame = { home: g.home, away: g.away, phase: g.phase as LiveGamePhase };
    if (str(g.id, 80)) out.id = g.id;
    if (score(g.homeScore)) out.homeScore = g.homeScore;
    if (score(g.awayScore)) out.awayScore = g.awayScore;
    if (str(g.clock, 60)) out.clock = g.clock;
    if (str(g.detail, 80)) out.detail = g.detail;
    if (str(g.startsAt, 40) && Number.isFinite(Date.parse(g.startsAt))) out.startsAt = g.startsAt;
    games.push(out);
  }
  return { source: o.source as LiveFeedSource, fetchedAt: typeof o.fetchedAt === 'string' ? o.fetchedAt : '', games };
}
