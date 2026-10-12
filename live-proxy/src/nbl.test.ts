import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { nblGames, parseFiba, parseNblSchedule } from './nbl';

const text = (n: string) => readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), 'utf8');
const fiba = () => JSON.parse(text('fiba-2899969-final.json'));

describe('parseNblSchedule (real trimmed /zapasy)', () => {
  it('extracts rows with FIBA id, names and Prague start', () => {
    const rows = parseNblSchedule(text('nbl-zapasy.html'));
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ fibaId: '2899969', home: 'SK Slavia Praha ERA NBK', away: 'BK KVIS Pardubice', startsAt: '2026-10-10T10:00:00.000Z' });
    expect(rows.find((r) => r.fibaId === '2906538')).toEqual({ fibaId: '2906538', home: 'BK KVIS Pardubice', away: 'BK Olomoucko', startsAt: '2026-10-14T15:30:00.000Z' });
  });
  it('ignores junk', () => {
    expect(parseNblSchedule('<tr><td data-sort="x">a</td></tr>')).toEqual([]);
  });
});

describe('parseFiba', () => {
  it('real finished game', () => {
    expect(parseFiba(fiba())).toEqual({ phase: 'post', homeScore: 105, awayScore: 60, detail: 'Konec' });
  });
  const live = (over: Record<string, unknown>, last: Record<string, unknown> = { actionType: '2pt', subType: 'jumpshot' }) => {
    const f = fiba();
    f.pbp = [{ ...f.pbp[2], ...last }, ...f.pbp.slice(-2)]; // poslední akce + start zápasu
    f.tm['1'].tot_sPoints = 41; f.tm['2'].tot_sPoints = 38;
    return parseFiba({ ...f, ...over });
  };
  it('synthesized: running 2nd quarter, halftime, end of 3rd, overtime', () => {
    expect(live({ period: 2, clock: '04:05' })).toEqual({ phase: 'live', homeScore: 41, awayScore: 38, clock: '2. čtvrtina 4:05' });
    expect(live({ period: 2, clock: '00:00' }, { actionType: 'period', subType: 'end' })).toEqual({ phase: 'live', homeScore: 41, awayScore: 38, detail: 'Poločas' });
    expect(live({ period: 3, clock: '00:00' }, { actionType: 'period', subType: 'end' }).detail).toBe('Konec 3. čtvrtiny');
    expect(live({ period: 5, periodType: 'OVERTIME', clock: '03:10', inOT: 1 })).toMatchObject({ clock: '3:10', detail: 'Prodloužení' });
  });
  it('synthesized: finished after overtime; no play-by-play yet = pre', () => {
    const f = fiba(); f.period = 5; f.periodType = 'OVERTIME';
    expect(parseFiba(f)?.detail).toBe('Konec po prodloužení');
    expect(parseFiba({ ...fiba(), pbp: [] })).toEqual({ phase: 'pre' });
    expect(parseFiba(null)).toBeUndefined();
    expect(parseFiba({ tm: {} })).toBeUndefined();
  });
});

describe('nblGames', () => {
  const rows = [
    { fibaId: '1', home: 'A', away: 'B', startsAt: '2026-10-14T15:30:00.000Z' },
    { fibaId: '2', home: 'C', away: 'D', startsAt: '2026-10-14T18:00:00.000Z' },
    { home: 'E', away: 'F', startsAt: '2026-10-14T16:00:00.000Z' },
    { fibaId: '3', home: 'G', away: 'H', startsAt: '2026-10-13T15:30:00.000Z' },
    { fibaId: '4', home: 'I', away: 'J', startsAt: '2026-10-14T13:00:00.000Z' },
  ];
  it('asks FIBA only for started games in the window; later games today are pre', async () => {
    const asked: string[] = [];
    const now = Date.parse('2026-10-14T16:10:00Z');
    const games = await nblGames(rows, now, async (id) => {
      asked.push(id);
      return id === '1' ? { phase: 'live', homeScore: 10, awayScore: 8, clock: '1. čtvrtina 2:00' } : undefined;
    });
    expect(asked.sort()).toEqual(['1', '4']);
    expect(games).toEqual([
      { home: 'A', away: 'B', startsAt: '2026-10-14T15:30:00.000Z', phase: 'live', homeScore: 10, awayScore: 8, clock: '1. čtvrtina 2:00' },
      { home: 'E', away: 'F', startsAt: '2026-10-14T16:00:00.000Z', phase: 'pre' }, // bez FIBA id, začal před 10 min
      { home: 'C', away: 'D', startsAt: '2026-10-14T18:00:00.000Z', phase: 'pre' },
    ]); // I–J (3 h po začátku, FIBA nic) se vynechá: stav neznáme
  });
  it('a game just starting without FIBA data stays pre', async () => {
    const games = await nblGames([rows[0]], Date.parse('2026-10-14T15:35:00Z'), async () => undefined);
    expect(games).toEqual([{ home: 'A', away: 'B', startsAt: '2026-10-14T15:30:00.000Z', phase: 'pre' }]);
  });
});
