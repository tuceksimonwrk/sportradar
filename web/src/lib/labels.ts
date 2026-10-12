import { SPORT_LABELS, type MatchResult, type Sport, type Venue } from '@sportradar/shared';

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

export interface ScoreParts { home: number; away: number; winner: 'home' | 'away' | 'draw' }

/** Skóre a vítěz; bez platného skóre (např. F1) null. */
export function scoreParts(result: MatchResult): ScoreParts | null {
  const { home, away } = result;
  if (typeof home !== 'number' || typeof away !== 'number' || !Number.isFinite(home) || !Number.isFinite(away)) return null;
  return { home, away, winner: home > away ? 'home' : away > home ? 'away' : 'draw' };
}

/** Text skóre pro čtečky obrazovky, např. „Sparta 3, Liberec 1“. */
export function scoreLabel(result: MatchResult): string | null {
  const s = scoreParts(result);
  if (!s) return null;
  return `${result.homeName?.trim() || 'Domácí'} ${s.home}, ${result.awayName?.trim() || 'hosté'} ${s.away}`;
}
