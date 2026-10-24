import { burst, drawRootmaw, type MawState } from '../../core/art';
import { C } from '../../core/palette';
import { D } from '../../core/difficulty';
import { clamp, dist } from '../../core/util';
import { drawHeartBloom, drawPips, drawPlate, drawRootHeart, drawRootWall, drawStone, drawThornback, type BeetleState } from '../art3';
import { arenaDef } from '../land';
import { ThornbackKing } from '../guardians/thornback';
import type { Drawable, Hub, Lance, Nova, Rect, Slam, Zone } from '../types';
import { onScreen } from './parts';

interface Maw {
  x: number;
  y: number;
  st: MawState;
  t: number;
  seed: number;
  cool: number;
  stun: number;
}

interface Beetle {
  x: number;
  y: number;
  hx: number;
  hy: number;
  dx: number;
  dy: number;
  face: number;
  st: BeetleState;
  t: number;
  hp: number;
  travelled: number;
  cool: number;
  dead: boolean;
  fade: number;
  flash: number;
  seed: number;
}

interface Wall {
  rect: Rect;
  broken: number;
  breaking: boolean;
  dwell: number;
  st: MawState;
  t: number;
  /** a wall that bites while you wait beside it */
  snaps: boolean;
}

interface Block {
  x: number;
  y: number;
  sx: number;
  sy: number;
}

const MAWS = [
  { x: 335, y: 775 },
  { x: 362, y: 912 },
  { x: 300, y: 962 },
  { x: 205, y: 770 },
  { x: 195, y: 940 },
  { x: 90, y: 790 },
  { x: 92, y: 925 },
];
const BEETLES = [
  { x: 355, y: 850 },
  { x: 405, y: 905 },
  { x: 200, y: 865 },
];
const PLATES = [
  { x: 330, y: 722 },
  { x: 372, y: 722 },
];
const BLOCKS = [
  { x: 330, y: 792 },
  { x: 402, y: 760 },
];
const HEART = { x: 85, y: 858, hp: 5 };
const PUSH = 44;

/**
 * Rootmaw Thicket. Rootmaws snap at anything close; Thornbacks charge and knock themselves out on trees.
 * Two walls of roots close the way to the Rootheart: stand beside one until X's shadow forms, then run.
 */
export class ThicketZone implements Zone {
  readonly id = 'thicket' as const;
  cleared = false;
  private maws: Maw[] = [];
  private beetles: Beetle[] = [];
  private walls: Wall[] = [];
  private blocks: Block[] = [];
  private plateOn = [false, false];
  private secretDone = false;
  private heart = { ...HEART, st: 'closed' as 'closed' | 'rumble' | 'open' | 'snap', t: 0, flash: 0, dead: false };
  private t = 0;
  private guardian: ThornbackKing | null = null;

  constructor(private hub: Hub) {}

  get always() {
    return this.guardian !== null;
  }

  /** The player is in the arena: the Thornback King drops in. */
  onArrive() {
    this.guardian = new ThornbackKing(this.hub, arenaDef('thicket'), () => {
      this.heart.dead = true;
      this.hub.leaveArena(this, true);
    });
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
    this.maws = MAWS.map((m, i) => ({ ...m, st: 'idle', t: 0, seed: i * 2.1, cool: 0, stun: 0 }));
    this.beetles = BEETLES.map((b, i) => ({ x: b.x, y: b.y, hx: b.x, hy: b.y, dx: 1, dy: 0, face: 1, st: 'idle', t: 0, hp: 2, travelled: 0, cool: 1 + i, dead: false, fade: 1, flash: 0, seed: i * 5 }));
    this.walls = [
      { rect: { x0: 242, y0: 821, x1: 258, y1: 892 }, broken: 0, breaking: false, dwell: 0, st: 'idle', t: 0, snaps: false },
      { rect: { x0: 122, y0: 818, x1: 138, y1: 892 }, broken: 0, breaking: false, dwell: 0, st: 'idle', t: 0, snaps: true },
    ];
    this.resetBlocks();
    this.plateOn = [false, false];
    this.secretDone = false;
    this.heart = { ...HEART, st: 'closed', t: 0, flash: 0, dead: false };
    this.guardian = null;
  }

  private resetBlocks() {
    this.blocks = BLOCKS.map((b) => ({ x: b.x, y: b.y, sx: b.x, sy: b.y }));
  }

  onRespawn() {
    if (this.guardian) {
      this.guardian.onPlayerDied();
      return;
    }
    if (!this.secretDone) this.resetBlocks();
    this.maws.forEach((m) => {
      m.st = 'idle';
      m.t = 0;
    });
    this.beetles.forEach((b) => {
      if (!b.dead) {
        b.x = b.hx;
        b.y = b.hy;
        b.st = 'idle';
        b.cool = 1.5;
        b.hp = 2;
      }
    });
    if (!this.cleared && !this.heart.dead) {
      this.heart.hp = HEART.hp;
      this.heart.st = 'closed';
      this.heart.t = 0;
    }
  }

  objective(): string | null {
    if (this.cleared || this.guardian) return null;
    if (this.walls.some((w) => w.broken < 0.85)) return "stand by a wall of roots until x's shadow falls · then run · his stomp breaks it";
    return this.heart.st === 'open' ? 'the rootheart is open · tap to pulse it now' : 'wait beside the rootheart until it opens';
  }

  complete() {
    this.guardian = null;
    this.cleared = true;
    this.maws = [];
    this.beetles = [];
    this.walls.forEach((w) => {
      w.broken = 1;
      w.breaking = true;
    });
    this.heart.dead = true;
  }

  colliders(): Rect[] {
    if (this.guardian) return this.guardian.colliders();
    const out: Rect[] = [];
    for (const w of this.walls) if (w.broken < 0.85) out.push(w.rect);
    for (const b of this.blocks) out.push(this.blockRect(b));
    return out;
  }

  private blockRect(b: Block): Rect {
    return { x0: b.x - 6, y0: b.y - 5, x1: b.x + 6, y1: b.y + 3 };
  }

  secretSpot() {
    if (this.secretDone) return null;
    const i = this.plateOn.findIndex((on) => !on);
    return PLATES[i < 0 ? 0 : i]!;
  }

  debugPoints() {
    return [
      ...MAWS.map((m, i) => ({ ...m, name: `maw${i}` })),
      ...BEETLES.map((m, i) => ({ ...m, name: `beetle${i}` })),
      ...PLATES.map((m, i) => ({ ...m, name: `plate${i}` })),
      ...BLOCKS.map((m, i) => ({ ...m, name: `block${i}` })),
      { x: HEART.x, y: HEART.y, name: 'heart' },
      { x: 300, y: 856, name: 'besideWallA' },
      { x: 200, y: 856, name: 'betweenWalls' },
    ];
  }

  onPulse(px: number, py: number, R: number) {
    const hub = this.hub;
    if (this.guardian) {
      this.guardian.onPulse(px, py, R);
      return;
    }
    for (const m of this.maws) {
      if (dist(px, py, m.x, m.y - 6) <= R + 8) {
        m.stun = 3.2;
        m.st = 'open';
        hub.audio.pop();
        burst(hub.parts, m.x, m.y - 10, 8, [C.rootLight, C.bone], 30, 1);
      }
    }
    for (const b of this.beetles) {
      if (b.dead || dist(px, py, b.x, b.y - 4) > R + 5) continue;
      hub.audio.pop();
      b.flash = 0.2;
      // a stunned Thornback has no armour to shield it
      b.hp = b.st === 'stun' ? 0 : b.hp - 1;
      burst(hub.parts, b.x, b.y - 6, 8, ['#8fb0c0', '#243a4a'], 36, 1);
      if (b.hp <= 0) {
        b.dead = true;
        hub.audio.kill();
        burst(hub.parts, b.x, b.y - 6, 16, ['#8fb0c0', '#243a4a', C.red], 50, 1);
      } else if (b.st !== 'stun') {
        // knocked off its stride
        b.st = 'stun';
        b.t = 0;
      }
    }
    const h = this.heart;
    if (!h.dead && dist(px, py, h.x, h.y - 10) <= R + 16) {
      if (h.st === 'open') {
        // the Rootheart bites back: the Thornback King that sleeps in it wakes
        h.flash = 0.25;
        hub.audio.pop();
        hub.shake(4);
        burst(hub.parts, h.x, h.y - 14, 14, [C.redGlow, C.root, C.white], 50, 1);
        h.st = 'snap';
        h.t = 0;
        hub.enterArena(this);
      } else {
        hub.audio.click();
      }
    }
  }

  onImpact(s: Slam) {
    const hub = this.hub;
    for (const w of this.walls) {
      if (w.breaking) continue;
      const cx = (w.rect.x0 + w.rect.x1) / 2;
      const cy = (w.rect.y0 + w.rect.y1) / 2;
      if (hub.inEllipse(cx, cy, s, 1.2)) {
        w.breaking = true;
        hub.audio.crumble();
        burst(hub.parts, cx, cy, 36, [C.root, C.rootLight, C.soil, C.rootMouth], 80, 1);
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
    const t = this.t;

    // --- walls of roots
    for (const w of this.walls) {
      if (w.breaking) {
        w.broken = Math.min(1, w.broken + dt / 0.8);
        continue;
      }
      const near = pl.x > w.rect.x0 - 36 && pl.x < w.rect.x1 + 36 && pl.y > w.rect.y0 - 6 && pl.y < w.rect.y1 + 6 && pl.dead <= 0;
      if (near && w.dwell >= 0) w.dwell += dt;
      else w.dwell = w.dwell < 0 ? Math.min(0, w.dwell + dt) : Math.max(0, w.dwell - dt * 0.8);
      if (w.snaps) {
        w.t += dt;
        const cyc = w.t % (2.6 / D.speed);
        w.st = cyc < 1.4 ? 'idle' : cyc < 1.4 + 0.5 * D.tele ? 'rumble' : cyc < 1.4 + 0.5 * D.tele + 0.35 ? 'open' : 'snap';
        if (w.st === 'snap' && near && Math.abs(pl.x - (w.rect.x0 + w.rect.x1) / 2) < 22 && pl.invuln <= 0) hub.hurt((w.rect.x0 + w.rect.x1) / 2, pl.y, 1);
      } else {
        w.st = w.dwell > 0.5 ? 'rumble' : 'idle';
      }
      if (w.dwell >= 2.2) {
        // X's shadow forms where you stand; the wall is right beside you
        hub.spawnSlam(pl.x, pl.y, 50, 1.6);
        w.dwell = -3.2;
      }
    }

    // --- Rootmaws
    for (const m of this.maws) {
      if (m.stun > 0) {
        m.stun -= dt;
        m.st = 'open';
        continue;
      }
      m.cool -= dt;
      const d = dist(pl.x, pl.y, m.x, m.y);
      m.t += dt;
      if (m.st === 'idle') {
        if (d < 30 && m.cool <= 0 && pl.dead <= 0) {
          m.st = 'rumble';
          m.t = 0;
        }
      } else if (m.st === 'rumble') {
        if (m.t >= 0.55 * D.tele) {
          m.st = 'open';
          m.t = 0;
        }
      } else if (m.st === 'open') {
        if (m.t >= 0.4 * D.tele) {
          m.st = 'snap';
          m.t = 0;
          hub.audio.snap();
          if (d < 18) hub.hurt(m.x, m.y, 1);
        }
      } else if (m.t >= 0.35) {
        m.st = 'idle';
        m.t = 0;
        m.cool = 1.4;
      }
    }

    // --- Thornbacks
    for (const b of this.beetles) {
      b.flash = Math.max(0, b.flash - dt);
      if (b.dead) {
        b.fade -= dt * 3;
        continue;
      }
      b.cool -= dt;
      b.t += dt;
      const d = dist(pl.x, pl.y, b.x, b.y);
      if (b.st === 'idle') {
        if (d < 120 && b.cool <= 0 && pl.dead <= 0) {
          b.st = 'wind';
          b.t = 0;
          const l = d || 1;
          b.dx = (pl.x - b.x) / l;
          b.dy = (pl.y - b.y) / l;
          b.face = b.dx >= 0 ? 1 : -1;
          hub.audio.rumble();
        }
      } else if (b.st === 'wind') {
        if (b.t >= 0.75 * D.tele) {
          b.st = 'charge';
          b.t = 0;
          b.travelled = 0;
        }
      } else if (b.st === 'charge') {
        const sp = 150 * D.speed;
        const nx = b.x + b.dx * sp * dt;
        const ny = b.y + b.dy * sp * dt;
        if (hub.canStand(nx, ny, 5)) {
          b.x = nx;
          b.y = ny;
          b.travelled += sp * dt;
        } else {
          // it hits a tree: knocked senseless
          b.st = 'stun';
          b.t = 0;
          hub.shake(3);
          hub.audio.thump(0.6);
          burst(hub.parts, b.x + b.dx * 6, b.y - 6, 12, ['#8fb0c0', '#6a8a8a', '#243a4a'], 40, 1);
        }
        if (d < 9 && pl.dead <= 0) {
          hub.hurt(b.x, b.y, 1);
          b.st = 'idle';
          b.cool = 1.8;
        }
        if (b.travelled > 200) {
          b.st = 'idle';
          b.cool = 1.2;
        }
      } else if (b.st === 'stun') {
        if (b.t >= 3.6) {
          b.st = 'idle';
          b.cool = 1;
        }
      }
    }
    this.beetles = this.beetles.filter((b) => !(b.dead && b.fade <= 0));

    // --- the Rootheart
    const h = this.heart;
    h.flash = Math.max(0, h.flash - dt);
    if (!h.dead && !this.cleared) {
      h.t += dt;
      const near = dist(pl.x, pl.y, h.x, h.y) < 150;
      if (near) {
        if (h.st === 'closed' && h.t >= 2.2 / D.speed) {
          h.st = 'rumble';
          h.t = 0;
          hub.audio.rumble();
        } else if (h.st === 'rumble' && h.t >= 0.7 * D.tele) {
          h.st = 'open';
          h.t = 0;
        } else if (h.st === 'open' && h.t >= 1.7 * D.window) {
          h.st = 'snap';
          h.t = 0;
          hub.audio.snap();
          hub.shake(3);
          if (dist(pl.x, pl.y, h.x, h.y) < 34) hub.hurt(h.x, h.y, 1);
        } else if (h.st === 'snap' && h.t >= 0.5) {
          h.st = 'closed';
          h.t = 0;
        }
      }
    }

    // --- push the stones
    if (!this.secretDone) this.pushBlocks(dt);
    this.plateOn = PLATES.map((pt) => this.blocks.some((b) => dist(b.x, b.y, pt.x, pt.y) < 8));
    if (!this.secretDone && this.plateOn.every(Boolean)) {
      this.secretDone = true;
      hub.audio.unlock();
      hub.secret(351, 722);
    }
    void clamp;
  }

  private pushBlocks(dt: number) {
    const hub = this.hub;
    const pl = hub.player;
    const ix = hub.input.moveX;
    const iy = hub.input.moveY;
    for (const b of this.blocks) {
      const r = this.blockRect(b);
      const touching = pl.x + 5.5 > r.x0 && pl.x - 5.5 < r.x1 && pl.y + 3.5 > r.y0 && pl.y - 3.5 < r.y1;
      if (!touching) continue;
      const cxB = (r.x0 + r.x1) / 2;
      const cyB = (r.y0 + r.y1) / 2;
      let dx = 0;
      let dy = 0;
      if (Math.abs(ix) > Math.abs(iy) && Math.abs(ix) > 0.3 && Math.sign(cxB - pl.x) === Math.sign(ix)) dx = Math.sign(ix);
      else if (Math.abs(iy) > 0.3 && Math.sign(cyB - pl.y) === Math.sign(iy)) dy = Math.sign(iy);
      if (dx === 0 && dy === 0) continue;
      const nx = b.x + dx * PUSH * dt;
      const ny = b.y + dy * PUSH * dt;
      if (this.blockFree(b, nx, ny)) {
        b.x = nx;
        b.y = ny;
      }
    }
  }

  private blockFree(self: Block, x: number, y: number): boolean {
    const land = this.hub.land;
    const r = { x0: x - 6, y0: y - 5, x1: x + 6, y1: y + 3 };
    for (const [cx, cy] of [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]] as const) if (!land.isWalk(cx, cy)) return false;
    for (const o of this.blocks) {
      if (o === self) continue;
      const q = this.blockRect(o);
      if (r.x1 > q.x0 && r.x0 < q.x1 && r.y1 > q.y0 && r.y0 < q.y1) return false;
    }
    for (const w of this.walls) {
      if (w.broken < 0.85 && r.x1 > w.rect.x0 && r.x0 < w.rect.x1 && r.y1 > w.rect.y0 && r.y0 < w.rect.y1) return false;
    }
    return true;
  }

  ground() {
    if (this.guardian) {
      this.guardian.ground();
      return;
    }
    const { hub } = this;
    const p = hub.p;
    const cx = hub.camX;
    const cy = hub.camY;
    // the telegraph of a charging Thornback: a dusty line
    for (const b of this.beetles) {
      if (b.st === 'wind' && !b.dead) {
        const u = clamp(b.t / (0.75 * D.tele), 0, 1);
        const sx = b.x - cx;
        const sy = b.y - cy;
        for (let i = 1; i < 12; i++) {
          if (i / 12 > u + 0.1) break;
          p.px(sx + b.dx * i * 11, sy + b.dy * i * 11, i % 2 ? C.redGlow : C.red);
        }
      }
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
    for (const pt of PLATES) {
      if (onScreen(hub, pt.x, pt.y)) {
        const i = PLATES.indexOf(pt);
        list.push({ y: pt.y - 30, fn: () => drawPlate(p, pt.x - cx, pt.y - cy, t, this.plateOn[i]!) });
      }
    }
    for (const b of this.blocks) {
      if (onScreen(hub, b.x, b.y)) {
        const on = PLATES.some((pt) => dist(b.x, b.y, pt.x, pt.y) < 8);
        list.push({ y: b.y + 3, fn: () => drawStone(p, b.x - cx, b.y + 3 - cy, on) });
      }
    }
    if (this.secretDone && onScreen(hub, 351, 722)) list.push({ y: 722, fn: () => drawHeartBloom(p, 351 - cx, 722 - cy, t) });
    for (const w of this.walls) {
      const mx = (w.rect.x0 + w.rect.x1) / 2;
      if (w.broken < 0.99 && onScreen(hub, mx, (w.rect.y0 + w.rect.y1) / 2, 50)) {
        list.push({
          y: w.rect.y1 + 2,
          fn: () => {
            drawRootWall(p, mx - cx, w.rect.y0 - cy, w.rect.y1 - cy, t, w.st, w.broken, (x, y, st, seed) => drawRootmaw(p, x, y, st, t, seed));
            if (w.dwell > 0.3) {
              // a shadow gathering on the ground beside you
              const u = clamp(w.dwell / 2.2, 0, 1);
              p.dither(hub.player.x - cx, hub.player.y - cy, 30 * u, 20 * u, C.ink, 0.4 * u);
            }
          },
        });
      }
    }
    for (const m of this.maws) {
      if (onScreen(hub, m.x, m.y)) list.push({ y: m.y, fn: () => drawRootmaw(p, m.x - cx, m.y - cy, m.st, t, m.seed) });
    }
    for (const b of this.beetles) {
      if (onScreen(hub, b.x, b.y)) {
        list.push({
          y: b.y,
          fn: () => {
            if (b.dead) p.alpha(Math.max(0, b.fade));
            drawThornback(p, b.x - cx, b.y - cy, t, b.st, b.face, b.hp);
            if (b.flash > 0) p.ellipse(b.x - cx, b.y - cy - 5, 6, 4, C.white);
            if (b.dead) p.alpha(1);
            if (!b.dead && b.hp < 2) drawPips(p, b.x - cx, b.y - cy - 18, b.hp, 2);
          },
        });
      }
    }
    const h = this.heart;
    if (!h.dead && onScreen(hub, h.x, h.y, 60)) {
      list.push({
        y: h.y,
        fn: () => {
          drawRootHeart(p, h.x - cx, h.y - cy, t, h.st, h.hp / HEART.hp, h.flash);
          drawPips(p, h.x - cx, h.y - cy - 44, h.hp, HEART.hp);
        },
      });
    }
  }
}
