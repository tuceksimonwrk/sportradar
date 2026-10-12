import { useId, useState, type CSSProperties } from 'react';
import { leagueFavoriteId, type Team } from '@sportradar/shared';
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { blockOpen, clubsLabel, footballBlocks } from '../lib/football';
import { TeamCrest } from './TeamCrest';
import { SportIcon } from './icons/SportIcon';

interface Props { teams: Team[]; favs: string[]; query: string; onToggle: (id: string) => void; className?: string; style?: CSSProperties }

const compactNow = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(max-width: 767px)').matches;

/** Oblíbené → Fotbal: celý fotbal, a po soutěžích „Celá soutěž“ + kluby (rozbalovací bloky). */
export function FootballFavorites({ teams, favs, query, onToggle, className, style }: Props) {
  const uid = useId();
  const [compact] = useState(compactNow);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const searching = query.trim().length > 0;
  const blocks = footballBlocks(teams, query, favs);
  const visible = blocks.filter((b) => b.visible);
  const hintId = `${uid}-hint`;
  return (
    <fieldset className={className} style={style} data-sport="football">
      <legend><SportIcon sport="football" size={20} />Fotbal</legend>
      <label className="row row--all">
        <input type="checkbox" checked={favs.includes('football')} onChange={() => onToggle('football')} aria-describedby={hintId} />
        <span>Celý fotbal (všechny soutěže)</span>
      </label>
      <p className="fhint" id={hintId}>
        <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
        <span>To je hodně zápasů – přes 200 za tři týdny. Spíš vyber jednotlivé soutěže nebo kluby.</span>
      </p>
      {visible.map((b) => {
        const open = blockOpen({ searching, favCount: b.favCount, compact, override: overrides[b.comp.id] });
        const listId = `${uid}-${b.comp.id}`;
        const leagueId = leagueFavoriteId(b.comp.id);
        const cl = b.comp.id === 'uefa.champions';
        return (
          <div key={b.comp.id} className={`comp${open ? ' comp--open' : ''}`}>
            <button type="button" className="comp__toggle" aria-expanded={open} aria-controls={listId}
              disabled={searching} onClick={() => setOverrides((o) => ({ ...o, [b.comp.id]: !open }))}>
              <span className="comp__name">{b.comp.name}</span>
              <span className="comp__meta">
                {b.comp.country}
                {b.favCount > 0 && <span className="comp__badge">{b.favCount}<span className="sr-only"> oblíbené</span></span>}
                <span className="comp__count">{clubsLabel(b.clubs.length)}</span>
              </span>
              <ChevronDown className="comp__chev" size={20} strokeWidth={2} aria-hidden="true" />
            </button>
            <label className="row row--league">
              <input type="checkbox" checked={favs.includes(leagueId)} onChange={() => onToggle(leagueId)} />
              <span>Celá soutěž<span className="sr-only"> {b.comp.name}</span></span>
            </label>
            <div id={listId} className="comp__clubs" hidden={!open}>
              {cl && b.clubs.length > 0 && <p className="comp__sub">Ostatní kluby</p>}
              {b.clubs.map((t) => (
                <label key={t.id} className="row">
                  <input type="checkbox" checked={favs.includes(t.id)} onChange={() => onToggle(t.id)} />
                  <TeamCrest team={t} name={t.name} size={28} />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {searching && visible.length === 0 && <p className="muted comp__none">Žádný klub ani soutěž neodpovídá hledání.</p>}
    </fieldset>
  );
}
