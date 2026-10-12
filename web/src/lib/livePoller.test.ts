import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPoller, type PollerDeps } from './livePoller';
import type { LiveFeed } from './live';

const feed = (n: number): LiveFeed => ({ key: `u${n}`, url: `u${n}`, sport: 'nba', matchIds: [`nba:${n}`] });

function setup(over: Partial<PollerDeps> = {}) {
  const calls: string[] = [];
  const state = { visible: true, fail: false };
  const deps: PollerDeps = {
    intervalMs: 20_000,
    isVisible: () => state.visible,
    fetchJson: async (url) => { calls.push(url); if (state.fail) throw new Error('500'); return { url }; },
    onData: vi.fn(),
    onFailure: vi.fn(),
    onSuccess: vi.fn(),
    ...over,
  };
  return { deps, calls, state, poller: createPoller(deps) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createPoller', () => {
  it('první dotaz hned, další každých 20 s, jeden dotaz na feed a tick', async () => {
    const { poller, calls } = setup();
    poller.setFeeds([feed(1), feed(2)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['u1', 'u2']);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(calls).toHaveLength(8);
    poller.stop();
  });

  it('setFeeds se stejnými feedy dotazy nezdvojuje a nezrychluje', async () => {
    const { poller, calls } = setup();
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(5_000);
    poller.setFeeds([feed(1)]);
    poller.setFeeds([feed(1), feed(2)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['u1', 'u2']);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(calls).toEqual(['u1', 'u2', 'u1']);
    poller.stop();
  });

  it('bez feedů žádné dotazy; odebraný feed se přestane dotazovat', async () => {
    const { poller, calls } = setup();
    poller.setFeeds([]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(0);
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(0);
    poller.setFeeds([]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(1);
  });

  it('pomalá odpověď: nikdy dva souběžné dotazy na jeden feed', async () => {
    let inflight = 0; let max = 0;
    const { poller, deps } = setup({
      fetchJson: () => { inflight++; max = Math.max(max, inflight); return new Promise((r) => setTimeout(() => { inflight--; r({}); }, 50_000)); },
    });
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(max).toBe(1);
    expect(deps.onData).toHaveBeenCalled();
    poller.stop();
  });

  it('předá data a nahlásí úspěch', async () => {
    const { poller, deps } = setup();
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.onData).toHaveBeenCalledWith(expect.objectContaining({ key: 'u1' }), { url: 'u1' });
    expect(deps.onSuccess).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('chyba: exponenciální backoff 40/80/160 s, po 5 selháních feed „nedostupný“ a konec dotazů', async () => {
    const { poller, deps, calls, state } = setup();
    state.fail = true;
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(39_999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2); // t = 40 s
    await vi.advanceTimersByTimeAsync(80_000);
    expect(calls).toHaveLength(3); // t = 120 s
    await vi.advanceTimersByTimeAsync(160_000);
    expect(calls).toHaveLength(4); // t = 280 s
    await vi.advanceTimersByTimeAsync(300_000);
    expect(calls).toHaveLength(5);
    const fails = (deps.onFailure as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[1], c[2]]);
    expect(fails).toEqual([[1, false], [2, false], [3, false], [4, false], [5, true]]);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(calls).toHaveLength(5);
  });

  it('úspěch po chybě vrací běžný rytmus', async () => {
    const { poller, calls, state } = setup();
    state.fail = true;
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(0);
    state.fail = false;
    await vi.advanceTimersByTimeAsync(40_000);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toHaveLength(3);
    poller.stop();
  });

  it('skrytá záložka: žádné dotazy; po zviditelnění okamžitá obnova a pak rytmus', async () => {
    const { poller, calls, state } = setup();
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    state.visible = false;
    poller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(calls).toHaveLength(1);
    state.visible = true;
    poller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toHaveLength(3);
    poller.stop();
  });

  it('feed přidaný ve skryté záložce čeká na zviditelnění', async () => {
    const { poller, calls, state } = setup();
    state.visible = false;
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(calls).toHaveLength(0);
    state.visible = true;
    poller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    poller.stop();
  });

  it('nedostupný feed dostane po návratu na záložku jeden pokus, další selhání ho hned vypne', async () => {
    const { poller, deps, calls, state } = setup();
    state.fail = true;
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(2_000_000);
    expect(calls).toHaveLength(5);
    poller.visibilityChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(6);
    const last = (deps.onFailure as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(last[2]).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000_000);
    expect(calls).toHaveLength(6);
  });

  it('stop zruší rozdělané dotazy a časovače', async () => {
    let aborted = false;
    const { poller, calls } = setup({
      fetchJson: (_u, signal) => new Promise((_r, rej) => { signal.addEventListener('abort', () => { aborted = true; rej(new Error('abort')); }); }),
    });
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(10);
    poller.stop();
    await vi.advanceTimersByTimeAsync(200_000);
    expect(aborted).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('po stop() se odpověď už nezpracuje', async () => {
    let resolve: (v: unknown) => void = () => {};
    const { poller, deps } = setup({ fetchJson: () => new Promise((r) => { resolve = r; }) });
    poller.setFeeds([feed(1)]);
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();
    resolve({});
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.onData).not.toHaveBeenCalled();
  });
});
