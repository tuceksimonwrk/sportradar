import type { DetailStatBlock, DetailStatRow, LineupGroup, LineupPlayer, Match, MatchDetail, TeamLineup } from '@sportradar/shared';
import { blockOf, dec, isNum, numRow, pct, rows, sidesOf, signed, textRow, streakLabel, type DetailBuilder } from './common';

const API = 'https://api-web.nhle.com/v1';
type L10n = { default?: string; cs?: string } | undefined;
const loc = (x: L10n): string => (x?.cs ?? x?.default ?? '').trim();

const rec = (w: unknown, l: unknown, o: unknown) => (isNum(w) && isNum(l) && isNum(o) ? `${w}–${l}–${o}` : undefined);

function seasonBlock(standings: any, homeAbbr: string, awayAbbr: string): DetailStatBlock[] {
  const list: any[] = Array.isArray(standings?.standings) ? standings.standings : [];
  const find = (abbr: string) => list.find((e) => e?.teamAbbrev?.default === abbr);
  const h = find(homeAbbr); const a = find(awayAbbr);
  if (!h || !a) return [];
  const perGame = (e: any, k: string) => (isNum(e[k]) && isNum(e.gamesPlayed) && e.gamesPlayed > 0 ? e[k] / e.gamesPlayed : undefined);
  return blockOf('Sezóna', rows(
    numRow('Pořadí v konferenci', h.conferenceSequence, a.conferenceSequence, (n) => `${n}.`, true),
    numRow('Body', h.points, a.points),
    textRow('Bilance V–P–PP', rec(h.wins, h.losses, h.otLosses), rec(a.wins, a.losses, a.otLosses)),
    numRow('Bodová úspěšnost', h.pointPctg, a.pointPctg, (n) => pct(n)),
    numRow('Góly vstřelené / zápas', perGame(h, 'goalFor'), perGame(a, 'goalFor'), (n) => dec(n, 2)),
    numRow('Góly obdržené / zápas', perGame(h, 'goalAgainst'), perGame(a, 'goalAgainst'), (n) => dec(n, 2), true),
    numRow('Rozdíl skóre', h.goalDifferential, a.goalDifferential, signed),
    textRow('Doma / venku', rec(h.homeWins, h.homeLosses, h.homeOtLosses), rec(a.roadWins, a.roadLosses, a.roadOtLosses)),
    textRow('Posledních 10', rec(h.l10Wins, h.l10Losses, h.l10OtLosses), rec(a.l10Wins, a.l10Losses, a.l10OtLosses)),
    textRow('Série', streakLabel(h.streakCode, h.streakCount), streakLabel(a.streakCode, a.streakCount)),
  ), 'Domácí tým doma, hosté venku.');
}

const CATEGORY: Record<string, string> = { points: 'Body', goals: 'Góly', assists: 'Asistence' };
const nm = (p: any) => loc(p?.name);

function formBlock(matchup: any): DetailStatBlock[] {
  const sc = matchup?.skaterComparison;
  const leaders: any[] = Array.isArray(sc?.leaders) ? sc.leaders : [];
  const r = leaders.map((l) => {
    const label = CATEGORY[l?.category];
    const h = l?.homeLeader; const a = l?.awayLeader;
    if (!label || !nm(h) || !nm(a) || !isNum(h.value) || !isNum(a.value)) return undefined;
    return { label, home: `${nm(h)} ${h.value}`, away: `${nm(a)} ${a.value}`, homeValue: h.value, awayValue: a.value } satisfies DetailStatRow;
  });
  const title = sc?.contextLabel === 'last_5_games' ? 'Forma – posledních 5 zápasů' : 'Nejlepší hráči';
  return blockOf(title, rows(...r));
}

function seasonLeaders(matchup: any, homeId: unknown, awayId: unknown): DetailStatBlock[] {
  const sk: any[] = Array.isArray(matchup?.skaterSeasonStats?.skaters) ? matchup.skaterSeasonStats.skaters : [];
  const best = (teamId: unknown, key: string) => sk.filter((s) => s?.teamId === teamId && isNum(s[key]) && nm(s))
    .sort((x, y) => y[key] - x[key])[0];
  const row = (label: string, key: string, fmt: (n: number) => string = String): DetailStatRow | undefined => {
    const h = best(homeId, key); const a = best(awayId, key);
    if (!h || !a) return undefined;
    return { label, home: `${nm(h)} ${fmt(h[key])}`, away: `${nm(a)} ${fmt(a[key])}`, homeValue: h[key], awayValue: a[key] };
  };
  return blockOf('Nejlepší hráči sezóny', rows(row('Body', 'points'), row('Góly', 'goals'), row('Asistence', 'assists'), row('Plus/minus', 'plusMinus', signed)));
}

function goalieBlock(matchup: any): DetailStatBlock[] {
  const g = matchup?.goalieComparison;
  const h = g?.homeTeam?.teamTotals; const a = g?.awayTeam?.teamTotals;
  const top = (side: any) => {
    const l = (Array.isArray(side?.leaders) ? side.leaders : []).filter((x: any) => nm(x) && isNum(x.gamesPlayed))
      .sort((x: any, y: any) => y.gamesPlayed - x.gamesPlayed)[0];
    return l ? `${nm(l)}${typeof l.record === 'string' ? ` (${l.record})` : ''}` : undefined;
  };
  return blockOf('Brankáři', rows(
    numRow('Obdržené góly na zápas', h?.gaa, a?.gaa, (n) => dec(n, 2), true),
    numRow('Úspěšnost zákroků', h?.savePctg, a?.savePctg, (n) => pct(n)),
    numRow('Čistá konta', h?.shutouts, a?.shutouts),
    textRow('Nejvytíženější brankář', top(g?.homeTeam), top(g?.awayTeam)),
  ));
}

const POS: Record<string, string> = { C: 'C', L: 'LK', R: 'PK', D: 'O', G: 'B' };
function rosterGroups(roster: any): LineupGroup[] {
  const group = (title: string, list: unknown): LineupGroup => ({
    title,
    players: (Array.isArray(list) ? list : [])
      .map((p: any): LineupPlayer | null => {
        const name = [loc(p?.firstName), loc(p?.lastName)].filter(Boolean).join(' ');
        if (!name) return null;
        return { name, ...(isNum(p.sweaterNumber) && { number: p.sweaterNumber }), ...(POS[p.positionCode] && { pos: POS[p.positionCode] }) };
      })
      .filter((p): p is LineupPlayer => !!p)
      .sort((x, y) => Number(x.number ?? 999) - Number(y.number ?? 999)),
  });
  return [group('Útočníci', roster?.forwards), group('Obránci', roster?.defensemen), group('Brankáři', roster?.goalies)].filter((g) => g.players.length);
}

export interface NhlDetailInput { match: Match; landing: any; standings: any; rosters: { home?: any; away?: any }; now: Date }

export function parseNhlDetail({ match, landing, standings, rosters, now }: NhlDetailInput): MatchDetail {
  const sides = sidesOf(match);
  const homeAbbr = landing?.homeTeam?.abbrev ?? match.teams[0]?.split(':')[1];
  const awayAbbr = landing?.awayTeam?.abbrev ?? match.teams[1]?.split(':')[1];
  const mu = landing?.matchup;
  const stats = [
    ...seasonBlock(standings, homeAbbr, awayAbbr),
    ...formBlock(mu),
    ...seasonLeaders(mu, landing?.homeTeam?.id, landing?.awayTeam?.id),
    ...goalieBlock(mu),
  ];
  const notes: string[] = [];
  const hg = rosterGroups(rosters.home); const ag = rosterGroups(rosters.away);
  let lineups: MatchDetail['lineups'];
  if (hg.length && ag.length) {
    const team = (name: string | undefined, teamId: string | undefined, groups: LineupGroup[]): TeamLineup => ({ name: name ?? '', ...(teamId && { teamId }), groups });
    lineups = { kind: 'roster', home: team(sides?.home.name, sides?.home.teamId, hg), away: team(sides?.away.name, sides?.away.teamId, ag) };
    notes.push('Soupiska týmu – sestava na konkrétní zápas se zveřejní krátce před zápasem.');
  } else notes.push('Soupisky týmů se nepodařilo načíst.');
  if (!stats.length) notes.push('Statistiky k zápasu se nepodařilo načíst.');
  return {
    matchId: match.id, sport: 'nhl', generatedAt: now.toISOString(), source: 'NHL.com',
    ...(sides && { homeName: sides.home.name, awayName: sides.away.name }),
    stats, ...(lineups && { lineups }), notes,
  };
}

const gameIdOf = (id: string) => /^nhl:(\d+)$/.exec(id)?.[1];

export const nhlDetail: DetailBuilder = async (match, ctx) => {
  const gid = gameIdOf(match.id);
  if (!gid) throw new Error(`neplatné id ${match.id}`);
  const landing = await ctx.get.json(`${API}/gamecenter/${gid}/landing`);
  const abbr = (side: 'homeTeam' | 'awayTeam', i: number) => landing?.[side]?.abbrev ?? match.teams[i]?.split(':')[1];
  const [standings, home, away] = await Promise.allSettled([
    ctx.get.json(`${API}/standings/now`),
    ctx.get.json(`${API}/roster/${abbr('homeTeam', 0)}/current`),
    ctx.get.json(`${API}/roster/${abbr('awayTeam', 1)}/current`),
  ]);
  const val = (s: PromiseSettledResult<unknown>) => (s.status === 'fulfilled' ? s.value : undefined);
  return parseNhlDetail({ match, landing, standings: val(standings) ?? null, rosters: { home: val(home), away: val(away) }, now: ctx.now });
};
