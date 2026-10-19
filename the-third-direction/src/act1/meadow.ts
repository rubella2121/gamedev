import { D } from '../core/difficulty';
import { burst } from '../core/art';
import { drawMimic, drawMoth, drawRootCage, type MimicState } from '../core/art2';
import { makeFlower } from '../core/art';
import { C } from '../core/palette';
import { H } from '../core/pix';
import { clamp, dist, hash2, smooth } from '../core/util';
import type { Drawable, Encounter, Hub } from './hub';
import { CLIFF_Y, SEC, moveHw, trailCx } from './layout';

interface Mimic {
  x: number;
  y: number;
  st: MimicState;
  t: number;
  seed: number;
  /** Phase offset for flowers that snap on their own rhythm (the second field). */
  auto?: number;
}

const CAGE_Y = -2700;
const HOLD_TIME = 1.4;
/** North of this line the flowers stop waiting for you and snap in a rolling wave. */
const FIELD2_Y = -2930;

/** Encounter 5: free the Mournmoth, then weave between flowers that bite. */
export class MeadowEncounter implements Encounter {
  readonly id = 'meadow';
  readonly y0 = SEC.meadow[0];
  readonly y1 = SEC.meadow[1];
  private mimics: Mimic[] = [];
  private flower = makeFlower(true);
  private hold = 0;
  private freed = false;
  private dustT = 0;
  private cp = false;

  constructor(private hub: Hub) {
    let row = 0;
    for (let y = CAGE_Y - 80; y > FIELD2_Y; y -= 30) {
      // every row keeps a clear lane that wanders, so the way through always exists
      const safe = trailCx(y) + 30 * Math.sin(row * 0.9);
      const hw = moveHw(y) - 10;
      const n = 1 + Math.floor(hash2(row, 3) * 3);
      for (let k = 0; k < n; k++) {
        const side = hash2(row, k + 10) > 0.5 ? 1 : -1;
        const x = safe + side * (20 + hash2(row, k + 20) * 34);
        if (Math.abs(x - trailCx(y)) < hw) this.mimics.push({ x, y: y + (hash2(row, k) - 0.5) * 12, st: 'idle', t: 0, seed: row * 4 + k });
      }
      row++;
    }
    // second field: a gently swaying safe lane, and the flowers snap on their own rhythm in a wave rolling north
    for (let y = FIELD2_Y; y > CLIFF_Y + 110; y -= 26) {
      const cx = trailCx(y);
      const safe = cx + 24 * Math.sin(row * 0.75);
      const hw = moveHw(y) - 10;
      for (const off of [-52, -28, 28, 52]) {
        const x = safe + off;
        if (Math.abs(x - cx) < hw) this.mimics.push({ x, y: y + (hash2(row, off) - 0.5) * 8, st: 'idle', t: 0, seed: row * 4 + off, auto: row * 0.27 });
      }
      row++;
    }
  }

  reset() {
    this.hold = 0;
    this.freed = false;
    this.hub.moth.has = false;
    this.cp = false;
    this.mimics.forEach((m) => {
      m.st = 'idle';
      m.t = 0;
    });
  }

  complete() {
    this.freed = true;
    this.hub.moth.has = true;
    this.cp = true;
  }

  onRespawn() {
    // dying before the cage checkpoint puts the moth back in its cage
    if (this.hub.player.y > CAGE_Y + 10) {
      this.freed = false;
      this.hub.moth.has = false;
    }
    this.hold = 0;
    this.mimics.forEach((m) => {
      m.st = 'idle';
      m.t = 0;
    });
  }

  /** Called by the game when warping past this encounter. */
  skipFreed() {
    this.freed = true;
    this.hub.moth.has = true;
  }

  update(dt: number) {
    const { hub } = this;
    const pl = hub.player;
    const moth = hub.moth;
    const t = hub.time;
    const cageX = trailCx(CAGE_Y);

    // --- the trapped Mournmoth
    if (!this.freed) {
      const near = dist(pl.x, pl.y, cageX, CAGE_Y) < 34 && pl.dead <= 0;
      if (near) {
        hub.input.setAction('hold');
        hub.ui.hint('hold to free it');
        if (hub.input.actionDown) this.hold = Math.min(HOLD_TIME, this.hold + dt);
        else this.hold = Math.max(0, this.hold - dt * 1.5);
        if (this.hold >= HOLD_TIME) {
          this.freed = true;
          moth.has = true;
          moth.x = cageX;
          moth.y = CAGE_Y - 14;
          hub.input.setAction(null);
          hub.ui.hint(null);
          hub.audio.warm();
          hub.shake(2);
          burst(hub.parts, cageX, CAGE_Y - 10, 24, [C.moonCore, C.moon, C.root], 50, 1, 40);
          hub.checkpoint(CAGE_Y - 20);
        }
      } else {
        this.hold = Math.max(0, this.hold - dt * 2);
        hub.input.setAction(null);
        hub.ui.hint(null);
      }
    }

    // --- Mimic Blooms
    for (const m of this.mimics) {
      const d = dist(pl.x, pl.y, m.x, m.y);
      if (m.auto !== undefined) {
        const ph = (((t * 0.55 * D.speed + m.auto) % 1) + 1) % 1;
        const was = m.st;
        m.st = ph < 0.55 ? 'idle' : ph < 0.72 ? 'twitch' : 'snap';
        if (m.st === 'snap' && was !== 'snap' && d < 70) hub.audio.snap();
        if (m.st === 'snap' && d < 12 && pl.dead <= 0) hub.killPlayer();
        continue;
      }
      if (m.st === 'idle') {
        if (d < 22 && pl.dead <= 0) {
          m.st = 'twitch';
          m.t = 0;
        }
      } else if (m.st === 'twitch') {
        m.t += dt;
        if (m.t >= 0.4 * D.tele) {
          m.st = 'snap';
          m.t = 0;
          hub.audio.snap();
        }
      } else {
        m.t += dt;
        if (d < 12 && pl.dead <= 0) hub.killPlayer();
        if (m.t >= 0.9) {
          m.st = 'idle';
          m.t = -0.6;
        }
      }
    }
    if (!this.cp && pl.y < SEC.meadow[0] - 60 && this.freed) {
      this.cp = true;
      hub.checkpoint(CAGE_Y - 60);
    }
  }

  push(list: Drawable[], cam: number) {
    const { p, moth } = this.hub;
    const t = this.hub.time;
    const cageX = trailCx(CAGE_Y);
    if (!this.freed) {
      const sy = CAGE_Y - cam;
      list.push({
        y: CAGE_Y,
        fn: () => {
          const u = this.hold / HOLD_TIME;
          drawRootCage(p, cageX, sy, t, u);
          drawMoth(p, cageX, sy - 12, t, 0.8 + 0.2 * Math.sin(t * 5));
          if (u > 0) {
            p.ring(cageX, sy - 12, 14, 12, 1, '#10303a');
            const n = Math.floor(u * 28);
            for (let i = 0; i < n; i++) {
              const a = -Math.PI / 2 + (i / 28) * Math.PI * 2;
              p.rect(cageX + Math.cos(a) * 14 - 0.5, sy - 12 + Math.sin(a) * 12 - 0.5, 2, 2, C.moonCore);
            }
          }
        },
      });
    }
    const revealRange = 58;
    for (const m of this.mimics) {
      const sy = m.y - cam;
      if (sy < -20 || sy > H + 20) continue;
      const revealed = moth.has && dist(moth.x, moth.y, m.x, m.y - 6) < revealRange;
      list.push({
        y: m.y,
        fn: () => {
          p.dither(m.x, sy - 2, 9, 4.5, C.flower, 0.3 * (0.65 + 0.35 * Math.sin(t * 2 + m.seed)));
          drawMimic(p, this.flower, m.x, sy, m.st, t, revealed);
        },
      });
    }
  }

}

void clamp;
void smooth;
