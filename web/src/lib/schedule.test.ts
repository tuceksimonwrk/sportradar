import { describe, expect, it } from 'vitest';
import type { Match } from '@sportradar/shared';
import { chunkMatches, competitionForSport, groupByDay, isFavorite, selectMatches, selectResults } from './schedule';

const m = (id: string, sport: Match['sport'], startsAt: string, teams: string[] = []): Match =>
  ({ id, sport, competition: 'c', startsAt, title: id, teams, broadcasters: [] });

const now = new Date('2026-10-12T12:00:00Z');
const all = [
  m('old', 'nhl', '2026-10-12T07:00:00Z', ['nhl:PIT']),          // 5 h zpátky → pryč
  m('live', 'nhl', '2026-10-12T11:00:00Z', ['nhl:PIT']),         // před 1 h → zůstává
  m('f1', 'f1', '2026-10-18T13:00:00Z'),
  m('pce', 'cz-hockey', '2026-10-13T17:00:00Z', ['cz-hockey:PCE', 'cz-hockey:LIT']),
  m('other', 'cz-hockey', '2026-10-13T18:00:00Z', ['cz-hockey:LIB']),
];

describe('isFavorite', () => {
  it('tým i celý sport', () => {
    expect(isFavorite(all[3], new Set(['cz-hockey:PCE']))).toBe(true);
    expect(isFavorite(all[2], new Set(['f1']))).toBe(true);
    expect(isFavorite(all[4], new Set(['cz-hockey:PCE']))).toBe(false);
  });
  it('oblíbená soutěž league:<competitionId>', () => {
    const pl: Match = { ...m('football:1', 'football', '2026-10-13T17:00:00Z', ['football:1', 'football:2']), competitionId: 'eng.1' };
    expect(isFavorite(pl, new Set(['league:eng.1']))).toBe(true);
    expect(isFavorite(pl, new Set(['league:esp.1']))).toBe(false);
    expect(isFavorite(all[3], new Set(['league:eng.1']))).toBe(false); // bez competitionId
  });
});

describe('selectMatches', () => {
  it('jen oblíbené, bez zápasů starších než 3 h, seřazené', () => {
    const r = selectMatches(all, new Set(['nhl:PIT', 'cz-hockey:PCE', 'f1']), now);
    expect(r.map((x) => x.id)).toEqual(['live', 'pce', 'f1']);
  });
  it('filtr podle sportu', () => {
    const r = selectMatches(all, new Set(['nhl:PIT', 'f1']), now, 'f1');
    expect(r.map((x) => x.id)).toEqual(['f1']);
  });
  it('prázdné oblíbené → prázdný výsledek', () => {
    expect(selectMatches(all, new Set(), now)).toEqual([]);
  });
});

const r = (id: string, sport: Match['sport'], startsAt: string, teams: string[] = []): Match =>
  ({ ...m(id, sport, startsAt, teams), result: { home: 3, away: 1 } });

describe('selectMatches – výsledky', () => {
  it('Program vynechá zápasy s výsledkem', () => {
    const list = [...all, r('res', 'nhl', '2026-10-12T11:30:00Z', ['nhl:PIT'])];
    expect(selectMatches(list, new Set(['nhl:PIT']), now).map((x) => x.id)).toEqual(['live']);
  });
});

describe('selectResults', () => {
  const list = [
    m('upcoming', 'nhl', '2026-10-13T00:00:00Z', ['nhl:PIT']),
    r('r-new', 'nhl', '2026-10-11T23:00:00Z', ['nhl:PIT', 'nhl:NYR']),
    r('r-mid', 'cz-hockey', '2026-10-05T12:00:00Z', ['cz-hockey:PCE']),
    r('r-f1', 'f1', '2026-10-04T20:00:00Z'),
    r('r-edge', 'nhl', '2026-09-28T12:00:00Z', ['nhl:PIT']),    // přesně 14 dní
    r('r-old', 'nhl', '2026-09-28T11:59:00Z', ['nhl:PIT']),     // těsně přes 14 dní
    r('r-other', 'nhl', '2026-10-10T12:00:00Z', ['nhl:BOS']),   // nehraje oblíbený
  ];
  const favs = new Set(['nhl:PIT', 'cz-hockey:PCE', 'f1']);
  it('jen výsledky oblíbených, 14 dní, nejnovější první', () => {
    expect(selectResults(list, favs, now).map((x) => x.id)).toEqual(['r-new', 'r-mid', 'r-f1', 'r-edge']);
  });
  it('filtr podle sportu', () => {
    expect(selectResults(list, favs, now, 'cz-hockey').map((x) => x.id)).toEqual(['r-mid']);
  });
  it('prázdné oblíbené → nic', () => {
    expect(selectResults(list, new Set(), now)).toEqual([]);
  });
  it('při stejném čase deterministicky podle id', () => {
    const a = r('a', 'f1', '2026-10-10T10:00:00Z'); const b = r('b', 'f1', '2026-10-10T10:00:00Z');
    expect(selectResults([a, b], new Set(['f1']), now).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('showAll', () => {
  it('Program: showAll ignoruje oblíbené, ale drží okno, výsledky a filtr sportu', () => {
    expect(selectMatches(all, new Set(), now, 'all', 'all', { showAll: true }).map((x) => x.id)).toEqual(['live', 'pce', 'other', 'f1']);
    expect(selectMatches(all, new Set(['f1']), now, 'cz-hockey', 'all', { showAll: true }).map((x) => x.id)).toEqual(['pce', 'other']);
    expect(selectMatches(all, new Set(['f1']), now).map((x) => x.id)).toEqual(['f1']);
  });
  it('Výsledky: showAll vrátí i výsledky neoblíbených', () => {
    const list = [r('a', 'nhl', '2026-10-11T10:00:00Z', ['nhl:BOS']), r('b', 'f1', '2026-10-10T10:00:00Z')];
    expect(selectResults(list, new Set(), now, 'all', 'all', { showAll: true }).map((x) => x.id)).toEqual(['a', 'b']);
    expect(selectResults(list, new Set(), now).map((x) => x.id)).toEqual([]);
  });
});

describe('chunkMatches', () => {
  const ms = Array.from({ length: 70 }, (_, i) => m('m' + i, 'nhl', '2026-10-13T10:00:00Z'));
  it('vrátí prvních N a počet zbývajících', () => {
    const c = chunkMatches(ms, 30);
    expect(c.shown).toHaveLength(30); expect(c.remaining).toBe(40);
    expect(chunkMatches(ms, 90)).toEqual({ shown: ms, remaining: 0 });
  });
  it('ošetří nesmyslný limit', () => {
    expect(chunkMatches(ms, 0).shown).toHaveLength(0);
    expect(chunkMatches([], 30)).toEqual({ shown: [], remaining: 0 });
  });
});

describe('groupByDay', () => {
  it('seskupí podle místního dne (půlnoc v jiném pásmu)', () => {
    const a = m('a', 'nhl', '2026-10-14T23:30:00Z'); // Praha 15. 10. 01:30, NY 14. 10. 19:30
    const b = m('b', 'nhl', '2026-10-15T10:00:00Z');
    expect(groupByDay([a, b], 'Europe/Prague').map((g) => [g.key, g.matches.length])).toEqual([['2026-10-15', 2]]);
    expect(groupByDay([a, b], 'America/New_York').map((g) => [g.key, g.matches.length])).toEqual([['2026-10-14', 1], ['2026-10-15', 1]]);
  });
  it('funguje i na sestupném vstupu (výsledky)', () => {
    const a = m('a', 'nhl', '2026-10-15T10:00:00Z'); const b = m('b', 'nhl', '2026-10-15T08:00:00Z'); const c = m('c', 'nhl', '2026-10-14T10:00:00Z');
    expect(groupByDay([a, b, c], 'Europe/Prague').map((g) => [g.key, g.matches.map((x) => x.id)])).toEqual([['2026-10-15', ['a', 'b']], ['2026-10-14', ['c']]]);
  });
});

describe('filtr soutěže (fotbal)', () => {
  const fb = (id: string, comp: string | undefined, startsAt: string, result = false): Match => ({
    ...m(id, 'football', startsAt, [`football:${id}a`, `football:${id}b`]),
    ...(comp && { competitionId: comp }),
    ...(result && { result: { home: 1, away: 0 } }),
  });
  const list = [
    fb('pl', 'eng.1', '2026-10-13T15:00:00Z'),
    fb('cl', 'uefa.champions', '2026-10-14T19:00:00Z'),
    fb('cz', 'cze.1', '2026-10-15T16:00:00Z'),
    fb('pl-r', 'eng.1', '2026-10-10T15:00:00Z', true),
    fb('cz-r', 'cze.1', '2026-10-09T16:00:00Z', true),
    m('pit', 'nhl', '2026-10-13T23:00:00Z', ['nhl:PIT']),
  ];
  const favs = new Set(['football', 'nhl:PIT']);
  it('Program: jen vybraná soutěž, když je zvolený fotbal', () => {
    expect(selectMatches(list, favs, now, 'football', 'eng.1').map((x) => x.id)).toEqual(['pl']);
    expect(selectMatches(list, favs, now, 'football', 'uefa.champions').map((x) => x.id)).toEqual(['cl']);
    expect(selectMatches(list, favs, now, 'football', 'all').map((x) => x.id)).toEqual(['pl', 'cl', 'cz']);
  });
  it('Výsledky: jen vybraná soutěž', () => {
    expect(selectResults(list, favs, now, 'football', 'cze.1').map((x) => x.id)).toEqual(['cz-r']);
    expect(selectResults(list, favs, now, 'football').map((x) => x.id)).toEqual(['pl-r', 'cz-r']);
  });
  it('mimo fotbal se soutěž ignoruje', () => {
    expect(selectMatches(list, favs, now, 'all', 'eng.1').map((x) => x.id)).toEqual(['pl', 'pit', 'cl', 'cz']);
    expect(selectMatches(list, favs, now, 'nhl', 'eng.1').map((x) => x.id)).toEqual(['pit']);
  });
  it('competitionForSport: soutěž zůstává jen u fotbalu', () => {
    expect(competitionForSport('football', 'eng.1')).toBe('eng.1');
    expect(competitionForSport('nhl', 'eng.1')).toBe('all');
    expect(competitionForSport('all', 'cze.1')).toBe('all');
    expect(competitionForSport('football', 'xyz.9')).toBe('all'); // neznámá soutěž
  });
});
