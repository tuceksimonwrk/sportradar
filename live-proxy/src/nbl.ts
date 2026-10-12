import type { LiveGame } from '@sportradar/shared/src/live-feed';
import { pragueToUtcIso, trimClock, zonedDay } from './time';

/** Rozpis NBL (server-rendered HTML) a FIBA LiveStats JSON jednoho zápasu (id jen číslice). */
export const NBL_SCHEDULE_URL = 'https://www.nbl.basketball/zapasy';
export const fibaUrl = (id: string) => `https://fibalivestats.dcd.shared.geniussports.com/data/${id}/data.json`;

export interface NblRow { fibaId?: string; home: string; away: string; startsAt: string }
export type FibaState = Pick<LiveGame, 'phase' | 'homeScore' | 'awayScore' | 'clock' | 'detail'>;

const BEFORE_MS = 15 * 60_000;
const AFTER_MS = 4 * 3600_000;
/** Jak dlouho po plánovaném začátku bez dat FIBA ještě hlásíme „pre“ (zpožděný začátek). */
const GRACE_MS = 30 * 60_000;

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
function decode(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 31 && n < 0x10000 ? String.fromCharCode(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  }).replace(/\s+/g, ' ').trim();
}

/**
 * Řádky tabulky /zapasy: `data-sort="YYYY-MM-DD-HH-MM"` (pražský čas), dvě jména týmů
 * (první dva sousední textové <div>y) a volitelný odkaz na fibalivestats.com/webcast/CBFFE/<id>.
 */
export function parseNblSchedule(html: string): NblRow[] {
  const out: NblRow[] = [];
  for (const m of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const tr = m[0];
    const sort = /data-sort="(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})"/.exec(tr);
    const names = /<div[^>]*>\s*([^<>]{2,80}?)\s*<\/div>\s*<div[^>]*>\s*([^<>]{2,80}?)\s*<\/div>/.exec(tr);
    if (!sort || !names) continue;
    const home = decode(names[1]);
    const away = decode(names[2]);
    if (!home || !away || /^[\d\s-]+$/.test(home) || /^[\d\s-]+$/.test(away)) continue;
    const [y, mo, d, h, mi] = sort.slice(1).map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) continue;
    const fiba = /fibalivestats\.com\/webcast\/[A-Za-z]+\/(\d{4,12})\//.exec(tr)?.[1];
    out.push({ ...(fiba && { fibaId: fiba }), home, away, startsAt: pragueToUtcIso(y, mo, d, h, mi) });
  }
  return out;
}

const rec = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
function points(t: Record<string, unknown> | undefined): number | undefined {
  for (const v of [t?.tot_sPoints, t?.score]) {
    const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0) return n;
  }
  return undefined;
}

/**
 * FIBA LiveStats `data.json` → stav. Konec = akce `game/end` v play-by-play; bez akcí = před zápasem;
 * poslední akce `period/end` = přestávka. Čtvrtiny a prodloužení podle `period`/`periodType`.
 */
export function parseFiba(json: unknown): FibaState | undefined {
  const j = rec(json);
  const tm = rec(j?.tm);
  const t1 = rec(tm?.['1']);
  const t2 = rec(tm?.['2']);
  if (!j || !t1 || !t2) return undefined;
  const pbp = Array.isArray(j.pbp) ? j.pbp.map(rec).filter((x): x is Record<string, unknown> => !!x) : [];
  if (pbp.length === 0) return { phase: 'pre' };
  const last = pbp.reduce((a, b) => (Number(b.actionNumber) > Number(a.actionNumber) ? b : a), pbp[0]);
  const ended = pbp.some((p) => p.actionType === 'game' && p.subType === 'end');
  const period = typeof j.period === 'number' && Number.isInteger(j.period) ? j.period : 0;
  const periodsMax = typeof j.periodsMax === 'number' && j.periodsMax > 0 ? j.periodsMax : 4;
  const ot = j.periodType === 'OVERTIME' || period > periodsMax;
  const s: FibaState = { phase: ended ? 'post' : 'live' };
  const hs = points(t1);
  const as = points(t2);
  if (hs !== undefined) s.homeScore = hs;
  if (as !== undefined) s.awayScore = as;
  if (ended) { s.detail = ot ? 'Konec po prodloužení' : 'Konec'; return s; }
  if (last.actionType === 'period' && last.subType === 'end') {
    s.detail = ot ? 'Konec prodloužení' : period === 2 ? 'Poločas' : `Konec ${period}. čtvrtiny`;
    return s;
  }
  const clock = typeof j.clock === 'string' && /^\d{1,2}:\d{2}$/.test(j.clock) ? trimClock(j.clock) : '';
  if (ot) { if (clock) s.clock = clock; s.detail = 'Prodloužení'; return s; }
  if (period >= 1) s.clock = clock ? `${period}. čtvrtina ${clock}` : `${period}. čtvrtina`;
  return s;
}

/**
 * Hry pro výstup: zápasy v okně [teď − 4 h, teď + 15 min] (u již začatých se ptáme FIBA)
 * a dnešní (pražský den) budoucí zápasy jako „pre“. Výstup seřazený podle začátku.
 */
export async function nblGames(
  rows: readonly NblRow[], now: number, getFiba: (id: string) => Promise<FibaState | undefined>,
): Promise<LiveGame[]> {
  const today = zonedDay(now, 'Europe/Prague');
  const picked = rows.filter((r) => {
    const t = Date.parse(r.startsAt);
    return (t >= now - AFTER_MS && t <= now + BEFORE_MS) || (t > now && zonedDay(t, 'Europe/Prague') === today);
  }).slice(0, 12);
  const games = await Promise.all(picked.map(async (r): Promise<LiveGame | undefined> => {
    const t = Date.parse(r.startsAt);
    const base: LiveGame = { home: r.home, away: r.away, startsAt: r.startsAt, phase: 'pre' };
    if (t > now) return base;
    const st = r.fibaId ? await getFiba(r.fibaId).catch(() => undefined) : undefined;
    if (st) return { ...base, ...st };
    return now < t + GRACE_MS ? base : undefined;
  }));
  return games.filter((g): g is LiveGame => !!g).sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!));
}
