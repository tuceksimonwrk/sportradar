import { SPORT_LABELS, type Sport, type Venue } from '@sportradar/shared';

/** „Štítek sportu · soutěž“, bez zdvojení, když soutěž štítek už obsahuje. */
export function competitionLine(sport: Sport, competition: string): string {
  const label = SPORT_LABELS[sport];
  const c = competition.trim();
  const lc = c.toLowerCase();
  const ll = label.toLowerCase();
  if (lc === ll || lc.startsWith(`${ll} `)) return c;
  return `${label} · ${c}`;
}

/** „📍 název, město“ (nebo jen název); bez venue / s prázdným názvem null. */
export function venueLine(venue?: Venue): string | null {
  const name = venue?.name?.trim();
  if (!name) return null;
  const city = venue?.city?.trim();
  return city ? `📍 ${name}, ${city}` : `📍 ${name}`;
}
