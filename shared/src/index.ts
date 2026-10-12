export type Sport = 'f1' | 'nba' | 'nhl' | 'cz-hockey' | 'cz-basket';
export const SPORTS: Sport[] = ['f1', 'nhl', 'nba', 'cz-hockey', 'cz-basket'];
export const SPORT_LABELS: Record<Sport, string> = {
  f1: 'Formule 1',
  nhl: 'NHL',
  nba: 'NBA',
  'cz-hockey': 'Česká extraliga',
  'cz-basket': 'Česká NBL',
};

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
  competition: string;   // "NHL", "Formule 1"…
  startsAt: string;      // ISO 8601 v UTC (…Z)
  title: string;         // "Domácí – Hosté" / "GP Monaka – Závod"
  teams: string[];       // id týmů, např. ["nhl:PIT","nhl:WSH"]; F1: []
  broadcasters: Broadcaster[];
  venue?: Venue;         // kde se hraje (volitelné)
  result?: MatchResult;  // výsledek odehraného zápasu (volitelné)
}

export interface Team { id: string; sport: Sport; name: string }
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
