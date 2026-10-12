import { SPORTS, SPORT_LABELS, buildIcs, calendarFileName, calendarPath, type Match, type Sport, type Team } from '@sportradar/shared';

export interface FeedInfo { id: string; label: string; path: string; sport: Sport }

/** Absolutní https URL feedu (`cal/x.ics` v adresáři `data/`) odvozená od adresy stránky; http/localhost se vynutí na https. */
export function feedUrl(path: string, pageHref: string): string {
  const u = new URL(`data/${path}`, pageHref);
  u.protocol = 'https:';
  return u.href;
}

/** `webcal://` odkaz z http(s) URL (jen výměna protokolu). */
export function webcalUrl(httpUrl: string): string {
  return httpUrl.replace(/^https?:/i, 'webcal:');
}

/** Oblíbené (id sportu nebo týmu) → odebíratelné feedy se štítkem; neznámé týmy se přeskočí. */
export function favoriteFeeds(favs: string[], teams: Team[]): FeedInfo[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const out: FeedInfo[] = [];
  for (const id of new Set(favs)) {
    if ((SPORTS as string[]).includes(id)) out.push({ id, label: SPORT_LABELS[id as Sport], path: calendarPath(id), sport: id as Sport });
    else { const t = byId.get(id); if (t) out.push({ id, label: t.name, path: calendarPath(id), sport: t.sport }); }
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

export function downloadMatch(match: Match): void {
  downloadIcs(`${calendarFileName(match.id)}.ics`, buildIcs([match], {
    calName: `Sportradar – ${match.title}`, now: new Date(), siteUrl: location.origin + location.pathname,
  }));
}

export function downloadMatches(matches: Match[]): void {
  downloadIcs('sportradar-oblibene.ics', buildIcs(matches, {
    calName: 'Sportradar – moje oblíbené', now: new Date(), siteUrl: location.origin + location.pathname,
  }));
}
