import { competitionById, type Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { getText } from '../util';
import { ESPN_FOOTBALL, fetchEspnCompetition, type CompetitionPart } from './football-espn';
import { fetchCzCompetition } from './football-cz';

/** Stahovač pro jeden běh: cache podle URL, jedno opakování po chybě, počítadlo skutečných požadavků. */
export function countingGet<T>(raw: (url: string) => Promise<T>) {
  const cache = new Map<string, Promise<T>>();
  let count = 0;
  const once = (url: string) => { count++; return raw(url); };
  return {
    get(url: string): Promise<T> {
      let p = cache.get(url);
      if (!p) { p = once(url).catch(() => once(url)); cache.set(url, p); }
      return p;
    },
    get count() { return count; },
  };
}

/** Sjednocení týmů: domácí liga (cokoli kromě Ligy mistrů) má přednost; chybějící logo se doplní. */
export function combineFootballTeams(list: Team[]): Team[] {
  const out = new Map<string, Team>();
  for (const t of list) {
    const old = out.get(t.id);
    if (!old) { out.set(t.id, t); continue; }
    const domestic = (x: Team) => !!x.league && x.league !== 'uefa.champions';
    const base = !domestic(old) && domestic(t) ? t : old;
    const logo = base.logo ?? old.logo ?? t.logo;
    out.set(t.id, { ...base, ...(logo && { logo }) });
  }
  return [...out.values()];
}

const label = (id: string) => competitionById(id)?.name ?? id;

/**
 * Fotbal = 6 soutěží z ESPN + Chance Liga z chanceliga.cz, každá soutěž samostatně (Promise.all, části nikdy nevyhazují).
 * Selhaná soutěž → `failedCompetitions` (merge si u ní ponechá předchozí data) + varování; výjimka jen když selžou všechny.
 */
export async function runFootball(now: Date, espnRaw: (url: string) => Promise<unknown>, czRaw: (url: string) => Promise<string>): Promise<AdapterResult> {
  const espn = countingGet(espnRaw);
  const cz = countingGet(czRaw);
  const parts: CompetitionPart[] = await Promise.all([
    ...ESPN_FOOTBALL.map((id) => fetchEspnCompetition(id, now, (u) => espn.get(u))),
    fetchCzCompetition(now, (u) => cz.get(u)),
  ]);
  const failed = parts.filter((p) => p.data instanceof Error);
  if (failed.length === parts.length) {
    throw new Error(`fotbal: selhaly všechny zdroje (${(failed[0].data as Error).message})`);
  }
  const ok = parts.filter((p) => !(p.data instanceof Error)).map((p) => ({ id: p.compId, d: p.data as AdapterResult }));
  const seen = new Set<string>();
  const matches = ok.flatMap((p) => p.d.matches).filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  const out: AdapterResult = {
    matches,
    teams: combineFootballTeams(ok.flatMap((p) => p.d.teams)),
    standings: parts.flatMap((p) => p.standings ?? []),
    log: [
      ...ok.map((p) => `${label(p.id)}: ${p.d.matches.filter((m) => !m.result).length} zápasů, ${p.d.matches.filter((m) => m.result).length} výsledků, ${p.d.teams.length} týmů`),
      `ESPN: ${espn.count} HTTP požadavků, chanceliga.cz: ${cz.count} HTTP požadavků`,
    ],
  };
  const stErr = parts.map((p) => p.standingsError).filter((x): x is string => !!x);
  if (stErr.length) out.standingsError = stErr.join('; ');
  if (failed.length) {
    out.failedCompetitions = failed.map((p) => p.compId);
    out.warnings = failed.map((p) => `soutěž selhala, ponechávám stará data: ${(p.data as Error).message}`);
  }
  return out;
}

export const footballAdapter = {
  sport: 'football' as const,
  fetch(now: Date) {
    return runFootball(now, async (u) => JSON.parse(await getText(u)), getText);
  },
} satisfies Adapter;
