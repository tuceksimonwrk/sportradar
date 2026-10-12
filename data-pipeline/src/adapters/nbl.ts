import * as cheerio from 'cheerio';
import type { Match, StandingRow, StandingsTable, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { getText, pragueToUtcIso, slugify } from '../util';

const RESULT_WINDOW_MS = 14 * 86400_000;
const GAME_LENGTH_MS = 3 * 3600_000;

export function parseNbl(html: string, now: Date): AdapterResult {
  const $ = cheerio.load(html);
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  $('tbody tr').each((_, tr) => {
    const tds = $(tr).children('td');
    if (tds.length < 6) return;
    const num = $(tds[1]).text().trim();
    const sort = $(tds[2]).attr('data-sort') ?? '';
    const names = $(tds[3]).find('div.d-flex > div').last().children('div').map((__, d) => $(d).text().trim()).get();
    if (!num || names.length < 2 || !names[0] || !names[1]) return;
    const [home, away] = names;
    const ids = [home, away].map((n) => {
      const id = `cz-basket:${slugify(n)}`;
      teams.set(id, { id, sport: 'cz-basket', name: n });
      return id;
    });
    const played = /[0-9]/.test($(tds[4]).text());
    const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/.exec(sort);
    if (!m) return;
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    const startsAt = pragueToUtcIso(y, mo, d, h, mi);
    let result: Match['result'];
    if (played) { // odehráno (nebo právě běží)
      const ts = Date.parse(startsAt);
      if (now.getTime() < ts + GAME_LENGTH_MS || ts < now.getTime() - RESULT_WINDOW_MS) return;
      const nums = ($(tds[4]).html() ?? '').replace(/<[^>]*>/g, ' ').match(/[0-9]+/g) ?? [];
      if (nums.length !== 2) return;
      result = { home: Number(nums[0]), away: Number(nums[1]), homeName: home, awayName: away };
    }
    const tv = $(tr).find('a[href*="embed.tvcom.cz"]').first().attr('href');
    matches.push({
      id: `cz-basket:${num}-${slugify(home)}`, sport: 'cz-basket', competition: 'NBL',
      startsAt, title: `${home} – ${away}`, teams: ids,
      broadcasters: tv ? [{ name: 'TV Com', url: tv }] : [],
      ...(result && { result }),
    });
  });
  return { matches, teams: [...teams.values()] };
}

const NBL_COLUMNS = [
  { key: 'z', label: 'Z', title: 'Zápasy' }, { key: 'v', label: 'V', title: 'Výhry' }, { key: 'p', label: 'P', title: 'Prohry' },
  { key: 'skore', label: 'Skóre', title: 'Skóre (vstřeleno:obdrženo)' },
];

/** Aktuální tabulka: hlavička pořadí + tým + z v p vstřeleno obdrženo + doma/venku (historická tabulka „tituly“ ji nemá). */
export function parseNblStandings(html: string): StandingsTable[] {
  const $ = cheerio.load(html);
  for (const table of $('table').toArray()) {
    const heads = $(table).find('thead th').map((_, h) => $(h).text().replace(/\s+/g, ' ').trim().toLowerCase()).get();
    if (!['pořadí', 'tým', 'z', 'v', 'p', 'vstřeleno', 'obdrženo', 'doma', 'venku'].every((n) => heads.includes(n))) continue;
    const rows: StandingRow[] = [];
    $(table).find('tbody tr').each((_, tr) => {
      const tds = $(tr).children('td').toArray();
      const li = tds.findIndex((td) => $(td).find('a[href*="/tym/"]').length > 0);
      if (li < 1) return;
      const name = $(tds[li]).text().replace(/\s+/g, ' ').trim();
      const pos = Number.parseInt($(tds[0]).text(), 10);
      const cell = (o: number) => $(tds[li + o]).text().replace(/\s+/g, ' ').trim();
      const [z, v, p, vs, ob] = [1, 2, 3, 5, 6].map((o) => cell(o));
      if (!name || !Number.isInteger(pos) || ![z, v, p, vs, ob].every((x) => /^[0-9]+$/.test(x))) return;
      rows.push({ pos, name, teamId: `cz-basket:${slugify(name)}`, values: { z: Number(z), v: Number(v), p: Number(p), skore: `${vs}:${ob}` } });
    });
    if (rows.length === 0) continue;
    return [{ id: 'cz-basket', sport: 'cz-basket', title: 'NBL', columns: NBL_COLUMNS, rows }];
  }
  return [];
}

export const nblAdapter = {
  sport: 'cz-basket' as const,
  async fetch(now, get: (url: string) => Promise<string> = getText) {
    const out: AdapterResult = parseNbl(await get('https://www.nbl.basketball/zapasy'), now);
    try {
      const tables = parseNblStandings(await get('https://www.nbl.basketball/tabulka'));
      if (tables.length === 0) throw new Error('NBL: tabulka nenalezena (změněné HTML?)');
      out.standings = tables;
    } catch (e) { out.standingsError = (e as Error).message; }
    return out;
  },
} satisfies Adapter;
