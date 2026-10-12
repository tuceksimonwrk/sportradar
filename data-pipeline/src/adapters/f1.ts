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

const RESULT_WINDOW_MS = 14 * 86400_000;
const RACE_ID = /^f1:[0-9]+-([0-9]+)-Race$/;

/** Kola, jejichž závod začal v posledních 14 dnech (pro ně chceme podium). */
export function f1RacesNeedingPodium(matches: Match[], now: Date): string[] {
  const rounds = new Set<string>();
  for (const m of matches) {
    const round = RACE_ID.exec(m.id)?.[1];
    const t = Date.parse(m.startsAt);
    if (round && t <= now.getTime() && t >= now.getTime() - RESULT_WINDOW_MS) rounds.add(round);
  }
  return [...rounds];
}

function podiumOf(json: unknown): { pos: number; name: string }[] {
  const results = (json as any)?.MRData?.RaceTable?.Races?.[0]?.Results;
  if (!Array.isArray(results)) return [];
  const out: { pos: number; name: string }[] = [];
  for (const r of results.slice(0, 3)) {
    const pos = Number(r?.position);
    const name = [r?.Driver?.givenName, r?.Driver?.familyName].filter((x) => typeof x === 'string' && x.trim()).join(' ');
    if (!Number.isFinite(pos) || !name) return [];
    out.push({ pos, name });
  }
  return out;
}

/** Závodním relacím kol z `resultsByRound` doplní podium (první tři). */
export function attachF1Podium(matches: Match[], resultsByRound: Record<string, unknown>): Match[] {
  return matches.map((m) => {
    const round = RACE_ID.exec(m.id)?.[1];
    if (!round || !(round in resultsByRound)) return m;
    const podium = podiumOf(resultsByRound[round]);
    return podium.length ? { ...m, result: { podium } } : m;
  });
}

export const f1Adapter = {
  sport: 'f1' as const,
  async fetch(now, get: (url: string) => Promise<unknown> = getJson) {
    const base = parseF1(await get('https://api.jolpi.ca/ergast/f1/current.json'));
    const rounds = f1RacesNeedingPodium(base.matches, now);
    const settled = await Promise.allSettled(rounds.map((r) => get(`https://api.jolpi.ca/ergast/f1/current/${r}/results.json`)));
    const byRound: Record<string, unknown> = {};
    settled.forEach((s, i) => { if (s.status === 'fulfilled') byRound[rounds[i]] = s.value; });
    return { matches: attachF1Podium(base.matches, byRound), teams: base.teams };
  },
} satisfies Adapter;
