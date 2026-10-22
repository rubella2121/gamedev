import * as THREE from 'three';
import { rng } from '../../src/core/util';
import { CLIFF_Z, GLADE, height, HUB3, roadDist, walkSD, WX, ZN, ZONES3, zoneShape, ZS, WATER_Y, type Zone3 } from './layout';
import { makeTree, type TreeGeo, type TreeKind } from './trees';
import { std } from './shade';

/** Where the trees stand, and the instanced meshes that draw them (the near ones detailed, the far ones plain, the unseen ones not at all). */

export interface Plant {
  kind: TreeKind;
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  variant: number;
  /** extra tilt, radians */
  tilt: number;
  /** drawn without its leaves (to open the sky over a picture's subject) */
  bare?: boolean;
}

/** places that must stay clear (landmarks, arenas): x, z, radius */
export const CLEAR: [number, number, number][] = [];

function nearestZone(x: number, z: number): { zone: Zone3; d: number } {
  let best = ZONES3[0]!;
  let bd = 1e9;
  for (const zn of ZONES3) {
    const d = zoneShape(zn, x, z);
    if (d < bd) {
      bd = d;
      best = zn;
    }
  }
  return { zone: best, d: bd };
}

function pickKind(zone: Zone3, d: number, r: number): TreeKind | null {
  // far from any zone it is the plain forest; near one, that zone's trees
  const near = d < 2.0;
  if (!near) return 'giant';
  switch (zone.id) {
    case 'gloom':
      return r < 0.62 ? 'gnarl' : 'giant';
    case 'thicket':
      return r < 0.34 ? 'rootgiant' : 'giant';
    case 'marsh':
      return r < 0.7 ? 'snag' : 'giant';
    case 'bones':
      return r < 0.28 ? 'snag' : null;
    case 'meadow':
      return r < 0.45 ? 'giant' : null;
  }
}

export function plantTrees(seed = 5): Plant[] {
  const out: Plant[] = [];
  const rand = rng(seed);
  const place = (x: number, z: number, kind: TreeKind, sMul = 1) => {
    const y = height(x, z);
    out.push({ kind, x, y: y - 0.35, z, s: (0.85 + rand() * 0.55) * sMul, rot: rand() * Math.PI * 2, variant: Math.floor(rand() * 5), tilt: (rand() - 0.5) * 0.1 });
  };
  const passes: { step: number; maxSd: number }[] = [
    { step: 6.5, maxSd: 110 },
    { step: 9.5, maxSd: 40 },
  ];
  for (const ps of passes) {
    for (let z = ZN + 4; z < ZS - 2; z += ps.step) {
      for (let x = -WX + 4; x < WX - 2; x += ps.step) {
        const jx = x + (rand() - 0.5) * ps.step * 0.95;
        const jz = z + (rand() - 0.5) * ps.step * 0.95;
        if (jz < CLIFF_Z - 1) continue;
        const sd = walkSD(jx, jz);
        const rnd = rand();
        let p: number;
        if (sd > 0) p = sd < 6 ? 0.95 : sd < 20 ? 0.8 : sd < 50 ? 0.55 : sd < ps.maxSd ? 0.34 : 0;
        else p = 0.5 * Math.max(0, 1 - -sd / 11);
        if (ps.maxSd === 40 && sd <= 0) p = 0;
        if (rnd > p) continue;
        // keep the roads, the crossroads and the clearing open, and anything that asked
        if (sd <= 0) {
          if (roadDist(jx, jz) < 4) continue;
          if (Math.hypot(jx - HUB3.x, jz - HUB3.z) < 36) continue;
          if (Math.hypot((jx - GLADE.x) / 1.2, jz - GLADE.z) < 40) continue;
        }
        let blocked = false;
        for (const [cx, cz, cr] of CLEAR) if (Math.hypot(jx - cx, jz - cz) < cr) blocked = true;
        if (blocked) continue;
        const { zone, d } = nearestZone(jx, jz);
        const kind = pickKind(zone, d, rand());
        if (!kind) continue;
        const y = height(jx, jz);
        if (kind !== 'snag' && zone.id === 'marsh' && d < 1.1 && y < WATER_Y + 0.4) continue;
        place(jx, jz, kind, sd > 0 ? 1 : 0.9);
      }
    }
  }
  return out;
}

const geoCache = new Map<string, TreeGeo>();
function treeGeo(kind: TreeKind, variant: number, lod: number): TreeGeo {
  const key = `${kind}:${variant}:${lod}`;
  let g = geoCache.get(key);
  if (!g) {
    g = makeTree(kind, variant + 1 + { giant: 0, gnarl: 10, rootgiant: 20, snag: 30 }[kind], lod);
    geoCache.set(key, g);
  }
  return g;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
let treeMat: THREE.MeshStandardMaterial | null = null;
let leafMat: THREE.MeshStandardMaterial | null = null;

/**
 * The instanced meshes for the plants a camera can see: near ones at full detail, far ones plain. `reach` is how far the casters of shadows
 * are kept (a tree behind the camera can still shade the picture).
 */
export function treeMeshes(plants: Plant[], cam: THREE.PerspectiveCamera, opts: { lod0: number; lod1: number; maxDist: number; margin?: number }): THREE.Group {
  treeMat ??= std({ vertexColors: true, roughness: 0.92, vary: 0.5, bump: 2.2, streak: 1 });
  leafMat ??= std({ vertexColors: true, roughness: 0.8, vary: 0.6, cut: { scale: 1.1, lo: 0.36, hi: 0.5 }, side: THREE.DoubleSide });
  const grp = new THREE.Group();
  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const buckets = new Map<string, Plant[]>();
  const margin = opts.margin ?? 14;
  const sph = new THREE.Sphere();
  for (const p of plants) {
    const d = Math.hypot(p.x - cam.position.x, p.y - cam.position.y, p.z - cam.position.z);
    if (d > opts.maxDist) continue;
    const big = p.kind === 'rootgiant' ? 26 : 22;
    sph.center.set(p.x, p.y + big * p.s * 0.5, p.z);
    sph.radius = big * p.s * 0.75 + margin;
    if (!frustum.intersectsSphere(sph)) continue;
    const lod = d < opts.lod0 ? 0 : d < opts.lod1 ? 1 : 2;
    const key = `${p.kind}:${p.variant}:${lod}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(p);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [key, list] of buckets) {
    const [kind, variant, lod] = key.split(':') as [TreeKind, string, string];
    const geo = treeGeo(kind, Number(variant), Number(lod));
    const meshes = [new THREE.InstancedMesh(geo.bark, treeMat!, list.length)];
    if (geo.leaf) meshes.push(new THREE.InstancedMesh(geo.leaf, leafMat!, list.length));
    list.forEach((p, i) => {
      e.set(p.tilt, p.rot, p.tilt * 0.7);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      meshes[0]!.setMatrixAt(i, m4);
      if (meshes[1]) meshes[1].setMatrixAt(i, p.bare ? ZERO : m4);
    });
    for (const m of meshes) {
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = Number(lod) < 2;
      m.receiveShadow = true;
      m.frustumCulled = false;
      grp.add(m);
    }
  }
  return grp;
}
