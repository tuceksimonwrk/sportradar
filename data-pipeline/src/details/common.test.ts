import { describe, expect, it } from 'vitest';
import type { Match, MatchDetail, StandingsTable } from '@sportradar/shared';
import { buildDetailIndex, createFetcher, dec, failedDetailSports, pickDetail, requestsBySport, selectDetailMatches, sidesOf, staleDetailFiles, standingFor } from './common';

const now = new Date('2026-10-12T12:00:00Z');
const m = (id: string, startsAt: string, extra: Partial<Match> = {}): Match =>
  ({ id, sport: id.split(':')[0] as Match['sport'], competition: 'c', startsAt, title: 'A – B', teams: [], broadcasters: [], ...extra });
const det = (id: string, generatedAt = now.toISOString()): MatchDetail =>
  ({ matchId: id, sport: 'nhl', generatedAt, source: 'x', stats: [], notes: [] });

describe('selectDetailMatches', () => {
  it('jen bez výsledku, start v [now − 3 h, now + 7 dní] (hranice včetně), seřazené', () => {
    const list = [
      m('nhl:late', '2026-10-19T12:00:00.001Z'),       // 168 h + 1 ms → ne
      m('nhl:edge', '2026-10-19T12:00:00.000Z'),       // přesně 168 h → ano
      m('nhl:soon', '2026-10-12T13:00:00.000Z'),
      m('nhl:done', '2026-10-12T13:00:00.000Z', { result: { home: 1, away: 0 } }),
      m('nhl:live', '2026-10-12T10:00:00.000Z'),       // probíhá (−2 h)
      m('nhl:old', '2026-10-12T08:59:59.000Z'),        // > 3 h zpět
      m('f1:2026-18-Qualifying', '2026-10-13T09:00:00.000Z'),
    ];
    expect(selectDetailMatches(list, now).map((x) => x.id)).toEqual(['nhl:live', 'nhl:soon', 'f1:2026-18-Qualifying', 'nhl:edge']);
  });
  it('strop počtu (nejbližší mají přednost)', () => {
    const list = Array.from({ length: 100 }, (_, i) => m(`nba:${i}`, new Date(now.getTime() + (100 - i) * 60_000).toISOString()));
    const sel = selectDetailMatches(list, now, 36, 80);
    expect(sel).toHaveLength(80);
    expect(sel[0].id).toBe('nba:99');
  });
  it('výchozí strop 320 (7 dní všech sportů včetně fotbalu)', () => {
    const list = Array.from({ length: 400 }, (_, i) => m(`nba:${i}`, new Date(now.getTime() + i * 60_000).toISOString()));
    expect(selectDetailMatches(list, now)).toHaveLength(320);
  });
  it('neplatné datum se přeskočí', () => {
    expect(selectDetailMatches([m('nhl:x', 'nonsense')], now)).toEqual([]);
  });
});

describe('staleDetailFiles', () => {
  it('maže jen .json mimo nové, nikdy index.json', () => {
    expect(staleDetailFiles(['a.json', 'b.json', 'index.json', 'readme.txt'], new Set(['a.json']))).toEqual(['b.json']);
  });
});

describe('buildDetailIndex', () => {
  it('seřazená unikátní id + generatedAt', () => {
    expect(buildDetailIndex(['nhl:2', 'f1:x', 'nhl:2'], now)).toEqual({ generatedAt: now.toISOString(), ids: ['f1:x', 'nhl:2'] });
  });
});

describe('pickDetail (fallback na předchozí)', () => {
  it('čerstvý vyhrává', () => {
    expect(pickDetail(det('nhl:1'), det('nhl:1', 'old'))).toEqual({ detail: det('nhl:1'), kept: false });
  });
  it('chyba → předchozí, pokud patří ke stejnému zápasu', () => {
    expect(pickDetail(new Error('x'), det('nhl:1', 'old'), 'nhl:1')).toEqual({ detail: det('nhl:1', 'old'), kept: true });
    expect(pickDetail(new Error('x'), det('nhl:2', 'old'), 'nhl:1')).toEqual({ detail: null, kept: false });
  });
  it('chyba bez předchozího → nic', () => {
    expect(pickDetail(new Error('x'), null, 'nhl:1')).toEqual({ detail: null, kept: false });
  });
});

describe('failedDetailSports', () => {
  it('sport selže jen když selhaly všechny jeho detaily', () => {
    expect(failedDetailSports([
      { sport: 'nhl', ok: false }, { sport: 'nhl', ok: true },
      { sport: 'nba', ok: false }, { sport: 'nba', ok: false },
      { sport: 'f1', ok: true },
    ])).toEqual(['nba']);
    expect(failedDetailSports([])).toEqual([]);
  });
});

describe('createFetcher', () => {
  it('cache podle URL (tým se stahuje jednou), počítá požadavky, max 4 souběžně', async () => {
    let active = 0; let peak = 0; const calls: string[] = [];
    const raw = async (url: string) => {
      calls.push(url); active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return JSON.stringify({ url });
    };
    const f = createFetcher(raw, 4);
    const urls = ['a', 'b', 'c', 'd', 'e', 'f', 'a', 'b'];
    const out = await Promise.all(urls.map((u) => f.json<{ url: string }>(u)));
    expect(out.map((o) => o.url)).toEqual(urls);
    expect(calls.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(f.count).toBe(6);
    expect(peak).toBeLessThanOrEqual(4);
  });
  it('chyba se necachuje natrvalo jako úspěch (propaguje se)', async () => {
    const f = createFetcher(async () => { throw new Error('HTTP 500'); });
    await expect(f.text('x')).rejects.toThrow('HTTP 500');
  });
});

describe('helpers', () => {
  it('dec: česká desetinná čárka', () => {
    expect(dec(3.456, 2)).toBe('3,46');
    expect(dec(2, 1)).toBe('2,0');
  });
  it('sidesOf: domácí / hosté z titulku a teams', () => {
    expect(sidesOf(m('nhl:1', 'x', { title: 'Chicago Blackhawks – Pittsburgh Penguins', teams: ['nhl:CHI', 'nhl:PIT'] })))
      .toEqual({ home: { name: 'Chicago Blackhawks', teamId: 'nhl:CHI' }, away: { name: 'Pittsburgh Penguins', teamId: 'nhl:PIT' } });
    expect(sidesOf(m('f1:1', 'x', { title: 'GP – Závod' }))).toBeNull();
  });
  it('standingFor: řádek + tabulka podle teamId', () => {
    const t: StandingsTable = { id: 'nhl-east', sport: 'nhl', title: 'East', columns: [], rows: [{ pos: 3, name: 'P', teamId: 'nhl:PIT', values: { b: 7 } }] };
    expect(standingFor([t], 'nhl:PIT')?.row.pos).toBe(3);
    expect(standingFor([t], 'nhl:XXX')).toBeUndefined();
    expect(standingFor([t], undefined)).toBeUndefined();
  });
});

describe('requestsBySport', () => {
  it('počty požadavků detailů podle zdroje/sportu', () => {
    expect(requestsBySport([
      'https://api-web.nhle.com/v1/gamecenter/1/landing', 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=1',
      'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=2', 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams/382/roster',
      'https://www.hokej.cz/zapas/1', 'https://www.nbl.basketball/tabulka', 'https://api.jolpi.ca/ergast/f1/current', 'https://example.com/x',
    ])).toEqual({ nhl: 1, nba: 1, football: 2, 'cz-hockey': 1, 'cz-basket': 1, f1: 1, other: 1 });
  });
  it('fetcher si pamatuje skutečně stažené URL (cache se nepočítá)', async () => {
    const f = createFetcher(async () => '{}');
    await f.text('a'); await f.text('a'); await f.text('b');
    expect(f.urls).toEqual(['a', 'b']);
  });
});
