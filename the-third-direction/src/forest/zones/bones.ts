import { burst } from '../../core/art';
import { drawSkitter } from '../../core/art2';
import { C } from '../../core/palette';
import { D } from '../../core/difficulty';
import { clamp, dist, lerp } from '../../core/util';
import { drawBoneBarricade, drawBoneNest, drawPips, drawPlate, drawPounceMark } from '../art3';
import { arenaDef } from '../land';
import { BoneWyrm } from '../guardians/bonewyrm';
import type { Drawable, Hub, Lance, Nova, Patch, Rect, Zone } from '../types';
import { LightPuzzle, onScreen } from './parts';

type SkSt = 'idle' | 'tele' | 'air' | 'rest' | 'stun';

interface Sk {
  x: number;
  y: number;
  hx: number;
  hy: number;
  st: SkSt;
  t: number;
  hp: number;
  mx: number;
  my: number;
  sx: number;
  sy: number;
  cool: number;
  seed: number;
  flash: number;
  fade: number;
  dead: boolean;
}

const BAR = { x0: 1122, y0: 1169, x1: 1138, y1: 1267 };
const NEST = { x: 1203, y: 1218, hp: 6 };
const PATCHES: Patch[] = [
  { x: 885, y: 1280, rx: 26, ry: 18 },
  { x: 1200, y: 1330, rx: 22, ry: 15 },
];
const HOMES = [
  // the pack behind the barricade
  [1172, 1190], [1178, 1248], [1215, 1262],
  // roaming packs on the near side
  [960, 1150], [985, 1195], [1040, 1300], [1010, 1345],
] as const;
const PLATES = [
  { x: 930, y: 1120 },
  { x: 905, y: 1270 },
  { x: 1010, y: 1330 },
];

/**
 * Bone Wastes. Skitterbones mark where they will pounce, then leap. A pulse knocks one out of the air.
 * A barricade of bones seals the Bone Nest: stand beside it so the pack behind it pounces straight into it.
 */
export class BonesZone implements Zone {
  readonly id = 'bones' as const;
  cleared = false;
  private sk: Sk[] = [];
  private bar = { hp: 3, shake: 0, broken: 0, breaking: false };
  private nest = { ...NEST, flash: 0, dead: false };
  private plates = new LightPuzzle(PLATES, 8, 0);
  private plateDone = false;
  private t = 0;
  private guardian: BoneWyrm | null = null;

  constructor(private hub: Hub) {
    for (const pt of PATCHES) hub.land.addPatchFlowers(pt.x, pt.y, pt.rx, pt.ry, Math.floor(pt.x));
  }

  get always() {
    return this.guardian !== null;
  }

  /** The player is in the arena: the Bone Wyrm wakes under the floor. */
  onArrive() {
    this.guardian = new BoneWyrm(this.hub, arenaDef('bones'), () => {
      this.nest.dead = true;
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
    this.sk = HOMES.map((h, i) => this.make(h[0], h[1], i));
    this.bar = { hp: 3, shake: 0, broken: 0, breaking: false };
    this.nest = { ...NEST, flash: 0, dead: false };
    this.plates.reset();
    this.plateDone = false;
    this.guardian = null;
    this.hub.patches.push(...PATCHES);
  }

  private make(x: number, y: number, seed: number): Sk {
    return { x, y, hx: x, hy: y, st: 'idle', t: 0, hp: 2, mx: x, my: y, sx: x, sy: y, cool: 1 + (seed % 3) * 0.4, seed, flash: 0, fade: 1, dead: false };
  }

  onRespawn() {
    if (this.guardian) {
      this.guardian.onPlayerDied();
      return;
    }
    this.sk.forEach((s) => {
      if (!s.dead) {
        s.x = s.hx;
        s.y = s.hy;
        s.st = 'idle';
        s.hp = 2;
        s.cool = 1.5;
      }
    });
    this.plates.reset(this.plateDone);
    if (!this.cleared && !this.nest.dead) this.nest.hp = NEST.hp;
  }

  complete() {
    this.guardian = null;
    this.cleared = true;
    this.sk = [];
    this.bar.broken = 1;
    this.bar.breaking = true;
    this.nest.dead = true;
    this.plateDone = true;
  }

  colliders(): Rect[] {
    if (this.guardian) return this.guardian.colliders();
    return this.bar.broken < 0.85 ? [BAR] : [];
  }

  secretSpot() {
    if (this.plateDone) return null;
    const i = this.plates.t.findIndex((v) => v <= 0);
    return PLATES[i < 0 ? 0 : i]!;
  }

  debugPoints() {
    return [
      ...HOMES.map((h, i) => ({ x: h[0], y: h[1], name: `sk${i}` })),
      ...PLATES.map((h, i) => ({ ...h, name: `plate${i}` })),
      { x: NEST.x, y: NEST.y, name: 'nest' },
      { x: 1100, y: 1220, name: 'besideBarricade' },
    ];
  }

  private crossesBarricade(x0: number, y0: number, x1: number, y1: number): boolean {
    if (this.bar.broken >= 0.85) return false;
    for (let i = 0; i <= 8; i++) {
      const x = lerp(x0, x1, i / 8);
      const y = lerp(y0, y1, i / 8);
      if (x > BAR.x0 - 3 && x < BAR.x1 + 3 && y > BAR.y0 && y < BAR.y1) return true;
    }
    return false;
  }

  private kill(s: Sk) {
    s.dead = true;
    this.hub.audio.kill();
    burst(this.hub.parts, s.x, s.y - 5, 14, [C.bone, C.boneShade, C.red], 46, 1);
  }

  onPulse(px: number, py: number, R: number) {
    const hub = this.hub;
    if (this.guardian) {
      this.guardian.onPulse(px, py, R);
      return;
    }
    for (const s of this.sk) {
      if (s.dead) continue;
      const lift = s.st === 'air' ? 5 : 0;
      if (dist(px, py, s.x, s.y - 4 - lift) > R + 4) continue;
      hub.audio.pop();
      s.flash = 0.2;
      burst(hub.parts, s.x, s.y - 6, 8, [C.bone, '#ffffff'], 36, 1);
      if (s.st === 'stun') {
        this.kill(s);
      } else if (s.st === 'air') {
        // knocked out of the air
        s.hp--;
        s.st = 'stun';
        s.t = 0;
        if (s.hp <= 0) this.kill(s);
      } else {
        s.hp--;
        s.st = 'rest';
        s.t = 0;
        s.cool = 0.9;
        if (s.hp <= 0) this.kill(s);
      }
    }
    const n = this.nest;
    // the Bone Nest is the Wyrm's egg: strike it and the Bone Wyrm wakes under the floor
    if (!n.dead && this.bar.broken >= 0.85 && dist(px, py, n.x, n.y - 10) <= R + 16) {
      n.flash = 0.25;
      hub.audio.pop();
      hub.shake(3);
      burst(hub.parts, n.x, n.y - 14, 14, [C.bone, C.red, '#ffffff'], 50, 1);
      hub.enterArena(this);
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
    this.bar.shake = Math.max(0, this.bar.shake - dt * 2);
    this.nest.flash = Math.max(0, this.nest.flash - dt);
    if (this.bar.breaking) this.bar.broken = Math.min(1, this.bar.broken + dt / 0.7);

    // --- the plate run (step on all three before the first one fades)
    if (!this.plateDone) {
      PLATES.forEach((pt, i) => {
        if (dist(pl.x, pl.y, pt.x, pt.y) < 10) {
          if (this.plates.t[i]! <= 0) hub.audio.click();
          this.plates.t[i] = 8;
        }
      });
      if (this.plates.update(dt)) {
        this.plateDone = true;
        hub.audio.unlock();
        hub.secret(960, 1215);
      }
    }
    if (this.cleared) return;

    // --- Skitterbones
    const sight = 110 * D.vision;
    for (const s of this.sk) {
      s.flash = Math.max(0, s.flash - dt);
      if (s.dead) {
        s.fade -= dt * 3;
        continue;
      }
      s.cool -= dt;
      s.t += dt;
      const d = dist(pl.x, pl.y, s.x, s.y);
      if (s.st === 'idle') {
        const wx = s.hx + Math.sin(this.t * 0.7 + s.seed) * 12;
        const wy = s.hy + Math.cos(this.t * 0.5 + s.seed * 1.7) * 8;
        s.x += (wx - s.x) * Math.min(1, dt * 1.2);
        s.y += (wy - s.y) * Math.min(1, dt * 1.2);
        if (s.cool <= 0 && d < sight && pl.dead <= 0 && !pl.hide) {
          s.st = 'tele';
          s.t = 0;
          s.mx = pl.x + pl.vx * 0.3;
          s.my = pl.y + pl.vy * 0.3;
          hub.audio.rumble();
        }
      } else if (s.st === 'tele') {
        if (s.t >= 0.62 * D.tele) {
          s.st = 'air';
          s.t = 0;
          s.sx = s.x;
          s.sy = s.y;
        }
      } else if (s.st === 'air') {
        const T = 0.42 / D.speed;
        const u = clamp(s.t / T, 0, 1);
        const nx = lerp(s.sx, s.mx, u);
        const ny = lerp(s.sy, s.my, u);
        if (this.crossesBarricade(s.x, s.y, nx, ny)) {
          // it smashes into the bones
          s.st = 'stun';
          s.t = 0;
          this.bar.hp--;
          this.bar.shake = 1;
          hub.shake(5);
          hub.audio.thump(0.8);
          burst(hub.parts, (BAR.x0 + BAR.x1) / 2, s.y - 6, 14, [C.bone, C.boneShade], 50, 1);
          if (this.bar.hp <= 0 && !this.bar.breaking) {
            this.bar.breaking = true;
            hub.audio.crumble();
            hub.audio.unlock();
            burst(hub.parts, (BAR.x0 + BAR.x1) / 2, (BAR.y0 + BAR.y1) / 2, 40, [C.bone, C.boneShade, '#ffffff'], 80, 1);
          }
        } else if (!hub.land.isWalk(nx, ny)) {
          s.st = 'rest';
          s.t = 0;
        } else {
          s.x = nx;
          s.y = ny;
          if (u >= 1) {
            s.st = 'rest';
            s.t = 0;
            burst(hub.parts, s.x, s.y, 6, ['#6a8a8a', C.boneShade], 30, 0);
            if (dist(pl.x, pl.y, s.mx, s.my) < 11 && pl.dead <= 0) hub.hurt(s.x, s.y, 1);
          }
        }
      } else if (s.st === 'rest') {
        if (s.t >= 1.1) {
          s.st = 'idle';
          s.cool = 1.2;
        }
      } else if (s.t >= 3.2) {
        s.st = 'idle';
        s.cool = 1;
      }
    }
    this.sk = this.sk.filter((s) => !(s.dead && s.fade <= 0));
  }

  ground() {
    if (this.guardian) {
      this.guardian.ground();
      return;
    }
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    for (const s of this.sk) {
      if (s.st === 'tele' && !s.dead) drawPounceMark(p, s.mx - hub.camX, s.my - hub.camY, clamp(s.t / (0.62 * D.tele), 0, 1), t);
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
    PLATES.forEach((pt, i) => {
      if (onScreen(hub, pt.x, pt.y)) list.push({ y: pt.y - 30, fn: () => drawPlate(p, pt.x - cx, pt.y - cy, t, this.plateDone || this.plates.t[i]! > 0) });
    });
    if (this.bar.broken < 0.99 && onScreen(hub, (BAR.x0 + BAR.x1) / 2, (BAR.y0 + BAR.y1) / 2, 60)) {
      list.push({
        y: BAR.y1,
        fn: () => {
          p.alpha(1 - this.bar.broken);
          drawBoneBarricade(p, (BAR.x0 + BAR.x1) / 2 - cx, BAR.y0 - cy, BAR.y1 - cy, this.bar.hp / 3, this.bar.shake);
          p.alpha(1);
        },
      });
    }
    if (!this.nest.dead && onScreen(hub, NEST.x, NEST.y, 60)) {
      list.push({
        y: NEST.y,
        fn: () => {
          drawBoneNest(p, NEST.x - cx, NEST.y - cy, t, this.nest.hp / NEST.hp, this.nest.flash);
          drawPips(p, NEST.x - cx, NEST.y - cy - 34, this.nest.hp, NEST.hp);
        },
      });
    }
    for (const s of this.sk) {
      if (!onScreen(hub, s.x, s.y)) continue;
      list.push({
        y: s.y,
        fn: () => {
          if (s.dead) p.alpha(Math.max(0, s.fade));
          const draw: 'run' | 'tele' | 'air' | 'rest' = s.st === 'idle' ? 'run' : s.st === 'stun' ? 'rest' : s.st;
          drawSkitter(p, s.x - cx, s.y - cy, t, s.seed, draw);
          if (s.flash > 0) p.ellipse(s.x - cx, s.y - cy - 5, 5, 3, C.white);
          if (s.st === 'stun') for (let i = 0; i < 3; i++) p.px(s.x - cx + Math.cos(t * 4 + i * 2.1) * 6, s.y - cy - 13 + Math.sin(t * 4 + i * 2.1) * 2, '#ffe9a0');
          if (s.dead) p.alpha(1);
          else if (s.hp < 2) drawPips(p, s.x - cx, s.y - cy - 16, s.hp, 2);
        },
      });
    }
  }
}
