import { describe, expect, it } from 'vitest';
import type { Match } from '@sportradar/shared';
import { createFetcher, type DetailContext } from './common';
import { nhlDetail, parseNhlDetail } from './nhl';
import landing from './fixtures/nhl-landing.json';
import standings from './fixtures/nhl-standings.json';
import rosterChi from './fixtures/nhl-roster-chi.json';
import rosterPit from './fixtures/nhl-roster-pit.json';

const now = new Date('2026-10-12T12:00:00Z');
const match: Match = {
  id: 'nhl:2026020098', sport: 'nhl', competition: 'NHL', startsAt: '2026-10-14T00:00:00.000Z',
  title: 'Chicago Blackhawks – Pittsburgh Penguins', teams: ['nhl:CHI', 'nhl:PIT'], broadcasters: [],
};
const block = (d: ReturnType<typeof parseNhlDetail>, title: string) => d.stats.find((b) => b.title === title);
const row = (d: ReturnType<typeof parseNhlDetail>, title: string, label: string) => block(d, title)?.rows.find((r) => r.label === label);

describe('parseNhlDetail', () => {
  const d = parseNhlDetail({ match, landing, standings, rosters: { home: rosterChi, away: rosterPit }, now });

  it('hlavička', () => {
    expect(d).toMatchObject({ matchId: 'nhl:2026020098', sport: 'nhl', source: 'NHL.com', homeName: 'Chicago Blackhawks', awayName: 'Pittsburgh Penguins', generatedAt: now.toISOString() });
  });
  it('Sezóna ze standings (domácí CHI, hosté PIT)', () => {
    expect(row(d, 'Sezóna', 'Body')).toMatchObject({ home: 2, away: 7, homeValue: 2, awayValue: 7 });
    expect(row(d, 'Sezóna', 'Pořadí v konferenci')).toMatchObject({ home: '15.', away: '7.', homeValue: 15, awayValue: 7, lowerIsBetter: true });
    expect(row(d, 'Sezóna', 'Bilance V–P–PP')).toMatchObject({ home: '1–5–0', away: '3–2–1' });
    expect(row(d, 'Sezóna', 'Góly vstřelené / zápas')).toMatchObject({ home: '2,00', away: '3,67' });
    expect(row(d, 'Sezóna', 'Góly obdržené / zápas')).toMatchObject({ home: '4,33', away: '2,83', lowerIsBetter: true });
    expect(row(d, 'Sezóna', 'Rozdíl skóre')).toMatchObject({ home: '−14', away: '+5', homeValue: -14, awayValue: 5 });
    expect(row(d, 'Sezóna', 'Doma / venku')).toMatchObject({ home: '1–1–0', away: '1–1–1' });
    expect(row(d, 'Sezóna', 'Série')).toMatchObject({ home: '2 prohry', away: '1 výhra' });
  });
  it('Brankáři z goalieComparison', () => {
    expect(row(d, 'Brankáři', 'Obdržené góly na zápas')).toMatchObject({ home: '4,33', away: '2,67', lowerIsBetter: true });
    expect(row(d, 'Brankáři', 'Úspěšnost zákroků')).toMatchObject({ home: '85,7 %', away: '91,0 %' });
    expect(row(d, 'Brankáři', 'Čistá konta')).toMatchObject({ home: 0, away: 1 });
    expect(row(d, 'Brankáři', 'Nejvytíženější brankář')?.home).toBe('S. Knight (1-3-0)');
  });
  it('Forma (posledních 5) a nejlepší hráči sezóny', () => {
    expect(row(d, 'Forma – posledních 5 zápasů', 'Body')).toMatchObject({ home: 'A. Frondell 4', away: 'B. Kindel 4', homeValue: 4, awayValue: 4 });
    expect(row(d, 'Nejlepší hráči sezóny', 'Body')).toMatchObject({ home: 'A. Frondell 4', away: 'T. Novak 5' });
    expect(row(d, 'Nejlepší hráči sezóny', 'Góly')?.away).toMatch(/^(T\. Novak|N\. Robertson) 3$/);
  });
  it('Soupisky: útočníci / obránci / brankáři, česká jména, čísla', () => {
    expect(d.lineups?.kind).toBe('roster');
    expect(d.lineups?.home.teamId).toBe('nhl:CHI');
    expect(d.lineups?.home.groups.map((g) => g.title)).toEqual(['Útočníci', 'Obránci', 'Brankáři']);
    const g = d.lineups!.home.groups[2].players;
    expect(g).toContainEqual({ name: 'Arvid Söderblom', number: 40, pos: 'B' });
    const pit = d.lineups!.away.groups[0].players;
    expect(pit.find((p) => p.number === 59)?.name).toBe('Egor Činachov');
    expect(pit.every((p, i) => i === 0 || Number(p.number) >= Number(pit[i - 1].number))).toBe(true);
    expect(d.notes.join(' ')).toMatch(/Soupiska/);
  });
  it('chybějící data: bez rosterů a standings jen poznámka, bez pádu', () => {
    const e = parseNhlDetail({ match, landing: { homeTeam: landing.homeTeam, awayTeam: landing.awayTeam }, standings: null, rosters: {}, now });
    expect(e.stats).toEqual([]);
    expect(e.lineups).toBeUndefined();
    expect(e.notes.some((n) => /nepodařilo/.test(n))).toBe(true);
  });
});

describe('nhlDetail (fetch)', () => {
  it('stáhne landing, standings a 2 soupisky; standings se cachuje', async () => {
    const calls: string[] = [];
    const data: Record<string, unknown> = {
      'https://api-web.nhle.com/v1/gamecenter/2026020098/landing': landing,
      'https://api-web.nhle.com/v1/standings/now': standings,
      'https://api-web.nhle.com/v1/roster/CHI/current': rosterChi,
      'https://api-web.nhle.com/v1/roster/PIT/current': rosterPit,
    };
    const get = createFetcher(async (u) => { calls.push(u); if (!(u in data)) throw new Error(`404 ${u}`); return JSON.stringify(data[u]); });
    const ctx: DetailContext = { get, now, matches: [match], teams: [], standings: [] };
    const d = await nhlDetail(match, ctx);
    await nhlDetail(match, ctx);
    expect(d.lineups?.away.groups[0].players.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.includes('standings')).length).toBe(1);
    expect(get.count).toBe(4);
  });
  it('selhání landing = chyba detailu', async () => {
    const get = createFetcher(async () => { throw new Error('HTTP 500'); });
    await expect(nhlDetail(match, { get, now, matches: [], teams: [], standings: [] })).rejects.toThrow();
  });
});
