import type { Sport, StandingsFile } from '@sportradar/shared';
import { ListOrdered, TriangleAlert } from 'lucide-react';
import { oldestUpdatedAt, showTableSelector, tablesForSport } from '../lib/standings';
import { isStale } from '../lib/time';
import { artFor } from './SportArt';
import { SportChips } from './SportChips';
import { StandingsTable } from './StandingsTable';
import { EmptyState, PageHead } from './ui';

interface Props {
  standings: StandingsFile | null;   // null = soubor se nepodařilo načíst
  sport: Sport;
  onSport: (s: Sport) => void;
  tableId?: string;                  // vybraná tabulka (jen u sportů s výběrem tabulky)
  onTable: (id: string) => void;
  favs: string[];
  now: Date;
}

export function StandingsView({ standings, sport, onSport, tableId, onTable, favs, now }: Props) {
  const tables = tablesForSport(standings, sport);
  const selector = showTableSelector(tables);
  const shown = selector ? tables.filter((t) => t.id === tableId).slice(0, 1) : tables;
  if (selector && shown.length === 0) shown.push(tables[0]);
  const updated = standings ? oldestUpdatedAt(shown, standings.generatedAt ?? "") : "";
  const stale = standings ? isStale(updated, now) : false;
  let start = 0;
  return (
    <>
      <PageHead icon={<ListOrdered size={22} strokeWidth={1.75} />} title="Tabulky" subtitle="Aktuální pořadí v soutěžích" sport={sport} />
      <SportChips sport={sport} onSport={(s) => s !== 'all' && onSport(s)} withAll={false} />
      {!standings && (
        <EmptyState art={artFor(sport)} icon={<TriangleAlert size={26} strokeWidth={1.75} />}
          title="Tabulku se nepodařilo načíst" text="Zkus to prosím za chvíli znovu."
          action={<button className="btn" onClick={() => window.location.reload()}>Načíst znovu</button>} />
      )}
      {standings && tables.length === 0 && (
        <EmptyState art={artFor(sport)} icon={<ListOrdered size={26} strokeWidth={1.75} />}
          title="Pro tento sport zatím není tabulka" text="Sezóna možná ještě nezačala." />
      )}
      {standings && tables.length > 0 && stale && (
        <div className="banner banner--warn"><TriangleAlert size={18} aria-hidden="true" />Tabulky nemusí být aktuální.</div>
      )}
      {selector && (
        <div className="chips chips--sub" role="group" aria-label="Výběr tabulky" data-sport={sport}>
          {tables.map((t) => (
            <button key={t.id} type="button" className={`chip chip--sub${t.id === shown[0].id ? ' chip--on' : ''}`}
              aria-pressed={t.id === shown[0].id} onClick={() => onTable(t.id)}>{t.title}</button>
          ))}
        </div>
      )}
      {shown.map((t) => {
        const el = <StandingsTable key={t.id} table={t} sport={sport} favs={favs} startIndex={start} />;
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
