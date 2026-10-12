import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Match, StandingsTable, Team } from '@sportradar/shared';
import { clubKey, czechClubAliases, unifyFootballClubs } from './clubs';
import { parseEspnFootball } from './adapters/football-espn';
import { parseCzSchedule } from './adapters/football-cz';
import { mergeDatasets } from './merge';
import uclCz from './adapters/fixtures/espn-football-ucl-czech.json';

const now = new Date('2026-10-12T12:00:00Z');
const cz = parseCzSchedule(readFileSync(new URL('./adapters/fixtures/chanceliga-rozpis.html', import.meta.url), 'utf8'), now).teams;
// reálné události ESPN (LM, kvalifikace LM/KL) s posunutým datem do okna
const ucl = structuredClone(uclCz) as any;
for (const e of ucl.events) { e.date = '2026-10-13T16:45Z'; e.status.type = { name: 'STATUS_SCHEDULED', state: 'pre', completed: false }; }
const espn = parseEspnFootball(ucl, 'uefa.champions', now);
const sparta: Team = { id: 'football:cz_ac-sparta-praha', sport: 'football', name: 'AC Sparta Praha', league: 'cze.1' };

describe('clubKey', () => {
  it('slug bez klubových zkratek, Prague/Prag → Praha', () => {
    expect(['SK Slavia Praha', 'Slavia Prague', '1.FC Slovácko', 'FC Viktoria Plzeň', 'Viktoria Plzen', 'Sparta Prag'].map(clubKey))
      .toEqual(['slavia-praha', 'slavia-praha', 'slovacko', 'viktoria-plzen', 'viktoria-plzen', 'sparta-praha']);
  });
});

describe('czechClubAliases', () => {
  const aliases = czechClubAliases([...cz, ...espn.teams]);
  it('Slavia, Sparta a Plzeň z ESPN → id z chanceliga.cz', () => {
    expect(aliases.get('football:494')?.id).toBe('football:cz_sk-slavia-praha');
    expect(aliases.get('football:433')?.id).toBe('football:cz_ac-sparta-praha');
    expect(aliases.get('football:11706')?.id).toBe('football:cz_fc-viktoria-plzen');
  });
  it('podobná nečeská jména se nemapují (Bohemians Dublin, Slavia Sofia); kluby top lig se nemapují', () => {
    expect(espn.teams.find((t) => t.id === 'football:615')?.name).toBe('Bohemians');
    expect(aliases.has('football:615')).toBe(false);
    const sofia: Team = { id: 'football:999', sport: 'football', name: 'Slavia Sofia', league: 'uefa.champions' };
    const prem: Team = { id: 'football:998', sport: 'football', name: 'Sparta Praha', league: 'eng.1' };
    const a = czechClubAliases([...cz, sofia, prem]);
    expect(a.has('football:999')).toBe(false);
    expect(a.has('football:998')).toBe(false);
  });
  it('explicitní alias (Bohemians 1905)', () => {
    const b: Team = { id: 'football:777', sport: 'football', name: 'Bohemians 1905', league: 'uefa.champions' };
    expect(czechClubAliases([...cz, b]).get('football:777')?.id).toBe('football:cz_bohemians-praha-1905');
  });
});

describe('unifyFootballClubs', () => {
  const tables: StandingsTable[] = [{ id: 'football-uefa.champions', sport: 'football', title: 'Liga mistrů', columns: [], rows: [
    { pos: 1, name: 'Slavia Prague', teamId: 'football:494', values: {} },
    { pos: 2, name: 'Sabah FK', teamId: 'football:21922', values: {} },
  ] }];
  const u = unifyFootballClubs({ matches: espn.matches, teams: [...cz, ...espn.teams] }, tables);
  it('zápasy LM odkazují na české id, výsledková jména beze změny', () => {
    const slp = u.matches.find((m) => m.id === 'football:401915436')!;
    expect(slp.teams).toEqual(['football:21922', 'football:cz_sk-slavia-praha']);
    expect(slp.title).toBe('Sabah FK – Slavia Prague');
  });
  it('sjednocený klub je v týmech jednou: český název, league cze.1, logo z webu ligy (ESPN jen když české chybí)', () => {
    const slavia = u.teams.filter((t) => /slavia/i.test(t.name));
    expect(slavia).toHaveLength(1);
    expect(slavia[0]).toMatchObject({ id: 'football:cz_sk-slavia-praha', name: 'SK Slavia Praha', league: 'cze.1' });
    expect(slavia[0].logo).toMatch(/chanceliga\.cz/);
    const noLogo = unifyFootballClubs({ matches: [], teams: [sparta, espn.teams.find((t) => t.id === 'football:433')!] }, []);
    expect(noLogo.teams).toHaveLength(1);
    expect(noLogo.teams[0].logo).toMatch(/espncdn/);
    expect(u.teams.some((t) => t.id === 'football:494')).toBe(false);
  });
  it('tabulky: teamId i název řádku podle českého klubu', () => {
    expect(u.tables[0].rows[0]).toMatchObject({ teamId: 'football:cz_sk-slavia-praha', name: 'SK Slavia Praha' });
    expect(u.tables[0].rows[1].teamId).toBe('football:21922');
  });
  it('seznam sjednocených klubů pro log', () => {
    expect(u.unified.map((x) => `${x.from}→${x.to}`).sort()).toEqual([
      'football:11706→football:cz_fc-viktoria-plzen', 'football:433→football:cz_ac-sparta-praha', 'football:494→football:cz_sk-slavia-praha']);
  });
  it('převzatá data z minula (výsledek se starým ESPN id) se po sloučení přemapují', () => {
    const old: Match = { id: 'football:111', sport: 'football', competition: 'Liga mistrů', competitionId: 'uefa.champions',
      startsAt: '2026-10-01T19:00:00.000Z', title: 'Slavia Prague – Sabah FK', teams: ['football:494', 'football:21922'], broadcasters: [],
      result: { home: 2, away: 0, homeName: 'Slavia Prague', awayName: 'Sabah FK' } };
    const merged = mergeDatasets({ matches: [old], teams: [espn.teams.find((t) => t.id === 'football:494')!] },
      { football: { matches: espn.matches, teams: [...cz, ...espn.teams] } }, now);
    const r = unifyFootballClubs(merged, []);
    expect(r.matches.find((m) => m.id === 'football:111')!.teams).toEqual(['football:cz_sk-slavia-praha', 'football:21922']);
    expect(r.teams.filter((t) => /slavia/i.test(t.name))).toHaveLength(1);
  });
  it('ostatní sporty a nefotbalové tabulky beze změny; bez českých klubů nic', () => {
    const nhl: Match = { id: 'nhl:1', sport: 'nhl', competition: 'NHL', startsAt: '2026-10-13T00:00:00.000Z', title: 'A – B', teams: ['football:494'], broadcasters: [] };
    expect(unifyFootballClubs({ matches: [nhl], teams: [...cz, ...espn.teams] }, []).matches[0].teams).toEqual(['football:494']);
    expect(unifyFootballClubs({ matches: espn.matches, teams: espn.teams }, []).unified).toEqual([]);
  });
});
