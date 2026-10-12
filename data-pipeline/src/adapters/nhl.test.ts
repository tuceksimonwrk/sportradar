import { describe, expect, it } from 'vitest';
import { parseNhl } from './nhl';

const team = (abbrev: string, place: string, name: string) =>
  ({ abbrev, placeName: { default: place }, commonName: { default: name } });
const json = { gameWeek: [{ date: '2026-10-14', games: [
  { id: 2026020100, gameType: 2, startTimeUTC: '2026-10-14T23:00:00Z', gameState: 'FUT', homeTeam: team('WSH', 'Washington', 'Capitals'), awayTeam: team('SEA', 'Seattle', 'Kraken') },
  { id: 2026020001, gameType: 2, startTimeUTC: '2026-10-11T23:00:00Z', gameState: 'OFF', homeTeam: team('PIT', 'Pittsburgh', 'Penguins'), awayTeam: team('NYR', 'New York', 'Rangers') },
  { id: 2026010009, gameType: 1, startTimeUTC: '2026-10-15T23:00:00Z', gameState: 'FUT', homeTeam: team('PIT', 'Pittsburgh', 'Penguins'), awayTeam: team('WSH', 'Washington', 'Capitals') },
] }] };

describe('parseNhl', () => {
  const r = parseNhl(json);
  it('vezme jen budoucí/probíhající zápasy', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['nhl:2026020100', 'nhl:2026010009']);
  });
  it('mapuje týmy, titulek, soutěž', () => {
    expect(r.matches[0]).toMatchObject({
      sport: 'nhl', competition: 'NHL', startsAt: '2026-10-14T23:00:00.000Z',
      title: 'Washington Capitals – Seattle Kraken', teams: ['nhl:WSH', 'nhl:SEA'],
    });
    expect(r.matches[1].competition).toBe('NHL (přípravné)');
    expect(r.teams.map((t) => t.id).sort()).toEqual(['nhl:NYR', 'nhl:PIT', 'nhl:SEA', 'nhl:WSH']);
    expect(r.teams.find((t) => t.id === 'nhl:SEA')!.name).toBe('Seattle Kraken');
  });
  it('prázdný vstup nepadne', () => { expect(parseNhl({}).matches).toEqual([]); });
});
