import { describe, expect, it } from 'vitest';
import { espnMonths, fetchEspnCompetition, parseEspnFootball, parseEspnFootballStandings } from './football-espn';
import scoreboard from './fixtures/espn-football-scoreboard.json';
import knockout from './fixtures/espn-football-ucl-knockout.json';
import standEng from './fixtures/espn-football-standings-eng.json';
import standUcl from './fixtures/espn-football-standings-ucl.json';

const now = new Date('2026-10-12T12:00:00Z');

describe('parseEspnFootball (reálný scoreboard ESPN)', () => {
  const r = parseEspnFootball(scoreboard, 'eng.1', now);
  const byId = (id: string) => r.matches.find((m) => m.id === id);
  it('dohrané → výsledek, pre → nadcházející, přerušený (ABANDONED) se přeskočí', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['football:401878774', 'football:401879264', 'football:401879267', 'football:401878771', 'football:401879262']);
    expect(byId('football:401879264')!.result).toEqual({ home: 0, away: 3, homeName: 'Liverpool', awayName: 'Manchester City' });
    expect(byId('football:401879267')!.result).toBeUndefined(); // pre má score "0", ale výsledek není
  });
  it('id, soutěž, týmy podle numerického id ESPN, venue', () => {
    expect(byId('football:401879264')).toMatchObject({
      sport: 'football', competition: 'Premier League', competitionId: 'eng.1', startsAt: '2026-10-11T15:30:00.000Z',
      title: 'Liverpool – Manchester City', teams: ['football:364', 'football:382'], venue: { name: 'Anfield', city: 'Liverpool' },
    });
  });
  it('týmy s logem (https) a domácí soutěží', () => {
    const city = r.teams.find((t) => t.id === 'football:382')!;
    expect(city).toMatchObject({ sport: 'football', name: 'Manchester City', league: 'eng.1' });
    expect(city.logo).toMatch(/^https:\/\/a\.espncdn\.com\//);
  });
  it('probíhající zápas (in) je nadcházející bez výsledku', () => {
    const ev = structuredClone(scoreboard) as any;
    ev.events[2].status.type = { name: 'STATUS_FIRST_HALF', state: 'in', completed: false };
    const m = parseEspnFootball(ev, 'eng.1', now).matches.find((x) => x.id === 'football:401879267')!;
    expect(m.result).toBeUndefined();
  });
  it('odložený zápas (pre + STATUS_POSTPONED) se přeskočí', () => {
    const ev = structuredClone(scoreboard) as any;
    ev.events[3].status.type = { name: 'STATUS_POSTPONED', state: 'pre', completed: false };
    expect(parseEspnFootball(ev, 'eng.1', now).matches.map((x) => x.id)).not.toContain('football:401878771');
  });
  it('okno: nadcházející max. 21 dní dopředu, výsledky max. 14 dní zpět', () => {
    const early = parseEspnFootball(scoreboard, 'eng.1', new Date('2026-09-20T12:00:00Z'));
    expect(early.matches.filter((m) => !m.result)).toEqual([]); // vše je dál než 21 dní
    const late = parseEspnFootball(scoreboard, 'eng.1', new Date('2026-10-26T12:00:00Z'));
    expect(late.matches.filter((m) => m.result)).toEqual([]); // výsledky starší než 14 dní
  });
  it('resultsOnly vrátí jen výsledky; prázdný vstup nepadne; neznámá soutěž je chyba', () => {
    expect(parseEspnFootball(scoreboard, 'eng.1', now, { resultsOnly: true }).matches.every((m) => m.result)).toBe(true);
    expect(parseEspnFootball({}, 'eng.1', now).matches).toEqual([]);
    expect(() => parseEspnFootball(scoreboard, 'xxx', now)).toThrow();
  });
});

describe('parseEspnFootball – vyřazovací fáze Ligy mistrů', () => {
  const r = parseEspnFootball(knockout, 'uefa.champions', new Date('2026-05-31T12:00:00Z'));
  it('prodloužení a penalty → poznámka', () => {
    const pen = r.matches.find((m) => m.id === 'football:401862897')!;
    expect(pen.competition).toBe('Liga mistrů');
    expect(pen.result).toMatchObject({ home: 1, away: 1, note: 'na penalty 4:3' });
  });
  it('AET v únoru je mimo 14denní okno → s now v únoru je výsledek po prodloužení', () => {
    const feb = parseEspnFootball(knockout, 'uefa.champions', new Date('2026-02-26T12:00:00Z'));
    expect(feb.matches.find((m) => m.id === 'football:401858765')?.result).toMatchObject({ home: 3, away: 2, note: 'po prodloužení' });
  });
});

describe('parseEspnFootballStandings', () => {
  it('Premier League: jedna tabulka, 20 řádků podle rank, sloupce Z V R P Skóre +/− B', () => {
    const { tables, teams } = parseEspnFootballStandings(standEng, 'eng.1');
    expect(tables).toHaveLength(1);
    const t = tables[0];
    expect(t).toMatchObject({ id: 'football-eng.1', sport: 'football', title: 'Premier League' });
    expect(t.columns.map((c) => c.label)).toEqual(['Z', 'V', 'R', 'P', 'Skóre', '+/−', 'B']);
    expect(t.rows).toHaveLength(20);
    expect(t.rows.map((r) => r.pos)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(t.rows[0]).toEqual({ pos: 1, name: 'Manchester City', teamId: 'football:382', values: { z: 6, v: 6, r: 0, p: 0, skore: '16:5', rozdil: '+11', b: 18 } });
    expect(teams).toHaveLength(20);
    expect(teams[0]).toMatchObject({ id: 'football:382', league: 'eng.1' });
  });
  it('Liga mistrů: ligová fáze 36 klubů', () => {
    const { tables } = parseEspnFootballStandings(standUcl, 'uefa.champions');
    expect(tables.map((t) => [t.id, t.title, t.rows.length])).toEqual([['football-uefa.champions', 'Liga mistrů', 36]]);
  });
  it('více skupin → tabulka na skupinu', () => {
    const two = { children: [standEng.children[0], { ...standEng.children[0], name: 'Skupina B' }] };
    expect(parseEspnFootballStandings(two, 'eng.1').tables.map((t) => [t.id, t.title])).toEqual([
      ['football-eng.1-1', 'Premier League – 2026-27 English Premier League'], ['football-eng.1-2', 'Premier League – Skupina B']]);
  });
  it('prázdné skupiny (mimo sezónu) → []; změněný tvar → výjimka', () => {
    expect(parseEspnFootballStandings({ children: [{ standings: { entries: [] } }] }, 'eng.1').tables).toEqual([]);
    expect(() => parseEspnFootballStandings({}, 'eng.1')).toThrow(/tvar/);
  });
});

describe('espnMonths', () => {
  it('nadcházející okno přes dva měsíce; minulé měsíce jen pro výsledky', () => {
    expect(espnMonths(now)).toEqual({ strict: ['202610', '202611'], past: ['202609'] });
    expect(espnMonths(new Date('2026-10-20T12:00:00Z'))).toEqual({ strict: ['202610', '202611'], past: [] });
  });
});

describe('fetchEspnCompetition', () => {
  const ok = (url: string) => Promise.resolve(url.includes('/standings') ? standEng : scoreboard);
  it('vše OK: zápasy + tabulka + týmy z tabulky; počet požadavků = měsíce + tabulka', async () => {
    const urls: string[] = [];
    const p = await fetchEspnCompetition('eng.1', now, (u) => { urls.push(u); return ok(u); });
    expect(urls).toHaveLength(4);
    expect(urls[0]).toBe('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=202610&limit=500');
    expect(p.data).not.toBeInstanceOf(Error);
    const d = p.data as Exclude<typeof p.data, Error>;
    expect(d.matches.filter((m) => !m.result)).toHaveLength(3);
    expect(d.teams.length).toBeGreaterThanOrEqual(20); // 20 z tabulky (+ kluby z ukázkového přerušeného zápasu La Ligy)
    expect(p.standings?.[0].id).toBe('football-eng.1');
  });
  it('selhání nadcházejícího měsíce → chyba soutěže (tabulka zůstane)', async () => {
    const p = await fetchEspnCompetition('eng.1', now, (u) => (u.includes('202611') ? Promise.reject(new Error('HTTP 500')) : ok(u)));
    expect(p.data).toBeInstanceOf(Error);
    expect((p.data as Error).message).toMatch(/eng\.1: HTTP 500/);
    expect(p.standings).toHaveLength(1);
  });
  it('selhání minulého měsíce a tabulky se toleruje', async () => {
    const p = await fetchEspnCompetition('eng.1', now, (u) => (u.includes('202609') || u.includes('standings') ? Promise.reject(new Error('boom')) : ok(u)));
    expect(p.data).not.toBeInstanceOf(Error);
    expect(p.standingsError).toMatch(/boom/);
  });
});
