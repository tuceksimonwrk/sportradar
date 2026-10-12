import type { LiveGame } from '@sportradar/shared/src/live-feed';
import { trimClock } from './time';

/** Pevná šablona upstreamu; `day` musí projít validací (isIsoDay) v handleru. */
export const nhlUrl = (day: string) => `https://api-web.nhle.com/v1/score/${day}`;

const rec = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined);

function teamName(t: Record<string, unknown>): string | undefined {
  const n = rec(t.name)?.default;
  if (typeof n === 'string' && n.trim()) return n.trim();
  return typeof t.abbrev === 'string' && t.abbrev ? t.abbrev : undefined;
}

const PRE = new Set(['FUT', 'PRE']);
const LIVE = new Set(['LIVE', 'CRIT']);
const POST = new Set(['OFF', 'FINAL']);

function liveText(g: Record<string, unknown>): Pick<LiveGame, 'clock' | 'detail'> {
  const pd = rec(g.periodDescriptor);
  const clock = rec(g.clock);
  const n = int(pd?.number) ?? int(g.period) ?? 0;
  const type = typeof pd?.periodType === 'string' ? pd.periodType : 'REG';
  const left = typeof clock?.timeRemaining === 'string' && /^\d{1,2}:\d{2}$/.test(clock.timeRemaining) ? trimClock(clock.timeRemaining) : '';
  if (type === 'SO') return { detail: 'Nájezdy' };
  if (clock?.inIntermission === true) {
    return { detail: type === 'OT' || n > 3 ? 'Přestávka v prodloužení' : `Přestávka po ${n}. třetině` };
  }
  if (type === 'OT') {
    const k = Math.max(1, n - 3);
    return { ...(left && { clock: left }), detail: k > 1 ? `${k}. prodloužení` : 'Prodloužení' };
  }
  if (n < 1) return {};
  if (left === '0:00' && clock?.running !== true) return { detail: `Konec ${n}. třetiny` };
  return left ? { clock: `${n}. třetina ${left}` } : { clock: `${n}. třetina` };
}

/** Odpověď `/v1/score/{date}` → hry. Odložené/zrušené a nevalidní položky vynechá. */
export function parseNhlScore(json: unknown): LiveGame[] {
  const games = rec(json)?.games;
  if (!Array.isArray(games)) return [];
  const out: LiveGame[] = [];
  for (const raw of games) {
    const g = rec(raw);
    if (!g || !Number.isInteger(g.id) || (g.id as number) <= 0) continue;
    if (g.gameScheduleState !== undefined && g.gameScheduleState !== 'OK') continue;
    const h = rec(g.homeTeam);
    const a = rec(g.awayTeam);
    const home = h && teamName(h);
    const away = a && teamName(a);
    const state = typeof g.gameState === 'string' ? g.gameState : '';
    if (!h || !a || !home || !away) continue;
    const phase = PRE.has(state) ? 'pre' : LIVE.has(state) ? 'live' : POST.has(state) ? 'post' : undefined;
    if (!phase) continue;
    const game: LiveGame = { id: `nhl:${g.id}`, home, away, phase };
    if (phase !== 'pre') {
      const hs = int(h.score);
      const as = int(a.score);
      if (hs !== undefined) game.homeScore = hs;
      if (as !== undefined) game.awayScore = as;
    }
    if (phase === 'live') Object.assign(game, liveText(g));
    if (phase === 'post') {
      const last = rec(g.gameOutcome)?.lastPeriodType;
      game.detail = last === 'OT' ? 'Konec po prodloužení' : last === 'SO' ? 'Konec po nájezdech' : 'Konec';
    }
    const t = typeof g.startTimeUTC === 'string' ? Date.parse(g.startTimeUTC) : NaN;
    if (Number.isFinite(t)) game.startsAt = new Date(t).toISOString();
    out.push(game);
  }
  return out;
}
