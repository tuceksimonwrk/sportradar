import { COMPETITIONS, SPORTS, competitionById, competitionsOfGroup, groupOfSport, parseLeagueFavorite, type GroupId, type Sport, type StandingRow, type StandingsFile, type StandingsTable, type Team } from '@sportradar/shared';

/** Sport z id oblíbené položky: `nhl:PIT` → nhl, `f1` → f1, `league:eng.1` → sport soutěže; neznámé → undefined. */
function sportOfId(id: string): Sport | undefined {
  const comp = competitionById(parseLeagueFavorite(id));
  if (comp) return comp.sport;
  const prefix = id.split(':', 1)[0];
  return SPORTS.find((s) => s === prefix);
}

/** Id soutěže z id tabulky: 'football-eng.1' → 'eng.1', 'football-uefa.champions-2' (skupina) → 'uefa.champions'. */
export function tableCompetitionId(tableId: string): string | undefined {
  return COMPETITIONS.find((c) => tableId === `${c.sport}-${c.id}` || tableId.startsWith(`${c.sport}-${c.id}-`))?.id;
}

/**
 * Výchozí tabulka: podle prvního oblíbeného (v pořadí oblíbených), který k nějaké tabulce vede –
 * soutěž (`league:<id>`), klub v řádcích tabulky, nebo klub podle `Team.league`; jinak první tabulka.
 */
export function defaultTableId(tables: readonly StandingsTable[], favs: readonly string[], teams: ReadonlyMap<string, Team>): string | undefined {
  const ofComp = (comp?: string) => (comp ? tables.find((t) => tableCompetitionId(t.id) === comp) : undefined);
  for (const id of favs) {
    const hit = ofComp(parseLeagueFavorite(id))
      ?? tables.find((t) => t.rows.some((r) => r.teamId === id))
      ?? ofComp(teams.get(id)?.league);
    if (hit) return hit.id;
  }
  return tables[0]?.id;
}

/** Sport, který se v Tabulkách ukáže jako první: první ze SPORTS s oblíbeným, jinak NHL. */
export function defaultStandingsSport(favs: string[]): Sport {
  const mine = new Set(favs.map(sportOfId));
  return SPORTS.find((s) => mine.has(s)) ?? 'nhl';
}

/** Zvýrazní se jen tým, který je přímo v oblíbených (ne celý sport); F1 nikdy. */
export function isFavoriteRow(row: StandingRow, sport: Sport, favs: string[]): boolean {
  return sport !== 'f1' && !!row.teamId && favs.includes(row.teamId);
}

/** Výběr v Tabulkách: sport (bez 'Vše') a soutěž v něm; F1 soutěž nemá ('all'). */
export interface StandingsFilter { group: GroupId; competition: string }

/** První soutěž skupiny (výchozí po přepnutí sportu); F1 → 'all'. */
export function firstCompetition(group: GroupId): string {
  return competitionsOfGroup(group)[0]?.id ?? 'all';
}

/** Výchozí výběr: sport podle `defaultStandingsSport`; fotbal podle výchozí tabulky (oblíbená soutěž/klub), hokej/basketbal podle interního sportu. */
export function defaultStandingsFilter(file: StandingsFile | null, favs: string[], teams: ReadonlyMap<string, Team>): StandingsFilter {
  const sport = defaultStandingsSport(favs);
  const group = groupOfSport(sport);
  if (group === 'football') {
    const tableId = defaultTableId(tablesForSport(file, 'football'), favs, teams);
    return { group, competition: (tableId && tableCompetitionId(tableId)) || firstCompetition(group) };
  }
  return { group, competition: group === 'f1' ? 'all' : sport };
}

/** Tabulky vybrané soutěže: F1 obě, hokej/basketbal tabulky interního sportu (NHL/NBA = konference pod sebou), fotbal tabulky soutěže (u LM i skupiny). */
export function tablesForStandingsFilter(file: StandingsFile | null, f: StandingsFilter): StandingsTable[] {
  if (!file) return [];
  if (f.group === 'f1') return file.tables.filter((t) => t.sport === 'f1');
  if (f.group === 'football') return file.tables.filter((t) => t.sport === 'football' && tableCompetitionId(t.id) === f.competition);
  return file.tables.filter((t) => t.sport === f.competition);
}

export function tablesForSport(file: StandingsFile | null, sport: Sport): StandingsTable[] {
  return file ? file.tables.filter((t) => t.sport === sport) : [];
}

/** Nejstarší platné updatedAt z tabulek (nejpesimističtější stáří); bez platné hodnoty `fallback`. */
export function oldestUpdatedAt(tables: StandingsTable[], fallback: string): string {
  let best: string | undefined;
  for (const t of tables) {
    const ms = t.updatedAt ? Date.parse(t.updatedAt) : NaN;
    if (!Number.isNaN(ms) && (best === undefined || ms < Date.parse(best))) best = t.updatedAt;
  }
  return best ?? fallback;
}
