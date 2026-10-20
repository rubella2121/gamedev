import * as THREE from 'three';
import { fbm, mix, ridge, rgb, scale, vnoise, worley, type RGB } from '../kit/noise';
import { capsule, ellipsoid, meshGen, smin, sphere, ssub, torus, type SDF, type V3 } from '../kit/sdf';

/**
 * The shapes the Mash is stitched from: the Toll Queen's bell, the Mimic Queen's bloom, the Thornback King's shell and
 * the geometry of the small repeated parts (petals, fangs, thorns, vertebrae, feathers). Everything is code.
 */

/* ---------------------------------------------------------------- */
/* palette (linear, via rgb())                                        */
/* ---------------------------------------------------------------- */

export const PAL = {
  bronzeD: rgb(0x3e220c),
  bronze: rgb(0x9a6420),
  gold: rgb(0xe0b04a),
  verd: rgb(0x2a9482),
  verdL: rgb(0x72d6b8),
  black: rgb(0x08050c),
  crackRed: rgb(0xff5a2a),
  flesh: rgb(0xe0a096),
  fleshD: rgb(0x9a5a6a),
  cream: rgb(0xf2dec0),
  bruise: rgb(0x7e5a84),
  grey: rgb(0x8e8696),
  petalPale: rgb(0xa8e8e4),
  petal: rgb(0x2a96b0),
  petalDeep: rgb(0x10305a),
  petalPink: rgb(0xc84a74),
  lipRed: rgb(0x9a1c44),
  lipDark: rgb(0x4a0820),
  throat: rgb(0x14020a),
  stem: rgb(0x2f7e62),
  stemL: rgb(0x8ad4a8),
  bone: rgb(0xeadba8),
  boneD: rgb(0x8a7446),
  shellD: rgb(0x121626),
  shellM: rgb(0x26335a),
  shellL: rgb(0x566a94),
  ember: rgb(0xe0502a),
  belly: rgb(0xb4a89a),
  bellyD: rgb(0x5a4a56),
  violet: rgb(0xa88cff),
  tar: rgb(0x07050b),
};

export const rnd = (i: number, k: number) => (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- */
/* helpers                                                            */
/* ---------------------------------------------------------------- */

/** Catmull-Rom through points, `per` samples per span. */
export function smoothPath(pts: [number, number][], per = 4): [number, number][] {
  const out: [number, number][] = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]!);
  return out;
}

/**
 * A solid of revolution about the y axis from a closed outline of (radius, y) points. The distance is exact in the
 * profile plane (so it is exact in 3D). Edges lying on the axis are not boundaries.
 */
export function revolve(poly: [number, number][]): SDF {
  const n = poly.length;
  const ax = new Float32Array(n);
  const ay = new Float32Array(n);
  const bx = new Float32Array(n);
  const by = new Float32Array(n);
  const axis = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    ax[i] = a[0];
    ay[i] = a[1];
    bx[i] = b[0];
    by[i] = b[1];
    axis[i] = a[0] < 1e-6 && b[0] < 1e-6 ? 1 : 0;
  }
  return (x, y, z) => {
    const r = Math.sqrt(x * x + z * z);
    let best = 1e9;
    let inside = false;
    for (let i = 0; i < n; i++) {
      const x0 = ax[i]!;
      const y0 = ay[i]!;
      const x1 = bx[i]!;
      const y1 = by[i]!;
      if (y0 > y !== y1 > y) {
        const xi = x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
        if (xi > r) inside = !inside;
      }
      if (axis[i]) continue;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const l2 = dx * dx + dy * dy || 1;
      let t = ((r - x0) * dx + (y - y0) * dy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = r - (x0 + dx * t);
      const ey = y - (y0 + dy * t);
      const d2 = ex * ex + ey * ey;
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best);
    return inside ? -d : d;
  };
}

/** Wrap a shape with low-cost 3D noise relief near its surface. */
export function rough(base: SDF, freq: number, amp: number, seed: number, fine = 0, fineFreq = 3.5): SDF {
  return (x, y, z) => {
    const d = base(x, y, z);
    if (d > amp + 0.6 || d < -amp - 0.9) return d;
    let v = (fbm(x * freq, y * freq, z * freq, 3, seed) - 0.5) * 2 * amp;
    if (fine) v += (worley(x * fineFreq, y * fineFreq, z * fineFreq, seed + 3) - 0.45) * fine;
    return d + v;
  };
}

/** Merge geometries that share attributes (position, normal, color) into one. */
export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    nv += g.getAttribute('position').count;
    ni += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3).fill(1);
  const idx = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const c = g.getAttribute('color');
    for (let i = 0; i < p.count; i++) {
      pos.set([p.getX(i), p.getY(i), p.getZ(i)], (vo + i) * 3);
      if (n) nor.set([n.getX(i), n.getY(i), n.getZ(i)], (vo + i) * 3);
      if (c) col.set([c.getX(i), c.getY(i), c.getZ(i)], (vo + i) * 3);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** Paint a geometry with a function of its vertices. */
export function paint(g: THREE.BufferGeometry, f: (x: number, y: number, z: number, i: number) => RGB): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set(f(p.getX(i), p.getY(i), p.getZ(i), i), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/* ---------------------------------------------------------------- */
/* the bell (Toll Queen)                                              */
/* ---------------------------------------------------------------- */

export const BELL_H = 6.25;
export const BELL_R = 5.95;

const BELL_OUT: [number, number][] = [
  [5.75, 0],
  [5.97, 0.32],
  [5.4, 0.95],
  [4.55, 1.75],
  [3.95, 2.7],
  [3.6, 3.6],
  [3.45, 4.4],
  [3.12, 5.1],
  [2.55, 5.7],
  [1.75, 6.1],
  [0.85, 6.3],
  [0, 6.38],
];
const BELL_IN: [number, number][] = [
  [0, 5.3],
  [0.85, 5.2],
  [1.65, 4.9],
  [2.2, 4.4],
  [2.55, 3.6],
  [2.85, 2.7],
  [3.35, 1.75],
  [4.1, 0.95],
  [4.7, 0.35],
  [4.95, 0],
];

/** the radius of the bell's outside at height y (for placing things on it) */
export function bellRadius(y: number): number {
  for (let i = 0; i < BELL_OUT.length - 1; i++) {
    const a = BELL_OUT[i]!;
    const b = BELL_OUT[i + 1]!;
    if (y >= a[1] && y <= b[1]) {
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return a[0] + (b[0] - a[0]) * t;
    }
  }
  return 0;
}

/** The crack runs up the front of the bell, a little left of the middle. Points are (x, y) on the surface. */
export const CRACK_XY: [number, number][] = [
  [-1.0, 0.0],
  [-0.7, 0.7],
  [-1.3, 1.5],
  [-0.9, 2.3],
  [-1.5, 3.1],
  [-1.15, 3.9],
  [-1.7, 4.6],
  [-1.35, 5.2],
];

/** 3D points of the crack on the bell's surface (z from the radius). */
export function crackPoints(inset = 0): V3[] {
  return CRACK_XY.map(([x, y]) => {
    const r = bellRadius(y) - inset;
    return [x, y, Math.sqrt(Math.max(0.1, r * r - x * x))] as V3;
  });
}

/** Patches of other creatures sewn into the bell: (angle, height, half width in radians, half height, kind). */
export const BELL_PATCHES: { th: number; y: number; w: number; h: number; kind: 'flesh' | 'bone' | 'petal' | 'shell' }[] = [
  { th: Math.PI / 2 - 0.62, y: 1.9, w: 0.3, h: 0.7, kind: 'flesh' },
  { th: Math.PI / 2 - 1.28, y: 3.7, w: 0.26, h: 0.75, kind: 'bone' },
  { th: Math.PI / 2 + 0.52, y: 3.2, w: 0.26, h: 0.62, kind: 'petal' },
  { th: Math.PI / 2 - 0.1, y: 0.95, w: 0.2, h: 0.4, kind: 'shell' },
];

function bellShape(): SDF {
  const poly = [...smoothPath(BELL_OUT, 5), ...smoothPath(BELL_IN, 5)];
  const body = revolve(poly);
  const crack = crackPoints(0.08);
  let carve: SDF | null = null;
  for (let i = 0; i < crack.length - 1; i++) {
    const c = capsule(crack[i]!, crack[i + 1]!, 0.17 - i * 0.012, 0.15 - i * 0.012);
    const prev: SDF | null = carve;
    carve = prev ? smin(0.05, prev, c) : c;
  }
  const crackSdf = carve!;
  return (x, y, z) => {
    let d = body(x, y, z) - 0.06;
    if (d > 0.9 || d < -1.2) return d;
    const r = Math.sqrt(x * x + z * z);
    // raised bands, like a bell's waist ridges
    const band = Math.exp(-(((y - 1.75) / 0.2) ** 2)) + 0.8 * Math.exp(-(((y - 2.45) / 0.14) ** 2)) + 0.6 * Math.exp(-(((y - 4.35) / 0.12) ** 2));
    // rivets on the lower band
    const th = Math.atan2(z, x);
    const rivet = Math.exp(-(((y - 1.75) / 0.3) ** 2)) * Math.pow(Math.max(0, Math.cos(th * 16)), 10) * 0.12;
    d -= band * 0.15 + rivet;
    d += (fbm(x * 1.1, y * 1.1, z * 1.1, 3, 5) - 0.5) * 0.3 + (worley(x * 3.2, y * 3.2, z * 3.2, 7) - 0.45) * 0.07;
    // dents where it was struck
    d += 0.18 * Math.exp(-(((x - 2.6) ** 2 + (y - 2.2) ** 2 + (z - 3.4) ** 2) / 0.9));
    if (z > 0 && y < 5.6) d = Math.max(d, -crackSdf(x, y, z) + 0.0);
    void r;
    return d;
  };
}

function patchAt(th: number, y: number, p: (typeof BELL_PATCHES)[number]): number {
  let dth = th - p.th;
  while (dth > Math.PI) dth -= Math.PI * 2;
  while (dth < -Math.PI) dth += Math.PI * 2;
  // < 0 inside; the unit is "fractions of the patch"
  return Math.max(Math.abs(dth) / p.w, Math.abs(y - p.y) / p.h) - 1;
}

export function bellColor(x: number, y: number, z: number, nx: number, ny: number, nz: number, ao: number): RGB {
  const rho = Math.hypot(x, z) || 1;
  const th = Math.atan2(z, x);
  const radial = (nx * x + nz * z) / rho;
  // inside the mouth: black, sooty
  if (radial < -0.25 && y < 5.5) return scale(mix(PAL.black, PAL.bronzeD, fbm(x, y, z, 2, 3) * 0.4), 0.5 + 0.5 * ao);
  const m = fbm(x * 0.8, y * 0.8, z * 0.8, 3, 12);
  let c = mix(PAL.bronzeD, PAL.bronze, 0.25 + 1.0 * m * m);
  c = mix(c, PAL.gold, clamp01((ny * 0.5 + 0.5) * 0.18 + (m - 0.55) * 0.9));
  // ridges and the lip catch the light
  const band = Math.exp(-(((y - 1.75) / 0.25) ** 2)) + Math.exp(-(((y - 2.45) / 0.18) ** 2)) + Math.exp(-(((y - 4.35) / 0.16) ** 2)) + Math.exp(-(((y - 0.35) / 0.3) ** 2));
  c = mix(c, PAL.gold, clamp01(band) * 0.5);
  // inscription: rows of dark marks
  if (y > 2.8 && y < 3.5) {
    const g = Math.sin(th * 21) * Math.sin(y * 18 + th * 3);
    if (g > 0.55) c = mix(c, PAL.bronzeD, 0.85);
  }
  // verdigris: in the creases, high on the shoulders, in streaks that run down
  const drip = vnoise(x * 2.2 + 5, y * 0.35, z * 2.2, 4);
  const v = fbm(x * 0.55 + 3, y * 0.7, z * 0.55, 3, 21) + (1 - ao) * 0.55 + (y - 3) * 0.06 + (drip - 0.5) * 0.5;
  if (v > 0.62) c = mix(c, mix(PAL.verd, PAL.verdL, clamp01((v - 0.8) * 3)), clamp01((v - 0.62) * 6));
  // soot near the base
  if (y < 0.9) c = mix(c, PAL.black, clamp01((0.9 - y) * 0.45) * (0.4 + 0.6 * fbm(x * 2, y, z * 2, 2, 8)));
  // the crack: black, then a hot red edge
  const cr = crackPoints(0);
  if (z > 0) {
    let dmin = 9;
    for (let i = 0; i < cr.length - 1; i++) {
      const a = cr[i]!;
      const b = cr[i + 1]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const l2 = dx * dx + dy * dy + dz * dz || 1;
      const t = clamp01(((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / l2);
      dmin = Math.min(dmin, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t));
    }
    if (dmin < 0.55) c = mix(c, PAL.black, clamp01((0.55 - dmin) * 3) * 0.85);
    if (dmin < 0.3) c = mix(c, PAL.crackRed, clamp01((0.3 - dmin) * 4) * 0.5);
  }
  // patches of other creatures, outlined in black
  for (const p of BELL_PATCHES) {
    const q = patchAt(th, y, p);
    if (q > 0.12) continue;
    if (q > -0.12) {
      c = PAL.black;
      continue;
    }
    const n2 = fbm(x * 1.6, y * 1.6, z * 1.6, 3, 31);
    if (p.kind === 'flesh') {
      c = mix(PAL.flesh, PAL.bruise, 0.2 + 0.7 * n2 * n2);
      const vein = ridge(x * 2.4, y * 2.4, z * 2.4, 2, 41);
      if (vein > 0.86) c = mix(c, PAL.fleshD, 0.8);
    } else if (p.kind === 'bone') {
      c = mix(PAL.boneD, PAL.bone, 0.35 + 0.65 * n2);
      if (Math.abs(((y - p.y) * 6) % 1) < 0.08) c = mix(c, PAL.boneD, 0.7);
    } else if (p.kind === 'petal') {
      c = mix(PAL.petal, PAL.petalPale, 0.2 + 0.8 * n2);
      if (ridge(x * 3, y * 3, z * 3, 2, 51) > 0.88) c = mix(c, PAL.petalDeep, 0.7);
    } else {
      c = mix(PAL.shellD, PAL.shellM, n2);
      if (worley(x * 3.5, y * 3.5, z * 3.5, 9) < 0.24) c = mix(c, PAL.shellL, 0.5);
    }
  }
  return scale(c, 0.8 + 0.28 * ny);
}

export function* buildBell(): Generator<void, THREE.BufferGeometry, void> {
  return yield* meshGen(bellShape(), [-6.6, -0.5, -6.6], [6.6, 6.8, 6.6], 0.19, { color: bellColor, aoAmount: 1.0 });
}

/* ---------------------------------------------------------------- */
/* the bloom (Mimic Queen). Local space: +z is where it faces        */
/* ---------------------------------------------------------------- */

export const LIP_R = 2.3;

function bloomShape(): SDF {
  const calyx = ellipsoid([0, 0, -1.5], [3.2, 3.2, 1.8]);
  const lip = torus([0, 0, 0.5], 2.25, 0.62, 'z');
  const rim2 = torus([0, 0, 0.1], 2.55, 0.5, 'z');
  const cup = smin(0.6, calyx, lip, rim2);
  const bowl = ellipsoid([0, 0, -0.3], [2.0, 2.0, 1.4]);
  const throat = capsule([0, 0, -0.9], [0, 0, -2.7], 1.2, 0.8);
  const cavity = smin(0.45, bowl, throat);
  const shape = ssub(0.28, cup, cavity);
  return rough(shape, 1.4, 0.12, 61, 0.05, 4);
}

export function bloomColor(x: number, y: number, z: number, nx: number, ny: number, nz: number, ao: number): RGB {
  const rho = Math.hypot(x, y);
  const radial = (nx * x + ny * y) / (rho || 1);
  const m = fbm(x * 1.0, y * 1.0, z * 1.0, 3, 17);
  // inside the maw: wet red, black in the throat
  const inner = rho < 2.15 && z > -3 && (radial < -0.2 || nz > 0.3);
  if (inner) {
    const depth = clamp01((0.3 - z) / 2.4);
    let c = mix(PAL.lipRed, PAL.throat, depth);
    const vein = ridge(x * 2, y * 2, z * 2, 3, 71);
    if (vein > 0.85) c = mix(c, PAL.crackRed, (vein - 0.85) * 5);
    if (worley(x * 3, y * 3, z * 3, 4) < 0.2) c = mix(c, PAL.flesh, 0.55);
    return scale(c, 0.55 + 0.6 * ao);
  }
  // the lips: thick, salmon and red, with a pale gum line along the teeth
  if (z > -0.7 && rho < 3.35) {
    let c = mix(PAL.lipRed, PAL.flesh, 0.25 + 0.55 * m);
    const gum = Math.exp(-(((rho - 2.05) / 0.28) ** 2));
    c = mix(c, PAL.cream, gum * 0.6);
    const vein = ridge(x * 2.2, y * 2.2, z * 2.2, 3, 73);
    if (vein > 0.87) c = mix(c, PAL.lipDark, (vein - 0.87) * 6);
    return scale(c, 0.8 + 0.3 * nz);
  }
  // the calyx behind: green flesh
  let c = mix(PAL.stem, PAL.stemL, m * m * 1.4);
  if (ridge(x * 1.6, y * 1.6, z * 1.6, 3, 75) > 0.88) c = mix(c, PAL.petalDeep, 0.6);
  return scale(c, 0.8 + 0.25 * nz);
}

export function* buildBloom(): Generator<void, THREE.BufferGeometry, void> {
  return yield* meshGen(bloomShape(), [-3.8, -3.8, -3.6], [3.8, 3.8, 1.6], 0.14, { color: bloomColor, aoAmount: 1.0 });
}

/** One petal: a blade along +y (length 1), cupped and curled towards +z, with veins painted in. */
export function petalGeometry(): THREE.BufferGeometry {
  const nu = 10;
  const nv = 7;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const w = 0.5 * Math.sin(Math.PI * Math.pow(0.12 + 0.88 * u, 0.62));
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * 2 - 1;
      const x = v * w;
      const cup = 0.34 * v * v * w * (0.4 + u);
      const curl = 0.22 * u * u;
      pos.push(x, u - 0.05 * v * v * u, cup + curl);
      // colour: pink at the root, teal through the middle, pale at the tip; dark veins
      let c = mix(PAL.petalPink, PAL.petal, clamp01(u * 2.2));
      c = mix(c, PAL.petalPale, sstep(0.55, 1, u) * 0.8);
      const av = Math.abs(v);
      const vein = av < 0.12 ? 0.55 : Math.abs(av - 0.62) < 0.1 ? 0.78 : 1;
      c = mix(c, PAL.petalDeep, (1 - vein) * 1.4 * (1 - u * 0.4));
      if (av > 0.9) c = mix(c, PAL.petalPale, 0.5);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      idx.push(a, a + 1, a + nv + 2, a, a + nv + 2, a + nv + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A fang: a cone from (0,0,0) up +y, red at the root and ivory at the point, a little curved. */
export function fangGeometry(sides = 6): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.2, 1, sides, 3, false);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) + 0.12 * y * y);
  }
  g.computeVertexNormals();
  return paint(g, (_x, y) => mix(PAL.lipRed, PAL.bone, clamp01(y * 2.2 - 0.1)));
}

/* ---------------------------------------------------------------- */
/* the shell (Thornback King). Local space: the ball's centre; +y is  */
/* the back, +z where the face is                                    */
/* ---------------------------------------------------------------- */

export const SHELL_R = 3.4;
/** where the face sits on the ball, as a direction */
export const FACE_DIR = new THREE.Vector3(0, -0.42, 0.9).normalize();

function shellShape(): SDF {
  const R = SHELL_R;
  const ball = sphere([0, 0, 0], R);
  // the snout and the heavy brow, pushed out of the front-lower part of the ball
  const snout = ellipsoid([0, -1.5, 3.3], [1.5, 1.2, 1.55]);
  const brow = capsule([-1.85, -0.45, 3.0], [1.85, -0.45, 3.0], 0.82, 0.82);
  const jaw = ellipsoid([0, -2.45, 2.75], [1.4, 0.85, 1.3]);
  const tuskL = capsule([-1.1, -2.2, 3.7], [-1.85, -0.3, 4.95], 0.46, 0.05);
  const tuskR = capsule([1.1, -2.2, 3.7], [1.85, -0.3, 4.95], 0.46, 0.05);
  let s: SDF = smin(0.5, ball, snout, brow, jaw);
  s = smin(0.1, s, tuskL, tuskR);
  // deep sockets for the eyes, nostrils, the line of the mouth
  s = ssub(0.2, s, sphere([-1.2, -0.55, 3.25], 0.6));
  s = ssub(0.2, s, sphere([1.2, -0.55, 3.25], 0.6));
  s = ssub(0.12, s, sphere([-0.5, -1.2, 4.75], 0.2));
  s = ssub(0.12, s, sphere([0.5, -1.2, 4.75], 0.2));
  s = ssub(0.12, s, capsule([-1.2, -2.15, 3.95], [1.2, -2.15, 3.95], 0.1, 0.1));
  const base = s;
  return (x, y, z) => {
    const d = base(x, y, z);
    if (d > 0.9 || d < -1.1) return d;
    const r = Math.sqrt(x * x + y * y + z * z) || 1;
    // the belly and face are soft: smooth. The back is armour: bands that overlap like roof tiles, with a spine ridge
    const armour = sstep(-0.32, 0.12, y / r);
    let v = (fbm(x * 0.9, y * 0.9, z * 0.9, 3, 81) - 0.5) * 0.35;
    if (armour > 0) {
      const phi = Math.atan2(y, -z * 0.8) + (x * 0.06);
      const k = (phi / Math.PI) * 6.5;
      const f = k - Math.floor(k);
      // a gentle slope up to a sharp step: each plate overlaps the next
      v += armour * (-0.5 * f * f + 0.22 * (1 - Math.abs(x) * 0.05));
      v -= armour * 0.28 * Math.exp(-((x / 0.45) ** 2));
      v += armour * (worley(x * 1.5, y * 1.5, z * 1.5, 83) - 0.5) * 0.18;
    }
    return d + v;
  };
}

export function shellColor(x: number, y: number, z: number, nx: number, ny: number, nz: number, ao: number): RGB {
  const r = Math.sqrt(x * x + y * y + z * z) || 1;
  const armour = sstep(-0.32, 0.12, y / r);
  const m = fbm(x * 0.8, y * 0.8, z * 0.8, 3, 91);
  if (armour > 0.5) {
    let c = mix(PAL.shellD, PAL.shellM, 0.2 + 0.9 * m * m);
    // light along the crests of the plates, dark in the seams
    const phi = Math.atan2(y, -z * 0.8) + x * 0.06;
    const f = ((phi / Math.PI) * 6.5) % 1;
    const ff = f < 0 ? f + 1 : f;
    c = mix(c, PAL.shellL, sstep(0.55, 0.95, ff) * 0.55);
    if (ff < 0.08) c = mix(c, PAL.black, 0.8);
    // cracks that glow like embers
    const cr = ridge(x * 1.2 + 2, y * 1.2, z * 1.2, 3, 93);
    if (cr > 0.9) c = mix(c, PAL.ember, clamp01((cr - 0.9) * 9) * 0.85);
    if (worley(x * 2.4, y * 2.4, z * 2.4, 95) < 0.1) c = mix(c, PAL.shellL, 0.5);
    return scale(c, 0.75 + 0.3 * ny);
  }
  // soft belly: a cold grey cream, veined, bruised
  let c = mix(PAL.belly, PAL.bellyD, 0.15 + 0.85 * m * m * 1.2);
  const vein = ridge(x * 1.7, y * 1.7, z * 1.7, 3, 97);
  if (vein > 0.87) c = mix(c, PAL.fleshD, (vein - 0.87) * 7);
  // the face: a dark grey-brown mask, bruised black round the eyes
  const fd = Math.hypot(x, y + 1.2, z - 3.4);
  if (fd < 3.0 && z > 1.6) {
    const k = clamp01((3.0 - fd) * 1.2);
    c = mix(c, mix(rgb(0x4a3a40), rgb(0x7a626a), m), k * 0.9);
    for (const ex of [-1.2, 1.2]) {
      const ed = Math.hypot(x - ex, y + 0.55, z - 3.25);
      if (ed < 1.45) c = mix(c, rgb(0x1c0e1a), (1 - ed / 1.45) * 0.95);
    }
    // the snout: paler, scarred; the nostrils and the mouth black
    if (Math.hypot(x, y + 1.35, z - 4.5) < 0.9) c = mix(c, rgb(0x9a7a80), 0.55);
    if (Math.hypot(x * 0.55, y + 2.15, z - 3.95) < 0.35 || Math.hypot(Math.abs(x) - 0.5, y + 1.2, z - 4.75) < 0.3) c = rgb(0x0a0508);
  }
  // tusks: bone
  if (z > 3.4 && Math.abs(x) > 0.8 && y < -0.1) c = mix(c, PAL.bone, 0.92);
  // the seam between the armour and the belly is stitched, so it is dark
  const seam = armour > 0.04 && armour < 0.96 ? 1 - Math.abs(armour - 0.5) * 2 : 0;
  c = mix(c, PAL.black, 0.85 * seam);
  return scale(c, 0.8 + 0.25 * ny);
}

export function* buildShell(): Generator<void, THREE.BufferGeometry, void> {
  return yield* meshGen(shellShape(), [-4.1, -4.1, -4.1], [4.1, 4.1, 5.1], 0.2, { color: shellColor, aoAmount: 1.0 });
}

/** A thorn: base radius 1 height 1 along +y, slightly bent, dark at the root and bone at the point. */
export function thornGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1, 6, 3, false);
  g.translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) + 0.22 * y * y);
  }
  g.computeVertexNormals();
  return paint(g, (_x, y) => mix(PAL.shellD, PAL.bone, sstep(0.15, 0.9, y) * 0.9));
}

/* ---------------------------------------------------------------- */
/* the bone wyrm's spine: vertebrae and the stinger                   */
/* ---------------------------------------------------------------- */

/** One vertebra along +z (the tail's direction), dorsal side +y: a ribbed barrel, flanges, a tall dorsal spine and two side spines. */
export function vertebraGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bead = new THREE.SphereGeometry(1, 12, 9);
  const bp = bead.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const y = bp.getY(i);
    const z = bp.getZ(i);
    // a barrel pinched at both ends, a rib around the middle
    const w = 1 - 0.3 * Math.pow(Math.abs(z), 2.4) + 0.12 * Math.exp(-(z * z) / 0.04);
    bp.setXYZ(i, x * 0.78 * w, y * 0.7 * w, z * 1.0);
  }
  bead.computeVertexNormals();
  parts.push(paint(bead, (x, y, z) => mix(PAL.boneD, PAL.bone, clamp01(0.5 + y * 0.45 - Math.abs(z) * 0.45 + x * 0.05))));
  // flanges: thin plates at each end, like the ribbed ends of a vertebra
  for (const zz of [-0.82, 0.82]) {
    const d = new THREE.CylinderGeometry(0.72, 0.9, 0.12, 10, 1);
    d.rotateX(Math.PI / 2);
    d.translate(0, 0, zz);
    parts.push(paint(d, (x, y) => mix(PAL.boneD, PAL.bone, clamp01(0.2 + y * 0.3 + 0 * x))));
  }
  const spine = (len: number, rad: number, ang: number, lean: number, zOff: number) => {
    const c = new THREE.ConeGeometry(rad, len, 5, 1, false);
    c.translate(0, len / 2, 0);
    const m = new THREE.Matrix4().makeRotationX(-lean).multiply(new THREE.Matrix4().makeRotationZ(ang));
    m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, zOff));
    c.applyMatrix4(m);
    c.computeVertexNormals();
    return paint(c, (x, y, z) => {
      const h = clamp01((Math.hypot(x, y, z - zOff) - 0.5) / len);
      return mix(PAL.boneD, PAL.bone, 0.35 + 0.65 * h);
    });
  };
  parts.push(spine(2.9, 0.36, 0, 0.5, 0));
  parts.push(spine(2.1, 0.28, 1.15, 0.4, 0.1));
  parts.push(spine(2.1, 0.28, -1.15, 0.4, 0.1));
  parts.push(spine(1.1, 0.2, 2.2, 0.3, 0.1));
  parts.push(spine(1.1, 0.2, -2.2, 0.3, 0.1));
  return mergeGeos(parts);
}

/** Feather blade for the Toll Queen's wings: along +y (length 1), flat, pale with a violet tip. */
export function featherGeometry(): THREE.BufferGeometry {
  const nu = 6;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const w = 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.04 + 0.96 * Math.pow(u, 0.7))), 0.7);
    for (const v of [-1, 0, 1]) {
      pos.push(v * w, u, 0.05 * v * v * w - 0.1 * u * u);
      let c = mix(rgb(0xcfc4e6), PAL.violet, sstep(0.4, 1, u) * 0.9);
      if (v === 0) c = scale(c, 0.8);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      idx.push(a, a + 1, a + 4, a, a + 4, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The stinger: a swollen venom bulb and a long hollow barb, built along +z, with the tip at z = 3.4. Curved towards -y
 * (towards the underside of the tail).
 */
export function stingerGeometry(): THREE.BufferGeometry {
  const sides = 10;
  const rings = 26;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const path = (u: number): [number, number, number] => {
    const z = u * 4.4;
    const y = -1.15 * Math.pow(Math.max(0, u - 0.3) / 0.7, 2.0);
    return [0, y, z];
  };
  const radius = (u: number) => {
    // a swollen venom bulb, a waist, then a long taper to a needle
    if (u < 0.26) return 0.36 + 0.24 * Math.sin((u / 0.26) * Math.PI * 0.5);
    if (u < 0.4) return 0.6 - 0.3 * Math.sin(((u - 0.26) / 0.14) * Math.PI * 0.5);
    const t = (u - 0.4) / 0.6;
    return Math.max(0.012, 0.3 * Math.pow(1 - t, 1.35));
  };
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const p = path(u);
    const p2 = path(Math.min(1, u + 0.02));
    const p1 = path(Math.max(0, u - 0.02));
    const tz = p2[2] - p1[2];
    const ty = p2[1] - p1[1];
    const tl = Math.hypot(tz, ty) || 1;
    // frame: tangent (0, ty, tz); normal in the plane (0, -tz, ty)... and x
    const ny = tz / tl;
    const nz = -ty / tl;
    const r = radius(u);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const cx = Math.cos(a);
      const cs = Math.sin(a);
      pos.push(cx * r, p[1] + ny * cs * r, p[2] + nz * cs * r);
      let c = mix(PAL.bone, PAL.boneD, clamp01((u - 0.3) * 1.2));
      // the underside groove is dark: this is a hollow needle
      if (u > 0.34 && cs < -0.55) c = mix(c, PAL.black, 0.85);
      if (u > 0.9) c = mix(c, rgb(0xb8ff7a), (u - 0.9) * 8);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = (i + 1) * sides + j;
      const d = (i + 1) * sides + ((j + 1) % sides);
      idx.push(a, c, b, b, c, d);
    }
  }
  // the root cap
  const base = pos.length / 3;
  const p0 = path(0);
  pos.push(p0[0], p0[1], p0[2] - 0.05);
  col.push(PAL.boneD[0], PAL.boneD[1], PAL.boneD[2]);
  for (let j = 0; j < sides; j++) idx.push(base, j, (j + 1) % sides);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export { sphere, ellipsoid, capsule, smin, ssub, torus };
