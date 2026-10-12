import { competitionById, type DetailStatBlock, type DetailStatRow, type LineupGroup, type LineupPlayer, type Match, type MatchDetail, type StandingsTable } from '@sportradar/shared';
import * as cheerio from 'cheerio';
import { nbaStatus } from './nba';
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

/** 'Poslední vzájemný zápas' / 'Poslední 4 vzájemné zápasy' / 'Posledních 5 vzájemných zápasů'. */
export const lastN = (n: number) => (n === 1 ? 'Poslední vzájemný zápas' : n < 5 ? `Poslední ${n} vzájemné zápasy` : `Posledních ${n} vzájemných zápasů`);

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
    note: `${lastN(done.length)} ve všech soutěžích${dr ? `, ${dr}× remíza` : ''}.` }];
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

// ---------- soupisky (záloha, dokud zdroj nezveřejní sestavy) ----------

export const FOOTBALL_SQUAD_NOTE = 'Sestavy zveřejňuje zdroj zhruba hodinu před zápasem – do té doby zobrazujeme soupisku týmu.';
export const CZ_SQUAD_NOTE = 'Sestavy na zápas web ligy předem nezveřejňuje – zobrazujeme soupisku týmu.';
const SQUAD_ORDER = ['Brankáři', 'Obránci', 'Záložníci', 'Útočníci', 'Ostatní'];

/** Post → skupina soupisky: G/GK, D/DF…, M/MF…, F/A/FW… (ESPN) i B/O/Z/U (chanceliga.cz); jinak Ostatní. */
export function squadGroup(abbr: unknown): string {
  const a = typeof abbr === 'string' ? abbr.trim().toUpperCase() : '';
  if (/^(G|GK|B)$/.test(a)) return 'Brankáři';
  if (/^(D|DF|CB|LB|RB|CD|O)$/.test(a)) return 'Obránci';
  if (/^(M|MF|CM|DM|AM|LM|RM|Z)$/.test(a)) return 'Záložníci';
  if (/^(F|A|FW|ST|CF|U|Ú)$/.test(a)) return 'Útočníci';
  return 'Ostatní';
}

interface SquadEntry { name: string; number?: string; status?: string; group: string }

function groupSquad(list: SquadEntry[]): LineupGroup[] {
  const groups = SQUAD_ORDER.map((title) => ({
    title,
    players: list.filter((p) => p.group === title)
      .sort((a, b) => (toNum(a.number) ?? 999) - (toNum(b.number) ?? 999) || a.name.localeCompare(b.name, 'cs'))
      .map((p): LineupPlayer => ({ name: p.name, ...(p.number && { number: p.number }), ...(p.status && { status: p.status }) })),
  }));
  return groups.filter((g) => g.players.length);
}

/** Soupiska týmu z ESPN `teams/{id}/roster` (athletes[]: displayName, jersey, position.abbreviation, injuries[]). */
export function parseEspnSquad(json: unknown): LineupGroup[] {
  const athletes: any[] = Array.isArray((json as any)?.athletes) ? (json as any).athletes : [];
  return groupSquad(athletes.map((a): SquadEntry => {
    const name = typeof a?.displayName === 'string' ? a.displayName.trim() : '';
    const jersey = a?.jersey != null && /^\d{1,3}$/.test(String(a.jersey).trim()) ? String(a.jersey).trim() : undefined;
    const status = nbaStatus(a?.injuries?.[0]?.status);
    return { name, number: jersey, status, group: squadGroup(a?.position?.abbreviation) };
  }).filter((p) => p.name));
}

/** Kádr klubu z chanceliga.cz (`/klub/kadr/<n>-<slug>`): tabulka s hlavičkou # Hráč Po; Po = B/O/Z/U. */
export function parseCzSquad(html: string): LineupGroup[] {
  const $ = cheerio.load(html);
  for (const t of $('table').toArray()) {
    const heads = $(t).find('thead th').map((_, h) => $(h).text().replace(/\s+/g, ' ').trim()).get();
    if (heads[1] !== 'Hráč' || heads[2] !== 'Po') continue;
    return groupSquad($(t).find('tbody tr').toArray().map((tr): SquadEntry => {
      const tds = $(tr).children('td');
      const num = $(tds[0]).text().trim();
      return { name: $(tds[1]).text().replace(/\s+/g, ' ').trim(), number: /^\d{1,3}$/.test(num) ? num : undefined, group: squadGroup($(tds[2]).text()) };
    }).filter((p) => p.name));
  }
  return [];
}

export interface FootballDetailInput { match: Match; summary: any; standings: StandingsTable[]; now: Date; squads?: { home: LineupGroup[]; away: LineupGroup[] } }

/** ESPN id domácích/hostů: z našeho id, u českých klubů (id z chanceliga.cz) z hlavičky summary. */
export function espnSides(summary: any, match: Match): { home?: string; away?: string } {
  const header: any[] = summary?.header?.competitions?.[0]?.competitors ?? [];
  const side = (i: number, ha: string) => espnIdOf(match.teams[i]) ?? (header.find((c) => c?.homeAway === ha)?.id ?? header.find((c) => c?.homeAway === ha)?.team?.id)?.toString();
  return { home: side(0, 'home'), away: side(1, 'away') };
}

function confirmedGroups(summary: any, home?: string, away?: string): { hg: LineupGroup[]; ag: LineupGroup[] } {
  const rosters: any[] = Array.isArray(summary?.rosters) ? summary.rosters : [];
  const rosterOf = (id?: string, side?: string) => rosters.find((r) => String(r?.team?.id) === id) ?? rosters.find((r) => r?.homeAway === side);
  return { hg: lineupGroups(rosterOf(home, 'home')), ag: lineupGroups(rosterOf(away, 'away')) };
}

type Sides = NonNullable<ReturnType<typeof sidesOf>>;
const lineupOf = (kind: 'confirmed' | 'roster', sides: Sides, hg: LineupGroup[], ag: LineupGroup[]): NonNullable<MatchDetail['lineups']> => ({
  kind,
  home: { name: sides.home.name, ...(sides.home.teamId && { teamId: sides.home.teamId }), groups: hg },
  away: { name: sides.away.name, ...(sides.away.teamId && { teamId: sides.away.teamId }), groups: ag },
});

export function parseFootballDetail({ match, summary, standings, now, squads }: FootballDetailInput): MatchDetail {
  const sides = sidesOf(match);
  const { home, away } = espnSides(summary, match);
  const stats = [...tableBlock(match, standings), ...lastFive(summary, home, away), ...headToHead(summary, home, away)];
  const { hg, ag } = confirmedGroups(summary, home, away);
  const notes: string[] = [];
  let lineups: MatchDetail['lineups'];
  if (hg.length && ag.length && sides) lineups = lineupOf('confirmed', sides, hg, ag);
  else if (squads?.home.length && squads.away.length && sides) { lineups = lineupOf('roster', sides, squads.home, squads.away); notes.push(FOOTBALL_SQUAD_NOTE); }
  else notes.push(FOOTBALL_NO_LINEUP);
  if (!stats.length) notes.push('Statistiky k zápasu se nepodařilo načíst.');
  return {
    matchId: match.id, sport: 'football', generatedAt: now.toISOString(), source: 'ESPN',
    ...(sides && { homeName: sides.home.name, awayName: sides.away.name }),
    stats, ...(lineups && { lineups }), notes,
  };
}

/** Chance Liga: porovnání z tabulky + soupisky z webu ligy (sestavy na zápas web předem nezveřejňuje). */
export function czFootballDetail(match: Match, standings: StandingsTable[], now: Date, squads?: { home: LineupGroup[]; away: LineupGroup[] }): MatchDetail {
  const sides = sidesOf(match);
  const stats = tableBlock(match, standings);
  const lineups = squads?.home.length && squads.away.length && sides ? lineupOf('roster', sides, squads.home, squads.away) : undefined;
  return {
    matchId: match.id, sport: 'football', generatedAt: now.toISOString(), source: 'chanceliga.cz',
    ...(sides && { homeName: sides.home.name, awayName: sides.away.name }),
    stats, ...(lineups && { lineups }),
    notes: [lineups ? CZ_SQUAD_NOTE : CZ_NO_LINEUP, ...(stats.length ? [] : ['Tabulka zatím není k dispozici.'])],
  };
}

type Ctx = Parameters<DetailBuilder>[1];

/** Soupiska ESPN: postupně soutěže, kde klub známe (domácí liga, soutěž zápasu, LM); 404/prázdná → další. Cache = fetcher běhu. */
async function espnSquad(ctx: Ctx, espnId: string | undefined, slugs: string[]): Promise<LineupGroup[]> {
  if (!espnId) return [];
  for (const slug of slugs) {
    try {
      const g = parseEspnSquad(await ctx.get.json(`${ESPN}/${slug}/teams/${espnId}/roster`));
      if (g.length) return g;
    } catch { /* zkusíme další soutěž */ }
  }
  return [];
}

const CZ_SITE = 'https://www.chanceliga.cz';
/** Kádry klubů Chance Ligy: číslo klubu z odkazů rozpisu (`/klub/<n>-<slug>`, slug = id klubu), pak `/klub/kadr/<n>-<slug>`. */
async function czSquads(ctx: Ctx, teamIds: string[]): Promise<LineupGroup[][]> {
  const nums = new Map<string, string>();
  try {
    const $ = cheerio.load(await ctx.get.text(`${CZ_SITE}/rozpis-zapasu`));
    $('a[href^="/klub/"]').each((_, a) => { const m = /^\/klub\/(\d+)-([a-z0-9-]+)$/.exec($(a).attr('href') ?? ''); if (m) nums.set(m[2], m[1]); });
  } catch { return teamIds.map(() => []); }
  return Promise.all(teamIds.map(async (id) => {
    const slug = /^football:cz_(.+)$/.exec(id)?.[1];
    const n = slug ? nums.get(slug) : undefined;
    if (!n) return [];
    try { return parseCzSquad(await ctx.get.text(`${CZ_SITE}/klub/kadr/${n}-${slug}`)); } catch { return []; }
  }));
}

export const footballDetail: DetailBuilder = async (match, ctx) => {
  if (match.competitionId === 'cze.1') {
    const [home = [], away = []] = await czSquads(ctx, match.teams.slice(0, 2));
    return czFootballDetail(match, ctx.standings, ctx.now, { home, away });
  }
  const ev = /^football:(\d+)$/.exec(match.id)?.[1];
  const comp = competitionById(match.competitionId);
  if (!ev || !comp) throw new Error(`neplatné id/soutěž ${match.id}`);
  const summary = await ctx.get.json(`${ESPN}/${comp.id}/summary?event=${ev}`);
  const { home, away } = espnSides(summary, match);
  let squads: FootballDetailInput['squads'];
  const { hg, ag } = confirmedGroups(summary, home, away);
  if (!(hg.length && ag.length)) {
    const slugsFor = (teamId: string | undefined) => {
      const league = ctx.teams.find((t) => t.id === teamId)?.league;
      return [...new Set([league, comp.id, 'uefa.champions'].filter((s): s is string => !!s && s !== 'cze.1'))];
    };
    const [h, a] = await Promise.all([espnSquad(ctx, home, slugsFor(match.teams[0])), espnSquad(ctx, away, slugsFor(match.teams[1]))]);
    squads = { home: h, away: a };
  }
  return parseFootballDetail({ match, summary, standings: ctx.standings, now: ctx.now, squads });
};
