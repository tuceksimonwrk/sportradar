import type { DetailStatBlock, DetailStatRow, LineupGroup, LineupPlayer, Match, MatchDetail, StandingsTable } from '@sportradar/shared';
import { blockOf, dec, isNum, numRow, pct, rows, sidesOf, standingFor, streakLabel, textRow, toNum, type DetailBuilder } from './common';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

/** Zdravotní stav ESPN → česky; 'Active' / prázdný = bez štítku. */
export function nbaStatus(s: unknown): string | undefined {
  if (typeof s !== 'string' || !s.trim() || /^active$/i.test(s.trim())) return undefined;
  const k = s.trim().toLowerCase();
  if (k === 'out' || k === 'injured reserve') return 'Zraněn';
  if (k === 'day-to-day' || k === 'questionable') return 'Nejistý';
  if (k === 'doubtful') return 'Pochybný';
  if (k === 'probable') return 'Spíše hraje';
  if (k.startsWith('suspen')) return 'Suspendován';
  return 'Omezení';
}

interface Comp { espnId: string; abbr: string; homeAway: string; record: any[] }

function competitors(summary: any): Comp[] {
  const list: any[] = summary?.header?.competitions?.[0]?.competitors ?? [];
  return list.map((c) => ({ espnId: String(c?.team?.id ?? c?.id ?? ''), abbr: String(c?.team?.abbreviation ?? ''), homeAway: String(c?.homeAway ?? ''), record: Array.isArray(c?.record) ? c.record : [] }))
    .filter((c) => c.espnId && c.abbr);
}

/** Domácí a hosté ze summary; páruje se podle zkratky týmu (náš id `nba:ABBR`), jinak podle homeAway. */
function pairComps(summary: any, match: Match): { home?: Comp; away?: Comp } {
  const cs = competitors(summary);
  const abbr = (i: number) => match.teams[i]?.split(':')[1];
  const by = (i: number, side: string) => cs.find((c) => c.abbr === abbr(i)) ?? cs.find((c) => c.homeAway === side);
  return { home: by(0, 'home'), away: by(1, 'away') };
}

const winLoss = (s: string | undefined) => (s && /^\d+-\d+$/.test(s) ? s.replace('-', '–') : undefined);
const streak = (s: unknown) => {
  const m = typeof s === 'string' ? /^([WL])(\d+)$/.exec(s.trim()) : null;
  return m ? streakLabel(m[1], Number(m[2])) : undefined;
};

function seasonBlock(summary: any, match: Match, standings: StandingsTable[], home?: Comp, away?: Comp): DetailStatBlock[] {
  const hs = standingFor(standings, match.teams[0]); const as = standingFor(standings, match.teams[1]);
  const box: any[] = summary?.boxscore?.teams ?? [];
  const stat = (c: Comp | undefined, name: string) => box.find((t) => String(t?.team?.id) === c?.espnId)?.statistics?.find((s: any) => s?.name === name)?.displayValue;
  const record = (c: Comp | undefined, type: string) => winLoss(c?.record.find((r) => r?.type === type)?.summary);
  const pctOf = (s?: { row: { values: Record<string, string | number> } }) => toNum(s?.row.values.pct);
  const vp = (s?: { row: { values: Record<string, string | number> } }) => (s && isNum(s.row.values.v) && isNum(s.row.values.p) ? `${s.row.values.v}–${s.row.values.p}` : undefined);
  const r = rows(
    numRow('Pořadí v konferenci', hs?.row.pos, as?.row.pos, (n) => `${n}.`, true),
    textRow('Bilance V–P', vp(hs) ?? record(home, 'total'), vp(as) ?? record(away, 'total')),
    numRow('Úspěšnost', pctOf(hs), pctOf(as), (n) => pct(n)),
    textRow('Doma / venku', record(home, 'home'), record(away, 'road')),
    numRow('Body / zápas', toNum(stat(home, 'avgPoints')), toNum(stat(away, 'avgPoints')), (n) => dec(n, 1)),
    numRow('Obdržené body / zápas', toNum(stat(home, 'avgPointsAgainst')), toNum(stat(away, 'avgPointsAgainst')), (n) => dec(n, 1), true),
    textRow('Posledních 10', winLoss(stat(home, 'Last Ten Games')), winLoss(stat(away, 'Last Ten Games'))),
    textRow('Série', streak(stat(home, 'streak')), streak(stat(away, 'streak'))),
  );
  const pre = summary?.header?.season?.type === 1;
  return blockOf('Sezóna', r, pre ? 'Přípravné období – čísla vycházejí z malého počtu zápasů.' : 'Domácí tým doma, hosté venku.');
}

function lastFive(summary: any, home?: Comp, away?: Comp): DetailStatBlock[] {
  const list: any[] = Array.isArray(summary?.lastFiveGames) ? summary.lastFiveGames : [];
  const agg = (c?: Comp) => {
    const ev: any[] = list.find((t) => String(t?.team?.id) === c?.espnId)?.events ?? [];
    const games = ev.map((e) => {
      const mine = String(e?.homeTeamId) === c?.espnId;
      const own = toNum(mine ? e?.homeTeamScore : e?.awayTeamScore); const opp = toNum(mine ? e?.awayTeamScore : e?.homeTeamScore);
      return { r: e?.gameResult, own, opp };
    }).filter((g) => (g.r === 'W' || g.r === 'L') && isNum(g.own) && isNum(g.opp)) as { r: 'W' | 'L'; own: number; opp: number }[];
    if (!games.length) return undefined;
    const w = games.filter((g) => g.r === 'W').length;
    return {
      w, rec: `${w}–${games.length - w}`, form: games.map((g) => (g.r === 'W' ? 'V' : 'P')).join(' '),
      own: games.reduce((s, g) => s + g.own, 0) / games.length, opp: games.reduce((s, g) => s + g.opp, 0) / games.length,
    };
  };
  const h = agg(home); const a = agg(away);
  if (!h || !a) return [];
  return blockOf('Posledních 5 zápasů', rows(
    { label: 'Bilance', home: h.rec, away: a.rec, homeValue: h.w, awayValue: a.w },
    textRow('Forma', h.form, a.form),
    numRow('Body / zápas', h.own, a.own, (n) => dec(n, 1)),
    numRow('Obdržené / zápas', h.opp, a.opp, (n) => dec(n, 1), true),
  ), 'Forma od nejstaršího zápasu; může zahrnovat přípravu nebo minulou sezónu.');
}

function headToHead(summary: any, home?: Comp, away?: Comp): DetailStatBlock[] {
  const series: any[] = Array.isArray(summary?.seasonseries) ? summary.seasonseries : [];
  const s = series.find((x) => x?.type === 'season') ?? series[0];
  if (!s || !home || !away) return [];
  const done: DetailStatRow[] = [];
  let hw = 0; let aw = 0;
  for (const e of Array.isArray(s.events) ? s.events : []) {
    if (!(e?.statusType?.completed === true || e?.statusType?.state === 'post')) continue;
    const score = (c: Comp) => toNum((e.competitors ?? []).find((x: any) => String(x?.team?.id) === c.espnId)?.score);
    const h = score(home); const a = score(away);
    const d = new Date(e.date);
    if (!isNum(h) || !isNum(a) || Number.isNaN(d.getTime())) continue;
    if (h > a) hw++; else if (a > h) aw++;
    const label = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', day: 'numeric', month: 'numeric' }).format(d).replace(/\.(?=\d)/, '. ');
    done.push({ label, home: h, away: a, homeValue: h, awayValue: a });
  }
  const total = toNum(s.totalCompetitions);
  if (!done.length) {
    return [{ title: 'Vzájemné zápasy', rows: [], note: `V této sezóně spolu zatím nehráli${total ? ` (v základní části se potkají ${total}×)` : ''}.` }];
  }
  return [{ title: 'Vzájemné zápasy', rows: [{ label: 'Výhry', home: hw, away: aw, homeValue: hw, awayValue: aw }, ...done],
    ...(total && { note: `Odehráno ${done.length} z ${total} vzájemných zápasů v základní části.` }) }];
}

const LEADER: Record<string, string> = { points: 'Body', assists: 'Asistence', rebounds: 'Doskoky' };
function leaders(summary: any, home?: Comp, away?: Comp): DetailStatBlock[] {
  const list: any[] = Array.isArray(summary?.leaders) ? summary.leaders : [];
  const cat = (c: Comp | undefined, name: string) => {
    const l = (list.find((t) => String(t?.team?.id) === c?.espnId)?.leaders ?? []).find((x: any) => x?.name === name)?.leaders?.[0];
    const who = l?.athlete?.shortName ?? l?.athlete?.displayName;
    const v = toNum(l?.displayValue) ?? toNum(l?.value);
    return who && isNum(v) ? { who: String(who), v } : undefined;
  };
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : dec(n, 1));
  const r = Object.entries(LEADER).map(([k, label]) => {
    const h = cat(home, k); const a = cat(away, k);
    return h && a ? { label, home: `${h.who} ${fmt(h.v)}`, away: `${a.who} ${fmt(a.v)}`, homeValue: h.v, awayValue: a.v } : undefined;
  });
  return blockOf('Lídři týmu', rows(...r));
}

function predictor(summary: any): DetailStatBlock[] {
  const p = summary?.predictor;
  const h = toNum(p?.homeTeam?.gameProjection); const a = toNum(p?.awayTeam?.gameProjection);
  return blockOf('Předpověď ESPN', rows(numRow('Šance na výhru', h, a, (n) => `${dec(n, 1)} %`)));
}

const GROUPS: [string, RegExp][] = [['Rozehrávači', /^(G|PG|SG)$/], ['Křídla', /^(F|SF|PF|G-F|F-G)$/], ['Pivoti', /^(C|F-C|C-F)$/]];

function rosterGroups(roster: any, injuries: Map<string, string>): LineupGroup[] {
  const athletes: any[] = Array.isArray(roster?.athletes) ? roster.athletes : [];
  const players = athletes.map((a) => {
    const name = typeof a?.displayName === 'string' ? a.displayName.trim() : '';
    if (!name) return null;
    const pos = typeof a?.position?.abbreviation === 'string' ? a.position.abbreviation : '';
    const status = injuries.get(String(a.id)) ?? nbaStatus(a?.injuries?.[0]?.status);
    const p: LineupPlayer = { name, ...(a.jersey && { number: String(a.jersey) }), ...(pos && { pos }), ...(status && { status }) };
    return { p, pos };
  }).filter((x): x is { p: LineupPlayer; pos: string } => !!x);
  const used = new Set<LineupPlayer>();
  const groups: LineupGroup[] = GROUPS.map(([title, re]) => {
    const list = players.filter((x) => re.test(x.pos)).map((x) => { used.add(x.p); return x.p; });
    return { title, players: list };
  });
  groups.push({ title: 'Ostatní', players: players.filter((x) => !used.has(x.p)).map((x) => x.p) });
  for (const g of groups) g.players.sort((x, y) => Number(x.number ?? 999) - Number(y.number ?? 999));
  return groups.filter((g) => g.players.length);
}

export interface NbaDetailInput { match: Match; summary: any; standings: StandingsTable[]; rosters: { home?: any; away?: any }; now: Date }

export function parseNbaDetail({ match, summary, standings, rosters, now }: NbaDetailInput): MatchDetail {
  const sides = sidesOf(match);
  const { home, away } = pairComps(summary, match);
  const stats = [
    ...seasonBlock(summary, match, standings, home, away),
    ...lastFive(summary, home, away),
    ...headToHead(summary, home, away),
    ...leaders(summary, home, away),
    ...predictor(summary),
  ];
  const injuries = new Map<string, string>();
  for (const t of Array.isArray(summary?.injuries) ? summary.injuries : []) {
    for (const i of Array.isArray(t?.injuries) ? t.injuries : []) {
      const st = nbaStatus(i?.status);
      if (i?.athlete?.id && st) injuries.set(String(i.athlete.id), st);
    }
  }
  const notes: string[] = [];
  const hg = rosterGroups(rosters.home, injuries); const ag = rosterGroups(rosters.away, injuries);
  let lineups: MatchDetail['lineups'];
  if (hg.length && ag.length && sides) {
    lineups = { kind: 'roster',
      home: { name: sides.home.name, ...(sides.home.teamId && { teamId: sides.home.teamId }), groups: hg },
      away: { name: sides.away.name, ...(sides.away.teamId && { teamId: sides.away.teamId }), groups: ag } };
    notes.push('Soupiska týmu se zdravotním stavem hráčů – základní pětka se zveřejní krátce před zápasem.');
  } else notes.push('Soupisky týmů se nepodařilo načíst.');
  if (!stats.length) notes.push('Statistiky k zápasu se nepodařilo načíst.');
  return {
    matchId: match.id, sport: 'nba', generatedAt: now.toISOString(), source: 'ESPN',
    ...(sides && { homeName: sides.home.name, awayName: sides.away.name }),
    stats, ...(lineups && { lineups }), notes,
  };
}

export const nbaDetail: DetailBuilder = async (match, ctx) => {
  const ev = /^nba:(\d+)$/.exec(match.id)?.[1];
  if (!ev) throw new Error(`neplatné id ${match.id}`);
  const summary = await ctx.get.json(`${ESPN}/summary?event=${ev}`);
  const { home, away } = pairComps(summary, match);
  const roster = (c?: Comp) => (c ? ctx.get.json(`${ESPN}/teams/${c.espnId}/roster`) : Promise.reject(new Error('bez id týmu')));
  const [h, a] = await Promise.allSettled([roster(home), roster(away)]);
  const val = (s: PromiseSettledResult<unknown>) => (s.status === 'fulfilled' ? s.value : undefined);
  return parseNbaDetail({ match, summary, standings: ctx.standings, rosters: { home: val(h), away: val(a) }, now: ctx.now });
};
