import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseNhlScore } from './nhl';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), 'utf8'));

describe('parseNhlScore (real fixtures)', () => {
  it('maps a real live game in the 2nd period and future games', () => {
    const games = parseNhlScore(fx('nhl-2026-10-12-live.json'));
    expect(games[0]).toEqual({
      id: 'nhl:2026020087', home: 'Sabres', away: 'Panthers', homeScore: 2, awayScore: 1,
      phase: 'live', clock: '2. třetina 19:55', startsAt: '2026-10-12T17:00:00.000Z',
    });
    expect(games[1]).toEqual({ id: 'nhl:2026020088', home: 'Devils', away: 'Senators', phase: 'pre', startsAt: '2026-10-12T23:00:00.000Z' });
    expect(games).toHaveLength(3);
  });
  it('maps a real first intermission', () => {
    const g = parseNhlScore(fx('nhl-2026-10-12-intermission.json'))[0];
    expect(g).toMatchObject({ phase: 'live', homeScore: 2, awayScore: 1, detail: 'Přestávka po 1. třetině' });
    expect(g.clock).toBeUndefined();
  });
  it('maps real finished games', () => {
    const games = parseNhlScore(fx('nhl-2026-10-11-final.json'));
    expect(games[0]).toEqual({ id: 'nhl:2026020084', home: 'Capitals', away: 'Kraken', homeScore: 3, awayScore: 5, phase: 'post', detail: 'Konec', startsAt: '2026-10-11T21:00:00.000Z' });
    expect(games.every((g) => g.phase === 'post')).toBe(true);
  });
});

/* tvary, které dnes nešlo zachytit živě: odvozené ze skutečných OFF/LIVE objektů */
const base = { id: 1, gameState: 'LIVE', gameScheduleState: 'OK', startTimeUTC: '2026-10-12T23:00:00Z', homeTeam: { abbrev: 'NJD', name: { default: 'Devils' }, score: 3 }, awayTeam: { abbrev: 'OTT', name: { default: 'Senators' }, score: 3 } };
const one = (g: Record<string, unknown>) => parseNhlScore({ games: [{ ...base, ...g }] })[0];

describe('parseNhlScore (synthesized shapes)', () => {
  it('3rd period clock without leading zero', () => {
    expect(one({ clock: { timeRemaining: '02:05', running: true, inIntermission: false }, periodDescriptor: { number: 3, periodType: 'REG' } }).clock).toBe('3. třetina 2:05');
  });
  it('CRIT is live', () => {
    expect(one({ gameState: 'CRIT', clock: { timeRemaining: '00:41' }, periodDescriptor: { number: 3, periodType: 'REG' } }).phase).toBe('live');
  });
  it('end of period before the intermission flag', () => {
    const g = one({ clock: { timeRemaining: '00:00', running: false, inIntermission: false }, periodDescriptor: { number: 2, periodType: 'REG' } });
    expect(g).toMatchObject({ phase: 'live', detail: 'Konec 2. třetiny' });
    expect(g.clock).toBeUndefined();
  });
  it('overtime, playoff 2nd overtime, shootout, intermission before OT', () => {
    expect(one({ clock: { timeRemaining: '03:21', running: true }, periodDescriptor: { number: 4, periodType: 'OT' } })).toMatchObject({ clock: '3:21', detail: 'Prodloužení' });
    expect(one({ clock: { timeRemaining: '12:00', running: true }, periodDescriptor: { number: 5, periodType: 'OT' } })).toMatchObject({ clock: '12:00', detail: '2. prodloužení' });
    expect(one({ clock: { timeRemaining: '00:00' }, periodDescriptor: { number: 5, periodType: 'SO' } })).toMatchObject({ detail: 'Nájezdy' });
    expect(one({ clock: { timeRemaining: '15:00', inIntermission: true }, periodDescriptor: { number: 3, periodType: 'REG' } }).detail).toBe('Přestávka po 3. třetině');
  });
  it('final after OT / SO, FINAL state, PRE state', () => {
    expect(one({ gameState: 'FINAL', gameOutcome: { lastPeriodType: 'OT' } }).detail).toBe('Konec po prodloužení');
    expect(one({ gameState: 'OFF', gameOutcome: { lastPeriodType: 'SO' } }).detail).toBe('Konec po nájezdech');
    const pre = one({ gameState: 'PRE' });
    expect(pre.phase).toBe('pre');
    expect(pre.homeScore).toBeUndefined();
  });
  it('skips postponed and malformed games, tolerates junk', () => {
    expect(parseNhlScore({ games: [{ ...base, gameScheduleState: 'PPD' }, { ...base, id: 'x' }, { ...base, homeTeam: null }, 5] })).toEqual([]);
    expect(parseNhlScore(null)).toEqual([]);
    expect(parseNhlScore({ games: 'no' })).toEqual([]);
  });
});
