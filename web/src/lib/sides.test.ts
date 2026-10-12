import { describe, expect, it } from 'vitest';
import type { Team } from '@sportradar/shared';
import { matchSides, splitSession } from './sides';

const teams = new Map<string, Team>([
  ['nhl:PIT', { id: 'nhl:PIT', sport: 'nhl', name: 'Pittsburgh Penguins' }],
  ['nhl:WSH', { id: 'nhl:WSH', sport: 'nhl', name: 'Washington Capitals' }],
]);

describe('matchSides', () => {
  it('z titulku a id (domácí první)', () => {
    expect(matchSides({ title: 'Pittsburgh Penguins – Washington Capitals', teams: ['nhl:PIT', 'nhl:WSH'] })).toEqual([
      { name: 'Pittsburgh Penguins', teamId: 'nhl:PIT' }, { name: 'Washington Capitals', teamId: 'nhl:WSH' },
    ]);
  });
  it('titulek bez id → strany bez erbu', () => {
    expect(matchSides({ title: 'A – B', teams: [] })).toEqual([{ name: 'A', teamId: undefined }, { name: 'B', teamId: undefined }]);
  });
  it('nerozdělitelný titulek → jména z mapy týmů', () => {
    expect(matchSides({ title: 'Derby', teams: ['nhl:PIT', 'nhl:WSH'] }, teams)?.map((s) => s.name))
      .toEqual(['Pittsburgh Penguins', 'Washington Capitals']);
  });
  it('jinak null (titulek se ukáže celý)', () => {
    expect(matchSides({ title: 'Derby', teams: ['nhl:PIT', 'nhl:XXX'] }, teams)).toBeNull();
    expect(matchSides({ title: 'GP – Závod – navíc', teams: [] })).toBeNull();
  });
});

describe('splitSession', () => {
  it('poslední pomlčka odděluje část víkendu', () => {
    expect(splitSession('GP Monaka – Závod')).toEqual({ event: 'GP Monaka', session: 'Závod' });
    expect(splitSession('GP Monaka')).toEqual({ event: 'GP Monaka' });
  });
});
