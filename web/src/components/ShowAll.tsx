import { Eye, EyeOff, Info, Star } from 'lucide-react';

interface BarProps {
  hasFavorites: boolean;
  showAll: boolean;                 // uživatel ručně vypnul filtr oblíbených
  onToggleAll: () => void;
  onGoFavorites: () => void;
}

/** Bez oblíbených banner s odkazem na Oblíbené; s oblíbenými přepínač „všechny sporty“ / „jen oblíbené“. */
export function ShowAllBar({ hasFavorites, showAll, onToggleAll, onGoFavorites }: BarProps) {
  if (!hasFavorites) {
    return (
      <div className="banner" role="status">
        <Info size={18} aria-hidden="true" />
        <span className="banner__text">Zobrazuji všechny zápasy. Vyber oblíbené týmy a soutěže a uvidíš jen jejich zápasy.</span>
        <span className="banner__actions">
          <button className="btn" onClick={onGoFavorites}><Star size={18} aria-hidden="true" />Vybrat oblíbené</button>
        </span>
      </div>
    );
  }
  return (
    <div className="allbar">
      <button type="button" className="btn btn--ghost allbar__btn" aria-pressed={showAll} onClick={onToggleAll}>
        {showAll ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        {showAll ? 'Zobrazit jen oblíbené' : 'Zobrazit všechny sporty'}
      </button>
      {showAll && <span className="muted allbar__note" role="status">Filtr oblíbených je vypnutý.</span>}
    </div>
  );
}

/** Tlačítko pro postupné dozobrazení dlouhého seznamu. */
export function MoreButton({ remaining, step, onMore }: { remaining: number; step: number; onMore: () => void }) {
  if (remaining <= 0) return null;
  return (
    <div className="more">
      <button type="button" className="btn btn--ghost" onClick={onMore}>Zobrazit další</button>
      <span className="muted">{`Zbývá ${remaining} zápasů${remaining > step ? ` · po ${step}` : ''}`}</span>
    </div>
  );
}
