import type { AdapterResult } from './types';

export const UA = 'sportradar-personal/1.0 (osobni agregator rozvrhu; max 1x/hod)';

export async function getText(url: string, f: typeof fetch = fetch): Promise<string> {
  const r = await f(url, { headers: { 'user-agent': UA, accept: '*/*' } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.text();
}

export async function getJson<T = unknown>(url: string, f: typeof fetch = fetch): Promise<T> {
  return JSON.parse(await getText(url, f)) as T;
}

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function pragueOffsetMs(ts: number): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Prague', hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ts;
}

/** Převede „nástěnný“ čas v Praze na ISO UTC (zvládá přechody DST). */
export function pragueToUtcIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let ts = wall;
  for (let i = 0; i < 2; i++) ts = wall - pragueOffsetMs(ts);
  return new Date(ts).toISOString();
}

export function combine(results: AdapterResult[]): AdapterResult {
  const matches = new Map<string, AdapterResult['matches'][number]>();
  const teams = new Map<string, AdapterResult['teams'][number]>();
  for (const r of results) {
    for (const m of r.matches) if (!matches.has(m.id)) matches.set(m.id, m);
    for (const t of r.teams) if (!teams.has(t.id)) teams.set(t.id, t);
  }
  return { matches: [...matches.values()], teams: [...teams.values()] };
}

const CLUB_PREFIX = /^(hc|bk|hk|sk|fk|bc)-(?=.)/;
const stripPrefix = (slug: string) => slug.replace(CLUB_PREFIX, '');
const hasWords = (long: string, short: string) => `-${long}-`.includes(`-${short}-`);

/** Najde id týmu podle jména: přesná shoda slugu → shoda bez klubového prefixu (hc-, bk-…) → jednoznačné slovní obsažení. */
export function matchTeamId(name: string, teams: { id: string; name: string }[]): string | undefined {
  const key = slugify(name);
  if (!key) return undefined;
  const slugs = teams.map((t) => ({ id: t.id, slug: slugify(t.name) })).filter((t) => t.slug);
  const exact = slugs.find((t) => t.slug === key);
  if (exact) return exact.id;
  const k = stripPrefix(key);
  const bare = slugs.filter((t) => stripPrefix(t.slug) === k);
  if (bare.length === 1) return bare[0].id;
  if (bare.length > 1) return undefined;
  const contained = slugs.filter((t) => {
    const s = stripPrefix(t.slug);
    return s.length >= k.length ? hasWords(s, k) : hasWords(k, s);
  });
  return contained.length === 1 ? contained[0].id : undefined;
}
