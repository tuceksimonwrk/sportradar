import { describe, expect, it } from 'vitest';
import { nbaAdapter, nbaDateRange, nbaPastRange, parseNba, parseNbaStandings } from './nba';

const comp = (home: [string, string], away: [string, string], venue?: object, score?: [unknown, unknown]) => ({
  ...(venue ? { venue } : {}),
  competitors: [
    { homeAway: 'home', team: { abbreviation: home[0], displayName: home[1] }, ...(score ? { score: score[0] } : {}) },
    { homeAway: 'away', team: { abbreviation: away[0], displayName: away[1] }, ...(score ? { score: score[1] } : {}) },
  ],
});
const json = { events: [
  { id: '1', date: '2026-10-21T23:00Z', status: { type: { state: 'pre' } }, season: { type: 2 }, competitions: [comp(['ORL', 'Orlando Magic'], ['ATL', 'Atlanta Hawks'], { fullName: 'Kia Center', address: { city: 'Orlando' } })] },
  { id: '2', date: '2026-10-21T20:00Z', status: { type: { state: 'post' } }, season: { type: 2 }, competitions: [comp(['BOS', 'Boston Celtics'], ['NYK', 'New York Knicks'])] },
  { id: '3', date: '2026-10-22T01:00Z', status: { type: { state: 'pre' } }, season: { type: 1 }, competitions: [comp(['LAL', 'Los Angeles Lakers'], ['GSW', 'Golden State Warriors'])] },
] };

const now0 = new Date('2026-10-22T12:00:00Z');
describe('parseNba', () => {
  const r = parseNba(json, now0);
  it('vezme jen nezačaté/probíhající', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['nba:1', 'nba:3']);
  });
  it('mapuje čas, titulek, týmy a typ soutěže', () => {
    expect(r.matches[0]).toMatchObject({
      startsAt: '2026-10-21T23:00:00.000Z', title: 'Orlando Magic – Atlanta Hawks',
      teams: ['nba:ORL', 'nba:ATL'], competition: 'NBA',
    });
    expect(r.matches[1].competition).toBe('NBA (přípravné)');
    expect(r.teams).toHaveLength(6);
  });
  it('doplní venue; bez venue klíč chybí', () => {
    expect(r.matches[0].venue).toEqual({ name: 'Kia Center', city: 'Orlando' });
    expect(r.matches[1]).not.toHaveProperty('venue');
  });
  it('prázdný vstup nepadne', () => { expect(parseNba({}, now0).matches).toEqual([]); });
});

describe('parseNba – výsledky', () => {
  const ev = (id: string, date: string, state: string, score?: [unknown, unknown], shortDetail = 'Final') => ({
    id, date, status: { type: { state, shortDetail, completed: true } }, season: { type: 2 },
    competitions: [comp(['BOS', 'Boston Celtics'], ['NYK', 'New York Knicks'], undefined, score)],
  });
  it('post se skóre → result (skóre je string)', () => {
    const r = parseNba({ events: [ev('9', '2026-10-21T23:00Z', 'post', ['110', '104'])] }, now0);
    expect(r.matches[0].result).toEqual({ home: 110, away: 104, homeName: 'Boston Celtics', awayName: 'New York Knicks' });
  });
  it('prodloužení → note', () => {
    const r = parseNba({ events: [ev('9', '2026-10-21T23:00Z', 'post', [110, 104], 'Final/OT')] }, now0);
    expect(r.matches[0].result?.note).toBe('po prodloužení');
  });
  it('post bez dokončení (odložený) se skórem 0 není výsledek ani nadcházející', () => {
    const e = { ...ev('5', '2026-10-21T23:00Z', 'post', ['0', '0']), status: { type: { state: 'post', name: 'STATUS_POSTPONED', completed: false } } };
    expect(parseNba({ events: [e] }, now0).matches).toEqual([]);
  });
  it('dokončení: completed nebo STATUS_FINAL', () => {
    const a = { ...ev('6', '2026-10-21T23:00Z', 'post', [1, 2]), status: { type: { state: 'post', completed: true } } };
    const b = { ...ev('7', '2026-10-21T23:00Z', 'post', [1, 2]), status: { type: { state: 'post', name: 'STATUS_FINAL' } } };
    expect(parseNba({ events: [a, b] }, now0).matches).toHaveLength(2);
  });
  it('resultsOnly vynechá nadcházející/rozehrané', () => {
    const r = parseNba(json, now0, { resultsOnly: true });
    expect(r.matches).toEqual([]);
  });
  it('bez/neplatné skóre a starší než 14 dní se přeskočí', () => {
    const r = parseNba({ events: [ev('1', '2026-10-21T23:00Z', 'post'), ev('2', '2026-10-21T23:00Z', 'post', ['x', '3']), ev('3', '2026-10-01T23:00Z', 'post', [1, 2])] }, now0);
    expect(r.matches).toEqual([]);
  });
});

describe('nbaPastRange', () => {
  it('4 dny před začátkem hlavního rozsahu', () => {
    const now = new Date('2026-10-12T01:00:00Z');
    expect(nbaPastRange(now)).toEqual(['20261007', '20261008', '20261009', '20261010']);
    expect(nbaPastRange(now, 2)).toEqual(['20261009', '20261010']);
    expect(nbaDateRange(now)[0]).toBe('20261011');
  });
});

describe('nbaDateRange', () => {
  it('začíná dnem předtím (americké datum) a má 15 dní', () => {
    const d = nbaDateRange(new Date('2026-10-12T01:00:00Z'));
    expect(d).toHaveLength(15);
    expect(d[0]).toBe('20261011');
    expect(d[14]).toBe('20261025');
  });
});

describe('nbaAdapter.fetch', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('selhání jednoho dne shodí fetch', async () => {
    let n = 0;
    const get = async () => { if (++n === 3) throw new Error('boom'); return json; };
    await expect(nbaAdapter.fetch(now, get as any)).rejects.toThrow();
  });
  it('vše OK vrátí data', async () => {
    const r = await nbaAdapter.fetch(now, (async () => json) as any);
    expect(r.matches.length).toBeGreaterThan(0);
  });
  it('minulý rozsah dodá jen výsledky (stará nadcházející data se nepřidají)', async () => {
    const past = new Set(nbaPastRange(now));
    const get = async (url: string) => (past.has(/dates=([0-9]+)/.exec(url)![1]) ? json : { events: [] });
    const r = await nbaAdapter.fetch(now, get as any);
    expect(r.matches).toEqual([]);
  });
  it('selhání minulého dne se ignoruje, výsledky se přidají', async () => {
    const past = new Set(nbaPastRange(now));
    const done = { events: [{ id: '77', date: '2026-10-10T23:00Z', status: { type: { state: 'post', completed: true, shortDetail: 'Final' } }, season: { type: 2 }, competitions: [comp(['BOS', 'Boston Celtics'], ['NYK', 'New York Knicks'], undefined, [100, 90])] }] };
    let n = 0;
    const get = async (url: string) => {
      const d = /dates=([0-9]+)/.exec(url)![1];
      if (past.has(d)) { if (++n === 1) throw new Error('past boom'); return done; }
      return json;
    };
    const r = await nbaAdapter.fetch(now, get as any);
    expect(r.matches.filter((m) => m.result)).toHaveLength(1);
    expect(r.matches.filter((m) => !m.result).length).toBeGreaterThan(0);
  });
});

describe('parseNbaStandings', () => {
  const stat = (name: string, displayValue: string, value = Number(displayValue)) => ({ name, displayValue, value });
  const entry = (abbr: string, seed: string | null, w: string, l: string, pct: string, gb: string, pctVal = Number(pct)) => ({
    team: { abbreviation: abbr, displayName: `Tým ${abbr}` },
    stats: [stat('wins', w), stat('losses', l), stat('winPercent', pct, pctVal), stat('gamesBehind', gb), ...(seed ? [stat('playoffSeed', seed)] : [])],
  });
  const standJson = { children: [
    { name: 'Eastern Conference', standings: { entries: [entry('NY', '2', '1', '1', '.500', '1'), entry('BOS', '1', '2', '0', '1.000', '-')] } },
    { name: 'Western Conference', standings: { entries: [
      entry('LAL', null, '1', '1', '.500', '1'), entry('DEN', null, '2', '0', '1.000', '-'),
      { team: { abbreviation: 'UTA', displayName: 'Utah Jazz' }, stats: [] },
    ] } },
  ] };
  const t = parseNbaStandings(standJson);
  it('dvě tabulky podle konference, řazené podle playoffSeed', () => {
    expect(t.map((x) => x.id)).toEqual(['nba-east', 'nba-west']);
    expect(t[0].title).toBe('NBA – Východní konference');
    expect(t[0].rows.map((r) => [r.pos, r.teamId])).toEqual([[1, 'nba:BOS'], [2, 'nba:NY']]);
    expect(t[0].columns.map((c) => c.label)).toEqual(['V', 'P', '%', 'Ztr.']);
    expect(t[0].rows[0].values).toEqual({ v: 2, p: 0, pct: '1.000', gb: '-' });
  });
  it('bez playoffSeed řadí podle winPercent, tým bez statistik skončí poslední s –', () => {
    expect(t[1].rows.map((r) => r.teamId)).toEqual(['nba:DEN', 'nba:LAL', 'nba:UTA']);
    expect(t[1].rows.map((r) => r.pos)).toEqual([1, 2, 3]);
    expect(t[1].rows[2].values).toEqual({ v: '–', p: '–', pct: '–', gb: '–' });
  });
  it('prázdný / změněný vstup → []', () => {
    expect(parseNbaStandings({ children: [{ name: 'Eastern Conference', standings: { entries: [] } }] })).toEqual([]);
    expect(parseNbaStandings({ children: [] })).toEqual([]);
    expect(() => parseNbaStandings({})).toThrow();
    expect(() => parseNbaStandings(undefined)).toThrow();
  });
  it('playoffSeed 0 nebo chybějící = nejnižší priorita (řadí se podle winPercent)', () => {
    const r = parseNbaStandings({ children: [{ name: 'Eastern Conference', standings: { entries: [
      entry('AAA', '0', '3', '0', '1.000', '-'), entry('BBB', '1', '1', '2', '.333', '2'), entry('CCC', null, '2', '1', '.667', '1'),
    ] } }] });
    expect(r[0].rows.map((x) => x.teamId)).toEqual(['nba:BBB', 'nba:AAA', 'nba:CCC']);
  });
});

describe('nbaAdapter.fetch – tabulky', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const stand = { children: [{ name: 'Eastern Conference', standings: { entries: [{ team: { abbreviation: 'BOS', displayName: 'Boston Celtics' }, stats: [{ name: 'wins', displayValue: '1', value: 1 }] }] } }] };
  it('úspěch: standings přítomné', async () => {
    const r = await nbaAdapter.fetch(now, (async (u: string) => (u.includes('/standings') ? stand : json)) as any);
    expect(r.standings?.[0].id).toBe('nba-east');
    expect(r.standingsError).toBeUndefined();
  });
  it('selhání tabulky nezabije zápasy', async () => {
    const r = await nbaAdapter.fetch(now, (async (u: string) => { if (u.includes('/standings')) throw new Error('boom'); return json; }) as any);
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.standings).toBeUndefined();
    expect(r.standingsError).toContain('boom');
  });
});
