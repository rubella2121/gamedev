import { Pix, W, H } from '../core/pix';
import { C } from '../core/palette';
import { clamp, hash2, rng } from '../core/util';
import { makeBush, makeFlower, makeFrame, makeGroundTile, makePathTile, makeRock, makeTree, makeVignette } from '../core/art';

import { CLIFF_Y, PATCHES, SEC, biomeAt, moveHw, pathHw, trailCx } from './layout';
export { CLIFF_Y, moveHw, pathHw, trailCx };

/** Where the clearing (and the family) sits in world coordinates. */
export const CLEARING = { x: 108, y: 0 };

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

export class World {
  readonly props: Prop[] = [];
  readonly flowers: Flower[] = [];
  readonly decals: Decal[] = [];
  readonly deadTree: { x: number; y: number; img: HTMLCanvasElement; alive: boolean };
  private groundPats: Record<string, CanvasPattern> = {};
  private pathPats: Record<string, CanvasPattern> = {};
  private flowerOpen = makeFlower(true);
  private flowerShut = makeFlower(false);
  readonly frame = makeFrame();
  readonly vignette = makeVignette();
  private stars: { x: number; y: number; ph: number; t: number }[] = [];

  constructor(ctx: CanvasRenderingContext2D) {
    for (const k of ['forest', 'marsh', 'meadow'] as const) {
      this.groundPats[k] = ctx.createPattern(makeGroundTile(k), 'repeat')!;
      this.pathPats[k] = ctx.createPattern(makePathTile(k), 'repeat')!;
    }
    const r = rng(2024);
    const trees = [1, 2, 3, 4, 5, 6].map((i) => makeTree(100 + i * 17, 100 + (i % 3) * 8));
    const shortTrees = [1, 2, 3, 4].map((i) => makeTree(300 + i * 13, 66 + (i % 2) * 8));
    const bushes = [1, 2, 3].map((i) => makeBush(500 + i));
    const rocks = [1, 2, 3].map((i) => makeRock(700 + i));

    for (let y = 170; y > CLIFF_Y - 120; y -= 13) {
      const cx = trailCx(y);
      const inner = moveHw(y) + 5;
      const bio = biomeAt(y);
      for (const side of [-1, 1]) {
        if (r() < (bio === 'forest' ? 0.82 : bio === 'marsh' ? 0.55 : 0.5)) {
          const x = cx + side * (inner + r() * 30);
          const img = r() < 0.7 ? trees[Math.floor(r() * trees.length)]! : shortTrees[Math.floor(r() * shortTrees.length)]!;
          this.props.push({ x, y: y + r() * 8, img, kind: 'tree' });
        }
        if (r() < 0.32) {
          const x = cx + side * (inner - 6 + r() * 18);
          this.props.push({ x, y: y + r() * 6, img: bushes[Math.floor(r() * bushes.length)]!, kind: 'bush' });
        }
        if (r() < 0.12) {
          const x = cx + side * (inner - 12 + r() * 14);
          this.props.push({ x, y, img: rocks[Math.floor(r() * rocks.length)]!, kind: 'rock' });
        }
        if (r() < (bio === 'meadow' ? 0.8 : 0.3)) {
          const n = 2 + Math.floor(r() * 3) + (bio === 'meadow' ? 3 : 0);
          const fx = cx + side * (inner - 8 + r() * 14);
          for (let k = 0; k < n; k++) this.flowers.push({ x: fx + (r() - 0.5) * 16, y: y + (r() - 0.5) * 12, ph: r() * 6.28 });
        }
      }
    }
    // flowers scattered around the family clearing
    for (let k = 0; k < 20; k++) {
      const a = r() * 6.28;
      const d = 34 + r() * 52;
      this.flowers.push({ x: CLEARING.x + Math.cos(a) * d * 1.25, y: CLEARING.y + Math.sin(a) * d * 0.8, ph: r() * 6.28 });
    }
    for (const pt of PATCHES) {
      for (let k = 0; k < 9; k++) {
        const a = r() * 6.28;
        const d = Math.sqrt(r()) * 0.85;
        this.flowers.push({ x: pt.x + Math.cos(a) * pt.rx * d, y: pt.y + Math.sin(a) * pt.ry * d, ph: r() * 6.28 });
      }
    }
    // the field of flowers in the meadow
    for (let k = 0; k < 90; k++) {
      const y = SEC.meadow[0] - r() * (SEC.meadow[0] - SEC.meadow[1]);
      this.flowers.push({ x: trailCx(y) + (r() - 0.5) * 150, y, ph: r() * 6.28 });
    }
    this.props.sort((a, b) => a.y - b.y);
    // the dead tree that the first scripted slam will smash
    const dy = -590;
    this.deadTree = { x: trailCx(dy) + 6, y: dy, img: makeTree(901, 84, true), alive: true };

    for (let i = 0; i < 46; i++) this.stars.push({ x: 6 + r() * (W - 12), y: r() * 230, ph: r() * 6.28, t: 2.2 + r() * 2.2 });
    this.stars.sort((a, b) => a.t - b.t);
  }

  private setPatternOffset(camY: number) {
    const m = new DOMMatrix([1, 0, 0, 1, 0, -Math.round(camY)]);
    for (const k of Object.keys(this.groundPats)) {
      this.groundPats[k]!.setTransform(m);
      this.pathPats[k]!.setTransform(m);
    }
  }

  /** Cliff line (world y) at column x. */
  cliffAt(x: number): number {
    return CLIFF_Y + Math.floor(hash2(Math.floor(x / 3), 77) * 5) - Math.sin(x / 19) * 3;
  }

  drawGround(p: Pix, camY: number, withVoid = false) {
    camY = Math.round(camY);
    this.setPatternOffset(camY);
    const ctx = p.ctx;
    ctx.globalAlpha = 1;
    // contiguous blocks of rows that share a biome use that biome's ground pattern
    let blockStart = 0;
    let blockBio = biomeAt(camY);
    for (let row = 1; row <= H; row++) {
      const bio = row < H ? biomeAt(camY + row) : '';
      if (bio !== blockBio) {
        ctx.fillStyle = this.groundPats[blockBio]!;
        ctx.fillRect(0, blockStart, W, row - blockStart);
        blockStart = row;
        blockBio = bio as typeof blockBio;
      }
    }
    // trail band, row by row (pattern fill first, then the ragged edge pixels)
    for (let row = 0; row < H; row++) {
      const wy = camY + row;
      const hw = pathHw(wy);
      if (hw < 1) continue;
      const cx = trailCx(wy);
      const x0 = Math.round(cx - hw + Math.floor(hash2(wy, 1) * 3) - 1);
      const x1 = Math.round(cx + hw + Math.floor(hash2(wy, 2) * 3) - 1);
      ctx.fillStyle = this.pathPats[biomeAt(wy)]!;
      ctx.fillRect(x0, row, x1 - x0, 1);
    }
    for (let row = 0; row < H; row++) {
      const wy = camY + row;
      const hw = pathHw(wy);
      if (hw < 1) continue;
      const cx = trailCx(wy);
      const x0 = Math.round(cx - hw + Math.floor(hash2(wy, 1) * 3) - 1);
      const x1 = Math.round(cx + hw + Math.floor(hash2(wy, 2) * 3) - 1);
      p.px(x0 - 1, row, '#0d2a36');
      p.px(x1, row, '#0d2a36');
      if (hash2(wy, 5) > 0.7) p.px(x0 + 1, row, '#2e8a62');
      if (hash2(wy, 6) > 0.7) p.px(x1 - 2, row, '#2e8a62');
    }
    if (withVoid) this.drawVoid(p, camY);
  }

  /** Glowing flower pools along the first stretch of the trail. */
  drawPatches(p: Pix, camY: number, t: number) {
    for (const pt of PATCHES) {
      const sy = pt.y - camY;
      if (sy < -40 || sy > H + 40) continue;
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.6 + pt.x);
      p.dither(pt.x, sy, pt.rx * 1.12, pt.ry * 1.12, C.tealMid, 0.3 * pulse);
      p.dither(pt.x, sy, pt.rx * 0.85, pt.ry * 0.85, C.moss, 0.34 * pulse);
      p.dither(pt.x, sy, pt.rx * 0.55, pt.ry * 0.55, C.mossLight, 0.3 * pulse);
      p.dither(pt.x, sy, pt.rx * 0.3, pt.ry * 0.3, C.mossGlow, 0.22 * pulse);
    }
  }

  /** The black nothing beyond the cliff, with the cliff lip. */
  drawVoid(p: Pix, camY: number) {
    const ctx = p.ctx;
    for (let x = 0; x < W; x += 3) {
      const cy = this.cliffAt(x) - camY;
      if (cy > 0) {
        ctx.fillStyle = '#03040a';
        ctx.fillRect(x, 0, 3, Math.min(H, Math.round(cy)));
        if (cy < H) {
          ctx.fillStyle = '#2a7a52';
          ctx.fillRect(x, Math.round(cy), 3, 2);
          ctx.fillStyle = '#0a1a22';
          ctx.fillRect(x, Math.round(cy) + 2, 3, 2);
        }
      }
    }
  }

  /** Stars that turn into eyes. `eyes` is 0..1 progress of the reveal (by star order). */
  drawStars(p: Pix, camY: number, t: number, reveal: number, revealMax: number) {
    for (const s of this.stars) {
      const y = s.y + (CLIFF_Y - 240 - camY);
      if (y < -4 || y > H) continue;
      const since = reveal - s.t;
      if (since < 0) {
        // still a star
        const tw = 0.6 + 0.4 * Math.sin(t * 3 + s.ph);
        p.alpha(tw);
        p.px(s.x, y, C.moonCore);
        if (Math.sin(t * 2 + s.ph) > 0.8) p.px(s.x + 1, y, C.moon);
        p.alpha(1);
      } else {
        // an eye opening
        const o = clamp(since / 0.5, 0, 1) * clamp((revealMax - reveal + 3) / 3, 0.5, 1);
        const h = Math.max(1, Math.round(3 * o));
        p.ellipse(s.x, y, 3.2, h, '#d9e4ff');
        p.rect(s.x - 0.5, y - h + 0.5, 1, h * 2 - 1, C.red);
      }
    }
  }

  drawGlowPatch(p: Pix, x: number, y: number, camY: number, amt: number, rx = 44, ry = 30) {
    if (amt <= 0) return;
    const sy = y - camY;
    p.dither(x, sy, rx, ry, C.tealMid, 0.35 * amt);
    p.dither(x, sy, rx * 0.8, ry * 0.8, C.moss, 0.32 * amt);
    p.dither(x, sy, rx * 0.55, ry * 0.55, C.mossLight, 0.3 * amt);
    p.dither(x, sy, rx * 0.3, ry * 0.3, C.mossGlow, 0.22 * amt);
  }

  drawDecals(p: Pix, camY: number) {
    for (const d of this.decals) {
      const sy = d.y - camY;
      if (sy < -60 || sy > H + 60) continue;
      p.dither(d.x, sy, d.rx, d.ry, C.ink, 0.55 * d.strength);
      p.dither(d.x, sy, d.rx * 0.72, d.ry * 0.72, C.ink, 0.5 * d.strength);
      p.ring(d.x, sy, d.rx, d.ry, 1, '#0a1218');
    }
  }

  drawFlowers(p: Pix, camY: number, t: number, closed: number, glow: number) {
    for (const f of this.flowers) {
      const sy = f.y - camY;
      if (sy < -20 || sy > H + 16) continue;
      // crushed flowers: skip anything inside a crater
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
      if (closed < 0.99) p.dither(f.x, sy - 2, 9, 4.5, C.flower, 0.3 * pulse * glow * (1 - closed));
      const img = closed > 0.5 ? this.flowerShut : this.flowerOpen;
      p.blit(img, f.x - 6, sy - 15);
    }
  }

  visibleProps(camY: number): Prop[] {
    const out: Prop[] = [];
    for (const pr of this.props) {
      const sy = pr.y - camY;
      if (sy < -20 || sy > H + 130) continue;
      out.push(pr);
    }
    return out;
  }

  addDecal(x: number, y: number, rx: number, ry: number, strength = 1) {
    this.decals.push({ x, y, rx, ry, strength });
  }
}
