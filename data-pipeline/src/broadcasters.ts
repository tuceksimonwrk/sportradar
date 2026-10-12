import { parse } from 'yaml';
import type { Broadcaster, Match } from '@sportradar/shared';

export interface BroadcasterConfig {
  bySport: Record<string, (Broadcaster & Record<string, unknown>)[]>;
  byMatch: Record<string, (Broadcaster & Record<string, unknown>)[]>;
}

export function parseBroadcasters(text: string): BroadcasterConfig {
  const raw = (parse(text) ?? {}) as Partial<BroadcasterConfig>;
  return { bySport: raw.bySport ?? {}, byMatch: raw.byMatch ?? {} };
}

export function applyBroadcasters(matches: Match[], cfg: BroadcasterConfig): Match[] {
  return matches.map((m) => {
    const all = [...m.broadcasters, ...(cfg.bySport[m.sport] ?? []), ...(cfg.byMatch[m.id] ?? [])];
    const seen = new Set<string>();
    const broadcasters = all
      .filter((b) => (seen.has(b.name) ? false : (seen.add(b.name), true)))
      .map((b) => (b.url ? { name: b.name, url: b.url } : { name: b.name }));
    return { ...m, broadcasters };
  });
}
