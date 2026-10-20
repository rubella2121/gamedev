import { burst, makeFlower } from '../../core/art';
import { drawMimic, drawMoth, drawRootCage, type MimicState } from '../../core/art2';
import { C } from '../../core/palette';
import { D } from '../../core/difficulty';
import { clamp, dist, hash2 } from '../../core/util';
import { drawBlossom, drawLightSeed } from '../art3';
import { arenaDef } from '../land';
import { MimicQueen } from '../guardians/mimicqueen';
import type { Drawable, Hub, Lance, Nova, Patch, Rect, Zone } from '../types';
import { onScreen } from './parts';

interface Mimic {
  x: number;
  y: number;
  st: MimicState;
  t: number;
  seed: number;
  /** phase offset for flowers that snap on their own rhythm (the second field) */
  auto?: number;
}

const CAGE = { x: 1100, y: 1742 };
const SEED = { x: 1165, y: 1560 };
/** the dormant flowers that lead to the Lightseed: stand still beside each one while the moth hovers */
const DORMANT = [
  { x: 1085, y: 1690 },
  { x: 1125, y: 1655 },
  { x: 1172, y: 1640 },
  { x: 1196, y: 1600 },
  { x: 1140, y: 1592 },
];
/** moon blossoms that only the moth shows */
const MOON = [
  { x: 905, y: 1545 },
  { x: 1085, y: 1512 },
  { x: 985, y: 1778 },
];
const PATCHES: Patch[] = [
  { x: 905, y: 1690, rx: 26, ry: 18 },
  { x: 1015, y: 1530, rx: 24, ry: 16 },
];
const HOLD_TIME = 1.4;
const STILL_TIME = 2.4;

/**
 * Moth Meadow. A Mournmoth is trapped in roots: hold to free it. Its light shows which flowers bite
 * (Mimic Blooms) and wakes the dormant flowers when you stand still beside them. Wake all five and the Lightseed answers.
 */
export class MeadowZone implements Zone {
  readonly id = 'meadow' as const;
  cleared = false;
  private mimics: Mimic[] = [];
  private flower = makeFlower(true);
  private freed = false;
  private hold = 0;
  private still = [0, 0, 0, 0, 0];
  private open = [false, false, false, false, false];
  private moon = [false, false, false];
  private moonDone = false;
  private t = 0;
  private guardian: MimicQueen | null = null;

  constructor(private hub: Hub) {
    for (const pt of PATCHES) hub.land.addPatchFlowers(pt.x, pt.y, pt.rx, pt.ry, Math.floor(pt.x));
    this.layout();
  }

  get always() {
    return this.guardian !== null;
  }

  /** The player is in the arena: the Mimic Queen blooms. */
  onArrive() {
    this.guardian = new MimicQueen(this.hub, arenaDef('meadow'), () => this.hub.leaveArena(this, true));
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

  ground() {
    this.guardian?.ground();
  }

  colliders(): Rect[] {
    return this.guardian?.colliders() ?? [];
  }

  /** The two fields: the first reacts to you, the second snaps in a rolling wave. */
  private layout() {
    const land = this.hub.land;
    this.mimics = [];
    let row = 0;
    // field 1: rows across the way from the entries to the cage, each with a wandering clear lane
    for (let x = 885; x < 1060; x += 28) {
      const lane = 1692 + 34 * Math.sin(row * 0.9);
      const n = 1 + Math.floor(hash2(row, 3) * 3);
      for (let k = 0; k < n; k++) {
        const side = hash2(row, k + 10) > 0.5 ? 1 : -1;
        const y = lane + side * (20 + hash2(row, k + 20) * 36);
        const mx = x + (hash2(row, k) - 0.5) * 10;
        if (land.canStand(mx, y, 6)) this.mimics.push({ x: mx, y, st: 'idle', t: 0, seed: row * 4 + k });
      }
      row++;
    }
    // field 2: a grid across the north-east, with a lane left open along the dormant flowers
    const path: [number, number][] = [...DORMANT.map((d) => [d.x, d.y] as [number, number]), [SEED.x, SEED.y + 20]];
    let r2 = 0;
    for (let y = 1700; y > 1545; y -= 24) {
      for (let x = 1055; x < 1215; x += 26) {
        const mx = x + (hash2(r2, x) - 0.5) * 8;
        const my = y + (hash2(x, r2) - 0.5) * 6;
        if (!land.canStand(mx, my, 6)) continue;
        if (path.some((q) => dist(mx, my, q[0], q[1]) < 30)) continue;
        if (dist(mx, my, CAGE.x, CAGE.y) < 34 || dist(mx, my, SEED.x, SEED.y) < 30) continue;
        this.mimics.push({ x: mx, y: my, st: 'idle', t: 0, seed: r2 * 7 + x, auto: r2 * 0.27 + hash2(x, 5) * 0.2 });
      }
      r2++;
    }
  }

  reset() {
    this.cleared = false;
    this.freed = false;
    this.hold = 0;
    this.still = [0, 0, 0, 0, 0];
    this.open = [false, false, false, false, false];
    this.moon = [false, false, false];
    this.moonDone = false;
    this.hub.moth.has = false;
    this.mimics.forEach((m) => {
      m.st = 'idle';
      m.t = 0;
    });
    this.guardian = null;
    this.hub.patches.push(...PATCHES);
  }

  onRespawn() {
    if (this.guardian) {
      this.guardian.onPlayerDied();
      return;
    }
    // dying before the cage checkpoint puts the moth back in its cage
    if (!this.cleared && !this.cpSet) {
      this.freed = false;
      this.hub.moth.has = false;
    }
    this.hold = 0;
    this.mimics.forEach((m) => {
      m.st = 'idle';
      m.t = 0;
    });
  }

  private cpSet = false;

  complete() {
    this.guardian = null;
    this.cleared = true;
    this.freed = true;
    this.cpSet = true;
    this.hub.moth.has = true;
    this.open = [true, true, true, true, true];
  }

  debugPoints() {
    return [
      { ...CAGE, name: 'cage' },
      { ...SEED, name: 'seed' },
      ...DORMANT.map((d, i) => ({ ...d, name: `dormant${i}` })),
      ...MOON.map((d, i) => ({ ...d, name: `moon${i}` })),
    ];
  }

  /** Called by the game when it wants the moth without the story (showcase, warps). */
  skipFreed() {
    this.freed = true;
    this.cpSet = true;
    this.hub.moth.has = true;
  }

  onPulse(px: number, py: number, R: number) {
    this.guardian?.onPulse(px, py, R);
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
    const moth = hub.moth;
    this.t += dt;
    const t = this.t;
    const calm = Math.hypot(pl.vx, pl.vy) < 8;

    // --- the trapped Mournmoth
    if (!this.freed) {
      const near = dist(pl.x, pl.y, CAGE.x, CAGE.y) < 32 && pl.dead <= 0;
      if (near) {
        hub.requestHold('hold');
        hub.ui.hint('hold to free it');
        if (hub.input.actionDown) this.hold = Math.min(HOLD_TIME, this.hold + dt);
        else this.hold = Math.max(0, this.hold - dt * 1.5);
        if (this.hold >= HOLD_TIME) {
          this.freed = true;
          this.cpSet = true;
          moth.has = true;
          moth.x = CAGE.x;
          moth.y = CAGE.y - 14;
          hub.ui.hint(null);
          hub.audio.warm();
          hub.shake(2);
          burst(hub.parts, CAGE.x, CAGE.y - 10, 24, [C.moonCore, C.moon, C.root], 50, 1, 40);
          hub.checkpoint(CAGE.x, CAGE.y - 24);
        }
      } else {
        this.hold = Math.max(0, this.hold - dt * 2);
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
        if (m.st === 'snap' && d < 12 && pl.dead <= 0) hub.hurt(m.x, m.y, 1);
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
        if (d < 12 && pl.dead <= 0) hub.hurt(m.x, m.y, 1);
        if (m.t >= 0.9) {
          m.st = 'idle';
          m.t = -0.6;
        }
      }
    }

    if (this.cleared) return;

    // --- the dormant flowers wake when you stand still beside them with the moth
    if (this.freed) {
      let all = true;
      DORMANT.forEach((f, i) => {
        if (!this.open[i]) {
          if (calm && dist(pl.x, pl.y, f.x, f.y) < 34 && pl.dead <= 0) {
            this.still[i] = Math.min(STILL_TIME, this.still[i]! + dt);
            if (this.still[i]! >= STILL_TIME) {
              this.open[i] = true;
              hub.audio.blip(0.8 + i * 0.12);
              burst(hub.parts, f.x, f.y - 10, 14, [C.moonCore, C.moon, C.flowerLight], 44, 1, 20);
            }
          } else this.still[i] = Math.max(0, this.still[i]! - dt * 0.8);
        }
        if (!this.open[i]) all = false;
      });
      // --- the moon blossoms that only the moth shows
      if (!this.moonDone) {
        MOON.forEach((m, i) => {
          if (!this.moon[i] && dist(moth.x, moth.y, m.x, m.y) < 60 && dist(pl.x, pl.y, m.x, m.y) < 13) {
            this.moon[i] = true;
            hub.audio.blip(1 + i * 0.2);
            burst(hub.parts, m.x, m.y - 8, 12, [C.moonCore, '#ffffff'], 36, 1, 20);
          }
        });
        if (this.moon.every(Boolean)) {
          this.moonDone = true;
          hub.audio.unlock();
          hub.secret(MOON[1]!.x, MOON[1]!.y);
        }
      }
      // --- the Lightseed
      if (all && dist(pl.x, pl.y, SEED.x, SEED.y) < 20 && pl.dead <= 0) hub.enterArena(this);
    }
  }

  push(list: Drawable[]) {
    if (this.guardian) {
      this.guardian.push(list);
      return;
    }
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    const moth = hub.moth;
    const revealRange = 58;
    if (!this.freed && onScreen(hub, CAGE.x, CAGE.y)) {
      list.push({
        y: CAGE.y,
        fn: () => {
          const u = this.hold / HOLD_TIME;
          const sx = CAGE.x - cx;
          const sy = CAGE.y - cy;
          drawRootCage(p, sx, sy, t, u);
          drawMoth(p, sx, sy - 12, t, 0.8 + 0.2 * Math.sin(t * 5));
          if (u > 0) {
            p.ring(sx, sy - 12, 14, 12, 1, '#10303a');
            const n = Math.floor(u * 28);
            for (let i = 0; i < n; i++) {
              const a = -Math.PI / 2 + (i / 28) * Math.PI * 2;
              p.rect(sx + Math.cos(a) * 14 - 0.5, sy - 12 + Math.sin(a) * 12 - 0.5, 2, 2, C.moonCore);
            }
          }
        },
      });
    }
    DORMANT.forEach((f, i) => {
      if (!onScreen(hub, f.x, f.y)) return;
      const lit = this.open[i] ? 1 : clamp(this.still[i]! / STILL_TIME, 0, 1) * 0.6;
      list.push({ y: f.y, fn: () => drawBlossom(p, f.x - cx, f.y - cy, t, lit, i, C.moon) });
    });
    if (onScreen(hub, SEED.x, SEED.y, 50)) {
      const awake = this.open.every(Boolean) ? 1 : this.open.filter(Boolean).length / 10;
      list.push({ y: SEED.y, fn: () => drawLightSeed(p, SEED.x - cx, SEED.y - cy, t, awake) });
    }
    MOON.forEach((m, i) => {
      if (!onScreen(hub, m.x, m.y)) return;
      const near = moth.has && dist(moth.x, moth.y, m.x, m.y) < revealRange;
      list.push({
        y: m.y,
        fn: () => {
          if (this.moon[i] || near) drawBlossom(p, m.x - cx, m.y - cy, t, this.moon[i] ? 1 : 0.5, i, '#ffffff');
          else if (Math.sin(t * 1.4 + i * 2) > 0.92) p.px(m.x - cx, m.y - cy - 8, C.moonCore);
        },
      });
    });
    for (const m of this.mimics) {
      if (!onScreen(hub, m.x, m.y)) continue;
      const revealed = moth.has && dist(moth.x, moth.y, m.x, m.y - 6) < revealRange;
      list.push({
        y: m.y,
        fn: () => {
          const sx = m.x - cx;
          const sy = m.y - cy;
          p.dither(sx, sy - 2, 9, 4.5, C.flower, 0.3 * (0.65 + 0.35 * Math.sin(t * 2 + m.seed)));
          drawMimic(p, this.flower, sx, sy, m.st, t, revealed);
        },
      });
    }
  }
}
