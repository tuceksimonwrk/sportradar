import type { Match, Team } from '@sportradar/shared';

export interface Side { name: string; teamId?: string }

/** Domácí a hosté z titulku „Domácí – Hosté“ a `teams` (domácí první); jinak null (pak se ukáže titulek). */
export function matchSides(m: Pick<Match, 'title' | 'teams'>, teams?: ReadonlyMap<string, Team>): [Side, Side] | null {
  const ids = m.teams.length === 2 ? m.teams : undefined;
  const parts = m.title.split(' – ').map((s) => s.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return [{ name: parts[0], teamId: ids?.[0] }, { name: parts[1], teamId: ids?.[1] }];
  }
  if (ids) {
    const a = teams?.get(ids[0])?.name;
    const b = teams?.get(ids[1])?.name;
    if (a && b) return [{ name: a, teamId: ids[0] }, { name: b, teamId: ids[1] }];
  }
  return null;
}

/** F1: „GP Monaka – Závod“ → { event: 'GP Monaka', session: 'Závod' }. */
export function splitSession(title: string): { event: string; session?: string } {
  const i = title.lastIndexOf(' – ');
  if (i <= 0) return { event: title };
  return { event: title.slice(0, i).trim(), session: title.slice(i + 3).trim() || undefined };
}
