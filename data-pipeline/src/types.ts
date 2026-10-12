import type { Match, Sport, Team } from '@sportradar/shared';

export interface AdapterResult { matches: Match[]; teams: Team[] }
export interface Adapter { sport: Sport; fetch(now: Date): Promise<AdapterResult> }
