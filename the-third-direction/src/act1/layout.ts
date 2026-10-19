import { lerp, smooth, unlerp } from '../core/util';

/** World y of the cliff at the end of the forest. Smaller y = further north. */
export const CLIFF_Y = -3200;

/** Where each encounter lives along the trail: [south end (start), north end]. */
export const SEC = {
  gloom: [-130, -790],
  roots: [-800, -1270],
  marsh: [-1280, -1990],
  bones: [-2000, -2590],
  meadow: [-2600, -3150],
} as const;

export const WALL_YS = [-960, -1150];

export type Biome = 'forest' | 'marsh' | 'meadow';
export function biomeAt(y: number): Biome {
  if (y <= SEC.marsh[0] + 20 && y >= SEC.marsh[1] - 10) return 'marsh';
  if (y <= SEC.meadow[0] + 40) return 'meadow';
  return 'forest';
}

/** Centre of the trail at a given world y. */
export function trailCx(y: number): number {
  const s = smooth(unlerp(-120, -520, y));
  return 108 + s * (22 * Math.sin(y / 170) + 10 * Math.sin(y / 61));
}

/** Half-width of the drawn path at world y (0 inside the clearing). */
export function pathHw(y: number): number {
  const s = smooth(unlerp(-50, -135, y));
  let hw = 54 * s;
  if (biomeAt(y) === 'meadow') hw = lerp(hw, 64, smooth(unlerp(SEC.meadow[0] + 40, SEC.meadow[0] - 60, y)));
  if (y < CLIFF_Y + 220) hw = lerp(hw, 44, smooth(unlerp(CLIFF_Y + 220, CLIFF_Y + 60, y)));
  return hw;
}

/** Half-width of the walkable area at world y. */
export function moveHw(y: number): number {
  const open = 1 - smooth(unlerp(-40, -140, y));
  return lerp(pathHw(y) + 2, 96, open);
}

/** Pools of glowing flowers where Gloomlings cannot follow. */
export interface Patch {
  x: number;
  y: number;
  rx: number;
  ry: number;
}
export const PATCHES: Patch[] = [-210, -300, -395, -490, -585, -690].map((y, i) => ({
  x: trailCx(y) + (i % 2 === 0 ? -20 : 20),
  y,
  rx: 27,
  ry: 19,
}));

export function inPatch(px: number, py: number, k = 0.92): Patch | null {
  for (const p of PATCHES) {
    const dx = (px - p.x) / (p.rx * k);
    const dy = (py - p.y) / (p.ry * k);
    if (dx * dx + dy * dy < 1) return p;
  }
  return null;
}
