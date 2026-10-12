import type { Match, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getJson } from '../util';

interface EspnTeam { abbreviation: string; displayName: string }
interface EspnEvent {
  id: string; date: string; status?: { type?: { state?: string } }; season?: { type?: number };
  competitions?: { competitors?: { homeAway: string; team: EspnTeam }[] }[];
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
    const startsAt = new Date(e.date);
    if (Number.isNaN(startsAt.getTime())) continue;
    matches.push({
      id: `nba:${e.id}`, sport: 'nba',
      competition: e.season?.type === 1 ? 'NBA (přípravné)' : e.season?.type === 3 ? 'NBA Playoffs' : 'NBA',
      startsAt: startsAt.toISOString(), title: `${home.displayName} – ${away.displayName}`,
      teams: [`nba:${home.abbreviation}`, `nba:${away.abbreviation}`], broadcasters: [],
    });
  }
  return { matches, teams: [...teams.values()] };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');

export const nbaAdapter: Adapter = {
  sport: 'nba',
  async fetch(now) {
    const days = Array.from({ length: 14 }, (_, i) => ymd(new Date(now.getTime() + i * 86400_000)));
    const settled = await Promise.allSettled(days.map((d) =>
      getJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${d}`)));
    const ok = settled.filter((s): s is PromiseFulfilledResult<unknown> => s.status === 'fulfilled');
    if (ok.length === 0) throw new Error('NBA: všechny dny selhaly');
    return combine(ok.map((s) => parseNba(s.value)));
  },
};
