import { useCallback, useEffect, useState } from 'react';
import { detailPath, isDetailIndex, isMatchDetail, type MatchDetail } from '@sportradar/shared';

/** Id zápasů, pro které existuje detail. Chyba / chybějící index → prázdná množina (tlačítka se neukážou). */
export function useDetailIndex(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let cancelled = false;
    fetch('data/detail/index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && isDetailIndex(j)) setIds(new Set(j.ids)); })
      .catch(() => { /* bez detailů */ });
    return () => { cancelled = true; };
  }, []);
  return ids;
}

const cache = new Map<string, MatchDetail>();

export type DetailState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; detail: MatchDetail };

/** Detail jednoho zápasu (cache v paměti podle id); `retry` zkusí znovu po chybě. */
export function useMatchDetail(id: string): { state: DetailState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DetailState>(() => {
    const hit = cache.get(id);
    return hit ? { status: 'ready', detail: hit } : { status: 'loading' };
  });
  useEffect(() => {
    const hit = cache.get(id);
    if (hit) { setState({ status: 'ready', detail: hit }); return; }
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`data/${detailPath(id)}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => {
        if (!isMatchDetail(j)) throw new Error('tvar');
        cache.set(id, j);
        if (!cancelled) setState({ status: 'ready', detail: j });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [id, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
