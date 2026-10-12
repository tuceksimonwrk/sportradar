const KEY = 'sportradar:favorites:v1';
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,99}$/; // '.' kvůli soutěžím ('league:eng.1')
const MAX = 300;

export function sanitizeFavorites(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === 'string' && ID_RE.test(x) && !out.includes(x)) out.push(x);
    if (out.length >= MAX) break;
  }
  return out;
}

export function loadFavorites(storage?: Pick<Storage, 'getItem'>): string[] {
  try {
    const raw = storage?.getItem(KEY);
    return raw ? sanitizeFavorites(JSON.parse(raw)) : [];
  } catch { return []; }
}

export function saveFavorites(storage: Pick<Storage, 'setItem'> | undefined, favs: string[]): void {
  try { storage?.setItem(KEY, JSON.stringify(favs)); } catch { /* storage nemusí být dostupné */ }
}

export function encodeShare(favs: string[]): string {
  return `#fav=${favs.join(',')}`;
}

export function decodeShare(hash: string): string[] | null {
  const m = /^#?fav=([^&]*)/.exec(hash);
  if (!m) return null;
  let value: string;
  try { value = decodeURIComponent(m[1]); } catch { return []; }
  return sanitizeFavorites(value.split(','));
}
