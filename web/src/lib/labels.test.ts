import { describe, expect, it } from 'vitest';
import { competitionLine, scoreLabel, scoreParts, venueLine } from './labels';

describe('competitionLine', () => {
  it('nezdvojuje shodný název', () => {
    expect(competitionLine('f1', 'Formule 1')).toBe('Formule 1');
    expect(competitionLine('nba', 'NBA')).toBe('NBA');
    expect(competitionLine('nba', ' nba ')).toBe('nba');
  });
  it('nezdvojuje, když soutěž začíná názvem sportu', () => {
    expect(competitionLine('nhl', 'NHL (přípravné)')).toBe('NHL (přípravné)');
  });
  it('jinak přidá štítek sportu', () => {
    expect(competitionLine('cz-hockey', 'Tipsport extraliga')).toBe('Česká extraliga · Tipsport extraliga');
    expect(competitionLine('cz-basket', 'NBL')).toBe('Česká NBL · NBL');
  });
});

describe('venueLine', () => {
  it('název a město', () => { expect(venueLine({ name: 'O2 arena', city: 'Praha' })).toBe('📍 O2 arena, Praha'); });
  it('jen název', () => { expect(venueLine({ name: 'Kia Center' })).toBe('📍 Kia Center'); });
  it('bez venue je null', () => { expect(venueLine(undefined)).toBeNull(); });
  it('prázdný název je null', () => { expect(venueLine({ name: '  ', city: 'Praha' })).toBeNull(); });
});

describe('scoreParts', () => {
  it('vítěz domácí/hosté/remíza', () => {
    expect(scoreParts({ home: 3, away: 1 })).toEqual({ home: 3, away: 1, winner: 'home' });
    expect(scoreParts({ home: 0, away: 2 })?.winner).toBe('away');
    expect(scoreParts({ home: 2, away: 2 })?.winner).toBe('draw');
  });
  it('chybějící skóre → null', () => {
    expect(scoreParts({ podium: [] })).toBeNull();
    expect(scoreParts({ home: 1 })).toBeNull();
    expect(scoreParts({ home: NaN, away: 1 })).toBeNull();
  });
});

describe('scoreLabel', () => {
  it('čitelný text pro čtečky', () => {
    expect(scoreLabel({ home: 3, away: 1, homeName: 'Sparta', awayName: 'Liberec' })).toBe('Sparta 3, Liberec 1');
    expect(scoreLabel({ home: 3, away: 1 })).toBe('Domácí 3, hosté 1');
    expect(scoreLabel({ podium: [] })).toBeNull();
  });
});
