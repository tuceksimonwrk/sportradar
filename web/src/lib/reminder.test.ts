import { describe, expect, it } from 'vitest';
import { loadReminder, saveReminder, sanitizeReminder } from './reminder';

const mem = (v?: string) => { let s = v; return { getItem: () => s ?? null, setItem: (_: string, x: string) => { s = x; }, get: () => s }; };

describe('sanitizeReminder', () => {
  it('platné hodnoty projdou, ostatní → 60', () => {
    for (const n of [0, 15, 30, 60, 120]) expect(sanitizeReminder(n)).toBe(n);
    for (const n of [-5, 45, '15', null, undefined, NaN, {}]) expect(sanitizeReminder(n)).toBe(60);
  });
});
describe('load/save', () => {
  it('roundtrip', () => { const s = mem(); saveReminder(s, 30); expect(loadReminder(s)).toBe(30); });
  it('0 se uloží a načte (ne jako výchozí)', () => { const s = mem(); saveReminder(s, 0); expect(loadReminder(s)).toBe(0); });
  it('poškozená hodnota / bez úložiště → 60', () => {
    expect(loadReminder(mem('{oops'))).toBe(60);
    expect(loadReminder(mem('"abc"'))).toBe(60);
    expect(loadReminder(mem('7'))).toBe(60);
    expect(loadReminder(undefined)).toBe(60);
    expect(loadReminder({ getItem: () => { throw new Error('x'); } })).toBe(60);
  });
  it('save nevyhodí při selhání úložiště', () => {
    expect(() => saveReminder({ setItem: () => { throw new Error('quota'); } }, 15)).not.toThrow();
    expect(() => saveReminder(undefined, 15)).not.toThrow();
  });
});
