import type { Match, Team, Venue } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getJson } from '../util';

interface EspnTeam { abbreviation: string; displayName: string }
interface EspnEvent {
  id: string; date: string; status?: { type?: { state?: string } }; season?: { type?: number };
  competitions?: { venue?: { fullName?: string; address?: { city?: string } }; competitors?: { homeAway: string; team: EspnTeam }[] }[];
}

export function parseNba(json: unknown): AdapterResult {
  const events = ((json as any)?.events ?? []) as EspnEvent[];
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  for (const e of events) {
    const comps = e.competitions?.[0]?.competitors ?? [];
    const home = comps.find((c) => c.homeAway === 'home')?.team;
    const away = comps.find((c) => c.homeAway === 'away')?.team;
    if (!home || !away) continue;
    for (const t of [home, away]) teams.set(`nba:${t.abbreviation}`, { id: `nba:${t.abbreviation}`, sport: 'nba', name: t.displayName });
    const state = e.status?.type?.state;
    if (state !== 'pre' && state !== 'in') continue;
    const v = e.competitions?.[0]?.venue;
    const vName = v?.fullName?.trim();
    const venue: Venue | undefined = vName ? (v?.address?.city ? { name: vName, city: v.address.city } : { name: vName }) : undefined;
    const startsAt = new Date(e.date);
    if (Number.isNaN(startsAt.getTime())) continue;
    matches.push({
      id: `nba:${e.id}`, sport: 'nba',
      competition: e.season?.type === 1 ? 'NBA (přípravné)' : e.season?.type === 3 ? 'NBA Playoffs' : 'NBA',
      startsAt: startsAt.toISOString(), title: `${home.displayName} – ${away.displayName}`,
      teams: [`nba:${home.abbreviation}`, `nba:${away.abbreviation}`], broadcasters: [],
      ...(venue && { venue }),
    });
  }
  return { matches, teams: [...teams.values()] };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

/** ESPN `dates=` používá americká (východní) data, proto začínáme o den dříve než UTC dnes. */
export function nbaDateRange(now: Date): string[] {
  return Array.from({ length: 15 }, (_, i) => ymd(new Date(now.getTime() + (i - 1) * 86400_000)));
}

export const nbaAdapter = {
  sport: 'nba' as const,
  async fetch(now, get: (url: string) => Promise<unknown> = getJson) {
    const settled = await Promise.allSettled(nbaDateRange(now).map((d) =>
      get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}`)));
    const bad = settled.filter((s) => s.status === 'rejected');
    if (bad.length > 0) throw new Error(`NBA: selhalo ${bad.length} z ${settled.length} dnů (${(bad[0] as PromiseRejectedResult).reason?.message ?? bad[0]})`);
    return combine(settled.map((s) => parseNba((s as PromiseFulfilledResult<unknown>).value)));
  },
} satisfies Adapter;
