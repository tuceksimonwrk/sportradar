import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Match, Sport } from '@sportradar/shared';
import { Link2, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { FavoritesView } from './components/FavoritesView';
import { Header, type Tab } from './components/Header';
import { ProgramView } from './components/ProgramView';
import { ResultsView } from './components/ResultsView';
import { SportArt } from './components/SportArt';
import { StandingsView } from './components/StandingsView';
import { TeamsContext, type TeamsInfo } from './components/TeamsContext';
import { EmptyState, Skeleton } from './components/ui';
import { ReminderContext } from './components/ReminderContext';
import { loadReminder, saveReminder } from './lib/reminder';
import { decodeShare, encodeShare, loadFavorites, saveFavorites } from './lib/favorites';
import { driverTeamMap } from './lib/podium';
import { competitionForSport, selectMatches, selectResults } from './lib/schedule';
import { defaultStandingsSport, defaultTableId, tablesForSport } from './lib/standings';
import { dayKey, formatTime, isStale } from './lib/time';
import { useData } from './useData';
import { useDetailIndex } from './useDetail';
import { DetailContext, type DetailInfo } from './components/DetailContext';
import { MatchDetailPanel } from './components/MatchDetailPanel';
import { LiveContext } from './components/LiveContext';
import { LIVE_AFTER_MS } from './lib/live';
import { useLiveScores } from './useLiveScores';

const storage = (): Storage | undefined => { try { return window.localStorage; } catch { return undefined; } };

function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function updatedLabel(iso: string, now: Date): string {
  if (Number.isNaN(Date.parse(iso))) return 'neznámo';
  const same = dayKey(iso) === dayKey(now.toISOString());
  return same ? formatTime(iso) : `${new Date(iso).toLocaleDateString('cs-CZ')} ${formatTime(iso)}`;
}

export default function App() {
  const data = useData();
  const now = useNow(60_000);
  const [favs, setFavs] = useState<string[]>(() => loadFavorites(storage()));
  const [tab, setTab] = useState<Tab>('program');
  const [allToggled, setAllToggled] = useState(false); // ruční „zobrazit všechny sporty“ (jen pohled, neukládá se)
  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [competition, setCompetition] = useState('all'); // fotbal: id soutěže nebo 'all'
  const [pickedStandings, setPickedStandings] = useState<Sport | null>(null); // null = podle oblíbených
  const [pickedTable, setPickedTable] = useState<string | null>(null);        // null = podle oblíbených
  const [reminder, setReminder] = useState<number>(() => loadReminder(storage()));
  const [shareMsg, setShareMsg] = useState('');
  const detailIds = useDetailIndex();
  const [detailMatch, setDetailMatch] = useState<Match | null>(null);
  const closeDetail = useCallback(() => setDetailMatch(null), []);
  const detailInfo = useMemo<DetailInfo>(() => ({ ids: detailIds, open: setDetailMatch }), [detailIds]);
  const [incoming, setIncoming] = useState<string[] | null>(() => {
    const d = decodeShare(window.location.hash);
    return d && d.length ? d : null;
  });

  useEffect(() => saveFavorites(storage(), favs), [favs]);
  useEffect(() => saveReminder(storage(), reminder), [reminder]);
  const reminderInfo = useMemo(() => ({ minutes: reminder, setMinutes: setReminder }), [reminder]);

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
  const showAll = favs.length === 0 || allToggled; // bez oblíbených se ukazuje vše
  const viewKey = `${sport}|${competition}|${showAll}`; // změna filtru vrací seznamy na první dávku
  // kandidáti živého skóre: zobrazené zápasy včetně těch, které už přešly 3h okno „probíhá“
  const livePool = useMemo(
    () => (data.status === 'ready' ? selectMatches(data.matches.matches, favSet, now, sport, competition, { showAll, windowMs: LIVE_AFTER_MS }) : []),
    [data, favSet, now, sport, competition, showAll],
  );
  const live = useLiveScores(livePool, now);
  const liveIds = useMemo(() => new Set([...live.states.values()].filter((s) => s.phase === 'live').map((s) => s.matchId)), [live.states]);
  const selected = useMemo(
    () => (data.status === 'ready' ? selectMatches(data.matches.matches, favSet, now, sport, competition, { showAll, liveIds }) : []),
    [data, favSet, now, sport, competition, showAll, liveIds],
  );

  const calendarMatches = useMemo(
    () => (data.status === 'ready' ? selectMatches(data.matches.matches, favSet, now, 'all') : []),
    [data, favSet, now],
  );

  const standingsSport = pickedStandings ?? defaultStandingsSport(favs);

  const results = useMemo(
    () => (data.status === 'ready' ? selectResults(data.matches.matches, favSet, now, sport, competition, { showAll }) : []),
    [data, favSet, now, sport, competition, showAll],
  );

  const teamsInfo = useMemo<TeamsInfo>(() => (data.status === 'ready'
    ? { teams: new Map(data.teams.teams.map((t) => [t.id, t])), driverTeams: driverTeamMap(data.standings) }
    : { teams: new Map(), driverTeams: new Map() }), [data]);

  const pickSport = (s: Sport | 'all') => { setSport(s); setCompetition((c) => competitionForSport(s, c)); };
  const pickStandings = (s: Sport) => { setPickedStandings(s); setPickedTable(null); };
  const standingsTables = data.status === 'ready' ? tablesForSport(data.standings, standingsSport) : [];
  const tableId = pickedTable && standingsTables.some((t) => t.id === pickedTable)
    ? pickedTable : defaultTableId(standingsTables, favs, teamsInfo.teams);

  const goTab = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };

  return (
    <TeamsContext.Provider value={teamsInfo}>
    <ReminderContext.Provider value={reminderInfo}>
    <DetailContext.Provider value={detailInfo}>
    <LiveContext.Provider value={live}>
      <div className="backdrop" aria-hidden="true"><SportArt kind="radar" /></div>
      <Header tab={tab} onTab={goTab} favCount={favs.length} />
      <main className="app" id="obsah">
        {incoming && (
          <div className="banner" role="status">
            <Link2 size={18} aria-hidden="true" />
            <span className="banner__text">Odkaz obsahuje {incoming.length} oblíbených.</span>
            <span className="banner__actions">
              <button className="btn" onClick={() => applyIncoming(false)}>Nahradit</button>
              <button className="btn btn--ghost" onClick={() => applyIncoming(true)}>Sloučit</button>
              <button className="btn btn--ghost btn--icon" aria-label="Zrušit" title="Zrušit" onClick={() => { setIncoming(null); clearHash(); }}>
                <X size={18} aria-hidden="true" />
              </button>
            </span>
          </div>
        )}
        {data.status === 'loading' && <Skeleton />}
        {data.status === 'error' && (
          <EmptyState icon={<TriangleAlert size={26} strokeWidth={1.75} />}
            title="Data se nepodařilo načíst" text={`Zkontroluj připojení a zkus to znovu. (${data.message})`}
            action={<button className="btn" onClick={() => window.location.reload()}><RefreshCw size={18} aria-hidden="true" />Zkusit znovu</button>} />
        )}
        {data.status === 'ready' && (
          <div key={tab} className="view">
            {isStale(data.matches.generatedAt, now) && (
              <div className="banner banner--warn"><TriangleAlert size={18} aria-hidden="true" />
                Data nemusí být aktuální (poslední aktualizace {new Date(data.matches.generatedAt).toLocaleString('cs-CZ')}).</div>
            )}
            {tab === 'program' ? (
              <ProgramView key={viewKey} matches={selected} now={now} sport={sport} onSport={pickSport} competition={competition} onCompetition={setCompetition}
                hasFavorites={favs.length > 0} showAll={allToggled} onToggleAll={() => setAllToggled((v) => !v)} onGoFavorites={() => goTab('favs')} />
            ) : tab === 'results' ? (
              <ResultsView key={viewKey} matches={results} now={now} sport={sport} onSport={pickSport} competition={competition} onCompetition={setCompetition}
                hasFavorites={favs.length > 0} showAll={allToggled} onToggleAll={() => setAllToggled((v) => !v)} onGoFavorites={() => goTab('favs')} />
            ) : tab === 'standings' ? (
              <StandingsView standings={data.standings} sport={standingsSport} onSport={pickStandings}
                tableId={tableId} onTable={setPickedTable} favs={favs} now={now} />
            ) : <FavoritesView teams={data.teams.teams} favs={favs} matches={calendarMatches} onToggle={toggle} onShare={share} shareMsg={shareMsg} />}
          </div>
        )}
      </main>
      <footer className="foot">
        <div className="foot__inner">
          <p>
            Data: NHL, ESPN, Jolpica, hokej.cz, nbl.basketball, chanceliga.cz
            {data.status === 'ready' && <> · aktualizováno {updatedLabel(data.matches.generatedAt, now)}</>}
          </p>
          <p className="foot__fine">Živé skóre: NBA a fotbal (ESPN). Ostatní soutěže ho zatím nemají.</p>
          <p className="foot__fine">Neoficiální fanouškovská stránka. Loga a názvy patří jejich vlastníkům.</p>
        </div>
      </footer>
      {detailMatch && <MatchDetailPanel match={detailMatch} now={now} onClose={closeDetail} />}
    </LiveContext.Provider>
    </DetailContext.Provider>
    </ReminderContext.Provider>
    </TeamsContext.Provider>
  );
}
