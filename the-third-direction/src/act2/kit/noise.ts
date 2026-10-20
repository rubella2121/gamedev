/** Small 3D noise toolkit for painting creatures: everything is a pure function of position, so a model looks the same every run. */

export function hash3(x: number, y: number, z: number, seed = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in 0..1. */
export function vnoise(x: number, y: number, z: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  const a = hash3(ix, iy, iz, seed);
  const b = hash3(ix + 1, iy, iz, seed);
  const c = hash3(ix, iy + 1, iz, seed);
  const d = hash3(ix + 1, iy + 1, iz, seed);
  const e = hash3(ix, iy, iz + 1, seed);
  const f = hash3(ix + 1, iy, iz + 1, seed);
  const g = hash3(ix, iy + 1, iz + 1, seed);
  const h = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x0 = a + (b - a) * fx;
  const x1 = c + (d - c) * fx;
  const x2 = e + (f - e) * fx;
  const x3 = g + (h - g) * fx;
  const y0 = x0 + (x1 - x0) * fy;
  const y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}

/** Fractal noise in 0..1. */
export function fbm(x: number, y: number, z: number, oct = 4, seed = 0): number {
  let s = 0;
  let a = 0.5;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x, y, z, seed + i * 17);
    n += a;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

/** Ridged noise in 0..1: thin bright lines where the underlying noise crosses 0.5 (veins, cracks). */
export function ridge(x: number, y: number, z: number, oct = 3, seed = 0): number {
  const v = fbm(x, y, z, oct, seed);
  return 1 - Math.abs(v - 0.5) * 2;
}

/** Distance to the nearest feature point of a jittered grid (cells, scales, pores), about 0..1. */
export function worley(x: number, y: number, z: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const cy = iy + dy;
        const cz = iz + dz;
        const px = cx + hash3(cx, cy, cz, seed);
        const py = cy + hash3(cx, cy, cz, seed + 1);
        const pz = cz + hash3(cx, cy, cz, seed + 2);
        const d = (px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z);
        if (d < best) best = d;
      }
    }
  }
  return Math.sqrt(best);
}

export type RGB = [number, number, number];

/** 0xRRGGBB to linear-ish 0..1 triple (vertex colours are interpreted as linear by three, so convert from sRGB). */
export function rgb(hex: number): RGB {
  const c = (v: number) => Math.pow(v / 255, 2.2);
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale(a: RGB, k: number): RGB {
  return [a[0] * k, a[1] * k, a[2] * k];
}
