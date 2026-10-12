import { SPORT_LABELS, type Sport } from '@sportradar/shared';

/** „Štítek sportu · soutěž“, bez zdvojení, když soutěž štítek už obsahuje. */
export function competitionLine(sport: Sport, competition: string): string {
  const label = SPORT_LABELS[sport];
  const c = competition.trim();
  const lc = c.toLowerCase();
  const ll = label.toLowerCase();
  if (lc === ll || lc.startsWith(`${ll} `)) return c;
  return `${label} · ${c}`;
}
