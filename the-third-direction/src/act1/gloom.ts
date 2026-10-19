import { D } from '../core/difficulty';
import { C } from '../core/palette';
import { burst } from '../core/art';
import { drawGloom } from '../core/art2';
import { H } from '../core/pix';
import { clamp, dist, rng } from '../core/util';
import type { Drawable, Encounter, Hub } from './hub';
import { SEC, inPatch, moveHw, trailCx } from './layout';

interface Gloom {
  x: number;
  y: number;
  awake: boolean;
  seed: number;
  fade: number;
  vx: number;
  vy: number;
}

const NESTS = [
  { y: -250, side: -1 },
  { y: -360, side: 1 },
  { y: -470, side: -1 },
  { y: -660, side: 1 },
  { y: -735, side: -1 },
];
const CAP = 26;

/** Encounter 1: shadow swarm that multiplies when you stand still in the dark. */
export class GloomEncounter implements Encounter {
  readonly id = 'gloom';
  readonly y0 = SEC.gloom[0];
  readonly y1 = SEC.gloom[1];
  private gl: Gloom[] = [];
  private idleT = 0;
  private spawnT = 0;
  private done = { behind: false, tree: false, stitch: false, teaser: false, cp: false };
  private stitchT = -1;
  private stitchC = { x: 0, y: 0 };

  constructor(private hub: Hub) {
    this.reset();
  }

  reset() {
    const r = rng(77);
    this.gl = [];
    for (const n of NESTS) {
      for (let k = 0; k < 3; k++) {
        const y = n.y + (r() - 0.5) * 22;
        this.gl.push({ x: trailCx(y) + n.side * (30 + r() * 12), y, awake: false, seed: r() * 6, fade: 1, vx: 0, vy: 0 });
      }
    }
    this.idleT = 0;
    this.spawnT = 0;
    this.done = { behind: false, tree: false, stitch: false, teaser: false, cp: false };
    this.stitchT = -1;
  }

  onRespawn() {
    const y = this.hub.player.y;
    const stitched = this.done.stitch;
    const tree = this.done.tree && !this.hub.world.deadTree.alive;
    const behind = y <= -330;
    this.reset();
    this.done.behind = behind;
    this.done.tree = tree || y <= -520;
    if (stitched) {
      this.done.stitch = true;
      this.done.teaser = true;
      this.gl = [];
    }
  }

  complete() {
    this.done = { behind: true, tree: true, stitch: true, teaser: true, cp: true };
    this.gl = [];
    this.stitchT = -1;
    this.hub.world.deadTree.alive = false;
    this.hub.features.cyan = true;
  }

  collide() {
    const pl = this.hub.player;
    const t = this.hub.world.deadTree;
    if (t.alive) {
      const dx = pl.x - t.x;
      const dy = pl.y - t.y;
      const d = Math.hypot(dx, dy);
      if (d < 9 && d > 0.001) {
        pl.x = t.x + (dx / d) * 9;
        pl.y = t.y + (dy / d) * 9;
      }
    }
  }

  update(dt: number) {
    const { hub } = this;
    const pl = hub.player;
    const t = hub.world.deadTree;

    // X's first slam comes from behind: keep moving
    if (!this.done.behind && pl.y <= -330) {
      this.done.behind = true;
      hub.spawnSlam(pl.x, pl.y + 42, 38, 1.7);
    }
    // a slam smashes a dead tree ahead: slams destroy what they land on
    if (!this.done.tree && pl.y <= -520) {
      this.done.tree = true;
      if (t.alive) hub.spawnSlam(t.x, t.y, 46, 1.5, true);
    }
    if (!this.done.cp && pl.y <= -610) {
      this.done.cp = true;
      hub.checkpoint(-612);
    }

    // X pulls the swarm into his shadow, then grazes you with a claw
    if (!this.done.stitch && pl.y <= -742) {
      this.done.stitch = true;
      this.stitchT = 0;
      this.stitchC = { x: trailCx(pl.y + 72), y: pl.y + 72 };
      hub.audio.whoosh();
      hub.shake(5);
    }
    if (this.stitchT >= 0) {
      this.stitchT += dt;
      for (const g of this.gl) {
        const dx = this.stitchC.x - g.x;
        const dy = this.stitchC.y - g.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 40 + this.stitchT * 90;
        g.x += (dx / d) * sp * dt;
        g.y += (dy / d) * sp * dt;
        if (this.stitchT > 0.5) g.fade = clamp(1 - (this.stitchT - 0.5) / 1.6, 0, 1);
      }
      if (this.stitchT > 2.4 && this.gl.length) {
        this.gl = [];
        hub.features.cyan = true;
      }
      if (!this.done.teaser && this.stitchT >= 1.6) {
        this.done.teaser = true;
        hub.teaser();
      }
      if (this.stitchT > 3.2) this.stitchT = -2;
      return;
    }
    if (this.done.stitch) return;

    // --- the swarm
    const lit = !!inPatch(pl.x, pl.y);
    const sp = Math.hypot(pl.vx, pl.vy);
    let awakeNear = 0;
    const speed = (38 + Math.min(10, this.gl.length * 0.4)) * D.speed;
    for (const g of this.gl) {
      const d = dist(g.x, g.y, pl.x, pl.y);
      if (!g.awake && d < 62) g.awake = true;
      if (!g.awake) continue;
      if (d < 170) awakeNear++;
      const dx = pl.x - g.x;
      const dy = pl.y - g.y;
      const l = d || 1;
      const wob = Math.sin(hub.time * 5 + g.seed * 3) * 0.5;
      g.vx += ((dx / l + (-dy / l) * wob) * speed - g.vx) * (1 - Math.exp(-6 * dt));
      g.vy += ((dy / l + (dx / l) * wob) * speed - g.vy) * (1 - Math.exp(-6 * dt));
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      // light keeps them out
      const pt = inPatch(g.x, g.y, 1.04);
      if (pt) {
        const nx = (g.x - pt.x) / pt.rx;
        const ny = (g.y - pt.y) / pt.ry;
        const nl = Math.hypot(nx, ny) || 1;
        g.x = pt.x + (nx / nl) * pt.rx * 1.06;
        g.y = pt.y + (ny / nl) * pt.ry * 1.06;
      }
      const cx = trailCx(g.y);
      const hw = moveHw(g.y);
      g.x = clamp(g.x, cx - hw + 3, cx + hw - 3);
      if (!lit && d < 6 && pl.dead <= 0) hub.killPlayer();
    }
    // separation so they read as a crawling mass
    for (let i = 0; i < this.gl.length; i++) {
      const a = this.gl[i]!;
      if (!a.awake) continue;
      for (let j = i + 1; j < this.gl.length; j++) {
        const b = this.gl[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 4 && d > 0.01) {
          const push = (4 - d) * 0.5;
          a.x += (dx / d) * push;
          a.y += (dy / d) * push;
          b.x -= (dx / d) * push;
          b.y -= (dy / d) * push;
        }
      }
    }
    // standing still in the dark makes them multiply
    if (!lit && sp < 8 && awakeNear > 0) this.idleT += dt;
    else this.idleT = Math.max(0, this.idleT - dt * 2);
    if (this.idleT > 0.8 && this.gl.length < CAP) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 0.42;
        const src = this.gl.filter((g) => g.awake)[Math.floor(Math.random() * Math.max(1, this.gl.filter((g) => g.awake).length))];
        if (src) {
          this.gl.push({ x: src.x + (Math.random() - 0.5) * 6, y: src.y + (Math.random() - 0.5) * 6, awake: true, seed: Math.random() * 6, fade: 1, vx: 0, vy: 0 });
          hub.audio.chirp(2.2);
          burst(hub.parts, src.x, src.y - 3, 4, ['#6ff0ff', C.ink], 18, 0.3, 30);
        }
      }
    }
  }

  push(list: Drawable[], cam: number) {
    const { p } = this.hub;
    const t = this.hub.time;
    for (const g of this.gl) {
      const sy = g.y - cam;
      if (sy < -10 || sy > H + 10) continue;
      list.push({ y: g.y, fn: () => drawGloom(p, g.x, sy, t, g.seed, g.fade) });
    }
  }

  overlay(cam: number) {
    if (this.stitchT < 0) return;
    const u = clamp(this.stitchT / 1.2, 0, 1);
    const out = clamp(1 - (this.stitchT - 2.4) / 0.8, 0, 1);
    this.hub.p.alpha(out);
    this.hub.drawShadow(this.stitchC.x, this.stitchC.y - cam, 70, u);
    this.hub.p.alpha(1);
  }
}
