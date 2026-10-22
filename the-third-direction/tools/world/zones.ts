import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { rng } from '../../src/core/util';
import type { ZoneId } from '../../src/forest/land';
import { ARENA_R, roadDist, WATER_Y, zone3, type Zone3 } from './layout';
import { blob, lin, merge, mixRgb, tube } from './geo';
import { glowMat, std } from './shade';
import { glowPool, glowSprite, motes } from './fx';
import { makeLantern } from './pieces';
import { makeBoneWyrm } from './guardians';
import { makeMimicQueen } from './g-mimic';
import { makeTollQueen } from './g-toll';
import { makeThornbackKing } from './g-thorn';
import { makeGloommother } from './g-gloom';
import type { ClutterKind } from './clutter';
import { clearCorridor, clearTrees, cover, put, type Ctx } from './ctx';

/** The look of each place: its guardian, what grows there, the colour of its light. */

interface ZoneCfg {
  make: () => THREE.Object3D;
  mix: Partial<Record<ClutterKind, number>>;
  tint: Partial<Record<ClutterKind, [number, number]>>;
  motes: number[];
  moteCount: number;
  stone: 'obelisk' | 'block' | 'leaning' | 'tusk' | 'pale';
  lantern: number;
}

export const ZCFG: Record<ZoneId, ZoneCfg> = {
  gloom: {
    make: makeGloommother,
    mix: { grass: 0.55, fern: 0.22, shroom: 0.11, bluebell: 0.08, twig: 0.05, rock: 0.015 },
    tint: { shroom: [0x062a30, 0x4ad0e0], bluebell: [0x0c4a52, 0x8ff0ff] },
    motes: [0x8ff8ff, 0x4ad0e0, 0xcaf6ff],
    moteCount: 150,
    stone: 'obelisk',
    lantern: 0x8ff8ff,
  },
  thicket: {
    make: makeThornbackKing,
    mix: { fern: 0.3, grass: 0.32, shroom: 0.07, twig: 0.1, rock: 0.025 },
    tint: { shroom: [0x3a1604, 0xff9a30] },
    motes: [0xffb060, 0xff8a22, 0xffe0a0],
    moteCount: 170,
    stone: 'block',
    lantern: 0xffb05a,
  },
  marsh: {
    make: makeTollQueen,
    mix: { reed: 0.09, fern: 0.06, shroom: 0.07, pebble: 0.15, grass: 0.16 },
    tint: { shroom: [0x261a4a, 0xb89aff] },
    motes: [0xd9b8ff, 0xb08aff, 0xffffff],
    moteCount: 150,
    stone: 'leaning',
    lantern: 0xd9b8ff,
  },
  bones: {
    make: makeBoneWyrm,
    mix: { shard: 0.07, pebble: 0.25, rock: 0.03, twig: 0.06 },
    tint: {},
    motes: [0xf4efe0, 0xdfefff],
    moteCount: 90,
    stone: 'tusk',
    lantern: 0xf4efe0,
  },
  meadow: {
    make: makeMimicQueen,
    mix: { grass: 0.5, bloom: 0.5, bluebell: 0.3, fern: 0.05 },
    tint: { bloom: [0x4a0e2a, 0xff7aa8], bluebell: [0x1a2a9a, 0x8ac0ff] },
    motes: [0xff9ac0, 0xffd0e0, 0xbad8ff],
    moteCount: 200,
    stone: 'pale',
    lantern: 0xff9ac0,
  },
};

/** the water of the marsh: a dark mirror that ripples, drawn from a real reflection of the scene */
export function makeWater(c: Ctx, cx: number, cz: number, w: number, d: number, y = WATER_Y): THREE.Mesh {
  const fog = c.scene.fog as THREE.FogExp2;
  const shader = {
    name: 'Water',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      uDeep: { value: new THREE.Color(0x040f16) },
      uFog: { value: fog.color.clone() },
      uFogK: { value: fog.density },
    },
    vertexShader: /* glsl */ `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      void main(){ vUv = textureMatrix * vec4(position, 1.0); vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 color; uniform sampler2D tDiffuse; uniform vec3 uDeep; uniform vec3 uFog; uniform float uFogK; varying vec4 vUv; varying vec3 vW;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.4);
        float r1 = n(vW.xz * 0.9) + 0.5 * n(vW.xz * 2.3 + 5.0);
        vec2 rip = (vec2(n(vW.xz * 1.1 + 3.0), n(vW.xz * 1.3 + 9.0)) - 0.5) * 0.05 + vec2(0.0, (r1 - 0.7) * 0.02);
        vec4 uv = vUv; uv.xy += rip * uv.w;
        vec3 refl = texture2DProj(tDiffuse, uv).rgb;
        vec3 col = mix(uDeep, refl, clamp(0.18 + 0.82 * fres, 0.0, 1.0));
        float dist = length(cameraPosition - vW);
        col = mix(col, uFog, clamp(1.0 - exp(-uFogK * uFogK * dist * dist * 0.6), 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  };
  const wm = new Reflector(new THREE.PlaneGeometry(w, d), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, shader, color: 0xffffff });
  wm.rotation.x = -Math.PI / 2;
  wm.position.set(cx, y, cz);
  wm.userData['noDepth'] = false;
  return wm;
}

/** one standing stone of an arena's ring, with a glowing rune on the side that faces the middle */
function monolith(kind: ZoneCfg['stone'], hue: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const H = 5 + r() * 4;
  const rad = 0.9 + r() * 0.6;
  const lean = (r() - 0.5) * 0.9;
  const col = (t: number, a: number): [number, number, number] => {
    switch (kind) {
      case 'obelisk': return mixRgb(lin(0x02080a), lin(0x0e2a30), a * 0.6 + t * 0.2);
      case 'block': return mixRgb(lin(0x2a2218), lin(0x5a4a34), a * 0.7);
      case 'leaning': return mixRgb(lin(0x2a2838), lin(0x5a5878), a * 0.7);
      case 'tusk': return mixRgb(lin(0xb8ae94), lin(0xf2ecd8), a * 0.5 + t * 0.4);
      case 'pale': return mixRgb(lin(0x4a5258), lin(0x8a949a), a * 0.7);
    }
  };
  const taper = kind === 'tusk' ? 0.02 : kind === 'obelisk' ? 0.2 : 0.55;
  const path = [0, 0.34, 0.68, 1].map((t) => new THREE.Vector3(lean * t * t * (kind === 'tusk' ? 4 : 1.2), t * H, 0));
  const radii = [rad * 1.25, rad * 1.05, rad * (0.9 - taper * 0.35), Math.max(0.04, rad * taper)];
  g.add(new THREE.Mesh(tube(path, radii, kind === 'block' ? 4 : 7, col), std({ vertexColors: true, roughness: kind === 'tusk' ? 0.6 : 0.9, vary: 0.5, bump: 1.4, flatShading: kind === 'block', rim: { color: hue, k: 0.5 } })));
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.8), glowMat({ color: hue, opacity: 0.9, side: THREE.DoubleSide }));
  rune.position.set(0, H * 0.45, -rad * 0.95);
  rune.rotation.y = Math.PI;
  g.add(rune);
  g.add(glowSprite(0, H * 0.45, -rad * 1.4, 3.2, hue, 0.5));
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = !(o as THREE.Mesh).material || !((o as THREE.Mesh).material as THREE.Material).transparent) : null));
  return g;
}

/** the ring of stones and the glyphs on the floor that say "this is where it happens" */
export function arenaRing(c: Ctx, zn: Zone3, kind: ZoneCfg['stone'], n = 11, rad = ARENA_R * 0.92): void {
  const hx = zn.heart.x;
  const hz = zn.heart.z;
  const level = c.gy(hx, hz);
  const r = rng(zn.hue % 997);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.12;
    // leave a gap where the road comes in
    const ex = zn.entry.x - hx;
    const ez = zn.entry.z - hz;
    const ea = Math.atan2(ez, ex);
    let da = Math.abs(a - ea) % (Math.PI * 2);
    if (da > Math.PI) da = Math.PI * 2 - da;
    if (da < 0.34) continue;
    const m = monolith(kind, zn.hue, i * 7 + 3);
    const x = hx + Math.cos(a) * rad * (0.95 + r() * 0.1);
    const z = hz + Math.sin(a) * rad * (0.95 + r() * 0.1);
    m.position.set(x, c.gy(x, z) - 0.4, z);
    m.rotation.y = Math.atan2(hx - x, hz - z) + Math.PI;
    c.add(m);
  }
  // glyph rings, drawn in light on the flagstones
  const ringMat = (op: number) => glowMat({ color: zn.hue, opacity: op, side: THREE.DoubleSide });
  for (const [r0, r1, op] of [[ARENA_R * 0.66, ARENA_R * 0.68, 0.55], [ARENA_R * 0.84, ARENA_R * 0.855, 0.4], [ARENA_R * 0.28, ARENA_R * 0.295, 0.5]] as [number, number, number][]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 120), ringMat(op));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(hx, level + 0.14, hz);
    c.add(ring, { noDepth: true });
  }
  const ticks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = ARENA_R * (i % 2 ? 0.7 : 0.72);
    const r1 = ARENA_R * (i % 2 ? 0.8 : 0.83);
    ticks.push(tube([new THREE.Vector3(Math.cos(a) * r0, 0, Math.sin(a) * r0), new THREE.Vector3(Math.cos(a) * r1, 0, Math.sin(a) * r1)], [0.09, 0.09], 3, () => lin(zn.hue), false));
  }
  const tk = new THREE.Mesh(merge(ticks), glowMat({ vertexColors: true, opacity: 0.6 }));
  tk.position.set(hx, level + 0.16, hz);
  c.add(tk, { noDepth: true });
  c.add(glowPool(hx, level, hz, ARENA_R * 0.9, zn.hue, 0.12), { noDepth: true });
}

/** a guardian's place: its arena, its ground cover, its air, its guardian, and two hearth lanterns on the road in */
export function dressZone(c: Ctx, id: ZoneId, o: { guardian?: boolean; lanterns?: boolean; coverR?: number } = {}): THREE.Object3D | null {
  const cfg = ZCFG[id];
  const zn = zone3(id);
  clearTrees(c, zn.heart.x, zn.heart.z, ARENA_R + 6);
  clearTrees(c, c.cam.position.x, c.cam.position.z, typeof c.p['camClear'] === 'number' ? (c.p['camClear'] as number) : 10);
  clearCorridor(c, c.cam.position.x, c.cam.position.z, zn.heart.x, zn.heart.z, 6);
  const ex = zn.entry.x - zn.heart.x;
  const ez = zn.entry.z - zn.heart.z;
  const face = Math.atan2(ex, ez);
  let guardian: THREE.Object3D | null = null;
  if (o.guardian !== false) {
    guardian = put(c, cfg.make(), zn.heart.x, zn.heart.z, 0, face);
  }
  arenaRing(c, zn, cfg.stone);
  const R = o.coverR ?? 50;
  const off = (x: number, z: number) => (roadDist(x, z) < 1.2 ? 0.25 : 1) * (Math.hypot(x - zn.heart.x, z - zn.heart.z) < ARENA_R * 0.3 ? 0.4 : 1);
  cover(c, zn.heart.x, zn.heart.z, R, cfg.mix, off, 5 + zn.hue % 7, cfg.tint);
  const camNear = c.cam.position;
  cover(c, camNear.x, camNear.z, 22, { grass: id === 'bones' || id === 'marsh' ? 0.4 : 1.2, ...(id === 'meadow' ? { bloom: 0.35 } : {}) }, off, 9, cfg.tint);
  c.add(motes(new THREE.Vector3(zn.heart.x, 8, zn.heart.z), new THREE.Vector3(40, 9, 40), cfg.moteCount, cfg.motes, 0.26, 21, 0.5), { noDepth: true });
  c.add(motes(new THREE.Vector3(camNear.x, 3, camNear.z), new THREE.Vector3(14, 3, 14), 50, cfg.motes, 0.34, 22, 0.4), { noDepth: true });
  if (o.lanterns !== false) {
    const L = Math.hypot(ex, ez) || 1;
    const ux = ex / L;
    const uz = ez / L;
    for (const sd of [-1, 1]) {
      const x = zn.heart.x + ux * (ARENA_R + 9) - uz * sd * 8;
      const z = zn.heart.z + uz * (ARENA_R + 9) + ux * sd * 8;
      const lan = makeLantern(0xffb05a, 4.6);
      put(c, lan, x, z, 0, Math.atan2(-uz * sd, ux * sd) * 0 + (sd > 0 ? Math.PI : 0));
      c.add(glowPool(x, c.gy(x, z), z, 6, 0xffb05a, 0.22), { noDepth: true });
    }
  }
  void blob;
  return guardian;
}
