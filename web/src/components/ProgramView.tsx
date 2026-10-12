import type { Match, Sport } from '@sportradar/shared';
import { SPORTS, SPORT_LABELS } from '@sportradar/shared';
import { groupByDay } from '../lib/schedule';
import { dayLabel } from '../lib/time';
import { MatchCard } from './MatchCard';

interface Props {
  matches: Match[];            // už vyfiltrované (oblíbené + sport)
  now: Date;
  sport: Sport | 'all';
  onSport: (s: Sport | 'all') => void;
  hasFavorites: boolean;
  onGoFavorites: () => void;
}

export function ProgramView({ matches, now, sport, onSport, hasFavorites, onGoFavorites }: Props) {
  if (!hasFavorites) {
    return (
      <div className="empty">
        <p>Zatím nemáš žádné oblíbené.</p>
        <button className="btn" onClick={onGoFavorites}>Vybrat oblíbené</button>
      </div>
    );
  }
  const [next, ...rest] = matches;
  const groups = groupByDay(rest);
  return (
    <>
      <div className="chips" role="tablist">
        {(['all', ...SPORTS] as const).map((s) => (
          <button key={s} className={`chip${sport === s ? ' chip--on' : ''}`} onClick={() => onSport(s)}>
            {s === 'all' ? 'Vše' : SPORT_LABELS[s]}
          </button>
        ))}
      </div>
      {matches.length === 0 && <p className="muted pad">Žádné nadcházející zápasy pro tento výběr.</p>}
      {next && (
        <section>
          <h2 className="day">Nejbližší zápas</h2>
          <MatchCard match={next} now={now} hero />
        </section>
      )}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="day">{dayLabel(g.key, now)}</h2>
          {g.matches.map((m) => <MatchCard key={m.id} match={m} now={now} />)}
        </section>
      ))}
    </>
  );
}
