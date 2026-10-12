export type Sport = 'f1' | 'nba' | 'nhl' | 'cz-hockey' | 'cz-basket' | 'football';
export const SPORTS: Sport[] = ['f1', 'nhl', 'nba', 'cz-hockey', 'cz-basket', 'football'];
export const SPORT_LABELS: Record<Sport, string> = {
  f1: 'Formule 1',
  nhl: 'NHL',
  nba: 'NBA',
  'cz-hockey': 'Česká extraliga',
  'cz-basket': 'Česká NBL',
  football: 'Fotbal',
};

/** Soutěž v rámci sportu (zatím jen fotbal): id = slug ESPN (např. 'eng.1'), name = zobrazovaný název. */
export interface Competition { id: string; sport: Sport; name: string; short: string; country: string }
export const COMPETITIONS: Competition[] = [
  { id: 'eng.1', sport: 'football', name: 'Premier League', short: 'PL', country: 'Anglie' },
  { id: 'esp.1', sport: 'football', name: 'La Liga', short: 'LL', country: 'Španělsko' },
  { id: 'ita.1', sport: 'football', name: 'Serie A', short: 'SA', country: 'Itálie' },
  { id: 'ger.1', sport: 'football', name: 'Bundesliga', short: 'BL', country: 'Německo' },
  { id: 'fra.1', sport: 'football', name: 'Ligue 1', short: 'L1', country: 'Francie' },
  { id: 'uefa.champions', sport: 'football', name: 'Liga mistrů', short: 'LM', country: 'Evropa' },
  { id: 'cze.1', sport: 'football', name: 'Chance Liga', short: 'ČL', country: 'Česko' },
];

export function competitionById(id: string | undefined): Competition | undefined {
  return id ? COMPETITIONS.find((c) => c.id === id) : undefined;
}

const LEAGUE_PREFIX = 'league:';
/** Id oblíbené soutěže: 'league:eng.1'. */
export function leagueFavoriteId(compId: string): string {
  return `${LEAGUE_PREFIX}${compId}`;
}
/** 'league:eng.1' → 'eng.1'; jiné id nebo neznámá soutěž → undefined. */
export function parseLeagueFavorite(id: string): string | undefined {
  if (!id.startsWith(LEAGUE_PREFIX)) return undefined;
  return competitionById(id.slice(LEAGUE_PREFIX.length))?.id;
}

export interface Broadcaster { name: string; url?: string }
export interface Venue { name: string; city?: string }

export interface MatchResult {
  home?: number; away?: number;          // skóre domácí/hosté (týmové sporty)
  homeName?: string; awayName?: string;  // jména týmů pro kartu výsledku
  note?: string;                         // např. 'po prodloužení', 'po nájezdech'
  dateOnly?: boolean;                    // čas začátku neznáme (jen datum) → UI čas nezobrazí
  podium?: { pos: number; name: string }[]; // F1: první tři
}

export interface Match {
  id: string;            // globálně unikátní, např. "nhl:2026020084"
  sport: Sport;
  competition: string;   // "NHL", "Formule 1", "Premier League"…
  competitionId?: string; // id soutěže z COMPETITIONS (fotbal), jinak chybí
  startsAt: string;      // ISO 8601 v UTC (…Z)
  title: string;         // "Domácí – Hosté" / "GP Monaka – Závod"
  teams: string[];       // id týmů, např. ["nhl:PIT","nhl:WSH"]; F1: []
  broadcasters: Broadcaster[];
  venue?: Venue;         // kde se hraje (volitelné)
  result?: MatchResult;  // výsledek odehraného zápasu (volitelné)
}

export interface Team {
  id: string; sport: Sport; name: string;
  logo?: string;    // absolutní https URL oficiálního loga (hotlink)
  league?: string;  // fotbal: id domácí soutěže klubu (klub jen z Ligy mistrů → 'uefa.champions')
}
export interface MatchesFile { generatedAt: string; matches: Match[] }
export interface TeamsFile { teams: Team[] }

export interface StandingsColumn { key: string; label: string; title?: string }   // label = krátký popisek (Z, V, P, B…), title = celý název
export interface StandingRow {
  pos: number;
  name: string;                 // tým / jezdec
  sub?: string;                 // F1 jezdci: jméno týmu
  teamId?: string;              // id týmu shodné s Team.id (pro zvýraznění oblíbených), jinak undefined
  values: Record<string, string | number>;   // klíč = StandingsColumn.key
}
export interface StandingsTable {
  id: string; sport: Sport; title: string; columns: StandingsColumn[]; rows: StandingRow[];
  updatedAt?: string;           // ISO: kdy se tabulka naposledy úspěšně stáhla (přenesené tabulky si starou hodnotu drží)
}
export interface StandingsFile { generatedAt: string; tables: StandingsTable[] }

export * from './groups';
export * from './calendar';
export * from './detail';
export * from './live-feed';
