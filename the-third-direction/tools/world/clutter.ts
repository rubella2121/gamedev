import * as THREE from 'three';
import { rng } from '../../src/core/util';
import { blob, lin, merge, mixRgb, mulRgb, tube, type Rgb } from './geo';
import { std } from './shade';

/** Small things that cover the ground: grass, ferns, stones, mushrooms, flowers, reeds, bones. Instanced, placed only near the camera. */

export type ClutterKind = 'grass' | 'fern' | 'rock' | 'shroom' | 'bluebell' | 'bloom' | 'reed' | 'shard' | 'twig' | 'pebble';

interface Mesh2 {
  /** lit parts (stems, rocks) */
  lit?: THREE.BufferGeometry;
  /** glowing parts (caps, petals): drawn unlit and bright, so bloom picks them up */
  glow?: THREE.BufferGeometry;
}

const cache = new Map<string, Mesh2>();

function bladeSet(r: () => number, n: number, h: number, spread: number, col: Rgb, tip: Rgb): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * spread;
    const hh = h * (0.6 + 0.7 * r());
    const lean = (0.2 + r() * 0.5) * hh * 0.5;
    const bx = Math.cos(a) * d;
    const bz = Math.sin(a) * d;
    const path = [0, 0.4, 0.75, 1].map((t) => new THREE.Vector3(bx + Math.cos(a) * lean * t * t, hh * t, bz + Math.sin(a) * lean * t * t));
    parts.push(tube(path, [0.045, 0.036, 0.022, 0.002], 3, (t) => mixRgb(col, tip, t * t)));
  }
  return merge(parts);
}

function build(kind: ClutterKind, variant: number): Mesh2 {
  const key = `${kind}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(variant * 131 + 7 + kind.length * 17);
  let out: Mesh2 = {};
  switch (kind) {
    case 'grass':
      out = { lit: bladeSet(r, 9, 0.9, 0.35, lin(0x0f3a34), lin(0x4a8a6c)) };
      break;
    case 'fern': {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + r() * 0.4;
        const L = 0.9 + r() * 0.7;
        const path = [0, 0.3, 0.6, 1].map((t) => new THREE.Vector3(Math.cos(a) * L * t, 0.25 + Math.sin(t * 2.4) * L * 0.45 - t * t * 0.2, Math.sin(a) * L * t));
        parts.push(tube(path, [0.05, 0.05, 0.035, 0.004], 3, (t) => mixRgb(lin(0x103a30), lin(0x3a8a64), t)));
      }
      out = { lit: merge(parts) };
      break;
    }
    case 'rock': {
      const s = 0.5 + r() * 0.9;
      out = { lit: blob(new THREE.Vector3(0, s * 0.3, 0), s, 1, (t, a) => mulRgb(mixRgb(lin(0x1c2228), lin(0x4a5258), a), 0.7 + 0.5 * t), variant * 3.3, 0.35, 0.7) };
      break;
    }
    case 'pebble': {
      const s = 0.12 + r() * 0.2;
      out = { lit: blob(new THREE.Vector3(0, s * 0.3, 0), s, 0, (t, a) => mulRgb(mixRgb(lin(0x20262c), lin(0x555a60), a), 0.8 + 0.4 * t), variant, 0.3, 0.6) };
      break;
    }
    case 'shroom': {
      const h = 0.35 + r() * 0.9;
      const lean = (r() - 0.5) * 0.3;
      const stem = tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.5, h * 0.55, 0), new THREE.Vector3(lean, h, 0)], [0.09, 0.07, 0.06], 5, () => lin(0xb8c8d0));
      const cap = blob(new THREE.Vector3(lean, h + 0.04, 0), 0.34 + r() * 0.3, 1, (t) => mixRgb(lin(0x2a9ab0), lin(0x9ff4ee), t), variant, 0.1, 0.55);
      out = { lit: stem, glow: cap };
      break;
    }
    case 'bluebell': {
      const h = 0.5 + r() * 0.7;
      const lean = (r() - 0.5) * 0.4;
      const stem = tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.4, h * 0.6, 0), new THREE.Vector3(lean, h, 0)], [0.025, 0.02, 0.018], 3, () => lin(0x1a5a40));
      const cup = tube([new THREE.Vector3(lean, h, 0), new THREE.Vector3(lean + 0.02, h - 0.13, 0), new THREE.Vector3(lean + 0.05, h - 0.3, 0)], [0.012, 0.11, 0.09], 8, (t) => mixRgb(lin(0xcaf6ff), lin(0x3a9ad0), t));
      out = { lit: stem, glow: cup };
      break;
    }
    case 'bloom': {
      const h = 0.9 + r() * 1.2;
      const stem = tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, h * 0.55, 0.05), new THREE.Vector3(0.18, h, 0)], [0.05, 0.04, 0.035], 4, () => lin(0x1a5a44));
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const pet = tube([new THREE.Vector3(0.18, h, 0), new THREE.Vector3(0.18 + Math.cos(a) * 0.2, h + 0.1, Math.sin(a) * 0.2), new THREE.Vector3(0.18 + Math.cos(a) * 0.45, h + 0.03, Math.sin(a) * 0.45)], [0.03, 0.12, 0.05], 5, (t) => mixRgb(lin(0xffe0ee), lin(0xff7aa8), t));
        parts.push(pet);
      }
      parts.push(blob(new THREE.Vector3(0.18, h + 0.05, 0), 0.12, 1, () => lin(0xfff0a0), variant, 0.1, 0.8));
      out = { lit: stem, glow: merge(parts) };
      break;
    }
    case 'reed': {
      const h = 2.4 + r() * 2.2;
      const lean = (r() - 0.5) * 1.1;
      const pts = [0, 0.33, 0.66, 1].map((t) => new THREE.Vector3(lean * t * t, h * t, (r() - 0.5) * 0.1));
      const stem = tube(pts, [0.045, 0.04, 0.032, 0.026], 4, (t) => mixRgb(lin(0x2a3a30), lin(0x6a5a8a), t));
      const head = tube([pts[3]!.clone(), pts[3]!.clone().add(new THREE.Vector3(lean * 0.05, 0.4, 0))], [0.07, 0.02], 5, () => lin(0x4a3a30));
      out = { lit: merge([stem, head]) };
      break;
    }
    case 'shard': {
      const h = 0.6 + r() * 1.8;
      const a = r() * Math.PI * 2;
      const lean = 0.15 + r() * 0.4;
      const path = [0, 0.5, 1].map((t) => new THREE.Vector3(Math.cos(a) * lean * t * t * h, h * t, Math.sin(a) * lean * t * t * h));
      out = { lit: tube(path, [0.16 + r() * 0.12, 0.1, 0.004], 5, (t, aa) => mixRgb(lin(0xc4b898), lin(0xefe8d4), t * 0.5 + aa * 0.3)) };
      break;
    }
    case 'twig': {
      const L = 0.8 + r() * 1.6;
      const a = r() * Math.PI * 2;
      const path = [0, 0.5, 1].map((t) => new THREE.Vector3(Math.cos(a) * L * t, 0.05 + Math.sin(t * 3) * 0.04, Math.sin(a) * L * t));
      out = { lit: tube(path, [0.05, 0.04, 0.012], 4, () => lin(0x2a2018)) };
      break;
    }
  }
  cache.set(key, out);
  return out;
}

export interface ScatterSpec {
  kind: ClutterKind;
  /** instances per square unit */
  density: number;
  /** returns 0..1: how likely a spot is for this kind (use it to follow biomes and keep roads clear) */
  where?: (x: number, z: number) => number;
  /** size multiplier range */
  size?: [number, number];
  /** land the foot this far under the ground (units) */
  sink?: number;
  /** how many distinct shapes to rotate through */
  variants?: number;
  /** light (the thing it is) casts shadows */
  shadow?: boolean;
}

const litMat = std({ vertexColors: true, roughness: 0.85, vary: 0.35, bump: 0 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: true });

/** Scatter instanced clutter in a disc around (cx, cz) over the ground `gy`. */
export function scatter(cx: number, cz: number, radius: number, gy: (x: number, z: number) => number, specs: ScatterSpec[], seed = 3): THREE.Group {
  const grp = new THREE.Group();
  const rand = rng(seed);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const sp of specs) {
    const n = Math.round(Math.PI * radius * radius * sp.density);
    const nv = sp.variants ?? 3;
    const lists: { x: number; y: number; z: number; s: number; rot: number }[][] = Array.from({ length: nv }, () => []);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * radius;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      const w = sp.where ? sp.where(x, z) : 1;
      if (w <= 0 || rand() > w) continue;
      const sz = sp.size ?? [0.8, 1.3];
      lists[Math.floor(rand() * nv)]!.push({ x, y: gy(x, z) - (sp.sink ?? 0.05), z, s: sz[0] + (sz[1] - sz[0]) * rand(), rot: rand() * Math.PI * 2 });
    }
    lists.forEach((list, v) => {
      if (!list.length) return;
      const geo = build(sp.kind, v);
      for (const [g, mat] of [[geo.lit, litMat], [geo.glow, glowMat]] as [THREE.BufferGeometry | undefined, THREE.Material][]) {
        if (!g) continue;
        const mesh = new THREE.InstancedMesh(g, mat, list.length);
        list.forEach((it, i) => {
          e.set((rand() - 0.5) * 0.15, it.rot, (rand() - 0.5) * 0.15);
          q.setFromEuler(e);
          m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
          mesh.setMatrixAt(i, m4);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.castShadow = !!sp.shadow && mat === litMat;
        mesh.receiveShadow = true;
        grp.add(mesh);
      }
    });
  }
  return grp;
}
