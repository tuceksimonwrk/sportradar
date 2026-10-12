import { describe, expect, it } from 'vitest';
import type { MatchDetail } from '@sportradar/shared';
import { detailFooter, detailTabs, hasDetail, lineupsClass, rankingWidth, statBarWidths, statusTone, statSentence } from './detail';

describe('statBarWidths', () => {
  it('vyšší je lepší: delší sloupek = větší hodnota', () => {
    expect(statBarWidths(2, 7)).toEqual({ home: 28.6, away: 100, better: 'away' });
    expect(statBarWidths(7, 2)).toEqual({ home: 100, away: 28.6, better: 'home' });
  });
  it('lowerIsBetter: delší sloupek = lepší (menší) hodnota', () => {
    expect(statBarWidths(4.333, 2.667, true)).toEqual({ home: 61.6, away: 100, better: 'away' });
    expect(statBarWidths(15, 7, true)).toEqual({ home: 46.7, away: 100, better: 'away' });
  });
  it('lowerIsBetter s nulou: nula je nejlepší', () => {
    expect(statBarWidths(0, 1, true)).toEqual({ home: 100, away: 0, better: 'home' });
  });
  it('záporné hodnoty (rozdíl skóre) se posunou', () => {
    expect(statBarWidths(-14, 5)).toEqual({ home: 0, away: 100, better: 'away' });
    expect(statBarWidths(-2, -6)).toEqual({ home: 100, away: 0, better: 'home' });
  });
  it('shoda a nuly', () => {
    expect(statBarWidths(3, 3)).toEqual({ home: 100, away: 100, better: null });
    expect(statBarWidths(0, 0)).toEqual({ home: 0, away: 0, better: null });
    expect(statBarWidths(0, 0, true)).toEqual({ home: 100, away: 100, better: null });
  });
  it('neplatné → nic', () => {
    expect(statBarWidths(Number.NaN, 2)).toEqual({ home: 0, away: 0, better: null });
    expect(statBarWidths(undefined, 2)).toEqual({ home: 0, away: 0, better: null });
  });
});

describe('rankingWidth', () => {
  it('poměr k lídrovi, ořez 0..100', () => {
    expect(rankingWidth(150, 300)).toBe(50);
    expect(rankingWidth(0, 300)).toBe(0);
    expect(rankingWidth(10, 0)).toBe(0);
  });
});

describe('statusTone', () => {
  it('zranění / suspendace = out, ostatní = doubt', () => {
    expect(statusTone('Zraněn')).toBe('out');
    expect(statusTone('Suspendován')).toBe('out');
    expect(statusTone('Nejistý')).toBe('doubt');
    expect(statusTone('Pochybný')).toBe('doubt');
  });
});

describe('hasDetail', () => {
  it('lookup v indexu', () => {
    const ids = new Set(['nhl:1']);
    expect(hasDetail(ids, 'nhl:1')).toBe(true);
    expect(hasDetail(ids, 'nhl:2')).toBe(false);
    expect(hasDetail(null, 'nhl:1')).toBe(false);
  });
});

const d = (over: Partial<MatchDetail> = {}): MatchDetail => ({ matchId: 'nhl:1', sport: 'nhl', generatedAt: '2026-10-12T12:05:00Z', source: 'NHL.com', stats: [], notes: [], ...over });

describe('detailFooter', () => {
  const now = new Date('2026-10-12T13:00:00Z');
  it('zdroj + čas, čerstvé', () => {
    expect(detailFooter(d(), now, 'UTC')).toEqual({ text: 'Data z NHL.com, aktualizováno 12:05', stale: false });
  });
  it('starší než 3 h → stale; jiný den s datem', () => {
    expect(detailFooter(d({ generatedAt: '2026-10-12T09:59:00Z' }), now, 'UTC').stale).toBe(true);
    expect(detailFooter(d({ generatedAt: '2026-10-11T22:00:00Z' }), now, 'UTC').text).toBe('Data z NHL.com, aktualizováno 11. 10. 22:00');
  });
  it('neplatné datum', () => {
    expect(detailFooter(d({ generatedAt: 'x' }), now)).toEqual({ text: 'Data z NHL.com', stale: true });
  });
});

describe('detailTabs', () => {
  it('týmové sporty: Porovnání | Sestavy; F1: Pořadí | Rošt', () => {
    expect(detailTabs('nhl')).toEqual(['Porovnání', 'Sestavy']);
    expect(detailTabs('f1')).toEqual(['Pořadí', 'Rošt']);
  });
});

describe('statSentence', () => {
  it('text pro čtečky', () => {
    expect(statSentence({ label: 'Body', home: 2, away: 7 }, 'Chicago', 'Pittsburgh')).toBe('Body: Chicago 2, Pittsburgh 7');
  });
});

describe('lineupsClass', () => {
  const team = (n: number) => ({ name: 'T', groups: [{ title: 'Obránci', players: Array.from({ length: n }, (_, i) => ({ name: `P${i}` })) }] });
  it('dlouhá soupiska (roster, > 18 hráčů) → kompaktní seznam; potvrzená sestava / krátká soupiska ne', () => {
    expect(lineupsClass({ kind: 'roster', home: team(28), away: team(12) })).toBe('dlineups dlineups--compact');
    expect(lineupsClass({ kind: 'roster', home: team(12), away: team(12) })).toBe('dlineups');
    expect(lineupsClass({ kind: 'confirmed', home: team(20), away: team(20) })).toBe('dlineups');
  });
});
