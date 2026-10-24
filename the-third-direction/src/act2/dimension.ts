import * as THREE from 'three';
import type { Arena } from './arena';
import { setFlatGround } from './ground';
import { almond, glowTexture, Tesseract } from './fourth-model';
import { clamp, lerp, rng, smooth, TAU, unlerp } from '../core/util';

/**
 * THE FOURTH DIMENSION: where the Fourth takes the Blob after the family is free. A real place to cross, not a picture.
 *
 * Broken floors of dark blocks hang over a drop with no bottom. Monoliths stand on them; prisons with their bars snapped;
 * towers hang upside down from rocks in the air; a huge empty frame stands across the way. Far off, landmasses that are the
 * wrong way up, and a sky of slow bruised bands with cracks of cold light in it. A moon hangs there, and the moon has a face.
 * Far ahead a cold light goes straight up into an enormous empty cage: the only light there is, so you go to it.
 *
 * The floor is flat (see setFlatGround) at y = 0; you can walk anywhere on a slab and never off its edge (the edge stops
 * you), but a dash can carry you over a gap, or into the drop: then you wake again at the last slab you reached.
 *
 * Every colour here is cold: near-black navy, indigo, a washed-out blue, white-blue light and a little cyan in the cracks.
 * The only warm light is the Blob's own.
 */

/** a slab of floor: centre, width along x, depth along z; reaching it moves your waking place to `cp` */
export interface Slab {
  x: number;
  z: number;
  w: number;
  d: number;
  cp?: [number, number];
  gloss?: boolean;
  /** said the first time you reach it */
  say?: string;
}

export const SLABS: Slab[] = [
  // where you wake
  { x: 0, z: 0, w: 9, d: 9, cp: [0, 1.5], gloss: true },
  // the first bridge, broken in two
  { x: 0, z: -8, w: 3, d: 7 },
  { x: 0, z: -16.5, w: 3, d: 5 },
  // the monoliths
  { x: 1, z: -25, w: 12, d: 12, cp: [0, -21], say: 'high above, a cage. empty. as if it is waiting.' },
  { x: 6, z: -35, w: 3, d: 8 },
  // where the floor forgets which way is down (it folds)
  { x: 8, z: -49, w: 14, d: 15, cp: [8, -43], say: 'the floor here forgets which way is down.' },
  // the cells
  { x: 8, z: -84, w: 12, d: 11, cp: [8, -81], say: 'cells. someone was kept here.' },
  { x: -2, z: -86, w: 8, d: 3 },
  { x: -11, z: -86, w: 5, d: 3 },
  { x: -16, z: -90, w: 10, d: 10, cp: [-16, -88] },
  { x: -16, z: -98, w: 3, d: 6 },
  { x: -16, z: -106.5, w: 3, d: 6 },
  // the plaza and the gate
  { x: -16, z: -122, w: 20, d: 20, cp: [-16, -114], gloss: true, say: 'the light goes up. into the cage.' },
];

/** the slab that rides back and forth over the drop between the folds and the cells */
const MOVER = { x: 8, w: 5, d: 5, z0: -59, z1: -76, dwell: 2.2, ride: 7 };
const MOVER_T = 2 * (MOVER.dwell + MOVER.ride);

/** the two folding floors on the fourth slab: strips across it that fold over from its east edge, out of step */
const FOLD_X0 = 1;
const FOLD_X1 = 15;
const FOLDS = [
  { z: -46.5, d: 3, off: 0 },
  { z: -52.5, d: 3, off: 3.1 },
];
const FOLD_T = 6.2;

/** where the gate stands, and how near you must come to it */
export const GATE = { x: -16, z: -129, near: 6.5 };
/** where you wake */
export const WAKE = { x: 0, z: 1.5 };

/** The way through, for the route bot: points to walk to; `dash` means dash from here toward the next; `ride` waits for the mover. */
export const ROUTE: { x: number; z: number; dash?: boolean; ride?: 'board' | 'off' }[] = [
  { x: 0, z: -10.6, dash: true },
  { x: 0, z: -17 },
  { x: 2.5, z: -24 },
  { x: 6, z: -30 },
  { x: 6, z: -38.2, dash: true },
  { x: 8, z: -43 },
  { x: 8, z: -55.6, ride: 'board' },
  { x: 8, z: -60, ride: 'off' },
  { x: 8, z: -82 },
  { x: 2, z: -86 },
  { x: -5.2, z: -86, dash: true },
  { x: -11, z: -86 },
  { x: -16, z: -90 },
  { x: -16, z: -100.2, dash: true },
  { x: -16, z: -108.7, dash: true },
  { x: -16, z: -118 },
  { x: -16, z: -125 },
];

const BOX = new THREE.BoxGeometry(1, 1, 1);

/** Many boxes, each its own place, size, turn and colour, drawn as one instanced mesh. */
class Vox {
  private ms: THREE.Matrix4[] = [];
  private cs: THREE.Color[] = [];
  private static q = new THREE.Quaternion();
  private static e = new THREE.Euler();
  private static p = new THREE.Vector3();
  private static s = new THREE.Vector3();
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, col: number | THREE.Color, rx = 0, ry = 0, rz = 0) {
    Vox.q.setFromEuler(Vox.e.set(rx, ry, rz));
    this.ms.push(new THREE.Matrix4().compose(Vox.p.set(x, y, z), Vox.q, Vox.s.set(sx, sy, sz)));
    this.cs.push(typeof col === 'number' ? new THREE.Color(col) : col.clone());
  }
  /** a beam of boxes from a to b, `th` thick */
  beam(a: THREE.Vector3, b: THREE.Vector3, th: number, col: number) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    Vox.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.ms.push(new THREE.Matrix4().compose(Vox.p.addVectors(a, b).multiplyScalar(0.5), Vox.q, Vox.s.set(th, len, th)));
    this.cs.push(new THREE.Color(col));
  }
  get n() {
    return this.ms.length;
  }
  build(mat: THREE.Material, parent: THREE.Object3D): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(BOX, mat, Math.max(1, this.ms.length));
    m.count = this.ms.length;
    this.ms.forEach((x, i) => m.setMatrixAt(i, x));
    this.cs.forEach((c, i) => m.setColorAt(i, c));
    m.frustumCulled = false;
    parent.add(m);
    return m;
  }
}

/** a soft round blot, for haze and glows */
function softTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = 20 + r() * 88;
    const y = 20 + r() * 88;
    const rad = 14 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${0.12 + r() * 0.12})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  // fade to nothing at the rim
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** what the glossy floor sees: the dark, a band of bruised light round the horizon, the gate's cold light far ahead */
function voidEnv(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#020308');
  gr.addColorStop(0.42, '#141a3a');
  gr.addColorStop(0.5, '#262e5a');
  gr.addColorStop(0.58, '#0c1024');
  gr.addColorStop(1, '#010205');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 64);
  const m = g.createRadialGradient(62, 26, 0, 62, 26, 9);
  m.addColorStop(0, 'rgba(220,250,255,1)');
  m.addColorStop(1, 'rgba(120,200,255,0)');
  g.fillStyle = m;
  g.fillRect(40, 0, 50, 50);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BG = 0x0b0f22;
const ROCK = [0x161c2c, 0x111522, 0x1b2236, 0x0d1019, 0x1f2740];
const CRACK = 0x3fd2f2;
const PALE = 0xbcd6ff;

/** the sky's cracks: where they are, and which way they run */
const SKY_CRACKS: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(-0.55, 0.28, -0.8), new THREE.Vector3(0.3, 1, 0.1)],
  [new THREE.Vector3(0.75, 0.12, -0.65), new THREE.Vector3(-0.2, 1, -0.3)],
  [new THREE.Vector3(0.1, 0.5, 0.85), new THREE.Vector3(1, 0.4, 0)],
  [new THREE.Vector3(-0.9, 0.05, 0.4), new THREE.Vector3(0.1, 1, 0.2)],
];

interface Watcher {
  g: THREE.Group;
  spot: number;
  away: number;
}

export class Dimension {
  readonly group = new THREE.Group();
  /** the sky things follow the camera: they are as far away as anything can be */
  private skyGroup = new THREE.Group();
  active = false;
  /** where you wake again after a fall */
  cp = { x: WAKE.x, z: WAKE.z };
  /** the slabs you have reached (by index), for the lines said on arriving */
  reached = new Set<number>();
  /** collision posts (monoliths, the frame, the bars of the cells) */
  readonly solids: { x: number; z: number; r: number }[] = [];
  /** how open the moon's eyes are (0..1), and the gate's eye (0 = a thin line of light .. 1 = open) */
  moonEyes = 1;
  gateEye = 0;
  /** a folding floor has begun to lift (for its sound) */
  onFoldRise: (() => void) | null = null;

  private scene: THREE.Scene;
  private skyMat: THREE.ShaderMaterial;
  private mover = new THREE.Group();
  moverZ = MOVER.z0;
  private moverDZ = 0;
  private folds: { g: THREE.Group; glow: THREE.MeshBasicMaterial; ang: number }[] = [];
  private moon = new THREE.Group();
  private moonEyeG: THREE.Group[] = [];
  private moonDir = new THREE.Vector3(0.42, 0.33, -1).normalize();
  private gate!: Tesseract;
  private gateG = new THREE.Group();
  private gateSlit!: THREE.Group;
  private beacon!: THREE.Mesh;
  private gateLight!: THREE.PointLight;
  private cage = new THREE.Group();
  private frags!: THREE.InstancedMesh;
  private fragData: { x: number; y: number; z: number; s: number; rx: number; ry: number; sp: number; bob: number; kind: number }[] = [];
  private folders: { g: THREE.InstancedMesh; x: number; y: number; z: number; ph: number }[] = [];
  private watchers: Watcher[] = [];
  private spots: THREE.Vector3[] = [];
  private motes!: THREE.Points;
  private flash!: THREE.Sprite;
  private flashT = 6;
  private flashK = 0;
  private flashDir = new THREE.Vector3(1, 0, 0);
  private lights: THREE.Light[] = [];
  private env = voidEnv();
  private frustum = new THREE.Frustum();
  private pm = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private r = rng(4444);

  // what the arena had, to give it back
  private was = new Map<THREE.Object3D, boolean>();
  private lightWas = new Map<THREE.Light, number>();
  private fogWas: THREE.Fog | THREE.FogExp2 | null = null;
  private bgWas: THREE.Color | THREE.Texture | null = null;
  private envWas: THREE.Texture | null = null;
  private envIWas = 1;
  private farWas = 320;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.skyMat = this.buildSky();
    this.buildSlabs();
    this.buildMover();
    this.buildFolds();
    this.buildMonoliths();
    this.buildFrame();
    this.buildCells();
    this.buildPillars();
    this.buildTowers();
    this.buildFar();
    this.buildCage();
    this.buildGate();
    this.buildMoon();
    this.buildFragments();
    this.buildFolders();
    this.buildWatchers();
    this.buildAir();
    this.buildLights();
    this.group.add(this.skyGroup);
    this.group.visible = false;
    this.group.traverse((o) => (o.userData['noGround'] = true));
    scene.add(this.group);
  }

  /* ------------------------------------------------------------------ */
  /* the floor                                                            */
  /* ------------------------------------------------------------------ */

  /** is there floor under (x, z)? (`m`: how far past an edge still counts) */
  floorAt(x: number, z: number, m = 0.25): boolean {
    for (const s of SLABS) if (Math.abs(x - s.x) <= s.w / 2 + m && Math.abs(z - s.z) <= s.d / 2 + m) return true;
    return Math.abs(x - MOVER.x) <= MOVER.w / 2 + m && Math.abs(z - this.moverZ) <= MOVER.d / 2 + m;
  }

  /** the slab under (x, z), by index (-1: none, or the mover) */
  slabAt(x: number, z: number): number {
    return SLABS.findIndex((s) => Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2);
  }

  onMover(x: number, z: number): boolean {
    return Math.abs(x - MOVER.x) <= MOVER.w / 2 + 0.3 && Math.abs(z - this.moverZ) <= MOVER.d / 2 + 0.3;
  }

  /** a folding floor has come down on (x, z) */
  folded(x: number, z: number): boolean {
    if (x < FOLD_X0 - 0.3 || x > FOLD_X1 + 0.3) return false;
    return this.folds.some((f, i) => f.ang > Math.PI * 0.8 && Math.abs(z - FOLDS[i]!.z) < FOLDS[i]!.d / 2 + 0.3);
  }

  /** in the folding place, where it pulls you sideways (0..1) */
  pullAt(x: number, z: number): number {
    const s = SLABS[5]!;
    const inside = Math.abs(x - s.x) <= s.w / 2 + 1 && Math.abs(z - s.z) <= s.d / 2 + 1;
    return inside ? 1 : 0;
  }

  private moverPos(t: number): number {
    const u = ((t % MOVER_T) + MOVER_T) % MOVER_T;
    const { dwell, ride, z0, z1 } = MOVER;
    if (u < dwell) return z0;
    if (u < dwell + ride) return lerp(z0, z1, smooth((u - dwell) / ride));
    if (u < 2 * dwell + ride) return z1;
    return lerp(z1, z0, smooth((u - 2 * dwell - ride) / ride));
  }

  /** where the mover is in its trip: 'near' (docked at the folds), 'far' (docked at the cells) or 'between' */
  get moverAt(): 'near' | 'far' | 'between' {
    if (Math.abs(this.moverZ - MOVER.z0) < 0.05) return 'near';
    if (Math.abs(this.moverZ - MOVER.z1) < 0.05) return 'far';
    return 'between';
  }

  /** how far the mover went this frame (to carry whoever stands on it) */
  get moverStep(): number {
    return this.moverDZ;
  }

  /* ------------------------------------------------------------------ */
  /* building                                                             */
  /* ------------------------------------------------------------------ */

  private rock(): number {
    return ROCK[Math.floor(this.r() * ROCK.length)]!;
  }

  private buildSlabs() {
    const rock = new Vox();
    const gloss = new Vox();
    const glow = new Vox();
    const r = this.r;
    for (const s of SLABS) {
      const W = Math.round(s.w);
      const Dp = Math.round(s.d);
      const narrow = Math.min(W, Dp) <= 3;
      for (let i = 0; i < W; i++) {
        for (let j = 0; j < Dp; j++) {
          const x = s.x - s.w / 2 + i + 0.5;
          const z = s.z - s.d / 2 + j + 0.5;
          const ed = Math.min(i, W - 1 - i, j, Dp - 1 - j);
          // under the floor it hangs down: deeper toward the middle, ragged
          const depth = narrow ? 0.8 + r() * 1.1 : 1 + ed * 0.85 + r() * 1.6;
          const top = -r() * 0.05;
          if (s.gloss && ed >= 1 && (i + j) % 7 !== 0) {
            gloss.add(x, top - 0.15, z, 0.98, 0.3, 0.98, r() < 0.5 ? 0x1a2440 : 0x121a30);
            rock.add(x, top - 0.3 - depth / 2, z, 1, depth, 1, this.rock());
          } else rock.add(x, top - depth / 2, z, 1, depth, 1, this.rock());
          // a spike of rock hanging under it now and then
          if (!narrow && r() < 0.12) {
            const L = 2 + r() * 6;
            rock.add(x + (r() - 0.5) * 0.3, -depth - L / 2, z + (r() - 0.5) * 0.3, 0.55, L, 0.55, this.rock());
          }
          // a line of cold light down the outside of an edge block
          if (ed === 0 && r() < 0.16) {
            const ox = i === 0 ? -0.51 : i === W - 1 ? 0.51 : 0;
            const oz = j === 0 ? -0.51 : j === Dp - 1 ? 0.51 : 0;
            const L = depth * (0.3 + r() * 0.5);
            glow.add(x + ox, -0.1 - L / 2, z + oz, 0.06, L, 0.06, CRACK);
          }
        }
      }
      // a broken lip round the edge, lower than the floor (it is not floor: it crumbles under your eye)
      const per = 2 * (W + Dp);
      for (let k = 0; k < per; k++) {
        if (r() > 0.4) continue;
        let x: number;
        let z: number;
        if (k < W) [x, z] = [s.x - s.w / 2 + k + 0.5, s.z - s.d / 2 - 0.5];
        else if (k < 2 * W) [x, z] = [s.x - s.w / 2 + (k - W) + 0.5, s.z + s.d / 2 + 0.5];
        else if (k < 2 * W + Dp) [x, z] = [s.x - s.w / 2 - 0.5, s.z - s.d / 2 + (k - 2 * W) + 0.5];
        else [x, z] = [s.x + s.w / 2 + 0.5, s.z - s.d / 2 + (k - 2 * W - Dp) + 0.5];
        const sz = 0.5 + r() * 0.4;
        const y = -0.35 - r() * 0.6;
        rock.add(x, y - sz / 2, z, sz, sz + r() * 0.8, sz, this.rock(), r() * 0.4, r() * 0.4, r() * 0.4);
      }
      // cracks of cold light across the bigger slabs
      if (!narrow) {
        const n = 2 + Math.floor(r() * 3);
        for (let c = 0; c < n; c++) {
          let cx = s.x + (r() - 0.5) * (s.w - 2);
          let cz = s.z + (r() - 0.5) * (s.d - 2);
          let dir = Math.floor(r() * 4);
          const steps = 5 + Math.floor(r() * 9);
          for (let k = 0; k < steps; k++) {
            if (r() < 0.35) dir = (dir + (r() < 0.5 ? 1 : 3)) % 4;
            const dx = [1, 0, -1, 0][dir]! * 0.9;
            const dz = [0, 1, 0, -1][dir]! * 0.9;
            const nx = cx + dx;
            const nz = cz + dz;
            if (Math.abs(nx - s.x) > s.w / 2 - 0.4 || Math.abs(nz - s.z) > s.d / 2 - 0.4) break;
            glow.add((cx + nx) / 2, 0.012, (cz + nz) / 2, Math.abs(dx) + 0.07, 0.03, Math.abs(dz) + 0.07, k % 3 === 0 ? 0x7fe6ff : CRACK);
            cx = nx;
            cz = nz;
          }
        }
      }
    }
    rock.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.1 }), this.group);
    gloss.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.7, envMapIntensity: 2.2 }), this.group);
    glow.build(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.group);
  }

  private buildMover() {
    const rock = new Vox();
    const glow = new Vox();
    const r = this.r;
    for (let i = 0; i < MOVER.w; i++) {
      for (let j = 0; j < MOVER.d; j++) {
        const ed = Math.min(i, MOVER.w - 1 - i, j, MOVER.d - 1 - j);
        const depth = 0.8 + ed * 0.9 + r() * 0.8;
        rock.add(i - MOVER.w / 2 + 0.5, -depth / 2 - r() * 0.04, j - MOVER.d / 2 + 0.5, 1, depth, 1, this.rock());
      }
    }
    // a rim of cold light round its top, and a cold point hanging under it
    for (const [x, z, w, d] of [
      [0, -MOVER.d / 2, MOVER.w, 0.08],
      [0, MOVER.d / 2, MOVER.w, 0.08],
      [-MOVER.w / 2, 0, 0.08, MOVER.d],
      [MOVER.w / 2, 0, 0.08, MOVER.d],
    ] as const)
      glow.add(x, -0.06, z, w, 0.1, d, PALE);
    glow.add(0, -3.6, 0, 0.5, 0.5, 0.5, PALE, 0.6, 0.6, 0);
    rock.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.1 }), this.mover);
    glow.build(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.mover);
    this.mover.position.set(MOVER.x, 0, MOVER.z0);
    this.group.add(this.mover);
  }

  private buildFolds() {
    const r = this.r;
    for (const f of FOLDS) {
      // the hinge is the slab's east edge; the leaf lies out over the drop, then folds up and over onto the floor
      const g = new THREE.Group();
      g.position.set(FOLD_X1, 0, f.z);
      const leaf = new Vox();
      const len = FOLD_X1 - FOLD_X0;
      for (let i = 0; i < len; i++) for (let j = 0; j < f.d; j++) leaf.add(i + 0.5, -0.3, j - f.d / 2 + 0.5, 0.98, 0.6, 0.98, this.rock());
      // its underside (which is what lands on you) is scored with light
      for (let i = 0; i < len; i += 2) leaf.add(i + 0.5 + r(), -0.61, 0, 0.08, 0.02, f.d * 0.9, CRACK);
      leaf.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.15 }), g);
      this.group.add(g);
      // where it will land: a strip that glows as it comes
      const glow = new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, f.d), glow);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set((FOLD_X0 + FOLD_X1) / 2, 0.03, f.z);
      this.group.add(strip);
      // an edge line marks it always
      const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08), new THREE.MeshBasicMaterial({ color: 0x3fb8d8 }));
      line.rotation.x = -Math.PI / 2;
      for (const s of [-1, 1]) {
        const l = line.clone();
        l.position.set((FOLD_X0 + FOLD_X1) / 2, 0.025, f.z + (s * f.d) / 2);
        this.group.add(l);
      }
      this.folds.push({ g, glow, ang: 0 });
    }
  }

  /** a standing stone, tall, dark, cracked with light, its top broken off and hanging in the air above it */
  private monolith(v: Vox, glow: Vox, x: number, z: number, h: number, ry: number, broken = false) {
    const r = this.r;
    const tilt = (r() - 0.5) * 0.08;
    v.add(x, 0.3, z, 1.9, 0.6, 1.4, this.rock(), 0, ry, 0);
    const segs = Math.ceil(h / 1.6);
    for (let k = 0; k < segs; k++) {
      const y = 0.6 + k * 1.6 + 0.8;
      v.add(x + Math.sin(tilt) * y, y, z, 1.25 - k * 0.02, 1.62, 0.85, this.rock(), 0, ry + (r() - 0.5) * 0.03, tilt);
    }
    // a slit of light down its face
    const fx = Math.sin(ry) * 0.44;
    const fz = Math.cos(ry) * 0.44;
    glow.add(x + fx, 0.6 + h * 0.45, z + fz, 0.07, h * 0.6, 0.07, CRACK, 0, ry, tilt);
    if (broken) {
      for (let k = 0; k < 3; k++) v.add(x + (r() - 0.5) * 1.2, h + 2.5 + k * 1.3 + r(), z + (r() - 0.5) * 1.2, 0.7 + r() * 0.5, 0.6 + r() * 0.8, 0.6 + r() * 0.4, this.rock(), r() * 2, r() * 2, r() * 2);
    }
    this.solids.push({ x, z, r: 0.95 });
  }

  private buildMonoliths() {
    const v = new Vox();
    const glow = new Vox();
    this.monolith(v, glow, -3.2, -22.5, 7.5, 0.2, true);
    this.monolith(v, glow, 5.2, -27.8, 9, -0.3, true);
    this.monolith(v, glow, -3, -29.3, 5, 0.6);
    // on the plaza: two rows of them leading to the gate
    for (let k = 0; k < 3; k++) {
      this.monolith(v, glow, -23, -116 - k * 4.5, 8 + k * 1.5, 0.1 * k, k === 2);
      this.monolith(v, glow, -9, -116 - k * 4.5, 8 + k * 1.5, -0.1 * k, k === 1);
    }
    // two by where you wake, one fallen
    this.monolith(v, glow, -3.4, -2.6, 4.5, 0.4, true);
    v.add(3.3, 0.5, -2.8, 1.2, 1, 4.2, this.rock(), 0.05, 0.5, 0.12);
    this.solids.push({ x: 3.3, z: -2.8, r: 1.3 });
    v.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.2 }), this.group);
    glow.build(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.group);
  }

  /** a rectangle of stone with nothing in it, `w` by `h`, `t` thick */
  private frame(v: Vox, glow: Vox | null, c: THREE.Vector3, w: number, h: number, t: number, rot: THREE.Euler) {
    const q = new THREE.Quaternion().setFromEuler(rot);
    const P = (x: number, y: number) => new THREE.Vector3(x, y, 0).applyQuaternion(q).add(c);
    const col = this.rock();
    v.beam(P(-w / 2, 0), P(-w / 2, h), t, col);
    v.beam(P(w / 2, 0), P(w / 2, h), t, col);
    v.beam(P(-w / 2 - t / 2, h), P(w / 2 + t / 2, h), t * 1.15, col);
    v.beam(P(-w / 2, 0), P(w / 2, 0), t, col);
    if (glow) {
      glow.beam(P(-w / 2 + t * 0.55, 0.2), P(-w / 2 + t * 0.55, h - 0.2), 0.06, CRACK);
      glow.beam(P(w / 2 - t * 0.55, 0.2), P(w / 2 - t * 0.55, h - 0.2), 0.06, CRACK);
    }
  }

  private buildFrame() {
    const v = new Vox();
    const glow = new Vox();
    // the great empty frame across the way on the monoliths' slab (you walk through it; it is too big to be a door)
    const c = new THREE.Vector3(2.2, -0.3, -25.5);
    const q = new THREE.Euler(0, -0.25, 0.04);
    const w = 7.5;
    const h = 13;
    const t = 0.9;
    this.frame(v, glow, c, w, h, t, q);
    const qq = new THREE.Quaternion().setFromEuler(q);
    for (const s of [-1, 1]) {
      const p = new THREE.Vector3((s * w) / 2, 0, 0).applyQuaternion(qq).add(c);
      this.solids.push({ x: p.x, z: p.z, r: 0.75 });
    }
    // more of them out in the dark, some leaning, some upside down, turning very slowly in the drop
    const r = this.r;
    const far: [number, number, number, number, number, number][] = [
      [-26, -6, -40, 16, 26, 0.3],
      [30, -10, -78, 20, 30, -0.4],
      [-40, 8, -128, 18, 24, 0.9],
      [22, 16, -150, 14, 22, -0.2],
      [-12, -30, -60, 24, 34, 1.4],
      [34, -4, -20, 12, 18, 0.6],
    ];
    for (const [x, y, z, w2, h2, rz] of far) this.frame(v, glow, new THREE.Vector3(x, y, z), w2, h2, 1.4, new THREE.Euler(r() * 0.4, r() * TAU, rz));
    v.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.15 }), this.group);
    glow.build(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.group);
  }

  /** the cells: bars stand round the slab, snapped, bent, some gone. Someone was kept here. */
  private buildCells() {
    const v = new Vox();
    const r = this.r;
    const s = SLABS[6]!;
    const x0 = s.x - s.w / 2 + 0.3;
    const x1 = s.x + s.w / 2 - 0.3;
    const z0 = s.z - s.d / 2 + 0.3;
    const z1 = s.z + s.d / 2 - 0.3;
    const bar = (x: number, z: number) => {
      if (r() < 0.15) return;
      const h = r() < 0.25 ? 1 + r() * 2 : 4.5 + r() * 3;
      const lean = r() < 0.2 ? (r() - 0.5) * 0.5 : (r() - 0.5) * 0.06;
      v.add(x, h / 2, z, 0.22, h, 0.22, 0x1d2438, lean, 0, lean * 0.7);
      this.solids.push({ x, z, r: 0.28 });
    };
    // the way in (the north edge, where the mover docks) and the way out (the west edge) stay open
    for (let x = x0; x <= x1; x += 1.1) {
      if (x < MOVER.x - 3.2 || x > MOVER.x + 3.2) bar(x, z1);
      bar(x, z0);
    }
    for (let z = z0; z <= z1; z += 1.1) {
      bar(x1, z);
      if (z < -88.4 || z > -83.6) bar(x0, z);
    }
    // the top rail, broken in places
    for (let x = x0; x < x1; x += 2.2) if (r() < 0.6) v.add(x + 1.1, 7.6, z0, 2.2, 0.25, 0.25, 0x1d2438);
    for (let z = z0; z < z1; z += 2.2) if (r() < 0.6) v.add(x1, 7.6, z + 1.1, 0.25, 0.25, 2.2, 0x1d2438);
    // inside: a chain on the floor, and its cuff, open
    for (let k = 0; k < 9; k++) v.add(11 - k * 0.42, 0.08, -86.5 + Math.sin(k) * 0.3, 0.38, 0.12, 0.2, 0x2a3350, 0, k % 2 ? 0.5 : -0.4, 0);
    v.add(7.2, 0.15, -86.2, 0.7, 0.3, 0.7, 0x2a3350, 0, 0.3, 0);
    v.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.75 }), this.group);
  }

  /** columns that come up out of the drop from no floor at all */
  private buildPillars() {
    const v = new Vox();
    const glow = new Vox();
    const r = this.r;
    const list: [number, number, number, number][] = [
      [-14, -10, 6, 4],
      [16, -18, -2, 5],
      [-12, -45, 10, 4.5],
      [26, -70, 4, 6],
      [-6, -62, -4, 3.5],
      [24, -100, 12, 5],
      [-32, -75, 2, 6],
      [2, -112, 8, 4],
      [-34, -118, 14, 5],
      [6, -142, -6, 7],
      [-30, -142, 6, 5],
      [14, 8, -8, 5],
      [-20, 12, 3, 4],
      [-26, -28, 16, 5],
      [28, -40, 9, 4],
    ];
    for (const [x, z, top, w] of list) {
      let y = -95;
      let k = 0;
      while (y < top) {
        const h = Math.min(6, top - y);
        const ww = w * (0.85 + r() * 0.25);
        v.add(x + (r() - 0.5) * 0.4, y + h / 2, z + (r() - 0.5) * 0.4, ww, h, ww * (0.8 + r() * 0.3), this.rock(), 0, r() * 0.3, 0);
        if (k % 2 === 0 && r() < 0.5) glow.add(x + ww / 2 + 0.02, y + h / 2, z, 0.06, h * 0.8, 0.06, CRACK);
        y += h;
        k++;
      }
      // a broken top: blocks tipped over, one hanging in the air above
      for (let c = 0; c < 4; c++) v.add(x + (r() - 0.5) * w * 0.7, top + 0.4 + r() * 0.6, z + (r() - 0.5) * w * 0.7, w * 0.3, w * 0.25, w * 0.3, this.rock(), r() * 0.6, r() * 2, r() * 0.6);
      v.add(x + (r() - 0.5) * 2, top + 4 + r() * 3, z + (r() - 0.5) * 2, w * 0.35, w * 0.3, w * 0.3, this.rock(), r() * 3, r() * 3, r() * 3);
      // something could stand up there
      this.spots.push(new THREE.Vector3(x, top + 0.9, z));
    }
    v.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.1 }), this.group);
    glow.build(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.group);
  }

  /** towers that hang upside down from rocks in the air, a few of their windows lit */
  private buildTowers() {
    const v = new Vox();
    const glow = new Vox();
    const r = this.r;
    const list: [number, number, number, number][] = [
      [-22, 30, -30, 1.2],
      [26, 36, -55, 1.5],
      [-30, 40, -95, 1.4],
      [20, 28, -112, 1.0],
      [-6, 54, -170, 2.2],
      [36, 26, -18, 0.9],
      [-40, 34, -50, 1.1],
    ];
    for (const [x, y, z, s] of list) {
      // the rock it hangs from
      for (let k = 0; k < 18; k++) {
        const a = r() * TAU;
        const d = r() * 5 * s;
        v.add(x + Math.cos(a) * d, y + 2 * s + r() * 3 * s, z + Math.sin(a) * d, (2 + r() * 3) * s, (1.5 + r() * 2.5) * s, (2 + r() * 3) * s, this.rock(), r() * 0.3, r() * TAU, r() * 0.3);
      }
      // the tower, narrowing downward
      let yy = y;
      const n = 5 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const w = (3.4 - k * 0.3) * s;
        const h = 3 * s;
        yy -= h;
        v.add(x, yy + h / 2, z, w, h, w, this.rock(), 0, k * 0.08, 0);
        // a ledge every other floor
        if (k % 2 === 0) v.add(x, yy + 0.2 * s, z, w * 1.2, 0.35 * s, w * 1.2, this.rock(), 0, k * 0.08, 0);
        for (let f = 0; f < 4; f++) {
          if (r() > 0.3) continue;
          const a = (f * Math.PI) / 2 + k * 0.08;
          glow.add(x + Math.sin(a) * (w / 2 + 0.02), yy + h * 0.55, z + Math.cos(a) * (w / 2 + 0.02), 0.35 * s, 0.7 * s, 0.35 * s, r() < 0.3 ? 0xe8f2ff : PALE, 0, a, 0);
        }
      }
      // the spire, pointing down
      v.add(x, yy - 4 * s, z, 0.7 * s, 8 * s, 0.7 * s, this.rock());
    }
    v.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.1 }), this.group);
    glow.build(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.group);
  }

  /** land far away: islands the wrong way up, a city of spires, a ridge; drawn as shapes darker than the sky */
  private buildFar() {
    const v = new Vox();
    const r = this.r;
    const list: [number, number, number, number, boolean][] = [
      [-180, -20, -160, 40, false],
      [200, 10, -210, 55, true],
      [-60, -45, -300, 70, false],
      [120, -30, -320, 50, false],
      [-260, 30, -40, 45, true],
      [250, -35, 40, 60, false],
      [-150, 40, 160, 40, true],
      [60, -60, 220, 70, false],
      [-20, 70, -330, 35, true],
    ];
    for (const [x, y, z, s, flip] of list) {
      const sg = flip ? -1 : 1;
      const col = new THREE.Color(0x0a0d1a);
      // a mesa with a ragged underside
      for (let k = 0; k < 26; k++) {
        const a = r() * TAU;
        const d = r() * s * 0.6;
        const w = s * (0.15 + r() * 0.3);
        const h = s * (0.08 + r() * 0.18);
        v.add(x + Math.cos(a) * d, y + sg * (r() * s * 0.1), z + Math.sin(a) * d, w, h, w, col);
        // hanging underneath it (or above it, for those upside down)
        if (r() < 0.5) {
          const L = s * (0.2 + r() * 0.6);
          v.add(x + Math.cos(a) * d, y - sg * L * 0.5, z + Math.sin(a) * d, w * 0.3, L, w * 0.3, col);
        }
      }
      // spires on top (or below)
      for (let k = 0; k < 5; k++) {
        const a = r() * TAU;
        const d = r() * s * 0.4;
        const L = s * (0.3 + r() * 0.7);
        v.add(x + Math.cos(a) * d, y + sg * L * 0.5, z + Math.sin(a) * d, s * 0.05, L, s * 0.05, col);
      }
    }
    v.build(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), this.group);
  }

  /** the cage: an enormous one, empty, its door hanging open, high over the gate; the gate's light goes up into it */
  private buildCage() {
    const v = new Vox();
    const glow = new Vox();
    const R = 18;
    const H = 26;
    const N = 34;
    const col = 0x1a2136;
    const P = (a: number, y: number, rr = R) => new THREE.Vector3(Math.sin(a) * rr, y, Math.cos(a) * rr);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      // the door (toward you): four bars gone, one bent out
      if (i >= 0 && i <= 2) continue;
      if (i === N - 1) {
        v.beam(P(a, -H / 2), P(a + 0.04, 0, R + 3), 0.55, col);
        v.beam(P(a + 0.04, 0, R + 3), P(a, H / 2), 0.55, col);
        continue;
      }
      v.beam(P(a, -H / 2), P(a, H / 2), 0.55, col);
      // the dome
      let prev = P(a, H / 2);
      for (let k = 1; k <= 6; k++) {
        const u = k / 6;
        const p = P(a, H / 2 + Math.sin((u * Math.PI) / 2) * 12, R * Math.cos((u * Math.PI) / 2));
        if (i % 2 === 0 || k < 4) v.beam(prev, p, 0.5, col);
        prev = p;
      }
      if (i % 5 === 0) glow.beam(P(a, -H / 2 + 1, R + 0.3), P(a, H / 2 - 1, R + 0.3), 0.08, PALE);
    }
    // the rings round it, and its floor, with a hole where the light comes in
    for (const y of [-H / 2, -H / 2 + 0.9, 0, H / 2]) {
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * TAU;
        const a1 = ((i + 1) / N) * TAU;
        if (y !== -H / 2 && i >= 0 && i <= 1) continue;
        v.beam(P(a0, y), P(a1, y), 0.7, col);
      }
    }
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * TAU;
      const rr = 8 + (k % 3) * 3;
      v.add(Math.sin(a) * rr, -H / 2 - 0.3, Math.cos(a) * rr, 3, 0.6, 3, col, 0, a, 0);
    }
    // the chain it hangs by, going up out of sight
    for (let k = 0; k < 26; k++) v.add(0, H / 2 + 12 + k * 2.2, 0, k % 2 ? 0.5 : 1.6, 2.4, k % 2 ? 1.6 : 0.5, col);
    v.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.7, fog: false }), this.cage);
    glow.build(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), this.cage);
    this.cage.position.set(GATE.x, 62, GATE.z - 4);
    this.cage.rotation.y = -0.15;
    this.group.add(this.cage);
  }

  /** the gate: a cube inside a cube, cold, turning through itself, standing on the plaza, a thin line of light in its middle */
  private buildGate() {
    const g = this.gateG;
    this.gate = new Tesseract({ color: 0x8fe0ff, node: 0xeaffff, trails: 1, thick: 0.32, nodeSize: 0.9, S: 9, halo: 0.07 });
    g.add(this.gate.group);
    // the line of light (it is an eye; it is shut)
    this.gateSlit = new THREE.Group();
    const outer = new THREE.Mesh(almond(2.2, 9), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const inner = new THREE.Mesh(almond(1.3, 8.2), new THREE.MeshBasicMaterial({ color: 0xf2fcff, fog: false, side: THREE.DoubleSide }));
    inner.position.z = 0.02;
    const pupil = new THREE.Mesh(almond(0.25, 6.4), new THREE.MeshBasicMaterial({ color: 0x02040a, fog: false, side: THREE.DoubleSide }));
    pupil.position.z = 0.04;
    // the dark round it, as it opens: something is behind it
    const back = new THREE.Mesh(almond(4.6, 11.5), new THREE.MeshBasicMaterial({ color: 0x03040a, fog: false, side: THREE.DoubleSide }));
    back.position.z = -0.05;
    this.gateSlit.add(back, outer, inner, pupil);
    const burn = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x7fd8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    burn.scale.set(9, 16, 1);
    g.add(burn, this.gateSlit);
    g.position.set(GATE.x, 8.5, GATE.z - 1);
    this.group.add(g);
    // the dais
    const v = new Vox();
    for (let k = 0; k < 3; k++) v.add(GATE.x, -0.2 + k * 0.001, GATE.z - 1, 14 - k * 3, 0.4 + k * 0.5, 9 - k * 2, this.rock());
    v.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.6 }), this.group);
    this.solids.push({ x: GATE.x, z: GATE.z - 2.5, r: 2.4 });
    // the light going straight up from it, into the cage
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.5, 140, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    this.beacon.position.set(GATE.x, 70, GATE.z - 1);
    this.group.add(this.beacon);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 140, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xeaffff, fog: false }));
    core.position.copy(this.beacon.position);
    this.group.add(core);
    // and its light lying on the glossy floor, toward you
    const refl = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 22),
      new THREE.MeshBasicMaterial({ map: this.streak(), color: 0x7fd8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    refl.rotation.x = -Math.PI / 2;
    refl.position.set(GATE.x, 0.04, GATE.z + 10);
    this.group.add(refl);
    this.gateLight = new THREE.PointLight(0x8fe0ff, 90, 42, 1.4);
    this.gateLight.position.set(GATE.x, 6, GATE.z + 2);
    this.group.add(this.gateLight);
  }

  private streak(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 128);
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, 32, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.5, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, 32, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /**
   * The moon. It is a ball of blocks the size of a mountain, lit cold from one side, and it has a face: two slanted eyes of
   * white light, and something dark running down from them like it has been crying for a long time. Its mouth is a crack.
   */
  private buildMoon() {
    const R = 60;
    const S = 3.3;
    const body = new Vox();
    const L = new THREE.Vector3(-0.55, 0.55, 0.62).normalize();
    const r = this.r;
    const eyes = [new Vox(), new Vox()];
    const EYE = [
      { cx: -0.34, cy: 0.12, rot: -0.36 },
      { cx: 0.34, cy: 0.12, rot: 0.36 },
    ];
    const dripsAt = EYE.map(() => Array.from({ length: 6 }, () => ({ u: (r() - 0.5) * 0.32, len: 0.08 + r() * r() * 0.5 })));
    const c = new THREE.Color();
    const dark = new THREE.Color(0x070910);
    const lit = new THREE.Color(0x6d7a9c);
    for (let x = -R; x <= R; x += S) {
      for (let y = -R; y <= R; y += S) {
        for (let z = -R * 0.3; z <= R; z += S) {
          const d = Math.hypot(x, y, z);
          if (Math.abs(d - R) > S * 0.55) continue;
          const nx = x / d;
          const ny = y / d;
          const nz = z / d;
          let push = 0;
          const sh = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
          c.copy(dark).lerp(lit, Math.pow(sh, 1.4) * (0.75 + r() * 0.3));
          // the rim where the light just catches it
          if (sh > 0.05 && nz < 0.35) c.lerp(new THREE.Color(0x9fb4e0), 0.25);
          let eyeCell = -1;
          if (nz > 0.25) {
            for (let e = 0; e < 2; e++) {
              const E = EYE[e]!;
              const dx = nx - E.cx;
              const dy = ny - E.cy;
              const u = dx * Math.cos(E.rot) + dy * Math.sin(E.rot);
              const v = -dx * Math.sin(E.rot) + dy * Math.cos(E.rot);
              const half = 0.075 * Math.max(0, 1 - (u / 0.21) * (u / 0.21));
              if (Math.abs(u) < 0.21 && Math.abs(v) < half) eyeCell = e;
              else if (Math.abs(u) < 0.27 && Math.abs(v) < half * 1.9 + 0.035) {
                // the socket: dark, sunk
                c.copy(dark).multiplyScalar(0.4);
                push = -1.2;
              } else if (v < 0) {
                // what runs down from it
                for (const dr of dripsAt[e]!) {
                  if (Math.abs(u - dr.u) < 0.028 && v > -dr.len - 0.07 && v < -0.03) {
                    c.setHex(0x020306);
                    push = 0.8;
                  }
                }
              }
            }
            // the mouth: a long crack, not quite straight
            const my = -0.34 + Math.sin(nx * 18) * 0.02 + nx * nx * 0.25;
            if (Math.abs(nx) < 0.3 && Math.abs(ny - my) < 0.03) {
              c.setHex(0x010204);
              push = -1.4;
            }
          }
          if (eyeCell >= 0) {
            const E = EYE[eyeCell]!;
            // eye cells go into their own group, centred on the eye, so the eye can open and shut
            const ex = E.cx * R;
            const ey = E.cy * R;
            eyes[eyeCell]!.add(x - ex, y - ey, z + 0.6, S * 1.02, S * 1.02, S * 1.02, r() < 0.25 ? 0xb8dcff : 0xf0f8ff);
            continue;
          }
          const k = 1 + push / R;
          body.add(x * k, y * k, z * k, S * 0.98, S * 0.98, S * 0.98, c);
        }
      }
    }
    body.build(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), this.moon);
    EYE.forEach((E, i) => {
      const g = new THREE.Group();
      g.position.set(E.cx * R, E.cy * R, 0);
      eyes[i]!.build(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), g);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x9fd0ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.scale.set(40, 22, 1);
      glow.position.z = R * 0.95;
      g.add(glow);
      this.moonEyeG.push(g);
      this.moon.add(g);
    });
    // a cold haze round it
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x3a4a80, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    halo.scale.setScalar(R * 4.2);
    this.moon.add(halo);
    this.skyGroup.add(this.moon);
  }

  /** shards of somewhere else turning slowly in the drop */
  private buildFragments() {
    const r = this.r;
    const N = 170;
    for (let i = 0; i < N; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let tries = 0; tries < 8; tries++) {
        x = (r() - 0.5) * 130;
        y = -40 + r() * 75;
        z = 30 - r() * 210;
        // never in the way
        if (!this.floorAt(x, z, 7) || Math.abs(y) > 12) break;
      }
      this.fragData.push({ x, y, z, s: 0.3 + r() * r() * 3.5, rx: r() * TAU, ry: r() * TAU, sp: (0.05 + r() * 0.2) * (r() < 0.5 ? -1 : 1), bob: r() * TAU, kind: r() < 0.12 ? 1 : 0 });
    }
    this.frags = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.4, flatShading: true }), N);
    this.fragData.forEach((d, i) => this.frags.setColorAt(i, new THREE.Color(d.kind ? 0x2a6a8a : this.rock())));
    this.frags.frustumCulled = false;
    this.group.add(this.frags);
  }

  /** knots of blocks that fold into themselves until there is nothing, and come back */
  private buildFolders() {
    const list: [number, number, number][] = [
      [-11, 7, -36],
      [21, 11, -66],
      [-27, 9, -108],
      [16, 4, -14],
    ];
    list.forEach(([x, y, z], i) => {
      const m = new THREE.InstancedMesh(BOX, new THREE.MeshStandardMaterial({ color: 0x1b2338, roughness: 0.5, metalness: 0.5, emissive: 0x081830 }), 27);
      m.frustumCulled = false;
      this.group.add(m);
      this.folders.push({ g: m, x, y, z, ph: i * 1.7 });
    });
  }

  /**
   * Things that stand on the tops of the columns, far off, too tall and too thin, and watch. When you are not looking at
   * one it is somewhere else.
   */
  private buildWatchers() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x020308 });
    const eye = new THREE.MeshBasicMaterial({ color: 0xcfe4ff });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) => {
        const m = new THREE.Mesh(BOX, mat);
        m.position.set(x, y, z);
        m.scale.set(sx, sy, sz);
        m.rotation.z = rz;
        g.add(m);
      };
      part(0, 4.2, 0, 0.9, 6.5, 0.55);
      part(0.05, 8.1, 0, 0.75, 1.5, 0.6, 0.12);
      part(-0.62, 3.6, 0, 0.22, 5.8, 0.25, 0.04);
      part(0.62, 3.6, 0, 0.22, 5.8, 0.25, -0.04);
      part(-0.25, 0.5, 0, 0.25, 1.6, 0.3);
      part(0.25, 0.5, 0, 0.25, 1.6, 0.3);
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(BOX, eye);
        e.scale.set(0.12, 0.07, 0.05);
        e.position.set(s * 0.17 + 0.05, 8.25, 0.31);
        g.add(e);
      }
      g.scale.setScalar(1.15);
      this.group.add(g);
      this.watchers.push({ g, spot: -1, away: 0 });
    }
  }

  /** the drop's haze, the motes in the air, a flash far off now and then */
  private buildAir() {
    const soft = softTexture();
    for (const [y, o, s] of [
      [-24, 0.16, 420],
      [-55, 0.12, 520],
    ] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: soft, color: 0x2a3a78, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(-8, y, -60);
      this.group.add(m);
    }
    const n = 260;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xa8c4ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false }));
    this.motes.frustumCulled = false;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) p.setXYZ(i, (this.r() - 0.5) * 60, -6 + this.r() * 26, (this.r() - 0.5) * 60);
    this.group.add(this.motes);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xb8ccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.flash.scale.setScalar(120);
    this.skyGroup.add(this.flash);
  }

  private buildLights() {
    const amb = new THREE.HemisphereLight(0x4a5a8c, 0x05060c, 1.1);
    // a cold light from far ahead, behind everything: it rims what you look at
    const rim = new THREE.DirectionalLight(0xb8d4ff, 2.2);
    rim.position.set(-20, 40, -90);
    rim.target.position.set(0, 0, 0);
    const fill = new THREE.DirectionalLight(0x3a4a8a, 0.6);
    fill.position.set(30, 18, 40);
    for (const l of [amb, rim, fill]) {
      l.visible = false;
      this.lights.push(l);
      this.group.add(l);
    }
    this.group.add(rim.target);
  }

  private buildSky(): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uT: { value: 0 },
        uGate: { value: new THREE.Vector3(-0.12, 0.08, -1).normalize() },
        uFlash: { value: new THREE.Vector4(1, 0, 0, 0) },
        uCC: { value: SKY_CRACKS.map(([c]) => c.clone().normalize()) },
        uCT: { value: SKY_CRACKS.map(([c, t]) => t.clone().sub(c.clone().normalize().multiplyScalar(t.dot(c.clone().normalize())) ).normalize()) },
      },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec3 vD;
        uniform float uT;
        uniform vec3 uGate;
        uniform vec4 uFlash;
        uniform vec3 uCC[4];
        uniform vec3 uCT[4];
        float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vD);
          float h = d.y;
          vec3 top = vec3(0.012, 0.016, 0.04);
          vec3 hor = vec3(0.075, 0.09, 0.2);
          vec3 low = vec3(0.006, 0.008, 0.02);
          vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.45)) : mix(hor, low, pow(clamp(-h, 0.0, 1.0), 0.35));
          // slow bruised bands, turning round the sky
          float a = atan(d.z, d.x);
          float sw = sin(a * 3.0 + h * 7.0 + sin(a * 5.0 - h * 4.0 + uT * 0.05) * 1.6 + uT * 0.015);
          float near = 1.0 - smoothstep(0.0, 0.7, abs(h - 0.08));
          c += vec3(0.05, 0.05, 0.11) * smoothstep(0.35, 1.0, sw) * near;
          c -= vec3(0.025, 0.03, 0.06) * smoothstep(0.3, 1.0, -sw) * near;
          float sw2 = sin(a * 7.0 - h * 13.0 + uT * 0.02 + sin(a * 2.0) * 2.0);
          c += vec3(0.02, 0.025, 0.06) * smoothstep(0.7, 1.0, sw2) * near;
          // cracks of cold light
          for (int i = 0; i < 4; i++) {
            float w = dot(d, uCC[i]);
            if (w > 0.9) {
              vec3 b = cross(uCC[i], uCT[i]);
              float u = dot(d, uCT[i]);
              float v = dot(d, b);
              float jag = v + 0.012 * sin(u * 70.0 + float(i)) + 0.007 * sin(u * 151.0) + 0.004 * sin(u * 263.0 + uT * 0.3);
              float len = smoothstep(0.2, 0.05, abs(u));
              c += vec3(0.55, 0.75, 1.0) * exp(-abs(jag) * 1400.0) * len * 0.9;
              c += vec3(0.15, 0.22, 0.45) * exp(-abs(jag) * 120.0) * len * 0.35;
            }
          }
          // the gate's light, far ahead
          float g = max(dot(d, uGate), 0.0);
          c += vec3(0.3, 0.6, 0.8) * pow(g, 300.0) * 0.5 + vec3(0.08, 0.16, 0.3) * pow(g, 14.0) * 0.4;
          // a flash somewhere far off
          float f = max(dot(d, uFlash.xyz), 0.0);
          c += vec3(0.35, 0.45, 0.8) * pow(f, 8.0) * uFlash.w;
          // a few stars, not many, not bright
          vec3 q = floor(d * 260.0);
          c += vec3(0.5, 0.6, 0.8) * step(0.9988, hash(q)) * 0.45 * smoothstep(-0.1, 0.3, h);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(520, 40, 20), mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.skyGroup.add(sky);
    return mat;
  }

  /* ------------------------------------------------------------------ */
  /* coming and going                                                     */
  /* ------------------------------------------------------------------ */

  /** the Crater goes; the dimension is all there is */
  enter(a: Arena) {
    if (this.active) return;
    this.active = true;
    setFlatGround(true);
    this.was.clear();
    const hide = (o: THREE.Object3D) => {
      if (!this.was.has(o)) this.was.set(o, o.visible);
      o.visible = false;
    };
    a.crater.setShown(false);
    hide(a.cage.g);
    hide(a.cage.mother.g);
    hide(a.cage.father.g);
    a.pinned.forEach(hide);
    hide(a.clearing);
    hide(a.moth);
    for (const o of a.world.children) if (o.position.y <= -50) hide(o);
    // the Crater's lights go out (all but the Blob's own)
    this.lightWas.clear();
    a.world.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight && l.color.getHex() !== 0xffd878) {
        this.lightWas.set(l, l.intensity);
        l.intensity = 0;
      }
    });
    this.lights.forEach((l) => (l.visible = true));
    this.fogWas = this.scene.fog;
    this.bgWas = this.scene.background as THREE.Color | THREE.Texture | null;
    this.envWas = this.scene.environment;
    this.envIWas = this.scene.environmentIntensity;
    this.scene.fog = new THREE.FogExp2(BG, 0.0135);
    this.scene.background = new THREE.Color(BG);
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 1;
    this.farWas = a.camera.far;
    a.camera.far = 900;
    a.camera.updateProjectionMatrix();
    this.group.visible = true;
    this.cp = { x: WAKE.x, z: WAKE.z };
    this.reached.clear();
    this.moonEyes = 1;
    this.gateEye = 0;
    for (const w of this.watchers) {
      w.spot = -1;
      w.away = 9;
    }
  }

  /** back to the Crater, as it was */
  exit(a: Arena) {
    if (!this.active) return;
    this.active = false;
    setFlatGround(false);
    a.crater.setShown(true);
    for (const [o, v] of this.was) o.visible = v;
    this.was.clear();
    for (const [l, v] of this.lightWas) l.intensity = v;
    this.lightWas.clear();
    this.lights.forEach((l) => (l.visible = false));
    this.scene.fog = this.fogWas;
    this.scene.background = this.bgWas;
    this.scene.environment = this.envWas;
    this.scene.environmentIntensity = this.envIWas;
    a.camera.far = this.farWas;
    a.camera.updateProjectionMatrix();
    this.group.visible = false;
  }

  /** the slab you are on now gives you a new place to wake (returns the slab's index when it is the first time) */
  reach(x: number, z: number): number {
    const i = this.slabAt(x, z);
    if (i < 0) return -1;
    const s = SLABS[i]!;
    if (s.cp && !(this.cp.x === s.cp[0] && this.cp.z === s.cp[1])) {
      // never back: a checkpoint further along the way stays
      const order = SLABS.indexOf(SLABS.find((q) => q.cp && q.cp[0] === this.cp.x && q.cp[1] === this.cp.z) ?? SLABS[0]!);
      if (i > order) this.cp = { x: s.cp[0], z: s.cp[1] };
    }
    if (this.reached.has(i)) return -1;
    this.reached.add(i);
    return i;
  }

  /* ------------------------------------------------------------------ */
  /* every frame                                                          */
  /* ------------------------------------------------------------------ */

  update(dt: number, time: number, cam: THREE.PerspectiveCamera, player: { x: number; z: number }) {
    if (!this.active) return;
    const r = this.r;
    this.skyGroup.position.copy(cam.position);
    this.skyMat.uniforms['uT']!.value = time;
    // the mover
    const mz = this.moverPos(time);
    this.moverDZ = mz - this.moverZ;
    this.moverZ = mz;
    this.mover.position.z = mz;
    this.mover.position.y = Math.sin(time * 1.3) * 0.02;
    // the folding floors
    this.folds.forEach((f, i) => {
      const u = (((time + FOLDS[i]!.off) % FOLD_T) + FOLD_T) % FOLD_T;
      let ang: number;
      let warn = 0;
      if (u < 2.2) ang = 0;
      else if (u < 3.4) {
        ang = (Math.PI / 2) * smooth((u - 2.2) / 1.2);
        warn = (u - 2.2) / 1.2;
      } else if (u < 3.8) {
        ang = Math.PI / 2 + Math.sin(u * 60) * 0.02;
        warn = 1;
      } else if (u < 4.1) {
        const k = (u - 3.8) / 0.3;
        ang = Math.PI / 2 + (Math.PI / 2) * k * k;
        warn = 1;
      } else if (u < 4.75) ang = Math.PI;
      else ang = Math.PI * (1 - smooth((u - 4.75) / 1.45));
      if (f.ang === 0 && ang > 0) this.onFoldRise?.();
      f.ang = ang;
      f.g.rotation.z = ang;
      f.glow.opacity = warn * (0.4 + 0.25 * Math.sin(time * 18)) + (ang > Math.PI * 0.8 ? 0.15 : 0);
    });
    // the gate turns through itself; its eye
    this.gate.update(time * 0.22, time);
    this.gateG.rotation.y = Math.sin(time * 0.1) * 0.3;
    this.gateSlit.scale.set(lerp(0.08, 1, smooth(this.gateEye)), 1, 1);
    const gp = this.gateG.position;
    this.gateSlit.rotation.set(0, Math.atan2(cam.position.x - gp.x, cam.position.z - gp.z) - this.gateG.rotation.y, 0);
    this.gateLight.intensity = 90 * (1 + this.gateEye * 1.5);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = 0.26 + 0.06 * Math.sin(time * 1.7);
    // the cage turns, a little
    this.cage.rotation.y = -0.15 + Math.sin(time * 0.05) * 0.2;
    this.cage.rotation.z = Math.sin(time * 0.13) * 0.02;
    // the moon: it hangs where it hangs, and faces you
    this.moon.position.copy(this.moonDir).multiplyScalar(330);
    this.moon.lookAt(cam.position);
    const blink = this.moonBlinkK(time);
    this.moonEyeG.forEach((g) => g.scale.set(1, Math.max(0.02, this.moonEyes * blink), 1));
    // shards
    this.fragData.forEach((d, i) => {
      this.q.setFromEuler(this.e.set(d.rx + time * d.sp, d.ry + time * d.sp * 0.7, 0));
      this.tmp.compose(this.v.set(d.x, d.y + Math.sin(time * 0.3 + d.bob) * 0.8, d.z), this.q, this.s.setScalar(d.s));
      this.frags.setMatrixAt(i, this.tmp);
    });
    this.frags.instanceMatrix.needsUpdate = true;
    // the knots fold into themselves
    for (const f of this.folders) {
      const k = 0.5 + 0.5 * Math.sin(time * 0.45 + f.ph);
      const fold = smooth(clamp((k - 0.15) / 0.7, 0, 1));
      const rot = this.q.setFromAxisAngle(this.v.set(1, 1, 0).normalize(), fold * Math.PI * 0.9 + time * 0.1);
      let n = 0;
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (let k2 = -1; k2 <= 1; k2++) {
            const p = new THREE.Vector3(i, j, k2).multiplyScalar(1.7 * (1 - fold * 0.92)).applyQuaternion(rot);
            this.tmp.compose(p.add(new THREE.Vector3(f.x, f.y, f.z)), rot, this.s.setScalar(1.5 * (1 - fold * 0.6)));
            f.g.setMatrixAt(n++, this.tmp);
          }
      f.g.instanceMatrix.needsUpdate = true;
    }
    // the motes drift up round you
    const pos = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i) + dt * (0.25 + (i % 5) * 0.06);
      let z = pos.getZ(i);
      if (y > 20) y = -6;
      if (x - player.x > 30) x -= 60;
      if (x - player.x < -30) x += 60;
      if (z - player.z > 30) z -= 60;
      if (z - player.z < -30) z += 60;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    // now and then, far off, a flash: something enormous, somewhere, doing something
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flashT = 9 + r() * 7;
      this.flashK = 1;
      const a = r() * TAU;
      this.flashDir.set(Math.cos(a), -0.05 + r() * 0.25, Math.sin(a)).normalize();
    }
    this.flashK = Math.max(0, this.flashK - dt * 2.2);
    const fl = this.flashK > 0 ? this.flashK * (0.6 + 0.4 * Math.sin(this.flashK * 40)) : 0;
    (this.skyMat.uniforms['uFlash']!.value as THREE.Vector4).set(this.flashDir.x, this.flashDir.y, this.flashDir.z, fl * 0.8);
    this.flash.position.copy(this.flashDir).multiplyScalar(420);
    this.flash.material.opacity = fl * 0.5;
    this.updateWatchers(dt, cam, player);
  }

  /** the moon blinks, slowly, now and then (1 = open) */
  private moonBlinkK(time: number): number {
    const u = time % 23;
    return u > 22.2 ? Math.abs(Math.cos(((u - 22.2) / 0.8) * Math.PI)) : 1;
  }

  private updateWatchers(dt: number, cam: THREE.PerspectiveCamera, player: { x: number; z: number }) {
    cam.updateMatrixWorld();
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const used = new Set(this.watchers.map((w) => w.spot));
    for (const w of this.watchers) {
      const seen = w.spot >= 0 && this.frustum.containsPoint(this.v.copy(w.g.position).add(this.s.set(0, 5, 0)));
      w.away = seen ? 0 : w.away + dt;
      // looked away long enough: it is somewhere else now, a little further along your way
      if (w.away > 1.4) {
        const cands = this.spots
          .map((p, i) => ({ p, i }))
          .filter(({ p, i }) => {
            if (used.has(i)) return false;
            const d = Math.hypot(p.x - player.x, p.z - player.z);
            return d > 24 && d < 75 && p.z < player.z + 10 && !this.frustum.containsPoint(this.v.copy(p).add(this.s.set(0, 5, 0)));
          });
        if (cands.length) {
          const c = cands[Math.floor(this.r() * cands.length)]!;
          used.delete(w.spot);
          w.spot = c.i;
          used.add(c.i);
          w.g.position.copy(c.p);
          w.g.visible = true;
        } else if (w.spot < 0) w.g.visible = false;
        w.away = 0;
      }
      // it faces you
      w.g.rotation.y = Math.atan2(player.x - w.g.position.x, player.z - w.g.position.z);
    }
    void unlerp;
  }

  /** where the moon is (for the camera to look at it) */
  moonPoint(cam: THREE.Vector3): THREE.Vector3 {
    return this.moonDir.clone().multiplyScalar(330).add(cam);
  }

  /** where the gate's eye is */
  gatePoint(): THREE.Vector3 {
    return this.gateG.position.clone();
  }
}
