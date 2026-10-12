import type { Sport, StandingsTable as Table } from '@sportradar/shared';
import { isFavoriteRow } from '../lib/standings';

/** Šířka sloupce podle nejdelšího obsahu (popisek i hodnoty), v „ch“. */
function colWidth(t: Table, key: string, label: string): string {
  const len = Math.max(label.length, ...t.rows.map((r) => String(r.values[key] ?? '–').length));
  return `calc(${Math.max(len, 2)}ch + 6px)`;
}

export function StandingsTable({ table, sport, favs }: { table: Table; sport: Sport; favs: string[] }) {
  const nameHead = table.id === 'f1-drivers' ? 'Jezdec' : 'Tým';
  return (
    <table className="st" data-sport={sport}>
      <caption className="day">{table.title}</caption>
      <colgroup>
        <col style={{ width: '28px' }} />
        <col />
        {table.columns.map((c) => <col key={c.key} style={{ width: colWidth(table, c.key, c.label) }} />)}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="st__pos"><abbr title="Pořadí">#</abbr></th>
          <th scope="col" className="st__name">{nameHead}</th>
          {table.columns.map((c) => (
            <th key={c.key} scope="col" className="st__num"><abbr title={c.title ?? c.label}>{c.label}</abbr></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r) => (
          <tr key={`${r.pos}-${r.name}`} className={isFavoriteRow(r, sport, favs) ? 'is-fav' : undefined}>
            <td className="st__pos">{r.pos}</td>
            <td className="st__name" title={r.sub ? `${r.name} (${r.sub})` : r.name}>
              {r.name}{r.sub && <small className="st__sub">{r.sub}</small>}
            </td>
            {table.columns.map((c) => <td key={c.key} className={c.key === 'b' ? 'st__num st__pts' : 'st__num'}>{r.values[c.key] ?? '–'}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
