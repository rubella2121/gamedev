import type * as THREE from 'three';
import { clamp, lerp } from '../../core/util';
import { fbm, mix, ridge, rgb, scale, worley, type RGB } from '../kit/noise';
import { capsule, ellipsoid, lazy, meshGen, smin, sphere, ssub, type SDF, type V3 } from '../kit/sdf';
import { PAL } from './collector-fx';

/**
 * The Collector's body, in model space: y up, +z toward the player, origin in the middle of the pool of ink he rises from.
 * A hunched, gaunt trunk of stitched flesh with a cabinet of small drawers for a chest, ribs coming out of its sides,
 * brass bands and straps; below the waist there are no legs, only a sprawl of ink.
 */

/** The front face of the cabinet. */
export const ZF = 2.05;
export const COL_X = [-1.5, 0, 1.5];
export const ROW_Y = [4.0, 5.1, 6.2, 7.3, 8.4, 9.5];
export const PITCH_X = 1.5;
export const PITCH_Y = 1.1;
export const DRAWERS = COL_X.length * ROW_Y.length;

/** Where drawer i sits (centre of its front face). */
export function drawerPos(i: number): V3 {
  return [COL_X[i % COL_X.length]!, ROW_Y[Math.floor(i / COL_X.length)]!, ZF];
}

/** The cabinet is a little wider at the shoulders than at the waist. */
export const chestHx = (y: number) => 2.45 + 0.5 * clamp((y - 3.4) / 7, 0, 1);

const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A rounded slab, wider at the top than at the bottom. */
function cabinetSDF(): SDF {
  const r = 0.75;
  return (x, y, z) => {
    const hx = chestHx(y);
    const qx = Math.abs(x) - (hx - r);
    const qy = Math.abs(y - 6.8) - (3.5 - r);
    const qz = Math.abs(z - 0.3) - (1.75 - r);
    const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return out + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
}

/** All twenty-four drawer pockets, by repeating one over the grid. */
function pocketsSDF(): SDF {
  const hx = 0.62;
  const hy = 0.43;
  const hz = 0.7;
  const rr = 0.16;
  return (x, y, z) => {
    if (z < ZF - 1.4 || y < 3.2 || y > 10.4 || Math.abs(x) > 3.0) return 9;
    const cx = Math.max(0, Math.min(COL_X.length - 1, Math.round(x / PITCH_X + 1)));
    const cy = Math.max(0, Math.min(ROW_Y.length - 1, Math.round((y - ROW_Y[0]!) / PITCH_Y)));
    const px = x - (cx - 1) * PITCH_X;
    const py = y - (ROW_Y[0]! + cy * PITCH_Y);
    const pz = z - ZF;
    const qx = Math.abs(px) - (hx - rr);
    const qy = Math.abs(py) - (hy - rr);
    const qz = Math.abs(pz) - (hz - rr);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr;
  };
}

/** One rib: an ellipse around the chest, kept to the sides so the drawers stay clear. */
function ribSDF(y0: number, sign: number): SDF {
  const A = chestHx(y0) + 0.95;
  const B = 2.45;
  const k = Math.min(A, B);
  return (x, y, z) => {
    const d = Math.hypot((Math.hypot(x / A, (z - 0.1) / B) - 1) * k, (y - y0) * 1.0) - 0.4;
    // only the side on `sign`, only from the cabinet's corner back to the spine
    return Math.max(d, sign * -x + A * 0.74, z - 1.85);
  };
}

const RIB_Y = [4.55, 5.65, 6.75, 7.85, 8.95, 9.9];

function ribsSDF(): SDF {
  const parts: SDF[] = [];
  for (const y0 of RIB_Y) for (const s of [-1, 1]) parts.push(ribSDF(y0, s));
  // the spine, a ridge of knuckles down the back
  const spine = smin(0.3, ...[4.0, 5.4, 6.8, 8.2, 9.6, 11.0].map((y) => sphere([0.1, y, -2.6 + (y - 4) * 0.05], 0.55)));
  // collarbones: long curved bones from the neck out to the shoulders, in front of the mantle
  const clav = (sx: number): SDF => smin(0.2, capsule([sx * 0.7, 11.5, 1.25], [sx * 2.4, 11.0, 1.55], 0.4, 0.38), capsule([sx * 2.4, 11.0, 1.55], [sx * 4.1, 10.5, 0.8], 0.38, 0.42));
  return lazy(smin(0.25, ...parts, spine, clav(-1), clav(1)), [0, 8.4, 0], 6.4, 1.5);
}

/** Brass bands: round the waist, round the neck, straps down the front corners. */
function bandsSDF(): SDF {
  const band = (y0: number, a: number, b: number, zc: number, r: number): SDF => {
    const k = Math.min(a, b);
    return (x, y, z) => Math.hypot((Math.hypot(x / a, (z - zc) / b) - 1) * k, y - y0) - r;
  };
  const strap = (sx: number): SDF => capsule([sx * 2.32, 3.7, 1.72], [sx * 2.82, 10.0, 1.72], 0.2, 0.2);
  // the sockets the four arms turn in
  const socket = (p: V3): SDF => sphere(p, 0.82);
  return smin(0.1, band(3.05, 2.55, 2.0, 0.05, 0.32), band(10.45, 1.75, 1.55, 0.25, 0.3), strap(-1), strap(1), socket([-3.9, 10.5, -0.2]), socket([3.9, 10.0, -0.2]), socket([-2.9, 7.4, 1.0]), socket([2.9, 7.4, 1.0]));
}

export function torsoField(): { body: SDF; cab: SDF; pockets: SDF; ribs: SDF; bands: SDF } {
  const cab = cabinetSDF();
  const pockets = pocketsSDF();
  const ribs = ribsSDF();
  const bands = bandsSDF();
  const shoulder = (sx: number, dy: number, rx: number) => ellipsoid([sx * 3.7, 10.0 + dy, -0.3], [rx, 1.15, 1.35]);
  const trap = (sx: number, dy: number) => {
    const c = capsule([sx * 0.8, 11.1, -0.9], [sx * 4.3, 10.0 + dy, -0.7], 0.8, 1.05);
    return (x: number, y: number, z: number) => c(x, y, (z + 0.8) * 1.35 - 0.8);
  };
  const hump = ellipsoid([0.4, 9.2, -2.0], [2.2, 2.5, 1.7]);
  // a stiff leather collar that rises on both sides of the jar and frames it
  const blade = (sx: number): SDF => {
    const c = capsule([sx * 2.5, 10.4, 0], [sx * 4.3, 15.6, 0], 1.25, 0.12);
    return (x, y, z) => c(x, y, (z + 1.5) * 2.4);
  };
  const neck = capsule([0, 9.6, 0.2], [0, 11.9, 0.5], 1.4, 0.85);
  const waist = ellipsoid([0, 3.3, 0.05], [2.55, 1.7, 1.9]);
  const hips = ellipsoid([0, 1.5, 0.1], [3.4, 2.2, 2.5]);
  let body: SDF = smin(0.9, cab, shoulder(-1, 0.5, 1.8), shoulder(1, -0.2, 1.9), trap(-1, 0.5), trap(1, -0.2), hump, neck, waist, hips, blade(-1), blade(1));
  body = ssub(0.22, body, pockets);
  body = smin(0.3, body, ribs, bands);
  const base = body;
  const field: SDF = (x, y, z) => {
    const d = base(x, y, z);
    if (d > 0.7 || d < -1.0) return d;
    // flat and straight on the cabinet, lumpy everywhere else
    const cd = cab(x, y, z);
    const amp = lerp(0.2, 0.05, smoothstep(0.5, 0.0, cd));
    return d + (fbm(x * 0.95, y * 0.95, z * 0.95, 3, 71) - 0.5) * amp + (worley(x * 3.2, y * 3.2, z * 3.2, 5) - 0.45) * 0.03;
  };
  return { body: field, cab, pockets, ribs, bands };
}

/** Vertex colours of the torso. */
export function torsoPainter(f: { cab: SDF; pockets: SDF; ribs: SDF; bands: SDF }) {
  const { cab, pockets, ribs, bands } = f;
  return (x: number, y: number, z: number, nx: number, ny: number, nz: number, ao: number): RGB => {
    const m = fbm(x * 0.55, y * 0.55, z * 0.55, 3, 11);
    // sickly flesh, patched with stitched leather
    let flesh = mix(PAL.flesh, PAL.fleshPale, m * m * 1.6);
    const patch = worley(x * 0.42 + 3, y * 0.42, z * 0.42, 5);
    if (patch > 0.66) flesh = mix(flesh, PAL.leather, smoothstep(0.66, 0.78, patch) * 0.7);
    // bruises and veins
    const bruise = fbm(x * 0.9 + 9, y * 0.9, z * 0.9, 3, 33);
    if (bruise > 0.6) flesh = mix(flesh, rgb(0x3a2418), smoothstep(0.6, 0.78, bruise) * 0.6);
    const v = ridge(x * 1.2, y * 1.2, z * 1.2, 3, 21);
    if (v > 0.9) flesh = mix(flesh, PAL.vein, Math.min(1, (v - 0.9) * 10) * 0.85);
    const v2 = ridge(x * 2.4 + 4, y * 2.4, z * 2.4, 2, 37);
    if (v2 > 0.94) flesh = mix(flesh, PAL.sinew, Math.min(1, (v2 - 0.94) * 14) * 0.9);
    let c = flesh;
    // the cabinet: dark stained wood, grain running across
    const cd = cab(x, y, z);
    const cabK = 1 - smoothstep(0.03, 0.42, cd);
    if (cabK > 0) {
      const grain = fbm(x * 0.5, y * 5.5, z * 0.5, 3, 17);
      let wood = mix(PAL.leatherDark, PAL.leather, grain * grain * 1.6);
      if (grain > 0.66) wood = mix(wood, PAL.leatherDark, 0.5);
      c = mix(c, wood, cabK);
    }
    // sinew lips round every drawer, and darkness inside
    const pk = pockets(x, y, z);
    if (pk < 0.26 && z > ZF - 0.75) {
      const lip = 1 - smoothstep(0.0, 0.26, pk);
      c = mix(c, mix(PAL.sinew, rgb(0xc07a70), fbm(x * 3, y * 3, z * 3, 2, 3)), lip * 0.85);
      if (z < ZF - 0.12 && pk < 0.08) c = mix(c, rgb(0x0c0504), 0.92);
    }
    // ribs: old ivory
    const rd = ribs(x, y, z);
    if (rd < 0.12) {
      const bm = fbm(x * 2, y * 2, z * 2, 2, 5);
      const bone = mix(PAL.boneShade, PAL.bone, 0.35 + 0.65 * bm);
      c = mix(c, bone, 1 - smoothstep(0.02, 0.12, rd));
    }
    // brass, with verdigris in the creases
    const bd = bands(x, y, z);
    if (bd < 0.1) {
      const bm = fbm(x * 1.7, y * 1.7, z * 1.7, 3, 41);
      let b = mix(PAL.brassDark, PAL.brass, 0.35 + 0.8 * bm);
      b = mix(b, PAL.brassLight, smoothstep(0.55, 0.9, ny) * 0.5);
      const green = (1 - ao) * 1.4 + (bm > 0.62 ? 0.4 : 0);
      b = mix(b, PAL.verdigris, clamp(green, 0, 0.75));
      c = mix(c, b, 1 - smoothstep(0.0, 0.1, bd));
    }
    // seams: dark thread where the cabinet is sewn into the flesh
    const seam = Math.abs(Math.abs(x) - (chestHx(y) - 0.05));
    if (z > 0.2 && y > 3.6 && y < 10.4 && seam < 0.09) c = mix(c, rgb(0x120a08), 0.6 * (1 - seam / 0.09));
    // the underside of everything is darker; he is dark, and the lamp of his own jar lights the top of him
    c = scale(c, (0.52 + 0.3 * ny + 0.06 * nz) * (1 - 0.25 * (1 - ao)));
    const lamp = Math.exp(-Math.hypot(x * 0.8, y - 14.6, (z - 0.8) * 0.8) / 3.0) * (0.45 + 0.55 * Math.max(0, ny * 0.7 + nz * 0.5));
    c = [c[0] + 0.55 * lamp * (0.4 + c[0]), c[1] + 0.28 * lamp * (0.4 + c[1]), c[2] + 0.07 * lamp];
    void nx;
    return c;
  };
}

export function* buildTorso(): Generator<void, THREE.BufferGeometry, void> {
  const f = torsoField();
  return yield* meshGen(f.body, [-6.4, -0.9, -4.3], [6.4, 16.4, 3.4], 0.2, { color: torsoPainter(f), aoAmount: 0.9 });
}

/* ---------------------------------------------------------------- */
/* the pool of ink                                                   */
/* ---------------------------------------------------------------- */

function poolField(): SDF {
  const base = ellipsoid([0, -0.5, 0.2], [7.4, 2.4, 5.0]);
  const lobes: SDF[] = [];
  const spots: [number, number, number, number][] = [
    [-5.6, -0.2, 2.6, 1.9],
    [5.4, -0.3, 3.2, 1.7],
    [0.8, -0.2, 4.3, 1.9],
    [-3.2, -0.3, -3.6, 1.8],
    [3.8, -0.3, -3.1, 1.7],
    [-7.4, -0.5, -0.3, 1.5],
    [7.6, -0.5, 0.2, 1.4],
  ];
  for (const [x, y, z, r] of spots) lobes.push(sphere([x, y, z], r));
  // the coat of ink climbs up round the hips
  lobes.push(ellipsoid([0, 1.0, 0.1], [4.1, 2.0, 3.0]));
  const body = smin(1.5, base, ...lobes);
  return (x, y, z) => {
    const d = body(x, y, z);
    if (d > 0.8 || d < -1.2) return d;
    const ripple = Math.sin(x * 1.3 + z * 0.9) * Math.sin(z * 1.1 - x * 0.7) * 0.18;
    return d + ripple + (fbm(x * 0.9, y * 0.9, z * 0.9, 3, 91) - 0.5) * 0.5;
  };
}

export function* buildPool(): Generator<void, THREE.BufferGeometry, void> {
  const f = poolField();
  return yield* meshGen(f, [-9.6, -3.0, -6.4], [9.6, 3.4, 6.8], 0.26, {
    color: (x, y, z, nx, ny, nz, ao) => {
      const m = fbm(x * 0.5, y * 0.5, z * 0.5, 3, 7);
      let c = mix(PAL.ink, PAL.inkSheen, m * m * 1.2);
      // an oily sheen on the upward faces
      const sheen = Math.pow(Math.max(0, ny), 3) * fbm(x * 1.2, y * 1.2, z * 1.2, 2, 19);
      c = mix(c, rgb(0x3a6a7a), sheen * 0.6);
      const v = ridge(x * 0.9, y * 0.9, z * 0.9, 3, 13);
      if (v > 0.92) c = mix(c, rgb(0x5a2a3a), (v - 0.92) * 9);
      void nx;
      void nz;
      void ao;
      return scale(c, 0.8 + 0.3 * ny);
    },
    aoAmount: 0.6,
  });
}
