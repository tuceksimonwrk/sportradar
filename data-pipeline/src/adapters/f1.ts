import type { Match, Venue } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { getJson } from '../util';

interface Slot { date?: string; time?: string }
type Race = { season: string; round: string; raceName: string; date?: string; time?: string } & Record<string, unknown>;

const SESSIONS: [key: string, label: string][] = [
  ['FirstPractice', '1. trénink'], ['SecondPractice', '2. trénink'], ['ThirdPractice', '3. trénink'],
  ['SprintQualifying', 'Sprint kvalifikace'], ['Sprint', 'Sprint'], ['Qualifying', 'Kvalifikace'],
];

function toIso(s?: Slot): string | null {
  if (!s?.date || !s.time) return null;
  const t = Date.parse(`${s.date}T${s.time.endsWith('Z') ? s.time : `${s.time}Z`}`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function parseF1(json: unknown): AdapterResult {
  const races = ((json as any)?.MRData?.RaceTable?.Races ?? []) as Race[];
  const matches: Match[] = [];
  for (const race of races) {
    const c = (race as any).Circuit;
    const vName = typeof c?.circuitName === 'string' ? c.circuitName.trim() : '';
    const locality = c?.Location?.locality;
    const venue: Venue | undefined = vName ? (locality ? { name: vName, city: locality } : { name: vName }) : undefined;
    const slots: [string, string, Slot | undefined][] = [
      ...SESSIONS.map(([k, label]) => [k, label, race[k] as Slot | undefined] as [string, string, Slot | undefined]),
      ['Race', 'Závod', { date: race.date, time: race.time }],
    ];
    for (const [key, label, slot] of slots) {
      const startsAt = toIso(slot);
      if (!startsAt) continue;
      matches.push({
        id: `f1:${race.season}-${race.round}-${key}`, sport: 'f1', competition: 'Formule 1',
        startsAt, title: `${race.raceName} – ${label}`, teams: [], broadcasters: [],
        ...(venue && { venue }),
      });
    }
  }
  matches.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { matches, teams: [] };
}

export const f1Adapter: Adapter = {
  sport: 'f1',
  async fetch() {
    return parseF1(await getJson('https://api.jolpi.ca/ergast/f1/current.json'));
  },
};
