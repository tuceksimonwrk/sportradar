import { describe, expect, it } from 'vitest';
import type { Match, Team } from '@sportradar/shared';
import { isSuspiciousEmpty, mergeDatasets } from './merge';

const now = new Date('2026-10-12T12:00:00Z');
const m = (id: string, sport: Match['sport'], startsAt: string): Match =>
  ({ id, sport, competition: 'c', startsAt, title: id, teams: [], broadcasters: [] });
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

describe('isSuspiciousEmpty', () => {
  const ds = (iso?: string) => ({ matches: iso ? [m('nhl:x', 'nhl', iso)] : [], teams: [] });
  it('zápas v příštích 7 dnech → podezřelé', () => {
    expect(isSuspiciousEmpty(ds('2026-10-15T12:00:00.000Z'), 'nhl', now)).toBe(true);
  });
  it('zápas až za 10 dní → v pořádku (mimo sezónu)', () => {
    expect(isSuspiciousEmpty(ds('2026-10-22T12:00:00.000Z'), 'nhl', now)).toBe(false);
  });
  it('žádný zápas → v pořádku; jiný sport se nepočítá', () => {
    expect(isSuspiciousEmpty(ds(), 'nhl', now)).toBe(false);
    expect(isSuspiciousEmpty(ds('2026-10-15T12:00:00.000Z'), 'f1', now)).toBe(false);
  });
});
