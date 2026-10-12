import { describe, expect, it } from 'vitest';
import { elhAdapter, elhRoundNumbers, parseElhRound, parseElhStandings } from './elh';

const side = (long: string, short: string) =>
  `<div class="preview__name__wrapper"><a href="#"><span class="preview__name--long">${long}</span><span class="preview__name--short">${short}</span></a></div>`;
const upcoming = (id: string, home: [string, string], away: [string, string], dow: string, date: string, time: string) => `
<tr data-href="/zapas/${id}" class="js-preview__link"><td class="preview__name text-right">${side(...home)}</td>
<td class="preview__center preview__desktop" colspan="3"><div class="box-snow row"><div class="col-1_3">${dow}</div><div class="col-1_3">${date}</div><div class="col-1_3">${time}</div></div></td>
<td class="preview__name">${side(...away)}</td></tr>`;
const played = (id: string, home: [string, string], away: [string, string], date = 'ÚT 22. 09.', hs: string | null = '4', as: string | null = '5') => `
<tr data-href="/zapas/${id}" class="js-preview__link"><td class="preview__name text-right">${side(...home)}</td>
<td class="preview__score">${hs === null ? '' : `<span class="blue">${hs}</span>`}</td><td class="preview__period"><span class="match-start-time">${date}</span></td>
<td class="preview__score">${as === null ? '' : `<span class="blue">${as}</span>`}</td><td class="preview__name">${side(...away)}</td></tr>`;

const PCE: [string, string] = ['HC Dynamo Pardubice', 'PCE'];
const LIB: [string, string] = ['Bílí Tygři Liberec', 'LIB'];
const LIT: [string, string] = ['HC VERVA Litvínov', 'LIT'];
const MHK: [string, string] = ['Mountfield HK', 'MHK'];

const html = `<a href="/tipsport-extraliga/zapasy?matchList-view-round-round=1">1</a>
<a href="/tipsport-extraliga/zapasy?matchList-view-round-round=2">2</a>
<table>${played('2928328', PCE, LIB)}
${upcoming('2928329', LIT, MHK, 'ČT', '15. 10.', '17:30')}
${upcoming('2928330', PCE, LIT, 'SO', '03. 01.', '17:00')}
${upcoming('2928331', MHK, LIB, 'NE', '-', '')}</table>`;

describe('parseElhRound', () => {
  const r = parseElhRound(html, new Date('2026-12-30T12:00:00Z'));
  it('vezme jen neodehrané zápasy s časem', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['cz-hockey:2928329', 'cz-hockey:2928330']);
  });
  it('převede čas z Prahy do UTC a dopočítá rok (přes přelom roku)', () => {
    expect(r.matches[0].startsAt).toBe('2026-10-15T15:30:00.000Z');
    expect(r.matches[1].startsAt).toBe('2027-01-03T16:00:00.000Z'); // 3. 1. je > 90 dní v minulosti → příští rok
  });
  it('mapuje týmy a titulek', () => {
    expect(r.matches[1]).toMatchObject({
      sport: 'cz-hockey', competition: 'Tipsport extraliga',
      title: 'HC Dynamo Pardubice – HC VERVA Litvínov', teams: ['cz-hockey:PCE', 'cz-hockey:LIT'],
    });
    expect(r.teams.map((t) => t.id).sort()).toEqual(['cz-hockey:LIB', 'cz-hockey:LIT', 'cz-hockey:MHK', 'cz-hockey:PCE']);
  });
  it('rok: říjen a now v říjnu zůstane tento rok', () => {
    const r2 = parseElhRound(html, new Date('2026-10-12T12:00:00Z'));
    expect(r2.matches[0].startsAt).toBe('2026-10-15T15:30:00.000Z');
    expect(r2.matches[1].startsAt).toBe('2027-01-03T16:00:00.000Z');
  });
  it('změněné HTML nepadne', () => { expect(parseElhRound('<html></html>', new Date()).matches).toEqual([]); });
});

describe('parseElhRound – výsledky', () => {
  const now = new Date('2026-09-25T10:00:00Z'); // pá 25. 9.
  const parse = (rows: string, n = now) => parseElhRound(`<table>${rows}</table>`, n);
  it('odehraný zápas → result, dateOnly, 12:00 Praha', () => {
    const r = parse(played('1', PCE, LIB));
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]).toMatchObject({
      id: 'cz-hockey:1', startsAt: '2026-09-22T10:00:00.000Z', title: 'HC Dynamo Pardubice – Bílí Tygři Liberec',
      teams: ['cz-hockey:PCE', 'cz-hockey:LIB'],
      result: { home: 4, away: 5, homeName: 'HC Dynamo Pardubice', awayName: 'Bílí Tygři Liberec', dateOnly: true },
    });
  });
  it('starší než 14 dní se neemituje', () => {
    expect(parse(played('1', PCE, LIB), new Date('2026-10-10T10:00:00Z')).matches).toEqual([]);
  });
  it('dnešní řádek (Praha) se neemituje, včerejší ano', () => {
    expect(parse(played('1', PCE, LIB, 'ÚT 22. 09.'), new Date('2026-09-22T09:00:00Z')).matches).toEqual([]);
    expect(parse(played('1', PCE, LIB, 'ÚT 22. 09.'), new Date('2026-09-23T09:00:00Z')).matches).toHaveLength(1);
  });
  it('chybějící skóre se přeskočí', () => {
    expect(parse(played('1', PCE, LIB, 'ÚT 22. 09.', null, '5')).matches).toEqual([]);
    expect(parse(played('2', PCE, LIB, 'ÚT 22. 09.', '3', null)).matches).toEqual([]);
  });
  it('rok: leden po prosinci → loňský rok pro odehrané', () => {
    const r = parse(played('1', PCE, LIB, 'ÚT 30. 12.'), new Date('2027-01-02T10:00:00Z'));
    expect(r.matches[0].startsAt).toBe('2026-12-30T11:00:00.000Z');
  });
  it('rok: datum >2 dny v budoucnosti → loňský rok (a tedy příliš staré)', () => {
    expect(parse(played('1', PCE, LIB, 'ÚT 30. 12.'), new Date('2026-10-12T10:00:00Z')).matches).toEqual([]);
  });
});

describe('elhRoundNumbers', () => {
  it('vrátí unikátní čísla kol', () => { expect(elhRoundNumbers(html)).toEqual([1, 2]); });
});

describe('elhAdapter.fetch', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('selhání jednoho kola shodí fetch', async () => {
    const get = async (url: string) => { if (url.endsWith('round=2')) throw new Error('boom'); return html; };
    await expect(elhAdapter.fetch(now, get)).rejects.toThrow();
  });
  it('vše OK vrátí data', async () => {
    const r = await elhAdapter.fetch(now, async () => html);
    expect(r.matches.length).toBeGreaterThan(0);
  });
});

const th = (label: string, title: string) => `<th><span class="hasqtip" data-content="${title}">${label}</span></th>`;
const HEAD = `<thead><tr>${th('#', 'Pořadí')}${th('Tým', 'Název týmu')}${th('Z', 'Zápasy')}${th('V', 'Výhry')}${th('VP', 'Výhry v prodloužení')}${th('PP', 'Prohry v prodloužení')}${th('P', 'Prohry')}${th('Skóre', 'Celkové skóre')}${th('B', 'Body')}${th('B%', 'Úspěšnost')}</tr></thead>`;
const srow = (pos: string, name: string, z = '10', v = '5', vp = '0', pp = '1', p = '4', skore = '30:25', b = '16') => `
<tr><td>${pos}</td><td data-sort-value="x">
   ${name}
</td><td>${z}</td><td>${v}</td><td>${vp}</td>

<td>${pp}</td><td>${p}</td><td data-sort-value="49">${skore}</td><td class="sorting-by">${b}</td><td>93</td></tr>`;
const CLUBS = ['HC Oceláři Třinec', 'HC Dynamo Pardubice', 'BYD Energie Karlovy Vary', 'HC Škoda Plzeň', 'Mountfield HK', 'Banes Motor Č. Budějovice',
  'Rytíři Kladno', 'HC Sparta Praha', 'Bílí Tygři Liberec', 'HC VERVA Litvínov', 'HC Kometa Brno', 'BK Mladá Boleslav', 'HC VÍTKOVICE RIDERA', 'HC Olomouc'];
const rowsOf = (n: number, mod: (i: number) => Partial<string[]> | string[] = () => []) =>
  Array.from({ length: n }, (_, i) => srow(String(i + 1), CLUBS[i], ...(mod(i) as string[]))).join('\n');
const mainTable = (body: string, h = 'Tipsport extraliga') => `<h2>${h}</h2><table class="table-soupiska">${HEAD}<tbody>${body}</tbody></table>`;
const decoy = `<table><thead><tr><th>Pořadí</th><th>Klub</th><th>Body</th></tr></thead><tbody><tr><td>2.</td><td><a href="/klub/x?t=junk%3C%21DOCTYPE">HC Dynamo Pardubice</a></td><td>26</td></tr></tbody></table>`;

describe('parseElhStandings', () => {
  const teams = [
    { id: 'cz-hockey:TRI', sport: 'cz-hockey' as const, name: 'HC Oceláři Třinec' },
    { id: 'cz-hockey:PCE', sport: 'cz-hockey' as const, name: 'HC Dynamo Pardubice' },
  ];
  const t = parseElhStandings(`${decoy}${mainTable(rowsOf(14))}${mainTable(rowsOf(12), 'Tipsport extraliga - VENKU')}`, teams);
  it('vybere hlavní tabulku podle hlaviček (ne decoy, ne doma/venku)', () => {
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: 'cz-hockey', sport: 'cz-hockey', title: 'Tipsport extraliga' });
    expect(t[0].rows).toHaveLength(14);
    expect(t[0].columns.map((c) => c.label)).toEqual(['Z', 'V', 'VP', 'PP', 'P', 'Skóre', 'B']);
    expect(t[0].columns.map((c) => c.key)).toEqual(['z', 'v', 'vp', 'pp', 'p', 'skore', 'b']);
  });
  it('doma/venku tabulka před hlavní se přeskočí podle nadpisu', () => {
    const r = parseElhStandings(`${mainTable(rowsOf(12), 'Tipsport extraliga - DOMA')}${mainTable(rowsOf(14))}`, teams);
    expect(r[0].rows).toHaveLength(14);
  });
  it('hodnoty, pozice a teamId (klub bez shody → bez teamId)', () => {
    expect(t[0].rows[0]).toEqual({ pos: 1, name: 'HC Oceláři Třinec', teamId: 'cz-hockey:TRI', values: { z: 10, v: 5, vp: 0, pp: 1, p: 4, skore: '30:25', b: 16 } });
    expect(t[0].rows[1].teamId).toBe('cz-hockey:PCE');
    expect(t[0].rows[2]).not.toHaveProperty('teamId');
  });
  it('nbsp a mezery kolem dvojtečky ve skóre se normalizují', () => {
    const r = parseElhStandings(mainTable(rowsOf(10, (i) => (i === 0 ? ['10', '5', '0', '1', '4', '49 : 23', '16'] : []))), teams);
    expect(r[0].rows[0].values.skore).toBe('49:23');
  });
  it('řádek, který nejde zpracovat → chyba tvaru (tabulka se nezkrátí potichu)', () => {
    const bad = rowsOf(9) + srow('10', 'HC Olomouc', 'x');
    expect(() => parseElhStandings(mainTable(bad), teams)).toThrow();
    expect(() => parseElhStandings(mainTable(rowsOf(10, (i) => (i === 3 ? ['10', '5', '0', '1', '4', 'nic', '16'] : []))), teams)).toThrow();
  });
  it('pozice nejsou 1..N nebo N < 10 → chyba', () => {
    const gap = rowsOf(10).replace('<tr><td>5</td>', '<tr><td>6</td>');
    expect(() => parseElhStandings(mainTable(gap), teams)).toThrow();
    expect(() => parseElhStandings(mainTable(rowsOf(9)), teams)).toThrow();
  });
  it('platná, ale ještě prázdná tabulka (bez řádků / jen pomlčky) → []', () => {
    expect(parseElhStandings(mainTable(''), teams)).toEqual([]);
    const dashes = Array.from({ length: 14 }, (_, i) => srow(`${i + 1}`, CLUBS[i], '-', '-', '-', '-', '-', '-', '-')).join('');
    expect(parseElhStandings(mainTable(dashes), teams)).toEqual([]);
  });
  it('žádná tabulka s očekávanými hlavičkami → chyba', () => {
    expect(() => parseElhStandings('<html></html>', teams)).toThrow();
    expect(() => parseElhStandings(decoy, teams)).toThrow();
  });
});

describe('elhAdapter.fetch – tabulky', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const tableHtml = mainTable(rowsOf(14));
  it('úspěch: standings přítomné, teamId z týmů adapteru', async () => {
    const get = async (u: string) => (u.endsWith('/table') ? tableHtml : html);
    const r = await elhAdapter.fetch(now, get);
    expect(r.standings?.[0].id).toBe('cz-hockey');
    expect(r.standingsError).toBeUndefined();
    expect(r.standings![0].rows[1].teamId).toBe('cz-hockey:PCE');
  });
  it('selhání tabulky (HTTP) nezabije zápasy', async () => {
    const get = async (u: string) => { if (u.endsWith('/table')) throw new Error('boom'); return html; };
    const r = await elhAdapter.fetch(now, get);
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.standings).toBeUndefined();
    expect(r.standingsError).toContain('boom');
  });
  it('změněné HTML = standingsError; prázdná tabulka mimo sezónu = [] bez chyby', async () => {
    const changed = await elhAdapter.fetch(now, async (u: string) => (u.endsWith('/table') ? '<html></html>' : html));
    expect(changed.standingsError).toBeTruthy();
    const empty = await elhAdapter.fetch(now, async (u: string) => (u.endsWith('/table') ? mainTable('') : html));
    expect(empty.standings).toEqual([]);
    expect(empty.standingsError).toBeUndefined();
  });
});
