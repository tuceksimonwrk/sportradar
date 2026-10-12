import type { Match, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getJson } from '../util';

const ACTIVE = new Set(['FUT', 'PRE', 'LIVE', 'CRIT']);

interface NhlTeam { abbrev: string; placeName: { default: string }; commonName: { default: string } }
interface NhlGame { id: number; gameType: number; startTimeUTC: string; gameState: string; homeTeam: NhlTeam; awayTeam: NhlTeam }
interface NhlWeek { nextStartDate?: string; gameWeek?: { games?: NhlGame[] }[] }

const name = (t: NhlTeam) => `${t.placeName.default} ${t.commonName.default}`;
const competition = (gameType: number) => (gameType === 1 ? 'NHL (přípravné)' : gameType === 3 ? 'NHL Playoffs' : 'NHL');

export function parseNhl(json: unknown): AdapterResult {
  const week = json as NhlWeek;
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  const addTeam = (t: NhlTeam) => teams.set(`nhl:${t.abbrev}`, { id: `nhl:${t.abbrev}`, sport: 'nhl', name: name(t) });
  for (const day of week.gameWeek ?? []) {
    for (const g of day.games ?? []) {
      addTeam(g.homeTeam); addTeam(g.awayTeam);
      if (!ACTIVE.has(g.gameState)) continue;
      matches.push({
        id: `nhl:${g.id}`, sport: 'nhl', competition: competition(g.gameType),
        startsAt: new Date(g.startTimeUTC).toISOString(),
        title: `${name(g.homeTeam)} – ${name(g.awayTeam)}`,
        teams: [`nhl:${g.homeTeam.abbrev}`, `nhl:${g.awayTeam.abbrev}`], broadcasters: [],
      });
    }
  }
  return { matches, teams: [...teams.values()] };
}

export const nhlAdapter: Adapter = {
  sport: 'nhl',
  async fetch() {
    const parts: AdapterResult[] = [];
    let url = 'https://api-web.nhle.com/v1/schedule/now';
    for (let i = 0; i < 4; i++) {
      const json = await getJson<NhlWeek>(url);
      parts.push(parseNhl(json));
      if (!json.nextStartDate) break;
      url = `https://api-web.nhle.com/v1/schedule/${json.nextStartDate}`;
    }
    return combine(parts);
  },
};
