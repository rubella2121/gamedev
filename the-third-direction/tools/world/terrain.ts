import * as THREE from 'three';
import { fbm, ridge } from '../../src/act2/kit/noise';
import { ARENA_R, biomeWeights, CLIFF_Z, height, roadDist, walkSD, WX, ZN, ZONES3, ZS, type Biome } from './layout';
import { std } from './shade';

/** The ground of the whole world as one mesh, painted per vertex by biome, slope and road. */

const C = (hex: number): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const mixc = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// each ground has a dark base, a lighter patch colour and a little accent (all sRGB)
const GROUND: Record<Biome, { base: [number, number, number]; patch: [number, number, number]; accent: [number, number, number] }> = {
  glade: { base: C(0x16241f), patch: C(0x20382c), accent: C(0x3a5a3c) },
  hub: { base: C(0x2a3640), patch: C(0x3a4a54), accent: C(0x2a4a40) },
  gloom: { base: C(0x08161c), patch: C(0x0e2a33), accent: C(0x1a5a64) },
  thicket: { base: C(0x1a160e), patch: C(0x2c2316), accent: C(0x7a5424) },
  marsh: { base: C(0x10242a), patch: C(0x1a3a3c), accent: C(0x54487a) },
  bones: { base: C(0x5c564a), patch: C(0x7e7766), accent: C(0xb8ae94) },
  meadow: { base: C(0x102c26), patch: C(0x1a4638), accent: C(0xb0647e) },
  edge: { base: C(0x2a2e3a), patch: C(0x3e4252), accent: C(0x6a6a80) },
};
const ROAD = C(0x66726e);
const ROCK = C(0x2c3038);
const ROCK_LIGHT = C(0x4a5058);

export interface TerrainOpts {
  /** vertex spacing in units */
  step?: number;
  xMin?: number;
  xMax?: number;
  zMin?: number;
  zMax?: number;
}

export function buildTerrain(o: TerrainOpts = {}): THREE.Mesh {
  const step = o.step ?? 1;
  const x0 = o.xMin ?? -WX;
  const x1 = o.xMax ?? WX;
  const z0 = o.zMin ?? ZN;
  const z1 = o.zMax ?? ZS;
  const nx = Math.round((x1 - x0) / step);
  const nz = Math.round((z1 - z0) / step);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
  const col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const hs = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (i / nx) * (x1 - x0);
      const z = z0 + (j / nz) * (z1 - z0);
      const k = j * (nx + 1) + i;
      hs[k] = height(x, z);
      pos[k * 3] = x;
      pos[k * 3 + 1] = hs[k]!;
      pos[k * 3 + 2] = z;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = pos[k * 3]!;
      const y = pos[k * 3 + 1]!;
      const z = pos[k * 3 + 2]!;
      const slope = 1 - nrm.getY(k);
      const w = biomeWeights(x, z);
      let c: [number, number, number] = [0, 0, 0];
      let tot = 0;
      const nA = fbm(x * 0.06, 0, z * 0.06, 3, 5);
      const nB = fbm(x * 0.21, 0, z * 0.21, 2, 8);
      for (const b of Object.keys(w) as Biome[]) {
        if (b === 'edge') continue;
        const wt = w[b];
        if (wt <= 0.001) continue;
        const gr = GROUND[b];
        let cc = mixc(gr.base, gr.patch, Math.min(1, nA * 1.5));
        cc = mixc(cc, gr.accent, Math.max(0, nB - 0.62) * 2.2);
        c[0] += cc[0] * wt;
        c[1] += cc[1] * wt;
        c[2] += cc[2] * wt;
        tot += wt;
      }
      if (tot < 0.001) {
        // the forest floor between the zones: dark, a little mossy
        const f = mixc(C(0x0a1519), C(0x142a28), nA);
        c = f;
        tot = 1;
      } else {
        const rest = Math.max(0, 1 - tot);
        const f = mixc(C(0x0a1519), C(0x142a28), nA);
        c = [c[0] + f[0] * rest, c[1] + f[1] * rest, c[2] + f[2] * rest];
        tot = Math.max(tot, 1);
      }
      c = [c[0] / tot, c[1] / tot, c[2] / tot];
      // the road: a pale worn track, with the grass coming back at its edges
      const rd = roadDist(x, z);
      if (rd < 3) {
        const t = 1 - Math.min(1, Math.max(0, (rd + 1.5) / 4.5));
        const wear = 0.55 + 0.45 * fbm(x * 0.3, 0, z * 0.3, 2, 14);
        c = mixc(c, mixc(ROAD, [ROAD[0] * 1.35, ROAD[1] * 1.35, ROAD[2] * 1.35], wear), t * 0.85);
      }
      // each guardian's arena: old flagstones, worn pale, and a little of its colour at the heart
      for (const zn of ZONES3) {
        const da = Math.hypot(x - zn.heart.x, z - zn.heart.z);
        if (da < ARENA_R * 1.1) {
          const t = 1 - Math.min(1, Math.max(0, (da - ARENA_R * 0.62) / (ARENA_R * 0.4)));
          const flag = 0.55 + 0.45 * fbm(x * 0.5, 0, z * 0.5, 2, 61);
          const stone = mixc(C(0x222a30), C(0x4a5660), flag);
          c = mixc(c, mixc(stone, C(zn.hue), 0.06 * (1 - Math.min(1, da / 14))), t * 0.7);
        }
      }
      // steep ground is bare rock, and the cliff is all rock
      const rockT = Math.min(1, Math.max(0, (slope - 0.28) * 4.5));
      const rockN = fbm(x * 0.15, y * 0.15, z * 0.15, 3, 33);
      c = mixc(c, mixc(ROCK, ROCK_LIGHT, rockN), rockT * 0.9);
      if (z < CLIFF_Z + 6) {
        const t = Math.min(1, (CLIFF_Z + 6 - z) / 8);
        c = mixc(c, mixc(ROCK, ROCK_LIGHT, rockN), t);
      }
      // a ridged moss tint on the walls of the forest
      const sdv = walkSD(x, z);
      if (sdv > 4) c = mixc(c, C(0x07110f), Math.min(0.6, (sdv - 4) * 0.04));
      void ridge;
      col[k * 3] = c[0];
      col[k * 3 + 1] = c[1];
      col[k * 3 + 2] = c[2];
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, std({ vertexColors: true, roughness: 0.96, vary: 0.5, bump: 1.6, scale: [0.35, 0.35] }));
  m.receiveShadow = true;
  m.castShadow = false;
  m.name = 'terrain';
  return m;
}
