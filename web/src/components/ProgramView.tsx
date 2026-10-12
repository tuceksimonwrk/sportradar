import type { Match, Sport } from '@sportradar/shared';
import { CalendarDays, Star } from 'lucide-react';
import { groupByDay } from '../lib/schedule';
import { dayLabel } from '../lib/time';
import { Hero } from './Hero';
import { MatchCard } from './MatchCard';
import { artFor } from './SportArt';
import { CompetitionChips } from './CompetitionChips';
import { SportChips } from './SportChips';
import { EmptyState, PageHead, enter } from './ui';

interface Props {
  matches: Match[];            // už vyfiltrované (oblíbené + sport)
  now: Date;
  sport: Sport | 'all';
  onSport: (s: Sport | 'all') => void;
  competition: string;         // id soutěže nebo 'all' (jen u fotbalu)
  onCompetition: (c: string) => void;
  hasFavorites: boolean;
  onGoFavorites: () => void;
}

export function NoFavorites({ onGoFavorites }: { onGoFavorites: () => void }) {
  return (
    <EmptyState
      icon={<Star size={26} strokeWidth={1.75} />}
      title="Zatím nemáš žádné oblíbené"
      text="Vyber týmy nebo celé soutěže a tady uvidíš jejich zápasy v tvém čase."
      action={<button className="btn" onClick={onGoFavorites}><Star size={18} aria-hidden="true" />Vybrat oblíbené</button>}
    />
  );
}

export function ProgramView({ matches, now, sport, onSport, competition, onCompetition, hasFavorites, onGoFavorites }: Props) {
  const head = <PageHead icon={<CalendarDays size={22} strokeWidth={1.75} />} title="Program" subtitle="Nadcházející zápasy tvých oblíbených" sport={sport} />;
  if (!hasFavorites) return <>{head}<NoFavorites onGoFavorites={onGoFavorites} /></>;
  const [next, ...rest] = matches;
  const groups = groupByDay(rest);
  let n = 1; // 0 = tabule
  return (
    <>
      {head}
      <SportChips sport={sport} onSport={onSport} />
      {sport === 'football' && <CompetitionChips competition={competition} onCompetition={onCompetition} />}
      {matches.length === 0 && (
        <EmptyState art={artFor(sport)} icon={<CalendarDays size={26} strokeWidth={1.75} />}
          title="Nic na programu"
          text="Pro tento výběr teď nejsou žádné nadcházející zápasy."
          action={sport === 'football' && competition !== 'all'
            ? <button className="btn btn--ghost" onClick={() => onCompetition('all')}>Zobrazit všechny soutěže</button>
            : sport !== 'all' ? <button className="btn btn--ghost" onClick={() => onSport('all')}>Zobrazit všechny sporty</button> : undefined} />
      )}
      {next && (
        <section {...enter(0, 'section')}>
          <h2 className="day">Nejbližší zápas</h2>
          <Hero match={next} now={now} />
        </section>
      )}
      {groups.map((g) => (
        <section key={g.key} className="section">
          <h2 className="day">{dayLabel(g.key, now)}</h2>
          {g.matches.map((m) => {
            const e = enter(n++);
            return <MatchCard key={m.id} match={m} now={now} className={e.className} style={e.style} />;
          })}
        </section>
      ))}
    </>
  );
}
