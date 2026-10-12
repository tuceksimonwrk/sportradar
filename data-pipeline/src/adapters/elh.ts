import * as cheerio from 'cheerio';
import type { Match, StandingRow, StandingsColumn, StandingsTable, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getText, matchTeamId, pragueToUtcIso } from '../util';

const BASE = 'https://www.hokej.cz/tipsport-extraliga/zapasy';

function inferYear(month: number, day: number, now: Date): number {
  const y = now.getUTCFullYear();
  return Date.UTC(y, month - 1, day) < now.getTime() - 90 * 86400_000 ? y + 1 : y;
}

const RESULT_WINDOW_MS = 14 * 86400_000;
const pragueDay = (ts: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));

/** Odehrané řádky nemají rok: bereme letošní, a je-li datum o víc než 2 dny v budoucnu, loňský. */
function inferPlayedYear(month: number, day: number, now: Date): number {
  const y = now.getUTCFullYear();
  return Date.UTC(y, month - 1, day, 12) > now.getTime() + 2 * 86400_000 ? y - 1 : y;
}

export function elhRoundNumbers(html: string): number[] {
  const nums = [...html.matchAll(/matchList-view-round-round=(\d+)/g)].map((m) => Number(m[1]));
  return [...new Set(nums)].sort((a, b) => a - b);
}

export function parseElhRound(html: string, now: Date): AdapterResult {
  const $ = cheerio.load(html);
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  $('tr.js-preview__link').each((_, tr) => {
    const id = /\/zapas\/(\d+)/.exec($(tr).attr('data-href') ?? '')?.[1];
    const sides = $(tr).find('.preview__name__wrapper').map((__, w) => ({
      long: $(w).find('.preview__name--long').first().text().trim(),
      short: $(w).find('.preview__name--short').first().text().trim(),
    })).get();
    if (!id || sides.length < 2 || sides.some((s) => !s.long || !s.short)) return;
    const [home, away] = sides;
    for (const s of sides) teams.set(`cz-hockey:${s.short}`, { id: `cz-hockey:${s.short}`, sport: 'cz-hockey', name: s.long });
    const cells = $(tr).find('td.preview__desktop .col-1_3').map((__, c) => $(c).text().trim()).get();
    if (cells.length < 3) { // odehráno
      const scores = $(tr).find('.preview__score .blue').map((__, e) => $(e).text().trim()).get();
      const pd = /(\d{1,2})\.\s*(\d{1,2})\.\s*$/.exec($(tr).find('.match-start-time').first().text().trim());
      if (scores.length < 2 || !pd || !/^[0-9]+$/.test(scores[0]) || !/^[0-9]+$/.test(scores[1])) return;
      const [pday, pmonth] = [Number(pd[1]), Number(pd[2])];
      const startsAt = pragueToUtcIso(inferPlayedYear(pmonth, pday, now), pmonth, pday, 12, 0);
      const ts = Date.parse(startsAt);
      if (pragueDay(ts) >= pragueDay(now.getTime()) || ts < now.getTime() - RESULT_WINDOW_MS) return;
      matches.push({
        id: `cz-hockey:${id}`, sport: 'cz-hockey', competition: 'Tipsport extraliga', startsAt,
        title: `${home.long} – ${away.long}`, teams: [`cz-hockey:${home.short}`, `cz-hockey:${away.short}`], broadcasters: [],
        result: { home: Number(scores[0]), away: Number(scores[1]), homeName: home.long, awayName: away.long, dateOnly: true },
      });
      return;
    }
    const d = /^(\d{1,2})\.\s*(\d{1,2})\.$/.exec(cells[1]);
    const t = /^(\d{1,2}):(\d{2})$/.exec(cells[2]);
    if (!d || !t) return; // odložený zápas bez data/času
    const [day, month] = [Number(d[1]), Number(d[2])];
    matches.push({
      id: `cz-hockey:${id}`, sport: 'cz-hockey', competition: 'Tipsport extraliga',
      startsAt: pragueToUtcIso(inferYear(month, day, now), month, day, Number(t[1]), Number(t[2])),
      title: `${home.long} – ${away.long}`, teams: [`cz-hockey:${home.short}`, `cz-hockey:${away.short}`], broadcasters: [],
    });
  });
  return { matches, teams: [...teams.values()] };
}

const ELH_COLS: Record<string, string> = { z: 'z', v: 'v', vp: 'vp', pp: 'pp', p: 'p', 'skóre': 'skore', b: 'b' };
const ELH_TITLES: Record<string, string> = {
  z: 'Zápasy', v: 'Výhry', vp: 'Výhry v prodloužení', pp: 'Prohry v prodloužení', p: 'Prohry', skore: 'Skóre', b: 'Body',
};
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Hlavní tabulka základní části: první tabulka s hlavičkou Tým + Z V VP PP P Skóre B (doma/venku mají stejné hlavičky, ale jdou až po ní). */
export function parseElhStandings(html: string, teams: Team[]): StandingsTable[] {
  const $ = cheerio.load(html);
  for (const table of $('table').toArray()) {
    const heads = $(table).find('thead th').map((_, h) => norm($(h).text()).toLowerCase()).get();
    const need = ['tým', 'z', 'v', 'vp', 'pp', 'p', 'skóre', 'b'];
    if (!need.every((n) => heads.includes(n))) continue;
    const idx = (label: string) => heads.indexOf(label);
    const cols = Object.keys(ELH_COLS).map((label) => ({ label, key: ELH_COLS[label], i: idx(label) }));
    const columns: StandingsColumn[] = cols.map((c) => ({ key: c.key, label: c.label === 'skóre' ? 'Skóre' : c.label.toUpperCase(), title: ELH_TITLES[c.key] }));
    const rows: StandingRow[] = [];
    $(table).find('tbody tr').each((_, tr) => {
      const tds = $(tr).children('td').map((__, c) => norm($(c).text())).get();
      const pos = Number.parseInt(tds[idx('#') >= 0 ? idx('#') : 0] ?? '', 10);
      const name = tds[idx('tým')];
      if (!Number.isInteger(pos) || !name || tds.length < heads.length) return;
      const values: Record<string, string | number> = {};
      for (const c of cols) {
        const raw = tds[c.i] ?? '';
        if (c.key === 'skore') { if (!/^[0-9]+:[0-9]+$/.test(raw)) return; values.skore = raw; }
        else { if (!/^[0-9]+$/.test(raw)) return; values[c.key] = Number(raw); }
      }
      const teamId = matchTeamId(name, teams);
      rows.push({ pos, name, ...(teamId && { teamId }), values });
    });
    if (rows.length === 0) continue;
    return [{ id: 'cz-hockey', sport: 'cz-hockey', title: 'Tipsport extraliga', columns, rows }];
  }
  return [];
}

export const elhAdapter = {
  sport: 'cz-hockey' as const,
  async fetch(now, get: (url: string) => Promise<string> = getText) {
    const first = await get(BASE);
    const rounds = elhRoundNumbers(first);
    if (rounds.length === 0) throw new Error('ELH: nenalezena žádná kola (změněné HTML?)');
    const parts: AdapterResult[] = [];
    for (let i = 0; i < rounds.length; i += 4) {
      const batch = await Promise.allSettled(rounds.slice(i, i + 4).map((r) => get(`${BASE}?matchList-view-round-round=${r}`)));
      for (const b of batch) {
        if (b.status === 'rejected') throw new Error(`ELH: kolo se nepodařilo stáhnout (${b.reason?.message ?? b.reason})`);
        parts.push(parseElhRound(b.value, now));
      }
    }
    const out = combine(parts);
    try {
      const tables = parseElhStandings(await get('https://www.hokej.cz/tipsport-extraliga/table'), out.teams);
      if (tables.length === 0) throw new Error('ELH: tabulka nenalezena (změněné HTML?)');
      out.standings = tables;
    } catch (e) { out.standingsError = (e as Error).message; }
    return out;
  },
} satisfies Adapter;
