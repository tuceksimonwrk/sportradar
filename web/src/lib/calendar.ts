import { SPORTS, SPORT_LABELS, buildIcs, calendarFileName, competitionById, parseLeagueFavorite, type Match, type Sport, type Team } from '@sportradar/shared';

export interface FeedInfo { id: string; label: string; file: string; sport: Sport }

/** Absolutní https URL feedu `data/cal/<minuty>/<soubor>` odvozená od adresy stránky; http/localhost se vynutí na https. */
export function feedUrl(file: string, minutes: number, pageHref: string): string {
  const u = new URL(`data/cal/${minutes}/${file}`, pageHref);
  u.protocol = 'https:';
  return u.href;
}

/** `webcal://` odkaz z http(s) URL (jen výměna protokolu). */
export function webcalUrl(httpUrl: string): string {
  return httpUrl.replace(/^https?:/i, 'webcal:');
}

/** Oblíbené (id sportu, soutěže nebo týmu) → odebíratelné feedy se štítkem; neznámé týmy se přeskočí. */
export function favoriteFeeds(favs: string[], teams: Team[]): FeedInfo[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const out: FeedInfo[] = [];
  for (const id of new Set(favs)) {
    const comp = competitionById(parseLeagueFavorite(id));
    if ((SPORTS as string[]).includes(id)) out.push({ id, label: SPORT_LABELS[id as Sport], file: `${calendarFileName(id)}.ics`, sport: id as Sport });
    else if (comp) out.push({ id, label: `${comp.name} (${comp.country})`, file: `${calendarFileName(id)}.ics`, sport: comp.sport });
    else { const t = byId.get(id); if (t) out.push({ id, label: t.name, file: `${calendarFileName(id)}.ics`, sport: t.sport }); }
  }
  return out;
}

/** Spustí stažení textového souboru .ics (Blob + dočasný odkaz; URL se po kliknutí uvolní). */
export function downloadIcs(filename: string, ics: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadMatch(match: Match, minutes: number): void {
  downloadIcs(`${calendarFileName(match.id)}.ics`, buildIcs([match], {
    calName: `Sportradar – ${match.title}`, now: new Date(), reminderMinutes: minutes, siteUrl: location.origin + location.pathname,
  }));
}

export function downloadMatches(matches: Match[], minutes: number): void {
  downloadIcs('sportradar-oblibene.ics', buildIcs(matches, {
    calName: 'Sportradar – moje oblíbené', now: new Date(), reminderMinutes: minutes, siteUrl: location.origin + location.pathname,
  }));
}
