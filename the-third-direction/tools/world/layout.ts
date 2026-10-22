import { fbm, ridge } from '../../src/act2/kit/noise';
import { CLIFF_Y, HUB, PLATEAU, START, ZONES, type Blob, type ZoneId } from '../../src/forest/land';
import { clamp, unlerp } from '../../src/core/util';

/**
 * The 3D world's plan. It is the 2D forest (src/forest/land.ts) stood up: the same start glade in the south, crossroads, five zones around it,
 * sealed road north to the Edge, with the 2D pixels turned into units (1 unit = the Blob is 1.8). x is east, z is south, y is up.
 * Everything here is a pure function of position, so a shot looks the same every run.
 */

/** 2D pixels -> 3D units */
export const K = 0.3;
export const X3 = (x2: number) => (x2 - 640) * K;
export const Z3 = (y2: number) => (y2 - 1000) * K;
export const X2 = (x: number) => x / K + 640;
export const Y2 = (z: number) => z / K + 1000;

export const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const sstep = (a: number, b: number, v: number) => smooth(unlerp(a, b, v));
export const mixn = (a: number, b: number, t: number) => a + (b - a) * t;

/** world extent in 3D units (x from -WX to WX, z from ZN (north, the cliff) to ZS) */
export const WX = 200;
export const ZN = -232;
export const ZS = 300;
export const CLIFF_Z = Z3(CLIFF_Y) + 2;

export type Biome = 'glade' | 'gloom' | 'thicket' | 'marsh' | 'bones' | 'meadow' | 'hub' | 'edge';

export interface Zone3 {
  id: ZoneId;
  biome: Biome;
  /** centre and radii in units */
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** where the road reaches it, and where its heart (the guardian's clearing) is */
  entry: { x: number; z: number };
  heart: { x: number; z: number };
  /** the colour of its light */
  hue: number;
  name: string;
  guardian: string;
}

const ZH: Record<ZoneId, { heart: [number, number]; hue: number; name: string; guardian: string }> = {
  gloom: { heart: [-158, 66], hue: 0x6ff0ff, name: 'Gloom Hollow', guardian: 'Gloommother' },
  thicket: { heart: [-150, -46], hue: 0xffa04a, name: 'Rootmaw Thicket', guardian: 'Thornback King' },
  marsh: { heart: [150, -46], hue: 0xd9b8ff, name: 'Echo Marsh', guardian: 'Toll Queen' },
  bones: { heart: [160, 68], hue: 0xf4efe0, name: 'Bone Wastes', guardian: 'Bone Wyrm' },
  meadow: { heart: [150, 196], hue: 0xff8aa8, name: 'Moth Meadow', guardian: 'Mimic Queen' },
};

export const ZONES3: Zone3[] = ZONES.map((z) => ({
  id: z.id,
  biome: z.id as Biome,
  x: X3(z.x),
  z: Z3(z.y),
  rx: z.rx * K,
  rz: z.ry * K,
  entry: { x: X3(z.entry.x), z: Z3(z.entry.y) },
  heart: { x: ZH[z.id].heart[0], z: ZH[z.id].heart[1] },
  hue: ZH[z.id].hue,
  name: ZH[z.id].name,
  guardian: ZH[z.id].guardian,
}));
export const zone3 = (id: ZoneId) => ZONES3.find((z) => z.id === id)!;

export const GLADE = { x: X3(START.x), z: Z3(START.y), rx: START.rx * K, rz: START.ry * K };
export const HUB3 = { x: X3(HUB.x), z: Z3(HUB.y), rx: HUB.rx * K, rz: HUB.ry * K };
export const PLATEAU3 = { x: X3(PLATEAU.x), z: Z3(PLATEAU.y), rx: PLATEAU.rx * K, rz: PLATEAU.ry * K };
/** the junction north of the crossroads where the thicket and marsh roads meet the long road, and the seal that closes it */
export const SEAL = { x: 0, z: Z3(700) };

/* ---------------------------------------------------------------------------------------------- */
/* roads and walls (the walkable network)                                                         */
/* ---------------------------------------------------------------------------------------------- */

// mirrors ROADS and CARVES in src/forest/land.ts (they are not exported there), in 2D pixels
const ROADS2: { pts: [number, number][]; hw: number }[] = [
  { pts: [[640, 1710], [640, 1380]], hw: 27 },
  { pts: [[560, 1292], [470, 1262], [420, 1245]], hw: 25 },
  { pts: [[720, 1292], [820, 1262], [868, 1248]], hw: 25 },
  { pts: [[590, 1230], [520, 1130], [450, 1010], [394, 950]], hw: 25 },
  { pts: [[690, 1230], [760, 1130], [830, 1010], [886, 950]], hw: 25 },
  { pts: [[640, 1220], [640, 1000], [640, 740], [640, 560]], hw: 29 },
  { pts: [[420, 810], [540, 772], [640, 760]], hw: 23 },
  { pts: [[860, 810], [740, 772], [640, 760]], hw: 23 },
  { pts: [[800, 1722], [846, 1700], [862, 1672]], hw: 25 },
  { pts: [[1040, 1380], [1036, 1440], [1034, 1500]], hw: 23 },
  // the long climb from the seal to the plateau
  { pts: [[640, 560], [640, 440]], hw: 33 },
];
export const ROADS3 = ROADS2.map((r) => ({ pts: r.pts.map(([x, y]) => [X3(x), Z3(y)] as [number, number]), hw: r.hw * K }));

const CARVES2: Blob[] = [
  { x: 190, y: 1125, rx: 24, ry: 80 }, { x: 190, y: 1340, rx: 24, ry: 85 }, { x: 330, y: 1300, rx: 24, ry: 18 }, { x: 150, y: 1330, rx: 22, ry: 18 },
  { x: 250, y: 755, rx: 26, ry: 68 }, { x: 250, y: 965, rx: 26, ry: 75 }, { x: 130, y: 765, rx: 22, ry: 55 }, { x: 130, y: 955, rx: 22, ry: 65 },
  { x: 300, y: 905, rx: 22, ry: 16 }, { x: 185, y: 800, rx: 18, ry: 14 },
  { x: 1030, y: 755, rx: 26, ry: 62 }, { x: 1030, y: 960, rx: 26, ry: 78 }, { x: 1110, y: 925, rx: 20, ry: 14 }, { x: 930, y: 960, rx: 18, ry: 12 },
  { x: 1130, y: 1110, rx: 24, ry: 60 }, { x: 1130, y: 1340, rx: 24, ry: 75 }, { x: 1000, y: 1170, rx: 24, ry: 18 },
  { x: 960, y: 1600, rx: 22, ry: 16 },
];
export const CARVES3 = CARVES2.map((c) => ({ x: X3(c.x), z: Z3(c.y), rx: c.rx * K, rz: c.ry * K }));

function wobble(b: { x: number; z: number; rx: number; rz: number }, x: number, z: number, seed: number): number {
  const dx = (x - b.x) / b.rx;
  const dz = (z - b.z) / b.rz;
  const th = Math.atan2(dz, dx);
  const lim = 1 + 0.1 * Math.sin(3 * th + seed) + 0.06 * Math.sin(5 * th + seed * 2.3);
  return Math.hypot(dx, dz) / lim;
}
/** the wobbly shape of a zone: < 1 inside */
export const zoneShape = (z: Zone3, x: number, zz: number) => wobble(z, x, zz, 1);

function distSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz || 1;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** distance to the nearest road centre line, minus its half width (negative on the road) */
export function roadDist(x: number, z: number): number {
  let best = 1e9;
  for (const rd of ROADS3) {
    for (let i = 0; i + 1 < rd.pts.length; i++) {
      const a = rd.pts[i]!;
      const b = rd.pts[i + 1]!;
      const wob = 1 + 0.1 * Math.sin(z / 7 + a[0]) + 0.07 * Math.sin(x / 9 + b[1]);
      best = Math.min(best, distSeg(x, z, a[0], a[1], b[0], b[1]) - rd.hw * wob);
    }
  }
  return best;
}

const CELL = 1.5;
const GX = Math.ceil((2 * WX) / CELL);
const GZ = Math.ceil((ZS - ZN) / CELL);

/** signed distance to the walkable network (negative inside) on a grid, built once */
let SD: Float32Array | null = null;
function buildSD() {
  const inside = new Uint8Array(GX * GZ);
  const blobs: { b: { x: number; z: number; rx: number; rz: number }; seed: number }[] = [
    { b: GLADE, seed: 1.3 },
    { b: HUB3, seed: 2.1 },
    { b: PLATEAU3, seed: 0.7 },
    ...ZONES3.map((z, i) => ({ b: z, seed: 3 + i * 1.7 })),
  ];
  for (let j = 0; j < GZ; j++) {
    for (let i = 0; i < GX; i++) {
      const x = -WX + (i + 0.5) * CELL;
      const z = ZN + (j + 0.5) * CELL;
      let ins = false;
      for (const { b, seed } of blobs) if (wobble(b, x, z, seed) <= 1) ins = true;
      if (!ins && roadDist(x, z) <= 0) ins = true;
      if (ins) for (const c of CARVES3) if (Math.hypot((x - c.x) / c.rx, (z - c.z) / c.rz) <= 1) ins = false;
      inside[j * GX + i] = ins ? 1 : 0;
    }
  }
  // chamfer distance to the other kind of cell, in units
  const d = new Float32Array(GX * GZ).fill(1e4);
  for (let j = 0; j < GZ; j++) {
    for (let i = 0; i < GX; i++) {
      const k = j * GX + i;
      const v = inside[k]!;
      const edge = i === 0 || j === 0 || i === GX - 1 || j === GZ - 1 || inside[k - 1] !== v || inside[k + 1] !== v || inside[k - GX] !== v || inside[k + GX] !== v;
      if (edge) d[k] = 0.5 * CELL;
    }
  }
  const pass = (i: number, j: number, k: number, di: number, dj: number, c: number) => {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= GX || nj >= GZ) return;
    const v = d[nj * GX + ni]! + c;
    if (v < d[k]!) d[k] = v;
  };
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
    const k = j * GX + i;
    pass(i, j, k, -1, 0, CELL);
    pass(i, j, k, 0, -1, CELL);
    pass(i, j, k, -1, -1, CELL * 1.414);
    pass(i, j, k, 1, -1, CELL * 1.414);
  }
  for (let j = GZ - 1; j >= 0; j--) for (let i = GX - 1; i >= 0; i--) {
    const k = j * GX + i;
    pass(i, j, k, 1, 0, CELL);
    pass(i, j, k, 0, 1, CELL);
    pass(i, j, k, 1, 1, CELL * 1.414);
    pass(i, j, k, -1, 1, CELL * 1.414);
  }
  SD = new Float32Array(GX * GZ);
  for (let k = 0; k < SD.length; k++) SD[k] = inside[k] ? -d[k]! : d[k]!;
}

/** signed distance to the walkable network: < 0 where the Blob can walk, > 0 in the wall of forest around it */
export function walkSD(x: number, z: number): number {
  if (!SD) buildSD();
  const fx = (x + WX) / CELL - 0.5;
  const fz = (z - ZN) / CELL - 0.5;
  const i = clamp(Math.floor(fx), 0, GX - 2);
  const j = clamp(Math.floor(fz), 0, GZ - 2);
  const tx = clamp(fx - i, 0, 1);
  const tz = clamp(fz - j, 0, 1);
  const a = SD![j * GX + i]!;
  const b = SD![j * GX + i + 1]!;
  const c = SD![(j + 1) * GX + i]!;
  const e = SD![(j + 1) * GX + i + 1]!;
  return mixn(mixn(a, b, tx), mixn(c, e, tx), tz);
}

/* ---------------------------------------------------------------------------------------------- */
/* the ground                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

/** the long climb: level in the south, a gentle rise to the seal, then the steep road up to the plateau */
export const climb = (z: number) => 3.5 * sstep(60, -70, z) + 34 * sstep(-80, -170, z);

/** how far inside a zone (0 outside, 1 well inside) */
export const inZone = (id: ZoneId, x: number, z: number) => 1 - sstep(0.7, 1.15, zoneShape(zone3(id), x, z));

/** 1 = the crater where X's foot came down; 0 = the glade as it was before (the opening shot) */
export const CRATER = { k: 1 };

export const MARSH_LEVEL = 1.2;
export const WATER_Y = 0.55;

export function height(x: number, z: number): number {
  const sd = walkSD(x, z);
  const macro = (fbm(x * 0.012, 0, z * 0.012, 4, 3) - 0.5) * 7;
  const detail = (fbm(x * 0.09, 0, z * 0.09, 3, 9) - 0.5) * 1.6;
  let h = climb(z) + macro * 0.5 + detail * 0.5;

  // the wall of forest around the walkable ground: steep ridges that the trees stand on
  const outside = sstep(0, 16, sd);
  const wallNoise = 0.5 + fbm(x * 0.035, 0, z * 0.035, 3, 21);
  h += outside * (6 + 11 * wallNoise) + sstep(14, 70, sd) * 10;

  // the clearing: a shallow crater where the foot came down, and a low rim
  const dg = Math.hypot((x - GLADE.x) / 1.25, z - GLADE.z);
  h += CRATER.k * (-3.2 * (1 - sstep(0, 12, dg)) + 0.9 * Math.exp(-Math.pow((dg - 15) / 3.2, 2)));

  // the crossroads: a low round platform of old paving
  const dh = Math.hypot(x - HUB3.x, z - HUB3.z);
  h += 1.1 * (1 - sstep(26, 40, dh));

  // each zone has its own relief
  const gl = zone3('gloom');
  const wg = inZone('gloom', x, z);
  const dgl = Math.hypot(x - gl.heart.x, (z - gl.heart.z) * 0.9);
  h += wg * (-9 * (1 - sstep(0, 60, dgl)) - 2.4 * sstep(40, 62, dgl) * 0 + 1.5 * (fbm(x * 0.05, 0, z * 0.05, 3, 31) - 0.5));

  const th = zone3('thicket');
  const wt = inZone('thicket', x, z);
  h += wt * (4 + 9 * ridge(x * 0.045, 0, z * 0.045, 3, 41) * (0.5 + 0.5 * sstep(8, 50, Math.hypot(x - th.entry.x, z - th.entry.z))));

  const ms = zone3('marsh');
  const wm = inZone('marsh', x, z);
  const pools = fbm(x * 0.03, 0, z * 0.03, 4, 51);
  h = mixn(h, MARSH_LEVEL + climb(z) * 0 + (pools - 0.5) * 3.2 + 0.6 * (fbm(x * 0.12, 0, z * 0.12, 2, 52) - 0.5), wm * 0.92);
  void ms;

  const bn = zone3('bones');
  const wb = inZone('bones', x, z);
  const dune = Math.sin(x * 0.075 + fbm(x * 0.02, 0, z * 0.02, 3, 61) * 5) * 0.5 + 0.5;
  h += wb * (2.4 + 3.4 * dune + 2.5 * (fbm(x * 0.035, 0, z * 0.035, 3, 62) - 0.5));
  const dbn = Math.hypot(x - bn.heart.x, z - bn.heart.z);
  h -= wb * 3.6 * (1 - sstep(0, 22, dbn));

  const md = zone3('meadow');
  const wd = inZone('meadow', x, z);
  h += wd * (4.5 * (fbm(x * 0.022, 0, z * 0.022, 3, 71) - 0.45) + 6 * (1 - sstep(0, 28, Math.hypot(x - md.heart.x, z - md.heart.z))));

  // the Edge: the plateau ends in a cliff, and the cliff in nothing
  h -= 190 * sstep(CLIFF_Z, CLIFF_Z - 20, z);
  return h;
}

/** which ground each place has: a weight per biome (they add up to about 1) */
export function biomeWeights(x: number, z: number): Record<Biome, number> {
  const w: Record<Biome, number> = { glade: 0, gloom: 0, thicket: 0, marsh: 0, bones: 0, meadow: 0, hub: 0, edge: 0 };
  for (const zn of ZONES3) w[zn.biome] = inZone(zn.id, x, z) ** 0.7;
  w.glade = 1 - sstep(0.75, 1.3, wobble(GLADE, x, z, 1.3));
  w.hub = 1 - sstep(0.7, 1.15, wobble(HUB3, x, z, 2.1));
  w.edge = sstep(-70, -150, z);
  return w;
}
