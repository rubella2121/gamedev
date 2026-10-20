import * as THREE from 'three';
import { halo } from '../kit/skin';

/**
 * What the Mash puts on the floor and in the air besides its body: tolling rings with a gap, the sweep's fan, the roll's
 * lanes, venom puddles, shock rings, the eye's beam, the breath's dust, and the streams of light of the entrance and the
 * death. Everything is pooled and drawn with a handful of draw calls; nothing allocates while the fight runs.
 */

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const additive = (o: { opacity?: number; color?: number; map?: THREE.Texture | null; vertexColors?: boolean } = {}) =>
  new THREE.MeshBasicMaterial({
    color: o.color ?? 0xffffff,
    map: o.map ?? null,
    vertexColors: o.vertexColors ?? false,
    transparent: true,
    opacity: o.opacity ?? 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

/* ---------------------------------------------------------------- */
/* the bell's rings                                                   */
/* ---------------------------------------------------------------- */

export const RING_SEGS = 96;
const RING_STEP = TAU / RING_SEGS;
const COS: number[] = [];
const SIN: number[] = [];
for (let i = 0; i <= RING_SEGS; i++) {
  COS.push(Math.cos(i * RING_STEP));
  SIN.push(Math.sin(i * RING_STEP));
}
/** vertices per slot: eight per segment (floor and wall quads), plus two gate posts */
const VPS = RING_SEGS * 8 + 8;

export interface RingSlot {
  on: boolean;
  cx: number;
  cz: number;
  r: number;
  thick: number;
  /** the gap: the first segment and how many (in steps of 3 degrees), wrapping round */
  gap0: number;
  gapN: number;
  alpha: number;
  hot: number;
}

/** Golden rings that spread over the floor, each with a gap that is safe to stand in. */
export class RingFX {
  readonly mesh: THREE.Mesh;
  readonly slots: RingSlot[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private geo = new THREE.BufferGeometry();

  constructor(world: THREE.Group, n = 8) {
    this.pos = new Float32Array(n * VPS * 3);
    this.col = new Float32Array(n * VPS * 3);
    const idx = new Uint32Array(n * (RING_SEGS * 4 + 4) * 3);
    let o = 0;
    for (let s = 0; s < n; s++) {
      const b = s * VPS;
      for (let q = 0; q < RING_SEGS * 2 + 2; q++) {
        const v = b + q * 4;
        idx[o++] = v;
        idx[o++] = v + 1;
        idx[o++] = v + 2;
        idx[o++] = v + 1;
        idx[o++] = v + 3;
        idx[o++] = v + 2;
      }
      this.slots.push({ on: false, cx: 0, cz: 0, r: 0, thick: 1.6, gap0: 0, gapN: 0, alpha: 1, hot: 0 });
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(this.geo, additive({ vertexColors: true }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    world.add(this.mesh);
  }

  get size() {
    return this.slots.length;
  }

  free(): number {
    for (let i = 0; i < this.slots.length; i++) if (!this.slots[i]!.on) return i;
    return -1;
  }

  clear() {
    for (const s of this.slots) s.on = false;
    this.mesh.visible = false;
  }

  /** is the angle of (x, z) from the ring's centre inside its gap? */
  inGap(s: RingSlot, x: number, z: number): boolean {
    let a = Math.atan2(x - s.cx, z - s.cz);
    if (a < 0) a += TAU;
    let k = a / RING_STEP - s.gap0;
    k = ((k % RING_SEGS) + RING_SEGS) % RING_SEGS;
    return k < s.gapN;
  }

  /** The gap's middle, as an angle (0 = +z). */
  gapAngle(s: RingSlot): number {
    return (s.gap0 + s.gapN / 2) * RING_STEP;
  }

  update() {
    const { pos, col } = this;
    let any = false;
    for (let si = 0; si < this.slots.length; si++) {
      const s = this.slots[si]!;
      const base = si * VPS;
      if (!s.on) {
        // collapse everything of a hidden slot (once is enough, but it is cheap)
        if (pos[base * 3 + 1] !== -50) {
          for (let v = 0; v < VPS; v++) {
            pos[(base + v) * 3] = 0;
            pos[(base + v) * 3 + 1] = -50;
            pos[(base + v) * 3 + 2] = 0;
          }
        }
        continue;
      }
      any = true;
      const hw = s.thick * 0.5;
      const rin = s.r - hw;
      const rout = s.r + hw;
      const a = s.alpha;
      const hot = s.hot;
      // floor: gold, brighter at the leading edge
      const fr = (0.8 + 0.2 * hot) * a;
      const fg = (0.5 + 0.3 * hot) * a;
      const fb = (0.08 + 0.45 * hot) * a;
      for (let j = 0; j < RING_SEGS; j++) {
        let k = j - s.gap0;
        k = ((k % RING_SEGS) + RING_SEGS) % RING_SEGS;
        const inGap = k < s.gapN;
        const v0 = (base + j * 8) * 3;
        const c0 = COS[j]!;
        const s0 = SIN[j]!;
        const c1 = COS[j + 1]!;
        const s1 = SIN[j + 1]!;
        if (inGap) {
          // the gap is a path of cool light on the floor: this way
          pos[v0] = s.cx + s0 * rin;
          pos[v0 + 1] = 0.1;
          pos[v0 + 2] = s.cz + c0 * rin;
          pos[v0 + 3] = s.cx + s0 * rout;
          pos[v0 + 4] = 0.1;
          pos[v0 + 5] = s.cz + c0 * rout;
          pos[v0 + 6] = s.cx + s1 * rin;
          pos[v0 + 7] = 0.1;
          pos[v0 + 8] = s.cz + c1 * rin;
          pos[v0 + 9] = s.cx + s1 * rout;
          pos[v0 + 10] = 0.1;
          pos[v0 + 11] = s.cz + c1 * rout;
          for (let v = 0; v < 4; v++) {
            col[v0 + v * 3] = 0.05 * a;
            col[v0 + v * 3 + 1] = 0.45 * a;
            col[v0 + v * 3 + 2] = 0.4 * a;
          }
          for (let v = 4; v < 8; v++) {
            pos[v0 + v * 3] = s.cx;
            pos[v0 + v * 3 + 1] = -50;
            pos[v0 + v * 3 + 2] = s.cz;
          }
          continue;
        }
        // floor quad: (in, j) (out, j) (in, j+1) (out, j+1); angle is measured from +z towards +x
        pos[v0] = s.cx + s0 * rin;
        pos[v0 + 1] = 0.12;
        pos[v0 + 2] = s.cz + c0 * rin;
        pos[v0 + 3] = s.cx + s0 * rout;
        pos[v0 + 4] = 0.12;
        pos[v0 + 5] = s.cz + c0 * rout;
        pos[v0 + 6] = s.cx + s1 * rin;
        pos[v0 + 7] = 0.12;
        pos[v0 + 8] = s.cz + c1 * rin;
        pos[v0 + 9] = s.cx + s1 * rout;
        pos[v0 + 10] = 0.12;
        pos[v0 + 11] = s.cz + c1 * rout;
        // the wall: from the floor up, fading out at the top
        const wr = s.r;
        const h = 2.5;
        pos[v0 + 12] = s.cx + s0 * wr;
        pos[v0 + 13] = 0.12;
        pos[v0 + 14] = s.cz + c0 * wr;
        pos[v0 + 15] = s.cx + s0 * wr;
        pos[v0 + 16] = h;
        pos[v0 + 17] = s.cz + c0 * wr;
        pos[v0 + 18] = s.cx + s1 * wr;
        pos[v0 + 19] = 0.12;
        pos[v0 + 20] = s.cz + c1 * wr;
        pos[v0 + 21] = s.cx + s1 * wr;
        pos[v0 + 22] = h;
        pos[v0 + 23] = s.cz + c1 * wr;
        for (let v = 0; v < 4; v++) {
          col[v0 + v * 3] = fr * 0.85;
          col[v0 + v * 3 + 1] = fg * 0.8;
          col[v0 + v * 3 + 2] = fb * 0.8;
        }
        const w0 = 0.9 * a;
        for (const v of [4, 6]) {
          col[v0 + v * 3] = w0;
          col[v0 + v * 3 + 1] = w0 * 0.78;
          col[v0 + v * 3 + 2] = w0 * (0.28 + 0.4 * hot);
        }
        for (const v of [5, 7]) {
          col[v0 + v * 3] = 0.05 * a;
          col[v0 + v * 3 + 1] = 0.03 * a;
          col[v0 + v * 3 + 2] = 0;
        }
      }
      // the two posts that mark the gap: tall and bright, so it can be seen from far away
      const gb = (base + RING_SEGS * 8) * 3;
      for (let e = 0; e < 2; e++) {
        const ang = ((e === 0 ? s.gap0 : s.gap0 + s.gapN) % RING_SEGS) * RING_STEP;
        const sn = Math.sin(ang);
        const cs = Math.cos(ang);
        const px = s.cx + sn * s.r;
        const pz = s.cz + cs * s.r;
        // tangent direction
        const tx = cs;
        const tz = -sn;
        const o4 = gb + e * 12;
        const hh = 5.2;
        const ww = 0.3;
        pos[o4] = px - tx * ww;
        pos[o4 + 1] = 0.1;
        pos[o4 + 2] = pz - tz * ww;
        pos[o4 + 3] = px + tx * ww;
        pos[o4 + 4] = 0.1;
        pos[o4 + 5] = pz + tz * ww;
        pos[o4 + 6] = px;
        pos[o4 + 7] = hh;
        pos[o4 + 8] = pz;
        pos[o4 + 9] = px;
        pos[o4 + 10] = hh;
        pos[o4 + 11] = pz;
        const gA = 0.95 * a;
        col[o4] = gA;
        col[o4 + 1] = gA * 0.7;
        col[o4 + 2] = gA * 0.25;
        col[o4 + 3] = gA;
        col[o4 + 4] = gA * 0.7;
        col[o4 + 5] = gA * 0.25;
        col[o4 + 6] = 0;
        col[o4 + 7] = 0;
        col[o4 + 8] = 0;
        col[o4 + 9] = 0;
        col[o4 + 10] = 0;
        col[o4 + 11] = 0;
      }
    }
    this.mesh.visible = any;
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  hide() {
    this.clear();
    this.update();
    this.mesh.visible = false;
  }
}

/* ---------------------------------------------------------------- */
/* the tail's sweep                                                   */
/* ---------------------------------------------------------------- */

const FAN_A = 56;

/** The floor area the tail is about to lash across: a ring sector, bright at its edges. */
export class FanFX {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.MeshBasicMaterial;

  constructor(world: THREE.Group) {
    const rows = 4;
    const nv = (FAN_A + 1) * rows;
    this.pos = new Float32Array(nv * 3);
    this.col = new Float32Array(nv * 3);
    const idx: number[] = [];
    for (let j = 0; j < FAN_A; j++) {
      for (let k = 0; k < rows - 1; k++) {
        const a = j * rows + k;
        const b = (j + 1) * rows + k;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mat = additive({ vertexColors: true });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    world.add(this.mesh);
  }

  /** the sector from angle a0 to a1 (radians from +z towards +x) between radii r0 and r1 round (cx, cz) */
  set(cx: number, cz: number, a0: number, a1: number, r0: number, r1: number) {
    const rows = 4;
    const rr = [r0, r0 + 0.7, r1 - 0.7, r1];
    for (let j = 0; j <= FAN_A; j++) {
      const t = j / FAN_A;
      const a = a0 + (a1 - a0) * t;
      const sn = Math.sin(a);
      const cs = Math.cos(a);
      const edge = j === 0 || j === FAN_A ? 1 : 0;
      for (let k = 0; k < rows; k++) {
        const o = (j * rows + k) * 3;
        this.pos[o] = cx + sn * rr[k]!;
        this.pos[o + 1] = 0.1;
        this.pos[o + 2] = cz + cs * rr[k]!;
        const b = k === 0 || k === rows - 1 || edge ? 1 : 0.22;
        this.col[o] = 0.9 * b;
        this.col[o + 1] = 0.1 * b;
        this.col[o + 2] = 0.16 * b;
      }
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = true;
  }

  setAlpha(a: number) {
    this.mat.opacity = clamp01(a);
  }

  hide() {
    this.mesh.visible = false;
  }
}

/* ---------------------------------------------------------------- */
/* the shell's lanes                                                  */
/* ---------------------------------------------------------------- */

function chevronTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  // the lane's two edges, and a chevron pointing along it
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.fillRect(0, 0, 64, 5);
  g.fillRect(0, 59, 64, 5);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(0, 5, 64, 54);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.moveTo(10, 10);
  g.lineTo(34, 32);
  g.lineTo(10, 54);
  g.lineTo(22, 54);
  g.lineTo(46, 32);
  g.lineTo(22, 10);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One telegraphed lane for the rolling shell: up to three legs end to end (the roll, and what is left of it after a bounce). */
export class LaneFX {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(3 * 4 * 3);
  private uv = new Float32Array(3 * 4 * 2);
  private geo = new THREE.BufferGeometry();
  readonly mat: THREE.MeshBasicMaterial;
  private tex: THREE.CanvasTexture;

  constructor(world: THREE.Group, tex = chevronTexture()) {
    this.tex = tex;
    const idx: number[] = [];
    for (let l = 0; l < 3; l++) {
      const b = l * 4;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xff3a4a, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    world.add(this.mesh);
  }

  /** legs: [x0, z0, x1, z1, ...] pairs of points; `half` is the half width. */
  set(points: number[], half: number) {
    const legs = Math.min(3, Math.floor(points.length / 2) - 1);
    this.geo.setDrawRange(0, legs * 6);
    let u0 = 0;
    for (let l = 0; l < legs; l++) {
      const x0 = points[l * 2]!;
      const z0 = points[l * 2 + 1]!;
      const x1 = points[l * 2 + 2]!;
      const z1 = points[l * 2 + 3]!;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      const o = l * 12;
      this.pos[o] = x0 + nx;
      this.pos[o + 1] = 0.11;
      this.pos[o + 2] = z0 + nz;
      this.pos[o + 3] = x0 - nx;
      this.pos[o + 4] = 0.11;
      this.pos[o + 5] = z0 - nz;
      this.pos[o + 6] = x1 + nx;
      this.pos[o + 7] = 0.11;
      this.pos[o + 8] = z1 + nz;
      this.pos[o + 9] = x1 - nx;
      this.pos[o + 10] = 0.11;
      this.pos[o + 11] = z1 - nz;
      const u1 = u0 + len / (half * 2);
      const q = l * 8;
      this.uv[q] = u0;
      this.uv[q + 1] = 0;
      this.uv[q + 2] = u0;
      this.uv[q + 3] = 1;
      this.uv[q + 4] = u1;
      this.uv[q + 5] = 0;
      this.uv[q + 6] = u1;
      this.uv[q + 7] = 1;
      u0 = u1;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('uv') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = true;
  }

  /** scroll the chevrons along the lane */
  scroll(t: number) {
    this.tex.offset.x = -t * 1.6;
  }

  setAlpha(a: number) {
    this.mat.opacity = clamp01(a);
  }

  hide() {
    this.mesh.visible = false;
  }
}

/* ---------------------------------------------------------------- */
/* venom                                                              */
/* ---------------------------------------------------------------- */

export interface Puddle {
  on: boolean;
  x: number;
  z: number;
  r: number;
  /** seconds since it landed */
  t: number;
  life: number;
}

/** Puddles of venom: dark green discs with a bright rim and bubbles. */
export class PuddleFX {
  readonly list: Puddle[] = [];
  private disc: THREE.InstancedMesh;
  private rim: THREE.InstancedMesh;
  private bub: THREE.InstancedMesh;
  private o = new THREE.Object3D();
  private N: number;

  constructor(world: THREE.Group, n = 7) {
    this.N = n;
    this.disc = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0f3a14, transparent: true, opacity: 0.82, depthWrite: false, fog: false }), n);
    this.rim = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 1, 28).rotateX(-Math.PI / 2), additive({ color: 0x9aff4a }), n);
    this.bub = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xc8ff7a, fog: false }), n * 3);
    for (const m of [this.disc, this.rim, this.bub]) {
      m.frustumCulled = false;
      m.visible = false;
      world.add(m);
    }
    for (let i = 0; i < n; i++) this.list.push({ on: false, x: 0, z: 0, r: 2, t: 0, life: 4 });
  }

  add(x: number, z: number, r: number, life: number): Puddle | null {
    const p = this.list.find((q) => !q.on);
    if (!p) return null;
    p.on = true;
    p.x = x;
    p.z = z;
    p.r = r;
    p.t = 0;
    p.life = life;
    return p;
  }

  clear() {
    for (const p of this.list) p.on = false;
    this.update(0, 0);
  }

  /** the puddle's current radius: it spreads in, then shrinks and dries at the end */
  radius(p: Puddle): number {
    const grow = clamp01(p.t / 0.25);
    const dry = clamp01((p.life - p.t) / 0.8);
    return p.r * (0.3 + 0.7 * grow) * (0.25 + 0.75 * dry);
  }

  update(dt: number, time: number) {
    let any = false;
    const o = this.o;
    for (let i = 0; i < this.N; i++) {
      const p = this.list[i]!;
      if (p.on) {
        p.t += dt;
        if (p.t >= p.life) p.on = false;
      }
      if (!p.on) {
        o.position.set(0, -50, 0);
        o.scale.setScalar(0.0001);
        o.updateMatrix();
        this.disc.setMatrixAt(i, o.matrix);
        this.rim.setMatrixAt(i, o.matrix);
        for (let k = 0; k < 3; k++) this.bub.setMatrixAt(i * 3 + k, o.matrix);
        continue;
      }
      any = true;
      const r = this.radius(p);
      o.position.set(p.x, 0.09, p.z);
      o.scale.set(r, 1, r);
      o.updateMatrix();
      this.disc.setMatrixAt(i, o.matrix);
      o.position.y = 0.1;
      const pulse = 1 + 0.04 * Math.sin(time * 6 + i);
      o.scale.set(r * pulse, 1, r * pulse);
      o.updateMatrix();
      this.rim.setMatrixAt(i, o.matrix);
      for (let k = 0; k < 3; k++) {
        const ph = (time * 0.9 + k * 0.37 + i * 0.21) % 1;
        const a = k * 2.1 + i * 1.3;
        o.position.set(p.x + Math.cos(a) * r * 0.55, 0.15 + ph * 1.1, p.z + Math.sin(a) * r * 0.55);
        o.scale.setScalar(Math.sin(Math.PI * ph) * 1.2 + 0.0001);
        o.updateMatrix();
        this.bub.setMatrixAt(i * 3 + k, o.matrix);
      }
    }
    for (const m of [this.disc, this.rim, this.bub]) {
      m.visible = any;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  hide() {
    this.clear();
    for (const m of [this.disc, this.rim, this.bub]) m.visible = false;
  }
}

/** A glowing blob of venom in flight (a pool). */
export class BlobFX {
  readonly meshes: THREE.Mesh[] = [];
  private halos: THREE.Sprite[] = [];

  constructor(world: THREE.Group, haloFactory: (c: number, s: number, o: number) => THREE.Sprite, n = 4) {
    const geo = new THREE.SphereGeometry(0.62, 10, 8);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xc8ff6a, fog: false }));
      m.visible = false;
      const h = haloFactory(0x9aff3a, 3.4, 0.7);
      m.add(h);
      this.halos.push(h);
      this.meshes.push(m);
      world.add(m);
    }
  }

  show(i: number, x: number, y: number, z: number, sx = 1, sy = 1) {
    const m = this.meshes[i]!;
    m.visible = true;
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sx);
  }

  hideOne(i: number) {
    this.meshes[i]!.visible = false;
  }

  hide() {
    for (const m of this.meshes) m.visible = false;
  }
}

/* ---------------------------------------------------------------- */
/* shock rings                                                        */
/* ---------------------------------------------------------------- */

interface Shock {
  on: boolean;
  x: number;
  y: number;
  z: number;
  t: number;
  dur: number;
  r: number;
  mesh: THREE.Mesh;
}

/** Rings of light that burst out of an impact and fade. */
export class ShockFX {
  private list: Shock[] = [];

  constructor(world: THREE.Group, n = 5) {
    const g = new THREE.RingGeometry(0.86, 1, 40);
    g.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(g, additive({ color: 0xffffff }));
      mesh.visible = false;
      world.add(mesh);
      this.list.push({ on: false, x: 0, y: 0, z: 0, t: 0, dur: 0.6, r: 6, mesh });
    }
  }

  add(x: number, z: number, r: number, color: number, dur = 0.55, y = 0.14) {
    const s = this.list.find((q) => !q.on) ?? this.list[0]!;
    s.on = true;
    s.x = x;
    s.y = y;
    s.z = z;
    s.t = 0;
    s.dur = dur;
    s.r = r;
    (s.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    s.mesh.visible = true;
  }

  update(dt: number) {
    for (const s of this.list) {
      if (!s.on) continue;
      s.t += dt;
      const u = s.t / s.dur;
      if (u >= 1) {
        s.on = false;
        s.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - u, 3);
      s.mesh.position.set(s.x, s.y, s.z);
      s.mesh.scale.set(0.3 + s.r * e, 1, 0.3 + s.r * e);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u) * (1 - u);
    }
  }

  hide() {
    for (const s of this.list) {
      s.on = false;
      s.mesh.visible = false;
    }
  }
}

/* ---------------------------------------------------------------- */
/* the eye's beam                                                     */
/* ---------------------------------------------------------------- */

/** A beam from a point in the air to a point on the floor: a thin bar that glows. */
export class BeamFX {
  readonly group = new THREE.Group();
  private core: THREE.Mesh;
  private glow: THREE.Mesh;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);
  private d = new THREE.Vector3();

  constructor(world: THREE.Group) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.core = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffeef4, fog: false }));
    this.glow = new THREE.Mesh(g, additive({ color: 0xff3a5a, opacity: 0.6 }));
    this.group.add(this.core, this.glow);
    this.group.visible = false;
    world.add(this.group);
  }

  /** width 0 draws a hair-thin warning line, bigger the live beam */
  set(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, a: number) {
    this.a.set(ax, ay, az);
    this.b.set(bx, by, bz);
    this.d.subVectors(this.b, this.a);
    const len = this.d.length() || 1;
    this.group.position.copy(this.a).addScaledVector(this.d, 0.5);
    this.q.setFromUnitVectors(this.up, this.d.multiplyScalar(1 / len));
    this.group.quaternion.copy(this.q);
    this.group.scale.set(1, len, 1);
    this.core.scale.set(w * 0.35 + 0.02, 1, w * 0.35 + 0.02);
    this.glow.scale.set(w + 0.05, 1, w + 0.05);
    (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.7 * a;
    this.core.visible = w > 0.12;
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }
}

/* ---------------------------------------------------------------- */
/* the breath's dust                                                  */
/* ---------------------------------------------------------------- */

/** Specks of dust that stream across the floor towards the maw while it breathes in. */
export class WindFX {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private seed: { a: number; r: number; h: number; v: number }[] = [];
  private N = 110;

  constructor(world: THREE.Group) {
    this.pos = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe8d0ff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    world.add(this.points);
    for (let i = 0; i < this.N; i++) this.seed.push({ a: Math.random() * TAU, r: Math.random(), h: Math.random(), v: 0.6 + Math.random() * 0.8 });
  }

  /** `k` 0..1 is how hard it blows; the dust runs towards (cx, cy, cz) from up to `R` away */
  update(dt: number, cx: number, cy: number, cz: number, k: number, R = 34) {
    if (k <= 0.01) {
      this.points.visible = false;
      return;
    }
    this.points.visible = true;
    for (let i = 0; i < this.N; i++) {
      const s = this.seed[i]!;
      s.r -= dt * (0.25 + 0.9 * k) * s.v;
      if (s.r <= 0.04) {
        s.r = 1;
        s.a = (Math.random() - 0.5) * 3.0;
        s.h = Math.random();
      }
      // a half plane in front of the maw (towards +z), streaming in
      const rr = s.r * R;
      const a = s.a + 0.0;
      this.pos[i * 3] = cx + Math.sin(a) * rr * (0.8 + 0.2 * s.r);
      this.pos[i * 3 + 1] = 0.4 + s.h * 4.5 * s.r + (cy - 0.4) * Math.pow(1 - s.r, 3);
      this.pos[i * 3 + 2] = cz + Math.cos(a) * rr;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 0.25 + 0.6 * k;
  }

  hide() {
    this.points.visible = false;
  }
}

/* ---------------------------------------------------------------- */
/* the beacon over a weak point                                       */
/* ---------------------------------------------------------------- */

/** A column of light over whatever can be hurt right now, so it is easy to find from anywhere on the floor. */
export class BeaconFX {
  readonly group = new THREE.Group();
  private col: THREE.Mesh;
  private ring: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;

  constructor(world: THREE.Group) {
    // a thin shaft that is brightest at the floor and fades to nothing high up (additive: black is clear)
    const H = 8;
    const g = new THREE.CylinderGeometry(0.3, 0.5, H, 12, 1, true);
    g.translate(0, H / 2, 0);
    const p = g.getAttribute('position');
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const f = Math.pow(1 - clamp01(p.getY(i) / H), 1.4);
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = additive({ color: 0xffe9a0, opacity: 0.5, vertexColors: true });
    this.col = new THREE.Mesh(g, this.mat);
    const r = new THREE.RingGeometry(0.78, 1, 40);
    r.rotateX(-Math.PI / 2);
    this.ringMat = additive({ color: 0xffe070, opacity: 0.9 });
    this.ring = new THREE.Mesh(r, this.ringMat);
    this.ring.position.y = 0.16;
    this.group.add(this.col, this.ring);
    this.group.visible = false;
    world.add(this.group);
  }

  /** `r` is the radius of the ring on the floor */
  set(x: number, z: number, r: number, color: number, time: number, column = true) {
    this.group.visible = true;
    this.col.visible = column;
    this.group.position.set(x, 0, z);
    const p = 0.5 + 0.5 * Math.sin(time * 6);
    this.ring.scale.set(r * (1 + 0.1 * p), 1, r * (1 + 0.1 * p));
    this.col.scale.set(1 + 0.2 * p, 1, 1 + 0.2 * p);
    this.mat.color.setHex(color);
    this.ringMat.color.setHex(color);
    this.mat.opacity = 0.4 + 0.25 * p;
    this.ringMat.opacity = 0.55 + 0.4 * p;
  }

  hide() {
    this.group.visible = false;
  }
}

/* ---------------------------------------------------------------- */
/* streams of light                                                   */
/* ---------------------------------------------------------------- */

export interface StreamDef {
  color: number;
  /** where it comes from (world) */
  from: THREE.Vector3;
  /** where it goes (world) */
  to: THREE.Vector3;
  /** when it starts and how long it takes (seconds) */
  at: number;
  dur: number;
  /** the swirl: radius and turns */
  swirl: number;
  turns: number;
}

/** Five ribbons of coloured light, one per guardian, that fly to a point (in) or away from it (out). */
export class StreamFX {
  readonly mesh: THREE.InstancedMesh;
  readonly defs: StreamDef[] = [];
  private per = 56;
  private o = new THREE.Object3D();
  private c = new THREE.Color();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private p = new THREE.Vector3();
  private ctl1 = new THREE.Vector3();
  private ctl2 = new THREE.Vector3();
  /** a big soft glow rides at the front of each ribbon */
  private heads: THREE.Sprite[] = [];

  constructor(world: THREE.Group, defs: StreamDef[]) {
    const n = defs.length * this.per;
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.62, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }), n);
    this.mesh.frustumCulled = false;
    this.defs = defs;
    defs.forEach((d, s) => {
      // (brighter than white-hot: where specks overlap they burn out to white)
      for (let j = 0; j < this.per; j++) this.mesh.setColorAt(s * this.per + j, this.c.setHex(d.color).multiplyScalar(1.6));
      const h = halo(d.color, 10, 0);
      h.visible = false;
      world.add(h);
      this.heads.push(h);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = false;
    world.add(this.mesh);
  }

  /** t: seconds since the start. `out` runs the streams backwards (away from `to` and back to `from`). */
  update(t: number, out = false) {
    const { o } = this;
    let any = false;
    this.defs.forEach((d, s) => {
      this.heads[s]!.visible = false;
      for (let j = 0; j < this.per; j++) {
        const i = s * this.per + j;
        // each speck trails the one before it
        const q = (t - d.at - j * 0.019) / d.dur;
        if (q <= 0 || q >= 1) {
          o.position.set(0, -50, 0);
          o.scale.setScalar(0.0001);
          o.updateMatrix();
          this.mesh.setMatrixAt(i, o.matrix);
          continue;
        }
        any = true;
        const u = out ? 1 - q : q;
        const e = u * u * (3 - 2 * u);
        this.a.copy(d.from);
        this.b.copy(d.to);
        // a lazy arc: out of the dark, swinging over, in
        this.ctl1.copy(this.a).lerp(this.b, 0.3);
        this.ctl1.y += 9 + 6 * Math.sin(s * 1.7);
        this.ctl2.copy(this.a).lerp(this.b, 0.75);
        this.ctl2.y += 3;
        const m = 1 - e;
        this.p.set(
          m * m * m * this.a.x + 3 * m * m * e * this.ctl1.x + 3 * m * e * e * this.ctl2.x + e * e * e * this.b.x,
          m * m * m * this.a.y + 3 * m * m * e * this.ctl1.y + 3 * m * e * e * this.ctl2.y + e * e * e * this.b.y,
          m * m * m * this.a.z + 3 * m * m * e * this.ctl1.z + 3 * m * e * e * this.ctl2.z + e * e * e * this.b.z,
        );
        const ang = d.turns * TAU * e + j * 0.9;
        const sw = d.swirl * (1 - e) * Math.sin(Math.PI * Math.min(1, e * 1.1));
        this.p.x += Math.cos(ang) * sw;
        this.p.y += Math.sin(ang) * sw * 0.8;
        o.position.copy(this.p);
        if (j === 0) {
          const head = this.heads[s]!;
          head.visible = true;
          head.position.copy(this.p);
          head.scale.setScalar(6 + 9 * Math.sin(Math.PI * q));
          head.material.opacity = 0.9 * Math.sqrt(Math.sin(Math.PI * q));
        }
        const sc = 0.7 + 1.5 * Math.sin(Math.PI * q) * (1 - (j / this.per) * 0.55);
        o.scale.setScalar(sc);
        o.rotation.set(q * 9 + j, q * 7, 0);
        o.updateMatrix();
        this.mesh.setMatrixAt(i, o.matrix);
      }
    });
    this.mesh.visible = any;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide() {
    this.mesh.visible = false;
    for (const h of this.heads) h.visible = false;
  }
}

/* ---------------------------------------------------------------- */
/* flashes                                                            */
/* ---------------------------------------------------------------- */

/** Short, bright flashes at points in the air: the needle going through as the thread is sewn. */
export class FlashFX {
  private items: { s: THREE.Sprite; t: number; life: number; size: number }[] = [];
  private next = 0;

  constructor(world: THREE.Group, n = 48) {
    for (let i = 0; i < n; i++) {
      const s = halo(0xffd890, 1, 0);
      s.visible = false;
      world.add(s);
      this.items.push({ s, t: 9, life: 1, size: 1 });
    }
  }

  add(x: number, y: number, z: number, size = 4, life = 0.4, color = 0xffd890) {
    const it = this.items[this.next]!;
    this.next = (this.next + 1) % this.items.length;
    it.s.position.set(x, y, z);
    it.s.material.color.setHex(color);
    it.t = 0;
    it.life = life;
    it.size = size;
    it.s.visible = true;
  }

  update(dt: number) {
    for (const it of this.items) {
      if (!it.s.visible) continue;
      it.t += dt;
      const u = it.t / it.life;
      if (u >= 1) {
        it.s.visible = false;
        continue;
      }
      it.s.scale.setScalar(it.size * (0.45 + 1.1 * Math.sqrt(u)));
      it.s.material.opacity = (1 - u) * (1 - u) * 1.1;
    }
  }

  hide() {
    for (const it of this.items) it.s.visible = false;
  }
}
