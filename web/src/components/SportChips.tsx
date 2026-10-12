import type { Sport } from '@sportradar/shared';
import { SPORTS, SPORT_LABELS } from '@sportradar/shared';
import { SportIcon } from './icons/SportIcon';

export function SportChips({ sport, onSport, withAll = true }: { sport: Sport | 'all'; onSport: (s: Sport | 'all') => void; withAll?: boolean }) {
  return (
    <div className="chips" role="group" aria-label="Filtr sportů">
      {(withAll ? (['all', ...SPORTS] as const) : SPORTS).map((s) => (
        <button key={s} data-sport={s} className={`chip${sport === s ? ' chip--on' : ''}`} aria-pressed={sport === s} onClick={() => onSport(s)}>
          <SportIcon sport={s} size={16} />
          {s === 'all' ? 'Vše' : SPORT_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
