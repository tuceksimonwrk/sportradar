import type { Match, Sport } from '@sportradar/shared';
import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { CHUNK_SIZE, chunkMatches, groupByDay } from '../lib/schedule';
import { dayLabel } from '../lib/time';
import { ResultCard } from './ResultCard';
import { artFor } from './SportArt';
import { CompetitionChips } from './CompetitionChips';
import { ShowAllBar, MoreButton } from './ShowAll';
import { SportChips } from './SportChips';
import { EmptyState, PageHead, enter } from './ui';

interface Props {
  matches: Match[];            // už vyfiltrované (oblíbené + sport), nejnovější první
  now: Date;
  sport: Sport | 'all';
  onSport: (s: Sport | 'all') => void;
  competition: string;         // id soutěže nebo 'all' (jen u fotbalu)
  onCompetition: (c: string) => void;
  hasFavorites: boolean;
  showAll: boolean;            // ruční vypnutí filtru oblíbených
  onToggleAll: () => void;
  onGoFavorites: () => void;
}

export function ResultsView({ matches, now, sport, onSport, competition, onCompetition, hasFavorites, showAll, onToggleAll, onGoFavorites }: Props) {
  const head = <PageHead icon={<Trophy size={22} strokeWidth={1.75} />} title="Výsledky" subtitle="Odehrané zápasy za posledních 14 dní" sport={sport} />;
  const [limit, setLimit] = useState(CHUNK_SIZE); // view se remountuje při změně filtru (key v App)
  const { shown, remaining } = chunkMatches(matches, limit);
  const groups = groupByDay(shown);
  let n = 0;
  return (
    <>
      {head}
      <ShowAllBar hasFavorites={hasFavorites} showAll={showAll} onToggleAll={onToggleAll} onGoFavorites={onGoFavorites} />
      <SportChips sport={sport} onSport={onSport} />
      {sport === 'football' && <CompetitionChips competition={competition} onCompetition={onCompetition} />}
      {matches.length === 0 && (
        <EmptyState art={artFor(sport)} icon={<Trophy size={26} strokeWidth={1.75} />}
          title="Zatím bez výsledků"
          text={hasFavorites && !showAll ? 'Za posledních 14 dní nemáš žádné odehrané zápasy.' : 'Za posledních 14 dní nejsou žádné odehrané zápasy.'}
          action={sport === 'football' && competition !== 'all'
            ? <button className="btn btn--ghost" onClick={() => onCompetition('all')}>Zobrazit všechny soutěže</button>
            : sport !== 'all' ? <button className="btn btn--ghost" onClick={() => onSport('all')}>Zobrazit všechny sporty</button> : undefined} />
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
