import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm } from '../../src/act2/kit/noise';

/** Small geometry builders for the props: tubes along a path, jittered blobs, cones, merged into one coloured mesh. */

export type Rgb = [number, number, number];
export const lin = (hex: number): Rgb => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulRgb = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

export type ColorFn = (t: number, a: number, p: THREE.Vector3) => Rgb;

function finish(pos: number[], col: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A tube along `path` (at least two points) with a radius at each point, parallel-transported so it never twists. */
export function tube(path: THREE.Vector3[], radii: number[], radial: number, color: ColorFn, cap = true): THREE.BufferGeometry {
  const n = path.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tan = new THREE.Vector3();
  let nrm = new THREE.Vector3();
  const bin = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)]!;
    const b = path[Math.min(n - 1, i + 1)]!;
    tan.subVectors(b, a).normalize();
    if (i === 0) {
      nrm = Math.abs(tan.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(tan).normalize() : new THREE.Vector3(1, 0, 0).cross(tan).normalize();
    } else {
      // carry the previous normal along
      nrm.sub(tan.clone().multiplyScalar(nrm.dot(tan))).normalize();
    }
    bin.crossVectors(tan, nrm).normalize();
    const t = i / (n - 1);
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2;
      const ox = Math.cos(ang) * radii[i]!;
      const oy = Math.sin(ang) * radii[i]!;
      const p = new THREE.Vector3().copy(path[i]!).addScaledVector(nrm, ox).addScaledVector(bin, oy);
      pos.push(p.x, p.y, p.z);
      const c = color(t, j / radial, p);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, b, c, b, d, c);
    }
  }
  if (cap) {
    // close the far end with a point so a tip is not a hole
    const last = path[n - 1]!;
    const ci = pos.length / 3;
    pos.push(last.x, last.y, last.z);
    const c = color(1, 0, last);
    col.push(c[0], c[1], c[2]);
    for (let j = 0; j < radial; j++) idx.push((n - 1) * radial + ((j + 1) % radial), (n - 1) * radial + j, ci);
  }
  return finish(pos, col, idx);
}

/** A rough ball (an icosphere shaken by noise): leaf clumps, rocks, mounds. */
export function blob(center: THREE.Vector3, r: number, detail: number, color: ColorFn, seed = 0, rough = 0.28, squash = 1): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const col: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = fbm(v.x * 2.1 + seed, v.y * 2.1, v.z * 2.1 + seed * 0.7, 3, 7) - 0.5;
    const rr = r * (1 + n * rough * 2);
    const q = new THREE.Vector3(center.x + v.x * rr, center.y + v.y * rr * squash, center.z + v.z * rr);
    p.setXYZ(i, q.x, q.y, q.z);
    const c = color((v.y + 1) / 2, n + 0.5, q);
    col.push(c[0], c[1], c[2]);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** A cone from `base` pointing along `dir`, `len` long. */
export function cone(base: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, radial: number, color: ColorFn): THREE.BufferGeometry {
  const d = dir.clone().normalize();
  return tube([base.clone(), base.clone().addScaledVector(d, len)], [r, r * 0.02], radial, color, true);
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return m;
}

/** A surface of revolution about the y axis. `profile` is [radius, y] from the bottom up; `wobble(angle, y)` scales the radius (folds, ragged edges). */
export function lathe(profile: [number, number][], seg: number, color: ColorFn, wobble?: (a: number, y: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const n = profile.length;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const [r, y] = profile[j]!;
      const rr = r * (wobble ? wobble(a, y) : 1);
      const p = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
      pos.push(p.x, p.y, p.z);
      const c = color(j / (n - 1), i / seg, p);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i;
      const b = j * seg + ((i + 1) % seg);
      const c = (j + 1) * seg + i;
      const d = (j + 1) * seg + ((i + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  return finish(pos, col, idx);
}

/** A flat ribbon along `path`, `widths` wide, spread along `side` (a vector, or one per point), with an optional cup across it: petals, feathers, cloth, wings. Draw it double-sided. */
export function strip(path: THREE.Vector3[], widths: number[], side: THREE.Vector3 | ((i: number) => THREE.Vector3), color: ColorFn, cup = 0, across = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const n = path.length;
  const tan = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    tan.subVectors(path[Math.min(n - 1, i + 1)]!, path[Math.max(0, i - 1)]!).normalize();
    const s0 = typeof side === 'function' ? side(i) : side;
    const s = s0.clone().addScaledVector(tan, -s0.dot(tan)).normalize();
    const nr = new THREE.Vector3().crossVectors(tan, s).normalize();
    for (let v = 0; v <= across; v++) {
      const f = (v / across) * 2 - 1;
      const p = path[i]!.clone().addScaledVector(s, widths[i]! * 0.5 * f).addScaledVector(nr, cup * widths[i]! * f * f);
      pos.push(p.x, p.y, p.z);
      const c = color(i / (n - 1), (f + 1) / 2, p);
      col.push(c[0], c[1], c[2]);
    }
  }
  const row = across + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let v = 0; v < across; v++) {
      const a = i * row + v;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  return finish(pos, col, idx);
}

/**
 * A copy of a mesh's surface that only lights where `pick` says so (cracks, eyes, veins), pushed out a little: drawn additively over the lit surface it looks like
 * the surface is glowing from within. `pick` returns a colour, or null for no glow.
 */
export function glowOf(geo: THREE.BufferGeometry, pick: (p: THREE.Vector3, n: THREE.Vector3, c: Rgb) => Rgb | null, grow = 0.04): THREE.BufferGeometry {
  const g = geo.clone();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const nr = g.getAttribute('normal') as THREE.BufferAttribute;
  const c = g.getAttribute('color') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    n.fromBufferAttribute(nr, i);
    const out = pick(v, n, [c.getX(i), c.getY(i), c.getZ(i)]);
    v.addScaledVector(n, grow);
    p.setXYZ(i, v.x, v.y, v.z);
    c.setXYZ(i, out ? out[0] : 0, out ? out[1] : 0, out ? out[2] : 0);
  }
  return g;
}
