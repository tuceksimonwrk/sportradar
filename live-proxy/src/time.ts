/** 'YYYY-MM-DD' dne v dané časové zóně. */
export function zonedDay(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

/** Hodina (0–23) v dané zóně. */
export function zonedHour(ts: number, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(ts)));
}

function pragueOffsetMs(ts: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Prague', hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ts;
}

/** „Nástěnný“ čas v Praze → ISO UTC (zvládá přechody DST). */
export function pragueToUtcIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let ts = wall;
  for (let i = 0; i < 2; i++) ts = wall - pragueOffsetMs(ts);
  return new Date(ts).toISOString();
}

/** Platné datum 'YYYY-MM-DD' (jen číslice, reálný den). */
export function isIsoDay(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** Den posunutý o `delta` dní. */
export function shiftDay(day: string, delta: number): string {
  const t = Date.parse(`${day}T12:00:00Z`) + delta * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 'MM:SS' → 'M:SS' (bez úvodní nuly). */
export function trimClock(s: string): string {
  return s.replace(/^0(\d:)/, '$1');
}
