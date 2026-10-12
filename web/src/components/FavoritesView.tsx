import { useState } from 'react';
import type { Match, Team } from '@sportradar/shared';
import { SPORTS, SPORT_LABELS } from '@sportradar/shared';
import { Search, Share2, Star } from 'lucide-react';
import { CalendarSection } from './CalendarSection';
import { TeamCrest } from './TeamCrest';
import { SportIcon } from './icons/SportIcon';
import { PageHead, enter } from './ui';

interface Props { teams: Team[]; favs: string[]; matches: Match[]; onToggle: (id: string) => void; onShare: () => void; shareMsg: string }

export function FavoritesView({ teams, favs, matches, onToggle, onShare, shareMsg }: Props) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase('cs');
  return (
    <>
      <PageHead icon={<Star size={22} strokeWidth={1.75} />} title="Oblíbené" subtitle="Vyber týmy a soutěže, které chceš sledovat" sport="all" />
      <div className="toolbar">
        <label className="search">
          <Search size={18} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Hledat tým</span>
          <input type="search" placeholder="Hledat tým…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="btn" onClick={onShare} disabled={favs.length === 0}><Share2 size={18} aria-hidden="true" />Sdílet</button>
      </div>
      {shareMsg && <p className="muted pad share-msg" role="status">{shareMsg}</p>}
      <CalendarSection teams={teams} favs={favs} matches={matches} />
      {SPORTS.map((sport, i) => {
        const list = teams.filter((t) => t.sport === sport && t.name.toLocaleLowerCase('cs').includes(needle));
        const e = enter(i, 'sport');
        return (
          <fieldset key={sport} className={e.className} style={e.style} data-sport={sport}>
            <legend><SportIcon sport={sport} size={20} />{SPORT_LABELS[sport]}</legend>
            <label className="row row--all">
              <input type="checkbox" checked={favs.includes(sport)} onChange={() => onToggle(sport)} />
              <span>{sport === 'f1' ? 'Celá Formule 1 (tréninky, kvalifikace, závody)' : 'Všechny týmy'}</span>
            </label>
            {list.map((t) => (
              <label key={t.id} className="row">
                <input type="checkbox" checked={favs.includes(t.id)} onChange={() => onToggle(t.id)} />
                <TeamCrest team={t} name={t.name} size={28} />
                <span>{t.name}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </>
  );
}
