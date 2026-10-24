import * as THREE from 'three';
import type { Arena } from './arena';
import { setFlatGround } from './ground';
import { glowTexture } from './fourth-model';
import { clamp, rng, smooth, TAU } from '../core/util';

/**
 * THE FOURTH DIMENSION: where the Fourth takes the family, and where they fight it together.
 *
 * A round floor of dark stone blocks, the face of a dial, hangs over a drop with no bottom. Cold light runs in its cracks from the
 * middle out to the hours; the hours are stubs of broken stone round its rim. Its underside hangs down in a long ragged cone.
 * All round it, columns come up out of nothing and stop, towers hang upside down from rocks in the air, land floats far off the
 * wrong way up, shards turn slowly round the dial, and knots of blocks fold into themselves and back. Behind where the Fourth
 * floats, very high, hangs an enormous cage, empty, its door open. The sky is a slow bruise with cracks of light in it, and the
 * moon has a face: two slanted white eyes, and something dark running down from them. Thin tall shapes stand on the columns and
 * watch; when you look away, they are somewhere else. Now and then something flashes, far off.
 *
 * Every colour here is cold; the only warm light is the family's own.
 *
 * The floor is flat (see setFlatGround) and round: WORLD_R from the middle.
 */

export const WORLD_R = 15;

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

export class FourthWorld {
  readonly group = new THREE.Group();
  /** the sky things follow the camera: they are as far away as anything can be */
  private skyGroup = new THREE.Group();
  active = false;
  /** how open the moon's eyes are (0..1+) */
  moonEyes = 1;

  private scene: THREE.Scene;
  private skyMat: THREE.ShaderMaterial;
  private moon = new THREE.Group();
  private moonEyeG: THREE.Group[] = [];
  private moonDir = new THREE.Vector3(0.42, 0.33, -1).normalize();
  private cage = new THREE.Group();
  private frags!: THREE.InstancedMesh;
  private fragData: { x: number; y: number; z: number; s: number; rx: number; ry: number; sp: number; bob: number; kind: number }[] = [];
  private fragSpin = new THREE.Group();
  private folders: { g: THREE.InstancedMesh; x: number; y: number; z: number; ph: number }[] = [];
  private watchers: Watcher[] = [];
  private spots: THREE.Vector3[] = [];
  private motes!: THREE.Points;
  private flash!: THREE.Sprite;
  private flashT = 6;
  private flashK = 0;
  private flashDir = new THREE.Vector3(1, 0, 0);
  private cracks!: THREE.InstancedMesh;
  private lights: THREE.Light[] = [];
  private lightOn = new Map<THREE.Light, number>();
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
    this.buildFloor();
    this.buildPillars();
    this.buildTowers();
    this.buildFar();
    this.buildCage();
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
  /* building                                                             */
  /* ------------------------------------------------------------------ */

  private rock(): number {
    return ROCK[Math.floor(this.r() * ROCK.length)]!;
  }

  /**
   * The dial: blocks of dark stone, the top of each at the floor; under it they hang down deeper toward the middle, a ragged
   * cone of rock with spikes. A ring of glossy black near the middle, and a glossy middle, both mirrors for the light. Cracks of
   * cold light from the middle out to the twelve hours; the hours are broken stones round the rim, one of them a tall monolith.
   * And a bridge that goes out from the rim into the dark, and breaks, and goes nowhere.
   */
  private buildFloor() {
    const rock = new Vox();
    const gloss = new Vox();
    const glow = new Vox();
    const r = this.r;
    const RIM = WORLD_R + 1.3;
    for (let x = -RIM; x <= RIM; x += 1) {
      for (let z = -RIM; z <= RIM; z += 1) {
        const cx = x + 0.5;
        const cz = z + 0.5;
        const d = Math.hypot(cx, cz);
        if (d > RIM + (r() - 0.5) * 0.9) continue;
        const edge = d > WORLD_R + 0.3;
        // the top: at the floor inside; ragged and lower at the very rim
        const top = edge ? -0.15 - r() * 0.5 : -r() * 0.04;
        const depth = 1.2 + Math.max(0, RIM - d) * 0.95 + r() * 1.8;
        const glossy = (d > 5.4 && d < 6.9) || d < 2.3;
        if (glossy && !edge) {
          gloss.add(cx, top - 0.15, cz, 0.97, 0.3, 0.97, r() < 0.5 ? 0x2e3c60 : 0x263352);
          rock.add(cx, top - 0.3 - depth / 2, cz, 1, depth, 1, this.rock());
        } else rock.add(cx, top - depth / 2, cz, 1, depth, 1, this.rock(), edge ? (r() - 0.5) * 0.3 : 0, 0, edge ? (r() - 0.5) * 0.3 : 0);
        // spikes hanging under it
        if (r() < 0.1) {
          const L = 3 + r() * 9;
          rock.add(cx + (r() - 0.5) * 0.3, -depth - L / 2 + 0.5, cz + (r() - 0.5) * 0.3, 0.6, L, 0.6, this.rock());
        }
        // cold light down the outside of the rim
        if (edge && r() < 0.18) {
          const L = 1 + r() * 4;
          glow.add(cx, top - L / 2, cz, 0.06, L, 0.06, CRACK);
        }
      }
    }
    // the rings round the mirrors: thin lines of light
    for (const [R, n] of [
      [5.35, 64],
      [6.95, 80],
      [2.35, 28],
      [WORLD_R - 0.2, 150],
    ] as const) {
      for (let i = 0; i < n; i++) {
        if (R > 10 && r() < 0.3) continue;
        const a0 = (i / n) * TAU;
        const a1 = ((i + 1) / n) * TAU;
        glow.beam(new THREE.Vector3(Math.sin(a0) * R, 0.015, Math.cos(a0) * R), new THREE.Vector3(Math.sin(a1) * R, 0.015, Math.cos(a1) * R), 0.05, R > 10 ? 0x2a8fb0 : CRACK);
      }
    }
    // cracks from the middle out to the hours, never straight
    for (let h = 0; h < 12; h++) {
      let a = (h / 12) * TAU + (r() - 0.5) * 0.1;
      let d = 2.5;
      let px = Math.sin(a) * d;
      let pz = Math.cos(a) * d;
      while (d < WORLD_R - 0.6) {
        d += 0.5 + r() * 0.9;
        a += (r() - 0.5) * 0.12;
        const nx = Math.sin(a) * d;
        const nz = Math.cos(a) * d;
        glow.beam(new THREE.Vector3(px, 0.02, pz), new THREE.Vector3(nx, 0.02, nz), 0.07, r() < 0.2 ? 0x8fe8ff : CRACK);
        // a branch now and then
        if (r() < 0.15) {
          const b = a + (r() < 0.5 ? 0.5 : -0.5);
          glow.beam(new THREE.Vector3(nx, 0.02, nz), new THREE.Vector3(nx + Math.sin(b) * 1.4, 0.02, nz + Math.cos(b) * 1.4), 0.05, CRACK);
        }
        px = nx;
        pz = nz;
      }
      // the hour: a broken stone at the rim (twelve o'clock, behind where it floats, is a tall monolith)
      const ha = (h / 12) * TAU;
      const hx = Math.sin(ha) * (WORLD_R + 0.6);
      const hz = Math.cos(ha) * (WORLD_R + 0.6);
      // (the hours on the near side stay low: the camera stands behind them)
      const H = h === 6 ? 11 : h === 3 || h === 9 ? 3.5 + r() * 2 : h === 0 || h === 1 || h === 11 ? 0.5 + r() * 0.4 : 0.8 + r() * 1.8;
      const lean = (r() - 0.5) * 0.18;
      for (let y = 0; y < H; y += 1.4) {
        const hh = Math.min(1.4, H - y);
        rock.add(hx + Math.sin(lean) * y, y + hh / 2, hz, 1.3, hh + 0.02, 1.0, this.rock(), 0, ha, lean);
      }
      glow.add(hx - Math.sin(ha) * 0.52, H * 0.5, hz - Math.cos(ha) * 0.52, 0.06, Math.max(0.4, H * 0.6), 0.06, h === 6 ? PALE : CRACK, 0, ha, lean);
      if (H > 3) for (let k = 0; k < 2; k++) rock.add(hx + (r() - 0.5), H + 1.8 + k * 1.2, hz + (r() - 0.5), 0.6, 0.5, 0.6, this.rock(), r() * 3, r() * 3, r() * 3);
    }
    // a bridge out from the rim (to the left of where it floats), broken, its last pieces drifting down into the drop
    const ba = -2.3;
    for (let k = 0; k < 14; k++) {
      const d = WORLD_R + 1.6 + k * 2.1 + (k > 5 ? (k - 5) * 0.9 : 0);
      if (k === 4 || k === 9) continue;
      const drop = k > 5 ? (k - 5) * (k - 5) * 0.22 : 0;
      const bx = Math.sin(ba) * d;
      const bz = Math.cos(ba) * d;
      const tilt = k > 5 ? (r() - 0.5) * 0.4 : 0;
      rock.add(bx, -0.4 - drop, bz, 3, 0.8, 2.2, this.rock(), tilt, ba, tilt * 0.6);
      rock.add(bx, -1.6 - drop, bz, 2.2, 1.6, 1.6, this.rock(), tilt, ba, tilt * 0.6);
      if (k % 3 === 0) glow.add(bx, -0.02 - drop, bz, 2.6, 0.03, 0.06, CRACK, tilt, ba, tilt * 0.6);
    }
    rock.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.1 }), this.group);
    // (polished, but stone, not mirror: a mirror of this sky is black, and a black disc on the floor reads as a shadow)
    gloss.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.25, envMapIntensity: 1.2, emissive: 0x0b1530 }), this.group);
    this.cracks = glow.build(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), this.group);
    // far frames: rectangles of stone with nothing in them, tilted, out in the dark
    const fr = new Vox();
    const fg = new Vox();
    const far: [number, number, number, number, number, number][] = [
      [-34, -4, -36, 16, 26, 0.3],
      [40, -8, -30, 20, 30, -0.4],
      [-46, 6, 20, 18, 24, 0.9],
      [30, 14, 40, 14, 22, -0.2],
      [-8, -30, -46, 24, 34, 1.4],
    ];
    for (const [x, y, z, w2, h2, rz] of far) this.frame(fr, fg, new THREE.Vector3(x, y, z), w2, h2, 1.4, new THREE.Euler(r() * 0.4, r() * TAU, rz));
    fr.build(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.15 }), this.group);
    fg.build(new THREE.MeshBasicMaterial({ color: 0xffffff }), this.group);
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

  /** columns that come up out of the drop from no floor at all */
  private buildPillars() {
    const v = new Vox();
    const glow = new Vox();
    const r = this.r;
    // a broken ring of them round the dial, like the hours of something enormous, and more further out
    const list: [number, number, number, number][] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + 0.2 + (this.r() - 0.5) * 0.25;
      const d = 23 + this.r() * 7;
      list.push([Math.sin(a) * d, Math.cos(a) * d, -4 + this.r() * 18, 3.5 + this.r() * 2.5]);
    }
    for (let i = 0; i < 9; i++) {
      const a = this.r() * TAU;
      const d = 45 + this.r() * 40;
      list.push([Math.sin(a) * d, Math.cos(a) * d, -20 + this.r() * 40, 5 + this.r() * 5]);
    }
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
      [-24, 30, -26, 1.3],
      [27, 34, -30, 1.5],
      [-40, 38, 4, 1.2],
      [38, 30, 12, 1.0],
      [-12, 52, -90, 2.2],
      [20, 44, -80, 1.6],
      [4, 40, 46, 1.2],
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
    // far behind where it floats, high, so that it hangs over the whole fight
    this.cage.position.set(0, 26, -62);
    this.cage.rotation.y = -0.15;
    this.group.add(this.cage);
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
        x = (r() - 0.5) * 140;
        y = -40 + r() * 75;
        z = (r() - 0.5) * 140;
        // never over the floor, never in the camera's way
        if (Math.hypot(x, z) > 22 || y < -8) break;
      }
      this.fragData.push({ x, y, z, s: 0.3 + r() * r() * 3.5, rx: r() * TAU, ry: r() * TAU, sp: (0.05 + r() * 0.2) * (r() < 0.5 ? -1 : 1), bob: r() * TAU, kind: r() < 0.12 ? 1 : 0 });
    }
    this.frags = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.4, flatShading: true }), N);
    this.fragData.forEach((d, i) => this.frags.setColorAt(i, new THREE.Color(d.kind ? 0x2a6a8a : this.rock())));
    this.frags.frustumCulled = false;
    this.fragSpin.add(this.frags);
    this.group.add(this.fragSpin);
  }

  /** knots of blocks that fold into themselves until there is nothing, and come back */
  private buildFolders() {
    const list: [number, number, number][] = [
      [-21, 9, -18],
      [24, 12, -22],
      [-28, 6, 14],
      [8, 16, -40],
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
    // a cold light from high above, straight down onto the dial: the only thing lit like a stage
    const top = new THREE.SpotLight(0xa8c0ff, 3.2, 0, 0.42, 0.85, 0);
    top.position.set(0, 46, 6);
    top.target.position.set(0, 0, -1);
    // (in the scene from the start, dark until the world is entered: a light coming into the scene, or leaving it, makes every
    // material rebuild its shader, which is a long stall; turning one up or down costs nothing)
    for (const l of [amb, rim, fill, top]) {
      this.lightOn.set(l, l.intensity);
      l.intensity = 0;
      this.lights.push(l);
      this.scene.add(l);
    }
    this.scene.add(rim.target, top.target);
  }

  private buildSky(): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uT: { value: 0 },
        uGate: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
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
            return d > 20 && d < 80 && !this.frustum.containsPoint(this.v.copy(p).add(this.s.set(0, 5, 0)));
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
  }

  /** the moon blinks, slowly, now and then (1 = open) */
  private moonBlinkK(time: number): number {
    const u = time % 23;
    return u > 22.2 ? Math.abs(Math.cos(((u - 22.2) / 0.8) * Math.PI)) : 1;
  }

  /* ------------------------------------------------------------------ */
  /* coming and going                                                     */
  /* ------------------------------------------------------------------ */

  /** the Crater goes; this is all there is */
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
    a.pinned.forEach(hide);
    hide(a.clearing);
    for (const o of a.world.children) if (o.position.y <= -50) hide(o);
    // the Crater's lights go out (all but the Blob's own)
    this.lightWas.clear();
    a.world.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight && l.color.getHex() !== 0xffd878 && l.intensity > 0 && l.parent === a.world) {
        this.lightWas.set(l, l.intensity);
        l.intensity = 0;
      }
    });
    this.lights.forEach((l) => (l.intensity = this.lightOn.get(l) ?? 1));
    this.fogWas = this.scene.fog;
    this.bgWas = this.scene.background as THREE.Color | THREE.Texture | null;
    this.envWas = this.scene.environment;
    this.envIWas = this.scene.environmentIntensity;
    this.scene.fog = new THREE.FogExp2(BG, 0.011);
    this.scene.background = new THREE.Color(BG);
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 1;
    this.farWas = a.camera.far;
    a.camera.far = 900;
    a.camera.updateProjectionMatrix();
    this.group.visible = true;
    this.moonEyes = 1;
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
    this.lights.forEach((l) => (l.intensity = 0));
    this.scene.fog = this.fogWas;
    this.scene.background = this.bgWas;
    this.scene.environment = this.envWas;
    this.scene.environmentIntensity = this.envIWas;
    a.camera.far = this.farWas;
    a.camera.updateProjectionMatrix();
    this.group.visible = false;
  }

  /* ------------------------------------------------------------------ */
  /* every frame                                                          */
  /* ------------------------------------------------------------------ */

  update(dt: number, time: number, cam: THREE.PerspectiveCamera, player: { x: number; z: number }) {
    if (!this.active) return;
    const r = this.r;
    this.skyGroup.position.copy(cam.position);
    this.skyMat.uniforms['uT']!.value = time;
    // the cracks breathe
    (this.cracks.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(time * 0.9);
    // the cage turns, a little
    this.cage.rotation.y = -0.15 + Math.sin(time * 0.05) * 0.2;
    this.cage.rotation.z = Math.sin(time * 0.13) * 0.02;
    // the moon: it hangs where it hangs, and faces you
    this.moon.position.copy(this.moonDir).multiplyScalar(330);
    this.moon.lookAt(cam.position);
    const blink = this.moonBlinkK(time);
    this.moonEyeG.forEach((g) => g.scale.set(1, Math.max(0.02, this.moonEyes * blink), 1));
    // shards, turning slowly round the dial
    this.fragSpin.rotation.y = time * 0.012;
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

  /** where the moon is (for the camera to look at it) */
  moonPoint(cam: THREE.Vector3): THREE.Vector3 {
    return this.moonDir.clone().multiplyScalar(330).add(cam);
  }
}
