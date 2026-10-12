import { parse } from 'yaml';
import type { Match } from '@sportradar/shared';

export interface VenueEntry { name: string; city: string; checked?: string; source?: string }
export interface VenueConfig { teams: Record<string, VenueEntry> }

export function parseVenues(text: string): VenueConfig {
  const raw = (parse(text) ?? {}) as Partial<VenueConfig>;
  return { teams: raw.teams ?? {} };
}

/** Domácí hala podle domácího týmu (teams[0]); existující venue nikdy nepřepisuje. */
export function applyVenues(matches: Match[], cfg: VenueConfig): Match[] {
  return matches.map((m) => {
    if (m.venue) return m;
    const v = m.teams[0] ? cfg.teams[m.teams[0]] : undefined;
    return v?.name ? { ...m, venue: v.city ? { name: v.name, city: v.city } : { name: v.name } } : m;
  });
}
