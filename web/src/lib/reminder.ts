import { REMINDER_MINUTES, isReminderOption } from '@sportradar/shared';

const KEY = 'sportradar:reminder:v1';

/** Neplatná hodnota → výchozí předstih (60 min). */
export function sanitizeReminder(v: unknown): number {
  return isReminderOption(v) ? v : REMINDER_MINUTES;
}

export function loadReminder(storage?: Pick<Storage, 'getItem'>): number {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? sanitizeReminder(JSON.parse(raw)) : REMINDER_MINUTES;
  } catch { return REMINDER_MINUTES; }
}

export function saveReminder(storage: Pick<Storage, 'setItem'> | undefined, minutes: number): void {
  try { storage?.setItem(KEY, JSON.stringify(minutes)); } catch { /* storage nemusí být dostupné */ }
}
