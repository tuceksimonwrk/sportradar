import { SPORT_GROUPS, type GroupId, type MatchFilter } from '@sportradar/shared';
import { CompetitionChips } from './CompetitionChips';
import { SportIcon } from './icons/SportIcon';

/** První řada čipů: sporty (Formule 1, Hokej, Basketbal, Fotbal), volitelně s „Vše“. */
export function SportChips({ group, onGroup, withAll = true }: { group: GroupId | 'all'; onGroup: (g: GroupId | 'all') => void; withAll?: boolean }) {
  const items = [...(withAll ? [{ id: 'all' as const, label: 'Vše', sport: 'all' as const }] : []),
    ...SPORT_GROUPS.map((g) => ({ id: g.id, label: g.label, sport: g.sports[0] }))];
  return (
    <div className="chips" role="group" aria-label="Sport">
      {items.map((g) => (
        <button key={g.id} type="button" data-sport={g.sport === 'all' ? undefined : g.sport} className={`chip${group === g.id ? ' chip--on' : ''}`}
          aria-pressed={group === g.id} onClick={() => onGroup(g.id)}>
          <SportIcon sport={g.sport} size={16} />
          {g.label}
        </button>
      ))}
    </div>
  );
}

/** Obě řady filtru Programu a Výsledků: sport, pod ním soutěž (jen u sportu s více soutěžemi). */
export function FilterBar({ filter, onGroup, onCompetition }: { filter: MatchFilter; onGroup: (g: GroupId | 'all') => void; onCompetition: (c: string) => void }) {
  return (
    <>
      <SportChips group={filter.group} onGroup={onGroup} />
      <CompetitionChips group={filter.group} competition={filter.competition} onCompetition={onCompetition} />
    </>
  );
}
