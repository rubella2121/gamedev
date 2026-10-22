import * as THREE from 'three';

/** What a shot builder gets, and the small helpers every builder uses. */

/** A boss or the hound, built from the game's own model code and left exactly as the game has it. `api` is the model lab's handle (`update`, `pose`). */
export interface CastEntry {
  group: THREE.Group;
  api: { update?: (dt: number, t: number) => void; pose?: (name: string, v?: number) => void } | void;
}

export type CastName = 'x' | 'collector' | 'mash' | 'fox';

export interface Ctx {
  add: (o: THREE.Object3D, flags?: { noDepth?: boolean }) => THREE.Object3D;
  rand: () => number;
  p: Record<string, number | string | boolean>;
  cam: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  /** the models that were built when the page started (`init: { cast: ["x", ...] }`) */
  cast: Partial<Record<CastName, CastEntry>>;
  /** extra lights that should throw shafts in post: position, strength, colour, radius (in 0..1 of the picture width) */
  rays: { pos: [number, number, number]; k: number; color: number; r: number }[];
  /** named points in the world that the sheet will pin labels to: the page projects them onto the picture and saves where they landed */
  anchors: Record<string, THREE.Vector3>;
  /** unit vector towards the key light */
  md: THREE.Vector3;
}

export const num = (c: Ctx, k: string, d: number): number => (typeof c.p[k] === 'number' ? (c.p[k] as number) : d);
export const flag = (c: Ctx, k: string, d = true): boolean => (typeof c.p[k] === 'number' ? (c.p[k] as number) !== 0 : typeof c.p[k] === 'boolean' ? (c.p[k] as boolean) : d);

/** put an object at a point, turned about y */
export function place<T extends THREE.Object3D>(c: Ctx, o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  c.add(o);
  return o;
}
