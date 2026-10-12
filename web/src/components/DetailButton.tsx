import type { Match } from '@sportradar/shared';
import { ChartColumn } from 'lucide-react';
import { hasDetail } from '../lib/detail';
import { useDetail } from './DetailContext';

/** Tlačítko „Detail zápasu“ – jen pokud pro zápas existuje detail v indexu. */
export function DetailButton({ match }: { match: Match }) {
  const { ids, open } = useDetail();
  if (!hasDetail(ids, match.id)) return null;
  const f1 = match.sport === 'f1';
  return (
    <button type="button" className="calbtn detbtn" aria-label="Detail zápasu" aria-haspopup="dialog"
      title={f1 ? 'Detail: pořadí a rošt' : 'Detail: statistiky a sestavy'} onClick={() => open(match)}>
      <ChartColumn size={20} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
