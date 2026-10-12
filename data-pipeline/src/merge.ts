import { SPORTS, type Match, type Sport, type Team } from '@sportradar/shared';
import type { AdapterResult } from './types';

export interface Dataset { matches: Match[]; teams: Team[] }
export type SportOutcome = AdapterResult | Error;

const KEEP_AFTER_START_MS = 6 * 3600_000;
const KEEP_RESULT_MS = 14 * 24 * 3600_000;

/** Počet nadcházejících (bez výsledku) zápasů. */
export function upcomingCount(matches: Match[]): number {
  return matches.filter((x) => !x.result).length;
}

export function mergeDatasets(prev: Dataset, outcomes: Partial<Record<Sport, SportOutcome>>, now: Date): Dataset {
  const matches = new Map<string, Match>();
  const teams = new Map<string, Team>();
  const resultCutoff = now.getTime() - KEEP_RESULT_MS;
  for (const sport of SPORTS) {
    const out = outcomes[sport];
    const ok = out && !(out instanceof Error) ? out : null;
    const fresh = ok && upcomingCount(ok.matches) > 0 ? ok : null;
    const prevMatches = prev.matches.filter((x) => x.sport === sport);
    if (fresh) {
      // výsledky jsou po skončení neměnné → přenášíme je z minula (čerstvá data vyhrávají při stejném id)
      for (const x of prevMatches) if (x.result && Date.parse(x.startsAt) >= resultCutoff) matches.set(x.id, x);
      for (const x of fresh.matches) matches.set(x.id, x);
      for (const x of fresh.teams) teams.set(x.id, x);
    } else {
      // chyba / žádné nadcházející zápasy: ponecháme staré, jen případné nové výsledky přidáme
      for (const x of prevMatches) matches.set(x.id, x);
      for (const x of ok?.matches ?? []) if (x.result) matches.set(x.id, x);
      for (const x of prev.teams) if (x.sport === sport) teams.set(x.id, x);
    }
  }
  const cutoff = now.getTime() - KEEP_AFTER_START_MS;
  return {
    matches: [...matches.values()]
      .filter((x) => Date.parse(x.startsAt) >= (x.result ? resultCutoff : cutoff))
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
    if (x.sport !== sport || x.result) return false;
    const t = Date.parse(x.startsAt);
    return t >= from && t <= to;
  });
}
