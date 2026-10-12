import type { CSSProperties, ReactNode } from 'react';
import type { Broadcaster, Sport, Venue } from '@sportradar/shared';
import { MapPin, Tv } from 'lucide-react';
import { venueLine } from '../lib/labels';
import { staggerIndex } from '../lib/motion';
import { SportArt, artFor, type ArtKind } from './SportArt';
import { SportIcon } from './icons/SportIcon';

/** Třída a zpoždění pro postupný nástup prvních ~8 položek (jen při připojení do stránky). */
export function enter(i: number, base = ''): { className: string; style?: CSSProperties } {
  const idx = staggerIndex(i);
  if (idx === undefined) return { className: base };
  return { className: `${base} enter`.trim(), style: { '--i': idx } as CSSProperties };
}

/** Úzký pruh pod záložkami: ikona, název stránky, podtitul a liniová grafika sportu. */
export function PageHead({ icon, title, subtitle, sport }: { icon: ReactNode; title: string; subtitle: string; sport: Sport | 'all' }) {
  return (
    <div className="pagehead" data-sport={sport === 'all' ? undefined : sport}>
      <SportArt kind={artFor(sport)} className="pagehead__art" />
      <span className="pagehead__icon" aria-hidden="true">{icon}</span>
      <div className="pagehead__text">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {sport !== 'all' && <SportIcon sport={sport} size={22} className="pagehead__sport" />}
    </div>
  );
}

/** Ilustrovaný prázdný / chybový stav s jednou jasnou akcí. */
export function EmptyState({ art = 'radar', icon, title, text, action }: {
  art?: ArtKind; icon: ReactNode; title: string; text?: string; action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__art" aria-hidden="true">
        <SportArt kind={art} centered />
        <span className="empty__icon">{icon}</span>
      </div>
      <p className="empty__title">{title}</p>
      {text && <p className="empty__text">{text}</p>}
      {action}
    </div>
  );
}

export function VenueLine({ venue }: { venue?: Venue }) {
  const v = venueLine(venue);
  if (!v) return null;
  return <div className="meta"><MapPin size={15} strokeWidth={1.75} aria-hidden="true" /><span>{v}</span></div>;
}

export function Broadcasters({ list }: { list: Broadcaster[] }) {
  return (
    <div className="tv">
      <Tv size={15} strokeWidth={1.75} aria-hidden="true" className="tv__icon" />
      <span className="sr-only">Vysílá:</span>
      <span className="tv__list">
        {list.length === 0 && <span className="badge badge--none">kde sledovat: neznámé</span>}
        {list.map((b) =>
          b.url
            ? <a key={b.name} className="badge" href={b.url} target="_blank" rel="noreferrer">{b.name}</a>
            : <span key={b.name} className="badge">{b.name}</span>)}
      </span>
    </div>
  );
}

/** Kostra stránky při načítání (shimmer), místo textu „Načítám…“. */
export function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true">
      <span className="sr-only" role="status">Načítám…</span>
      <div className="sk sk--head" />
      <div className="sk sk--hero" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="sk-card">
          <div className="sk sk--time" />
          <div className="sk-lines"><div className="sk sk--line" /><div className="sk sk--line sk--short" /></div>
        </div>
      ))}
    </div>
  );
}
