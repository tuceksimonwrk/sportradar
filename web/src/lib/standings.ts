import { COMPETITIONS, SPORTS, competitionById, parseLeagueFavorite, type Sport, type StandingRow, type StandingsFile, type StandingsTable, type Team } from '@sportradar/shared';

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

/** Výběr jedné tabulky (čipy) jen u sportů s více než dvěma tabulkami (fotbal); NHL/NBA/F1 zůstávají pod sebou. */
export function showTableSelector(tables: readonly StandingsTable[]): boolean {
  return tables.length > 2;
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
