import type { Match, Sport } from '@sportradar/shared';
import { groupByDay } from '../lib/schedule';
import { dayLabel } from '../lib/time';
import { ResultCard } from './ResultCard';
import { SportChips } from './SportChips';

interface Props {
  matches: Match[];            // už vyfiltrované (oblíbené + sport), nejnovější první
  now: Date;
  sport: Sport | 'all';
  onSport: (s: Sport | 'all') => void;
  hasFavorites: boolean;
  onGoFavorites: () => void;
}

export function ResultsView({ matches, now, sport, onSport, hasFavorites, onGoFavorites }: Props) {
  if (!hasFavorites) {
    return (
      <div className="empty">
        <p>Zatím nemáš žádné oblíbené.</p>
        <button className="btn" onClick={onGoFavorites}>Vybrat oblíbené</button>
      </div>
    );
  }
  const groups = groupByDay(matches);
  return (
    <>
      <SportChips sport={sport} onSport={onSport} />
      {matches.length === 0 && <p className="muted pad">Za posledních 14 dní nemáš žádné odehrané zápasy.</p>}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="day">{dayLabel(g.key, now)}</h2>
          {g.matches.map((m) => <ResultCard key={m.id} match={m} />)}
        </section>
      ))}
    </>
  );
}
