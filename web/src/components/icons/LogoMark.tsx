/** Značka Sportradar: puk/kruh hřiště + paprsek radaru (při načtení jednou oběhne). */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="logomark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="lm-sweep" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc21a" stopOpacity="0" />
          <stop offset="1" stopColor="#ffc21a" stopOpacity=".75" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="#ffc21a" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#ffc21a" strokeOpacity=".45" strokeWidth="1.5" />
      <path d="M16 2.5v27M2.5 16h27" stroke="#ffc21a" strokeOpacity=".25" strokeWidth="1" />
      <g className="logomark__sweep">
        <path d="M16 16 16 3.5A12.5 12.5 0 0 1 27.4 10.9Z" fill="url(#lm-sweep)" />
      </g>
      <circle cx="16" cy="16" r="2.2" fill="#ffc21a" />
      <circle cx="21.5" cy="20.5" r="1.6" fill="#ffffff" />
    </svg>
  );
}
