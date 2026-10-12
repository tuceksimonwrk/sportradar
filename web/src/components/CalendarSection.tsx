import { useState } from 'react';
import type { Match, Team } from '@sportradar/shared';
import { BellRing, CalendarArrowDown, Copy, Rss } from 'lucide-react';
import { downloadMatches, favoriteFeeds, feedUrl, webcalUrl } from '../lib/calendar';
import { SportIcon } from './icons/SportIcon';

interface Props { teams: Team[]; favs: string[]; matches: Match[] }

/** Oblíbené → „Připomínky v kalendáři“: jednorázový export + odebíratelné feedy (webcal://) oblíbených. */
export function CalendarSection({ teams, favs, matches }: Props) {
  const [msg, setMsg] = useState('');
  const feeds = favoriteFeeds(favs, teams);
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setMsg('Odkaz zkopírován do schránky.'); }
    catch { setMsg(url); }
  };
  return (
    <section className="cal" aria-labelledby="cal-h">
      <h2 id="cal-h" className="cal__title"><BellRing size={20} strokeWidth={1.75} aria-hidden="true" />Připomínky v kalendáři</h2>
      <p className="cal__lead">Upozornění přijde 1 hodinu před začátkem zápasu.</p>
      {feeds.length === 0 ? (
        <p className="muted">Vyber níže oblíbené týmy nebo soutěže a tady si je přidáš do kalendáře.</p>
      ) : (
        <>
          <button type="button" className="btn" disabled={matches.length === 0} onClick={() => downloadMatches(matches)}>
            <CalendarArrowDown size={18} aria-hidden="true" />Stáhnout všechny nadcházející zápasy (.ics)
          </button>
          {matches.length === 0 && <p className="muted cal__none">Oblíbené teď nemají žádné nadcházející zápasy.</p>}
          <ul className="cal__list">
            {feeds.map((f) => {
              const url = feedUrl(f.path, window.location.href);
              return (
                <li key={f.id} className="cal__item" data-sport={f.sport}>
                  <span className="cal__name"><SportIcon sport={f.sport} size={18} /><span>{f.label}</span></span>
                  <span className="cal__actions">
                    <a className="btn btn--ghost" href={webcalUrl(url)}><Rss size={18} aria-hidden="true" />Odebírat</a>
                    <button type="button" className="btn btn--ghost" onClick={() => copy(url)}><Copy size={18} aria-hidden="true" />Kopírovat odkaz</button>
                  </span>
                </li>
              );
            })}
          </ul>
          {msg && <p className="muted cal__msg" role="status">{msg}</p>}
          <p className="muted cal__hint">
            Google Kalendář: v nastavení odebíraného kalendáře zapni výchozí upozornění 1 hodinu předem — Google připomínky z odebíraných
            kalendářů přebírá jen takto. (Apple Kalendář a většina ostatních aplikací vezmou připomínku přímo ze souboru.)
          </p>
        </>
      )}
    </section>
  );
}
