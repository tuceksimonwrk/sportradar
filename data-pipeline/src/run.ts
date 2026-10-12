import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { MatchesFile, Sport, TeamsFile } from '@sportradar/shared';
import { applyBroadcasters, parseBroadcasters } from './broadcasters';
import { mergeDatasets, type Dataset, type SportOutcome } from './merge';
import type { Adapter } from './types';
import { f1Adapter } from './adapters/f1';
import { nhlAdapter } from './adapters/nhl';
import { nbaAdapter } from './adapters/nba';
import { elhAdapter } from './adapters/elh';
import { nblAdapter } from './adapters/nbl';
import { getJson } from './util';

const OUT = new URL('../../web/public/data/', import.meta.url);
const adapters: Adapter[] = [f1Adapter, nhlAdapter, nbaAdapter, elhAdapter, nblAdapter];

async function readPrev<T>(name: string): Promise<T | null> {
  try { return JSON.parse(await readFile(new URL(name, OUT), 'utf8')) as T; } catch { /* zkusíme URL */ }
  const base = process.env.PREV_DATA_URL; // musí končit "/"
  if (base) { try { return await getJson<T>(new URL(name, base).href); } catch { /* nic */ } }
  return null;
}

async function main() {
  const now = new Date();
  const prev: Dataset = {
    matches: (await readPrev<MatchesFile>('matches.json'))?.matches ?? [],
    teams: (await readPrev<TeamsFile>('teams.json'))?.teams ?? [],
  };

  const outcomes: Partial<Record<Sport, SportOutcome>> = {};
  const failed: string[] = [];
  await Promise.all(adapters.map(async (a) => {
    try {
      const r = await a.fetch(now);
      outcomes[a.sport] = r;
      console.log(`[ok]   ${a.sport}: ${r.matches.length} zápasů, ${r.teams.length} týmů`);
      if (r.matches.length === 0) { failed.push(a.sport); console.log(`::warning::${a.sport}: 0 zápasů, ponechávám stará data`); }
    } catch (e) {
      outcomes[a.sport] = e instanceof Error ? e : new Error(String(e));
      failed.push(a.sport);
      console.log(`::warning::${a.sport} selhal: ${(e as Error).message}`);
    }
  }));

  const merged = mergeDatasets(prev, outcomes, now);
  const cfg = parseBroadcasters(await readFile(new URL('../broadcasters.yml', import.meta.url), 'utf8'));
  const matches = applyBroadcasters(merged.matches, cfg);

  await mkdir(OUT, { recursive: true });
  const matchesFile: MatchesFile = { generatedAt: now.toISOString(), matches };
  const teamsFile: TeamsFile = { teams: merged.teams };
  await writeFile(new URL('matches.json', OUT), JSON.stringify(matchesFile));
  await writeFile(new URL('teams.json', OUT), JSON.stringify(teamsFile));
  console.log(`Zapsáno: ${matches.length} zápasů, ${merged.teams.length} týmů`);
  process.exitCode = failed.length ? 2 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
