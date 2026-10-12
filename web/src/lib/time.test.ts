import { describe, expect, it } from 'vitest';
import { dayKey, dayLabel, formatCountdown, formatTime, isStale } from './time';

describe('dayKey / formatTime podle pásma', () => {
  const iso = '2026-10-15T02:30:00.000Z';
  it('Praha (CEST): 15. 10. 04:30', () => {
    expect(dayKey(iso, 'Europe/Prague')).toBe('2026-10-15');
    expect(formatTime(iso, 'Europe/Prague')).toBe('04:30');
  });
  it('New York: ještě 14. 10. 22:30', () => {
    expect(dayKey(iso, 'America/New_York')).toBe('2026-10-14');
    expect(formatTime(iso, 'America/New_York')).toBe('22:30');
  });
});

describe('dayLabel', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  it('Dnes / Zítra / datum', () => {
    expect(dayLabel('2026-10-12', now, 'Europe/Prague')).toBe('Dnes');
    expect(dayLabel('2026-10-13', now, 'Europe/Prague')).toBe('Zítra');
    expect(dayLabel('2026-10-16', now, 'Europe/Prague')).toMatch(/16\.\s*10\./);
  });
});

describe('formatCountdown', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  it('formáty', () => {
    expect(formatCountdown('2026-10-12T10:12:00Z', now)).toBe('za 12 min');
    expect(formatCountdown('2026-10-12T13:20:00Z', now)).toBe('za 3 h 20 min');
    expect(formatCountdown('2026-10-14T13:00:00Z', now)).toBe('za 2 d 3 h');
    expect(formatCountdown('2026-10-12T09:00:00Z', now)).toBe('probíhá');
  });
});

describe('isStale', () => {
  it('starší než 6 h', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    expect(isStale('2026-10-12T05:59:00Z', now)).toBe(true);
    expect(isStale('2026-10-12T07:00:00Z', now)).toBe(false);
  });
  it('neplatné generatedAt → stale', () => {
    expect(isStale('nonsense', new Date('2026-10-12T12:00:00Z'))).toBe(true);
  });
});
