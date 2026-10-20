import * as THREE from 'three';
import { clamp, lerp, smooth, TAU, unlerp } from '../../core/util';
import { fbm, mix, ridge, rgb, scale, type RGB } from '../kit/noise';
import { capsule, ellipsoid, inter, meshGen, smin, sphere, ssub, type SDF, type Slicer } from '../kit/sdf';
import { skin } from '../kit/skin';
import { PAL, colorize, glassMaterial, labelGeometry, labelMaterial, lathe, mergeGeos, rnd } from './collector-fx';
import { PIN_BURY, PIN_H, PIN_SCALE, pinBaseGeometry, pinGeometry, paintPlaque } from './collector-parts';

/**
 * Everything the Collector puts in the arena: the giant pins, the jar that comes down over you, the shards when glass
 * breaks, and the little copies of the forest's monsters that crawl out of his drawers. Visuals only: the fight
 * (bosses/collector.ts) owns the rules.
 */

const UP = new THREE.Vector3(0, 1, 0);

/* ---------------------------------------------------------------- */
/* glass shards                                                      */
/* ---------------------------------------------------------------- */

export class Shards {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private p: Float32Array;
  private v: Float32Array;
  private r: Float32Array;
  private w: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private next = 0;
  private warming = false;
  private d = new THREE.Object3D();

  constructor(world: THREE.Group, n = 72) {
    this.n = n;
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.r = new Float32Array(n * 3);
    this.w = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.5, 0, -0.3, -0.35, 0, 0.35, -0.3, 0]), 3));
    g.setIndex([0, 1, 2]);
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    this.mesh.count = 0;
    this.mesh.visible = false;
    world.add(this.mesh);
  }

  /** Glass flies out of a cylinder of radius `rad` and height `h`, centred at (x, y, z). */
  burst(x: number, y: number, z: number, count: number, rad: number, h: number, speed = 6) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * rad;
      this.p[i * 3] = x + Math.cos(a) * rr;
      this.p[i * 3 + 1] = y + (Math.random() - 0.5) * h;
      this.p[i * 3 + 2] = z + Math.sin(a) * rr;
      const s = speed * (0.3 + Math.random());
      this.v[i * 3] = Math.cos(a) * s;
      this.v[i * 3 + 1] = 1 + Math.random() * speed * 0.9;
      this.v[i * 3 + 2] = Math.sin(a) * s;
      this.r[i * 3] = Math.random() * 6;
      this.r[i * 3 + 1] = Math.random() * 6;
      this.r[i * 3 + 2] = Math.random() * 6;
      this.w[i * 3] = (Math.random() - 0.5) * 14;
      this.w[i * 3 + 1] = (Math.random() - 0.5) * 14;
      this.w[i * 3 + 2] = (Math.random() - 0.5) * 14;
      this.life[i] = 1.1 + Math.random() * 0.8;
      this.max[i] = this.life[i]!;
      this.size[i] = 0.5 + Math.random() * 0.9;
    }
    this.mesh.count = this.n;
    this.mesh.visible = true;
  }

  /** Show the shards (too small to see) for a few frames so their shader is compiled before the first break. */
  warm(on: boolean) {
    this.warming = on;
    if (on) {
      this.mesh.visible = true;
      this.mesh.count = Math.max(1, this.mesh.count);
    } else if (this.mesh.count <= 1) {
      this.mesh.count = 0;
      this.mesh.visible = false;
    }
  }

  update(dt: number) {
    // nothing in the air: nothing to do, nothing to draw
    if (this.mesh.count === 0) return;
    let any = false;
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) {
        d.scale.setScalar(0.0001);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        continue;
      }
      any = true;
      this.life[i]! -= dt;
      this.v[i * 3 + 1] = this.v[i * 3 + 1]! - 24 * dt;
      this.p[i * 3] = this.p[i * 3]! + this.v[i * 3]! * dt;
      this.p[i * 3 + 1] = this.p[i * 3 + 1]! + this.v[i * 3 + 1]! * dt;
      this.p[i * 3 + 2] = this.p[i * 3 + 2]! + this.v[i * 3 + 2]! * dt;
      if (this.p[i * 3 + 1]! < 0.05) {
        this.p[i * 3 + 1] = 0.05;
        this.v[i * 3 + 1] = Math.abs(this.v[i * 3 + 1]!) * 0.25;
        this.v[i * 3] = this.v[i * 3]! * 0.6;
        this.v[i * 3 + 2] = this.v[i * 3 + 2]! * 0.6;
      }
      for (let k = 0; k < 3; k++) this.r[i * 3 + k] = this.r[i * 3 + k]! + this.w[i * 3 + k]! * dt;
      d.position.set(this.p[i * 3]!, this.p[i * 3 + 1]!, this.p[i * 3 + 2]!);
      d.rotation.set(this.r[i * 3]!, this.r[i * 3 + 1]!, this.r[i * 3 + 2]!);
      d.scale.setScalar(this.size[i]! * Math.min(1, (this.life[i]! / this.max[i]!) * 3));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!any && !this.warming) {
      this.mesh.count = 0;
      this.mesh.visible = false;
    }
  }

  clear() {
    this.life.fill(0);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.warming = false;
  }
}

/* ---------------------------------------------------------------- */
/* cracks on glass                                                   */
/* ---------------------------------------------------------------- */

/**
 * A web of cracks drawn as thin ribbons on a surface of revolution. `level` (0..3) reveals more of them: the first strike
 * leaves a few short cracks near one spot, the second spreads them, the third is the break.
 */
export class Cracks {
  readonly mesh: THREE.Mesh;
  private perLevel: number[] = [0, 0, 0];

  constructor(radiusAt: (y: number) => number, y0: number, y1: number, seed: number, front = Math.PI / 2) {
    const pos: number[] = [];
    const idx: number[] = [];
    const levelSegs: { a: [number, number]; b: [number, number]; lvl: number }[] = [];
    const branches = 7;
    for (let b = 0; b < branches; b++) {
      // every crack starts in a cluster in the front of the glass and runs outward
      let th = front + (rnd(b, seed) - 0.5) * 0.5;
      let y = lerp(y0, y1, 0.35 + 0.3 * rnd(b, seed + 3));
      const dirA = (rnd(b, seed + 5) - 0.5) * 2.4 + (b % 2 ? 1.1 : -1.1);
      const dirY = (rnd(b, seed + 7) - 0.5) * 2.0;
      const steps = 9;
      for (let k = 0; k < steps; k++) {
        const nth = th + (dirA * 0.11 + (rnd(b * 31 + k, seed + 1) - 0.5) * 0.12);
        const ny = y + dirY * 0.4 + (rnd(b * 17 + k, seed + 2) - 0.5) * 0.5;
        const lvl = k < 3 ? 1 : k < 6 ? 2 : 3;
        levelSegs.push({ a: [th, y], b: [nth, clamp(ny, y0, y1)], lvl });
        th = nth;
        y = clamp(ny, y0, y1);
      }
    }
    levelSegs.sort((p, q) => p.lvl - q.lvl);
    for (const sgm of levelSegs) {
      const r0 = radiusAt(sgm.a[1]) + 0.04;
      const r1 = radiusAt(sgm.b[1]) + 0.04;
      const ax = Math.sin(sgm.a[0]) * r0;
      const az = Math.cos(sgm.a[0]) * r0;
      const bx = Math.sin(sgm.b[0]) * r1;
      const bz = Math.cos(sgm.b[0]) * r1;
      // a ribbon perpendicular to the crack and tangent to the glass
      const tx = bx - ax;
      const ty = sgm.b[1] - sgm.a[1];
      const tz = bz - az;
      const nx = Math.sin((sgm.a[0] + sgm.b[0]) / 2);
      const nz = Math.cos((sgm.a[0] + sgm.b[0]) / 2);
      // width direction = tangent x normal
      let wx = ty * nz - tz * 0;
      let wy = tz * nx - tx * nz;
      let wz = tx * 0 - ty * nx;
      const wl = Math.hypot(wx, wy, wz) || 1;
      const w = 0.045 / wl;
      wx *= w;
      wy *= w;
      wz *= w;
      const base = pos.length / 3;
      pos.push(ax - wx, sgm.a[1] - wy, az - wz, ax + wx, sgm.a[1] + wy, az + wz, bx + wx, sgm.b[1] + wy, bz + wz, bx - wx, sgm.b[1] - wy, bz - wz);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.perLevel[sgm.lvl - 1]! += 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe8fbff, side: THREE.DoubleSide, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.mesh.renderOrder = 14;
    this.mesh.frustumCulled = false;
    this.setLevel(0);
  }

  /** 0 = none .. 3 = all (fractions in between reveal part of the next level). */
  setLevel(level: number) {
    const l = clamp(level, 0, 3);
    let n = 0;
    for (let i = 0; i < 3; i++) n += this.perLevel[i]! * clamp(l - i, 0, 1);
    this.mesh.geometry.setDrawRange(0, Math.floor(n / 6) * 6);
    this.mesh.visible = l > 0.01;
  }
}

/* ---------------------------------------------------------------- */
/* the pins                                                          */
/* ---------------------------------------------------------------- */

export type PinState = 'free' | 'wait' | 'fly' | 'hover' | 'fall' | 'stuck' | 'break' | 'pull';

export interface PinSlot {
  state: PinState;
  x: number;
  z: number;
  t: number;
  fx: number;
  fy: number;
  fz: number;
  vx: number;
  vy: number;
  vz: number;
  /** how far it settles after landing (a wobble) */
  wob: number;
  /** shown only after launch */
  tag: number;
  /** how long the flight to the hover point takes */
  flyT: number;
}

/** Where the tip hangs while it waits over its ring. */
export const PIN_HOVER = 5.4;
export const PIN_FLY = 0.34;
export const PIN_FALL = 0.1;

export class PropPins {
  readonly slots: PinSlot[] = [];
  readonly size = 16;
  onLand: ((i: number) => void) | null = null;
  private dirty = true;
  private warming = false;
  private anyVisible = false;
  private pin: THREE.InstancedMesh;
  private tags: THREE.InstancedMesh;
  private bases: THREE.InstancedMesh;
  private tagMat: THREE.ShaderMaterial;
  private d = new THREE.Object3D();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private w = new THREE.Vector3();

  constructor(
    private world: THREE.Group,
    tag: THREE.Texture,
  ) {
    for (let i = 0; i < this.size; i++) this.slots.push({ state: 'free', x: 0, z: 0, t: 0, fx: 0, fy: 0, fz: 0, vx: 0, vy: 0, vz: 0, wob: 0, tag: Math.floor(rnd(i, 3) * 4), flyT: PIN_FLY });
    this.pin = new THREE.InstancedMesh(pinGeometry(), skin({ vertexColors: true, rim: 0xe8c880, rimPower: 3.4, steps: 4 }), this.size);
    this.bases = new THREE.InstancedMesh(pinBaseGeometry(), skin({ vertexColors: true, rim: 0x9a8ad0, rimPower: 3 }), this.size);
    const tg = labelGeometry(0.95, 1.5);
    const tiles = new Float32Array(this.size);
    for (let i = 0; i < this.size; i++) tiles[i] = this.slots[i]!.tag;
    tg.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 1));
    this.tagMat = labelMaterial(tag, 1.0, 1.0);
    this.tags = new THREE.InstancedMesh(tg, this.tagMat, this.size);
    for (const m of [this.pin, this.tags, this.bases]) {
      m.frustumCulled = false;
      m.count = this.size;
      world.add(m);
    }
    this.clear();
  }

  /** A free slot (now reserved until it is launched), or -1. */
  alloc(): number {
    for (let i = 0; i < this.size; i++)
      if (this.slots[i]!.state === 'free') {
        this.slots[i]!.state = 'wait';
        return i;
      }
    return -1;
  }

  get used(): number {
    let n = 0;
    for (const s of this.slots) if (s.state !== 'free' && s.state !== 'wait' && s.state !== 'break' && s.state !== 'pull') n++;
    return n;
  }

  /** The pin leaves a hand at `from` heading `dir` (world) and goes to hang over (x, z). */
  launch(i: number, x: number, z: number, from: THREE.Vector3, dir: THREE.Vector3, flyT = PIN_FLY) {
    const s = this.slots[i]!;
    s.flyT = flyT;
    this.dirty = true;
    s.state = 'fly';
    s.t = 0;
    s.x = x;
    s.z = z;
    s.fx = from.x;
    s.fy = from.y;
    s.fz = from.z;
    s.vx = dir.x;
    s.vy = dir.y;
    s.vz = dir.z;
    s.wob = 0;
  }

  /** Let it fall. */
  drop(i: number) {
    const s = this.slots[i]!;
    if (s.state === 'fly' || s.state === 'hover') {
      s.state = 'fall';
      s.t = 0;
    }
  }

  /** It breaks (a strike, a lance, a nova). */
  breakPin(i: number) {
    const s = this.slots[i]!;
    this.dirty = true;
    s.state = 'break';
    s.t = 0;
  }

  /** He pulls it back up out of the floor. */
  pull(i: number) {
    const s = this.slots[i]!;
    if (s.state === 'stuck' || s.state === 'hover' || s.state === 'fly') {
      s.state = 'pull';
      s.t = 0;
    }
  }

  clear() {
    for (const s of this.slots) s.state = 'free';
    this.dirty = true;
    this.write(0);
  }

  update(dt: number, t: number) {
    this.tagMat.uniforms['uTime']!.value = t;
    // the matrices are rewritten only while a pin is moving (a stuck pin is still: its tag sways on the GPU)
    let moving = this.dirty;
    this.dirty = false;
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i]!;
      if (s.state === 'free' || s.state === 'wait') continue;
      if (s.state !== 'stuck' || s.wob > 0) moving = true;
      s.t += dt;
      if (s.state === 'fly' && s.t >= s.flyT) {
        s.state = 'hover';
        s.t = 0;
      } else if (s.state === 'fall' && s.t >= PIN_FALL) {
        s.state = 'stuck';
        s.t = 0;
        s.wob = 1;
        if (this.onLand) this.onLand(i);
      } else if (s.state === 'break' && s.t >= 0.4) s.state = 'free';
      else if (s.state === 'pull' && s.t >= 0.8) s.state = 'free';
      if (s.state === 'stuck') s.wob = Math.max(0, s.wob - dt * 2.2);
    }
    if (moving) this.write(t);
  }

  /** Show the pins (too small to see) for a few frames so their shaders are compiled before the first throw. */
  warm(on: boolean) {
    this.warming = on;
    this.pin.visible = this.tags.visible = this.bases.visible = on || this.anyVisible;
  }

  private write(t: number) {
    const d = this.d;
    let any = false;
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i]!;
      let px = s.x;
      let py = -PIN_BURY * PIN_SCALE;
      let pz = s.z;
      let vis = s.state !== 'free' && s.state !== 'wait';
      if (vis) any = true;
      let sc = PIN_SCALE;
      let baseK = 0;
      const q = this.q;
      q.identity();
      let tremble = 0;
      if (s.state === 'fly') {
        const u = clamp(s.t / s.flyT, 0, 1);
        const e = 1 - (1 - u) * (1 - u);
        px = lerp(s.fx, s.x, e);
        pz = lerp(s.fz, s.z, e);
        py = lerp(s.fy, PIN_HOVER, e) + Math.sin(Math.PI * u) * 3.2;
        // tip first along the throw, turning to point straight down
        this.v.set(s.vx, s.vy, s.vz).normalize();
        this.v2.copy(this.v).negate();
        q.setFromUnitVectors(UP, this.v2);
        this.q2.identity();
        q.slerp(this.q2, u * u);
      } else if (s.state === 'hover') {
        px = s.x + Math.sin(t * 31 + i) * 0.03;
        pz = s.z;
        py = PIN_HOVER - s.t * 0.5;
        tremble = 0.02;
      } else if (s.state === 'fall') {
        const u = clamp(s.t / PIN_FALL, 0, 1);
        const y0 = PIN_HOVER - 0.5 * (0.2);
        py = lerp(y0, -PIN_BURY * PIN_SCALE, u * u);
        baseK = u > 0.8 ? (u - 0.8) * 5 : 0;
      } else if (s.state === 'stuck') {
        baseK = 1;
        // a stab leaves it shivering
        const a = s.wob * Math.sin(s.t * 40) * 0.14;
        q.setFromAxisAngle(this.v.set(Math.cos(i * 2.1), 0, Math.sin(i * 2.1)), a);
        // a little slant that is the same every time for the same pin
        this.q2.setFromAxisAngle(this.v.set(Math.sin(i * 5.3), 0, Math.cos(i * 5.3)), 0.04 * Math.sin(i * 7.7));
        q.multiply(this.q2);
      } else if (s.state === 'break') {
        const u = clamp(s.t / 0.4, 0, 1);
        baseK = 1 - u;
        py = -PIN_BURY * PIN_SCALE - u * 2.4;
        q.setFromAxisAngle(this.v.set(Math.cos(i * 1.7), 0, Math.sin(i * 1.7)), u * 1.2);
        sc = PIN_SCALE * (1 - u * u);
      } else if (s.state === 'pull') {
        const u = clamp(s.t / 0.8, 0, 1);
        py = -PIN_BURY * PIN_SCALE + u * u * 40;
        baseK = 1 - Math.min(1, u * 4);
        q.setFromAxisAngle(this.v.set(0, 0, 1), Math.sin(u * 20) * 0.08);
      }
      if (tremble > 0) {
        this.q2.setFromAxisAngle(this.v.set(1, 0, 0), Math.sin(t * 47 + i) * tremble);
        q.multiply(this.q2);
      }
      if (!vis || (s.state === 'fly' && s.t <= 0)) sc = 0.0001;
      d.position.set(px, py, pz);
      d.quaternion.copy(q);
      d.scale.setScalar(Math.max(0.0001, sc));
      d.updateMatrix();
      this.pin.setMatrixAt(i, d.matrix);
      // the paper tag hangs from the shaft
      if (vis) {
        this.w.set(0.0, 5.0, 0.32).multiplyScalar(PIN_SCALE).applyQuaternion(q);
        d.position.set(px + this.w.x, py + this.w.y, pz + this.w.z);
        d.scale.setScalar(Math.max(0.0001, sc));
        d.quaternion.copy(q);
        d.rotateY(i * 1.3);
        d.updateMatrix();
      } else {
        d.scale.setScalar(0.0001);
        d.updateMatrix();
      }
      this.tags.setMatrixAt(i, d.matrix);
      // the puncture in the floor
      d.position.set(s.x, 0.02, s.z);
      d.quaternion.identity();
      d.rotation.set(0, i * 2.3, 0);
      d.scale.setScalar(Math.max(0.0001, baseK * 0.85));
      d.updateMatrix();
      this.bases.setMatrixAt(i, d.matrix);
    }
    this.pin.instanceMatrix.needsUpdate = true;
    this.tags.instanceMatrix.needsUpdate = true;
    this.bases.instanceMatrix.needsUpdate = true;
    this.anyVisible = any;
    this.pin.visible = this.tags.visible = this.bases.visible = any || this.warming;
  }

  /** The lab's view: n pins stuck in the floor and two in the air. */
  demo(n: number) {
    this.clear();
    const spots: [number, number][] = [[-4, -4], [3, -8], [8, -3], [-9, -10], [0, 2], [6, 6], [-6, 4], [10, -12]];
    for (let k = 0; k < Math.min(n, spots.length); k++) {
      const s = this.slots[k]!;
      s.state = 'stuck';
      s.x = spots[k]![0];
      s.z = spots[k]![1];
      s.wob = 0;
    }
    if (n > 0) {
      const a = this.slots[9]!;
      a.state = 'hover';
      a.x = -1;
      a.z = -1;
      a.t = 0;
    }
    this.write(0);
  }

  dispose() {
    this.world.remove(this.pin, this.tags, this.bases);
  }
}

/* ---------------------------------------------------------------- */
/* the jar that comes down over you                                  */
/* ---------------------------------------------------------------- */

export const JAR_R = 3.0;
export const JAR_H = 6.0;
const BELL: [number, number][] = [
  [JAR_R, 0.0],
  [JAR_R + 0.04, 0.4],
  [JAR_R + 0.05, 3.3],
  [2.92, 4.2],
  [2.45, 5.1],
  [1.7, 5.7],
  [0.95, 5.95],
  [0.001, 6.0],
];
const bellRadius = (y: number) => {
  for (let i = 1; i < BELL.length; i++) {
    if (y <= BELL[i]![1]) {
      const t = (y - BELL[i - 1]![1]) / (BELL[i]![1] - BELL[i - 1]![1]);
      return BELL[i - 1]![0] + (BELL[i]![0] - BELL[i - 1]![0]) * t;
    }
  }
  return 0.5;
};

export class PropJar {
  readonly group = new THREE.Group();
  private glassMat: THREE.ShaderMaterial;
  private cracks: Cracks;
  private iris: THREE.Mesh;
  private irisPos: Float32Array;
  private wheel = new THREE.Group();
  private shards: Shards;
  private brass: THREE.Material;
  private pulse = 0;

  constructor(private world: THREE.Group) {
    this.glassMat = glassMaterial({ tint: 0x16323a, rim: 0xa8f0ff, alpha: 0.07, glint: 1, dirt: 0.5 });
    const glass = new THREE.Mesh(lathe(BELL, 40), this.glassMat);
    glass.renderOrder = 12;
    this.group.add(glass);
    this.brass = skin({ vertexColors: true, rim: 0xffe4a0, rimPower: 2.4, steps: 4 });
    // the brass rim at the bottom, a ring of rivets, and the cap and wheel on top
    const ring = new THREE.TorusGeometry(JAR_R + 0.04, 0.24, 8, 36);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, 0.2, 0);
    colorize(ring, (x, _y, z) => mix(PAL.brassDark, PAL.brass, 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 6)));
    const pieces: THREE.BufferGeometry[] = [ring];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const r = new THREE.SphereGeometry(0.11, 5, 4);
      r.translate(Math.cos(a) * (JAR_R + 0.18), 0.55, Math.sin(a) * (JAR_R + 0.18));
      colorize(r, PAL.brassLight);
      pieces.push(r);
    }
    const cap = lathe(
      [
        [0.001, 5.96],
        [1.0, 5.93],
        [1.3, 6.1],
        [1.1, 6.35],
        [0.4, 6.5],
        [0.001, 6.55],
      ],
      20,
    );
    colorize(cap, (_x, y) => mix(PAL.brassDark, PAL.brass, clamp((y - 5.9) / 0.6, 0, 1)));
    pieces.push(cap);
    this.group.add(new THREE.Mesh(mergeGeos(pieces), this.brass));
    // the handwheel the Collector's hand turns
    const wr = new THREE.TorusGeometry(0.95, 0.12, 6, 18);
    wr.rotateX(Math.PI / 2);
    colorize(wr, PAL.brass);
    const wp: THREE.BufferGeometry[] = [wr];
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.CylinderGeometry(0.07, 0.07, 1.9, 5);
      sp.rotateZ(Math.PI / 2);
      sp.rotateY((i / 3) * Math.PI);
      colorize(sp, PAL.brassDark);
      wp.push(sp);
    }
    const hub = new THREE.SphereGeometry(0.26, 8, 6);
    colorize(hub, PAL.brassLight);
    wp.push(hub);
    const wm = new THREE.Mesh(mergeGeos(wp), this.brass);
    this.wheel.add(wm);
    this.wheel.position.y = 6.95;
    this.group.add(this.wheel);
    // a label on the glass, already written
    const plaque = new THREE.Mesh(new THREE.CylinderGeometry(JAR_R + 0.06, JAR_R + 0.06, 0.7, 14, 1, true, -0.3, 0.6), new THREE.MeshBasicMaterial({ map: paintPlaque(), color: 0xe8dcc0, side: THREE.DoubleSide }));
    plaque.position.y = 4.35;
    plaque.renderOrder = 6;
    this.group.add(plaque);
    // the lid: a brass iris that closes across the floor under you, drawn as a ring whose hole shrinks
    const rg = new THREE.RingGeometry(0.5, JAR_R, 48, 1);
    rg.rotateX(-Math.PI / 2);
    this.irisPos = new Float32Array(rg.getAttribute('position').array.length);
    this.irisPos.set(rg.getAttribute('position').array as Float32Array);
    const col = new Float32Array(rg.getAttribute('position').count * 3);
    for (let i = 0; i < rg.getAttribute('position').count; i++) {
      const x = rg.getAttribute('position').getX(i);
      const z = rg.getAttribute('position').getZ(i);
      const a = Math.atan2(z, x);
      const tick = Math.sin(a * 12) > 0.3 ? 1 : 0.55;
      const inner = Math.hypot(x, z) < 1.2 ? 1 : 0.7;
      const c = scale(PAL.brass, tick * inner);
      col.set(c, i * 3);
    }
    rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.iris = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
    this.iris.position.y = 0.07;
    this.iris.frustumCulled = false;
    this.group.add(this.iris);
    this.cracks = new Cracks(bellRadius, 0.6, 5.4, 11, 0.45);
    this.group.add(this.cracks.mesh);
    this.shards = new Shards(world, 80);
    this.group.visible = false;
    world.add(this.group);
    this.setIris(0);
  }

  show(on: boolean) {
    this.group.visible = on;
  }

  setPos(x: number, y: number, z: number) {
    this.group.position.set(x, y, z);
  }

  /** 0 = none .. 3 */
  setCracks(level: number) {
    this.cracks.setLevel(level);
  }

  /** 0 = the lid is open, 1 = screwed shut */
  setIris(u: number) {
    const pos = this.iris.geometry.getAttribute('position') as THREE.BufferAttribute;
    const inner = lerp(JAR_R - 0.15, 0.06, clamp(u, 0, 1));
    const rot = u * 5.0;
    const n = pos.count / 2;
    for (let i = 0; i < pos.count; i++) {
      const ox = this.irisPos[i * 3]!;
      const oz = this.irisPos[i * 3 + 2]!;
      const r = Math.hypot(ox, oz);
      const a = Math.atan2(oz, ox) + rot;
      const rr = i < n ? inner : r;
      pos.setXYZ(i, Math.cos(a) * rr, 0, Math.sin(a) * rr);
    }
    pos.needsUpdate = true;
    this.iris.visible = u > 0.001;
  }

  setWheel(angle: number) {
    this.wheel.rotation.y = angle;
  }

  setFade(a: number) {
    this.glassMat.uniforms['uFade']!.value = a;
  }

  setPulse(v: number) {
    this.pulse = v;
    this.glassMat.uniforms['uGlint']!.value = 1 + v * 2;
  }

  /** The wheel's centre in world space. */
  topWorld(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.group.position.x, this.group.position.y + 6.95, this.group.position.z);
  }

  /** The glass goes everywhere. */
  shatter() {
    this.shards.burst(this.group.position.x, this.group.position.y + 3, this.group.position.z, 60, JAR_R, 5, 7);
    this.group.visible = false;
  }

  update(dt: number) {
    this.shards.update(dt);
    void this.pulse;
  }

  clearFx() {
    this.shards.clear();
  }

  warmShards(on: boolean) {
    this.shards.warm(on);
  }

  demo(v: number) {
    this.show(true);
    this.setPos(-3, 0, -3);
    this.setCracks(Math.floor(v * 3));
    this.setIris(v > 0.5 ? 0.5 : 0);
    this.setWheel(1);
  }

  dispose() {
    this.world.remove(this.group, this.shards.mesh);
  }
}

/* ---------------------------------------------------------------- */
/* the little collected monsters                                     */
/* ---------------------------------------------------------------- */

export type MinionKind = 0 | 1 | 2;
/** The little monsters are modelled about a unit tall and drawn a little bigger than that, so they read from the game camera. */
export const MINION_SCALE = 1.3;
export const MINION_KINDS = 3;

/** A tapered limb from a to b, as a closed cone frustum. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sides = 6): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, false);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
  m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

function blobField(): SDF {
  const body = smin(
    0.4,
    ellipsoid([0, 0.72, 0], [0.92, 0.74, 0.88]),
    ellipsoid([0.4, 0.42, 0.45], [0.55, 0.42, 0.5]),
    ellipsoid([-0.5, 0.36, -0.2], [0.46, 0.36, 0.5]),
    sphere([0.15, 1.2, -0.25], 0.38),
    ellipsoid([-0.1, 0.25, 0.8], [0.5, 0.28, 0.35]),
  );
  const flat = inter(body, (_x, y) => -y);
  return (x, y, z) => {
    const d = flat(x, y, z);
    if (d > 0.4 || d < -0.4) return d;
    return d + (fbm(x * 3, y * 3, z * 3, 2, 9) - 0.5) * 0.12;
  };
}

function skitterField(): SDF {
  const shell = ellipsoid([0, 0.78, 0], [0.98, 0.42, 0.72]);
  const ridge = smin(0.2, ellipsoid([0, 1.0, 0.15], [0.6, 0.2, 0.34]), ellipsoid([0, 1.02, -0.38], [0.45, 0.18, 0.26]));
  const skull = sphere([0, 0.8, 0.88], 0.34);
  const jaw = ellipsoid([0, 0.58, 1.05], [0.22, 0.12, 0.26]);
  const tail = capsule([0, 0.72, -0.6], [0, 0.46, -1.35], 0.2, 0.03);
  let s: SDF = smin(0.22, shell, ridge, skull, jaw, tail);
  s = ssub(0.1, s, sphere([-0.14, 0.86, 1.1], 0.1));
  s = ssub(0.1, s, sphere([0.14, 0.86, 1.1], 0.1));
  return (x, y, z) => {
    const d = s(x, y, z);
    if (d > 0.3 || d < -0.3) return d;
    return d + (fbm(x * 4, y * 4, z * 4, 2, 5) - 0.5) * 0.08;
  };
}

function flowerField(): SDF {
  // a thin stalk on four scuttling roots; the head is a separate pair of snapping lobes
  const stalk = capsule([0, 0.05, 0], [0, 1.0, 0.04], 0.22, 0.15);
  const collar = ellipsoid([0, 1.02, 0.02], [0.3, 0.17, 0.3]);
  let s: SDF = smin(0.25, stalk, collar);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    s = smin(0.18, s, capsule([0, 0.25, 0], [Math.cos(a) * 0.8, 0.02, Math.sin(a) * 0.8], 0.16, 0.05));
  }
  return (x, y, z) => {
    const d = s(x, y, z);
    if (d > 0.3 || d < -0.3) return d;
    return d + (fbm(x * 3.5, y * 3.5, z * 3.5, 2, 21) - 0.5) * 0.07;
  };
}

/** One lobe of the flower's jaw. The hinge is the origin, the lobe reaches along +z and curves up (+y); its rim lies in y = 0. */
const LOBE_C: [number, number, number] = [0, 0.04, 0.62];
const LOBE_R: [number, number, number] = [0.62, 0.5, 0.68];
function lobeField(): SDF {
  const outer = ellipsoid(LOBE_C, LOBE_R);
  const inner = ellipsoid([LOBE_C[0], LOBE_C[1] - 0.02, LOBE_C[2]], [LOBE_R[0] - 0.1, LOBE_R[1] - 0.08, LOBE_R[2] - 0.1]);
  const shell: SDF = (x, y, z) => Math.max(outer(x, y, z), -inner(x, y, z), -y);
  return (x, y, z) => {
    const d = shell(x, y, z);
    if (d > 0.2 || d < -0.2) return d;
    return d + (fbm(x * 4, y * 4, z * 4, 2, 31) - 0.5) * 0.05;
  };
}

interface MinionVis {
  group: THREE.Group;
  kind: MinionKind;
  parts: THREE.Object3D[];
  legs: THREE.Mesh[];
  petals: THREE.Mesh | null;
  body: THREE.Mesh | null;
}

export class PropMinions {
  /** six slots; each holds all three shapes and shows the one it needs */
  readonly slots: { root: THREE.Group; kinds: MinionVis[]; shown: number }[] = [];
  readonly size = 6;
  private geos: (THREE.BufferGeometry | null)[] = [null, null, null, null];
  private ready = false;
  private mEye = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  private mBlob = skin({ vertexColors: true, rim: 0x6ff0ff, rimPower: 2.4, steps: 3 });
  private mBone = skin({ vertexColors: true, rim: 0xffe0a0, rimPower: 2.6, steps: 4 });
  private mFlower = skin({ vertexColors: true, rim: 0xc8f0ff, rimPower: 2.6, steps: 4 });
  private mFlowerJaw = skin({ vertexColors: true, rim: 0xd8c8ff, rimPower: 2.6, steps: 4, side: THREE.DoubleSide });

  constructor(private world: THREE.Group) {
    for (let i = 0; i < this.size; i++) {
      const root = new THREE.Group();
      root.visible = false;
      world.add(root);
      this.slots.push({ root, kinds: [], shown: -1 });
    }
  }

  /**
   * Mesh the little monsters (a few ms at a time) and set up the slots. `finished` is called, synchronously inside the slicer, the
   * moment the last job is done (a promise would only say so a moment later, and a flushed slicer should leave the model ready).
   */
  build(slicer: Slicer, finished: () => void): void {
    let left = 4;
    const job = <T>(gen: Generator<void, T, void>, done: (v: T) => void) =>
      slicer.add(gen, (v) => {
        done(v);
        if (--left === 0) {
          this.assemble();
          this.ready = true;
          finished();
        }
      });
    job(
      meshGen(blobField(), [-1.6, -0.1, -1.6], [1.6, 1.9, 1.6], 0.1, {
        color: (x, y, z, nx, ny, nz, ao) => {
          const m = fbm(x * 2, y * 2, z * 2, 2, 3);
          let c = mix(rgb(0x07040e), rgb(0x1a2a3a), m * m);
          c = mix(c, rgb(0x2a6a78), Math.pow(Math.max(0, ny), 4) * 0.3);
          void nx;
          void nz;
          return scale(c, 0.6 + 0.5 * ao);
        },
        aoAmount: 0.5,
      }),
      (g) => (this.geos[0] = g),
    );
    job(
      meshGen(skitterField(), [-1.3, 0.1, -1.6], [1.3, 1.5, 1.5], 0.09, {
        color: (x, y, z, nx, ny, nz, ao) => {
          const m = fbm(x * 3, y * 3, z * 3, 3, 7);
          let c = mix(rgb(0xa88a50), rgb(0xe8cf90), m);
          if (m < 0.3) c = mix(c, rgb(0x5a3a20), 0.5);
          // sockets are dark
          if (z > 0.95 && y > 0.78 && Math.abs(Math.abs(x) - 0.14) < 0.16) c = mix(c, rgb(0x120806), 0.7);
          void nx;
          void nz;
          return scale(c, 0.55 + 0.5 * ny * 0.5 + 0.35 * ao);
        },
        aoAmount: 0.6,
      }),
      (g) => (this.geos[1] = g),
    );
    job(
      meshGen(flowerField(), [-1.1, -0.1, -1.1], [1.1, 1.3, 1.1], 0.09, {
        color: (x, y, z, _nx, _ny, _nz, ao) => {
          const m = fbm(x * 2.5, y * 2.5, z * 2.5, 2, 11);
          return scale(mix(rgb(0x1a6a5a), rgb(0x3aa88a), m), 0.55 + 0.5 * ao);
        },
        aoAmount: 0.5,
      }),
      (g) => (this.geos[2] = g),
    );
    job(
      meshGen(lobeField(), [-0.8, -0.05, -0.15], [0.8, 0.7, 1.45], 0.075, {
        color: (x, y, z, nx, ny, nz, ao) => {
          // outside: pale petal flushed with violet along the veins; inside (facing the middle): raw red
          const m = fbm(x * 3, y * 3, z * 3, 2, 41);
          let c = mix(rgb(0xe6dcff), rgb(0x9a72d8), clamp(0.3 + 0.7 * m, 0, 1) * clamp((z + 0.1) / 1.2, 0, 1));
          const v = ridge(x * 5, y * 5, z * 5, 2, 17);
          if (v > 0.88) c = mix(c, rgb(0x6a3aa8), (v - 0.88) * 8);
          // inside: the surface normal points down toward the other lobe, or inward
          const inside = clamp(-ny * 1.4 + (y < 0.35 ? 0.3 : 0), 0, 1);
          c = mix(c, mix(rgb(0xb0182c), rgb(0x5a0a18), clamp(1 - z, 0, 1)), inside);
          void nx;
          void nz;
          return scale(c, 0.55 + 0.5 * ao);
        },
        aoAmount: 0.5,
      }),
      (g) => (this.geos[3] = g),
    );
  }

  private assemble() {
    // legs of the skitter: three pairs, each one mesh that swings as a pair
    const legGeo = (zOff: number, splay: number): THREE.BufferGeometry => {
      const parts: THREE.BufferGeometry[] = [];
      for (const sx of [-1, 1]) {
        const hip = new THREE.Vector3(sx * 0.75, 0.78, zOff);
        const knee = new THREE.Vector3(sx * 1.45, 1.35, zOff + splay * 0.35);
        const foot = new THREE.Vector3(sx * 1.85, 0.02, zOff + splay * 0.7);
        parts.push(colorize(limb(hip, knee, 0.1, 0.07), PAL.bone), colorize(limb(knee, foot, 0.07, 0.03), PAL.boneShade));
        const j = new THREE.SphereGeometry(0.11, 6, 5);
        j.translate(knee.x, knee.y, knee.z);
        parts.push(colorize(j, PAL.bone));
      }
      return mergeGeos(parts);
    };
    const legs = [legGeo(0.45, 0.8), legGeo(0.0, 0.0), legGeo(-0.45, -0.8)];
    // the flower's jaw: a lobe with a row of teeth along its rim (the lower one is the same lobe turned over)
    const teethRow = (offset: number): THREE.BufferGeometry[] => {
      const parts: THREE.BufferGeometry[] = [];
      const N = 11;
      for (let i = 0; i < N; i++) {
        const t = (i + offset) / N;
        const a = Math.PI * (0.05 + 0.9 * t);
        // along the rim of the lobe: a half ellipse in the plane y = 0 from the left, round the front, to the right
        const x = -Math.cos(a) * (LOBE_R[0] - 0.04);
        const z = LOBE_C[2] + Math.sin(a) * (LOBE_R[2] - 0.04);
        const tooth = new THREE.ConeGeometry(0.075, 0.3, 5);
        tooth.translate(0, -0.15, 0);
        // the tooth leans in toward the middle of the mouth
        tooth.rotateX(-0.25 * Math.sin(a));
        tooth.translate(x, 0.02, z);
        colorize(tooth, rgb(0xfff2d4));
        parts.push(tooth);
      }
      return parts;
    };
    const lobeUp = mergeGeos([this.geos[3]!, ...teethRow(0)]);
    const lobeDn = mergeGeos([this.geos[3]!, ...teethRow(0.5)]);
    // glowing eyes: spheres merged into one mesh each, unlit, with their own colours
    const eyes = (list: [number, number, number, number][], c: RGB): THREE.BufferGeometry => {
      const parts = list.map(([x, y, z, r]) => {
        const g = new THREE.SphereGeometry(r, 6, 4);
        g.translate(x, y, z);
        return colorize(g, c);
      });
      return mergeGeos(parts);
    };
    const eyesBlob = eyes([[-0.3, 0.9, 0.78, 0.17], [0.28, 0.95, 0.8, 0.13], [0.0, 0.62, 0.9, 0.09]], [0.43, 0.95, 1]);
    const eyesSkit = eyes([[-0.14, 0.86, 1.04, 0.07], [0.14, 0.86, 1.04, 0.07]], [1, 0.35, 0.48]);
    const eyesFlow = eyes([[-0.3, 0.28, 0.3, 0.07], [0.3, 0.28, 0.3, 0.07]], [1, 0.35, 0.48]);
    for (const s of this.slots) {
      // 0: the blob
      {
        const g = new THREE.Group();
        const body = new THREE.Mesh(this.geos[0]!, this.mBlob);
        g.add(body);
        g.add(new THREE.Mesh(eyesBlob, this.mEye));
        g.visible = false;
        s.root.add(g);
        s.kinds.push({ group: g, kind: 0, parts: [], legs: [], petals: null, body });
      }
      // 1: the bone skitter
      {
        const g = new THREE.Group();
        const body = new THREE.Mesh(this.geos[1]!, this.mBone);
        g.add(body);
        const legMeshes = legs.map((lg) => {
          const m = new THREE.Mesh(lg, this.mBone);
          g.add(m);
          return m;
        });
        g.add(new THREE.Mesh(eyesSkit, this.mEye));
        g.visible = false;
        s.root.add(g);
        s.kinds.push({ group: g, kind: 1, parts: [], legs: legMeshes, petals: null, body });
      }
      // 2: the flower with teeth: a stalk on roots and a pair of jaws that snap
      {
        const g = new THREE.Group();
        const body = new THREE.Mesh(this.geos[2]!, this.mFlower);
        g.add(body);
        const head = new THREE.Group();
        head.position.set(0, 1.1, -0.1);
        const up = new THREE.Mesh(lobeUp, this.mFlowerJaw);
        const dn = new THREE.Mesh(lobeDn, this.mFlowerJaw);
        // the lower lobe is the upper one turned upside down
        dn.rotation.x = Math.PI;
        head.add(up, dn);
        head.add(new THREE.Mesh(eyesFlow, this.mEye));
        g.add(head);
        g.visible = false;
        s.root.add(g);
        s.kinds.push({ group: g, kind: 2, parts: [head, up, dn], legs: [], petals: null, body });
      }
    }
  }

  /** Put minion `i` (of `kind`) at (x, y, z) facing `yaw`; `ph` is its walk phase; `mouth` opens the flower; `squash` 0..1 for a landing. */
  place(i: number, kind: MinionKind, x: number, y: number, z: number, yaw: number, ph: number, mouth = 0, squash = 0, sc = 1) {
    if (!this.ready) return;
    const s = this.slots[i]!;
    if (s.shown !== kind) {
      for (const k of s.kinds) k.group.visible = k.kind === kind;
      s.shown = kind;
    }
    s.root.visible = sc > 0.01;
    s.root.position.set(x, y, z);
    s.root.rotation.y = yaw;
    const v = s.kinds[kind]!;
    const sq = 1 - squash * 0.35;
    const S = sc * MINION_SCALE;
    s.root.scale.set(S / Math.sqrt(sq), S * sq, S / Math.sqrt(sq));
    if (kind === 0) {
      // a wobbling ooze
      const w = Math.sin(ph * 2) * 0.08;
      v.group.scale.set(1 + w, 1 - w, 1 + w * 0.5);
      v.group.position.y = Math.abs(Math.sin(ph)) * 0.08;
    } else if (kind === 1) {
      // a tripod gait: front and back pairs swing together, the middle pair against them
      for (let k = 0; k < 3; k++) {
        const sw = Math.sin(ph * 2 + (k === 1 ? Math.PI : 0));
        v.legs[k]!.rotation.y = sw * 0.38;
        v.legs[k]!.position.y = Math.max(0, sw) * 0.12;
      }
      v.group.position.y = Math.abs(Math.sin(ph * 2)) * 0.03;
      v.group.rotation.z = Math.sin(ph * 2) * 0.03;
    } else {
      // it hops on its roots, and the mouth works
      const hop = Math.abs(Math.sin(ph));
      v.group.position.y = hop * 0.35;
      v.group.rotation.x = -0.1 + Math.sin(ph) * 0.08;
      // the head nods with each hop; the jaws open wide as it nears you and snap shut
      const snap = 0.5 + 0.5 * Math.sin(ph * 3);
      const open = 0.25 + mouth * 0.9 + 0.15 * snap;
      v.parts[0]!.rotation.x = 0.1 + Math.sin(ph) * 0.12;
      v.parts[1]!.rotation.x = -open;
      v.parts[2]!.rotation.x = Math.PI + open * 0.45;
    }
  }

  hide(i: number) {
    this.slots[i]!.root.visible = false;
  }

  /** Show each of the three shapes for a moment, too small to see, so their shaders are compiled before the fight needs them. */
  warm(on: boolean) {
    if (!this.ready) return;
    for (let i = 0; i < MINION_KINDS; i++) {
      const s = this.slots[i]!;
      if (!on) {
        s.root.visible = false;
        continue;
      }
      this.place(i, i as MinionKind, 0, 4, -22, 0, 0, 0, 0, 0.001);
      s.root.visible = true;
    }
  }

  hideAll() {
    for (const s of this.slots) s.root.visible = false;
  }

  demo(n: number) {
    for (let i = 0; i < this.size; i++) {
      if (i < n) this.place(i, (i % 3) as MinionKind, -7 + i * 3, 0, -4 - (i % 2) * 3, 0.5 - i * 0.2, 0.7 + i, 0.5);
      else this.hide(i);
    }
  }

  dispose() {
    for (const s of this.slots) this.world.remove(s.root);
  }
}


export { PIN_H, smooth, unlerp };
export type { RGB };
