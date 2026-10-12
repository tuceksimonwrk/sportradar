import { parse } from 'yaml';
import type { Broadcaster, Match } from '@sportradar/shared';

type Entry = Broadcaster & Record<string, unknown>;
export interface BroadcasterConfig {
  bySport: Record<string, Entry[]>;
  byMatch: Record<string, Entry[]>;
  /** Podle Match.competitionId (fotbal: 'eng.1', 'cze.1'…). */
  byCompetition: Record<string, Entry[]>;
}

export function parseBroadcasters(text: string): BroadcasterConfig {
  const raw = (parse(text) ?? {}) as Partial<BroadcasterConfig>;
  return { bySport: raw.bySport ?? {}, byMatch: raw.byMatch ?? {}, byCompetition: raw.byCompetition ?? {} };
}

export function applyBroadcasters(matches: Match[], cfg: BroadcasterConfig): Match[] {
  return matches.map((m) => {
    const all = [
      ...m.broadcasters, ...(cfg.bySport[m.sport] ?? []),
      ...(m.competitionId ? cfg.byCompetition[m.competitionId] ?? [] : []),
      ...(cfg.byMatch[m.id] ?? []),
    ];
    const seen = new Set<string>();
    const broadcasters = all
      .filter((b) => (seen.has(b.name) ? false : (seen.add(b.name), true)))
      .map((b) => (b.url ? { name: b.name, url: b.url } : { name: b.name }));
    return { ...m, broadcasters };
  });
}
