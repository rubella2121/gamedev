import * as THREE from 'three';
import { TubeChain } from '../kit/chain';
import { fbm, mix, ridge, rgb, scale, type RGB } from '../kit/noise';
import { capsule, displace, ellipsoid, meshGen, smin, sphere, ssub, type SDF, type Slicer, type V3 } from '../kit/sdf';
import { glow, halo, skin } from '../kit/skin';

/**
 * The Cinderfox: a hound of black stone and ash, lit from inside, that hunts you through the 3D world. It cannot be killed, only
 * driven off, and it carries five tails of flame, one in the colour of each guardian: the tail that blazes is the ability it is
 * about to use. CONCEPT MODEL: it is not in any fight yet (see docs/CINDERFOX.md for the idea and its rules).
 *
 * Built like X (see models/x.ts): distance functions melted together and meshed once, painted per vertex, a second additive
 * layer on top for the parts that glow, tubes for the limbs, neck and tails. Units are the arena's (the Blob is 1.8 tall).
 * x right, y up, z forward; the paws stand on y = 0.
 */

/* ---------------------------------------------------------------- */
/* colours                                                           */
/* ---------------------------------------------------------------- */

const CHAR_A = rgb(0x0f0b0a);
const CHAR_B = rgb(0x2a1f1a);
const ASH = rgb(0x5b514a);
const BONE = rgb(0xcdbf9f);
/** the skull-mask of the face: older, browner bone than the ribs */
const MASK = rgb(0x8c7c5c);
const EMBER = rgb(0xff4a0e);
const HOT = rgb(0xffa530);
const WHITE = rgb(0xfff0c0);

/** The five tails, left to right as you look at its face: each is one guardian's colour and one ability. */
export const TAILS = [
  { id: 'toll', hue: 0xd9b8ff, name: 'Toll tail', ability: 'Toll of Flame' },
  { id: 'gloom', hue: 0x6ff0ff, name: 'Gloom tail', ability: 'Smoke Veil' },
  { id: 'thorn', hue: 0xff9a3a, name: 'Thorn tail', ability: 'Cinder Charge' },
  { id: 'mimic', hue: 0xff8aa8, name: 'Lure tail', ability: 'Will-o-Wisp' },
  { id: 'bone', hue: 0xe6d9b8, name: 'Bone tail', ability: 'Ash Sweep' },
] as const;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- */
/* shapes                                                            */
/* ---------------------------------------------------------------- */

/** where the parts of the skeleton are (the body at rest, the paws on y = 0) */
const K = {
  shoulder: 0.4,
  shoulderY: 1.8,
  shoulderZ: 0.82,
  hipX: 0.42,
  hipY: 1.8,
  hipZ: -0.98,
  /** the body is lifted this far off its own origin, so the legs are long and bent */
  lift: 0.42,
  neck: [0, 2.5, 1.3] as V3,
  head: [0, 2.72, 2.02] as V3,
  tail: [0, 2.3, -1.6] as V3,
};

/** the ribs run in tilted rings round the chest: this is where in a ring a point is (a sine of it is the ribs) */
const ribPhase = (y: number, z: number) => (z - 0.7) * 16 + (y - 2.0) * 3.4;
const inRibs = (ax: number, y: number, z: number) => smooth(0.2, 0.46, ax) * smooth(1.45, 1.75, y) * (1 - smooth(2.4, 2.68, y)) * smooth(0.0, 0.3, z) * (1 - smooth(1.25, 1.55, z));

/** the torso: a deep ribcage, a high tucked waist, hips, the base of the neck and tail, a row of spines */
function bodyShape(): SDF {
  const chest = ellipsoid([0, 1.95, 0.7], [0.5, 0.86, 0.96]);
  const waist = ellipsoid([0, 2.3, -0.25], [0.34, 0.4, 0.8]);
  const hips = ellipsoid([0, 2.12, -1.0], [0.46, 0.6, 0.75]);
  const neck = capsule([0, 2.3, 1.15], [0, 2.62, 1.55], 0.4, 0.34);
  const shL = sphere([-K.shoulder * 0.85, K.shoulderY + 0.05, K.shoulderZ], 0.28);
  const shR = sphere([K.shoulder * 0.85, K.shoulderY + 0.05, K.shoulderZ], 0.28);
  const hpL = ellipsoid([-K.hipX * 0.9, K.hipY, K.hipZ], [0.3, 0.52, 0.48]);
  const hpR = ellipsoid([K.hipX * 0.9, K.hipY, K.hipZ], [0.3, 0.52, 0.48]);
  const tail = capsule([0, 2.15, -1.45], [0, K.tail[1], -1.95], 0.3, 0.2);
  const parts: SDF[] = [chest, waist, hips, neck, shL, shR, hpL, hpR, tail];
  // a row of bone spines down the back, tallest over the shoulders, leaning away from the head
  for (let i = 0; i < 9; i++) {
    const z = 1.45 - i * 0.37;
    const y = 2.6 + 0.24 * Math.max(0, 1 - Math.abs(z - 0.9) / 1.2);
    parts.push(capsule([0, y - 0.12, z], [0, y + 0.36 - i * 0.015, z - 0.28], 0.09, 0.012));
  }
  const s = smin(0.34, ...parts);
  return displace(s, (x, y, z) => -0.04 * (0.5 + 0.5 * Math.sin(ribPhase(y, z))) * inRibs(Math.abs(x), y, z));
}

/** the head, in head space: origin at the middle of the skull, z forward */
function headShape(): SDF {
  const skull = ellipsoid([0, 0, 0], [0.34, 0.31, 0.44]);
  const snout = capsule([0, -0.04, 0.26], [0, -0.1, 0.78], 0.18, 0.065);
  const nose = sphere([0, -0.08, 0.81], 0.07);
  const browL = capsule([-0.3, 0.19, 0.15], [-0.07, 0.14, 0.5], 0.09, 0.05);
  const browR = capsule([0.3, 0.19, 0.15], [0.07, 0.14, 0.5], 0.09, 0.05);
  const earL = capsule([-0.19, 0.26, -0.1], [-0.4, 1.14, -0.4], 0.17, 0.014);
  const earR = capsule([0.19, 0.26, -0.1], [0.4, 1.14, -0.4], 0.17, 0.014);
  // cheek ruffs, swept back and out like a fox's
  const ruffL = capsule([-0.2, -0.1, 0.14], [-0.52, -0.22, -0.16], 0.1, 0.012);
  const ruffR = capsule([0.2, -0.1, 0.14], [0.52, -0.22, -0.16], 0.1, 0.012);
  let s = smin(0.12, skull, snout, nose, browL, browR, ruffL, ruffR, earL, earR);
  // upper fangs
  for (const sx of [-1, 1]) {
    s = smin(0.04, s, capsule([sx * 0.1, -0.12, 0.56], [sx * 0.105, -0.36, 0.6], 0.036, 0.004));
    s = smin(0.03, s, capsule([sx * 0.06, -0.13, 0.68], [sx * 0.06, -0.26, 0.7], 0.022, 0.003));
  }
  // dark sockets for the eyes, hollow ears
  for (const sx of [-1, 1]) {
    s = ssub(0.08, s, sphere([sx * 0.19, 0.06, 0.33], 0.09));
    s = ssub(0.05, s, ellipsoid([sx * 0.25, 0.56, -0.22], [0.05, 0.25, 0.045]));
  }
  return s;
}

function jawShape(): SDF {
  const jaw = capsule([0, -0.08, 0.08], [0, -0.1, 0.62], 0.11, 0.045);
  const chin = sphere([0, -0.1, 0.64], 0.05);
  let s = smin(0.07, jaw, chin);
  for (const sx of [-1, 1]) {
    s = smin(0.03, s, capsule([sx * 0.08, -0.08, 0.46], [sx * 0.08, 0.1, 0.49], 0.028, 0.004));
    s = smin(0.03, s, capsule([sx * 0.05, -0.09, 0.58], [sx * 0.05, 0.02, 0.59], 0.018, 0.003));
  }
  return s;
}

/** a paw with three claws, in paw space: origin where it touches the ground, z forward */
function pawShape(): SDF {
  let s: SDF = ellipsoid([0, 0.08, 0.04], [0.17, 0.09, 0.26]);
  for (const sx of [-0.1, 0, 0.1]) s = smin(0.03, s, capsule([sx, 0.06, 0.2], [sx * 1.25, 0.01, 0.42], 0.038, 0.005));
  return s;
}

/* ---------------------------------------------------------------- */
/* painting                                                          */
/* ---------------------------------------------------------------- */

type Paint = (x: number, y: number, z: number, nx: number, ny: number, nz: number, ao: number) => RGB;

/**
 * charred stone and ash, a little bone on the spines and the ribs. `maskZ` is where in head space the bleached skull-mask of the
 * face begins (the snout and the jaw are bone, with the nose and the eyes dark); leave it out for everything that is not a face.
 */
const charColor = (offset: V3 = [0, 0, 0], maskZ = Infinity): Paint => (x, y, z, nx, ny, _nz, ao) => {
  const px = x + offset[0];
  const py = y + offset[1];
  const pz = z + offset[2];
  let c = mix(CHAR_A, CHAR_B, fbm(px * 2.2, py * 2.2, pz * 2.2, 3, 5));
  c = mix(c, ASH, smooth(0.66, 0.8, fbm(px * 1.4, py * 1.4, pz * 1.4, 3, 9)) * 0.55);
  if (maskZ < 9) {
    const edge = (fbm(px * 5, py * 5, pz * 5, 2, 17) - 0.5) * 0.16;
    const eyes = smooth(0.2, 0.1, Math.hypot(Math.abs(x) - 0.19, y - 0.06, z - 0.33));
    const nose = smooth(0.74, 0.8, z) * smooth(0.12, 0.05, Math.abs(x));
    const bone = smooth(maskZ - 0.04, maskZ + 0.1, z + edge) * (1 - eyes * 0.9) * (1 - nose * 0.85);
    c = mix(c, scale(MASK, 0.8 + 0.2 * fbm(px * 6, py * 6, pz * 6, 2, 23)), bone);
  }
  // bone where the ribs stand out, and down the spine
  const rib = inRibs(Math.abs(nx) > 0.4 ? 1 : 0, py, pz);
  c = mix(c, BONE, smooth(0.6, 0.95, 0.5 + 0.5 * Math.sin(ribPhase(py, pz))) * rib * 0.5);
  if (py > 2.6 && Math.abs(px) < 0.14) c = mix(c, BONE, 0.7);
  return scale(c, 0.6 + 0.4 * ao + (ny > 0.5 ? 0.12 : 0));
};

/** what glows on the body: a few cracks across the stone, coals between the ribs, a belly like a lantern */
const emberBody = (x: number, y: number, z: number, nx: number, ny: number): RGB => {
  const wx = fbm(x * 1.3, y * 1.3, z * 1.3, 2, 31) * 1.6;
  const crack = smooth(0.945, 0.984, ridge(x * 1.7 + wx, y * 1.7 - wx, z * 1.7 + wx * 0.5, 3, 11)) * 0.85;
  const fine = smooth(0.955, 0.988, ridge(x * 4.2, y * 4.2, z * 4.2, 2, 21)) * 0.22;
  const groove = Math.abs(nx) > 0.4 ? inRibs(1, y, z) * smooth(0.6, 0.98, 0.5 - 0.5 * Math.sin(ribPhase(y, z))) * 0.5 : 0;
  const belly = smooth(-0.35, -0.9, ny) * smooth(1.55, 1.15, y) * 0.4;
  const k = Math.min(1.5, Math.max(crack * 0.95, fine, groove, belly));
  if (k < 0.02) return [0, 0, 0];
  return scale(mix(EMBER, mix(HOT, WHITE, smooth(1.0, 1.5, k)), smooth(0.4, 1.0, k)), k);
};

/** what glows on the head (head space): the ears like candle flames, the sockets, the mouth line, a few cracks */
const emberHead = (x: number, y: number, z: number): RGB => {
  const ear = smooth(0.35, 0.95, y) * smooth(0.1, 0.22, Math.abs(x)) * (1 - smooth(0.0, -0.5, z) * 0.2);
  const socket = smooth(0.15, 0.07, Math.hypot(Math.abs(x) - 0.19, y - 0.06, z - 0.33)) * 0.45;
  const ruff = smooth(0.32, 0.5, Math.abs(x)) * smooth(0.04, -0.12, y) * 0.9;
  const wx = fbm(x * 2, y * 2, z * 2, 2, 7);
  const crack = smooth(0.94, 0.98, ridge(x * 3.2 + wx, y * 3.2, z * 3.2, 3, 5)) * 0.6 * (1 - 0.7 * smooth(0.25, 0.4, z));
  const mouth = smooth(0.05, 0.0, Math.abs(y + 0.15 - 0.3 * Math.max(0, z - 0.2) * 0.1)) * smooth(0.25, 0.7, z) * 0.35;
  const k = Math.min(1.5, Math.max(ear * (0.5 + 0.9 * smooth(0.3, 1.1, y)), socket, crack, mouth, ruff));
  if (k < 0.02) return [0, 0, 0];
  return scale(mix(EMBER, mix(HOT, WHITE, smooth(1.0, 1.5, k)), smooth(0.4, 1.0, k)), k);
};

/** a copy of a mesh, pushed out a hair, with its colours replaced by what glows there (black = nothing) */
function emissiveLayer(g: THREE.BufferGeometry, emit: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => RGB): THREE.BufferGeometry {
  const e = g.clone();
  const pos = e.getAttribute('position') as THREE.BufferAttribute;
  const nrm = e.getAttribute('normal') as THREE.BufferAttribute;
  const col = e.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const c = emit(x, y, z, nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    col.setXYZ(i, c[0], c[1], c[2]);
    pos.setXYZ(i, x + nrm.getX(i) * 0.012, y + nrm.getY(i) * 0.012, z + nrm.getZ(i) * 0.012);
  }
  return e;
}

/* ---------------------------------------------------------------- */
/* the model                                                         */
/* ---------------------------------------------------------------- */

export interface FoxPose {
  /** 0 standing, 1 low to the ground (shoulders down, ready to spring) */
  crouch: number;
  /** -1 paws gathered, 1 paws flung out (a gallop) */
  stride: number;
  /** head raised (1) or lowered (-1) */
  head: number;
  /** mouth open, 0..1 */
  jaw: number;
  /** body pitch, radians (positive lifts the head) */
  pitch: number;
  /** which tail blazes (index into TAILS), or -1 for none */
  active: number;
  /** how far the five tails are fanned out, 0..1 */
  fan: number;
  /** lift off the ground (a leap) */
  lift: number;
  /** the blazing tail swung out sideways, -1..1 (the Ash Sweep) */
  sweep: number;
  /** paws lifted clear of the ground, 0..1 (mid-stride in a gallop) */
  air: number;
  /** the tails streaming straight back, 0..1 (when it runs) */
  trail: number;
}

export const STAND: FoxPose = { crouch: 0, stride: 0, head: 0, jaw: 0.05, pitch: 0, active: 2, fan: 0.7, lift: 0, sweep: 0, air: 0, trail: 0 };

const flameCol = (hue: number, k: number) => {
  const h = rgb(hue);
  return (u: number): RGB => {
    const core = smooth(0.0, 0.3, u);
    const c = mix(scale(WHITE, 0.4), h, core);
    return scale(c, k * Math.pow(Math.max(0, 1 - u), 0.85) * (0.22 + 0.78 * smooth(0.0, 0.22, u)));
  };
};

let poolTex: THREE.CanvasTexture | null = null;

export class CinderfoxModel {
  readonly root = new THREE.Group();
  readonly light = new THREE.PointLight(0xff7a2a, 3.4, 16, 1.5);
  /** a small warm light in front of the face, so the bone of the mask is lit by the fire and not by the sky */
  readonly faceLight = new THREE.PointLight(0xff9040, 1.3, 5.5, 1.5);
  private body = new THREE.Group();
  private head = new THREE.Group();
  private jaw = new THREE.Group();
  private legs: TubeChain[] = [];
  private legGlow: TubeChain[] = [];
  private paws: THREE.Mesh[] = [];
  private neck!: TubeChain;
  private tails: { outer: TubeChain; mid: TubeChain; inner: TubeChain; tongues: TubeChain[]; halo: THREE.Sprite }[] = [];
  private embers: { s: THREE.Sprite; a: number; r: number; h: number; sp: number }[] = [];
  private mouth!: THREE.Mesh;
  private pool!: THREE.Mesh;
  /** where each tail ends, in the fox's own frame (the lure ties its threads to the pink one) */
  readonly tips = TAILS.map(() => new THREE.Vector3());
  private pose = { ...STAND };
  private time = 0;
  ready = false;

  async build(slicer: Slicer) {
    const mat = skin({ vertexColors: true, rim: 0xc4501a, rimPower: 2.8 });
    const addMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const make = (shape: SDF, min: V3, max: V3, cell: number, paint: Paint, emit: ((x: number, y: number, z: number, nx: number, ny: number, nz: number) => RGB) | null) =>
      new Promise<THREE.Group>((resolve) => {
        slicer.add(meshGen(shape, min, max, cell, { color: paint, aoAmount: 0.75 }), (g) => {
          const grp = new THREE.Group();
          grp.add(new THREE.Mesh(g, mat));
          if (emit) grp.add(new THREE.Mesh(emissiveLayer(g, emit), addMat));
          resolve(grp);
        });
      });

    const [bodyG, headG, jawG, pawG] = await Promise.all([
      make(bodyShape(), [-1.3, 0.9, -2.5], [1.3, 3.3, 2.3], 0.045, charColor(), emberBody),
      make(headShape(), [-0.7, -0.7, -0.7], [0.7, 1.3, 1.3], 0.03, charColor([0, 3.02, 2.12], 0.3), emberHead),
      make(jawShape(), [-0.4, -0.45, -0.1], [0.4, 0.2, 1.0], 0.03, charColor([0, 2.8, 2.2], -1), null),
      make(pawShape(), [-0.3, -0.05, -0.3], [0.3, 0.3, 0.6], 0.025, charColor([0, 0, 1]), null),
    ]);
    this.body.add(bodyG);
    this.head.add(headG);
    this.jaw.add(jawG);
    this.head.add(this.jaw);

    // the neck and legs are tubes, so they can bend into any pose
    const dark = skin({ vertexColors: true, rim: 0x8a3512, rimPower: 3 });
    const glowMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const legColour = (u: number): RGB => scale(mix(CHAR_B, mix(CHAR_A, ASH, 0.3), u), 0.85);
    this.neck = new TubeChain(10, 8, dark, (u) => 0.4 - 0.1 * u, (u) => scale(mix(CHAR_B, CHAR_A, u), 0.95));
    this.root.add(this.neck.mesh);
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      // the top of the leg is a rounded cap buried in the shoulder or hip
      const cap = (u: number) => Math.sqrt(Math.min(1, u / 0.07));
      const r = front ? (u: number) => cap(u) * (0.27 - 0.15 * smooth(0, 0.65, u) - 0.01 * u) : (u: number) => cap(u) * (0.33 - 0.21 * smooth(0, 0.5, u) - 0.02 * u);
      const t = new TubeChain(30, 10, dark, r, (u) => legColour(u));
      // the leg glows a little at the knee, and again at the ankle
      const g = new TubeChain(30, 10, glowMat(), (u) => r(u) + 0.012, (u) => {
        const c = 0.34 * smooth(0.07, 0.0, Math.abs(u - 0.46)) + 0.2 * smooth(0.08, 0.0, Math.abs(u - 0.88));
        return c < 0.03 ? [0, 0, 0] : scale(mix(EMBER, HOT, c), c * 0.8);
      });
      this.root.add(t.mesh, g.mesh);
      this.legs.push(t);
      this.legGlow.push(g);
      const paw = new THREE.Mesh((pawG.children[0] as THREE.Mesh).geometry, mat);
      this.root.add(paw);
      this.paws.push(paw);
    }
    this.root.add(this.body);
    this.root.add(this.head);

    // eyes: white-hot slits in dark sockets, angry; the mouth glows when it opens
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glow(0xfff4c8));
      e.scale.set(0.1, 0.03, 0.05);
      e.position.set(sx * 0.19, 0.06, 0.36);
      e.rotation.set(0, sx * 0.25, -sx * 0.55);
      this.head.add(e);
      const h = halo(0xff8a2a, 0.24, 0.8);
      h.position.copy(e.position).add(new THREE.Vector3(0, 0, 0.06));
      this.head.add(h);
    }
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), glow(0xff7a1a));
    this.head.add(this.mouth);

    // the five tails: layers of flame (a wide dim one, a brighter one, a hot core), and little tongues that lick off them
    for (const t of TAILS) {
      const fm = () => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const radius = (r: number) => (u: number) => r * (0.2 + 0.9 * Math.sin(Math.min(1, u * 1.35) * Math.PI * 0.5)) * Math.pow(Math.max(0.02, 1 - u), 0.5);
      const outer = new TubeChain(20, 7, fm(), radius(0.36), (u) => flameCol(t.hue, 0.5)(u));
      const mid = new TubeChain(20, 6, fm(), radius(0.22), (u) => flameCol(t.hue, 0.95)(u));
      const inner = new TubeChain(20, 6, fm(), radius(0.1), (u) => flameCol(t.hue, 1.3)(u));
      const tongues = [0, 1, 2].map(() => new TubeChain(7, 5, fm(), (u) => 0.12 * (1 - u) * (0.6 + 0.4 * Math.sin(u * 3)), (u) => flameCol(t.hue, 0.8)(u)));
      this.root.add(outer.mesh, mid.mesh, inner.mesh, ...tongues.map((x) => x.mesh));
      const hl = halo(t.hue, 1.2, 0.2);
      this.root.add(hl);
      this.tails.push({ outer, mid, inner, tongues, halo: hl });
    }

    // sparks drifting off it
    for (let i = 0; i < 46; i++) {
      const s = halo(i % 3 === 0 ? 0xffe08a : 0xff8a2a, 0.07 + (i % 5) * 0.03, 0.9);
      this.root.add(s);
      this.embers.push({ s, a: (i * 2.399) % 6.283, r: 0.5 + ((i * 37) % 100) / 60, h: ((i * 53) % 100) / 28, sp: 0.2 + ((i * 17) % 10) / 22 });
    }

    // the glow it throws on the ground
    if (!poolTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,150,60,0.9)');
      grd.addColorStop(0.45, 'rgba(255,90,20,0.3)');
      grd.addColorStop(1, 'rgba(255,60,10,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      poolTex = new THREE.CanvasTexture(c);
      poolTex.colorSpace = THREE.SRGBColorSpace;
    }
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.set(0, 0.02, -0.2);
    this.root.add(this.pool);
    this.root.add(this.light, this.faceLight);
    this.ready = true;
    this.apply(STAND);
  }

  /** The light it throws (the glow on the ground, the two lights, the drifting sparks) on or off: off gives a clean silhouette. */
  setLights(on: boolean) {
    this.pool.visible = this.light.visible = this.faceLight.visible = on;
    for (const e of this.embers) e.s.visible = on;
  }

  /** Set the pose, and put every bendy part where it belongs. */
  apply(p: Partial<FoxPose>) {
    Object.assign(this.pose, p);
    const P = this.pose;
    // the body's own movement: it drops when it crouches, tips when it pitches, rises when it leaps
    const drop = K.lift - 0.7 * P.crouch + P.lift;
    const bodyM = new THREE.Matrix4()
      .makeTranslation(0, drop, 0)
      .multiply(new THREE.Matrix4().makeTranslation(0, 1.9, -0.1))
      .multiply(new THREE.Matrix4().makeRotationX(-P.pitch))
      .multiply(new THREE.Matrix4().makeTranslation(0, -1.9, 0.1));
    this.body.matrixAutoUpdate = false;
    this.body.matrix.copy(bodyM);
    const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(bodyM);

    // paws on the ground (or flung out in a gallop); legs by two-bone IK
    const stride = P.stride;
    const targets = [
      new THREE.Vector3(-0.4, P.lift * 0.7 + 1.1 * P.air, 1.0 + 0.8 * stride - 0.15 * P.crouch),
      new THREE.Vector3(0.4, P.lift * 0.7 + 0.8 * P.air, 1.0 + 0.6 * stride - 0.15 * P.crouch),
      new THREE.Vector3(-0.44, P.lift * 0.7 + 0.6 * P.air, -1.2 - 0.8 * stride + 0.2 * P.crouch),
      new THREE.Vector3(0.44, P.lift * 0.7 + 0.9 * P.air, -1.2 - 0.6 * stride + 0.2 * P.crouch),
    ];
    this.legs.forEach((leg, i) => {
      const front = i < 2;
      const sx = i % 2 === 0 ? -1 : 1;
      const S = front ? at(sx * K.shoulder, K.shoulderY, K.shoulderZ) : at(sx * K.hipX, K.hipY, K.hipZ);
      const T = targets[i]!;
      const l1 = front ? 1.25 : 1.2;
      const l2 = front ? 1.2 : 1.3;
      // wrist / hock: a little above and behind the paw
      const W = T.clone().add(new THREE.Vector3(0, front ? 0.26 : 0.55, front ? -0.05 : -0.18));
      const d = new THREE.Vector3().subVectors(W, S);
      const dist = Math.min(d.length(), (l1 + l2) * 0.995);
      const u = d.clone().normalize();
      const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const bend = new THREE.Vector3(0, 0, front ? -1 : 1);
      const n = bend.addScaledVector(u, -bend.dot(u)).normalize();
      const knee = S.clone().addScaledVector(u, a).addScaledVector(n, h);
      const Wp = S.clone().addScaledVector(u, dist);
      const root = S.clone().add(new THREE.Vector3(-sx * 0.1, 0.14, 0));
      const curve = new THREE.CatmullRomCurve3([root, knee, Wp, T.clone().add(new THREE.Vector3(0, 0.07, 0))], false, 'catmullrom', 0.5);
      const pts = curve.getPoints(leg.pts.length - 1);
      for (const ch of [leg, this.legGlow[i]!]) {
        pts.forEach((q, k) => ch.pts[k]!.copy(q));
        ch.update();
      }
      this.paws[i]!.position.copy(T);
      this.paws[i]!.rotation.set(front ? 0 : 0.1, 0, 0);
    });

    // neck and head
    const base = at(K.neck[0], K.neck[1] - 0.12, K.neck[2] - 0.05);
    const headPos = at(K.head[0], K.head[1] + 0.3 * P.head, K.head[2] + 0.05 * P.head);
    const mid = base.clone().lerp(headPos, 0.5).add(new THREE.Vector3(0, 0.1, 0.0));
    const nc = new THREE.CatmullRomCurve3([base, mid, headPos.clone().add(new THREE.Vector3(0, -0.12, -0.18))]);
    nc.getPoints(this.neck.pts.length - 1).forEach((q, k) => this.neck.pts[k]!.copy(q));
    this.neck.update();
    this.head.position.copy(headPos);
    this.head.rotation.set(0.3 - 0.18 * P.head - 0.2 * P.pitch, 0, 0);
    this.jaw.position.set(0, -0.12, 0.15);
    this.jaw.rotation.set(0.75 * P.jaw, 0, 0);
    this.mouth.visible = P.jaw > 0.08;
    this.mouth.scale.set(0.13, 0.02 + 0.09 * P.jaw, 0.32);
    this.mouth.position.set(0, -0.1 - 0.06 * P.jaw, 0.5);

    this.light.position.copy(at(0, 0.7, 0.2));
    this.faceLight.position.copy(headPos).add(new THREE.Vector3(0.5, 0.45, 1.25));
    this.pool.position.set(0, 0.02, -0.2);
    this.tailsAt(this.time);
  }

  /** The tails are laid out in a fan behind the hips; the blazing one is taller and brighter. */
  private tailsAt(t: number) {
    const P = this.pose;
    const root = new THREE.Vector3(K.tail[0], K.tail[1], K.tail[2] - 0.1).applyMatrix4(this.body.matrix);
    const path = (i: number, u: number, out: THREE.Vector3, inner: boolean) => {
      const s = (i - 2) / 2;
      const hot = P.active === i;
      const L = (3.3 + 1.1 * (1 - Math.abs(s))) * (hot ? 1.2 : 0.95);
      const spread = (0.35 + 1.5 * P.fan) * s;
      // a flame never holds still: a slow swing, and a quick lick that grows toward the tip
      const sway = Math.sin(u * 5.5 + i * 1.7 + t * 2.0) * 0.2 * u + Math.sin(u * 12 + t * 4.3 + i * 2.1) * 0.1 * u * u;
      // a swept tail goes out sideways and low, like a scythe
      const swing = hot ? P.sweep : 0;
      const x = s * 0.16 + spread * Math.pow(u, 1.15) * L * 0.42 + sway + swing * Math.pow(u, 1.2) * L * 0.62;
      const y = (0.2 * u + 0.8 * u * u * 0.95 - 0.18 * u * u * u) * L * (1 - 0.16 * Math.abs(s)) * 0.85 * (1 - 0.55 * Math.abs(swing) * u) * (1 - 0.7 * P.trail * u) + (inner ? 0.02 : 0);
      const z = -(0.9 * u - 0.7 * u * u * u) * L * 0.55 - 0.12 * Math.abs(s) * u * L * 0.4 + Math.sin(u * 9 + t * 3.3 + i) * 0.08 * u - P.trail * u * L * 0.62;
      return out.set(root.x + x, root.y + y, root.z + z);
    };
    this.tails.forEach((tl, i) => {
      path(i, 1, this.tips[i]!, false);
      const hot = P.active === i;
      const k = hot ? 1 : P.active >= 0 ? 0.4 : 0.7;
      [tl.outer, tl.mid, tl.inner].forEach((ch, li) => {
        const n = ch.pts.length;
        for (let q = 0; q < n; q++) path(i, q / (n - 1), ch.pts[q]!, li === 2);
        ch.update();
        // the inner layers only matter on the tail that blazes
        (ch.mesh.material as THREE.MeshBasicMaterial).opacity = li === 0 ? k : hot ? 1 : k * 0.7;
      });
      // tongues of fire leaving the tail at three heights
      tl.tongues.forEach((tg, ti) => {
        const u0 = 0.3 + ti * 0.2;
        const a = path(i, u0, new THREE.Vector3(), false);
        const dir = path(i, Math.min(1, u0 + 0.05), new THREE.Vector3(), false).sub(a).normalize();
        const side = (ti % 2 === 0 ? 1 : -1) * (0.5 + 0.3 * Math.sin(t * 3 + i + ti));
        const n = tg.pts.length;
        for (let q = 0; q < n; q++) {
          const w = q / (n - 1);
          tg.pts[q]!.copy(a).addScaledVector(dir, w * 0.7).add(new THREE.Vector3(side * w * 0.55, w * w * 0.5 + w * 0.2, 0));
        }
        tg.update();
        (tg.mesh.material as THREE.MeshBasicMaterial).opacity = hot ? 0.9 : k * 0.6;
      });
      tl.halo.position.set(root.x, root.y + 0.5, root.z - 0.2);
      (tl.halo.material as THREE.SpriteMaterial).opacity = hot ? 0.4 : 0.1;
      tl.halo.scale.setScalar(hot ? 1.5 : 0.8);
    });
  }

  update(dt: number, t: number) {
    this.time = t;
    this.tailsAt(t);
    for (const e of this.embers) {
      const a = e.a + t * e.sp * 0.4;
      const rise = (t * e.sp * 0.6 + e.h) % 4.2;
      e.s.position.set(Math.cos(a) * e.r * (0.7 + rise * 0.12), 0.4 + rise * 0.85, -0.6 + Math.sin(a) * e.r * 1.4 - rise * 0.2);
      (e.s.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - rise / 4.2) * 0.9;
    }
    this.light.intensity = 3.2 + Math.sin(t * 9) * 0.4 + Math.sin(t * 23) * 0.25;
    (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 7) * 0.05;
    void dt;
  }
}

/** One pose for each trick, and the way it hunts: the lab and the reference sheets use these, and the game can blend between them. */
export const POSES: Record<'stand' | 'coil' | 'leap' | 'toll' | 'veil' | 'lure' | 'sweep' | 'stalk', Partial<FoxPose>> = {
  stand: STAND,
  /** about to charge: low, nose down, paws gathered */
  coil: { crouch: 1, stride: -0.7, head: -0.9, jaw: 0.15, pitch: -0.14, active: 2, fan: 1 },
  /** the charge itself: in the air, paws flung out, the tails streaming behind */
  leap: { lift: 0.5, air: 0.9, stride: 1.5, pitch: -0.12, head: -0.2, jaw: 0.55, active: 2, fan: 1, trail: 0.55 },
  /** the toll: reared up, head thrown back, mouth open */
  toll: { crouch: 0, head: 1.2, jaw: 1, pitch: 0.18, active: 0, fan: 1 },
  /** the smoke: head low, breathing out */
  veil: { crouch: 0.35, head: -0.9, jaw: 0.7, pitch: -0.08, active: 1, fan: 0.6 },
  /** the lure: calm, head tilted up, the pink tail beckoning */
  lure: { crouch: 0, head: 0.35, jaw: 0, pitch: 0.05, active: 3, fan: 0.35 },
  /** the sweep: the bone tail swung out like a scythe */
  sweep: { crouch: 0.15, head: -0.2, jaw: 0.25, pitch: -0.05, active: 4, fan: 0.8, sweep: 0.85 },
  /** stalking: head low, no tail blazing */
  stalk: { crouch: 0.1, stride: 0.45, head: -0.5, jaw: 0.05, pitch: -0.06, active: -1, fan: 0.3 },
};
