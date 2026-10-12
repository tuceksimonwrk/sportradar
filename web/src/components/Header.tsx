import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, ListOrdered, Star, Trophy, type LucideIcon } from 'lucide-react';
import { LogoMark } from './icons/LogoMark';

export type Tab = 'program' | 'results' | 'standings' | 'favs';

const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'program', label: 'Program', Icon: CalendarDays },
  { id: 'results', label: 'Výsledky', Icon: Trophy },
  { id: 'standings', label: 'Tabulky', Icon: ListOrdered },
  { id: 'favs', label: 'Oblíbené', Icon: Star },
];

/** Hlavička: značka (při rolování odjede nahoru, zůstanou záložky) a záložky s posuvným indikátorem. */
export function Header({ tab, onTab, favCount }: { tab: Tab; onTab: (t: Tab) => void; favCount: number }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const index = TABS.findIndex((t) => t.id === tab);
  return (
    <>
      <div ref={sentinel} className="top-sentinel" aria-hidden="true" />
      <header className={`top${compact ? ' top--compact' : ''}`}>
        <div className="top__inner">
          <h1 className="brand"><LogoMark /><span className="brand__word">Sportradar</span></h1>
          <nav className="tabs" aria-label="Sekce" style={{ '--tab': index } as CSSProperties}>
            <span className="tabs__ind" aria-hidden="true" />
            {TABS.map(({ id, label, Icon }) => (
              <button key={id} className={`tab${tab === id ? ' on' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => onTab(id)}>
                <span className="tab__icon">
                  <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
                  {id === 'favs' && favCount > 0 && <span className="tab__badge"><span className="sr-only">(</span>{favCount}<span className="sr-only">)</span></span>}
                </span>
                <span className="tab__label">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
    </>
  );
}
