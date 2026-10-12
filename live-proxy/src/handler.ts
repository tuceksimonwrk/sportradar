import type { LiveFeed, LiveFeedSource, LiveGame } from '@sportradar/shared/src/live-feed';
import { elhUrl, parseElhScoreboard } from './elh';
import { nhlUrl, parseNhlScore } from './nhl';
import { NBL_SCHEDULE_URL, fibaUrl, nblGames, parseFiba, parseNblSchedule } from './nbl';
import { isIsoDay, shiftDay, zonedDay, zonedHour } from './time';
import { fetchUpstream, parseJson } from './upstream';

export interface Env { ALLOWED_ORIGINS?: string }
export interface Ctx { waitUntil(p: Promise<unknown>): void }
export interface Deps {
  fetch: typeof fetch;
  /** `caches.default` na Cloudflare; null = jen paměť izolátu. */
  cache?: Cache | null;
  now?: () => number;
}

export const DEFAULT_ORIGINS = 'https://tuceksimonwrk.github.io,http://localhost:5173,http://localhost:5199';
const FRESH_MS = 10_000;
const STALE_MS = 60_000;
const MAX_DAY_DISTANCE_MS = 4 * 86400_000;
const MEMORY_MAX = 64;
const KB = 1024;

interface Entry { body: string; at: number }

const SOURCES: LiveFeedSource[] = ['nhl', 'elh', 'nbl'];

function allowedOrigin(req: Request, env: Env): string | undefined {
  const origin = req.headers.get('origin');
  if (!origin) return undefined;
  const list = (env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : undefined;
}

function respond(req: Request, env: Env, status: number, body: string | null, extra: Record<string, string> = {}): Response {
  const h = new Headers({ vary: 'Origin', 'x-content-type-options': 'nosniff', ...extra });
  if (body !== null) h.set('content-type', 'application/json; charset=utf-8');
  const origin = allowedOrigin(req, env);
  if (origin) h.set('access-control-allow-origin', origin);
  return new Response(body, { status, headers: h });
}
const error = (req: Request, env: Env, status: number, msg: string, extra: Record<string, string> = {}) =>
  respond(req, env, status, JSON.stringify({ error: msg }), { 'cache-control': 'no-store', ...extra });

class BadRequest extends Error {}

/** Datum z dotazu: jen 'YYYY-MM-DD', reálný den a nejvýš 4 dny od dneška (žádné obcházení cache). */
function dayParam(url: URL, fallback: string, now: number): string {
  const raw = url.searchParams.get('date');
  if (raw === null || raw === '') return fallback;
  if (!isIsoDay(raw) || Math.abs(Date.parse(`${raw}T12:00:00Z`) - now) > MAX_DAY_DISTANCE_MS) throw new BadRequest('invalid date');
  return raw;
}

interface Plan { key: string; load: () => Promise<LiveGame[]> }

export function createHandler(deps: Deps) {
  const now = deps.now ?? Date.now;
  const memory = new Map<string, Entry>();
  const inflight = new Map<string, Promise<Entry>>();

  const remember = (key: string, e: Entry) => {
    memory.delete(key);
    memory.set(key, e);
    while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value as string);
  };

  async function json(url: string, maxBytes: number, okStatuses?: number[]): Promise<unknown | undefined> {
    const r = await fetchUpstream(deps.fetch, url, { maxBytes, okStatuses });
    return r.status >= 200 && r.status < 300 ? parseJson(r.text) : undefined;
  }

  function plan(path: string, url: URL, origin: string): Plan | undefined {
    const t = now();
    if (path === '/nhl') {
      const today = zonedDay(t, 'America/New_York');
      const explicit = url.searchParams.get('date');
      const day = dayParam(url, today, t);
      // po půlnoci v New Yorku ještě můžou běžet včerejší zápasy
      const days = explicit || zonedHour(t, 'America/New_York') >= 6 ? [day] : [shiftDay(day, -1), day];
      return {
        key: `${origin}/nhl?date=${days.join(',')}`,
        load: async () => {
          const parts = await Promise.all(days.map(async (d) => parseNhlScore(await json(nhlUrl(d), 2048 * KB))));
          const seen = new Set<string>();
          return parts.flat().filter((g) => (g.id && !seen.has(g.id) ? (seen.add(g.id), true) : false));
        },
      };
    }
    if (path === '/elh') {
      const day = dayParam(url, zonedDay(t, 'Europe/Prague'), t);
      return {
        key: `${origin}/elh?date=${day}`,
        load: async () => parseElhScoreboard(await json(elhUrl(day), 1024 * KB, [404])),
      };
    }
    if (path === '/nbl') {
      return {
        key: `${origin}/nbl`,
        load: async () => {
          const html = (await fetchUpstream(deps.fetch, NBL_SCHEDULE_URL, { maxBytes: 3072 * KB, accept: 'text/html' })).text;
          const rows = parseNblSchedule(html);
          return nblGames(rows, now(), async (id) => {
            if (!/^\d{4,12}$/.test(id)) return undefined;
            const r = await fetchUpstream(deps.fetch, fibaUrl(id), { maxBytes: 6144 * KB, referer: 'https://www.fibalivestats.com/', okStatuses: [403, 404] });
            return r.status === 200 ? parseFiba(parseJson(r.text)) : undefined;
          });
        },
      };
    }
    return undefined;
  }

  async function fromCache(key: string): Promise<Entry | undefined> {
    if (!deps.cache) return undefined;
    try {
      const r = await deps.cache.match(key);
      if (!r) return undefined;
      const at = Number(r.headers.get('x-fetched-at'));
      return Number.isFinite(at) ? { body: await r.text(), at } : undefined;
    } catch { return undefined; }
  }

  async function refresh(source: LiveFeedSource, p: Plan, ctx?: Ctx): Promise<Entry> {
    let pending = inflight.get(p.key);
    if (!pending) {
      pending = (async () => {
        const games = await p.load();
        const at = now();
        const feed: LiveFeed = { source, fetchedAt: new Date(at).toISOString(), games };
        const e = { body: JSON.stringify(feed), at };
        remember(p.key, e);
        if (deps.cache) {
          const put = deps.cache.put(p.key, new Response(e.body, {
            headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${STALE_MS / 1000}`, 'x-fetched-at': String(at) },
          })).catch(() => {});
          if (ctx) ctx.waitUntil(put); else await put;
        }
        return e;
      })();
      inflight.set(p.key, pending);
      pending.then(() => inflight.delete(p.key), () => inflight.delete(p.key));
    }
    return pending;
  }

  return async function handle(req: Request, env: Env, ctx?: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') {
      return respond(req, env, 204, null, {
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-max-age': '86400',
        ...(req.headers.get('access-control-request-headers') && { 'access-control-allow-headers': 'Content-Type' }),
      });
    }
    if (req.method !== 'GET') return error(req, env, 405, 'method not allowed', { allow: 'GET, OPTIONS' });

    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/health') {
      return respond(req, env, 200, JSON.stringify({ ok: true, service: 'sportradar-live', sources: SOURCES, time: new Date(now()).toISOString() }), { 'cache-control': 'no-store' });
    }
    const source = SOURCES.find((s) => `/${s}` === path);
    if (!source) return error(req, env, 404, 'not found');

    let p: Plan | undefined;
    try { p = plan(path, url, url.origin); } catch (e) {
      if (e instanceof BadRequest) return error(req, env, 400, e.message);
      throw e;
    }
    if (!p) return error(req, env, 404, 'not found');

    const ok = (e: Entry, state: string) => respond(req, env, 200, e.body, { 'cache-control': `public, max-age=${FRESH_MS / 1000}`, 'x-cache': state });
    const t = now();
    let mem = memory.get(p.key);
    if (mem && t - mem.at < FRESH_MS) return ok(mem, 'HIT');
    const edge = await fromCache(p.key);
    if (edge && t - edge.at < FRESH_MS) { remember(p.key, edge); return ok(edge, 'HIT'); }
    try {
      return ok(await refresh(source, p, ctx), 'MISS');
    } catch {
      mem = memory.get(p.key);
      const stale = [mem, edge].filter((e): e is Entry => !!e && now() - e.at < STALE_MS).sort((a, b) => b.at - a.at)[0];
      if (stale) return ok(stale, 'STALE');
      return error(req, env, 502, 'upstream unavailable');
    }
  };
}
