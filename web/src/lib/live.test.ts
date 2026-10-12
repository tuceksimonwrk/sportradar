import { describe, expect, it } from 'vitest';
import type { Match } from '@sportradar/shared';
import {
  backoffDelay, buildFeeds, formatLiveClock, isLiveCapable, liveCandidates, parseEspnLive, sameLive, scoreChanges, type LiveState,
} from './live';

const NOW = 1_800_000_000_000;

function ev(id: string, status: { state: string; name: string; clock?: string; period?: number; detail?: string }, home?: unknown, away?: unknown, extra: object = {}) {
  return {
    id,
    status: { displayClock: status.clock ?? '0.0', period: status.period ?? 0, type: { name: status.name, state: status.state, detail: status.detail ?? '' } },
    competitions: [{ competitors: [{ homeAway: 'away', score: away }, { homeAway: 'home', score: home }] }],
    ...extra,
  };
}
const wrap = (...events: unknown[]) => ({ events });
const one = (e: unknown, sport: 'nba' | 'football' = 'nba') => parseEspnLive(wrap(e), sport, NOW).get(`${sport}:${(e as { id: string }).id}`);

describe('parseEspnLive - NBA', () => {
  it('před zápasem: phase pre bez skóre', () => {
    const s = one(ev('1', { state: 'pre', name: 'STATUS_SCHEDULED' }, '0', '0'));
    expect(s).toEqual({ matchId: 'nba:1', phase: 'pre', updatedAt: NOW });
  });
  it('probíhá: skóre ze stringů, domácí/hosté podle homeAway (ne podle pořadí)', () => {
    const s = one(ev('2', { state: 'in', name: 'STATUS_IN_PROGRESS', clock: '5:42', period: 3 }, '71', '68'));
    expect(s).toMatchObject({ phase: 'live', home: 71, away: 68, clock: 'Q3 5:42' });
    expect(s?.detail).toBeUndefined();
  });
  it('zlomek sekundy v poslední minutě', () => {
    expect(one(ev('3', { state: 'in', name: 'STATUS_IN_PROGRESS', clock: '42.3', period: 4 }, '100', '99'))?.clock).toBe('Q4 42.3');
  });
  it('poločas', () => {
    const s = one(ev('4', { state: 'in', name: 'STATUS_HALFTIME', clock: '0.0', period: 2 }, '55', '50'));
    expect(s).toMatchObject({ phase: 'live', home: 55, away: 50, detail: 'Poločas' });
    expect(s?.clock).toBeUndefined();
  });
  it('konec čtvrtiny', () => {
    const s = one(ev('5', { state: 'in', name: 'STATUS_END_PERIOD', clock: '0.0', period: 1 }, '30', '28'));
    expect(s).toMatchObject({ phase: 'live', detail: 'Konec 1. čtvrtiny' });
  });
  it('prodloužení: OT, 2OT', () => {
    expect(one(ev('6', { state: 'in', name: 'STATUS_IN_PROGRESS', clock: '2:11', period: 5 }, '110', '110'))).toMatchObject({ clock: 'OT 2:11', detail: 'Prodloužení' });
    expect(one(ev('7', { state: 'in', name: 'STATUS_IN_PROGRESS', clock: '1:30', period: 6 }, '120', '120'))).toMatchObject({ clock: '2OT 1:30', detail: 'Prodloužení' });
  });
  it('konec zápasu', () => {
    const s = one(ev('8', { state: 'post', name: 'STATUS_FINAL', clock: '12:00', period: 4 }, '113', '124'));
    expect(s).toMatchObject({ phase: 'post', home: 113, away: 124, detail: 'Konec' });
    expect(s?.clock).toBeUndefined();
  });
  it('konec po prodloužení', () => {
    expect(one(ev('9', { state: 'post', name: 'STATUS_FINAL', period: 5 }, '120', '118'))?.detail).toBe('Konec po prodloužení');
  });
});

describe('parseEspnLive - fotbal', () => {
  const f = (id: string, state: string, name: string, clock: string, home: unknown, away: unknown, period = 1) =>
    one(ev(id, { state, name, clock, period }, home, away), 'football');
  it('první poločas', () => {
    expect(f('10', 'in', 'STATUS_FIRST_HALF', "23'", '1', '0')).toMatchObject({ matchId: 'football:10', phase: 'live', home: 1, away: 0, clock: "23'" });
  });
  it('nastavený čas zůstává', () => {
    expect(f('11', 'in', 'STATUS_SECOND_HALF', "90'+3'", '2', '2', 2)?.clock).toBe("90'+3'");
  });
  it('poločas', () => {
    const s = f('12', 'in', 'STATUS_HALFTIME', "45'", '1', '1');
    expect(s).toMatchObject({ phase: 'live', detail: 'Poločas' });
    expect(s?.clock).toBeUndefined();
  });
  it('prodloužení a penalty', () => {
    expect(f('13', 'in', 'STATUS_FIRST_EXTRA_TIME', "96'", '1', '1', 3)).toMatchObject({ phase: 'live', clock: "96'", detail: 'Prodloužení' });
    expect(f('14', 'in', 'STATUS_HALFTIME_ET', "105'", '1', '1', 3)).toMatchObject({ detail: 'Pauza v prodloužení' });
    expect(f('15', 'in', 'STATUS_SHOOTOUT', "120'", '1', '1', 5)).toMatchObject({ phase: 'live', detail: 'Penalty' });
  });
  it('konec: FT, po prodloužení, po penaltách', () => {
    expect(f('16', 'post', 'STATUS_FULL_TIME', "90'+5'", '3', '1', 2)).toMatchObject({ phase: 'post', home: 3, away: 1, detail: 'Konec' });
    expect(f('17', 'post', 'STATUS_FINAL_AET', "120'", '2', '1', 4)?.detail).toBe('Konec po prodloužení');
    expect(f('18', 'post', 'STATUS_FINAL_PEN', "120'", '1', '1', 5)?.detail).toBe('Konec po penaltách');
  });
});

describe('parseEspnLive - okrajové případy', () => {
  it('odložený / zrušený / opuštěný zápas nemá živý stav', () => {
    for (const name of ['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_CANCELLED', 'STATUS_ABANDONED', 'STATUS_FORFEIT']) {
      expect(parseEspnLive(wrap(ev('20', { state: 'post', name }, '0', '0')), 'nba', NOW).size).toBe(0);
    }
    expect(parseEspnLive(wrap(ev('21', { state: 'pre', name: 'STATUS_POSTPONED' }, '0', '0')), 'football', NOW).size).toBe(0);
  });
  it('přerušený zápas zůstává živý s popiskem', () => {
    expect(one(ev('22', { state: 'in', name: 'STATUS_SUSPENDED', clock: '30:00', period: 1 }, '1', '0'), 'football')).toMatchObject({ phase: 'live', detail: 'Přerušeno' });
  });
  it('chybějící skóre → bez čísel (ne 0, ne NaN)', () => {
    const s = one(ev('23', { state: 'in', name: 'STATUS_IN_PROGRESS', clock: '3:00', period: 1 }, undefined, ''));
    expect(s).toBeDefined();
    expect(s?.home).toBeUndefined();
    expect(s?.away).toBeUndefined();
  });
  it('číselné skóre i whitespace, nesmyslné hodnoty se zahodí', () => {
    const s = one(ev('24', { state: 'in', name: 'STATUS_IN_PROGRESS', clock: '3:00', period: 1 }, 7, ' 9 '));
    expect(s).toMatchObject({ home: 7, away: 9 });
    expect(one(ev('25', { state: 'in', name: 'STATUS_IN_PROGRESS', clock: '3:00', period: 1 }, 'abc', null))?.home).toBeUndefined();
  });
  it('neznámý state se ignoruje, chybějící status / soutěžící nespadne', () => {
    expect(parseEspnLive(wrap(ev('26', { state: 'wat', name: 'X' })), 'nba', NOW).size).toBe(0);
    expect(parseEspnLive(wrap({ id: '27' }), 'nba', NOW).size).toBe(0);
    expect(parseEspnLive(wrap({ id: '28', status: { type: { state: 'in', name: 'STATUS_IN_PROGRESS' } } }), 'nba', NOW).get('nba:28')).toMatchObject({ phase: 'live' });
  });
  it('nevalidní vstup → prázdná mapa', () => {
    for (const j of [null, undefined, 5, 'x', {}, { events: 'no' }, { events: [null, 3, {}] }]) {
      expect(parseEspnLive(j, 'nba', NOW).size).toBe(0);
    }
  });
  it('více událostí v jedné odpovědi', () => {
    const m = parseEspnLive(wrap(ev('30', { state: 'pre', name: 'STATUS_SCHEDULED' }), ev('31', { state: 'in', name: 'STATUS_IN_PROGRESS', clock: '1:00', period: 1 }, '2', '1')), 'nba', NOW);
    expect([...m.keys()]).toEqual(['nba:30', 'nba:31']);
  });
});

const mk = (id: string, sport: Match['sport'], startsAt: string, extra: Partial<Match> = {}): Match => ({
  id, sport, competition: 'x', startsAt, title: 'A – B', teams: [], broadcasters: [], ...extra,
});
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();

describe('isLiveCapable', () => {
  it('NBA a ESPN fotbal ano; ELH, NHL, NBL, F1, česká liga ne', () => {
    expect(isLiveCapable(mk('nba:401914130', 'nba', iso(0)))).toBe(true);
    expect(isLiveCapable(mk('football:401879267', 'football', iso(0), { competitionId: 'eng.1' }))).toBe(true);
    expect(isLiveCapable(mk('football:401879267', 'football', iso(0), { competitionId: 'uefa.champions' }))).toBe(true);
    expect(isLiveCapable(mk('football:cz-123', 'football', iso(0), { competitionId: 'cze.1' }))).toBe(false);
    expect(isLiveCapable(mk('football:999', 'football', iso(0), { competitionId: 'cze.1' }))).toBe(false);
    expect(isLiveCapable(mk('football:999', 'football', iso(0)))).toBe(false);
    expect(isLiveCapable(mk('nhl:2026020084', 'nhl', iso(0)))).toBe(false);
    expect(isLiveCapable(mk('cz-hockey:1', 'cz-hockey', iso(0)))).toBe(false);
    expect(isLiveCapable(mk('cz-basket:1', 'cz-basket', iso(0)))).toBe(false);
    expect(isLiveCapable(mk('f1:1', 'f1', iso(0)))).toBe(false);
    expect(isLiveCapable(mk('nba:abc', 'nba', iso(0)))).toBe(false);
  });
});

describe('liveCandidates', () => {
  const m = (id: string, off: number, extra: Partial<Match> = {}) => mk(`nba:${id}`, 'nba', iso(off), extra);
  it('okno [now - 4 h, now + 15 min]', () => {
    const ids = liveCandidates([m('1', -241), m('2', -239), m('3', 0), m('4', 15), m('5', 16), m('6', 600)], NOW).map((x) => x.id);
    expect(ids).toEqual(['nba:2', 'nba:3', 'nba:4']);
  });
  it('zápas s výsledkem a nepodporované sporty ne', () => {
    const list = [m('1', -10, { result: { home: 1, away: 2 } }), mk('nhl:1', 'nhl', iso(-10)), mk('football:cz-1', 'football', iso(-10), { competitionId: 'cze.1' }), m('2', -10)];
    expect(liveCandidates(list, NOW).map((x) => x.id)).toEqual(['nba:2']);
  });
  it('neplatné datum ne', () => {
    expect(liveCandidates([m('1', 0, { startsAt: 'nonsense' })], NOW)).toEqual([]);
  });
});

describe('buildFeeds', () => {
  const base = 'https://site.api.espn.com/apis/site/v2/sports/';
  it('NBA: UTC den i den podle východního času (zápas po půlnoci UTC)', () => {
    const feeds = buildFeeds([mk('nba:1', 'nba', '2026-10-13T01:30:00.000Z')]);
    expect(feeds.map((f) => f.url)).toEqual([
      `${base}basketball/nba/scoreboard?dates=20261013`,
      `${base}basketball/nba/scoreboard?dates=20261012`,
    ]);
    expect(feeds.every((f) => f.sport === 'nba' && f.matchIds.includes('nba:1'))).toBe(true);
  });
  it('NBA: odpolední UTC zápas = jeden den; deduplikace přes zápasy', () => {
    const feeds = buildFeeds([mk('nba:1', 'nba', '2026-10-12T20:00:00.000Z'), mk('nba:2', 'nba', '2026-10-12T22:30:00.000Z')]);
    expect(feeds).toHaveLength(1);
    expect(feeds[0].matchIds).toEqual(['nba:1', 'nba:2']);
  });
  it('fotbal: jeden feed na (soutěž, UTC den)', () => {
    const feeds = buildFeeds([
      mk('football:1', 'football', '2026-10-12T19:00:00.000Z', { competitionId: 'eng.1' }),
      mk('football:2', 'football', '2026-10-12T15:00:00.000Z', { competitionId: 'eng.1' }),
      mk('football:3', 'football', '2026-10-12T19:00:00.000Z', { competitionId: 'uefa.champions' }),
      mk('football:4', 'football', '2026-10-13T00:15:00.000Z', { competitionId: 'esp.1' }),
    ]);
    expect(feeds.map((f) => f.url)).toEqual([
      `${base}soccer/eng.1/scoreboard?dates=20261012`,
      `${base}soccer/uefa.champions/scoreboard?dates=20261012`,
      `${base}soccer/esp.1/scoreboard?dates=20261013`,
    ]);
    expect(feeds[0].matchIds).toEqual(['football:1', 'football:2']);
    expect(feeds[0].sport).toBe('football');
  });
  it('bez kandidátů žádné feedy; klíč feedu = url', () => {
    expect(buildFeeds([])).toEqual([]);
    const [f] = buildFeeds([mk('nba:1', 'nba', '2026-10-12T20:00:00.000Z')]);
    expect(f.key).toBe(f.url);
  });
});

describe('backoffDelay', () => {
  it('základ po úspěchu, pak exponenciálně s horní mezí', () => {
    expect(backoffDelay(20_000, 0)).toBe(20_000);
    expect(backoffDelay(20_000, 1)).toBe(40_000);
    expect(backoffDelay(20_000, 2)).toBe(80_000);
    expect(backoffDelay(20_000, 4)).toBe(300_000);
    expect(backoffDelay(20_000, 50)).toBe(300_000);
  });
});

describe('formatLiveClock', () => {
  const s = (p: Partial<LiveState>): LiveState => ({ matchId: 'x', phase: 'live', updatedAt: 0, ...p });
  it('hodiny + detail se skládají do jednoho řádku', () => {
    expect(formatLiveClock(s({ clock: 'Q3 5:42' }))).toBe('Q3 5:42');
    expect(formatLiveClock(s({ detail: 'Poločas' }))).toBe('Poločas');
    expect(formatLiveClock(s({ clock: "96'", detail: 'Prodloužení' }))).toBe("96' · Prodloužení");
    expect(formatLiveClock(s({ phase: 'post', detail: 'Konec' }))).toBe('Konec');
    expect(formatLiveClock(s({}))).toBe('');
  });
});

describe('scoreChanges / sameLive', () => {
  const s = (home?: number, away?: number, extra: Partial<LiveState> = {}): LiveState => ({ matchId: 'x', phase: 'live', home, away, updatedAt: 1, ...extra });
  it('rozpozná změnu domácích / hostů; první hodnota není změna', () => {
    expect(scoreChanges(undefined, s(0, 0))).toEqual({ home: false, away: false });
    expect(scoreChanges(s(0, 0), s(1, 0))).toEqual({ home: true, away: false });
    expect(scoreChanges(s(1, 0), s(1, 1))).toEqual({ home: false, away: true });
    expect(scoreChanges(s(1, 1), s(1, 1))).toEqual({ home: false, away: false });
    expect(scoreChanges(s(undefined, undefined), s(0, 0))).toEqual({ home: false, away: false });
  });
  it('sameLive ignoruje updatedAt', () => {
    expect(sameLive(s(1, 0, { clock: 'Q1 1:00', updatedAt: 1 }), s(1, 0, { clock: 'Q1 1:00', updatedAt: 99 }))).toBe(true);
    expect(sameLive(s(1, 0), s(1, 1))).toBe(false);
    expect(sameLive(s(1, 0), s(1, 0, { phase: 'post' }))).toBe(false);
  });
});
