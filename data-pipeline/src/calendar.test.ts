import { describe, expect, it } from 'vitest';
import type { Match, Team } from '@sportradar/shared';
import { buildCalendarFiles } from './calendar';

const now = new Date('2026-10-12T12:00:00Z');
const m = (id: string, sport: Match['sport'], startsAt: string, teams: string[] = [], extra: Partial<Match> = {}): Match =>
  ({ id, sport, competition: 'c', startsAt, title: id, teams, broadcasters: [], ...extra });
const teams: Team[] = [
  { id: 'nhl:PIT', sport: 'nhl', name: 'Pittsburgh Penguins' },
  { id: 'nhl:WSH', sport: 'nhl', name: 'Washington Capitals' },
  { id: 'cz-hockey:PCE', sport: 'cz-hockey', name: 'HC Dynamo Pardubice' },
];
const matches = [
  m('nhl:1', 'nhl', '2026-10-13T00:00:00.000Z', ['nhl:PIT', 'nhl:WSH']),
  m('nhl:2', 'nhl', '2026-10-14T00:00:00.000Z', ['nhl:PIT']),
  m('nhl:done', 'nhl', '2026-10-13T01:00:00.000Z', ['nhl:PIT'], { result: { home: 1, away: 0 } }),
  m('nhl:old', 'nhl', '2026-10-12T08:00:00.000Z', ['nhl:PIT']),      // před now − 3 h
  m('nhl:ongoing', 'nhl', '2026-10-12T10:00:00.000Z', ['nhl:WSH']),  // v rámci 3 h
  m('f1:2026-5-Race', 'f1', '2026-10-18T19:00:00.000Z'),
];
const files = buildCalendarFiles(matches, teams, now, 'https://x.github.io/sr/');
const uids = (s: string) => [...s.matchAll(/UID:(.*)\r\n/g)].map((x) => x[1].replace('@sportradar', ''));

describe('varianty předstihu', () => {
  it('každá varianta má svůj TRIGGER, 0 nemá VALARM', () => {
    expect(files.get('15/nhl_PIT.ics')).toContain('TRIGGER:-PT15M');
    expect(files.get('120/nhl_PIT.ics')).toContain('TRIGGER:-PT120M');
    expect(files.get('0/nhl_PIT.ics')).toContain('BEGIN:VEVENT');
    expect(files.get('0/nhl_PIT.ics')).not.toContain('VALARM');
  });
  it('legacy cesta (bez složky) = varianta 60', () => {
    for (const n of ['nhl_PIT', 'nhl', 'f1']) expect(files.get(`${n}.ics`)).toBe(files.get(`60/${n}.ics`));
  });
  it('názvy kalendářů se mezi variantami neliší', () => {
    expect(files.get('15/f1.ics')).toContain('X-WR-CALNAME:Sportradar – Formule 1');
  });
});

describe('buildCalendarFiles', () => {
  it('soubor pro každý tým s nadcházejícím zápasem a každý sport', () => {
    const leagues = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'cze.1'].map((c) => `league_${c}`);
    const names = ['cz-basket', 'cz-hockey', 'f1', 'nba', 'nhl', 'football', 'nhl_PIT', 'nhl_WSH', ...leagues];
    for (const min of [0, 15, 30, 60, 120]) for (const n of names) expect(files.has(`${min}/${n}.ics`)).toBe(true);
    expect(files.size).toBe(names.length * 6); // 5 variant × + legacy
  });
  it('zápas se dvěma týmy je v obou týmových souborech', () => {
    expect(uids(files.get('60/nhl_PIT.ics')!)).toEqual(['nhl:1', 'nhl:2']);
    expect(uids(files.get('60/nhl_WSH.ics')!)).toEqual(['nhl:ongoing', 'nhl:1']);
  });
  it('vylučuje výsledky a zápasy starší než 3 h', () => {
    const all = uids(files.get('60/nhl.ics')!);
    expect(all).toEqual(['nhl:ongoing', 'nhl:1', 'nhl:2']);
    expect(all).not.toContain('nhl:done');
    expect(all).not.toContain('nhl:old');
  });
  it('sportovní feed F1 a názvy kalendářů', () => {
    expect(uids(files.get('60/f1.ics')!)).toEqual(['f1:2026-5-Race']);
    expect(files.get('60/f1.ics')).toContain('X-WR-CALNAME:Sportradar – Formule 1');
    expect(files.get('60/nhl_PIT.ics')).toContain('X-WR-CALNAME:Sportradar – Pittsburgh Penguins');
    expect(files.get('60/f1.ics')).toContain('https://x.github.io/sr/');
  });
  it('sport bez zápasů dostane platný prázdný kalendář; tým bez zápasů soubor nemá', () => {
    expect(files.get('60/nba.ics')).toContain('BEGIN:VCALENDAR');
    expect(files.get('60/nba.ics')).not.toContain('VEVENT');
    expect(files.has('60/cz-hockey_PCE.ics')).toBe(false);
  });
  it('feed soutěže (league:<id>) obsahuje jen zápasy s daným competitionId, ve všech předstizích', () => {
    const fb = [
      m('football:1', 'football', '2026-10-13T19:00:00.000Z', ['football:382', 'football:364'], { competitionId: 'eng.1', competition: 'Premier League' }),
      m('football:2', 'football', '2026-10-14T19:00:00.000Z', ['football:382', 'football:160'], { competitionId: 'uefa.champions', competition: 'Liga mistrů' }),
      m('football:3', 'football', '2026-10-13T18:00:00.000Z', [], { competitionId: 'eng.1', result: { home: 1, away: 0 } }),
    ];
    const f = buildCalendarFiles(fb, [], now);
    expect(uids(f.get('60/league_eng.1.ics')!)).toEqual(['football:1']);
    expect(uids(f.get('15/league_uefa.champions.ics')!)).toEqual(['football:2']);
    expect(f.get('0/league_uefa.champions.ics')).toContain('X-WR-CALNAME:Sportradar – Liga mistrů');
    expect(f.get('league_eng.1.ics')).toBe(f.get('60/league_eng.1.ics'));
    expect(uids(f.get('60/football.ics')!)).toEqual(['football:1', 'football:2']);
    expect(uids(f.get('60/football_382.ics')!)).toEqual(['football:1', 'football:2']);
  });
  it('neznámý tým (bez záznamu v teams) dostane soubor s id jako názvem', () => {
    const f = buildCalendarFiles([m('nba:1', 'nba', '2026-10-13T00:00:00.000Z', ['nba:BOS'])], [], now);
    expect(f.get('60/nba_BOS.ics')).toContain('X-WR-CALNAME:Sportradar – nba:BOS');
  });
});
