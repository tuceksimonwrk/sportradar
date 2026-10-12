import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import type { Match } from './index';
import { buildIcs, calendarFileName, calendarPath, escapeIcsText, foldLine, isReminderOption, matchDurationMinutes, REMINDER_MINUTES, REMINDER_OPTIONS, reminderLabel, reminderText } from './calendar';

const NOW = new Date('2026-10-12T10:00:00Z');
const base: Match = {
  id: 'cz-hockey:123', sport: 'cz-hockey', competition: 'Tipsport extraliga', startsAt: '2026-10-15T17:30:00.000Z',
  title: 'HC Dynamo Pardubice – HC Sparta Praha', teams: ['cz-hockey:PCE', 'cz-hockey:SPA'],
  broadcasters: [{ name: 'Oneplay' }, { name: 'ČT sport' }],
  venue: { name: 'Enteria arena', city: 'Pardubice' },
};
const opts = { calName: 'Sportradar – test', now: NOW, siteUrl: 'https://x.github.io/sr/' };
const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('calendarFileName / calendarPath', () => {
  it('nahradí ":" a nepovolené znaky', () => {
    expect(calendarFileName('nhl:PIT')).toBe('nhl_PIT');
    expect(calendarFileName('cz-basket:bk-kvis-pardubice')).toBe('cz-basket_bk-kvis-pardubice');
    expect(calendarFileName('f1')).toBe('f1');
    expect(calendarFileName('a/b c..č')).toBe('a_b_c.._');
  });
  it('cesta přidává .ics', () => expect(calendarPath('nhl:PIT')).toBe('cal/nhl_PIT.ics'));
});

describe('matchDurationMinutes', () => {
  const d = (sport: Match['sport'], id: string) => matchDurationMinutes({ sport, id });
  it('F1 podle sezení', () => {
    expect(d('f1', 'f1:2026-5-Race')).toBe(120);
    for (const s of ['Sprint', 'Qualifying', 'SprintQualifying', 'FP1']) expect(d('f1', `f1:2026-5-${s}`)).toBe(60);
  });
  it('ostatní sporty', () => {
    expect(d('nhl', 'nhl:1')).toBe(150); expect(d('nba', 'nba:1')).toBe(150); expect(d('cz-hockey', 'x')).toBe(150);
    expect(d('cz-basket', 'x')).toBe(120);
  });
});

describe('escapování a skládání', () => {
  it('escapuje zpětné lomítko, středník, čárku a nové řádky', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
  it('skládá na 75 oktetů bez dělení UTF-8 znaku', () => {
    const line = 'SUMMARY:' + 'Žluťoučký kůň úpěl ďábelské ódy '.repeat(6);
    const parts = foldLine(line);
    expect(parts.length).toBeGreaterThan(2);
    parts.forEach((p, i) => {
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(' ')).toBe(true);
      expect(p).not.toContain('�');
    });
    expect(parts[0] + parts.slice(1).map((p) => p.slice(1)).join('')).toBe(line);
  });
  it('krátký řádek se neskládá', () => expect(foldLine('ABC')).toEqual(['ABC']));
});

describe('buildIcs', () => {
  const ics = buildIcs([base], opts);
  it('CRLF a hlavička', () => {
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const l of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sportradar//CS//', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-TIMEZONE:UTC', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H']) expect(ics).toContain(l + '\r\n');
    expect(unfold(ics)).toContain('X-WR-CALNAME:Sportradar – test');
  });
  it('řádky max 75 oktetů', () => {
    const long = buildIcs([{ ...base, title: 'Velmi dlouhý český název zápasu s diakritikou žluťoučký kůň '.repeat(4) }], opts);
    for (const l of long.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
  it('událost: UID, DTSTAMP, DTSTART/DTEND, STATUS, TRANSP', () => {
    expect(ics).toContain('UID:cz-hockey:123@sportradar');
    expect(ics).toContain('DTSTAMP:20261012T100000Z');
    expect(ics).toContain('DTSTART:20261015T173000Z');
    expect(ics).toContain('DTEND:20261015T200000Z'); // +150 min
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('TRANSP:OPAQUE');
  });
  it('UID je stabilní napříč generacemi', () => {
    const later = buildIcs([base], { ...opts, now: new Date('2026-10-13T00:00:00Z') });
    const uid = (s: string) => /UID:(.*)\r\n/.exec(s)![1];
    expect(uid(later)).toBe(uid(ics));
  });
  it('VALARM 1 h předem', () => {
    expect(REMINDER_MINUTES).toBe(60);
    expect(ics).toContain('BEGIN:VALARM\r\nACTION:DISPLAY\r\n');
    expect(ics).toContain('TRIGGER:-PT60M');
    expect(unfold(ics)).toContain('DESCRIPTION:HC Dynamo Pardubice – HC Sparta Praha začíná za 1 hodinu');
    expect(buildIcs([base], { ...opts, reminderMinutes: 15 })).toContain('TRIGGER:-PT15M');
  });
  it('místo, vysílání a web', () => {
    const t = unfold(ics);
    expect(t).toContain('LOCATION:Enteria arena\\, Pardubice');
    expect(t).toContain('DESCRIPTION:Tipsport extraliga\\nKde sledovat: Oneplay\\, ČT sport\\nhttps://x.github.io/sr/');
  });
  it('bez venue / vysílání / siteUrl', () => {
    const t = unfold(buildIcs([{ ...base, venue: undefined, broadcasters: [] }], { calName: 'x', now: NOW }));
    expect(t).not.toContain('LOCATION');
    expect(t).not.toContain('Kde sledovat');
    expect(t).toContain('DESCRIPTION:Tipsport extraliga\r\n');
  });
  it('prázdný seznam → platný kalendář bez událostí', () => {
    const e = buildIcs([], opts);
    expect(e).not.toContain('VEVENT');
    expect(new ICAL.Component(ICAL.parse(e)).getAllSubcomponents('vevent')).toHaveLength(0);
  });
  it('F1 session: titul a délka', () => {
    const f1: Match = { id: 'f1:2026-5-Race', sport: 'f1', competition: 'Formule 1', startsAt: '2026-10-18T19:00:00.000Z', title: 'GP USA – Závod', teams: [], broadcasters: [] };
    expect(buildIcs([f1], opts)).toContain('DTEND:20261018T210000Z');
  });
});

describe('RFC validita (ical.js)', () => {
  it('parsuje události, escapování i alarmy', () => {
    const title = 'Čeština; s, čárkou \\ a řádek žluťoučký kůň úpěl ďábelské ódy opakovaně dokola a dokola';
    const ics = buildIcs([{ ...base, title }, { ...base, id: 'cz-hockey:124', startsAt: '2026-10-16T17:30:00.000Z' }], opts);
    const cal = new ICAL.Component(ICAL.parse(ics));
    expect(cal.getFirstPropertyValue('version')).toBe('2.0');
    const events = cal.getAllSubcomponents('vevent');
    expect(events).toHaveLength(2);
    const ev = new ICAL.Event(events[0]);
    expect(ev.summary).toBe(title);
    expect(ev.uid).toBe('cz-hockey:123@sportradar');
    expect(ev.startDate.toJSDate().toISOString()).toBe('2026-10-15T17:30:00.000Z');
    expect(ev.endDate.toJSDate().toISOString()).toBe('2026-10-15T20:00:00.000Z');
    expect(ev.location).toBe('Enteria arena, Pardubice');
    const alarm = events[0].getFirstSubcomponent('valarm')!;
    expect(alarm.getFirstPropertyValue('action')).toBe('DISPLAY');
    expect(String(alarm.getFirstPropertyValue('trigger'))).toBe('-PT60M');
  });
});

describe('možnosti předstihu', () => {
  it('REMINDER_OPTIONS a výchozí hodnota', () => {
    expect([...REMINDER_OPTIONS]).toEqual([0, 15, 30, 60, 120]);
    expect(isReminderOption(REMINDER_MINUTES)).toBe(true);
  });
  it('isReminderOption', () => {
    for (const n of [0, 15, 30, 60, 120]) expect(isReminderOption(n)).toBe(true);
    for (const n of [-1, 10, 45, 61, NaN, '60', null, undefined]) expect(isReminderOption(n)).toBe(false);
  });
  it('reminderLabel česky', () => {
    expect(REMINDER_OPTIONS.map(reminderLabel)).toEqual(['Bez připomínky', '15 minut', '30 minut', '1 hodinu', '2 hodiny']);
  });
  it('reminderText pro VALARM', () => {
    expect(reminderText('A – B', 15)).toBe('A – B začíná za 15 minut');
    expect(reminderText('A – B', 120)).toBe('A – B začíná za 2 hodiny');
  });
  it('0 → žádný VALARM; ostatní → správný TRIGGER a popis', () => {
    expect(buildIcs([base], { ...opts, reminderMinutes: 0 })).not.toContain('VALARM');
    expect(buildIcs([base], { ...opts, reminderMinutes: 0 })).not.toContain('TRIGGER');
    const t = unfold(buildIcs([base], { ...opts, reminderMinutes: 120 }));
    expect(t).toContain('TRIGGER:-PT120M');
    expect(t).toContain('začíná za 2 hodiny');
    expect(buildIcs([base], { ...opts, reminderMinutes: 30 })).toContain('TRIGGER:-PT30M');
  });
});
