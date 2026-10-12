import { COMPETITIONS, leagueFavoriteId, type Competition, type Team } from '@sportradar/shared';

const CL = 'uefa.champions';
/** Soutěže s vlastními kluby (domácí ligy); kluby bez nich patří do bloku Ligy mistrů. */
const DOMESTIC = new Set(COMPETITIONS.filter((c) => c.sport === 'football' && c.id !== CL).map((c) => c.id));

/** Hledaný text bez diakritiky, malými písmeny, oříznutý. */
export function normalizeQuery(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').trim();
}

/** Obsahuje název hledaný text (už normalizovaný přes normalizeQuery)? Prázdný text odpovídá všemu. */
export function matchesQuery(name: string, needle: string): boolean {
  return !needle || normalizeQuery(name).includes(needle);
}

export interface FootballBlock {
  comp: Competition;
  clubs: Team[];       // kluby bloku po vyhledávání, abecedně
  visible: boolean;    // při hledání se blok bez shody skryje
  favCount: number;    // oblíbená soutěž + oblíbené kluby bloku (bez ohledu na hledání)
}

/**
 * Oblíbené → fotbal po soutěžích: každý klub právě jednou podle `Team.league`;
 * kluby bez domácí ligy (jen Liga mistrů, neznámá liga) jdou do bloku Ligy mistrů („Ostatní kluby“).
 * Shoda hledání s názvem / zkratkou / zemí soutěže ukáže celý blok.
 */
export function footballBlocks(teams: Team[], query: string, favs: readonly string[]): FootballBlock[] {
  const needle = normalizeQuery(query);
  const fav = new Set(favs);
  const byComp = new Map<string, Team[]>();
  for (const t of teams) {
    if (t.sport !== 'football') continue;
    const key = t.league && DOMESTIC.has(t.league) ? t.league : CL;
    (byComp.get(key) ?? byComp.set(key, []).get(key)!).push(t);
  }
  return COMPETITIONS.filter((c) => c.sport === 'football').map((comp) => {
    const all = (byComp.get(comp.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    const compMatch = !!needle && [comp.name, comp.short, comp.country].some((s) => matchesQuery(s, needle));
    const clubs = compMatch ? all : all.filter((t) => matchesQuery(t.name, needle));
    const favCount = (fav.has(leagueFavoriteId(comp.id)) ? 1 : 0) + all.filter((t) => fav.has(t.id)).length;
    return { comp, clubs, visible: !needle || compMatch || clubs.length > 0, favCount };
  });
}

/** Je blok rozbalený? Hledání → ano; ruční volba; jinak s oblíbenými ano, bez nich jen mimo mobil. */
export function blockOpen(o: { searching: boolean; favCount: number; compact: boolean; override?: boolean }): boolean {
  if (o.searching) return true;
  if (o.override !== undefined) return o.override;
  return o.favCount > 0 || !o.compact;
}
