import * as THREE from 'three';
import { fbm } from '../../src/act2/kit/noise';
import { rng } from '../../src/core/util';
import { blob, lin, merge, mixRgb, mulRgb, tube, type Rgb } from './geo';

/** The trees of the world: one generator, a spec per species, three levels of detail (0 near, 2 far). */

export type TreeKind = 'giant' | 'gnarl' | 'rootgiant' | 'snag';

interface Spec {
  H: [number, number];
  r0: [number, number];
  roots: number;
  rootLen: [number, number];
  branches: number;
  branchLen: [number, number];
  branchStart: number;
  canopy: number;
  canopyR: [number, number];
  vines: number;
  wobble: number;
  lean: number;
  bark: [Rgb, Rgb, Rgb];
  leaf: [Rgb, Rgb];
  vine: Rgb;
}

const SPECS: Record<TreeKind, Spec> = {
  giant: {
    H: [34, 56], r0: [1.1, 1.9], roots: 5, rootLen: [3, 6], branches: 7, branchLen: [6, 11], branchStart: 0.5, canopy: 8, canopyR: [3, 6.5], vines: 0, wobble: 2.6, lean: 4,
    bark: [lin(0x1c1b1d), lin(0x33302f), lin(0x1b3a30)], leaf: [lin(0x08181c), lin(0x12332f)], vine: lin(0x1a3a30),
  },
  gnarl: {
    H: [16, 30], r0: [0.9, 1.6], roots: 4, rootLen: [3, 5], branches: 11, branchLen: [5, 10], branchStart: 0.22, canopy: 0, canopyR: [2, 3], vines: 7, wobble: 6, lean: 6,
    bark: [lin(0x090b10), lin(0x1b2028), lin(0x0e3238)], leaf: [lin(0x06161a), lin(0x0d3036)], vine: lin(0x14565e),
  },
  rootgiant: {
    H: [30, 44], r0: [3, 4.6], roots: 9, rootLen: [9, 16], branches: 5, branchLen: [9, 15], branchStart: 0.55, canopy: 5, canopyR: [5, 9], vines: 4, wobble: 2, lean: 3,
    bark: [lin(0x1d140c), lin(0x3a2a18), lin(0x6a4a1e)], leaf: [lin(0x1c2410), lin(0x3a4a1a)], vine: lin(0x4a3418),
  },
  snag: {
    H: [10, 20], r0: [0.45, 0.8], roots: 3, rootLen: [2, 4], branches: 4, branchLen: [3, 6], branchStart: 0.45, canopy: 0, canopyR: [1, 2], vines: 5, wobble: 3, lean: 7,
    bark: [lin(0x1a1c22), lin(0x35363e), lin(0x3a3558)], leaf: [lin(0x1a1c22), lin(0x35363e)], vine: lin(0x5a4c82),
  },
};

const rr = (r: () => number, [a, b]: [number, number]) => a + (b - a) * r();

/** a tree as two meshes: the wood, and the leaves (drawn with holes in them) */
export interface TreeGeo {
  bark: THREE.BufferGeometry;
  leaf: THREE.BufferGeometry | null;
}

export function makeTree(kind: TreeKind, seed: number, lod: number): TreeGeo {
  const S = SPECS[kind];
  const r = rng(seed * 977 + 13);
  const H = rr(r, S.H);
  const r0 = rr(r, S.r0);
  const radial = [10, 6, 4][lod]!;
  const nseg = [16, 9, 5][lod]!;
  const parts: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const lx = (r() - 0.5) * S.lean;
  const lz = (r() - 0.5) * S.lean;
  const wob = S.wobble;
  const trunkAt = (t: number) =>
    new THREE.Vector3(lx * t * t + (fbm(t * 2.3 + seed, 0, 1, 2, 3) - 0.5) * wob * t, t * H, lz * t * t + (fbm(t * 2.3 + seed, 5, 1, 2, 4) - 0.5) * wob * t);
  const radiusAt = (t: number) => r0 * (1 + (kind === 'rootgiant' ? 0.55 : 1.0) * Math.exp(-t * 12)) * (1 - 0.74 * t);
  const bark = (b: [Rgb, Rgb, Rgb]) => (t: number, a: number, p: THREE.Vector3): Rgb => {
    const n = fbm(p.x * 0.9, p.y * 0.35, p.z * 0.9, 3, 11);
    let c = mixRgb(b[0], b[1], Math.min(1, n * 1.6));
    c = mixRgb(c, b[2], Math.max(0, 1 - t / 0.28) * (0.25 + 0.55 * fbm(p.x * 0.5, p.y * 0.2, p.z * 0.5, 2, 2)));
    return mulRgb(c, 0.75 + 0.5 * a);
  };
  const trunkPts: THREE.Vector3[] = [];
  const trunkRad: number[] = [];
  for (let i = 0; i <= nseg; i++) {
    const t = i / nseg;
    trunkPts.push(trunkAt(t));
    trunkRad.push(radiusAt(t));
  }
  parts.push(tube(trunkPts, trunkRad, radial, bark(S.bark)));

  // roots: buttresses that arch out of the trunk and dive into the ground
  const nRoots = lod === 0 ? S.roots : lod === 1 ? Math.ceil(S.roots / 2) : 0;
  for (let i = 0; i < nRoots; i++) {
    const a = (i / S.roots) * Math.PI * 2 + r() * 0.6;
    const len = rr(r, S.rootLen);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const start = new THREE.Vector3(0, r0 * 3.2 + r() * r0, 0).addScaledVector(dir, r0 * 0.5).add(trunkAt(0));
    const mid = start.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, -start.y * 0.35 + r0 * 0.4, 0));
    const end = start.clone().addScaledVector(dir, len).setY(-0.8);
    const path = new THREE.CatmullRomCurve3([start, mid, end]).getPoints(lod === 0 ? 7 : 4);
    const rad = path.map((_, k) => r0 * (kind === 'rootgiant' ? 0.5 : 0.42) * (1 - 0.85 * (k / (path.length - 1))));
    parts.push(tube(path, rad, lod === 0 ? 6 : 4, bark(S.bark)));
  }

  // branches (and the leaf clumps and vines that hang on them)
  const nBr = lod === 0 ? S.branches : lod === 1 ? Math.ceil(S.branches * 0.55) : 0;
  const tips: THREE.Vector3[] = [];
  const leafCol = (t: number, a: number, p: THREE.Vector3): Rgb => {
    const n = fbm(p.x * 0.5, p.y * 0.5, p.z * 0.5, 2, 9);
    return mulRgb(mixRgb(S.leaf[0], S.leaf[1], Math.min(1, n * 1.3 * (0.4 + t))), 0.7 + 0.6 * a);
  };
  for (let i = 0; i < nBr; i++) {
    const t = S.branchStart + (0.97 - S.branchStart) * ((i + r() * 0.6) / Math.max(1, S.branches));
    const base = trunkAt(Math.min(0.98, t));
    const a = r() * Math.PI * 2;
    const len = rr(r, S.branchLen) * (1.15 - t * 0.5);
    const up = kind === 'gnarl' ? 0.1 + r() * 0.9 : 0.15 + r() * 0.55;
    const dir = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    const mid = base.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, len * 0.08, 0));
    const end = base.clone().addScaledVector(dir, len).add(new THREE.Vector3(0, len * (kind === 'gnarl' ? -0.1 : 0.12), 0));
    const path = new THREE.CatmullRomCurve3([base, mid, end]).getPoints(lod === 0 ? 6 : 3);
    const r1 = radiusAt(t) * 0.42;
    parts.push(tube(path, path.map((_, k) => r1 * (1 - 0.92 * (k / (path.length - 1)))), lod === 0 ? 5 : 4, bark(S.bark)));
    tips.push(end);
    if (lod === 0 && S.canopy === 0 && r() < 0.8) {
      // bare trees fork at the tips
      for (let f = 0; f < 2; f++) {
        const fa = a + (f ? 0.9 : -0.9);
        const fd = new THREE.Vector3(Math.cos(fa), 0.5 + r() * 0.5, Math.sin(fa)).normalize();
        const fe = end.clone().addScaledVector(fd, len * 0.55);
        const fp = new THREE.CatmullRomCurve3([end, end.clone().addScaledVector(fd, len * 0.25).add(new THREE.Vector3(0, 0.4, 0)), fe]).getPoints(4);
        parts.push(tube(fp, fp.map((_, k) => r1 * 0.45 * (1 - 0.9 * (k / (fp.length - 1)))), 4, bark(S.bark)));
      }
    }
  }
  const nVines = lod === 0 ? S.vines : 0;
  for (let i = 0; i < nVines && tips.length; i++) {
    const t0 = tips[Math.floor(r() * tips.length)]!;
    const from = t0.clone().lerp(trunkAt(0.5 + r() * 0.3), r() * 0.5);
    const L = 3 + r() * 6;
    const sway = (r() - 0.5) * 1.2;
    const path = [0, 1, 2, 3, 4].map((k) => from.clone().add(new THREE.Vector3(sway * (k / 4) * (k / 4), -L * (k / 4), 0)));
    parts.push(tube(path, [0.08, 0.07, 0.06, 0.04, 0.01], 3, () => S.vine));
  }
  // leaf clumps: at the tips and in a crown at the top
  const nCan = lod === 0 ? S.canopy : lod === 1 ? Math.ceil(S.canopy * 0.7) : S.canopy > 0 ? 3 : 0;
  const top = trunkAt(1);
  for (let i = 0; i < nCan; i++) {
    const c = i < tips.length && lod < 2 && r() < 0.8 ? tips[i]!.clone() : top.clone().add(new THREE.Vector3((r() - 0.5) * 9, (r() - 0.35) * 8, (r() - 0.5) * 9));
    if (lod === 2) c.copy(top).add(new THREE.Vector3((r() - 0.5) * 8, -r() * 8, (r() - 0.5) * 8));
    leaves.push(blob(c, rr(r, S.canopyR) * (lod === 2 ? 1.4 : 1), lod === 0 ? 2 : 1, leafCol, seed + i * 3.1, 0.34, 0.7));
  }
  return { bark: merge(parts), leaf: leaves.length ? merge(leaves) : null };
}
