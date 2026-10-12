import { describe, expect, it } from 'vitest';
import type { Match } from './index';
import { ALL_FILTER, SPORT_GROUPS, competitionsOfGroup, filterSport, groupOfSport, matchPassesFilter, normalizeFilter } from './groups';

const m = (sport: Match['sport'], competitionId?: string): Match =>
  ({ id: `${sport}:1`, sport, competition: 'c', ...(competitionId && { competitionId }), startsAt: '2026-10-13T17:00:00Z', title: 't', teams: [], broadcasters: [] });

describe('SPORT_GROUPS', () => {
  it('pořadí a popisky', () => {
    expect(SPORT_GROUPS.map((g) => g.label)).toEqual(['Formule 1', 'Hokej', 'Basketbal', 'Fotbal']);
  });
  it('groupOfSport', () => {
    expect(groupOfSport('nhl')).toBe('hockey');
    expect(groupOfSport('cz-hockey')).toBe('hockey');
    expect(groupOfSport('nba')).toBe('basketball');
    expect(groupOfSport('cz-basket')).toBe('basketball');
    expect(groupOfSport('f1')).toBe('f1');
    expect(groupOfSport('football')).toBe('football');
  });
});

describe('competitionsOfGroup', () => {
  it('hokej a basketbal = interní sporty, fotbal = soutěže, F1 nic', () => {
    expect(competitionsOfGroup('hockey').map((c) => [c.id, c.label])).toEqual([['nhl', 'NHL'], ['cz-hockey', 'Česká extraliga']]);
    expect(competitionsOfGroup('basketball').map((c) => [c.id, c.label])).toEqual([['nba', 'NBA'], ['cz-basket', 'Česká NBL']]);
    expect(competitionsOfGroup('football').map((c) => c.id)).toEqual(['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'cze.1']);
    expect(competitionsOfGroup('f1')).toEqual([]);
  });
});

describe('matchPassesFilter', () => {
  it('Vše pustí všechno', () => {
    for (const s of ['f1', 'nhl', 'cz-hockey', 'nba', 'cz-basket', 'football'] as const) expect(matchPassesFilter(m(s), ALL_FILTER)).toBe(true);
  });
  it('skupiny', () => {
    expect(matchPassesFilter(m('nhl'), { group: 'hockey', competition: 'all' })).toBe(true);
    expect(matchPassesFilter(m('cz-hockey'), { group: 'hockey', competition: 'all' })).toBe(true);
    expect(matchPassesFilter(m('nba'), { group: 'hockey', competition: 'all' })).toBe(false);
    expect(matchPassesFilter(m('nba'), { group: 'basketball', competition: 'all' })).toBe(true);
    expect(matchPassesFilter(m('cz-basket'), { group: 'basketball', competition: 'all' })).toBe(true);
    expect(matchPassesFilter(m('football', 'eng.1'), { group: 'basketball', competition: 'all' })).toBe(false);
    expect(matchPassesFilter(m('f1'), { group: 'f1', competition: 'all' })).toBe(true);
    expect(matchPassesFilter(m('football'), { group: 'football', competition: 'all' })).toBe(true);
    expect(matchPassesFilter(m('f1'), { group: 'football', competition: 'all' })).toBe(false);
  });
  it('soutěže hokeje a basketbalu', () => {
    expect(matchPassesFilter(m('nhl'), { group: 'hockey', competition: 'nhl' })).toBe(true);
    expect(matchPassesFilter(m('cz-hockey'), { group: 'hockey', competition: 'nhl' })).toBe(false);
    expect(matchPassesFilter(m('cz-hockey'), { group: 'hockey', competition: 'cz-hockey' })).toBe(true);
    expect(matchPassesFilter(m('nba'), { group: 'basketball', competition: 'nba' })).toBe(true);
    expect(matchPassesFilter(m('cz-basket'), { group: 'basketball', competition: 'nba' })).toBe(false);
    expect(matchPassesFilter(m('cz-basket'), { group: 'basketball', competition: 'cz-basket' })).toBe(true);
  });
  it('soutěže fotbalu podle competitionId', () => {
    expect(matchPassesFilter(m('football', 'eng.1'), { group: 'football', competition: 'eng.1' })).toBe(true);
    expect(matchPassesFilter(m('football', 'esp.1'), { group: 'football', competition: 'eng.1' })).toBe(false);
    expect(matchPassesFilter(m('football'), { group: 'football', competition: 'eng.1' })).toBe(false);
  });
  it('soutěž cizí skupiny nebo neznámá se ignoruje (= Vše ve skupině)', () => {
    expect(matchPassesFilter(m('nhl'), { group: 'hockey', competition: 'eng.1' })).toBe(true);
    expect(matchPassesFilter(m('nhl'), { group: 'hockey', competition: 'nba' })).toBe(true);
    expect(matchPassesFilter(m('f1'), { group: 'f1', competition: 'nhl' })).toBe(true);
    expect(matchPassesFilter(m('nhl'), { group: 'all', competition: 'nba' })).toBe(true);
    expect(matchPassesFilter(m('football', 'cze.1'), { group: 'football', competition: 'xyz.9' })).toBe(true);
  });
});

describe('normalizeFilter / filterSport', () => {
  it('reset soutěže při změně skupiny', () => {
    expect(normalizeFilter({ group: 'basketball', competition: 'nhl' })).toEqual({ group: 'basketball', competition: 'all' });
    expect(normalizeFilter({ group: 'all', competition: 'nhl' })).toEqual(ALL_FILTER);
    expect(normalizeFilter({ group: 'hockey', competition: 'cz-hockey' })).toEqual({ group: 'hockey', competition: 'cz-hockey' });
  });
  it('filterSport pro motiv stránky', () => {
    expect(filterSport(ALL_FILTER)).toBe('all');
    expect(filterSport({ group: 'hockey', competition: 'all' })).toBe('nhl');
    expect(filterSport({ group: 'hockey', competition: 'cz-hockey' })).toBe('cz-hockey');
    expect(filterSport({ group: 'basketball', competition: 'cz-basket' })).toBe('cz-basket');
    expect(filterSport({ group: 'football', competition: 'eng.1' })).toBe('football');
    expect(filterSport({ group: 'f1', competition: 'all' })).toBe('f1');
  });
});
