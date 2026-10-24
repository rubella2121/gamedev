import { clamp, TAU } from '../core/util';
import type { Arena } from './arena';
import type { FourthBoss } from './bosses/fourth';
import { animateParent, type ParentRig } from './family';
import type { Danger } from './fight';
import { WORLD_R as FOLD_R } from './fourth-world';

/**
 * Mother and Father, fighting beside you in the Fold.
 *
 * They keep near you (Mother on your left, Father on your right, a step behind), and step out of whatever is about to hurt (they
 * read the same warnings you do). When the Fourth's eye comes down they run to it and strike it: Mother quick and light, Father
 * slow and heavy; and Father, if he gets there first, holds it down a moment longer. Once in each phase, when you are hurt, Mother
 * gives you a heart back. They cannot die: a blow knocks them back and dazes them for a moment, that is all.
 */

const SPEED = 6.4;
/** each: how often they strike, how hard (in the boss's pips) */
const STRIKE = [
  { every: 1.1, dmg: 0.35 },
  { every: 1.6, dmg: 0.6 },
];
const DAZE = 1.3;

interface Ally {
  rig: ParentRig;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  dazed: number;
  cd: number;
  hop: number;
  seed: number;
}

export interface AllyHost {
  arena: Arena;
  time: number;
  player: { x: number; z: number; dead: boolean };
  boss: FourthBoss;
  hearts: number;
  maxHearts: number;
  /** give the player a heart back (Mother) */
  heal(): void;
  /** a line for a parent to say */
  say(who: 'Mother' | 'Father', text: string): void;
}

export class Allies {
  readonly list: Ally[];
  private healed = false;
  private hurtAt = -1;
  private lastHearts = 0;
  private phase = -1;
  private said = new Set<string>();

  constructor(mother: ParentRig, father: ParentRig) {
    this.list = [mother, father].map((rig, i) => ({ rig, x: 0, z: 0, vx: 0, vz: 0, yaw: Math.PI, dazed: 0, cd: 0.5 + i * 0.4, hop: 0, seed: i ? 2.7 : 1 }));
  }

  /** stand them at these places, facing the way they will fight */
  place(m: { x: number; z: number }, f: { x: number; z: number }) {
    [m, f].forEach((p, i) => {
      const a = this.list[i]!;
      a.x = p.x;
      a.z = p.z;
      a.vx = a.vz = 0;
      a.dazed = 0;
      a.rig.g.position.set(p.x, 0, p.z);
      a.rig.g.rotation.set(0, Math.PI, 0);
      a.rig.g.visible = true;
    });
    this.healed = false;
    this.phase = -1;
  }

  positions(): { x: number; z: number }[] {
    return this.list.map((a) => ({ x: a.x, z: a.z }));
  }

  /** a blow knocks a parent back from (fx, fz) and dazes them */
  knock(i: number, fx: number, fz: number, arena: Arena) {
    const a = this.list[i];
    if (!a || a.dazed > 0) return;
    const dx = a.x - fx;
    const dz = a.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    a.vx = (dx / d) * 9;
    a.vz = (dz / d) * 9;
    a.dazed = DAZE;
    arena.burst3(a.x, 1.2, a.z, 10, i ? [0xffcf5a, 0xffffff] : [0xff9ac8, 0xffffff], 5);
  }

  update(dt: number, h: AllyHost) {
    const b = h.boss;
    const pl = h.player;
    // a new phase: Mother can help again
    if (b.phase !== this.phase) {
      this.phase = b.phase;
      this.healed = false;
    }
    // you were hurt just now
    if (h.hearts < this.lastHearts) this.hurtAt = h.time;
    this.lastHearts = h.hearts;
    const dangers = b.dangers();
    const weak = b.weak()[0];
    // which way is "away from it": your back, as you face it
    const ax = pl.x - b.x;
    const az = pl.z - b.z;
    const al = Math.hypot(ax, az) || 1;
    const bx = ax / al;
    const bz = az / al;
    this.list.forEach((a, i) => {
      const side = i === 0 ? -1 : 1;
      a.cd -= dt;
      a.hop = Math.max(0, a.hop - dt * 4);
      if (a.dazed > 0) {
        // knocked back: it slides, then shakes it off
        a.dazed -= dt;
        a.x += a.vx * dt;
        a.z += a.vz * dt;
        a.vx *= Math.exp(-6 * dt);
        a.vz *= Math.exp(-6 * dt);
      } else {
        let gx: number;
        let gz: number;
        if (weak) {
          // the eye is down: to it, each from their own side of you
          const wx = pl.x - weak.x;
          const wz = pl.z - weak.z;
          const wl = Math.hypot(wx, wz) || 1;
          const ang = Math.atan2(wx / wl, wz / wl) + side * 0.9;
          gx = weak.x + Math.sin(ang) * 1.8;
          gz = weak.z + Math.cos(ang) * 1.8;
        } else {
          // beside you, a step behind
          gx = pl.x + -bz * side * 2.2 + bx * 1.0;
          gz = pl.z + bx * side * 2.2 + bz * 1.0;
        }
        // which way to go: toward the goal, out of whatever is about to hurt
        let best = { dx: 0, dz: 0, c: 1e9 };
        for (let k = -1; k < 12; k++) {
          const dx = k < 0 ? 0 : Math.sin((k / 12) * TAU);
          const dz = k < 0 ? 0 : Math.cos((k / 12) * TAU);
          const nx = a.x + dx * SPEED * 0.35;
          const nz = a.z + dz * SPEED * 0.35;
          let c = Math.hypot(gx - nx, gz - nz);
          if (Math.hypot(nx, nz) > FOLD_R - 0.8) c += 20;
          for (const d of dangers) for (const t of [0.15, 0.35, 0.6]) if (hits(d, a.x + dx * SPEED * t, a.z + dz * SPEED * t, t)) c += t < 0.4 ? 30 : 12;
          if (k < 0) c += 0.4;
          if (c < best.c) best = { dx, dz, c };
        }
        const far = Math.hypot(gx - a.x, gz - a.z);
        const sp = far < 0.4 && best.dx === 0 ? 0 : SPEED * clamp(far / 1.2, 0.35, 1);
        a.vx += (best.dx * sp - a.vx) * (1 - Math.exp(-10 * dt));
        a.vz += (best.dz * sp - a.vz) * (1 - Math.exp(-10 * dt));
        a.x += a.vx * dt;
        a.z += a.vz * dt;
        // at the eye: strike it
        if (weak && Math.hypot(a.x - weak.x, a.z - weak.z) < 2.4 && a.cd <= 0) {
          a.cd = STRIKE[i]!.every;
          a.hop = 1;
          if (b.allyHit(STRIKE[i]!.dmg)) {
            h.arena.burst3(weak.x, 1.4, weak.z, 8, i ? [0xffcf5a, 0xfff1a6] : [0xff9ac8, 0xffe0ea], 6);
          }
          // Father holds it down a moment longer (once each time it opens)
          if (i === 1 && b.holdOpen() && !this.said.has('hold')) {
            this.said.add('hold');
            h.say('Father', 'I have it! Now!');
          }
        }
        // Mother gives you a heart back, once in each phase
        if (i === 0 && !this.healed && !pl.dead && h.hearts < h.maxHearts && this.hurtAt > 0 && h.time - this.hurtAt > 1.0 && Math.hypot(a.x - pl.x, a.z - pl.z) < 8) {
          this.healed = true;
          h.heal();
          h.arena.burst3(a.x, 1.6, a.z, 14, [0xff9ac8, 0xffffff], 5);
          h.arena.burst3(pl.x, 1.2, pl.z, 18, [0xff9ac8, 0xffe0ea, 0xffffff], 6);
          if (!this.said.has('heal')) {
            this.said.add('heal');
            h.say('Mother', "I've got you.");
          }
        }
      }
      // never through you, never through each other, never off the edge
      for (const o of [pl, ...this.list.filter((q) => q !== a)]) {
        const dx = a.x - o.x;
        const dz = a.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.3 && d > 1e-4) {
          a.x = o.x + (dx / d) * 1.3;
          a.z = o.z + (dz / d) * 1.3;
        }
      }
      const r = Math.hypot(a.x, a.z);
      if (r > FOLD_R - 0.6) {
        a.x *= (FOLD_R - 0.6) / r;
        a.z *= (FOLD_R - 0.6) / r;
      }
      // face where they go; at the eye, face it
      const sp = Math.hypot(a.vx, a.vz);
      const want = weak && Math.hypot(a.x - weak.x, a.z - weak.z) < 3 ? Math.atan2(weak.x - a.x, weak.z - a.z) : sp > 0.5 ? Math.atan2(a.vx, a.vz) : Math.atan2(b.x - a.x, b.z - a.z);
      let dy = want - a.yaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      a.yaw += dy * (1 - Math.exp(-10 * dt));
      a.rig.g.position.set(a.x, 0, a.z);
      a.rig.g.rotation.set(0, a.yaw, a.dazed > 0 ? Math.sin(h.time * 30) * 0.15 : 0);
      animateParent(a.rig, dt, h.time, a.dazed > 0 ? 0 : clamp(sp / SPEED, 0, 1), a.hop * 0.6, a.hop, a.seed);
    });
  }
}

/** would this danger hurt at (x, z), `t` seconds from now (as the test bots ask) */
function hits(d: Danger, x: number, z: number, t: number): boolean {
  if (t < d.at - 0.05 || t > d.at + d.dur + 0.12) return false;
  if (d.shape === 'disc') return Math.hypot(x - d.x, z - d.z) < (d.r ?? 1) + 0.6;
  if (d.shape === 'ring') {
    const r = Math.hypot(x - d.x, z - d.z);
    return r > (d.r ?? 1) - (d.w ?? 1) - 0.4 && r < (d.r ?? 1) + 0.4;
  }
  const dx = Math.sin(d.ang ?? 0);
  const dz = Math.cos(d.ang ?? 0);
  const rx = x - d.x;
  const rz = z - d.z;
  const along = rx * dx + rz * dz;
  const perp = Math.abs(rx * dz - rz * dx);
  if (d.shape === 'cone') return along > 0 && along < (d.len ?? 1) && perp < (d.half ?? 1) + 0.6;
  return Math.abs(along) <= (d.len ?? 1) / 2 && perp < (d.half ?? 1) + 0.6;
}

