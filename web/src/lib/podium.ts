import type { MatchResult, StandingsFile } from '@sportradar/shared';

export type Medal = 'gold' | 'silver' | 'bronze';
export interface PodiumSlot { pos: 1 | 2 | 3; name: string; team?: string; medal: Medal }

const MEDALS: Record<1 | 2 | 3, Medal> = { 1: 'gold', 2: 'silver', 3: 'bronze' };

export function normName(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Jezdec → tým z tabulky jezdců (klíč normalizované jméno). */
export function driverTeamMap(file: StandingsFile | null): Map<string, string> {
  const out = new Map<string, string>();
  const t = file?.tables.find((x) => x.id === 'f1-drivers');
  for (const r of t?.rows ?? []) if (r.sub) out.set(normName(r.name), r.sub);
  return out;
}

/** Stupně vítězů ve vizuálním pořadí 2 – 1 – 3 (chybějící místa vynechá). */
export function podiumSlots(podium: MatchResult['podium'], driverTeams?: ReadonlyMap<string, string>): PodiumSlot[] {
  const byPos = new Map((podium ?? []).filter((p) => p.pos >= 1 && p.pos <= 3).map((p) => [p.pos, p.name]));
  return ([2, 1, 3] as const)
    .filter((pos) => byPos.has(pos))
    .map((pos) => {
      const name = byPos.get(pos)!;
      return { pos, name, team: driverTeams?.get(normName(name)), medal: MEDALS[pos] };
    });
}

/** Tříznakový kód jezdce jako v TV grafice: „Max Verstappen“ → VER. */
export function driverCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? '';
  const plain = last.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z]/g, '');
  return (plain.slice(0, 3) || '?').toUpperCase();
}
