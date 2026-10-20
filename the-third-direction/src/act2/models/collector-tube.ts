import * as THREE from 'three';
import type { RGB } from '../kit/noise';

/**
 * Like the kit's TubeChain (a tube that follows points), but the radius can also change with the angle round the tube, so a
 * limb can have ridges of sinew that twist along it, a knuckle can be fluted, a cable can be braided. Same interface:
 * move `pts`, call `update()`.
 */
export class SinewChain {
  readonly mesh: THREE.Mesh;
  readonly pts: THREE.Vector3[];
  readonly lens: number[];
  private n: number;
  private m: number;
  private pos: Float32Array;
  private nrm: Float32Array;
  private ra: number[];
  /** radius multiplier at each vertex (from `ridge`) */
  private mod: Float32Array;
  private ta = new THREE.Vector3();
  private na = new THREE.Vector3();
  private ba = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  /**
   * @param n points along the chain
   * @param m sides round it
   * @param radius radius at u (0 at the first point, 1 at the last)
   * @param color colour at u and angle
   * @param ridge radius multiplier at u and angle (1 = round)
   */
  constructor(n: number, m: number, mat: THREE.Material, radius: (u: number) => number, color?: (u: number, a: number) => RGB, ridge?: (u: number, a: number) => number) {
    this.n = n;
    this.m = m;
    this.pts = Array.from({ length: n }, (_, i) => new THREE.Vector3(i, 0, 0));
    this.lens = Array.from({ length: n - 1 }, () => 1);
    this.ra = Array.from({ length: n }, (_, i) => radius(i / (n - 1)));
    const nv = n * m + 2;
    this.pos = new Float32Array(nv * 3);
    this.nrm = new Float32Array(nv * 3);
    this.mod = new Float32Array(nv).fill(1);
    const ca = new Float32Array(nv * 3).fill(1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const u = i / (n - 1);
        const a = (j / m) * Math.PI * 2;
        if (ridge) this.mod[i * m + j] = ridge(u, a);
        if (color) ca.set(color(u, a), (i * m + j) * 3);
      }
    }
    if (color) {
      ca.set(color(0, 0), n * m * 3);
      ca.set(color(1, 0), (n * m + 1) * 3);
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < m; j++) {
        const a = i * m + j;
        const b = i * m + ((j + 1) % m);
        const c = (i + 1) * m + j;
        const d = (i + 1) * m + ((j + 1) % m);
        idx.push(a, b, c, b, d, c);
      }
    }
    for (let j = 0; j < m; j++) {
      idx.push(n * m, (j + 1) % m, j);
      idx.push(n * m + 1, (n - 1) * m + j, (n - 1) * m + ((j + 1) % m));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }

  rest() {
    for (let i = 0; i < this.n - 1; i++) this.lens[i] = this.pts[i]!.distanceTo(this.pts[i + 1]!);
  }

  update() {
    const { n, m, pos, nrm, pts, ta, na, ba, tmp, mod } = this;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)]!;
      const b = pts[Math.min(n - 1, i + 1)]!;
      ta.subVectors(b, a);
      if (ta.lengthSq() < 1e-9) ta.set(1, 0, 0);
      ta.normalize();
      if (i === 0) {
        tmp.set(Math.abs(ta.y) > 0.9 ? 1 : 0, Math.abs(ta.y) > 0.9 ? 0 : 1, 0);
        na.crossVectors(ta, tmp).normalize();
      } else {
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
        const rr = r * mod[i * m + j]!;
        pos[o] = p.x + nx * rr;
        pos[o + 1] = p.y + ny * rr;
        pos[o + 2] = p.z + nz * rr;
        nrm[o] = nx;
        nrm[o + 1] = ny;
        nrm[o + 2] = nz;
      }
    }
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
