import type { Sport, StandingsFile } from '@sportradar/shared';
import { oldestUpdatedAt, tablesForSport } from '../lib/standings';
import { isStale } from '../lib/time';
import { SportChips } from './SportChips';
import { StandingsTable } from './StandingsTable';

interface Props {
  standings: StandingsFile | null;   // null = soubor se nepodařilo načíst
  sport: Sport;
  onSport: (s: Sport) => void;
  favs: string[];
  now: Date;
}

export function StandingsView({ standings, sport, onSport, favs, now }: Props) {
  const tables = tablesForSport(standings, sport);
  const updated = standings ? oldestUpdatedAt(tables, standings.generatedAt ?? "") : "";
  const stale = standings ? isStale(updated, now) : false;
  return (
    <>
      <SportChips sport={sport} onSport={(s) => s !== 'all' && onSport(s)} withAll={false} />
      {!standings && <p className="muted pad">Tabulku se nepodařilo načíst.</p>}
      {standings && tables.length === 0 && <p className="muted pad">Pro tento sport zatím není tabulka.</p>}
      {standings && tables.length > 0 && stale && (
        <div className="banner banner--warn">Tabulky nemusí být aktuální.</div>
      )}
      {tables.map((t) => <StandingsTable key={t.id} table={t} sport={sport} favs={favs} />)}
      {standings && tables.length > 0 && (
        <p className="muted pad">
          Aktualizováno: {Number.isNaN(Date.parse(updated)) ? 'neznámo' : new Date(updated).toLocaleString('cs-CZ')}
        </p>
      )}
    </>
  );
}
