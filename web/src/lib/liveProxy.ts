import { parseLiveFeed, type Match } from '@sportradar/shared';
import type { LiveState } from './live';
import { dayKey } from './time';

/**
 * Vlastní proxy pro živé skóre NHL, extraligy a NBL (Cloudflare Worker `live-proxy/`).
 * Adresa je v `live-config.json` vedle stránky; prázdná/chybějící = funkce vypnutá (žádné dotazy).
 */
export const LIVE_CONFIG_URL = './live-config.json';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `{ proxyUrl }` → normalizovaná adresa (https, nebo http jen na localhostu; bez přihlašovacích údajů, dotazu a #). */
export function parseLiveConfig(json: unknown): string | undefined {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return undefined;
  const raw = (json as Record<string, unknown>).proxyUrl;
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 300) return undefined;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return undefined; }
  const okProto = u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname));
  if (!okProto || u.username || u.password || u.search || u.hash) return undefined;
  return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Jednou při startu: chyba sítě/HTTP/JSON = proxy vypnutá, nic se nehlásí. */
export async function loadLiveConfig(f: FetchFn = (u, i) => fetch(u, i)): Promise<string | undefined> {
  try {
    const r = await f(LIVE_CONFIG_URL, { cache: 'no-cache', credentials: 'omit' });
    if (!r.ok) return undefined;
    return parseLiveConfig(await r.json());
  } catch { return undefined; }
}

/** `/health` proxy odpovídá `{ ok: true }`. */
export async function proxyHealthy(proxyUrl: string, f: FetchFn = (u, i) => fetch(u, i)): Promise<boolean> {
  try {
    const r = await f(`${proxyUrl}/health`, { credentials: 'omit' });
    if (!r.ok) return false;
    const j = (await r.json()) as { ok?: unknown };
    return j?.ok === true;
  } catch { return false; }
}

/* ---------- párování NBL podle jmen ---------- */

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const CLUB_PREFIX = /^(hc|bk|hk|sk|fk|bc|nh)-(?=.)/;
const bare = (s: string) => s.replace(CLUB_PREFIX, '');
const hasWords = (long: string, short: string) => short.length >= 5 && `-${long}-`.includes(`-${short}-`);

/** Stejný tým? Shoda slugu, shoda bez klubového prefixu (bk-, sk-…) nebo obsažení celých slov (jako matchTeamId v pipeline). */
export function namesMatch(a: string, b: string): boolean {
  const x = slug(a);
  const y = slug(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const bx = bare(x);
  const by = bare(y);
  if (bx === by) return true;
  return bx.length >= by.length ? hasWords(bx, by) : hasWords(by, bx);
}

/** Jména stran zápasu: z id týmů (slug) i z titulku „Domácí – Hosté“. */
function sideNames(m: Match): [string[], string[]] {
  const t = m.title.split(' – ');
  const ids = m.teams.map((id) => id.replace(/^[^:]+:/, ''));
  return [[ids[0], t[0]].filter(Boolean), [ids[1], t[1]].filter(Boolean)];
}

/* ---------- odpověď proxy → živé stavy ---------- */

const ID_PREFIX = { nhl: /^nhl:\d+$/, elh: /^cz-hockey:\d+$/ } as const;

/**
 * Odpověď proxy → živé stavy podle id zápasu. NHL a extraliga podle `id`,
 * NBL podle jmen domácích/hostů a stejného (pražského) dne mezi `matches` (kandidáty feedu).
 */
export function mapProxyFeed(json: unknown, matches: readonly Match[], now: number = Date.now()): Map<string, LiveState> {
  const out = new Map<string, LiveState>();
  const feed = parseLiveFeed(json);
  if (!feed) return out;
  for (const g of feed.games) {
    let matchId: string | undefined;
    if (feed.source === 'nbl') {
      const day = g.startsAt ? dayKey(g.startsAt, 'Europe/Prague') : undefined;
      matchId = matches.find((m) => {
        if (m.sport !== 'cz-basket' || (day && dayKey(m.startsAt, 'Europe/Prague') !== day)) return false;
        const [home, away] = sideNames(m);
        return home.some((n) => namesMatch(g.home, n)) && away.some((n) => namesMatch(g.away, n));
      })?.id;
    } else if (g.id && ID_PREFIX[feed.source].test(g.id)) {
      matchId = g.id;
    }
    if (!matchId || out.has(matchId)) continue;
    const s: LiveState = { matchId, phase: g.phase, updatedAt: now };
    if (g.phase !== 'pre') {
      if (g.homeScore !== undefined) s.home = g.homeScore;
      if (g.awayScore !== undefined) s.away = g.awayScore;
      if (g.clock) s.clock = g.clock;
      if (g.detail) s.detail = g.detail;
    }
    out.set(matchId, s);
  }
  return out;
}

/** Poznámka v patičce. */
export function liveFootnote(proxyOk: boolean): string {
  return proxyOk
    ? 'Živé skóre: NBA a fotbal (ESPN) + NHL, extraliga, NBL (přes vlastní proxy).'
    : 'Živé skóre: NBA a fotbal (ESPN). Ostatní soutěže ho zatím nemají.';
}
