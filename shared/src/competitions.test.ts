import { describe, expect, it } from 'vitest';
import { COMPETITIONS, SPORTS, SPORT_LABELS, competitionById, leagueFavoriteId, matchDurationMinutes, parseLeagueFavorite } from './index';

describe('fotbal ve sportech', () => {
  it('football je sport s českým štítkem', () => {
    expect(SPORTS).toContain('football');
    expect(SPORT_LABELS.football).toBe('Fotbal');
  });
  it('fotbalový zápas trvá 120 min', () => {
    expect(matchDurationMinutes({ id: 'football:1', sport: 'football' })).toBe(120);
  });
});

describe('COMPETITIONS', () => {
  it('sedm soutěží v pevném pořadí', () => {
    expect(COMPETITIONS.map((c) => c.id)).toEqual(['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'cze.1']);
    expect(COMPETITIONS[0]).toEqual({ id: 'eng.1', sport: 'football', name: 'Premier League', short: 'PL', country: 'Anglie' });
    expect(competitionById('uefa.champions')?.name).toBe('Liga mistrů');
    expect(competitionById('cze.1')?.name).toBe('Chance Liga');
    expect(competitionById('xxx')).toBeUndefined();
  });
  it('oblíbená liga: league:<id> a zpět', () => {
    expect(leagueFavoriteId('eng.1')).toBe('league:eng.1');
    expect(parseLeagueFavorite('league:eng.1')).toBe('eng.1');
    expect(parseLeagueFavorite('league:nope')).toBeUndefined();
    expect(parseLeagueFavorite('football:382')).toBeUndefined();
    expect(parseLeagueFavorite('football')).toBeUndefined();
  });
});
