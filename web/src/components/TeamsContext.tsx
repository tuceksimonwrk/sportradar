import { createContext, useContext } from 'react';
import type { Team } from '@sportradar/shared';

export interface TeamsInfo {
  teams: ReadonlyMap<string, Team>;          // id → tým (logo, název)
  driverTeams: ReadonlyMap<string, string>;  // F1: normalizované jméno jezdce → tým
}

const empty: TeamsInfo = { teams: new Map(), driverTeams: new Map() };
export const TeamsContext = createContext<TeamsInfo>(empty);
export const useTeams = () => useContext(TeamsContext);
