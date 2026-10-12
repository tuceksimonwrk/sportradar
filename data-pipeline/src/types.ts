import type { Match, Sport, StandingsTable, Team } from '@sportradar/shared';

export interface AdapterResult { matches: Match[]; teams: Team[]; standings?: StandingsTable[]; standingsError?: string }
export interface Adapter { sport: Sport; fetch(now: Date): Promise<AdapterResult> }
