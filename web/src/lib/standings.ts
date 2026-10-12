import { SPORTS, type Sport, type StandingRow, type StandingsFile, type StandingsTable } from '@sportradar/shared';

/** Sport z id oblíbené položky: `nhl:PIT` → nhl, `f1` → f1; neznámé → undefined. */
function sportOfId(id: string): Sport | undefined {
  const prefix = id.split(':', 1)[0];
  return SPORTS.find((s) => s === prefix);
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
