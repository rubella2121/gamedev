import * as THREE from 'three';
import { TubeChain } from '../kit/chain';
import { mix, rgb } from '../kit/noise';
import { halo, skin } from '../kit/skin';
import { PAL, stingerGeometry, vertebraGeometry } from './mash-shapes';

/**
 * The Mash's scorpion tail: 26 spiked vertebrae on a stretchy sinew, ending in a hollow bone stinger.
 *
 * How it moves. The owner says where the needle tip should be, which way it points and how long the tail is right now
 * (`TailCtrl`). From that an "ideal" curve is solved every frame: a cubic Bezier from the root to the stinger whose
 * length is exactly the tail's length (a long tail with a near tip bends into a tall hook, a stretched one lies out
 * straight). Then comes the whip: every joint shows the ideal pose of a moment ago, the further from the root the
 * longer ago, so a change at the root travels down the tail and arrives at the tip last. Waves are added on top, and
 * the vertebrae spread apart on the sinew when it stretches.
 */

export const TAIL_N = 26;
/** how far the needle tip is beyond the last joint (along the tail), in model units */
export const STING_LEN = 4.25;
/** the sinew can stretch to this length (model units); idle it is much shorter */
export const TAIL_LMAX = 45;
export const TAIL_L_IDLE = 25;

export interface TailCtrl {
  /** where the needle tip is (root space) */
  tip: THREE.Vector3;
  /** the direction the stinger points (unit) */
  tipDir: THREE.Vector3;
  /** the direction the tail leaves the root (unit) */
  baseDir: THREE.Vector3;
  /** total length of the chain from the root to the last joint */
  len: number;
  /** lateral wave: amplitude in model units, and its speed (Hz) */
  wave: number;
  waveHz: number;
  /** stinger glow 0..1 */
  glow: number;
  /** how long ago the tip shows the ideal pose (seconds); the root shows it now */
  lag: number;
  /** 0..1: how much the vertebrae bristle */
  bristle: number;
  /** hand-shaped waypoints between the root and the stinger (a curl); `viaW` is how much they count against the solved arc */
  via: THREE.Vector3[];
  viaW: number;
}

export const VIA_N = 4;

export function newCtrl(): TailCtrl {
  return {
    tip: new THREE.Vector3(),
    tipDir: new THREE.Vector3(0, -1, 0),
    baseDir: new THREE.Vector3(0, 1, 0),
    len: TAIL_L_IDLE,
    wave: 0,
    waveHz: 1,
    glow: 0,
    lag: 0.16,
    bristle: 0,
    via: Array.from({ length: VIA_N }, () => new THREE.Vector3()),
    viaW: 0,
  };
}

export function copyCtrl(a: TailCtrl, b: TailCtrl) {
  a.tip.copy(b.tip);
  a.tipDir.copy(b.tipDir);
  a.baseDir.copy(b.baseDir);
  a.len = b.len;
  a.wave = b.wave;
  a.waveHz = b.waveHz;
  a.glow = b.glow;
  a.lag = b.lag;
  a.bristle = b.bristle;
  for (let i = 0; i < VIA_N; i++) a.via[i]!.copy(b.via[i]!);
  a.viaW = b.viaW;
}

export function mixCtrl(out: TailCtrl, a: TailCtrl, b: TailCtrl, u: number) {
  out.tip.lerpVectors(a.tip, b.tip, u);
  out.tipDir.lerpVectors(a.tipDir, b.tipDir, u).normalize();
  out.baseDir.lerpVectors(a.baseDir, b.baseDir, u).normalize();
  out.len = a.len + (b.len - a.len) * u;
  out.wave = a.wave + (b.wave - a.wave) * u;
  out.waveHz = a.waveHz + (b.waveHz - a.waveHz) * u;
  out.glow = a.glow + (b.glow - a.glow) * u;
  out.lag = a.lag + (b.lag - a.lag) * u;
  out.bristle = a.bristle + (b.bristle - a.bristle) * u;
  for (let i = 0; i < VIA_N; i++) out.via[i]!.lerpVectors(a.via[i]!, b.via[i]!, u);
  out.viaW = a.viaW + (b.viaW - a.viaW) * u;
}

const HIST = 34;
const MIN_STEP = 1 / 100;
const M = 72;

export class ScorpionTail {
  readonly group = new THREE.Group();
  /** the joints, root space, after the whip and the waves */
  readonly pts: THREE.Vector3[] = Array.from({ length: TAIL_N }, () => new THREE.Vector3());
  /** the joint frames: tangent and dorsal direction */
  readonly tan: THREE.Vector3[] = Array.from({ length: TAIL_N }, () => new THREE.Vector3(0, 1, 0));
  readonly dor: THREE.Vector3[] = Array.from({ length: TAIL_N }, () => new THREE.Vector3(0, 0, -1));
  readonly base = new THREE.Vector3(2.6, 2.4, -3.0);
  readonly ctrl = newCtrl();
  /** needle tip, root space, after the whip (what hits the floor) */
  readonly tipPos = new THREE.Vector3();
  readonly tipTan = new THREE.Vector3(0, -1, 0);
  /** drips and glow are driven here */
  glowNow = 0;
  private tube: TubeChain;
  private verts: THREE.InstancedMesh;
  private stinger: THREE.Group;
  private stingerMesh: THREE.Mesh;
  private venom: THREE.Mesh;
  private venomHalo: THREE.Sprite;
  private drips: THREE.InstancedMesh;
  private dripData: { y: number; vy: number; x: number; z: number; on: boolean }[] = [];
  private dripT = 0;
  private hist = new Float32Array(HIST * TAIL_N * 3);
  private histT = new Float32Array(HIST);
  private hn = 0;
  private hi = 0;
  private lastPush = -9;
  private ideal = new Float32Array(TAIL_N * 3);
  private curve = new Float32Array(100 * 3);
  private clen = new Float32Array(100);
  private outS = new Float32Array(TAIL_N * 3);
  private sp: THREE.Vector3[] = [];
  private lag = 0.16;
  private tmp = new THREE.Vector3();
  private t1 = new THREE.Vector3();
  private t2 = new THREE.Vector3();
  private p0 = new THREE.Vector3();
  private p1 = new THREE.Vector3();
  private p2 = new THREE.Vector3();
  private p3 = new THREE.Vector3();
  private e = new THREE.Vector3();
  private w = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private o = new THREE.Object3D();
  private mats: THREE.MeshToonMaterial[] = [];
  private baseEm = [new THREE.Color(0x3a2c18), new THREE.Color(0x140609)];
  private pillars: { x: number; z: number; r: number }[] = [];
  private shiverT = 0;
  private clock = 0;
  private wavePh = 0;

  constructor() {
    // a little warm light of their own, so the bone stays bone-coloured under the cold lights of the arena
    const bone = skin({ vertexColors: true, rim: 0xd8c488, rimPower: 3.4, emissive: 0x3a2c18 });
    const sinew = skin({ vertexColors: true, rim: 0x8a2a44, rimPower: 2.6, emissive: 0x140609 });
    this.mats.push(bone, sinew);
    this.tube = new TubeChain(
      TAIL_N,
      7,
      sinew,
      (u) => 0.5 - 0.2 * u,
      (u, a) => mix(rgb(0x1a0a10), rgb(0x582030), 0.5 + 0.5 * Math.sin(a * 2 + u * 14) * Math.sin(u * 30 + a)),
    );
    this.group.add(this.tube.mesh);
    // the vertebrae: instanced, one per joint after the root
    this.verts = new THREE.InstancedMesh(vertebraGeometry(), bone, TAIL_N - 1);
    this.verts.frustumCulled = false;
    this.group.add(this.verts);
    // the stinger and its venom
    this.stinger = new THREE.Group();
    this.stingerMesh = new THREE.Mesh(stingerGeometry(), bone);
    this.stinger.add(this.stingerMesh);
    this.venom = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb8ff7a, fog: false, transparent: true, opacity: 0.85 }));
    this.venom.position.set(0, 0, 0.85);
    this.stinger.add(this.venom);
    this.venomHalo = halo(0xa8ff5a, 4.2, 0.0);
    this.venomHalo.position.set(0, 0, 0.9);
    this.stinger.add(this.venomHalo);
    this.group.add(this.stinger);
    // venom drips
    this.drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshBasicMaterial({ color: 0xc8ff8a, fog: false }), 4);
    this.drips.frustumCulled = false;
    this.group.add(this.drips);
    for (let i = 0; i < 4; i++) this.dripData.push({ y: 0, vy: 0, x: 0, z: 0, on: false });
    this.group.frustumCulled = false;
  }

  /** The flash on being hit. */
  flash(v: number) {
    this.mats.forEach((m, i) => {
      const b = this.baseEm[i]!;
      m.emissive.setRGB(b.r + v, b.g + v * 0.9, b.b + v * 0.95);
    });
  }

  /** a glow of one colour (the death: it turns into the Bone Wyrm's bone-white) */
  tint(r: number, g: number, b: number) {
    this.mats.forEach((m, i) => {
      const e = this.baseEm[i]!;
      m.emissive.setRGB(e.r + r, e.g + g, e.b + b);
    });
  }

  /** the pillars that the tail rides over when it sweeps (root space) */
  setPillars(list: { x: number; z: number; r: number }[]) {
    this.pillars = list;
  }

  /** Forget the whip: show the ideal pose at once. */
  snap() {
    this.solve(this.ideal, this.clock);
    for (let k = 0; k < HIST; k++) {
      this.hist.set(this.ideal, k * TAIL_N * 3);
      this.histT[k] = this.clock - (HIST - 1 - k) * 0.01 - 0.001;
    }
    this.hn = HIST;
    this.hi = HIST - 1;
    this.lastPush = this.clock;
  }

  /** Arc length of the cubic through the control points, by sampling. */
  private arcLen(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3): number {
    let len = 0;
    let px = p0.x;
    let py = p0.y;
    let pz = p0.z;
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      const a = (1 - t) * (1 - t) * (1 - t);
      const b = 3 * t * (1 - t) * (1 - t);
      const c = 3 * t * t * (1 - t);
      const d = t * t * t;
      const x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
      const y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
      const z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
      len += Math.hypot(x - px, y - py, z - pz);
      px = x;
      py = y;
      pz = z;
    }
    return len;
  }

  /** The ideal pose for the current control and time, into `out` (root space, TAIL_N points, equal arc spacing). */
  private solve(out: Float32Array, time: number) {
    const c = this.ctrl;
    const { p0, p1, p2, p3, e, tmp } = this;
    p0.copy(this.base);
    // the end of the chain is the needle tip pulled back along the stinger
    e.copy(c.tip).addScaledVector(c.tipDir, -STING_LEN);
    const chord = p0.distanceTo(e);
    const L = Math.max(c.len, 2);
    if (chord > L * 0.985) e.sub(p0).multiplyScalar((L * 0.985) / chord).add(p0);
    p3.copy(e);
    // find the handle length that makes the curve exactly as long as the tail
    let lo = 0.02 * L;
    let hi = 1.3 * L;
    let h = 0.4 * L;
    for (let it = 0; it < 13; it++) {
      h = (lo + hi) * 0.5;
      p1.copy(p0).addScaledVector(c.baseDir, h);
      p2.copy(p3).addScaledVector(c.tipDir, -h);
      const l = this.arcLen(p0, p1, p2, p3);
      if (l < L) lo = h;
      else hi = h;
    }
    p1.copy(p0).addScaledVector(c.baseDir, h);
    p2.copy(p3).addScaledVector(c.tipDir, -h);
    // sample the arc, then spread the joints at equal distances along it
    const { curve } = this;
    for (let i = 0; i <= M; i++) {
      const t = i / M;
      const a = (1 - t) * (1 - t) * (1 - t);
      const b = 3 * t * (1 - t) * (1 - t);
      const cc = 3 * t * t * (1 - t);
      const d = t * t * t;
      curve[i * 3] = a * p0.x + b * p1.x + cc * p2.x + d * p3.x;
      curve[i * 3 + 1] = a * p0.y + b * p1.y + cc * p2.y + d * p3.y;
      curve[i * 3 + 2] = a * p0.z + b * p1.z + cc * p2.z + d * p3.z;
    }
    this.resample(out, M);
    // hand-shaped waypoints: a Catmull-Rom curve through them, blended in
    if (c.viaW > 0.001) {
      const n = this.spline(p0, c.via, p3);
      this.resample(this.outS, n);
      const w = Math.min(1, c.viaW);
      for (let k = 0; k < TAIL_N * 3; k++) out[k] = out[k]! + (this.outS[k]! - out[k]!) * w;
    }
    // waves: sideways (horizontal, across the chord) and up-and-down along the curve's normal
    const amp = c.wave;
    if (amp > 0.001) {
      const w = this.w;
      tmp.copy(p3).sub(p0);
      w.set(-tmp.z, 0, tmp.x);
      if (w.lengthSq() < 1e-4) w.set(1, 0, 0);
      w.normalize();
      for (let j = 1; j < TAIL_N; j++) {
        const u = j / (TAIL_N - 1);
        const env = Math.sin(Math.PI * Math.min(1, u * 1.04)) * (0.35 + 0.65 * u);
        const ph = this.wavePh - u * 7.5;
        const a = amp * env * Math.sin(ph);
        const b = amp * env * 0.55 * Math.cos(ph * 0.83 + 1.2);
        out[j * 3] = out[j * 3]! + w.x * a;
        out[j * 3 + 1] = out[j * 3 + 1]! + b;
        out[j * 3 + 2] = out[j * 3 + 2]! + w.z * a;
      }
    }
  }

  /** Joints at equal distances along the sampled curve (n+1 samples in `this.curve`). */
  private resample(out: Float32Array, n: number) {
    const { curve, clen } = this;
    let acc = 0;
    clen[0] = 0;
    for (let i = 1; i <= n; i++) {
      acc += Math.hypot(curve[i * 3]! - curve[i * 3 - 3]!, curve[i * 3 + 1]! - curve[i * 3 - 2]!, curve[i * 3 + 2]! - curve[i * 3 - 1]!);
      clen[i] = acc;
    }
    let seg = 0;
    for (let j = 0; j < TAIL_N; j++) {
      const target = (j / (TAIL_N - 1)) * acc;
      while (seg < n - 1 && clen[seg + 1]! < target) seg++;
      const span = clen[seg + 1]! - clen[seg]! || 1;
      const f = Math.min(1, Math.max(0, (target - clen[seg]!) / span));
      out[j * 3] = curve[seg * 3]! + (curve[seg * 3 + 3]! - curve[seg * 3]!) * f;
      out[j * 3 + 1] = curve[seg * 3 + 1]! + (curve[seg * 3 + 4]! - curve[seg * 3 + 1]!) * f;
      out[j * 3 + 2] = curve[seg * 3 + 2]! + (curve[seg * 3 + 5]! - curve[seg * 3 + 2]!) * f;
    }
  }

  /** A Catmull-Rom curve through the root, the waypoints and the end, sampled into `this.curve`; returns the last sample index. */
  private spline(a: THREE.Vector3, via: THREE.Vector3[], e: THREE.Vector3): number {
    const P = this.sp;
    P[0] = a;
    for (let i = 0; i < via.length; i++) P[i + 1] = via[i]!;
    P[via.length + 1] = e;
    const m = via.length + 2;
    const K = 14;
    const { curve } = this;
    let o = 0;
    for (let s = 0; s < m - 1; s++) {
      const p0 = P[Math.max(0, s - 1)]!;
      const p1 = P[s]!;
      const p2 = P[s + 1]!;
      const p3 = P[Math.min(m - 1, s + 2)]!;
      for (let k = 0; k < K; k++) {
        const t = k / K;
        const t2 = t * t;
        const t3 = t2 * t;
        curve[o * 3] = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        curve[o * 3 + 1] = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        curve[o * 3 + 2] = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
        o++;
      }
    }
    curve[o * 3] = e.x;
    curve[o * 3 + 1] = e.y;
    curve[o * 3 + 2] = e.z;
    return o;
  }

  /** Where joint i was at time tq, from the history. */
  private sample(i: number, tq: number, out: THREE.Vector3) {
    const N3 = TAIL_N * 3;
    const H = this.hist;
    let k2 = this.hi;
    if (tq < this.histT[k2]!) {
      let steps = 0;
      while (steps < this.hn - 1) {
        const k = (k2 - 1 + HIST) % HIST;
        if (this.histT[k]! <= tq) {
          const f = (tq - this.histT[k]!) / (this.histT[k2]! - this.histT[k]! || 1);
          const a = k * N3 + i * 3;
          const b = k2 * N3 + i * 3;
          out.set(H[a]! + (H[b]! - H[a]!) * f, H[a + 1]! + (H[b + 1]! - H[a + 1]!) * f, H[a + 2]! + (H[b + 2]! - H[a + 2]!) * f);
          return;
        }
        k2 = k;
        steps++;
      }
    }
    const a = k2 * N3 + i * 3;
    out.set(H[a]!, H[a + 1]!, H[a + 2]!);
  }

  /** Advance: solve the ideal pose, push it into the history, read every joint at its own delay, draw. */
  update(dt: number) {
    this.clock += dt;
    const time = this.clock;
    const c = this.ctrl;
    this.wavePh += dt * c.waveHz * Math.PI * 2;
    this.lag += (c.lag - this.lag) * (1 - Math.exp(-6 * dt));
    this.solve(this.ideal, time);
    // history (never faster than 100 Hz, so a hit-stop does not erase it)
    if (time - this.lastPush >= MIN_STEP || this.hn === 0) {
      this.hi = (this.hi + 1) % HIST;
      this.hist.set(this.ideal, this.hi * TAIL_N * 3);
      this.histT[this.hi] = time;
      this.hn = Math.min(HIST, this.hn + 1);
      this.lastPush = time;
    } else {
      this.hist.set(this.ideal, this.hi * TAIL_N * 3);
      this.histT[this.hi] = time;
    }
    const { pts } = this;
    for (let i = 0; i < TAIL_N; i++) {
      const u = i / (TAIL_N - 1);
      const tau = this.lag * Math.pow(u, 1.35);
      if (tau < 0.002) pts[i]!.set(this.ideal[i * 3]!, this.ideal[i * 3 + 1]!, this.ideal[i * 3 + 2]!);
      else this.sample(i, time - tau, pts[i]!);
    }
    // the tail rides over the pillars when it lashes low (the lee of a pillar is safe)
    if (this.pillars.length) this.liftOverPillars();
    this.frames();
    this.draw(time, dt);
  }

  private liftOverPillars() {
    for (const p of this.pillars) {
      if (p.r <= 0) continue;
      for (let i = 2; i < TAIL_N; i++) {
        const q = this.pts[i]!;
        if (q.y > 4.6) continue;
        // the lee runs away from the root: measure along the line from the tail's root to the pillar
        const ux = p.x - this.base.x;
        const uz = p.z - this.base.z;
        const ul = Math.hypot(ux, uz) || 1;
        const along = ((q.x - p.x) * ux + (q.z - p.z) * uz) / ul;
        const perp = Math.abs(((q.x - p.x) * uz - (q.z - p.z) * ux) / ul);
        const wd = p.r + 0.8;
        if (perp > wd + 0.8) continue;
        const a = along < -p.r - 1.0 ? 0 : along < -p.r ? (along + p.r + 1.0) : along < 3.6 ? 1 : along < 5.0 ? (5.0 - along) / 1.4 : 0;
        const b = perp < wd ? 1 : (wd + 0.8 - perp) / 0.8;
        const lift = 3.9 * Math.max(0, a) * Math.max(0, b);
        if (q.y < lift) q.y = lift;
      }
    }
  }

  /** tangents and a dorsal direction at every joint (parallel transported from the root) */
  private frames() {
    const { pts, tan, dor, t1 } = this;
    for (let i = 0; i < TAIL_N; i++) {
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(TAIL_N - 1, i + 1)]!;
      tan[i]!.subVectors(b, a);
      if (tan[i]!.lengthSq() < 1e-8) tan[i]!.set(0, 1, 0);
      tan[i]!.normalize();
    }
    dor[0]!.set(0, 0, -1).addScaledVector(tan[0]!, -tan[0]!.z).normalize();
    if (dor[0]!.lengthSq() < 0.5) dor[0]!.set(-1, 0, 0);
    for (let i = 1; i < TAIL_N; i++) {
      t1.copy(dor[i - 1]!);
      t1.addScaledVector(tan[i]!, -t1.dot(tan[i]!));
      if (t1.lengthSq() < 1e-6) t1.set(0, 1, 0).addScaledVector(tan[i]!, -tan[i]!.y);
      dor[i]!.copy(t1).normalize();
    }
  }

  private draw(time: number, dt: number) {
    const { pts, tan, dor, o } = this;
    const c = this.ctrl;
    // sinew
    for (let i = 0; i < TAIL_N; i++) this.tube.pts[i]!.copy(pts[i]!);
    this.tube.update();
    // vertebrae: biggest at the root, smaller towards the stinger; they bristle when the tail is angry
    const br = 0.85 + 0.35 * c.bristle;
    for (let i = 1; i < TAIL_N; i++) {
      const u = i / (TAIL_N - 1);
      const k = (1.6 - 0.85 * Math.pow(u, 0.8)) * (1 + 0.04 * Math.sin(time * 3 + i * 0.7));
      const X = this.t1.crossVectors(dor[i]!, tan[i]!);
      this.m4.makeBasis(X.multiplyScalar(k * (0.9 + 0.1 * br)), this.tmp.copy(dor[i]!).multiplyScalar(k * br), this.t2.copy(tan[i]!).multiplyScalar(k * 0.92));
      this.m4.setPosition(pts[i]!);
      this.verts.setMatrixAt(i - 1, this.m4);
    }
    this.verts.instanceMatrix.needsUpdate = true;
    // the stinger sits on the last joint and points along the tail
    const last = pts[TAIL_N - 1]!;
    const tl = tan[TAIL_N - 1]!;
    const dl = dor[TAIL_N - 1]!;
    const X = this.t1.crossVectors(dl, tl);
    this.m4.makeBasis(X, dl, tl);
    this.stinger.position.copy(last);
    this.stinger.quaternion.setFromRotationMatrix(this.m4);
    // the needle tip in root space: along the tail and hooked down a little
    this.tipPos.copy(last).addScaledVector(tl, STING_LEN).addScaledVector(dl, -1.1);
    this.tipTan.copy(tl).addScaledVector(dl, -0.45).normalize();
    // glow
    this.glowNow += (c.glow - this.glowNow) * (1 - Math.exp(-9 * dt));
    const g = this.glowNow;
    (this.venom.material as THREE.MeshBasicMaterial).color.setRGB(0.45 + 0.4 * g, 0.9, 0.3 + 0.2 * g);
    this.venom.scale.setScalar(1 + 0.9 * g + 0.12 * Math.sin(time * 9));
    this.venomHalo.material.opacity = 0.25 + 0.7 * g;
    this.venomHalo.scale.setScalar(3.5 + 4.5 * g);
    // drips
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = 0.5 + Math.random() * 0.9 - 0.3 * g;
      const d = this.dripData.find((q) => !q.on);
      if (d) {
        d.on = true;
        d.x = this.tipPos.x;
        d.y = this.tipPos.y - 0.1;
        d.z = this.tipPos.z;
        d.vy = 0;
      }
    }
    let n = 0;
    for (const d of this.dripData) {
      if (!d.on) continue;
      d.vy -= 26 * dt;
      d.y += d.vy * dt;
      if (d.y < -0.4) d.on = false;
      o.position.set(d.x, d.y, d.z);
      o.scale.set(0.8, Math.min(2.4, 1 + Math.abs(d.vy) * 0.08), 0.8);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      this.drips.setMatrixAt(n++, o.matrix);
    }
    this.drips.count = n;
    this.drips.instanceMatrix.needsUpdate = true;
    this.shiverT += dt;
  }

  /** a tail-length shortcut: how far from the root a point is (for deciding whether the tail can reach it) */
  reachFrom(p: THREE.Vector3): number {
    return this.base.distanceTo(p);
  }
}

