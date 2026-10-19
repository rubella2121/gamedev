import { drawGloom } from '../../core/art2';
import { burst } from '../../core/art';
import { C } from '../../core/palette';
import { D } from '../../core/difficulty';
import { dist, hash2 } from '../../core/util';
import { drawBlossom, drawGloomHeart, drawLamp, drawNest, drawPips, drawThornGate } from '../art3';
import type { Drawable, Hub, Patch, Rect, Zone } from '../types';
import { Gate, LightPuzzle, onScreen } from './parts';

interface Gl {
  x: number;
  y: number;
  vx: number;
  vy: number;
  seed: number;
  cd: number;
  /** 1 = solid, fades to 0 as it is destroyed */
  fade: number;
  dying: boolean;
}

interface Nest {
  x: number;
  y: number;
  hp: number;
  flash: number;
  seed: number;
  spawnT: number;
}

const PATCHES: Patch[] = [
  { x: 430, y: 1255, rx: 28, ry: 20 },
  { x: 300, y: 1232, rx: 24, ry: 17 },
  { x: 150, y: 1232, rx: 30, ry: 20 },
];
const NESTS = [
  { x: 255, y: 1170 },
  { x: 225, y: 1300 },
  { x: 345, y: 1215 },
];
const LAMPS = [
  { x: 300, y: 1110 },
  { x: 395, y: 1290 },
  { x: 275, y: 1365 },
];
const RING = [
  { x: 365, y: 1088 },
  { x: 387, y: 1110 },
  { x: 365, y: 1132 },
  { x: 343, y: 1110 },
];
const HEART = { x: 95, y: 1232, hp: 6 };

/**
 * Gloom Hollow. Gloomlings die to a light pulse, but their nests keep making more in the dark.
 * Light all three lamps at once to open the inner glade, then break the Gloom Heart.
 */
export class GloomZone implements Zone {
  readonly id = 'gloom' as const;
  cleared = false;
  private gl: Gl[] = [];
  private nests: Nest[] = [];
  private lamps = new LightPuzzle(LAMPS, 12, 12);
  private ring = new LightPuzzle(RING, 6, 10);
  private gate = new Gate({ x0: 182, y0: 1203, x1: 198, y1: 1257 });
  private heart = { ...HEART, flash: 0, dead: false };
  private ringDone = false;
  private t = 0;

  constructor(private hub: Hub) {
    for (const pt of PATCHES) hub.land.addPatchFlowers(pt.x, pt.y, pt.rx, pt.ry, Math.floor(pt.x));
  }

  reset() {
    this.cleared = false;
    this.gl = [];
    this.nests = NESTS.map((n, i) => ({ ...n, hp: 3, flash: 0, seed: i * 3 + 1, spawnT: 1 + i * 0.7 }));
    this.lamps.reset();
    this.ring.reset();
    this.ringDone = false;
    this.gate.open = 0;
    this.gate.opening = false;
    this.heart = { ...HEART, flash: 0, dead: false };
    this.hub.patches.push(...PATCHES);
  }

  onRespawn() {
    this.gl = [];
    this.lamps.reset(this.lamps.solved);
    this.ring.reset(this.ringDone);
    if (!this.cleared && !this.heart.dead) this.heart.hp = HEART.hp;
  }

  complete() {
    this.cleared = true;
    this.gl = [];
    this.nests = [];
    this.lamps.solved = true;
    this.gate.open = 1;
    this.gate.opening = true;
    this.heart.dead = true;
  }

  colliders(): Rect[] {
    return this.gate.solid() ? [this.gate.rect] : [];
  }

  private safe(x: number, y: number, k = 0.92): boolean {
    return !!this.hub.inPatch(x, y, k) || this.lamps.inLight(x, y, 34) || this.ring.inLight(x, y, 20);
  }

  private spawn(x: number, y: number) {
    this.gl.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 6, vx: 0, vy: 0, seed: Math.random() * 99, cd: 0.4, fade: 0, dying: false });
  }

  onPulse(px: number, py: number, R: number) {
    const hub = this.hub;
    // Gloomlings: one pulse destroys them
    for (const g of this.gl) {
      if (!g.dying && dist(px, py, g.x, g.y) <= R + 3) {
        g.dying = true;
        hub.audio.kill();
        burst(hub.parts, g.x, g.y - 3, 8, [C.cyanEye, '#05070f', '#16303a'], 36, 1);
      }
    }
    for (const n of this.nests) {
      if (n.hp > 0 && dist(px, py, n.x, n.y) <= R + 8) {
        n.hp--;
        n.flash = 0.25;
        hub.audio.pop();
        burst(hub.parts, n.x, n.y - 5, n.hp > 0 ? 6 : 16, [C.cyanEye, '#05070f'], 40, 1);
      }
    }
    this.nests = this.nests.filter((n) => n.hp > 0);
    if (this.lamps.onPulse(px, py, R)) hub.audio.click();
    if (this.ring.onPulse(px, py, R)) hub.audio.click();
    const h = this.heart;
    if (!h.dead && this.gate.open >= 0.85 && dist(px, py, h.x, h.y - 8) <= R + 14) {
      h.hp--;
      h.flash = 0.25;
      hub.audio.pop();
      hub.shake(3);
      burst(hub.parts, h.x, h.y - 10, 14, [C.cyanEye, '#05070f', C.white], 50, 1);
      for (let i = 0; i < 3; i++) this.spawn(h.x + 20 + i * 6, h.y + (i - 1) * 8);
      if (h.hp <= 0) {
        h.dead = true;
        hub.audio.kill();
        hub.reachHeart(this);
      }
    }
  }

  update(dt: number) {
    const hub = this.hub;
    const pl = hub.player;
    this.t += dt;
    this.gate.update(dt);
    for (const n of this.nests) n.flash = Math.max(0, n.flash - dt);
    this.heart.flash = Math.max(0, this.heart.flash - dt);

    if (this.lamps.update(dt) && !this.gate.opening) {
      this.gate.opening = true;
      hub.audio.unlock();
      hub.shake(4);
      hub.checkpoint(165, 1232);
      burst(hub.parts, this.gate.x, this.gate.midY, 24, [C.red, C.moss, C.mossGlow], 50, 1);
    }
    if (this.ring.update(dt) && !this.ringDone) {
      this.ringDone = true;
      hub.audio.unlock();
      hub.secret(365, 1110);
    }

    if (this.cleared) return;

    // --- nests make Gloomlings while you stand in the dark nearby
    const cap = Math.round(10 * (D.id === 'gentle' ? 0.7 : D.id === 'nightmare' ? 1.35 : 1));
    for (const n of this.nests) {
      n.spawnT -= dt;
      const d = dist(pl.x, pl.y, n.x, n.y);
      if (n.spawnT <= 0 && d < 170 && !this.safe(pl.x, pl.y) && this.gl.length < cap) {
        this.spawn(n.x, n.y);
        n.spawnT = (2.4 + hash2(n.seed, Math.floor(this.t)) * 1.5) / D.speed;
      }
    }

    // --- Gloomlings
    const speed = (36 + Math.min(10, this.gl.length * 0.8)) * D.speed;
    const playerSafe = this.safe(pl.x, pl.y, 1.0);
    for (let i = this.gl.length - 1; i >= 0; i--) {
      const g = this.gl[i]!;
      if (g.dying) {
        g.fade -= dt * 4;
        if (g.fade <= 0) this.gl.splice(i, 1);
        continue;
      }
      g.fade = Math.min(1, g.fade + dt * 3);
      g.cd -= dt;
      const dx = pl.x - g.x;
      const dy = pl.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      let tx = 0;
      let ty = 0;
      if (d < 130 && !playerSafe && pl.dead <= 0) {
        const wob = Math.sin(this.t * 3 + g.seed) * 0.5;
        tx = dx / d + (-dy / d) * wob;
        ty = dy / d + (dx / d) * wob;
      } else {
        // drift gently around
        tx = Math.sin(this.t * 0.7 + g.seed) * 0.4;
        ty = Math.cos(this.t * 0.6 + g.seed * 1.3) * 0.3;
      }
      if (g.cd > 0) {
        tx *= -0.3;
        ty *= -0.3;
      }
      g.vx += (tx * speed - g.vx) * (1 - Math.exp(-6 * dt));
      g.vy += (ty * speed - g.vy) * (1 - Math.exp(-6 * dt));
      const nx = g.x + g.vx * dt;
      const ny = g.y + g.vy * dt;
      // shadows cannot enter the light, and they stay on the ground
      const blocked = (x: number, y: number) => this.safe(x, y, 1.05) || !hub.land.isWalk(x, y) || (this.gate.solid() && x > 176 && x < 204 && y > 1196 && y < 1264);
      if (!blocked(nx, g.y)) g.x = nx;
      else g.vx *= -0.3;
      if (!blocked(g.x, ny)) g.y = ny;
      else g.vy *= -0.3;
      if (d < 7 && g.cd <= 0 && !pl.hide && pl.dead <= 0) {
        hub.hurt(g.x, g.y, 1);
        g.cd = 1.3;
      }
    }
  }

  ground() {
    // a faint cyan fog where the Hollow is darkest
  }

  push(list: Drawable[]) {
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    for (const n of this.nests) {
      if (!onScreen(hub, n.x, n.y)) continue;
      list.push({
        y: n.y,
        fn: () => {
          drawNest(p, n.x - cx, n.y - cy, t, n.hp / 3, n.seed);
          if (n.hp < 3) drawPips(p, n.x - cx, n.y - cy - 18, n.hp, 3);
        },
      });
    }
    LAMPS.forEach((l, i) => {
      if (!onScreen(hub, l.x, l.y)) return;
      list.push({ y: l.y, fn: () => drawLamp(p, l.x - cx, l.y - cy, t, this.lamps.lit(i)) });
    });
    RING.forEach((l, i) => {
      if (!onScreen(hub, l.x, l.y)) return;
      list.push({ y: l.y, fn: () => drawBlossom(p, l.x - cx, l.y - cy, t, this.ring.lit(i), i) });
    });
    if (!this.heart.dead && onScreen(hub, this.heart.x, this.heart.y, 60)) {
      const h = this.heart;
      list.push({
        y: h.y,
        fn: () => {
          drawGloomHeart(p, h.x - cx, h.y - cy, t, h.hp / HEART.hp, h.flash);
          drawPips(p, h.x - cx, h.y - cy - 36, h.hp, HEART.hp);
        },
      });
    }
    if (this.gate.open < 0.99 && onScreen(hub, this.gate.x, this.gate.midY, 40)) {
      list.push({ y: this.gate.rect.y1, fn: () => drawThornGate(p, this.gate.x - cx, this.gate.rect.y0 - cy, this.gate.rect.y1 - cy, t, this.gate.open) });
    }
    for (const g of this.gl) {
      if (!onScreen(hub, g.x, g.y)) continue;
      list.push({ y: g.y, fn: () => drawGloom(p, g.x - cx, g.y - cy, t, g.seed, g.dying ? Math.max(0, g.fade) : g.fade) });
    }
  }
}
