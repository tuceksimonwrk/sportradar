import { ALL_FILTER, leagueFavoriteId, matchPassesFilter, type Match, type MatchFilter } from '@sportradar/shared';
import { LIVE_AFTER_MS } from './live';
import { dayKey } from './time';

const ONGOING_WINDOW_MS = 3 * 3600_000;
const RESULTS_WINDOW_MS = 14 * 86400_000;

export function isFavorite(m: Match, favs: ReadonlySet<string>): boolean {
  return favs.has(m.sport) || m.teams.some((t) => favs.has(t))
    || (!!m.competitionId && favs.has(leagueFavoriteId(m.competitionId)));
}

export interface SelectOptions {
  showAll?: boolean;
  windowMs?: number;               // jak dlouho po začátku zápas ještě bereme jako probíhající (výchozí 3 h)
  liveIds?: ReadonlySet<string>;   // zápasy živě hlášené zdrojem: zůstávají viditelné až do LIVE_AFTER_MS
}

export function selectMatches(matches: Match[], favs: ReadonlySet<string>, now: Date, filter: MatchFilter = ALL_FILTER, opts: SelectOptions = {}): Match[] {
  const cutoff = now.getTime() - (opts.windowMs ?? ONGOING_WINDOW_MS);
  const liveCutoff = now.getTime() - Math.max(opts.windowMs ?? 0, LIVE_AFTER_MS);
  return matches
    .filter((m) => Date.parse(m.startsAt) >= (opts.liveIds?.has(m.id) ? liveCutoff : cutoff) && matchPassesFilter(m, filter) && (opts.showAll || isFavorite(m, favs)) && !m.result)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}

/** Odehrané zápasy oblíbených za posledních 14 dní, nejnovější první. */
export function selectResults(matches: Match[], favs: ReadonlySet<string>, now: Date, filter: MatchFilter = ALL_FILTER, opts: SelectOptions = {}): Match[] {
  const cutoff = now.getTime() - RESULTS_WINDOW_MS;
  return matches
    .filter((m) => m.result && Date.parse(m.startsAt) >= cutoff && matchPassesFilter(m, filter) && (opts.showAll || isFavorite(m, favs)))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt) || a.id.localeCompare(b.id));
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

export const CHUNK_SIZE = 30;

/** Prvních `count` zápasů (hero Programu se počítá jako první) a počet skrytých; dny se skládají až z `shown`. */
export function chunkMatches(matches: Match[], count: number): { shown: Match[]; remaining: number } {
  const n = Math.max(0, Math.floor(count));
  return { shown: matches.slice(0, n), remaining: Math.max(0, matches.length - n) };
}
