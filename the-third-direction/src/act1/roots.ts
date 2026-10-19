import { burst, drawRootmaw, type MawState } from '../core/art';
import { C } from '../core/palette';
import { H } from '../core/pix';
import { dist } from '../core/util';
import type { Drawable, Encounter, Hub, SlamLike } from './hub';
import { SEC, WALL_YS, trailCx } from './layout';

interface Maw {
  x: number;
  y: number;
  wall: number;
  alive: boolean;
  phase: number;
  st: MawState;
  prev: MawState;
  seed: number;
  lunge: number;
}

/** Encounter 2: living thorn walls. Bait X's slam to smash them. */
export class RootsEncounter implements Encounter {
  readonly id = 'roots';
  readonly y0 = SEC.roots[0];
  readonly y1 = SEC.roots[1];
  maws: Maw[] = [];
  private nextSlam = 2;
  private slamCool = 0;
  private cp = [false, false];

  constructor(private hub: Hub) {
    for (const wy of WALL_YS) {
      for (let k = -3; k <= 3; k++) {
        this.maws.push({
          x: trailCx(wy) + k * 18,
          y: wy + (Math.abs(k) % 2) * 3,
          wall: WALL_YS.indexOf(wy),
          alive: true,
          phase: Math.abs(k) * 0.37,
          st: 'idle',
          prev: 'idle',
          seed: k * 7 + wy,
          lunge: 0,
        });
      }
    }
  }

  reset() {
    for (const m of this.maws) m.alive = true;
    this.nextSlam = 2;
    this.slamCool = 0;
    this.cp = [false, false];
  }

  onRespawn() {
    this.nextSlam = 2;
    this.slamCool = 0;
  }

  complete() {
    for (const m of this.maws) m.alive = false;
    this.hub.features.teeth = true;
  }

  collide() {
    const pl = this.hub.player;
    for (const m of this.maws) {
      if (!m.alive) continue;
      const dx = pl.x - m.x;
      const dy = pl.y - (m.y - 2);
      const d = Math.hypot(dx, dy);
      const min = 12.5;
      if (d < min && d > 0.001) {
        pl.x = m.x + (dx / d) * min;
        pl.y = m.y - 2 + (dy / d) * min;
      }
    }
  }

  onImpact(s: SlamLike) {
    const { hub } = this;
    for (const m of this.maws) {
      if (m.alive && hub.inEllipse(m.x, m.y - 2, s, 1.12)) {
        m.alive = false;
        burst(hub.parts, m.x, m.y - 6, 14, [C.root, C.rootLight, C.bone, C.rootMouth], 70, 1);
        hub.audio.squish();
        if (m.wall === 0) hub.features.teeth = true;
      }
    }
  }

  update(dt: number) {
    const { hub } = this;
    const pl = hub.player;
    const audio = hub.audio;
    let nearWall = false;
    for (const m of this.maws) {
      if (!m.alive) continue;
      const aggro = dist(pl.x, pl.y, m.x, m.y) < 76;
      if (!(pl.y < m.y - 4 || pl.y - m.y > 130)) nearWall = true;
      m.prev = m.st;
      const c = aggro ? (hub.time + m.phase) % 2.6 : 0;
      m.st = !aggro ? 'idle' : c < 0.9 ? 'idle' : c < 1.4 ? 'rumble' : c < 2.1 ? 'open' : c < 2.3 ? 'snap' : 'idle';
      m.lunge = m.st === 'snap' ? 1 : 0;
      if (m.st !== m.prev) {
        if (m.st === 'rumble') audio.rumble();
        else if (m.st === 'open') audio.creak();
        else if (m.st === 'snap') audio.snap();
      }
      if (m.st === 'snap' && Math.abs(pl.x - m.x) < 11 && pl.y > m.y && pl.y < m.y + 19 && pl.dead <= 0) hub.killPlayer();
    }
    // checkpoints after each wall
    WALL_YS.forEach((wy, i) => {
      if (!this.cp[i] && pl.y < wy - 40) {
        this.cp[i] = true;
        hub.checkpoint(wy - 48);
      }
    });
    const busy = hub.slams.length > 0;
    if (nearWall && !busy) {
      this.slamCool -= dt;
      this.nextSlam -= dt;
      if (this.nextSlam <= 0 && this.slamCool <= 0) {
        hub.spawnSlam(pl.x, pl.y, 46, 1.5);
        this.nextSlam = 1.0;
      }
    } else if (busy) {
      this.slamCool = 0.6;
    }
  }

  push(list: Drawable[], cam: number) {
    const { p } = this.hub;
    const t = this.hub.time;
    for (const m of this.maws) {
      if (!m.alive) continue;
      const sy = m.y - cam;
      if (sy < -30 || sy > H + 30) continue;
      list.push({ y: m.y, fn: () => drawRootmaw(p, m.x, sy + (m.lunge ? 5 : 0), m.st, t, m.seed) });
    }
  }
}
