import { filterSport, type GroupId, type Match, type MatchFilter } from '@sportradar/shared';
import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { CHUNK_SIZE, chunkMatches, groupByDay } from '../lib/schedule';
import { dayLabel } from '../lib/time';
import { ResultCard } from './ResultCard';
import { artFor } from './SportArt';
import { ShowAllBar, MoreButton } from './ShowAll';
import { FilterBar } from './SportChips';
import { EmptyState, PageHead, enter } from './ui';

interface Props {
  matches: Match[];            // už vyfiltrované (oblíbené + sport), nejnovější první
  now: Date;
  filter: MatchFilter;
  onGroup: (g: GroupId | 'all') => void;
  onCompetition: (c: string) => void;
  hasFavorites: boolean;
  showAll: boolean;            // ruční vypnutí filtru oblíbených
  onToggleAll: () => void;
  onGoFavorites: () => void;
}

export function ResultsView({ matches, now, filter, onGroup, onCompetition, hasFavorites, showAll, onToggleAll, onGoFavorites }: Props) {
  const head = <PageHead icon={<Trophy size={22} strokeWidth={1.75} />} title="Výsledky" subtitle="Odehrané zápasy za posledních 14 dní" sport={filterSport(filter)} />;
  const [limit, setLimit] = useState(CHUNK_SIZE); // view se remountuje při změně filtru (key v App)
  const { shown, remaining } = chunkMatches(matches, limit);
  const groups = groupByDay(shown);
  let n = 0;
  return (
    <>
      {head}
      <ShowAllBar hasFavorites={hasFavorites} showAll={showAll} onToggleAll={onToggleAll} onGoFavorites={onGoFavorites} />
      <FilterBar filter={filter} onGroup={onGroup} onCompetition={onCompetition} />
      {matches.length === 0 && (
        <EmptyState art={artFor(filterSport(filter))} icon={<Trophy size={26} strokeWidth={1.75} />}
          title="Zatím bez výsledků"
          text={hasFavorites && !showAll ? 'Za posledních 14 dní nemáš žádné odehrané zápasy.' : 'Za posledních 14 dní nejsou žádné odehrané zápasy.'}
          action={filter.competition !== 'all'
            ? <button className="btn btn--ghost" onClick={() => onCompetition('all')}>Zobrazit všechny soutěže</button>
            : filter.group !== 'all' ? <button className="btn btn--ghost" onClick={() => onGroup('all')}>Zobrazit všechny sporty</button> : undefined} />
      )}
      {groups.map((g) => (
        <section key={g.key} className="section">
          <h2 className="day">{dayLabel(g.key, now)}</h2>
          {g.matches.map((m) => {
            const e = enter(n++);
            return <ResultCard key={m.id} match={m} className={e.className} style={e.style} />;
          })}
        </section>
      ))}
      <MoreButton remaining={remaining} step={CHUNK_SIZE} onMore={() => setLimit((l) => l + CHUNK_SIZE)} />
    </>
  );
}
