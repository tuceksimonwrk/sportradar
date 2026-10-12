import { useState } from 'react';
import { REMINDER_OPTIONS, reminderLabel, type Match, type Team } from '@sportradar/shared';
import { BellRing, CalendarArrowDown, Copy, Rss } from 'lucide-react';
import { downloadMatches, favoriteFeeds, feedUrl, webcalUrl } from '../lib/calendar';
import { useReminder } from './ReminderContext';
import { SportIcon } from './icons/SportIcon';

interface Props { teams: Team[]; favs: string[]; matches: Match[] }

const SHORT: Record<number, string> = { 0: 'Bez', 15: '15 min', 30: '30 min', 60: '1 h', 120: '2 h' };

/** Oblíbené → „Připomínky v kalendáři“: předstih, jednorázový export + odebíratelné feedy (webcal://) oblíbených. */
export function CalendarSection({ teams, favs, matches }: Props) {
  const { minutes, setMinutes } = useReminder();
  const [msg, setMsg] = useState('');
  const feeds = favoriteFeeds(favs, teams);
  const lead = minutes === 0 ? null : reminderLabel(minutes);
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setMsg('Odkaz zkopírován do schránky.'); }
    catch { setMsg(url); }
  };
  return (
    <section className="cal" aria-labelledby="cal-h">
      <h2 id="cal-h" className="cal__title"><BellRing size={20} strokeWidth={1.75} aria-hidden="true" />Připomínky v kalendáři</h2>
      <div className="seg" role="radiogroup" aria-label="Upozornit před začátkem zápasu">
        <span className="seg__lbl" aria-hidden="true">Upozornit:</span>
        {REMINDER_OPTIONS.map((m) => (
          <label key={m} className={`seg__opt${minutes === m ? ' seg__opt--on' : ''}`}>
            <input type="radio" name="reminder" value={m} checked={minutes === m} onChange={() => { setMinutes(m); setMsg(''); }} />
            <span aria-label={m === 0 ? 'Bez připomínky' : reminderLabel(m)}>{SHORT[m]}</span>
          </label>
        ))}
      </div>
      <p className="cal__lead">
        {lead ? `Upozornění přijde ${lead} před začátkem zápasu.` : 'Zápasy se do kalendáře přidají bez upozornění.'}
      </p>
      {feeds.length === 0 ? (
        <p className="muted">Vyber níže oblíbené týmy nebo soutěže a tady si je přidáš do kalendáře.</p>
      ) : (
        <>
          <button type="button" className="btn" disabled={matches.length === 0} onClick={() => downloadMatches(matches, minutes)}>
            <CalendarArrowDown size={18} aria-hidden="true" />Stáhnout všechny nadcházející zápasy (.ics)
          </button>
          {matches.length === 0 && <p className="muted cal__none">Oblíbené teď nemají žádné nadcházející zápasy.</p>}
          <ul className="cal__list">
            {feeds.map((f) => {
              const url = feedUrl(f.file, minutes, window.location.href);
              const note = lead ? `upozornění ${lead} předem` : 'bez upozornění';
              return (
                <li key={f.id} className="cal__item" data-sport={f.sport}>
                  <span className="cal__name"><SportIcon sport={f.sport} size={18} /><span>{f.label}</span></span>
                  <span className="cal__actions">
                    <a className="btn btn--ghost" href={webcalUrl(url)} aria-label={`Odebírat ${f.label} (${note})`}><Rss size={18} aria-hidden="true" />Odebírat</a>
                    <button type="button" className="btn btn--ghost" aria-label={`Kopírovat odkaz na kalendář ${f.label} (${note})`} onClick={() => copy(url)}>
                      <Copy size={18} aria-hidden="true" />Kopírovat odkaz
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {msg && <p className="muted cal__msg" role="status">{msg}</p>}
          <p className="muted cal__hint">
            Předstih je uložený přímo v souboru kalendáře – po jeho změně odebírej kalendář znovu.
            {lead
              ? ` Google Kalendář: v nastavení odebíraného kalendáře zapni výchozí upozornění ${lead} předem — Google připomínky z odebíraných kalendářů přebírá jen takto. (Apple Kalendář a většina ostatních aplikací vezmou připomínku přímo ze souboru.)`
              : ' Odebíraný kalendář zůstane bez upozornění.'}
          </p>
        </>
      )}
    </section>
  );
}
