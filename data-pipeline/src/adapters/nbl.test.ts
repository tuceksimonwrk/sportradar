import { describe, expect, it } from 'vitest';
import { nblAdapter, parseNbl, parseNblStandings } from './nbl';

const row = (num: string, sort: string, home: string, away: string, score: string, extra = '') => `
<tr><td>6.</td><td>${num}</td><td data-sort="${sort}">10. 10. 2026<br>So 12:00</td>
<td><div class="d-flex"><img src="a.png"><div><div class="">${home}</div><div class="">${away}</div></div></div></td>
<td>${score}</td><td></td><td>Základní část</td><td>${extra}</td><td></td></tr>`;

const html = `<table><tbody>
${row('32', '2026-10-10-12-00', 'SK Slavia Praha ERA NBK', 'BK KVIS Pardubice', '<a href="/zapas/1"><div>105</div>60</a>')}
${row('74', '2026-10-14-17-30', 'BK KVIS Pardubice', 'BK Olomoucko', '-<br>-', '<a href="http://embed.tvcom.cz/49a2b094/">tv</a>')}
${row('75', '2026-10-25-18-00', 'ERA Basketball Nymburk', 'BK Opava', '-<br>-')}
${row('76', 'neplatne', 'A', 'B', '-')}
</tbody></table>`;

const now = new Date('2026-10-12T12:00:00Z');
describe('parseNbl', () => {
  const r = parseNbl(html, now);
  it('přeskočí nevalidní řádky; odehrané jdou jako výsledky', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['cz-basket:32-sk-slavia-praha-era-nbk', 'cz-basket:74-bk-kvis-pardubice', 'cz-basket:75-era-basketball-nymburk']);
  });
  it('převede pražský čas na UTC, mapuje týmy a TV Com', () => {
    expect(r.matches[1]).toMatchObject({
      sport: 'cz-basket', competition: 'NBL', startsAt: '2026-10-14T15:30:00.000Z',
      title: 'BK KVIS Pardubice – BK Olomoucko',
      teams: ['cz-basket:bk-kvis-pardubice', 'cz-basket:bk-olomoucko'],
      broadcasters: [{ name: 'TV Com', url: 'http://embed.tvcom.cz/49a2b094/' }],
    });
    expect(r.matches[2].startsAt).toBe('2026-10-25T17:00:00.000Z'); // po změně na zimní čas
    expect(r.matches[2].broadcasters).toEqual([]);
  });
  it('týmy zahrnou i odehrané řádky', () => {
    expect(r.teams.map((t) => t.name)).toContain('SK Slavia Praha ERA NBK');
  });
  it('změněné HTML nepadne', () => { expect(parseNbl('<html></html>', now).matches).toEqual([]); });
  it('odehraný zápas má result se skórem (domácí první)', () => {
    expect(r.matches[0]).toMatchObject({
      id: 'cz-basket:32-sk-slavia-praha-era-nbk', startsAt: '2026-10-10T10:00:00.000Z',
      result: { home: 105, away: 60, homeName: 'SK Slavia Praha ERA NBK', awayName: 'BK KVIS Pardubice' },
    });
    expect(r.matches[1]).not.toHaveProperty('result');
  });
  it('rozehraný zápas (< 3 h od začátku) se přeskočí, po 3 h ano', () => {
    const live = `<table><tbody>${row('40', '2026-10-12-12-00', 'A', 'B', '<a><div>10</div>8</a>')}</tbody></table>`;
    expect(parseNbl(live, new Date('2026-10-12T10:00:00Z')).matches).toEqual([]);   // 12:00 Praha = 10:00Z
    expect(parseNbl(live, new Date('2026-10-12T12:59:00Z')).matches).toEqual([]);
    expect(parseNbl(live, new Date('2026-10-12T13:00:00Z')).matches).toHaveLength(1);
  });
  it('starší než 14 dní se přeskočí', () => {
    const old = `<table><tbody>${row('41', '2026-09-20-12-00', 'A', 'B', '<a><div>10</div>8</a>')}</tbody></table>`;
    expect(parseNbl(old, now).matches).toEqual([]);
  });
  it('skóre s jediným číslem se přeskočí', () => {
    const one = `<table><tbody>${row('42', '2026-10-10-12-00', 'C', 'D', '<a><div>10</div></a>')}</tbody></table>`;
    expect(parseNbl(one, now).matches).toEqual([]);
  });
});

const nth = (s: string) => `<th>${s}</th>`;
const NBL_HEAD = `<thead><tr>${['pořadí'].map(nth).join('')}<th colspan="2">tým</th>${['z', 'v', 'p', 'úspěšnost', 'vstřeleno', 'obdrženo', 'rozdíl', 'doma', 'venku'].map(nth).join('')}</tr></thead>`;
const nrow = (pos: string, name: string, z: string, v: string, p: string, pct: string, vs: string, ob: string) => `
<tr><td class="font-weight-bold"> ${pos} </td><td><div class="d-flex"><a class="d-block"><span class="sr-only">Posun v tabulce</span></a><img alt=""></div></td>
<td><a href="/tym/x?y=2026" class="d-md-flex">${name}</a></td><td>${z}</td><td class="text-center">${v}</td><td class="text-center">${p}</td>
<td class="text-center"> ${pct} </td><td class="text-right">${vs}</td><td class="text-right">${ob}</td><td>0</td><td>3</td><td>3</td></tr>`;
const nblTable = `
<table><thead><tr><th>pořadí</th><th>tým</th><th>S</th><th>z</th><th>v</th><th>p</th><th>B</th><th>tituly</th></tr></thead><tbody>
<tr><td>1.</td><td><a href="/tym/era">ERA Basketball Nymburk</a></td><td>1</td></tr></tbody></table>
<table>${NBL_HEAD}<tbody>
${nrow('1.', 'SK Slavia Praha ERA NBK', '6', '6', '0', '100.0', '604', '454')}
${nrow('2.', 'BK KVIS Pardubice', '6', '5', '1', '83.3', '535', '496')}
${nrow('3.', 'Nový Tým', '0', '0', '0', '-', '0', '0')}
${nrow('4.', 'Vadný Tým', 'a', 'b', 'c', '-', '-', '-')}
<tr><td>5.</td><td>bez odkazu</td></tr>
</tbody></table>`;

describe('parseNblStandings', () => {
  const t = parseNblStandings(nblTable);
  it('vybere tabulku podle hlaviček (doma/venku), ne historickou', () => {
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: 'cz-basket', sport: 'cz-basket', title: 'NBL' });
    expect(t[0].columns.map((c) => c.label)).toEqual(['Z', 'V', 'P', 'Skóre']);
    expect(t[0].rows.map((r) => r.name)).toEqual(['SK Slavia Praha ERA NBK', 'BK KVIS Pardubice', 'Nový Tým']);
  });
  it('hodnoty, teamId přes slugify, vadné řádky zahozeny', () => {
    expect(t[0].rows[0]).toEqual({ pos: 1, name: 'SK Slavia Praha ERA NBK', teamId: 'cz-basket:sk-slavia-praha-era-nbk', values: { z: 6, v: 6, p: 0, skore: '604:454' } });
    expect(t[0].rows[2].values).toEqual({ z: 0, v: 0, p: 0, skore: '0:0' });
  });
  it('změněné / prázdné HTML → []', () => {
    expect(parseNblStandings('<html></html>')).toEqual([]);
    expect(parseNblStandings('<table><thead><tr><th>pořadí</th><th>tým</th></tr></thead></table>')).toEqual([]);
  });
});

describe('nblAdapter.fetch – tabulky', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('úspěch: standings přítomné', async () => {
    const r = await nblAdapter.fetch(now, async (u: string) => (u.endsWith('/tabulka') ? nblTable : html));
    expect(r.standings?.[0].id).toBe('cz-basket');
    expect(r.standingsError).toBeUndefined();
  });
  it('selhání tabulky nezabije zápasy', async () => {
    const r = await nblAdapter.fetch(now, async (u: string) => { if (u.endsWith('/tabulka')) throw new Error('boom'); return html; });
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.standings).toBeUndefined();
    expect(r.standingsError).toContain('boom');
  });
});
