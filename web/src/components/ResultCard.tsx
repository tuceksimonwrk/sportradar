import type { Match } from '@sportradar/shared';
import { competitionLine, scoreLabel, scoreParts, venueLine } from '../lib/labels';
import { formatTime } from '../lib/time';

export function ResultCard({ match }: { match: Match }) {
  const result = match.result;
  if (!result) return null;
  const venue = venueLine(match.venue);
  const score = scoreParts(result);
  const time = result.dateOnly ? null : formatTime(match.startsAt);
  const meta = [time, competitionLine(match.sport, match.competition)].filter(Boolean).join(' · ');
  return (
    <article className="card card--result" data-sport={match.sport}>
      {score ? (
        <div className="result__teams" role="group" aria-label={scoreLabel(result) ?? undefined}>
          <span className={`result__name result__name--home${score.winner === 'home' ? ' is-winner' : ''}`} aria-hidden="true">
            {result.homeName ?? 'Domácí'}
          </span>
          <span className="result__score" aria-hidden="true">{score.home} : {score.away}</span>
          <span className={`result__name result__name--away${score.winner === 'away' ? ' is-winner' : ''}`} aria-hidden="true">
            {result.awayName ?? 'Hosté'}
          </span>
        </div>
      ) : (
        <div className="card__title">{match.title}</div>
      )}
      {result.podium && result.podium.length > 0 && (
        <ol className="podium">
          {result.podium.map((p) => <li key={p.pos} value={p.pos}>{p.name}</li>)}
        </ol>
      )}
      {result.note && <div className="result__note">{result.note}</div>}
      <div className="card__meta">{meta}</div>
      {venue && <div className="card__meta">{venue}</div>}
    </article>
  );
}
