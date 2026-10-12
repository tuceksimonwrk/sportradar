import { describe, expect, it } from 'vitest';
import { combine, matchTeamId, pragueToUtcIso, safeLogoUrl, slugify } from './util';

describe('pragueToUtcIso', () => {
  it('letní čas (CEST, +2)', () => {
    expect(pragueToUtcIso(2026, 10, 10, 12, 0)).toBe('2026-10-10T10:00:00.000Z');
  });
  it('zimní čas (CET, +1)', () => {
    expect(pragueToUtcIso(2026, 11, 1, 18, 0)).toBe('2026-11-01T17:00:00.000Z');
  });
  it('den po přechodu na zimní čas (25. 10. 2026)', () => {
    expect(pragueToUtcIso(2026, 10, 24, 18, 0)).toBe('2026-10-24T16:00:00.000Z');
    expect(pragueToUtcIso(2026, 10, 26, 18, 0)).toBe('2026-10-26T17:00:00.000Z');
  });
});

describe('slugify', () => {
  it('odstraní diakritiku a mezery', () => {
    expect(slugify('BK Olomoucko')).toBe('bk-olomoucko');
    expect(slugify('Ústí nad Labem – Žraloci')).toBe('usti-nad-labem-zraloci');
  });
});

describe('combine', () => {
  it('spojí výsledky a deduplikuje podle id', () => {
    const m = (id: string) => ({ id, sport: 'nhl' as const, competition: 'NHL', startsAt: '2026-10-14T23:00:00.000Z', title: 't', teams: [], broadcasters: [] });
    const t = (id: string) => ({ id, sport: 'nhl' as const, name: id });
    const r = combine([
      { matches: [m('a'), m('b')], teams: [t('x')] },
      { matches: [m('b'), m('c')], teams: [t('x'), t('y')] },
    ]);
    expect(r.matches.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(r.teams.map((x) => x.id)).toEqual(['x', 'y']);
  });
});

describe('matchTeamId', () => {
  const teams = [
    { id: 'cz-hockey:PCE', sport: 'cz-hockey' as const, name: 'HC Dynamo Pardubice' },
    { id: 'cz-hockey:CEB', sport: 'cz-hockey' as const, name: 'Banes Motor Č. Budějovice' },
  ];
  it('shoda přes slugify (diakritika, velikost, mezery)', () => {
    expect(matchTeamId('HC Dynamo Pardubice', teams)).toBe('cz-hockey:PCE');
    expect(matchTeamId('  banes motor c.  budejovice ', teams)).toBe('cz-hockey:CEB');
  });
  it('bez shody / prázdné jméno → undefined', () => {
    expect(matchTeamId('HC Neznámý', teams)).toBeUndefined();
    expect(matchTeamId('', teams)).toBeUndefined();
    expect(matchTeamId('x', [])).toBeUndefined();
  });
});

describe('matchTeamId – tolerantní shoda', () => {
  const T = (id: string, name: string) => ({ id, name });
  const teams = [T('a', 'HC Dynamo Pardubice'), T('b', 'BK Olomoucko'), T('c', 'HC Olomouc'), T('d', 'BK Opava'), T('e', 'SK Slavia Praha ERA NBK'), T('f', 'Rytíři Kladno')];
  it('bez klubového prefixu na jedné ze stran', () => {
    expect(matchTeamId('Dynamo Pardubice', teams)).toBe('a');
    expect(matchTeamId('Olomoucko', teams)).toBe('b');
    expect(matchTeamId('HK Opava', teams)).toBe('d');
    expect(matchTeamId('Kladno', [T('f', 'FK Kladno')])).toBe('f');
  });
  it('jednoznačné slovní obsažení kratšího v delším', () => {
    expect(matchTeamId('Slavia Praha', teams)).toBe('e');
    expect(matchTeamId('Rytíři Kladno HC', teams)).toBe('f');
  });
  it('víceznačné obsažení / jiné slovo → undefined', () => {
    expect(matchTeamId('Olomouc', teams)).toBe('c');               // přesná shoda po odstranění prefixu
    expect(matchTeamId('Praha', [T('x', 'HC Sparta Praha'), T('y', 'HC Slavia Praha')])).toBeUndefined();
    expect(matchTeamId('Olomou', teams)).toBeUndefined();         // část slova se nepočítá
  });
});

describe('safeLogoUrl', () => {
  it('absolutní https projde', () => {
    expect(safeLogoUrl('https://assets.nhle.com/logos/nhl/svg/WSH_secondary_light.svg')).toBe('https://assets.nhle.com/logos/nhl/svg/WSH_secondary_light.svg');
  });
  it('relativní cesta s base se rozbalí; bez base undefined', () => {
    expect(safeLogoUrl('/min.php?exact&file=x.png', 'https://www.nbl.basketball')).toBe('https://www.nbl.basketball/min.php?exact&file=x.png');
    expect(safeLogoUrl('/min.php?file=x.png')).toBeUndefined();
  });
  it('odmítne http, javascript, data, nesmysly, příliš dlouhé', () => {
    expect(safeLogoUrl('http://cbf.cz/files/a.png')).toBeUndefined();
    expect(safeLogoUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeLogoUrl('data:image/png;base64,AAAA')).toBeUndefined();
    expect(safeLogoUrl('//evil.example/a.png')).toBeUndefined();
    expect(safeLogoUrl(undefined)).toBeUndefined();
    expect(safeLogoUrl(42 as unknown)).toBeUndefined();
    expect(safeLogoUrl('   ')).toBeUndefined();
    expect(safeLogoUrl('https://a.cz/' + 'x'.repeat(300))).toBeUndefined();
  });
  it('http base nepovolí', () => {
    expect(safeLogoUrl('/a.png', 'http://example.cz')).toBeUndefined();
  });
});

describe('combine – logo', () => {
  it('první tým bez loga se doplní logem z dalšího', () => {
    const a = { matches: [], teams: [{ id: 'x', sport: 'nhl' as const, name: 'X' }] };
    const b = { matches: [], teams: [{ id: 'x', sport: 'nhl' as const, name: 'X', logo: 'https://a.cz/x.png' }] };
    expect(combine([a, b]).teams[0].logo).toBe('https://a.cz/x.png');
  });
});
