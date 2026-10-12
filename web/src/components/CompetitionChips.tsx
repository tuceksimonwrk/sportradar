import { COMPETITIONS } from '@sportradar/shared';

const FOOTBALL = COMPETITIONS.filter((c) => c.sport === 'football');

/** Druhá řada čipů pod „Fotbal“: Vše + soutěže (filtr podle `match.competitionId`). */
export function CompetitionChips({ competition, onCompetition }: { competition: string; onCompetition: (c: string) => void }) {
  const items = [{ id: 'all', name: 'Všechny soutěže', title: undefined as string | undefined }, ...FOOTBALL.map((c) => ({ id: c.id, name: c.name, title: `${c.name} (${c.country})` }))];
  return (
    <div className="chips chips--sub" role="group" aria-label="Filtr fotbalových soutěží" data-sport="football">
      {items.map((c) => (
        <button key={c.id} type="button" className={`chip chip--sub${competition === c.id ? ' chip--on' : ''}`}
          aria-pressed={competition === c.id} title={c.title} onClick={() => onCompetition(c.id)}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
