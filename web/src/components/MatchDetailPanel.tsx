import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DetailStatBlock, GridEntry, LineupPlayer, Match, MatchDetail, RankingBlock, TeamLineup } from '@sportradar/shared';
import { CircleAlert, Info, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { detailFooter, detailTabs, rankingWidth, statBarWidths, statSentence, statusTone } from '../lib/detail';
import { competitionLine, venueLine } from '../lib/labels';
import { matchSides, splitSession } from '../lib/sides';
import { dayKey, dayLabel, formatTime } from '../lib/time';
import { useMatchDetail } from '../useDetail';
import { SportEmblem, TeamCrest } from './TeamCrest';
import { useTeams } from './TeamsContext';
import { SportIcon } from './icons/SportIcon';

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface Props { match: Match; now: Date; onClose: () => void }

/** Modální panel „Detail zápasu“: spodní list na mobilu, dialog uprostřed od 768 px. */
export function MatchDetailPanel({ match, now, onClose }: Props) {
  const { teams } = useTeams();
  const { state, retry } = useMatchDetail(match.id);
  const [tab, setTab] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const tabsId = useId();

  // fokus dovnitř, zámek scrollu stránky, ESC, návrat fokusu
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onClose]);

  const trap = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && el.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0]; const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  const sides = match.sport === 'f1' ? null : matchSides(match, teams);
  const { event, session } = splitSession(match.title);
  const when = `${dayLabel(dayKey(match.startsAt), now)} ${formatTime(match.startsAt)}`;
  const venue = venueLine(match.venue);
  const tabs = detailTabs(match.sport);
  const homeName = sides?.[0].name ?? 'Domácí';
  const awayName = sides?.[1].name ?? 'Hosté';

  const onTabKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : tab === 0 ? 1 : 0;
    setTab(next);
    document.getElementById(`${tabsId}-tab-${next}`)?.focus();
  };

  return (
    <div className="dsheet" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className="dsheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}
        data-sport={match.sport} tabIndex={-1} onKeyDown={trap}>
        <div className="dsheet__grip" aria-hidden="true" />
        <header className="dhead">
          <div className="dhead__top">
            <span className="dhead__comp"><SportIcon sport={match.sport} size={15} />{competitionLine(match.sport, match.competition)}</span>
            <button type="button" className="dhead__close" aria-label="Zavřít detail" onClick={onClose}>
              <X size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <h2 id={titleId} className="sr-only">Detail zápasu: {match.title}</h2>
          {sides ? (
            <div className="dhead__duel" aria-hidden="true">
              <div className="dhead__side">
                <TeamCrest team={sides[0].teamId ? teams.get(sides[0].teamId) : undefined} name={sides[0].name} size={48} />
                <span className="dhead__name">{sides[0].name}</span>
              </div>
              <div className="dhead__mid">
                <span className="dhead__time">{formatTime(match.startsAt)}</span>
                <span className="dhead__day">{dayLabel(dayKey(match.startsAt), now)}</span>
              </div>
              <div className="dhead__side">
                <TeamCrest team={sides[1].teamId ? teams.get(sides[1].teamId) : undefined} name={sides[1].name} size={48} />
                <span className="dhead__name">{sides[1].name}</span>
              </div>
            </div>
          ) : (
            <div className="dhead__solo" aria-hidden="true">
              <SportEmblem sport={match.sport} size={48} />
              <div className="dhead__event">
                {session && <span className="dhead__session">{session}</span>}
                <span className="dhead__evname">{event}</span>
              </div>
              <div className="dhead__mid">
                <span className="dhead__time">{formatTime(match.startsAt)}</span>
                <span className="dhead__day">{dayLabel(dayKey(match.startsAt), now)}</span>
              </div>
            </div>
          )}
          <p className="sr-only">{when}{venue ? `, ${venue}` : ''}</p>
          {venue && <p className="dhead__venue" aria-hidden="true">{venue}</p>}
        </header>

        <div className="dtabs" role="tablist" aria-label="Části detailu">
          {tabs.map((t, i) => (
            <button key={t} type="button" role="tab" id={`${tabsId}-tab-${i}`} aria-controls={`${tabsId}-panel`}
              aria-selected={tab === i} tabIndex={tab === i ? 0 : -1}
              className={`dtabs__tab${tab === i ? ' dtabs__tab--on' : ''}`} onClick={() => setTab(i)} onKeyDown={onTabKey}>
              {t}
            </button>
          ))}
        </div>

        <div className="dsheet__body" id={`${tabsId}-panel`} role="tabpanel" tabIndex={0} aria-labelledby={`${tabsId}-tab-${tab}`}>
          {state.status === 'loading' && <DetailSkeleton />}
          {state.status === 'error' && (
            <div className="derror" role="alert">
              <TriangleAlert size={26} strokeWidth={1.75} aria-hidden="true" />
              <p>Detail se nepodařilo načíst.</p>
              <button type="button" className="btn btn--ghost" onClick={retry}><RefreshCw size={18} aria-hidden="true" />Zkusit znovu</button>
            </div>
          )}
          {state.status === 'ready' && (
            <DetailBody detail={state.detail} tab={tab} homeName={homeName} awayName={awayName} match={match} now={now} />
          )}
        </div>

        {state.status === 'ready' && <DetailFoot detail={state.detail} now={now} />}
      </div>
    </div>
  );
}

function DetailFoot({ detail, now }: { detail: MatchDetail; now: Date }) {
  const f = detailFooter(detail, now);
  return (
    <footer className="dsheet__foot">
      {f.text}
      {f.stale && <span className="dsheet__stale"> · může být neaktuální</span>}
    </footer>
  );
}

function DetailSkeleton() {
  return (
    <div className="dskel" aria-busy="true">
      <span className="sr-only" role="status">Načítám detail…</span>
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk dskel__row" />)}
    </div>
  );
}

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div className="dnote">
      <Info size={18} strokeWidth={2} aria-hidden="true" />
      <div>{notes.map((n) => <p key={n}>{n}</p>)}</div>
    </div>
  );
}

function DetailBody({ detail, tab, homeName, awayName, match, now }: { detail: MatchDetail; tab: number; homeName: string; awayName: string; match: Match; now: Date }) {
  const notes = <Notes notes={detail.notes} />;
  if (detail.sport === 'f1') {
    return tab === 0
      ? <>{detail.weekend && <Weekend weekend={detail.weekend} currentId={match.id} now={now} />}{detail.rankings?.map((r) => <Ranking key={r.title} block={r} />)}{!detail.rankings && notes}</>
      : <>{notes}<Grid entries={detail.grid ?? detail.drivers ?? []} isGrid={!!detail.grid} /></>;
  }
  if (tab === 0) {
    return (
      <>
        {detail.stats.length > 0 && (
          <div className="dlegend" aria-hidden="true">
            <span className="dlegend__home">{homeName}</span>
            <span className="dlegend__away">{awayName}</span>
          </div>
        )}
        {detail.stats.map((b) => <StatBlock key={b.title} block={b} homeName={homeName} awayName={awayName} />)}
        {detail.stats.length === 0 && notes}
      </>
    );
  }
  return (
    <>
      {notes}
      {detail.lineups && (
        <div className="dlineups">
          <Lineup team={detail.lineups.home} side="home" />
          <Lineup team={detail.lineups.away} side="away" />
        </div>
      )}
    </>
  );
}

function StatBlock({ block, homeName, awayName }: { block: DetailStatBlock; homeName: string; awayName: string }) {
  return (
    <section className="dblock">
      <h3 className="dblock__title">{block.title}</h3>
      {block.rows.length > 0 && (
        <ul className="dstats">
          {block.rows.map((r) => {
            const bars = typeof r.homeValue === 'number' && typeof r.awayValue === 'number';
            const w = statBarWidths(r.homeValue, r.awayValue, r.lowerIsBetter);
            const cls = (side: 'home' | 'away') => `dstat__v dstat__v--${side}${w.better === side ? ' is-better' : w.better ? ' is-worse' : ''}`;
            return (
              <li key={r.label} className="dstat">
                <span className="sr-only">{statSentence(r, homeName, awayName)}{w.better ? ` (lépe ${w.better === 'home' ? homeName : awayName})` : ''}</span>
                <div className="dstat__row" aria-hidden="true">
                  <span className={cls('home')}>{r.home}</span>
                  <span className="dstat__label">{r.label}</span>
                  <span className={cls('away')}>{r.away}</span>
                </div>
                {bars && (
                  <div className="dstat__bars" aria-hidden="true">
                    <span className="dstat__track dstat__track--home">
                      <span className={`dstat__bar${w.better === 'away' ? ' is-worse' : ''}`} style={{ '--w': `${w.home}%` } as CSSProperties} />
                    </span>
                    <span className="dstat__track dstat__track--away">
                      <span className={`dstat__bar${w.better === 'home' ? ' is-worse' : ''}`} style={{ '--w': `${w.away}%` } as CSSProperties} />
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {block.note && <p className="dblock__note">{block.note}</p>}
    </section>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`dchip dchip--${statusTone(status)}`}>
      <CircleAlert size={13} strokeWidth={2.25} aria-hidden="true" />{status}
    </span>
  );
}

function Player({ p }: { p: LineupPlayer }) {
  return (
    <li className="dplayer">
      <span className="dplayer__num" aria-hidden={p.number === undefined}>{p.number ?? '–'}</span>
      <span className="dplayer__name">
        {p.number !== undefined && <span className="sr-only">číslo {p.number}, </span>}
        {p.name}
        {p.pos && <span className="dplayer__pos">{p.pos}</span>}
      </span>
      {p.status && <StatusChip status={p.status} />}
    </li>
  );
}

function Lineup({ team, side }: { team: TeamLineup; side: 'home' | 'away' }) {
  const { teams } = useTeams();
  return (
    <section className={`dteam dteam--${side}`}>
      <h3 className="dteam__name">
        <TeamCrest team={team.teamId ? teams.get(team.teamId) : undefined} name={team.name} size={28} />
        <span>{team.name}</span>
      </h3>
      {team.groups.map((g) => (
        <div key={g.title} className="dgroup">
          <h4 className="dgroup__title">{g.title}<span className="dgroup__count">{g.players.length}</span></h4>
          <ul className="dplayers">{g.players.map((p, i) => <Player key={`${p.name}-${i}`} p={p} />)}</ul>
        </div>
      ))}
    </section>
  );
}

function Weekend({ weekend, currentId, now }: { weekend: NonNullable<MatchDetail['weekend']>; currentId: string; now: Date }) {
  return (
    <section className="dblock">
      <h3 className="dblock__title">Program víkendu</h3>
      <ol className="dweekend">
        {weekend.sessions.map((s) => (
          <li key={s.id} className={`dweekend__item${s.id === currentId ? ' is-current' : ''}`} aria-current={s.id === currentId ? 'true' : undefined}>
            <span className="dweekend__label">{s.label}</span>
            <span className="dweekend__when">{dayLabel(dayKey(s.startsAt), now)} {formatTime(s.startsAt)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Ranking({ block }: { block: RankingBlock }) {
  const leader = block.rows[0]?.value ?? 0;
  return (
    <section className="dblock">
      <h3 className="dblock__title">{block.title}</h3>
      <ol className="drank">
        {block.rows.map((r) => (
          <li key={`${r.pos}-${r.name}`} className="drank__row">
            <span className={`drank__pos${r.pos <= 3 ? ` drank__pos--${r.pos}` : ''}`}>{r.pos}</span>
            <span className="drank__who">
              <span className="drank__name">{r.name}</span>
              {r.sub && <span className="drank__sub">{r.sub}</span>}
              <span className="drank__track" aria-hidden="true"><span className="drank__bar" style={{ '--w': `${rankingWidth(r.value, leader)}%` } as CSSProperties} /></span>
            </span>
            <span className="drank__val">{r.value}<span className="drank__unit"> {block.unit}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Grid({ entries, isGrid }: { entries: GridEntry[]; isGrid: boolean }) {
  if (!entries.length) return null;
  return (
    <section className="dblock">
      <h3 className="dblock__title">{isGrid ? 'Startovní rošt' : 'Jezdci podle pořadí šampionátu'}</h3>
      <ol className={`dgrid${isGrid ? ' dgrid--grid' : ''}`}>
        {entries.map((e) => (
          <li key={`${e.pos}-${e.name}`} className="dgrid__slot">
            <span className="dgrid__pos">{e.pos}</span>
            <span className="dgrid__who">
              <span className="dgrid__name">{e.name}</span>
              {e.team && <span className="dgrid__team">{e.team}</span>}
            </span>
            {e.number && <span className="dgrid__num" aria-label={`číslo ${e.number}`}>#{e.number}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
