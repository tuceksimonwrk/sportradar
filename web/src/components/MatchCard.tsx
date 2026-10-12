import type { Match } from '@sportradar/shared';
import { competitionLine, venueLine } from '../lib/labels';
import { formatCountdown, formatTime } from '../lib/time';

export function MatchCard({ match, now, hero = false }: { match: Match; now: Date; hero?: boolean }) {
  const venue = venueLine(match.venue);
  const countdown = formatCountdown(match.startsAt, now);
  return (
    <article className={`card${hero ? ' card--hero' : ''}`} data-sport={match.sport}>
      <div className="card__time">
        <strong>{formatTime(match.startsAt)}</strong>
        <span className={countdown === 'probíhá' ? 'live' : 'muted'}>{countdown}</span>
      </div>
      <div className="card__body">
        <div className="card__title">{match.title}</div>
        <div className="card__meta">{competitionLine(match.sport, match.competition)}</div>
        {venue && <div className="card__meta">{venue}</div>}
        <div className="badges">
          {match.broadcasters.length === 0 && <span className="badge badge--none">kde sledovat: neznámé</span>}
          {match.broadcasters.map((b) =>
            b.url
              ? <a key={b.name} className="badge" href={b.url} target="_blank" rel="noreferrer">{b.name}</a>
              : <span key={b.name} className="badge">{b.name}</span>)}
        </div>
      </div>
    </article>
  );
}
