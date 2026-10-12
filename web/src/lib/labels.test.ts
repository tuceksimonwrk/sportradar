import { describe, expect, it } from 'vitest';
import { competitionLine, venueLine } from './labels';

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
