import { Pix, W, H } from '../core/pix';
import { C } from '../core/palette';
import { clamp, hash2, rng, TAU } from '../core/util';
import { makeBush, makeFlower, makeFrame, makeGroundTile, makePathTile, makeRock, makeTree, makeVignette, type GroundKind } from '../core/art';

/** The whole forest is one scrolling map. x goes right, y goes down. */
export const WORLD_W = 1280;
export const WORLD_H = 2600;
export const CELL = 4;
const GW = WORLD_W / CELL;
const GH = WORLD_H / CELL;
/** World y of the cliff lip at the end of the world. Everything above it is the void. */
export const CLIFF_Y = 300;

export type ZoneId = 'gloom' | 'thicket' | 'marsh' | 'bones' | 'meadow';

export interface Blob {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface ZoneDef extends Blob {
  id: ZoneId;
  biome: GroundKind;
  /** where the road meets the zone (the respawn point of the zone) */
  entry: { x: number; y: number };
}

export const START: Blob = { x: 640, y: 1720, rx: 165, ry: 115 };
export const HUB: Blob = { x: 640, y: 1290, rx: 155, ry: 108 };
export const PLATEAU: Blob = { x: 640, y: 432, rx: 215, ry: 140 };

export const ZONES: ZoneDef[] = [
  { id: 'gloom', x: 250, y: 1230, rx: 205, ry: 190, biome: 'forest', entry: { x: 462, y: 1250 } },
  { id: 'thicket', x: 250, y: 860, rx: 205, ry: 180, biome: 'thicket', entry: { x: 408, y: 962 } },
  { id: 'marsh', x: 1030, y: 860, rx: 205, ry: 180, biome: 'marsh', entry: { x: 872, y: 962 } },
  { id: 'bones', x: 1050, y: 1230, rx: 195, ry: 190, biome: 'bones', entry: { x: 848, y: 1250 } },
  { id: 'meadow', x: 1030, y: 1640, rx: 195, ry: 170, biome: 'meadow', entry: { x: 850, y: 1672 } },
];

export function zoneDef(id: ZoneId): ZoneDef {
  return ZONES.find((z) => z.id === id)!;
}

/**
 * Each guardian fights in a sealed clearing of its own, in a strip of the world below the start glade that no road leads to.
 * It is a rounded rectangle, a little bigger than the screen, so the whole fight is nearly always in view.
 */
export interface ArenaDef {
  id: ZoneId;
  x: number;
  y: number;
  rx: number;
  ry: number;
  biome: GroundKind;
  /** where the player arrives (bottom middle) */
  entry: { x: number; y: number };
  /** where the guardian stands (top middle) */
  boss: { x: number; y: number };
}

const ARENA_Y = 2300;
const ARENA_RX = 118;
const ARENA_RY = 212;
export const ARENAS: ArenaDef[] = ZONES.map((z, i) => ({
  id: z.id,
  x: 128 + i * 256,
  y: ARENA_Y,
  rx: ARENA_RX,
  ry: ARENA_RY,
  biome: z.biome,
  entry: { x: 128 + i * 256, y: ARENA_Y + ARENA_RY - 46 },
  boss: { x: 128 + i * 256, y: ARENA_Y - ARENA_RY + 160 },
}));

export function arenaDef(id: ZoneId): ArenaDef {
  return ARENAS.find((a) => a.id === id)!;
}

/** < 1 inside an arena (a squircle with a slightly ragged edge). */
function arenaShape(a: ArenaDef, x: number, y: number): number {
  const dx = Math.abs(x - a.x) / a.rx;
  const dy = Math.abs(y - a.y) / a.ry;
  const th = Math.atan2(y - a.y, x - a.x);
  const lim = 1 + 0.035 * Math.sin(5 * th + a.x * 0.01) + 0.025 * Math.sin(9 * th);
  return Math.pow(Math.pow(dx, 3.6) + Math.pow(dy, 3.6), 1 / 3.6) / lim;
}

/** Roads: polylines with a half-width. */
const ROADS: { pts: [number, number][]; hw: number }[] = [
  { pts: [[640, 1710], [640, 1380]], hw: 27 },
  { pts: [[560, 1292], [470, 1262], [420, 1245]], hw: 25 },
  { pts: [[720, 1292], [820, 1262], [868, 1248]], hw: 25 },
  { pts: [[590, 1230], [520, 1130], [450, 1010], [394, 950]], hw: 25 },
  { pts: [[690, 1230], [760, 1130], [830, 1010], [886, 950]], hw: 25 },
  { pts: [[640, 1220], [640, 1000], [640, 740], [640, 560]], hw: 29 },
  { pts: [[420, 810], [540, 772], [640, 760]], hw: 23 },
  { pts: [[860, 810], [740, 772], [640, 760]], hw: 23 },
  { pts: [[800, 1722], [846, 1700], [862, 1672]], hw: 25 },
  { pts: [[1040, 1380], [1036, 1440], [1034, 1500]], hw: 23 },
];

/** Dense clumps of forest inside the zones: not walkable. */
const CARVES: Blob[] = [
  // Gloom Hollow: a wall with a narrow neck (the lamp gate) separates the inner glade
  { x: 190, y: 1125, rx: 24, ry: 80 },
  { x: 190, y: 1340, rx: 24, ry: 85 },
  { x: 330, y: 1300, rx: 24, ry: 18 },
  { x: 150, y: 1330, rx: 22, ry: 18 },
  // Rootmaw Thicket: two walls of roots close two narrow necks
  { x: 250, y: 755, rx: 26, ry: 68 },
  { x: 250, y: 965, rx: 26, ry: 75 },
  { x: 130, y: 765, rx: 22, ry: 55 },
  { x: 130, y: 955, rx: 22, ry: 65 },
  { x: 300, y: 905, rx: 22, ry: 16 },
  { x: 185, y: 800, rx: 18, ry: 14 },
  // Echo Marsh: a reed gate closes the neck to the Bell Tower
  { x: 1030, y: 755, rx: 26, ry: 62 },
  { x: 1030, y: 960, rx: 26, ry: 78 },
  { x: 1110, y: 925, rx: 20, ry: 14 },
  { x: 930, y: 960, rx: 18, ry: 12 },
  // Bone Wastes: a bone barricade closes the neck to the Bone Nest
  { x: 1130, y: 1110, rx: 24, ry: 60 },
  { x: 1130, y: 1340, rx: 24, ry: 75 },
  { x: 1000, y: 1170, rx: 24, ry: 18 },
  // Moth Meadow
  { x: 960, y: 1600, rx: 22, ry: 16 },
];

export interface Prop {
  x: number;
  y: number;
  img: HTMLCanvasElement;
  kind: 'tree' | 'bush' | 'rock';
}

export interface Flower {
  x: number;
  y: number;
  ph: number;
}

export interface Decal {
  x: number;
  y: number;
  rx: number;
  ry: number;
  strength: number;
}

const BIOMES: GroundKind[] = ['forest', 'marsh', 'meadow', 'bones', 'thicket'];

function wobble(b: Blob, x: number, y: number, seed: number): number {
  const dx = (x - b.x) / b.rx;
  const dy = (y - b.y) / b.ry;
  const th = Math.atan2(dy, dx);
  const lim = 1 + 0.1 * Math.sin(3 * th + seed) + 0.06 * Math.sin(5 * th + seed * 2.3);
  return Math.hypot(dx, dy) / lim;
}

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export class Land {
  /** 1 where the blob can walk. */
  readonly walk = new Uint8Array(GW * GH);
  /** 1 where the ground is a road. */
  readonly road = new Uint8Array(GW * GH);
  /** index into BIOMES */
  readonly bio = new Uint8Array(GW * GH);
  /** distance (in cells) from a walkable cell to the nearest wall, or from a wall to the nearest walkable cell */
  private dist = new Uint8Array(GW * GH);
  readonly props: Prop[] = [];
  readonly flowers: Flower[] = [];
  readonly decals: Decal[] = [];
  readonly frame = makeFrame();
  readonly vignette = makeVignette();
  private groundPats: Partial<Record<GroundKind, CanvasPattern>> = {};
  private pathPats: Partial<Record<GroundKind, CanvasPattern>> = {};
  private flowerOpen = makeFlower(true);
  private flowerShut = makeFlower(false);
  private stars: { x: number; y: number; ph: number; t: number }[] = [];

  constructor(ctx: CanvasRenderingContext2D) {
    for (const k of BIOMES) {
      this.groundPats[k] = ctx.createPattern(makeGroundTile(k), 'repeat')!;
      this.pathPats[k] = ctx.createPattern(makePathTile(k), 'repeat')!;
    }
    this.buildMask();
    this.buildProps();
    const r = rng(77);
    for (let i = 0; i < 46; i++) this.stars.push({ x: 6 + r() * (W - 12), y: r() * 230, ph: r() * TAU, t: 2.2 + r() * 2.2 });
    this.stars.sort((a, b) => a.t - b.t);
  }

  /* ------------------------------ the map ------------------------------ */

  private buildMask() {
    const blobs: { b: Blob; seed: number }[] = [
      { b: START, seed: 1.3 },
      { b: HUB, seed: 2.1 },
      { b: PLATEAU, seed: 0.7 },
      ...ZONES.map((z, i) => ({ b: z as Blob, seed: 3 + i * 1.7 })),
    ];
    for (let cy = 0; cy < GH; cy++) {
      for (let cx = 0; cx < GW; cx++) {
        const x = cx * CELL + CELL / 2;
        const y = cy * CELL + CELL / 2;
        let inside = false;
        let isRoad = false;
        for (const { b, seed } of blobs) {
          if (wobble(b, x, y, seed) <= 1) {
            inside = true;
            break;
          }
        }
        let arenaBiome = -1;
        for (const a of ARENAS) {
          if (arenaShape(a, x, y) <= 1) {
            inside = true;
            arenaBiome = BIOMES.indexOf(a.biome);
            break;
          }
        }
        if (!inside) {
          for (const rd of ROADS) {
            for (let i = 0; i + 1 < rd.pts.length; i++) {
              const a = rd.pts[i]!;
              const c = rd.pts[i + 1]!;
              const wob = 1 + 0.12 * Math.sin(y / 23 + a[0]) + 0.08 * Math.sin(x / 31 + c[1]);
              if (distSeg(x, y, a[0], a[1], c[0], c[1]) <= rd.hw * wob) {
                inside = true;
                isRoad = true;
              }
            }
          }
        }
        if (inside) for (const c of CARVES) if (Math.hypot((x - c.x) / c.rx, (y - c.y) / c.ry) <= 1) inside = false;
        const i = cy * GW + cx;
        this.walk[i] = inside ? 1 : 0;
        this.road[i] = isRoad ? 1 : 0;
        // biome: the zone you are inside (or next to) decides the ground
        let b = 0;
        let best = 1.25;
        for (const z of ZONES) {
          const d = wobble(z, x, y, 1);
          if (d < best) {
            best = d;
            b = BIOMES.indexOf(z.biome);
          }
        }
        this.bio[i] = arenaBiome >= 0 ? arenaBiome : b;
      }
    }
    // chamfer distance transform: for walkable cells the distance to a wall, for walls the distance to ground
    const INF = 250;
    const d = new Uint16Array(GW * GH);
    for (let i = 0; i < d.length; i++) d[i] = INF;
    for (let cy = 0; cy < GH; cy++) {
      for (let cx = 0; cx < GW; cx++) {
        const i = cy * GW + cx;
        const want = this.walk[i];
        let edge = cx === 0 || cy === 0 || cx === GW - 1 || cy === GH - 1;
        if (!edge) edge = this.walk[i - 1] !== want || this.walk[i + 1] !== want || this.walk[i - GW] !== want || this.walk[i + GW] !== want;
        if (edge) d[i] = 0;
      }
    }
    const pass = (cx: number, cy: number, i: number, dx: number, dy: number, cost: number) => {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return;
      const v = d[ny * GW + nx]! + cost;
      if (v < d[i]!) d[i] = v;
    };
    for (let cy = 0; cy < GH; cy++) {
      for (let cx = 0; cx < GW; cx++) {
        const i = cy * GW + cx;
        pass(cx, cy, i, -1, 0, 1);
        pass(cx, cy, i, 0, -1, 1);
        pass(cx, cy, i, -1, -1, 1.4);
        pass(cx, cy, i, 1, -1, 1.4);
      }
    }
    for (let cy = GH - 1; cy >= 0; cy--) {
      for (let cx = GW - 1; cx >= 0; cx--) {
        const i = cy * GW + cx;
        pass(cx, cy, i, 1, 0, 1);
        pass(cx, cy, i, 0, 1, 1);
        pass(cx, cy, i, 1, 1, 1.4);
        pass(cx, cy, i, -1, 1, 1.4);
      }
    }
    for (let i = 0; i < d.length; i++) this.dist[i] = Math.min(255, Math.round(d[i]!));
  }

  private buildProps() {
    const r = rng(2024);
    const trees = [1, 2, 3, 4, 5, 6].map((i) => makeTree(100 + i * 17, 100 + (i % 3) * 8));
    const shortTrees = [1, 2, 3, 4].map((i) => makeTree(300 + i * 13, 66 + (i % 2) * 8));
    const bushes = [1, 2, 3].map((i) => makeBush(500 + i));
    const rocks = [1, 2, 3].map((i) => makeRock(700 + i));
    const STEP = 22;
    for (let y = 8; y < WORLD_H; y += STEP) {
      for (let x = 8; x < WORLD_W; x += STEP) {
        const jx = x + (r() - 0.5) * STEP;
        const jy = y + (r() - 0.5) * STEP;
        const ci = Math.floor(jy / CELL) * GW + Math.floor(jx / CELL);
        if (ci < 0 || ci >= this.walk.length) continue;
        // nothing grows in the void beyond the cliff
        if (jy < CLIFF_Y + 6) continue;
        const d = this.dist[ci]!;
        if (!this.walk[ci]) {
          // forest wall: dense near the edge, thinner further away
          const p = d <= 6 ? 0.9 : d <= 14 ? 0.72 : d <= 30 ? 0.45 : 0.28;
          if (r() < p) {
            const img = r() < 0.72 ? trees[Math.floor(r() * trees.length)]! : shortTrees[Math.floor(r() * shortTrees.length)]!;
            this.props.push({ x: jx, y: jy, img, kind: 'tree' });
          }
        } else if (d >= 5 && !this.road[ci]) {
          const q = r();
          if (q < 0.07) this.props.push({ x: jx, y: jy, img: bushes[Math.floor(r() * bushes.length)]!, kind: 'bush' });
          else if (q < 0.1) this.props.push({ x: jx, y: jy, img: rocks[Math.floor(r() * rocks.length)]!, kind: 'rock' });
          else if (q < 0.17) this.addFlowers(jx, jy, 1 + Math.floor(r() * 3), 14, r);
        }
      }
    }
    // a few big trees that frame the plateau and the start glade
    this.props.sort((a, b) => a.y - b.y);
    this.flowers.sort((a, b) => a.y - b.y);
  }

  addFlowers(cx: number, cy: number, n: number, spread: number, r: () => number) {
    for (let k = 0; k < n; k++) this.flowers.push({ x: cx + (r() - 0.5) * spread, y: cy + (r() - 0.5) * spread * 0.7, ph: r() * TAU });
  }

  /** A pool of glowing flowers (safe from shadows, and it heals). */
  addPatchFlowers(cx: number, cy: number, rx: number, ry: number, seed: number) {
    const r = rng(seed);
    for (let k = 0; k < 10; k++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * 0.85;
      this.flowers.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, ph: r() * TAU });
    }
    this.flowers.sort((a, b) => a.y - b.y);
  }

  addDecal(x: number, y: number, rx: number, ry: number, strength = 1) {
    this.decals.push({ x, y, rx, ry, strength });
  }

  /** Debug: the walkable map as an image (1 px = 2 world px) with a 100 px grid, for designing zones. */
  debugMap(marks: { x: number; y: number; c: string; r?: number }[] = []): string {
    const k = 2;
    const c = document.createElement('canvas');
    c.width = WORLD_W / k;
    c.height = WORLD_H / k;
    const x = c.getContext('2d')!;
    x.fillStyle = '#10161c';
    x.fillRect(0, 0, c.width, c.height);
    for (let cy = 0; cy < GH; cy++) {
      for (let cx = 0; cx < GW; cx++) {
        const i = cy * GW + cx;
        if (!this.walk[i]) continue;
        x.fillStyle = this.road[i] ? '#4a6a5a' : ['#2a6a4a', '#2a6a7a', '#6a8a3a', '#8a8a7a', '#6a4a2a'][this.bio[i]!]!;
        x.fillRect((cx * CELL) / k, (cy * CELL) / k, CELL / k, CELL / k);
      }
    }
    x.strokeStyle = 'rgba(255,255,255,0.25)';
    x.fillStyle = '#fff';
    x.font = '9px monospace';
    for (let gx = 0; gx <= WORLD_W; gx += 100) {
      x.beginPath();
      x.moveTo(gx / k, 0);
      x.lineTo(gx / k, c.height);
      x.stroke();
      x.fillText(String(gx), gx / k + 2, 9);
    }
    for (let gy = 0; gy <= WORLD_H; gy += 100) {
      x.beginPath();
      x.moveTo(0, gy / k);
      x.lineTo(c.width, gy / k);
      x.stroke();
      x.fillText(String(gy), 2, gy / k - 2);
    }
    for (const m of marks) {
      x.fillStyle = m.c;
      x.beginPath();
      x.arc(m.x / k, m.y / k, (m.r ?? 6) / k + 1.5, 0, 6.3);
      x.fill();
    }
    return c.toDataURL('image/png');
  }

  /* ------------------------------ queries ------------------------------ */

  isWalk(x: number, y: number): boolean {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return false;
    return this.walk[cy * GW + cx] === 1;
  }

  /** Can something with a small foot box stand here? */
  canStand(x: number, y: number, r = 4): boolean {
    return this.isWalk(x - r, y - 2) && this.isWalk(x + r, y - 2) && this.isWalk(x - r, y + 2) && this.isWalk(x + r, y + 2);
  }

  /** How far (in pixels, roughly) from this walkable point to a wall. */
  wallDist(x: number, y: number): number {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return 0;
    const i = cy * GW + cx;
    return this.walk[i] ? this.dist[i]! * CELL : 0;
  }

  biomeAt(x: number, y: number): GroundKind {
    const cx = clamp(Math.floor(x / CELL), 0, GW - 1);
    const cy = clamp(Math.floor(y / CELL), 0, GH - 1);
    return BIOMES[this.bio[cy * GW + cx]!]!;
  }

  /** Cliff line (world y) at column x. */
  cliffAt(x: number): number {
    return CLIFF_Y + Math.floor(hash2(Math.floor(x / 3), 77) * 5) - Math.sin(x / 19) * 3;
  }

  /* ------------------------------ drawing ------------------------------ */

  private setPatternOffset(camX: number, camY: number) {
    const m = new DOMMatrix([1, 0, 0, 1, -Math.round(camX), -Math.round(camY)]);
    for (const k of BIOMES) {
      this.groundPats[k]!.setTransform(m);
      this.pathPats[k]!.setTransform(m);
    }
  }

  drawGround(p: Pix, camX: number, camY: number) {
    camX = Math.round(camX);
    camY = Math.round(camY);
    this.setPatternOffset(camX, camY);
    const ctx = p.ctx;
    ctx.globalAlpha = 1;
    const c0 = Math.max(0, Math.floor(camX / CELL));
    const c1 = Math.min(GW - 1, Math.floor((camX + W) / CELL));
    const r0 = Math.max(0, Math.floor(camY / CELL));
    const r1 = Math.min(GH - 1, Math.floor((camY + H) / CELL));
    for (let cy = r0; cy <= r1; cy++) {
      const row = cy * GW;
      let runStart = -1;
      let runKey = -1;
      for (let cx = c0; cx <= c1 + 1; cx++) {
        let key = -1;
        if (cx <= c1) {
          const i = row + cx;
          key = this.walk[i] ? this.bio[i]! * 2 + this.road[i]! : -1;
        }
        if (key !== runKey) {
          if (runKey >= 0) {
            const b = BIOMES[runKey >> 1]!;
            ctx.fillStyle = (runKey & 1 ? this.pathPats[b] : this.groundPats[b])!;
            ctx.fillRect(runStart * CELL - camX, cy * CELL - camY, (cx - runStart) * CELL, CELL);
          }
          runStart = cx;
          runKey = key;
        }
      }
    }
    // a ragged lip along every edge of the ground
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const i = cy * GW + cx;
        if (!this.walk[i] || this.dist[i]! > 1) continue;
        const sx = cx * CELL - camX;
        const sy = cy * CELL - camY;
        const h = hash2(cx, cy);
        if (h > 0.55) p.px(sx + 1, sy + 1, '#0d2a36');
        if (h > 0.8) p.px(sx + 2, sy + 2, '#2e8a62');
      }
    }
  }

  /** The black nothing beyond the cliff, with the cliff lip. */
  drawVoid(p: Pix, camX: number, camY: number) {
    const ctx = p.ctx;
    for (let sx = 0; sx < W; sx += 3) {
      const cy = this.cliffAt(sx + Math.round(camX)) - Math.round(camY);
      if (cy > 0) {
        ctx.fillStyle = '#03040a';
        ctx.fillRect(sx, 0, 3, Math.min(H, Math.round(cy)));
        if (cy < H) {
          ctx.fillStyle = '#2a7a52';
          ctx.fillRect(sx, Math.round(cy), 3, 2);
          ctx.fillStyle = '#0a1a22';
          ctx.fillRect(sx, Math.round(cy) + 2, 3, 2);
        }
      }
    }
  }

  /** Stars that turn into eyes. `reveal` is the seconds since the sky began to open. */
  drawStars(p: Pix, camY: number, t: number, reveal: number, revealMax: number) {
    for (const s of this.stars) {
      const y = s.y + (CLIFF_Y - 240 - camY);
      if (y < -4 || y > H) continue;
      const since = reveal - s.t;
      if (since < 0) {
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + s.ph);
        p.alpha(tw);
        p.px(s.x, y, C.moonCore);
        if (Math.sin(t * 2 + s.ph) > 0.8) p.px(s.x + 1, y, C.moon);
        p.alpha(1);
      } else {
        const o = clamp(since / 0.5, 0, 1) * clamp((revealMax - reveal + 3) / 3, 0.5, 1);
        const h = Math.max(1, Math.round(3 * o));
        p.ellipse(s.x, y, 3.2, h, '#d9e4ff');
        p.rect(s.x - 0.5, y - h + 0.5, 1, h * 2 - 1, C.red);
      }
    }
  }

  drawGlowPatch(p: Pix, x: number, y: number, camX: number, camY: number, amt: number, rx = 44, ry = 30) {
    if (amt <= 0) return;
    const sx = x - camX;
    const sy = y - camY;
    p.dither(sx, sy, rx, ry, C.tealMid, 0.35 * amt);
    p.dither(sx, sy, rx * 0.8, ry * 0.8, C.moss, 0.32 * amt);
    p.dither(sx, sy, rx * 0.55, ry * 0.55, C.mossLight, 0.3 * amt);
    p.dither(sx, sy, rx * 0.3, ry * 0.3, C.mossGlow, 0.22 * amt);
  }

  drawDecals(p: Pix, camX: number, camY: number) {
    for (const d of this.decals) {
      const sx = d.x - camX;
      const sy = d.y - camY;
      if (sy < -60 || sy > H + 60 || sx < -90 || sx > W + 90) continue;
      p.dither(sx, sy, d.rx, d.ry, C.ink, 0.55 * d.strength);
      p.dither(sx, sy, d.rx * 0.72, d.ry * 0.72, C.ink, 0.5 * d.strength);
      p.ring(sx, sy, d.rx, d.ry, 1, '#0a1218');
    }
  }

  drawFlowers(p: Pix, camX: number, camY: number, t: number, closed: number, glow: number) {
    // flowers are sorted by y, so find the first visible one
    let lo = 0;
    let hi = this.flowers.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.flowers[mid]!.y < camY - 20) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.flowers.length; i++) {
      const f = this.flowers[i]!;
      const sy = f.y - camY;
      if (sy > H + 16) break;
      const sx = f.x - camX;
      if (sx < -14 || sx > W + 14) continue;
      let crushed = false;
      for (const d of this.decals) {
        const dx = (f.x - d.x) / (d.rx * 0.95);
        const dy = (f.y - d.y) / (d.ry * 0.95);
        if (dx * dx + dy * dy < 1) {
          crushed = true;
          break;
        }
      }
      if (crushed) continue;
      const pulse = 0.65 + 0.35 * Math.sin(t * 2 + f.ph);
      if (closed < 0.99) p.dither(sx, sy - 2, 9, 4.5, C.flower, 0.3 * pulse * glow * (1 - closed));
      p.blit(closed > 0.5 ? this.flowerShut : this.flowerOpen, sx - 6, sy - 15);
    }
  }

  visibleProps(camX: number, camY: number): Prop[] {
    const out: Prop[] = [];
    let lo = 0;
    let hi = this.props.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.props[mid]!.y < camY - 20) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.props.length; i++) {
      const pr = this.props[i]!;
      const sy = pr.y - camY;
      if (sy > H + 130) break;
      const sx = pr.x - camX;
      if (sx < -40 || sx > W + 40) continue;
      out.push(pr);
    }
    return out;
  }
}
