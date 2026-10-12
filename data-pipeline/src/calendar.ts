import { SPORTS, SPORT_LABELS, buildIcs, calendarFileName, type Match, type Team } from '@sportradar/shared';

const KEEP_AFTER_START_MS = 3 * 3600_000;

/**
 * Kalendářové feedy (iCalendar): jeden soubor na každý tým s nadcházejícím zápasem a jeden na každý sport.
 * Klíč mapy = název souboru včetně přípony (`nhl_PIT.ics`), hodnota = obsah; zapisuje se do `web/public/data/cal/`.
 * Zahrnuje jen zápasy bez výsledku a se startem ≥ now − 3 h.
 */
export function buildCalendarFiles(matches: Match[], teams: Team[], now: Date, siteUrl?: string): Map<string, string> {
  const cutoff = now.getTime() - KEEP_AFTER_START_MS;
  const upcoming = matches
    .filter((m) => !m.result && Date.parse(m.startsAt) >= cutoff)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
  const names = new Map(teams.map((t) => [t.id, t.name]));
  const out = new Map<string, string>();
  const build = (list: Match[], calName: string) => buildIcs(list, { calName: `Sportradar – ${calName}`, now, siteUrl });

  const byTeam = new Map<string, Match[]>();
  for (const m of upcoming) for (const id of new Set(m.teams)) (byTeam.get(id) ?? byTeam.set(id, []).get(id)!).push(m);
  for (const [id, list] of byTeam) out.set(`${calendarFileName(id)}.ics`, build(list, names.get(id) ?? id));
  for (const sport of SPORTS) out.set(`${calendarFileName(sport)}.ics`, build(upcoming.filter((m) => m.sport === sport), SPORT_LABELS[sport]));
  return out;
}
