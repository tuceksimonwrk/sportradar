import type { GridEntry, Match, MatchDetail, RankingBlock, StandingsTable } from '@sportradar/shared';
import { isNum, toNum, type DetailBuilder } from './common';

const ID = /^f1:(\d+)-(\d+)-([A-Za-z]+)$/;
const DRIVERS_TOP = 10;

const splitTitle = (t: string) => {
  const i = t.lastIndexOf(' – ');
  return i > 0 ? { event: t.slice(0, i).trim(), session: t.slice(i + 3).trim() } : { event: t, session: '' };
};

function rankings(standings: StandingsTable[]): RankingBlock[] {
  const out: RankingBlock[] = [];
  const rowsOf = (id: string, limit?: number) => (standings.find((t) => t.id === id)?.rows ?? [])
    .filter((r) => isNum(r.values.b))
    .slice(0, limit)
    .map((r) => ({ pos: r.pos, name: r.name, ...(r.sub && { sub: r.sub }), value: r.values.b as number }));
  const d = rowsOf('f1-drivers', DRIVERS_TOP);
  const c = rowsOf('f1-constructors');
  if (d.length) out.push({ title: 'Pořadí jezdců', unit: 'b.', rows: d });
  if (c.length) out.push({ title: 'Pořadí konstruktérů', unit: 'b.', rows: c });
  return out;
}

/** Rošt z výsledků kvalifikace daného kola (jiné kolo / prázdné → []). */
export function parseF1Grid(json: unknown, season: string, round: string): GridEntry[] {
  const race = (json as any)?.MRData?.RaceTable?.Races?.[0];
  if (!race || String(race.season) !== season || String(race.round) !== round || !Array.isArray(race.QualifyingResults)) return [];
  const out: GridEntry[] = [];
  for (const q of race.QualifyingResults) {
    const pos = toNum(q?.position);
    const name = [q?.Driver?.givenName, q?.Driver?.familyName].filter((x) => typeof x === 'string' && x.trim()).join(' ');
    if (!isNum(pos) || !name) continue;
    const number = q?.Driver?.permanentNumber ?? q?.number;
    out.push({ pos, name, ...(typeof q?.Constructor?.name === 'string' && { team: q.Constructor.name }), ...(number && { number: String(number) }) });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

export interface F1DetailInput { match: Match; matches: Match[]; standings: StandingsTable[]; qualifying: unknown; now: Date }

export function parseF1Detail({ match, matches, standings, qualifying, now }: F1DetailInput): MatchDetail {
  const [, season = '', round = '', key = ''] = ID.exec(match.id) ?? [];
  const prefix = `f1:${season}-${round}-`;
  const sessions = matches.filter((m) => m.sport === 'f1' && m.id.startsWith(prefix))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((m) => ({ id: m.id, label: splitTitle(m.title).session || m.title, startsAt: m.startsAt }));
  const rk = rankings(standings);
  const notes: string[] = [];
  const grid = key === 'Race' ? parseF1Grid(qualifying, season, round) : [];
  let drivers: GridEntry[] = [];
  if (grid.length) {
    notes.push('Rošt podle výsledku kvalifikace – případné penalizace a starty z boxů nejsou započteny.');
  } else {
    drivers = (standings.find((t) => t.id === 'f1-drivers')?.rows ?? []).map((r) => ({ pos: r.pos, name: r.name, ...(r.sub && { team: r.sub }) }));
    notes.push(key === 'Race'
      ? 'Startovní rošt se doplní po kvalifikaci (data se obnovují každou hodinu).'
      : 'Startovní rošt závodu bude k dispozici po kvalifikaci; zatím seznam jezdců podle pořadí šampionátu.');
  }
  if (!rk.length) notes.push('Pořadí šampionátu se nepodařilo načíst.');
  return {
    matchId: match.id, sport: 'f1', generatedAt: now.toISOString(), source: 'Jolpica (Ergast)',
    stats: [],
    ...(rk.length && { rankings: rk }),
    ...(grid.length ? { grid } : drivers.length ? { drivers } : {}),
    ...(sessions.length && { weekend: { name: splitTitle(match.title).event, sessions } }),
    notes,
  };
}

export const f1Detail: DetailBuilder = async (match, ctx) => {
  const [, season, round, key] = ID.exec(match.id) ?? [];
  if (!season) throw new Error(`neplatné id ${match.id}`);
  let qualifying: unknown = null;
  const quali = ctx.matches.find((m) => m.id === `f1:${season}-${round}-Qualifying`);
  if (key === 'Race' && quali && Date.parse(quali.startsAt) <= ctx.now.getTime()) {
    try { qualifying = await ctx.get.json(`https://api.jolpi.ca/ergast/f1/${season}/${round}/qualifying.json`); } catch { /* rošt není povinný */ }
  }
  return parseF1Detail({ match, matches: ctx.matches, standings: ctx.standings, qualifying, now: ctx.now });
};
