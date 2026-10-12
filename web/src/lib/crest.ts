/** Monogramový erb: text a barva odvozené deterministicky z id/názvu týmu. */

const NOISE = new Set(['hc', 'bk', 'fc', 'sk', 'hk', 'bc', 'tj', 'hbc', 'a', 'and', 'the', 'of', 'de']);

/** 2–3 písmena: krátká přípona id (PCE, PIT), jinak iniciály názvu (bez HC/BK…). */
export function monogramText(id: string | undefined, name: string): string {
  const suffix = id?.includes(':') ? id.slice(id.indexOf(':') + 1) : '';
  if (/^[A-Za-z0-9]{2,3}$/.test(suffix)) return suffix.toUpperCase();
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !NOISE.has(w.toLowerCase()));
  const use = meaningful.length ? meaningful : words;
  if (use.length === 0) return '?';
  if (use.length === 1) return use[0].slice(0, 3).toLocaleUpperCase('cs');
  return (use[0][0] + use[use.length - 1][0]).toLocaleUpperCase('cs');
}

/** Tlumené tóny, všechny s kontrastem ≥ 4.5 : 1 vůči bílému textu. */
export const MONOGRAM_PALETTE = [
  '#1d4e89', '#8a1c2b', '#0f6b4f', '#5b3a9e', '#8f4300',
  '#1f5f6b', '#6b2a5e', '#3d4b5c', '#9b2d1f', '#2a6631',
] as const;

/** FNV-1a 32bit – stabilní hash bez závislostí. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function monogramColor(key: string): string {
  return MONOGRAM_PALETTE[hash32(key) % MONOGRAM_PALETTE.length];
}
