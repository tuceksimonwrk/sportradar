import { describe, expect, it } from 'vitest';
import type { Match, StandingsTable } from '@sportradar/shared';
import { createFetcher, type DetailContext } from './common';
import { FOOTBALL_NO_LINEUP, footballDetail, footballPos, lastN, parseFootballDetail } from './football';
import pre from './fixtures/football-summary-pre.json';
import lineups from './fixtures/football-summary-lineups.json';

const now = new Date('2026-10-12T12:00:00Z');
const covNew: Match = {
  id: 'football:401879267', sport: 'football', competition: 'Premier League', competitionId: 'eng.1',
  startsAt: '2026-10-12T19:00:00.000Z', title: 'Coventry City – Newcastle United', teams: ['football:388', 'football:361'], broadcasters: [],
};
const livMci: Match = { ...covNew, id: 'football:401879264', title: 'Liverpool – Manchester City', teams: ['football:364', 'football:382'] };
const row = (pos: number, teamId: string, values: Record<string, string | number>) => ({ pos, name: teamId, teamId, values });
const standings: StandingsTable[] = [
  { id: 'football-eng.1', sport: 'football', title: 'Premier League', columns: [], rows: [
    row(3, 'football:361', { z: 6, v: 3, r: 2, p: 1, skore: '10:6', rozdil: '+4', b: 11 }),
    row(18, 'football:388', { z: 6, v: 1, r: 0, p: 5, skore: '3:11', rozdil: '-8', b: 3 }),
  ] },
  // stejný klub v tabulce LM se nesmí splést s ligovou tabulkou
  { id: 'football-uefa.champions', sport: 'football', title: 'Liga mistrů', columns: [], rows: [row(1, 'football:361', { z: 1, v: 1, r: 0, p: 0, skore: '4:0', rozdil: '+4', b: 3 })] },
];
type D = ReturnType<typeof parseFootballDetail>;
const blk = (d: D, title: string) => d.stats.find((b) => b.title === title);
const r = (d: D, title: string, label: string) => blk(d, title)?.rows.find((x) => x.label === label);

describe('parseFootballDetail – před zveřejněním sestav', () => {
  const d = parseFootballDetail({ match: covNew, summary: pre, standings, now });
  it('hlavička a zdroj', () => {
    expect(d).toMatchObject({ matchId: 'football:401879267', sport: 'football', source: 'ESPN', homeName: 'Coventry City', awayName: 'Newcastle United' });
  });
  it('tabulka soutěže zápasu (ne Ligy mistrů)', () => {
    expect(blk(d, 'Tabulka')?.note).toBe('Premier League');
    expect(r(d, 'Tabulka', 'Pořadí')).toMatchObject({ home: '18.', away: '3.', lowerIsBetter: true });
    expect(r(d, 'Tabulka', 'Body')).toMatchObject({ home: 3, away: 11 });
    expect(r(d, 'Tabulka', 'V–R–P')).toMatchObject({ home: '1–0–5', away: '3–2–1' });
    expect(r(d, 'Tabulka', 'Vstřelené góly')).toMatchObject({ home: 3, away: 10 });
    expect(r(d, 'Tabulka', 'Obdržené góly')).toMatchObject({ home: 11, away: 6, lowerIsBetter: true });
  });
  it('posledních 5 zápasů: forma (od nejstaršího), body, góly', () => {
    expect(r(d, 'Posledních 5 zápasů', 'Forma')).toMatchObject({ home: 'P P P P V', away: 'V R V P V' });
    expect(r(d, 'Posledních 5 zápasů', 'Body')).toMatchObject({ home: 3, away: 10, homeValue: 3, awayValue: 10 });
    expect(r(d, 'Posledních 5 zápasů', 'Skóre')).toMatchObject({ home: '2:10', away: '8:7', homeValue: -8, awayValue: 1 });
  });
  it('vzájemné zápasy: výhry z pohledu našich domácích + jednotlivé zápasy', () => {
    const b = blk(d, 'Vzájemné zápasy')!;
    expect(b.rows[0]).toMatchObject({ label: 'Výhry', home: 0, away: 4 });
    expect(b.rows[1]).toMatchObject({ label: '17. 2. 2010', home: 1, away: 4 });
    expect(b.note).toBe('Poslední 4 vzájemné zápasy ve všech soutěžích.');
    expect([1, 3, 5].map(lastN)).toEqual(['Poslední vzájemný zápas', 'Poslední 3 vzájemné zápasy', 'Posledních 5 vzájemných zápasů']);
  });
  it('bez sestav → poznámka', () => {
    expect(d.lineups).toBeUndefined();
    expect(d.notes).toContain(FOOTBALL_NO_LINEUP);
  });
});

describe('parseFootballDetail – potvrzené sestavy', () => {
  const d = parseFootballDetail({ match: livMci, summary: lineups, standings: [], now });
  it('základní sestava s rozestavením + střídající', () => {
    expect(d.lineups?.kind).toBe('confirmed');
    const liv = d.lineups!.home;
    expect(liv).toMatchObject({ name: 'Liverpool', teamId: 'football:364' });
    expect(liv.groups.map((g) => [g.title, g.players.length])).toEqual([['Základní sestava (4-2-3-1)', 11], ['Střídající', 9]]);
    expect(liv.groups[0].players[0]).toEqual({ name: 'Alisson Becker', number: '1', pos: 'B' });
    expect(d.lineups!.away.name).toBe('Manchester City');
    expect(d.notes).not.toContain(FOOTBALL_NO_LINEUP);
  });
});

describe('footballPos', () => {
  it('ESPN zkratky → B/O/Z/Ú', () => {
    expect(['G', 'CD-L', 'RB', 'LM', 'AM-R', 'DM', 'F', 'CF-L', 'SUB', ''].map(footballPos)).toEqual(['B', 'O', 'O', 'Z', 'Z', 'Z', 'Ú', 'Ú', undefined, undefined]);
  });
});

describe('footballDetail (builder)', () => {
  const ctx = (urls: string[]): DetailContext => ({
    get: createFetcher(async (u) => { urls.push(u); return JSON.stringify(pre); }), now, matches: [], teams: [], standings,
  });
  it('ESPN: summary dané soutěže', async () => {
    const urls: string[] = [];
    const d = await footballDetail(covNew, ctx(urls));
    expect(urls).toEqual(['https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=401879267']);
    expect(d.stats.length).toBeGreaterThan(0);
  });
  it('Chance Liga: jen tabulka, bez požadavků, poznámka o sestavách', async () => {
    const urls: string[] = [];
    const cz: Match = { ...covNew, id: 'football:cz-8409', competition: 'Chance Liga', competitionId: 'cze.1', title: 'FK Mladá Boleslav – FK Teplice', teams: ['football:cz_fk-mlada-boleslav', 'football:cz_fk-teplice'] };
    const st: StandingsTable[] = [{ id: 'football-cze.1', sport: 'football', title: 'Chance Liga', columns: [], rows: [
      row(4, 'football:cz_fk-mlada-boleslav', { z: 9, v: 5, r: 2, p: 2, skore: '17:12', rozdil: '+5', b: 17 }),
      row(7, 'football:cz_fk-teplice', { z: 10, v: 5, r: 2, p: 3, skore: '18:16', rozdil: '+2', b: 17 }),
    ] }];
    const d = await footballDetail(cz, { ...ctx(urls), standings: st });
    expect(urls).toEqual([]);
    expect(d.source).toBe('chanceliga.cz');
    expect(r(d, 'Tabulka', 'Pořadí')).toMatchObject({ home: '4.', away: '7.' });
    expect(d.notes).toEqual(['Sestavy nejsou k dispozici.']);
  });
  it('neplatné id → výjimka', async () => {
    await expect(footballDetail({ ...covNew, id: 'football:x' }, ctx([]))).rejects.toThrow();
  });
});
