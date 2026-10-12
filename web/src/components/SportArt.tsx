import type { Sport } from '@sportradar/shared';

/** Původní liniová grafika hřišť (kluziště, palubovka, okruh, hřiště, radar). Barva = currentColor, průhlednost řídí CSS. */
export type ArtKind = 'rink' | 'court' | 'track' | 'pitch' | 'radar';

export function artFor(sport: Sport | 'all'): ArtKind {
  if (sport === 'f1') return 'track';
  if (sport === 'nhl' || sport === 'cz-hockey') return 'rink';
  if (sport === 'nba' || sport === 'cz-basket') return 'court';
  if (sport === 'football') return 'pitch';
  return 'radar';
}

function Rink() {
  const faceoff = [[78, 48], [78, 132], [322, 48], [322, 132]];
  const dots = [[158, 48], [158, 132], [242, 48], [242, 132]];
  return (
    <>
      <rect x="4" y="4" width="392" height="172" rx="58" />
      <path d="M200 4v172" strokeWidth="3" />
      <path d="M140 4v172M260 4v172" strokeWidth="5" opacity=".7" />
      <path d="M30 22v136M370 22v136" />
      <circle cx="200" cy="90" r="26" />
      <circle cx="200" cy="90" r="2.5" fill="currentColor" />
      {faceoff.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="22" />
          <circle cx={x} cy={y} r="2.5" fill="currentColor" />
          <path d={`M${x - 6} ${y - 22}v-5M${x + 6} ${y - 22}v-5M${x - 6} ${y + 22}v5M${x + 6} ${y + 22}v5`} />
        </g>
      ))}
      {dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="currentColor" />)}
      <path d="M30 78a12 12 0 0 1 0 24M370 78a12 12 0 0 0 0 24" />
      <path d="M30 84h-6v12h6M370 84h6v12h-6" />
    </>
  );
}

function Court() {
  return (
    <>
      <rect x="4" y="4" width="392" height="212" rx="4" />
      <path d="M200 4v212" />
      <circle cx="200" cy="110" r="26" />
      <circle cx="200" cy="110" r="9" />
      <path d="M4 84h80v52H4M396 84h-80v52h80" />
      <circle cx="84" cy="110" r="26" />
      <circle cx="316" cy="110" r="26" strokeDasharray="5 6" />
      <path d="M4 22h30a92 92 0 0 1 0 176H4M396 22h-30a92 92 0 0 0 0 176h30" />
      <path d="M16 98v24M384 98v24" strokeWidth="3" />
      <circle cx="23" cy="110" r="5" />
      <circle cx="377" cy="110" r="5" />
    </>
  );
}

function Track() {
  const lap = 'M70 160C30 160 22 104 62 92L170 62c34-9 50 14 66 30 19 19 44 15 58-10 16-28 64-34 76 4 13 41-20 76-70 78z';
  return (
    <>
      <path d={lap} strokeWidth="20" opacity=".28" />
      <path d={lap} strokeWidth="1.5" strokeDasharray="7 9" />
      <path d="M44 150c-8-8-10-22-4-34" strokeWidth="6" strokeDasharray="5 5" />
      <path d="M332 72c14 4 22 14 24 26" strokeWidth="6" strokeDasharray="5 5" />
      <g stroke="none" fill="currentColor">
        {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5].map((c) => ((r + c) % 2 === 0
          ? <rect key={`${r}-${c}`} x={300 + c * 14} y={176 + r * 10} width="14" height="10" opacity=".55" /> : null)))}
        {[0, 1].map((r) => [0, 1, 2].map((c) => ((r + c) % 2 === 0
          ? <rect key={`s${r}-${c}`} x={140 + c * 5} y={154 + r * 5} width="5" height="5" /> : null)))}
      </g>
    </>
  );
}

/** Fotbalové hřiště shora: pruhy trávníku, středový kruh, pokutová a brankové území, oblouky, rohy. */
function Pitch() {
  return (
    <>
      <g stroke="none" fill="currentColor" opacity=".07">
        {[0, 2, 4, 6].map((k) => <rect key={k} x={4 + k * 49} y="4" width="49" height="212" />)}
      </g>
      <rect x="4" y="4" width="392" height="212" rx="2" />
      <path d="M200 4v212" />
      <circle cx="200" cy="110" r="30" />
      <circle cx="200" cy="110" r="2.5" fill="currentColor" />
      <path d="M4 50h64v120H4M4 84h22v52H4M396 50h-64v120h64M396 84h-22v52h22" />
      <circle cx="46" cy="110" r="2.5" fill="currentColor" />
      <circle cx="354" cy="110" r="2.5" fill="currentColor" />
      <path d="M68 89.6a30 30 0 0 1 0 40.8M332 89.6a30 30 0 0 0 0 40.8" />
      <path d="M4 12a8 8 0 0 0 8-8M388 4a8 8 0 0 0 8 8M4 208a8 8 0 0 1 8 8M396 208a8 8 0 0 0-8 8" />
    </>
  );
}

function Radar({ centered }: { centered?: boolean }) {
  // střed vpravo (do pruhu stránky), nebo uprostřed (prázdné stavy)
  return (
    <g transform={centered ? 'translate(-120 0)' : undefined}>
      {[30, 70, 110, 150, 190].map((r) => <circle key={r} cx="320" cy="110" r={r} />)}
      <path d="M320 -80v380M100 110h420" opacity=".6" />
      <path d="M320 110 448 -18" />
      <circle cx="262" cy="64" r="3.5" fill="currentColor" />
      <circle cx="372" cy="150" r="3.5" fill="currentColor" />
    </g>
  );
}

const VIEWBOX: Record<ArtKind, string> = { rink: '0 0 400 180', court: '0 0 400 220', track: '0 0 400 220', pitch: '0 0 400 220', radar: '0 0 400 220' };

export function SportArt({ kind, className, centered }: { kind: ArtKind; className?: string; centered?: boolean }) {
  return (
    <svg
      className={`art art--${kind}${className ? ` ${className}` : ''}`}
      viewBox={VIEWBOX[kind]} preserveAspectRatio="xMidYMid slice"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      aria-hidden="true" focusable="false"
    >
      {kind === 'rink' ? <Rink /> : kind === 'court' ? <Court /> : kind === 'track' ? <Track /> : kind === 'pitch' ? <Pitch /> : <Radar centered={centered} />}
    </svg>
  );
}
