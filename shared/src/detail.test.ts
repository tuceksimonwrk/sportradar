import { describe, expect, it } from 'vitest';
import { DETAIL_WINDOW_HOURS, detailFileName, detailPath, isDetailIndex, isMatchDetail } from './detail';

describe('detailFileName / detailPath', () => {
  it('stejný sanitizér jako kalendáře + .json', () => {
    expect(detailFileName('nhl:2026020098')).toBe('nhl_2026020098.json');
    expect(detailFileName('f1:2026-18-Race')).toBe('f1_2026-18-Race.json');
    expect(detailFileName('cz-basket:74-bk-kvis-pardubice')).toBe('cz-basket_74-bk-kvis-pardubice.json');
    expect(detailFileName('a/b?c')).toBe('a_b_c.json');
  });
  it('cesta relativně k data/', () => {
    expect(detailPath('nba:401909834')).toBe('detail/nba_401909834.json');
  });
  it('okno 36 h', () => { expect(DETAIL_WINDOW_HOURS).toBe(36); });
});

describe('isMatchDetail / isDetailIndex', () => {
  it('rozpozná platný tvar', () => {
    expect(isMatchDetail({ matchId: 'nhl:1', sport: 'nhl', generatedAt: 'x', source: 'NHL', stats: [], notes: [] })).toBe(true);
    expect(isDetailIndex({ generatedAt: 'x', ids: ['nhl:1'] })).toBe(true);
  });
  it('odmítne nesmysl', () => {
    expect(isMatchDetail(null)).toBe(false);
    expect(isMatchDetail({ matchId: 'nhl:1', sport: 'nhl', stats: 'x', notes: [] })).toBe(false);
    expect(isDetailIndex({ ids: [1] })).toBe(false);
    expect(isDetailIndex('[]')).toBe(false);
  });
});
