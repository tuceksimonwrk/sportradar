import type { Match, StandingsTable, Team } from '@sportradar/shared';
import type { Dataset } from './merge';
import { slugify } from './util';

/**
 * Jednotná identita českých klubů: kanonické id je `football:cz_<slug>` z chanceliga.cz; tentýž klub z ESPN
 * (Liga mistrů, `football:<id ESPN>`, anglický název „Slavia Prague“) se na něj přemapuje.
 */

const PREFIX = /^(?:1-)?(?:sk|fc|fk|ac|afc|mfk|bk|tj|sfc|cf)-(?=.)/;
const EXONYMS: [RegExp, string][] = [[/(^|-)(prague|prag)(?=-|$)/g, '$1praha']];

/** Klíč pro porovnání jmen: slug, exonyma (Prague/Prag → Praha), bez klubové zkratky na začátku (SK, FC, 1. FC…). */
export function clubKey(name: string): string {
  let s = slugify(name);
  for (const [re, to] of EXONYMS) s = s.replace(re, to);
  return s.replace(PREFIX, '');
}

/**
 * Známé odlišnosti jmen ESPN → klíč oficiálního názvu na chanceliga.cz (clubKey). Úmyslně NEobsahuje holé
 * „Bohemians“ – na ESPN je to Bohemian FC z Dublinu.
 */
export const CLUB_ALIASES: Record<string, string> = {
  'bohemians-1905': 'bohemians-praha-1905',
  'bohemians-praha': 'bohemians-praha-1905',
};

/** Soutěže, jejichž kluby nikdy nejsou české (nemapujeme je, i kdyby se jméno shodovalo). */
const FOREIGN_LEAGUES = new Set(['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1']);
const isCzech = (t: Team) => t.sport === 'football' && t.id.startsWith('football:cz_');

/**
 * ESPN id → český klub. Shoda: alias, nebo rovnost clubKey; český protějšek musí být jednoznačný.
 * Záměrně bez „obsažení slova“ (např. „Bohemians“ ⊂ „Bohemians Praha 1905“ by spojilo irský a český klub).
 */
export function czechClubAliases(teams: Team[]): Map<string, Team> {
  const czech = teams.filter(isCzech);
  const out = new Map<string, Team>();
  if (!czech.length) return out;
  for (const t of teams) {
    if (t.sport !== 'football' || isCzech(t) || (t.league && FOREIGN_LEAGUES.has(t.league))) continue;
    const k = clubKey(t.name);
    const target = CLUB_ALIASES[k] ?? k;
    const hits = czech.filter((c) => clubKey(c.name) === target);
    if (hits.length === 1) out.set(t.id, hits[0]);
  }
  return out;
}

export interface UnifiedClub { from: string; to: string; espnName: string; name: string }

/**
 * Přemapuje ESPN id českých klubů na id z chanceliga.cz ve fotbalových zápasech (teams[]), týmech (jeden záznam:
 * český název, league cze.1, logo z webu ligy, jinak ESPN) a fotbalových tabulkách (teamId + název řádku).
 * Běží nad sloučenými daty, takže pokryje i zápasy převzaté z minula. Detaily se staví z výsledku (teams/tabulky).
 */
export function unifyFootballClubs(ds: Dataset, tables: StandingsTable[]): Dataset & { tables: StandingsTable[]; unified: UnifiedClub[] } {
  const aliases = czechClubAliases(ds.teams);
  if (!aliases.size) return { ...ds, tables, unified: [] };
  const map = (id: string) => aliases.get(id)?.id ?? id;
  const matches: Match[] = ds.matches.map((m) => (m.sport === 'football' && m.teams.some((id) => aliases.has(id)) ? { ...m, teams: m.teams.map(map) } : m));
  const byId = new Map(ds.teams.map((t) => [t.id, t]));
  const teams = ds.teams.filter((t) => !aliases.has(t.id)).map((t) => {
    if (!isCzech(t) || t.logo) return t;
    const espnLogo = [...aliases].find(([from, c]) => c.id === t.id && byId.get(from)?.logo)?.[0];
    return espnLogo ? { ...t, logo: byId.get(espnLogo)!.logo } : t;
  });
  const out = tables.map((tb) => (tb.sport !== 'football' ? tb : {
    ...tb, rows: tb.rows.map((r) => {
      const c = r.teamId ? aliases.get(r.teamId) : undefined;
      return c ? { ...r, teamId: c.id, name: c.name } : r;
    }),
  }));
  const unified = [...aliases].map(([from, c]) => ({ from, to: c.id, espnName: byId.get(from)?.name ?? from, name: c.name }));
  return { matches, teams, tables: out, unified };
}
