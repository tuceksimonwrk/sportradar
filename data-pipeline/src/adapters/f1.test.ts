import { describe, expect, it } from 'vitest';
import { attachF1Podium, f1Adapter, f1RacesNeedingPodium, parseF1 } from './f1';

const json = {
  MRData: { RaceTable: { Races: [
    {
      season: '2026', round: '23', raceName: 'Abu Dhabi Grand Prix',
      Circuit: { circuitName: 'Yas Marina Circuit', Location: { locality: 'Abu Dhabi' } }, date: '2026-12-06', time: '13:00:00Z',
      FirstPractice: { date: '2026-12-04', time: '09:30:00Z' },
      Qualifying: { date: '2026-12-05', time: '14:00:00Z' },
    },
    { season: '2026', round: '24', raceName: 'Bez času GP', date: '2026-12-13' },
  ] } },
};

describe('parseF1', () => {
  it('vytvoří zápas pro každou relaci a závod, seřazeně', () => {
    const r = parseF1(json);
    expect(r.matches.map((m) => m.title)).toEqual([
      'Abu Dhabi Grand Prix – 1. trénink',
      'Abu Dhabi Grand Prix – Kvalifikace',
      'Abu Dhabi Grand Prix – Závod',
    ]);
    const race = r.matches[2];
    expect(race.id).toBe('f1:2026-23-Race');
    expect(race.startsAt).toBe('2026-12-06T13:00:00.000Z');
    expect(race.sport).toBe('f1');
    expect(race.competition).toBe('Formule 1');
    expect(race.teams).toEqual([]);
    expect(r.teams).toEqual([]);
  });
  it('všechny relace závodu sdílejí venue; bez Circuit klíč chybí', () => {
    const r = parseF1({ MRData: { RaceTable: { Races: [...json.MRData.RaceTable.Races, { season: '2026', round: '25', raceName: 'Bez okruhu GP', date: '2026-12-20', time: '13:00:00Z' }] } } });
    const abu = r.matches.filter((m) => m.title.startsWith('Abu Dhabi'));
    expect(abu).toHaveLength(3);
    for (const m of abu) expect(m.venue).toEqual({ name: 'Yas Marina Circuit', city: 'Abu Dhabi' });
    expect(r.matches.find((m) => m.title.startsWith('Bez okruhu'))).not.toHaveProperty('venue');
  });
  it('přeskočí závod bez času a nepadne na prázdném vstupu', () => {
    expect(parseF1(json).matches.some((m) => m.title.startsWith('Bez času'))).toBe(false);
    expect(parseF1({}).matches).toEqual([]);
  });
});

describe('attachF1Podium', () => {
  const driver = (g: string, f: string) => ({ givenName: g, familyName: f });
  const res = (n: number) => ({ MRData: { RaceTable: { Races: [{ Results: [
    { position: '1', Driver: driver('Max', 'Verstappen') },
    { position: '2', Driver: driver('Lando', 'Norris') },
    { position: '3', Driver: driver('Oscar', 'Piastri') },
    { position: '4', Driver: driver('Neplatný', 'Čtvrtý') },
  ].slice(0, n) }] } } });
  const base = parseF1({ MRData: { RaceTable: { Races: [
    { season: '2026', round: '19', raceName: 'Mexico GP', date: '2026-10-04', time: '20:00:00Z', Qualifying: { date: '2026-10-03', time: '20:00:00Z' } },
    { season: '2026', round: '20', raceName: 'Brazil GP', date: '2026-10-25', time: '17:00:00Z' },
  ] } } }).matches;
  it('závod dostane podium (top 3), ostatní relace ne', () => {
    const r = attachF1Podium(base, { '19': res(4) });
    const race = r.find((m) => m.id === 'f1:2026-19-Race')!;
    expect(race.result).toEqual({ podium: [
      { pos: 1, name: 'Max Verstappen' }, { pos: 2, name: 'Lando Norris' }, { pos: 3, name: 'Oscar Piastri' }] });
    expect(r.find((m) => m.id === 'f1:2026-19-Qualifying')).not.toHaveProperty('result');
    expect(r.find((m) => m.id === 'f1:2026-20-Race')).not.toHaveProperty('result');
  });
  it('prázdná/neplatná data bez podia výsledek nevytvoří', () => {
    expect(attachF1Podium(base, { '19': {} }).some((m) => m.result)).toBe(false);
    expect(attachF1Podium(base, { '19': res(0) }).some((m) => m.result)).toBe(false);
  });
  it('f1RacesNeedingPodium: jen závody v minulých 14 dnech', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    expect(f1RacesNeedingPodium(base, now)).toEqual(['19']);
    expect(f1RacesNeedingPodium(base, new Date('2026-10-30T12:00:00Z'))).toEqual(['20']);
  });
});

describe('f1Adapter.fetch', () => {
  const sched = { MRData: { RaceTable: { Races: [
    { season: '2026', round: '19', raceName: 'Mexico GP', date: '2026-10-04', time: '20:00:00Z' },
    { season: '2026', round: '20', raceName: 'Brazil GP', date: '2026-10-25', time: '17:00:00Z' },
  ] } } };
  const now = new Date('2026-10-12T12:00:00Z');
  it('stáhne jen potřebná kola; selhání kola nechá bez podia', async () => {
    const urls: string[] = [];
    const get = async (u: string) => { urls.push(u); if (u.endsWith('current.json')) return sched; throw new Error('boom'); };
    const r = await f1Adapter.fetch(now, get as any);
    expect(urls).toEqual(['https://api.jolpi.ca/ergast/f1/current.json', 'https://api.jolpi.ca/ergast/f1/current/19/results.json']);
    expect(r.matches.some((m) => m.result)).toBe(false);
  });
  it('podium se připojí', async () => {
    const get = async (u: string) => u.endsWith('current.json') ? sched
      : { MRData: { RaceTable: { Races: [{ Results: [{ position: '1', Driver: { givenName: 'A', familyName: 'B' } }] }] } } };
    const r = await f1Adapter.fetch(now, get as any);
    expect(r.matches.find((m) => m.result)?.result?.podium).toEqual([{ pos: 1, name: 'A B' }]);
  });
});
