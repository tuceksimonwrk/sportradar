import { SPORTS, type Match, type Sport, type StandingsTable, type Team } from '@sportradar/shared';
import type { AdapterResult } from './types';
import { matchTeamId } from './util';

export interface Dataset { matches: Match[]; teams: Team[] }
export type SportOutcome = AdapterResult | Error;

const KEEP_AFTER_START_MS = 6 * 3600_000;
const KEEP_RESULT_MS = 14 * 24 * 3600_000;

/** Počet nadcházejících (bez výsledku) zápasů. */
export function upcomingCount(matches: Match[]): number {
  return matches.filter((x) => !x.result).length;
}

export function mergeDatasets(prev: Dataset, outcomes: Partial<Record<Sport, SportOutcome>>, now: Date): Dataset {
  const matches = new Map<string, Match>();
  const teams = new Map<string, Team>();
  const resultCutoff = now.getTime() - KEEP_RESULT_MS;
  for (const sport of SPORTS) {
    const out = outcomes[sport];
    const ok = out && !(out instanceof Error) ? out : null;
    const fresh = ok && upcomingCount(ok.matches) > 0 ? ok : null;
    const prevMatches = prev.matches.filter((x) => x.sport === sport);
    if (fresh) {
      // výsledky jsou po skončení neměnné → přenášíme je z minula (čerstvá data vyhrávají při stejném id)
      const kept = new Map<string, Match>();
      for (const x of prevMatches) if (x.result && Date.parse(x.startsAt) >= resultCutoff) kept.set(x.id, x);
      for (const x of kept.values()) matches.set(x.id, x);
      for (const x of fresh.matches) {
        const old = kept.get(x.id);
        matches.set(x.id, !x.result && old?.result ? { ...x, result: old.result } : x); // čerstvý bez výsledku nesmí výsledek smazat
      }
      const prevLogo = new Map(prev.teams.filter((p) => p.sport === sport && p.logo).map((p) => [p.id, p.logo!]));
      for (const x of fresh.teams) teams.set(x.id, !x.logo && prevLogo.has(x.id) ? { ...x, logo: prevLogo.get(x.id)! } : x);
      // částečné selhání (fotbal: jeden zdroj/soutěž): zápasy a týmy selhané soutěže zůstanou z minula
      const failedComps = new Set(fresh.failedCompetitions ?? []);
      if (failedComps.size) {
        for (const x of prevMatches) if (x.competitionId && failedComps.has(x.competitionId) && !matches.has(x.id)) matches.set(x.id, x);
        for (const x of prev.teams) if (x.sport === sport && x.league && failedComps.has(x.league) && !teams.has(x.id)) teams.set(x.id, x);
      }
    } else {
      // chyba / žádné nadcházející zápasy: ponecháme staré, jen případné nové výsledky přidáme
      for (const x of prevMatches) matches.set(x.id, x);
      for (const x of ok?.matches ?? []) if (x.result) matches.set(x.id, x);
      for (const x of prev.teams) if (x.sport === sport) teams.set(x.id, x);
    }
  }
  const cutoff = now.getTime() - KEEP_AFTER_START_MS;
  return {
    matches: [...matches.values()]
      .filter((x) => Date.parse(x.startsAt) >= (x.result ? resultCutoff : cutoff))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id)),
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, 'cs')),
  };
}

const SUSPICIOUS_WINDOW_MS = 7 * 24 * 3600_000;

/** Prázdný výsledek je podezřelý jen tehdy, pokud předchozí data měla zápas daného sportu v příštích 7 dnech. */
export function isSuspiciousEmpty(prev: Dataset, sport: Sport, now: Date): boolean {
  const from = now.getTime();
  const to = from + SUSPICIOUS_WINDOW_MS;
  return prev.matches.some((x) => {
    if (x.sport !== sport || x.result) return false;
    const t = Date.parse(x.startsAt);
    return t >= from && t <= to;
  });
}

/** Tabulky po sportech a po id: čerstvé dostanou updatedAt = now, chybějící se přenesou z minula (se starým updatedAt). */
export function mergeStandings(prev: StandingsTable[], outcomes: Partial<Record<Sport, SportOutcome>>, now: Date): StandingsTable[] {
  const out: StandingsTable[] = [];
  const stamp = now.toISOString();
  for (const sport of SPORTS) {
    const o = outcomes[sport];
    const fresh = o && !(o instanceof Error) && o.standings ? o.standings : [];
    const freshIds = new Set(fresh.map((t) => t.id));
    out.push(...fresh.map((t) => ({ ...t, updatedAt: stamp })));
    out.push(...prev.filter((t) => t.sport === sport && !freshIds.has(t.id)));
  }
  return out;
}

/** Doplní chybějící teamId (ne F1) z daných týmů; vrací i počty nevyřešených řádků po sportech. */
export function resolveStandingsTeamIds(tables: StandingsTable[], teams: Team[]): { tables: StandingsTable[]; unresolved: Partial<Record<Sport, { missing: number; total: number }>> } {
  const unresolved: Partial<Record<Sport, { missing: number; total: number }>> = {};
  const out = tables.map((t) => {
    if (t.sport === 'f1') return t;
    const pool = teams.filter((x) => x.sport === t.sport);
    const rows = t.rows.map((r) => {
      if (r.teamId) return r;
      const id = matchTeamId(r.name, pool);
      return id ? { ...r, teamId: id } : r;
    });
    const missing = rows.filter((r) => !r.teamId).length;
    if (missing > 0) {
      const cur = unresolved[t.sport] ?? { missing: 0, total: 0 };
      unresolved[t.sport] = { missing: cur.missing + missing, total: cur.total + rows.length };
    }
    return { ...t, rows };
  });
  return { tables: out, unresolved };
}
