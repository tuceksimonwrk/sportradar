import { filterSport, type GroupId, type StandingsFile } from '@sportradar/shared';
import { ListOrdered, TriangleAlert } from 'lucide-react';
import { oldestUpdatedAt, tablesForStandingsFilter, type StandingsFilter } from '../lib/standings';
import { isStale } from '../lib/time';
import { CompetitionChips } from './CompetitionChips';
import { artFor } from './SportArt';
import { SportChips } from './SportChips';
import { StandingsTable } from './StandingsTable';
import { EmptyState, PageHead } from './ui';

interface Props {
  standings: StandingsFile | null;   // null = soubor se nepodařilo načíst
  filter: StandingsFilter;           // sport + soutěž (F1 bez soutěže)
  onGroup: (g: GroupId) => void;
  onCompetition: (c: string) => void;
  favs: string[];
  now: Date;
}

export function StandingsView({ standings, filter, onGroup, onCompetition, favs, now }: Props) {
  const sport = filterSport(filter);
  const tables = tablesForStandingsFilter(standings, filter);
  const updated = standings ? oldestUpdatedAt(tables, standings.generatedAt ?? "") : "";
  const stale = standings ? isStale(updated, now) : false;
  let start = 0;
  return (
    <>
      <PageHead icon={<ListOrdered size={22} strokeWidth={1.75} />} title="Tabulky" subtitle="Aktuální pořadí v soutěžích" sport={sport} />
      <SportChips group={filter.group} onGroup={(g) => g !== 'all' && onGroup(g)} withAll={false} />
      <CompetitionChips group={filter.group} competition={filter.competition} onCompetition={onCompetition} withAll={false} />
      {!standings && (
        <EmptyState art={artFor(sport)} icon={<TriangleAlert size={26} strokeWidth={1.75} />}
          title="Tabulku se nepodařilo načíst" text="Zkus to prosím za chvíli znovu."
          action={<button className="btn" onClick={() => window.location.reload()}>Načíst znovu</button>} />
      )}
      {standings && tables.length === 0 && (
        <EmptyState art={artFor(sport)} icon={<ListOrdered size={26} strokeWidth={1.75} />}
          title="Pro tento výběr zatím není tabulka" text="Sezóna možná ještě nezačala." />
      )}
      {standings && tables.length > 0 && stale && (
        <div className="banner banner--warn"><TriangleAlert size={18} aria-hidden="true" />Tabulky nemusí být aktuální.</div>
      )}
      {tables.map((t) => {
        const el = <StandingsTable key={t.id} table={t} sport={t.sport} favs={favs} startIndex={start} />;
        start += t.rows.length;
        return el;
      })}
      {standings && tables.length > 0 && (
        <p className="muted pad">
          Aktualizováno: {Number.isNaN(Date.parse(updated)) ? 'neznámo' : new Date(updated).toLocaleString('cs-CZ')}
        </p>
      )}
    </>
  );
}
