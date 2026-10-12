import { describe, expect, it } from 'vitest';
import { combine, matchTeamId, pragueToUtcIso, slugify } from './util';

describe('pragueToUtcIso', () => {
  it('letní čas (CEST, +2)', () => {
    expect(pragueToUtcIso(2026, 10, 10, 12, 0)).toBe('2026-10-10T10:00:00.000Z');
  });
  it('zimní čas (CET, +1)', () => {
    expect(pragueToUtcIso(2026, 11, 1, 18, 0)).toBe('2026-11-01T17:00:00.000Z');
  });
  it('den po přechodu na zimní čas (25. 10. 2026)', () => {
    expect(pragueToUtcIso(2026, 10, 24, 18, 0)).toBe('2026-10-24T16:00:00.000Z');
    expect(pragueToUtcIso(2026, 10, 26, 18, 0)).toBe('2026-10-26T17:00:00.000Z');
  });
});

describe('slugify', () => {
  it('odstraní diakritiku a mezery', () => {
    expect(slugify('BK Olomoucko')).toBe('bk-olomoucko');
    expect(slugify('Ústí nad Labem – Žraloci')).toBe('usti-nad-labem-zraloci');
  });
});

describe('combine', () => {
  it('spojí výsledky a deduplikuje podle id', () => {
    const m = (id: string) => ({ id, sport: 'nhl' as const, competition: 'NHL', startsAt: '2026-10-14T23:00:00.000Z', title: 't', teams: [], broadcasters: [] });
    const t = (id: string) => ({ id, sport: 'nhl' as const, name: id });
    const r = combine([
      { matches: [m('a'), m('b')], teams: [t('x')] },
      { matches: [m('b'), m('c')], teams: [t('x'), t('y')] },
    ]);
    expect(r.matches.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r.teams.map((x) => x.id)).toEqual(['x', 'y']);
  });
});

describe('matchTeamId', () => {
  const teams = [
    { id: 'cz-hockey:PCE', sport: 'cz-hockey' as const, name: 'HC Dynamo Pardubice' },
    { id: 'cz-hockey:CEB', sport: 'cz-hockey' as const, name: 'Banes Motor Č. Budějovice' },
  ];
  it('shoda přes slugify (diakritika, velikost, mezery)', () => {
    expect(matchTeamId('HC Dynamo Pardubice', teams)).toBe('cz-hockey:PCE');
    expect(matchTeamId('  banes motor c.  budejovice ', teams)).toBe('cz-hockey:CEB');
  });
  it('bez shody / prázdné jméno → undefined', () => {
    expect(matchTeamId('HC Neznámý', teams)).toBeUndefined();
    expect(matchTeamId('', teams)).toBeUndefined();
    expect(matchTeamId('x', [])).toBeUndefined();
  });
});
