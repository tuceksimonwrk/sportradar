import { MAX_FAILURES, backoffDelay, type LiveFeed } from './live';

export interface PollerDeps {
  intervalMs: number;
  isVisible: () => boolean;
  fetchJson: (url: string, signal: AbortSignal) => Promise<unknown>;
  onData: (feed: LiveFeed, json: unknown) => void;
  onSuccess: (feed: LiveFeed) => void;
  /** `down` = feed po MAX_FAILURES po sobě jdoucích chybách vypnut. */
  onFailure: (feed: LiveFeed, failures: number, down: boolean) => void;
}

interface Entry {
  feed: LiveFeed;
  failures: number;
  down: boolean;
  gone: boolean;
  timer?: ReturnType<typeof setTimeout>;
  ctrl?: AbortController;
}

/**
 * Dotazuje feedy: nejvýš jeden dotaz na feed najednou, rytmus `intervalMs`, backoff po chybách,
 * pauza na skryté záložce. Bez feedů neběží žádný časovač.
 */
export function createPoller(deps: PollerDeps) {
  const entries = new Map<string, Entry>();
  let stopped = false;

  const clear = (e: Entry) => { if (e.timer !== undefined) { clearTimeout(e.timer); e.timer = undefined; } };

  function schedule(e: Entry, delay: number) {
    clear(e);
    if (stopped || e.gone || e.down || !deps.isVisible()) return;
    e.timer = setTimeout(() => { e.timer = undefined; void tick(e); }, delay);
  }

  async function tick(e: Entry) {
    if (stopped || e.gone || e.down || e.ctrl || !deps.isVisible()) return;
    const ctrl = new AbortController();
    e.ctrl = ctrl;
    let json: unknown;
    let ok = true;
    try { json = await deps.fetchJson(e.feed.url, ctrl.signal); } catch { ok = false; }
    e.ctrl = undefined;
    if (stopped || e.gone) return;
    if (ok) {
      e.failures = 0;
      deps.onData(e.feed, json);
      deps.onSuccess(e.feed);
      schedule(e, deps.intervalMs);
    } else {
      e.failures++;
      e.down = e.failures >= MAX_FAILURES;
      deps.onFailure(e.feed, e.failures, e.down);
      schedule(e, backoffDelay(deps.intervalMs, e.failures));
    }
  }

  return {
    setFeeds(feeds: readonly LiveFeed[]) {
      if (stopped) return;
      const keys = new Set(feeds.map((f) => f.key));
      for (const [k, e] of entries) {
        if (keys.has(k)) continue;
        e.gone = true; clear(e); e.ctrl?.abort();
        entries.delete(k);
      }
      for (const f of feeds) {
        const e = entries.get(f.key);
        if (e) { e.feed = f; continue; }
        const n: Entry = { feed: f, failures: 0, down: false, gone: false };
        entries.set(f.key, n);
        if (deps.isVisible()) void tick(n);
      }
    },
    /** Zavolat při změně viditelnosti záložky: skrytá = pauza, viditelná = okamžitá obnova (i jeden pokus pro vypnuté feedy). */
    visibilityChanged() {
      if (stopped) return;
      for (const e of entries.values()) {
        clear(e);
        if (!deps.isVisible()) continue;
        if (e.down) { e.down = false; e.failures = MAX_FAILURES - 1; }
        void tick(e);
      }
    },
    stop() {
      stopped = true;
      for (const e of entries.values()) { e.gone = true; clear(e); e.ctrl?.abort(); }
      entries.clear();
    },
  };
}
