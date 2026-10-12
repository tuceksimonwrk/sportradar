import { COMPETITIONS, SPORT_LABELS, type Match, type Sport } from './index';

/** Prezentační vrstva filtrů: interní `Sport` (zdroj dat) se pro uživatele skládá do sportů (Hokej, Basketbal…). */
export type GroupId = 'f1' | 'hockey' | 'basketball' | 'football';
export interface SportGroup { id: GroupId; label: string; sports: Sport[] }

export const SPORT_GROUPS: SportGroup[] = [
  { id: 'f1', label: 'Formule 1', sports: ['f1'] },
  { id: 'hockey', label: 'Hokej', sports: ['nhl', 'cz-hockey'] },
  { id: 'basketball', label: 'Basketbal', sports: ['nba', 'cz-basket'] },
  { id: 'football', label: 'Fotbal', sports: ['football'] },
];

export function groupById(id: GroupId): SportGroup {
  return SPORT_GROUPS.find((g) => g.id === id)!;
}
export function groupOfSport(sport: Sport): GroupId {
  return SPORT_GROUPS.find((g) => g.sports.includes(sport))!.id;
}

/** Soutěž ve skupině: u hokeje a basketbalu je `id` interní sport, u fotbalu `competitionId`. */
export interface GroupCompetition { id: string; label: string; title?: string; sport: Sport }
export function competitionsOfGroup(group: GroupId): GroupCompetition[] {
  if (group === 'football') {
    return COMPETITIONS.filter((c) => c.sport === 'football').map((c) => ({ id: c.id, label: c.name, title: `${c.name} (${c.country})`, sport: c.sport }));
  }
  const sports = groupById(group).sports;
  return sports.length < 2 ? [] : sports.map((s) => ({ id: s, label: SPORT_LABELS[s], sport: s }));
}

/** Filtr zápasů: skupina sportů + soutěž v ní ('all' = všechny). */
export interface MatchFilter { group: GroupId | 'all'; competition: string }
export const ALL_FILTER: MatchFilter = { group: 'all', competition: 'all' };

/** Soutěž, která do skupiny nepatří (nebo neznámá), se mění na 'all'. */
export function normalizeFilter(f: MatchFilter): MatchFilter {
  if (f.group === 'all') return ALL_FILTER;
  return competitionsOfGroup(f.group).some((c) => c.id === f.competition) ? f : { group: f.group, competition: 'all' };
}

export function matchPassesFilter(m: Match, filter: MatchFilter): boolean {
  const f = normalizeFilter(filter);
  if (f.group === 'all') return true;
  if (groupOfSport(m.sport) !== f.group) return false;
  if (f.competition === 'all') return true;
  return (f.group === 'football' ? m.competitionId : m.sport) === f.competition;
}

/** Interní sport pro motiv stránky (barva, grafika, ikona): vybraná soutěž, jinak první sport skupiny. */
export function filterSport(filter: MatchFilter): Sport | 'all' {
  const f = normalizeFilter(filter);
  if (f.group === 'all') return 'all';
  return competitionsOfGroup(f.group).find((c) => c.id === f.competition)?.sport ?? groupById(f.group).sports[0];
}
