import { describe, expect, it } from 'vitest';
import { nhlAdapter, parseNhl } from './nhl';

const team = (abbrev: string, place: string, name: string) =>
  ({ abbrev, placeName: { default: place }, commonName: { default: name } });
const withVenue = (g: any, venue?: string) => (venue ? { ...g, venue: { default: venue } } : g);
const now = new Date('2026-10-12T12:00:00Z');
const json = { gameWeek: [{ date: '2026-10-14', games: [
  withVenue({ id: 2026020100, gameType: 2, startTimeUTC: '2026-10-14T23:00:00Z', gameState: 'FUT', homeTeam: team('WSH', 'Washington', 'Capitals'), awayTeam: team('SEA', 'Seattle', 'Kraken') }, 'Capital One Arena'),
  { id: 2026020001, gameType: 2, startTimeUTC: '2026-10-11T23:00:00Z', gameState: 'OFF', homeTeam: team('PIT', 'Pittsburgh', 'Penguins'), awayTeam: team('NYR', 'New York', 'Rangers') },
  { id: 2026010009, gameType: 1, startTimeUTC: '2026-10-15T23:00:00Z', gameState: 'FUT', homeTeam: team('PIT', 'Pittsburgh', 'Penguins'), awayTeam: team('WSH', 'Washington', 'Capitals') },
] }] };

describe('parseNhl', () => {
  const r = parseNhl(json, now);
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
  it('doplní venue z hry; bez venue klíč chybí', () => {
    expect(r.matches[0].venue).toEqual({ name: 'Capital One Arena', city: 'Washington' });
    expect(r.matches[1]).not.toHaveProperty('venue');
  });
  it('prázdný vstup nepadne', () => { expect(parseNhl({}, now).matches).toEqual([]); });
  it('odehraný zápas bez skóre se nevydá', () => {
    expect(r.matches.some((m) => m.id === 'nhl:2026020001')).toBe(false);
  });
});

describe('parseNhl – výsledky', () => {
  const g = (id: number, start: string, state: string, hs: unknown, as: unknown, period?: string) => ({
    id, gameType: 2, startTimeUTC: start, gameState: state,
    homeTeam: { ...team('PIT', 'Pittsburgh', 'Penguins'), score: hs }, awayTeam: { ...team('NYR', 'New York', 'Rangers'), score: as },
    ...(period ? { gameOutcome: { lastPeriodType: period } } : {}),
  });
  const wk = (...games: any[]) => ({ gameWeek: [{ date: 'x', games }] });
  it('OFF/FINAL se skóre → result s jmény', () => {
    const r = parseNhl(wk(g(1, '2026-10-11T23:00:00Z', 'OFF', 4, 2, 'REG'), g(2, '2026-10-10T23:00:00Z', 'FINAL', 1, 3)), now);
    expect(r.matches.map((m) => m.id)).toEqual(['nhl:1', 'nhl:2']);
    expect(r.matches[0].result).toEqual({ home: 4, away: 2, homeName: 'Pittsburgh Penguins', awayName: 'New York Rangers' });
    expect(r.matches[0].title).toBe('Pittsburgh Penguins – New York Rangers');
  });
  it('poznámka podle lastPeriodType', () => {
    const r = parseNhl(wk(g(1, '2026-10-11T23:00:00Z', 'OFF', 4, 3, 'OT'), g(2, '2026-10-11T22:00:00Z', 'OFF', 2, 3, 'SO')), now);
    expect(r.matches[0].result?.note).toBe('po prodloužení');
    expect(r.matches[1].result?.note).toBe('po nájezdech');
  });
  it('starší než 14 dní a chybějící/neplatné skóre se přeskočí', () => {
    const r = parseNhl(wk(g(1, '2026-09-27T23:00:00Z', 'OFF', 4, 2), g(2, '2026-10-11T23:00:00Z', 'OFF', undefined, 2), g(3, '2026-10-11T23:00:00Z', 'OFF', 'x', NaN)), now);
    expect(r.matches).toEqual([]);
  });
  it('13 dní zpět ještě ano', () => {
    expect(parseNhl(wk(g(1, '2026-09-29T23:00:00Z', 'OFF', 4, 2)), now).matches).toHaveLength(1);
  });
});

describe('nhlAdapter.fetch', () => {
  it('jde 2 týdny zpět přes previousStartDate', async () => {
    const urls: string[] = [];
    const get = async (url: string) => {
      urls.push(url);
      if (url.endsWith('/now')) return { previousStartDate: '2026-10-05', nextStartDate: '2026-10-19', gameWeek: [] };
      if (url.endsWith('2026-10-05')) return { previousStartDate: '2026-09-28', gameWeek: [] };
      return { gameWeek: [] };
    };
    await nhlAdapter.fetch(now, get as any);
    expect(urls).toContain('https://api-web.nhle.com/v1/schedule/2026-10-05');
    expect(urls).toContain('https://api-web.nhle.com/v1/schedule/2026-09-28');
    expect(urls.filter((u) => u.includes('2026-09-21'))).toHaveLength(0);
  });
  it('selhání týdne dozadu se ignoruje, dopředu shodí fetch', async () => {
    const week = { gameWeek: [{ games: [{ id: 1, gameType: 2, startTimeUTC: '2026-10-14T23:00:00Z', gameState: 'FUT', homeTeam: team('WSH', 'Washington', 'Capitals'), awayTeam: team('SEA', 'Seattle', 'Kraken') }] }] };
    const get = async (url: string) => { if (url.includes('2026-10-05')) throw new Error('boom'); return { ...week, previousStartDate: '2026-10-05' }; };
    const r = await nhlAdapter.fetch(now, get as any);
    expect(r.matches.map((m) => m.id)).toContain('nhl:1');
    const bad = async (url: string) => { if (url.endsWith('/now')) throw new Error('boom'); return week; };
    await expect(nhlAdapter.fetch(now, bad as any)).rejects.toThrow();
  });
  it('vadné startTimeUTC u přeskočeného stavu nepadne', () => {
    const g = { id: 9, gameType: 2, startTimeUTC: 'nonsense', gameState: 'PPD', homeTeam: team('PIT', 'Pittsburgh', 'Penguins'), awayTeam: team('NYR', 'New York', 'Rangers') };
    expect(parseNhl({ gameWeek: [{ games: [g] }] }, now).matches).toEqual([]);
  });
});
