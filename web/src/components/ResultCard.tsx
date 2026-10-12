import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Match } from '@sportradar/shared';
import { Trophy } from 'lucide-react';
import { competitionLine, scoreLabel, scoreParts } from '../lib/labels';
import { countUpValue } from '../lib/motion';
import { podiumSlots } from '../lib/podium';
import { formatTime } from '../lib/time';
import { TeamCrest } from './TeamCrest';
import { useTeams } from './TeamsContext';
import { SportIcon } from './icons/SportIcon';
import { VenueLine } from './ui';

const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Průběh 0 → 1 jednou, když prvek poprvé vjede do zorného pole; při omezeném pohybu rovnou 1. */
function useCountUp(duration = 750) {
  const ref = useRef<HTMLSpanElement>(null);
  const [t, setT] = useState(() => (reducedMotion() || typeof IntersectionObserver === 'undefined' ? 1 : 0));
  useEffect(() => {
    const el = ref.current;
    if (!el || t >= 1) return;
    let raf = 0;
    let start = 0;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setT(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      raf = requestAnimationFrame(step);
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // spouští se jen při připojení; t je jen počáteční hodnota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, t] as const;
}

function ScoreTiles({ home, away, winner }: { home: number; away: number; winner: 'home' | 'away' | 'draw' }) {
  const [ref, t] = useCountUp();
  return (
    <span ref={ref} className="score" aria-hidden="true">
      <span className={`score__tile${winner === 'away' ? ' is-loser' : ''}`}>{countUpValue(home, t)}</span>
      <span className="score__sep">:</span>
      <span className={`score__tile${winner === 'home' ? ' is-loser' : ''}`}>{countUpValue(away, t)}</span>
    </span>
  );
}

function Podium({ match }: { match: Match }) {
  const { driverTeams } = useTeams();
  const visual = podiumSlots(match.result?.podium, driverTeams);
  const byPos = [...visual].sort((a, b) => a.pos - b.pos);
  return (
    <ol className="podium" aria-label="Stupně vítězů">
      {byPos.map((s) => (
        <li key={s.pos} value={s.pos} className={`podium__slot podium__slot--${s.medal}`} style={{ order: visual.indexOf(s) } as CSSProperties}>
          <span className="podium__who">
            <span className="podium__name">{s.name}</span>
            {s.team && <span className="podium__team">{s.team}</span>}
          </span>
          <span className="podium__step" aria-hidden="true"><span className="podium__pos">{s.pos}</span></span>
        </li>
      ))}
    </ol>
  );
}

export function ResultCard({ match, className = '', style }: { match: Match; className?: string; style?: CSSProperties }) {
  const { teams } = useTeams();
  const result = match.result;
  if (!result) return null;
  const score = scoreParts(result);
  const time = result.dateOnly ? null : formatTime(match.startsAt);
  const meta = [time, competitionLine(match.sport, match.competition)].filter(Boolean).join(' · ');
  const hasPodium = !!result.podium && result.podium.length > 0;
  const names = [result.homeName ?? 'Domácí', result.awayName ?? 'Hosté'];
  return (
    <article className={`result ${className}`.trim()} data-sport={match.sport} style={style}>
      <div className="match__comp"><SportIcon sport={match.sport} size={15} />{meta}</div>
      {score ? (
        <div className="result__board" role="img" aria-label={scoreLabel(result) ?? undefined}>
          {(['home', 'away'] as const).map((side, i) => {
            const win = score.winner === side;
            const id = match.teams.length === 2 ? match.teams[i] : undefined;
            return (
              <span key={side} className={`result__side result__side--${side}${win ? ' is-winner' : ''}`} aria-hidden="true">
                <TeamCrest team={id ? teams.get(id) : undefined} name={names[i]} size={44} />
                <span className="result__name">
                  {names[i]}
                  {win && <Trophy className="result__trophy" size={14} strokeWidth={2} aria-hidden="true" />}
                </span>
              </span>
            );
          })}
          <ScoreTiles home={score.home} away={score.away} winner={score.winner} />
        </div>
      ) : (
        <h3 className="match__title">{match.title}</h3>
      )}
      {hasPodium && <Podium match={match} />}
      {result.note && <div className="result__note">{result.note}</div>}
      <VenueLine venue={match.venue} />
    </article>
  );
}
