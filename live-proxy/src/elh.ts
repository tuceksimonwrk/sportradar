import type { LiveGame } from '@sportradar/shared/src/live-feed';
import { pragueToUtcIso } from './time';

/**
 * JSON, který si načítá scoreboard na hokej.cz (public/js/mainScoreboard.js):
 * `https://json.esports.cz/hokejcz/scoreboard/<YYYY-MM-DD>.json` (pražský den; den bez zápasů = 404).
 * Klíč `101` = Tipsport extraliga.
 */
export const elhUrl = (day: string) => `https://json.esports.cz/hokejcz/scoreboard/${day}.json`;
const ELH_LEAGUE = '101';

const rec = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined);
const name = (v: unknown): string | undefined => {
  const n = rec(v)?.name;
  return typeof n === 'string' && n.trim() ? n.trim() : undefined;
};

/**
 * Alias stavu zápasu → text. Mapování převzaté z JS hokej.cz:
 * '1'–'3' třetina, '4'/'P' prodloužení, 'N' nájezdy, '1P'–'3P' a '10'/'20'/'30' přestávka po třetině.
 * Zdroj neposílá běžící čas, jen třetinu.
 */
function liveText(alias: string): Pick<LiveGame, 'clock' | 'detail'> {
  if (/^[123]$/.test(alias)) return { clock: `${alias}. třetina` };
  const pause = /^([123])(?:P|0)$/.exec(alias);
  if (pause) return { detail: `Přestávka po ${pause[1]}. třetině` };
  if (alias === 'P' || alias === '4') return { detail: 'Prodloužení' };
  if (alias === 'N' || alias === 'SN') return { detail: 'Nájezdy' };
  return {};
}

function postText(alias: string): string {
  return alias === 'KP' ? 'Konec po prodloužení' : alias === 'KN' ? 'Konec po nájezdech' : 'Konec';
}

/** Den scoreboardu hokej.cz → zápasy extraligy. Zrušené a nevalidní položky vynechá. */
export function parseElhScoreboard(json: unknown): LiveGame[] {
  const matches = rec(rec(json)?.[ELH_LEAGUE])?.matches;
  if (!Array.isArray(matches)) return [];
  const out: LiveGame[] = [];
  for (const raw of matches) {
    const m = rec(raw);
    if (!m) continue;
    const id = m.hokejcz_id;
    if (!(typeof id === 'number' && Number.isInteger(id) && id > 0) && !(typeof id === 'string' && /^\d{1,12}$/.test(id))) continue;
    const home = name(m.home);
    const away = name(m.visitor);
    if (!home || !away) continue;
    const status = typeof m.match_status === 'string' ? m.match_status : '';
    const alias = typeof m.match_actual_time_alias === 'string' ? m.match_actual_time_alias : '';
    const phase = status === 'před zápasem' ? 'pre' : status === 'live' ? 'live' : status === 'po zápase' ? 'post' : undefined;
    if (!phase) continue; // zrušeno / odloženo / neznámé
    const game: LiveGame = { id: `cz-hockey:${id}`, home, away, phase };
    if (phase !== 'pre') {
      const hs = int(m.score_home);
      const as = int(m.score_visitor);
      if (hs !== undefined) game.homeScore = hs;
      if (as !== undefined) game.awayScore = as;
    }
    if (phase === 'live') Object.assign(game, liveText(alias));
    if (phase === 'post') game.detail = postText(alias);
    const d = typeof m.date === 'string' ? /^(\d{2})-(\d{2})-(\d{4})$/.exec(m.date) : null;
    const t = typeof m.time === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(m.time) : null;
    if (d && t) game.startsAt = pragueToUtcIso(Number(d[3]), Number(d[2]), Number(d[1]), Number(t[1]), Number(t[2]));
    out.push(game);
  }
  return out;
}
