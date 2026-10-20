import * as THREE from 'three';
import { clamp, lerp, smooth, TAU, unlerp } from '../../core/util';
import { TubeChain } from '../kit/chain';
import { mix, rgb, scale, type RGB } from '../kit/noise';
import type { Slicer } from '../kit/sdf';
import { halo, skin } from '../kit/skin';
import { buildPool, buildTorso, drawerPos, DRAWERS, ZF } from './collector-body';
import {
  PAL,
  SoftPoints,
  colorize,
  glassMaterial,
  labelGeometry,
  labelMaterial,
  lathe,
  liquidMaterial,
  mergeGeos,
  paintEyeGen,
  paintLabelAtlas,
  rnd,
  slitGeometry,
} from './collector-fx';
import {
  Arm,
  JAR_MOUTH_Y,
  JAR_PROFILE,
  LIQUID_Y,
  jarRadius,
  PIN_H,
  PIN_SCALE,
  jarBrassGeometry,
  lidGeometry,
  liquidProfile,
  makeLedger,
  makeStamp,
  paintPlaque,
  pinGeometry,
} from './collector-parts';
import { Cracks, PropPins, PropJar, PropMinions, Shards } from './collector-props';

/**
 * THE COLLECTOR. A tall, gaunt archivist of stitched flesh, brass and paper: a cabinet of drawers for a chest, four long
 * arms with pincers (two hold giant pins, one a ledger, one a stamp), a coat of paper labels, no legs, only a pool of ink,
 * and a huge glass jar for a head with one bloodshot eye floating in murky liquid.
 */

/** He stands lower and a little smaller than his build, so the jar is in the camera's frame. */
export const ROOT_S = 1.1;
export const ROOT_Y = -5.5;
/** How far below the world he starts when he rises. */
const RISE_Y = -26;
/** The head, in his own space: hanging up on his shoulders, or lowered to the far edge of the floor to look. */
const HEAD_UP = new THREE.Vector3(0, 14.2, 0.8);
export const HEAD_LOW = new THREE.Vector3(0, 9.6, 10.9);
const SHOULDERS = [new THREE.Vector3(-3.9, 10.5, -0.2), new THREE.Vector3(3.9, 10.0, -0.2), new THREE.Vector3(-2.9, 7.4, 1.0), new THREE.Vector3(2.9, 7.4, 1.0)];
const IDLE = [new THREE.Vector3(-11.0, 12.6, 3.0), new THREE.Vector3(11.0, 12.0, 3.0), new THREE.Vector3(-8.8, 5.0, 4.4), new THREE.Vector3(9.2, 5.4, 4.2)];
const POLES = [new THREE.Vector3(-0.6, 1.0, -0.5), new THREE.Vector3(0.6, 1.0, -0.5), new THREE.Vector3(-1, -0.8, -0.2), new THREE.Vector3(1, -0.8, -0.2)];
/** The way a held pin points (tip to bead) in his space, while he is just holding it. */
const PIN_UP = [new THREE.Vector3(-0.2, 1, 0.35).normalize(), new THREE.Vector3(0.2, 1, 0.35).normalize()];
/** Where the unscrewed lid is held, in head space. */
const LID_CARRY = new THREE.Vector3(4.9, 5.2, 0.6);
/** The ink tendrils: where they come from on the pool, and where they reach. */
const TENDRILS = 7;
const NERVES = 3;
const COAT_SKIRT = 30;
const COAT_CAPE = 44;
const JARS = 8;
const BUBBLES = 26;

const V = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);

/** Catmull-Rom through control points, written into `out` (no allocation). */
function spline(ctrl: THREE.Vector3[], out: THREE.Vector3[]) {
  const n = ctrl.length;
  const N = out.length;
  for (let i = 0; i < N; i++) {
    const f = (i / (N - 1)) * (n - 1);
    const k = Math.min(n - 2, Math.floor(f));
    const t = f - k;
    const a = ctrl[Math.max(0, k - 1)]!;
    const b = ctrl[k]!;
    const c = ctrl[k + 1]!;
    const d = ctrl[Math.min(n - 1, k + 2)]!;
    const t2 = t * t;
    const t3 = t2 * t;
    const o = out[i]!;
    o.x = 0.5 * (2 * b.x + (-a.x + c.x) * t + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * t2 + (-a.x + 3 * b.x - 3 * c.x + d.x) * t3);
    o.y = 0.5 * (2 * b.y + (-a.y + c.y) * t + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * t2 + (-a.y + 3 * b.y - 3 * c.y + d.y) * t3);
    o.z = 0.5 * (2 * b.z + (-a.z + c.z) * t + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * t2 + (-a.z + 3 * b.z - 3 * c.z + d.z) * t3);
  }
}

/** The pupil: a slit with pointed ends, bent onto the eyeball so it never floats off it. */
class Pupil {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private rows = 13;
  private cols = 5;
  private w = -1;

  constructor(mat: THREE.Material) {
    const { rows, cols } = this;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(rows * cols * 3);
    const idx: number[] = [];
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 1), 1.2);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.set(0.2);
  }

  /** `w` is the half-width of the widest point, in eye radii. */
  set(w: number) {
    if (Math.abs(w - this.w) < 0.004) return;
    this.w = w;
    const { rows, cols, pos } = this;
    const H = 0.46;
    for (let i = 0; i < rows; i++) {
      const t = -1 + (2 * i) / (rows - 1);
      const half = w * (1 - t * t);
      for (let j = 0; j < cols; j++) {
        const s = -1 + (2 * j) / (cols - 1);
        const x = s * half;
        const y = t * H;
        const z = Math.sqrt(Math.max(0, 1 - x * x - y * y)) * 1.006;
        const o = (i * cols + j) * 3;
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = z;
      }
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class CollectorModel {
  readonly root = new THREE.Group();
  readonly chest = new THREE.Group();
  readonly head = new THREE.Group();
  readonly lidG = new THREE.Group();
  readonly eye = new THREE.Group();
  readonly arms: Arm[] = [];
  readonly pins: PropPins;
  readonly jar: PropJar;
  readonly minions: PropMinions;
  private shards: Shards;
  private headCracks: Cracks;
  private shattered = false;
  ready = false;

  /* ---- pose, set by whoever drives him ---- */
  headU = 0;
  lidU = 0;
  eyeOut = 0;
  /** side to side, in jar space, while the eye leans out */
  eyeSway = 0;
  /** 0 = a slit, 1 = a wide black well */
  pupil = 0.2;
  rise = 1;
  /** 0..1: the jar cracks, the liquid pours, the labels fall, the brass goes dark, he sinks */
  death = 0;
  recoil = 0;
  rattle = 0;
  /** how much steam pours out of the mouth, per second */
  steam = 0;
  readonly gaze = new THREE.Vector3(0, 3, 12);
  /** pin in each upper hand: 1 = held */
  readonly pinHeld = [1, 1];
  /** the arms the fight is steering by hand: weight, world-space wrist target, grip, stretch */
  readonly armW = [0, 0, 0, 0];
  readonly armGoal = [V(), V(), V(), V()];
  readonly armGrip = [-1, -1, -1, -1];
  readonly armStretch = [1, 1, 1, 1];
  readonly armPole = [V(), V(), V(), V()];
  readonly armPoleOn = [false, false, false, false];
  readonly armRoll = [NaN, NaN, NaN, NaN];
  /** called the moment a thrown pin leaves a hand: which arm, where (world), which way (world) */
  onRelease: ((arm: number, pos: THREE.Vector3, dir: THREE.Vector3) => void) | null = null;
  /** a throw in progress for each upper arm: seconds since it began (-1 = none) */
  private throwT = [-1, -1];
  private released = [false, false];

  private skinMat: THREE.MeshToonMaterial;
  private limbMat: THREE.MeshToonMaterial;
  private inkMat: THREE.MeshToonMaterial;
  private brassMat: THREE.MeshToonMaterial;
  private mats: THREE.MeshToonMaterial[] = [];
  private torso!: THREE.Mesh;
  private pool!: THREE.Mesh;
  private glassMat: THREE.ShaderMaterial;
  private liqMat: THREE.ShaderMaterial;
  private labelMats: THREE.ShaderMaterial[] = [];
  private eyeMat: THREE.MeshBasicMaterial;
  private pup: Pupil;
  private eyeGlow: THREE.Sprite;
  private backGlow: THREE.Sprite;
  private neck: TubeChain;
  private nerves: TubeChain[] = [];
  private tendrils: { chain: TubeChain; ang: number; len: number; ph: number }[] = [];
  private pinMeshes: THREE.Mesh[] = [];
  private ledger: THREE.Group;
  private stamp: THREE.Group;
  private cuffs: THREE.InstancedMesh;
  private cuffSpec: { arm: number; u: number }[] = [];
  private drawerFlaps!: THREE.InstancedMesh;
  private drawerPulls!: THREE.InstancedMesh;
  private drawerTags!: THREE.InstancedMesh;
  private drawerEyes!: THREE.InstancedMesh;
  private drawerOpen = new Float32Array(DRAWERS);
  private drawerEye = new Float32Array(DRAWERS);
  private drawerHue: RGB[] = [];
  private drawerDirty = true;
  private bubbles: THREE.InstancedMesh;
  private jarsGlass!: THREE.InstancedMesh;
  private jarsLid!: THREE.InstancedMesh;
  private jarsPet!: THREE.InstancedMesh;
  private jarSpec: { x: number; y: number; z: number; ph: number; ang: number }[] = [];
  private steamFx: SoftPoints;
  private inkFx: SoftPoints;
  private lidMesh: THREE.Mesh;
  private flashT = 0;
  private time = 0;
  private steamAcc = 0;
  private dummy = new THREE.Object3D();
  private ctrl = [V(), V(), V(), V(), V(), V()];
  private samp: THREE.Vector3[][] = [];
  private tmpA = V();
  private tmpB = V();
  private tmpC = V();
  private tmpQ = new THREE.Quaternion();
  private headPosRoot = V();
  private wobble = 0;

  constructor(
    private world: THREE.Group,
    private bossZ: number,
  ) {
    this.root.position.set(0, ROOT_Y, bossZ);
    this.root.scale.setScalar(ROOT_S);
    this.skinMat = skin({ vertexColors: true, rim: 0xc88848, rimPower: 3.0, steps: 4 });
    this.limbMat = skin({ vertexColors: true, rim: 0x7a5a30, rimPower: 4.2, steps: 4 });
    this.inkMat = skin({ vertexColors: true, rim: 0x9a7a3a, rimPower: 2.4, steps: 3 });
    this.brassMat = skin({ vertexColors: true, rim: 0xffe4a0, rimPower: 2.4, steps: 4 });
    this.mats.push(this.skinMat, this.limbMat, this.inkMat, this.brassMat);

    const tag = paintLabelAtlas();
    const plaque = paintPlaque();

    /* ---------------- the head ---------------- */
    this.head.position.copy(HEAD_UP);
    this.root.add(this.head);
    this.backGlow = halo(0xffa040, 15, 0.3);
    this.backGlow.position.set(0, 0.6, -2.4);
    this.backGlow.renderOrder = 4;
    this.head.add(this.backGlow);
    this.glassMat = glassMaterial({ tint: 0x1a3a40, rim: 0xa8f0ff, alpha: 0.06 });
    const glass = new THREE.Mesh(lathe(JAR_PROFILE, 44), this.glassMat);
    glass.renderOrder = 12;
    this.head.add(glass);
    this.liqMat = liquidMaterial(-3.6, LIQUID_Y);
    const liquid = new THREE.Mesh(lathe(liquidProfile(), 36), this.liqMat);
    liquid.renderOrder = 10;
    this.head.add(liquid);
    this.head.add(new THREE.Mesh(jarBrassGeometry(), this.brassMat));
    this.lidMesh = new THREE.Mesh(lidGeometry(), this.brassMat);
    this.lidG.add(this.lidMesh);
    this.lidG.position.set(0, JAR_MOUTH_Y - 0.12, 0);
    this.head.add(this.lidG);
    // the label on the glass that says what is in the jar
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.85, 14, 1, true, -0.42, 0.84), new THREE.MeshBasicMaterial({ map: plaque, color: 0xe0d6c0, side: THREE.DoubleSide }));
    pl.position.y = -2.0;
    pl.renderOrder = 6;
    this.head.add(pl);
    // the eye
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8c090 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), this.eyeMat);
    this.eye.add(ball);
    this.pup = new Pupil(new THREE.MeshBasicMaterial({ color: 0x08030a }));
    this.eye.add(this.pup.mesh);
    const hl = halo(0xffffff, 0.5, 0.95);
    hl.position.set(-0.4, 0.42, 0.9);
    hl.renderOrder = 8;
    this.eye.add(hl);
    this.eyeGlow = halo(0xff3a1a, 3.4, 0.4);
    this.eyeGlow.position.set(0, 0, 0.2);
    this.eyeGlow.renderOrder = 7;
    this.eye.add(this.eyeGlow);
    this.eye.scale.setScalar(1.62);
    this.eye.position.set(0, 0.4, 0.1);
    this.head.add(this.eye);
    // bubbles
    this.bubbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), BUBBLES);
    this.bubbles.frustumCulled = false;
    this.bubbles.renderOrder = 11;
    this.head.add(this.bubbles);

    /* ---------------- the neck, and the nerves that run from the eye down through it ---------------- */
    this.neck = new TubeChain(
      18,
      8,
      this.skinMat,
      (u) => 0.78 - 0.18 * Math.sin(u * Math.PI),
      (u, a) => {
        const band = Math.abs(((u * 7) % 1) - 0.5) > 0.42;
        if (band) return mix(PAL.brassDark, PAL.brass, 0.5 + 0.4 * Math.sin(a));
        let c = mix(PAL.sinew, PAL.flesh, 0.5 + 0.4 * Math.sin(a * 2 + u * 8));
        if (Math.abs(a - Math.PI / 2) < 0.1) c = mix(c, rgb(0x1a0e0a), 0.8);
        return c;
      },
    );
    this.root.add(this.neck.mesh);
    const nerveMat = skin({ vertexColors: true, rim: 0xff8a8a, rimPower: 2 });
    for (let i = 0; i < NERVES; i++) {
      const ch = new TubeChain(20, 5, nerveMat, (u) => 0.1 + 0.04 * Math.sin(u * 9 + i), (u, a) => mix(rgb(0xc0283a), rgb(0xffa8b0), 0.4 + 0.4 * Math.sin(a + u * 12 + i)));
      this.nerves.push(ch);
      this.root.add(ch.mesh);
    }
    this.samp = [Array.from({ length: 18 }, V), Array.from({ length: 20 }, V)];

    /* ---------------- arms ---------------- */
    const lens: [number, number][] = [
      [6.2, 6.8],
      [6.2, 6.8],
      [5.4, 5.8],
      [5.4, 5.8],
    ];
    for (let i = 0; i < 4; i++) {
      const a = new Arm(lens[i]![0], lens[i]![1], this.limbMat, i * 1.9);
      a.shoulder.copy(SHOULDERS[i]!);
      a.pole.copy(POLES[i]!);
      a.target.copy(IDLE[i]!);
      this.arms.push(a);
      this.root.add(a.chain.mesh, a.hand);
    }
    // the two upper hands hold giant pins, point first
    const pinGeo = pinGeometry();
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(pinGeo, this.brassMat);
      p.scale.setScalar(PIN_SCALE / 1.55);
      this.arms[i]!.hand.add(p);
      this.pinMeshes.push(p);
    }
    // the lower hands: a ledger and a stamp
    this.ledger = makeLedger();
    this.root.add(this.ledger);
    this.stamp = makeStamp();
    this.stamp.position.set(0, 0, 0.6);
    this.stamp.scale.setScalar(1 / 1.3);
    this.arms[3]!.hand.add(this.stamp);
    // brass cuffs on every arm (one draw call)
    for (let i = 0; i < 4; i++) for (const u of [0.06, 0.48, 0.55, 0.92]) this.cuffSpec.push({ arm: i, u });
    this.cuffs = new THREE.InstancedMesh(colorize(new THREE.TorusGeometry(0.46, 0.13, 6, 12), PAL.brass), this.brassMat, this.cuffSpec.length);
    this.cuffs.frustumCulled = false;
    this.root.add(this.cuffs);

    /* ---------------- the cabinet of drawers ---------------- */
    this.root.add(this.chest);
    this.buildDrawers();

    /* ---------------- the coat of labels ---------------- */
    this.buildCoat(tag);

    /* ---------------- jars of small captured things on his belt ---------------- */
    this.buildBeltJars();

    /* ---------------- ink tendrils crawling out of the pool ---------------- */
    for (let i = 0; i < TENDRILS; i++) {
      const ch = new TubeChain(14, 6, this.inkMat, (u) => 0.9 * Math.pow(1 - u, 0.7) + 0.06, (u, a) => mix(PAL.ink, PAL.inkSheen, 0.3 + 0.4 * Math.sin(a * 2 + u * 6)));
      const ang = ((i - (TENDRILS - 1) / 2) / ((TENDRILS - 1) / 2)) * 1.25;
      this.tendrils.push({ chain: ch, ang, len: 5 + rnd(i, 3) * 4, ph: i * 1.3 });
      this.root.add(ch.mesh);
    }

    /* ---------------- steam, and ink that drips ---------------- */
    this.steamFx = new SoftPoints(70, false, 0.5);
    this.inkFx = new SoftPoints(40, false, -9);
    this.root.add(this.steamFx.points, this.inkFx.points);

    /* ---------------- things he can throw, drop and send ---------------- */
    this.pins = new PropPins(world, tag);
    this.jar = new PropJar(world);
    this.minions = new PropMinions(world);
    this.shards = new Shards(world, 90);
    this.headCracks = new Cracks(jarRadius, -3.2, 4.0, 23, 0.35);
    this.head.add(this.headCracks.mesh);

    world.add(this.root);
    this.root.visible = false;
  }

  /* ---------------------------------------------------------------- */
  /* building                                                          */
  /* ---------------------------------------------------------------- */

  private buildDrawers() {
    // a drawer is a flap that hinges open at its bottom edge, so you see into the dark behind it from the front
    const W = 1.02;
    const Hh = 0.82;
    const face = colorize(new THREE.BoxGeometry(W, Hh, 0.16), PAL.leather);
    face.translate(0, Hh / 2, -0.08);
    const panel = colorize(new THREE.BoxGeometry(W - 0.2, Hh - 0.2, 0.08), mix(PAL.leather, PAL.leatherLight, 0.5));
    panel.translate(0, Hh / 2, 0.04);
    const flapGeo = mergeGeos([face, panel]);
    this.drawerFlaps = new THREE.InstancedMesh(flapGeo, this.limbMat, DRAWERS);
    const pull = colorize(new THREE.TorusGeometry(0.12, 0.04, 5, 10), PAL.brassLight);
    pull.translate(0, Hh * 0.38, 0.12);
    this.drawerPulls = new THREE.InstancedMesh(pull, this.brassMat, DRAWERS);
    const tag = new THREE.PlaneGeometry(0.62, 0.22);
    tag.translate(0, Hh * 0.66, 0.095);
    this.drawerTags = new THREE.InstancedMesh(tag, new THREE.MeshBasicMaterial({ map: paintPlaque(), color: 0xc8bfa8 }), DRAWERS);
    const eg = new THREE.SphereGeometry(0.11, 7, 5);
    this.drawerEyes = new THREE.InstancedMesh(eg, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), DRAWERS * 2);
    for (const m of [this.drawerFlaps, this.drawerPulls, this.drawerTags, this.drawerEyes]) {
      m.frustumCulled = false;
      this.chest.add(m);
    }
    const c = new THREE.Color();
    for (let i = 0; i < DRAWERS; i++) {
      this.drawerFlaps.setColorAt(i, c.setScalar(0.8 + 0.4 * rnd(i, 5)));
      const k = i % 3;
      this.drawerHue.push(k === 0 ? [0.4, 0.95, 1] : k === 1 ? [1, 0.5, 0.65] : [1, 0.9, 0.5]);
    }
    this.drawerFlaps.instanceColor!.needsUpdate = true;
    this.layoutDrawers();
  }

  private layoutDrawers() {
    const d = this.dummy;
    const col = new THREE.Color();
    for (let i = 0; i < DRAWERS; i++) {
      const [x, y, z] = drawerPos(i);
      const open = this.drawerOpen[i]!;
      d.position.set(x, y - 0.41, z + 0.03);
      d.rotation.set(open * 1.45, 0, 0);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      this.drawerFlaps.setMatrixAt(i, d.matrix);
      this.drawerPulls.setMatrixAt(i, d.matrix);
      this.drawerTags.setMatrixAt(i, d.matrix);
      // two eyes in the dark behind the drawer
      const e = this.drawerEye[i]!;
      for (let k = 0; k < 2; k++) {
        d.position.set(x + (k - 0.5) * 0.4, y + 0.02, z - 0.28);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(Math.max(0.001, e));
        d.updateMatrix();
        this.drawerEyes.setMatrixAt(i * 2 + k, d.matrix);
        const h = this.drawerHue[i]!;
        this.drawerEyes.setColorAt(i * 2 + k, col.setRGB(h[0], h[1], h[2]));
      }
    }
    this.drawerFlaps.instanceMatrix.needsUpdate = true;
    this.drawerPulls.instanceMatrix.needsUpdate = true;
    this.drawerTags.instanceMatrix.needsUpdate = true;
    this.drawerEyes.instanceMatrix.needsUpdate = true;
    if (this.drawerEyes.instanceColor) this.drawerEyes.instanceColor.needsUpdate = true;
    this.drawerDirty = false;
  }

  /** Open drawer i (0..1) and light the eyes of whatever is inside (0..1). */
  setDrawer(i: number, open: number, eyes = open) {
    if (this.drawerOpen[i] === open && this.drawerEye[i] === eyes) return;
    this.drawerOpen[i] = open;
    this.drawerEye[i] = eyes;
    this.drawerDirty = true;
  }

  /** Where drawer i is, in world space. */
  drawerWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    const [x, y, z] = drawerPos(i);
    out.set(x, y, z + 0.4).multiplyScalar(ROOT_S);
    out.x += this.root.position.x;
    out.y += this.root.position.y;
    out.z += this.root.position.z;
    return out;
  }

  private buildCoat(tag: THREE.Texture) {
    const total = COAT_SKIRT + COAT_CAPE;
    const geo = labelGeometry(1.0, 1.6);
    const tiles = new Float32Array(total);
    for (let i = 0; i < total; i++) tiles[i] = Math.floor(rnd(i, 17) * 4);
    geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 1));
    const mat = labelMaterial(tag, 1.0, 0.95);
    this.labelMats.push(mat);
    const m = new THREE.InstancedMesh(geo, mat, total);
    m.frustumCulled = false;
    const d = this.dummy;
    const c = new THREE.Color();
    const paper = [new THREE.Color(0xf4ead0), new THREE.Color(0xe4d4a8), new THREE.Color(0xd2c8b0), new THREE.Color(0xc9b890)];
    for (let i = 0; i < COAT_SKIRT; i++) {
      // hanging from his belt, flaring out toward the ink
      const phi = ((i + 0.5) / COAT_SKIRT - 0.5) * 5.4 + (rnd(i, 1) - 0.5) * 0.12;
      const row = i % 2;
      d.position.set(Math.sin(phi) * (3.0 + row * 0.22), 3.05 - row * 0.15, 0.05 + Math.cos(phi) * (2.2 + row * 0.2));
      d.rotation.set(-0.16 - row * 0.05, phi, (rnd(i, 2) - 0.5) * 0.12, 'YXZ');
      const L = 2.4 + rnd(i, 3) * 1.2;
      d.scale.set(1.2 + rnd(i, 4) * 0.3, L / 1.6, 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.copy(paper[Math.floor(rnd(i, 5) * 4)]!).multiplyScalar(0.85 + 0.2 * rnd(i, 6)));
    }
    for (let i = 0; i < COAT_CAPE; i++) {
      // a cape of long tags from the shoulders and the upper back, fanned out to either side like ragged paper wings
      const side = i % 2 ? 1 : -1;
      const n = COAT_CAPE / 2;
      const k = Math.floor(i / 2) / (n - 1);
      const x = side * (2.5 + k * 3.9 + rnd(i, 7) * 0.5);
      const y = 10.5 - k * 1.9 + (rnd(i, 8) - 0.5) * 0.4;
      const z = -1.0 - rnd(i, 9) * 0.9 - (1 - k) * 0.5;
      d.position.set(x, y, z);
      d.rotation.set(-0.06 - rnd(i, 13) * 0.2, side * (0.2 + k * 0.5), side * (0.1 + 0.5 * k + (rnd(i, 14) - 0.5) * 0.2), 'YXZ');
      const L = 5.0 + 3.4 * Math.sin(Math.PI * (0.12 + 0.72 * k)) + rnd(i, 10) * 1.6;
      d.scale.set(1.5, L / 1.6, 1);
      d.updateMatrix();
      m.setMatrixAt(COAT_SKIRT + i, d.matrix);
      m.setColorAt(COAT_SKIRT + i, c.copy(paper[Math.floor(rnd(i, 11) * 4)]!).multiplyScalar(0.8 + 0.2 * rnd(i, 12)));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.root.add(m);
  }

  private buildBeltJars() {
    const glass = lathe(
      [
        [0.001, -0.55],
        [0.34, -0.54],
        [0.5, -0.38],
        [0.52, 0.2],
        [0.42, 0.45],
        [0.34, 0.56],
      ],
      14,
    );
    const gm = glassMaterial({ tint: 0x162a30, rim: 0x9fe8ff, alpha: 0.1, glint: 0.7 });
    this.jarsGlass = new THREE.InstancedMesh(glass, gm, JARS);
    this.jarsGlass.renderOrder = 13;
    const lid = colorize(new THREE.CylinderGeometry(0.36, 0.4, 0.2, 8), PAL.brass);
    lid.translate(0, 0.62, 0);
    this.jarsLid = new THREE.InstancedMesh(lid, this.brassMat, JARS);
    // the little captured creature: a dark body and two bright eyes
    const body = colorize(new THREE.SphereGeometry(0.26, 7, 5), rgb(0x2a2030));
    body.translate(0, -0.18, 0);
    const e1 = colorize(new THREE.SphereGeometry(0.07, 5, 4), [1, 1, 1]);
    e1.translate(-0.1, -0.1, 0.2);
    const e2 = colorize(new THREE.SphereGeometry(0.07, 5, 4), [1, 1, 1]);
    e2.translate(0.1, -0.1, 0.2);
    this.jarsPet = new THREE.InstancedMesh(mergeGeos([body, e1, e2]), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), JARS);
    const hues = [0x6ff0ff, 0xff8aa8, 0xffe9a0, 0xb9b0f0];
    const c = new THREE.Color();
    for (let i = 0; i < JARS; i++) {
      const phi = ((i + 0.5) / JARS - 0.5) * 3.8;
      this.jarSpec.push({ x: Math.sin(phi) * 3.05, y: 2.15 + (i % 2) * 0.4, z: 0.1 + Math.cos(phi) * 2.28, ph: i * 1.7, ang: phi });
      this.jarsPet.setColorAt(i, c.setHex(hues[i % 4]!));
    }
    for (const m of [this.jarsGlass, this.jarsLid, this.jarsPet]) {
      m.frustumCulled = false;
      this.root.add(m);
    }
    this.jarsPet.instanceColor!.needsUpdate = true;
  }

  /** Queue the heavy meshes; they appear as they finish. */
  build(slicer: Slicer): Promise<void> {
    const jobs: Promise<void>[] = [];
    const job = <T>(gen: Generator<void, T, void>, done: (v: T) => void) => jobs.push(new Promise<void>((res) => slicer.add(gen, (v) => (done(v), res()))));
    job(buildTorso(), (g) => {
      this.torso = new THREE.Mesh(g, this.skinMat);
      this.chest.add(this.torso);
    });
    job(buildPool(), (g) => {
      this.pool = new THREE.Mesh(g, this.inkMat);
      this.root.add(this.pool);
    });
    job(paintEyeGen(), (tex) => {
      this.eyeMat.map = tex;
      this.eyeMat.color.setHex(0xffffff);
      this.eyeMat.needsUpdate = true;
    });
    jobs.push(this.minions.build(slicer));
    return Promise.all(jobs).then(() => {
      this.ready = true;
      this.update(0, 0);
    });
  }

  /* ---------------------------------------------------------------- */
  /* control                                                           */
  /* ---------------------------------------------------------------- */

  flash(v: number) {
    this.flashT = v;
  }

  /** Throw a pin from the upper arm `i` (0 or 1). `onRelease` fires at the moment it leaves the hand. */
  throwPin(i: number) {
    if (this.throwT[i]! >= 0) return false;
    this.throwT[i] = 0;
    this.released[i] = false;
    return true;
  }

  get throwing(): boolean {
    return this.throwT[0]! >= 0 || this.throwT[1]! >= 0;
  }

  /** Steer an arm by hand: it goes to the world point (w = 1) or back to its own idling (w = 0). */
  steerArm(i: number, x: number, y: number, z: number, w: number, grip = -1, stretch = 1, px = 0, py = 0, pz = 0, roll = NaN) {
    this.armGoal[i]!.set(x, y, z);
    this.armW[i] = w;
    this.armGrip[i] = grip;
    this.armStretch[i] = stretch;
    this.armPoleOn[i] = px !== 0 || py !== 0 || pz !== 0;
    if (this.armPoleOn[i]) this.armPole[i]!.set(px, py, pz);
    this.armRoll[i] = roll;
  }

  /** Is upper arm `i` in the middle of a throw? */
  isThrowing(i: number): boolean {
    return this.throwT[i]! >= 0;
  }

  /** Let all arms go back to idling. */
  releaseArms() {
    for (let i = 0; i < 4; i++) {
      this.armW[i] = 0;
      this.armGrip[i] = -1;
      this.armStretch[i] = 1;
      this.armPoleOn[i] = false;
      this.armRoll[i] = NaN;
    }
  }

  /** Make the eyes look at a world point. */
  lookAt(x: number, y: number, z: number) {
    this.gaze.set(x, y, z);
  }

  /** The jar's mouth in world space (where the steam comes from). */
  mouthWorld(out: THREE.Vector3): THREE.Vector3 {
    this.head.updateMatrix();
    out.set(0, JAR_MOUTH_Y, 0).applyMatrix4(this.head.matrix);
    return this.rootToWorld(out);
  }

  /** The eye's centre in world space (the weak point). */
  eyeWorld(out: THREE.Vector3): THREE.Vector3 {
    this.head.updateMatrix();
    out.copy(this.eye.position).applyMatrix4(this.head.matrix);
    return this.rootToWorld(out);
  }

  /** The head's lid's centre in world space. */
  lidWorld(out: THREE.Vector3): THREE.Vector3 {
    this.head.updateMatrix();
    out.copy(this.lidG.position).applyMatrix4(this.head.matrix);
    return this.rootToWorld(out);
  }

  /** Where a hand is, in world space. */
  handWorld(i: number, out: THREE.Vector3): THREE.Vector3 {
    return this.rootToWorld(out.copy(this.arms[i]!.target));
  }

  rootToWorld(v: THREE.Vector3): THREE.Vector3 {
    v.multiplyScalar(this.root.scale.x);
    v.add(this.root.position);
    return v;
  }

  worldToRoot(v: THREE.Vector3): THREE.Vector3 {
    v.sub(this.root.position);
    v.multiplyScalar(1 / this.root.scale.x);
    return v;
  }

  /** The glass of the head goes everywhere (death). */
  shatterHead() {
    if (this.shattered) return;
    this.shattered = true;
    this.head.updateMatrix();
    this.tmpA.set(0, 0, 0).applyMatrix4(this.head.matrix);
    this.rootToWorld(this.tmpA);
    this.shards.burst(this.tmpA.x, this.tmpA.y, this.tmpA.z, 90, 2.4, 6, 8);
    this.splash(24, 1.2);
  }

  /** Burst of steam and bubbles from the mouth. */
  puff(n: number, power = 1) {
    this.tmpA.set(0, JAR_MOUTH_Y, 0);
    this.head.updateMatrix();
    this.tmpA.applyMatrix4(this.head.matrix);
    const axis = this.tmpB.copy(UP).applyQuaternion(this.head.quaternion);
    for (let i = 0; i < n; i++) {
      const sp = (1.5 + Math.random() * 3.5) * power;
      this.steamFx.emit(
        this.tmpA.x + (Math.random() - 0.5) * 1.6,
        this.tmpA.y + (Math.random() - 0.5) * 1.0,
        this.tmpA.z + (Math.random() - 0.5) * 1.6,
        axis.x * sp + (Math.random() - 0.5) * 2,
        axis.y * sp + 1 + Math.random() * 1.5,
        axis.z * sp + (Math.random() - 0.5) * 2,
        1.2 + Math.random() * 1.2,
        1.1 + Math.random() * 1.1,
        2.2,
        [0.78, 0.7, 0.55],
        0.16,
        0.9,
      );
    }
  }

  /** Droplets of amber that fly out of the jar. */
  splash(n: number, power = 1) {
    this.tmpA.set(0, JAR_MOUTH_Y, 0);
    this.head.updateMatrix();
    this.tmpA.applyMatrix4(this.head.matrix);
    const axis = this.tmpB.copy(UP).applyQuaternion(this.head.quaternion);
    for (let i = 0; i < n; i++) {
      const sp = (3 + Math.random() * 6) * power;
      this.inkFx.emit(this.tmpA.x, this.tmpA.y, this.tmpA.z, axis.x * sp + (Math.random() - 0.5) * 5, axis.y * sp + Math.random() * 4, axis.z * sp + (Math.random() - 0.5) * 5, 0.9 + Math.random() * 0.7, 0.45 + Math.random() * 0.4, 0.2, [1, 0.62, 0.18], 0.9, 0.2);
    }
  }

  /** Ink that falls out of him (death). */
  drip(n: number, x: number, y: number, z: number, spread = 3) {
    for (let i = 0; i < n; i++) this.inkFx.emit(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 2, -Math.random() * 3, (Math.random() - 0.5) * 2, 1 + Math.random(), 0.5 + Math.random() * 0.5, 0.3, [0.05, 0.03, 0.08], 0.9, 0.1);
  }

  /* ---------------------------------------------------------------- */
  /* animation                                                         */
  /* ---------------------------------------------------------------- */

  update(dt: number, t: number) {
    this.time = t;
    if (!this.ready) return;
    for (const m of this.labelMats) {
      m.uniforms['uTime']!.value = t;
      m.uniforms['uFall']!.value = Math.max(0, (this.death - 0.32) / 0.5) * 9;
      m.uniforms['uFade']!.value = 1 - clamp((this.death - 0.7) / 0.25, 0, 1);
    }
    this.liqMat.uniforms['uTime']!.value = t;
    // root: where he stands
    const rs = smooth(this.rise);
    const sink = smooth(unlerp(0.62, 1, this.death));
    this.root.position.y = lerp(RISE_Y, ROOT_Y, rs) - sink * 17;
    this.root.position.z = this.bossZ - this.recoil * 1.4;
    this.root.scale.set(ROOT_S, ROOT_S * (1 - sink * 0.15), ROOT_S);
    this.root.rotation.z = Math.sin(t * 0.5) * 0.012 + this.rattle * Math.sin(t * 61) * 0.01;
    // breathing: slow, patient
    const br = Math.sin(t * 0.8);
    this.chest.scale.set(1 + br * 0.01, 1 + br * 0.008, 1 + br * 0.012);
    this.layoutHead(t);
    this.root.updateMatrixWorld(true);
    this.layoutEye(t, dt);
    this.layoutArms(t, dt);
    this.layoutNeck(t);
    this.layoutExtras(t, dt);
    if (this.drawerDirty) this.layoutDrawers();
    // steam
    if (this.steam > 0) {
      this.steamAcc += dt * this.steam;
      const n = Math.floor(this.steamAcc);
      if (n > 0) {
        this.steamAcc -= n;
        this.puff(n, 0.5);
      }
    }
    this.steamFx.update(dt);
    this.inkFx.update(dt);
    this.pins.update(dt, t);
    this.jar.update(dt);
    this.shards.update(dt);
    // damage flash and the colour of death
    this.flashT = Math.max(0, this.flashT - dt * 5);
    const dark = smooth(unlerp(0.35, 0.8, this.death));
    for (const m of this.mats) {
      m.emissive.setRGB(this.flashT, this.flashT * 0.9, this.flashT * 0.8);
      m.color.setScalar(1 - dark * 0.88);
    }
    this.glassMat.uniforms['uGlint']!.value = 1 + this.flashT * 2;
    const pl = this.pool;
    if (pl) pl.scale.set(1 + sink * 0.25, 1, 1 + sink * 0.25);
  }

  private layoutHead(t: number) {
    const h = this.head;
    const u = this.headU;
    const arc = Math.sin(Math.PI * u) * 1.4;
    h.position.set(lerp(HEAD_UP.x, HEAD_LOW.x, u), lerp(HEAD_UP.y, HEAD_LOW.y, u) + arc + Math.sin(t * 0.9) * 0.07 * (1 - u), lerp(HEAD_UP.z, HEAD_LOW.z, u));
    h.rotation.set(lerp(0.1, 1.28, u) + Math.sin(t * 0.7) * 0.025, Math.sin(t * 0.43 + 1) * 0.06 * (1 - u * 0.5), Math.sin(t * 0.6) * 0.035 * (1 - u));
    // a hit makes the jar ring in its cradle
    if (this.rattle > 0) {
      h.position.x += Math.sin(t * 73) * 0.12 * this.rattle;
      h.position.y += Math.sin(t * 91) * 0.1 * this.rattle;
      h.rotation.z += Math.sin(t * 67) * 0.05 * this.rattle;
    }
    // the dying jar sags to one side and drops
    if (this.death > 0) {
      const d = smooth(unlerp(0.1, 1, this.death));
      h.position.y -= d * 3.0;
      h.rotation.z += d * 0.5;
      h.rotation.x += d * 0.4;
    }
    h.updateMatrix();
    // the lid
    const lu = this.lidU;
    const unscrew = smooth(unlerp(0, 0.42, lu));
    const carry = smooth(unlerp(0.42, 1, lu));
    const lidY = JAR_MOUTH_Y - 0.12;
    this.lidG.position.set(lerp(0, LID_CARRY.x, carry), lerp(lidY + 1.45 * unscrew, LID_CARRY.y, carry), lerp(0, LID_CARRY.z, carry));
    this.lidG.rotation.set(0.3 * carry, unscrew * TAU * 3 + carry * 1.2, -0.9 * carry);
  }

  private layoutEye(t: number, dt: number) {
    const e = this.eye;
    const out = smooth(this.eyeOut);
    const bob = Math.sin(t * 1.1) * 0.12 + Math.sin(t * 2.3) * 0.04;
    const dead = smooth(unlerp(0.2, 0.7, this.death));
    e.position.set(Math.sin(t * 0.7) * 0.18 * (1 - out) + out * this.eyeSway, lerp(0.4, 5.6, out) + bob * (1 - out * 0.5) - dead * 2.4, lerp(0.1, 0.35, out) + Math.cos(t * 0.6) * 0.1 * (1 - out));
    // it looks at the world point, but never turns its back on the front of the jar
    e.lookAt(this.gaze);
    if (this.death > 0.3) {
      // it rolls up and goes dull
      const k = smooth(unlerp(0.3, 0.8, this.death));
      e.rotateX(-k * 1.2);
      e.rotateZ(k * 0.7);
    }
    const w = lerp(0.085, 0.4, this.pupil) * (1 - 0.6 * smooth(unlerp(0.4, 0.85, this.death)));
    this.pup.set(w + Math.sin(t * 9) * 0.004);
    const dull = 1 - smooth(unlerp(0.35, 0.85, this.death)) * 0.85;
    this.eyeGlow.material.opacity = (0.3 + 0.12 * out + 0.1 * Math.sin(t * 3) + this.flashT * 0.3) * dull;
    this.backGlow.material.opacity = (0.26 + 0.06 * Math.sin(t * 1.7) + this.flashT * 0.3) * (1 - smooth(unlerp(0.3, 0.8, this.death)));
    this.eyeMat.color.setScalar(dull + this.flashT * 0.3);
    // the liquid drains when the jar breaks
    const drain = smooth(unlerp(0.28, 0.72, this.death));
    this.liqMat.uniforms['uFade']!.value = 1 - drain;
    this.glassMat.uniforms['uFade']!.value = this.shattered ? 0 : 1 - smooth(unlerp(0.3, 0.42, this.death));
    this.headCracks.setLevel(this.shattered ? 0 : clamp(this.death / 0.3, 0, 1) * 3);
    if (this.death <= 0 && this.shattered) this.shattered = false;
    void dt;
  }

  private layoutArms(t: number, dt: number) {
    const rs = smooth(unlerp(0.45, 0.95, this.rise));
    const dying = smooth(unlerp(0.1, 0.7, this.death));
    // thrown pins
    for (let i = 0; i < 2; i++) {
      if (this.throwT[i]! >= 0) {
        this.throwT[i]! += dt;
        const tt = this.throwT[i]!;
        if (tt >= 0.3 && !this.released[i]) {
          this.released[i] = true;
          if (this.onRelease) {
            const a = this.arms[i]!;
            this.tmpA.copy(a.target).addScaledVector(a.fwd, 1.0);
            this.rootToWorld(this.tmpA);
            this.tmpB.copy(a.fwd);
            this.onRelease(i, this.tmpA, this.tmpB);
          }
          this.pinHeld[i] = 0;
        }
        if (tt >= 1.0) this.throwT[i] = -1;
      }
      // a new pin slides out of his sleeve
      if (this.throwT[i]! < 0 || this.throwT[i]! > 0.75) this.pinHeld[i] = Math.min(1, this.pinHeld[i]! + dt * 2.6);
    }
    for (let i = 0; i < 4; i++) {
      const a = this.arms[i]!;
      const ph = i * 1.9;
      const idle = this.tmpC.copy(IDLE[i]!);
      idle.x += Math.sin(t * 0.8 + ph) * 0.25;
      idle.y += Math.sin(t * 1.1 + ph) * 0.3;
      idle.z += Math.cos(t * 0.7 + ph) * 0.2;
      let grip = i < 2 ? 0.85 : 0.75;
      if (i === 2) {
        // writing
        idle.x += Math.sin(t * 6.1) * 0.06;
        idle.y += Math.sin(t * 7.3) * 0.05;
      }
      // the throw
      if (i < 2 && this.throwT[i]! >= 0) {
        const tt = this.throwT[i]!;
        const s = i === 0 ? -1 : 1;
        if (tt < 0.22) {
          const k = smooth(tt / 0.22);
          idle.x += s * 2.2 * k;
          idle.y += 3.6 * k;
          idle.z += -4.2 * k;
          grip = 0.95;
        } else if (tt < 0.32) {
          const k = (tt - 0.22) / 0.1;
          idle.x += s * lerp(2.2, -1.5, k);
          idle.y += lerp(3.6, 0.4, k);
          idle.z += lerp(-4.2, 3.2, k);
        } else {
          const k = smooth(unlerp(0.32, 1.0, tt));
          idle.x += s * lerp(-1.5, 0, k);
          idle.y += lerp(0.4, 0, k);
          idle.z += lerp(3.2, 0, k);
          grip = lerp(0.1, 0.85, k);
        }
      }
      // carrying the lid: the right upper hand follows it
      if (i === 1 && this.lidU > 0.02) {
        const w = smooth(this.lidU / 0.25);
        this.tmpA.copy(this.lidG.position).add(this.tmpB.set(0, -0.5, 0)).applyMatrix4(this.head.matrix);
        idle.lerp(this.tmpA, w);
        grip = lerp(grip, 0.5, w);
      }
      // steered by hand
      const w = this.armW[i]!;
      let stretch = 1;
      if (w > 0) {
        this.tmpB.copy(this.armGoal[i]!);
        this.worldToRoot(this.tmpB);
        idle.lerp(this.tmpB, w);
        if (this.armGrip[i]! >= 0) grip = lerp(grip, this.armGrip[i]!, w);
        stretch = lerp(1, this.armStretch[i]!, w);
      }
      // the entrance: folded across his chest, then unfolding
      if (rs < 1) {
        this.tmpB.set((i % 2 ? 1 : -1) * 1.3, 8.0 - (i < 2 ? 0 : 0.5), 3.6);
        idle.lerp(this.tmpB, 1 - rs);
        grip = lerp(0.3, grip, rs);
      }
      // dying: the arms go limp
      if (dying > 0) {
        this.tmpB.set(a.shoulder.x * 1.5, a.shoulder.y - 7 - dying * 3, a.shoulder.z + 1.5);
        idle.lerp(this.tmpB, dying);
        grip = lerp(grip, 0, dying);
      }
      a.target.lerp(idle, 1 - Math.exp(-(w > 0 ? 9 : 14) * dt));
      a.stretch = stretch;
      a.pole.lerp(this.armPoleOn[i] ? this.armPole[i]! : POLES[i]!, 1 - Math.exp(-6 * dt));
      a.grip += (grip - a.grip) * (1 - Math.exp(-16 * dt));
      a.roll = !Number.isNaN(this.armRoll[i]!) && w > 0 ? this.armRoll[i]! : i < 2 ? 0 : Math.sin(t * 0.9 + ph) * 0.2;
      a.update(t);
    }
    // held things
    for (let i = 0; i < 2; i++) {
      const m = this.pinMeshes[i]!;
      const h = this.pinHeld[i]!;
      m.visible = h > 0.02 && dying < 0.5;
      m.scale.setScalar((PIN_SCALE / 1.55) * smooth(h));
      // the pin points where he wants it (tip down-forward when thrown, up like a raised spear when idle), however the wrist turns
      const a = this.arms[i]!;
      const dir = this.tmpA.copy(PIN_UP[i]!);
      const tt = this.throwT[i]!;
      if (tt >= 0 && tt < 0.4) {
        // the windup lays it back; the whip points it along the throw
        const k = smooth(unlerp(0.1, 0.3, tt));
        dir.lerp(this.tmpB.set(i === 0 ? -0.2 : 0.2, -0.45, 1).normalize(), k).normalize();
      }
      this.tmpQ.copy(a.hand.quaternion).invert();
      dir.applyQuaternion(this.tmpQ);
      m.quaternion.setFromUnitVectors(UP, dir);
      // hold it a third of the way up from the tip
      m.position.set(0, 0, 1.0).addScaledVector(dir, -1.4);
    }
    const lh = this.arms[2]!;
    this.ledger.position.copy(lh.target).add(this.tmpB.set(0.2, 1.4, 0.7));
    this.ledger.rotation.set(-0.15 + Math.sin(t * 1.3) * 0.03, 0.12, Math.sin(t * 0.8) * 0.03);
    this.ledger.visible = dying < 0.6;
    const sk = (1 - smooth(this.armW[3]!)) / 1.3;
    this.stamp.visible = dying < 0.6 && sk > 0.02;
    this.stamp.scale.setScalar(Math.max(0.001, sk));
    // brass cuffs follow the arms
    for (let k = 0; k < this.cuffSpec.length; k++) {
      const s = this.cuffSpec[k]!;
      const a = this.arms[s.arm]!;
      a.chain.at(s.u, this.tmpA, this.tmpB);
      this.dummy.position.copy(this.tmpA);
      this.dummy.quaternion.setFromUnitVectors(FWD, this.tmpB);
      this.dummy.scale.setScalar(0.7 + 0.6 * (1 - s.u) * 0.4 + (s.u > 0.4 && s.u < 0.6 ? 0.25 : 0));
      this.dummy.updateMatrix();
      this.cuffs.setMatrixAt(k, this.dummy.matrix);
    }
    this.cuffs.instanceMatrix.needsUpdate = true;
  }

  private layoutNeck(t: number) {
    const h = this.head;
    const u = this.headU;
    // the neck runs from the stump of his own neck to the bottom of the brass cup, in an S that bows out as it stretches
    const cupBottom = this.tmpA.set(0, -5.6, 0).applyMatrix4(h.matrix);
    const axis = this.tmpB.copy(UP).applyQuaternion(h.quaternion);
    const c = this.ctrl;
    c[0]!.set(0, 11.2, 0.5);
    c[1]!.set(0, 11.2 + 3.6 * u, 0.5 + 2.6 * u);
    c[2]!.copy(cupBottom).addScaledVector(axis, -3.2 * Math.min(1, u * 3));
    c[3]!.copy(cupBottom);
    spline([c[0]!, c[1]!, c[2]!, c[3]!], this.samp[0]!);
    const pts = this.neck.pts;
    for (let i = 0; i < pts.length; i++) {
      pts[i]!.copy(this.samp[0]![i]!);
      pts[i]!.x += Math.sin(t * 1.3 + i * 0.5) * 0.12 * Math.sin((i / (pts.length - 1)) * Math.PI);
    }
    this.neck.update();
    this.neck.mesh.visible = u > 0.03;
    // nerves: from the back of the eye, down through the liquid and the neck, into his chest
    const eyeBack = this.tmpC.set(0, 0, -1.2).applyQuaternion(this.eye.quaternion).add(this.eye.position).applyMatrix4(h.matrix);
    for (let n = 0; n < NERVES; n++) {
      const ph = n * 2.1;
      const a = (n / NERVES) * TAU;
      c[0]!.copy(eyeBack);
      c[1]!.set(Math.sin(t * 0.9 + ph) * 0.7 + Math.cos(a) * 0.35, -1.3, Math.cos(t * 0.8 + ph) * 0.7 + Math.sin(a) * 0.35).applyMatrix4(h.matrix);
      c[2]!.set(Math.cos(a) * 0.3, -4.0, Math.sin(a) * 0.3).applyMatrix4(h.matrix);
      c[3]!.copy(cupBottom).addScaledVector(axis, -1.2);
      c[4]!.copy(this.samp[0]![Math.floor(this.samp[0]!.length * 0.55)]!);
      c[5]!.set(Math.cos(a) * 0.25, 10.8, 0.5 + Math.sin(a) * 0.25);
      spline(c, this.samp[1]!);
      const np = this.nerves[n]!.pts;
      for (let i = 0; i < np.length; i++) np[i]!.copy(this.samp[1]![i]!);
      this.nerves[n]!.update();
    }
  }

  private layoutExtras(t: number, dt: number) {
    const d = this.dummy;
    // bubbles rise through the amber liquid; faster while he is lifting the lid
    const bs = 0.5 + this.steam * 0.04;
    for (let i = 0; i < BUBBLES; i++) {
      const ph = rnd(i, 1);
      const sp = (0.12 + 0.22 * rnd(i, 2)) * bs;
      const f = (t * sp + ph) % 1;
      const y = -3.2 + f * (LIQUID_Y + 3.1);
      const r = 0.5 + 1.6 * rnd(i, 3) * Math.min(1, (y + 3.6) / 1.5) * (1 - Math.max(0, (y - 1.4) / 1.6) * 0.5);
      const a = rnd(i, 4) * TAU + t * (0.3 + rnd(i, 5) * 0.4);
      d.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar((0.04 + 0.09 * rnd(i, 6)) * (1 + f * 0.6) * (this.death < 0.3 ? 1 : 0));
      d.updateMatrix();
      this.bubbles.setMatrixAt(i, d.matrix);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
    // jars on his belt swing a little
    const c = new THREE.Color();
    void c;
    for (let i = 0; i < JARS; i++) {
      const s = this.jarSpec[i]!;
      const sw = Math.sin(t * 1.4 + s.ph) * 0.07 + this.rattle * Math.sin(t * 50 + s.ph) * 0.1;
      d.position.set(s.x, s.y, s.z);
      d.rotation.set(sw + 0.05, s.ang, Math.sin(t * 1.1 + s.ph * 2) * 0.05, 'YXZ');
      d.scale.setScalar(1);
      d.updateMatrix();
      this.jarsGlass.setMatrixAt(i, d.matrix);
      this.jarsLid.setMatrixAt(i, d.matrix);
      this.jarsPet.setMatrixAt(i, d.matrix);
    }
    this.jarsGlass.instanceMatrix.needsUpdate = true;
    this.jarsLid.instanceMatrix.needsUpdate = true;
    this.jarsPet.instanceMatrix.needsUpdate = true;
    // ink tendrils crawl across the pool
    const rs = smooth(unlerp(0.3, 1, this.rise));
    for (const td of this.tendrils) {
      const n = td.chain.pts.length;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const reach = td.len * u * (0.6 + 0.4 * rs) * (1 - 0.6 * this.death);
        const side = Math.sin(td.ang);
        const wave = Math.sin(t * 1.3 + td.ph - u * 4.2) * 0.9 * u;
        td.chain.pts[i]!.set(side * (3.2 + reach * 0.9) + wave * 0.6, 0.55 + Math.sin(u * Math.PI) * 0.7 + Math.abs(Math.sin(t * 1.7 + td.ph + u * 5)) * 0.3 * u, 1.2 + Math.cos(td.ang) * (2.2 + reach * 0.7) + wave);
      }
      td.chain.update();
    }
    void dt;
  }

  /** Remove everything this model put in the world. */
  dispose() {
    this.world.remove(this.root);
    this.pins.dispose();
    this.jar.dispose();
    this.minions.dispose();
    this.world.remove(this.shards.mesh);
  }
}

/** The lab's view of the Collector. */
export async function labCollector(slicer: Slicer, world: THREE.Group) {
  const m = new CollectorModel(world, -29);
  m.root.visible = true;
  await m.build(slicer);
  let rise = 1;
  const api = {
    update: (dt: number, t: number) => m.update(dt, t),
    pose(name: string, v = 1) {
      if (name === 'head') m.headU = v;
      else if (name === 'lid') m.lidU = v;
      else if (name === 'eye') m.eyeOut = v;
      else if (name === 'pupil') m.pupil = v;
      else if (name === 'rise') {
        rise = v;
        m.rise = v;
      } else if (name === 'death') m.death = v;
      else if (name === 'steam') m.steam = v * 30;
      else if (name === 'puff') m.puff(Math.round(v * 40), 1);
      else if (name === 'hit') {
        m.flash(1);
        m.rattle = v;
      } else if (name === 'drawer') {
        for (let i = 0; i < DRAWERS; i++) if (i % 5 === 1 || i === 14) m.setDrawer(i, v, v);
      } else if (name === 'look') m.lookAt(0, 3, 14);
      else if (name === 'throw') m.throwPin(v > 0 ? 1 : 0);
      else if (name === 'swatch') {
        // (temporary) a chart of candidate colours under the arena's lights
        const cols = [0x2a1c0c, 0x4e3a1e, 0x5c4a30, 0x6a5238, 0x4a3a2a, 0x3c2c20, 0x6a4a3a, 0x70583c, 0x5a4a3a, 0x8a7a5a, 0x9a8a6a, 0x7a6a50, 0xb8a880, 0xd8c8a0, 0x4a4030, 0x3a3a28, 0x5a5a40, 0x6a6a4a, 0x2a2a1a, 0x4a3820, 0x7a4a2a, 0x8a5a30, 0x9a6a38, 0xaa7a40];
        cols.forEach((c, i) => {
          const sp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), skin({ color: c, rim: 0x7a5a30, rimPower: 4 }));
          sp.position.set(-4 + (i % 6) * 1.6, 3 + Math.floor(i / 6) * 1.6, -10);
          world.add(sp);
          m.root.visible = false;
        });
      } else if (name === 'pins') m.pins.demo(v);
      else if (name === 'jar') m.jar.demo(v);
      else if (name === 'minions') m.minions.demo(v);
      void rise;
    },
  };
  return api;
}

export { PIN_H, scale };
