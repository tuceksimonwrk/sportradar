import { reminderLabel, type Match } from '@sportradar/shared';
import { CalendarPlus } from 'lucide-react';
import { downloadMatch } from '../lib/calendar';
import { useReminder } from './ReminderContext';

/** Kompaktní tlačítko „Přidat do kalendáře“ (stáhne .ics jednoho zápasu s upozorněním 1 h předem). */
export function CalendarButton({ match, className = '' }: { match: Match; className?: string }) {
  const { minutes } = useReminder();
  return (
    <button type="button" className={`calbtn ${className}`.trim()} aria-label="Přidat zápas do kalendáře"
      title={`Přidat do kalendáře (${minutes ? `upozornění ${reminderLabel(minutes)} předem` : 'bez upozornění'})`} onClick={() => downloadMatch(match, minutes)}>
      <CalendarPlus size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
