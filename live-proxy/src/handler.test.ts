import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHandler, type Deps } from './handler';

const fx = (n: string) => readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-12T18:30:00Z'); // 14:30 v New Yorku, 20:30 v Praze
const ORIGIN = 'https://tuceksimonwrk.github.io';

/** Minimální Cache API v paměti (match/put podle URL). */
class MemCache {
  store = new Map<string, Response>();
  async match(req: RequestInfo | URL) { const r = this.store.get(String(req instanceof Request ? req.url : req)); return r?.clone(); }
  async put(req: RequestInfo | URL, res: Response) { this.store.set(String(req instanceof Request ? req.url : req), res.clone()); }
}

let now = NOW;
let cache: MemCache;
let upstream: ReturnType<typeof vi.fn>;
let waits: Promise<unknown>[];
const ctx = { waitUntil: (p: Promise<unknown>) => { waits.push(p); } };

function make(routes: Record<string, () => Response | Promise<Response>>) {
  upstream = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const r = routes[url];
    if (!r) throw new Error(`unexpected upstream ${url}`);
    return r();
  });
  const deps: Deps = { fetch: upstream as unknown as typeof fetch, cache: cache as unknown as Cache, now: () => now };
  return createHandler(deps);
}
const get = (h: ReturnType<typeof createHandler>, path: string, init: RequestInit & { origin?: string } = {}, env = {}) => {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set('Origin', init.origin);
  return h(new Request(`https://sportradar-live.example.workers.dev${path}`, { ...init, headers }), env, ctx);
};
const json = (body: string, status = 200) => () => new Response(body, { status, headers: { 'content-type': 'application/json' } });

const NHL_TODAY = 'https://api-web.nhle.com/v1/score/2026-10-12';

beforeEach(() => { now = NOW; cache = new MemCache(); waits = []; });

describe('routing, methods, CORS', () => {
  it('/health answers without upstream calls', async () => {
    const h = make({});
    const r = await get(h, '/health', { origin: ORIGIN });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, sources: ['nhl', 'elh', 'nbl'] });
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(r.headers.get('vary')).toMatch(/Origin/);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('disallowed origin gets no CORS header but still a response', async () => {
    const r = await get(make({}), '/health', { origin: 'https://evil.example' });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    expect(r.headers.get('vary')).toMatch(/Origin/);
  });
  it('ALLOWED_ORIGINS var overrides the default list', async () => {
    const h = make({});
    const env = { ALLOWED_ORIGINS: 'https://a.example, https://b.example' };
    expect((await get(h, '/health', { origin: 'https://b.example' }, env)).headers.get('access-control-allow-origin')).toBe('https://b.example');
    expect((await get(h, '/health', { origin: ORIGIN }, env)).headers.get('access-control-allow-origin')).toBeNull();
  });
  it('OPTIONS preflight', async () => {
    const r = await get(make({}), '/nhl', { method: 'OPTIONS', origin: 'http://localhost:5199' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5199');
    expect(r.headers.get('access-control-allow-methods')).toContain('GET');
  });
  it('405 for other methods, 404 for unknown paths (no generic proxying)', async () => {
    const h = make({});
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const r = await get(h, '/nhl', { method });
      expect(r.status).toBe(405);
      expect(r.headers.get('allow')).toBe('GET, OPTIONS');
    }
    for (const p of ['/', '/https://example.com', '/nhl/../admin', '/proxy?url=https://example.com']) {
      expect((await get(h, p)).status).toBe(404);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('validation', () => {
  it('rejects bad or far dates without touching upstream', async () => {
    const h = make({});
    for (const d of ['2026-13-01', '2026-02-30', '20261012', '2026-10-12/../x', '2026-10-12%2F..', '2025-10-12', 'x']) {
      const r = await get(h, `/nhl?date=${d}`);
      expect(r.status, d).toBe(400);
      expect(await r.json()).toEqual({ error: 'invalid date' });
    }
    expect((await get(h, '/elh?date=2026-11-30')).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('/nhl', () => {
  it('returns normalized schema from the real fixture, upstream gets project UA', async () => {
    const h = make({ [NHL_TODAY]: json(fx('nhl-2026-10-12-live.json')) });
    const r = await get(h, '/nhl?date=2026-10-12', { origin: ORIGIN });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(r.headers.get('cache-control')).toBe('public, max-age=10');
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const body = await r.json();
    expect(body.source).toBe('nhl');
    expect(Number.isFinite(Date.parse(body.fetchedAt))).toBe(true);
    expect(body.games[0]).toMatchObject({ id: 'nhl:2026020087', phase: 'live', homeScore: 2, awayScore: 1, clock: '2. třetina 19:55' });
    const [, init] = upstream.mock.calls[0];
    expect(new Headers(init.headers).get('user-agent')).toMatch(/sportradar-live/);
  });
  it('defaults to the US-Eastern day', async () => {
    const h = make({ [NHL_TODAY]: json(fx('nhl-2026-10-12-live.json')) });
    expect((await get(h, '/nhl')).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('after midnight in New York the default also includes the previous day', async () => {
    now = Date.parse('2026-10-13T05:00:00Z'); // 01:00 ET
    const h = make({
      'https://api-web.nhle.com/v1/score/2026-10-13': json('{"games":[]}'),
      [NHL_TODAY]: json(fx('nhl-2026-10-12-live.json')),
    });
    const body = await (await get(h, '/nhl')).json();
    expect(body.games.map((g: { id: string }) => g.id)).toContain('nhl:2026020089');
  });
});

describe('caching and upstream failures', () => {
  it('serves repeated requests from cache for 10 s, then refetches', async () => {
    const h = make({ [NHL_TODAY]: json(fx('nhl-2026-10-12-live.json')) });
    await get(h, '/nhl?date=2026-10-12');
    await Promise.all(waits);
    const second = await get(h, '/nhl?date=2026-10-12&junk=1', { origin: 'http://localhost:5173' });
    expect(second.headers.get('x-cache')).toBe('HIT');
    expect(second.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(upstream).toHaveBeenCalledTimes(1);
    now += 11_000;
    expect((await get(h, '/nhl?date=2026-10-12')).headers.get('x-cache')).toBe('MISS');
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('shares the edge cache between isolates (fresh handler, same Cache)', async () => {
    const h1 = make({ [NHL_TODAY]: json(fx('nhl-2026-10-12-live.json')) });
    await get(h1, '/nhl?date=2026-10-12');
    await Promise.all(waits);
    const h2 = make({});
    const r = await get(h2, '/nhl?date=2026-10-12');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-cache')).toBe('HIT');
  });
  it('coalesces concurrent misses into one upstream call', async () => {
    const h = make({ [NHL_TODAY]: json(fx('nhl-2026-10-12-live.json')) });
    await Promise.all([get(h, '/nhl?date=2026-10-12'), get(h, '/nhl?date=2026-10-12'), get(h, '/nhl?date=2026-10-12')]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it('502 JSON without details when upstream fails and nothing is cached', async () => {
    const h = make({ [NHL_TODAY]: json('oops', 500) });
    const r = await get(h, '/nhl?date=2026-10-12', { origin: ORIGIN });
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'upstream unavailable' });
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });
  it('serves a stale copy up to 60 s when upstream fails, then 502', async () => {
    let fail = false;
    const h = make({ [NHL_TODAY]: () => (fail ? Promise.reject(new Error('boom')) : json(fx('nhl-2026-10-12-live.json'))()) });
    await get(h, '/nhl?date=2026-10-12');
    fail = true;
    now += 30_000;
    const stale = await get(h, '/nhl?date=2026-10-12');
    expect(stale.status).toBe(200);
    expect(stale.headers.get('x-cache')).toBe('STALE');
    now += 40_000;
    expect((await get(h, '/nhl?date=2026-10-12')).status).toBe(502);
  });
  it('rejects oversized and non-JSON upstream bodies', async () => {
    const big = 'x'.repeat(3 * 1024 * 1024);
    const h = make({ [NHL_TODAY]: json(big) });
    expect((await get(h, '/nhl?date=2026-10-12')).status).toBe(502);
  });
  it('times out a hanging upstream', async () => {
    vi.useFakeTimers({ now: NOW, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const h = make({
        [NHL_TODAY]: () => new Promise<Response>(() => { /* nikdy */ }),
      });
      const p = get(h, '/nhl?date=2026-10-12');
      await vi.advanceTimersByTimeAsync(8_100);
      expect((await p).status).toBe(502);
    } finally { vi.useRealTimers(); }
  });
});

describe('/elh and /nbl', () => {
  it('/elh uses the Prague day and maps the real scoreboard', async () => {
    now = Date.parse('2026-10-11T19:00:00Z');
    const h = make({ 'https://json.esports.cz/hokejcz/scoreboard/2026-10-11.json': json(fx('elh-2026-10-11.json')) });
    const body = await (await get(h, '/elh')).json();
    expect(body.source).toBe('elh');
    expect(body.games).toHaveLength(7);
    expect(body.games[0].id).toBe('cz-hockey:2928321');
  });
  it('/elh: a day without matches (404 upstream) is an empty list, not an error', async () => {
    const h = make({ 'https://json.esports.cz/hokejcz/scoreboard/2026-10-12.json': json('<html>404</html>', 404) });
    const r = await get(h, '/elh?date=2026-10-12');
    expect(r.status).toBe(200);
    expect((await r.json()).games).toEqual([]);
  });
  it('/nbl combines the schedule and FIBA LiveStats', async () => {
    now = Date.parse('2026-10-10T11:30:00Z'); // 13:30 v Praze, zápas 2899969 začal ve 12:00
    const h = make({
      'https://www.nbl.basketball/zapasy': () => new Response(fx('nbl-zapasy.html'), { headers: { 'content-type': 'text/html' } }),
      'https://fibalivestats.dcd.shared.geniussports.com/data/2899969/data.json': json(fx('fiba-2899969-final.json')),
    });
    const body = await (await get(h, '/nbl')).json();
    expect(body.source).toBe('nbl');
    expect(body.games).toEqual([
      { home: 'SK Slavia Praha ERA NBK', away: 'BK KVIS Pardubice', startsAt: '2026-10-10T10:00:00.000Z', phase: 'post', homeScore: 105, awayScore: 60, detail: 'Konec' },
    ]);
  });
  it('/nbl: FIBA 403 for a game that has not started yet is just "pre"', async () => {
    now = Date.parse('2026-10-14T15:20:00Z');
    const h = make({
      'https://www.nbl.basketball/zapasy': () => new Response(fx('nbl-zapasy.html')),
      'https://fibalivestats.dcd.shared.geniussports.com/data/2906538/data.json': json('{"message":"Forbidden"}', 403),
    });
    const body = await (await get(h, '/nbl')).json();
    expect(body.games).toEqual([{ home: 'BK KVIS Pardubice', away: 'BK Olomoucko', startsAt: '2026-10-14T15:30:00.000Z', phase: 'pre' }]);
  });
  it('/nbl: schedule failure is a 502', async () => {
    const h = make({ 'https://www.nbl.basketball/zapasy': json('down', 503) });
    expect((await get(h, '/nbl')).status).toBe(502);
  });
});
