import { describe, expect, it } from 'vitest';
import type { StandingsFile } from '@sportradar/shared';
import { driverCode, driverTeamMap, podiumSlots } from './podium';

const file: StandingsFile = {
  generatedAt: '2026-10-12T00:00:00Z',
  tables: [{
    id: 'f1-drivers', sport: 'f1', title: 'Jezdci', columns: [],
    rows: [
      { pos: 1, name: 'Max Verstappen', sub: 'Red Bull', values: {} },
      { pos: 2, name: 'Sergio Pérez', sub: 'Cadillac', values: {} },
    ],
  }],
};

describe('podiumSlots', () => {
  const podium = [{ pos: 1, name: 'Max Verstappen' }, { pos: 2, name: 'Sergio Perez' }, { pos: 3, name: 'Lewis Hamilton' }];
  it('vizuální pořadí 2-1-3 s medailemi a týmy', () => {
    const s = podiumSlots(podium, driverTeamMap(file));
    expect(s.map((x) => x.pos)).toEqual([2, 1, 3]);
    expect(s.map((x) => x.medal)).toEqual(['silver', 'gold', 'bronze']);
    expect(s[1].team).toBe('Red Bull');
    expect(s[0].team).toBe('Cadillac'); // shoda i bez diakritiky
    expect(s[2].team).toBeUndefined();
  });
  it('chybějící místa vynechá, ignoruje 4. a dál', () => {
    expect(podiumSlots([{ pos: 1, name: 'A' }, { pos: 4, name: 'D' }]).map((x) => x.pos)).toEqual([1]);
    expect(podiumSlots(undefined)).toEqual([]);
  });
});

describe('driverTeamMap', () => {
  it('bez souboru prázdná', () => { expect(driverTeamMap(null).size).toBe(0); });
});

describe('driverCode', () => {
  it('tři písmena příjmení', () => {
    expect(driverCode('Max Verstappen')).toBe('VER');
    expect(driverCode('Andrea Kimi Antonelli')).toBe('ANT');
    expect(driverCode('Nico Hülkenberg')).toBe('HUL');
    expect(driverCode('')).toBe('?');
  });
});
