/** Pomocníci pro animace (čisté funkce, testovatelné). */

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** Hodnota „počítadla“ v čase t ∈ [0, 1]; na konci přesně cíl. */
export function countUpValue(target: number, t: number): number {
  if (t >= 1) return target;
  return Math.round(target * easeOutCubic(t));
}

/** Prvních `max` položek dostane pořadí pro postupný nástup, ostatní nic (undefined). */
export function staggerIndex(i: number, max = 8): number | undefined {
  return i >= 0 && i < max ? i : undefined;
}
