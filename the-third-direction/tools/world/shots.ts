import * as THREE from 'three';
import { GLADE } from './layout';
import { makeBlob } from './blob';
import { scatter, type ScatterSpec } from './clutter';
import { glowPool, glowSprite, motes } from './fx';
import { makeFoot } from './pieces';
import type { Plant } from './plant';

/**
 * The shot builders: each adds what one picture needs (people, landmarks, light, ground cover) to a scene that already has the terrain and the forest.
 * A shot in the spec names its builder (`"build": "clearing"`) and can pass numbers (`"params"`). The camera, fog, moon and grade live in the spec.
 */

export interface Ctx {
  add: (o: THREE.Object3D, flags?: { noDepth?: boolean }) => THREE.Object3D;
  gy: (x: number, z: number) => number;
  /** this shot's copy of the forest's trees: push to add one, filter to take some away */
  plants: Plant[];
  rand: () => number;
  p: Record<string, number | string | boolean>;
  cam: THREE.PerspectiveCamera;
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
export function cover(c: Ctx, cx: number, cz: number, r: number, mix: Partial<Record<ScatterSpec['kind'], number>>, where?: (x: number, z: number) => number, seed = 3): void {
  const specs: ScatterSpec[] = [];
  for (const [kind, density] of Object.entries(mix) as [ScatterSpec['kind'], number][]) {
    specs.push({ kind, density, where, size: kind === 'rock' ? [0.5, 1.6] : [0.8, 1.35], variants: kind === 'grass' || kind === 'fern' ? 4 : 3, shadow: kind === 'rock' });
  }
  c.add(scatter(cx, cz, r, c.gy, specs, seed));
}

const GOLD = 0xffc860;

/** the Blob and its parents, in the clearing, looking at each other and at the sky */
function family(c: Ctx, o: { lightK?: number; up?: boolean } = {}): { baby: THREE.Group; mother: THREE.Group; father: THREE.Group } {
  const lk = o.lightK ?? 2.2;
  const cx = GLADE.x;
  const cz = GLADE.z;
  const baby = makeBlob({ scale: 1, look: o.up ? [0.05, 0.95] : [0, 0], worried: true, lightK: lk * 0.7, glow: 0.75, haloK: 0.22 });
  put(c, baby, cx + 0.5, cz + 2.7, 0, 0.12);
  const mother = makeBlob({ scale: 1.5, bow: true, look: [0.4, -0.5], worried: true, lightK: lk, glow: 0.7, haloK: 0.22 });
  put(c, mother, cx - 3.6, cz - 1.2, 0, -0.18);
  const father = makeBlob({ scale: 1.62, look: [-0.5, -0.5], worried: true, lightK: lk, glow: 0.7, haloK: 0.22 });
  put(c, father, cx + 3.8, cz - 0.4, 0, 0.2);
  for (const [g, r, k] of [[baby, 3.2, 0.3], [mother, 4.6, 0.22], [father, 4.8, 0.2]] as [THREE.Group, number, number][]) {
    c.add(glowPool(g.position.x, g.position.y, g.position.z, r, GOLD, k), { noDepth: true });
  }
  return { baby, mother, father };
}

export const SHOTS: Record<string, (c: Ctx) => void> = {
  /** the foot on its own, for getting its shape right */
  foottest(c) {
    c.plants.length = 0;
    const foot = makeFoot(num(c, 'red', 0.3));
    foot.position.set(0, num(c, 'y', 46), num(c, 'z', 120));
    foot.rotation.y = Math.PI + num(c, 'rot', 0.2);
    foot.rotation.x = num(c, 'tilt', 0);
    foot.scale.setScalar(num(c, 'scale', 1));
    c.add(foot);
  },

  /** "Don't look up": the family in the glade, X's foot over the moon */
  clearing(c) {
    const cx = GLADE.x;
    const cz = GLADE.z;
    family(c, { up: true });
    // framing trees, close
    heroTree(c, 'giant', cx - 10.5, cz + 7.5, 1.0, 2);
    heroTree(c, 'giant', cx + 12.5, cz + 5.5, 1.05, 4);
    heroTree(c, 'gnarl', cx - 15, cz - 9, 1.0, 1);
    heroTree(c, 'giant', cx + 17, cz - 8, 1.1, 3);
    bareTrees(c, cx, cz, num(c, 'bare', 70));
    // the foot, high above the family on the line to the moon (so its shadow falls on them and the moon peeks out past its edge)
    const d = num(c, 'footDist', 85);
    const right = new THREE.Vector3().crossVectors(c.md, new THREE.Vector3(0, 1, 0)).normalize();
    const foot = makeFoot(num(c, 'footRed', 0.35));
    foot.position.set(cx + 0.5, c.gy(cx, cz) + 1, cz + 2.7).addScaledVector(c.md, d).addScaledVector(right, num(c, 'footX', 0)).add(new THREE.Vector3(0, num(c, 'footY', 0), 0));
    foot.rotation.y = num(c, 'footRot', 0.25);
    foot.scale.setScalar(num(c, 'footScale', 0.8));
    c.add(foot);
    // a red wash from above that lights the tops of things (the sole faces down, so it does not light the foot)
    const wash = new THREE.DirectionalLight(0xff3040, num(c, 'wash', 0.9));
    wash.position.copy(foot.position);
    wash.target.position.set(cx, 0, cz);
    c.add(wash);
    c.add(wash.target);
    // the ground
    const hole = (x: number, z: number) => {
      const dd = Math.min(Math.hypot(x - (cx + 0.5), z - (cz + 2.7)), Math.hypot(x - (cx - 3.6), z - (cz - 1.2)), Math.hypot(x - (cx + 3.8), z - (cz - 0.4)));
      const dc = Math.hypot(x - c.cam.position.x, z - c.cam.position.z);
      return Math.min(1, Math.max(0, (dd - 1.1) / 3)) * Math.min(1, Math.max(0, (dc - 3) / 4));
    };
    cover(c, cx, cz + 4, 24, { grass: 2.4, fern: 0.18, bluebell: 0.22, pebble: 0.3, shroom: 0.03 }, (x, z) => hole(x, z), 5);
    cover(c, cx, cz, 48, { grass: 0.5, fern: 0.05, bluebell: 0.06, rock: 0.012 }, undefined, 6);
    c.add(motes(new THREE.Vector3(cx, 4, cz + 2), new THREE.Vector3(18, 5, 14), 160, [0xffe6a0, 0xffc860, 0xcaf6ff], 0.22, 11, 0.4), { noDepth: true });
    c.add(motes(new THREE.Vector3(cx, 2, cz + 6), new THREE.Vector3(5, 1.6, 4), 40, [0xfff0c0, 0xffd070], 0.34, 12, 0.3), { noDepth: true });
    c.add(glowSprite(cx, 1.4, cz + 2, 7, GOLD, 0.1), { noDepth: true });
  },
};
