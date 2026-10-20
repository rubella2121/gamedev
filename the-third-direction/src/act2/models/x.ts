import * as THREE from 'three';
import { TubeChain } from '../kit/chain';
import { fbm, mix, ridge, rgb, scale, worley, type RGB } from '../kit/noise';
import { capsule, ellipsoid, inter, lazy, meshGen, mirrorX, smin, sphere, ssub, torus, union, type SDF, type Slicer, type V3 } from '../kit/sdf';
import { glow, halo, skin } from '../kit/skin';

/** X, the Hollow. Built from distance functions, melted together, painted per vertex. */

/* ---------------------------------------------------------------- */
/* colours                                                           */
/* ---------------------------------------------------------------- */

const SKIN_A = rgb(0x3a3544);
const SKIN_B = rgb(0x776f82);
const SKIN_DARK = rgb(0x15111d);
const VEIN = rgb(0x1a0f24);
const BLOOD = rgb(0x7a1a2c);
const BONE = rgb(0xd9d0b4);
const BONE_SHADE = rgb(0x8a8068);

/* ---------------------------------------------------------------- */
/* head                                                              */
/* ---------------------------------------------------------------- */

/** Where the three big eyes and the sixteen small ones sit, in head space (x right, y up, z forward). */
export const BIG_EYES: V3[] = [
  [-1.85, 0.55, 2.35],
  [0, 1.55, 2.7],
  [1.85, 0.55, 2.35],
];

export const SMALL_EYES: V3[] = (() => {
  const out: V3[] = [];
  const seeds: [number, number][] = [
    [-0.9, 3.3], [0.8, 3.5], [-2.2, 2.6], [2.3, 2.5], [-1.1, -0.7], [1.2, -0.9], [-2.9, 0.9], [2.9, 1.1],
    [-0.2, 2.5], [0.1, -1.4], [-2.7, -0.7], [2.6, -0.5], [-1.7, 3.6], [1.6, 3.8], [0.0, 0.2], [-0.8, -2.0],
  ];
  for (const [x, y] of seeds) {
    // push the point onto the front of the skull (an ellipsoid)
    const k = 1 - (x * x) / (3.2 * 3.2) - ((y - 1.0) * (y - 1.0)) / (4.8 * 4.8);
    out.push([x, y, Math.max(0.2, Math.sqrt(Math.max(0.05, k)) * 3.2 - 0.5)]);
  }
  return out;
})();

/** The pivot of the jaw, in head space. */
export const JAW_HINGE: V3 = [0, -2.1, -0.3];

function skullShape(): SDF {
  const cranium = ellipsoid([0, 1.3, -0.6], [3.1, 4.7, 3.5]);
  const midface = ellipsoid([0, -0.9, 0.7], [2.5, 3.3, 2.5]);
  const brow = capsule([-3.0, 1.15, 2.35], [0, 1.75, 2.6], 0.85, 0.9);
  const brow2 = capsule([3.0, 1.15, 2.35], [0, 1.75, 2.6], 0.85, 0.9);
  const cheekL = sphere([-2.3, -0.7, 1.5], 0.95);
  const cheekR = sphere([2.3, -0.7, 1.5], 0.95);
  let s: SDF = smin(0.9, cranium, midface, brow, brow2, cheekL, cheekR);
  // hollow temples and cheeks, so the skull shows through
  s = ssub(0.9, s, sphere([-3.5, -1.8, 1.2], 1.5));
  s = ssub(0.9, s, sphere([3.5, -1.8, 1.2], 1.5));
  s = ssub(1.0, s, sphere([-3.9, 0.8, 0.5], 1.3));
  s = ssub(1.0, s, sphere([3.9, 0.8, 0.5], 1.3));
  // sockets: deep, so the brow throws a shadow over each eye
  for (const [x, y, z] of BIG_EYES) s = ssub(0.4, s, sphere([x, y - 0.05, z + 0.15], 1.35));
  // pits for the small eyes
  for (const [x, y, z] of SMALL_EYES) s = ssub(0.2, s, sphere([x, y, z + 0.2], 0.4));
  // two slits where a nose would be
  s = ssub(0.2, s, capsule([-0.34, -0.5, 2.95], [-0.24, -1.9, 2.8], 0.15, 0.12));
  s = ssub(0.2, s, capsule([0.34, -0.5, 2.95], [0.24, -1.9, 2.8], 0.15, 0.12));
  // the mouth: a wide cavity cut up into the face
  s = ssub(0.6, s, ellipsoid([0, -2.55, 1.5], [2.15, 1.25, 2.2]));
  const base = s;
  return (x, y, z) => {
    const d = base(x, y, z);
    if (d > 0.7 || d < -0.9) return d;
    const w = (fbm(x * 1.7, y * 1.7, z * 1.7, 3, 7) - 0.5) * 0.4;
    const p = (worley(x * 4.5, y * 4.5, z * 4.5, 3) - 0.45) * 0.07;
    return d + w + p;
  };
}

function jawShape(): SDF {
  const parts: SDF[] = [];
  for (const sx of [-1, 1]) {
    parts.push(capsule([sx * 2.4, -1.7, -0.3], [sx * 2.15, -3.6, 0.8], 0.55, 0.6));
    parts.push(capsule([sx * 2.15, -3.6, 0.8], [sx * 0.85, -4.0, 3.9], 0.6, 0.42));
  }
  parts.push(sphere([0, -4.0, 4.2], 0.75));
  let s = smin(0.5, ...parts);
  // a dish for the tongue and the teeth
  s = ssub(0.3, s, ellipsoid([0, -3.0, 2.3], [1.5, 0.7, 2.1]));
  const base = s;
  return (x, y, z) => {
    const d = base(x, y, z);
    if (d > 0.6 || d < -0.8) return d;
    return d + (fbm(x * 1.8, y * 1.8, z * 1.8, 3, 55) - 0.5) * 0.3;
  };
}

export function headColor(x: number, y: number, z: number, nx: number, ny: number, nz: number, ao: number): RGB {
  const m = fbm(x * 0.7, y * 0.7, z * 0.7, 3, 11);
  let c = mix(SKIN_A, SKIN_B, m * m * 1.6);
  // veins
  const v = ridge(x * 1.3, y * 1.3, z * 1.3, 3, 21);
  if (v > 0.88) c = mix(c, VEIN, Math.min(1, (v - 0.88) * 12));
  const v2 = ridge(x * 2.6 + 5, y * 2.6, z * 2.6, 2, 33);
  if (v2 > 0.93) c = mix(c, BLOOD, Math.min(1, (v2 - 0.93) * 14) * 0.9);
  // inflamed rings around the eyes
  let near = 9;
  for (const e of BIG_EYES) near = Math.min(near, Math.hypot(x - e[0], y - e[1], z - e[2]));
  if (near < 2.3) c = mix(c, BLOOD, (1 - near / 2.3) * 0.9);
  for (const e of SMALL_EYES) {
    const dd = Math.hypot(x - e[0], y - e[1], z - e[2]);
    if (dd < 0.8) c = mix(c, BLOOD, (1 - dd / 0.8) * 0.9);
  }
  // black rot creeping down from the crown and the back
  const tar = fbm(x * 0.6 + 3, y * 0.5, z * 0.6, 3, 41) + (y - 1.5) * 0.13 - nz * 0.05;
  if (tar > 0.6) c = mix(c, SKIN_DARK, Math.min(1, (tar - 0.6) * 7));
  // the inside of the mouth is raw
  if (y < -1.3 && y > -3.4 && z > 0.2 && z < 3.8 && Math.abs(x) < 2.0 && Math.abs(ny) > 0.35) c = mix(c, BLOOD, 0.8);
  c = scale(c, 0.75 + 0.3 * ny);
  void nx;
  void ao;
  return c;
}

export function* buildSkull(): Generator<void, THREE.BufferGeometry, void> {
  return yield* meshGen(skullShape(), [-4.6, -5.0, -4.6], [4.6, 6.6, 4.6], 0.16, { color: headColor, aoAmount: 0.95 });
}

export function* buildJaw(): Generator<void, THREE.BufferGeometry, void> {
  return yield* meshGen(jawShape(), [-3.4, -5.4, -1.0], [3.4, -0.6, 5.6], 0.14, { color: (x, y, z, nx, ny, nz, ao) => headColor(x, y, z, nx, ny, nz, ao), aoAmount: 0.9 });
}

/** A needle tooth pointing along +y from its base. */
function toothGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.15, 1, 6, 1);
  g.translate(0, 0.5, 0);
  return g;
}

/** The eye: a bloodshot ball, a glowing iris, a slit, and a heavy lid pulled down over the top. */
export function makeBigEye(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.82, 14, 10), new THREE.MeshBasicMaterial({ color: 0x8a2a34 }));
  g.add(ball);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.52, 14), new THREE.MeshBasicMaterial({ color: 0xff3a1e }));
  iris.position.z = 0.79;
  g.add(iris);
  const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.8), new THREE.MeshBasicMaterial({ color: 0x120006 }));
  slit.position.z = 0.8;
  g.add(slit);
  const vm = new THREE.MeshBasicMaterial({ color: 0x3a0610 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.45), vm);
    v.position.set(Math.cos(a) * 0.64, Math.sin(a) * 0.64, 0.5);
    v.rotation.z = a - Math.PI / 2;
    v.rotation.y = Math.cos(a) * 0.7;
    v.rotation.x = -Math.sin(a) * 0.7;
    g.add(v);
  }
  const h = halo(0xff3a2a, 3.2, 0.55);
  h.position.z = 0.9;
  g.add(h);
  g.userData['halo'] = h;
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.92, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.46), skin({ color: 0x40384e, rim: 0x7a4ac0 }));
  lid.rotation.x = -0.35;
  g.add(lid);
  g.userData['lid'] = lid;
  return g;
}

/* ---------------------------------------------------------------- */
/* torso                                                             */
/* ---------------------------------------------------------------- */

const RIB_Y = [12.3, 10.9, 9.5, 8.1, 6.7, 5.3, 3.9];
const HOLLOW_C: V3 = [0, 4.8, 3.5];
const HOLLOW_R: V3 = [2.3, 4.2, 2.7];

function chestAt(y: number) {
  const t = Math.max(0, 1 - ((y - 7) / 7.2) ** 2);
  return { a: 5.4 * Math.sqrt(t), b: 3.6 * Math.sqrt(t) };
}

/** One rib: an elliptical ring hugging the chest, kept to the front and sides. */
function ribSDF(y0: number): SDF {
  const { a, b } = chestAt(y0);
  const A = a + 0.1;
  const B = b + 0.1;
  const k = Math.min(A, B);
  return (x, y, z) => {
    const d = Math.hypot((Math.hypot(x / A, z / B) - 1) * k, y - y0) - 0.38;
    return Math.max(d, -z - 0.3 * B);
  };
}

const ribs: SDF = lazy(
  smin(
    0.3,
    ...RIB_Y.map(ribSDF),
    capsule([0, 12.6, 3.4], [0, 3.4, 3.4], 0.4),
    capsule([0.5, 13.0, 2.7], [5.6, 12.4, 1.4], 0.38),
    capsule([-0.5, 13.0, 2.7], [-5.6, 12.4, 1.4], 0.38),
  ),
  [0, 8, 1],
  8.6,
  1.2,
);

function torsoShape(): SDF {
  const chest = ellipsoid([0, 7, 0], [5.4, 7.2, 3.6]);
  const belly = ellipsoid([0, -3.2, 0.1], [3.6, 7.6, 2.7]);
  const hips = ellipsoid([0, -11.5, 0], [2.7, 5.4, 2.0]);
  const neck = capsule([0, 12, 0.3], [0, 15.8, 1.1], 1.7, 1.05);
  const sh = (sx: number) => sphere([sx * 6.5, 11.9, -0.2], 2.7);
  const trap = (sx: number) => capsule([sx * 1.0, 13.8, 0.3], [sx * 6.0, 12.3, -0.2], 1.1, 1.7);
  let body: SDF = smin(1.6, chest, belly, hips, neck, sh(-1), sh(1), trap(-1), trap(1));
  body = ssub(0.9, body, ellipsoid(HOLLOW_C, HOLLOW_R));
  body = ssub(1.2, body, ellipsoid([0, -3.0, 3.0], [2.6, 3.4, 1.4]));
  body = smin(0.3, body, ribs);
  const base = body;
  return (x, y, z) => {
    const d = base(x, y, z);
    if (d > 0.7 || d < -1.0) return d;
    return d + (fbm(x * 1.2, y * 1.2, z * 1.2, 3, 71) - 0.5) * 0.42 + (worley(x * 3.5, y * 3.5, z * 3.5, 5) - 0.45) * 0.07;
  };
}

function skinColor(x: number, y: number, z: number): RGB {
  const m = fbm(x * 0.55, y * 0.55, z * 0.55, 3, 91);
  let c = mix(SKIN_A, SKIN_B, m * m * 1.5);
  const v = ridge(x * 1.1, y * 1.1, z * 1.1, 3, 23);
  if (v > 0.88) c = mix(c, VEIN, Math.min(1, (v - 0.88) * 12));
  const v2 = ridge(x * 2.3 + 4, y * 2.3, z * 2.3, 2, 37);
  if (v2 > 0.93) c = mix(c, BLOOD, Math.min(1, (v2 - 0.93) * 14) * 0.85);
  return c;
}

function torsoColor(x: number, y: number, z: number, nx: number, ny: number, nz: number, ao: number): RGB {
  let c = skinColor(x, y, z);
  // black rot spreading from the middle of the back and the belly
  const tar = fbm(x * 0.45 + 9, y * 0.35, z * 0.45, 3, 43) - 0.06 * ny;
  if (tar > 0.58) c = mix(c, SKIN_DARK, Math.min(1, (tar - 0.58) * 7));
  // bone where the ribs and breastbone are
  const rd = ribs(x, y, z);
  if (rd < 0.16) {
    const bm = fbm(x * 2, y * 2, z * 2, 2, 5);
    c = mix(BONE_SHADE, BONE, 0.4 + 0.6 * bm);
    if (rd > 0.02) c = mix(c, SKIN_A, (rd - 0.02) / 0.14);
  }
  // the hollow is raw, and dark
  const hx = (x - HOLLOW_C[0]) / HOLLOW_R[0];
  const hy = (y - HOLLOW_C[1]) / HOLLOW_R[1];
  const hz = (z - HOLLOW_C[2]) / HOLLOW_R[2];
  const hd = Math.hypot(hx, hy, hz);
  if (hd < 1.25) c = mix(c, mix(rgb(0x2a0610), BLOOD, fbm(x * 2, y * 2, z * 2, 2, 9)), Math.min(1, (1.25 - hd) * 5));
  c = scale(c, 0.72 + 0.32 * ny + 0.08 * nz);
  void nx;
  void ao;
  return c;
}

export function* buildTorso(): Generator<void, THREE.BufferGeometry, void> {
  return yield* meshGen(torsoShape(), [-9.4, -17, -5.4], [9.4, 17.4, 7.4], 0.22, { color: torsoColor, aoAmount: 0.95 });
}

/* ---------------------------------------------------------------- */
/* a hanging arm                                                     */
/* ---------------------------------------------------------------- */

function armShape(): SDF {
  const upper = capsule([0, 0, 0], [2.4, -7.0, 1.6], 1.75, 1.3);
  const elbow = sphere([2.4, -7.0, 1.6], 1.4);
  const fore = capsule([2.4, -7.0, 1.6], [1.8, -13.2, 5.0], 1.3, 0.95);
  const palm = ellipsoid([1.8, -14.4, 5.7], [1.35, 1.55, 0.65]);
  const base = smin(0.7, upper, elbow, fore, palm);
  return (x, y, z) => {
    const d = base(x, y, z);
    if (d > 0.7 || d < -1.0) return d;
    return d + (fbm(x * 1.4, y * 1.4, z * 1.4, 3, 83) - 0.5) * 0.4;
  };
}

export function* buildArm(): Generator<void, THREE.BufferGeometry, void> {
  return yield* meshGen(armShape(), [-2.4, -16.4, -2.6], [5.4, 3.8, 8.2], 0.2, {
    color: (x, y, z, nx, ny, nz, ao) => {
      let c = skinColor(x, y, z);
      if (y < -12.5) c = mix(c, SKIN_B, 0.35);
      c = scale(c, 0.75 + 0.3 * ny);
      void nx;
      void nz;
      void ao;
      return c;
    },
    aoAmount: 0.9,
  });
}

/* ---------------------------------------------------------------- */
/* the foot                                                          */
/* ---------------------------------------------------------------- */

function footShape(): SDF {
  const heel = ellipsoid([0, 1.6, -2.3], [2.5, 1.7, 2.6]);
  const mid = ellipsoid([0, 1.2, 0.8], [2.7, 1.4, 2.7]);
  const ball = ellipsoid([0, 1.0, 3.1], [3.1, 1.15, 1.4]);
  const toes: SDF[] = [];
  const xs = [-2.5, -1.25, 0, 1.25, 2.5];
  xs.forEach((x, i) => {
    const big = i === 0;
    toes.push(capsule([x, 1.0, 3.3], [x * 1.12, 0.62, 6.6 - Math.abs(i - 1.5) * 0.25], big ? 1.05 : 0.8, big ? 0.85 : 0.62));
  });
  const ankle = capsule([0, 2.8, -2.7], [0, 12, -3.1], 2.3, 1.9);
  let f: SDF = smin(0.6, heel, mid, ball, ankle, ...toes);
  // the sole is flat
  const flat = inter(f, (_x, y) => -y);
  f = flat;
  const base = f;
  return (x, y, z) => {
    const d = base(x, y, z);
    if (d > 0.6 || d < -0.9) return d;
    return d + (fbm(x * 1.5, y * 1.5, z * 1.5, 3, 61) - 0.5) * 0.4 + (worley(x * 3, y * 3, z * 3, 8) - 0.45) * 0.14;
  };
}

export function* buildFoot(): Generator<void, THREE.BufferGeometry, void> {
  return yield* meshGen(footShape(), [-4.8, -0.2, -5.6], [4.8, 12.4, 7.8], 0.2, {
    color: (x, y, z, nx, ny, nz, ao) => {
      let c = mix(rgb(0x6e6478), rgb(0xa89fb0), fbm(x * 0.7, y * 0.7, z * 0.7, 3, 19));
      const v = ridge(x * 1.4, y * 1.4, z * 1.4, 3, 29);
      if (v > 0.88) c = mix(c, VEIN, Math.min(1, (v - 0.88) * 12));
      if (y < 0.35) c = mix(c, SKIN_DARK, 0.6);
      c = scale(c, 0.75 + 0.3 * ny);
      void nx;
      void nz;
      void ao;
      return c;
    },
    aoAmount: 0.9,
  });
}


/* ---------------------------------------------------------------- */
/* the whole of X                                                    */
/* ---------------------------------------------------------------- */

/** X stands in the void beyond the platform, lower and a little smaller than his build, so his face is in the camera's frame. */
export const ROOT_S = 0.85;
export const ROOT_Y = -3.5;
/** the foot is drawn big and scaled to fit the circle it stamps */
const FOOT_S = 0.72;

const rnd = (i: number, k: number) => (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;

/** One of the nine bony arms that rake the floor. The group's origin is the claw tip; the arm trails along +x. */
export class RakeArm {
  readonly group = new THREE.Group();
  private chain: TubeChain;
  private claws: THREE.Mesh[] = [];
  private len = 1;
  private readonly N = 34;
  private ph: number;
  /** 0 = relaxed, 1 = fingers dug into the floor */
  dig = 0;

  constructor(i: number, bone: THREE.Material, dark: THREE.Material) {
    this.ph = i * 1.7;
    this.chain = new TubeChain(
      this.N,
      7,
      bone,
      // a long bone with a knuckle every few units
      (u) => 0.26 + 0.12 * (1 - u) + 0.36 * Math.pow(Math.abs(Math.sin(u * Math.PI * 5.5)), 7),
      (u, a) => {
        const k = Math.pow(Math.abs(Math.sin(u * Math.PI * 5.5)), 7);
        return mix(mix(rgb(0xeadcb0), rgb(0x9a8a68), 0.45 + 0.3 * Math.sin(a * 2 + u * 20) * 0.5 + 0.25 * u), rgb(0x4a3a2a), k * 0.5);
      },
    );
    this.group.add(this.chain.mesh);
    // a hand: three long claws that splay and drag
    const cg = new THREE.ConeGeometry(0.28, 2.8, 6);
    cg.translate(0, 1.4, 0);
    for (let k = -1; k <= 1; k++) {
      const c = new THREE.Mesh(cg, dark);
      c.userData['k'] = k;
      this.claws.push(c);
      this.group.add(c);
    }
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), skin({ color: 0xb8ae94, rim: 0x5a4a88, rimPower: 2.4 }));
    knuckle.position.set(0.5, 0, 0);
    this.group.add(knuckle);
    this.group.userData['arm'] = this;
    this.layout(0);
  }

  /** shrink the bony body while the claw tip stays where it is */
  setLength(k: number) {
    this.len = k;
  }

  layout(t: number) {
    const N = this.N;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = u * 16 * this.len;
      const wave = Math.sin(t * 5 + this.ph - u * 5) * 0.25 * u;
      const y = 0.0 + 0.5 * Math.sin(u * 3.1 + this.ph) * (1 - this.len * 0.5) * u + Math.abs(wave) * 0.4;
      this.chain.pts[i]!.set(x + 0.6, y, wave);
    }
    this.chain.update();
    for (const c of this.claws) {
      const k = c.userData['k'] as number;
      const spread = 0.5 + 0.35 * (1 - this.dig);
      // the claws point forward (−x) and down, fanning around the tip
      c.position.set(0, 0, k * 0.34);
      c.rotation.set(0, k * spread * 0.9, Math.PI / 2 + 0.55 - this.dig * 0.45 + Math.sin(t * 7 + k + this.ph) * 0.08);
    }
  }
}

/** The maw that bursts out of the floor: a root, and petals of fangs that fold open. */
export class MawJaw {
  readonly group = new THREE.Group();
  private petals: THREE.Group[] = [];
  private root: THREE.Mesh;

  constructor(dark: THREE.Material, bone: THREE.Material, raw: THREE.Material) {
    this.root = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.35, 3.2, 10, 1, true), dark);
    this.root.position.y = 1.4;
    this.group.add(this.root);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(1.0, 12), raw);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 2.9;
    this.group.add(inner);
    const petalGeo = new THREE.ConeGeometry(0.62, 3.0, 5);
    petalGeo.translate(0, 1.5, 0);
    petalGeo.scale(1, 1, 0.4);
    const toothGeo = new THREE.ConeGeometry(0.12, 0.9, 5);
    toothGeo.translate(0, 0.45, 0);
    const N = 7;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 0.9, 2.9, Math.sin(a) * 0.9);
      pivot.rotation.y = -a + Math.PI / 2;
      const petal = new THREE.Mesh(petalGeo, dark);
      pivot.add(petal);
      for (let k = 0; k < 3; k++) {
        const t = new THREE.Mesh(toothGeo, bone);
        t.position.set(0, 0.8 + k * 0.7, -0.14);
        t.rotation.x = -Math.PI / 2.2;
        pivot.add(t);
      }
      this.petals.push(pivot);
      this.group.add(pivot);
    }
    this.open(0);
  }

  /** 0 = closed fist of fangs, 1 = wide open */
  open(u: number) {
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i]!;
      // each petal tilts outward from the ring, away from the centre
      p.rotation.x = 0;
      p.rotation.z = 0;
      const a = (i / this.petals.length) * Math.PI * 2;
      // tilt about the tangent so the tip moves from "closed over the opening" to "flung outward"
      const tilt = -0.15 + u * 1.25;
      p.rotation.set(0, 0, 0);
      p.quaternion.setFromAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), tilt - 1.1 + 1.1 * 0);
    }
  }
}

export interface XParts {
  root: THREE.Group;
  head: THREE.Group;
  jaw: THREE.Group;
  foot: THREE.Group;
  arms: THREE.Group[];
  armor: THREE.Group;
  gaze: THREE.Group;
  core: THREE.Group;
  jawSlots: { group: THREE.Group; ring: THREE.Mesh; maw: MawJaw }[];
}

/** The monster itself. Build once (a few seconds of 8 ms slices), then drive it with the setters and `update`. */
export class XModel {
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  readonly jaw = new THREE.Group();
  readonly foot = new THREE.Group();
  readonly rakeArms: RakeArm[] = [];
  readonly armor = new THREE.Group();
  readonly gaze = new THREE.Group();
  readonly core = new THREE.Group();
  readonly jawSlots: { group: THREE.Group; ring: THREE.Mesh; maw: MawJaw }[] = [];
  ready = false;
  private neck!: TubeChain;
  private tendrils: { chain: TubeChain; base: THREE.Vector3; dir: THREE.Vector3; ph: number }[] = [];
  private bigEyes: THREE.Group[] = [];
  private smallEyes: THREE.Mesh[] = [];
  private fingers: { chain: TubeChain; ph: number; side: number }[] = [];
  private armGroups: THREE.Group[] = [];
  private torsoMesh!: THREE.Mesh;
  private skinMat: THREE.MeshToonMaterial;
  private boneMat: THREE.MeshToonMaterial;
  private darkMat: THREE.MeshToonMaterial;
  private hollowGlow: THREE.Sprite;
  private coreMesh!: THREE.Mesh;
  private coreHalo: THREE.Sprite;
  private armorBits: { m: THREE.Mesh; v: number; y0: number }[] = [];
  private headU = 0;
  private jawOpen = 0;
  private blink = [0, 0, 0];
  private gazeTarget = new THREE.Vector3(0, 2, 12);
  private eyesWide = 0;
  private beamSlant!: THREE.Mesh;
  private beamStrip!: THREE.Mesh;
  private beamCore!: THREE.Mesh;
  private beamFlare!: THREE.Sprite;
  private time = 0;
  private footMesh!: THREE.Mesh;
  private toes: THREE.Mesh[] = [];
  private flashT = 0;
  private mats: THREE.MeshToonMaterial[] = [];

  constructor(world: THREE.Group, bossZ: number) {
    this.root.position.set(0, ROOT_Y, bossZ);
    this.root.scale.setScalar(ROOT_S);
    this.skinMat = skin({ vertexColors: true, rim: 0x5a3a90, rimPower: 2.4, steps: 4 });
    this.boneMat = skin({ vertexColors: true, color: 0xffffff, rim: 0xffffff, rimPower: 3 });
    this.darkMat = skin({ color: 0x120c1a, rim: 0x8a5ad0, rimPower: 2 });
    this.mats.push(this.skinMat, this.boneMat, this.darkMat);
    this.hollowGlow = halo(0xff4a3a, 9, 0.5);
    this.hollowGlow.position.set(HOLLOW_C[0], HOLLOW_C[1], HOLLOW_C[2] - 0.4);
    this.root.add(this.hollowGlow);
    this.coreHalo = halo(0xc060ff, 7, 0.8);
    world.add(this.root, this.foot, this.gaze, this.core);
    this.buildSmall(world);
    this.root.visible = false;
  }

  /** Queue the heavy meshes; they appear as they finish. */
  build(slicer: Slicer): Promise<void> {
    const jobs: Promise<void>[] = [];
    const job = <T>(gen: Generator<void, T, void>, done: (v: T) => void) => jobs.push(new Promise<void>((res) => slicer.add(gen, (v) => (done(v), res()))));
    job(buildSkull(), (g) => this.head.add(new THREE.Mesh(g, this.skinMat)));
    job(buildJaw(), (g) => {
      const jm = new THREE.Mesh(g, this.skinMat);
      jm.position.set(-JAW_HINGE[0], -JAW_HINGE[1], -JAW_HINGE[2]);
      this.jaw.add(jm);
    });
    job(buildTorso(), (g) => {
      this.torsoMesh = new THREE.Mesh(g, this.skinMat);
      this.root.add(this.torsoMesh);
    });
    job(buildArm(), (g) => {
      for (const sx of [-1, 1]) {
        const grp = new THREE.Group();
        grp.position.set(sx * 6.5, 11.9, -0.2);
        const m = new THREE.Mesh(g, this.skinMat);
        m.scale.x = sx;
        grp.add(m);
        this.armGroups.push(grp);
        this.root.add(grp);
        // five long fingers hanging from the palm
        for (let f = 0; f < 5; f++) {
          const ch = new TubeChain(6, 6, this.skinMat, (u) => 0.34 * (1 - u * 0.7) + 0.04, () => mix(SKIN_B, SKIN_A, 0.5));
          const fx = sx * (1.8 + (f - 2) * 0.62);
          ch.pts.forEach((p, i) => p.set(fx, -15.4 - i * 0.9, 5.7));
          ch.rest();
          ch.update();
          grp.add(ch.mesh);
          this.fingers.push({ chain: ch, ph: f * 1.3 + sx, side: sx });
          // a black nail on the tip
          const nail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 5), this.darkMat);
          nail.userData['tip'] = true;
          ch.mesh.add(nail);
          ch.mesh.userData['nail'] = nail;
        }
      }
    });
    job(buildFoot(), (g) => {
      // the body of the foot hangs from a group that is nudged back so the stamp lands in the middle of its circle
      const fb = new THREE.Group();
      fb.position.z = -1.6;
      this.foot.add(fb);
      this.footMesh = new THREE.Mesh(g, this.skinMat);
      this.footMesh.position.y = -1.3;
      fb.add(this.footMesh);
      // toenails
      const nailGeo = new THREE.ConeGeometry(0.34, 1.5, 6);
      nailGeo.translate(0, 0.75, 0);
      const xs = [-2.5, -1.25, 0, 1.25, 2.5];
      xs.forEach((x, i) => {
        const n = new THREE.Mesh(nailGeo, this.darkMat);
        n.position.set(x * 1.12, 0.62 - 1.3, 6.6 - Math.abs(i - 1.5) * 0.25);
        n.rotation.x = Math.PI / 2 - 0.3;
        fb.add(n);
        this.toes.push(n);
      });
      // the leg goes up out of the sky
      const leg = new TubeChain(3, 9, this.skinMat, () => 1.9, () => mix(rgb(0x6e6478), rgb(0x8a8096), 0.5));
      leg.pts[0]!.set(0, 8.5 - 1.3, -3.1);
      leg.pts[1]!.set(0, 40, -3.1);
      leg.pts[2]!.set(0, 90, -3.1);
      leg.update();
      fb.add(leg.mesh);
    });
    return Promise.all(jobs).then(() => {
      this.finish();
    });
  }

  private buildSmall(world: THREE.Group) {
    const bone = skin({ color: 0xcfc6ac, rim: 0x8a7ab0, rimPower: 3 });
    // head parts that do not need meshing
    this.head.position.set(0, 18.4, 1.4);
    this.root.add(this.head);
    this.jaw.position.set(...JAW_HINGE);
    this.head.add(this.jaw);
    const tg = toothGeometry();
    const o = new THREE.Object3D();
    const NU = 22;
    const up = new THREE.InstancedMesh(tg, bone, NU);
    for (let i = 0; i < NU; i++) {
      const a = ((i + 0.5) / NU - 0.5) * 2.5;
      o.position.set(Math.sin(a) * 1.85, -1.5, 1.2 + Math.cos(a) * 2.0);
      o.rotation.set(Math.PI + (rnd(i, 1) - 0.5) * 0.35, 0, (rnd(i, 2) - 0.5) * 0.4);
      o.scale.set(0.8 + rnd(i, 8) * 0.7, 0.5 + rnd(i, 3) * 1.5, 0.8 + rnd(i, 9) * 0.7);
      o.updateMatrix();
      up.setMatrixAt(i, o.matrix);
    }
    this.head.add(up);
    const NL = 20;
    const low = new THREE.InstancedMesh(tg, bone, NL);
    for (let i = 0; i < NL; i++) {
      const a = ((i + 0.5) / NL - 0.5) * 2.3;
      o.position.set(Math.sin(a) * 1.4, -3.2, 2.2 + Math.cos(a) * 1.9);
      o.rotation.set((rnd(i, 4) - 0.5) * 0.35, 0, (rnd(i, 5) - 0.5) * 0.4);
      o.scale.set(0.8 + rnd(i, 10) * 0.7, 0.5 + rnd(i, 6) * 1.5, 0.8 + rnd(i, 11) * 0.7);
      o.updateMatrix();
      low.setMatrixAt(i, o.matrix);
    }
    low.position.set(-JAW_HINGE[0], -JAW_HINGE[1], -JAW_HINGE[2]);
    this.jaw.add(low);
    // the crown
    const thorns = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 6), this.darkMat, 11);
    for (let i = 0; i < 11; i++) {
      const a = ((i - 5) / 5) * 1.25;
      const L = 2.6 + rnd(i, 7) * 2.6;
      o.position.set(Math.sin(a) * 2.6, 4.9 + Math.cos(a) * 0.4, -0.5 - Math.abs(a) * 0.5);
      o.rotation.set(-0.3 - Math.abs(a) * 0.3, 0, -a * 0.9);
      o.scale.set(1.2, L, 1.2);
      o.updateMatrix();
      thorns.setMatrixAt(i, o.matrix);
    }
    this.head.add(thorns);
    // horns: swept back and up from the temples
    for (const sx of [-1, 1]) {
      const horn = new TubeChain(9, 7, this.darkMat, (u) => 0.55 * (1 - u) + 0.03);
      for (let i = 0; i < 9; i++) {
        const u = i / 8;
        horn.pts[i]!.set(sx * (3.0 + Math.sin(u * 2.2) * 2.6), 2.2 + u * 5.2 - u * u * 0.8, -0.8 - u * 2.4 - Math.sin(u * 3) * 0.6);
      }
      horn.update();
      this.head.add(horn.mesh);
    }
    for (const [x, y, z] of BIG_EYES) {
      const e = makeBigEye();
      e.position.set(x, y, z);
      this.head.add(e);
      this.bigEyes.push(e);
    }
    const sm = new THREE.MeshBasicMaterial({ color: 0xff3040 });
    for (const [x, y, z] of SMALL_EYES) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), sm.clone());
      e.position.set(x, y, z + 0.05);
      this.head.add(e);
      this.smallEyes.push(e);
    }
    // the neck
    this.neck = new TubeChain(14, 9, this.skinMat, (u) => 1.25 - 0.3 * Math.sin(u * Math.PI) + 0.1, (u, a) => mix(SKIN_A, SKIN_B, 0.4 + 0.3 * Math.sin(a * 2 + u * 9)));
    this.root.add(this.neck.mesh);
    // black tendrils, like hair, from the back of the skull
    for (let i = 0; i < 9; i++) {
      const ch = new TubeChain(14, 6, this.darkMat, (u) => 0.42 * (1 - u) + 0.03);
      const a = ((i - 4) / 4) * 1.1;
      const base = new THREE.Vector3(Math.sin(a) * 2.3, 3.6 + Math.cos(a) * 0.6, -2.4);
      const dir = new THREE.Vector3(Math.sin(a) * 0.5, -0.3, -1).normalize();
      this.tendrils.push({ chain: ch, base, dir, ph: i * 0.9 });
      this.head.add(ch.mesh);
    }
    // the tar that clings to him, falling away after the first phase
    const blobGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const blobMat = skin({ color: 0x07040e, rim: 0x1f5a68, rimPower: 3 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x6ff0ff });
    for (let i = 0; i < 80; i++) {
      const y = -7 + rnd(i, 21) * 21;
      const ch = chestAt(Math.max(1, y));
      const ang = (rnd(i, 22) - 0.5) * 3.2;
      const m = new THREE.Mesh(blobGeo, blobMat);
      const fat = 0.5 + rnd(i, 23) * 1.0;
      m.position.set(Math.sin(ang) * (ch.a + 0.15 || 2.8), y, Math.cos(ang) * (ch.b + 0.15 || 2.2));
      if (y < 3) m.position.set(Math.sin(ang) * 3.5, y, Math.cos(ang) * 2.6);
      m.scale.set(fat * 1.2, fat * (0.6 + rnd(i, 24) * 0.7), fat);
      this.armor.add(m);
      this.armorBits.push({ m, v: 4 + (i % 5), y0: m.position.y });
      if (rnd(i, 25) < 0.22) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), eyeMat);
        e.position.set(0, 0.1, 0.5);
        m.add(e);
      }
    }
    this.root.add(this.armor);
    // the raking arms (in the world, not in his body)
    const darkClaw = skin({ color: 0x15101c, rim: 0xb090ff, rimPower: 2 });
    const boneVC = skin({ vertexColors: true, rim: 0x5a4a88, rimPower: 2.4 });
    for (let i = 0; i < 9; i++) {
      const arm = new RakeArm(i, boneVC, darkClaw);
      arm.group.visible = false;
      this.rakeArms.push(arm);
      world.add(arm.group);
    }
    // the gaze: a slanted ray from the eyes to the floor, then a strip along it
    const beamMat = () => new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.beamSlant = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.7), beamMat());
    this.beamStrip = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 1.5), beamMat());
    this.beamCore = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe8e8, fog: false }));
    this.beamFlare = halo(0xff5a4a, 4.5, 0.9);
    this.gaze.add(this.beamSlant, this.beamStrip, this.beamCore, this.beamFlare);
    this.gaze.visible = false;
    // the core, and the vein that ties it to the hollow in his chest
    const cm = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), new THREE.MeshBasicMaterial({ color: 0x6a1a8a }));
    this.coreMesh = cm;
    this.core.add(cm, this.coreHalo);
    const light = new THREE.PointLight(0xc060ff, 0, 14, 1.4);
    this.core.add(light);
    this.core.userData['light'] = light;
    this.core.visible = false;
    // the maws
    const raw = new THREE.MeshBasicMaterial({ color: 0x4a0612, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const maw = new MawJaw(this.darkMat, bone, raw);
      maw.group.visible = false;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 32), new THREE.MeshBasicMaterial({ color: 0xe02b3a, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.07;
      ring.visible = false;
      world.add(maw.group, ring);
      this.jawSlots.push({ group: maw.group, ring, maw });
    }
    this.foot.position.set(0, 40, 0);
    this.foot.scale.setScalar(FOOT_S);
    this.foot.visible = false;
  }

  private finish() {
    this.ready = true;
    this.update(0, 0);
  }

  /* -------------------------------- control -------------------------------- */

  setHead(u: number) {
    this.headU = u;
    this.head.position.set(0, 18.4 + (10.2 - 18.4) * u, 1.4 + (12.6 - 1.4) * u);
    this.head.rotation.x = u * 0.32;
  }

  setJaw(open: number) {
    this.jawOpen = open;
    this.jaw.rotation.x = open * 0.62;
  }

  /** The eyes follow a world point. */
  lookAt(x: number, y: number, z: number) {
    this.gazeTarget.set(x, y, z);
  }

  /** 0 = lids low, 1 = all the way open */
  setWide(v: number) {
    this.eyesWide = v;
  }

  /** The tar falls away: u 0..1 */
  setArmor(u: number) {
    this.armor.visible = u < 1;
    this.armorBits.forEach((b, i) => {
      b.m.position.y = b.y0 - u * u * (10 + (i % 5) * 3);
      b.m.scale.setScalar(Math.max(0.001, (0.5 + rnd(i, 23)) * (1 - u)));
    });
  }

  flash(v: number) {
    this.flashT = v;
  }

  /** Beam from the middle eye to the floor point (gx, gz), then along the floor in direction theta for len. */
  setGaze(on: boolean, gx = 0, gz = 0, theta = 0, len = 16) {
    this.gaze.visible = on;
    if (!on) return;
    const dx = Math.sin(theta);
    const dz = Math.cos(theta);
    const eye = new THREE.Vector3();
    this.bigEyes[1]!.getWorldPosition(eye);
    // where the ray meets the floor: a few units in front of the head
    const fx = gx + dx * 3.2;
    const fz = gz + dz * 3.2;
    const sx = fx - eye.x;
    const sy = -eye.y + 0.2;
    const sz = fz - eye.z;
    const sl = Math.hypot(sx, sy, sz);
    this.beamSlant.position.set(eye.x + sx / 2, eye.y + sy / 2, eye.z + sz / 2);
    this.beamSlant.scale.set(sl, 1, 1);
    this.beamSlant.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(sx, sy, sz).normalize());
    const sl2 = Math.max(0.01, len - 3.2);
    this.beamStrip.position.set(fx + dx * sl2 * 0.5, 0.12, fz + dz * sl2 * 0.5);
    this.beamStrip.scale.set(sl2, 1, 1);
    this.beamStrip.rotation.y = Math.atan2(-dz, dx);
    this.beamCore.position.set(fx + dx * sl2 * 0.5, 0.18, fz + dz * sl2 * 0.5);
    this.beamCore.scale.set(sl2, 1, 1);
    this.beamCore.rotation.y = Math.atan2(-dz, dx);
    this.beamFlare.position.set(fx + dx * sl2, 0.6, fz + dz * sl2);
    this.beamFlare.scale.setScalar(4 + Math.sin(this.time * 40) * 0.6);
    (this.beamStrip.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.15 * Math.sin(this.time * 55);
  }

  /** The core, up or down, and how brightly lit. */
  setCore(on: boolean, x = 0, y = 1, z = 0, lit = 0) {
    this.core.visible = on;
    if (!on) return;
    this.core.position.set(x, y, z);
    const pulse = 1 + 0.08 * Math.sin(this.time * 8) + 0.06 * Math.sin(this.time * 13);
    this.coreMesh.scale.setScalar(pulse);
    (this.coreMesh.material as THREE.MeshBasicMaterial).color.setHex(lit > 0.5 ? 0xe080ff : 0x2a1040);
    (this.core.userData['light'] as THREE.PointLight).intensity = 60 * lit;
    this.coreHalo.material.opacity = 0.25 + 0.65 * lit;
  }

  setJawSlot(i: number, on: boolean, x = 0, z = 0, tele = 0, burst = 0) {
    const s = this.jawSlots[i]!;
    s.ring.visible = on && burst < 0.05;
    s.ring.position.set(x, 0.07, z);
    const r = 1.55 * Math.min(1, tele);
    s.ring.scale.set(Math.max(0.01, r), Math.max(0.01, r), 1);
    s.group.visible = on && burst > 0.02;
    s.group.position.set(x, 0, z);
    s.group.scale.set(1, Math.max(0.01, burst), 1);
    s.maw.open(Math.min(1, Math.max(0, burst)));
  }

  /* -------------------------------- animation -------------------------------- */

  update(dt: number, t: number) {
    this.time = t;
    if (!this.ready) return;
    const hv = this.headU;
    // breathing: slow, too slow
    const br = Math.sin(t * 0.9);
    if (this.torsoMesh) {
      this.torsoMesh.scale.set(1 + br * 0.012, 1 + br * 0.008, 1 + br * 0.014);
    }
    this.hollowGlow.material.opacity = 0.3 + 0.18 * Math.sin(t * 1.7) + this.flashT * 0.5;
    // head sway
    this.head.rotation.z = Math.sin(t * 0.6) * 0.04 * (1 - hv * 0.6);
    this.head.rotation.y = Math.sin(t * 0.43 + 1) * 0.06;
    // the neck: a bezier from the shoulders to the back of the skull
    const hp = this.head.position;
    const attach = new THREE.Vector3(0, -3.4, -1.3).applyEuler(this.head.rotation).add(hp);
    const p0 = new THREE.Vector3(0, 14.4, 0.8);
    const p1 = new THREE.Vector3(0, 17.2 - hv * 2, 1.0 + hv * 5.5);
    const p2 = new THREE.Vector3(0, attach.y + 2.6 - hv * 1.2, attach.z - 2.0 - hv * 1.5);
    const bz = new THREE.Vector3();
    for (let i = 0; i < this.neck.pts.length; i++) {
      const u = i / (this.neck.pts.length - 1);
      const w0 = (1 - u) ** 3;
      const w1 = 3 * u * (1 - u) ** 2;
      const w2 = 3 * u * u * (1 - u);
      const w3 = u ** 3;
      bz.set(0, 0, 0).addScaledVector(p0, w0).addScaledVector(p1, w1).addScaledVector(p2, w2).addScaledVector(attach, w3);
      // a living wobble
      bz.x += Math.sin(t * 1.3 + u * 4) * 0.25 * Math.sin(u * Math.PI);
      this.neck.pts[i]!.copy(bz);
    }
    this.neck.update();
    // eyes: follow the player, blink out of step
    const v = new THREE.Vector3();
    this.bigEyes.forEach((e, i) => {
      e.getWorldPosition(v);
      const dir = this.gazeTarget.clone().sub(v);
      const fwd = new THREE.Vector3(0, 0, 1).transformDirection(this.head.matrixWorld);
      // keep the glance within a cone around where the face points
      dir.normalize().lerp(fwd, 0.45).normalize();
      e.lookAt(v.x + dir.x, v.y + dir.y, v.z + dir.z);
      const phase = Math.sin(t * 0.7 + i * 2.1) > 0.985 || (t + i * 1.7) % 4.6 < 0.12;
      this.blink[i] = Math.max(0, this.blink[i]! - dt * 6);
      if (phase) this.blink[i] = 1;
      const lid = e.userData['lid'] as THREE.Mesh;
      lid.rotation.x = -0.35 - (1 - this.eyesWide) * 0.35 - this.blink[i]! * 0.95;
      (e.userData['halo'] as THREE.Sprite).material.opacity = 0.35 + 0.3 * this.eyesWide + 0.12 * Math.sin(t * 3 + i);
    });
    this.smallEyes.forEach((e, i) => {
      const k = 0.55 + 0.45 * Math.sin(t * (2 + (i % 5) * 0.7) + i * 1.9);
      (e.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.12 + 0.1 * k, 0.16 + 0.1 * k).multiplyScalar(0.45 + 0.75 * k);
    });
    // tendrils drift
    for (const td of this.tendrils) {
      const n = td.chain.pts.length;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        td.chain.pts[i]!.set(
          td.base.x + td.dir.x * u * 12 + Math.sin(t * 1.1 + td.ph + u * 3.2) * 1.0 * u,
          td.base.y + td.dir.y * u * 12 - u * u * 5 + Math.sin(t * 0.8 + td.ph * 1.3 + u * 2.4) * 0.8 * u,
          td.base.z + td.dir.z * u * 12 * (0.6 + 0.2 * Math.sin(td.ph)) + Math.cos(t * 0.9 + td.ph) * 0.8 * u,
        );
      }
      td.chain.update();
    }
    // the fingers curl and twitch
    for (const f of this.fingers) {
      const n = f.chain.pts.length;
      let x = f.chain.pts[0]!.x;
      let y = f.chain.pts[0]!.y;
      let z = f.chain.pts[0]!.z;
      for (let i = 1; i < n; i++) {
        const curl = 0.28 + 0.3 * Math.sin(t * 1.4 + f.ph) + (Math.sin(t * 5 + f.ph * 3) > 0.92 ? 0.5 : 0);
        const a = -Math.PI / 2 + i * curl * 0.55;
        x += 0;
        y += Math.sin(a) * 0.9;
        z += Math.cos(a) * 0.9 * (0.6 + 0.4 * i * 0.2);
        f.chain.pts[i]!.set(x, y, z);
      }
      f.chain.update();
      const nail = f.chain.mesh.userData['nail'] as THREE.Mesh;
      const last = f.chain.pts[n - 1]!;
      const prev = f.chain.pts[n - 2]!;
      nail.position.copy(last);
      nail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), last.clone().sub(prev).normalize());
    }
    // idle arm sway
    this.armGroups.forEach((g, i) => {
      g.rotation.z = Math.sin(t * 0.7 + i * 1.7) * 0.025 * (i ? -1 : 1);
      g.rotation.x = Math.sin(t * 0.55 + i) * 0.02;
    });
    // the raking arms wave while they move
    for (const a of this.rakeArms) if (a.group.visible) a.layout(t);
    // the toes flex while the foot is out
    if (this.foot.visible) {
      this.toes.forEach((n, i) => {
        n.rotation.x = Math.PI / 2 - 0.3 + Math.sin(t * 3 + i) * 0.06;
      });
    }
    // damage flash
    this.flashT = Math.max(0, this.flashT - dt * 5);
    for (const m of this.mats) {
      m.emissive.setRGB(this.flashT, this.flashT * 0.9, this.flashT * 0.95);
    }
  }

  /** Remove everything this model put in the world. */
  dispose(world: THREE.Group) {
    world.remove(this.root, this.foot, this.gaze, this.core);
    for (const a of this.rakeArms) world.remove(a.group);
    for (const j of this.jawSlots) world.remove(j.group, j.ring);
  }

  /** A rough parts list for the host (the fight) and for tests. */
  get parts(): XParts {
    return { root: this.root, head: this.head, jaw: this.jaw, foot: this.foot, arms: this.rakeArms.map((a) => a.group), armor: this.armor, gaze: this.gaze, core: this.core, jawSlots: this.jawSlots };
  }
}

/** The lab's view of X. */
export async function labX(slicer: Slicer, world: THREE.Group) {
  const x = new XModel(world, -29);
  x.root.visible = true;
  await x.build(slicer);
  const api = {
    update: (dt: number, t: number) => x.update(dt, t),
    pose(name: string, v = 1) {
      if (name === 'head') x.setHead(v);
      else if (name === 'jaw') x.setJaw(v);
      else if (name === 'wide') x.setWide(v);
      else if (name === 'armor') x.setArmor(v);
      else if (name === 'foot') {
        x.foot.visible = v > 0;
        x.foot.position.set(0, 1.3 + (1 - v) * 20, 0);
      } else if (name === 'arms') {
        x.rakeArms.forEach((a, i) => {
          a.group.visible = v > 0;
          a.group.position.set(-6 + (i % 3) * 3, 0.7, -20 + i * 2.6);
        });
      } else if (name === 'gaze') {
        x.setGaze(v > 0, 0, -18, 0.3, 24);
        x.setWide(1);
      } else if (name === 'core') x.setCore(v > 0, 0, 1.2, -4, v);
      else if (name === 'maw') x.setJawSlot(0, v > 0, 0, -6, 1, v);
      else if (name === 'look') x.lookAt(0, 3, 14);
    },
  };
  return api;
}
