import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { MatchesFile, Sport, StandingsFile, TeamsFile } from '@sportradar/shared';
import { applyBroadcasters, parseBroadcasters } from './broadcasters';
import { isSuspiciousEmpty, mergeDatasets, mergeStandings, resolveStandingsTeamIds, upcomingCount, type Dataset, type SportOutcome } from './merge';
import { applyVenues, parseVenues } from './venues';
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

  const prevStandings = (await readPrev<StandingsFile>('standings.json'))?.tables ?? [];

  const outcomes: Partial<Record<Sport, SportOutcome>> = {};
  const failed: string[] = [];
  await Promise.all(adapters.map(async (a) => {
    try {
      const r = await a.fetch(now);
      outcomes[a.sport] = r;
      const upcoming = upcomingCount(r.matches);
      console.log(`[ok]   ${a.sport}: ${upcoming} zápasů, ${r.matches.length - upcoming} výsledků, ${r.teams.length} týmů`);
      if (r.standings?.length) console.log(`[ok]   ${a.sport}: ${r.standings.length} tabulek`);
      else if (r.standings) console.log(`[ok]   ${a.sport}: tabulka zatím prázdná`);
      if (r.standingsError) { failed.push(`${a.sport}-tabulka`); console.log(`::warning::${a.sport}: tabulka selhala: ${r.standingsError}`); }
      if (upcoming === 0) {
        if (isSuspiciousEmpty(prev, a.sport, now)) { failed.push(a.sport); console.log(`::warning::${a.sport}: 0 zápasů, ponechávám stará data`); }
        else console.log(`[ok]   ${a.sport}: 0 zápasů (mimo sezónu)`);
      }
    } catch (e) {
      outcomes[a.sport] = e instanceof Error ? e : new Error(String(e));
      failed.push(a.sport);
      console.log(`::warning::${a.sport} selhal: ${(e as Error).message}`);
    }
  }));

  const merged = mergeDatasets(prev, outcomes, now);
  // týmy z tohoto běhu + z minula (klub, který zrovna nehraje v načteném okně, jinak zůstal bez teamId)
  const knownTeams = [...new Map([...prev.teams, ...merged.teams].map((t) => [t.id, t])).values()];
  const resolved = resolveStandingsTeamIds(mergeStandings(prevStandings, outcomes, now), knownTeams);
  const tables = resolved.tables;
  for (const [sport, u] of Object.entries(resolved.unresolved)) console.log(`::warning::${sport}: ${u.missing} z ${u.total} řádků tabulky bez teamId`);
  let matches = merged.matches;
  try {
    const cfg = parseBroadcasters(await readFile(new URL('../broadcasters.yml', import.meta.url), 'utf8'));
    matches = applyBroadcasters(merged.matches, cfg);
  } catch (e) {
    failed.push('broadcasters');
    console.log(`::warning::broadcasters.yml neplatný: ${(e as Error).message}`);
  }
  try {
    const vcfg = parseVenues(await readFile(new URL('../venues.yml', import.meta.url), 'utf8'));
    matches = applyVenues(matches, vcfg);
  } catch (e) {
    failed.push('venues');
    console.log(`::warning::venues.yml neplatný: ${(e as Error).message}`);
  }

  await mkdir(OUT, { recursive: true });
  const matchesFile: MatchesFile = { generatedAt: now.toISOString(), matches };
  const teamsFile: TeamsFile = { teams: merged.teams };
  await writeFile(new URL('matches.json', OUT), JSON.stringify(matchesFile));
  await writeFile(new URL('teams.json', OUT), JSON.stringify(teamsFile));
  const standingsFile: StandingsFile = { generatedAt: now.toISOString(), tables };
  await writeFile(new URL('standings.json', OUT), JSON.stringify(standingsFile));
  console.log(`Zapsáno: ${matches.length} zápasů, ${merged.teams.length} týmů, ${tables.length} tabulek`);
  process.exitCode = failed.length ? 2 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
