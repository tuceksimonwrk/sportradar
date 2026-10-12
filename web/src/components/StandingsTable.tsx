import type { CSSProperties } from 'react';
import type { Sport, StandingRow, StandingsTable as Table } from '@sportradar/shared';
import { monogramColor, monogramText } from '../lib/crest';
import { driverCode } from '../lib/podium';
import { isFavoriteRow } from '../lib/standings';
import { TeamCrest } from './TeamCrest';
import { useTeams } from './TeamsContext';
import { enter } from './ui';

/** Šířka sloupce podle nejdelšího obsahu (popisek i hodnoty), v „ch“. */
function colWidth(t: Table, key: string, label: string): string {
  const len = Math.max(label.length, ...t.rows.map((r) => String(r.values[key] ?? '–').length));
  return `calc(${Math.max(len, 2)}ch + 8px)`;
}

function RowCrest({ row, table }: { row: StandingRow; table: Table }) {
  const { teams } = useTeams();
  if (table.id === 'f1-drivers') {
    // kód jezdce jako v TV grafice, barva podle týmu (shodná s monogramem konstruktéra)
    return <span className="codetag" aria-hidden="true" style={{ background: monogramColor(row.sub ?? row.name) }}>{driverCode(row.name)}</span>;
  }
  if (table.sport === 'f1') { // konstruktér: zkratka, barva shodná s jeho jezdci
    return <span className="codetag" aria-hidden="true" style={{ background: monogramColor(row.name) }}>{monogramText(undefined, row.name)}</span>;
  }
  return <TeamCrest team={row.teamId ? teams.get(row.teamId) : undefined} name={row.name} size={24} />;
}

export function StandingsTable({ table, sport, favs, startIndex = 0 }: { table: Table; sport: Sport; favs: string[]; startIndex?: number }) {
  const nameHead = table.id === 'f1-drivers' ? 'Jezdec' : 'Tým';
  return (
    <table className="st" data-sport={sport}>
      <caption className="day">{table.title}</caption>
      <colgroup>
        <col style={{ width: '30px' }} />
        <col />
        {table.columns.map((c) => <col key={c.key} className={`st__c-${c.key}`} style={{ width: colWidth(table, c.key, c.label) }} />)}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="st__pos"><abbr title="Pořadí">#</abbr></th>
          <th scope="col" className="st__name">{nameHead}</th>
          {table.columns.map((c) => (
            <th key={c.key} scope="col" className={`st__num st__c-${c.key}`}><abbr title={c.title ?? c.label}>{c.label}</abbr></th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r, i) => {
          const fav = isFavoriteRow(r, sport, favs);
          const e = enter(startIndex + i);
          const cls = [e.className, fav ? 'is-fav' : '', r.pos === 1 ? 'is-leader' : ''].filter(Boolean).join(' ');
          return (
            <tr key={`${r.pos}-${r.name}`} className={cls || undefined} style={e.style as CSSProperties | undefined}>
              <td className="st__pos"><span className={r.pos <= 3 ? `pos pos--${r.pos}` : 'pos'}>{r.pos}</span></td>
              <td className="st__name" title={r.sub ? `${r.name} (${r.sub})` : r.name}>
                <span className="st__team">
                  <RowCrest row={r} table={table} />
                  <span className="st__label">
                    {r.name}{fav && <span className="sr-only"> (oblíbený)</span>}{r.sub && <small className="st__sub">{r.sub}</small>}
                  </span>
                </span>
              </td>
              {table.columns.map((c) => <td key={c.key} className={`st__num st__c-${c.key}${c.key === 'b' ? ' st__pts' : ''}`}>{r.values[c.key] ?? '–'}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
