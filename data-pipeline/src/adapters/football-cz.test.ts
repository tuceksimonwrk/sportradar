import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CZ_SCHEDULE_URL, CZ_TABLE_URL, czTeamId, fetchCzCompetition, parseCzSchedule, parseCzStandings } from './football-cz';

const rozpis = readFileSync(new URL('./fixtures/chanceliga-rozpis.html', import.meta.url), 'utf8');
const tabulka = readFileSync(new URL('./fixtures/chanceliga-tabulka.html', import.meta.url), 'utf8');
const now = new Date('2026-10-12T12:00:00Z');

describe('parseCzSchedule (reálný rozpis chanceliga.cz)', () => {
  const s = parseCzSchedule(rozpis, now);
  const byId = (id: string) => s.matches.find((m) => m.id === id);
  it('výsledky 10. kola (14 dní), nadcházející do 21 dní; bez času a starší výsledky se vynechají', () => {
    expect(s.matches.filter((m) => m.result)).toHaveLength(8);
    expect(s.matches.filter((m) => !m.result)).toHaveLength(25); // dohrávka 6. kola + kola 11–13
    expect(s.matches.every((m) => Date.parse(m.startsAt) <= now.getTime() + 21 * 86400_000)).toBe(true);
  });
  it('výsledek: pražský čas → UTC, skóre a plné názvy', () => {
    expect(byId('football:cz-8406')).toMatchObject({
      sport: 'football', competition: 'Chance Liga', competitionId: 'cze.1',
      startsAt: '2026-10-09T16:00:00.000Z', title: 'FC Zlín – SK Slavia Praha',
      teams: ['football:cz_fc-zlin', 'football:cz_sk-slavia-praha'],
      result: { home: 0, away: 1, homeName: 'FC Zlín', awayName: 'SK Slavia Praha' },
    });
  });
  it('dohrávka (přeložený zápas 6. kola) je nadcházející s novým termínem', () => {
    expect(byId('football:cz-8368')).toMatchObject({ startsAt: '2026-10-14T16:00:00.000Z', title: 'Bohemians Praha 1905 – FK Mladá Boleslav' });
    expect(byId('football:cz-8368')!.result).toBeUndefined();
  });
  it('týmy: id ze slugu oficiálního názvu, logo 85×85 z webu ligy, domácí liga cze.1', () => {
    expect(s.teams).toHaveLength(16);
    expect(s.teams.find((t) => t.id === 'football:cz_sk-slavia-praha')).toEqual({
      id: 'football:cz_sk-slavia-praha', sport: 'football', name: 'SK Slavia Praha',
      logo: 'https://www.chanceliga.cz/photo/club/85x85/club_89.png?4', league: 'cze.1',
    });
    expect(czTeamId('1.FC Slovácko')).toBe('football:cz_1-fc-slovacko');
    expect(s.clubs.get('5')?.id).toBe('football:cz_sk-slavia-praha');
  });
  it('zápas se skóre, který ještě může běžet (< 2 h od výkopu), je bez výsledku', () => {
    const live = parseCzSchedule(rozpis, new Date('2026-10-11T17:30:00Z')); // ACS–FKP začal 16:00Z
    const m = live.matches.find((x) => x.title === 'AC Sparta Praha – FK Pardubice')!;
    expect(m.result).toBeUndefined();
  });
  it('změněné HTML (řádek bez týmů) → výjimka; stránka bez rozpisu → výjimka; prázdný rozpis = mimo sezónu', () => {
    const broken = rozpis.replace(/<td class="team home ">[\s\S]*?<\/td>/, '<td class="team home "></td>');
    expect(() => parseCzSchedule(broken, now)).toThrow(/nezpracovatelných řádků/);
    expect(() => parseCzSchedule('<html><body><p>Údržba</p></body></html>', now)).toThrow(/nenalezen/);
    expect(parseCzSchedule('<div class="schedule__content"><table class="table"></table></div>', now).matches).toEqual([]);
  });
});

describe('parseCzStandings (reálná tabulka chanceliga.cz)', () => {
  const { clubs } = parseCzSchedule(rozpis, now);
  it('vybere plnou tabulku (Z V R P G+ G- B), 16 řádků s plnými názvy a teamId', () => {
    const [t] = parseCzStandings(tabulka, clubs);
    expect(t).toMatchObject({ id: 'football-cze.1', sport: 'football', title: 'Chance Liga' });
    expect(t.rows).toHaveLength(16);
    expect(t.rows[0]).toEqual({ pos: 1, name: 'SK Slavia Praha', teamId: 'football:cz_sk-slavia-praha', values: { z: 10, v: 8, r: 2, p: 0, skore: '26:6', rozdil: '+20', b: 26 } });
    expect(t.rows[15].values).toMatchObject({ skore: '8:20', rozdil: '-12', b: 1 });
    expect(t.rows.every((r) => r.teamId)).toBe(true);
  });
  it('bez rozpisu: krátké názvy z tabulky, bez teamId', () => {
    const [t] = parseCzStandings(tabulka, new Map());
    expect(t.rows[0]).toMatchObject({ name: 'Slavia' });
    expect(t.rows[0].teamId).toBeUndefined();
  });
  it('zahozený řádek / chybějící tabulka → výjimka', () => {
    expect(() => parseCzStandings(tabulka.replace('<td class=" number">8</td>', '<td class=" number">x</td>'), clubs)).toThrow(/nezpracovatelných/);
    expect(() => parseCzStandings('<table><thead><tr><th>#</th></tr></thead></table>', clubs)).toThrow(/nenalezena/);
  });
});

describe('fetchCzCompetition', () => {
  const get = (u: string) => Promise.resolve(u === CZ_SCHEDULE_URL ? rozpis : u === CZ_TABLE_URL ? tabulka : '');
  it('rozpis + tabulka', async () => {
    const p = await fetchCzCompetition(now, get);
    expect(p.compId).toBe('cze.1');
    expect(p.data).not.toBeInstanceOf(Error);
    expect(p.standings?.[0].rows[0].teamId).toBe('football:cz_sk-slavia-praha');
  });
  it('chyba rozpisu → chyba části (tabulka přesto zpracovaná, bez teamId); chyba tabulky → jen standingsError', async () => {
    const a = await fetchCzCompetition(now, (u) => (u === CZ_SCHEDULE_URL ? Promise.reject(new Error('HTTP 503')) : get(u)));
    expect((a.data as Error).message).toBe('cze.1: HTTP 503');
    expect(a.standings).toHaveLength(1);
    const b = await fetchCzCompetition(now, (u) => (u === CZ_TABLE_URL ? Promise.reject(new Error('HTTP 503')) : get(u)));
    expect(b.data).not.toBeInstanceOf(Error);
    expect(b.standingsError).toBe('cze.1: HTTP 503');
  });
});
