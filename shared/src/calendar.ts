import type { Match } from './index';

/** Upozornění před začátkem zápasu (minuty). */
export const REMINDER_MINUTES = 60;

/**
 * Název souboru kalendáře BEZ přípony (`.ics` přidávají volající, viz `calendarPath`).
 * Každý znak mimo [A-Za-z0-9._-] (i ':') se nahradí '_': 'nhl:PIT' → 'nhl_PIT'.
 */
export function calendarFileName(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_');
}

/** Cesta feedu relativně k adresáři `data/`: `cal/<calendarFileName(id)>.ics`. */
export function calendarPath(id: string): string {
  return `cal/${calendarFileName(id)}.ics`;
}

/** Odhad délky zápasu / sezení v minutách (id F1 vypadá `f1:2026-5-Race`). */
export function matchDurationMinutes(match: Pick<Match, 'id' | 'sport'>): number {
  switch (match.sport) {
    case 'f1': return /-Race$/.test(match.id) ? 120 : 60;
    case 'cz-basket': return 120;
    default: return 150; // nhl, nba, cz-hockey
  }
}

export interface IcsOptions { calName: string; now: Date; siteUrl?: string; reminderMinutes?: number }

const enc = new TextEncoder();

/** Escapování TEXT hodnoty podle RFC 5545 (zpětné lomítko, středník, čárka, nové řádky). */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Složí řádek na max. 75 oktetů (UTF-8, znak se nikdy nerozdělí); pokračování začínají mezerou. Vrací řádky bez CRLF. */
export function foldLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = ' '; bytes = 1; limit = 75;
    }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** `YYYYMMDDTHHMMSSZ` v UTC. */
export function icsUtc(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function eventLines(m: Match, stamp: string, siteUrl: string | undefined, reminder: number): string[] | null {
  const start = new Date(m.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + matchDurationMinutes(m) * 60_000);
  const venue = [m.venue?.name?.trim(), m.venue?.city?.trim()].filter(Boolean).join(', ');
  const desc = [m.competition];
  if (m.broadcasters.length) desc.push(`Kde sledovat: ${m.broadcasters.map((b) => b.name).join(', ')}`);
  if (siteUrl) desc.push(siteUrl);
  const l = [
    'BEGIN:VEVENT',
    `UID:${m.id}@sportradar`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${escapeIcsText(m.title)}`,
  ];
  if (venue) l.push(`LOCATION:${escapeIcsText(venue)}`);
  l.push(
    `DESCRIPTION:${escapeIcsText(desc.join('\n'))}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`${m.title} začíná za ${reminder === 60 ? '1 hodinu' : `${reminder} min`}`)}`,
    `TRIGGER:-PT${reminder}M`,
    'END:VALARM',
    'END:VEVENT',
  );
  return l;
}

/** iCalendar (RFC 5545) se zápasy; CRLF, složené řádky, každý zápas s VALARM. Prázdný seznam → platný kalendář bez událostí. */
export function buildIcs(matches: Match[], opts: IcsOptions): string {
  const reminder = opts.reminderMinutes ?? REMINDER_MINUTES;
  const stamp = icsUtc(opts.now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sportradar//CS//',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(opts.calName)}`,
    'X-WR-TIMEZONE:UTC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const m of matches) {
    const ev = eventLines(m, stamp, opts.siteUrl, reminder);
    if (ev) lines.push(...ev);
  }
  lines.push('END:VCALENDAR');
  return lines.flatMap(foldLine).join('\r\n') + '\r\n';
}
