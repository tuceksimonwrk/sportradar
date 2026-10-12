/** Identifikace vůči zdrojům (bez cizích hlaviček, bez cookies). */
export const USER_AGENT = 'sportradar-live/1.0 (+https://github.com/tuceksimonwrk/sportradar; osobni zive skore)';
export const UPSTREAM_TIMEOUT_MS = 8_000;

export class UpstreamError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface UpstreamOptions {
  maxBytes: number;
  accept?: string;
  referer?: string;
  /** Statusy, které nejsou chybou (např. 404 = den bez zápasů); tělo se pak nečte. */
  okStatuses?: number[];
}

/** Načte tělo (nejvýš `max` bajtů) jako text; delší tělo = chyba. */
async function readLimited(res: Response, max: number): Promise<string> {
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > max) throw new UpstreamError('too large');
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => {}); throw new UpstreamError('too large'); }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(buf);
}

/**
 * GET na pevnou URL s časovým limitem a limitem velikosti. Vrací { status, text };
 * status mimo 2xx (a mimo `okStatuses`) = UpstreamError.
 */
export async function fetchUpstream(
  f: typeof fetch, url: string, opts: UpstreamOptions, timeoutMs = UPSTREAM_TIMEOUT_MS,
): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ctrl.abort(); reject(new UpstreamError('timeout')); }, timeoutMs);
  });
  try {
    const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: opts.accept ?? 'application/json' };
    if (opts.referer) headers.referer = opts.referer;
    const work = (async () => {
      const res = await f(url, { method: 'GET', headers, redirect: 'manual', signal: ctrl.signal });
      if (opts.okStatuses?.includes(res.status)) { await res.body?.cancel().catch(() => {}); return { status: res.status, text: '' }; }
      if (res.status < 200 || res.status >= 300) { await res.body?.cancel().catch(() => {}); throw new UpstreamError(`HTTP ${res.status}`, res.status); }
      return { status: res.status, text: await readLimited(res, opts.maxBytes) };
    })();
    work.catch(() => {}); // po timeoutu už výsledek nikoho nezajímá
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** JSON z textu; nevalidní = UpstreamError. */
export function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new UpstreamError('invalid json'); }
}
