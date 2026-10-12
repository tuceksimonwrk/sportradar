import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, loadFavorites, sanitizeFavorites, saveFavorites } from './favorites';

describe('sanitizeFavorites', () => {
  it('ponechá jen platná, unikátní id', () => {
    expect(sanitizeFavorites(['f1', 'nhl:PIT', 'f1', '<script>', 5, '', 'a b'])).toEqual(['f1', 'nhl:PIT']);
  });
  it('ne-pole → prázdné; limit 300', () => {
    expect(sanitizeFavorites({ x: 1 })).toEqual([]);
    expect(sanitizeFavorites(Array.from({ length: 1000 }, (_, i) => `t${i}`))).toHaveLength(300);
  });
});

describe('oblíbené soutěže (league:<id> s tečkou)', () => {
  it('league:eng.1 a fotbalové týmy projdou, sdílení je zachová', () => {
    expect(sanitizeFavorites(['league:eng.1', 'league:uefa.champions', 'football:382', 'football:cz_sk-slavia-praha', '.x']))
      .toEqual(['league:eng.1', 'league:uefa.champions', 'football:382', 'football:cz_sk-slavia-praha']);
    expect(decodeShare(encodeShare(['league:eng.1', 'football']))).toEqual(['league:eng.1', 'football']);
  });
});

describe('ID délka – hranice', () => {
  it('100 znaků přijato, 101 odmítnuto', () => {
    const ok = 'a'.repeat(100);
    const tooLong = 'a'.repeat(101);
    expect(sanitizeFavorites([ok, tooLong])).toEqual([ok]);
  });
});

describe('load/save', () => {
  it('poškozený JSON → prázdné', () => {
    expect(loadFavorites({ getItem: () => '{nejson' })).toEqual([]);
    expect(loadFavorites({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
    expect(loadFavorites(undefined)).toEqual([]);
  });
  it('round trip', () => {
    let stored = '';
    saveFavorites({ setItem: (_k, v) => { stored = v; } }, ['f1', 'nhl:PIT']);
    expect(loadFavorites({ getItem: () => stored })).toEqual(['f1', 'nhl:PIT']);
  });
  it('save nepadne, když storage vyhazuje', () => {
    expect(() => saveFavorites({ setItem: () => { throw new Error('quota'); } }, ['f1'])).not.toThrow();
  });
});

describe('share', () => {
  it('encode/decode', () => {
    expect(encodeShare(['f1', 'cz-hockey:PCE'])).toBe('#fav=f1,cz-hockey:PCE');
    expect(decodeShare('#fav=f1,cz-hockey:PCE')).toEqual(['f1', 'cz-hockey:PCE']);
  });
  it('hash bez fav → null; nesmysly se vyčistí', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('#jinak=1')).toBeNull();
    expect(decodeShare('#fav=%E0%A4%A')).toEqual([]);
    expect(decodeShare('#fav=<b>,f1,,x y')).toEqual(['f1']);
  });
  it('obrovský hash je omezen', () => {
    const big = '#fav=' + Array.from({ length: 5000 }, (_, i) => `t${i}`).join(',');
    expect(decodeShare(big)!.length).toBe(300);
  });
});
