import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Match } from '@sportradar/shared';
import { applyBroadcasters, parseBroadcasters } from './broadcasters';

const m = (id: string, sport: Match['sport'], broadcasters: Match['broadcasters'] = []): Match =>
  ({ id, sport, competition: 'c', startsAt: '2026-10-14T23:00:00.000Z', title: 't', teams: [], broadcasters });

const cfg = parseBroadcasters(`
bySport:
  nhl:
    - { name: Kanál A, url: "https://a.example", checked: "2026-10-12", source: "https://s.example" }
byMatch:
  "nhl:2": [ { name: Kanál B } ]
`);

describe('applyBroadcasters', () => {
  it('přidá vysílatele podle sportu i zápasu a deduplikuje podle názvu', () => {
    const r = applyBroadcasters([m('nhl:1', 'nhl'), m('nhl:2', 'nhl', [{ name: 'Kanál A' }]), m('f1:1', 'f1')], cfg);
    expect(r[0].broadcasters.map((b) => b.name)).toEqual(['Kanál A']);
    expect(r[1].broadcasters.map((b) => b.name)).toEqual(['Kanál A', 'Kanál B']);
    expect(r[2].broadcasters).toEqual([]);
  });
  it('prázdný/chybějící config nepadne', () => {
    expect(parseBroadcasters('')).toEqual({ bySport: {}, byMatch: {} });
  });
});

describe('broadcasters.yml v repu', () => {
  const real = parseBroadcasters(readFileSync(new URL('../broadcasters.yml', import.meta.url), 'utf8'));
  it('každý záznam má name, checked (YYYY-MM-DD) a source (URL)', () => {
    const all = [...Object.values(real.bySport), ...Object.values(real.byMatch)].flat();
    for (const b of all) {
      expect(b.name).toBeTruthy();
      expect((b as any).checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((b as any).source).toMatch(/^https?:\/\//);
    }
  });
});
