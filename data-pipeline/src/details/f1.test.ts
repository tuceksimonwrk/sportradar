import { describe, expect, it } from 'vitest';
import type { Match, StandingsTable } from '@sportradar/shared';
import { createFetcher } from './common';
import { f1Detail, parseF1Detail } from './f1';
import qualifying from './fixtures/f1-qualifying.json';

const now = new Date('2026-10-11T08:00:00Z');
const s = (key: string, label: string, startsAt: string): Match => ({
  id: `f1:2026-17-${key}`, sport: 'f1', competition: 'Formule 1', startsAt, title: `Singapore Grand Prix – ${label}`, teams: [], broadcasters: [],
  venue: { name: 'Marina Bay Street Circuit', city: 'Marina Bay' },
});
const matches: Match[] = [
  s('FirstPractice', '1. trénink', '2026-10-09T09:30:00.000Z'),
  s('Qualifying', 'Kvalifikace', '2026-10-10T13:00:00.000Z'),
  s('Race', 'Závod', '2026-10-11T12:00:00.000Z'),
  { ...s('Race', 'Závod', '2026-10-25T19:00:00.000Z'), id: 'f1:2026-18-Race', title: 'United States Grand Prix – Závod' },
];
const standings: StandingsTable[] = [
  { id: 'f1-drivers', sport: 'f1', title: 'Jezdci', columns: [], rows: Array.from({ length: 12 }, (_, i) => ({ pos: i + 1, name: `Jezdec ${i + 1}`, sub: `Tým ${(i % 6) + 1}`, values: { b: 300 - i * 20, v: 1 } })) },
  { id: 'f1-constructors', sport: 'f1', title: 'Konstruktéři', columns: [], rows: [{ pos: 1, name: 'Mercedes', values: { b: 578, v: 11 } }, { pos: 2, name: 'Ferrari', values: { b: 400, v: 3 } }] },
];
const race = matches[2];

describe('parseF1Detail', () => {
  it('závod po kvalifikaci: rošt z výsledků kvalifikace', () => {
    const d = parseF1Detail({ match: race, matches, standings, qualifying, now });
    expect(d).toMatchObject({ matchId: 'f1:2026-17-Race', sport: 'f1', source: 'Jolpica (Ergast)' });
    expect(d.homeName).toBeUndefined();
    expect(d.grid?.slice(0, 2)).toEqual([
      { pos: 1, name: 'Max Verstappen', team: 'Red Bull', number: '3' },
      { pos: 2, name: 'Charles Leclerc', team: 'Ferrari', number: '16' },
    ]);
    expect(d.drivers).toBeUndefined();
    expect(d.notes.join(' ')).toMatch(/penalizac/);
  });
  it('pořadí: top 10 jezdců a konstruktéři, body jako value', () => {
    const d = parseF1Detail({ match: race, matches, standings, qualifying, now });
    expect(d.rankings?.map((r) => r.title)).toEqual(['Pořadí jezdců', 'Pořadí konstruktérů']);
    expect(d.rankings?.[0].rows).toHaveLength(10);
    expect(d.rankings?.[0].rows[0]).toEqual({ pos: 1, name: 'Jezdec 1', sub: 'Tým 1', value: 300 });
    expect(d.rankings?.[1].rows[0]).toEqual({ pos: 1, name: 'Mercedes', value: 578 });
  });
  it('program víkendu jen z téhož kola, seřazený', () => {
    const d = parseF1Detail({ match: race, matches, standings, qualifying, now });
    expect(d.weekend).toEqual({ name: 'Singapore Grand Prix', sessions: [
      { id: 'f1:2026-17-FirstPractice', label: '1. trénink', startsAt: '2026-10-09T09:30:00.000Z' },
      { id: 'f1:2026-17-Qualifying', label: 'Kvalifikace', startsAt: '2026-10-10T13:00:00.000Z' },
      { id: 'f1:2026-17-Race', label: 'Závod', startsAt: '2026-10-11T12:00:00.000Z' },
    ] });
  });
  it('trénink / před kvalifikací: seznam jezdců podle šampionátu + poznámka', () => {
    const d = parseF1Detail({ match: matches[0], matches, standings, qualifying: null, now });
    expect(d.grid).toBeUndefined();
    expect(d.drivers).toHaveLength(12);
    expect(d.drivers?.[0]).toEqual({ pos: 1, name: 'Jezdec 1', team: 'Tým 1' });
    expect(d.notes.join(' ')).toMatch(/po kvalifikaci/);
  });
  it('kvalifikace jiného kola se nepoužije', () => {
    const d = parseF1Detail({ match: matches[3], matches, standings, qualifying, now });
    expect(d.grid).toBeUndefined();
  });
  it('bez tabulek nepadne', () => {
    const d = parseF1Detail({ match: race, matches, standings: [], qualifying: {}, now });
    expect(d.rankings).toBeUndefined();
    expect(d.notes.length).toBeGreaterThan(0);
  });
});

describe('f1Detail (fetch)', () => {
  it('kvalifikaci stahuje jen pro závod po startu kvalifikace (a jen jednou)', async () => {
    const calls: string[] = [];
    const get = createFetcher(async (u) => { calls.push(u); return JSON.stringify(qualifying); });
    const ctx = { get, now, matches, teams: [], standings };
    const d = await f1Detail(race, ctx);
    await f1Detail(race, ctx);
    expect(d.grid?.length).toBe(4);
    expect(calls).toEqual(['https://api.jolpi.ca/ergast/f1/2026/17/qualifying.json']);
    await f1Detail(matches[0], ctx);
    await f1Detail(matches[3], ctx);       // kvalifikace kola 18 ještě nebyla
    expect(calls).toHaveLength(1);
  });
  it('selhání kvalifikace → seznam jezdců, ne chyba', async () => {
    const get = createFetcher(async () => { throw new Error('HTTP 503'); });
    const d = await f1Detail(race, { get, now, matches, teams: [], standings });
    expect(d.drivers?.length).toBe(12);
  });
});
