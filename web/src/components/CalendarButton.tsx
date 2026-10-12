import type { Match } from '@sportradar/shared';
import { CalendarPlus } from 'lucide-react';
import { downloadMatch } from '../lib/calendar';

/** Kompaktní tlačítko „Přidat do kalendáře“ (stáhne .ics jednoho zápasu s upozorněním 1 h předem). */
export function CalendarButton({ match, className = '' }: { match: Match; className?: string }) {
  return (
    <button type="button" className={`calbtn ${className}`.trim()} aria-label="Přidat zápas do kalendáře"
      title="Přidat do kalendáře (upozornění 1 h předem)" onClick={() => downloadMatch(match)}>
      <CalendarPlus size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
