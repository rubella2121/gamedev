import * as THREE from 'three';
import type { Sfx } from '../../core/audio';
import type { UI } from '../../ui';
import type { Arena } from '../arena';
import type { Lance3, Solid, Weak } from '../fight';
import { hash2, rng, TAU } from '../../core/util';
import { makeSprite } from '../../core/pix';
import { drawBlob } from '../../core/art';
import { Boxes, glowSprite, label, lightPool } from './kit';
import { Swarm, type Creature } from './creatures';

/**
 * The explorable 3D map: the forest you crossed, lifted into the third dimension as islands in the dark.
 *
 *   The Clearing (the middle)  where you land. Calm, mostly. Three bridges leave it.
 *   Gloom Hollow (north)       dark. Gloomlings creep after you; light the four lanterns and they come apart. Then the Stage: X.
 *   Echo Marsh (east)          bells in the mist. Strike the listening stone, then ring the bells in the order it played. Then the Archive: The Collector.
 *   Bone Wastes (west)         skitters guard three vertebrae. Bring them to the altar. Then the Remix: The Mash.
 *
 * Each bridge out of the Clearing is pinned shut until the boss before it falls, so the way is always one way, and the two yellow smudges
 * (Mother and Father) hang in the sky to the north the whole time. The map is flat underfoot (y = 0) and walkable cell by cell.
 * It shares the arena's scene: the fight's floor is hidden while you explore and the map is hidden while you fight.
 */

export type Region = 'void' | 'hub' | 'gloom' | 'marsh' | 'bones' | 'bridge';
const REGIONS: Region[] = ['void', 'hub', 'gloom', 'marsh', 'bones', 'bridge'];

export interface Progress {
  lanterns: boolean;
  bells: boolean;
  bones: boolean;
  /** bosses beaten: 0 none, 1 X, 2 The Collector, 3 The Mash */
  beaten: number;
}

export interface MapEnv {
  audio: Sfx;
  ui: UI;
  arena: Arena;
  p: { x: number; z: number; dead: boolean; invuln: number };
  hurt(fromX: number, fromZ: number): void;
  addLight(n: number): void;
  shake(v: number): void;
  /** hearts left over hearts in all, for the heartbeat */
  hearts: number;
  maxHearts: number;
}

/* ------------------------------------------------------------------ layout */

const X0 = -100;
const Z0 = -100;
const GW = 201;
const GH = 131;

const ISL = {
  hub: { x: 0, z: 0, R: 15 },
  gloom: { x: 0, z: -60, R: 20 },
  marsh: { x: 62, z: 0, R: 19 },
  bones: { x: -62, z: 0, R: 19 },
};

/** the boss gates at the far end of each island: walk into one that is open and the fight begins */
const GATES = [
  { boss: 0, x: 0, z: -93, ry: 0 },
  { boss: 1, x: 93, z: 0, ry: -Math.PI / 2 },
  { boss: 2, x: -93, z: 0, ry: Math.PI / 2 },
];

/** where you come back to: the landing, the first step onto each island, and the front of each boss gate */
const CHECK = {
  hub: { x: 0, z: 7 },
  gloom: { x: 0, z: -42 },
  marsh: { x: 44, z: 0 },
  bones: { x: -44, z: 0 },
  gate0: { x: 0, z: -84 },
  gate1: { x: 84, z: 0 },
  gate2: { x: -84, z: 0 },
};

type LockId = 'stage' | 'marsh' | 'archive' | 'bones' | 'remix';
interface Lock {
  id: LockId;
  x: number;
  z: number;
  /** across the bridge: true when the bridge runs along x */
  alongX: boolean;
  open: boolean;
  g: THREE.Group;
  /** 0..1 while it comes apart */
  fall: number;
}

/** the five pinned barriers: the Stage and the Archive and the Remix open with their puzzle; the marsh and the wastes open when a boss falls */
const LOCKS: { id: LockId; x: number; z: number; alongX: boolean }[] = [
  { id: 'stage', x: 0, z: -82, alongX: false },
  { id: 'marsh', x: 18, z: 0, alongX: true },
  { id: 'archive', x: 83, z: 0, alongX: true },
  { id: 'bones', x: -18, z: 0, alongX: true },
  { id: 'remix', x: -83, z: 0, alongX: true },
];

const PAL = {
  hub: [0x14444f, 0x1b5a5a, 0x2e7d4f, 0x103846, 0x2a7a6c],
  gloom: [0x1a1430, 0x221a3c, 0x161028, 0x2a2048, 0x1b2a3a],
  marsh: [0x163a3a, 0x1b4a48, 0x204a40, 0x123232, 0x2a5a4a],
  bones: [0x4a4652, 0x5a5560, 0x423e4a, 0x6a6470, 0x3a3442],
  bridge: [0x5a4a8a, 0x4a3d6a, 0x524480],
};

/** fog, background and light for each place: [fog near, fog far, colour, ambient, key, back] */
const ATMO: Record<Region, [number, number, number, number, number, number]> = {
  void: [10, 58, 0x120a22, 0.8, 0.7, 0.8],
  hub: [12, 62, 0x120a22, 0.85, 0.75, 0.85],
  bridge: [10, 56, 0x110a20, 0.75, 0.65, 0.8],
  gloom: [3, 30, 0x06040d, 0.28, 0.22, 0.45],
  marsh: [5, 42, 0x0b1820, 0.7, 0.55, 0.6],
  bones: [8, 50, 0x16121e, 0.8, 0.7, 0.7],
};

interface Lantern {
  x: number;
  z: number;
  lit: boolean;
  flame: THREE.Mesh;
  glow: THREE.Sprite;
  pool: THREE.Mesh;
  litT: number;
}
interface Bell {
  x: number;
  z: number;
  pitch: number;
  g: THREE.Group;
  bell: THREE.Mesh;
  glow: THREE.Sprite;
  ringT: number;
  /** lit for good (rung in the right order) */
  done: boolean;
}
interface Bone {
  x: number;
  z: number;
  taken: boolean;
  ambushed: boolean;
  g: THREE.Group;
}
interface Wave {
  x: number;
  z: number;
  t: number;
  hit: boolean;
  mark: number;
}

const LANTERN_R = 7;

export class ExploreWorld {
  readonly group = new THREE.Group();
  readonly solids: Solid[] = [];
  private walkable = new Uint8Array(GW * GH);
  private region = new Uint8Array(GW * GH);
  private lockAt = new Int8Array(GW * GH).fill(-1);
  private locks: Lock[] = [];
  private lanterns: Lantern[] = [];
  private bells: Bell[] = [];
  private stone!: { x: number; z: number; eye: THREE.Mesh; glow: THREE.Sprite };
  private bones: Bone[] = [];
  private altar!: { x: number; z: number; sockets: THREE.Mesh[] };
  private gates: { boss: number; x: number; z: number; veil: THREE.Mesh; rune: THREE.Mesh; glow: THREE.Sprite }[] = [];
  private swarm: Swarm;
  private eyes!: THREE.InstancedMesh;
  private eyeSpots: { x: number; y: number; z: number; ry: number; phase: number; far: boolean }[] = [];
  private lights: THREE.PointLight[] = [];
  private guideArrow: THREE.Mesh;
  private hearth = { x: 5, z: 11 };
  private time = 0;
  private tmp = new THREE.Object3D();
  private r = rng(77);

  // the puzzles
  private order: number[] = [0, 1, 2, 3];
  private bellMode: 'idle' | 'playing' | 'input' = 'idle';
  private bellIdx = 0;
  private playT = 0;
  private playStep = 0;
  private waves: Wave[] = [];
  private carried = 0;
  private placed = 0;

  // the dark
  private spawnT = 3;
  private ambT = 6;
  private shadowT = 18;
  private shadowRun: { t: number; x0: number; z0: number; x1: number; z1: number } | null = null;
  private seen = new Set<string>();
  private regionNow: Region = 'hub';
  private atmo = { near: 12, far: 62, col: new THREE.Color(0x120a22), amb: 1, key: 1, back: 1 };
  checkpoint = { ...CHECK.hub };

  constructor() {
    this.build();
    this.swarm = new Swarm(this.group, 7, 8);
    // the arrow on the floor that points the way
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.9);
    sh.lineTo(0.55, 0.05);
    sh.lineTo(0.3, 0.05);
    sh.lineTo(0, 0.5);
    sh.lineTo(-0.3, 0.05);
    sh.lineTo(-0.55, 0.05);
    sh.closePath();
    const ag = new THREE.ShapeGeometry(sh);
    // the tip (+y in the shape) ends up pointing along +z, which the turn in guide() aims
    ag.rotateX(Math.PI / 2);
    this.guideArrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xffd878, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.guideArrow.position.y = 0.06;
    this.group.add(this.guideArrow);
    // three lights shared by whatever burns nearest you (a constant number of lights, so nothing has to recompile)
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb05a, 0, 16, 1.6);
      l.position.set(0, -50, 0);
      this.lights.push(l);
      this.group.add(l);
    }
    this.group.visible = false;
  }

  /* ------------------------------------------------------------------ the grid */

  private idx(x: number, z: number): number {
    const ix = Math.round(x - X0);
    const iz = Math.round(z - Z0);
    if (ix < 0 || iz < 0 || ix >= GW || iz >= GH) return -1;
    return iz * GW + ix;
  }

  /** can the player stand here (a body 0.35 wide, so you do not hang half off an edge) */
  walk(x: number, z: number): boolean {
    for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) {
      const i = this.idx(x + dx, z + dz);
      if (i < 0 || !this.walkable[i]) return false;
      const lk = this.lockAt[i]!;
      if (lk >= 0 && !this.locks[lk]!.open) return false;
    }
    return true;
  }

  regionOf(x: number, z: number): Region {
    const i = this.idx(x, z);
    return i < 0 ? 'void' : REGIONS[this.region[i]!]!;
  }

  private setCell(x: number, z: number, reg: Region) {
    const i = this.idx(x, z);
    if (i < 0) return;
    if (!this.walkable[i] || reg !== 'bridge') this.region[i] = REGIONS.indexOf(reg);
    this.walkable[i] = 1;
  }

  /* ------------------------------------------------------------------ building */

  private build() {
    const tiles = new Boxes();
    const under = new Boxes();
    const deco = new Boxes();
    const glow = new Boxes();
    const keep: { x: number; z: number; r: number }[] = [];
    const clear = (x: number, z: number, r: number) => keep.push({ x, z, r });
    const free = (x: number, z: number, r = 1) => !keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + r);

    // islands: round, with a ragged edge
    const island = (name: 'hub' | 'gloom' | 'marsh' | 'bones', seed: number) => {
      const I = ISL[name];
      for (let x = Math.floor(I.x - I.R - 3); x <= I.x + I.R + 3; x++) {
        for (let z = Math.floor(I.z - I.R - 3); z <= I.z + I.R + 3; z++) {
          const a = Math.atan2(z - I.z, x - I.x);
          const edge = I.R + 1.4 * Math.sin(3 * a + seed) + 0.9 * Math.sin(7 * a + seed * 2.3) + (hash2(x, z) - 0.5) * 0.8;
          if (Math.hypot(x - I.x, z - I.z) < edge) this.setCell(x, z, name);
        }
      }
    };
    island('hub', 1);
    island('gloom', 2);
    island('marsh', 3);
    island('bones', 4);
    // bridges, three wide
    const bridge = (x0: number, z0: number, x1: number, z1: number) => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0));
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        const z = z0 + ((z1 - z0) * k) / n;
        for (let o = -1; o <= 1; o++) this.setCell(Math.round(x + (z1 !== z0 ? o : 0)), Math.round(z + (x1 !== x0 ? o : 0)), 'bridge');
      }
    };
    bridge(0, -12, 0, -42);
    bridge(12, 0, 45, 0);
    bridge(-12, 0, -45, 0);
    bridge(0, -77, 0, -95);
    bridge(78, 0, 95, 0);
    bridge(-78, 0, -95, 0);

    // keep the ways across each island clear of trees and rocks
    const path = (x0: number, z0: number, x1: number, z1: number, w: number) => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2);
      for (let k = 0; k <= n; k++) clear(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, w);
    };
    path(0, 14, 0, -16, 2.6);
    path(-16, 0, 16, 0, 2.6);
    path(0, -40, 0, -80, 2.8);
    path(42, 0, 82, 0, 2.8);
    path(-42, 0, -82, 0, 2.8);
    clear(0, 0, 5);
    clear(this.hearth.x, this.hearth.z, 3);

    // the floor
    for (let iz = 0; iz < GH; iz++) {
      for (let ix = 0; ix < GW; ix++) {
        const i = iz * GW + ix;
        if (!this.walkable[i]) continue;
        const x = ix + X0;
        const z = iz + Z0;
        const reg = REGIONS[this.region[i]!]!;
        const h = hash2(x * 3 + 11, z * 7 + 5);
        const pal = PAL[reg as keyof typeof PAL] ?? PAL.bridge;
        let c = pal[Math.floor(h * pal.length) % pal.length]!;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
          const j = this.idx(x + dx!, z + dz!);
          return j < 0 || !this.walkable[j];
        });
        let y = -0.35;
        if (reg === 'marsh' && hash2(x * 0.37 + 4, z * 0.41 + 9) + 0.35 * Math.sin(x * 0.4) * Math.cos(z * 0.35) > 0.62 && !edge) {
          // black water, shallow enough to wade
          c = h > 0.8 ? 0x123a48 : 0x0b2a36;
          y = -0.47;
          if (h > 0.93) glow.add(x, -0.1, z, 0.5, 0.02, 0.06, 0x2a8a9a);
        }
        if (reg === 'hub' && Math.hypot(x, z) < 2.6) c = 0x07060c; // the crater
        const k = edge ? 0.7 : 1;
        tiles.add(x, y, z, 0.98, 0.7, 0.98, mul(c, k));
        if (edge) {
          under.add(x, -1.3, z, 0.96, 1.2, 0.96, mul(c, 0.45));
          if (h > 0.55) under.add(x + (h - 0.7), -2.4 - h * 3, z + (h - 0.6), 0.6 + h, 1.4 + h * 3, 0.6 + h, mul(c, 0.32));
        }
        // posts with a little cyan light along the bridges
        if (reg === 'bridge' && edge && (Math.abs(x) + Math.abs(z)) % 6 === 0) {
          deco.add(x, 0.6, z, 0.26, 1.2, 0.26, 0x3a2e5a);
          glow.add(x, 1.32, z, 0.24, 0.24, 0.24, 0x4ab8d0);
        }
      }
    }

    // ---- the Clearing: the five zones remembered, around the crater
    const tree = (x: number, z: number, kind: 'live' | 'dead', s = 1) => {
      const hgt = (4.2 + this.r() * 3.5) * s;
      const trunk = kind === 'dead' ? 0x1a1228 : 0x2a1f2e;
      const lean = (this.r() - 0.5) * 0.25;
      for (let k = 0; k < Math.ceil(hgt / 1.2); k++) deco.add(x + lean * k, 0.6 + k * 1.2, z, 0.85 - k * 0.05, 1.2, 0.85 - k * 0.05, mul(trunk, 1 + (k % 2) * 0.12));
      // roots
      for (let k = 0; k < 3; k++) {
        const a = this.r() * TAU;
        deco.add(x + Math.cos(a) * 0.7, 0.18, z + Math.sin(a) * 0.7, 1.2, 0.3, 0.4, mul(trunk, 0.9), a);
      }
      const top = hgt + 0.4;
      if (kind === 'live') {
        const cols = PAL.hub;
        for (let k = 0; k < 6; k++) {
          const a = this.r() * TAU;
          const d = this.r() * 1.4 * s;
          const b = (1.6 + this.r() * 1.4) * s;
          deco.add(x + lean * hgt + Math.cos(a) * d, top - 0.6 + this.r() * 1.8, z + Math.sin(a) * d, b, b * 0.8, b, mul(cols[k % cols.length]!, 0.7));
        }
      } else {
        // bare branches, crooked
        for (let k = 0; k < 4; k++) {
          const a = this.r() * TAU;
          const len = (1.6 + this.r() * 1.8) * s;
          const y = hgt * (0.55 + this.r() * 0.4);
          deco.add(x + lean * (y / 1.2) + Math.cos(a) * len * 0.45, y, z + Math.sin(a) * len * 0.45, len, 0.18, 0.18, mul(trunk, 1.2), -a, 0, 0.5);
        }
      }
      this.solids.push({ x, z, r: 0.75, alive: true });
      // eyes in the branches, now and then
      if (this.r() < (kind === 'dead' ? 0.6 : 0.3)) this.eyeSpots.push({ x: x + lean * 2, y: top * (0.6 + this.r() * 0.3), z: z, ry: this.r() * TAU, phase: this.r() * 10, far: false });
    };
    const scatter = (name: 'hub' | 'gloom' | 'marsh' | 'bones', n: number, rMin: number, fn: (x: number, z: number) => void, spacing = 2.2) => {
      const I = ISL[name];
      let made = 0;
      for (let tries = 0; tries < n * 30 && made < n; tries++) {
        const a = this.r() * TAU;
        const d = rMin + this.r() * (I.R - 1.5 - rMin);
        const x = Math.round((I.x + Math.cos(a) * d) * 2) / 2;
        const z = Math.round((I.z + Math.sin(a) * d) * 2) / 2;
        if (!this.walk(x, z) || !free(x, z, spacing)) continue;
        fn(x, z);
        clear(x, z, spacing * 0.5);
        made++;
      }
    };

    // the hearth by the landing: lantern light the dark keeps out of
    {
      const h = this.hearth;
      deco.add(h.x, 2.5, h.z, 0.28, 5, 0.28, 0x2a2238);
      deco.add(h.x + 0.6, 4.9, h.z, 1.4, 0.18, 0.18, 0x2a2238);
      glow.add(h.x + 1.2, 4.3, h.z, 0.5, 0.7, 0.5, 0xffd890);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        deco.add(h.x + Math.cos(a) * 2.2, 0.28, h.z + Math.sin(a) * 2.2, 0.9, 0.56, 0.7, 0x4a3d6a, -a);
      }
      const pool = lightPool(0xffb05a, 9, 0.38);
      pool.position.set(h.x, 0.05, h.z);
      this.group.add(pool);
      const gs = glowSprite(0xffb05a, 5, 0.6);
      gs.position.set(h.x + 1.2, 4.3, h.z);
      this.group.add(gs);
      this.solids.push({ x: h.x, z: h.z, r: 0.45, alive: true });
    }
    scatter('hub', 16, 9, (x, z) => tree(x, z, 'live'), 3.2);
    // glowing flowers (the meadow) and mushrooms (the hollow) round the crater
    scatter('hub', 40, 3.5, (x, z) => {
      const pink = this.r() < 0.5;
      deco.add(x, 0.35, z, 0.08, 0.7, 0.08, 0x0a2e30);
      glow.add(x, 0.78, z, 0.3, 0.3, 0.3, pink ? 0xff8ac8 : 0x7fd8f5);
    }, 0.8);
    scatter('hub', 8, 5, (x, z) => {
      // a root arch, like the thicket's
      const a = this.r() * TAU;
      for (let k = 0; k < 5; k++) {
        const u = (k / 4) * Math.PI;
        deco.add(x + Math.cos(a) * Math.cos(u) * 1.4, Math.sin(u) * 1.3 + 0.2, z + Math.sin(a) * Math.cos(u) * 1.4, 0.5, 0.5, 0.5, 0x3a2418);
      }
    }, 2.2);
    // the moth's little shrine in the crater: three small lights where the family rested
    for (let k = 0; k < 3; k++) glow.add(Math.cos((k / 3) * TAU) * 0.9, 0.12, Math.sin((k / 3) * TAU) * 0.9, 0.22, 0.22, 0.22, 0xffe9a0);

    // ---- Gloom Hollow: dead trees, cyan specks, the lanterns
    const LP = [
      [-11, -50],
      [11, -50],
      [-12, -69],
      [12, -69],
    ];
    for (const [x, z] of LP) clear(x!, z!, 3.4);
    scatter('gloom', 30, 3, (x, z) => tree(x, z, 'dead', 1.1), 3.0);
    scatter('gloom', 40, 2, (x, z) => glow.add(x, 0.08, z, 0.14, 0.04, 0.14, 0x6ff0ff), 0.6);
    for (const [x, z] of LP) this.makeLantern(x!, z!, deco);

    // ---- Echo Marsh: reeds, stumps, the bells and the listening stone
    const BP = [
      [53, -9, 1.0],
      [71, -9, 1.26],
      [71, 9, 0.84],
      [53, 9, 1.5],
    ];
    for (const [x, z] of BP) clear(x!, z!, 3);
    clear(62, 0, 3.5);
    scatter('marsh', 60, 2, (x, z) => {
      const n = 2 + Math.floor(this.r() * 4);
      for (let k = 0; k < n; k++) {
        const hh = 1 + this.r() * 1.6;
        deco.add(x + (this.r() - 0.5) * 0.9, hh / 2 - 0.1, z + (this.r() - 0.5) * 0.9, 0.12, hh, 0.12, this.r() < 0.5 ? 0x2a5a4a : 0x3a6a4a, 0, (this.r() - 0.5) * 0.3, (this.r() - 0.5) * 0.3);
      }
    }, 1.2);
    scatter('marsh', 10, 4, (x, z) => {
      // a drowned stump
      deco.add(x, 0.5, z, 1.1, 1.0, 1.1, 0x241a1e);
      this.solids.push({ x, z, r: 0.7, alive: true });
      if (this.r() < 0.5) this.eyeSpots.push({ x, y: 0.25, z, ry: this.r() * TAU, phase: this.r() * 10, far: false });
    }, 2.6);
    // fireflies over the water
    for (let k = 0; k < 40; k++) {
      const a = this.r() * TAU;
      const d = this.r() * 17;
      glow.add(62 + Math.cos(a) * d, 0.8 + this.r() * 2.4, Math.sin(a) * d, 0.1, 0.1, 0.1, this.r() < 0.6 ? 0xc8ff9a : 0x9ff4ee);
    }
    BP.forEach(([x, z, p], i) => this.makeBell(x!, z!, p!, i, deco));
    this.makeStone(62, 0, deco);

    // ---- Bone Wastes: rib arches, a great skull, the vertebrae and the altar
    const VP = [
      [-75, -9],
      [-50, 11],
      [-58, -14],
    ];
    for (const [x, z] of VP) clear(x!, z!, 3);
    clear(-76, 0, 3.5);
    const rib = (x: number, z: number, ry: number, s: number) => {
      // a rib: a curve of bone, segment by segment, rising from the ground and bending over the path
      const pts: [number, number][] = [];
      for (let k = 0; k <= 7; k++) {
        const u = (k / 7) * Math.PI * 0.82;
        pts.push([Math.cos(u) * 2.6 * s, Math.sin(u) * 3.4 * s]);
      }
      for (let k = 0; k < 7; k++) {
        const [h0, y0] = pts[k]!;
        const [h1, y1] = pts[k + 1]!;
        const len = Math.hypot(h1 - h0, y1 - y0);
        const hm = (h0 + h1) / 2;
        const slope = Math.atan2(y1 - y0, h1 - h0);
        const th = 0.32 * s * (1 - k * 0.07);
        deco.add(x + Math.cos(ry) * hm, (y0 + y1) / 2, z + Math.sin(ry) * hm, len + 0.12, th, th, k % 2 ? 0xe8e0c8 : 0xdcd3bc, -ry, 0, slope);
      }
      this.solids.push({ x: x + Math.cos(ry) * 2.6 * s, z: z + Math.sin(ry) * 2.6 * s, r: 0.4, alive: true });
    };
    // a long ribcage you walk through, the spine along the top
    for (let k = 0; k < 6; k++) {
      rib(-66 + k * 2.4, -0.2, Math.PI / 2, 1.1);
      rib(-66 + k * 2.4, 0.2, -Math.PI / 2, 1.1);
      deco.add(-66 + k * 2.4, 3.75, 0, 0.9, 0.5, 0.7, 0xe8e0c8);
    }
    clear(-60, 0, 6);
    scatter('bones', 14, 4, (x, z) => {
      // scattered bones and dark rocks
      if (this.r() < 0.5) {
        deco.add(x, 0.15, z, 1.6, 0.25, 0.25, 0xe8e0c8, this.r() * TAU);
        deco.add(x + 0.3, 0.15, z + 0.3, 0.4, 0.4, 0.4, 0xd8cfb8);
      } else {
        const s = 0.8 + this.r() * 1.6;
        deco.add(x, s * 0.4, z, s, s * 0.8, s, 0x2a2430, this.r() * TAU);
        this.solids.push({ x, z, r: s * 0.55, alive: true });
      }
    }, 2.4);
    // the great skull at the north edge
    {
      const sx = -62;
      const sz = -13;
      deco.add(sx, 2.0, sz, 5, 4, 4.2, 0xe8e0c8);
      deco.add(sx, 0.6, sz + 1.6, 4, 1.2, 1.6, 0xd8cfb8);
      deco.add(sx - 1.2, 2.3, sz + 2.12, 1.2, 1.1, 0.1, 0x07040e);
      deco.add(sx + 1.2, 2.3, sz + 2.12, 1.2, 1.1, 0.1, 0x07040e);
      this.eyeSpots.push({ x: sx - 1.2, y: 2.3, z: sz + 2.3, ry: 0, phase: 1, far: false });
      this.solids.push({ x: sx, z: sz, r: 2.6, alive: true });
    }
    scatter('bones', 30, 2, (x, z) => glow.add(x, 0.06, z, 0.16, 0.04, 0.16, 0xffe9c0), 0.5);
    VP.forEach(([x, z]) => this.makeBone(x!, z!));
    this.makeAltar(-76, 0, deco);

    // ---- the locks and the gates
    LOCKS.forEach((l, i) => this.makeLock(l.id, l.x, l.z, l.alongX, i));
    for (const g of GATES) this.makeGate(g.boss, g.x, g.z, g.ry, deco);

    // ---- the sky: the two yellow smudges to the north, eyes in the void
    this.makeSky();

    const lam = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const tileMesh = tiles.mesh(lam);
    this.group.add(tileMesh, under.mesh(lam), deco.mesh(lam), glow.mesh(new THREE.MeshBasicMaterial({ color: 0xffffff })));

    // eyes: red pairs that watch from the trees and close when you come near
    const eg = new THREE.BoxGeometry(0.16, 0.1, 0.05);
    this.eyes = new THREE.InstancedMesh(eg, new THREE.MeshBasicMaterial({ color: 0xff2a40, fog: false }), this.eyeSpots.length * 2 + 2);
    this.eyes.frustumCulled = false;
    this.group.add(this.eyes);
  }

  private makeLantern(x: number, z: number, deco: Boxes) {
    deco.add(x, 1.1, z, 0.5, 2.2, 0.5, 0x2a2238);
    deco.add(x, 0.15, z, 1.2, 0.3, 1.2, 0x3a3048);
    // the iron cage
    for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) deco.add(x + dx!, 2.55, z + dz!, 0.07, 0.75, 0.07, 0x15101e);
    deco.add(x, 2.95, z, 0.75, 0.1, 0.75, 0x15101e);
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), new THREE.MeshBasicMaterial({ color: 0xffc860 }));
    flame.position.set(x, 2.5, z);
    flame.scale.setScalar(0.001);
    const glow = glowSprite(0xffb05a, 6, 0);
    glow.position.set(x, 2.5, z);
    const pool = lightPool(0xffb05a, LANTERN_R * 2.2, 0);
    pool.position.set(x, 0.05, z);
    this.group.add(flame, glow, pool);
    this.solids.push({ x, z, r: 0.55, alive: true });
    this.lanterns.push({ x, z, lit: false, flame, glow, pool, litT: 0 });
  }

  private makeBell(x: number, z: number, pitch: number, i: number, deco: Boxes) {
    deco.add(x - 1, 1.6, z, 0.3, 3.2, 0.3, 0x2a2238);
    deco.add(x + 1, 1.6, z, 0.3, 3.2, 0.3, 0x2a2238);
    deco.add(x, 3.25, z, 2.5, 0.25, 0.3, 0x2a2238);
    const g = new THREE.Group();
    g.position.set(x, 3.1, z);
    const cols = [0x9fe8ff, 0xb88aff, 0xff8aa8, 0xc8ff9a];
    const mat = new THREE.MeshLambertMaterial({ color: 0xc9a24a, emissive: cols[i]!, emissiveIntensity: 0 });
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.75, 1.1, 12, 1, true), mat);
    bell.position.y = -0.6;
    (bell.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 16), mat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = -1.15;
    g.add(bell, lip);
    // a coloured rope, so each bell is told apart
    const rope = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.3, 0.07), new THREE.MeshBasicMaterial({ color: cols[i]! }));
    rope.position.y = -1.6;
    g.add(rope);
    const glow = glowSprite(cols[i]!, 5, 0);
    glow.position.set(x, 2.4, z);
    this.group.add(g, glow);
    this.solids.push({ x: x - 1, z, r: 0.3, alive: true }, { x: x + 1, z, r: 0.3, alive: true });
    this.bells.push({ x, z, pitch, g, bell, glow, ringT: 0, done: false });
  }

  private makeStone(x: number, z: number, deco: Boxes) {
    deco.add(x, 1.0, z, 2.0, 2.0, 1.6, 0x2a3440);
    deco.add(x, 2.2, z, 1.5, 0.6, 1.2, 0x34404c);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.05), new THREE.MeshBasicMaterial({ color: 0x2a6a7a }));
    eye.position.set(x, 1.4, z + 0.83);
    const glow = glowSprite(0x9ff4ee, 4, 0);
    glow.position.set(x, 1.5, z + 1);
    this.group.add(eye, glow);
    this.solids.push({ x, z, r: 1.2, alive: true });
    this.stone = { x, z, eye, glow };
  }

  private makeBone(x: number, z: number) {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0xfff0d0 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), m));
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.3), m);
    sp.position.y = 0.5;
    g.add(sp);
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.2), m);
    g.add(w1);
    const gl = glowSprite(0xffe9c0, 3.2, 0.7);
    g.add(gl);
    g.position.set(x, 1.1, z);
    this.group.add(g);
    this.bones.push({ x, z, taken: false, ambushed: false, g });
  }

  private makeAltar(x: number, z: number, deco: Boxes) {
    deco.add(x, 0.5, z, 2.6, 1.0, 3.2, 0x3a3442);
    deco.add(x, 1.05, z, 2.2, 0.1, 2.8, 0x4a4452);
    const sockets: THREE.Mesh[] = [];
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.55), new THREE.MeshBasicMaterial({ color: 0x2a2430 }));
      s.position.set(x, 1.2, z + (k - 1) * 0.9);
      this.group.add(s);
      sockets.push(s);
    }
    this.solids.push({ x, z, r: 1.3, alive: true });
    this.altar = { x, z, sockets };
  }

  private makeLock(id: LockId, x: number, z: number, alongX: boolean, i: number) {
    // two giant pins crossed over the bridge, and a label: the Collector keeps the way shut
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = alongX ? Math.PI / 2 : 0;
    const shaft = new THREE.MeshLambertMaterial({ color: 0x8a8a9a, emissive: 0x1a1a22 });
    const bead = new THREE.MeshLambertMaterial({ color: 0xa8441a, emissive: 0x3a1006 });
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 6, 6), shaft);
      sh.position.y = 3;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), bead);
      b.position.y = 6.2;
      p.add(sh, b);
      p.position.set(s * 0.4, 0, 0);
      p.rotation.z = s * 0.62;
      g.add(p);
    }
    const lab = label(['NOT FOR', 'REMOVAL'], 2.2, 1.0);
    lab.position.set(0, 2.2, 0.35);
    g.add(lab);
    const gl = glowSprite(0xff9a3a, 4, 0.25);
    gl.position.y = 2.4;
    g.add(gl);
    this.group.add(g);
    // the cells it closes: a band two wide across the bridge
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 0; b++) {
        const cx = alongX ? x + b : x + a;
        const cz = alongX ? z + a : z + b;
        const c = this.idx(cx, cz);
        if (c >= 0) this.lockAt[c] = i;
      }
    }
    this.locks.push({ id, x, z, alongX, open: false, g, fall: 0 });
  }

  private makeGate(boss: number, x: number, z: number, ry: number, deco: Boxes) {
    const col = [0xff3a4a, 0xffcf5a, 0xff8aa8][boss]!;
    const ax = Math.cos(ry);
    const az = -Math.sin(ry);
    // an arch of dark stone, a veil of dark in it, a rune on the floor in the boss's colour
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) deco.add(x + ax * s * 2.3, 0.6 + k * 1.2, z + az * s * 2.3, 1.1, 1.2, 1.1, k === 4 ? 0x5a4a8a : 0x3a2e5a);
      this.solids.push({ x: x + ax * s * 2.3, z: z + az * s * 2.3, r: 0.75, alive: true });
    }
    deco.add(x, 6.5, z, ax !== 0 && Math.abs(ax) > 0.5 ? 6.0 : 1.4, 1.0, ax !== 0 && Math.abs(ax) > 0.5 ? 1.4 : 6.0, 0x5a4a8a);
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6), new THREE.MeshBasicMaterial({ color: 0x050208, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
    veil.position.set(x, 3, z);
    veil.rotation.y = ry;
    const rune = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    rune.rotation.x = -Math.PI / 2;
    rune.position.set(x - Math.sin(ry) * 0 + (boss === 1 ? -3 : boss === 2 ? 3 : 0), 0.07, z + (boss === 0 ? 3 : 0));
    const glow = glowSprite(col, 9, 0.12);
    glow.position.set(x, 3.2, z);
    this.group.add(veil, rune, glow);
    this.gates.push({ boss, x, z, veil, rune, glow });
  }

  private makeSky() {
    // Mother (her bow) and Father, pinned high to the north: the goal, always in sight
    for (const sx of [-1, 1]) {
      const mother = sx < 0;
      const h = mother ? 34 : 26;
      const p = makeSprite(34, h);
      drawBlob(p, 17, h - 2, { s: 2.2, shadow: false, bow: mother });
      p.px(17, 1, '#7a1020');
      p.px(17, 2, '#e02b3a');
      const t = new THREE.CanvasTexture(p.canvas);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      const w = 26;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * h) / 34), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, fog: false, color: 0xb8a878 }));
      m.position.set(sx * 17, 58 + (mother ? 2 : 0), -175);
      this.group.add(m);
      const halo = glowSprite(0xffd070, 40, 0.12);
      halo.position.set(sx * 17, 58, -176);
      this.group.add(halo);
    }
    // eyes far out in the void
    for (let k = 0; k < 26; k++) {
      const a = this.r() * TAU;
      const d = 110 + this.r() * 60;
      this.eyeSpots.push({ x: Math.cos(a) * d, y: -20 + this.r() * 60, z: Math.sin(a) * d - 30, ry: Math.atan2(-Math.cos(a), -Math.sin(a)), phase: this.r() * 10, far: true });
    }
  }

  /* ------------------------------------------------------------------ state */

  show(on: boolean) {
    this.group.visible = on;
  }

  /** a new run: everything shut and dark again */
  reset() {
    this.order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j]!, this.order[i]!];
    }
    for (const l of this.locks) {
      l.open = false;
      l.fall = 0;
      l.g.visible = true;
      l.g.position.y = 0;
      l.g.rotation.x = 0;
    }
    for (const l of this.lanterns) this.setLantern(l, false);
    for (const b of this.bells) {
      b.done = false;
      b.ringT = 0;
    }
    this.bellMode = 'idle';
    this.bellIdx = 0;
    for (const b of this.bones) {
      b.taken = false;
      b.ambushed = false;
      b.g.visible = true;
    }
    this.altar.sockets.forEach((s) => ((s.material as THREE.MeshBasicMaterial).color.setHex(0x2a2430)));
    this.carried = 0;
    this.placed = 0;
    this.waves = [];
    this.swarm.clear();
    this.seen.clear();
    this.checkpoint = { ...CHECK.hub };
    this.spawnT = 3;
    this.shadowT = 16;
    this.shadowRun = null;
  }

  /** a boss has fallen: the next bridge out of the Clearing unpins, and you come back in front of its gate */
  bossBeaten(boss: number, ui: UI, audio: Sfx) {
    if (boss === 0) this.openLock('marsh', audio);
    if (boss === 1) this.openLock('bones', audio);
    const c = [CHECK.gate0, CHECK.gate1, CHECK.gate2][boss]!;
    this.checkpoint = { ...c };
    const g = this.gates[boss]!;
    (g.veil.material as THREE.MeshBasicMaterial).opacity = 0.92;
    (g.rune.material as THREE.MeshBasicMaterial).opacity = 0.05;
    g.glow.material.opacity = 0;
    void ui;
  }

  private openLock(id: LockId, audio: Sfx) {
    const l = this.locks.find((q) => q.id === id)!;
    if (l.open) return;
    l.open = true;
    l.fall = 0.001;
    audio.unlock();
  }

  /** where to put the player when the map begins: the landing, or the last checkpoint */
  spawnPoint(): { x: number; z: number } {
    return { ...this.checkpoint };
  }

  /** the boss gate you are standing in, if it is open for you */
  gateHit(x: number, z: number, prog: Progress): number | null {
    for (const g of this.gates) {
      if (g.boss !== prog.beaten) continue;
      const ready = (g.boss === 0 && prog.lanterns) || (g.boss === 1 && prog.bells) || (g.boss === 2 && prog.bones);
      if (!ready) continue;
      if (Math.hypot(x - g.x, z - g.z) < 3.6) return g.boss;
    }
    return null;
  }

  /** what to do next, and where */
  objective(prog: Progress): { x: number; z: number; text: string } {
    if (prog.beaten === 0) {
      if (!prog.lanterns) {
        const left = this.lanterns.filter((l) => !l.lit);
        const n = 4 - left.length;
        const p = this.regionNow === 'gloom' ? this.nearest(left) : { x: 0, z: -44 };
        return { ...p, text: n === 0 ? 'go north · find the lanterns' : `light the lanterns · ${n} of 4` };
      }
      return { x: 0, z: -92, text: 'the stage is open · go north' };
    }
    if (prog.beaten === 1) {
      if (!prog.bells) {
        if (this.regionNow !== 'marsh') return { x: 46, z: 0, text: 'go east · the marsh is listening' };
        if (this.bellMode === 'idle' && this.bellIdx === 0) return { x: this.stone.x, z: this.stone.z, text: 'strike the listening stone' };
        return { ...this.stone, text: `ring the bells in its order · ${this.bellIdx} of 4` };
      }
      return { x: 93, z: 0, text: 'the archive is open · go east' };
    }
    if (prog.beaten === 2) {
      if (!prog.bones) {
        if (this.regionNow !== 'bones' && this.placed + this.carried === 0) return { x: -46, z: 0, text: 'go west · the wastes' };
        const left = this.bones.filter((b) => !b.taken);
        if (left.length) return { ...this.nearest(left), text: `find the bones · ${this.placed + this.carried} of 3` };
        return { x: this.altar.x, z: this.altar.z, text: 'bring them to the altar' };
      }
      return { x: -93, z: 0, text: 'the remix is open · go west' };
    }
    return { x: 0, z: 0, text: '' };
  }

  private nearest<T extends { x: number; z: number }>(list: T[]): { x: number; z: number } {
    let best = list[0] ?? { x: 0, z: 0 };
    let bd = 1e9;
    for (const o of list) {
      const d = Math.hypot(o.x - this.px, o.z - this.pz);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return { x: best.x, z: best.z };
  }
  private px = 0;
  private pz = 0;

  /* ------------------------------------------------------------------ what you can hit */

  weak(): Weak[] {
    const out: Weak[] = [];
    for (const c of this.swarm.all) if (c.alive && !c.dying) out.push({ x: c.x, y: 0.7, z: c.z, reach: 2.0, r: 0.95, tag: 'creature' });
    for (const l of this.lanterns) if (!l.lit) out.push({ x: l.x, y: 2.4, z: l.z, reach: 2.3, r: 0.9, tag: 'lantern' });
    for (const b of this.bells) if (!b.done) out.push({ x: b.x, y: 2.4, z: b.z, reach: 2.4, r: 0.9, tag: 'bell' });
    out.push({ x: this.stone.x, y: 1.4, z: this.stone.z, reach: 2.8, r: 1.3, tag: 'stone' });
    return out;
  }

  /** a strike from (x, z) facing (fx, fz): true if it hit something */
  strike(x: number, z: number, fx: number, fz: number, env: MapEnv, prog: Progress): boolean {
    let hit = false;
    for (const c of this.swarm.all) {
      if (!c.alive || c.dying) continue;
      const dx = c.x - x;
      const dz = c.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 2.3 && (d < 0.9 || (dx * fx + dz * fz) / (d || 1) > -0.2)) {
        this.killCreature(c, env);
        hit = true;
      }
    }
    for (const l of this.lanterns) if (!l.lit && Math.hypot(l.x - x, l.z - z) < 2.5) {
      this.lightLantern(l, env, prog);
      hit = true;
    }
    for (let i = 0; i < this.bells.length; i++) {
      const b = this.bells[i]!;
      if (Math.hypot(b.x - x, b.z - z) < 2.6) {
        this.ringBell(i, env, prog);
        hit = true;
      }
    }
    if (Math.hypot(this.stone.x - x, this.stone.z - z) < 3.0) {
      this.playStone(env, prog);
      hit = true;
    }
    return hit;
  }

  /** a lance on its way: true if it struck something here */
  lance(l: Lance3, env: MapEnv, prog: Progress): boolean {
    for (const c of this.swarm.all) {
      if (c.alive && !c.dying && Math.hypot(l.x - c.x, l.y - 0.7, l.z - c.z) < 1.0) {
        this.killCreature(c, env);
        return true;
      }
    }
    for (const t of this.lanterns) if (!t.lit && Math.hypot(l.x - t.x, l.y - 2.4, l.z - t.z) < 1.0) {
      this.lightLantern(t, env, prog);
      return true;
    }
    for (let i = 0; i < this.bells.length; i++) {
      const b = this.bells[i]!;
      if (Math.hypot(l.x - b.x, l.y - 2.5, l.z - b.z) < 1.0) {
        this.ringBell(i, env, prog);
        return true;
      }
    }
    if (Math.hypot(l.x - this.stone.x, l.y - 1.4, l.z - this.stone.z) < 1.4) {
      this.playStone(env, prog);
      return true;
    }
    return false;
  }

  /** a nova: everything small in the ring comes apart, and lanterns in it catch */
  nova(x: number, z: number, R: number, env: MapEnv, prog: Progress) {
    for (const c of this.swarm.all) if (c.alive && !c.dying && Math.hypot(c.x - x, c.z - z) <= R) this.killCreature(c, env);
    for (const l of this.lanterns) if (!l.lit && Math.hypot(l.x - x, l.z - z) <= R) this.lightLantern(l, env, prog);
  }

  private killCreature(c: Creature, env: MapEnv) {
    this.swarm.kill(c);
    env.addLight(0.34);
    env.audio.kill();
    env.arena.burst3(c.x, 0.7, c.z, 10, c.kind === 'gloom' ? [0x140c26, 0x6ff0ff, 0x2a2048] : [0xe8e0c8, 0xff3a4a, 0xd8cfb8], 5);
  }

  /* ------------------------------------------------------------------ the puzzles */

  private setLantern(l: Lantern, on: boolean) {
    l.lit = on;
    l.litT = on ? 0.001 : 0;
    l.flame.scale.setScalar(on ? 1 : 0.001);
    l.glow.material.opacity = on ? 0.7 : 0;
    (l.pool.material as THREE.MeshBasicMaterial).opacity = on ? 0.32 : 0;
  }

  private lightLantern(l: Lantern, env: MapEnv, prog: Progress) {
    if (l.lit) return;
    this.setLantern(l, true);
    env.audio.warm();
    env.audio.chime();
    env.arena.burst3(l.x, 2.5, l.z, 14, [0xffc860, 0xfff1a6, 0xff9a3a], 5);
    // the dark near it comes apart
    for (const c of this.swarm.all) if (c.alive && c.kind === 'gloom' && Math.hypot(c.x - l.x, c.z - l.z) < LANTERN_R) this.swarm.kill(c);
    const n = this.lanterns.filter((q) => q.lit).length;
    if (n >= 4 && !prog.lanterns) {
      prog.lanterns = true;
      this.swarm.dissolve('gloom');
      this.openLock('stage', env.audio);
      env.ui.narrate('the shadows scatter. the stage is open.', 3200, 'world');
      env.shake(0.4);
    } else env.ui.narrate(['One.', 'Two.', 'Three.'][n - 1] ?? '', 1400, 'thought');
  }

  private ringBell(i: number, env: MapEnv, prog: Progress, auto = false) {
    const b = this.bells[i]!;
    b.ringT = 1;
    env.audio.v.bell(440 * b.pitch, 2.2, 0.22);
    if (auto || prog.bells || prog.beaten !== 1) return;
    if (b.done) return;
    if (this.order[this.bellIdx] === i) {
      b.done = true;
      this.bellIdx++;
      this.bellMode = 'input';
      if (this.bellIdx >= 4) {
        prog.bells = true;
        this.openLock('archive', env.audio);
        env.audio.chime();
        env.ui.narrate('the bells stop. the shadow does not.', 3200, 'world');
        env.shake(0.4);
      }
    } else {
      // the wrong bell: the marsh answers with a ring of noise, and the order has to be begun again
      env.audio.v.queenToll(0.55, 1);
      env.shake(0.35);
      this.waves.push({ x: b.x, z: b.z, t: 0, hit: false, mark: 12 + (this.waves.length % 4) });
      for (const q of this.bells) q.done = false;
      this.bellIdx = 0;
      this.bellMode = 'idle';
      env.ui.narrate('wrong. the marsh heard that.', 2200, 'world');
    }
  }

  private playStone(env: MapEnv, prog: Progress) {
    if (this.bellMode === 'playing' || prog.bells || prog.beaten !== 1) {
      if (prog.beaten !== 1 && !prog.bells) env.ui.narrate('it is not listening yet.', 1800, 'world');
      return;
    }
    for (const q of this.bells) q.done = false;
    this.bellIdx = 0;
    this.bellMode = 'playing';
    this.playT = 0.6;
    this.playStep = 0;
    env.audio.v.queenToll(1.4, 0.4);
    if (!this.seen.has('stone')) {
      this.seen.add('stone');
      env.ui.narrate('every bell here is listening.', 2600, 'world');
    }
  }

  /* ------------------------------------------------------------------ every frame */

  update(dt: number, env: MapEnv, prog: Progress) {
    this.time += dt;
    const t = this.time;
    const p = env.p;
    this.px = p.x;
    this.pz = p.z;
    const reg = this.regionOf(p.x, p.z);
    if (reg !== 'void') this.regionNow = reg;

    // first steps into each place: its name, the way the forest names its zones, and a checkpoint
    if (reg === 'gloom' || reg === 'marsh' || reg === 'bones' || reg === 'hub') {
      const cards: Record<string, [string, string]> = {
        hub: ['The Clearing', 'everything has a back now.'],
        gloom: ['Gloom Hollow', 'they hate the light. stay in it.'],
        marsh: ['Echo Marsh', 'every bell here is listening.'],
        bones: ['Bone Wastes', 'something small runs on too many legs.'],
      };
      if (!this.seen.has(`card-${reg}`)) {
        this.seen.add(`card-${reg}`);
        env.ui.zoneCard(cards[reg]![0], cards[reg]![1]);
      }
      const cp = CHECK[reg as 'hub' | 'gloom' | 'marsh' | 'bones'];
      const gateCp = [CHECK.gate0, CHECK.gate1, CHECK.gate2][Math.max(0, prog.beaten - 1)]!;
      // a checkpoint is the first step onto an island (the front of a beaten boss's gate counts too, while you are on its island)
      if (!(prog.beaten > 0 && this.checkpoint.x === gateCp.x && this.checkpoint.z === gateCp.z && reg !== 'hub')) {
        if (Math.hypot(this.checkpoint.x - cp.x, this.checkpoint.z - cp.z) > 1) this.checkpoint = { ...cp };
      }
    }

    this.updateAtmosphere(dt, env, reg);
    this.updateLocks(dt);
    this.updateLanterns(dt, t);
    this.updateBells(dt, env, prog);
    this.updateBones(dt, env, prog);
    this.updateCreatures(dt, env, prog, reg);
    this.updateEyes(t, p);
    this.updateGates(t, prog);
    this.updateLights(p);
    this.updateHorror(dt, env, prog, reg);
    this.swarm.animate(dt, t);
  }

  private updateAtmosphere(dt: number, env: MapEnv, reg: Region) {
    const a = ATMO[reg] ?? ATMO.void;
    const k = 1 - Math.exp(-1.6 * dt);
    const s = this.atmo;
    s.near += (a[0] - s.near) * k;
    s.far += (a[1] - s.far) * k;
    s.col.lerp(new THREE.Color(a[2]), k);
    s.amb += (a[3] - s.amb) * k;
    s.key += (a[4] - s.key) * k;
    s.back += (a[5] - s.back) * k;
    const scene = env.arena.scene;
    const fog = scene.fog as THREE.Fog;
    fog.near = s.near;
    fog.far = s.far;
    fog.color.copy(s.col);
    (scene.background as THREE.Color).copy(s.col);
    env.arena.mood(s.amb, s.key, s.back);
  }

  /** set the scene's fog and light for where the player stands, at once (on entering the map) */
  snapAtmosphere(env: MapEnv) {
    const reg = this.regionOf(env.p.x, env.p.z);
    const a = ATMO[reg] ?? ATMO.void;
    this.atmo.near = a[0];
    this.atmo.far = a[1];
    this.atmo.col.setHex(a[2]);
    this.atmo.amb = a[3];
    this.atmo.key = a[4];
    this.atmo.back = a[5];
    this.updateAtmosphere(0, env, reg);
  }

  private updateLocks(dt: number) {
    for (const l of this.locks) {
      if (!l.open || l.fall <= 0 || !l.g.visible) continue;
      l.fall += dt;
      // the pins lift out and fall away into the void
      const u = l.fall;
      l.g.position.y = u < 0.6 ? u * 3 : 1.8 - (u - 0.6) * (u - 0.6) * 40;
      l.g.rotation.x = Math.max(0, u - 0.4) * 2;
      if (u > 2.2) l.g.visible = false;
    }
  }

  private updateLanterns(dt: number, t: number) {
    for (const l of this.lanterns) {
      if (!l.lit) continue;
      l.litT += dt;
      const f = 1 + Math.sin(t * 13 + l.x) * 0.12 + Math.sin(t * 7.3 + l.z) * 0.08;
      l.flame.scale.set(f, f * 1.3, f);
      l.flame.rotation.y = t * 2;
      l.glow.material.opacity = 0.55 + 0.15 * f;
    }
  }

  private updateBells(dt: number, env: MapEnv, prog: Progress) {
    for (let i = 0; i < this.bells.length; i++) {
      const b = this.bells[i]!;
      b.ringT = Math.max(0, b.ringT - dt * 0.9);
      const swing = Math.sin(this.time * 14) * 0.35 * b.ringT;
      b.g.rotation.z = swing;
      const lit = b.done ? 0.7 : b.ringT;
      (b.bell.material as THREE.MeshLambertMaterial).emissiveIntensity = lit * 1.4;
      b.glow.material.opacity = lit * 0.6;
    }
    // the stone plays the order: one bell, then the next
    const st = this.stone;
    const playing = this.bellMode === 'playing';
    (st.eye.material as THREE.MeshBasicMaterial).color.setHex(playing ? 0x9ff4ee : prog.bells ? 0x3a8a6a : 0x2a6a7a);
    st.glow.material.opacity = playing ? 0.6 : 0.12 + 0.08 * Math.sin(this.time * 2);
    if (playing) {
      this.playT -= dt;
      if (this.playT <= 0) {
        if (this.playStep < 4) {
          this.ringBell(this.order[this.playStep]!, env, prog, true);
          this.playStep++;
          this.playT = 0.85;
        } else {
          this.bellMode = 'input';
        }
      }
    }
    // rings of noise from a wrong bell
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]!;
      w.t += dt;
      const R = (w.t / 0.9) * 11;
      env.arena.marks.set(w.mark, w.t < 0.95, w.x, w.z, Math.max(0.1, R), { col: 0xb88aff, fill: 0, alpha: 1 - w.t / 1.1 });
      const d = Math.hypot(env.p.x - w.x, env.p.z - w.z);
      if (!w.hit && Math.abs(d - R) < 0.8 && env.p.invuln <= 0) {
        w.hit = true;
        env.hurt(w.x, w.z);
      }
      if (w.t >= 0.95) {
        env.arena.marks.set(w.mark, false);
        this.waves.splice(i, 1);
      }
    }
  }

  private updateBones(dt: number, env: MapEnv, prog: Progress) {
    const p = env.p;
    for (const b of this.bones) {
      if (b.taken) continue;
      b.g.position.y = 1.1 + Math.sin(this.time * 2 + b.x) * 0.2;
      b.g.rotation.y += dt * 1.2;
      const d = Math.hypot(p.x - b.x, p.z - b.z);
      if (prog.beaten !== 2) continue;
      // something guards each one
      if (!b.ambushed && d < 9) {
        b.ambushed = true;
        env.audio.v.wyrmRattle(12);
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * TAU;
          const sx = b.x + Math.cos(a) * 6;
          const sz = b.z + Math.sin(a) * 6;
          if (this.walk(sx, sz)) this.swarm.spawn('skitter', sx, sz);
        }
      }
      if (d < 1.5 && !p.dead) {
        b.taken = true;
        b.g.visible = false;
        this.carried++;
        env.audio.chime();
        env.addLight(0.5);
        env.ui.narrate(this.carried + this.placed >= 3 ? 'All three. The altar.' : 'A bone, still warm.', 1800, 'thought');
      }
    }
    if (this.carried > 0 && Math.hypot(p.x - this.altar.x, p.z - this.altar.z) < 2.8 && !p.dead) {
      while (this.carried > 0 && this.placed < 3) {
        (this.altar.sockets[this.placed]!.material as THREE.MeshBasicMaterial).color.setHex(0xfff0d0);
        this.placed++;
        this.carried--;
      }
      env.audio.warm();
      if (this.placed >= 3 && !prog.bones) {
        prog.bones = true;
        this.swarm.dissolve('skitter');
        this.openLock('remix', env.audio);
        env.ui.narrate('the bones lie still. the remix is open.', 3200, 'world');
        env.shake(0.4);
      }
    }
  }

  /** the little monsters: where they go and when they come */
  private updateCreatures(dt: number, env: MapEnv, prog: Progress, reg: Region) {
    const p = env.p;
    // gloomlings come out of the dark in Gloom Hollow until the lanterns are lit
    const wantGloom = reg === 'gloom' && !prog.lanterns && prog.beaten === 0 && !p.dead;
    const wantSkit = reg === 'bones' && !prog.bones && prog.beaten === 2 && !p.dead;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && (wantGloom || wantSkit)) {
      this.spawnT = wantGloom ? 2.2 + Math.random() * 2.2 : 3.5 + Math.random() * 3;
      const kind = wantGloom ? 'gloom' : 'skitter';
      if (this.swarm.count(kind) < (wantGloom ? 5 : 3)) {
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * TAU;
          const d = 11 + Math.random() * 6;
          const x = p.x + Math.cos(a) * d;
          const z = p.z + Math.sin(a) * d;
          if (!this.walk(x, z) || this.regionOf(x, z) !== reg) continue;
          if (kind === 'gloom' && this.lanterns.some((l) => l.lit && Math.hypot(l.x - x, l.z - z) < LANTERN_R + 1)) continue;
          this.swarm.spawn(kind, x, z);
          if (kind === 'gloom' && Math.random() < 0.5) env.audio.v.motherWhispers(2);
          break;
        }
      }
    }
    for (const c of this.swarm.all) {
      if (!c.alive || c.dying) continue;
      c.cool = Math.max(0, c.cool - dt);
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz) || 1;
      let tx = dx / d;
      let tz = dz / d;
      let sp: number;
      if (c.kind === 'gloom') {
        // light hurts it: lanterns and the hearth send it back into the dark
        const burning = this.lanterns.some((l) => l.lit && Math.hypot(l.x - c.x, l.z - c.z) < LANTERN_R) || Math.hypot(this.hearth.x - c.x, this.hearth.z - c.z) < 6;
        if (burning) {
          this.swarm.kill(c);
          continue;
        }
        sp = d < 6 ? 4.4 : 3.0;
        // it waits while you look straight at it from close, then lunges (a little stop-and-go is creepier than a steady walk)
        if (c.cool > 0) sp *= 0.2;
      } else {
        // a skitter zig-zags
        c.wig += dt * 7;
        const side = Math.sin(c.wig) * 0.9;
        const nx = tx * Math.cos(side) - tz * Math.sin(side);
        const nz = tx * Math.sin(side) + tz * Math.cos(side);
        tx = nx;
        tz = nz;
        sp = c.cool > 0 ? -2 : 6.0;
      }
      if (p.dead) sp = -1;
      c.vx += (tx * sp - c.vx) * Math.min(1, dt * 5);
      c.vz += (tz * sp - c.vz) * Math.min(1, dt * 5);
      const nx = c.x + c.vx * dt;
      const nz = c.z + c.vz * dt;
      if (this.walk(nx, c.z)) c.x = nx;
      else c.vx = 0;
      if (this.walk(c.x, nz)) c.z = nz;
      else c.vz = 0;
      // keep out of each other
      for (const o of this.swarm.all) {
        if (o === c || !o.alive) continue;
        const ox = c.x - o.x;
        const oz = c.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od > 0 && od < 1.2) {
          c.x += (ox / od) * (1.2 - od) * 0.5;
          c.z += (oz / od) * (1.2 - od) * 0.5;
        }
      }
      // a bite
      if (d < (c.kind === 'gloom' ? 1.15 : 1.0) && c.cool <= 0 && !p.dead && p.invuln <= 0) {
        env.hurt(c.x, c.z);
        c.cool = 1.4;
        c.vx = -tx * 6;
        c.vz = -tz * 6;
      }
    }
  }

  /** red eyes in the trees and in the void: open while you are far, shut (or gone) as you come close */
  private updateEyes(t: number, p: { x: number; z: number }) {
    const m = this.tmp;
    let n = 0;
    for (const e of this.eyeSpots) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      const blink = Math.sin(t * 0.7 + e.phase) > 0.93 || (Math.sin(t * 0.21 + e.phase * 3) < -0.4 && !e.far);
      const open = (e.far || d > 8) && !blink;
      if (!open) continue;
      for (const s of [-1, 1]) {
        m.position.set(e.x + Math.cos(e.ry) * s * 0.17, e.y, e.z - Math.sin(e.ry) * s * 0.17);
        m.rotation.set(0, e.ry, 0);
        const k = e.far ? 6 : 1;
        m.scale.set(k, k, k);
        m.updateMatrix();
        this.eyes.setMatrixAt(n++, m.matrix);
      }
    }
    this.eyes.count = n;
    this.eyes.instanceMatrix.needsUpdate = true;
  }

  private updateGates(t: number, prog: Progress) {
    for (const g of this.gates) {
      const ready = g.boss === prog.beaten && ((g.boss === 0 && prog.lanterns) || (g.boss === 1 && prog.bells) || (g.boss === 2 && prog.bones));
      const beaten = g.boss < prog.beaten;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      (g.rune.material as THREE.MeshBasicMaterial).opacity = beaten ? 0.05 : ready ? 0.55 + 0.35 * pulse : 0.18;
      (g.veil.material as THREE.MeshBasicMaterial).opacity = beaten ? 0.95 : ready ? 0.55 + 0.25 * pulse : 0.92;
      g.glow.material.opacity = beaten ? 0 : ready ? 0.3 + 0.2 * pulse : 0.08;
    }
  }

  /** the three shared lights go to whatever burns nearest you */
  private updateLights(p: { x: number; z: number }) {
    const src: { x: number; y: number; z: number; c: number; i: number }[] = [];
    for (const l of this.lanterns) if (l.lit) src.push({ x: l.x, y: 2.6, z: l.z, c: 0xffb05a, i: 26 });
    src.push({ x: this.hearth.x + 1.2, y: 4.2, z: this.hearth.z, c: 0xffb05a, i: 30 });
    for (const b of this.bells) if (b.ringT > 0.05 || b.done) src.push({ x: b.x, y: 2.6, z: b.z, c: 0x9fe8ff, i: 14 });
    src.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    this.lights.forEach((l, i) => {
      const s = src[i];
      if (!s || Math.hypot(s.x - p.x, s.z - p.z) > 40) {
        l.intensity = 0;
        return;
      }
      l.position.set(s.x, s.y, s.z);
      l.color.setHex(s.c);
      l.intensity = s.i;
    });
  }

  /** the dread: a heartbeat when something is near, whispers, distant bells, and X's shadow sliding over you before you meet him */
  private updateHorror(dt: number, env: MapEnv, prog: Progress, reg: Region) {
    const p = env.p;
    let near = 99;
    for (const c of this.swarm.all) if (c.alive && !c.dying) near = Math.min(near, Math.hypot(c.x - p.x, c.z - p.z));
    const fear = Math.max(Math.max(0, Math.min(1, (13 - near) / 10)), env.hearts <= 1 ? 0.6 : 0);
    env.audio.setHeart(fear > 0.05 ? 1.1 + fear * 1.6 : 0, fear > 0.05 ? 0.25 + fear * 0.55 : 0);
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 9 + Math.random() * 10;
      if (reg === 'gloom' && !prog.lanterns) env.audio.v.motherWhispers(4);
      else if (reg === 'marsh') env.audio.v.bell(220 + Math.random() * 180, 3, 0.05, { pan: Math.random() * 2 - 1, wet: 0.9 });
      else if (reg === 'bones' && !prog.bones) env.audio.v.wyrmRattle(6);
      else if (reg === 'hub' || reg === 'bridge') env.audio.creak();
    }
    // X's shadow, before you have met him: it slides over the Clearing and the bridges, and the ground shakes
    if (prog.beaten === 0 && (reg === 'hub' || reg === 'bridge' || reg === 'gloom')) {
      this.shadowT -= dt;
      if (this.shadowT <= 0 && !this.shadowRun) {
        this.shadowT = 22 + Math.random() * 16;
        const a = Math.random() * TAU;
        this.shadowRun = { t: 0, x0: p.x + Math.cos(a) * 30, z0: p.z + Math.sin(a) * 30, x1: p.x - Math.cos(a) * 30, z1: p.z - Math.sin(a) * 30 };
        env.audio.rumble();
        if (!this.seen.has('shadow')) {
          this.seen.add('shadow');
          window.setTimeout(() => env.ui.narrate('something above leans closer.', 2800, 'world'), 900);
        }
      }
    }
    const sr = this.shadowRun;
    if (sr) {
      sr.t += dt / 4.2;
      const x = sr.x0 + (sr.x1 - sr.x0) * sr.t;
      const z = sr.z0 + (sr.z1 - sr.z0) * sr.t;
      env.arena.setShadow(x, z, 9, Math.sin(Math.min(1, sr.t) * Math.PI), false);
      if (Math.hypot(x - p.x, z - p.z) < 8) env.shake(0.08);
      if (sr.t >= 1) {
        this.shadowRun = null;
        env.arena.hideShadow();
      }
    }
  }

  /** the arrow on the floor that points to what is next (fades when you are there, or when there is nothing to show) */
  guide(px: number, pz: number, prog: Progress, show: boolean) {
    const o = this.objective(prog);
    const d = Math.hypot(o.x - px, o.z - pz);
    const m = this.guideArrow.material as THREE.MeshBasicMaterial;
    const on = show && o.text !== '' && d > 5;
    m.opacity += ((on ? 0.55 + 0.2 * Math.sin(this.time * 4) : 0) - m.opacity) * 0.15;
    const a = Math.atan2(o.x - px, o.z - pz);
    this.guideArrow.position.set(px + Math.sin(a) * 2.4, 0.06, pz + Math.cos(a) * 2.4);
    this.guideArrow.rotation.y = a;
  }

  /** leaving the map (a fight, a death): no ring of noise or shadow left behind */
  quiet(env: MapEnv) {
    for (const w of this.waves) env.arena.marks.set(w.mark, false);
    this.waves = [];
    this.shadowRun = null;
    env.arena.hideShadow();
    env.audio.setHeart(0, 0);
  }

  /** a death on the map: the little monsters go back into the dark */
  calm() {
    this.swarm.clear();
    for (const b of this.bones) if (!b.taken) b.ambushed = false;
    this.spawnT = 3;
  }
}

function mul(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return (r << 16) | (g << 8) | b;
}
