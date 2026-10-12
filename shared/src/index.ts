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

export interface Match {
  id: string;            // globálně unikátní, např. "nhl:2026020084"
  sport: Sport;
  competition: string;   // "NHL", "Formule 1"…
  startsAt: string;      // ISO 8601 v UTC (…Z)
  title: string;         // "Domácí – Hosté" / "GP Monaka – Závod"
  teams: string[];       // id týmů, např. ["nhl:PIT","nhl:WSH"]; F1: []
  broadcasters: Broadcaster[];
  venue?: Venue;         // kde se hraje (volitelné)
}

export interface Team { id: string; sport: Sport; name: string }
export interface MatchesFile { generatedAt: string; matches: Match[] }
export interface TeamsFile { teams: Team[] }
