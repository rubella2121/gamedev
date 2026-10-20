import * as THREE from 'three';

/** Signed distance functions: negative inside a shape. Shapes are glued together with smooth unions, then meshed once. */
export type SDF = (x: number, y: number, z: number) => number;
export type V3 = [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ---------------------------------------------------------------- */
/* shapes                                                            */
/* ---------------------------------------------------------------- */

export const sphere = (c: V3, r: number): SDF => {
  const [cx, cy, cz] = c;
  return (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - r;
};

/** Not an exact distance, but its zero surface is exact, which is all the mesher and the shading need. */
export const ellipsoid = (c: V3, rad: V3): SDF => {
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = rad;
  const k = Math.min(rx, ry, rz);
  return (x, y, z) => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    const dz = (z - cz) / rz;
    return (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * k;
  };
};

/** A tapered capsule from a to b: radius ra at a, rb at b. */
export const capsule = (a: V3, b: V3, ra: number, rb = ra): SDF => {
  const [ax, ay, az] = a;
  const bx = b[0] - ax;
  const by = b[1] - ay;
  const bz = b[2] - az;
  const l2 = bx * bx + by * by + bz * bz || 1;
  return (x, y, z) => {
    const px = x - ax;
    const py = y - ay;
    const pz = z - az;
    const t = clamp01((px * bx + py * by + pz * bz) / l2);
    return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
  };
};

export const box = (c: V3, h: V3, round = 0): SDF => {
  const [cx, cy, cz] = c;
  return (x, y, z) => {
    const qx = Math.abs(x - cx) - h[0] + round;
    const qy = Math.abs(y - cy) - h[1] + round;
    const qz = Math.abs(z - cz) - h[2] + round;
    const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return out + Math.min(Math.max(qx, qy, qz), 0) - round;
  };
};

/** A ring around the y axis (or the given axis) with a round tube. */
export const torus = (c: V3, R: number, r: number, axis: 'x' | 'y' | 'z' = 'y'): SDF => {
  const [cx, cy, cz] = c;
  return (x, y, z) => {
    const px = x - cx;
    const py = y - cy;
    const pz = z - cz;
    let a: number;
    let b: number;
    if (axis === 'y') {
      a = Math.hypot(px, pz);
      b = py;
    } else if (axis === 'x') {
      a = Math.hypot(py, pz);
      b = px;
    } else {
      a = Math.hypot(px, py);
      b = pz;
    }
    return Math.hypot(a - R, b) - r;
  };
};

/* ---------------------------------------------------------------- */
/* combining                                                         */
/* ---------------------------------------------------------------- */

export const union =
  (...fs: SDF[]): SDF =>
  (x, y, z) => {
    let m = Infinity;
    for (let i = 0; i < fs.length; i++) {
      const v = fs[i]!(x, y, z);
      if (v < m) m = v;
    }
    return m;
  };

/** Polynomial smooth minimum: shapes melt into each other over a distance of k. */
export const smin = (k: number, ...fs: SDF[]): SDF => {
  if (fs.length === 2) {
    const [a, b] = fs as [SDF, SDF];
    return (x, y, z) => {
      const u = a(x, y, z);
      const v = b(x, y, z);
      const h = Math.max(k - Math.abs(u - v), 0) / k;
      return Math.min(u, v) - h * h * k * 0.25;
    };
  }
  return (x, y, z) => {
    let m = fs[0]!(x, y, z);
    for (let i = 1; i < fs.length; i++) {
      const v = fs[i]!(x, y, z);
      const h = Math.max(k - Math.abs(m - v), 0) / k;
      m = Math.min(m, v) - h * h * k * 0.25;
    }
    return m;
  };
};

/** a with b carved out of it. */
export const sub =
  (a: SDF, b: SDF): SDF =>
  (x, y, z) =>
    Math.max(a(x, y, z), -b(x, y, z));

/** a with b carved out of it, with a soft lip around the cut. */
export const ssub =
  (k: number, a: SDF, b: SDF): SDF =>
  (x, y, z) => {
    const u = a(x, y, z);
    const v = -b(x, y, z);
    const h = Math.max(k - Math.abs(u - v), 0) / k;
    return Math.max(u, v) + h * h * k * 0.25;
  };

export const inter =
  (a: SDF, b: SDF): SDF =>
  (x, y, z) =>
    Math.max(a(x, y, z), b(x, y, z));

/* ---------------------------------------------------------------- */
/* moving things around                                              */
/* ---------------------------------------------------------------- */

export const move =
  (f: SDF, dx: number, dy: number, dz: number): SDF =>
  (x, y, z) =>
    f(x - dx, y - dy, z - dz);

export const rotX = (f: SDF, a: number): SDF => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x, y, z) => f(x, c * y + s * z, -s * y + c * z);
};
export const rotY = (f: SDF, a: number): SDF => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x, y, z) => f(c * x - s * z, y, s * x + c * z);
};
export const rotZ = (f: SDF, a: number): SDF => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return (x, y, z) => f(c * x + s * y, -s * x + c * y, z);
};

export const mirrorX =
  (f: SDF): SDF =>
  (x, y, z) =>
    f(Math.abs(x), y, z);

/** Skip the cost of a detailed shape while far from it: outside `r + margin` of the centre only the bounding sphere is measured. */
export const lazy = (f: SDF, c: V3, r: number, margin = 1.5): SDF => {
  const [cx, cy, cz] = c;
  return (x, y, z) => {
    const d = Math.hypot(x - cx, y - cy, z - cz) - r;
    return d > margin ? d : f(x, y, z);
  };
};

export const displace = (f: SDF, g: (x: number, y: number, z: number) => number): SDF => (x, y, z) => f(x, y, z) + g(x, y, z);

/* ---------------------------------------------------------------- */
/* meshing (surface nets)                                            */
/* ---------------------------------------------------------------- */

export interface MeshOpts {
  /** paint a vertex: position, normal and how open the surface is (1 = open, 0 = a crease) */
  color?: (x: number, y: number, z: number, nx: number, ny: number, nz: number, ao: number) => [number, number, number];
  /** how strongly crevices darken, 0..1 */
  aoAmount?: number;
}

const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Turn a distance function into a smooth mesh. A generator so a big model can be built a few milliseconds at a time
 * (`yield` every few slices); `meshSDF` simply runs it to the end.
 */
export function* meshGen(f: SDF, min: V3, max: V3, cell: number, o: MeshOpts = {}): Generator<void, THREE.BufferGeometry, void> {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const field = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    const z = min[2] + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * cell;
      let idx = (k * ny + j) * nx;
      for (let i = 0; i < nx; i++) field[idx++] = f(min[0] + i * cell, y, z);
    }
    if ((k & 3) === 3) yield;
  }
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const vid = new Int32Array(cx * cy * cz).fill(-1);
  const pos: number[] = [];
  const vals = new Float32Array(8);
  const sxy = nx * ny;
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        const base = k * sxy + j * nx + i;
        for (let c = 0; c < 8; c++) {
          const v = field[base + (c & 1) + ((c >> 1) & 1) * nx + ((c >> 2) & 1) * sxy]!;
          vals[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 12; e++) {
          const a = EDGES[e]![0];
          const b = EDGES[e]![1];
          const va = vals[a]!;
          const vb = vals[b]!;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        vid[(k * cy + j) * cx + i] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
      }
    }
    if ((k & 3) === 3) yield;
  }
  const idx: number[] = [];
  const cellAt = (i: number, j: number, k: number) => vid[(k * cy + j) * cx + i]!;
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = field[k * sxy + j * nx + i]! < 0;
        // x edge: (i,j,k) -> (i+1,j,k); the cells around it share y and z neighbours
        if (i < nx - 1 && j >= 1 && j < ny - 1 && k >= 1 && k < nz - 1) {
          const v1 = field[k * sxy + j * nx + i + 1]! < 0;
          if (v0 !== v1) quad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k), !v0);
        }
        if (j < ny - 1 && i >= 1 && i < nx - 1 && k >= 1 && k < nz - 1) {
          const v1 = field[k * sxy + (j + 1) * nx + i]! < 0;
          if (v0 !== v1) quad(cellAt(i - 1, j, k - 1), cellAt(i - 1, j, k), cellAt(i, j, k), cellAt(i, j, k - 1), !v0);
        }
        if (k < nz - 1 && i >= 1 && i < nx - 1 && j >= 1 && j < ny - 1) {
          const v1 = field[(k + 1) * sxy + j * nx + i]! < 0;
          if (v0 !== v1) quad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k), !v0);
        }
      }
    }
    if ((k & 3) === 3) yield;
  }
  // normals from the field itself, vertices nudged onto the surface, colours painted last
  const nv = pos.length / 3;
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const e = cell * 0.5;
  const aoK = o.aoAmount ?? 0.7;
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3]!;
    let y = pos[v * 3 + 1]!;
    let z = pos[v * 3 + 2]!;
    let gx = f(x + e, y, z) - f(x - e, y, z);
    let gy = f(x, y + e, z) - f(x, y - e, z);
    let gz = f(x, y, z + e) - f(x, y, z - e);
    let gl = Math.hypot(gx, gy, gz) || 1;
    gx /= gl;
    gy /= gl;
    gz /= gl;
    const d = f(x, y, z);
    if (Math.abs(d) < cell * 1.2) {
      x -= gx * d * 0.9;
      y -= gy * d * 0.9;
      z -= gz * d * 0.9;
      pos[v * 3] = x;
      pos[v * 3 + 1] = y;
      pos[v * 3 + 2] = z;
      gx = f(x + e, y, z) - f(x - e, y, z);
      gy = f(x, y + e, z) - f(x, y - e, z);
      gz = f(x, y, z + e) - f(x, y, z - e);
      gl = Math.hypot(gx, gy, gz) || 1;
      gx /= gl;
      gy /= gl;
      gz /= gl;
    }
    nrm[v * 3] = gx;
    nrm[v * 3 + 1] = gy;
    nrm[v * 3 + 2] = gz;
    // how open is the surface here? probe a little way out along the normal
    const a1 = clamp01(f(x + gx * 0.3, y + gy * 0.3, z + gz * 0.3) / 0.3);
    const a2 = clamp01(f(x + gx * 0.9, y + gy * 0.9, z + gz * 0.9) / 0.9);
    const ao = 0.55 * a1 + 0.45 * a2;
    const c = o.color ? o.color(x, y, z, gx, gy, gz, ao) : [0.6, 0.6, 0.6];
    const k = 1 - aoK * (1 - ao);
    col[v * 3] = c[0] * k;
    col[v * 3 + 1] = c[1] * k;
    col[v * 3 + 2] = c[2] * k;
    if ((v & 4095) === 4095) yield;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

/** Mesh a shape right now. */
export function meshSDF(f: SDF, min: V3, max: V3, cell: number, o: MeshOpts = {}): THREE.BufferGeometry {
  const it = meshGen(f, min, max, cell, o);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Runs generators a few milliseconds per frame, so a model builds while the game goes on. */
export class Slicer {
  private jobs: { it: Generator<void, unknown, void>; done: (v: unknown) => void }[] = [];

  add<T>(it: Generator<void, T, void>, done: (v: T) => void) {
    this.jobs.push({ it, done: done as (v: unknown) => void });
  }

  get busy() {
    return this.jobs.length > 0;
  }

  /** Spend up to `ms` milliseconds on the queue. */
  run(ms: number) {
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < ms) {
      const j = this.jobs[0]!;
      const r = j.it.next();
      if (r.done) {
        this.jobs.shift();
        j.done(r.value);
      }
    }
  }

  /** Finish everything now. */
  flush() {
    while (this.jobs.length) this.run(1e9);
  }
}
