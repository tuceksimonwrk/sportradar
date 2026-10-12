import { COMPETITIONS, competitionById, type Match, type StandingRow, type StandingsColumn, type StandingsTable, type Team, type Venue } from '@sportradar/shared';
import type { AdapterResult } from '../types';
import { combine, safeLogoUrl } from '../util';

/** Soutěže, které bereme z ESPN (vše kromě české ligy). */
export const ESPN_FOOTBALL = COMPETITIONS.filter((c) => c.sport === 'football' && c.id !== 'cze.1').map((c) => c.id);

export const UPCOMING_DAYS = 21;
export const RESULT_DAYS = 14;
const DAY = 86400_000;

/** Sloupce fotbalové tabulky (ESPN i Chance Liga). */
export const FOOTBALL_COLUMNS: StandingsColumn[] = [
  { key: 'z', label: 'Z', title: 'Zápasy' }, { key: 'v', label: 'V', title: 'Výhry' },
  { key: 'r', label: 'R', title: 'Remízy' }, { key: 'p', label: 'P', title: 'Prohry' },
  { key: 'skore', label: 'Skóre', title: 'Skóre (vstřelené:obdržené)' },
  { key: 'rozdil', label: '+/−', title: 'Rozdíl skóre' }, { key: 'b', label: 'B', title: 'Body' },
];

interface EspnTeam { id?: string | number; displayName?: string; logo?: string; logos?: { href?: string }[] }
interface EspnCompetitor { homeAway?: string; score?: unknown; shootoutScore?: unknown; team?: EspnTeam }
interface EspnEvent {
  id?: string; date?: string;
  status?: { type?: { state?: string; name?: string; completed?: boolean; shortDetail?: string } };
  competitions?: { venue?: { fullName?: string; address?: { city?: string } }; competitors?: EspnCompetitor[] }[];
}

const num = (v: unknown): number | null => {
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
/** Zápas, který se hrát nebude / nedohrál (odložený, zrušený, přerušený). */
const DEAD = /POSTPONED|CANCEL|ABANDON|SUSPEND/i;

export const espnTeamId = (id: unknown) => `football:${String(id)}`;

/** Tým z ESPN; league = soutěž, ve které jsme ho viděli (domácí liga má přednost – řeší combineFootballTeams). */
export function espnTeam(t: EspnTeam | undefined, league: string): Team | null {
  const id = t?.id; const name = t?.displayName?.trim();
  if ((typeof id !== 'string' && typeof id !== 'number') || !String(id) || !name) return null;
  const logo = safeLogoUrl(t?.logo) ?? safeLogoUrl(t?.logos?.[0]?.href);
  return { id: espnTeamId(id), sport: 'football', name, ...(logo && { logo }), league };
}

/**
 * Zápasy jedné soutěže ze scoreboardu ESPN. Nadcházející/probíhající do now + 21 dní, výsledky (dohrané se skóre)
 * za posledních 14 dní; odložené/zrušené/přerušené se přeskočí. `resultsOnly` = jen výsledky (minulé měsíce).
 */
export function parseEspnFootball(json: unknown, compId: string, now: Date, opts: { resultsOnly?: boolean } = {}): AdapterResult {
  const comp = competitionById(compId);
  if (!comp) throw new Error(`neznámá soutěž ${compId}`);
  const events = ((json as any)?.events ?? []) as EspnEvent[];
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  for (const e of Array.isArray(events) ? events : []) {
    const c = e.competitions?.[0];
    const homeC = c?.competitors?.find((x) => x.homeAway === 'home');
    const awayC = c?.competitors?.find((x) => x.homeAway === 'away');
    const home = espnTeam(homeC?.team, compId); const away = espnTeam(awayC?.team, compId);
    if (!home || !away || !e.id) continue;
    teams.set(home.id, home); teams.set(away.id, away);
    const t = e.status?.type ?? {};
    if (DEAD.test(t.name ?? '')) continue;
    const isPost = t.state === 'post';
    if (isPost && t.completed !== true) continue;
    if (t.state !== 'pre' && t.state !== 'in' && !isPost) continue;
    if (opts.resultsOnly && !isPost) continue;
    const start = new Date(e.date ?? '');
    const ts = start.getTime();
    if (Number.isNaN(ts)) continue;
    let result: Match['result'];
    if (isPost) {
      const hs = num(homeC?.score); const as = num(awayC?.score);
      if (hs === null || as === null || ts < now.getTime() - RESULT_DAYS * DAY) continue;
      let note: string | undefined;
      if (/PEN/i.test(t.name ?? '') || /pen/i.test(t.shortDetail ?? '')) {
        const hp = num(homeC?.shootoutScore); const ap = num(awayC?.shootoutScore);
        note = hp !== null && ap !== null ? `na penalty ${hp}:${ap}` : 'na penalty';
      } else if (/AET/i.test(t.name ?? '') || /AET/i.test(t.shortDetail ?? '')) note = 'po prodloužení';
      result = { home: hs, away: as, homeName: home.name, awayName: away.name, ...(note && { note }) };
    } else if (ts > now.getTime() + UPCOMING_DAYS * DAY) continue;
    const vName = c?.venue?.fullName?.trim();
    const city = c?.venue?.address?.city?.trim();
    const venue: Venue | undefined = vName ? (city ? { name: vName, city } : { name: vName }) : undefined;
    matches.push({
      id: `football:${e.id}`, sport: 'football', competition: comp.name, competitionId: compId,
      startsAt: start.toISOString(), title: `${home.name} – ${away.name}`, teams: [home.id, away.id], broadcasters: [],
      ...(venue && { venue }), ...(result && { result }),
    });
  }
  return { matches, teams: [...teams.values()] };
}

/** Tabulka(y) soutěže z ESPN standings: jedna skupina → id `football-<comp>`, více skupin → `football-<comp>-<n>`. */
export function parseEspnFootballStandings(json: unknown, compId: string): { tables: StandingsTable[]; teams: Team[] } {
  const comp = competitionById(compId);
  const children = (json as any)?.children;
  if (!comp || !Array.isArray(children)) throw new Error(`${compId}: neočekávaný tvar tabulky (změněná data?)`);
  const tables: StandingsTable[] = [];
  const teams: Team[] = [];
  const groups = children.filter((c: any) => Array.isArray(c?.standings?.entries) && c.standings.entries.length > 0);
  groups.forEach((g: any, gi: number) => {
    const parsed: { rank: number; row: Omit<StandingRow, 'pos'> }[] = [];
    for (const e of g.standings.entries) {
      const team = espnTeam(e?.team, compId);
      if (!team) continue;
      teams.push(team);
      const stats: any[] = Array.isArray(e.stats) ? e.stats : [];
      const v = (n: string) => num(stats.find((s) => s?.name === n)?.value);
      const val = (n: string): string | number => v(n) ?? '–';
      const pf = v('pointsFor'); const pa = v('pointsAgainst'); const diff = v('pointDifferential');
      parsed.push({
        rank: v('rank') ?? Infinity,
        row: { name: team.name, teamId: team.id, values: {
          z: val('gamesPlayed'), v: val('wins'), r: val('ties'), p: val('losses'),
          skore: pf !== null && pa !== null ? `${pf}:${pa}` : '–',
          rozdil: diff === null ? '–' : diff > 0 ? `+${diff}` : String(diff), b: val('points'),
        } },
      });
    }
    if (!parsed.length) return;
    parsed.sort((a, b) => a.rank - b.rank);
    const multi = groups.length > 1;
    tables.push({
      id: multi ? `football-${compId}-${gi + 1}` : `football-${compId}`, sport: 'football',
      title: multi ? `${comp.name} – ${String(g.name ?? gi + 1)}` : comp.name,
      columns: FOOTBALL_COLUMNS, rows: parsed.map((x, i) => ({ pos: i + 1, ...x.row })),
    });
  });
  return { tables, teams };
}

const ym = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
function monthsBetween(from: number, to: number): string[] {
  const out: string[] = [];
  for (let t = from; t <= to; t += DAY) { const m = ym(t); if (!out.includes(m)) out.push(m); }
  const last = ym(to); if (!out.includes(last)) out.push(last);
  return out;
}

/**
 * Měsíce pro `scoreboard?dates=YYYYMM` (ESPN nepodporuje rozsah dní, celý měsíc ano – ~2 požadavky na soutěž).
 * strict = měsíce s nadcházejícím oknem [now − 1 d, now + 22 d] (rezerva na americké datum); past = zbylé měsíce
 * výsledkového okna [now − 15 d, …] (jen výsledky, chyba se toleruje).
 */
export function espnMonths(now: Date): { strict: string[]; past: string[] } {
  const t = now.getTime();
  const strict = monthsBetween(t - DAY, t + (UPCOMING_DAYS + 1) * DAY);
  const past = monthsBetween(t - (RESULT_DAYS + 1) * DAY, t - DAY).filter((m) => !strict.includes(m));
  return { strict, past };
}

const BASE = 'https://site.api.espn.com/apis';
export const espnScoreboardUrl = (comp: string, month: string) => `${BASE}/site/v2/sports/soccer/${comp}/scoreboard?dates=${month}&limit=500`;
export const espnStandingsUrl = (comp: string) => `${BASE}/v2/sports/soccer/${comp}/standings`;

/** Výsledek jedné soutěže: zápasy (nebo chyba) + tabulky (nebo chyba tabulky). */
export interface CompetitionPart {
  compId: string;
  data: AdapterResult | Error;
  standings?: StandingsTable[];
  standingsError?: string;
}

/**
 * Jedna soutěž ESPN: měsíce nadcházejícího okna musí projít všechny (jinak chyba soutěže → ponechají se stará data),
 * minulé měsíce jen doplní výsledky. Tabulka se stahuje zvlášť a její chyba soutěž neshodí.
 */
export async function fetchEspnCompetition(compId: string, now: Date, get: (url: string) => Promise<unknown>): Promise<CompetitionPart> {
  const { strict, past } = espnMonths(now);
  const [main, old, st] = await Promise.all([
    Promise.allSettled(strict.map((m) => get(espnScoreboardUrl(compId, m)))),
    Promise.allSettled(past.map((m) => get(espnScoreboardUrl(compId, m)))),
    get(espnStandingsUrl(compId)).then((v) => ({ v }), (e: Error) => ({ e })),
  ]);
  let standings: StandingsTable[] | undefined; let standingsError: string | undefined; let standingTeams: Team[] = [];
  if ('e' in st) standingsError = `${compId}: ${st.e?.message ?? st.e}`;
  else {
    try { const s = parseEspnFootballStandings(st.v, compId); standings = s.tables; standingTeams = s.teams; } catch (e) { standingsError = (e as Error).message; }
  }
  const bad = main.find((s): s is PromiseRejectedResult => s.status === 'rejected');
  if (bad) return { compId, data: new Error(`${compId}: ${bad.reason?.message ?? bad.reason}`), standings, standingsError };
  try {
    const parts = [
      ...main.map((s) => parseEspnFootball((s as PromiseFulfilledResult<unknown>).value, compId, now)),
      ...old.filter((s): s is PromiseFulfilledResult<unknown> => s.status === 'fulfilled').map((s) => parseEspnFootball(s.value, compId, now, { resultsOnly: true })),
      { matches: [], teams: standingTeams },
    ];
    return { compId, data: combine(parts), standings, standingsError };
  } catch (e) {
    return { compId, data: e as Error, standings, standingsError };
  }
}
