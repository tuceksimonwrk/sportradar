import * as cheerio from 'cheerio';
import type { Match, StandingRow, StandingsTable, Team } from '@sportradar/shared';
import { pragueToUtcIso, safeLogoUrl, slugify } from '../util';
import { FOOTBALL_COLUMNS, RESULT_DAYS, UPCOMING_DAYS, type CompetitionPart } from './football-espn';

export const CZ_COMP = 'cze.1';
export const CZ_COMP_NAME = 'Chance Liga';
const SITE = 'https://www.chanceliga.cz/';
export const CZ_SCHEDULE_URL = `${SITE}rozpis-zapasu`;
export const CZ_TABLE_URL = `${SITE}tabulka`;

const DAY = 86400_000;
const GAME_MS = 2 * 3600_000;        // po tolika od výkopu bereme skóre jako konečné
const STALE_UPCOMING_MS = 6 * 3600_000;

export const czTeamId = (name: string) => `football:cz_${slugify(name)}`;
const clubNum = (href: string | undefined) => /\/klub\/(?:\d{4}\/stadion\/)?(\d+)-/.exec(href ?? '')?.[1];
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface CzSchedule { matches: Match[]; teams: Team[]; clubs: Map<string, Team> }

/**
 * Rozpis celé sezóny z chanceliga.cz (server-side HTML, řádky `tr.game`). Časy jsou pražské.
 * Nadcházející zápasy do now + 21 dní (bez známého času se přeskočí), výsledky za 14 dní.
 * Řádek bez id zápasu / týmů / data → výjimka (změněné HTML); stránka s rozpisem bez řádků = mimo sezónu (prázdno).
 */
export function parseCzSchedule(html: string, now: Date): CzSchedule {
  const $ = cheerio.load(html);
  const rows = $('tr.game').toArray();
  if (rows.length === 0) {
    if ($('.schedule__content').length) return { matches: [], teams: [], clubs: new Map() };
    throw new Error('Chance Liga: rozpis nenalezen (změněné HTML?)');
  }
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  const clubs = new Map<string, Team>();
  let bad = 0;
  for (const tr of rows) {
    const side = (cls: string) => {
      const a = $(tr).find(`td.team.${cls} a`).first();
      const name = clean(a.find('span.hidden-xs').text() || a.text());
      return { name, num: clubNum(a.attr('href')) };
    };
    const home = side('home'); const away = side('away');
    const scoreA = $(tr).find('td.score a').first();
    const zid = /\/zapas\/(\d+)/.exec(scoreA.attr('href') ?? '')?.[1];
    const date = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec($(tr).find('td.date').text());
    if (!home.name || !away.name || !home.num || !away.num || !zid || !date) { bad++; continue; }
    const logos = $(tr).find('td.logo img').toArray().map((im) => safeLogoUrl(($(im).attr('src') ?? '').replace('/40x40/', '/85x85/'), SITE));
    const ids = [home, away].map((s, i) => {
      const id = czTeamId(s.name);
      const logo = logos.length === 2 ? logos[i] : undefined;
      const t: Team = { id, sport: 'football', name: s.name, ...(logo && { logo }), league: CZ_COMP };
      teams.set(id, t); clubs.set(s.num!, t);
      return id;
    });
    const time = /^(\d{1,2}):(\d{2})$/.exec(clean($(tr).find('td.time').text()));
    if (!time) continue; // termín bez času (vzdálená kola) – nezobrazujeme
    const [d, mo, y] = [Number(date[1]), Number(date[2]), Number(date[3])];
    const startsAt = pragueToUtcIso(y, mo, d, Number(time[1]), Number(time[2]));
    const ts = Date.parse(startsAt);
    const score = /^(\d+):(\d+)$/.exec(clean(scoreA.text()));
    let result: Match['result'];
    if (score && now.getTime() >= ts + GAME_MS) {
      if (ts < now.getTime() - RESULT_DAYS * DAY) continue;
      result = { home: Number(score[1]), away: Number(score[2]), homeName: home.name, awayName: away.name };
    } else {
      if (!score && !/^-\s*:\s*-$/.test(clean(scoreA.text()))) continue; // neznámý stav (např. kontumace/odloženo)
      if (ts > now.getTime() + UPCOMING_DAYS * DAY || ts < now.getTime() - STALE_UPCOMING_MS) continue;
    }
    matches.push({
      id: `football:cz-${zid}`, sport: 'football', competition: CZ_COMP_NAME, competitionId: CZ_COMP,
      startsAt, title: `${home.name} – ${away.name}`, teams: ids, broadcasters: [],
      ...(result && { result }),
    });
  }
  if (bad > 0) throw new Error(`Chance Liga: rozpis má ${bad} nezpracovatelných řádků z ${rows.length} (změněné HTML?)`);
  return { matches, teams: [...teams.values()], clubs };
}

const MIN_ROWS = 10;
const intOf = (s: string) => (/^[+\-−]?\d+$/.test(s) ? Number(s.replace('−', '-')) : NaN);

/**
 * Aktuální tabulka (hlavička Z V R P G+ G- B). Kluby se párují přes číslo klubu v odkazu `/klub/<n>-…`
 * s rozpisem (plné názvy a id). Chybějící tabulka, nezpracovatelný řádek nebo pořadí mimo 1..N → výjimka.
 */
export function parseCzStandings(html: string, clubs: Map<string, Team>): StandingsTable[] {
  const $ = cheerio.load(html);
  for (const table of $('table').toArray()) {
    const heads = $(table).find('thead th').map((_, h) => clean($(h).text())).get();
    if (!['Z', 'V', 'R', 'P', 'G+', 'G-', 'B'].every((x) => heads.includes(x))) continue;
    const col = (k: string) => heads.indexOf(k);
    const candidates = $(table).find('tbody tr').toArray().filter((tr) => $(tr).children('td.position').length > 0);
    if (candidates.length === 0) return [];
    const rows: StandingRow[] = [];
    for (const tr of candidates) {
      const tds = $(tr).children('td').toArray();
      // hlavička „Klub“ má colspan 2 (logo + název) → buňky za ní jsou posunuté o 1
      const cell = (k: string) => clean($(tds[col(k) + 1]).text());
      const a = $(tr).find('a[href*="/klub/"]').filter((_, x) => !!clean($(x).text())).first();
      const pos = /^(\d+)\.?$/.exec(clean($(tds[0]).text()));
      const nums = ['Z', 'V', 'R', 'P', 'G+', 'G-', 'B'].map((k) => intOf(cell(k)));
      const num = clubNum(a.attr('href'));
      if (!pos || !a.length || !num || nums.some((n) => Number.isNaN(n))) continue;
      const club = clubs.get(num);
      const [z, v, r, p, gf, ga, b] = nums;
      const diff = gf - ga;
      rows.push({
        pos: Number(pos[1]), name: club?.name ?? clean(a.text()), ...(club && { teamId: club.id }),
        values: { z, v, r, p, skore: `${gf}:${ga}`, rozdil: diff > 0 ? `+${diff}` : String(diff), b },
      });
    }
    if (rows.length !== candidates.length) throw new Error(`Chance Liga: tabulka má ${candidates.length - rows.length} nezpracovatelných řádků z ${candidates.length} (změněné HTML?)`);
    if (rows.length < MIN_ROWS || rows.some((r, i) => r.pos !== i + 1)) throw new Error('Chance Liga: neočekávané pořadí v tabulce (změněné HTML?)');
    return [{ id: `football-${CZ_COMP}`, sport: 'football', title: CZ_COMP_NAME, columns: FOOTBALL_COLUMNS, rows }];
  }
  throw new Error('Chance Liga: tabulka nenalezena (změněné HTML?)');
}

/** Česká liga: rozpis (povinný) + tabulka (chyba jen standingsError). 2 požadavky. */
export async function fetchCzCompetition(now: Date, get: (url: string) => Promise<string>): Promise<CompetitionPart> {
  const [sch, tab] = await Promise.allSettled([get(CZ_SCHEDULE_URL), get(CZ_TABLE_URL)]);
  let parsed: CzSchedule | Error;
  try {
    if (sch.status === 'rejected') throw sch.reason instanceof Error ? sch.reason : new Error(String(sch.reason));
    parsed = parseCzSchedule(sch.value, now);
  } catch (e) { parsed = e instanceof Error ? e : new Error(String(e)); }
  let standings: StandingsTable[] | undefined; let standingsError: string | undefined;
  try {
    if (tab.status === 'rejected') throw tab.reason instanceof Error ? tab.reason : new Error(String(tab.reason));
    standings = parseCzStandings(tab.value, parsed instanceof Error ? new Map() : parsed.clubs);
  } catch (e) { standingsError = `${CZ_COMP}: ${(e as Error).message}`; }
  const data = parsed instanceof Error ? new Error(`${CZ_COMP}: ${parsed.message}`) : { matches: parsed.matches, teams: parsed.teams };
  return { compId: CZ_COMP, data, standings, standingsError };
}
