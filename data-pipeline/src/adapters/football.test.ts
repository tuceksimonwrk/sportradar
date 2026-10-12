import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Team } from '@sportradar/shared';
import { combineFootballTeams, countingGet, runFootball } from './football';
import { CZ_SCHEDULE_URL, CZ_TABLE_URL } from './football-cz';
import scoreboard from './fixtures/espn-football-scoreboard.json';
import standEng from './fixtures/espn-football-standings-eng.json';

const rozpis = readFileSync(new URL('./fixtures/chanceliga-rozpis.html', import.meta.url), 'utf8');
const tabulka = readFileSync(new URL('./fixtures/chanceliga-tabulka.html', import.meta.url), 'utf8');
const now = new Date('2026-10-12T12:00:00Z');
const espnOk = async (u: string) => (u.includes('/standings') ? standEng : u.includes('/eng.1/') ? scoreboard : { events: [] });
const czOk = async (u: string) => (u === CZ_SCHEDULE_URL ? rozpis : u === CZ_TABLE_URL ? tabulka : '');

describe('combineFootballTeams', () => {
  it('domácí liga má přednost před Ligou mistrů; logo se doplní', () => {
    const a: Team = { id: 'football:382', sport: 'football', name: 'Manchester City', league: 'uefa.champions', logo: 'https://x/l.png' };
    const b: Team = { id: 'football:382', sport: 'football', name: 'Manchester City', league: 'eng.1' };
    expect(combineFootballTeams([a, b])).toEqual([{ ...b, logo: 'https://x/l.png' }]);
    expect(combineFootballTeams([b, a])).toEqual([{ ...b, logo: 'https://x/l.png' }]);
  });
});

describe('countingGet', () => {
  it('jedno opakování po chybě, cache podle URL, počítadlo', async () => {
    let n = 0;
    const g = countingGet(async () => { n++; if (n === 1) throw new Error('flaky'); return 'ok'; });
    expect(await g.get('u')).toBe('ok');
    expect(await g.get('u')).toBe('ok');
    expect(g.count).toBe(2);
    const bad = countingGet(async () => { throw new Error('down'); });
    await expect(bad.get('u')).rejects.toThrow('down');
    expect(bad.count).toBe(2);
  });
});

describe('runFootball', () => {
  it('ESPN + česká liga: sjednocení, tabulky, log požadavků', async () => {
    const r = await runFootball(now, espnOk, czOk);
    expect(r.failedCompetitions).toBeUndefined();
    expect(new Set(r.matches.map((m) => m.competitionId))).toEqual(new Set(['eng.1', 'cze.1']));
    expect(r.standings!.map((t) => t.id).sort()).toContain('football-cze.1');
    expect(r.log!.join('\n')).toMatch(/ESPN: 24 HTTP požadavků/);
    expect(r.log!.join('\n')).toMatch(/chanceliga\.cz: 2 HTTP požadavků/);
    expect(r.log!.join('\n')).toMatch(/Premier League: 3 zápasů, 2 výsledků/);
  });
  it('česká liga selže → ESPN data + failedCompetitions [cze.1] + varování', async () => {
    const r = await runFootball(now, espnOk, async () => { throw new Error('HTTP 503'); });
    expect(r.failedCompetitions).toEqual(['cze.1']);
    expect(r.matches.some((m) => m.competitionId === 'eng.1')).toBe(true);
    expect(r.warnings!.join()).toMatch(/cze\.1: HTTP 503/);
  });
  it('ESPN soutěž selže → jen ta je ve failedCompetitions', async () => {
    const r = await runFootball(now, async (u) => (u.includes('/ita.1/scoreboard') ? Promise.reject(new Error('HTTP 500')) : espnOk(u)), czOk);
    expect(r.failedCompetitions).toEqual(['ita.1']);
  });
  it('vše selže → výjimka (merge ponechá stará data)', async () => {
    const boom = async () => { throw new Error('offline'); };
    await expect(runFootball(now, boom, boom)).rejects.toThrow(/všechny zdroje/);
  });
  it('chyby tabulek se sloučí do standingsError', async () => {
    const r = await runFootball(now, async (u) => (u.includes('/standings') ? Promise.reject(new Error('x')) : espnOk(u)), czOk);
    expect(r.standingsError).toMatch(/eng\.1: x/);
    expect(r.failedCompetitions).toBeUndefined();
  });
});
