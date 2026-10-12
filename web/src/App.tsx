import { useEffect, useMemo, useState } from 'react';
import type { Sport } from '@sportradar/shared';
import { FavoritesView } from './components/FavoritesView';
import { ProgramView } from './components/ProgramView';
import { decodeShare, encodeShare, loadFavorites, saveFavorites } from './lib/favorites';
import { selectMatches } from './lib/schedule';
import { isStale } from './lib/time';
import { useData } from './useData';

const storage = (): Storage | undefined => { try { return window.localStorage; } catch { return undefined; } };

function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

export default function App() {
  const data = useData();
  const now = useNow(60_000);
  const [favs, setFavs] = useState<string[]>(() => loadFavorites(storage()));
  const [tab, setTab] = useState<'program' | 'favs'>(() => (loadFavorites(storage()).length ? 'program' : 'favs'));
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [shareMsg, setShareMsg] = useState('');
  const [incoming, setIncoming] = useState<string[] | null>(() => {
    const d = decodeShare(window.location.hash);
    return d && d.length ? d : null;
  });

  useEffect(() => saveFavorites(storage(), favs), [favs]);

  const toggle = (id: string) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const clearHash = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);
  const applyIncoming = (merge: boolean) => {
    if (!incoming) return;
    setFavs((f) => (merge ? [...new Set([...f, ...incoming])] : incoming));
    setIncoming(null); clearHash(); setTab('program');
  };
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}${encodeShare(favs)}`;
    try { await navigator.clipboard.writeText(url); setShareMsg('Odkaz zkopírován do schránky.'); }
    catch { setShareMsg(url); }
  };

  const favSet = useMemo(() => new Set(favs), [favs]);
  const selected = useMemo(
    () => (data.status === 'ready' ? selectMatches(data.matches.matches, favSet, now, sport) : []),
    [data, favSet, now, sport],
  );

  return (
    <div className="app">
      <header className="top">
        <h1>Sportradar</h1>
        <nav className="tabs">
          <button className={tab === 'program' ? 'on' : ''} onClick={() => setTab('program')}>Program</button>
          <button className={tab === 'favs' ? 'on' : ''} onClick={() => setTab('favs')}>Oblíbené ({favs.length})</button>
        </nav>
      </header>
      <main>
        {incoming && (
          <div className="banner" role="status">
            Odkaz obsahuje {incoming.length} oblíbených.
            <button className="btn" onClick={() => applyIncoming(false)}>Nahradit</button>
            <button className="btn" onClick={() => applyIncoming(true)}>Sloučit</button>
            <button className="btn btn--ghost" onClick={() => { setIncoming(null); clearHash(); }}>Zrušit</button>
          </div>
        )}
        {data.status === 'loading' && <p className="pad muted">Načítám…</p>}
        {data.status === 'error' && <p className="pad">Data se nepodařilo načíst ({data.message}).</p>}
        {data.status === 'ready' && (
          <>
            {isStale(data.matches.generatedAt, now) && (
              <div className="banner banner--warn">Data nemusí být aktuální (poslední aktualizace {new Date(data.matches.generatedAt).toLocaleString('cs-CZ')}).</div>
            )}
            {tab === 'program'
              ? <ProgramView matches={selected} now={now} sport={sport} onSport={setSport}
                  hasFavorites={favs.length > 0} onGoFavorites={() => setTab('favs')} />
              : <FavoritesView teams={data.teams.teams} favs={favs} onToggle={toggle} onShare={share} shareMsg={shareMsg} />}
          </>
        )}
      </main>
    </div>
  );
}
