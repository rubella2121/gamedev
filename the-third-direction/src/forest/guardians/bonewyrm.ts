import { burst } from '../../core/art';
import { D } from '../../core/difficulty';
import { C } from '../../core/palette';
import type { Pix } from '../../core/pix';
import { clamp, dist, lerp, rng, smooth, TAU, unlerp } from '../../core/util';
import type { ArenaDef } from '../land';
import type { Drawable, Hub, Lance, Nova, Rect } from '../types';
import type { Hazard } from './hazards';
import { onScreen } from '../zones/parts';
import { Guardian } from './base';
import { buf, rimPass } from './draw';

/**
 * The Bone Wyrm: a skeletal worm that lives under the floor. Its head comes up where it hears you, and its tail has a
 * stinger like a scorpion's.
 *   1  burrow  a mound of dust hunts you under the floor, locks on, and the head erupts there. Light the skull while it is up.
 *   2  tail    the tail rises somewhere else and slams down, flinging needles of bone
 *   3  frenzy  the tail sweeps the whole floor with one gap in it, and the skull's roar brings bones down from above
 */

const ACCENT = '#f4efe0';
const BONE = '#d8d0b8';
const BONE_HI = '#f4efe0';
const BONE_LO = '#8a8068';
const PILLARS: [number, number][] = [
  [-60, 70],
  [60, 70],
  [0, 140],
];

type WMode = 'enter' | 'hunt' | 'lock' | 'up' | 'sink' | 'roar' | 'dying';

interface Tail {
  x: number;
  y: number;
  /** 0 = under the floor, 1 = all the way up */
  rise: number;
  dir: 1 | -1;
  /** 0 = curled up and back, 1 = driven down on the target */
  strike: number;
  state: 'down' | 'rising' | 'hold' | 'slam' | 'stuck' | 'sinking';
  t: number;
  tx: number;
  ty: number;
}

/** A chain of vertebrae that bends along its length. Returns the tip and the way it points. */
function boneChain(p: Pix, x0: number, y0: number, o: { n: number; len: number; taper: number; r0: number; ang: number; bend: number; show: number; flash?: boolean; spine?: boolean }) {
  let x = x0;
  let y = y0;
  let a = o.ang;
  let len = o.len;
  let r = o.r0;
  const shown = Math.max(0, o.show * o.n);
  let tipX = x;
  let tipY = y;
  for (let i = 0; i < o.n; i++) {
    if (i >= shown) break;
    const part = Math.min(1, shown - i);
    const nx = x + Math.cos(a) * len * part;
    const ny = y + Math.sin(a) * len * part;
    // the bone between the vertebrae, then the vertebra
    p.line(x, y, nx, ny, BONE_LO, Math.max(2, Math.round(r * 0.7)));
    if (o.spine) p.line(nx, ny, nx + Math.cos(a - Math.PI / 2) * (r + 3), ny + Math.sin(a - Math.PI / 2) * (r + 3), BONE_LO, 2);
    p.ellipse(nx, ny, r, r * 0.92, BONE_LO);
    p.ellipse(nx + 0.5, ny - 0.5, r - 1.2, (r - 1.2) * 0.92, o.flash ? '#ffffff' : BONE);
    p.ellipse(nx + r * 0.3, ny - r * 0.35, r * 0.5, r * 0.35, BONE_HI);
    x = nx;
    y = ny;
    tipX = x;
    tipY = y;
    a += o.bend;
    len *= o.taper;
    r = Math.max(2.2, r * o.taper);
  }
  return { x: tipX, y: tipY, ang: a - o.bend };
}

/** The skull, drawn facing right into its own buffer and stamped (mirrored when it faces left). */
function drawSkull(p: Pix, x: number, y: number, t: number, o: { dir: 1 | -1; open: number; flash: boolean; fade: number; roar?: number }) {
  const W = 84;
  const H = 70;
  const s = buf('wyrmskull', W, H);
  const cx = 30;
  const cy = 34;
  const bone = o.flash ? '#ffffff' : BONE;
  // horns sweeping back
  for (const k of [-1, 1]) {
    s.line(cx - 6, cy - 9, cx - 14, cy - 15 + k * 5, BONE_LO, 4);
    s.line(cx - 14, cy - 15 + k * 5, cx - 22, cy - 13 + k * 9, BONE_LO, 3);
    s.px(cx - 23, cy - 12 + k * 9, BONE_HI);
  }
  s.ellipse(cx, cy, 19, 15, BONE_LO);
  s.ellipse(cx + 1, cy - 1, 17, 13, bone);
  s.ellipse(cx + 5, cy - 6, 9, 4, BONE_HI);
  // the snout and the jaws; `open` throws the lower jaw wide
  const open = clamp(o.open, 0, 1);
  s.ellipse(cx + 18, cy + 5, 17, 8.5, BONE_LO);
  s.ellipse(cx + 17, cy + 4, 15, 7, bone);
  const jaw = 4 + open * 14;
  s.ellipse(cx + 17, cy + 10 + jaw * 0.4, 15, 3 + open * 3, '#2a0a10');
  s.dither(cx + 17, cy + 11 + jaw * 0.35, 14, 4 + open * 3, C.red, 0.3 + 0.3 * open);
  s.line(cx + 2, cy + 11, cx + 34, cy + 7 + jaw * 0.9, BONE_LO, 4);
  s.line(cx + 2, cy + 11, cx + 34, cy + 6 + jaw * 0.9, bone, 2);
  for (let i = 0; i < 6; i++) {
    const fx = cx + 9 + i * 5;
    s.line(fx, cy + 8, fx + 0.5, cy + 14 + (i % 2) * 3, BONE_HI, 2);
    s.px(fx + 0.5, cy + 15 + (i % 2) * 3, '#ffffff');
  }
  for (let i = 0; i < 5; i++) {
    const fx = cx + 11 + i * 5;
    const fy = cy + 12 + jaw * 0.45 + i * 0.5;
    s.line(fx, fy + 4, fx + 0.5, fy - 3, BONE_HI, 2);
  }
  // sockets that burn
  for (const [ex, ey] of [[cx + 1, cy - 3], [cx + 12, cy - 1]] as [number, number][]) {
    s.ellipse(ex, ey, 5.5, 5, '#05080c');
    s.dither(ex, ey, 9, 8, C.red, 0.4 + 0.3 * (o.roar ?? 0));
    s.ellipse(ex, ey, 2.4, 2.4, C.redGlow);
    s.px(ex - 1, ey - 1, '#ffffff');
  }
  s.rect(cx + 28, cy + 1, 3, 3, '#05080c');
  rimPass(s, '#ffffff', 0.45, 29, '#fffbe8');
  p.alpha(o.fade);
  if (o.dir > 0) p.blit(s.canvas, x - cx, y - cy);
  else p.blitFlip(s.canvas, x - (W - cx), y - cy);
  p.alpha(1);
  void t;
}

/** The same maths as boneChain for the neck, so the skull you see is the skull you hit. */
function neckTip(k: number, dir: 1 | -1): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let a = -Math.PI / 2 + dir * 0.05;
  const len0 = 9.5 * (0.5 + 0.5 * k);
  let len = len0;
  const shown = k * 9;
  for (let i = 0; i < 9; i++) {
    if (i >= shown) break;
    const part = Math.min(1, shown - i);
    x += Math.cos(a) * len * part;
    y += Math.sin(a) * len * part;
    a += dir * 0.12;
    len *= 0.99;
  }
  return { x, y };
}

export class BoneWyrm extends Guardian {
  protected introLen = 4.6;
  protected dyingLen = 4.0;
  /** where the head is under the floor (or where it came up) */
  hx: number;
  hy: number;
  private mode: WMode = 'enter';
  private mt = 0;
  private hRise = 0;
  private hDir: 1 | -1 = 1;
  private open = 0;
  private roar = 0;
  private spd = 60;
  private near = 0;
  private biteT = 1;
  private hitDone = false;
  private tail: Tail;
  private tailT = 4;
  private sweepT = 6;
  private rainT = 4;
  private pillars: { x: number; y: number }[];
  private sweeps: { hs: Hazard[]; y0: number; y1: number }[] = [];
  private shake = 0;
  private fall = 0;
  private bones: { x: number; y: number; vx: number; vy: number; a: number }[] = [];

  constructor(hub: Hub, a: ArenaDef, onVictory: () => void) {
    super(hub, a, 'Bone Wyrm', 'it hears you', ACCENT, [3, 4, 4], onVictory);
    this.hx = a.x;
    this.hy = a.boss.y + 40;
    this.tail = { x: a.x, y: a.y, rise: 0, dir: 1, strike: 0, state: 'down', t: 0, tx: 0, ty: 0 };
    this.pillars = PILLARS.map(([dx, dy]) => ({ x: a.x + dx, y: a.y + dy }));
  }

  focus() {
    return { x: this.hRise > 0.1 ? this.hx : this.cx, y: (this.hRise > 0.1 ? this.hy : this.a.y) - 30 };
  }

  /** where the skull is: the end of the neck, which curls over toward where it looks */
  private skull() {
    const t = neckTip(this.hRise, this.hDir);
    return { x: this.hx + t.x + this.hDir * 6, y: this.hy + t.y - 6 };
  }

  lanceTarget() {
    return this.mode === 'up' && !this.hitDone && this.hRise > 0.8 ? this.skull() : null;
  }

  colliders(): Rect[] {
    return this.pillars.map((q) => ({ x0: q.x - 7, x1: q.x + 7, y0: q.y - 6, y1: q.y + 3 }));
  }

  /* ---------------------------------------------------------------- */
  /* entrance                                                          */
  /* ---------------------------------------------------------------- */

  protected onIntro() {
    this.mode = 'enter';
    this.hRise = 0;
    this.hx = this.cx;
    this.hy = this.a.y - 30;
    this.hub.audio.setDrone(0.2, 1.5);
    this.hub.audio.v.wyrmRattle(16);
    window.setTimeout(() => this.hub.audio.v.wyrmHiss(1.4), 1200);
    window.setTimeout(() => this.hub.audio.v.wyrmRoar(), 2300);
  }

  protected updateIntro(dt: number) {
    const hub = this.hub;
    this.shake = this.st > 0.6 && this.st < 2.2 ? 1 : 0;
    if (this.shake && Math.random() < dt * 24) burst(hub.parts, this.hx + (Math.random() - 0.5) * 60, this.hy + (Math.random() - 0.5) * 20, 1, ['#8a8068', '#e8e0c8', '#3a3428'], 30, 1);
    if (this.st > 0.6 && this.st < 2.2 && Math.random() < dt * 3) hub.shake(3);
    // the head comes up high, roars, and sinks again
    const up = smooth(unlerp(2.2, 2.9, this.st)) - smooth(unlerp(4.0, 4.5, this.st));
    this.hRise = clamp(up, 0, 1);
    this.open = this.st > 2.9 && this.st < 4.0 ? 1 : 0;
    this.roar = this.open;
    if (this.st > 2.2 && !this.erupted) {
      this.erupted = true;
      hub.audio.stomp();
      hub.shake(12);
      hub.ui.flash(0.4, 300);
      burst(hub.parts, this.hx, this.hy, 36, ['#8a8068', '#e8e0c8', '#3a3428'], 90, 1);
    }
    hub.camFocus = { x: this.hx, y: this.hy - 30 };
  }
  private erupted = false;

  /* ---------------------------------------------------------------- */
  /* phases                                                            */
  /* ---------------------------------------------------------------- */

  protected startPhase() {
    const hub = this.hub;
    this.sweeps = [];
    this.hz.clear();
    this.shots.clear();
    this.hRise = 0;
    this.open = 0;
    this.hitDone = false;
    this.tail.state = 'down';
    this.tail.rise = 0;
    this.tailT = 4.5;
    this.sweepT = 6;
    this.rainT = 4;
    if (this.phase > 0) {
      hub.audio.v.wyrmScreech(1);
      hub.shake(9);
      hub.ui.flash(0.4, 260);
      hub.ui.speech(this.phase === 1 ? 'it has a tail' : 'it is angry', 2200, ACCENT);
    }
    this.beginHunt();
  }

  protected restartPhase() {
    this.sweeps = [];
    this.hRise = 0;
    this.open = 0;
    this.tail.state = 'down';
    this.tail.rise = 0;
    this.tailT = 4.5;
    this.beginHunt();
  }

  private beginHunt() {
    const pl = this.pl;
    this.mode = 'hunt';
    this.mt = 0;
    this.near = 0;
    this.spd = 52;
    this.hitDone = false;
    // it starts well away from you
    if (dist(this.hx, this.hy, pl.x, pl.y) < 90) {
      this.hx = clamp(this.cx + (this.cx - pl.x), this.cx - 90, this.cx + 90);
      this.hy = clamp(this.a.y + (this.a.y - pl.y) * 0.6, this.a.y - 110, this.a.y + 150);
    }
    this.hub.audio.v.wyrmRattle(10);
  }

  protected onHurt() {
    // the skull snaps back under the floor
    this.hub.audio.v.wyrmScreech(0.9);
    this.mode = 'sink';
    this.mt = 0;
    this.hitDone = true;
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  protected updateFight(dt: number) {
    const hub = this.hub;
    this.mt += dt;
    hub.camFocus = this.focus();
    this.updateTail(dt);
    this.pushOut(dt);
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const sw = this.sweeps[i]!;
      const h0 = sw.hs[0]!;
      if (h0.t >= h0.warn) {
        const u = clamp((h0.t - h0.warn) / h0.live, 0, 1);
        for (const h of sw.hs) h.y = lerp(sw.y0, sw.y1, u);
      }
      if (h0.t > h0.warn + h0.live + h0.fade) this.sweeps.splice(i, 1);
    }

    if (this.mode === 'hunt') this.doHunt(dt);
    else if (this.mode === 'lock') this.doLock(dt);
    else if (this.mode === 'up') this.doUp(dt);
    else if (this.mode === 'sink') {
      this.hRise = Math.max(0, this.hRise - dt * 3);
      this.open = Math.max(0, this.open - dt * 5);
      if (this.hRise <= 0 && this.mt > 0.45) this.beginHunt();
    } else if (this.mode === 'roar') {
      this.roar = 1;
      this.open = 1;
      this.hRise = Math.min(1, this.hRise + dt * 4);
      if (this.mt > 1.4) {
        this.mode = 'sink';
        this.mt = 0;
      }
    }

    // the extra attacks of the later phases come on their own clocks
    const free = this.mode === 'hunt' || this.mode === 'up';
    if (this.phase >= 1 && this.tail.state === 'down' && free) {
      this.tailT -= dt;
      if (this.tailT <= 0) {
        this.slamTail();
        this.tailT = (this.phase === 1 ? 5.4 : 6.8) / D.speed;
      }
    }
    if (this.phase >= 2 && free && this.tail.state === 'down') {
      this.sweepT -= dt;
      if (this.sweepT <= 0) {
        this.sweep();
        this.sweepT = 9.5 / D.speed;
      }
      this.rainT -= dt;
      if (this.rainT <= 0) {
        this.rainBones();
        this.rainT = 11 / D.speed;
      }
    }
  }

  private pushOut(dt: number) {
    const pl = this.pl;
    if (this.hRise > 0.5 && pl.dead <= 0 && Math.hypot(pl.x - this.hx, pl.y - this.hy) < 12) {
      const a = Math.atan2(pl.y - this.hy, pl.x - this.hx);
      const nx = pl.x + Math.cos(a) * 80 * dt;
      const ny = pl.y + Math.sin(a) * 80 * dt;
      if (this.hub.canStand(nx, pl.y)) pl.x = nx;
      if (this.hub.canStand(pl.x, ny)) pl.y = ny;
    }
  }

  /** the mound of dust under the floor, coming for you */
  private doHunt(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.spd = Math.min(120, 52 + this.mt * 22) * D.speed;
    const dx = pl.x - this.hx;
    const dy = pl.y - this.hy;
    const d = Math.hypot(dx, dy) || 1;
    const nx = this.hx + (dx / d) * this.spd * dt;
    const ny = this.hy + (dy / d) * this.spd * dt;
    if (hub.land.isWalk(nx, this.hy)) this.hx = nx;
    if (hub.land.isWalk(this.hx, ny)) this.hy = ny;
    if (Math.random() < dt * 22) burst(hub.parts, this.hx + (Math.random() - 0.5) * 14, this.hy, 1, ['#8a8068', '#5a5238', '#2a2418'], 22, 1);
    if (Math.floor(this.mt * 3) !== Math.floor((this.mt - dt) * 3)) hub.audio.thump(0.4);
    this.near = d < 20 ? this.near + dt : 0;
    if (this.mt > 3.4 || this.near > 0.35) {
      this.mode = 'lock';
      this.mt = 0;
      this.hDir = pl.x > this.hx ? 1 : -1;
      const x = this.hx;
      const y = this.hy;
      hub.audio.v.wyrmHiss(0.9);
      hub.audio.rumble();
      this.hz.add({ kind: 'disc', x, y, r: 28, warn: 1.0 * D.tele, live: 0.25, col: 'bone', tag: 'erupt', onLive: () => this.erupt(x, y) });
    }
  }

  private doLock(dt: number) {
    // it holds still under the floor while the ring flashes
    if (Math.random() < dt * 30) burst(this.hub.parts, this.hx + (Math.random() - 0.5) * 24, this.hy, 1, ['#8a8068', '#e8e0c8'], 30, 1);
  }

  private erupt(x: number, y: number) {
    const hub = this.hub;
    this.hx = x;
    this.hy = y;
    this.mode = 'up';
    this.mt = 0;
    this.hitDone = false;
    this.biteT = 1.3;
    this.hRise = 0.05;
    hub.audio.stomp();
    hub.audio.v.wyrmScreech(1);
    hub.shake(9);
    hub.ui.flash(0.35, 240);
    burst(hub.parts, x, y - 4, 30, ['#8a8068', '#e8e0c8', '#3a3428'], 90, 1);
    // spikes of bone around the hole, one after another
    const a0 = Math.random() * TAU;
    const n = this.phase >= 1 ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const ang = a0 + (i / n) * TAU;
      this.hz.add({ kind: 'disc', x: x + Math.cos(ang) * 40, y: y + Math.sin(ang) * 28, r: 8, warn: 0.4 + i * 0.07, live: 0.25, col: 'bone', onLive: () => hub.audio.snap() });
    }
  }

  private doUp(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.hRise = Math.min(1, this.hRise + dt * 4);
    this.open = 0.2 + 0.3 * Math.max(0, Math.sin(this.mt * 3));
    this.hDir = pl.x > this.hx ? 1 : -1;
    this.biteT -= dt;
    // it snaps at you: a ring where you stand, then the jaws
    if (this.biteT <= 0 && this.mt > 1.0) {
      this.biteT = 1.8 / D.speed;
      const bx = pl.x;
      const by = pl.y;
      hub.audio.warnPing();
      this.hz.add({ kind: 'disc', x: bx, y: by, r: 18, warn: 0.75 * D.tele, live: 0.2, col: 'bone', tag: 'bite', onLive: () => {
        hub.audio.snap();
        this.open = 1;
        burst(hub.parts, bx, by, 8, ['#e8e0c8', '#ffffff'], 40, 1);
      } });
    }
    if (this.mt > 3.2 * D.window) {
      this.mode = 'sink';
      this.mt = 0;
      hub.audio.v.wyrmHiss(0.7);
    }
  }

  /* ---------------------------------------------------------------- */
  /* the tail                                                          */
  /* ---------------------------------------------------------------- */

  /** the scorpion tail rises where you are, curls, and drives its stinger down */
  private slamTail() {
    const hub = this.hub;
    const pl = this.pl;
    const t = this.tail;
    // it comes up on the far side of the arena from the head, a little off from you
    t.x = clamp(pl.x + (Math.random() < 0.5 ? -1 : 1) * 40, this.cx - 90, this.cx + 90);
    t.y = clamp(pl.y + 38, this.a.y - 60, this.a.y + this.a.ry - 50);
    t.dir = t.x > this.cx ? -1 : 1;
    t.state = 'rising';
    t.t = 0;
    t.rise = 0;
    t.strike = 0;
    t.tx = pl.x;
    t.ty = pl.y;
    hub.audio.v.wyrmRattle(18);
    hub.audio.warnPing();
  }

  private sweep() {
    const hub = this.hub;
    // two halves of a tail that sweep across the floor, with a doorway between them
    const gapX = this.cx + (Math.random() - 0.5) * 120;
    const gapW = 30;
    const fromTop = Math.random() < 0.5;
    const y0 = fromTop ? this.a.y - this.a.ry + 90 : this.a.y + this.a.ry - 30;
    const y1 = fromTop ? this.a.y + this.a.ry - 30 : this.a.y - this.a.ry + 90;
    const warn = 1.3 * D.tele;
    const sweepLen = 1.9 / D.speed;
    const left = { x: this.cx - 124, w: gapX - gapW - (this.cx - 124) };
    const right = { x: gapX + gapW, w: this.cx + 124 - (gapX + gapW) };
    hub.audio.v.wyrmRattle(24);
    hub.audio.v.wyrmScreech(0.6);
    const mk = (seg: { x: number; w: number }) => this.hz.add({ kind: 'line', x: seg.x, y: y0, ang: 0, len: seg.w, wd: 8, warn, live: sweepLen, fade: 0.3, col: 'bone', tag: 'sweep', dmg: 1 });
    this.sweeps.push({ hs: [mk(left), mk(right)], y0, y1 });
    // the gap is marked with a post of bone
    this.hz.add({ kind: 'disc', x: gapX, y: y0, r: 5, warn, live: 0.01, fade: 0.1, col: 'bone', dmg: 0, soft: true });
  }

  private rainBones() {
    const hub = this.hub;
    const pl = this.pl;
    hub.audio.v.wyrmRoar();
    this.mode = 'roar';
    this.mt = 0;
    hub.shake(5);
    for (let i = 0; i < 7; i++) {
      const x = i === 0 ? pl.x : this.cx + (Math.random() - 0.5) * 190;
      const y = i === 0 ? pl.y : this.a.y + (Math.random() - 0.3) * 250;
      if (!hub.land.isWalk(x, y)) continue;
      this.hz.add({
        kind: 'disc',
        x,
        y,
        r: 15,
        warn: 0.9 * D.tele + i * 0.12,
        live: 0.2,
        col: 'bone',
        onLive: () => {
          hub.audio.snap();
          burst(hub.parts, x, y - 6, 10, ['#e8e0c8', '#ffffff', '#8a8068'], 50, 1);
        },
      });
    }
  }

  private updateTail(dt: number) {
    const hub = this.hub;
    const t = this.tail;
    t.t += dt;
    if (t.state === 'rising') {
      t.rise = Math.min(1, t.rise + dt * 1.4);
      if (t.rise >= 1) {
        t.state = 'hold';
        t.t = 0;
        // the stinger will come down on the spot it is hovering over
        t.tx = t.x + t.dir * 6;
        t.ty = t.y;
        this.hz.add({ kind: 'disc', x: t.tx, y: t.ty, r: 30, warn: 0.9 * D.tele, live: 0.25, col: 'bone', tag: 'tail', onLive: () => this.tailHit() });
      }
    } else if (t.state === 'hold') {
      // it draws back over the target
      t.strike = -0.25 * Math.sin(Math.min(1, t.t / (0.9 * D.tele)) * Math.PI * 0.5);
      if (t.t > 0.9 * D.tele) {
        t.state = 'slam';
        t.t = 0;
      }
    } else if (t.state === 'slam') {
      t.strike = Math.min(1, t.t / 0.12);
      if (t.t > 0.12 + 0.35) {
        t.state = 'stuck';
        t.t = 0;
      }
    } else if (t.state === 'stuck') {
      if (t.t > 1.1) {
        t.state = 'sinking';
        t.t = 0;
      }
    } else if (t.state === 'sinking') {
      t.rise = Math.max(0, t.rise - dt * 2.4);
      t.strike = Math.max(0, t.strike - dt * 3);
      if (t.rise <= 0) t.state = 'down';
    }
    void hub;
  }

  private tailHit() {
    const hub = this.hub;
    const t = this.tail;
    hub.audio.stomp();
    hub.shake(7);
    burst(hub.parts, t.tx, t.ty, 20, ['#8a8068', '#e8e0c8', '#3a3428'], 80, 1);
    // the stinger flings needles of bone
    const a0 = Math.random() * TAU;
    const n = this.phase >= 2 ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU;
      this.shots.add({ x: t.tx, y: t.ty - 6, vx: Math.cos(a) * 100 * D.speed, vy: Math.sin(a) * 100 * D.speed * 0.8, kind: 'bone', r: 3, life: 2.6, spin: i });
    }
  }

  /* ---------------------------------------------------------------- */
  /* being hit                                                         */
  /* ---------------------------------------------------------------- */

  private hurtSkull(): boolean {
    if (this.mode !== 'up' || this.hitDone || this.hRise < 0.6) return false;
    const s = this.skull();
    if (this.damage(1, s.x, s.y)) {
      this.hitDone = true;
      return true;
    }
    return false;
  }

  onPulse(x: number, y: number, R: number) {
    this.shots.clearIn(x, y, R + 2, false);
    if (this.mode === 'up' && !this.hitDone && this.hRise > 0.6 && this.pulseReach(this.hx, this.hy, R, x, y, 30)) this.hurtSkull();
  }

  onLance(l: Lance): boolean {
    if (this.mode === 'up' && !this.hitDone && this.hRise > 0.6) {
      const s = this.skull();
      if (dist(l.x, l.y, s.x, s.y) < 15) {
        this.hurtSkull();
        return true;
      }
    }
    // the stinger is armour: a lance glances off it
    if (this.tail.rise > 0.4) {
      const tp = this.tailTip();
      if (dist(l.x, l.y, tp.x, tp.y) < 12) {
        burst(this.hub.parts, l.x, l.y, 5, ['#e8e0c8', '#ffffff'], 40, 0);
        return true;
      }
    }
    return false;
  }

  onNova(n: Nova) {
    this.shots.clearIn(n.x, n.y, n.R);
    if (this.state !== 'fight') return;
    if (this.mode === 'up' && !this.hitDone && Math.hypot(n.x - this.hx, (n.y - this.hy) / 0.72) <= n.R + 30) this.hurtSkull();
    else if (this.mode === 'hunt' && Math.hypot(n.x - this.hx, (n.y - this.hy) / 0.72) <= n.R + 20) {
      // a Nova drags it up where it can be hurt
      this.hz.clear('erupt');
      this.erupt(this.hx, this.hy);
    }
  }

  /* ---------------------------------------------------------------- */
  /* dying                                                             */
  /* ---------------------------------------------------------------- */

  protected onDie() {
    this.mode = 'dying';
    this.hz.clear();
    this.hRise = Math.max(this.hRise, 0.8);
    this.fall = 0;
    this.bones = [];
    this.hub.audio.v.wyrmScreech(1.3);
    this.hub.audio.v.wyrmRoar();
  }

  protected updateDying(dt: number) {
    const hub = this.hub;
    const u = this.st / this.dyingLen;
    this.fall = u;
    this.open = 1;
    this.roar = 1;
    this.hRise = Math.max(0, 1 - Math.max(0, u - 0.4) * 1.7);
    this.tail.rise = Math.max(0, this.tail.rise - dt);
    if (Math.random() < dt * 40) {
      const s = this.skull();
      this.bones.push({ x: s.x + (Math.random() - 0.5) * 20, y: s.y + 10, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 40, a: Math.random() * TAU });
      burst(hub.parts, s.x, s.y, 2, ['#e8e0c8', '#ffffff', '#8a8068'], 50, 1);
    }
    for (const b of this.bones) {
      b.vy += 220 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += dt * 9;
      if (b.y > this.hy) {
        b.y = this.hy;
        b.vy *= -0.3;
        b.vx *= 0.6;
      }
    }
    hub.camFocus = { x: this.hx, y: this.hy - 30 };
  }

  /* ---------------------------------------------------------------- */
  /* drawing                                                           */
  /* ---------------------------------------------------------------- */

  private tailTip() {
    const t = this.tail;
    // a chain that curls over like a scorpion's, then drives down on `strike`
    const bend = lerp(0.2, 0.42, clamp(0.5 + t.strike * 0.5 + 0.35, 0, 1)) * t.dir;
    const ang0 = -Math.PI / 2 + t.dir * lerp(-0.1, 0.35, clamp(t.strike + 0.2, 0, 1));
    const n = 8;
    let x = t.x;
    let y = t.y;
    let a = ang0;
    let len = 16 * t.rise;
    for (let i = 0; i < n; i++) {
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      a += bend * (1 + t.strike * 0.8);
      len *= 0.9;
    }
    return { x, y, ang: a };
  }

  private drawTail(p: Pix, cx: number, cy: number, t: number, fade: number) {
    const tl = this.tail;
    if (tl.rise <= 0.02) return;
    const sx = tl.x - cx;
    const sy = tl.y - cy;
    p.alpha(fade);
    // the hole
    p.ellipse(sx, sy, 15, 6, '#05080c');
    p.ellipse(sx, sy - 1, 12, 4.5, '#0c1014');
    const bend = lerp(0.2, 0.42, clamp(0.5 + tl.strike * 0.5 + 0.35, 0, 1)) * tl.dir;
    const ang0 = -Math.PI / 2 + tl.dir * lerp(-0.1, 0.35, clamp(tl.strike + 0.2, 0, 1));
    // the chain, with the bend growing toward the end
    let x = sx;
    let y = sy;
    let a = ang0;
    let len = 16;
    let r = 7.5;
    const n = 8;
    const shown = tl.rise * n;
    for (let i = 0; i < n && i < shown; i++) {
      const part = Math.min(1, shown - i);
      const nx = x + Math.cos(a) * len * part;
      const ny = y + Math.sin(a) * len * part;
      p.line(x, y, nx, ny, BONE_LO, Math.max(2, Math.round(r * 0.7)));
      p.line(nx, ny, nx + Math.cos(a - tl.dir * Math.PI / 2) * (r + 3), ny + Math.sin(a - tl.dir * Math.PI / 2) * (r + 3), BONE_LO, 2);
      p.ellipse(nx, ny, r, r * 0.92, BONE_LO);
      p.ellipse(nx + 0.5, ny - 0.5, r - 1.2, (r - 1.2) * 0.92, BONE);
      p.ellipse(nx + r * 0.3, ny - r * 0.35, r * 0.5, r * 0.35, BONE_HI);
      x = nx;
      y = ny;
      a += bend * (1 + tl.strike * 0.8);
      len *= 0.9;
      r = Math.max(2.6, r * 0.9);
    }
    // the stinger: a long barb at the tip that points where the tail points
    if (tl.rise > 0.95) {
      const bx = x + Math.cos(a) * 18;
      const by = y + Math.sin(a) * 18;
      p.line(x, y, bx, by, BONE_LO, 4);
      p.line(x, y, bx, by, BONE_HI, 2);
      p.px(bx, by, '#ffffff');
      p.line(x + Math.cos(a - 0.5) * 6, y + Math.sin(a - 0.5) * 6, bx, by, BONE, 1);
      p.dither(bx, by, 5, 4, C.red, 0.4);
    }
    p.alpha(1);
    void t;
  }

  ground() {
    const hub = this.hub;
    const p = hub.p;
    const cx = hub.camX;
    const cy = hub.camY;
    this.hz.draw(p, cx, cy, hub.time);
    // the mound of dust that hunts you
    if (this.mode === 'hunt' || this.mode === 'lock') {
      const sx = this.hx - cx;
      const sy = this.hy - cy;
      const t = hub.time;
      p.dither(sx, sy, 22, 8, '#5a5238', 0.6);
      p.dither(sx, sy, 14, 5, '#8a8068', 0.5);
      for (let i = 0; i < 3; i++) p.ellipse(sx + Math.sin(t * 5 + i * 2) * 6, sy - 2 - i * 1.5, 4 - i, 2, '#2a2418');
      p.px(sx + Math.sin(t * 7) * 5, sy - 5, BONE_HI);
    }
  }

  push(list: Drawable[]) {
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    for (const q of this.pillars) {
      if (!onScreen(hub, q.x, q.y, 60)) continue;
      list.push({
        y: q.y,
        fn: () => {
          const sx = q.x - cx;
          const sy = q.y - cy;
          // a pillar of stacked bone: a leg bone standing on end with a skull on top
          p.dither(sx, sy, 14, 5, '#02050a', 0.7);
          p.rect(sx - 4, sy - 34, 8, 34, BONE_LO);
          p.rect(sx - 3, sy - 34, 5, 34, BONE);
          p.rect(sx + 1, sy - 34, 2, 34, BONE_HI);
          p.ellipse(sx, sy - 36, 7, 4, BONE);
          p.ellipse(sx, sy - 1, 7, 3, BONE_LO);
          p.px(sx - 2, sy - 20, '#2a2418');
          p.px(sx + 1, sy - 12, '#2a2418');
        },
      });
    }
    const fade = this.state === 'dying' ? clamp(1 - (this.st - 2.6) / 1.2, 0, 1) : 1;
    if (this.tail.rise > 0.02) list.push({ y: this.tail.y + 2, fn: () => this.drawTail(p, cx, cy, t, fade) });
    if (this.hRise > 0.02) {
      list.push({
        y: this.hy + 2,
        fn: () => {
          p.alpha(fade);
          const sx = this.hx - cx;
          const sy = this.hy - cy;
          // the hole
          p.ellipse(sx, sy, 17, 7, '#05080c');
          p.ellipse(sx, sy - 1, 14, 5, '#0c1014');
          // the neck: a chain that rises and curls toward where it looks
          const dir = this.hDir;
          const k = this.hRise;
          const sway = Math.sin(t * 2.2) * 0.04;
          const tip = boneChain(p, sx, sy, { n: 9, len: 9.5 * (0.5 + 0.5 * k), taper: 0.99, r0: 9, ang: -Math.PI / 2 + dir * 0.05, bend: dir * 0.12, show: k, flash: this.flash > 0.1 });
          void sway;
          if (k > 0.5) {
            // the skull sits on the last vertebra and looks down at you
            drawSkull(p, tip.x + dir * 6, tip.y - 6, t, { dir, open: this.open, flash: this.flash > 0.1, fade: 1, roar: this.roar });
            // the skull glows where to strike
            if (this.mode === 'up' && !this.hitDone) {
              const pulse = 0.5 + 0.5 * Math.sin(t * 10);
              p.alpha(0.5 + 0.4 * pulse);
              p.ring(tip.x + dir * 6, tip.y - 6, 18 + pulse * 3, 13 + pulse * 2, 1, '#ffe9a0');
              p.alpha(1);
            }
          }
          p.alpha(1);
        },
      });
    }
    if (this.state === 'dying') {
      for (const b of this.bones) {
        list.push({ y: b.y, fn: () => {
          const dx = Math.cos(b.a) * 4;
          const dy = Math.sin(b.a) * 4;
          p.line(b.x - cx - dx, b.y - cy - dy, b.x - cx + dx, b.y - cy + dy, BONE, 2);
          p.px(b.x - cx + dx, b.y - cy + dy, '#ffffff');
        } });
      }
    }
  }

  overlay() {
    const hub = this.hub;
    this.shots.draw(hub.p, hub.camX, hub.camY, hub.time);
  }
}

void rng;
