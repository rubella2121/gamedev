import * as THREE from 'three';
import { scatter, type ScatterSpec } from './clutter';
import type { Plant } from './plant';

/** What a shot builder gets, and the small helpers every builder uses. */

export interface Ctx {
  add: (o: THREE.Object3D, flags?: { noDepth?: boolean }) => THREE.Object3D;
  gy: (x: number, z: number) => number;
  /** this shot's copy of the forest's trees: push to add one, filter to take some away */
  plants: Plant[];
  rand: () => number;
  p: Record<string, number | string | boolean>;
  cam: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  /** extra lights that should throw shafts in post: position, strength, colour, radius (in 0..1 of the picture width) */
  rays: { pos: [number, number, number]; k: number; color: number; r: number }[];
  /** unit vector towards the moon */
  md: THREE.Vector3;
}

export const num = (c: Ctx, k: string, d: number): number => (typeof c.p[k] === 'number' ? (c.p[k] as number) : d);

/** a big tree put exactly where the picture wants it (the world's own trees are scattered by chance) */
export function heroTree(c: Ctx, kind: Plant['kind'], x: number, z: number, s = 1, variant = 0, tilt = 0): void {
  c.plants.push({ kind, x, y: c.gy(x, z) - 0.35, z, s, rot: variant * 1.7, variant, tilt });
}

/** take the world's trees out of a disc (to open a view or make room for a landmark) */
export function clearTrees(c: Ctx, x: number, z: number, r: number): void {
  for (let i = c.plants.length - 1; i >= 0; i--) {
    const p = c.plants[i]!;
    if (Math.hypot(p.x - x, p.z - z) < r) c.plants.splice(i, 1);
  }
}

/** take the world's trees out of a strip between two points (a clear view to a landmark) */
export function clearCorridor(c: Ctx, ax: number, az: number, bx: number, bz: number, half: number): void {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  for (let i = c.plants.length - 1; i >= 0; i--) {
    const p = c.plants[i]!;
    const t = Math.min(1, Math.max(0, ((p.x - ax) * vx + (p.z - az) * vz) / l2));
    if (Math.hypot(p.x - (ax + vx * t), p.z - (az + vz * t)) < half) c.plants.splice(i, 1);
  }
}

/** draw the trees in a disc without their leaves (opens the sky over a picture's subject) */
export function bareTrees(c: Ctx, x: number, z: number, r: number): void {
  for (const p of c.plants) if (Math.hypot(p.x - x, p.z - z) < r) p.bare = true;
}

/** put an object on the ground at (x, z), `up` above it */
export function put<T extends THREE.Object3D>(c: Ctx, o: T, x: number, z: number, up = 0, ry = 0): T {
  o.position.set(x, c.gy(x, z) + up, z);
  o.rotation.y = ry;
  c.add(o);
  return o;
}

/** a pool of ground cover for the ground in a disc: grass, ferns, stones, a few glowing flowers and mushrooms */
export function cover(c: Ctx, cx: number, cz: number, r: number, mix: Partial<Record<ScatterSpec['kind'], number>>, where?: (x: number, z: number) => number, seed = 3, tint?: Partial<Record<ScatterSpec['kind'], [number, number]>>): void {
  const specs: ScatterSpec[] = [];
  for (const [kind, density] of Object.entries(mix) as [ScatterSpec['kind'], number][]) {
    specs.push({ kind, density, where, size: kind === 'rock' ? [0.5, 1.6] : kind === 'reed' ? [0.9, 1.6] : kind === 'bloom' ? [0.5, 0.9] : kind === 'shroom' ? [0.6, 1.1] : [0.8, 1.35], variants: kind === 'grass' || kind === 'fern' ? 4 : 3, shadow: kind === 'rock', tint: tint?.[kind] });
  }
  c.add(scatter(cx, cz, r, c.gy, specs, seed));
}


/** a `where` function for `cover` that leaves a hole of bare ground round the camera, so the foreground is not a wall of grass */
export function holeAround(c: Ctx, r: number, then?: (x: number, z: number) => number): (x: number, z: number) => number {
  return (x, z) => Math.min(1, Math.max(0, (Math.hypot(x - c.cam.position.x, z - c.cam.position.z) - r) / (r * 0.8))) * (then ? then(x, z) : 1);
}
