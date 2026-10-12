import { useState } from 'react';
import type { Team } from '@sportradar/shared';
import { SPORTS, SPORT_LABELS } from '@sportradar/shared';

interface Props { teams: Team[]; favs: string[]; onToggle: (id: string) => void; onShare: () => void; shareMsg: string }

export function FavoritesView({ teams, favs, onToggle, onShare, shareMsg }: Props) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase('cs');
  return (
    <>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Hledat tým…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={onShare} disabled={favs.length === 0}>Sdílet</button>
      </div>
      {shareMsg && <p className="muted pad" role="status">{shareMsg}</p>}
      {SPORTS.map((sport) => {
        const list = teams.filter((t) => t.sport === sport && t.name.toLocaleLowerCase('cs').includes(needle));
        return (
          <fieldset key={sport} className="sport" data-sport={sport}>
            <legend>{SPORT_LABELS[sport]}</legend>
            <label className="row row--all">
              <input type="checkbox" checked={favs.includes(sport)} onChange={() => onToggle(sport)} />
              <span>{sport === 'f1' ? 'Celá Formule 1 (tréninky, kvalifikace, závody)' : 'Všechny týmy'}</span>
            </label>
            {list.map((t) => (
              <label key={t.id} className="row">
                <input type="checkbox" checked={favs.includes(t.id)} onChange={() => onToggle(t.id)} />
                <span>{t.name}</span>
              </label>
            ))}
          </fieldset>
        );
      })}
    </>
  );
}
