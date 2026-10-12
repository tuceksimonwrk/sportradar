import { filterSport, type GroupId, type Match, type MatchFilter } from '@sportradar/shared';
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { CHUNK_SIZE, chunkMatches, groupByDay } from '../lib/schedule';
import { dayLabel } from '../lib/time';
import { Hero } from './Hero';
import { MatchCard } from './MatchCard';
import { artFor } from './SportArt';
import { ShowAllBar, MoreButton } from './ShowAll';
import { FilterBar } from './SportChips';
import { EmptyState, PageHead, enter } from './ui';

interface Props {
  matches: Match[];            // už vyfiltrované (oblíbené + sport)
  now: Date;
  filter: MatchFilter;
  onGroup: (g: GroupId | 'all') => void;
  onCompetition: (c: string) => void;
  hasFavorites: boolean;
  showAll: boolean;            // ruční vypnutí filtru oblíbených
  onToggleAll: () => void;
  onGoFavorites: () => void;
}

export function ProgramView({ matches, now, filter, onGroup, onCompetition, hasFavorites, showAll, onToggleAll, onGoFavorites }: Props) {
  const head = <PageHead icon={<CalendarDays size={22} strokeWidth={1.75} />} title="Program" subtitle={hasFavorites && !showAll ? 'Nadcházející zápasy tvých oblíbených' : 'Nadcházející zápasy'} sport={filterSport(filter)} />;
  const [limit, setLimit] = useState(CHUNK_SIZE); // view se remountuje při změně filtru (key v App)
  const { shown, remaining } = chunkMatches(matches, limit);
  const [next, ...rest] = shown;
  const groups = groupByDay(rest);
  let n = 1; // 0 = tabule
  return (
    <>
      {head}
      <ShowAllBar hasFavorites={hasFavorites} showAll={showAll} onToggleAll={onToggleAll} onGoFavorites={onGoFavorites} />
      <FilterBar filter={filter} onGroup={onGroup} onCompetition={onCompetition} />
      {matches.length === 0 && (
        <EmptyState art={artFor(filterSport(filter))} icon={<CalendarDays size={26} strokeWidth={1.75} />}
          title="Nic na programu"
          text="Pro tento výběr teď nejsou žádné nadcházející zápasy."
          action={filter.competition !== 'all'
            ? <button className="btn btn--ghost" onClick={() => onCompetition('all')}>Zobrazit všechny soutěže</button>
            : filter.group !== 'all' ? <button className="btn btn--ghost" onClick={() => onGroup('all')}>Zobrazit všechny sporty</button> : undefined} />
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
      <MoreButton remaining={remaining} step={CHUNK_SIZE} onMore={() => setLimit((l) => l + CHUNK_SIZE)} />
    </>
  );
}
