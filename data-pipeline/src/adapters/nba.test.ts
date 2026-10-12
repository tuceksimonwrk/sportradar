import { describe, expect, it } from 'vitest';
import { parseNba } from './nba';

const comp = (home: [string, string], away: [string, string]) => ({
  competitors: [
    { homeAway: 'home', team: { abbreviation: home[0], displayName: home[1] } },
    { homeAway: 'away', team: { abbreviation: away[0], displayName: away[1] } },
  ],
});
const json = { events: [
  { id: '1', date: '2026-10-21T23:00Z', status: { type: { state: 'pre' } }, season: { type: 2 }, competitions: [comp(['ORL', 'Orlando Magic'], ['ATL', 'Atlanta Hawks'])] },
  { id: '2', date: '2026-10-21T20:00Z', status: { type: { state: 'post' } }, season: { type: 2 }, competitions: [comp(['BOS', 'Boston Celtics'], ['NYK', 'New York Knicks'])] },
  { id: '3', date: '2026-10-22T01:00Z', status: { type: { state: 'pre' } }, season: { type: 1 }, competitions: [comp(['LAL', 'Los Angeles Lakers'], ['GSW', 'Golden State Warriors'])] },
] };

describe('parseNba', () => {
  const r = parseNba(json);
  it('vezme jen nezačaté/probíhající', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['nba:1', 'nba:3']);
  });
  it('mapuje čas, titulek, týmy a typ soutěže', () => {
    expect(r.matches[0]).toMatchObject({
      startsAt: '2026-10-21T23:00:00.000Z', title: 'Orlando Magic – Atlanta Hawks',
      teams: ['nba:ORL', 'nba:ATL'], competition: 'NBA',
    });
    expect(r.matches[1].competition).toBe('NBA (přípravné)');
    expect(r.teams).toHaveLength(6);
  });
  it('prázdný vstup nepadne', () => { expect(parseNba({}).matches).toEqual([]); });
});
