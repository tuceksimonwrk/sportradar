import { SPORTS, type Match, type Sport, type Team } from '@sportradar/shared';
import type { AdapterResult } from './types';

export interface Dataset { matches: Match[]; teams: Team[] }
export type SportOutcome = AdapterResult | Error;

const KEEP_AFTER_START_MS = 6 * 3600_000;

export function mergeDatasets(prev: Dataset, outcomes: Partial<Record<Sport, SportOutcome>>, now: Date): Dataset {
  const matches = new Map<string, Match>();
  const teams = new Map<string, Team>();
  for (const sport of SPORTS) {
    const out = outcomes[sport];
    const fresh = out && !(out instanceof Error) && out.matches.length > 0 ? out : null;
    const ms = fresh ? fresh.matches : prev.matches.filter((x) => x.sport === sport);
    const ts = fresh ? fresh.teams : prev.teams.filter((x) => x.sport === sport);
    for (const x of ms) matches.set(x.id, x);
    for (const x of ts) teams.set(x.id, x);
  }
  const cutoff = now.getTime() - KEEP_AFTER_START_MS;
  return {
    matches: [...matches.values()]
      .filter((x) => Date.parse(x.startsAt) >= cutoff)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id)),
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs')),
  };
}

const SUSPICIOUS_WINDOW_MS = 7 * 24 * 3600_000;

/** Prázdný výsledek je podezřelý jen tehdy, pokud předchozí data měla zápas daného sportu v příštích 7 dnech. */
export function isSuspiciousEmpty(prev: Dataset, sport: Sport, now: Date): boolean {
  const from = now.getTime();
  const to = from + SUSPICIOUS_WINDOW_MS;
  return prev.matches.some((x) => {
    if (x.sport !== sport) return false;
    const t = Date.parse(x.startsAt);
    return t >= from && t <= to;
  });
}
