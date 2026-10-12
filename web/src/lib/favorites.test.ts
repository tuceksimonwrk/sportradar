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
