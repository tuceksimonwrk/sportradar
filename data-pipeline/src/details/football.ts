import { competitionById, type DetailStatBlock, type DetailStatRow, type LineupGroup, type LineupPlayer, type Match, type MatchDetail, type StandingsTable } from '@sportradar/shared';
import { blockOf, isNum, numRow, parseScore, rows, sidesOf, standingFor, textRow, toNum, type DetailBuilder } from './common';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
export const FOOTBALL_NO_LINEUP = 'Sestavy zveřejňuje zdroj zhruba hodinu před zápasem.';
export const CZ_NO_LINEUP = 'Sestavy nejsou k dispozici.';

const espnIdOf = (teamId: string | undefined) => /^football:(\d+)$/.exec(teamId ?? '')?.[1];

/** Řádky z tabulky soutěže zápasu (football-<comp>…), ne z jiné soutěže téhož klubu. */
function tableBlock(match: Match, standings: StandingsTable[]): DetailStatBlock[] {
  const comp = match.competitionId;
  const own = standings.filter((t) => t.sport === 'football' && comp && (t.id === `football-${comp}` || t.id.startsWith(`football-${comp}-`)));
  const hs = standingFor(own, match.teams[0]); const as = standingFor(own, match.teams[1]);
  if (!hs || !as) return [];
  const v = (s: typeof hs, k: string) => s.row.values[k];
  const vrp = (s: typeof hs) => (isNum(v(s, 'v')) && isNum(v(s, 'r')) && isNum(v(s, 'p')) ? `${v(s, 'v')}–${v(s, 'r')}–${v(s, 'p')}` : undefined);
  const gh = parseScore(v(hs, 'skore')); const ga = parseScore(v(as, 'skore'));
  return blockOf('Tabulka', rows(
    numRow('Pořadí', hs.row.pos, as.row.pos, (n) => `${n}.`, true),
    numRow('Body', v(hs, 'b'), v(as, 'b')),
    numRow('Zápasy', v(hs, 'z'), v(as, 'z')),
    textRow('V–R–P', vrp(hs), vrp(as)),
    numRow('Vstřelené góly', gh?.[0], ga?.[0]),
    numRow('Obdržené góly', gh?.[1], ga?.[1], (n) => n, true),
  ), hs.table.title);
}

const RES: Record<string, string> = { W: 'V', D: 'R', L: 'P' };

function lastFive(summary: any, home?: string, away?: string): DetailStatBlock[] {
  const list: any[] = Array.isArray(summary?.lastFiveGames) ? summary.lastFiveGames : [];
  const agg = (id?: string) => {
    const ev: any[] = list.find((t) => String(t?.team?.id) === id)?.events ?? [];
    const games = ev.map((e) => {
      const mine = String(e?.homeTeamId) === id;
      return { r: String(e?.gameResult ?? ''), own: toNum(mine ? e?.homeTeamScore : e?.awayTeamScore), opp: toNum(mine ? e?.awayTeamScore : e?.homeTeamScore) };
    }).filter((g) => RES[g.r] && isNum(g.own) && isNum(g.opp)) as { r: string; own: number; opp: number }[];
    if (!games.length) return undefined;
    return {
      form: games.map((g) => RES[g.r]).join(' '),
      pts: games.reduce((s, g) => s + (g.r === 'W' ? 3 : g.r === 'D' ? 1 : 0), 0),
      gf: games.reduce((s, g) => s + g.own, 0), ga: games.reduce((s, g) => s + g.opp, 0),
    };
  };
  const h = agg(home); const a = agg(away);
  if (!h || !a) return [];
  return blockOf('Posledních 5 zápasů', rows(
    textRow('Forma', h.form, a.form),
    numRow('Body', h.pts, a.pts),
    { label: 'Skóre', home: `${h.gf}:${h.ga}`, away: `${a.gf}:${a.ga}`, homeValue: h.gf - h.ga, awayValue: a.gf - a.ga },
  ), 'Forma od nejstaršího zápasu (V výhra, R remíza, P prohra); všechny soutěže podle ESPN.');
}

const dateCs = (d: Date) => new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric', year: 'numeric' }).format(d).replace(/\.\s*/g, '. ').trim();

function headToHead(summary: any, home?: string, away?: string): DetailStatBlock[] {
  const series: any[] = Array.isArray(summary?.seasonseries) ? summary.seasonseries : [];
  const s = series[0];
  if (!s || !home || !away) return [];
  const done: DetailStatRow[] = [];
  let hw = 0; let aw = 0; let dr = 0;
  for (const e of Array.isArray(s.events) ? s.events : []) {
    if (!(e?.statusType?.completed === true || e?.statusType?.state === 'post')) continue;
    const score = (id: string) => toNum((e.competitors ?? []).find((x: any) => String(x?.team?.id) === id)?.score);
    const h = score(home); const a = score(away);
    const d = new Date(e.date);
    if (!isNum(h) || !isNum(a) || Number.isNaN(d.getTime())) continue;
    if (h > a) hw++; else if (a > h) aw++; else dr++;
    done.push({ label: dateCs(d), home: h, away: a, homeValue: h, awayValue: a });
  }
  if (!done.length) return [{ title: 'Vzájemné zápasy', rows: [], note: 'Spolu zatím nehráli (podle ESPN).' }];
  return [{ title: 'Vzájemné zápasy', rows: [{ label: 'Výhry', home: hw, away: aw, homeValue: hw, awayValue: aw }, ...done],
    note: `Posledních ${done.length} vzájemných zápasů ve všech soutěžích${dr ? `, ${dr}× remíza` : ''}.` }];
}

/** Post z ESPN zkratky: B brankář, O obránce, Z záložník, Ú útočník; SUB/neznámé → undefined. */
export function footballPos(abbr: unknown): string | undefined {
  const a = typeof abbr === 'string' ? abbr.trim().toUpperCase() : '';
  if (!a || a === 'SUB') return undefined;
  if (/^G/.test(a)) return 'B';
  if (/^(CD|CB|LB|RB|D|SW|LWB|RWB|WB)\b/.test(a) || /^(CD|CB|LB|RB|D)-/.test(a)) return 'O';
  if (/^(F|CF|ST|S|LW|RW|W)\b/.test(a) || /^(CF|F)-/.test(a)) return 'Ú';
  if (/^(M|CM|DM|AM|LM|RM)\b/.test(a) || /^(CM|DM|AM)-/.test(a)) return 'Z';
  return undefined;
}

function lineupGroups(r: any): LineupGroup[] {
  const list: any[] = Array.isArray(r?.roster) ? r.roster : [];
  const player = (p: any): LineupPlayer | null => {
    const name = typeof p?.athlete?.displayName === 'string' ? p.athlete.displayName.trim() : '';
    if (!name) return null;
    const pos = footballPos(p?.position?.abbreviation);
    return { name, ...(p.jersey && { number: String(p.jersey) }), ...(pos && { pos }) };
  };
  const starters = list.filter((p) => p?.starter === true).sort((a, b) => (toNum(a?.formationPlace) ?? 99) - (toNum(b?.formationPlace) ?? 99));
  const bench = list.filter((p) => p?.starter !== true).sort((a, b) => (toNum(a?.jersey) ?? 999) - (toNum(b?.jersey) ?? 999));
  if (starters.length < 11) return [];
  const formation = typeof r?.formation === 'string' && r.formation.trim() ? ` (${r.formation.trim()})` : '';
  const groups = [
    { title: `Základní sestava${formation}`, players: starters.map(player).filter((x): x is LineupPlayer => !!x) },
    { title: 'Střídající', players: bench.map(player).filter((x): x is LineupPlayer => !!x) },
  ];
  return groups.filter((g) => g.players.length);
}

export interface FootballDetailInput { match: Match; summary: any; standings: StandingsTable[]; now: Date }

export function parseFootballDetail({ match, summary, standings, now }: FootballDetailInput): MatchDetail {
  const sides = sidesOf(match);
  const home = espnIdOf(match.teams[0]); const away = espnIdOf(match.teams[1]);
  const stats = [...tableBlock(match, standings), ...lastFive(summary, home, away), ...headToHead(summary, home, away)];
  const rosters: any[] = Array.isArray(summary?.rosters) ? summary.rosters : [];
  const rosterOf = (id?: string, side?: string) => rosters.find((r) => String(r?.team?.id) === id) ?? rosters.find((r) => r?.homeAway === side);
  const hg = lineupGroups(rosterOf(home, 'home')); const ag = lineupGroups(rosterOf(away, 'away'));
  const notes: string[] = [];
  let lineups: MatchDetail['lineups'];
  if (hg.length && ag.length && sides) {
    lineups = { kind: 'confirmed',
      home: { name: sides.home.name, ...(sides.home.teamId && { teamId: sides.home.teamId }), groups: hg },
      away: { name: sides.away.name, ...(sides.away.teamId && { teamId: sides.away.teamId }), groups: ag } };
  } else notes.push(FOOTBALL_NO_LINEUP);
  if (!stats.length) notes.push('Statistiky k zápasu se nepodařilo načíst.');
  return {
    matchId: match.id, sport: 'football', generatedAt: now.toISOString(), source: 'ESPN',
    ...(sides && { homeName: sides.home.name, awayName: sides.away.name }),
    stats, ...(lineups && { lineups }), notes,
  };
}

/** Chance Liga: jen porovnání z tabulky (web ligy sestavy předem neposkytuje). */
export function czFootballDetail(match: Match, standings: StandingsTable[], now: Date): MatchDetail {
  const sides = sidesOf(match);
  const stats = tableBlock(match, standings);
  return {
    matchId: match.id, sport: 'football', generatedAt: now.toISOString(), source: 'chanceliga.cz',
    ...(sides && { homeName: sides.home.name, awayName: sides.away.name }),
    stats, notes: [CZ_NO_LINEUP, ...(stats.length ? [] : ['Tabulka zatím není k dispozici.'])],
  };
}

export const footballDetail: DetailBuilder = async (match, ctx) => {
  if (match.competitionId === 'cze.1') return czFootballDetail(match, ctx.standings, ctx.now);
  const ev = /^football:(\d+)$/.exec(match.id)?.[1];
  const comp = competitionById(match.competitionId);
  if (!ev || !comp) throw new Error(`neplatné id/soutěž ${match.id}`);
  const summary = await ctx.get.json(`${ESPN}/${comp.id}/summary?event=${ev}`);
  return parseFootballDetail({ match, summary, standings: ctx.standings, now: ctx.now });
};
