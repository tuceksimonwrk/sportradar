import { describe, expect, it } from 'vitest';
import { parseNbl } from './nbl';

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
  it('starší než 14 dní se přeskočí; skóre se dvěma čísly je nutné', () => {
    const old = `<table><tbody>${row('41', '2026-09-20-12-00', 'A', 'B', '<a><div>10</div>8</a>')}${row('42', '2026-10-10-12-00', 'C', 'D', '<a><div>10</div></a>')}</tbody></table>`;
    expect(parseNbl(old, now).matches).toEqual([]);
  });
});
