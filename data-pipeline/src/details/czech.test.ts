import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Match, StandingsTable } from '@sportradar/shared';
import { createFetcher } from './common';
import { elhDetail, nblDetail, parseElhClubs, parseElhRoster, parseNblRoster, parseNblTeamLinks, parseCzDetail } from './czech';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const now = new Date('2026-10-14T10:00:00Z');

const elhMatch: Match = {
  id: 'cz-hockey:2928329', sport: 'cz-hockey', competition: 'Tipsport extraliga', startsAt: '2026-10-15T15:30:00.000Z',
  title: 'HC VERVA Litvínov – Mountfield HK', teams: ['cz-hockey:LIT', 'cz-hockey:MHK'], broadcasters: [],
};
const elhTable: StandingsTable = { id: 'cz-hockey', sport: 'cz-hockey', title: 'ELH', columns: [], rows: [
  { pos: 3, name: 'Mountfield HK', teamId: 'cz-hockey:MHK', values: { z: 10, v: 6, vp: 1, pp: 1, p: 2, skore: '32:22', b: 21 } },
  { pos: 11, name: 'HC VERVA Litvínov', teamId: 'cz-hockey:LIT', values: { z: 10, v: 3, vp: 1, pp: 0, p: 6, skore: '25:31', b: 11 } },
] };
const nblMatch: Match = {
  id: 'cz-basket:74-bk-kvis-pardubice', sport: 'cz-basket', competition: 'NBL', startsAt: '2026-10-14T15:30:00.000Z',
  title: 'BK KVIS Pardubice – BK Olomoucko', teams: ['cz-basket:bk-kvis-pardubice', 'cz-basket:bk-olomoucko'], broadcasters: [],
};
const nblTable: StandingsTable = { id: 'cz-basket', sport: 'cz-basket', title: 'NBL', columns: [], rows: [
  { pos: 2, name: 'BK KVIS Pardubice', teamId: 'cz-basket:bk-kvis-pardubice', values: { z: 6, v: 5, p: 1, skore: '540:470' } },
  { pos: 9, name: 'BK Olomoucko', teamId: 'cz-basket:bk-olomoucko', values: { z: 6, v: 1, p: 5, skore: '430:520' } },
] };

describe('ELH', () => {
  it('kluby z hlavičky zápasu (cesta bez query, zkratka)', () => {
    expect(parseElhClubs(fx('elh-match.html'))).toEqual({
      home: { path: '/klub/hc-verva-litvinov/823', short: 'LIT' },
      away: { path: '/klub/mountfield-hk/1711', short: 'MHK' },
    });
    expect(parseElhClubs('<div class="match-score"><div class="team-home"><a href="/klub/x/1?t=%27">A</a></div></div>')).toEqual({});
  });
  it('soupiska: útočníci, obránci, brankáři s čísly', () => {
    const g = parseElhRoster(fx('elh-soupiska.html'));
    expect(g.map((x) => x.title)).toEqual(['Útočníci', 'Obránci', 'Brankáři']);
    expect(g[2].players[0]).toEqual({ name: 'Pavel Čajan', number: '30', pos: 'B' });
    expect(g[1].players[0]).toMatchObject({ name: 'Adam Polášek', number: '3', pos: 'O' });
  });
  it('soupiska bez brankářů / bez tabulek = nespolehlivá → []', () => {
    expect(parseElhRoster('<h3>Útočníci</h3><table><thead><tr><th>#</th><th>Hráč</th></tr></thead><tbody><tr><td>1</td><td>A</td></tr></tbody></table>')).toEqual([]);
    expect(parseElhRoster('<p>nic</p>')).toEqual([]);
  });
  it('detail: Tabulka z pořadí + soupisky + poznámka', () => {
    const roster = parseElhRoster(fx('elh-soupiska.html'));
    const d = parseCzDetail({ match: elhMatch, standings: [elhTable], rosters: { home: roster, away: roster }, now });
    expect(d).toMatchObject({ sport: 'cz-hockey', source: 'hokej.cz', homeName: 'HC VERVA Litvínov', awayName: 'Mountfield HK' });
    const t = d.stats[0];
    expect(t.title).toBe('Tabulka');
    const r = (l: string) => t.rows.find((x) => x.label === l);
    expect(r('Pořadí')).toMatchObject({ home: '11.', away: '3.', lowerIsBetter: true });
    expect(r('Body')).toMatchObject({ home: 11, away: 21 });
    expect(r('Bilance V–VP–PP–P')).toMatchObject({ home: '3–1–0–6', away: '6–1–1–2' });
    expect(r('Góly vstřelené / zápas')).toMatchObject({ home: '2,50', away: '3,20' });
    expect(r('Góly obdržené / zápas')).toMatchObject({ home: '3,10', away: '2,20', lowerIsBetter: true });
    expect(r('Skóre')).toMatchObject({ home: '25:31', away: '32:22' });
    expect(d.lineups?.kind).toBe('roster');
    expect(d.notes.join(' ')).toMatch(/hokej\.cz/);
  });
  it('bez soupisek upřímná poznámka', () => {
    const d = parseCzDetail({ match: elhMatch, standings: [], rosters: {}, now });
    expect(d.stats).toEqual([]);
    expect(d.lineups).toBeUndefined();
    expect(d.notes).toContain('Rozestavení se zveřejní krátce před zápasem.');
  });
  it('elhDetail stáhne zápas + 2 soupisky (cache klubu)', async () => {
    const calls: string[] = [];
    const get = createFetcher(async (u) => { calls.push(u); return u.endsWith('/soupiska') ? fx('elh-soupiska.html') : fx('elh-match.html'); });
    const ctx = { get, now, matches: [], teams: [], standings: [elhTable] };
    const d = await elhDetail(elhMatch, ctx);
    await elhDetail(elhMatch, ctx);
    expect(d.lineups?.home.groups).toHaveLength(3);
    expect(calls.sort()).toEqual([
      'https://www.hokej.cz/klub/hc-verva-litvinov/823/soupiska',
      'https://www.hokej.cz/klub/mountfield-hk/1711/soupiska',
      'https://www.hokej.cz/zapas/2928329',
    ]);
  });
  it('elhDetail: nedostupná stránka zápasu → jen tabulka a poznámka (ne chyba)', async () => {
    const get = createFetcher(async () => { throw new Error('HTTP 503'); });
    const d = await elhDetail(elhMatch, { get, now, matches: [], teams: [], standings: [elhTable] });
    expect(d.stats).toHaveLength(1);
    expect(d.notes).toContain('Rozestavení se zveřejní krátce před zápasem.');
  });
});

describe('NBL', () => {
  it('odkazy týmů z tabulky (bez query)', () => {
    const m = parseNblTeamLinks(fx('nbl-tabulka.html'));
    expect(m.get('cz-basket:bk-kvis-pardubice')).toBe('/tym/bk-kvis-pardubice');
    expect(m.get('cz-basket:sk-slavia-praha-era-nbk')).toBe('/tym/sk-slavia-praha-era-nbk');
  });
  it('soupiska po postech + nejlepší hráči ze statistik', () => {
    const r = parseNblRoster(fx('nbl-team.html'));
    expect(r.groups.map((g) => g.title)).toEqual(['Rozehrávači', 'Křídla', 'Pivoti'].filter((t) => r.groups.some((g) => g.title === t)));
    expect(r.groups[0].players[0]).toEqual({ name: 'Robert Lee Bonham', number: '3', pos: 'PG' });
    expect(r.leaders.points).toEqual({ name: 'Robert Lee Bonham', value: 20.7 });
  });
  it('detail: Tabulka + Nejlepší hráči + soupisky', () => {
    const r = parseNblRoster(fx('nbl-team.html'));
    const d = parseCzDetail({ match: nblMatch, standings: [nblTable], rosters: { home: r.groups, away: r.groups }, leaders: { home: r.leaders, away: r.leaders }, now });
    expect(d.source).toBe('nbl.basketball');
    const t = d.stats.find((b) => b.title === 'Tabulka')!;
    expect(t.rows.find((x) => x.label === 'Bilance V–P')).toMatchObject({ home: '5–1', away: '1–5' });
    expect(t.rows.find((x) => x.label === 'Úspěšnost')).toMatchObject({ home: '83,3 %', away: '16,7 %' });
    expect(t.rows.find((x) => x.label === 'Body / zápas')).toMatchObject({ home: '90,0', away: '71,7' });
    expect(t.rows.find((x) => x.label === 'Obdržené / zápas')).toMatchObject({ home: '78,3', away: '86,7', lowerIsBetter: true });
    const b = d.stats.find((x) => x.title === 'Nejlepší hráči (průměr na zápas)')!;
    expect(b.rows[0]).toMatchObject({ label: 'Body', home: 'Robert Lee Bonham 20,7', homeValue: 20.7 });
    expect(d.lineups?.home.groups.length).toBeGreaterThan(0);
  });
  it('nblDetail: tabulka (1×) + stránky týmů', async () => {
    const calls: string[] = [];
    const get = createFetcher(async (u) => { calls.push(u); return u.endsWith('/tabulka') ? fx('nbl-tabulka.html') : fx('nbl-team.html'); });
    const ctx = { get, now, matches: [], teams: [], standings: [nblTable] };
    const d = await nblDetail(nblMatch, ctx);
    await nblDetail(nblMatch, ctx);
    expect(d.lineups?.away.teamId).toBe('cz-basket:bk-olomoucko');
    expect(calls.sort()).toEqual([
      'https://www.nbl.basketball/tabulka',
      'https://www.nbl.basketball/tym/bk-kvis-pardubice',
      'https://www.nbl.basketball/tym/bk-olomoucko',
    ]);
  });
});
