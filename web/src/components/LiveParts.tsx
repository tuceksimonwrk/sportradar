import { useState } from 'react';
import { CloudOff } from 'lucide-react';
import type { Match } from '@sportradar/shared';
import { formatLiveClock, type LiveState } from '../lib/live';
import { useLive } from './LiveContext';

/** Živý stav zápasu, jen pokud se hraje nebo skončil (phase 'pre' se tváří jako bez živých dat). */
export function useLiveState(match: Match): { live: LiveState | undefined; hint: boolean } {
  const { states, unavailable } = useLive();
  const s = states.get(match.id);
  return { live: s && s.phase !== 'pre' ? s : undefined, hint: !s && unavailable.has(match.id) };
}

/** Zápas, který podle zdroje ještě nezačal, i když plánovaný začátek už uplynul. */
export function useNotStarted(match: Match, now: Date): boolean {
  const { states } = useLive();
  return states.get(match.id)?.phase === 'pre' && Date.parse(match.startsAt) <= now.getTime();
}

/** Číslo skóre, které při změně krátce blikne (animaci vypíná prefers-reduced-motion v CSS). */
export function ScoreNum({ value }: { value?: number }) {
  const [seen, setSeen] = useState(value);
  const [flash, setFlash] = useState(0);
  if (value !== seen) {
    setSeen(value);
    if (seen !== undefined && value !== undefined) setFlash(flash + 1);
  }
  return <span key={flash} className={flash ? 'flash' : undefined}>{value ?? '–'}</span>;
}

export function LiveBadge({ live, small = false }: { live: LiveState; small?: boolean }) {
  return live.phase === 'live'
    ? <span className={`livebadge${small ? ' livebadge--sm' : ''}`}>Živě</span>
    : <span className={`endbadge${small ? ' endbadge--sm' : ''}`}>Konec</span>;
}


export function LiveHint() {
  return <span className="livehint"><CloudOff size={14} aria-hidden="true" />živé skóre nedostupné</span>;
}

/** Text pro čtečky: „Skóre: Domácí 1, Hosté 0“. */
export function scoreAnnouncement(live: LiveState, home: string, away: string): string {
  if (live.home === undefined || live.away === undefined) return '';
  return `${live.phase === 'post' ? 'Konec' : 'Skóre'}: ${home} ${live.home}, ${away} ${live.away}`;
}
