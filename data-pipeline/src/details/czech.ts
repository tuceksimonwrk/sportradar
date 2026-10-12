import * as cheerio from 'cheerio';
import type { DetailStatBlock, LineupGroup, LineupPlayer, Match, MatchDetail, StandingsTable } from '@sportradar/shared';
import { slugify } from '../util';
import { blockOf, dec, isNum, numRow, parseScore, pct, rows, sidesOf, standingFor, textRow, toNum, type DetailBuilder } from './common';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
export const ELH_NO_LINEUP = 'Rozestavení se zveřejní krátce před zápasem.';

// ---------- ELH (hokej.cz) ----------

export interface ElhClub { path: string; short?: string }
const CLUB_PATH = /^\/klub\/[a-z0-9-]+\/\d+$/;

/** Kluby z hlavičky stránky zápasu (`.match-score .team-home/.team-visiting`); jen čisté cesty /klub/<slug>/<id>. */
export function parseElhClubs(html: string): { home?: ElhClub; away?: ElhClub } {
  const $ = cheerio.load(html);
  const club = (cls: string): ElhClub | undefined => {
    const el = $(`.match-score .${cls}`).first();
    const path = el.find('a[href^="/klub/"]').first().attr('href') ?? '';
    if (!CLUB_PATH.test(path)) return undefined;
    const short = norm(el.find('.short').first().text());
    return { path, ...(short && { short }) };
  };
  const home = club('team-home'); const away = club('team-visiting');
  return { ...(home && { home }), ...(away && { away }) };
}

const ELH_GROUPS: [heading: string, title: string, pos: string][] = [['Útočníci', 'Útočníci', 'Ú'], ['Obránci', 'Obránci', 'O'], ['Brankáři', 'Brankáři', 'B']];

/** Soupiska klubu (stránka /soupiska): tabulky pod nadpisy Brankáři / Obránci / Útočníci. Chybí-li kterákoli skupina → [] (nespolehlivé). */
export function parseElhRoster(html: string): LineupGroup[] {
  const $ = cheerio.load(html);
  const groups: LineupGroup[] = [];
  for (const [heading, title, pos] of ELH_GROUPS) {
    const h = $('h1,h2,h3,h4').filter((_, e) => norm($(e).text()) === heading).first();
    const table = h.nextAll('table').first();
    const heads = table.find('thead th').map((_, th) => norm($(th).text()).toLowerCase()).get();
    if (!h.length || heads[0] !== '#' || heads[1] !== 'hráč') return [];
    const players: LineupPlayer[] = [];
    table.find('tbody tr').each((_, tr) => {
      const tds = $(tr).children('td');
      const num = norm($(tds[0]).text());
      const name = norm($(tds[1]).text());
      if (!name) return;
      players.push({ name, ...(/^\d{1,2}$/.test(num) && { number: num }), pos });
    });
    if (!players.length) return [];
    groups.push({ title, players: players.sort((a, b) => Number(a.number ?? 999) - Number(b.number ?? 999)) });
  }
  return groups;
}

// ---------- NBL (nbl.basketball) ----------

/** Odkazy na stránky týmů z tabulky: id týmu (`cz-basket:<slug jména>`) → '/tym/<slug>'. */
export function parseNblTeamLinks(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const out = new Map<string, string>();
  $('a[href*="/tym/"]').each((_, a) => {
    const path = ($(a).attr('href') ?? '').split('?')[0].replace(/^https?:\/\/(www\.)?nbl\.basketball/, '');
    const name = norm($(a).text());
    if (!/^\/tym\/[a-z0-9-]+$/.test(path) || !name) return;
    const id = `cz-basket:${slugify(name)}`;
    if (!out.has(id)) out.set(id, path);
    const bySlug = `cz-basket:${path.slice(5)}`;
    if (!out.has(bySlug)) out.set(bySlug, path);
  });
  return out;
}

export interface Leader { name: string; value: number }
export interface NblLeaders { points?: Leader; rebounds?: Leader; assists?: Leader; val?: Leader }

const POST: Record<string, [group: string, pos: string]> = {
  1: ['Rozehrávači', 'PG'], 2: ['Křídla', 'SG'], 3: ['Křídla', 'SF'], 4: ['Pivoti', 'PF'], 5: ['Pivoti', 'C'],
};
const NBL_ORDER = ['Rozehrávači', 'Křídla', 'Pivoti', 'Ostatní'];

/** Stránka týmu: soupiska (číslo | jméno a příjmení | post) a průměrné statistiky hráčů (B, DC, AS, VAL). */
export function parseNblRoster(html: string): { groups: LineupGroup[]; leaders: NblLeaders } {
  const $ = cheerio.load(html);
  const tables = $('table').toArray().map((t) => ({ t, heads: $(t).find('thead th').map((_, th) => norm($(th).text()).toLowerCase()).get() }));
  const by = new Map<string, LineupPlayer[]>();
  const roster = tables.find((x) => x.heads[0] === 'číslo' && x.heads[1] === 'jméno a příjmení' && x.heads[2] === 'post');
  if (roster) {
    $(roster.t).find('tbody tr').each((_, tr) => {
      const tds = $(tr).children('td');
      const num = norm($(tds[0]).text());
      const name = norm($(tds[1]).text());
      const post = /^([1-5])/.exec(norm($(tds[2]).text()))?.[1];
      if (!name) return;
      const [group, pos] = post ? POST[post] : ['Ostatní', ''];
      const list = by.get(group) ?? by.set(group, []).get(group)!;
      list.push({ name, ...(/^\d{1,2}$/.test(num) && { number: num }), ...(pos && { pos }) });
    });
  }
  const groups = NBL_ORDER.filter((g) => by.has(g)).map((title) => ({ title, players: by.get(title)!.sort((a, b) => Number(a.number ?? 999) - Number(b.number ?? 999)) }));
  const leaders: NblLeaders = {};
  const st = tables.find((x) => x.heads[1] === 'hráč' && ['b', 'dc', 'as', 'val'].every((k) => x.heads.includes(k)));
  if (st) {
    const players = $(st.t).find('tbody tr').toArray().map((tr) => $(tr).children('td').map((_, td) => norm($(td).text())).get());
    const best = (key: string): Leader | undefined => {
      const i = st.heads.indexOf(key);
      return players.map((c) => ({ name: c[1], value: toNum(c[i]) }))
        .filter((p): p is Leader => !!p.name && isNum(p.value))
        .sort((a, b) => b.value - a.value)[0];
    };
    const set = (k: keyof NblLeaders, key: string) => { const l = best(key); if (l) leaders[k] = l; };
    set('points', 'b'); set('rebounds', 'dc'); set('assists', 'as'); set('val', 'val');
  }
  return { groups, leaders };
}

// ---------- společný detail ELH / NBL ----------

function tableBlock(match: Match, standings: StandingsTable[]): DetailStatBlock[] {
  const h = standingFor(standings, match.teams[0])?.row; const a = standingFor(standings, match.teams[1])?.row;
  if (!h || !a) return [];
  const v = (r: typeof h, k: string) => r.values[k];
  const per = (r: typeof h, i: 0 | 1) => {
    const s = parseScore(v(r, 'skore')); const z = v(r, 'z');
    return s && isNum(z) && z > 0 ? s[i] / z : undefined;
  };
  const elh = match.sport === 'cz-hockey';
  const rec = (r: typeof h) => {
    const ks = elh ? ['v', 'vp', 'pp', 'p'] : ['v', 'p'];
    return ks.every((k) => isNum(v(r, k))) ? ks.map((k) => v(r, k)).join('–') : undefined;
  };
  const ratio = (r: typeof h, k: string) => (isNum(v(r, k)) && isNum(v(r, 'z')) && (v(r, 'z') as number) > 0 ? (v(r, k) as number) / (v(r, 'z') as number) : undefined);
  const skore = (r: typeof h) => (typeof v(r, 'skore') === 'string' ? String(v(r, 'skore')) : undefined);
  const r = elh ? rows(
    numRow('Pořadí', h.pos, a.pos, (n) => `${n}.`, true),
    numRow('Body', v(h, 'b'), v(a, 'b')),
    textRow('Bilance V–VP–PP–P', rec(h), rec(a)),
    numRow('Body / zápas', ratio(h, 'b'), ratio(a, 'b'), (n) => dec(n, 2)),
    numRow('Góly vstřelené / zápas', per(h, 0), per(a, 0), (n) => dec(n, 2)),
    numRow('Góly obdržené / zápas', per(h, 1), per(a, 1), (n) => dec(n, 2), true),
    textRow('Skóre', skore(h), skore(a)),
  ) : rows(
    numRow('Pořadí', h.pos, a.pos, (n) => `${n}.`, true),
    textRow('Bilance V–P', rec(h), rec(a)),
    numRow('Úspěšnost', ratio(h, 'v'), ratio(a, 'v'), (n) => pct(n)),
    numRow('Body / zápas', per(h, 0), per(a, 0), (n) => dec(n, 1)),
    numRow('Obdržené / zápas', per(h, 1), per(a, 1), (n) => dec(n, 1), true),
    textRow('Skóre', skore(h), skore(a)),
  );
  return blockOf('Tabulka', r, 'Z aktuální tabulky soutěže.');
}

function leadersBlock(l?: { home?: NblLeaders; away?: NblLeaders }): DetailStatBlock[] {
  const cats: [keyof NblLeaders, string][] = [['points', 'Body'], ['rebounds', 'Doskoky'], ['assists', 'Asistence'], ['val', 'Hodnocení (VAL)']];
  return blockOf('Nejlepší hráči (průměr na zápas)', rows(...cats.map(([k, label]) => {
    const h = l?.home?.[k]; const a = l?.away?.[k];
    return h && a ? { label, home: `${h.name} ${dec(h.value, 1)}`, away: `${a.name} ${dec(a.value, 1)}`, homeValue: h.value, awayValue: a.value } : undefined;
  })));
}

export interface CzDetailInput {
  match: Match; standings: StandingsTable[];
  rosters: { home?: LineupGroup[]; away?: LineupGroup[] };
  leaders?: { home?: NblLeaders; away?: NblLeaders };
  now: Date;
}

export function parseCzDetail({ match, standings, rosters, leaders, now }: CzDetailInput): MatchDetail {
  const sides = sidesOf(match);
  const elh = match.sport === 'cz-hockey';
  const stats = [...tableBlock(match, standings), ...leadersBlock(leaders)];
  const notes: string[] = [];
  let lineups: MatchDetail['lineups'];
  if (sides && rosters.home?.length && rosters.away?.length) {
    lineups = { kind: 'roster',
      home: { name: sides.home.name, ...(sides.home.teamId && { teamId: sides.home.teamId }), groups: rosters.home },
      away: { name: sides.away.name, ...(sides.away.teamId && { teamId: sides.away.teamId }), groups: rosters.away } };
    notes.push(elh
      ? 'Soupiska klubu z hokej.cz – rozestavení na zápas se zveřejní krátce před zápasem.'
      : 'Soupiska klubu z nbl.basketball – sestava na zápas se zveřejní krátce před zápasem.');
  } else notes.push(elh ? ELH_NO_LINEUP : 'Sestava se zveřejní krátce před zápasem.');
  if (!stats.length) notes.push('Tabulku soutěže se nepodařilo načíst.');
  return {
    matchId: match.id, sport: match.sport, generatedAt: now.toISOString(), source: elh ? 'hokej.cz' : 'nbl.basketball',
    ...(sides && { homeName: sides.home.name, awayName: sides.away.name }),
    stats, ...(lineups && { lineups }), notes,
  };
}

const settledVal = <T>(s: PromiseSettledResult<T>) => (s.status === 'fulfilled' ? s.value : undefined);
const nonEmpty = (d: MatchDetail) => {
  if (!d.stats.length && !d.lineups) throw new Error('žádná data (tabulka ani soupisky)');
  return d;
};

export const elhDetail: DetailBuilder = async (match, ctx) => {
  const id = /^cz-hockey:(\d+)$/.exec(match.id)?.[1];
  if (!id) throw new Error(`neplatné id ${match.id}`);
  let clubs: ReturnType<typeof parseElhClubs> = {};
  try { clubs = parseElhClubs(await ctx.get.text(`https://www.hokej.cz/zapas/${id}`)); } catch { /* bez soupisek */ }
  const roster = (c?: ElhClub) => (c ? ctx.get.text(`https://www.hokej.cz${c.path}/soupiska`).then(parseElhRoster) : Promise.resolve(undefined));
  const [h, a] = await Promise.allSettled([roster(clubs.home), roster(clubs.away)]);
  return nonEmpty(parseCzDetail({ match, standings: ctx.standings, rosters: { home: settledVal(h), away: settledVal(a) }, now: ctx.now }));
};

export const nblDetail: DetailBuilder = async (match, ctx) => {
  let links = new Map<string, string>();
  try { links = parseNblTeamLinks(await ctx.get.text('https://www.nbl.basketball/tabulka')); } catch { /* bez soupisek */ }
  const team = (teamId?: string) => {
    const path = teamId ? links.get(teamId) : undefined;
    return path ? ctx.get.text(`https://www.nbl.basketball${path}`).then(parseNblRoster) : Promise.resolve(undefined);
  };
  const [h, a] = await Promise.allSettled([team(match.teams[0]), team(match.teams[1])]);
  const hv = settledVal(h); const av = settledVal(a);
  return nonEmpty(parseCzDetail({ match, standings: ctx.standings,
    rosters: { home: hv?.groups, away: av?.groups }, leaders: { home: hv?.leaders, away: av?.leaders }, now: ctx.now }));
};
