import * as cheerio from 'cheerio';
import type { Match, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { getText, pragueToUtcIso, slugify } from '../util';

export function parseNbl(html: string): AdapterResult {
  const $ = cheerio.load(html);
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  $('tbody tr').each((_, tr) => {
    const tds = $(tr).children('td');
    if (tds.length < 6) return;
    const num = $(tds[1]).text().trim();
    const sort = $(tds[2]).attr('data-sort') ?? '';
    const names = $(tds[3]).find('div.d-flex > div').last().children('div').map((__, d) => $(d).text().trim()).get();
    if (!num || names.length < 2 || !names[0] || !names[1]) return;
    const [home, away] = names;
    const ids = [home, away].map((n) => {
      const id = `cz-basket:${slugify(n)}`;
      teams.set(id, { id, sport: 'cz-basket', name: n });
      return id;
    });
    if (/\d/.test($(tds[4]).text())) return; // odehráno
    const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/.exec(sort);
    if (!m) return;
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    const tv = $(tr).find('a[href*="embed.tvcom.cz"]').first().attr('href');
    matches.push({
      id: `cz-basket:${num}`, sport: 'cz-basket', competition: 'NBL',
      startsAt: pragueToUtcIso(y, mo, d, h, mi), title: `${home} – ${away}`, teams: ids,
      broadcasters: tv ? [{ name: 'TV Com', url: tv }] : [],
    });
  });
  return { matches, teams: [...teams.values()] };
}

export const nblAdapter: Adapter = {
  sport: 'cz-basket',
  async fetch() {
    return parseNbl(await getText('https://www.nbl.basketball/zapasy'));
  },
};
