import { burst, makeFlower } from '../../core/art';
import { drawMimic, type MimicState } from '../../core/art2';
import { D } from '../../core/difficulty';
import { C } from '../../core/palette';
import { clamp, dist, lerp, smooth, TAU, unlerp } from '../../core/util';
import type { ArenaDef } from '../land';
import { drawMimicQueen } from '../bossart';
import type { Drawable, Hub, Lance, Nova, Rect } from '../types';
import { onScreen } from '../zones/parts';
import { Guardian } from './base';
import { whip } from './draw';

/**
 * The Mimic Queen: a flower the size of a tree with a lure that glows like the real thing.
 *   She spits seeds that grow into mimic blooms (friendly flowers with teeth), fires petals in rings and spirals, and
 *   sends roots up under your feet. Then she dangles her lure and breathes in: the floor pulls you toward her maw.
 *   Resist the pull and she is left with her mouth open and her lure on the ground: that is the moment to strike it.
 */

const ACCENT = '#ff8aa8';
/** how far in front of her the lure lies when it falls (it used to lie at her mouth, a long way from where the pull left you) */
const LURE_DOWN = 30;
/** how close a Lance or a pulse must come to the fallen lure */
const LURE_LANCE_R = 22;
const LURE_PULSE_R = 32;
const PETAL = '#7fd8f5';

type Step =
  | { k: 'seeds'; n: number }
  | { k: 'rings'; n: number }
  | { k: 'spiral'; secs: number }
  | { k: 'fan'; n: number }
  | { k: 'vines'; n: number }
  | { k: 'wait'; secs: number }
  | { k: 'pull'; secs: number; spd: number; extra?: 'ring' | 'vines' }
  | { k: 'exposed'; secs: number };

const SCRIPTS: Step[][] = [
  [{ k: 'seeds', n: 4 }, { k: 'wait', secs: 1.2 }, { k: 'rings', n: 3 }, { k: 'wait', secs: 0.9 }, { k: 'pull', secs: 1.9, spd: 40 }, { k: 'exposed', secs: 4.4 }],
  [{ k: 'seeds', n: 5 }, { k: 'spiral', secs: 3.4 }, { k: 'vines', n: 3 }, { k: 'wait', secs: 0.8 }, { k: 'pull', secs: 2.1, spd: 46, extra: 'ring' }, { k: 'exposed', secs: 4.2 }],
  [{ k: 'seeds', n: 6 }, { k: 'fan', n: 3 }, { k: 'rings', n: 2 }, { k: 'vines', n: 4 }, { k: 'pull', secs: 2.3, spd: 52, extra: 'vines' }, { k: 'exposed', secs: 3.8 }],
];

interface Bloom {
  x: number;
  y: number;
  st: 'sprout' | 'idle' | 'twitch' | 'snap' | 'pop';
  t: number;
  ttl: number;
  hit: boolean;
}

let flowerImg: HTMLCanvasElement | null = null;

export class MimicQueen extends Guardian {
  protected introLen = 4.4;
  protected dyingLen = 3.8;
  qx: number;
  qy: number;
  private sink = 1;
  private open = 0;
  private bloomT = 0;
  private blooms: Bloom[] = [];
  private si = 0;
  private stT = 0;
  private stInit = false;
  private spiralA = 0;
  private spiralN = 0;
  private pulling = false;
  private pullSpd = 0;
  private lure = { x: 0, y: 0, glow: 0, down: 0 };
  private exposed = false;
  private hitDone = false;
  private bite = 0;
  private extraDone = false;
  private wilt = 0;
  private swirl = 0;

  constructor(hub: Hub, a: ArenaDef, onVictory: () => void) {
    super(hub, a, 'Mimic Queen', 'follow the glow', ACCENT, [2, 3, 3], onVictory);
    this.qx = a.x;
    this.qy = a.boss.y + 36;
    this.lure = { x: this.qx - 8, y: this.qy - 66, glow: 0.5, down: 0 };
    if (!flowerImg) flowerImg = makeFlower(true);
  }

  private maw() {
    return { x: this.qx, y: this.qy - 66 };
  }

  focus() {
    return { x: this.qx, y: this.qy - 50 };
  }

  lanceTarget() {
    return this.exposed && !this.hitDone ? { x: this.lure.x, y: this.lure.y } : null;
  }

  colliders(): Rect[] {
    return [{ x0: this.qx - 10, x1: this.qx + 10, y0: this.qy - 6, y1: this.qy + 3 }];
  }

  /* ---------------------------------------------------------------- */
  /* entrance                                                          */
  /* ---------------------------------------------------------------- */

  protected onIntro() {
    this.sink = 1;
    this.open = 0;
    this.blooms = [];
    this.hub.audio.setDrone(0.12, 1.5);
    const v = this.hub.audio.v;
    v.mimicHum();
    window.setTimeout(() => v.mimicLaugh(), 2800);
    window.setTimeout(() => v.mimicSnarl(), 3500);
    window.setTimeout(() => this.hub.ui.speech('come and smell the flowers', 2400, ACCENT), 1500);
  }

  protected updateIntro(dt: number) {
    const hub = this.hub;
    this.sink = 1 - smooth(unlerp(0.5, 2.6, this.st));
    this.open = smooth(unlerp(3.0, 3.8, this.st));
    if (this.st > 0.5 && this.st < 2.6 && Math.random() < dt * 14) burst(hub.parts, this.qx + (Math.random() - 0.5) * 50, this.qy - 2, 1, [PETAL, '#2e7d4f', '#5bbf6a'], 24, 1);
    this.lure.glow = this.open;
    hub.camFocus = this.focus();
  }

  /* ---------------------------------------------------------------- */
  /* phases                                                            */
  /* ---------------------------------------------------------------- */

  protected startPhase() {
    const hub = this.hub;
    this.hz.clear();
    this.shots.clear();
    this.sink = 0;
    this.si = 0;
    this.stInit = false;
    this.pulling = false;
    this.exposed = false;
    this.hitDone = false;
    this.blooms.forEach((b) => (b.st = 'pop'));
    if (this.phase > 0) {
      hub.audio.v.mimicSnarl();
      hub.shake(8);
      hub.ui.flash(0.35, 260);
      hub.ui.speech(this.phase === 1 ? 'dance with me' : 'you smell so sweet', 2200, ACCENT);
    }
  }

  protected restartPhase() {
    this.si = 0;
    this.stInit = false;
    this.pulling = false;
    this.exposed = false;
    this.hitDone = false;
    this.open = 0.5;
    this.blooms.forEach((b) => (b.st = 'pop'));
  }

  protected onHurt() {
    this.hub.audio.v.mimicSnarl();
    this.exposed = false;
    this.hitDone = true;
    // she snaps her mouth shut, and the script goes on from the start
    this.si = 0;
    this.stInit = false;
    this.open = 0.6;
  }

  /* ---------------------------------------------------------------- */
  /* script                                                            */
  /* ---------------------------------------------------------------- */

  protected updateFight(dt: number) {
    const hub = this.hub;
    hub.camFocus = this.focus();
    this.updateBlooms(dt);
    this.pushOut(dt);
    this.bloomT += dt;
    // the lure sways; it glows when it is about to pull
    const sway = Math.sin(this.t * 2.2) * 3;
    // (exposed, her lure falls forward onto the ground in front of her, toward you: close enough to reach in time)
    const tx = this.exposed ? this.qx - 6 : this.pulling ? this.qx - 3 + Math.sin(this.t * 6) * 7 : this.qx - 8 + sway;
    const ty = this.exposed ? this.qy + LURE_DOWN : this.pulling ? this.qy - 56 + Math.cos(this.t * 7) * 3 : this.qy - 66 + Math.cos(this.t * 2.6) * 2;
    this.lure.x += (tx - this.lure.x) * (1 - Math.exp(-(this.exposed ? 7 : 12) * dt));
    this.lure.y += (ty - this.lure.y) * (1 - Math.exp(-(this.exposed ? 7 : 12) * dt));
    this.lure.glow += ((this.pulling ? 1.3 : this.exposed ? 1 : 0.55) - this.lure.glow) * (1 - Math.exp(-6 * dt));

    const script = SCRIPTS[this.phase]!;
    const step = script[this.si % script.length]!;
    this.stT += dt;
    if (!this.stInit) {
      this.stInit = true;
      this.stT = 0;
      this.enterStep(step);
    }
    if (this.updateStep(step, dt)) {
      this.si++;
      if (this.si >= script.length) this.si = 0;
      this.stInit = false;
    }
    // her maw opens a little when she attacks
    const want = this.exposed ? 1 : this.pulling ? 0.85 : step.k === 'rings' || step.k === 'spiral' || step.k === 'fan' ? 0.7 : 0.35;
    this.open += (want - this.open) * (1 - Math.exp(-6 * dt));
    this.swirl += dt;
  }

  private enterStep(s: Step) {
    const hub = this.hub;
    this.extraDone = false;
    this.spiralN = 0;
    this.spiralA = Math.random() * TAU;
    if (s.k === 'seeds') hub.audio.v.mimicLaugh();
    else if (s.k === 'rings' || s.k === 'fan') hub.audio.v.mimicHum([660, 587.33, 523.25]);
    else if (s.k === 'pull') {
      this.pulling = true;
      this.pullSpd = s.spd * D.speed;
      this.bite = 0;
      hub.audio.v.mimicHum([523.25, 659.25, 783.99, 659.25]);
      hub.audio.whoosh();
      hub.ui.speech('follow the glow', 1600, ACCENT);
    } else if (s.k === 'exposed') {
      if (this.skipExposed) return;
      this.pulling = false;
      this.exposed = true;
      this.hitDone = false;
      if (this.downN < 3) {
        this.downN++;
        hub.ui.hint('her lure is down: hit it!');
        window.setTimeout(() => hub.ui.hintIs('her lure is down: hit it!') && hub.ui.hint(null), 3000);
      }
      hub.audio.v.mimicSnarl();
      hub.audio.chime();
      hub.ui.flash(0.25, 200);
    }
  }

  /** returns true when the step is finished */
  private updateStep(s: Step, dt: number): boolean {
    const hub = this.hub;
    const pl = this.pl;
    const T = this.stT;
    switch (s.k) {
      case 'wait':
        return T >= s.secs;
      case 'seeds': {
        const every = 0.3 / D.speed;
        const done = Math.floor(T / every);
        while (this.spiralN < Math.min(s.n, done + 1)) {
          this.throwSeed();
          this.spiralN++;
        }
        return T >= s.n * every + 1.1;
      }
      case 'rings': {
        const every = 0.85 / D.speed;
        while (this.spiralN < Math.min(s.n, Math.floor(T / every) + 1)) {
          this.petalRing(this.spiralN);
          this.spiralN++;
        }
        return T >= s.n * every + 0.9;
      }
      case 'spiral': {
        const every = 0.12 / D.speed;
        while (this.spiralN < Math.floor(T / every)) {
          const m = this.maw();
          const a = this.spiralA + this.spiralN * 0.42;
          for (const off of [0, Math.PI]) this.shots.add({ x: m.x, y: m.y, vx: Math.cos(a + off) * 64 * D.speed, vy: Math.sin(a + off) * 64 * D.speed * 0.9, kind: 'petal', r: 3, life: 5, pulsable: true });
          if (this.spiralN % 3 === 0) hub.audio.snap();
          this.spiralN++;
        }
        return T >= s.secs;
      }
      case 'fan': {
        const every = 1.1 / D.speed;
        while (this.spiralN < Math.min(s.n, Math.floor(T / every) + 1)) {
          const m = this.maw();
          const a0 = Math.atan2(pl.y - 6 - m.y, pl.x - m.x);
          for (let i = -3; i <= 3; i++) this.shots.add({ x: m.x, y: m.y, vx: Math.cos(a0 + i * 0.3) * 96 * D.speed, vy: Math.sin(a0 + i * 0.3) * 96 * D.speed, kind: 'petal', r: 3, life: 4, pulsable: true });
          hub.audio.snap();
          this.spiralN++;
        }
        return T >= s.n * every + 0.9;
      }
      case 'vines': {
        const every = 0.9 / D.speed;
        while (this.spiralN < Math.min(s.n, Math.floor(T / every) + 1)) {
          this.vineTrail();
          this.spiralN++;
        }
        return T >= s.n * every + 1.4;
      }
      case 'pull': {
        this.suck(dt);
        if (s.extra && !this.extraDone && T > s.secs * 0.45) {
          this.extraDone = true;
          if (s.extra === 'ring') this.petalRing(1);
          else this.vineTrail();
        }
        if (T >= s.secs || this.bite > 0) {
          this.pulling = false;
          // a bite ends the pull with no reward; otherwise her mouth stays open
          if (this.bite > 0) {
            this.open = 0.4;
            this.stT = 0;
            this.si += 0; // the step after pull is the exposed window; skip it when she bit you
            this.skipExposed = true;
          }
          return true;
        }
        return false;
      }
      case 'exposed': {
        if (this.skipExposed) {
          this.skipExposed = false;
          this.exposed = false;
          return true;
        }
        if (T >= s.secs * D.window || this.hitDone) {
          this.exposed = false;
          hub.audio.v.mimicLaugh();
          return true;
        }
        return false;
      }
    }
  }
  private skipExposed = false;
  private downN = 0;

  /* ---------------------------------------------------------------- */
  /* attacks                                                           */
  /* ---------------------------------------------------------------- */

  private throwSeed() {
    const hub = this.hub;
    const pl = this.pl;
    const m = this.maw();
    // land somewhere around you, never on you
    const a = Math.random() * TAU;
    const d = 30 + Math.random() * 60;
    let tx = pl.x + Math.cos(a) * d;
    let ty = pl.y + Math.sin(a) * d * 0.7;
    for (let i = 0; i < 6 && !hub.land.isWalk(tx, ty); i++) {
      tx = lerp(tx, this.a.x, 0.3);
      ty = lerp(ty, this.a.y, 0.3);
    }
    const T = 0.85;
    const g = 150;
    const vx = (tx - m.x) / T;
    const vy = (ty - m.y - 0.5 * g * T * T) / T;
    hub.audio.pop();
    this.shots.add({ x: m.x, y: m.y, vx, vy, kind: 'seed', r: 2, life: T, gravity: g, dmg: 0, onDie: (s) => this.plant(tx, ty, s) });
  }

  private plant(x: number, y: number, _s: unknown) {
    if (this.state !== 'fight' && this.state !== 'intro') return;
    if (!this.hub.land.isWalk(x, y)) return;
    this.blooms = this.blooms.filter((b) => b.st !== 'pop');
    if (this.blooms.length >= 14) this.blooms.shift();
    this.blooms.push({ x, y, st: 'sprout', t: 0, ttl: 9, hit: false });
    burst(this.hub.parts, x, y - 2, 5, [PETAL, '#2e7d4f', '#5bbf6a'], 20, 1);
  }

  private petalRing(i: number) {
    const hub = this.hub;
    const pl = this.pl;
    const m = this.maw();
    const n = 14;
    const toPl = Math.atan2(pl.y - m.y, pl.x - m.x);
    const gap = toPl + (i % 2 ? 0.6 : -0.6);
    const a0 = Math.random() * 0.4;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU;
      let da = a - gap;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      if (Math.abs(da) < 0.42) continue;
      this.shots.add({ x: m.x, y: m.y, vx: Math.cos(a) * 70 * D.speed, vy: Math.sin(a) * 70 * D.speed * 0.9, kind: 'petal', r: 3, life: 5, pulsable: true });
    }
    hub.audio.snap();
    hub.audio.v.mimicHum([587.33]);
  }

  /** roots burst up along the way you are going */
  private vineTrail() {
    const hub = this.hub;
    const pl = this.pl;
    let dx = pl.vx;
    let dy = pl.vy;
    const l = Math.hypot(dx, dy);
    if (l < 8) {
      dx = Math.random() - 0.5;
      dy = Math.random() - 0.5;
    }
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    for (let i = 0; i < 3; i++) {
      const x = pl.x + dx * (22 + i * 30);
      const y = pl.y + dy * (22 + i * 30);
      if (!hub.land.isWalk(x, y)) continue;
      this.hz.add({
        kind: 'disc',
        x,
        y,
        r: 16,
        warn: (0.85 + i * 0.32) * D.tele,
        live: 0.22,
        col: 'green',
        onLive: () => {
          hub.audio.snap();
          burst(hub.parts, x, y - 2, 8, ['#2e7d4f', '#5bbf6a', '#0e5a44'], 40, 1);
        },
      });
    }
    hub.audio.warnPing();
  }

  /** the suction: the floor slides you toward her mouth */
  private suck(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    const m = this.maw();
    const dx = m.x - pl.x;
    const dy = m.y + 50 - pl.y;
    const d = Math.hypot(dx, dy) || 1;
    if (pl.dead > 0 || pl.hide) return;
    const nx = pl.x + (dx / d) * this.pullSpd * dt;
    const ny = pl.y + (dy / d) * this.pullSpd * dt;
    if (hub.canStand(nx, pl.y)) pl.x = nx;
    if (hub.canStand(pl.x, ny)) pl.y = ny;
    if (Math.floor(this.t * 14) !== Math.floor((this.t - dt) * 14)) burst(hub.parts, lerp(pl.x, m.x, Math.random() * 0.4), lerp(pl.y, m.y, Math.random() * 0.4), 1, [PETAL, '#ffffff'], 10, 0);
    // the maw: if she gets you, she bites
    if (d < 26 && this.bite === 0) {
      this.bite = 1;
      hub.hurt(m.x, m.y + 30, 1);
      hub.audio.snap();
      hub.audio.v.mimicSnarl();
      hub.shake(6);
    }
  }

  private pushOut(dt: number) {
    const pl = this.pl;
    if (this.sink > 0.5 || pl.dead > 0) return;
    if (Math.abs(pl.x - this.qx) < 16 && pl.y > this.qy - 8 && pl.y < this.qy + 5 && this.hub.canStand(pl.x, pl.y + 90 * dt)) pl.y += 90 * dt;
  }

  private updateBlooms(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      const b = this.blooms[i]!;
      b.t += dt;
      b.ttl -= dt;
      if (b.st === 'sprout' && b.t > 0.6) {
        b.st = 'idle';
        b.t = 0;
      } else if (b.st === 'idle') {
        const near = Math.abs(pl.x - b.x) < 21 && Math.abs(pl.y - b.y) < 15 && pl.dead <= 0 && !pl.hide;
        if (near) {
          b.st = 'twitch';
          b.t = 0;
          hub.audio.warnPing();
        } else if (b.ttl <= 0) b.st = 'pop';
      } else if (b.st === 'twitch' && b.t > 0.32 * D.tele) {
        b.st = 'snap';
        b.t = 0;
        hub.audio.snap();
        if (Math.abs(pl.x - b.x) < 19 && Math.abs(pl.y - b.y) < 14 && pl.dead <= 0 && !pl.hide) hub.hurt(b.x, b.y, 1);
      } else if (b.st === 'snap' && b.t > 0.4) b.st = 'pop';
      if (b.st === 'pop') {
        burst(hub.parts, b.x, b.y - 4, 8, [PETAL, '#ffffff', '#5bbf6a'], 36, 1);
        this.blooms.splice(i, 1);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* being hit                                                         */
  /* ---------------------------------------------------------------- */

  private hurtLure(): boolean {
    if (!this.exposed || this.hitDone) return false;
    if (this.damage(1, this.lure.x, this.lure.y)) {
      this.hitDone = true;
      return true;
    }
    return false;
  }

  onPulse(x: number, y: number, R: number) {
    this.shots.clearIn(x, y, R + 2, true);
    for (const b of this.blooms) {
      if (b.st !== 'pop' && dist(x, y, b.x, b.y - 4) <= R + 6) {
        b.st = 'pop';
        this.hub.addLight(0.12);
        this.hub.audio.kill();
      }
    }
    if (this.exposed && !this.hitDone && this.pulseReach(this.lure.x, this.lure.y, R, x, y, LURE_PULSE_R)) this.hurtLure();
    else if (!this.exposed && this.state === 'fight' && this.pulseReach(this.qx, this.qy - 30, R, x, y, 34)) this.notYet();
  }

  /** you hit her when she cannot be hurt: say how she can be (the first times), and let the petals ring */
  private notYet() {
    const now = this.t;
    if (now - this.notYetT < 1.2) return;
    this.notYetT = now;
    this.hub.audio.v.glassPing(1.3);
    if (this.notYetN < 2) {
      this.notYetN++;
      this.hub.ui.caption('her petals turn it aside. only her lure can be hurt, when it falls.', 3200);
    }
  }
  private notYetT = -9;
  private notYetN = 0;

  onLance(l: Lance): boolean {
    for (const b of this.blooms) {
      if (b.st !== 'pop' && dist(l.x, l.y, b.x, b.y - 4) < 8) {
        b.st = 'pop';
        this.hub.audio.kill();
      }
    }
    this.shots.clearIn(l.x, l.y, 7, true);
    if (this.exposed && !this.hitDone && dist(l.x, l.y, this.lure.x, this.lure.y) < LURE_LANCE_R) {
      this.hurtLure();
      return true;
    }
    // her petals turn a lance aside, unless the lure is out in the open
    const lureOut = this.exposed && !this.hitDone;
    if (!lureOut && this.sink < 0.5 && Math.abs(l.x - this.qx) < 38 && l.y > this.qy - 124 && l.y < this.qy - 30) {
      burst(this.hub.parts, l.x, l.y, 5, [PETAL, '#ffffff'], 40, 0);
      this.notYet();
      return true;
    }
    return false;
  }

  onNova(n: Nova) {
    this.shots.clearIn(n.x, n.y, n.R);
    for (const b of this.blooms) if (b.st !== 'pop' && Math.hypot(n.x - b.x, (n.y - b.y) / 0.72) <= n.R) b.st = 'pop';
    if (this.state !== 'fight') return;
    // a Nova opens her up whatever she was doing
    if (Math.hypot(n.x - this.qx, (n.y - (this.qy - 30)) / 0.72) <= n.R + 40 && this.pulling) {
      this.pulling = false;
      this.si = (SCRIPTS[this.phase]!.length - 1) % SCRIPTS[this.phase]!.length;
      this.stInit = false;
    }
    if (this.exposed && !this.hitDone && Math.hypot(n.x - this.lure.x, (n.y - this.lure.y) / 0.72) <= n.R + 20) this.hurtLure();
  }

  /* ---------------------------------------------------------------- */
  /* dying                                                             */
  /* ---------------------------------------------------------------- */

  protected onDie() {
    this.exposed = false;
    this.pulling = false;
    this.blooms.forEach((b) => (b.st = 'pop'));
    this.hub.audio.v.mimicSnarl();
    this.hub.audio.v.mimicHum([392, 349.23, 329.63, 293.66]);
    this.hub.ui.speech('i only wanted you to stay', 2800, ACCENT);
  }

  protected updateDying(dt: number) {
    const hub = this.hub;
    const u = this.st / this.dyingLen;
    this.wilt = smooth(unlerp(0.2, 0.8, u));
    this.open = Math.max(0, 1 - u * 1.4);
    this.lure.glow = Math.max(0, 1 - u * 1.5);
    this.sink = Math.max(this.sink, smooth(unlerp(0.55, 1, u)) * 0.95);
    if (Math.random() < dt * 40) burst(hub.parts, this.qx + (Math.random() - 0.5) * 80, this.qy - 40 - Math.random() * 70, 2, [PETAL, '#ffffff', ACCENT, '#2d7da0'], 40, 1, 90);
    hub.camFocus = this.focus();
  }

  /* ---------------------------------------------------------------- */
  /* drawing                                                           */
  /* ---------------------------------------------------------------- */

  ground() {
    const hub = this.hub;
    const p = hub.p;
    const cx = hub.camX;
    const cy = hub.camY;
    this.hz.draw(p, cx, cy, hub.time);
    // the pull: petals streaming into her mouth
    if (this.pulling) {
      const m = this.maw();
      const pl = this.pl;
      for (let i = 0; i < 14; i++) {
        const u = ((this.swirl * 1.2 + i / 14) % 1);
        const a = (i / 14) * TAU + this.swirl * 0.8;
        const r = (1 - u) * 90;
        const x = m.x + Math.cos(a) * r - cx;
        const y = m.y + 48 + Math.sin(a) * r * 0.6 - cy;
        p.alpha(0.6 * u);
        p.rect(x, y, 2, 1, i % 2 ? PETAL : '#ffd0e0');
      }
      p.alpha(0.5);
      p.line(pl.x - cx, pl.y - cy - 6, lerp(pl.x, m.x, 0.25) - cx, lerp(pl.y, m.y + 50, 0.25) - cy, '#ffd0e0', 1);
      p.alpha(1);
    }
  }

  push(list: Drawable[]) {
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    for (const b of this.blooms) {
      if (!onScreen(hub, b.x, b.y)) continue;
      list.push({
        y: b.y,
        fn: () => {
          const sx = b.x - cx;
          const sy = b.y - cy;
          const grow = b.st === 'sprout' ? clamp(b.t / 0.6, 0.2, 1) : 1;
          p.dither(sx, sy - 2, 9, 4.5, C.flower, 0.3 * (0.6 + 0.4 * Math.sin(t * 2 + b.x)));
          const near = dist(b.x, b.y, this.pl.x, this.pl.y) < 100;
          const st: MimicState = b.st === 'twitch' ? 'twitch' : b.st === 'snap' ? 'snap' : 'idle';
          if (grow < 1) p.alpha(grow);
          drawMimic(p, flowerImg!, sx, sy + (1 - grow) * 6, st, t, near);
          p.alpha(1);
        },
      });
    }
    const fade = this.state === 'dying' ? clamp(1 - (this.st - 2.2) / 1.4, 0, 1) : 1;
    if (fade <= 0.01) return;
    list.push({
      y: this.qy,
      fn: () => {
        const x = this.qx - cx;
        const y = this.qy - cy;
        p.dither(x, y, 26, 7, '#02050a', 0.6);
        drawMimicQueen(p, x, y, t, { open: this.open, flash: this.flash > 0.12, lure: false, sink: this.sink, fade });
        if (this.sink > 0.8) return;
        // her lure: a stalk from her crown to a glowing bulb
        const stemX = x + 10;
        const stemY = y - 96;
        const lx = this.lure.x - cx;
        const ly = this.lure.y - cy;
        whip(p, stemX, stemY, lx, ly, { bow: this.exposed ? 20 : 12, wig: this.pulling ? 3 : 1, t, th: 4, col: '#0e5a44', hi: '#2aa070', n: 16 });
        const g = this.lure.glow;
        const pulse = 1 + 0.25 * Math.sin(t * (this.pulling ? 12 : 5));
        p.dither(lx, ly, 10 * g * pulse, 8 * g * pulse, '#ffd0e0', 0.35);
        p.ellipse(lx, ly, 4, 4, '#ff8aa8');
        p.ellipse(lx - 1, ly - 1, 2, 2, '#ffffff');
        if (this.exposed && !this.hitDone) {
          const k = 0.5 + 0.5 * Math.sin(t * 10);
          p.alpha(0.5 + 0.4 * k);
          p.ring(lx, ly, 11 + k * 3, 9 + k * 2, 1, '#ffe9a0');
          p.alpha(1);
        }
      },
    });
  }

  overlay() {
    const hub = this.hub;
    this.shots.draw(hub.p, hub.camX, hub.camY, hub.time);
  }
}

void unlerp;
