import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseElhScoreboard } from './elh';

const fx = (n: string) => JSON.parse(readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), 'utf8'));

describe('parseElhScoreboard (real fixtures)', () => {
  it('maps finished games incl. overtime', () => {
    const games = parseElhScoreboard(fx('elh-2026-10-11.json'));
    expect(games).toHaveLength(7);
    expect(games[0]).toEqual({ id: 'cz-hockey:2928321', home: 'HC Sparta Praha', away: 'HC VÍTKOVICE RIDERA', homeScore: 3, awayScore: 0, phase: 'post', detail: 'Konec', startsAt: '2026-10-11T13:00:00.000Z' });
    expect(games.find((g) => g.id === 'cz-hockey:2928318')).toMatchObject({ homeScore: 5, awayScore: 4, detail: 'Konec po prodloužení' });
  });
  it('maps a future game without scores', () => {
    expect(parseElhScoreboard(fx('elh-2026-10-15.json'))).toEqual([
      { id: 'cz-hockey:2928329', home: 'HC Litvínov', away: 'Mountfield HK, a.s.', phase: 'pre', startsAt: '2026-10-15T15:30:00.000Z' },
    ]);
  });
});

/* živé tvary: odvozeno ze skutečného objektu + mapování aliasů z JS hokej.cz (mainScoreboard.js) */
const real = fx('elh-2026-10-11.json')['101'].matches[0];
const live = (alias: string, extra: Record<string, unknown> = {}) =>
  parseElhScoreboard({ 101: { matches: [{ ...real, match_status: 'live', match_actual_time_alias: alias, score_home: 2, score_visitor: 1, ...extra }] } })[0];

describe('parseElhScoreboard (synthesized live shapes)', () => {
  it('periods, intermissions, overtime, shootout', () => {
    expect(live('2')).toMatchObject({ phase: 'live', homeScore: 2, awayScore: 1, clock: '2. třetina' });
    expect(live('1P').detail).toBe('Přestávka po 1. třetině');
    expect(live('20').detail).toBe('Přestávka po 2. třetině');
    expect(live('P')).toMatchObject({ detail: 'Prodloužení' });
    expect(live('4')).toMatchObject({ detail: 'Prodloužení' });
    expect(live('N')).toMatchObject({ detail: 'Nájezdy' });
    const unknown = live('0');
    expect(unknown.phase).toBe('live');
    expect(unknown.clock).toBeUndefined();
    expect(live('K', { match_status: 'po zápase' })).toMatchObject({ phase: 'post', detail: 'Konec' });
    expect(live('KN', { match_status: 'po zápase' }).detail).toBe('Konec po nájezdech');
  });
  it('skips cancelled, other leagues and junk', () => {
    expect(parseElhScoreboard({ 101: { matches: [{ ...real, match_status: 'zrušeno' }] } })).toEqual([]);
    expect(parseElhScoreboard({ 102: { matches: [real] } })).toEqual([]);
    expect(parseElhScoreboard({ 101: { matches: [{ ...real, hokejcz_id: '12/../x' }, null] } })).toEqual([]);
    expect(parseElhScoreboard('<html>')).toEqual([]);
  });
});
