import type { Sport } from '@sportradar/shared';

/** Vlastní ikony sportů: mřížka 24 px, tah 1.75, currentColor (stejně jako lucide). Vždy dekorativní. */
interface Props { sport: Sport | 'all'; size?: number; className?: string }

function Paths({ sport }: { sport: Props['sport'] }) {
  switch (sport) {
    case 'f1': // závodní přilba z boku s hledím
      return (
        <>
          <path d="M3.5 18v-3.5A9.5 9.5 0 0 1 13 5c3.8 0 6.8 2.4 8 6h-7.2a1.5 1.5 0 0 0-1.5 1.5v1a1.5 1.5 0 0 0 1.5 1.5h7.7v1.5a1.5 1.5 0 0 1-1.5 1.5Z" />
          <path d="M3.8 12.5c3-.9 5.4-1 8.5-.5" />
          <path d="M8.5 18v-3" />
        </>
      );
    case 'nhl':
    case 'cz-hockey': // hokejka a puk
      return (
        <>
          <path d="M8.5 2.5 14.4 15.4c.4.9 1.2 1.6 2.3 1.6H21.5" />
          <path d="M21.5 17v-1.9" />
          <ellipse cx="6" cy="17.3" rx="3.4" ry="1.5" />
          <path d="M2.6 17.3v1.6c0 .8 1.5 1.5 3.4 1.5s3.4-.7 3.4-1.5v-1.6" />
        </>
      );
    case 'nba':
    case 'cz-basket': // míč
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18" />
          <path d="M5.6 5.7c1.9 1.6 3.1 3.8 3.1 6.3s-1.2 4.7-3.1 6.3" />
          <path d="M18.4 5.7c-1.9 1.6-3.1 3.8-3.1 6.3s1.2 4.7 3.1 6.3" />
        </>
      );
    default: // vše: radar
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 12 18.4 5.6" />
          <circle cx="15.5" cy="15" r=".9" fill="currentColor" stroke="none" />
        </>
      );
  }
}

export function SportIcon({ sport, size = 18, className }: Props) {
  return (
    <svg
      className={className ? `sicon ${className}` : 'sicon'}
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <Paths sport={sport} />
    </svg>
  );
}
