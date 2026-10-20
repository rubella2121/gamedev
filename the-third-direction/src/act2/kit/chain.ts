import * as THREE from 'three';
import type { RGB } from './noise';

/**
 * A tube that follows a list of points: tails, necks, tentacles, bony arms. Move the points, call `update()`.
 * The cross-section turns with the path (parallel transport), so the tube never twists.
 */
export class TubeChain {
  readonly mesh: THREE.Mesh;
  readonly pts: THREE.Vector3[];
  /** segment lengths of the rest pose, used by the solvers */
  readonly lens: number[];
  private n: number;
  private m: number;
  private pos: Float32Array;
  private nrm: Float32Array;
  private ra: number[];
  private ca: Float32Array;
  private ta = new THREE.Vector3();
  private na = new THREE.Vector3();
  private ba = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  /**
   * @param n points along the chain
   * @param m sides around it
   * @param radius radius at u (0 at the first point, 1 at the last)
   * @param color optional colour at u and angle
   */
  constructor(n: number, m: number, mat: THREE.Material, radius: (u: number) => number, color?: (u: number, a: number) => RGB) {
    this.n = n;
    this.m = m;
    this.pts = Array.from({ length: n }, (_, i) => new THREE.Vector3(i, 0, 0));
    this.lens = Array.from({ length: n - 1 }, () => 1);
    this.ra = Array.from({ length: n }, (_, i) => radius(i / (n - 1)));
    const nv = n * m + 2;
    this.pos = new Float32Array(nv * 3);
    this.nrm = new Float32Array(nv * 3);
    this.ca = new Float32Array(nv * 3).fill(1);
    if (color) {
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          const c = color(i / (n - 1), (j / m) * Math.PI * 2);
          this.ca.set(c, (i * m + j) * 3);
        }
      }
      const c0 = color(0, 0);
      const c1 = color(1, 0);
      this.ca.set(c0, n * m * 3);
      this.ca.set(c1, (n * m + 1) * 3);
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < m; j++) {
        const a = i * m + j;
        const b = i * m + ((j + 1) % m);
        const c = (i + 1) * m + j;
        const d = (i + 1) * m + ((j + 1) % m);
        idx.push(a, c, b, b, c, d);
      }
    }
    for (let j = 0; j < m; j++) {
      idx.push(n * m, j, (j + 1) % m);
      idx.push(n * m + 1, (n - 1) * m + ((j + 1) % m), (n - 1) * m + j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.ca, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }

  /** Remember the current spacing of the points as the length each segment keeps. */
  rest() {
    for (let i = 0; i < this.n - 1; i++) this.lens[i] = this.pts[i]!.distanceTo(this.pts[i + 1]!);
  }

  /** Radius multiplier (for a tail that fattens or a tip that withers). */
  setRadius(f: (u: number, base: number) => number) {
    for (let i = 0; i < this.n; i++) this.ra[i] = f(i / (this.n - 1), this.ra[i]!);
  }

  update() {
    const { n, m, pos, nrm, pts, ta, na, ba, tmp } = this;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(n - 1, i + 1)]!;
      ta.subVectors(b, a);
      if (ta.lengthSq() < 1e-9) ta.set(1, 0, 0);
      ta.normalize();
      if (i === 0) {
        // any direction not parallel to the tangent starts the frame
        tmp.set(Math.abs(ta.y) > 0.9 ? 1 : 0, Math.abs(ta.y) > 0.9 ? 0 : 1, 0);
        na.crossVectors(ta, tmp).normalize();
      } else {
        // carry the previous normal along: remove its component along the new tangent
        na.addScaledVector(ta, -na.dot(ta));
        if (na.lengthSq() < 1e-9) na.set(0, 0, 1).addScaledVector(ta, -ta.z);
        na.normalize();
      }
      ba.crossVectors(ta, na);
      const r = this.ra[i]!;
      const p = pts[i]!;
      for (let j = 0; j < m; j++) {
        const ang = (j / m) * Math.PI * 2;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const nx = na.x * c + ba.x * s;
        const ny = na.y * c + ba.y * s;
        const nz = na.z * c + ba.z * s;
        const o = (i * m + j) * 3;
        pos[o] = p.x + nx * r;
        pos[o + 1] = p.y + ny * r;
        pos[o + 2] = p.z + nz * r;
        nrm[o] = nx;
        nrm[o + 1] = ny;
        nrm[o + 2] = nz;
      }
    }
    // caps
    const f = pts[0]!;
    const l = pts[n - 1]!;
    const o0 = n * m * 3;
    pos[o0] = f.x;
    pos[o0 + 1] = f.y;
    pos[o0 + 2] = f.z;
    nrm[o0] = pts[0]!.x - pts[1]!.x;
    nrm[o0 + 1] = pts[0]!.y - pts[1]!.y;
    nrm[o0 + 2] = pts[0]!.z - pts[1]!.z;
    const o1 = o0 + 3;
    pos[o1] = l.x;
    pos[o1 + 1] = l.y;
    pos[o1 + 2] = l.z;
    nrm[o1] = l.x - pts[n - 2]!.x;
    nrm[o1 + 1] = l.y - pts[n - 2]!.y;
    nrm[o1 + 2] = l.z - pts[n - 2]!.z;
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Position and direction at u (0..1) along the chain. */
  at(u: number, out: THREE.Vector3, dir?: THREE.Vector3) {
    const t = Math.min(0.9999, Math.max(0, u)) * (this.n - 1);
    const i = Math.floor(t);
    const f = t - i;
    out.lerpVectors(this.pts[i]!, this.pts[i + 1]!, f);
    if (dir) dir.subVectors(this.pts[i + 1]!, this.pts[i]!).normalize();
    return out;
  }
}

/** Pull a chain towards a target while its first point stays where it is (FABRIK). The segment lengths are kept. */
export function reach(ch: TubeChain, target: THREE.Vector3, iters = 8) {
  const p = ch.pts;
  const n = p.length;
  const base = p[0]!.clone();
  const tmp = new THREE.Vector3();
  for (let it = 0; it < iters; it++) {
    p[n - 1]!.copy(target);
    for (let i = n - 2; i >= 0; i--) {
      tmp.subVectors(p[i]!, p[i + 1]!).setLength(ch.lens[i]!);
      p[i]!.copy(p[i + 1]!).add(tmp);
    }
    p[0]!.copy(base);
    for (let i = 1; i < n; i++) {
      tmp.subVectors(p[i]!, p[i - 1]!).setLength(ch.lens[i - 1]!);
      p[i]!.copy(p[i - 1]!).add(tmp);
    }
  }
}

/** The points trail behind a moving head: each one keeps its distance from the one before. The tail whips for free. */
export function follow(ch: TubeChain, from = 1) {
  const p = ch.pts;
  const tmp = new THREE.Vector3();
  for (let i = from; i < p.length; i++) {
    tmp.subVectors(p[i]!, p[i - 1]!);
    const d = tmp.length() || 1;
    // move a fraction of the way so that the trailing points lag instead of snapping
    const want = ch.lens[i - 1]!;
    tmp.multiplyScalar(want / d);
    p[i]!.copy(p[i - 1]!).add(tmp);
  }
}
