import { describe, expect, it } from 'vitest';
import { nhlAdapter, parseNhl, parseNhlStandings } from './nhl';

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

describe('parseNhlStandings', () => {
  const row = (abbrev: string, conf: string, seq: number, extra: object = {}) => ({
    teamAbbrev: { default: abbrev }, teamName: { default: `Tým ${abbrev}` }, conferenceName: conf, conferenceSequence: seq,
    gamesPlayed: 7, wins: 5, losses: 1, otLosses: 1, points: 11, goalDifferential: 10, ...extra,
  });
  const json = { standings: [
    row('NYR', 'Eastern', 2, { goalDifferential: -3, points: 9 }),
    row('CAR', 'Eastern', 1),
    row('EDM', 'Western', 1, { goalDifferential: 0 }),
    { ...row('XXX', 'Western', 2), goalDifferential: undefined, teamName: undefined, placeName: { default: 'Utah' }, teamCommonName: { default: 'Mammoth' } },
    { conferenceName: 'Western', conferenceSequence: 3 },
  ] };
  const t = parseNhlStandings(json);
  it('dvě tabulky podle konference, řazené podle conferenceSequence', () => {
    expect(t.map((x) => x.id)).toEqual(['nhl-east', 'nhl-west']);
    expect(t[0].title).toBe('NHL – Východní konference');
    expect(t[1].title).toBe('NHL – Západní konference');
    expect(t[0].rows.map((r) => r.pos)).toEqual([1, 2]);
    expect(t[0].rows.map((r) => r.teamId)).toEqual(['nhl:CAR', 'nhl:NYR']);
    expect(t[0].columns.map((c) => c.label)).toEqual(['Z', 'V', 'P', 'PP', 'B', 'S']);
  });
  it('hodnoty a znaménkové skóre', () => {
    expect(t[0].rows[0].values).toEqual({ z: 7, v: 5, p: 1, pp: 1, b: 11, s: '+10' });
    expect(t[0].rows[1].values.s).toBe('-3');
    expect(t[1].rows[0].values.s).toBe('0');
  });
  it('chybějící údaje: jméno z place+common, skóre –, řádek bez zkratky se zahodí', () => {
    expect(t[1].rows[1]).toMatchObject({ name: 'Utah Mammoth', teamId: 'nhl:XXX' });
    expect(t[1].rows[1].values.s).toBe('–');
    expect(t[1].rows).toHaveLength(2);
  });
  it('prázdný / neznámý vstup → []', () => {
    expect(parseNhlStandings({})).toEqual([]);
    expect(parseNhlStandings({ standings: [] })).toEqual([]);
    expect(parseNhlStandings(null)).toEqual([]);
  });
});

describe('nhlAdapter.fetch – tabulky', () => {
  const sched = { gameWeek: [] };
  const stand = { standings: [{ teamAbbrev: { default: 'CAR' }, teamName: { default: 'Carolina Hurricanes' }, conferenceName: 'Eastern', conferenceSequence: 1, gamesPlayed: 1, wins: 1, losses: 0, otLosses: 0, points: 2, goalDifferential: 1 }] };
  it('úspěch: standings přítomné', async () => {
    const r = await nhlAdapter.fetch(now, (async (u: string) => (u.includes('standings') ? stand : sched)) as any);
    expect(r.standings?.[0].id).toBe('nhl-east');
    expect(r.standingsError).toBeUndefined();
  });
  it('selhání tabulky nezabije zápasy, nastaví standingsError', async () => {
    const r = await nhlAdapter.fetch(now, (async (u: string) => { if (u.includes('standings')) throw new Error('boom'); return sched; }) as any);
    expect(r.standings).toBeUndefined();
    expect(r.standingsError).toContain('boom');
  });
  it('prázdné tabulky = chyba tabulky', async () => {
    const r = await nhlAdapter.fetch(now, (async (u: string) => (u.includes('standings') ? {} : sched)) as any);
    expect(r.standings).toBeUndefined();
    expect(r.standingsError).toBeTruthy();
  });
});
