import { describe, expect, it } from 'vitest';
import { countUpValue, easeOutCubic, staggerIndex } from './motion';

describe('countUpValue', () => {
  it('začátek 0, konec přesně cíl', () => {
    expect(countUpValue(123, 0)).toBe(0);
    expect(countUpValue(123, 1)).toBe(123);
    expect(countUpValue(5, 2)).toBe(5);
  });
  it('monotónní a celočíselné', () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = countUpValue(112, t);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('easeOutCubic omezí t do [0, 1]', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(3)).toBe(1);
  });
});

describe('staggerIndex', () => {
  it('jen prvních 8', () => {
    expect(staggerIndex(0)).toBe(0);
    expect(staggerIndex(7)).toBe(7);
    expect(staggerIndex(8)).toBeUndefined();
    expect(staggerIndex(-1)).toBeUndefined();
  });
});
