import { detailFileName, type Match, type MatchDetail, type Sport } from '@sportradar/shared';
import { failedDetailSports, pickDetail, type DetailBuilder, type DetailContext } from './common';
import { elhDetail, nblDetail } from './czech';
import { f1Detail } from './f1';
import { footballDetail } from './football';
import { nbaDetail } from './nba';
import { nhlDetail } from './nhl';

export { buildDetailIndex, createFetcher, requestsBySport, selectDetailMatches, staleDetailFiles } from './common';

export const DETAIL_BUILDERS: Record<Sport, DetailBuilder> = {
  nhl: nhlDetail, nba: nbaDetail, f1: f1Detail, 'cz-hockey': elhDetail, 'cz-basket': nblDetail,
  football: footballDetail,
};

export interface DetailRun {
  files: Map<string, MatchDetail>;          // název souboru → detail (čerstvý nebo ponechaný předchozí)
  kept: number;                             // kolik detailů je z předchozího běhu
  failedSports: Sport[];                    // sporty, u nichž selhaly všechny detaily v okně
  warnings: string[];                       // max jedno varování na sport
  counts: Partial<Record<Sport, { ok: number; total: number }>>;
}

/**
 * Detaily pro vybrané zápasy. Chyba jednoho detailu se jen zaznamená; má-li zápas předchozí detail
 * (`readPrev(soubor)` – lokálně nebo z PREV_DATA_URL), ponechá se.
 */
export async function generateDetails(
  selected: Match[], ctx: DetailContext,
  readPrev: (file: string) => Promise<MatchDetail | null>,
  builders: Record<Sport, DetailBuilder> = DETAIL_BUILDERS,
): Promise<DetailRun> {
  const results = await Promise.all(selected.map(async (m) => {
    let fresh: MatchDetail | Error;
    try { fresh = await builders[m.sport](m, ctx); } catch (e) { fresh = e instanceof Error ? e : new Error(String(e)); }
    let prev: MatchDetail | null = null;
    if (fresh instanceof Error) { try { prev = await readPrev(detailFileName(m.id)); } catch { prev = null; } }
    return { m, fresh, ...pickDetail(fresh, prev, m.id) };
  }));
  const files = new Map<string, MatchDetail>();
  const counts: DetailRun['counts'] = {};
  const errors = new Map<Sport, { first: string; n: number }>();
  let kept = 0;
  for (const r of results) {
    const c = counts[r.m.sport] ?? (counts[r.m.sport] = { ok: 0, total: 0 });
    c.total++;
    if (r.fresh instanceof Error) {
      const e = errors.get(r.m.sport);
      if (e) e.n++; else errors.set(r.m.sport, { first: `detail ${r.m.id}: ${r.fresh.message}`, n: 1 });
    } else c.ok++;
    if (r.detail) { files.set(detailFileName(r.m.id), r.detail); if (r.kept) kept++; }
  }
  const warnings = [...errors.values()].map((e) => (e.n > 1 ? `${e.first} (+${e.n - 1} dalších)` : e.first));
  const failedSports = failedDetailSports(results.map((r) => ({ sport: r.m.sport, ok: !(r.fresh instanceof Error) })));
  return { files, kept, failedSports, warnings, counts };
}
