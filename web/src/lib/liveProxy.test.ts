import { describe, expect, it, vi } from 'vitest';
import type { Match } from '@sportradar/shared';
import { buildFeeds, isLiveCapable, liveCandidates } from './live';
import { liveFootnote, loadLiveConfig, mapProxyFeed, namesMatch, parseLiveConfig, proxyHealthy } from './liveProxy';

const NOW = Date.parse('2026-10-12T18:30:00Z');
const PROXY = 'https://sportradar-live.example.workers.dev';
const mk = (id: string, sport: Match['sport'], startsAt: string, extra: Partial<Match> = {}): Match => ({
  id, sport, competition: 'x', startsAt, title: 'A – B', teams: [], broadcasters: [], ...extra,
});
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();
const nbl = (id: string, start: string, home: string, away: string, homeName = '', awayName = '') =>
  mk(id, 'cz-basket', start, { teams: [`cz-basket:${home}`, `cz-basket:${away}`], title: `${homeName || home} – ${awayName || away}` });

describe('parseLiveConfig', () => {
  it('accepts https and local http proxy URLs, strips trailing slash', () => {
    expect(parseLiveConfig({ proxyUrl: `${PROXY}/` })).toBe(PROXY);
    expect(parseLiveConfig({ proxyUrl: 'http://127.0.0.1:8787' })).toBe('http://127.0.0.1:8787');
    expect(parseLiveConfig({ proxyUrl: 'http://localhost:8787/' })).toBe('http://localhost:8787');
  });
  it('empty, missing or unsafe values switch the proxy off', () => {
    for (const v of [{ proxyUrl: '' }, {}, null, 'x', { proxyUrl: 'http://example.com' }, { proxyUrl: 'javascript:alert(1)' },
      { proxyUrl: 'https://user:pw@example.com' }, { proxyUrl: 'https://example.com/?a=1' }, { proxyUrl: 42 }]) {
      expect(parseLiveConfig(v)).toBeUndefined();
    }
  });
  it('loadLiveConfig: network/HTTP/JSON failure is silent and means off', async () => {
    expect(await loadLiveConfig(vi.fn().mockRejectedValue(new Error('offline')))).toBeUndefined();
    expect(await loadLiveConfig(vi.fn().mockResolvedValue(new Response('nope', { status: 404 })))).toBeUndefined();
    expect(await loadLiveConfig(vi.fn().mockResolvedValue(new Response('{bad')))).toBeUndefined();
    const ok = vi.fn().mockResolvedValue(new Response(JSON.stringify({ proxyUrl: PROXY })));
    expect(await loadLiveConfig(ok)).toBe(PROXY);
    expect(ok.mock.calls[0][0]).toBe('./live-config.json');
  });
  it('proxyHealthy: only a 200 {ok:true} from /health counts', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    expect(await proxyHealthy(PROXY, f)).toBe(true);
    expect(f.mock.calls[0][0]).toBe(`${PROXY}/health`);
    expect(await proxyHealthy(PROXY, vi.fn().mockResolvedValue(new Response('{"ok":false}')))).toBe(false);
    expect(await proxyHealthy(PROXY, vi.fn().mockRejectedValue(new Error('cors')))).toBe(false);
  });
});

describe('candidates and feeds with the proxy', () => {
  const nhl = mk('nhl:2026020088', 'nhl', iso(-30));
  const elh = mk('cz-hockey:2928329', 'cz-hockey', iso(-30));
  const bas = nbl('cz-basket:74-bk-kvis-pardubice', iso(-30), 'bk-kvis-pardubice', 'bk-olomoucko');
  it('without a proxy NHL/ELH/NBL are not live-capable (no requests)', () => {
    for (const m of [nhl, elh, bas]) expect(isLiveCapable(m)).toBe(false);
    expect(liveCandidates([nhl, elh, bas], NOW)).toEqual([]);
    expect(buildFeeds([nhl, elh, bas])).toEqual([]);
  });
  it('with a proxy they are, inside the same window', () => {
    const opts = { proxyUrl: PROXY };
    expect([nhl, elh, bas].every((m) => isLiveCapable(m, opts))).toBe(true);
    expect(isLiveCapable(mk('nhl:abc', 'nhl', iso(0)), opts)).toBe(false);
    expect(isLiveCapable(mk('cz-hockey:x', 'cz-hockey', iso(0)), opts)).toBe(false);
    expect(isLiveCapable(mk('cz-basket:1', 'cz-basket', iso(0)), opts)).toBe(false); // bez týmů nelze párovat
    expect(isLiveCapable(mk('f1:1', 'f1', iso(0)), opts)).toBe(false);
    const late = mk('nhl:1', 'nhl', iso(-241));
    const soon = mk('nhl:2', 'nhl', iso(16));
    expect(liveCandidates([nhl, elh, bas, late, soon], NOW, opts).map((m) => m.id)).toEqual([nhl.id, elh.id, bas.id]);
  });
  it('one feed per source (NHL by US-Eastern day, ELH by Prague day, NBL single)', () => {
    const nhl2 = mk('nhl:2026020089', 'nhl', '2026-10-13T00:00:00.000Z'); // 20:00 ET 12. 10.
    const bas2 = nbl('cz-basket:75-x', iso(-10), 'nh-ostrava', 'usk-praha');
    const feeds = buildFeeds([nhl, nhl2, elh, bas, bas2], { proxyUrl: PROXY });
    expect(feeds.map((f) => [f.sport, f.url, f.matchIds])).toEqual([
      ['proxy:nhl', `${PROXY}/nhl?date=2026-10-12`, [nhl.id, nhl2.id]],
      ['proxy:elh', `${PROXY}/elh?date=2026-10-12`, [elh.id]],
      ['proxy:nbl', `${PROXY}/nbl`, [bas.id, bas2.id]],
    ]);
    expect(feeds.every((f) => f.key === f.url)).toBe(true);
  });
  it('ESPN feeds are unchanged next to proxy feeds', () => {
    const nba = mk('nba:1', 'nba', '2026-10-12T20:00:00.000Z');
    const feeds = buildFeeds([nba, nhl], { proxyUrl: PROXY });
    expect(feeds.map((f) => f.sport)).toEqual(['nba', 'proxy:nhl']);
    expect(feeds[0].url).toBe('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261012');
  });
});

describe('namesMatch', () => {
  it('slug, club prefix and word containment tolerant', () => {
    expect(namesMatch('BK KVIS Pardubice', 'bk-kvis-pardubice')).toBe(true);
    expect(namesMatch('KVIS Pardubice', 'BK KVIS Pardubice')).toBe(true);
    expect(namesMatch('SK Slavia Praha ERA NBK', 'Slavia Praha')).toBe(true);
    expect(namesMatch('Sršni Photomate Písek', 'srsni-photomate-pisek')).toBe(true);
    expect(namesMatch('BK Opava', 'BK Olomoucko')).toBe(false);
    expect(namesMatch('USK Praha', 'SK Slavia Praha ERA NBK')).toBe(false);
    expect(namesMatch('', 'x')).toBe(false);
  });
});

describe('mapProxyFeed', () => {
  const feed = (source: string, games: unknown[]) => ({ source, fetchedAt: '2026-10-12T18:30:00Z', games });
  it('NHL / ELH: by id; pre without score; live with clock and detail', () => {
    const states = mapProxyFeed(feed('nhl', [
      { id: 'nhl:2026020087', home: 'Sabres', away: 'Panthers', homeScore: 2, awayScore: 1, phase: 'live', clock: '2. třetina 15:36' },
      { id: 'nhl:2026020088', home: 'Devils', away: 'Senators', phase: 'pre' },
      { id: 'cz-hockey:1', home: 'x', away: 'y', phase: 'live' }, // cizí prefix z jiného zdroje se ignoruje
    ]), [], NOW);
    expect(states.get('nhl:2026020087')).toEqual({ matchId: 'nhl:2026020087', phase: 'live', home: 2, away: 1, clock: '2. třetina 15:36', updatedAt: NOW });
    expect(states.get('nhl:2026020088')).toEqual({ matchId: 'nhl:2026020088', phase: 'pre', updatedAt: NOW });
    expect(states.size).toBe(2);
    const elh = mapProxyFeed(feed('elh', [{ id: 'cz-hockey:2928321', home: 'A', away: 'B', homeScore: 3, awayScore: 0, phase: 'post', detail: 'Konec' }]), [], NOW);
    expect(elh.get('cz-hockey:2928321')).toMatchObject({ phase: 'post', home: 3, away: 0, detail: 'Konec' });
  });
  it('NBL: by team names and the same Prague day', () => {
    const m1 = nbl('cz-basket:74-bk-kvis-pardubice', '2026-10-14T15:30:00.000Z', 'bk-kvis-pardubice', 'bk-olomoucko', 'BK KVIS Pardubice', 'BK Olomoucko');
    const m2 = nbl('cz-basket:80-bk-olomoucko', '2026-10-21T15:30:00.000Z', 'bk-olomoucko', 'bk-kvis-pardubice'); // odveta, jiný den
    const states = mapProxyFeed(feed('nbl', [
      { home: 'BK KVIS Pardubice', away: 'BK Olomoucko', homeScore: 41, awayScore: 38, phase: 'live', clock: '2. čtvrtina 4:05', startsAt: '2026-10-14T15:30:00.000Z' },
      { home: 'BK Olomoucko', away: 'BK KVIS Pardubice', phase: 'pre', startsAt: '2026-10-14T18:00:00.000Z' }, // obrácené pořadí ≠ m2 (jiný den)
      { home: 'NH Ostrava', away: 'USK Praha', phase: 'live', homeScore: 1, awayScore: 0 }, // nic neodpovídá
    ]), [m1, m2], NOW);
    expect([...states.keys()]).toEqual([m1.id]);
    expect(states.get(m1.id)).toMatchObject({ phase: 'live', home: 41, away: 38, clock: '2. čtvrtina 4:05' });
  });
  it('invalid payload → empty map', () => {
    expect(mapProxyFeed({ error: 'upstream unavailable' }, [], NOW).size).toBe(0);
    expect(mapProxyFeed(null, [], NOW).size).toBe(0);
  });
});

describe('liveFootnote', () => {
  it('mentions the proxy sources only when it is configured and healthy', () => {
    expect(liveFootnote(false)).toBe('Živé skóre: NBA a fotbal (ESPN). Ostatní soutěže ho zatím nemají.');
    expect(liveFootnote(true)).toBe('Živé skóre: NBA a fotbal (ESPN) + NHL, extraliga, NBL (přes vlastní proxy).');
  });
});
