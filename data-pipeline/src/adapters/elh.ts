import * as cheerio from 'cheerio';
import type { Match, StandingRow, StandingsColumn, StandingsTable, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getText, matchTeamId, pragueToUtcIso, safeLogoUrl } from '../util';

const BASE = 'https://www.hokej.cz/tipsport-extraliga/zapasy';
const LOGO_BASE = 'https://www.hokej.cz/';

/** Logo z řádku zápasu; min.php umí větší rozměr (w=96&h=96), jinak ponecháme původní URL. */
function elhLogo(src: string | undefined): string | undefined {
  const url = safeLogoUrl(src, LOGO_BASE);
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.hostname === 'www.hokej.cz' && u.pathname === '/min.php' && u.searchParams.has('w') && u.searchParams.has('h')) {
      u.searchParams.set('w', '96'); u.searchParams.set('h', '96');
      return safeLogoUrl(u.href);
    }
  } catch { /* ponecháme původní */ }
  return url;
}

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
    const logos = $(tr).find('.preview__logo img').map((__, im) => elhLogo($(im).attr('src'))).get();
    sides.forEach((s, i) => {
      const logo = sides.length === 2 && logos.length === 2 ? logos[i] : undefined; // přiřadíme jen jednoznačně (domácí 1., hosté 2.)
      teams.set(`cz-hockey:${s.short}`, { id: `cz-hockey:${s.short}`, sport: 'cz-hockey', name: s.long, ...(logo && { logo }) });
    });
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

const ELH_ORDER = ['z', 'v', 'vp', 'pp', 'p', 'skóre', 'b'];
const ELH_KEY: Record<string, string> = { z: 'z', v: 'v', vp: 'vp', pp: 'pp', p: 'p', 'skóre': 'skore', b: 'b' };
const ELH_TITLES: Record<string, string> = {
  z: 'Zápasy', v: 'Výhry', vp: 'Výhry v prodloužení', pp: 'Prohry v prodloužení', p: 'Prohry', skore: 'Skóre', b: 'Body',
};
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const BLANK = new Set(['', '-', '–']);
const MIN_ELH_ROWS = 10;

/**
 * Hlavní tabulka základní části: tabulka s hlavičkou Tým Z V P Skóre B, jejíž nadpis neobsahuje doma/venku.
 * Platná, ale ještě prázdná tabulka → []. Nenalezená tabulka, zahozený řádek nebo pozice mimo 1..N → výjimka (chyba tvaru).
 */
export function parseElhStandings(html: string, teams: Team[]): StandingsTable[] {
  const $ = cheerio.load(html);
  for (const table of $('table').toArray()) {
    const heads = $(table).find('thead th').map((_, h) => norm($(h).text()).toLowerCase()).get();
    if (!['tým', 'z', 'v', 'p', 'b', 'skóre'].every((n) => heads.includes(n))) continue;
    const heading = norm($(table).prevAll('h1,h2,h3,h4,h5,h6').first().text()).toLowerCase();
    if (/doma|venku/.test(heading)) continue;
    const labels = ELH_ORDER.filter((l) => heads.includes(l));
    const idx = (label: string) => heads.indexOf(label);
    const columns: StandingsColumn[] = labels.map((l) => ({ key: ELH_KEY[l], label: l === 'skóre' ? 'Skóre' : l.toUpperCase(), title: ELH_TITLES[ELH_KEY[l]] }));
    const candidates = $(table).find('tbody tr').toArray()
      .map((tr) => $(tr).children('td').map((__, c) => norm($(c).text())).get())
      .filter((tds) => tds.length > 0);
    const rows: StandingRow[] = [];
    let blank = 0;
    for (const tds of candidates) {
      const stats = labels.map((l) => tds[idx(l)] ?? '');
      if (stats.every((x) => BLANK.has(x))) { blank++; continue; }
      const pos = /^(\d+)\.?$/.exec(tds[idx('#') >= 0 ? idx('#') : 0] ?? '');
      const name = tds[idx('tým')];
      if (!pos || !name || tds.length < heads.length) continue;
      const values: Record<string, string | number> = {};
      let ok = true;
      labels.forEach((l, i) => {
        const raw = stats[i].replace(/\s*:\s*/g, ':');
        if (l === 'skóre') { if (/^[0-9]+:[0-9]+$/.test(raw)) values.skore = raw; else ok = false; }
        else if (/^[0-9]+$/.test(raw)) values[ELH_KEY[l]] = Number(raw); else ok = false;
      });
      if (!ok) continue;
      const teamId = matchTeamId(name, teams);
      rows.push({ pos: Number(pos[1]), name, ...(teamId && { teamId }), values });
    }
    if (candidates.length === 0 || blank === candidates.length) return []; // ještě bez odehraných zápasů
    if (rows.length !== candidates.length) throw new Error(`ELH: tabulka má ${candidates.length - rows.length} nezpracovatelných řádků z ${candidates.length} (změněné HTML?)`);
    if (rows.length < MIN_ELH_ROWS || rows.some((r, i) => r.pos !== i + 1)) throw new Error('ELH: neočekávané pořadí v tabulce (změněné HTML?)');
    return [{ id: 'cz-hockey', sport: 'cz-hockey', title: 'Tipsport extraliga', columns, rows }];
  }
  throw new Error('ELH: tabulka nenalezena (změněné HTML?)');
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
      out.standings = tables;
    } catch (e) { out.standingsError = (e as Error).message; }
    return out;
  },
} satisfies Adapter;
