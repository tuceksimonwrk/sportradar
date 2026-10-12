import { describe, expect, it } from 'vitest';
import { nbaAdapter, nbaDateRange, parseNba } from './nba';

const comp = (home: [string, string], away: [string, string], venue?: object) => ({
  ...(venue ? { venue } : {}),
  competitors: [
    { homeAway: 'home', team: { abbreviation: home[0], displayName: home[1] } },
    { homeAway: 'away', team: { abbreviation: away[0], displayName: away[1] } },
  ],
});
const json = { events: [
  { id: '1', date: '2026-10-21T23:00Z', status: { type: { state: 'pre' } }, season: { type: 2 }, competitions: [comp(['ORL', 'Orlando Magic'], ['ATL', 'Atlanta Hawks'], { fullName: 'Kia Center', address: { city: 'Orlando' } })] },
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
  it('doplní venue; bez venue klíč chybí', () => {
    expect(r.matches[0].venue).toEqual({ name: 'Kia Center', city: 'Orlando' });
    expect(r.matches[1]).not.toHaveProperty('venue');
  });
  it('prázdný vstup nepadne', () => { expect(parseNba({}).matches).toEqual([]); });
});

describe('nbaDateRange', () => {
  it('začíná dnem předtím (americké datum) a má 15 dní', () => {
    const d = nbaDateRange(new Date('2026-10-12T01:00:00Z'));
    expect(d).toHaveLength(15);
    expect(d[0]).toBe('20261011');
    expect(d[14]).toBe('20261025');
  });
});

describe('nbaAdapter.fetch', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('selhání jednoho dne shodí fetch', async () => {
    let n = 0;
    const get = async () => { if (++n === 3) throw new Error('boom'); return json; };
    await expect(nbaAdapter.fetch(now, get as any)).rejects.toThrow();
  });
  it('vše OK vrátí data', async () => {
    const r = await nbaAdapter.fetch(now, (async () => json) as any);
    expect(r.matches.length).toBeGreaterThan(0);
  });
});
