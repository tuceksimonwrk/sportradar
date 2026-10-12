import type { Sport } from '@sportradar/shared';
import { SPORTS, SPORT_LABELS } from '@sportradar/shared';

export function SportChips({ sport, onSport, withAll = true }: { sport: Sport | 'all'; onSport: (s: Sport | 'all') => void; withAll?: boolean }) {
  return (
    <div className="chips" role="tablist">
      {(withAll ? (['all', ...SPORTS] as const) : SPORTS).map((s) => (
        <button key={s} data-sport={s} className={`chip${sport === s ? ' chip--on' : ''}`} onClick={() => onSport(s)}>
          {s === 'all' ? 'Vše' : SPORT_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
