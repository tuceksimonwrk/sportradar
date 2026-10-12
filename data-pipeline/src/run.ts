import { mkdir, readdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { isMatchDetail, type MatchDetail, type MatchesFile, type Sport, type StandingsFile, type TeamsFile } from '@sportradar/shared';
import { applyBroadcasters, parseBroadcasters } from './broadcasters';
import { isSuspiciousEmpty, mergeDatasets, mergeStandings, resolveStandingsTeamIds, upcomingCount, type Dataset, type SportOutcome } from './merge';
import { buildCalendarFiles } from './calendar';
import { unifyFootballClubs } from './clubs';
import { applyVenues, parseVenues } from './venues';
import type { Adapter } from './types';
import { f1Adapter } from './adapters/f1';
import { nhlAdapter } from './adapters/nhl';
import { nbaAdapter } from './adapters/nba';
import { elhAdapter } from './adapters/elh';
import { nblAdapter } from './adapters/nbl';
import { footballAdapter } from './adapters/football';
import { buildDetailIndex, createFetcher, generateDetails, requestsBySport, selectDetailMatches, staleDetailFiles } from './details';
import { getJson, getText } from './util';

const OUT = new URL('../../web/public/data/', import.meta.url);
const adapters: Adapter[] = [f1Adapter, nhlAdapter, nbaAdapter, elhAdapter, nblAdapter, footballAdapter];

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
      for (const l of r.log ?? []) console.log(`[ok]   ${a.sport}: ${l}`);
      for (const w of r.warnings ?? []) console.log(`::warning::${a.sport}: ${w}`);
      for (const c of r.failedCompetitions ?? []) failed.push(`${a.sport}-${c}`);
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

  const mergedRaw = mergeDatasets(prev, outcomes, now);
  // týmy z tohoto běhu + z minula (klub, který zrovna nehraje v načteném okně, jinak zůstal bez teamId)
  const knownRaw = [...new Map([...prev.teams, ...mergedRaw.teams].map((t) => [t.id, t])).values()];
  const resolved = resolveStandingsTeamIds(mergeStandings(prevStandings, outcomes, now), knownRaw);
  for (const [sport, u] of Object.entries(resolved.unresolved)) console.log(`::warning::${sport}: ${u.missing} z ${u.total} řádků tabulky bez teamId`);
  // jedna identita českého klubu (chanceliga.cz) i v Lize mistrů (ESPN) – nad sloučenými daty, tedy i nad převzatými z minula
  const uni = unifyFootballClubs({ matches: mergedRaw.matches, teams: knownRaw }, resolved.tables);
  const merged = { matches: uni.matches, teams: unifyFootballClubs({ matches: [], teams: mergedRaw.teams }, []).teams };
  const knownTeams = uni.teams;
  const tables = uni.tables;
  if (uni.unified.length) console.log(`[ok]   football: sjednocené kluby: ${uni.unified.map((u) => `${u.espnName} (${u.from}) → ${u.name} (${u.to})`).join(', ')}`);
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
  try {
    const cal = buildCalendarFiles(matches, merged.teams, now, process.env.SITE_URL || undefined);
    const calDir = new URL('cal/', OUT);
    await mkdir(calDir, { recursive: true });
    for (const [file, ics] of cal) {
      await mkdir(new URL('.', new URL(file, calDir)), { recursive: true });
      await writeFile(new URL(file, calDir), ics);
    }
    let removed = 0;
    // zastaralé feedy (odebrané týmy) mažeme až po úspěšném zápisu všech nových; poté i prázdné podsložky
    for (const f of await readdir(calDir, { recursive: true })) {
      const rel = f.replaceAll('\\', '/');
      if (rel.endsWith('.ics') && !cal.has(rel)) { await rm(new URL(rel, calDir)); removed++; }
    }
    for (const d of await readdir(calDir, { withFileTypes: true })) {
      if (d.isDirectory() && (await readdir(new URL(`${d.name}/`, calDir))).length === 0) await rmdir(new URL(`${d.name}/`, calDir));
    }
    console.log(`[ok]   kalendáře: ${cal.size} souborů${removed ? `, ${removed} zastaralých smazáno` : ''}`);
  } catch (e) {
    failed.push('kalendáře');
    console.log(`::warning::kalendáře: ${(e as Error).message}`);
  }
  try {
    // detail zápasu (statistiky + sestavy) pro zápasy v příštích 7 dnech; selhání jednoho detailu běh neshodí
    const started = Date.now();
    const selected = selectDetailMatches(matches, now);
    const get = createFetcher((url) => getText(url));
    const run = await generateDetails(selected, { get, now, matches, teams: knownTeams, standings: tables },
      async (file) => { const d = await readPrev<MatchDetail>(`detail/${file}`); return d && isMatchDetail(d) ? d : null; });
    const detailDir = new URL('detail/', OUT);
    await mkdir(detailDir, { recursive: true });
    let bytes = 0;
    for (const [file, d] of run.files) { const json = JSON.stringify(d); bytes += Buffer.byteLength(json); await writeFile(new URL(file, detailDir), json); }
    await writeFile(new URL('index.json', detailDir), JSON.stringify(buildDetailIndex([...run.files.values()].map((d) => d.matchId), now)));
    // zastaralé detaily (zápasy mimo okno) mažeme až po zápisu všech nových
    const stale = staleDetailFiles(await readdir(detailDir), new Set(run.files.keys()));
    for (const f of stale) await rm(new URL(f, detailDir));
    for (const w of run.warnings) console.log(`::warning::${w}`);
    for (const s of run.failedSports) failed.push(`detail-${s}`);
    const per = Object.entries(run.counts).map(([s, c]) => `${s} ${c.ok}/${c.total}`).join(', ');
    console.log(`[ok]   detaily: ${run.files.size} souborů, ${Math.round(bytes / 1024)} kB${per ? ` (${per})` : ''}`
      + `${run.kept ? `, ${run.kept} ponecháno z minula` : ''}, ${get.count} HTTP požadavků${stale.length ? `, ${stale.length} zastaralých smazáno` : ''}`);
    const largest = Math.max(0, ...[...run.files.values()].map((d) => Buffer.byteLength(JSON.stringify(d))));
    console.log(`[ok]   detaily: požadavky podle sportu ${Object.entries(requestsBySport(get.urls)).map(([k, n]) => `${k} ${n}`).join(', ')}; největší ${Math.round(largest / 1024)} kB; trvání ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed.push('detaily');
    console.log(`::warning::detaily: ${(e as Error).message}`);
  }
  console.log(`Zapsáno: ${matches.length} zápasů, ${merged.teams.length} týmů, ${tables.length} tabulek`);
  process.exitCode = failed.length ? 2 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
