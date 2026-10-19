import { D } from '../core/difficulty';
import { drawBellwether, drawReeds } from '../core/art2';
import { C } from '../core/palette';
import { H } from '../core/pix';
import { clamp, dist, hash2 } from '../core/util';
import type { Drawable, Encounter, Hub } from './hub';
import { SEC, moveHw, trailCx } from './layout';

interface Bell {
  y: number;
  amp: number;
  x: number;
  phase: number;
  seed: number;
  alert: number;
  cool: number;
  ang: number;
  f: number;
}

/** The second half of the marsh has pairs of Bellwethers that sweep apart and together, the last pair faster. */
const ROWS: { y: number; pair?: boolean; f?: number }[] = [
  { y: -1410 },
  { y: -1535 },
  { y: -1660 },
  { y: -1785, pair: true },
  { y: -1910, pair: true, f: 1.35 },
];
const RANGE = 84;
const HALF = 0.46;

/** Encounter 3: the Echo Marsh. Bellwethers only notice movement, so freeze in the reeds. */
export class MarshEncounter implements Encounter {
  readonly id = 'marsh';
  readonly y0 = SEC.marsh[0];
  readonly y1 = SEC.marsh[1];
  private bells: Bell[] = [];
  private hide: { x: number; y: number; seed: number }[] = [];
  private deco: { x: number; y: number; seed: number }[] = [];
  private cp: boolean[] = ROWS.map(() => false);
  private done = false;

  constructor(private hub: Hub) {
    ROWS.forEach((r, i) => {
      for (let k = 0; k < (r.pair ? 2 : 1); k++) {
        this.bells.push({ y: r.y, amp: r.pair ? 46 : 34, x: trailCx(r.y), phase: i * 1.7 + k * Math.PI, seed: i * 2.3 + k, alert: 0, cool: 0, ang: Math.PI / 2, f: r.f ?? 1 });
      }
    });
    ROWS.forEach(({ y }, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      for (let k = 0; k < 3; k++) this.hide.push({ x: trailCx(y + 38) + side * (14 + k * 11) * (k % 2 ? -1 : 1), y: y + 34 + k * 9, seed: i * 10 + k });
    });
    for (let y = SEC.marsh[0]; y > SEC.marsh[1]; y -= 17) {
      const cx = trailCx(y);
      const hw = moveHw(y);
      if (hash2(y, 91) > 0.35) this.deco.push({ x: cx - hw + 4 + hash2(y, 3) * 10, y, seed: y });
      if (hash2(y, 92) > 0.35) this.deco.push({ x: cx + hw - 4 - hash2(y, 4) * 10, y, seed: y + 1 });
    }
  }

  reset() {
    this.cp = ROWS.map(() => false);
    this.done = false;
    this.bells.forEach((b) => {
      b.alert = 0;
      b.cool = 0;
    });
  }

  onRespawn() {
    this.bells.forEach((b) => {
      b.alert = 0;
      b.cool = 1;
    });
  }

  complete() {
    this.done = true;
    this.hub.features.eyes = true;
  }

  private inReeds(): boolean {
    const pl = this.hub.player;
    return this.hide.some((h) => dist(pl.x, pl.y, h.x, h.y) < 10);
  }

  update(dt: number) {
    const { hub } = this;
    const pl = hub.player;
    const t = hub.time;
    const reeds = this.inReeds();
    pl.speedMul = reeds ? 0.55 : 1;
    const sp = Math.hypot(pl.vx, pl.vy);
    for (const b of this.bells) {
      b.x = trailCx(b.y) + Math.sin(t * 0.55 * b.f + b.phase) * b.amp;
      b.ang = Math.PI / 2 + 0.78 * Math.sin(t * 0.72 * b.f + b.phase * 1.3);
      b.alert = Math.max(0, b.alert - dt);
      b.cool = Math.max(0, b.cool - dt);
      const dx = pl.x - b.x;
      const dy = (pl.y - b.y) * 1.35;
      const d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - b.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const inCone = d < RANGE * D.vision && Math.abs(da) < HALF * D.vision;
      const seen = inCone && ((!reeds && sp > 14) || (reeds && sp > 34));
      if (seen && b.cool <= 0 && pl.dead <= 0) {
        b.alert = 1.3;
        b.cool = 3.6;
        hub.audio.bell(1.1);
        hub.ui.red(0.18, 300);
        hub.spawnSlam(pl.x + pl.vx * 0.15, pl.y + pl.vy * 0.15, 38, 1.25);
      }
    }
    ROWS.forEach(({ y }, i) => {
      if (!this.cp[i] && pl.y < y - 60) {
        this.cp[i] = true;
        hub.checkpoint(y - 66);
      }
    });
    if (!this.done && pl.y < SEC.marsh[1] + 10) {
      this.done = true;
      hub.features.eyes = true;
    }
  }

  ground(cam: number) {
    const { p } = this.hub;
    for (const b of this.bells) {
      const sy = b.y - cam;
      if (sy < -90 || sy > H + 90) continue;
      const hot = b.alert > 0;
      p.cone(b.x, sy - 14, b.ang, HALF * D.vision, RANGE * D.vision, hot ? C.red : '#cfc6ff', hot ? 0.22 : 0.12);
    }
  }

  push(list: Drawable[], cam: number) {
    const { p } = this.hub;
    const t = this.hub.time;
    for (const r of this.deco) {
      const sy = r.y - cam;
      if (sy < -30 || sy > H + 30) continue;
      list.push({ y: r.y, fn: () => drawReeds(p, r.x, sy, r.seed, t, 5) });
    }
    for (const r of this.hide) {
      const sy = r.y - cam;
      if (sy < -30 || sy > H + 30) continue;
      list.push({ y: r.y + 3, fn: () => drawReeds(p, r.x, sy, r.seed, t, 9) });
    }
    for (const b of this.bells) {
      const sy = b.y - cam;
      if (sy < -40 || sy > H + 40) continue;
      list.push({
        y: b.y,
        fn: () => drawBellwether(p, b.x, sy, t, Math.cos(b.ang), Math.sin(b.ang), b.alert, b.seed),
      });
    }
  }
}

void clamp;
