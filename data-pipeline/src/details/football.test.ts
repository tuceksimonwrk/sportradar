import { describe, expect, it } from 'vitest';
import type { Match, StandingsTable } from '@sportradar/shared';
import { createFetcher, type DetailContext } from './common';
import { readFileSync } from 'node:fs';
import { CZ_NO_LINEUP, CZ_SQUAD_NOTE, FOOTBALL_NO_LINEUP, FOOTBALL_SQUAD_NOTE, footballDetail, footballPos, lastN, parseCzSquad, parseEspnSquad, parseFootballDetail } from './football';
import slaviaRoster from './fixtures/football-roster-slavia.json';
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

describe('parseFootballDetail – český klub s id z chanceliga.cz (sjednocená identita)', () => {
  it('ESPN id strany se dohledá ze summary podle domácí/hosté; teamId v sestavě zůstává české', () => {
    const czHome: Match = { ...covNew, teams: ['football:cz_sk-slavia-praha', 'football:361'] };
    const d = parseFootballDetail({ match: czHome, summary: pre, standings: [], now });
    expect(r(d, 'Posledních 5 zápasů', 'Forma')).toMatchObject({ home: 'P P P P V' });
    expect(blk(d, 'Vzájemné zápasy')!.rows[0]).toMatchObject({ home: 0, away: 4 });
    const l = parseFootballDetail({ match: { ...livMci, teams: ['football:cz_sk-slavia-praha', 'football:382'] }, summary: lineups, standings: [], now });
    expect(l.lineups!.home.teamId).toBe('football:cz_sk-slavia-praha');
    expect(l.lineups!.home.groups[0].players).toHaveLength(11);
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

const rosterUrl = (league: string, id: string) => `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams/${id}/roster`;
const KADR = (slug: string) => `https://www.chanceliga.cz/klub/kadr/${slug}`;
const rozpis = readFileSync(new URL('../adapters/fixtures/chanceliga-rozpis.html', import.meta.url), 'utf8');
const kadr = readFileSync(new URL('./fixtures/chanceliga-kadr-slavia.html', import.meta.url), 'utf8');

describe('parseEspnSquad (reálná soupiska ESPN)', () => {
  const g = parseEspnSquad(slaviaRoster);
  it('čtyři skupiny česky, čísla dresů, bez čísla jméno zůstane, řazení podle čísla', () => {
    expect(g.map((x) => [x.title, x.players.length])).toEqual([['Brankáři', 4], ['Obránci', 15], ['Záložníci', 11], ['Útočníci', 5]]);
    const all = g.flatMap((x) => x.players);
    expect(all.find((p) => p.name === 'Adam Rezek')).toEqual({ name: 'Adam Rezek' });
    expect(all.filter((p) => p.number).every((p) => /^\d+$/.test(String(p.number)))).toBe(true);
    const n = g[1].players.map((p) => Number(p.number ?? 999));
    expect(n).toEqual([...n].sort((a, b) => a - b));
  });
  it('neznámý post → Ostatní; zranění → štítek; prázdná/nesmyslná data → []', () => {
    const x = structuredClone(slaviaRoster) as any;
    x.athletes[0].position = { abbreviation: 'XX' };
    x.athletes[1].injuries = [{ status: 'Out' }];
    const gg = parseEspnSquad(x);
    expect(gg.at(-1)).toMatchObject({ title: 'Ostatní', players: [{ name: x.athletes[0].displayName }] });
    expect(gg.flatMap((q) => q.players).find((p) => p.name === x.athletes[1].displayName)?.status).toBe('Zraněn');
    expect(parseEspnSquad({ athletes: [] })).toEqual([]);
    expect(parseEspnSquad({})).toEqual([]);
  });
});

describe('parseCzSquad (reálný kádr chanceliga.cz)', () => {
  it('B/O/Z/U → Brankáři, Obránci, Záložníci, Útočníci', () => {
    const g = parseCzSquad(kadr);
    expect(g.map((x) => [x.title, x.players.length])).toEqual([['Brankáři', 3], ['Obránci', 11], ['Záložníci', 10], ['Útočníci', 5]]);
    expect(g[0].players[0]).toEqual({ name: 'Ondřej Kolář', number: '1' });
  });
  it('změněné HTML → []', () => { expect(parseCzSquad('<table><thead><tr><th>x</th></tr></thead></table>')).toEqual([]); });
});

describe('footballDetail (builder)', () => {
  const ctxWith = (urls: string[], resp: (u: string) => unknown, extra: Partial<DetailContext> = {}): DetailContext => ({
    get: createFetcher(async (u) => { urls.push(u); const v = resp(u); if (v instanceof Error) throw v; return typeof v === 'string' ? v : JSON.stringify(v); }),
    now, matches: [], teams: [
      { id: 'football:388', sport: 'football', name: 'Coventry City', league: 'eng.1' },
      { id: 'football:361', sport: 'football', name: 'Newcastle United', league: 'eng.1' },
    ], standings, ...extra,
  });
  it('bez potvrzených sestav: soupisky obou týmů z domácí ligy (kind roster) + poznámka', async () => {
    const urls: string[] = [];
    const d = await footballDetail(covNew, ctxWith(urls, (u) => (u.includes('/roster') ? slaviaRoster : pre)));
    expect(urls).toEqual(['https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=401879267', rosterUrl('eng.1', '388'), rosterUrl('eng.1', '361')]);
    expect(d.lineups?.kind).toBe('roster');
    expect(d.lineups!.home.groups.map((g) => g.title)).toEqual(['Brankáři', 'Obránci', 'Záložníci', 'Útočníci']);
    expect(d.notes).toEqual([FOOTBALL_SQUAD_NOTE]);
  });
  it('soupiska 404 v lize → zkusí další soutěž; nikde → bez sestav + poznámka', async () => {
    const urls: string[] = [];
    const cl: Match = { ...covNew, competitionId: 'uefa.champions', competition: 'Liga mistrů' };
    const d = await footballDetail(cl, ctxWith(urls, (u) => (u === rosterUrl('eng.1', '388') ? new Error('HTTP 404') : u.includes('/roster') ? slaviaRoster : pre)));
    expect(urls).toContain(rosterUrl('uefa.champions', '388'));
    expect(d.lineups?.kind).toBe('roster');
    const none = await footballDetail(covNew, ctxWith([], (u) => (u.includes('/roster') ? new Error('HTTP 404') : pre)));
    expect(none.lineups).toBeUndefined();
    expect(none.notes).toContain(FOOTBALL_NO_LINEUP);
  });
  it('potvrzené sestavy → soupisky se nestahují', async () => {
    const urls: string[] = [];
    const d = await footballDetail(livMci, ctxWith(urls, () => lineups));
    expect(d.lineups?.kind).toBe('confirmed');
    expect(urls.filter((u) => u.includes('/roster'))).toEqual([]);
  });
  it('Chance Liga: tabulka + soupisky z chanceliga.cz (číslo klubu z rozpisu), jinak poznámka', async () => {
    const cz: Match = { ...covNew, id: 'football:cz-8409', competition: 'Chance Liga', competitionId: 'cze.1', title: 'SK Slavia Praha – FK Teplice', teams: ['football:cz_sk-slavia-praha', 'football:cz_fk-teplice'] };
    const st: StandingsTable[] = [{ id: 'football-cze.1', sport: 'football', title: 'Chance Liga', columns: [], rows: [
      row(1, 'football:cz_sk-slavia-praha', { z: 10, v: 8, r: 2, p: 0, skore: '26:6', rozdil: '+20', b: 26 }),
      row(7, 'football:cz_fk-teplice', { z: 10, v: 5, r: 2, p: 3, skore: '18:16', rozdil: '+2', b: 17 }),
    ] }];
    const urls: string[] = [];
    const d = await footballDetail(cz, ctxWith(urls, (u) => (u.endsWith('/rozpis-zapasu') ? rozpis : kadr), { standings: st }));
    expect(urls).toEqual(['https://www.chanceliga.cz/rozpis-zapasu', KADR('5-sk-slavia-praha'), KADR('17-fk-teplice')]);
    expect(d.source).toBe('chanceliga.cz');
    expect(r(d, 'Tabulka', 'Pořadí')).toMatchObject({ home: '1.', away: '7.' });
    expect(d.lineups?.kind).toBe('roster');
    expect(d.notes).toEqual([CZ_SQUAD_NOTE]);
    const fail = await footballDetail(cz, ctxWith([], () => new Error('HTTP 503'), { standings: st }));
    expect(fail.lineups).toBeUndefined();
    expect(fail.notes).toEqual([CZ_NO_LINEUP]);
  });
  it('neplatné id → výjimka', async () => {
    await expect(footballDetail({ ...covNew, id: 'football:x' }, ctxWith([], () => pre))).rejects.toThrow();
  });
});
