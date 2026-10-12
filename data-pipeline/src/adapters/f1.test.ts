import { describe, expect, it } from 'vitest';
import { parseF1 } from './f1';

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
