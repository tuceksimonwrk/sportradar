import { DETAIL_WINDOW_HOURS, type DetailIndex, type DetailStatBlock, type DetailStatRow, type Match, type MatchDetail, type Sport, type StandingRow, type StandingsTable, type Team } from '@sportradar/shared';

/** Stažení textu (v produkci `getText` z util – identifikující User-Agent). */
export type RawGet = (url: string) => Promise<string>;

/** Stahovač pro detaily: cache podle URL po dobu běhu (týmová data jen jednou), max `limit` souběžných požadavků, počítadlo. */
export interface Fetcher {
  text(url: string): Promise<string>;
  json<T = any>(url: string): Promise<T>;
  readonly count: number;
  readonly urls: readonly string[];   // skutečně stažené URL (bez cache) v pořadí
}

export function createFetcher(raw: RawGet, limit = 4): Fetcher {
  const cache = new Map<string, Promise<string>>();
  const queue: (() => void)[] = [];
  let active = 0;
  let count = 0;
  const urls: string[] = [];
  const acquire = () => new Promise<void>((res) => {
    if (active < limit) { active++; res(); } else queue.push(() => { active++; res(); });
  });
  const release = () => { active--; queue.shift()?.(); };
  const text = (url: string) => {
    let p = cache.get(url);
    if (!p) {
      p = (async () => {
        await acquire();
        count++; urls.push(url);
        try { return await raw(url); } finally { release(); }
      })();
      cache.set(url, p);
    }
    return p;
  };
  return {
    text,
    async json<T>(url: string) { return JSON.parse(await text(url)) as T; },
    get count() { return count; },
    get urls() { return urls; },
  };
}

export interface DetailContext {
  get: Fetcher;
  now: Date;
  matches: Match[];            // všechny sloučené zápasy (F1: program víkendu)
  teams: Team[];
  standings: StandingsTable[];
}
export type DetailBuilder = (match: Match, ctx: DetailContext) => Promise<MatchDetail>;

const ONGOING_MS = 3 * 3600_000;

/** Zápasy bez výsledku se startem v [now − 3 h, now + hours] (probíhající si detail nechají), nejbližší první, max `cap`. */
export function selectDetailMatches(matches: Match[], now: Date, hours = DETAIL_WINDOW_HOURS, cap = 320): Match[] {
  const from = now.getTime() - ONGOING_MS;
  const to = now.getTime() + hours * 3600_000;
  return matches
    .filter((m) => { const t = Date.parse(m.startsAt); return !m.result && Number.isFinite(t) && t >= from && t <= to; })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
    .slice(0, cap);
}

/** Soubory k odstranění: .json, které tento běh nevytvořil (index.json nikdy). */
export function staleDetailFiles(existing: string[], keep: ReadonlySet<string>): string[] {
  return existing.filter((f) => f.endsWith('.json') && f !== 'index.json' && !keep.has(f));
}

export function buildDetailIndex(ids: string[], now: Date): DetailIndex {
  return { generatedAt: now.toISOString(), ids: [...new Set(ids)].sort() };
}

/** Čerstvý detail, jinak předchozí soubor téhož zápasu (kept = použita stará data), jinak nic. */
export function pickDetail(fresh: MatchDetail | Error, prev: MatchDetail | null, id?: string): { detail: MatchDetail | null; kept: boolean } {
  if (!(fresh instanceof Error)) return { detail: fresh, kept: false };
  if (prev && prev.matchId === (id ?? prev.matchId)) return { detail: prev, kept: true };
  return { detail: null, kept: false };
}

/** Sporty, u nichž selhaly všechny detaily v okně (pak exit 2); jednotlivá chyba sport neshodí. */
export function failedDetailSports(outcomes: { sport: Sport; ok: boolean }[]): Sport[] {
  const by = new Map<Sport, boolean>();
  for (const o of outcomes) by.set(o.sport, (by.get(o.sport) ?? false) || o.ok);
  return [...by].filter(([, ok]) => !ok).map(([s]) => s);
}

/** Česká desetinná čárka: dec(3.456, 2) → '3,46'. */
export function dec(n: number, digits: number): string {
  return n.toFixed(digits).replace('.', ',');
}

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const toNum = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

export interface Side { name: string; teamId?: string }

/** Domácí a hosté z titulku „Domácí – Hosté“ (+ id z `teams`); F1 / jiný tvar → null. */
export function sidesOf(m: Pick<Match, 'title' | 'teams' | 'sport'>): { home: Side; away: Side } | null {
  if (m.sport === 'f1') return null;
  const parts = m.title.split(' – ').map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const ids = m.teams.length === 2 ? m.teams : [];
  return { home: { name: parts[0], teamId: ids[0] }, away: { name: parts[1], teamId: ids[1] } };
}

export function standingFor(tables: StandingsTable[], teamId: string | undefined): { row: StandingRow; table: StandingsTable } | undefined {
  if (!teamId) return undefined;
  for (const table of tables) {
    const row = table.rows.find((r) => r.teamId === teamId);
    if (row) return { row, table };
  }
  return undefined;
}

/** Skóre 'vstřeleno:obdrženo' → čísla. */
export function parseScore(s: unknown): [number, number] | undefined {
  const m = typeof s === 'string' ? /^(\d+):(\d+)$/.exec(s.trim()) : null;
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

/** Česky skloňovaná série: W/L/OT + počet → '1 výhra', '2 prohry', '1 prohra po prodl.'. */
export function streakLabel(code: unknown, count: unknown): string | undefined {
  if (!isNum(count) || count < 1) return undefined;
  const pl = (one: string, few: string, many: string) => (count === 1 ? one : count < 5 ? few : many);
  if (code === 'W') return `${count} ${pl('výhra', 'výhry', 'výher')}`;
  if (code === 'L') return `${count} ${pl('prohra', 'prohry', 'proher')}`;
  if (code === 'OT') return `${count} ${pl('prohra', 'prohry', 'proher')} po prodl.`;
  return undefined;
}

/** Znaménko s typografickým minusem: 5 → '+5', -14 → '−14'. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
export const pct = (n: number, digits = 1) => `${dec(n * 100, digits)} %`;

/** Řádek z dvojice čísel; chybí-li některé, undefined (řádek se vynechá). */
export function numRow(label: string, h: unknown, a: unknown, fmt: (n: number) => string | number = (n) => n, lowerIsBetter = false): DetailStatRow | undefined {
  if (!isNum(h) || !isNum(a)) return undefined;
  return { label, home: fmt(h), away: fmt(a), homeValue: h, awayValue: a, ...(lowerIsBetter && { lowerIsBetter: true }) };
}
export function textRow(label: string, h: string | undefined, a: string | undefined): DetailStatRow | undefined {
  return h && a ? { label, home: h, away: a } : undefined;
}
export const rows = (...r: (DetailStatRow | undefined)[]) => r.filter((x): x is DetailStatRow => !!x);
export const blockOf = (title: string, r: DetailStatRow[], note?: string): DetailStatBlock[] => (r.length ? [{ title, rows: r, ...(note && { note }) }] : []);

const SOURCES: [RegExp, string][] = [
  [/nhle\.com/, 'nhl'], [/\/basketball\/nba\//, 'nba'], [/\/sports\/soccer\//, 'football'],
  [/hokej\.cz/, 'cz-hockey'], [/nbl\.basketball/, 'cz-basket'], [/jolpi\.ca/, 'f1'],
];
/** Počty požadavků detailů podle sportu (odvozeno ze zdroje URL; neznámé → 'other'). */
export function requestsBySport(urls: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const u of urls) { const k = SOURCES.find(([re]) => re.test(u))?.[1] ?? 'other'; out[k] = (out[k] ?? 0) + 1; }
  return out;
}
