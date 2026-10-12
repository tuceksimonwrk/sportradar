import type { Sport } from './index';
import { calendarFileName } from './calendar';

/** Detail se generuje pro zápasy, které začínají nejpozději za tolik hodin (hodinová pipeline, ne živě). */
export const DETAIL_WINDOW_HOURS = 36;

/** Řádek porovnání: hodnoty k zobrazení + volitelně čísla pro sloupek (lowerIsBetter = menší je lepší). */
export interface DetailStatRow {
  label: string;
  home: string | number; away: string | number;
  homeValue?: number; awayValue?: number;
  lowerIsBetter?: boolean;
}
export interface DetailStatBlock { title: string; rows: DetailStatRow[]; note?: string }

export interface LineupPlayer { name: string; number?: string | number; pos?: string; status?: string }  // status: 'Zraněn', 'Nejistý'…
export interface LineupGroup { title: string; players: LineupPlayer[] }
export interface TeamLineup { name: string; teamId?: string; groups: LineupGroup[] }

/** F1: pozice na roštu / v seznamu jezdců. */
export interface GridEntry { pos: number; name: string; team?: string; number?: string }
/** F1: pořadí šampionátu (jezdci / konstruktéři), value = body. */
export interface RankingRow { pos: number; name: string; sub?: string; value: number }
export interface RankingBlock { title: string; unit: string; rows: RankingRow[] }
export interface WeekendSession { id: string; label: string; startsAt: string }

export interface MatchDetail {
  matchId: string;
  sport: Sport;
  generatedAt: string;               // ISO, kdy pipeline detail vytvořila
  source: string;                    // 'NHL.com', 'ESPN'… (patička „Data z …“)
  homeName?: string; awayName?: string;   // F1: undefined
  stats: DetailStatBlock[];
  lineups?: { kind: 'roster' | 'confirmed'; home: TeamLineup; away: TeamLineup };
  grid?: GridEntry[];                // F1: startovní rošt (po kvalifikaci)
  drivers?: GridEntry[];             // F1: před kvalifikací seznam jezdců (podle pořadí šampionátu)
  rankings?: RankingBlock[];         // F1: pořadí jezdců a konstruktérů
  weekend?: { name: string; sessions: WeekendSession[] };   // F1: program víkendu
  notes: string[];                   // upřímné poznámky (co chybí a proč)
}
export interface DetailIndex { generatedAt: string; ids: string[] }

/** Název souboru detailu: stejný sanitizér jako kalendáře + `.json` ('nhl:1' → 'nhl_1.json'). */
export function detailFileName(id: string): string {
  return `${calendarFileName(id)}.json`;
}

/** Cesta detailu relativně k adresáři `data/`. */
export function detailPath(id: string): string {
  return `detail/${detailFileName(id)}`;
}

export function isMatchDetail(x: unknown): x is MatchDetail {
  const d = x as MatchDetail | null;
  return !!d && typeof d === 'object' && typeof d.matchId === 'string' && typeof d.sport === 'string'
    && Array.isArray(d.stats) && Array.isArray(d.notes);
}

export function isDetailIndex(x: unknown): x is DetailIndex {
  const d = x as DetailIndex | null;
  return !!d && typeof d === 'object' && Array.isArray(d.ids) && d.ids.every((i) => typeof i === 'string');
}
