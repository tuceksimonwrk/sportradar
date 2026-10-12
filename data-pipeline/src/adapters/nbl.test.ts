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

describe('parseNbl', () => {
  const r = parseNbl(html);
  it('přeskočí odehrané a nevalidní řádky', () => {
    expect(r.matches.map((m) => m.id)).toEqual(['cz-basket:74', 'cz-basket:75']);
  });
  it('převede pražský čas na UTC, mapuje týmy a TV Com', () => {
    expect(r.matches[0]).toMatchObject({
      sport: 'cz-basket', competition: 'NBL', startsAt: '2026-10-14T15:30:00.000Z',
      title: 'BK KVIS Pardubice – BK Olomoucko',
      teams: ['cz-basket:bk-kvis-pardubice', 'cz-basket:bk-olomoucko'],
      broadcasters: [{ name: 'TV Com', url: 'http://embed.tvcom.cz/49a2b094/' }],
    });
    expect(r.matches[1].startsAt).toBe('2026-10-25T17:00:00.000Z'); // po změně na zimní čas
    expect(r.matches[1].broadcasters).toEqual([]);
  });
  it('týmy zahrnou i odehrané řádky', () => {
    expect(r.teams.map((t) => t.name)).toContain('SK Slavia Praha ERA NBK');
  });
  it('změněné HTML nepadne', () => { expect(parseNbl('<html></html>').matches).toEqual([]); });
});
