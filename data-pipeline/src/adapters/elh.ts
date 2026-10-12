import * as cheerio from 'cheerio';
import type { Match, Team } from '@sportradar/shared';
import type { Adapter, AdapterResult } from '../types';
import { combine, getText, pragueToUtcIso } from '../util';

const BASE = 'https://www.hokej.cz/tipsport-extraliga/zapasy';

function inferYear(month: number, day: number, now: Date): number {
  const y = now.getUTCFullYear();
  return Date.UTC(y, month - 1, day) < now.getTime() - 90 * 86400_000 ? y + 1 : y;
}

export function elhRoundNumbers(html: string): number[] {
  const nums = [...html.matchAll(/matchList-view-round-round=(\d+)/g)].map((m) => Number(m[1]));
  return [...new Set(nums)].sort((a, b) => a - b);
}

export function parseElhRound(html: string, now: Date): AdapterResult {
  const $ = cheerio.load(html);
  const matches: Match[] = [];
  const teams = new Map<string, Team>();
  $('tr.js-preview__link').each((_, tr) => {
    const id = /\/zapas\/(\d+)/.exec($(tr).attr('data-href') ?? '')?.[1];
    const sides = $(tr).find('.preview__name__wrapper').map((__, w) => ({
      long: $(w).find('.preview__name--long').first().text().trim(),
      short: $(w).find('.preview__name--short').first().text().trim(),
    })).get();
    if (!id || sides.length < 2 || sides.some((s) => !s.long || !s.short)) return;
    const [home, away] = sides;
    for (const s of sides) teams.set(`cz-hockey:${s.short}`, { id: `cz-hockey:${s.short}`, sport: 'cz-hockey', name: s.long });
    const cells = $(tr).find('td.preview__desktop .col-1_3').map((__, c) => $(c).text().trim()).get();
    if (cells.length < 3) return; // odehráno
    const d = /^(\d{1,2})\.\s*(\d{1,2})\.$/.exec(cells[1]);
    const t = /^(\d{1,2}):(\d{2})$/.exec(cells[2]);
    if (!d || !t) return; // odložený zápas bez data/času
    const [day, month] = [Number(d[1]), Number(d[2])];
    matches.push({
      id: `cz-hockey:${id}`, sport: 'cz-hockey', competition: 'Tipsport extraliga',
      startsAt: pragueToUtcIso(inferYear(month, day, now), month, day, Number(t[1]), Number(t[2])),
      title: `${home.long} – ${away.long}`, teams: [`cz-hockey:${home.short}`, `cz-hockey:${away.short}`], broadcasters: [],
    });
  });
  return { matches, teams: [...teams.values()] };
}

export const elhAdapter = {
  sport: 'cz-hockey' as const,
  async fetch(now, get: (url: string) => Promise<string> = getText) {
    const first = await get(BASE);
    const rounds = elhRoundNumbers(first);
    if (rounds.length === 0) throw new Error('ELH: nenalezena žádná kola (změněné HTML?)');
    const parts: AdapterResult[] = [];
    for (let i = 0; i < rounds.length; i += 4) {
      const batch = await Promise.allSettled(rounds.slice(i, i + 4).map((r) => get(`${BASE}?matchList-view-round-round=${r}`)));
      for (const b of batch) {
        if (b.status === 'rejected') throw new Error(`ELH: kolo se nepodařilo stáhnout (${b.reason?.message ?? b.reason})`);
        parts.push(parseElhRound(b.value, now));
      }
    }
    return combine(parts);
  },
} satisfies Adapter;
