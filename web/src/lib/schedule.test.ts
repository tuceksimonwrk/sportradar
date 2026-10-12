import { describe, expect, it } from 'vitest';
import type { Match } from '@sportradar/shared';
import { groupByDay, isFavorite, selectMatches } from './schedule';

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

describe('groupByDay', () => {
  it('seskupí podle místního dne (půlnoc v jiném pásmu)', () => {
    const a = m('a', 'nhl', '2026-10-14T23:30:00Z'); // Praha 15. 10. 01:30, NY 14. 10. 19:30
    const b = m('b', 'nhl', '2026-10-15T10:00:00Z');
    expect(groupByDay([a, b], 'Europe/Prague').map((g) => [g.key, g.matches.length])).toEqual([['2026-10-15', 2]]);
    expect(groupByDay([a, b], 'America/New_York').map((g) => [g.key, g.matches.length])).toEqual([['2026-10-14', 1], ['2026-10-15', 1]]);
  });
});
