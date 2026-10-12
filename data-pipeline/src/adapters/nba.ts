import type { Match, StandingRow, StandingsTable, Team, Venue } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getJson, safeLogoUrl } from '../util';

interface EspnTeam { abbreviation: string; displayName: string; logo?: string }
interface EspnEvent {
  id: string; date: string; status?: { type?: { state?: string; name?: string; completed?: boolean; shortDetail?: string } }; season?: { type?: number };
  competitions?: { venue?: { fullName?: string; address?: { city?: string } }; competitors?: { homeAway: string; team: EspnTeam; score?: unknown }[] }[];
}

const RESULT_WINDOW_MS = 14 * 86400_000;
const score = (v: unknown): number | null => {
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function parseNba(json: unknown, now: Date, opts: { resultsOnly?: boolean } = {}): AdapterResult {
  const events = ((json as any)?.events ?? []) as EspnEvent[];
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  for (const e of events) {
    const comps = e.competitions?.[0]?.competitors ?? [];
    const homeC = comps.find((c) => c.homeAway === 'home');
    const awayC = comps.find((c) => c.homeAway === 'away');
    const home = homeC?.team;
    const away = awayC?.team;
    if (!home || !away) continue;
    for (const t of [home, away]) {
      const logo = safeLogoUrl(t.logo);
      teams.set(`nba:${t.abbreviation}`, { id: `nba:${t.abbreviation}`, sport: 'nba', name: t.displayName, ...(logo && { logo }) });
    }
    const state = e.status?.type?.state;
    const isPost = state === 'post';
    if (isPost && !(e.status?.type?.completed === true || e.status?.type?.name === 'STATUS_FINAL')) continue; // odložený/zrušený
    if (state !== 'pre' && state !== 'in' && !isPost) continue;
    if (opts.resultsOnly && !isPost) continue;
    const v = e.competitions?.[0]?.venue;
    const vName = v?.fullName?.trim();
    const venue: Venue | undefined = vName ? (v?.address?.city ? { name: vName, city: v.address.city } : { name: vName }) : undefined;
    const startsAt = new Date(e.date);
    if (Number.isNaN(startsAt.getTime())) continue;
    let result: Match['result'];
    if (isPost) {
      const [hs, as] = [score(homeC?.score), score(awayC?.score)];
      if (hs === null || as === null || startsAt.getTime() < now.getTime() - RESULT_WINDOW_MS) continue;
      result = { home: hs, away: as, homeName: home.displayName, awayName: away.displayName,
        ...(/OT/i.test(e.status?.type?.shortDetail ?? '') && { note: 'po prodloužení' }) };
    }
    matches.push({
      id: `nba:${e.id}`, sport: 'nba',
      competition: e.season?.type === 1 ? 'NBA (přípravné)' : e.season?.type === 3 ? 'NBA Playoffs' : 'NBA',
      startsAt: startsAt.toISOString(), title: `${home.displayName} – ${away.displayName}`,
      teams: [`nba:${home.abbreviation}`, `nba:${away.abbreviation}`], broadcasters: [],
      ...(venue && { venue }),
      ...(result && { result }),
    });
  }
  return { matches, teams: [...teams.values()] };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

/** ESPN `dates=` používá americká (východní) data, proto začínáme o den dříve než UTC dnes. */
export function nbaDateRange(now: Date): string[] {
  return Array.from({ length: 15 }, (_, i) => ymd(new Date(now.getTime() + (i - 1) * 86400_000)));
}

/** Dny před hlavním rozsahem (jen pro výsledky – chyby se ignorují). */
export function nbaPastRange(now: Date, days = 4): string[] {
  return Array.from({ length: days }, (_, i) => ymd(new Date(now.getTime() + (i - 1 - days) * 86400_000)));
}

const espn = (d: string) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}`;

const NBA_COLUMNS = [
  { key: 'v', label: 'V', title: 'Výhry' }, { key: 'p', label: 'P', title: 'Prohry' },
  { key: 'pct', label: '%', title: 'Úspěšnost' }, { key: 'gb', label: 'Ztr.', title: 'Ztráta na lídra' },
];
const NBA_CONF = [
  { match: /east/i, id: 'nba-east', title: 'NBA – Východní konference' },
  { match: /west/i, id: 'nba-west', title: 'NBA – Západní konference' },
];

export function parseNbaStandings(json: unknown): StandingsTable[] {
  const children = (json as any)?.children;
  if (!Array.isArray(children)) throw new Error('NBA: neočekávaný tvar tabulky (změněná data?)');
  const tables: StandingsTable[] = [];
  for (const conf of NBA_CONF) {
    const child = children.find((c: any) => conf.match.test(String(c?.name ?? '')));
    const entries = child?.standings?.entries;
    if (!Array.isArray(entries)) continue;
    const parsed: { seed: number; pct: number; row: Omit<StandingRow, 'pos'> }[] = [];
    for (const e of entries) {
      const abbr = e?.team?.abbreviation;
      const name = e?.team?.displayName;
      if (typeof abbr !== 'string' || !abbr || typeof name !== 'string' || !name) continue;
      const stats: any[] = Array.isArray(e.stats) ? e.stats : [];
      const stat = (n: string) => stats.find((x) => x?.name === n);
      const disp = (n: string): string | number => {
        const d = stat(n)?.displayValue;
        if (typeof d !== 'string' || !d.trim()) return '–';
        return n === 'wins' || n === 'losses' ? (Number.isFinite(Number(d)) ? Number(d) : '–') : d;
      };
      const seed = Number(stat('playoffSeed')?.value);
      const pct = Number(stat('winPercent')?.value);
      parsed.push({ seed: Number.isFinite(seed) && seed > 0 ? seed : Infinity, pct: Number.isFinite(pct) ? pct : -1,
        row: { name, teamId: `nba:${abbr}`, values: { v: disp('wins'), p: disp('losses'), pct: disp('winPercent'), gb: disp('gamesBehind') } } });
    }
    if (parsed.length === 0) continue;
    parsed.sort((a, b) => a.seed - b.seed || b.pct - a.pct);
    tables.push({ id: conf.id, sport: 'nba', title: conf.title, columns: NBA_COLUMNS, rows: parsed.map((x, i) => ({ pos: i + 1, ...x.row })) });
  }
  return tables;
}

export const nbaAdapter = {
  sport: 'nba' as const,
  async fetch(now, get: (url: string) => Promise<unknown> = getJson) {
    const [settled, pastSettled] = await Promise.all([
      Promise.allSettled(nbaDateRange(now).map((d) => get(espn(d)))),
      Promise.allSettled(nbaPastRange(now).map((d) => get(espn(d)))),
    ]);
    const bad = settled.filter((s) => s.status === 'rejected');
    if (bad.length > 0) throw new Error(`NBA: selhalo ${bad.length} z ${settled.length} dnů (${(bad[0] as PromiseRejectedResult).reason?.message ?? bad[0]})`);
    const past = pastSettled.filter((s): s is PromiseFulfilledResult<unknown> => s.status === 'fulfilled');
    const out: AdapterResult = combine([...settled, ...past].map((s, i) => parseNba((s as PromiseFulfilledResult<unknown>).value, now, { resultsOnly: i >= settled.length })));
    try {
      const tables = parseNbaStandings(await get('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings'));
      out.standings = tables;
    } catch (e) { out.standingsError = (e as Error).message; }
    return out;
  },
} satisfies Adapter;
