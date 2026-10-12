import { describe, expect, it } from 'vitest';
import { elhRoundNumbers, parseElhRound } from './elh';

const side = (long: string, short: string) =>
  `<div class="preview__name__wrapper"><a href="#"><span class="preview__name--long">${long}</span><span class="preview__name--short">${short}</span></a></div>`;
const upcoming = (id: string, home: [string, string], away: [string, string], dow: string, date: string, time: string) => `
<tr data-href="/zapas/${id}" class="js-preview__link"><td class="preview__name text-right">${side(...home)}</td>
<td class="preview__center preview__desktop" colspan="3"><div class="box-snow row"><div class="col-1_3">${dow}</div><div class="col-1_3">${date}</div><div class="col-1_3">${time}</div></div></td>
<td class="preview__name">${side(...away)}</td></tr>`;
const played = (id: string, home: [string, string], away: [string, string]) => `
<tr data-href="/zapas/${id}" class="js-preview__link"><td class="preview__name text-right">${side(...home)}</td>
<td class="preview__score"><span class="blue">4</span></td><td class="preview__period"><span class="match-start-time">ÚT 22. 09.</span></td>
<td class="preview__score"><span class="blue">5</span></td><td class="preview__name">${side(...away)}</td></tr>`;

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

describe('elhRoundNumbers', () => {
  it('vrátí unikátní čísla kol', () => { expect(elhRoundNumbers(html)).toEqual([1, 2]); });
});
