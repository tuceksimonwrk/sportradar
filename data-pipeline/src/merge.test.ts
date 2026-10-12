import { describe, expect, it } from 'vitest';
import type { Match, StandingsTable, Team } from '@sportradar/shared';
import { isSuspiciousEmpty, mergeDatasets, mergeStandings, resolveStandingsTeamIds, upcomingCount } from './merge';

const now = new Date('2026-10-12T12:00:00Z');
const m = (id: string, sport: Match['sport'], startsAt: string): Match =>
  ({ id, sport, competition: 'c', startsAt, title: id, teams: [], broadcasters: [] });
const res = (id: string, sport: Match['sport'], startsAt: string, home = 1, away = 0): Match =>
  ({ ...m(id, sport, startsAt), result: { home, away } });
const t = (id: string, sport: Team['sport']): Team => ({ id, sport, name: id });

const prev = {
  matches: [m('nhl:old', 'nhl', '2026-10-13T00:00:00.000Z'), m('f1:old', 'f1', '2026-10-14T00:00:00.000Z')],
  teams: [t('nhl:A', 'nhl')],
};

describe('mergeDatasets', () => {
  it('čerstvá data nahradí stará pro daný sport', () => {
    const r = mergeDatasets(prev, { nhl: { matches: [m('nhl:new', 'nhl', '2026-10-15T00:00:00.000Z')], teams: [t('nhl:B', 'nhl')] } }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['f1:old', 'nhl:new']);
    expect(r.teams.map((x) => x.id)).toEqual(['nhl:B']);
  });
  it('chyba adaptéru ponechá stará data', () => {
    const r = mergeDatasets(prev, { nhl: new Error('boom') }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['nhl:old', 'f1:old']);
    expect(r.teams.map((x) => x.id)).toEqual(['nhl:A']);
  });
  it('0 zápasů (změněné HTML) ponechá stará data', () => {
    const r = mergeDatasets(prev, { nhl: { matches: [], teams: [] } }, now);
    expect(r.matches.map((x) => x.id)).toContain('nhl:old');
  });
  it('odstraní zápasy starší než 6 h a seřadí podle času', () => {
    const p = { matches: [m('a', 'f1', '2026-10-12T05:00:00.000Z'), m('b', 'f1', '2026-10-12T07:00:00.000Z'), m('c', 'f1', '2026-10-12T06:30:00.000Z')], teams: [] };
    expect(mergeDatasets(p, {}, now).matches.map((x) => x.id)).toEqual(['c', 'b']);
  });
});

describe('mergeDatasets – výsledky', () => {
  const up = (id: string) => m(id, 'nhl', '2026-10-15T00:00:00.000Z');
  it('výsledky z minula se přenesou, i když je v čerstvých datech nemáme', () => {
    const p = { matches: [res('nhl:r1', 'nhl', '2026-10-10T00:00:00.000Z')], teams: [] };
    const r = mergeDatasets(p, { nhl: { matches: [up('nhl:u')], teams: [] } }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['nhl:r1', 'nhl:u']);
  });
  it('při stejném id vyhrají čerstvá data', () => {
    const p = { matches: [res('nhl:1', 'nhl', '2026-10-10T00:00:00.000Z', 1, 0)], teams: [] };
    const r = mergeDatasets(p, { nhl: { matches: [res('nhl:1', 'nhl', '2026-10-10T00:00:00.000Z', 5, 4), up('nhl:u')], teams: [] } }, now);
    expect(r.matches.find((x) => x.id === 'nhl:1')!.result).toEqual({ home: 5, away: 4 });
  });
  it('sport bez čerstvých dat si ponechá předchozí zápasy; staré výsledky nhl se nepřenesou', () => {
    const p = { matches: [res('f1:r', 'f1', '2026-10-10T00:00:00.000Z'), res('nhl:old', 'nhl', '2026-09-20T00:00:00.000Z')], teams: [] };
    const r = mergeDatasets(p, { nhl: { matches: [up('nhl:u')], teams: [] } }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['f1:r', 'nhl:u']); // f1 nebylo čerstvé → zůstává z prev
  });
  it('čerstvý zápas bez výsledku nepřepíše výsledek z minula (a čerstvý výsledek vyhraje)', () => {
    const p = { matches: [res('f1:r', 'f1', '2026-10-10T00:00:00.000Z', 7, 7), res('f1:s', 'f1', '2026-10-10T00:00:00.000Z', 7, 7)], teams: [] };
    const fresh = [m('f1:r', 'f1', '2026-10-10T00:00:00.000Z'), res('f1:s', 'f1', '2026-10-10T00:00:00.000Z', 1, 2), m('f1:u', 'f1', '2026-10-15T00:00:00.000Z')];
    const r = mergeDatasets(p, { f1: { matches: fresh, teams: [] } }, now);
    expect(r.matches.find((x) => x.id === 'f1:r')!.result).toEqual({ home: 7, away: 7 });
    expect(r.matches.find((x) => x.id === 'f1:s')!.result).toEqual({ home: 1, away: 2 });
  });
  it('výsledek starší než 14 dní se na čerstvý zápas bez výsledku nepřenese', () => {
    const p = { matches: [res('f1:r', 'f1', '2026-09-20T00:00:00.000Z')], teams: [] };
    const fresh = [m('f1:r', 'f1', '2026-09-20T00:00:00.000Z'), m('f1:u', 'f1', '2026-10-15T00:00:00.000Z')];
    const r = mergeDatasets(p, { f1: { matches: fresh, teams: [] } }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['f1:u']);
  });
  it('retence: výsledek 13 d zůstává, 15 d zmizí; bez výsledku platí 6 h', () => {
    const p = { matches: [
      res('a', 'f1', '2026-09-29T11:00:00.000Z'), res('b', 'f1', '2026-09-27T11:00:00.000Z'),
      m('c', 'f1', '2026-10-12T05:00:00.000Z'), m('d', 'f1', '2026-10-12T07:00:00.000Z'),
    ], teams: [] };
    expect(mergeDatasets(p, {}, now).matches.map((x) => x.id)).toEqual(['a', 'd']);
  });
  it('adaptér s jen výsledky: stará nadcházející data zůstanou, nové výsledky se přidají', () => {
    const p = { matches: [up('nhl:old')], teams: [t('nhl:A', 'nhl')] };
    const r = mergeDatasets(p, { nhl: { matches: [res('nhl:r', 'nhl', '2026-10-11T00:00:00.000Z')], teams: [t('nhl:B', 'nhl')] } }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['nhl:r', 'nhl:old']);
    expect(r.teams.map((x) => x.id)).toEqual(['nhl:A']);
  });
});

describe('mergeDatasets – fotbal: náhrada za selhanou soutěž', () => {
  const fb = (id: string, comp: string, startsAt = '2026-10-15T00:00:00.000Z', result?: Match['result']): Match =>
    ({ ...m(id, 'football', startsAt), competitionId: comp, ...(result && { result }) });
  const team = (id: string, league?: string): Team => ({ id, sport: 'football', name: id, ...(league && { league }) });
  const prevFb = {
    matches: [fb('football:pl-old', 'eng.1'), fb('football:cz-old', 'cze.1'), fb('football:cz-res', 'cze.1', '2026-10-10T00:00:00.000Z', { home: 1, away: 1 }), fb('football:ucl-old', 'uefa.champions')],
    teams: [team('football:1', 'eng.1'), team('football:cz_a', 'cze.1'), team('football:9', 'uefa.champions'), team('football:x')],
  };
  it('selhaná soutěž si ponechá předchozí zápasy a týmy; úspěšné se nahradí čerstvými', () => {
    const r = mergeDatasets(prevFb, { football: {
      matches: [fb('football:pl-new', 'eng.1'), fb('football:ucl-new', 'uefa.champions')], teams: [team('football:1', 'eng.1'), team('football:9', 'uefa.champions')],
      failedCompetitions: ['cze.1'],
    } }, now);
    expect(r.matches.map((x) => x.id).sort()).toEqual(['football:cz-old', 'football:cz-res', 'football:pl-new', 'football:ucl-new']);
    expect(r.teams.map((x) => x.id).sort()).toEqual(['football:1', 'football:9', 'football:cz_a']);
  });
  it('bez failedCompetitions se staré nadcházející zápasy nepřenesou', () => {
    const r = mergeDatasets(prevFb, { football: { matches: [fb('football:pl-new', 'eng.1')], teams: [] } }, now);
    expect(r.matches.map((x) => x.id).sort()).toEqual(['football:cz-res', 'football:pl-new']);
  });
});

describe('upcomingCount', () => {
  it('výsledky se nepočítají', () => {
    expect(upcomingCount([res('a', 'nhl', '2026-10-11T00:00:00.000Z'), m('b', 'nhl', '2026-10-15T00:00:00.000Z')])).toBe(1);
  });
});

describe('isSuspiciousEmpty', () => {
  const ds = (iso?: string) => ({ matches: iso ? [m('nhl:x', 'nhl', iso)] : [], teams: [] });
  it('zápas v příštích 7 dnech → podezřelé', () => {
    expect(isSuspiciousEmpty(ds('2026-10-15T12:00:00.000Z'), 'nhl', now)).toBe(true);
  });
  it('zápas až za 10 dní → v pořádku (mimo sezónu)', () => {
    expect(isSuspiciousEmpty(ds('2026-10-22T12:00:00.000Z'), 'nhl', now)).toBe(false);
  });
  it('výsledek v příštích 7 dnech se nepočítá jako nadcházející', () => {
    const d = { matches: [res('nhl:x', 'nhl', '2026-10-15T12:00:00.000Z')], teams: [] };
    expect(isSuspiciousEmpty(d, 'nhl', now)).toBe(false);
  });
  it('žádný zápas → v pořádku; jiný sport se nepočítá', () => {
    expect(isSuspiciousEmpty(ds(), 'nhl', now)).toBe(false);
    expect(isSuspiciousEmpty(ds('2026-10-15T12:00:00.000Z'), 'f1', now)).toBe(false);
  });
});

describe('mergeStandings', () => {
  const OLD = '2026-10-01T00:00:00.000Z';
  const tbl = (id: string, sport: Match['sport'], name = 'x', updatedAt?: string): StandingsTable =>
    ({ id, sport, title: id, columns: [], rows: [{ pos: 1, name, values: {} }], ...(updatedAt && { updatedAt }) });
  const prevT = [tbl('nhl-east', 'nhl', 'old', OLD), tbl('nhl-west', 'nhl', 'old', OLD), tbl('f1-drivers', 'f1', 'old', OLD), tbl('nba-east', 'nba', 'old', OLD)];
  const ok = (standings?: StandingsTable[]) => ({ matches: [], teams: [], ...(standings && { standings }) });
  it('čerstvé tabulky nahradí staré se stejným id, dostanou updatedAt = now', () => {
    const r = mergeStandings(prevT, { nhl: ok([tbl('nhl-east', 'nhl', 'new'), tbl('nhl-west', 'nhl', 'new')]) }, now);
    expect(r.filter((x) => x.sport === 'nhl').map((x) => [x.rows[0].name, x.updatedAt])).toEqual([['new', now.toISOString()], ['new', now.toISOString()]]);
  });
  it('slučuje po id: nhl-west přežije, když je čerstvá jen nhl-east (a zachová si staré updatedAt)', () => {
    const r = mergeStandings(prevT, { nhl: ok([tbl('nhl-east', 'nhl', 'new')]) }, now);
    expect(r.filter((x) => x.sport === 'nhl').map((x) => [x.id, x.rows[0].name, x.updatedAt])).toEqual([
      ['nhl-east', 'new', now.toISOString()], ['nhl-west', 'old', OLD]]);
  });
  it('pořadí: nejdřív čerstvé, pak přenesené v pořadí z minula', () => {
    const p = [tbl('nhl-east', 'nhl', 'o', OLD), tbl('nhl-west', 'nhl', 'o', OLD)];
    const r = mergeStandings(p, { nhl: ok([tbl('nhl-west', 'nhl', 'n')]) }, now);
    expect(r.map((x) => x.id)).toEqual(['nhl-west', 'nhl-east']);
  });
  it('chyba, chybějící nebo prázdné standings ponechají předchozí beze změny updatedAt', () => {
    const r = mergeStandings(prevT, { nhl: new Error('x'), f1: ok(), nba: ok([]) }, now);
    expect(r.map((x) => x.id).sort()).toEqual(['f1-drivers', 'nba-east', 'nhl-east', 'nhl-west']);
    expect(r.every((x) => x.rows[0].name === 'old' && x.updatedAt === OLD)).toBe(true);
  });
  it('sport bez dat a bez předchozích → nic; výstup v pořadí SPORTS', () => {
    const r = mergeStandings([], { nba: ok([tbl('nba-east', 'nba')]), f1: ok([tbl('f1-drivers', 'f1')]) }, now);
    expect(r.map((x) => x.id)).toEqual(['f1-drivers', 'nba-east']);
    expect(mergeStandings([], {}, now)).toEqual([]);
  });
});

describe('resolveStandingsTeamIds', () => {
  const teams: Team[] = [{ id: 'cz-hockey:PCE', sport: 'cz-hockey', name: 'HC Dynamo Pardubice' }, { id: 'nhl:PIT', sport: 'nhl', name: 'Pittsburgh Penguins' }];
  const tb = (sport: Match['sport'], names: string[], withId?: string): StandingsTable =>
    ({ id: sport, sport, title: 't', columns: [], rows: names.map((n, i) => ({ pos: i + 1, name: n, ...(i === 0 && withId && { teamId: withId }), values: {} })) });
  it('doplní chybějící teamId z týmů téhož sportu (tolerantní shoda) a spočítá nevyřešené', () => {
    const { tables, unresolved } = resolveStandingsTeamIds([tb('cz-hockey', ['Dynamo Pardubice', 'Neznámý'])], teams);
    expect(tables[0].rows.map((r) => r.teamId)).toEqual(['cz-hockey:PCE', undefined]);
    expect(unresolved).toEqual({ 'cz-hockey': { missing: 1, total: 2 } });
  });
  it('existující teamId a F1 se nemění', () => {
    const f1 = tb('f1', ['A B']);
    const { tables, unresolved } = resolveStandingsTeamIds([tb('nhl', ['Pittsburgh Penguins'], 'nhl:XXX'), f1], teams);
    expect(tables[0].rows[0].teamId).toBe('nhl:XXX');
    expect(tables[1]).toBe(f1);
    expect(unresolved).toEqual({});
  });
});

describe('mergeDatasets – loga týmů', () => {
  const withLogo = (id: string, logo?: string): Team => ({ id, sport: 'nhl', name: id, ...(logo && { logo }) });
  const up = (id: string) => m(id, 'nhl', '2026-10-14T00:00:00.000Z');
  it('čerstvý tým bez loga zdědí logo z minula', () => {
    const p = { matches: [], teams: [withLogo('nhl:A', 'https://a.cz/a.svg')] };
    const r = mergeDatasets(p, { nhl: { matches: [up('nhl:1')], teams: [withLogo('nhl:A')] } }, now);
    expect(r.teams[0].logo).toBe('https://a.cz/a.svg');
  });
  it('čerstvé logo vyhrává; nový tým bez minulého loga zůstane bez něj', () => {
    const p = { matches: [], teams: [withLogo('nhl:A', 'https://a.cz/old.svg')] };
    const r = mergeDatasets(p, { nhl: { matches: [up('nhl:1')], teams: [withLogo('nhl:A', 'https://a.cz/new.svg'), withLogo('nhl:B')] } }, now);
    expect(r.teams.find((x) => x.id === 'nhl:A')!.logo).toBe('https://a.cz/new.svg');
    expect(r.teams.find((x) => x.id === 'nhl:B')).not.toHaveProperty('logo');
  });
});
