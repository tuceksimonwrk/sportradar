import { useEffect, useState } from 'react';
import type { Match } from '@sportradar/shared';
import { competitionLine } from '../lib/labels';
import { formatLiveClock } from '../lib/live';
import { matchSides, splitSession } from '../lib/sides';
import { countdownParts, dayKey, dayLabel, formatCountdown, formatTime } from '../lib/time';
import { SportArt, artFor } from './SportArt';
import { CalendarButton } from './CalendarButton';
import { DetailButton } from './DetailButton';
import { SportEmblem, TeamCrest } from './TeamCrest';
import { useTeams } from './TeamsContext';
import { LiveBadge, LiveHint, ScoreNum, scoreAnnouncement, useLiveState, useNotStarted } from './LiveParts';
import { SportIcon } from './icons/SportIcon';
import { Broadcasters, VenueLine } from './ui';

/** Rozsvícení LED času jen jednou za načtení stránky (ne při každém přepnutí záložky). */
let poweredOn = false;

const pad = (n: number) => String(n).padStart(2, '0');

/** Nejbližší zápas: „stadionová tabule“ s erby proti sobě, LED časem a odpočtem. */
export function Hero({ match, now }: { match: Match; now: Date }) {
  const { teams } = useTeams();
  const [power, setPower] = useState(() => !poweredOn);
  useEffect(() => { poweredOn = true; }, []);

  const sides = match.sport === 'f1' ? null : matchSides(match, teams);
  const cd = countdownParts(match.startsAt, now);
  const time = formatTime(match.startsAt);
  const { live: liveRaw, hint } = useLiveState(match);
  const notStarted = useNotStarted(match, now);
  const live = liveRaw && sides ? liveRaw : undefined;
  const [announce, setAnnounce] = useState('');
  const [seen, setSeen] = useState('');
  const liveKey = live ? `${live.phase}|${live.home}|${live.away}` : '';
  if (liveKey !== seen) { // oznámení čtečkám jen při změně skóre, ne při prvním zobrazení
    setSeen(liveKey);
    if (live && seen && sides) setAnnounce(scoreAnnouncement(live, sides[0].name, sides[1].name));
  }
  const wide = !!live && ((live.home ?? 0) >= 100 || (live.away ?? 0) >= 100);
  const led = (
    <span className={`led${live ? ' led--score' : ''}${wide ? ' led--wide' : ''}`} aria-hidden="true">
      <span className="led__ghost">{live ? `${live.home ?? 8}:${live.away ?? 8}`.replace(/\d/g, '8') : '88:88'}</span>
      <span className="led__on" onAnimationEnd={() => setPower(false)}>
        {live ? <><ScoreNum value={live.home} />:<ScoreNum value={live.away} /></> : time}
      </span>
    </span>
  );

  let stage;
  if (sides) {
    stage = (
      <div className="hero__duel">
        {sides.map((s, i) => (
          <div key={i} className={`hero__side hero__side--${i ? 'away' : 'home'}`}>
            <TeamCrest team={s.teamId ? teams.get(s.teamId) : undefined} name={s.name} size={76} className="hero__crest" />
            <span className="hero__name">{s.name}</span>
          </div>
        ))}
        <div className="hero__center">{led}</div>
      </div>
    );
  } else {
    const { event, session } = splitSession(match.title);
    stage = (
      <div className="hero__solo">
        <SportEmblem sport={match.sport} size={76} className="hero__crest" />
        <div className="hero__event">
          {session && <span className="hero__session">{session}</span>}
          <span className="hero__title">{event}</span>
        </div>
        <div className="hero__center">{led}</div>
      </div>
    );
  }

  return (
    <article className={`hero${power ? ' hero--power' : ''}`} data-sport={match.sport}>
      <SportArt kind={artFor(match.sport)} className="hero__art" />
      <div className="hero__top">
        <span className="hero__comp"><SportIcon sport={match.sport} size={16} />{competitionLine(match.sport, match.competition)}</span>
        <span className="hero__actions">
          <span className="hero__day">{dayLabel(dayKey(match.startsAt), now)}</span>
          <DetailButton match={match} />
          <CalendarButton match={match} />
        </span>
      </div>
      <h3 className="sr-only">{match.title}, {dayLabel(dayKey(match.startsAt), now)} {time}{live && live.home !== undefined && live.away !== undefined ? `, ${live.phase === 'live' ? 'živě' : 'konec'} ${live.home}:${live.away}` : ''}</h3>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <div aria-hidden="true">{stage}</div>
      {live ? (
        <div className="hero__live">
          <LiveBadge live={live} />
          {(live.phase === 'live' ? formatLiveClock(live) : live.detail !== 'Konec' && live.detail) && (
            <span className="hero__clock">{live.phase === 'live' ? formatLiveClock(live) : live.detail}</span>
          )}
        </div>
      ) : notStarted ? (
        <div className="hero__live"><span>Zápas ještě nezačal</span></div>
      ) : cd.live ? (
        <div className="hero__live"><span className="livebadge">Živě</span><span>Zápas právě probíhá</span></div>
      ) : (
        <div className="countdown">
          <span className="sr-only">Začátek {formatCountdown(match.startsAt, now)}</span>
          {([[cd.days, 'dny'], [cd.hours, 'hod'], [cd.minutes, 'min']] as const).map(([v, l]) => (
            <span key={l} className="countdown__tile" aria-hidden="true">
              <span className="countdown__num">{pad(v)}</span>
              <span className="countdown__lbl">{l}</span>
            </span>
          ))}
        </div>
      )}
      <div className="hero__info">
        {hint && <LiveHint />}
        <VenueLine venue={match.venue} />
        <Broadcasters list={match.broadcasters} />
      </div>
    </article>
  );
}
