import { burst } from '../core/art';
import { drawSkitter } from '../core/art2';
import { C } from '../core/palette';
import { H } from '../core/pix';
import { dist, easeOutCubic, hash2, lerp } from '../core/util';
import type { Drawable, Encounter, Hub } from './hub';
import { SEC, moveHw, trailCx } from './layout';

type SState = 'run' | 'tele' | 'air' | 'rest';

interface Skit {
  row: number;
  base: number;
  amp: number;
  x: number;
  y: number;
  ry: number;
  seed: number;
  st: SState;
  t: number;
  cool: number;
  tx: number;
  ty: number;
  fx: number;
  fy: number;
}

const ROWS = [-2150, -2300, -2450];

/** Encounter 4: a pack of Skitterbones pounces and herds you while X's slams smash the trail behind you. */
export class BonesEncounter implements Encounter {
  readonly id = 'bones';
  readonly y0 = SEC.bones[0];
  readonly y1 = SEC.bones[1];
  private sk: Skit[] = [];
  private chase = 3;
  private cp = [false, false, false];
  private done = false;

  constructor(private hub: Hub) {
    this.reset();
  }

  reset() {
    this.sk = [];
    ROWS.forEach((ry, row) => {
      for (let k = 0; k < 3; k++) {
        const base = (k - 1) * 36;
        this.sk.push({ row, base, amp: 13 + hash2(row, k) * 6, x: trailCx(ry) + base, y: ry, ry, seed: row * 3 + k, st: 'run', t: 0, cool: 1 + hash2(k, row) * 1.4, tx: 0, ty: 0, fx: 0, fy: 0 });
      }
    });
    this.chase = 3;
    this.cp = [false, false, false];
    this.done = false;
  }

  onRespawn() {
    this.chase = 3;
    this.sk.forEach((s) => {
      s.st = 'run';
      s.cool = 1.5;
    });
  }

  complete() {
    this.done = true;
    this.hub.features.limbs = true;
  }

  update(dt: number) {
    const { hub } = this;
    const pl = hub.player;
    const t = hub.time;
    for (const s of this.sk) {
      s.t += dt;
      s.cool = Math.max(0, s.cool - dt);
      const home = () => {
        const w = moveHw(s.ry) - 8;
        s.x = Math.max(trailCx(s.ry) - w, Math.min(trailCx(s.ry) + w, trailCx(s.ry) + s.base + Math.sin(t * 0.9 + s.seed * 2.1) * s.amp));
      };
      if (s.st === 'run') {
        const nx = trailCx(s.ry) + s.base + Math.sin(t * 0.9 + s.seed * 2.1) * s.amp;
        s.x += (nx - s.x) * (1 - Math.exp(-5 * dt));
        s.y += (s.ry - s.y) * (1 - Math.exp(-5 * dt));
        // pounce when the player comes close from the south
        if (s.cool <= 0 && pl.y > s.y - 8 && pl.y < s.y + 86 && Math.abs(pl.x - s.x) < 70 && pl.dead <= 0) {
          s.st = 'tele';
          s.t = 0;
          s.tx = pl.x + pl.vx * 0.2;
          s.ty = pl.y + pl.vy * 0.2;
          hub.audio.creak();
        }
      } else if (s.st === 'tele') {
        if (s.t >= 0.85) {
          s.st = 'air';
          s.t = 0;
          s.fx = s.x;
          s.fy = s.y;
          hub.audio.whoosh();
        }
      } else if (s.st === 'air') {
        const u = Math.min(1, s.t / 0.34);
        s.x = lerp(s.fx, s.tx, easeOutCubic(u));
        s.y = lerp(s.fy, s.ty, easeOutCubic(u));
        if (u >= 1) {
          s.st = 'rest';
          s.t = 0;
          hub.audio.snap();
          burst(hub.parts, s.x, s.y - 2, 8, [C.bone, C.boneShade, C.soil], 40, 0.4);
          if (dist(pl.x, pl.y, s.tx, s.ty) < 9 && pl.dead <= 0) hub.killPlayer();
        }
      } else {
        if (s.t >= 1.3) {
          s.st = 'run';
          s.cool = 2.2;
        }
      }
      if (s.st === 'run') home();
      // touching one is fatal
      if (s.st !== 'air' && dist(pl.x, pl.y, s.x, s.y) < 7 && pl.dead <= 0) hub.killPlayer();
    }
    // X's slams smash the trail behind you, herding you forward
    if (pl.y < SEC.bones[0] - 30 && pl.y > SEC.bones[1] + 30 && pl.dead <= 0) {
      this.chase -= dt;
      if (this.chase <= 0 && hub.slams.length < 2) {
        this.chase = 2.7;
        hub.spawnSlam(trailCx(pl.y + 80) + (hash2(Math.floor(t), 5) - 0.5) * 30, pl.y + 78, 40, 1.25);
      }
    }
    ROWS.forEach((y, i) => {
      if (!this.cp[i] && pl.y < y - 50) {
        this.cp[i] = true;
        hub.checkpoint(y - 58);
      }
    });
    if (!this.done && pl.y < SEC.bones[1] + 10) {
      this.done = true;
      hub.features.limbs = true;
    }
  }

  ground(cam: number) {
    const { p } = this.hub;
    const t = this.hub.time;
    for (const s of this.sk) {
      if (s.st !== 'tele') continue;
      const sy = s.ty - cam;
      const blink = Math.floor(t * 12) % 2 === 0;
      const col = blink ? C.redGlow : C.red;
      // three red claw scratches where it will land
      for (let i = -1; i <= 1; i++) {
        p.line(s.tx + i * 5 - 4, sy - 7, s.tx + i * 5 + 4, sy + 7, col, 1);
      }
      p.ring(s.tx, sy, 11, 8, 1, C.redDark);
    }
  }

  push(list: Drawable[], cam: number) {
    const { p } = this.hub;
    const t = this.hub.time;
    for (const s of this.sk) {
      const sy = s.y - cam;
      if (sy < -20 || sy > H + 20) continue;
      list.push({ y: s.y, fn: () => drawSkitter(p, s.x, sy, t, s.seed, s.st) });
    }
  }
}
