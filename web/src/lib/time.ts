const DAY_MS = 86400_000;

export function dayKey(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function formatTime(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export function dayLabel(key: string, now: Date, tz?: string): string {
  const today = dayKey(now.toISOString(), tz);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  if (key === today) return 'Dnes';
  if (key === tomorrow) return 'Zítra';
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'numeric' })
    .format(new Date(`${key}T12:00:00Z`));
}

export function formatCountdown(iso: string, now: Date): string {
  const min = Math.floor((Date.parse(iso) - now.getTime()) / 60000);
  if (min <= 0) return 'probíhá';
  if (min < 60) return `za ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `za ${h} h ${min % 60} min`;
  return `za ${Math.floor(h / 24)} d ${h % 24} h`;
}

export function isStale(generatedAt: string, now: Date): boolean {
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > 6 * 3600_000;
}

export interface CountdownParts { live: boolean; days: number; hours: number; minutes: number }

/** Odpočet rozložený na dlaždice (dny / hodiny / minuty); po začátku `live`. Stejné zaokrouhlení jako formatCountdown. */
export function countdownParts(iso: string, now: Date): CountdownParts {
  const min = Math.floor((Date.parse(iso) - now.getTime()) / 60000);
  if (!(min > 0)) return { live: true, days: 0, hours: 0, minutes: 0 };
  return { live: false, days: Math.floor(min / 1440), hours: Math.floor(min / 60) % 24, minutes: min % 60 };
}
