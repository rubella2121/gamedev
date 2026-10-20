import * as THREE from 'three';
import { D } from '../../core/difficulty';
import { clamp, lerp, smooth, TAU } from '../../core/util';
import { ARENA_R } from '../arena';
import type { Danger, Env, Weak } from '../fight';
import { BELL_R } from '../models/mash-shapes';
import { EYE_POS, MASH_S, MASH_Z, SHELL_DOCK } from '../models/mash-layout';
import type { MashModel } from '../models/mash';
import * as P from '../models/mash-poses';
import { newCtrl, TAIL_LMAX, type TailCtrl } from '../models/mash-tail';
import { RING_SEGS, type BeamFX, type BlobFX, type FanFX, type LaneFX, type PuddleFX, type RingFX, type ShockFX, type WindFX } from './mash-fx';

/**
 * Every attack of the Mash is a small object that runs by itself: it starts, plays its telegraph, hurts, and ends. A phase
 * is a script that starts them one after another (or two together). They share a `Hub`: the fight, the model and the
 * effects. Hazards are only ever created here, with a telegraph first, and every one of them is listed in `dangers()`.
 */

export interface MashFx {
  rings: RingFX;
  fan: FanFX;
  lanes: LaneFX[];
  puddles: PuddleFX;
  blobs: BlobFX;
  shocks: ShockFX;
  beam: BeamFX;
  wind: WindFX;
}

export interface Hub {
  env: Env;
  model: MashModel;
  fx: MashFx;
  /** how much quicker this round is (1 = the first; each hit takes about a tenth off) */
  k: number;
  /** what the tail should do this frame (the runner that owns the tail writes it) */
  tail: TailCtrl;
  tailDriven: boolean;
  say(line: string, ms?: number): void;
}

export interface Runner {
  readonly kind: string;
  /** nothing of it is left on the floor */
  done: boolean;
  /** the script may start the next attack */
  soft: boolean;
  update(dt: number): void;
  dangers(out: Danger[]): void;
  weak(out: Weak[]): void;
  /** end it now and clean up its effects */
  stop(): void;
  /** its weak point was hit */
  struck?(): void;
}

/** the middle of the bell: where the rings begin and the sweep pivots */
export const BELL_C = { x: 0, z: MASH_Z };
export const BELL_WR = BELL_R * MASH_S;
const RING_R0 = BELL_WR + 0.2;
const RING_STEP = TAU / RING_SEGS;
const SHELL_WR = 3.4 * MASH_S;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function arenaClamp(x: number, z: number, r: number): [number, number] {
  const d = Math.hypot(x, z);
  if (d > r) return [(x / d) * r, (z / d) * r];
  return [x, z];
}

/* ================================================================ */
/* the bell tolls: rings with a gap                                   */
/* ================================================================ */

export interface VolleyOpts {
  n: number;
  echo: boolean;
  /** gap width in 3-degree steps */
  gapN: number;
  /** seconds between tolls */
  space: number;
  speed: number;
}

interface LiveRing {
  slot: number;
  r: number;
  warn: number;
  warn0: number;
  hit: boolean;
}

export class VolleyRunner implements Runner {
  readonly kind = "volley";
  done = false;
  soft = false;
  private t = 0;
  private spawned = 0;
  private echoDue = 0;
  private echoDone = false;
  private rings: LiveRing[] = [];
  private side = Math.random() < 0.5 ? -1 : 1;
  private lastGap: number | null = null;
  private tolls = 0;

  constructor(
    private h: Hub,
    private o: VolleyOpts,
  ) {
    this.echoDue = (o.n - 1) * o.space + 0.85 * o.space;
  }

  private spawn(echo: boolean) {
    const { h, o } = this;
    const fx = h.fx.rings;
    const slot = fx.free();
    if (slot < 0) return;
    const s = fx.slots[slot]!;
    const pl = h.env.p;
    const d = Math.max(10, Math.hypot(pl.x - BELL_C.x, pl.z - BELL_C.z));
    const th = Math.atan2(pl.x - BELL_C.x, pl.z - BELL_C.z);
    // the gap is near where you are, but not on you: a few steps to one side, the other side next time
    const shift = echo ? 3.6 : 5.4;
    const base = this.lastGap === null ? th : this.lastGap;
    let g = base + this.side * (shift / d);
    if (Math.abs(g) > 0.7) {
      this.side = -this.side;
      g = base + this.side * (shift / d);
    }
    g = clamp(g, -0.7, 0.7);
    this.side = -this.side;
    this.lastGap = g;
    s.on = true;
    s.cx = BELL_C.x;
    s.cz = BELL_C.z;
    s.r = RING_R0;
    s.thick = 2.4;
    s.gapN = o.gapN;
    s.gap0 = ((Math.round(g / RING_STEP - o.gapN / 2) % RING_SEGS) + RING_SEGS) % RING_SEGS;
    s.alpha = 0.2;
    s.hot = 1;
    const warn = 0.55 * D.tele;
    this.rings.push({ slot, r: RING_R0, warn, warn0: warn, hit: false });
    // the toll
    this.tolls++;
    h.model.toll = 1;
    h.env.audio.v.queenToll(0.8 + (this.tolls % 3) * 0.14, 0.8);
    h.env.shake(0.35);
    h.fx.shocks.add(BELL_C.x, BELL_C.z, 12, 0xffd870, 0.7);
  }

  update(dt: number) {
    const { o, h } = this;
    this.t += dt;
    while (this.spawned < o.n && this.t >= this.spawned * o.space) {
      this.spawn(false);
      this.spawned++;
    }
    if (o.echo && !this.echoDone && this.spawned >= o.n && this.t >= this.echoDue) {
      this.echoDone = true;
      this.spawn(true);
    }
    const pl = h.env.p;
    const fx = h.fx.rings;
    const speed = o.speed * D.speed;
    let allFar = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      const s = fx.slots[r.slot]!;
      if (r.warn > 0) {
        r.warn -= dt;
        s.alpha = 0.25 + 0.75 * (1 - Math.max(0, r.warn) / r.warn0);
        s.hot = 1;
        allFar = false;
      } else {
        r.r += speed * dt;
        s.r = r.r;
        s.alpha = clamp((50 - r.r) / 8, 0, 1);
        s.hot = Math.max(0, s.hot - dt * 3);
        if (r.r < 30) allFar = false;
        // it hurts where the band is and the gap is not
        if (!r.hit && !pl.dead) {
          const d = Math.hypot(pl.x - s.cx, pl.z - s.cz);
          if (Math.abs(d - r.r) < s.thick * 0.5 + 0.42 && !fx.inGap(s, pl.x, pl.z)) {
            r.hit = true;
            h.env.hurt(pl.x - s.cx, pl.z - s.cz);
          }
        }
        if (r.r > 52) {
          s.on = false;
          this.rings.splice(i, 1);
        }
      }
    }
    const allOut = this.spawned >= o.n && (!o.echo || this.echoDone);
    this.soft = allOut && allFar;
    this.done = allOut && this.rings.length === 0;
  }

  dangers(out: Danger[]) {
    const { h, o } = this;
    const pl = h.env.p;
    const fx = h.fx.rings;
    const speed = o.speed * D.speed;
    const dist = Math.hypot(pl.x - BELL_C.x, pl.z - BELL_C.z);
    const th = Math.atan2(pl.x - BELL_C.x, pl.z - BELL_C.z);
    for (const r of this.rings) {
      const s = fx.slots[r.slot]!;
      for (let k = 0; k < 7; k++) {
        const tau = 0.12 + k * 0.22;
        const R = r.warn > 0 ? (tau < r.warn ? RING_R0 : RING_R0 + speed * (tau - r.warn)) : r.r + speed * tau;
        if (Math.abs(R - dist) > 13) continue;
        const half = 13 / R;
        const step = 2.0 / R;
        for (let a = th - half; a <= th + half; a += step) {
          // is this bearing in the gap? (the arc round the middle of the arena is all there is)
          let kk = a / RING_STEP - s.gap0;
          kk = ((kk % RING_SEGS) + RING_SEGS) % RING_SEGS;
          if (kk < s.gapN) continue;
          out.push({ shape: 'disc', x: BELL_C.x + Math.sin(a) * R, z: BELL_C.z + Math.cos(a) * R, r: 1.5, at: Math.max(0, tau - 0.1), dur: 0.22 });
        }
      }
    }
  }

  weak() {}

  stop() {
    for (const r of this.rings) this.h.fx.rings.slots[r.slot]!.on = false;
    this.rings.length = 0;
    this.done = true;
    this.soft = true;
  }
}

/* ================================================================ */
/* the eye: stand still                                               */
/* ================================================================ */

export class WatchRunner implements Runner {
  readonly kind = "watch";
  done = false;
  soft = false;
  private t = 0;
  private seen = 0;
  private cd = 0.6;
  private beam: { t: number; x: number; z: number; fired: boolean; T: number } | null = null;
  private eyeW = new THREE.Vector3();

  constructor(
    private h: Hub,
    private secs: number,
  ) {
    h.say('be still.', 1800);
    h.env.audio.v.queenChoir(0.6);
  }

  private eyePos(out: THREE.Vector3) {
    return this.h.model.toWorld(_w.copy(EYE_POS), out);
  }

  update(dt: number) {
    const { h } = this;
    const pl = h.env.p;
    this.t += dt;
    const m = h.model;
    m.eyeOpen += (1 - m.eyeOpen) * (1 - Math.exp(-6 * dt));
    m.lookAt(pl.x, 1.2, pl.z);
    this.cd -= dt;
    // it sees what moves
    const moving = Math.hypot(pl.vx, pl.vz) > 2.6;
    this.seen = moving ? this.seen + dt : Math.max(0, this.seen - dt * 2.4);
    if (!this.beam && this.seen > 0.42 && this.cd <= 0 && !pl.dead && this.t < this.secs - 0.5) {
      const T = 0.62 * D.tele;
      const [x, z] = arenaClamp(pl.x + pl.vx * 0.22, pl.z + pl.vz * 0.22, ARENA_R - 0.6);
      this.beam = { t: 0, x, z, fired: false, T };
      this.seen = 0;
      h.env.audio.warnPing();
    }
    const b = this.beam;
    if (b) {
      b.t += dt;
      const eye = this.eyePos(this.eyeW);
      const u = clamp(b.t / b.T, 0, 1);
      if (b.t < b.T) {
        h.env.arena.marks.set(12, true, b.x, b.z, 1.6, { fill: 0.2 + 0.4 * u, hot: u > 0.7 && Math.floor(h.env.time * 12) % 2 === 0, col: 0xff4a8a });
        h.fx.beam.set(eye.x, eye.y, eye.z, b.x, 0.1, b.z, 0.0, 0.5 + 0.5 * u);
      } else {
        if (!b.fired) {
          b.fired = true;
          h.env.audio.v.queenShriek(0.4);
          h.env.shake(0.4);
          h.env.arena.burst3(b.x, 0.5, b.z, 8, [0xff7aa8, 0xffffff], 6);
          if (!pl.dead && Math.hypot(pl.x - b.x, pl.z - b.z) < 1.65) h.env.hurt(pl.x - b.x, pl.z - b.z);
        }
        const k = (b.t - b.T) / 0.2;
        h.fx.beam.set(eye.x, eye.y, eye.z, b.x, 0.1, b.z, 1.2 * (1 - k * 0.6), 1 - k);
        h.env.arena.marks.set(12, false);
        if (k >= 1) {
          this.beam = null;
          h.fx.beam.hide();
          this.cd = 1.3;
        }
      }
    }
    if (this.t >= this.secs && !this.beam) {
      this.soft = this.done = true;
      this.stop();
    }
  }

  dangers(out: Danger[]) {
    const b = this.beam;
    if (b) out.push({ shape: 'disc', x: b.x, z: b.z, r: 1.65, at: Math.max(0, b.T - b.t), dur: 0.25 });
  }

  weak() {}

  stop() {
    this.h.fx.beam.hide();
    this.h.env.arena.marks.set(12, false);
    this.beam = null;
    this.done = true;
    this.soft = true;
  }
}

/* ================================================================ */
/* the tail: a sting at where you will be                             */
/* ================================================================ */

export const STING_R = 2.2;

export class StingRunner implements Runner {
  readonly kind = "sting";
  done = false;
  soft = false;
  private st: 'rear' | 'strike' | 'stuck' | 'retract' = 'rear';
  private t = 0;
  private T: number;
  private target = new THREE.Vector3();
  private local = new THREE.Vector3();
  private locked = false;
  private strikeT = 0;
  private impacted = false;
  private stuckFor: number;
  private retractFrom = new THREE.Vector3();
  windowOpen = false;

  constructor(
    private h: Hub,
    private finisher = false,
  ) {
    this.T = Math.max(0.78, 0.92 * h.k) * D.tele;
    this.stuckFor = (finisher ? 3.0 : 0.5) * (finisher ? D.window : 1);
    this.aim(true);
    h.env.audio.v.wyrmHiss(0.9);
  }

  private aim(first: boolean, dt = 0) {
    const pl = this.h.env.p;
    const lead = 0.3;
    let [gx, gz] = arenaClamp(pl.x + pl.vx * lead, pl.z + pl.vz * lead, ARENA_R - 1.3);
    // the sting cannot come down right under the bell
    if (gz < -15) gz = -15;
    if (first) {
      this.target.set(gx, 0, gz);
    } else {
      // it follows you, but slower than you run, until it locks
      const dx = gx - this.target.x;
      const dz = gz - this.target.z;
      const d = Math.hypot(dx, dz) || 1;
      const step = Math.min(d, 4.2 * D.speed * dt);
      this.target.x += (dx / d) * step;
      this.target.z += (dz / d) * step;
    }
    this.h.model.toLocal(_v.set(this.target.x, 0, this.target.z), this.local);
  }

  update(dt: number) {
    const { h } = this;
    const m = h.model;
    const a = h.env.arena;
    const pl = h.env.p;
    this.t += dt;
    h.tailDriven = true;
    if (this.st === 'rear') {
      const u = clamp(this.t / this.T, 0, 1);
      const lockAt = this.T - 0.4;
      if (this.t < lockAt) this.aim(false, dt);
      else if (!this.locked) {
        this.locked = true;
        h.env.audio.warnPing();
      }
      const hot = this.locked && Math.floor(h.env.time * 14) % 2 === 0;
      a.marks.set(0, true, this.target.x, this.target.z, STING_R + 0.35, { fill: 0.2 + 0.55 * u, hot, alpha: 1 });
      P.rearPose(u, h.env.time, this.local, h.tail);
      h.env.audio.setHeart(1.2 + u * 1.8, 0.55);
      if (this.t >= this.T) {
        this.st = 'strike';
        this.t = 0;
        this.strikeT = 0;
        h.env.audio.setHeart(0, 0);
        h.env.audio.whoosh();
        h.env.audio.v.wyrmHiss(0.35);
      }
    } else if (this.st === 'strike') {
      const U = 0.2;
      const u = clamp(this.t / U, 0, 1);
      P.strikePose(u, h.env.time, this.local, h.tail);
      a.marks.set(0, true, this.target.x, this.target.z, STING_R + 0.35, { fill: 0.75, hot: true });
      // the needle lands when the tip has come down (the tail lags a little behind its own aim)
      m.toWorld(m.tail.tipPos, _w);
      if (!this.impacted && this.t >= U && (_w.y < 1.4 || this.t > U + 0.16)) this.impact();
      if (this.impacted && this.t > U + 0.1) {
        this.st = 'stuck';
        this.t = 0;
      }
    } else if (this.st === 'stuck') {
      P.stuckPose(this.t, h.env.time, this.local, h.tail);
      this.windowOpen = this.finisher;
      a.marks.set(0, false);
      // a little venom pooling round the needle
      if (this.finisher && Math.random() < dt * 14) a.burst3(this.target.x, 0.6, this.target.z, 1, [0xb8ff7a, 0xe8dcb0], 3);
      if (this.t >= this.stuckFor) {
        this.windowOpen = false;
        this.st = 'retract';
        this.retractFrom.copy(this.local);
        this.t = 0;
        h.env.audio.snap();
        a.burst3(this.target.x, 0.5, this.target.z, 10, [0xb8ff7a, 0x6a4a30, 0xe8dcb0], 8);
        h.env.audio.v.wyrmRattle(8);
      }
    } else {
      const u = clamp(this.t / 1.1, 0, 1);
      P.retractPose(u, h.env.time, this.retractFrom, h.tail);
      this.soft = u > 0.55;
      if (u >= 1) {
        this.done = true;
        this.soft = true;
        h.tailDriven = false;
      }
    }
    void pl;
  }

  private impact() {
    const { h } = this;
    this.impacted = true;
    const a = h.env.arena;
    const pl = h.env.p;
    const { x, z } = this.target;
    h.env.audio.slam();
    h.env.audio.v.wyrmScreech(0.5);
    h.env.shake(1.0);
    a.burst3(x, 0.5, z, 24, [0xe8dcb0, 0xb8ff7a, 0x5a3a62], 10);
    h.fx.shocks.add(x, z, 6, 0xb8ff7a, 0.5);
    if (!pl.dead && Math.hypot(pl.x - x, pl.z - z) < STING_R + 0.3) h.env.hurt(pl.x - x, pl.z - z);
  }

  dangers(out: Danger[]) {
    if (this.st === 'rear') out.push({ shape: 'disc', x: this.target.x, z: this.target.z, r: STING_R, at: Math.max(0, this.T - this.t), dur: 0.3 });
    else if (this.st === 'strike' && !this.impacted) out.push({ shape: 'disc', x: this.target.x, z: this.target.z, r: STING_R, at: 0, dur: 0.3 });
  }

  weak(out: Weak[]) {
    if (this.st === 'stuck' && this.windowOpen) out.push({ x: this.target.x, y: 0.9, z: this.target.z, reach: 3.9, r: 2.7, tag: 'stinger' });
  }

  /** where the needle is stuck (world), for the hit's burst */
  get at() {
    return this.target;
  }

  stop() {
    this.h.env.arena.marks.set(0, false);
    this.h.env.audio.setHeart(0, 0);
    this.windowOpen = false;
    this.done = true;
    this.soft = true;
  }
}

/* ================================================================ */
/* the tail: a sweep low across the floor                             */
/* ================================================================ */

const SWEEP_RIN = 11;
const SWEEP_ROUT = 38;
const SWEEP_TIP = 36;

export class SweepRunner implements Runner {
  readonly kind = "sweep";
  done = false;
  soft = false;
  private st: 'tele' | 'lash' | 'hold' | 'retract' = 'tele';
  private t = 0;
  private T: number;
  private L: number;
  private a0: number;
  private a1: number;
  private th: number;
  private c0 = newCtrl();
  private c1 = newCtrl();
  private pivot = new THREE.Vector3();
  private tgt = new THREE.Vector3();
  private from = new THREE.Vector3();
  private hitDone = false;
  private wp: { x: number; z: number; r: number }[] = [];

  constructor(private h: Hub) {
    this.T = Math.max(0.9, 1.1 * h.k) * D.tele;
    this.L = (1.3 * (0.6 + 0.4 * h.k)) / D.speed;
    // the sector is centred a little to one side of where you stand, and it sweeps one way or the other
    const pl = h.env.p;
    const th = Math.atan2(pl.x - BELL_C.x, pl.z - BELL_C.z);
    const c = clamp(th + (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.22), -0.45, 0.45);
    const W = 1.3;
    if (Math.random() < 0.5) {
      this.a0 = c - W / 2;
      this.a1 = c + W / 2;
    } else {
      this.a0 = c + W / 2;
      this.a1 = c - W / 2;
    }
    this.th = this.a0;
    h.model.toLocal(_v.set(BELL_C.x, 0, BELL_C.z), this.pivot);
    h.fx.fan.set(BELL_C.x, BELL_C.z, Math.min(this.a0, this.a1), Math.max(this.a0, this.a1), SWEEP_RIN, SWEEP_ROUT);
    h.env.audio.v.wyrmHiss(1.1);
    for (const p of h.env.arena.pillarData) this.wp.push({ x: 0, z: 0, r: 0 });
  }

  /** the tail laid along the floor at bearing `th` (model space), its root arched over the shoulder */
  private lay(th: number, out: TailCtrl) {
    P.sweepPose(th, SWEEP_RIN / MASH_S, SWEEP_TIP / MASH_S, this.pivot, out);
  }

  update(dt: number) {
    const { h } = this;
    const m = h.model;
    const pl = h.env.p;
    this.t += dt;
    h.tailDriven = true;
    if (this.st === 'tele') {
      const u = clamp(this.t / this.T, 0, 1);
      // the stinger swings to the side it will start from
      this.tgt.set(this.pivot.x + Math.sin(this.a0) * 20, 0, this.pivot.z + Math.cos(this.a0) * 20);
      P.rearPose(u, h.env.time, this.tgt, h.tail);
      h.fx.fan.setAlpha(0.35 + 0.35 * u + (u > 0.6 && Math.floor(h.env.time * 12) % 2 === 0 ? 0.25 : 0));
      h.env.audio.setHeart(1.2 + u * 1.6, 0.5);
      if (this.t >= this.T) {
        this.st = 'lash';
        this.t = 0;
        P.rearPose(1, h.env.time, this.tgt, this.c0);
        this.lay(this.a0, this.c1);
        h.env.audio.setHeart(0, 0);
        h.env.audio.whoosh();
        h.env.audio.v.wyrmScreech(0.6);
        h.env.shake(0.5);
      }
    } else if (this.st === 'lash') {
      const u = clamp(this.t / this.L, 0, 1);
      const e = Math.pow(u, 1.15);
      this.th = lerp(this.a0, this.a1, e);
      this.lay(this.th, h.tail);
      // the first moments: from the cocked tail down to the floor
      const bl = smooth(this.t / 0.22);
      if (bl < 1) {
        this.lay(this.th, this.c1);
        P.mixCtrl(h.tail, this.c0, this.c1, bl);
      }
      h.fx.fan.setAlpha(0.55 * (1 - 0.6 * u));
      // the tail rides over the pillars
      const pd = h.env.arena.pillarData;
      for (let i = 0; i < pd.length; i++) {
        const p = pd[i]!;
        const w = this.wp[i]!;
        if (p.alive) {
          m.toLocal(_v.set(p.x, 0, p.z), _w);
          w.x = _w.x;
          w.z = _w.z;
          w.r = p.r / MASH_S;
        } else w.r = 0;
      }
      m.tail.setPillars(this.wp);
      // where the tail lies low, it hurts
      if (this.t > 0.18 && !pl.dead) this.hitTest();
      if (u >= 1) {
        this.st = 'hold';
        this.t = 0;
        h.fx.fan.hide();
      }
    } else if (this.st === 'hold') {
      this.lay(this.a1, h.tail);
      if (this.t > 0.35) {
        this.st = 'retract';
        this.t = 0;
        m.tail.setPillars([]);
        this.from.copy(this.tgt);
        h.env.audio.v.wyrmRattle(6);
      }
    } else {
      const u = clamp(this.t / 1.0, 0, 1);
      // from lying out to the curl: first slide back, then up
      P.idlePose(h.env.time, this.c1);
      this.lay(this.a1, this.c0);
      P.mixCtrl(h.tail, this.c0, this.c1, smooth(u));
      this.soft = u > 0.5;
      if (u >= 1) {
        this.done = true;
        this.soft = true;
        h.tailDriven = false;
      }
    }
  }

  private hitTest() {
    const { h } = this;
    const pl = h.env.p;
    const pts = h.model.tail.pts;
    const S = MASH_S;
    const root = h.model.root.position;
    let hit = false;
    for (let i = 3; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const ay = a.y * S + root.y;
      const by = b.y * S + root.y;
      if (Math.min(ay, by) > 1.9) continue;
      const ax = a.x * S + root.x;
      const az = a.z * S + root.z;
      const bx = b.x * S + root.x;
      const bz = b.z * S + root.z;
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((pl.x - ax) * dx + (pl.z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(pl.x - (ax + dx * t), pl.z - (az + dz * t));
      if (d < 1.55) {
        hit = true;
        break;
      }
    }
    if (hit && !this.hitDone) {
      this.hitDone = true;
      h.env.hurt(pl.x - BELL_C.x, pl.z - BELL_C.z);
      window.setTimeout(() => (this.hitDone = false), 600);
    }
  }

  dangers(out: Danger[]) {
    if (this.st === 'retract' || this.st === 'hold') return;
    const K = 10;
    const lashLeft = this.st === 'tele' ? this.L : Math.max(0, this.L - this.t);
    const lead = this.st === 'tele' ? Math.max(0, this.T - this.t) : 0;
    const w = (Math.abs(this.a1 - this.a0) / K) * 0.5;
    for (let k = 0; k < K; k++) {
      const f = (k + 0.5) / K;
      const a = lerp(this.a0, this.a1, f);
      const when = this.st === 'tele' ? lead + this.L * Math.pow(f, 1 / 1.15) : Math.max(0, this.L * Math.pow(f, 1 / 1.15) - this.t);
      if (this.st === 'lash' && when <= 0 && this.L * Math.pow(f, 1 / 1.15) < this.t - 0.3) continue;
      const ox = BELL_C.x + Math.sin(a) * SWEEP_RIN;
      const oz = BELL_C.z + Math.cos(a) * SWEEP_RIN;
      out.push({ shape: 'cone', x: ox, z: oz, ang: a, len: SWEEP_ROUT - SWEEP_RIN, half: w * 24 + 0.8, at: when, dur: this.L / K + 0.35 });
    }
    void lashLeft;
  }

  weak() {}

  stop() {
    this.h.fx.fan.hide();
    this.h.model.tail.setPillars([]);
    this.h.env.audio.setHeart(0, 0);
    this.done = true;
    this.soft = true;
  }
}

/* ================================================================ */
/* the tail: venom spit                                               */
/* ================================================================ */

const BLOB_FLY = 1.05;

interface Blob {
  i: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  tz: number;
  t: number;
  state: 'wait' | 'fly' | 'gone';
}

export class SpitRunner implements Runner {
  readonly kind = "spit";
  done = false;
  soft = false;
  private st: 'rise' | 'lob' | 'retract' = 'rise';
  private t = 0;
  private T: number;
  private blobs: Blob[] = [];
  private launched = 0;
  private kick = 0;
  private aimL = new THREE.Vector3();
  private fromLocal = new THREE.Vector3();
  private n: number;
  private gap: number;

  constructor(
    private h: Hub,
    n = 3,
  ) {
    this.n = n;
    this.T = Math.max(0.7, 0.85 * h.k) * D.tele;
    this.gap = Math.max(0.28, 0.4 * h.k);
    const pl = h.env.p;
    h.model.toLocal(_v.set(pl.x, 0, pl.z), this.aimL);
    h.env.audio.v.wyrmHiss(0.8);
  }

  private plan() {
    const { h } = this;
    const pl = h.env.p;
    const lead = 0.55;
    const [cx, cz] = arenaClamp(pl.x + pl.vx * lead, pl.z + pl.vz * lead, ARENA_R - 1.6);
    // one where you will be, the others to either side of that: you must move, and there is always room
    const ang = Math.random() * TAU;
    const spread = 4.4;
    const offs: [number, number][] = [[0, 0]];
    for (let i = 1; i < this.n; i++) {
      const a = ang + (i - 1) * Math.PI + (Math.random() - 0.5) * 0.5;
      offs.push([Math.cos(a) * spread, Math.sin(a) * spread]);
    }
    const tip = h.model.toWorld(h.model.tail.tipPos, _w);
    for (let i = 0; i < this.n; i++) {
      const [x, z] = arenaClamp(cx + offs[i]![0], cz + offs[i]![1], ARENA_R - 1.4);
      this.blobs.push({ i, sx: tip.x, sy: tip.y, sz: tip.z, tx: x, tz: z, t: 0, state: 'wait' });
    }
  }

  update(dt: number) {
    const { h } = this;
    const a = h.env.arena;
    this.t += dt;
    h.tailDriven = true;
    this.kick = Math.max(0, this.kick - dt * 3.4);
    if (this.st === 'rise') {
      const u = clamp(this.t / this.T, 0, 1);
      P.spitPose(u, h.env.time, this.aimL, 0, h.tail);
      if (this.t >= this.T) {
        this.st = 'lob';
        this.t = 0;
        this.plan();
      }
    } else if (this.st === 'lob') {
      P.spitPose(1, h.env.time, this.aimL, this.kick, h.tail);
      // a blob leaves the stinger every so often
      while (this.launched < this.n && this.t >= this.launched * this.gap) {
        const b = this.blobs[this.launched]!;
        const tip = h.model.toWorld(h.model.tail.tipPos, _w);
        b.sx = tip.x;
        b.sy = tip.y;
        b.sz = tip.z;
        b.state = 'fly';
        b.t = 0;
        this.launched++;
        this.kick = 1;
        h.env.audio.squish();
        h.env.audio.v.wyrmHiss(0.3);
        h.env.shake(0.2);
      }
      let live = 0;
      for (const b of this.blobs) {
        if (b.state === 'wait') {
          live++;
          continue;
        }
        if (b.state === 'gone') continue;
        live++;
        b.t += dt;
        const f = clamp(b.t / BLOB_FLY, 0, 1);
        // an arc: out and up, then down onto its ring
        const x = lerp(b.sx, b.tx, f);
        const z = lerp(b.sz, b.tz, f);
        const y = lerp(b.sy, 0.5, f * f) + 4 * 7 * f * (1 - f);
        h.fx.blobs.show(b.i, x, y, z, 1 + 0.15 * Math.sin(b.t * 20), 1 + 0.2 * Math.cos(b.t * 17));
        a.marks.set(4 + b.i, true, b.tx, b.tz, 2.35, { col: 0x9aff3a, fill: 0.15 + 0.5 * f, hot: f > 0.8 && Math.floor(h.env.time * 14) % 2 === 0 });
        if (f >= 1) {
          b.state = 'gone';
          h.fx.blobs.hideOne(b.i);
          a.marks.set(4 + b.i, false);
          this.splat(b);
        }
      }
      if (this.launched >= this.n && live === 0) {
        this.st = 'retract';
        this.t = 0;
        this.fromLocal.copy(this.aimL);
      }
    } else {
      const u = clamp(this.t / 1.0, 0, 1);
      // back to the curl
      P.idlePose(h.env.time, _tmpCtrl);
      P.spitPose(1, h.env.time, this.aimL, 0, _tmpCtrl2);
      P.mixCtrl(h.tail, _tmpCtrl2, _tmpCtrl, smooth(u));
      this.soft = true;
      if (u >= 1) {
        this.done = true;
        h.tailDriven = false;
      }
    }
  }

  private splat(b: Blob) {
    const { h } = this;
    h.env.audio.squish();
    h.env.audio.crumble();
    h.env.shake(0.35);
    h.env.arena.burst3(b.tx, 0.5, b.tz, 12, [0xb8ff7a, 0x2a6a1a, 0xe8ffb0], 7);
    h.fx.shocks.add(b.tx, b.tz, 3.6, 0x9aff3a, 0.45);
    h.fx.puddles.add(b.tx, b.tz, 2.15, 4.2);
  }

  dangers(out: Danger[]) {
    for (const b of this.blobs) {
      if (b.state === 'fly') out.push({ shape: 'disc', x: b.tx, z: b.tz, r: 2.1, at: Math.max(0, BLOB_FLY - b.t), dur: 4.2 });
      else if (b.state === 'wait') out.push({ shape: 'disc', x: b.tx, z: b.tz, r: 2.1, at: 99, dur: 4.2 });
    }
  }

  weak() {}

  stop() {
    this.h.fx.blobs.hide();
    for (let i = 0; i < 4; i++) this.h.env.arena.marks.set(4 + i, false);
    this.done = true;
    this.soft = true;
  }
}

const _tmpCtrl = newCtrl();
const _tmpCtrl2 = newCtrl();

/** Puddles of venom hurt while you stand in them; this runs for the whole fight. */
export function puddleHurt(h: Hub) {
  const pl = h.env.p;
  if (pl.dead) return;
  for (const p of h.fx.puddles.list) {
    if (!p.on || p.t < 0.2) continue;
    const r = h.fx.puddles.radius(p);
    if (Math.hypot(pl.x - p.x, pl.z - p.z) < r - 0.1) h.env.hurt(pl.x - p.x, pl.z - p.z);
  }
}

export function puddleDangers(h: Hub, out: Danger[]) {
  for (const p of h.fx.puddles.list) {
    if (!p.on) continue;
    out.push({ shape: 'disc', x: p.x, z: p.z, r: h.fx.puddles.radius(p) + 0.2, at: 0, dur: Math.max(0.3, p.life - p.t) });
  }
}

/* ================================================================ */
/* the shell: rolls                                                   */
/* ================================================================ */

/** the Thornback King's shell, once it has torn loose */
export class Ball {
  readonly pos = new THREE.Vector3();
  readonly q = new THREE.Quaternion();
  readonly dock = new THREE.Vector3();
  docked = true;
  /** damage flash */
  shudder = 0;
  private qa = new THREE.Quaternion();
  private ax = new THREE.Vector3();

  /** roll along direction (dx, dz) by `dist` */
  roll(dx: number, dz: number, dist: number) {
    this.ax.set(dz, 0, -dx).normalize();
    this.qa.setFromAxisAngle(this.ax, dist / SHELL_WR);
    this.q.premultiply(this.qa);
  }
}

interface Plan {
  /** x0,z0,x1,z1,x2,z2 */
  pts: number[];
  legs: number[];
  total: number;
  /** what ends the roll: a pillar (index), the bell, or just the far rim */
  end: 'pillar' | 'bell' | 'rim';
  pillar: number;
}

const BALL_LIMIT = ARENA_R - 1.5;

/** circle exit: the largest t >= 0 with |s + d t| = R */
function exitT(sx: number, sz: number, dx: number, dz: number, R: number): number {
  const b = sx * dx + sz * dz;
  const c = sx * sx + sz * sz - R * R;
  const disc = b * b - c;
  if (disc < 0) return 0;
  return -b + Math.sqrt(disc);
}

export function planRoll(h: Hub, ball: Ball, tx: number, tz: number, mode: 'player' | 'bell'): Plan {
  const sx = ball.pos.x;
  const sz = ball.pos.z;
  let dx = tx - sx;
  let dz = tz - sz;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  const pts: number[] = [sx, sz];
  const legs: number[] = [];
  let end: Plan['end'] = 'rim';
  let pillar = -1;
  const pds = h.env.arena.pillarData;
  const stopOnPillar = (x0: number, z0: number, ddx: number, ddz: number, tMax: number): { t: number; i: number } | null => {
    let best: { t: number; i: number } | null = null;
    for (let i = 0; i < pds.length; i++) {
      const p = pds[i]!;
      if (!p.alive) continue;
      const rx = p.x - x0;
      const rz = p.z - z0;
      const along = rx * ddx + rz * ddz;
      if (along < 0 || along > tMax) continue;
      const perp = Math.abs(rx * ddz - rz * ddx);
      const R = p.r + 2.7;
      if (perp < R) {
        const t = along - Math.sqrt(Math.max(0, R * R - perp * perp));
        if (t >= 0 && (!best || t < best.t)) best = { t, i };
      }
    }
    return best;
  };
  if (mode === 'bell') {
    // straight at the bell: it stops when its back meets the bell's skirt
    const bx = BELL_C.x - sx;
    const bz = BELL_C.z - sz;
    const dist = Math.hypot(bx, bz);
    const stop = dist - (BELL_WR + SHELL_WR * 0.92);
    const hit = stopOnPillar(sx, sz, bx / dist, bz / dist, stop);
    dx = bx / dist;
    dz = bz / dist;
    if (hit) {
      pts.push(sx + dx * hit.t, sz + dz * hit.t);
      legs.push(hit.t);
      end = 'pillar';
      pillar = hit.i;
    } else {
      pts.push(sx + dx * stop, sz + dz * stop);
      legs.push(stop);
      end = 'bell';
    }
  } else {
    // through where you are going to be, and on to the rim
    const t1 = Math.max(4, exitT(sx, sz, dx, dz, BALL_LIMIT));
    const hit = stopOnPillar(sx, sz, dx, dz, t1);
    if (hit) {
      pts.push(sx + dx * hit.t, sz + dz * hit.t);
      legs.push(hit.t);
      end = 'pillar';
      pillar = hit.i;
    } else {
      const hx = sx + dx * t1;
      const hz = sz + dz * t1;
      pts.push(hx, hz);
      legs.push(t1);
      // it bounces off the rim: the way back is part of the lane
      const nx = hx / (Math.hypot(hx, hz) || 1);
      const nz = hz / (Math.hypot(hx, hz) || 1);
      const dot = dx * nx + dz * nz;
      const rx = dx - 2 * dot * nx;
      const rz = dz - 2 * dot * nz;
      const rl = Math.hypot(rx, rz) || 1;
      const ex = rx / rl;
      const ez = rz / rl;
      const t2 = Math.max(3, chordLen(hx, hz, ex, ez, BALL_LIMIT));
      const hit2 = stopOnPillar(hx, hz, ex, ez, t2);
      if (hit2) {
        pts.push(hx + ex * hit2.t, hz + ez * hit2.t);
        legs.push(hit2.t);
        end = 'pillar';
        pillar = hit2.i;
      } else {
        pts.push(hx + ex * t2, hz + ez * t2);
        legs.push(t2);
      }
    }
  }
  const total = legs.reduce((a, b) => a + b, 0);
  return { pts, legs, total, end, pillar };
}

/** how far a ray starting on the circle goes before it leaves it again */
function chordLen(x: number, z: number, dx: number, dz: number, R: number): number {
  const b = x * dx + z * dz;
  // |s + d t|^2 = R^2 with |s| = R: t = -2 b
  return Math.max(0, -2 * b) || R;
}

export interface RollOpts {
  /** rolls before the last */
  count: number;
  /** the last roll goes at the bell and the shell is stunned: a weak point for a while */
  finisher: boolean;
}

const ROLL_V = 21;
const ROLL_V2 = 16;

export class RollRunner implements Runner {
  readonly kind = "roll";
  done = false;
  soft = false;
  private st: 'wind' | 'roll' | 'rest' | 'crash' | 'stun' | 'return' = 'wind';
  private t = 0;
  private T = 0;
  private plan: Plan | null = null;
  private s = 0;
  private i = 0;
  private lastLeg = -1;
  private last = false;
  private solid: { x: number; z: number; r: number; alive: boolean } | null = null;
  private stunFor: number;
  private from = new THREE.Vector3();
  private crashT = 0;
  private qFrom = new THREE.Quaternion();
  private qTo = new THREE.Quaternion();
  windowOpen = false;
  private looseAt = 0;

  constructor(
    private h: Hub,
    private ball: Ball,
    private o: RollOpts,
  ) {
    this.stunFor = 3.1 * D.window;
    this.begin();
    h.env.audio.v.kingBellow();
    h.model.dockShell();
  }

  private get lane() {
    return this.h.fx.lanes[0]!;
  }

  private begin() {
    const { h, ball, o } = this;
    this.last = o.finisher && this.i >= o.count;
    this.st = 'wind';
    this.t = 0;
    this.T = Math.max(0.78, 0.95 * h.k) * D.tele;
    const pl = h.env.p;
    if (ball.docked) {
      // it starts from where it is sewn to the bell
      h.model.toWorld(_v.copy(SHELL_DOCK), ball.pos);
      ball.q.copy(h.model.spinner.quaternion);
    }
    if (this.last) this.plan = planRoll(h, ball, BELL_C.x, BELL_C.z, 'bell');
    else {
      const [tx, tz] = arenaClamp(pl.x + pl.vx * 0.4, pl.z + pl.vz * 0.4, ARENA_R - 1);
      this.plan = planRoll(h, ball, tx, tz, 'player');
    }
    const p = this.plan;
    // show the lane; the part outside the platform is not drawn
    const pts = p.pts.slice();
    this.lane.set(pts, SHELL_WR * 0.78);
    this.lane.setAlpha(0.9);
    this.s = 0;
    this.lastLeg = -1;
    if (ball.docked) {
      ball.docked = false;
      // it tears away from the bell: the stitches that held it fly
      h.env.arena.burst3(ball.pos.x + 3, 3, ball.pos.z, 14, [0x07040a, 0x3a4c7c, 0xeadba8], 8);
      h.env.audio.snap();
      h.env.audio.v.kingClack(5);
    }
    h.env.audio.rumble();
  }

  private posAt(s: number, out: THREE.Vector3): number {
    const p = this.plan!;
    let acc = 0;
    for (let l = 0; l < p.legs.length; l++) {
      const len = p.legs[l]!;
      if (s <= acc + len || l === p.legs.length - 1) {
        const f = clamp((s - acc) / (len || 1), 0, 1);
        out.set(lerp(p.pts[l * 2]!, p.pts[l * 2 + 2]!, f), SHELL_WR, lerp(p.pts[l * 2 + 1]!, p.pts[l * 2 + 3]!, f));
        return l;
      }
      acc += len;
    }
    return 0;
  }

  update(dt: number) {
    const { h, ball } = this;
    const a = h.env.arena;
    const pl = h.env.p;
    this.t += dt;
    if (this.st === 'wind') {
      const u = clamp(this.t / this.T, 0, 1);
      // it shudders and spins up in place
      ball.shudder = 0.15 + u * 0.7;
      ball.roll(Math.sin(this.t * 3), Math.cos(this.t * 3), dt * u * 14);
      this.lane.setAlpha(0.55 + 0.35 * u + (u > 0.65 && Math.floor(h.env.time * 12) % 2 === 0 ? 0.2 : 0));
      this.lane.scroll(h.env.time);
      h.env.audio.setHeart(1.2 + u * 1.6, 0.6);
      if (this.t >= this.T) {
        this.st = 'roll';
        this.t = 0;
        h.env.audio.setHeart(0, 0);
        h.env.audio.slam();
        h.env.audio.v.kingBellow();
        h.env.shake(0.6);
        ball.shudder = 0;
        a.burst3(ball.pos.x, 0.5, ball.pos.z, 14, [0x3a4c7c, 0xe0502a, 0xeadba8], 9);
      }
    } else if (this.st === 'roll') {
      const p = this.plan!;
      const prevS = this.s;
      const v = this.lastLeg <= 0 ? ROLL_V : ROLL_V2;
      this.s = Math.min(p.total, this.s + v * D.speed * dt);
      const leg = this.posAt(this.s, _v);
      const dx = _v.x - ball.pos.x;
      const dz = _v.z - ball.pos.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 1e-4) ball.roll(dx / dl, dz / dl, dl);
      ball.pos.copy(_v);
      this.lane.scroll(h.env.time);
      this.lane.setAlpha(0.55);
      if (leg !== this.lastLeg) {
        if (this.lastLeg === 0 && leg === 1) this.bounce();
        this.lastLeg = leg;
      }
      void prevS;
      // it crushes what it rolls over, and hurts what it touches
      if (Math.floor(h.env.time * 22) !== Math.floor((h.env.time - dt) * 22)) a.burst3(ball.pos.x, 0.4, ball.pos.z, 1, [0x3a2a62, 0x46346f, 0xeadba8], 3);
      if (!pl.dead && Math.hypot(pl.x - ball.pos.x, pl.z - ball.pos.z) < SHELL_WR * 0.78 + 0.4) h.env.hurt(pl.x - ball.pos.x, pl.z - ball.pos.z);
      h.env.shake(0.12);
      if (this.s >= p.total) this.arrive();
    } else if (this.st === 'rest') {
      ball.shudder = 0.1;
      this.lane.setAlpha(Math.max(0, 0.5 - this.t * 1.5));
      if (this.t > 0.2) this.lane.hide();
      this.soft = this.i >= this.o.count && !this.o.finisher ? true : this.t > 0.35 && this.i < this.o.count;
      if (this.t >= 0.65) {
        this.i++;
        if (this.i > this.o.count || (this.i >= this.o.count && !this.o.finisher)) {
          this.st = 'return';
          this.t = 0;
          this.from.copy(ball.pos);
          this.soft = true;
        } else this.begin();
      }
    } else if (this.st === 'crash') {
      // it hits the bell, bounces back and lands on its back
      const u = clamp(this.t / 0.9, 0, 1);
      const e = 1 - Math.pow(1 - u, 2);
      const bx = lerp(this.from.x, this.crashTo.x, e);
      const bz = lerp(this.from.z, this.crashTo.z, e);
      ball.pos.set(bx, SHELL_WR + 3.2 * 4 * u * (1 - u), bz);
      ball.q.slerpQuaternions(this.qFrom, this.qTo, smooth(u));
      if (u >= 1) {
        this.st = 'stun';
        this.t = 0;
        ball.pos.y = SHELL_WR * 0.78;
        this.windowOpen = true;
        this.solid = { x: ball.pos.x, z: ball.pos.z, r: SHELL_WR * 0.7, alive: true };
        h.env.solids.push(this.solid);
        h.env.audio.slam();
        h.env.shake(0.7);
        a.burst3(ball.pos.x, 0.5, ball.pos.z, 20, [0x3a4c7c, 0xe0502a, 0xeadba8], 10);
        h.fx.shocks.add(ball.pos.x, ball.pos.z, 7, 0xffcf7a, 0.5);
      }
    } else if (this.st === 'stun') {
      ball.shudder = 0.05;
      this.soft = false;
      if (this.t >= this.stunFor) this.endStun();
    } else {
      // it rolls home, slowly and harmlessly, and sews itself back on
      const u = clamp(this.t / 1.3, 0, 1);
      const e = smooth(u);
      h.model.toWorld(_v.copy(SHELL_DOCK), _w);
      const tx = _w.x;
      const tz = _w.z;
      const nx = lerp(this.from.x, tx, e);
      const nz = lerp(this.from.z, tz, e);
      const ddx = nx - ball.pos.x;
      const ddz = nz - ball.pos.z;
      const dl = Math.hypot(ddx, ddz);
      if (dl > 1e-4) ball.roll(ddx / dl, ddz / dl, dl);
      ball.pos.set(nx, lerp(SHELL_WR, _w.y, e), nz);
      if (u >= 1) {
        ball.docked = true;
        this.done = true;
        this.soft = true;
        h.model.dockShell();
      }
    }
  }

  private crashTo = new THREE.Vector3();

  private bounce() {
    const { h, ball } = this;
    h.env.audio.stomp();
    h.env.shake(0.7);
    h.env.arena.burst3(ball.pos.x, 0.5, ball.pos.z, 16, [0x3a2a62, 0x6a5a98, 0xeadba8], 9);
    h.fx.shocks.add(ball.pos.x, ball.pos.z, 6, 0xffb060, 0.45);
  }

  /** the roll is over: at a pillar, at the bell, or at the far rim */
  private arrive() {
    const { h, ball } = this;
    const p = this.plan!;
    h.env.audio.stomp();
    h.env.shake(0.9);
    if (p.end === 'pillar' && p.pillar >= 0) {
      h.env.arena.crumblePillar(p.pillar);
      h.env.audio.crumble();
      h.env.arena.burst3(ball.pos.x, 1.2, ball.pos.z, 26, [0x4a3d6a, 0x6a5a98, 0xeadba8], 11);
    }
    h.fx.shocks.add(ball.pos.x, ball.pos.z, 8, 0xffcf7a, 0.55);
    this.lane.hide();
    if (p.end === 'bell' || (this.last && p.end === 'pillar')) {
      // the finisher: it hits the bell (or what was in the way)
      if (p.end === 'bell') {
        h.model.toll = 1.6;
        h.model.shake = 1;
        h.env.audio.v.queenToll(0.6, 1.1);
        h.env.audio.bell(0.7);
        h.env.shake(1.4);
      }
      this.st = 'crash';
      this.t = 0;
      this.from.copy(ball.pos);
      // it bounces back a few steps and lands on its back, its belly and face to the sky
      const back = new THREE.Vector3(ball.pos.x - BELL_C.x, 0, ball.pos.z - BELL_C.z).normalize();
      this.crashTo.set(ball.pos.x + (p.end === 'bell' ? back.x * 3.4 : 0), 0, ball.pos.z + (p.end === 'bell' ? back.z * 3.4 : 0));
      this.qFrom.copy(ball.q);
      // upside down with the face still turned to the front: belly and face to the sky, a little towards you
      this.qTo.setFromAxisAngle(_X, 0.4).multiply(new THREE.Quaternion().setFromAxisAngle(_Z, Math.PI));
      this.lane.hide();
    } else {
      this.st = 'rest';
      this.t = 0;
    }
  }

  /** the window closes (or the shell is hit): it gets up and goes home */
  endStun() {
    const { h, ball } = this;
    this.windowOpen = false;
    if (this.solid) {
      this.solid.alive = false;
      const i = h.env.solids.indexOf(this.solid);
      if (i >= 0) h.env.solids.splice(i, 1);
      this.solid = null;
    }
    this.st = 'return';
    this.t = 0;
    this.from.copy(ball.pos);
    this.soft = true;
    h.env.audio.v.kingSnort(2);
  }

  /** the shell was struck while stunned */
  hurtShell() {
    this.ball.shudder = 1;
    this.endStun();
  }

  dangers(out: Danger[]) {
    const p = this.plan;
    if (!p) return;
    const { ball } = this;
    if (this.st === 'wind') {
      // the whole lane: boxes along each leg, live when the roll gets there
      let acc = 0;
      for (let l = 0; l < p.legs.length; l++) {
        const len = p.legs[l]!;
        const x0 = p.pts[l * 2]!;
        const z0 = p.pts[l * 2 + 1]!;
        const x1 = p.pts[l * 2 + 2]!;
        const z1 = p.pts[l * 2 + 3]!;
        const v = l === 0 ? ROLL_V : ROLL_V2;
        // sliced, so the bot sees when each part of the lane is hot
        const n = Math.max(1, Math.round(len / 7));
        for (let k = 0; k < n; k++) {
          const f0 = k / n;
          const f1 = (k + 1) / n;
          const mx = lerp(x0, x1, (f0 + f1) / 2);
          const mz = lerp(z0, z1, (f0 + f1) / 2);
          out.push({
            shape: 'box',
            x: mx,
            z: mz,
            ang: Math.atan2(x1 - x0, z1 - z0),
            len: (len / n) * 1.05 + SHELL_WR,
            half: SHELL_WR * 0.78,
            at: Math.max(0, this.T - this.t) + (acc + len * f0) / (v * D.speed),
            dur: (len / n) / (v * D.speed) + 0.9,
          });
        }
        acc += len;
      }
    } else if (this.st === 'roll') {
      // where it is now, and the lane still ahead
      out.push({ shape: 'disc', x: ball.pos.x, z: ball.pos.z, r: SHELL_WR * 0.78, at: 0, dur: 0.3 });
      let acc = 0;
      for (let l = 0; l < p.legs.length; l++) {
        const len = p.legs[l]!;
        const x0 = p.pts[l * 2]!;
        const z0 = p.pts[l * 2 + 1]!;
        const x1 = p.pts[l * 2 + 2]!;
        const z1 = p.pts[l * 2 + 3]!;
        const v = (l === 0 ? ROLL_V : ROLL_V2) * D.speed;
        const remain = Math.max(0, acc + len - this.s);
        if (remain > 0) {
          const f0 = clamp((this.s - acc) / len, 0, 1);
          const n = Math.max(1, Math.round((len * (1 - f0)) / 7));
          for (let k = 0; k < n; k++) {
            const fa = lerp(f0, 1, k / n);
            const fb = lerp(f0, 1, (k + 1) / n);
            out.push({
              shape: 'box',
              x: lerp(x0, x1, (fa + fb) / 2),
              z: lerp(z0, z1, (fa + fb) / 2),
              ang: Math.atan2(x1 - x0, z1 - z0),
              len: (len * (fb - fa)) * 1.05 + SHELL_WR,
              half: SHELL_WR * 0.78,
              at: Math.max(0, (len * fa - (this.s - acc > 0 ? this.s - acc : 0)) / v),
              dur: (len * (fb - fa)) / v + 0.7,
            });
          }
        }
        acc += len;
      }
    }
  }

  weak(out: Weak[]) {
    if (this.st === 'stun' && this.windowOpen) out.push({ x: this.ball.pos.x, y: 2.4, z: this.ball.pos.z, reach: 6.0, r: 4.2, tag: 'belly' });
  }

  stop() {
    const { h, ball } = this;
    this.lane.hide();
    h.env.audio.setHeart(0, 0);
    this.windowOpen = false;
    if (this.solid) {
      this.solid.alive = false;
      const i = h.env.solids.indexOf(this.solid);
      if (i >= 0) h.env.solids.splice(i, 1);
      this.solid = null;
    }
    ball.shudder = 0;
    this.done = true;
    this.soft = true;
    void this.looseAt;
  }
}

const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);

/* ================================================================ */
/* the flower breathes in                                             */
/* ================================================================ */

const MAW = { x: 0, z: MASH_Z + 3.4 };
const BITE_R = 4.3;

export class BreathRunner implements Runner {
  readonly kind = "breath";
  done = false;
  soft = false;
  private st: 'in' | 'pull' | 'open' | 'drop' | 'lure' | 'reel' | 'bitten' = 'in';
  private t = 0;
  private inT: number;
  private pullT: number;
  private lureFor: number;
  private lure = new THREE.Vector3();
  windowOpen = false;
  private bite = 0;

  constructor(private h: Hub) {
    this.inT = 0.85 * D.tele;
    this.pullT = Math.max(1.9, 2.5 * h.k) * 1.0;
    this.lureFor = 3.1 * D.window;
    h.say('breathe in.', 2000);
    h.env.audio.v.mimicHum([220, 262, 330, 392, 494, 587]);
    h.env.audio.v.mimicSnarl();
    h.model.setLureFloor(0, 0);
  }

  /** how hard the wind pulls (0..1) */
  private pullK(): number {
    if (this.st === 'in') return 0;
    if (this.st !== 'pull') return 0;
    return smooth(this.t / 0.7);
  }

  update(dt: number) {
    const { h } = this;
    const m = h.model;
    const pl = h.env.p;
    this.t += dt;
    const e = h.env;
    if (this.st === 'in') {
      const u = clamp(this.t / this.inT, 0, 1);
      m.inhale = smooth(u);
      m.lean = 0.35 * smooth(u);
      m.mawOpen = 0.5 + 0.3 * u;
      m.lureGlow = 0.6 + 0.6 * u;
      h.model.tendrilPull = u * 0.6;
      e.audio.setHeart(1.0 + u * 1.5, 0.45);
      h.fx.wind.update(dt, MAW.x, 7, MAW.z, 0.25 + 0.3 * u);
      if (this.t >= this.inT) {
        this.st = 'pull';
        this.t = 0;
        e.audio.v.mimicHum([330, 392, 494, 587, 659]);
        e.shake(0.4);
      }
    } else if (this.st === 'pull') {
      const k = this.pullK();
      m.inhale = 1;
      m.lean = 0.35 + 0.45 * k;
      m.mawOpen = 0.8 + 0.2 * k;
      m.lureGlow = 1.2;
      m.tendrilPull = 0.6 + 0.4 * k;
      e.audio.setHeart(2.5 + k * 1.4, 0.6);
      h.fx.wind.update(dt, MAW.x, 7, MAW.z, 0.6 + 0.4 * k);
      // the pull: towards the maw, harder the longer it goes
      if (!pl.dead) {
        const dx = MAW.x - pl.x;
        const dz = MAW.z - pl.z;
        const d = Math.hypot(dx, dz) || 1;
        const v = (3.2 + 3.2 * k) * D.speed;
        e.pull((dx / d) * v, (dz / d) * v);
        // the bite zone, under the head: the tendrils snatch
        if (d < BITE_R && this.bite <= 0) {
          this.bite = 1;
          e.hurt(pl.x - MAW.x, pl.z - MAW.z);
          e.audio.v.mimicSnarl();
          e.shake(0.9);
          m.tendrilReach = 1;
          m.tendrilTarget.copy(m.toLocal(_v.set(pl.x, 1.4, pl.z), _w));
          this.st = 'bitten';
          this.t = 0;
          h.say('no.', 1400);
        }
      }
      e.arena.marks.set(8, true, MAW.x, MAW.z, BITE_R, { col: 0xff5a9a, fill: 0.25 + 0.2 * Math.sin(e.time * 10) });
      if (this.t >= this.pullT) {
        this.st = 'open';
        this.t = 0;
        e.arena.marks.set(8, false);
        h.fx.wind.hide();
        e.audio.setHeart(0, 0);
        e.audio.v.mimicLaugh();
        e.audio.v.queenChoir(0.7);
        e.shake(0.8);
        m.roar = 1;
      }
    } else if (this.st === 'bitten') {
      // it snaps shut with no reward
      m.roar = Math.max(0, m.roar - dt * 2);
      m.inhale = Math.max(0, m.inhale - dt * 1.5);
      m.lean = Math.max(0, m.lean - dt * 0.8);
      m.tendrilPull = Math.max(0, m.tendrilPull - dt * 2);
      m.tendrilReach = Math.max(0, m.tendrilReach - dt * 1.2);
      h.fx.wind.hide();
      e.arena.marks.set(8, false);
      e.audio.setHeart(0, 0);
      if (this.t > 1.1) {
        m.tendrilReach = 0;
        this.done = this.soft = true;
        this.finish();
      }
    } else if (this.st === 'open') {
      // the breath is out: the maw hangs open
      m.inhale = Math.max(0, 1 - this.t * 2);
      m.mawOpen = 1;
      m.lean = 0.8 - 0.25 * smooth(this.t / 0.8);
      m.roar = Math.max(0, 1 - this.t * 1.1);
      m.tendrilPull = Math.max(0, 1 - this.t * 2);
      if (this.t >= 0.75) {
        this.st = 'drop';
        this.t = 0;
        // the lure lands in front of the maw, within reach of the floor
        const lx = (Math.random() < 0.5 ? -1 : 1) * (3.8 + Math.random() * 1.6);
        const lz = MASH_Z + 10.2;
        this.lure.set(lx, 0.8, lz);
        m.setLureFloor(m.toLocal(_v.set(lx, 0, lz), _w).x, _w.z);
        e.audio.v.queenToll(1.4, 0.7);
      }
    } else if (this.st === 'drop') {
      const u = clamp(this.t / 0.7, 0, 1);
      m.setLure(smooth(u), 1.3);
      m.mawOpen = 1;
      m.lean = 0.55;
      if (u >= 1) {
        this.st = 'lure';
        this.t = 0;
        this.windowOpen = true;
        e.audio.slam();
        e.shake(0.5);
        e.arena.burst3(this.lure.x, 0.5, this.lure.z, 14, [0xff7ac0, 0xffffff, 0xc84a74], 8);
      }
    } else if (this.st === 'lure') {
      m.setLure(1, 1.4 + 0.3 * Math.sin(e.time * 8));
      m.mawOpen = 1;
      this.soft = false;
      if (this.t >= this.lureFor) this.reel();
    } else {
      // the stalk is hauled back up into the throat
      const u = clamp(this.t / 0.7, 0, 1);
      m.setLure(1 - smooth(u), 0.8);
      m.mawOpen = 1 - 0.4 * u;
      m.lean = 0.55 * (1 - u);
      if (u >= 1) this.finish(true);
    }
  }

  private finish(ok = false) {
    const m = this.h.model;
    m.inhale = 0;
    m.lean = 0;
    m.roar = 0;
    m.mawOpen = 0.5;
    m.tendrilPull = 0;
    m.tendrilReach = 0;
    m.setLure(0, 0.6);
    this.h.fx.wind.hide();
    this.done = this.soft = true;
    void ok;
  }

  /** the window closes, or the lure was hit */
  reel() {
    this.windowOpen = false;
    this.st = 'reel';
    this.t = 0;
    this.h.env.audio.snap();
  }

  dangers(out: Danger[]) {
    if (this.st === 'pull' || this.st === 'in') {
      // the maw: everything near it is being dragged in; the bite is under the head
      out.push({ shape: 'disc', x: MAW.x, z: MAW.z, r: BITE_R + 4 + 4 * this.pullK(), at: this.st === 'in' ? Math.max(0, this.inT - this.t) : 0, dur: this.st === 'in' ? 0.5 + this.pullT : Math.max(0.2, this.pullT - this.t) });
    }
  }

  weak(out: Weak[]) {
    if (this.st === 'lure' && this.windowOpen) out.push({ x: this.lure.x, y: 1.0, z: this.lure.z, reach: 4.6, r: 2.8, tag: 'lure' });
  }

  stop() {
    this.windowOpen = false;
    this.h.fx.wind.hide();
    this.h.env.arena.marks.set(8, false);
    this.h.env.audio.setHeart(0, 0);
    const m = this.h.model;
    m.inhale = 0;
    m.lean = 0;
    m.roar = 0;
    m.tendrilPull = 0;
    m.tendrilReach = 0;
    this.done = this.soft = true;
  }
}

/* ================================================================ */
/* the bell cracks: its tongue drops                                  */
/* ================================================================ */

export class ClapperRunner implements Runner {
  readonly kind = "clapper";
  done = false;
  soft = false;
  private st: 'crack' | 'drop' | 'open' | 'close' = 'crack';
  private t = 0;
  private openFor: number;
  private tip = new THREE.Vector3();
  windowOpen = false;
  private startCrack: number;

  constructor(private h: Hub) {
    this.openFor = 3.1 * D.window;
    this.startCrack = h.model.crack;
    const x = (Math.random() < 0.5 ? -1 : 1) * (3.8 + Math.random() * 1.6);
    // the tongue comes out of the bell's mouth and lies on the floor, in reach
    this.tip.set(x, 0.9, MASH_Z + 10.4);
    h.say('...', 1000);
    h.env.audio.v.queenShriek(0.9);
    h.env.audio.v.queenToll(0.6, 1.2);
    h.env.shake(1.2);
  }

  update(dt: number) {
    const { h } = this;
    const m = h.model;
    const e = h.env;
    this.t += dt;
    if (this.st === 'crack') {
      const u = clamp(this.t / 1.0, 0, 1);
      m.crack = lerp(this.startCrack, 1, u);
      m.shake = (1 - u) * 1.2;
      m.toll = Math.max(m.toll, 0.8 * (1 - u));
      m.bellLift = smooth(u);
      if (Math.random() < dt * 20) e.arena.burst3(BELL_C.x + (Math.random() - 0.5) * 8, 4 + Math.random() * 3, BELL_C.z + 5, 2, [0xffb060, 0xf4c95c, 0x2a9482], 6);
      if (u >= 1) {
        this.st = 'drop';
        this.t = 0;
        m.toLocal(_v.copy(this.tip), _w);
        m.setClapper(0, _w.x, _w.z);
        e.audio.rumble();
      }
    } else if (this.st === 'drop') {
      const u = clamp(this.t / 0.75, 0, 1);
      m.toLocal(_v.copy(this.tip), _w);
      m.setClapper(smooth(u), _w.x, _w.z);
      m.bellLift = 1;
      m.shake = 0.3 * (1 - u);
      if (u >= 1) {
        this.st = 'open';
        this.t = 0;
        this.windowOpen = true;
        e.audio.slam();
        e.shake(0.8);
        e.arena.burst3(this.tip.x, 0.5, this.tip.z, 16, [0xff7ac0, 0xffffff, 0xf4c95c], 8);
        h.fx.shocks.add(this.tip.x, this.tip.z, 6, 0xffb0d8, 0.5);
      }
    } else if (this.st === 'open') {
      m.setClapper(1, _w.x, _w.z);
      m.toLocal(_v.copy(this.tip), _w);
      m.setClapper(1, _w.x, _w.z);
      this.soft = false;
      if (this.t >= this.openFor) this.close();
    } else {
      const u = clamp(this.t / 0.9, 0, 1);
      m.toLocal(_v.copy(this.tip), _w);
      m.setClapper(1 - smooth(u), _w.x, _w.z);
      m.bellLift = 1 - smooth(u);
      this.soft = u > 0.4;
      if (u >= 1) {
        m.setClapper(0, _w.x, _w.z);
        m.bellLift = 0;
        this.done = this.soft = true;
      }
    }
  }

  /** the window ends, or the tongue was struck */
  close() {
    this.windowOpen = false;
    this.st = 'close';
    this.t = 0;
    this.h.env.audio.snap();
  }

  struck() {
    const { h } = this;
    h.model.toll = 1.6;
    h.model.shake = 1;
    h.env.audio.v.queenToll(0.7, 1.3);
    h.env.audio.v.queenShriek(1);
    this.close();
  }

  dangers() {}

  weak(out: Weak[]) {
    if (this.st === 'open' && this.windowOpen) out.push({ x: this.tip.x, y: 1.0, z: this.tip.z, reach: 4.7, r: 2.9, tag: 'clapper' });
  }

  stop() {
    const m = this.h.model;
    this.windowOpen = false;
    m.shake = 0;
    m.bellLift = 0;
    m.setClapper(0, 0, 9.5);
    this.done = this.soft = true;
  }
}

export { MAW, BITE_R };
