import type { Match, Sport, StandingsTable, Team } from '@sportradar/shared';

export interface AdapterResult {
  matches: Match[]; teams: Team[]; standings?: StandingsTable[]; standingsError?: string;
  /** Soutěže (competitionId), jejichž zdroj selhal – merge si u nich ponechá předchozí zápasy a týmy (Team.league). */
  failedCompetitions?: string[];
  /** Varování k částečnému selhání (vypíše run.ts jako ::warning::). */
  warnings?: string[];
  /** Informační řádky do logu běhu (např. počty požadavků). */
  log?: string[];
}
export interface Adapter { sport: Sport; fetch(now: Date): Promise<AdapterResult> }
