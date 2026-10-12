import { describe, expect, it } from 'vitest';
import type { StandingRow, StandingsFile, StandingsTable, Team } from '@sportradar/shared';
import { defaultStandingsSport, defaultTableId, isFavoriteRow, oldestUpdatedAt, showTableSelector, tableCompetitionId, tablesForSport } from './standings';

describe('defaultStandingsSport', () => {
  it('bez oblíbených nhl', () => { expect(defaultStandingsSport([])).toBe('nhl'); });
  it('první sport v pořadí SPORTS s oblíbeným (id sportu i id týmu)', () => {
    expect(defaultStandingsSport(['cz-basket:bk-opava', 'cz-hockey:PCE'])).toBe('cz-hockey');
    expect(defaultStandingsSport(['nba:LAL', 'nhl:PIT'])).toBe('nhl');
    expect(defaultStandingsSport(['cz-basket:x', 'f1'])).toBe('f1');
    expect(defaultStandingsSport(['nba'])).toBe('nba');
  });
  it('neznámé prefixy se ignorují', () => {
    expect(defaultStandingsSport(['foo:bar', 'bar', ''])).toBe('nhl');
    expect(defaultStandingsSport(['foo:bar', 'cz-basket:x'])).toBe('cz-basket');
  });
});

describe('isFavoriteRow', () => {
  const row = (teamId?: string): StandingRow => ({ pos: 1, name: 'x', ...(teamId && { teamId }), values: {} });
  it('zvýrazní řádek jen podle teamId', () => {
    expect(isFavoriteRow(row('nhl:PIT'), 'nhl', ['nhl:PIT'])).toBe(true);
    expect(isFavoriteRow(row('nhl:PIT'), 'nhl', ['nhl:WSH'])).toBe(false);
  });
  it('oblíbený celý sport nezvýrazňuje nic; řádek bez teamId nikdy', () => {
    expect(isFavoriteRow(row('nhl:PIT'), 'nhl', ['nhl'])).toBe(false);
    expect(isFavoriteRow(row(), 'nhl', ['nhl', 'nhl:PIT'])).toBe(false);
  });
  it('F1 se nikdy nezvýrazňuje', () => {
    expect(isFavoriteRow(row('f1:x'), 'f1', ['f1', 'f1:x'])).toBe(false);
  });
});

describe('tablesForSport', () => {
  const t = (id: string, sport: StandingsTable['sport']): StandingsTable => ({ id, sport, title: id, columns: [], rows: [] });
  const file: StandingsFile = { generatedAt: 'x', tables: [t('nhl-east', 'nhl'), t('nba-east', 'nba'), t('nhl-west', 'nhl')] };
  it('vrátí tabulky sportu v původním pořadí', () => {
    expect(tablesForSport(file, 'nhl').map((x) => x.id)).toEqual(['nhl-east', 'nhl-west']);
    expect(tablesForSport(file, 'f1')).toEqual([]);
  });
  it('chybějící soubor → []', () => { expect(tablesForSport(null, 'nhl')).toEqual([]); });
});

describe('oldestUpdatedAt', () => {
  const t = (updatedAt?: string): StandingsTable => ({ id: 'x', sport: 'nhl', title: 't', columns: [], rows: [], ...(updatedAt && { updatedAt }) });
  const FB = '2026-10-12T10:00:00.000Z';
  it('nejstarší updatedAt z tabulek', () => {
    expect(oldestUpdatedAt([t('2026-10-12T09:00:00.000Z'), t('2026-10-01T00:00:00.000Z')], FB)).toBe('2026-10-01T00:00:00.000Z');
  });
  it('chybějící nebo neplatné hodnoty se ignorují, jinak fallback', () => {
    expect(oldestUpdatedAt([t(), t('nesmysl'), t('2026-10-05T00:00:00.000Z')], FB)).toBe('2026-10-05T00:00:00.000Z');
    expect(oldestUpdatedAt([t(), t('nesmysl')], FB)).toBe(FB);
    expect(oldestUpdatedAt([], FB)).toBe(FB);
  });
});

describe('fotbal: výběr tabulky', () => {
  const row = (teamId: string): StandingRow => ({ pos: 1, name: teamId, teamId, values: {} });
  const t = (id: string, teamIds: string[] = []): StandingsTable => ({ id, sport: 'football', title: id, columns: [], rows: teamIds.map(row) });
  const tables = [
    t('football-eng.1', ['football:359', 'football:331']),
    t('football-esp.1', ['football:86']),
    t('football-uefa.champions', ['football:359', 'football:86', 'football:494']),
    t('football-cze.1', ['football:cz_sk-slavia-praha']),
  ];
  const teams = new Map<string, Team>([
    ['football:359', { id: 'football:359', sport: 'football', name: 'Arsenal', league: 'eng.1' }],
    ['football:132', { id: 'football:132', sport: 'football', name: 'Bayern', league: 'ger.1' }],
  ]);

  it('defaultStandingsSport: oblíbená soutěž → fotbal', () => {
    expect(defaultStandingsSport(['league:eng.1'])).toBe('football');
    expect(defaultStandingsSport(['league:cze.1', 'nhl:PIT'])).toBe('nhl'); // pořadí SPORTS
    expect(defaultStandingsSport(['league:xyz.9'])).toBe('nhl');             // neznámá soutěž
  });
  it('tableCompetitionId z id tabulky (i se skupinou)', () => {
    expect(tableCompetitionId('football-eng.1')).toBe('eng.1');
    expect(tableCompetitionId('football-uefa.champions')).toBe('uefa.champions');
    expect(tableCompetitionId('football-uefa.champions-2')).toBe('uefa.champions');
    expect(tableCompetitionId('nhl-east')).toBeUndefined();
    expect(tableCompetitionId('football-xyz.9')).toBeUndefined();
  });
  it('výběr tabulky jen při více než 2 tabulkách', () => {
    expect(showTableSelector(tables)).toBe(true);
    expect(showTableSelector(tables.slice(0, 2))).toBe(false);
    expect(showTableSelector([])).toBe(false);
  });
  it('výchozí tabulka: první oblíbený klub nebo soutěž v pořadí oblíbených', () => {
    expect(defaultTableId(tables, ['nhl:PIT', 'football:86', 'league:cze.1'], teams)).toBe('football-esp.1');
    expect(defaultTableId(tables, ['league:uefa.champions', 'football:359'], teams)).toBe('football-uefa.champions');
    expect(defaultTableId(tables, ['football:494'], teams)).toBe('football-uefa.champions'); // klub jen z LM
  });
  it('klub mimo tabulky podle Team.league; jinak první tabulka', () => {
    const withGer = [...tables, t('football-ger.1')];
    expect(defaultTableId(withGer, ['football:132'], teams)).toBe('football-ger.1');
    expect(defaultTableId(tables, ['football', 'nhl:PIT'], teams)).toBe('football-eng.1');
    expect(defaultTableId(tables, [], teams)).toBe('football-eng.1');
    expect(defaultTableId([], ['football:359'], teams)).toBeUndefined();
  });
  it('oblíbená soutěž nezvýrazňuje řádky', () => {
    expect(isFavoriteRow(row('football:359'), 'football', ['league:eng.1'])).toBe(false);
    expect(isFavoriteRow(row('football:359'), 'football', ['football:359'])).toBe(true);
  });
});
