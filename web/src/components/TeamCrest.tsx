import { useState, type CSSProperties } from 'react';
import type { Sport, Team } from '@sportradar/shared';
import { monogramColor, monogramText } from '../lib/crest';
import { SportIcon } from './icons/SportIcon';

interface Props {
  team?: Team; name: string; size: number; className?: string;
  mono?: { text: string; colorKey: string };   // vlastní monogram (např. kód jezdce F1, barva podle týmu)
}

/** Erb týmu na světlém „štítku“ (tmavá loga zůstanou vidět i v tmavém režimu); bez loga / při chybě monogram. */
export function TeamCrest({ team, name, size, className, mono }: Props) {
  const [failed, setFailed] = useState<string | null>(null);
  const logo = team?.logo && team.logo !== failed ? team.logo : undefined;
  const style = { width: size, height: size, '--crest': `${size}px` } as CSSProperties;
  const cls = `crest${className ? ` ${className}` : ''}`;
  if (logo) {
    const inner = Math.round(size * 0.74);
    return (
      <span className={`${cls} crest--plate`} style={style} aria-hidden="true">
        <img
          src={logo} alt="" width={inner} height={inner}
          loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => setFailed(logo)}
        />
      </span>
    );
  }
  const text = mono?.text ?? monogramText(team?.id, name);
  return (
    <span
      className={`${cls} crest--mono${text.length > 2 ? ' crest--mono3' : ''}`} aria-hidden="true"
      style={{ ...style, background: monogramColor(mono?.colorKey ?? team?.id ?? name) }}
    >
      {text}
    </span>
  );
}

/** Štítek se znakem sportu (F1 nemá loga týmů). */
export function SportEmblem({ sport, size, className }: { sport: Sport; size: number; className?: string }) {
  return (
    <span className={`crest crest--emblem${className ? ` ${className}` : ''}`} data-sport={sport}
      style={{ width: size, height: size }} aria-hidden="true">
      <SportIcon sport={sport} size={Math.round(size * 0.58)} />
    </span>
  );
}
