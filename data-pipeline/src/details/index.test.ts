import { describe, expect, it } from 'vitest';
import type { Match, MatchDetail, Sport } from '@sportradar/shared';
import { createFetcher, type DetailBuilder } from './common';
import { generateDetails } from './index';

const now = new Date('2026-10-12T12:00:00Z');
const m = (id: string): Match => ({ id, sport: id.split(':')[0] as Sport, competition: 'c', startsAt: '2026-10-12T20:00:00.000Z', title: 'A – B', teams: [], broadcasters: [] });
const det = (id: string, generatedAt = now.toISOString()): MatchDetail => ({ matchId: id, sport: id.split(':')[0] as Sport, generatedAt, source: 's', stats: [], notes: [] });
const ok: DetailBuilder = async (x) => det(x.id);
const bad: DetailBuilder = async () => { throw new Error('HTTP 500'); };
const ctx = { get: createFetcher(async () => '{}'), now, matches: [], teams: [], standings: [] };

describe('generateDetails', () => {
  it('čerstvé detaily, chyba jednoho nepoloží ostatní; předchozí se ponechá', async () => {
    const builders = { nhl: async (x: Match) => (x.id === 'nhl:2' ? bad(x, ctx) : ok(x, ctx)), nba: bad, f1: ok, 'cz-hockey': ok, 'cz-basket': ok } as Record<Sport, DetailBuilder>;
    const prev = new Map([['nhl_2.json', det('nhl:2', 'old')]]);
    const r = await generateDetails([m('nhl:1'), m('nhl:2'), m('nba:1'), m('nba:2'), m('f1:x')], ctx, async (f) => prev.get(f) ?? null, builders);
    expect([...r.files.keys()].sort()).toEqual(['f1_x.json', 'nhl_1.json', 'nhl_2.json']);
    expect(r.files.get('nhl_2.json')?.generatedAt).toBe('old');
    expect(r.kept).toBe(1);
    expect(r.failedSports).toEqual(['nba']);
    // varování max jednou na sport
    expect(r.warnings).toEqual(['detail nhl:2: HTTP 500', 'detail nba:1: HTTP 500 (+1 dalších)']);
    expect(r.counts).toEqual({ nhl: { ok: 1, total: 2 }, nba: { ok: 0, total: 2 }, f1: { ok: 1, total: 1 } });
  });
  it('detail jiného id ve stejném souboru se nepoužije; chyba čtení předchozího je jen „nic“', async () => {
    const builders = { nhl: bad } as unknown as Record<Sport, DetailBuilder>;
    const r = await generateDetails([m('nhl:1')], ctx, async () => det('nhl:9'), builders);
    expect(r.files.size).toBe(0);
    const r2 = await generateDetails([m('nhl:1')], ctx, async () => { throw new Error('x'); }, builders);
    expect(r2.files.size).toBe(0);
  });
  it('bez zápasů prázdný výsledek', async () => {
    const r = await generateDetails([], ctx, async () => null);
    expect(r).toMatchObject({ failedSports: [], warnings: [], kept: 0 });
  });
});
