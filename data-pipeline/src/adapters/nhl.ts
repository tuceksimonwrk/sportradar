import type { Match, Team, Venue } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getJson } from '../util';

const ACTIVE = new Set(['FUT', 'PRE', 'LIVE', 'CRIT']);
const FINISHED = new Set(['OFF', 'FINAL']);
const RESULT_WINDOW_MS = 14 * 86400_000;

interface NhlTeam { abbrev: string; score?: number; placeName: { default: string }; commonName: { default: string } }
interface NhlGame { id: number; gameType: number; startTimeUTC: string; gameState: string; gameOutcome?: { lastPeriodType?: string }; venue?: { default?: string }; homeTeam: NhlTeam; awayTeam: NhlTeam }
interface NhlWeek { nextStartDate?: string; previousStartDate?: string; gameWeek?: { games?: NhlGame[] }[] }

const name = (t: NhlTeam) => `${t.placeName.default} ${t.commonName.default}`;
const venueOf = (g: NhlGame): Venue | undefined => {
  const n = g.venue?.default?.trim();
  if (!n) return undefined;
  const city = g.homeTeam.placeName?.default;
  return city ? { name: n, city } : { name: n };
};
const competition = (gameType: number) => (gameType === 1 ? 'NHL (přípravné)' : gameType === 3 ? 'NHL Playoffs' : 'NHL');

export function parseNhl(json: unknown, now: Date): AdapterResult {
  const week = json as NhlWeek;
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  const addTeam = (t: NhlTeam) => teams.set(`nhl:${t.abbrev}`, { id: `nhl:${t.abbrev}`, sport: 'nhl', name: name(t) });
  for (const day of week.gameWeek ?? []) {
    for (const g of day.games ?? []) {
      addTeam(g.homeTeam); addTeam(g.awayTeam);
      const finished = FINISHED.has(g.gameState);
      if (!finished && !ACTIVE.has(g.gameState)) continue;
      const startsAt = new Date(g.startTimeUTC).toISOString();
      const venue = venueOf(g);
      if (finished) {
        const [hs, as] = [g.homeTeam.score, g.awayTeam.score];
        if (typeof hs !== 'number' || typeof as !== 'number' || !Number.isFinite(hs) || !Number.isFinite(as)) continue;
        if (Date.parse(startsAt) < now.getTime() - RESULT_WINDOW_MS) continue;
        const p = g.gameOutcome?.lastPeriodType;
        matches.push({
          id: `nhl:${g.id}`, sport: 'nhl', competition: competition(g.gameType), startsAt,
          title: `${name(g.homeTeam)} – ${name(g.awayTeam)}`,
          teams: [`nhl:${g.homeTeam.abbrev}`, `nhl:${g.awayTeam.abbrev}`], broadcasters: [],
          ...(venue && { venue }),
          result: { home: hs, away: as, homeName: name(g.homeTeam), awayName: name(g.awayTeam),
            ...(p === 'OT' ? { note: 'po prodloužení' } : p === 'SO' ? { note: 'po nájezdech' } : {}) },
        });
        continue;
      }
      matches.push({
        id: `nhl:${g.id}`, sport: 'nhl', competition: competition(g.gameType),
        startsAt,
        title: `${name(g.homeTeam)} – ${name(g.awayTeam)}`,
        teams: [`nhl:${g.homeTeam.abbrev}`, `nhl:${g.awayTeam.abbrev}`], broadcasters: [],
        ...(venue && { venue }),
      });
    }
  }
  return { matches, teams: [...teams.values()] };
}

export const nhlAdapter = {
  sport: 'nhl' as const,
  async fetch(now, get: (url: string) => Promise<unknown> = getJson) {
    const parts: AdapterResult[] = [];
    const week = (d: string) => `https://api-web.nhle.com/v1/schedule/${d}`;
    let url = week('now');
    let prevDate: string | undefined;
    for (let i = 0; i < 4; i++) {
      const json = (await get(url)) as NhlWeek;
      parts.push(parseNhl(json, now));
      if (i === 0) prevDate = json.previousStartDate;
      if (!json.nextStartDate) break;
      url = week(json.nextStartDate);
    }
    for (let i = 0; i < 2 && prevDate; i++) {
      let json: NhlWeek;
      try { json = (await get(week(prevDate))) as NhlWeek; } catch { break; } // minulé týdny jsou nepovinné
      parts.push(parseNhl(json, now));
      prevDate = json.previousStartDate;
    }
    return combine(parts);
  },
} satisfies Adapter;
