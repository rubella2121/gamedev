import * as THREE from 'three';
import { hash2, rng } from '../../src/core/util';
import { lin, mixRgb, mulRgb, type Rgb } from './geo';
import { glowMat, std } from './shade';

/**
 * The cube world, the way the arena builds it (src/act2/arena.ts): a platform is a disc of tiles, a pillar is three stacked blocks, the old world drifts round it as broken rocks.
 * Here the same pieces are made as one mesh each (colours painted per vertex) so a whole archipelago stays cheap, and with an underside, bridges and glowing crystals.
 */

/** collects boxes (each with a lighter top, darker sides and a dark bottom) into one geometry */
export class BoxBatch {
  private pos: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, top: Rgb, side: Rgb, bottom: Rgb, ry = 0, rx = 0, rz = 0, order: THREE.EulerOrder = 'XYZ'): void {
    const e = new THREE.Euler(rx, ry, rz, order);
    const m = new THREE.Matrix4().makeRotationFromEuler(e);
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const faces: { n: [number, number, number]; c: [number, number, number][]; col: Rgb }[] = [
      { n: [0, 1, 0], c: [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]], col: top },
      { n: [0, -1, 0], c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]], col: bottom },
      { n: [0, 0, 1], c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], col: side },
      { n: [0, 0, -1], c: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], col: mulRgb(side, 0.85) },
      { n: [1, 0, 0], c: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], col: mulRgb(side, 0.92) },
      { n: [-1, 0, 0], c: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], col: mulRgb(side, 0.78) },
    ];
    const v = new THREE.Vector3();
    for (const f of faces) {
      const base = this.pos.length / 3;
      for (const c of f.c) {
        v.set(c[0], c[1], c[2]).applyMatrix4(m);
        this.pos.push(cx + v.x, cy + v.y, cz + v.z);
        this.col.push(f.col[0], f.col[1], f.col[2]);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }

  get count(): number {
    return this.pos.length / 72;
  }
}

/** tile colour: linear rgb for the tile at (x, z), `d` from the middle, `h` a hash in 0..1 */
export type TileColor = (x: number, z: number, d: number, h: number) => Rgb;

const hx = (h: number): Rgb => lin(h);
const pick = (list: number[], h: number): Rgb => hx(list[Math.floor(h * list.length) % list.length]!);

/** the arena's own violet and teal */
export const VIOLET = [0x3a2a62, 0x2e2252, 0x46346f, 0x34285a];
export const TEAL = [0x1b5a5a];

export const plain: TileColor = (_x, _z, d, h) => (h > 0.9 ? hx(0x1b5a5a) : pick(VIOLET, h / 0.9));

/**
 * The Pressed Garden's floor (see concept-art/3d-reference/arena-map-sheet.png): four wedges that remember the forest's zones (thicket NW, marsh NE, bones SE, hollow SW),
 * a green clearing in the middle, two stone rings, and a pale road from where you land (south, +z) to where the boss waits (north, -z).
 */
export const gardenTile: TileColor = (x, z, d, h) => {
  const ang = Math.atan2(-z, x); // north is up
  let base: Rgb;
  const wedge = ang > 0 ? (x < 0 ? 'thicket' : 'marsh') : x < 0 ? 'hollow' : 'bones';
  switch (wedge) {
    case 'thicket': base = pick([0x2e5a2e, 0x2a4a2a, 0x3a6a34, 0x24442c], h); break;
    case 'marsh': base = pick([0x1b5a5a, 0x14444f, 0x2a7a7a, 0x103846], h); break;
    case 'bones': base = pick([0x5a5a64, 0x4a4a56, 0x6a6a74, 0x3a3a46], h); break;
    default: base = pick([0x2a2a6a, 0x2e2252, 0x3a3a8a, 0x241c5a], h);
  }
  // the wedges fade into the old violet floor near the edge and the middle
  const fade = Math.min(1, Math.max(0, (d - 3.5) / 3));
  base = mixRgb(pick(VIOLET, h), base, fade * 0.9);
  if (d < 5.2) base = pick([0x2e7d4f, 0x2a7a6c, 0x1f6a46, 0x2e8a5a], h);
  if ([9.5, 14.5].some((r) => Math.abs(d - r) < 0.55)) base = hx(0x5a4a8a);
  // the pilgrim road
  if (Math.abs(x) < 1.1 && z > -9) base = pick([0x8a80b0, 0x9a90c0, 0x7a70a0], h);
  return base;
};

/** the Collector's floor: dark walnut boards, brass inlay on the rings */
export const archiveTile: TileColor = (x, z, d, h) => {
  let base = pick([0x3a2418, 0x32201a, 0x42281c, 0x2c1a14], h);
  if ([6, 12, 16].some((r) => Math.abs(d - r) < 0.5)) base = hx(0xb08a3a);
  if (Math.abs(x) < 0.5 && z > -4) base = pick([0x6a4a28, 0x7a5430], h);
  if ((Math.floor(x) + Math.floor(z)) % 2 === 0) base = mulRgb(base, 1.12);
  return base;
};

/** the Mash's floor: cold teal and violet, with cyan stitches crossing it */
export const remixTile: TileColor = (x, z, d, h) => {
  let base = pick([0x1b3a5a, 0x1b5a5a, 0x2a2a6a, 0x34285a, 0x14444f], h);
  // stitches: short bright bars across the seams between tiles
  const sx = Math.round(x * 0.5);
  const sz = Math.round(z * 0.5);
  if (hash2(sx * 7 + 3, sz * 5 + 1) > 0.82 && Math.abs(x - Math.round(x)) < 0.1) base = hx(0x4ad0e0);
  if ([9, 14.5].some((r) => Math.abs(d - r) < 0.5)) base = hx(0x4a3a8a);
  return base;
};

/** the summit's floor: pale warm stone, the colour of the pilgrim road */
export const summitTile: TileColor = (x, z, d, h) => {
  let base = pick([0x8a80b0, 0x7a70a0, 0x9a90c0, 0x6a6090], h);
  if (d > 5.2 && d < 5.8) base = hx(0xffd878);
  return base;
};

export interface IslandOpts {
  R: number;
  seed?: number;
  color?: TileColor;
  /** rise of the outer terrace (from `terraceR`), and the low wall on its rim */
  terraceR?: number;
  terrace?: number;
  /** leave a gap in the rim (to join a bridge): angle in radians (0 = east, counter-clockwise looking down) and its width in tiles */
  gaps?: { a: number; w: number }[];
}

/** a platform of tiles, top at y = 0 */
export function islandTiles(o: IslandOpts): THREE.BufferGeometry {
  const R = o.R;
  const rnd = rng((o.seed ?? 5) * 17 + 3);
  const b = new BoxBatch();
  const gaps = o.gaps ?? [];
  const tR = o.terraceR ?? 1e9;
  for (let x = -Math.ceil(R) - 1; x <= Math.ceil(R) + 1; x++) {
    for (let z = -Math.ceil(R) - 1; z <= Math.ceil(R) + 1; z++) {
      const d = Math.hypot(x, z);
      if (d > R + 0.3) continue;
      const rim = d > R - 1.3;
      let skip = rim && rnd() < 0.25;
      const a = Math.atan2(-z, x);
      for (const g of gaps) {
        let da = Math.abs(a - g.a) % (Math.PI * 2);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da * d < g.w / 2 + 0.3 && rim) skip = false;
      }
      if (skip) continue;
      const h = hash2(x * 3 + 1, z * 7 + 2);
      let c = (o.color ?? plain)(x, z, d, h);
      if (rim) c = mulRgb(c, 0.72);
      const up = d > tR ? (o.terrace ?? 0.35) : 0;
      b.box(x, -0.35 + up / 2, z, 0.96, 0.7 + up, 0.96, mulRgb(c, 1.0), mulRgb(c, 0.62), mulRgb(c, 0.4));
    }
  }
  return b.geometry();
}

/** the rock under an island: stacked rings of blocks narrowing to a point, a few of them cyan, with crystals hanging out of it */
export function underside(R: number, depth: number, seed = 1): { rocks: THREE.BufferGeometry; crystals: THREE.BufferGeometry } {
  const rnd = rng(seed * 31 + 7);
  const b = new BoxBatch();
  const cb = new BoxBatch();
  const K = Math.max(4, Math.round(depth / 1.9));
  for (let k = 1; k <= K; k++) {
    const u = k / K;
    const rk = Math.max(0.6, R * Math.pow(1 - u, 0.85) * (0.9 + rnd() * 0.15));
    const y = -0.7 - k * 1.9 + 0.9;
    const n = Math.max(1, Math.round((Math.PI * 2 * rk) / 2.2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const s = 2.0 + rnd() * 1.4;
      const cc = rnd() < 0.12 ? lin(0x1b5a5a) : pick([0x2a2048, 0x34285a, 0x241a40, 0x1e1638], rnd());
      b.box(Math.cos(a) * rk, y + (rnd() - 0.5) * 0.4, Math.sin(a) * rk, s, 2.0 + rnd() * 0.5, s, mulRgb(cc, 1.1), mulRgb(cc, 0.7), mulRgb(cc, 0.45), rnd() * 1.5, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2);
    }
    // fill the middle so the rock is solid from the side
    if (rk > 2.2) b.box(0, y, 0, rk * 1.5, 2.2, rk * 1.5, lin(0x241a40), lin(0x1a1230), lin(0x120a22), rnd());
  }
  // crystals growing out of the rock, pointing down and out
  const nc = Math.round(R * 0.9);
  for (let i = 0; i < nc; i++) {
    const a = rnd() * Math.PI * 2;
    const u = 0.15 + rnd() * 0.6;
    const rk = R * Math.pow(1 - u, 0.85) * 0.95;
    const y = -0.7 - u * K * 1.9;
    const L = 1.6 + rnd() * 3.4;
    const cc = rnd() < 0.8 ? lin(0x7fe8ff) : lin(0xb88aff);
    cb.box(Math.cos(a) * rk * 1.05, y - L / 2, Math.sin(a) * rk * 1.05, 0.55 + rnd() * 0.4, L, 0.55 + rnd() * 0.4, cc, mulRgb(cc, 0.75), mulRgb(cc, 0.5), rnd() * 3, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5);
  }
  return { rocks: b.geometry(), crystals: cb.geometry() };
}

/** an island, complete: its tiles, its rock, its crystals (glowing) */
export function makeIsland(o: IslandOpts & { depth?: number }): THREE.Group {
  const g = new THREE.Group();
  const tiles = new THREE.Mesh(islandTiles(o), std({ vertexColors: true, roughness: 0.9, vary: 0.18, bump: 0.5, scale: [0.5, 0.5], rim: { color: 0x9a86e8, k: 0.35 } }));
  tiles.receiveShadow = true;
  tiles.castShadow = true;
  g.add(tiles);
  const u = underside(o.R, o.depth ?? Math.min(26, o.R * 1.3), o.seed ?? 1);
  const rocks = new THREE.Mesh(u.rocks, std({ vertexColors: true, roughness: 0.95, vary: 0.2, bump: 0.5, scale: [0.4, 0.4], rim: { color: 0x7a6ad0, k: 0.5 } }));
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  g.add(rocks);
  const cr = new THREE.Mesh(u.crystals, std({ vertexColors: true, roughness: 0.3, emissive: 0x2a8a9a, emissiveIntensity: 1.1, rim: { color: 0xb0f4ff, k: 0.6 } }));
  g.add(cr);
  return g;
}

/** three stacked blocks, like the arena's pillars */
export function makePillar(seed = 1, h = 3): THREE.Group {
  const g = new THREE.Group();
  const mat = std({ vertexColors: true, roughness: 0.9, vary: 0.2, rim: { color: 0xa890f0, k: 0.45 } });
  const b = new BoxBatch();
  for (let k = 0; k < h; k++) {
    const c = k === h - 1 ? lin(0x6a5a98) : lin(0x4a3d6a);
    b.box((k % 2) * 0.08, 0.52 + k * 1.05, 0, 1.5 - k * 0.12, 1.05, 1.5 - k * 0.12, mulRgb(c, 1.1), mulRgb(c, 0.7), mulRgb(c, 0.45));
  }
  void seed;
  const m = new THREE.Mesh(b.geometry(), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

export interface BridgeOpts {
  width?: number;
  color?: TileColor;
  /** posts with a small light on them, every this many units (0 = none) */
  posts?: number;
  seed?: number;
}

/** a bridge of tiles from a to b (a stair if it climbs): 1-unit steps along the way */
export function makeBridge(a: THREE.Vector3, b: THREE.Vector3, o: BridgeOpts = {}): THREE.Group {
  const g = new THREE.Group();
  const w = o.width ?? 3;
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  const L = dir.length();
  dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const yaw = Math.atan2(dir.x, dir.z);
  const batch = new BoxBatch();
  const n = Math.max(1, Math.round(L));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    // stairs: the height steps in whole units so a climb reads as a stair of cubes
    const y = Math.abs(b.y - a.y) > 2 ? Math.round(p.y) : p.y;
    for (let k = 0; k < w; k++) {
      const off = (k - (w - 1) / 2) * 0.98;
      const h = hash2(i * 3 + k, (o.seed ?? 1) * 11);
      const c = (o.color ?? ((_x, _z, _d, hh) => (hh > 0.5 ? hx(0x8a80b0) : hx(0x7a70a0))))(p.x, p.z, 0, h);
      const edge = k === 0 || k === w - 1;
      batch.box(p.x + side.x * off, y - 0.35, p.z + side.z * off, 0.98, 0.7, 1.02, mulRgb(c, edge ? 0.78 : 1), mulRgb(c, 0.6), mulRgb(c, 0.4), yaw);
    }
  }
  const m = new THREE.Mesh(batch.geometry(), std({ vertexColors: true, roughness: 0.9, vary: 0.15, rim: { color: 0xa890f0, k: 0.4 } }));
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  if (o.posts) {
    for (let d = 0; d <= L; d += o.posts) {
      const p = a.clone().lerp(b, d / L);
      for (const s of [-1, 1]) {
        const x = p.x + side.x * s * (w / 2 + 0.3);
        const z = p.z + side.z * s * (w / 2 + 0.3);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.2, 0.28), std({ color: 0x3a2e5a, roughness: 0.8 }));
        post.position.set(x, p.y + 0.6, z);
        g.add(post);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), glowMat({ color: 0x4ab8d0, opacity: 0.9 }));
        cap.position.set(x, p.y + 1.35, z);
        g.add(cap);
      }
    }
  }
  return g;
}

/** broken rocks of the old world drifting in the void, like the arena's `buildRocks` */
export function driftRocks(center: THREE.Vector3, spread: THREE.Vector3, n: number, seed = 41, avoid?: { c: THREE.Vector3; r: number }[]): THREE.InstancedMesh {
  const r = rng(seed);
  const rocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std({ roughness: 0.95, vary: 0.2, rim: { color: 0x8a78e0, k: 0.5 } }), n);
  rocks.frustumCulled = false;
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  let i = 0;
  let guard = 0;
  while (i < n && guard++ < n * 8) {
    const p = new THREE.Vector3(center.x + (r() - 0.5) * 2 * spread.x, center.y + (r() - 0.5) * 2 * spread.y, center.z + (r() - 0.5) * 2 * spread.z);
    if (avoid?.some((a) => p.distanceTo(a.c) < a.r)) continue;
    const s = 0.8 + r() * r() * 5;
    o.position.copy(p);
    o.rotation.set(r() * 3, r() * 3, r() * 3);
    o.scale.set(s, s * (0.5 + r() * 0.8), s);
    o.updateMatrix();
    rocks.setMatrixAt(i, o.matrix);
    rocks.setColorAt(i, c.setHex([0x2a2048, 0x34285a, 0x1b3a4a, 0x46346f][Math.floor(r() * 4)]!));
    i++;
  }
  rocks.count = i;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  return rocks;
}
