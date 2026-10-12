import { describe, expect, it } from 'vitest';
import type { Team } from '@sportradar/shared';
import { blockOpen, clubsLabel, footballBlocks, matchesQuery, normalizeQuery } from './football';

const team = (id: string, name: string, league?: string): Team => ({ id: `football:${id}`, sport: 'football', name, ...(league && { league }) });
const teams: Team[] = [
  team('359', 'Arsenal', 'eng.1'),
  team('331', 'Brighton & Hove Albion', 'eng.1'),
  team('268', 'Borussia Mönchengladbach', 'ger.1'),
  team('86', 'Real Madrid', 'esp.1'),
  team('494', 'Slavia Prague', 'uefa.champions'),
  team('999', 'Bez ligy'),
  team('cz_sk-slavia-praha', 'SK Slavia Praha', 'cze.1'),
  { id: 'nhl:PIT', sport: 'nhl', name: 'Pittsburgh Penguins' },
];

describe('normalizeQuery / matchesQuery', () => {
  it('bez diakritiky a velikosti písmen', () => {
    expect(normalizeQuery('  MÖnchen ')).toBe('monchen');
    expect(matchesQuery('Borussia Mönchengladbach', normalizeQuery('monchen'))).toBe(true);
    expect(matchesQuery('SK Slavia Praha', normalizeQuery('slávia'))).toBe(true);
    expect(matchesQuery('Arsenal', '')).toBe(true);
    expect(matchesQuery('Arsenal', 'real')).toBe(false);
  });
});

describe('footballBlocks', () => {
  const blocks = footballBlocks(teams, '', []);
  const byId = Object.fromEntries(blocks.map((b) => [b.comp.id, b]));
  it('blok pro každou ze 7 soutěží v pořadí COMPETITIONS', () => {
    expect(blocks.map((b) => b.comp.id)).toEqual(['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'cze.1']);
    expect(blocks.every((b) => b.visible)).toBe(true);
  });
  it('kluby podle Team.league, abecedně; jiné sporty ne', () => {
    expect(byId['eng.1'].clubs.map((t) => t.name)).toEqual(['Arsenal', 'Brighton & Hove Albion']);
    expect(byId['ita.1'].clubs).toEqual([]);
    expect(byId['cze.1'].clubs.map((t) => t.name)).toEqual(['SK Slavia Praha']);
  });
  it('kluby bez domácí ligy (jen LM, neznámá) jsou v Lize mistrů jako ostatní; každý klub jednou', () => {
    expect(byId['uefa.champions'].clubs.map((t) => t.name)).toEqual(['Bez ligy', 'Slavia Prague']);
    const all = blocks.flatMap((b) => b.clubs.map((t) => t.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(7);
  });
  it('vyhledávání filtruje kluby a skryje bloky bez shody', () => {
    const r = footballBlocks(teams, 'slavia', []);
    expect(r.filter((b) => b.visible).map((b) => b.comp.id)).toEqual(['uefa.champions', 'cze.1']);
    expect(r.find((b) => b.comp.id === 'uefa.champions')!.clubs.map((t) => t.name)).toEqual(['Slavia Prague']);
    expect(r.find((b) => b.comp.id === 'eng.1')!.visible).toBe(false);
  });
  it('shoda s názvem soutěže nebo zemí ukáže celý blok', () => {
    const r = footballBlocks(teams, 'premier', []);
    expect(r.filter((b) => b.visible).map((b) => b.comp.id)).toEqual(['eng.1']);
    expect(r[0].clubs).toHaveLength(2);
    expect(footballBlocks(teams, 'anglie', []).filter((b) => b.visible).map((b) => b.comp.id)).toEqual(['eng.1']);
  });
  it('favCount: soutěž i kluby (i když je vyhledávání skryje)', () => {
    const r = footballBlocks(teams, 'real', ['league:eng.1', 'football:359', 'football:494']);
    expect(r.find((b) => b.comp.id === 'eng.1')!.favCount).toBe(2);
    expect(r.find((b) => b.comp.id === 'uefa.champions')!.favCount).toBe(1);
    expect(r.find((b) => b.comp.id === 'esp.1')!.favCount).toBe(0);
  });
});

describe('blockOpen', () => {
  it('při hledání vždy otevřeno', () => expect(blockOpen({ searching: true, favCount: 0, compact: true, override: false })).toBe(true));
  it('ruční volba má přednost', () => {
    expect(blockOpen({ searching: false, favCount: 3, compact: false, override: false })).toBe(false);
    expect(blockOpen({ searching: false, favCount: 0, compact: true, override: true })).toBe(true);
  });
  it('výchozí: otevřeno s oblíbenými, jinak zavřeno na mobilu a otevřeno na desktopu', () => {
    expect(blockOpen({ searching: false, favCount: 1, compact: true })).toBe(true);
    expect(blockOpen({ searching: false, favCount: 0, compact: true })).toBe(false);
    expect(blockOpen({ searching: false, favCount: 0, compact: false })).toBe(true);
  });
});

describe('clubsLabel', () => {
  it('české tvary', () => {
    expect([0, 1, 2, 4, 5, 20, 36].map(clubsLabel)).toEqual(['0 klubů', '1 klub', '2 kluby', '4 kluby', '5 klubů', '20 klubů', '36 klubů']);
  });
});
