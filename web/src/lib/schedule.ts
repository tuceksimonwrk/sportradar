import type { Match, Sport } from '@sportradar/shared';
import { dayKey } from './time';

const ONGOING_WINDOW_MS = 3 * 3600_000;

export function isFavorite(m: Match, favs: ReadonlySet<string>): boolean {
  return favs.has(m.sport) || m.teams.some((t) => favs.has(t));
}

export function selectMatches(matches: Match[], favs: ReadonlySet<string>, now: Date, sport: Sport | 'all' = 'all'): Match[] {
  const cutoff = now.getTime() - ONGOING_WINDOW_MS;
  return matches
    .filter((m) => Date.parse(m.startsAt) >= cutoff && (sport === 'all' || m.sport === sport) && isFavorite(m, favs))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}

export function groupByDay(matches: Match[], tz?: string): { key: string; matches: Match[] }[] {
  const groups: { key: string; matches: Match[] }[] = [];
  for (const m of matches) {
    const key = dayKey(m.startsAt, tz);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.matches.push(m); else groups.push({ key, matches: [m] });
  }
  return groups;
}
