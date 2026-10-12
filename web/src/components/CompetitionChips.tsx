import { competitionsOfGroup, type GroupId } from '@sportradar/shared';

/** Druhá řada čipů pod vybraným sportem: soutěže skupiny (u hokeje a basketbalu interní sporty, u fotbalu ligy). Bez soutěží (Vše, F1) se nevykreslí. */
export function CompetitionChips({ group, competition, onCompetition, withAll = true }: {
  group: GroupId | 'all'; competition: string; onCompetition: (c: string) => void; withAll?: boolean;
}) {
  const comps = group === 'all' ? [] : competitionsOfGroup(group);
  if (comps.length === 0) return null;
  const items = [...(withAll ? [{ id: 'all', label: 'Vše', title: undefined as string | undefined, sport: undefined }] : []), ...comps];
  return (
    <div className="chips chips--sub" role="group" aria-label="Soutěž">
      {items.map((c) => (
        <button key={c.id} type="button" data-sport={c.sport} className={`chip chip--sub${competition === c.id ? ' chip--on' : ''}`}
          aria-pressed={competition === c.id} title={c.title} onClick={() => onCompetition(c.id)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
