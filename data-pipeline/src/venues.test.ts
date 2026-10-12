import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Match } from '@sportradar/shared';
import { applyVenues, parseVenues } from './venues';
import { parseCzSchedule } from './adapters/football-cz';

const m = (id: string, teams: string[], venue?: Match['venue']): Match =>
  ({ id, sport: 'cz-hockey', competition: 'c', startsAt: '2026-10-14T23:00:00.000Z', title: 't', teams, broadcasters: [], ...(venue && { venue }) });

const cfg = parseVenues(`
teams:
  "cz-hockey:AAA": { name: "Hala A, hlavní", city: "Město A", checked: "2026-10-12", source: "https://a.example" }
`);

describe('applyVenues', () => {
  it('doplní halu podle domácího týmu (teams[0]) bez checked/source', () => {
    const [r] = applyVenues([m('1', ['cz-hockey:AAA', 'cz-hockey:BBB'])], cfg);
    expect(r.venue).toEqual({ name: 'Hala A, hlavní', city: 'Město A' });
  });
  it('nenamapovaný domácí tým nechá beze změny (hostující tým se nepočítá)', () => {
    const [r] = applyVenues([m('2', ['cz-hockey:BBB', 'cz-hockey:AAA'])], cfg);
    expect(r).not.toHaveProperty('venue');
  });
  it('nepřepíše existující venue', () => {
    const [r] = applyVenues([m('3', ['cz-hockey:AAA'], { name: 'Jiná' })], cfg);
    expect(r.venue).toEqual({ name: 'Jiná' });
  });
  it('prázdný/chybějící yml nepadne', () => {
    expect(parseVenues('')).toEqual({ teams: {} });
    expect(parseVenues('# jen komentář')).toEqual({ teams: {} });
    expect(applyVenues([m('4', ['cz-hockey:AAA'])], parseVenues(''))[0]).not.toHaveProperty('venue');
  });
});

describe('venues.yml v repu', () => {
  const real = parseVenues(readFileSync(new URL('../venues.yml', import.meta.url), 'utf8'));
  it('každý záznam má name, city, checked (YYYY-MM-DD) a source (URL)', () => {
    const entries = Object.entries(real.teams);
    expect(entries.length).toBeGreaterThan(0);
    for (const [, v] of entries) {
      expect(v.name).toBeTruthy();
      expect(v.city).toBeTruthy();
      expect(v.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.source).toMatch(/^https?:\/\//);
    }
  });
  it('přesný název u známého záznamu (kontrola uvozovek/ořezu)', () => {
    expect(real.teams['cz-hockey:SPA']).toMatchObject({ name: 'O2 arena', city: 'Praha' });
    expect(real.teams['cz-hockey:MBL']).toMatchObject({ name: 'Ško-Energo Aréna', city: 'Mladá Boleslav' });
    expect(real.teams['football:cz_sk-slavia-praha']).toMatchObject({ name: 'Fortuna Arena', city: 'Praha' });
    expect(Object.keys(real.teams).filter((k) => k.startsWith('football:cz_'))).toHaveLength(16);
    // id klubů z reálného rozpisu chanceliga.cz musí sedět s klíči
    const rozpis = readFileSync(new URL('./adapters/fixtures/chanceliga-rozpis.html', import.meta.url), 'utf8');
    const ids = parseCzSchedule(rozpis, new Date('2026-10-12T12:00:00Z')).teams.map((t) => t.id);
    expect(ids.filter((id) => !real.teams[id])).toEqual([]);
  });
});
