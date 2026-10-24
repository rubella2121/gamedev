import { burst } from '../../core/art';
import { drawBellwether, drawReeds } from '../../core/art2';
import { C } from '../../core/palette';
import { D } from '../../core/difficulty';
import { dist, hash2 } from '../../core/util';
import { drawBellTower, drawLily, drawThornGate } from '../art3';
import { arenaDef } from '../land';
import { TollQueen } from '../guardians/tollqueen';
import type { Drawable, Hub, Lance, Nova, Patch, Rect, Zone } from '../types';
import { Gate, onScreen } from './parts';

interface Bell {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  u: number;
  dir: 1 | -1;
  speed: number;
  pause: number;
  x: number;
  y: number;
  ang: number;
  alert: number;
  cool: number;
  stun: number;
  seed: number;
}

const RANGE = 84;
const HALF = 0.46;
const PATCHES: Patch[] = [
  { x: 885, y: 975, rx: 26, ry: 18 },
  { x: 1190, y: 940, rx: 26, ry: 18 },
];
const BELLS = [
  { a: [915, 745], b: [905, 935], speed: 26 },
  { a: [850, 890], b: [995, 890], speed: 24 },
  { a: [1105, 745], b: [1105, 895], speed: 28 },
  { a: [1130, 775], b: [1180, 790], speed: 22 },
];
const REEDS = [
  [880, 840], [935, 815], [960, 860], [900, 930], [965, 935], [990, 805], [1090, 815], [1085, 880], [1140, 905], [1170, 810], [1130, 760], [1195, 880],
];
const LILIES = [
  { x: 885, y: 772 },
  { x: 925, y: 748 },
  { x: 965, y: 758 },
  { x: 990, y: 792 },
];
const TOWER = { x: 1172, y: 862 };
const GATE = { x0: 1022, y0: 815, x1: 1038, y1: 884 };

/**
 * Echo Marsh. Bellwethers only notice movement: freeze in the reeds when one looks your way. If one
 * sees you its bell rings and X's shadow comes for you. A pulse cracks a bell. The reed gate opens on the rhythm of the bells.
 */
export class MarshZone implements Zone {
  readonly id = 'marsh' as const;
  cleared = false;
  private bells: Bell[] = [];
  private gate = new Gate(GATE);
  private lily = { next: 0, lit: [0, 0, 0, 0], done: false, wrong: 0 };
  private rung = 0;
  private t = 0;
  private guardian: TollQueen | null = null;

  constructor(private hub: Hub) {
    for (const pt of PATCHES) hub.land.addPatchFlowers(pt.x, pt.y, pt.rx, pt.ry, Math.floor(pt.x));
  }

  get always() {
    return this.guardian !== null;
  }

  /** The player is in the arena: the Toll Queen descends. */
  onArrive() {
    this.guardian = new TollQueen(this.hub, arenaDef('marsh'), () => this.hub.leaveArena(this, true));
    this.guardian.begin();
  }

  onLance(l: Lance): boolean {
    return this.guardian?.onLance(l) ?? false;
  }

  onNova(n: Nova) {
    this.guardian?.onNova(n);
  }

  lanceTarget() {
    return this.guardian?.lanceTarget() ?? null;
  }

  overlay() {
    this.guardian?.overlay();
  }


  reset() {
    this.cleared = false;
    this.bells = BELLS.map((b, i) => ({ ax: b.a[0]!, ay: b.a[1]!, bx: b.b[0]!, by: b.b[1]!, u: (i * 0.37) % 1, dir: 1, speed: b.speed, pause: 0, x: b.a[0]!, y: b.a[1]!, ang: Math.PI / 2, alert: 0, cool: 0, stun: 0, seed: i * 2.3 }));
    this.bells.forEach((b) => this.place(b));
    this.lily = { next: 0, lit: [0, 0, 0, 0], done: false, wrong: 0 };
    this.gate.open = 0;
    this.t = 0;
    this.guardian = null;
    this.hub.patches.push(...PATCHES);
  }

  onRespawn() {
    if (this.guardian) {
      this.guardian.onPlayerDied();
      return;
    }
    this.bells.forEach((b) => {
      b.alert = 0;
      b.cool = 1.2;
      b.stun = 0;
    });
    if (!this.lily.done) this.lily = { next: 0, lit: [0, 0, 0, 0], done: false, wrong: 0 };
  }

  objective(): string | null {
    if (this.cleared || this.guardian) return null;
    return 'reach the bell tower · freeze in the reeds when a bell looks at you · the gate opens as the bell rings';
  }

  complete() {
    this.guardian = null;
    this.cleared = true;
    this.bells = [];
    this.lily.done = true;
    this.gate.open = 1;
  }

  colliders(): Rect[] {
    if (this.guardian) return this.guardian.colliders();
    return this.gate.solid() && !this.cleared ? [GATE] : [];
  }

  secretSpot() {
    return this.lily.done ? null : LILIES[Math.min(this.lily.next, LILIES.length - 1)]!;
  }

  debugPoints() {
    return [
      ...BELLS.map((b, i) => ({ x: b.a[0]!, y: b.a[1]!, name: `bell${i}a` })),
      ...BELLS.map((b, i) => ({ x: b.b[0]!, y: b.b[1]!, name: `bell${i}b` })),
      ...REEDS.map((r, i) => ({ x: r[0]!, y: r[1]!, name: `reed${i}` })),
      ...LILIES.map((r, i) => ({ ...r, name: `lily${i}` })),
      { x: TOWER.x, y: TOWER.y, name: 'tower' },
    ];
  }

  private place(b: Bell) {
    b.x = b.ax + (b.bx - b.ax) * b.u;
    b.y = b.ay + (b.by - b.ay) * b.u;
  }

  private inReeds(): boolean {
    const pl = this.hub.player;
    return REEDS.some((r) => dist(pl.x, pl.y, r[0]!, r[1]!) < 11);
  }

  onPulse(px: number, py: number, R: number) {
    const hub = this.hub;
    if (this.guardian) {
      this.guardian.onPulse(px, py, R);
      return;
    }
    for (const b of this.bells) {
      if (dist(px, py, b.x, b.y - 14) <= R + 6) {
        b.stun = 4.5;
        b.alert = 0;
        hub.audio.pop();
        burst(hub.parts, b.x, b.y - 16, 10, ['#d8b45a', '#ece8ff', '#6a5aa8'], 40, 1);
      }
    }
    // the lily song: each pulse reaches only the nearest lily
    if (!this.lily.done) {
      let best = -1;
      let bd = R + 8;
      LILIES.forEach((l, i) => {
        const d = dist(px, py, l.x, l.y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0 && this.lily.lit[best]! <= 0) {
        if (best === this.lily.next) {
          this.lily.lit[best] = 1;
          this.lily.next++;
          hub.audio.blip(0.8 + best * 0.18);
          if (this.lily.next >= LILIES.length) {
            this.lily.done = true;
            hub.audio.unlock();
            hub.secret(LILIES[1]!.x + 20, LILIES[1]!.y + 10);
          }
        } else {
          // wrong note: the song starts over
          this.lily.lit = [0, 0, 0, 0];
          this.lily.next = 0;
          this.lily.wrong = 0.5;
          hub.audio.death();
        }
      }
    }
  }

  update(dt: number) {
    if (this.guardian) {
      if (!this.hub.arena && this.guardian.state === 'gone') this.guardian = null;
      else {
        this.guardian.update(dt);
        return;
      }
    }
    const hub = this.hub;
    const pl = hub.player;
    this.t += dt;
    this.lily.wrong = Math.max(0, this.lily.wrong - dt);
    this.rung = Math.max(0, this.rung - dt * 1.5);

    // --- the reed gate follows the bell rhythm
    const cyc = 4.6;
    const openLen = 2.3 * D.window;
    const ph = this.t % cyc;
    const wantOpen = this.cleared || ph < openLen;
    const inside = pl.x > GATE.x0 - 12 && pl.x < GATE.x1 + 12 && pl.y > GATE.y0 - 6 && pl.y < GATE.y1 + 6;
    const target = wantOpen || inside ? 1 : 0;
    this.gate.open += (target - this.gate.open) * (1 - Math.exp(-9 * dt));
    if (Math.floor((this.t - dt) / cyc) !== Math.floor(this.t / cyc) || (ph < dt && this.t > dt)) hub.audio.bell(0.55);

    const reeds = this.inReeds();
    pl.speedMul = reeds ? 0.55 : 1;
    const sp = Math.hypot(pl.vx, pl.vy);

    if (this.cleared) return;

    // --- the tower
    if (dist(pl.x, pl.y, TOWER.x, TOWER.y) < 20 && pl.dead <= 0) {
      this.rung = 1;
      hub.audio.bell(0.9);
      hub.enterArena(this);
    }

    // --- Bellwethers
    for (const b of this.bells) {
      b.alert = Math.max(0, b.alert - dt);
      b.cool = Math.max(0, b.cool - dt);
      if (b.stun > 0) {
        b.stun -= dt;
        continue;
      }
      if (b.pause > 0) {
        b.pause -= dt;
        // look around while waiting at the end of the route
        b.ang += Math.sin(this.t * 2.4 + b.seed) * dt * 1.6;
      } else {
        const len = Math.hypot(b.bx - b.ax, b.by - b.ay) || 1;
        b.u += (b.dir * b.speed * dt) / len;
        if (b.u >= 1 || b.u <= 0) {
          b.u = b.u >= 1 ? 1 : 0;
          b.dir = (b.dir * -1) as 1 | -1;
          b.pause = 1.4;
        }
        this.place(b);
        const mvx = (b.bx - b.ax) * b.dir;
        const mvy = (b.by - b.ay) * b.dir;
        const target = Math.atan2(mvy, mvx);
        let da = target - b.ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        b.ang += da * (1 - Math.exp(-5 * dt));
        b.ang += Math.sin(this.t * 1.3 + b.seed) * dt * 0.5;
      }
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
  }

  ground() {
    if (this.guardian) {
      this.guardian.ground();
      return;
    }
    const hub = this.hub;
    const p = hub.p;
    for (const b of this.bells) {
      const sx = b.x - hub.camX;
      const sy = b.y - hub.camY;
      if (sy < -90 || sy > 384 + 90 || sx < -100 || sx > 216 + 100 || b.stun > 0) continue;
      const hot = b.alert > 0;
      p.cone(sx, sy - 14, b.ang, HALF * D.vision, RANGE * D.vision, hot ? C.red : '#cfc6ff', hot ? 0.22 : 0.12);
    }
  }

  push(list: Drawable[]) {
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    if (this.guardian) {
      this.guardian.push(list);
      return;
    }
    for (const r of REEDS) {
      if (!onScreen(hub, r[0]!, r[1]!)) continue;
      list.push({ y: r[1]! + 3, fn: () => drawReeds(p, r[0]! - cx, r[1]! - cy, r[0]! + r[1]!, t, 9) });
    }
    // a few extra reeds as scenery
    for (let i = 0; i < 40; i++) {
      const x = 840 + hash2(i, 1) * 390;
      const y = 700 + hash2(i, 2) * 320;
      if (!hub.land.isWalk(x, y) || !onScreen(hub, x, y)) continue;
      list.push({ y: y + 2, fn: () => drawReeds(p, x - cx, y - cy, i * 3, t, 5) });
    }
    LILIES.forEach((l, i) => {
      if (onScreen(hub, l.x, l.y)) list.push({ y: l.y, fn: () => drawLily(p, l.x - cx, l.y - cy, t, this.lily.done ? 1 : this.lily.lit[i]!, i + 1) });
    });
    if (!this.cleared && onScreen(hub, TOWER.x, TOWER.y, 60)) list.push({ y: TOWER.y, fn: () => drawBellTower(p, TOWER.x - cx, TOWER.y - cy, t, this.rung) });
    else if (this.cleared && onScreen(hub, TOWER.x, TOWER.y, 60)) list.push({ y: TOWER.y, fn: () => drawBellTower(p, TOWER.x - cx, TOWER.y - cy, t, 0) });
    if (this.gate.open < 0.97 && onScreen(hub, this.gate.x, this.gate.midY, 50)) {
      list.push({ y: GATE.y1, fn: () => drawThornGate(p, this.gate.x - cx, GATE.y0 - cy, GATE.y1 - cy, t, this.gate.open, '#8ad0b0') });
    }
    for (const b of this.bells) {
      if (!onScreen(hub, b.x, b.y)) continue;
      list.push({
        y: b.y,
        fn: () => {
          const sx = b.x - cx;
          const sy = b.y - cy;
          if (b.stun > 0) p.alpha(0.55);
          drawBellwether(p, sx, sy, t, Math.cos(b.ang), Math.sin(b.ang), b.alert, b.seed);
          p.alpha(1);
          if (b.stun > 0) {
            // a cracked bell and dizzy eyes
            p.line(sx - 2, sy - 18, sx + 2, sy - 14, '#05060c', 1);
            for (let i = 0; i < 3; i++) p.px(sx + Math.cos(t * 4 + i * 2.1) * 6, sy - 26 + Math.sin(t * 4 + i * 2.1) * 2, '#ffe9a0');
          }
        },
      });
    }
  }
}
