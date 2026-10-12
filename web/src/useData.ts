import { useEffect, useState } from 'react';
import type { MatchesFile, StandingsFile, TeamsFile } from '@sportradar/shared';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; matches: MatchesFile; teams: TeamsFile; standings: StandingsFile | null };

export function useData(): DataState {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('data/matches.json').then((r) => { if (!r.ok) throw new Error(`matches.json ${r.status}`); return r.json() as Promise<MatchesFile>; }),
      fetch('data/teams.json').then((r) => { if (!r.ok) throw new Error(`teams.json ${r.status}`); return r.json() as Promise<TeamsFile>; }),
      // tabulky jsou nepovinné: chyba nesmí shodit aplikaci
      fetch('data/standings.json')
        .then((r) => (r.ok ? (r.json() as Promise<StandingsFile>) : null))
        .then((s) => (s && Array.isArray(s.tables) ? s : null))
        .catch(() => null),
    ]).then(([matches, teams, standings]) => { if (!cancelled) setState({ status: 'ready', matches, teams, standings }); })
      .catch((e) => { if (!cancelled) setState({ status: 'error', message: String(e.message ?? e) }); });
    return () => { cancelled = true; };
  }, []);
  return state;
}
