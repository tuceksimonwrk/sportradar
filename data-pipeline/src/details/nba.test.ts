import { describe, expect, it } from 'vitest';
import type { Match, StandingsTable } from '@sportradar/shared';
import { createFetcher, type DetailContext } from './common';
import { nbaDetail, nbaStatus, parseNbaDetail } from './nba';
import summary from './fixtures/nba-summary.json';
import summaryLeaders from './fixtures/nba-summary-leaders.json';
import roster from './fixtures/nba-roster.json';

const now = new Date('2026-10-12T12:00:00Z');
const match: Match = {
  id: 'nba:401908621', sport: 'nba', competition: 'NBA (přípravné)', startsAt: '2026-10-14T00:00:00.000Z',
  title: 'Oklahoma City Thunder – Indiana Pacers', teams: ['nba:OKC', 'nba:IND'], broadcasters: [],
};
const standings: StandingsTable[] = [
  { id: 'nba-west', sport: 'nba', title: 'W', columns: [], rows: [{ pos: 9, name: 'Oklahoma City Thunder', teamId: 'nba:OKC', values: { v: 0, p: 2, pct: '.000', gb: '1.5' } }] },
  { id: 'nba-east', sport: 'nba', title: 'E', columns: [], rows: [{ pos: 4, name: 'Indiana Pacers', teamId: 'nba:IND', values: { v: 1, p: 1, pct: '.500', gb: '0.5' } }] },
];
type D = ReturnType<typeof parseNbaDetail>;
const row = (d: D, title: string, label: string) => d.stats.find((b) => b.title === title)?.rows.find((r) => r.label === label);

describe('parseNbaDetail', () => {
  const d = parseNbaDetail({ match, summary, standings, rosters: { home: roster }, now });

  it('hlavička a zdroj', () => {
    expect(d).toMatchObject({ matchId: 'nba:401908621', sport: 'nba', source: 'ESPN', homeName: 'Oklahoma City Thunder', awayName: 'Indiana Pacers' });
  });
  it('Sezóna: tabulka + záznamy ze summary', () => {
    expect(row(d, 'Sezóna', 'Pořadí v konferenci')).toMatchObject({ home: '9.', away: '4.', lowerIsBetter: true });
    expect(row(d, 'Sezóna', 'Bilance V–P')).toMatchObject({ home: '0–2', away: '1–1' });
    expect(row(d, 'Sezóna', 'Úspěšnost')).toMatchObject({ home: '0,0 %', away: '50,0 %', homeValue: 0, awayValue: 0.5 });
    expect(row(d, 'Sezóna', 'Doma / venku')).toMatchObject({ home: '0–1', away: '0–0' });
    expect(row(d, 'Sezóna', 'Obdržené body / zápas')).toMatchObject({ home: '122,0', away: '115,5', lowerIsBetter: true });
    expect(row(d, 'Sezóna', 'Série')).toMatchObject({ home: '2 prohry', away: '1 prohra' });
    expect(d.stats.find((b) => b.title === 'Sezóna')?.note).toMatch(/Přípravn/);
  });
  it('Posledních 5 zápasů: bilance, forma, průměry', () => {
    expect(row(d, 'Posledních 5 zápasů', 'Bilance')).toMatchObject({ home: '1–4', away: '2–3', homeValue: 1, awayValue: 2 });
    expect(row(d, 'Posledních 5 zápasů', 'Forma')).toMatchObject({ home: 'V P P P P', away: 'V P P V P' });
    expect(row(d, 'Posledních 5 zápasů', 'Body / zápas')).toMatchObject({ home: '111,4', away: '115,6' });
    expect(row(d, 'Posledních 5 zápasů', 'Obdržené / zápas')).toMatchObject({ home: '117,4', away: '112,6', lowerIsBetter: true });
  });
  it('Vzájemné zápasy: zatím nehráli → blok s poznámkou bez řádků', () => {
    const b = d.stats.find((x) => x.title === 'Vzájemné zápasy');
    expect(b?.rows).toEqual([]);
    expect(b?.note).toMatch(/2×/);
  });
  it('Vzájemné zápasy: odehraný zápas se započítá ze strany našich domácích', () => {
    const s = structuredClone(summary) as any;
    const ev = s.seasonseries[0].events[0];
    ev.statusType = { state: 'post', completed: true };
    ev.competitors[0].score = '101'; ev.competitors[1].score = '110'; // IND doma 101, OKC 110
    const b = parseNbaDetail({ match, summary: s, standings, rosters: {}, now }).stats.find((x) => x.title === 'Vzájemné zápasy')!;
    expect(b.rows[0]).toMatchObject({ label: 'Výhry', home: 1, away: 0 });
    expect(b.rows[1]).toMatchObject({ label: '24. 11.', home: 110, away: 101 });
  });
  it('lídři týmu podle id týmu', () => {
    const m2: Match = { ...match, id: 'nba:1', title: 'Denver Nuggets – Chicago Bulls', teams: ['nba:DEN', 'nba:CHI'] };
    const l = parseNbaDetail({ match: m2, summary: summaryLeaders, standings: [], rosters: {}, now });
    expect(row(l, 'Lídři týmu', 'Body')).toMatchObject({ home: 'A. Gordon 25', away: 'L. Miller 26', homeValue: 25, awayValue: 26 });
    expect(row(l, 'Lídři týmu', 'Doskoky')).toMatchObject({ home: 'N. Jokic 11', away: 'L. Miller 7' });
  });
  it('soupiska po pozicích + zdravotní stav ze summary', () => {
    expect(d.lineups).toBeUndefined(); // chybí soupiska hostů → bez sestav
    const full = parseNbaDetail({ match, summary, standings, rosters: { home: roster, away: roster }, now });
    const okc = full.lineups!.home;
    expect(okc.groups.map((g) => g.title)).toEqual(['Rozehrávači', 'Křídla', 'Pivoti']);
    const sorber = okc.groups[2].players.find((p) => p.name === 'Thomas Sorber');
    expect(sorber).toMatchObject({ number: '12', pos: 'C', status: 'Nejistý' });
    expect(okc.groups[0].players.find((p) => p.name === 'Josh Dix')?.status).toBeUndefined();
    // stav z rosteru (Caruso je DTD jen v rosteru)
    expect(okc.groups[0].players.find((p) => p.name === 'Alex Caruso')?.status).toBe('Nejistý');
  });
  it('prázdné summary nepadne', () => {
    const e = parseNbaDetail({ match, summary: {}, standings: [], rosters: {}, now });
    expect(e.stats).toEqual([]);
    expect(e.notes.length).toBeGreaterThan(0);
  });
});

describe('nbaStatus', () => {
  it('překlad stavů', () => {
    expect(nbaStatus('Out')).toBe('Zraněn');
    expect(nbaStatus('Day-To-Day')).toBe('Nejistý');
    expect(nbaStatus('Questionable')).toBe('Nejistý');
    expect(nbaStatus('Doubtful')).toBe('Pochybný');
    expect(nbaStatus('Suspension')).toBe('Suspendován');
    expect(nbaStatus('Active')).toBeUndefined();
    expect(nbaStatus('Something')).toBe('Omezení');
  });
});

describe('nbaDetail (fetch)', () => {
  it('summary + soupisky podle ESPN id týmů (z hlavičky)', async () => {
    const calls: string[] = [];
    const get = createFetcher(async (u) => {
      calls.push(u);
      if (u.includes('summary?event=401908621')) return JSON.stringify(summary);
      if (/teams\/(25|11)\/roster$/.test(u)) return JSON.stringify(roster);
      throw new Error(`404 ${u}`);
    });
    const ctx: DetailContext = { get, now, matches: [], teams: [], standings };
    const d = await nbaDetail(match, ctx);
    expect(d.lineups?.away.teamId).toBe('nba:IND');
    expect(calls.sort()).toEqual([
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401908621',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/11/roster',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/25/roster',
    ]);
  });
});
