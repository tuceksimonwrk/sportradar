import type { CSSProperties } from 'react';
import type { Match } from '@sportradar/shared';
import { competitionLine } from '../lib/labels';
import { formatLiveClock } from '../lib/live';
import { matchSides } from '../lib/sides';
import { formatCountdown, formatTime } from '../lib/time';
import { CalendarButton } from './CalendarButton';
import { DetailButton } from './DetailButton';
import { TeamCrest } from './TeamCrest';
import { useTeams } from './TeamsContext';
import { LiveBadge, LiveHint, ScoreNum, useLiveState, useNotStarted } from './LiveParts';
import { SportIcon } from './icons/SportIcon';
import { Broadcasters, VenueLine } from './ui';

interface Props { match: Match; now: Date; className?: string; style?: CSSProperties }

export function MatchCard({ match, now, className = '', style }: Props) {
  const { teams } = useTeams();
  const countdown = formatCountdown(match.startsAt, now);
  const sides = match.sport === 'f1' ? null : matchSides(match, teams);
  const { live, hint } = useLiveState(match);
  const notStarted = useNotStarted(match, now);
  const liveSides = live && sides ? live : undefined;
  const clockLine = liveSides ? (liveSides.phase === 'live' ? formatLiveClock(liveSides) : liveSides.detail !== 'Konec' ? liveSides.detail : '') : '';
  return (
    <article className={`match ${className}`.trim()} data-sport={match.sport} style={style}>
      <div className="match__time">
        <strong>{formatTime(match.startsAt)}</strong>
        {liveSides ? <LiveBadge live={liveSides} small />
          : notStarted ? <span className="muted">čeká se</span>
          : <span className={countdown === 'probíhá' ? 'live' : 'muted'}>{countdown}</span>}
      </div>
      <div className="match__body">
        <div className="match__comp"><SportIcon sport={match.sport} size={15} /><span>{competitionLine(match.sport, match.competition)}</span><span className="match__actions"><DetailButton match={match} /><CalendarButton match={match} /></span></div>
        {sides ? (
          <h3 className="match__teams">
            {sides.map((s, i) => (
              <span key={i} className="match__team">
                <TeamCrest team={s.teamId ? teams.get(s.teamId) : undefined} name={s.name} size={28} />
                <span>{s.name}</span>
                {liveSides && <span className="match__score"><ScoreNum value={i ? liveSides.away : liveSides.home} /></span>}
                {i === 0 && <span className="sr-only"> – </span>}
              </span>
            ))}
          </h3>
        ) : (
          <h3 className="match__title">{match.title}</h3>
        )}
        {clockLine && <p className="match__clock">{clockLine}</p>}
        {hint && <LiveHint />}
        <VenueLine venue={match.venue} />
        <Broadcasters list={match.broadcasters} />
      </div>
    </article>
  );
}
