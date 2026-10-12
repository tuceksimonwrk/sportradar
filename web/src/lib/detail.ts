import type { DetailStatRow, MatchDetail, Sport } from '@sportradar/shared';
import { dayKey, formatTime } from './time';

export interface BarWidths { home: number; away: number; better: 'home' | 'away' | null }

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Šířky dvou protilehlých sloupků (0–100 %). Delší sloupek = lepší hodnota:
 * běžně poměr k většímu, u `lowerIsBetter` poměr menší/hodnota. Záporná čísla (rozdíl skóre) se posunou na 0.
 */
export function statBarWidths(home: number | undefined, away: number | undefined, lowerIsBetter = false): BarWidths {
  if (typeof home !== 'number' || typeof away !== 'number' || !Number.isFinite(home) || !Number.isFinite(away)) return { home: 0, away: 0, better: null };
  const better = home === away ? null : (home > away) !== lowerIsBetter ? 'home' : 'away';
  const shift = Math.min(home, away, 0);
  const h = home - shift; const a = away - shift;
  if (lowerIsBetter) {
    const min = Math.min(h, a);
    const w = (v: number) => (v === min ? 100 : v === 0 ? 100 : r1((min / v) * 100));
    return { home: w(h), away: w(a), better };
  }
  const max = Math.max(h, a);
  if (max === 0) return { home: 0, away: 0, better };
  return { home: r1((h / max) * 100), away: r1((a / max) * 100), better };
}

/** Šířka pruhu v pořadí (body vůči lídrovi). */
export function rankingWidth(value: number, leader: number): number {
  if (!(leader > 0) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, r1((value / leader) * 100)));
}

/** Barevný tón štítku stavu hráče (vždy doplněný textem). */
export function statusTone(status: string): 'out' | 'doubt' {
  return /zraněn|suspend|mimo/i.test(status) ? 'out' : 'doubt';
}

export function hasDetail(ids: ReadonlySet<string> | null | undefined, id: string): boolean {
  return !!ids && ids.has(id);
}

const STALE_MS = 3 * 3600_000;

/** Patička panelu: 'Data z ESPN, aktualizováno 14:05' (jiný den i s datem); stale = starší než 3 h. */
export function detailFooter(d: Pick<MatchDetail, 'source' | 'generatedAt'>, now: Date, tz?: string): { text: string; stale: boolean } {
  const t = Date.parse(d.generatedAt);
  if (Number.isNaN(t)) return { text: `Data z ${d.source}`, stale: true };
  const sameDay = dayKey(d.generatedAt, tz) === dayKey(now.toISOString(), tz);
  const date = sameDay ? '' : `${new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, day: 'numeric', month: 'numeric' }).format(new Date(t))} `;
  return { text: `Data z ${d.source}, aktualizováno ${date}${formatTime(d.generatedAt, tz)}`, stale: now.getTime() - t > STALE_MS };
}

const COMPACT_SQUAD = 18;
/** Třída sestav: dlouhé soupisky (fotbal: 25–35 hráčů na tým) se vykreslí kompaktně (hustší řádky, na širším mobilu 2 sloupce). */
export function lineupsClass(l: NonNullable<MatchDetail['lineups']>): string {
  const size = (t: typeof l.home) => t.groups.reduce((n, g) => n + g.players.length, 0);
  return l.kind === 'roster' && Math.max(size(l.home), size(l.away)) > COMPACT_SQUAD ? 'dlineups dlineups--compact' : 'dlineups';
}

export function detailTabs(sport: Sport): [string, string] {
  return sport === 'f1' ? ['Pořadí', 'Rošt'] : ['Porovnání', 'Sestavy'];
}

/** Řádek porovnání jako věta pro čtečky obrazovky. */
export function statSentence(row: Pick<DetailStatRow, 'label' | 'home' | 'away'>, homeName: string, awayName: string): string {
  return `${row.label}: ${homeName} ${row.home}, ${awayName} ${row.away}`;
}
