import { describe, expect, it } from 'vitest';
import { competitionLine } from './labels';

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
