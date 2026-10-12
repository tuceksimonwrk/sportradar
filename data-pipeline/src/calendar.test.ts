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

describe('buildCalendarFiles', () => {
  it('soubor pro každý tým s nadcházejícím zápasem a každý sport', () => {
    expect([...files.keys()].sort()).toEqual([
      'cz-basket.ics', 'cz-hockey.ics', 'f1.ics', 'nba.ics', 'nhl.ics', 'nhl_PIT.ics', 'nhl_WSH.ics',
    ]);
  });
  it('zápas se dvěma týmy je v obou týmových souborech', () => {
    expect(uids(files.get('nhl_PIT.ics')!)).toEqual(['nhl:1', 'nhl:2']);
    expect(uids(files.get('nhl_WSH.ics')!)).toEqual(['nhl:ongoing', 'nhl:1']);
  });
  it('vylučuje výsledky a zápasy starší než 3 h', () => {
    const all = uids(files.get('nhl.ics')!);
    expect(all).toEqual(['nhl:ongoing', 'nhl:1', 'nhl:2']);
    expect(all).not.toContain('nhl:done');
    expect(all).not.toContain('nhl:old');
  });
  it('sportovní feed F1 a názvy kalendářů', () => {
    expect(uids(files.get('f1.ics')!)).toEqual(['f1:2026-5-Race']);
    expect(files.get('f1.ics')).toContain('X-WR-CALNAME:Sportradar – Formule 1');
    expect(files.get('nhl_PIT.ics')).toContain('X-WR-CALNAME:Sportradar – Pittsburgh Penguins');
    expect(files.get('f1.ics')).toContain('https://x.github.io/sr/');
  });
  it('sport bez zápasů dostane platný prázdný kalendář; tým bez zápasů soubor nemá', () => {
    expect(files.get('nba.ics')).toContain('BEGIN:VCALENDAR');
    expect(files.get('nba.ics')).not.toContain('VEVENT');
    expect(files.has('cz-hockey_PCE.ics')).toBe(false);
  });
  it('neznámý tým (bez záznamu v teams) dostane soubor s id jako názvem', () => {
    const f = buildCalendarFiles([m('nba:1', 'nba', '2026-10-13T00:00:00.000Z', ['nba:BOS'])], [], now);
    expect(f.get('nba_BOS.ics')).toContain('X-WR-CALNAME:Sportradar – nba:BOS');
  });
});
