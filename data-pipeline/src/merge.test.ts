import { describe, expect, it } from 'vitest';
import type { Match, Team } from '@sportradar/shared';
import { isSuspiciousEmpty, mergeDatasets, upcomingCount } from './merge';

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
  it('nepřenáší výsledky jiného sportu ani staré než 14 dní', () => {
    const p = { matches: [res('f1:r', 'f1', '2026-10-10T00:00:00.000Z'), res('nhl:old', 'nhl', '2026-09-20T00:00:00.000Z')], teams: [] };
    const r = mergeDatasets(p, { nhl: { matches: [up('nhl:u')], teams: [] } }, now);
    expect(r.matches.map((x) => x.id)).toEqual(['f1:r', 'nhl:u']); // f1 nebylo čerstvé → zůstává z prev
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
