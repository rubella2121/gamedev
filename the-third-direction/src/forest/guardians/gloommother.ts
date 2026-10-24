import { burst } from '../../core/art';
import { drawGloom } from '../../core/art2';
import { D } from '../../core/difficulty';
import { C } from '../../core/palette';
import type { Pix } from '../../core/pix';
import { H, W } from '../../core/pix';
import { clamp, dist, hash2, lerp, rng, smooth, TAU, unlerp } from '../../core/util';
import { drawLamp } from '../art3';
import type { ArenaDef } from '../land';
import type { Drawable, Hub, Lance, Nova, Patch, Rect } from '../types';
import { LightPuzzle, onScreen } from '../zones/parts';
import { Guardian } from './base';
import { arc, blitSink, buf, rimPass, tendril, whip } from './draw';

/* ------------------------------------------------------------------ */
/* her body                                                            */
/* ------------------------------------------------------------------ */

const SW = 172;
const SH = 116;
const BX = 86;
const BY = 108;

/** Where her eyes are on the body (relative to her feet), so the dark can show only them. */
const EYES: { dx: number; dy: number; big: boolean; ph: number }[] = (() => {
  const out: { dx: number; dy: number; big: boolean; ph: number }[] = [];
  const re = rng(31);
  for (let i = 0; i < 26; i++) {
    const a = re() * TAU;
    const d = 0.25 + Math.sqrt(re()) * 0.75;
    const ex = Math.cos(a) * 38 * d;
    const ey = -34 + Math.sin(a) * 27 * d;
    if (ey < -62 || Math.hypot(ex, ey + 70) < 18 || Math.hypot(ex, ey + 32) < 12) continue;
    out.push({ dx: ex, dy: ey, big: i % 5 === 0, ph: i * 1.9 });
  }
  out.push({ dx: -9, dy: -72, big: true, ph: 0.3 });
  out.push({ dx: 9, dy: -72, big: true, ph: 0.8 });
  return out;
})();

interface Lash {
  /** -1 left arm, 1 right arm */
  sg: -1 | 1;
  /** target in world px */
  tx: number;
  ty: number;
  t: number;
  warn: number;
  slam: number;
}

interface MotherOpts {
  /** 0..1: how open her chest is */
  exposed: number;
  flash: boolean;
  /** 0 = all of her, 1 = under the floor */
  sink: number;
  /** a ring of light around her that says she cannot be hurt */
  shield: number;
  /** 0..1 fade (death) */
  fade: number;
  lashL: Lash | null;
  lashR: Lash | null;
  /** how many eyes are still open (death closes them one by one), 0..1 */
  eyes: number;
}

function drawMother(p: Pix, x: number, y: number, t: number, o: MotherOpts, camX: number, camY: number) {
  const s = buf('mother2', SW, SH);
  const br = 1 + 0.02 * Math.sin(t * 1.8);
  const ex = o.exposed;
  const body = o.flash ? '#2c5a6a' : '#04060d';
  const lit = o.flash ? '#3a7a8a' : '#0a1822';
  // smoke and shadow on the ground, behind her
  const open = 1 - o.sink;
  p.dither(x, y - 3, 62, 9, '#010208', 0.5 + 0.4 * open);
  if (open > 0.2) {
    p.dither(x, y - 44, 66 * open, 48 * open, '#02030a', 0.3 * open);
    p.dither(x, y - 50, 50 * open, 38 * open, '#0a1620', 0.22 * open);
  }
  // arms: heavy tendrils that drag along the ground and end in claws (a lashing arm is drawn separately)
  for (const sg of [-1, 1] as const) {
    if ((sg < 0 ? o.lashL : o.lashR) !== null) continue;
    const hand = tendril(s, BX + sg * 24, BY - 38, [[sg * 12, 6], [sg * 26, 20], [sg * 38, 30], [sg * 46, 36]], 13, body, t * 1.4 + sg);
    for (let k = -1; k <= 1; k++) {
      s.line(hand.x, hand.y, hand.x + sg * (7 + k * 2), hand.y + 4 + k * 3, body, 3);
      s.px(hand.x + sg * (9 + k * 2), hand.y + 5 + k * 3, C.cyanEye);
    }
  }
  // the heap of her body
  const lumps: [number, number, number, number][] = [
    [0, -34, 40, 30],
    [-26, -22, 24, 20],
    [26, -22, 24, 20],
    [0, -52, 30, 20],
    [-16, -10, 26, 15],
    [16, -10, 26, 15],
  ];
  for (const [dx, dy, rx, ry] of lumps) s.ellipse(BX + dx, BY + dy, rx * br, ry * br, body);
  for (const [dx, dy, rx, ry] of lumps) s.ellipse(BX + dx + 3, BY + dy - 3, rx * 0.72, ry * 0.72, lit);
  for (const [dx, dy, rx, ry] of lumps) s.ellipse(BX + dx + 5, BY + dy - 5, rx * 0.4, ry * 0.4, o.flash ? '#5a9aaa' : '#10303e');
  // a hem of small tentacles where her pups crawl out
  for (let i = -8; i <= 8; i++) {
    const hx = BX + i * 5.5;
    const sway = Math.sin(t * 2.2 + i * 0.9) * 2;
    s.line(hx, BY - 8, hx + sway, BY + 2, body, 3);
    if (i % 3 === 0) s.px(hx + sway, BY + 3, C.cyanEye);
  }
  const r = rng(7);
  for (let i = 0; i < 30; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r());
    const sx = BX + Math.cos(a) * 36 * d;
    const sy = BY - 38 + Math.sin(a) * 26 * d;
    s.px(sx, sy, '#14384a');
    if (r() < 0.4) s.px(sx + 1, sy, '#1d5468');
  }
  // her hundred eyes (closing one by one when she dies)
  EYES.forEach((e, i) => {
    if (i / EYES.length > o.eyes) return;
    if (Math.sin(t * 1.7 + e.ph) < -0.6) return;
    s.rect(BX + e.dx, BY + e.dy, e.big ? 3 : 2, e.big ? 3 : 2, C.cyanEye);
    s.px(BX + e.dx, BY + e.dy, '#d8ffff');
    if (e.big) s.dither(BX + e.dx + 1, BY + e.dy + 1, 5, 4, C.cyanEye, 0.25);
  });
  // the chest: the core that shows when she is open
  const core = 5 + 5 * ex;
  s.dither(BX, BY - 32, core + 9, core + 7, C.cyanEye, 0.16 + 0.34 * ex);
  if (ex > 0.05) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3 + t * 0.3;
      s.line(BX, BY - 32, BX + Math.cos(a) * 36 * ex, BY - 32 + Math.sin(a) * 26 * ex, C.cyanEye, 1);
    }
    s.ellipse(BX, BY - 32, core, core * 1.1, '#bff8ff');
    s.ellipse(BX, BY - 32, core * 0.55, core * 0.6, '#ffffff');
  } else {
    s.ellipse(BX, BY - 32, 3.5, 3.8, '#0f4a58');
    s.px(BX, BY - 33, C.cyanEye);
  }
  // her head
  s.ellipse(BX, BY - 70, 20, 16, body);
  s.ellipse(BX + 2, BY - 73, 16, 12, lit);
  for (let i = -3; i <= 3; i++) {
    const h2 = 10 + (3 - Math.abs(i)) * 3 + Math.sin(t * 2 + i) * 1.2;
    s.line(BX + i * 6, BY - 82, BX + i * 8, BY - 82 - h2, body, 4);
    s.line(BX + i * 8, BY - 82 - h2 + 3, BX + i * 8.6, BY - 82 - h2, body, 2);
    s.px(BX + i * 8.6, BY - 83 - h2, C.cyanEye);
  }
  for (const sg of [-1, 1]) {
    const ex0 = BX + sg * 9;
    const ey0 = BY - 72;
    s.dither(ex0, ey0, 12, 9, C.cyanEye, 0.3);
    s.ellipse(ex0, ey0, 6, 5, '#27d8e8');
    s.ellipse(ex0, ey0, 5, 4, C.cyanEye);
    s.ellipse(ex0 - 1, ey0 - 1, 2, 1.6, '#d8ffff');
    s.rect(ex0 - 0.5, ey0 - 3, 1.4, 6.5, '#02030a');
    s.line(ex0 - sg * 7, ey0 - 6, ex0 + sg * 5, ey0 - 3, body, 2);
  }
  // a crescent of fangs, wider when she wails
  const gape = 4.5 + 3 * Math.max(0, Math.sin(t * 3)) * (ex > 0.5 ? 0.3 : 1) + ex * 3;
  s.ellipse(BX, BY - 60, 15, gape, '#010208');
  for (let i = -7; i <= 7; i++) {
    const fx = BX + i * 2.1;
    const fy = BY - 62 + Math.abs(i) * 0.45;
    s.rect(fx, fy, 1.4, 2 + (i & 1), '#bff8ff');
    if (i % 2 === 0) s.rect(fx, fy + 4 + (i & 1) + ex * 2, 1.2, 2, '#7ad8e8');
  }
  for (let i = -2; i <= 2; i += 2) s.line(BX + i * 4, BY - 57, BX + i * 4, BY - 50 + Math.sin(t * 3 + i) * 2, '#27a8b8', 1);
  rimPass(s, '#1d6a82', 0.75, 11, '#2a8aa0');
  if (o.fade < 1) p.alpha(clamp(o.fade, 0, 1));
  if (o.sink > 0) blitSink(p, s.canvas, x - BX, y - BY, BY, o.sink);
  else p.blit(s.canvas, x - BX, y - BY);
  p.alpha(1);
  // lashing arms: whips from her shoulders. They rise and sway over you, then slam down where you were.
  for (const sg of [-1, 1] as const) {
    const l = sg < 0 ? o.lashL : o.lashR;
    if (!l) continue;
    const sx = x + sg * 24;
    const sy = y - 38;
    const tx = l.tx - camX;
    const ty = l.ty - camY;
    if (l.t < l.warn) {
      const u = unlerp(0, l.warn, l.t);
      whip(p, sx, sy, lerp(sx + sg * 34, tx, 0.3 * u), sy - 44 - 8 * u, { bow: 14, wig: 3 + 3 * u, t, th: 7, col: body, hi: '#1d5468', tipCol: C.cyanEye });
    } else {
      const since = l.t - l.warn;
      const reach = since < 0.3 ? 1 : clamp(1 - (since - 0.3) * 2.6, 0.2, 1);
      whip(p, sx, sy, tx, ty, { bow: since < 0.3 ? 5 : 16, wig: 2, t, th: 7, col: body, hi: '#1d5468', reach, tipCol: C.cyanEye });
      if (since < 0.2) {
        p.dither(tx, ty, 14, 10, C.cyanEye, 0.6);
        p.px(tx, ty, '#ffffff');
      }
    }
  }
  // the shield: a ring of cyan that turns
  if (o.shield > 0.02) {
    const a = o.shield;
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * TAU + t * 0.6;
      const rx = 70;
      const ry = 52;
      if (i % 2) continue;
      p.alpha(0.7 * a);
      p.rect(x + Math.cos(ang) * rx, y - 46 + Math.sin(ang) * ry * 0.8, 2, 2, C.cyanEye);
    }
    p.alpha(0.18 * a);
    p.dither(x, y - 46, 66, 50, C.cyanEye, 0.25);
    p.alpha(1);
  }
}

/* ------------------------------------------------------------------ */
/* the fight                                                           */
/* ------------------------------------------------------------------ */

interface Min {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mode: 'orbit' | 'wind' | 'dash' | 'chase' | 'dying';
  ang: number;
  seed: number;
  cd: number;
  fade: number;
  t: number;
  tx: number;
  ty: number;
  /** a minion that came out of the dark: you only see its eyes */
  dark: boolean;
}

const PATCHES: Patch[] = [
  { x: 66, y: 2402, rx: 26, ry: 18 },
  { x: 190, y: 2402, rx: 26, ry: 18 },
];
export const MOTHER_PATCHES = PATCHES;
const LAMPS = [
  { x: 48, y: 2340 },
  { x: 208, y: 2340 },
  { x: 128, y: 2440 },
];

type Sub = 'shield' | 'exposed' | 'closing' | 'sink' | 'chase' | 'lock' | 'up' | 'dark';

export class Gloommother extends Guardian {
  protected introLen = 3.8;
  protected dyingLen = 3.4;
  bx: number;
  by: number;
  private sink = 1;
  private exposed = 0;
  private mode: Sub = 'shield';
  private subT = 0;
  private min: Min[] = [];
  private lashes: Lash[] = [];
  private lashT = 2.2;
  private dashT = 2.6;
  private shadow = { x: 0, y: 0, spd: 40, near: 0, orbT: 1.2 };
  private lamps = new LightPuzzle(LAMPS, 11, 14);
  private ringT = 3;
  private spawnT = 2;
  private darkness = 0;
  private lampsOn = false;
  private shieldA = 0;
  private flashHit = 0;
  private whispers = 0;

  constructor(hub: Hub, a: ArenaDef, onVictory: () => void) {
    super(hub, a, 'Gloommother', 'she is hungry', '#6ff0ff', [2, 2, 2], onVictory);
    this.bx = a.x;
    this.by = a.boss.y;
  }

  /** the middle of her chest, in world px */
  private core() {
    return { x: this.bx, y: this.by - 32 };
  }

  focus() {
    return { x: this.bx, y: this.by - 30 };
  }

  lanceTarget() {
    return this.exposed > 0.6 ? this.core() : null;
  }

  colliders(): Rect[] {
    return [];
  }

  /** Her body is solid: if you walk into her feet you are slid back out, never trapped inside. */
  private pushOut(dt: number) {
    const pl = this.pl;
    if (this.sink > 0.5 || pl.dead > 0) return;
    if (Math.abs(pl.x - this.bx) < 46 && pl.y > this.by - 14 && pl.y < this.by + 5 && this.hub.canStand(pl.x, pl.y + 110 * dt)) pl.y += 110 * dt;
  }

  /* ---------------------------------------------------------------- */
  /* entrance                                                          */
  /* ---------------------------------------------------------------- */

  protected onIntro() {
    const h = this.hub;
    this.sink = 1;
    this.exposed = 0;
    this.min = [];
    this.lashes = [];
    this.darkness = 0;
    this.lampsOn = false;
    h.audio.setDrone(0.2, 1.5);
    h.audio.v.motherWhispers(8);
    window.setTimeout(() => h.audio.v.motherWail(1), 2600);
    window.setTimeout(() => h.ui.speech('we were here first', 2600, '#6ff0ff'), 1400);
  }

  protected updateIntro(dt: number) {
    const u = unlerp(0.5, 3.0, this.st);
    this.sink = 1 - smooth(u);
    this.shieldA = smooth(unlerp(2.4, 3.4, this.st));
    if (this.st > 0.5 && this.st < 3.0 && Math.random() < dt * 14) {
      burst(this.hub.parts, this.bx + (Math.random() - 0.5) * 90, this.by - 2, 1, ['#05070f', C.cyanEye], 18, 1);
    }
    if (this.st > 3.0 && this.min.length === 0) this.spawnSwarm(8);
    this.hub.camFocus = this.focus();
  }

  /* ---------------------------------------------------------------- */
  /* phases                                                            */
  /* ---------------------------------------------------------------- */

  protected startPhase() {
    const h = this.hub;
    this.subT = 0;
    this.lashes = [];
    this.min = this.min.filter((m) => m.mode !== 'dying');
    if (this.phase === 0) {
      this.mode = 'shield';
      this.lashT = 2.4;
      this.dashT = 2.2;
      if (this.min.length === 0) this.spawnSwarm(8);
    } else if (this.phase === 1) {
      this.min = [];
      this.mode = 'sink';
      this.exposed = 0;
      h.audio.v.motherWail(0.9);
      h.ui.speech('the floor is ours', 2400, '#6ff0ff');
      h.ui.flash(0.4, 300);
      h.shake(7);
    } else {
      this.min = [];
      this.mode = 'dark';
      this.bx = this.a.x;
      this.by = this.a.boss.y;
      this.sink = 0;
      this.lamps.reset();
      this.lampsOn = true;
      this.ringT = 4;
      this.spawnT = 1.5;
      h.audio.v.motherWail(1);
      h.audio.v.motherWhispers(6);
      h.ui.speech('now you cannot see', 2600, '#6ff0ff');
      h.ui.flash(0.6, 400);
      h.shake(8);
    }
  }

  protected restartPhase() {
    this.min = [];
    this.lashes = [];
    this.hub.parts.length = 0;
    if (this.phase === 0) {
      this.mode = 'shield';
      this.exposed = 0;
      this.bx = this.a.x;
      this.by = this.a.boss.y;
      this.sink = 0;
      this.spawnSwarm(8);
    } else if (this.phase === 1) {
      this.mode = 'sink';
      this.subT = 0;
      this.exposed = 0;
      this.bx = this.a.x;
      this.by = this.a.boss.y;
      this.sink = 0;
    } else {
      this.mode = 'dark';
      this.lamps.reset();
      this.exposed = 0;
      this.bx = this.a.x;
      this.by = this.a.boss.y;
      this.sink = 0;
    }
  }

  protected onHurt() {
    const h = this.hub;
    h.audio.v.motherWail(0.7);
    this.exposed = 0.7;
    if (this.phase === 0) {
      this.mode = 'closing';
      this.subT = 0;
      this.lashes = [];
    } else if (this.phase === 1) {
      this.mode = 'sink';
      this.subT = 0;
      this.exposed = 0;
    } else {
      this.lamps.reset();
      this.min.forEach((m) => this.killMin(m, false));
    }
  }

  /* ---------------------------------------------------------------- */
  /* minions                                                           */
  /* ---------------------------------------------------------------- */

  private spawnSwarm(n: number) {
    this.hub.audio.v.motherWhispers(4);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU;
      this.min.push({ x: this.bx + Math.cos(ang) * 40, y: this.by - 40 + Math.sin(ang) * 20, vx: 0, vy: 0, mode: 'orbit', ang, seed: Math.random() * 99, cd: 0.6, fade: 0, t: 0, tx: 0, ty: 0, dark: false });
    }
  }

  private spawnDark() {
    const a = this.a;
    const ang = Math.random() * Math.PI + 0.1;
    const x = a.x + Math.cos(ang) * (a.rx - 22);
    const y = a.y + a.ry * 0.2 + Math.sin(ang) * (a.ry * 0.7);
    if (!this.hub.land.isWalk(x, y)) return;
    this.min.push({ x, y, vx: 0, vy: 0, mode: 'chase', ang: 0, seed: Math.random() * 99, cd: 0.8, fade: 0, t: 0, tx: 0, ty: 0, dark: true });
  }

  private killMin(m: Min, reward = true) {
    if (m.mode === 'dying') return;
    m.mode = 'dying';
    this.hub.audio.kill();
    burst(this.hub.parts, m.x, m.y - 3, 8, [C.cyanEye, '#05070f', '#16303a'], 36, 1);
    if (reward) this.hub.addLight(0.2);
  }

  private blocked(x: number, y: number): boolean {
    return !this.hub.land.isWalk(x, y) || !!this.hub.inPatch(x, y, 1.05) || (this.sink < 0.5 && Math.abs(x - this.bx) < 46 && y > this.by - 12 && y < this.by + 2);
  }

  private updateMinions(dt: number) {
    const pl = this.pl;
    const hub = this.hub;
    const speed = (34 + Math.min(10, this.min.length * 0.8)) * D.speed;
    for (let i = this.min.length - 1; i >= 0; i--) {
      const m = this.min[i]!;
      m.t += dt;
      m.cd -= dt;
      if (m.mode === 'dying') {
        m.fade -= dt * 4;
        if (m.fade <= -1) this.min.splice(i, 1);
        continue;
      }
      m.fade = Math.min(1, m.fade + dt * 3);
      if (m.mode === 'orbit') {
        m.ang += dt * 0.9 * D.speed;
        const tx = this.bx + Math.cos(m.ang) * 62;
        const ty = this.by - 46 + Math.sin(m.ang) * 32;
        m.x += (tx - m.x) * (1 - Math.exp(-5 * dt));
        m.y += (ty - m.y) * (1 - Math.exp(-5 * dt));
        continue;
      }
      if (m.mode === 'wind') {
        // it shakes and blinks, and then goes for where you were
        m.x += Math.sin(m.t * 60) * 0.3;
        if (m.t >= 0.6 * D.tele) {
          m.mode = 'dash';
          m.t = 0;
          const dx = m.tx - m.x;
          const dy = m.ty - m.y;
          const l = Math.hypot(dx, dy) || 1;
          m.vx = (dx / l) * 150 * D.speed;
          m.vy = (dy / l) * 150 * D.speed;
        }
        continue;
      }
      if (m.mode === 'dash') {
        const nx = m.x + m.vx * dt;
        const ny = m.y + m.vy * dt;
        if (!hub.land.isWalk(nx, ny)) m.mode = 'chase';
        else {
          m.x = nx;
          m.y = ny;
        }
        if (m.t > 0.7) m.mode = 'chase';
        if (dist(m.x, m.y, pl.x, pl.y) < 7 && m.cd <= 0 && !pl.hide && pl.dead <= 0) {
          hub.hurt(m.x, m.y, 1);
          m.cd = 1.3;
          m.mode = 'chase';
        }
        continue;
      }
      // chase, the way the Hollow's Gloomlings do: shadows cannot enter the light
      const dx = pl.x - m.x;
      const dy = pl.y - m.y;
      const d = Math.hypot(dx, dy) || 1;
      const safe = !!hub.inPatch(pl.x, pl.y, 1.0);
      let tx = 0;
      let ty = 0;
      if (!safe && pl.dead <= 0) {
        const wob = Math.sin(this.t * 3 + m.seed) * 0.5;
        tx = dx / d + (-dy / d) * wob;
        ty = dy / d + (dx / d) * wob;
      } else {
        tx = Math.sin(this.t * 0.7 + m.seed) * 0.5;
        ty = Math.cos(this.t * 0.6 + m.seed * 1.3) * 0.4;
      }
      if (m.cd > 0) {
        tx *= -0.3;
        ty *= -0.3;
      }
      m.vx += (tx * speed - m.vx) * (1 - Math.exp(-6 * dt));
      m.vy += (ty * speed - m.vy) * (1 - Math.exp(-6 * dt));
      const nx = m.x + m.vx * dt;
      const ny = m.y + m.vy * dt;
      if (!this.blocked(nx, m.y)) m.x = nx;
      else m.vx *= -0.3;
      if (!this.blocked(m.x, ny)) m.y = ny;
      else m.vy *= -0.3;
      if (d < 7 && m.cd <= 0 && !pl.hide && pl.dead <= 0) {
        hub.hurt(m.x, m.y, 1);
        m.cd = 1.3;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* attacks                                                           */
  /* ---------------------------------------------------------------- */

  /** An arm rises over the player, then slams down on where they were. */
  private lash(sg: -1 | 1) {
    const pl = this.pl;
    const warn = 0.95 * D.tele;
    const l: Lash = { sg, tx: pl.x, ty: pl.y, t: 0, warn, slam: 0 };
    this.lashes.push(l);
    this.hz.add({
      kind: 'disc',
      x: l.tx,
      y: l.ty,
      r: 16,
      warn,
      live: 0.2,
      fade: 0.3,
      col: 'cyan',
      onLive: () => {
        this.hub.audio.stomp();
        this.hub.shake(4);
        burst(this.hub.parts, l.tx, l.ty, 10, [C.cyanEye, '#05070f'], 40, 1);
      },
    });
    this.hub.audio.warnPing();
  }

  private updateLashes(dt: number) {
    for (let i = this.lashes.length - 1; i >= 0; i--) {
      const l = this.lashes[i]!;
      l.t += dt;
      if (l.t > l.warn + 0.65) this.lashes.splice(i, 1);
    }
  }

  protected updateFight(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.subT += dt;
    this.flashHit = this.flash > 0 ? 1 : 0;
    this.updateMinions(dt);
    this.updateLashes(dt);
    this.pushOut(dt);
    if (this.phase === 0) this.fightBrood(dt);
    else if (this.phase === 1) this.fightDive(dt);
    else this.fightEclipse(dt);
    this.exposed += (this.targetExposed() - this.exposed) * (1 - Math.exp(-6 * dt));
    this.shieldA += ((this.phase === 0 && this.mode === 'shield' ? 1 : 0) - this.shieldA) * (1 - Math.exp(-5 * dt));
    hub.camFocus = this.focus();
    void pl;
  }

  private targetExposed(): number {
    if (this.phase === 0) return this.mode === 'exposed' ? 1 : 0;
    if (this.phase === 1) return this.mode === 'up' ? 1 : 0;
    return this.lamps.t.filter((v) => v > 0).length >= 2 || this.lamps.solved ? 1 : 0;
  }

  private fightBrood(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    if (this.mode === 'shield') {
      // the swarm sends one or two at a time to dive at you
      this.dashT -= dt;
      if (this.dashT <= 0) {
        const orb = this.min.filter((m) => m.mode === 'orbit');
        if (orb.length > 0) {
          const n = this.hp <= this.pips[1]! + this.pips[2]! + 1 ? 2 : 1;
          for (let k = 0; k < n && orb.length > 0; k++) {
            const m = orb.splice(Math.floor(Math.random() * orb.length), 1)[0]!;
            m.mode = 'wind';
            m.t = 0;
            m.tx = pl.x;
            m.ty = pl.y;
            hub.audio.warnPing();
          }
        }
        this.dashT = 2.4 / D.speed;
      }
      // and her arms slam at you if you are near her
      this.lashT -= dt;
      if (this.lashT <= 0 && dist(pl.x, pl.y, this.bx, this.by - 20) < 110) {
        this.lash(pl.x < this.bx ? -1 : 1);
        this.lashT = 3.6 / D.speed;
      } else if (this.lashT <= 0) this.lashT = 0.6;
      if (this.min.filter((m) => m.mode !== 'dying').length === 0) {
        this.mode = 'exposed';
        this.subT = 0;
        hub.audio.v.motherWail(0.9);
        hub.ui.flash(0.45, 300);
        hub.shake(6);
        burst(hub.parts, this.bx, this.by - 40, 26, [C.cyanEye, '#ffffff'], 80, 1);
        hub.ui.speech('the shield is gone. hit her heart', 2200, '#6ff0ff');
      }
    } else if (this.mode === 'exposed') {
      this.lashT -= dt;
      if (this.lashT <= 0) {
        this.lash(pl.x < this.bx ? -1 : 1);
        this.lashT = 1.7 / D.speed;
      }
      if (this.subT > 5.5 * D.window) {
        this.mode = 'closing';
        this.subT = 0;
        hub.audio.v.motherLaugh();
      }
    } else if (this.mode === 'closing') {
      if (this.subT > 1.0) {
        this.mode = 'shield';
        this.subT = 0;
        this.dashT = 1.5;
        this.lashT = 2.4;
        this.spawnSwarm(this.hp <= this.pips[2]! + 1 ? 9 : 7);
      }
    }
  }

  /** The Dive: she sinks, the shadow hunts you, she bursts out where it caught you. */
  private fightDive(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    const sh = this.shadow;
    if (this.mode === 'sink') {
      this.sink = Math.min(1, this.sink + dt / 0.9);
      if (this.subT === dt || this.subT < dt * 1.5) {
        sh.x = this.bx;
        sh.y = this.by;
        sh.spd = 40;
        sh.near = 0;
        sh.orbT = 1.4;
      }
      if (this.sink >= 1) {
        this.mode = 'chase';
        this.subT = 0;
        hub.audio.v.motherWhispers(5);
      }
    } else if (this.mode === 'chase') {
      sh.spd = Math.min(86, 42 + this.subT * 16) * D.speed;
      const dx = pl.x - sh.x;
      const dy = pl.y - sh.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = sh.x + (dx / d) * sh.spd * dt;
      const ny = sh.y + (dy / d) * sh.spd * dt;
      if (hub.land.isWalk(nx, ny)) {
        sh.x = nx;
        sh.y = ny;
      }
      sh.near = d < 16 ? sh.near + dt : 0;
      sh.orbT -= dt;
      if (sh.orbT <= 0) {
        sh.orbT = 1.9 / D.speed;
        const a = Math.atan2(dy, dx);
        this.shots.add({ x: sh.x, y: sh.y - 6, vx: Math.cos(a) * 54, vy: Math.sin(a) * 54, kind: 'orb', r: 3.5, life: 4.5, homing: 1.0, pulsable: true });
        hub.audio.warnPing();
      }
      if (this.subT > 3.4 || sh.near > 0.35) {
        this.mode = 'lock';
        this.subT = 0;
        const warn = 1.0 * D.tele;
        hub.audio.rumble();
        const x = sh.x;
        const y = sh.y;
        this.hz.add({
          kind: 'disc',
          x,
          y,
          r: 30,
          warn,
          live: 0.25,
          col: 'cyan',
          tag: 'erupt',
          onLive: () => this.erupt(x, y),
        });
      }
    } else if (this.mode === 'lock') {
      // she is gone until the ring finishes
    } else if (this.mode === 'up') {
      this.sink = Math.max(0, this.sink - dt / 0.25);
      this.lashT -= dt;
      if (this.lashT <= 0 && this.subT > 1.6) {
        this.lash(pl.x < this.bx ? -1 : 1);
        this.lashT = 99;
      }
      if (this.subT > 3.6 * D.window) {
        this.mode = 'sink';
        this.subT = 0;
        hub.audio.v.motherLaugh();
      }
    }
  }

  private erupt(x: number, y: number) {
    const hub = this.hub;
    this.bx = x;
    this.by = y;
    this.sink = 0;
    this.mode = 'up';
    this.subT = 0;
    this.lashT = 99;
    hub.audio.stomp();
    hub.audio.v.motherWail(1);
    hub.shake(9);
    hub.ui.flash(0.4, 260);
    burst(hub.parts, x, y - 4, 30, [C.cyanEye, '#05070f', '#16303a'], 90, 1);
    // five arms burst out of the ground around her: stand between them
    const a0 = Math.random() * TAU;
    const warn = 0.8 * D.tele;
    for (let i = 0; i < 5; i++) {
      const ang = a0 + (i / 5) * TAU;
      this.hz.add({ kind: 'line', x, y: y - 6, ang, len: 82, wd: 6, warn, live: 0.25, fade: 0.3, col: 'cyan', soft: false });
    }
    hub.audio.warnPing();
  }

  private fightEclipse(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.lamps.update(dt);
    this.darkness += (0.86 - this.darkness) * (1 - Math.exp(-3 * dt));
    // the dark sends its own
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.3 / D.speed;
      if (this.min.filter((m) => m.mode !== 'dying').length < 7) this.spawnDark();
    }
    // her wail: a ring with a gap. The gap is where the ring is not.
    this.ringT -= dt;
    if (this.ringT <= 0) {
      this.ringT = 5.4 / D.speed;
      const toPl = Math.atan2((pl.y - this.by) / 0.72, pl.x - this.bx);
      const gapA = toPl + (Math.random() - 0.5) * 1.2;
      hub.audio.v.queenShriek(0.6);
      this.hz.add({ kind: 'ring', x: this.bx, y: this.by - 40, r: 22, thick: 6, grow: 62 * D.speed, gap: { a: gapA, w: 0.46 }, warn: 1.0 * D.tele, live: 3.8, fade: 0.4, col: 'cyan', dmg: 1 });
    }
    const lit = this.lamps.t.filter((v) => v > 0).length;
    if (lit >= 2 && !this.lampSay) {
      this.lampSay = true;
      hub.ui.speech('the light reaches her', 1800, '#6ff0ff');
      hub.audio.chime();
    }
    if (lit < 2) this.lampSay = false;
  }
  private lampSay = false;

  /* ---------------------------------------------------------------- */
  /* being hit                                                         */
  /* ---------------------------------------------------------------- */

  private canHurt(): boolean {
    return this.state === 'fight' && this.exposed > 0.6 && ((this.phase === 0 && this.mode === 'exposed') || (this.phase === 1 && this.mode === 'up') || (this.phase === 2 && this.targetExposed() > 0));
  }

  onPulse(x: number, y: number, R: number) {
    if (this.state !== 'fight' && this.state !== 'intro') return;
    for (const m of this.min) {
      if (m.mode !== 'dying' && dist(x, y, m.x, m.y) <= R + 3) this.killMin(m);
    }
    // a pulse also pops her homing orbs
    this.shots.clearIn(x, y, R + 4, true);
    if (this.canHurt() && this.pulseReach(this.core().x, this.core().y, R, x, y, 24)) this.damage(1, this.core().x, this.core().y);
    // lamps
    if (this.lampsOn && this.lamps.onPulse(x, y, R)) this.hub.audio.click();
  }

  onLance(l: Lance): boolean {
    for (const m of this.min) {
      if (m.mode !== 'dying' && dist(l.x, l.y, m.x, m.y) < 8) this.killMin(m);
    }
    this.shots.clearIn(l.x, l.y, 8, true);
    const c = this.core();
    // while her chest is open a lance flies straight in; the rest of the time her body stops it
    if (this.canHurt()) {
      if (dist(l.x, l.y, c.x, c.y) < 18) {
        this.damage(1, c.x, c.y);
        return true;
      }
      return false;
    }
    if (this.sink < 0.5 && Math.abs(l.x - this.bx) < 40 && l.y > this.by - 70 && l.y < this.by - 4) return true;
    return false;
  }

  onNova(n: Nova) {
    for (const m of this.min) {
      if (m.mode !== 'dying' && Math.hypot(n.x - m.x, (n.y - m.y) / 0.72) <= n.R) this.killMin(m, false);
    }
    this.shots.clearIn(n.x, n.y, n.R);
    // a Nova also tears her shield open
    const c = this.core();
    if (this.canHurt() && Math.hypot(n.x - c.x, (n.y - c.y) / 0.72) <= n.R + 20) this.damage(1, c.x, c.y);
  }

  /* ---------------------------------------------------------------- */
  /* dying                                                             */
  /* ---------------------------------------------------------------- */

  protected onDie() {
    const h = this.hub;
    this.mode = 'up';
    this.min.forEach((m) => this.killMin(m, false));
    h.audio.v.motherWail(1.4);
    h.audio.v.motherWhispers(10);
    h.ui.speech('we will be back in the dark', 2800, '#6ff0ff');
  }

  protected updateDying(dt: number) {
    const hub = this.hub;
    const u = this.st / this.dyingLen;
    this.sink = 0;
    this.exposed = 1;
    this.darkness *= Math.exp(-2 * dt);
    this.updateMinions(dt);
    if (Math.random() < dt * 40 * (1 - u * 0.5)) {
      burst(hub.parts, this.bx + (Math.random() - 0.5) * 100, this.by - 20 - Math.random() * 60, 2, [C.cyanEye, '#ffffff', '#05070f'], 40, 1);
    }
    if (this.st > 0.4 && Math.floor(this.st * 6) !== Math.floor((this.st - dt) * 6)) hub.audio.v.motherWhispers(1);
    hub.camFocus = this.focus();
  }

  /* ---------------------------------------------------------------- */
  /* drawing                                                           */
  /* ---------------------------------------------------------------- */

  ground() {
    const hub = this.hub;
    const p = hub.p;
    this.hz.draw(p, hub.camX, hub.camY, hub.time);
    // the shadow that hunts you
    if (this.phase === 1 && (this.mode === 'chase' || this.mode === 'lock')) {
      const sx = this.shadow.x - hub.camX;
      const sy = this.shadow.y - hub.camY;
      p.dither(sx, sy, 24, 16, '#010208', 0.9);
      p.dither(sx, sy, 15, 10, '#010208', 0.9);
      for (let i = 0; i < 4; i++) {
        const a = hub.time * 2 + i * 1.6;
        p.px(sx + Math.cos(a) * 14, sy + Math.sin(a) * 8, C.cyanEye);
      }
      p.px(sx - 4, sy - 1, C.cyanEye);
      p.px(sx + 4, sy - 1, C.cyanEye);
    }
  }

  push(list: Drawable[]) {
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    if (this.lampsOn) {
      LAMPS.forEach((l, i) => {
        if (onScreen(hub, l.x, l.y)) list.push({ y: l.y, fn: () => drawLamp(p, l.x - cx, l.y - cy, t, this.lamps.lit(i)) });
      });
    }
    const dyingFade = this.state === 'dying' ? clamp(1 - (this.st - 1.6) / 1.6, 0, 1) : 1;
    const eyes = this.state === 'dying' ? clamp(1 - this.st / 2.4, 0, 1) : 1;
    const lashL = this.lashes.find((l) => l.sg < 0) ?? null;
    const lashR = this.lashes.find((l) => l.sg > 0) ?? null;
    const dark = this.phase === 2 && this.state === 'fight' ? this.darkness : 0;
    // she is only a shape in the dark, until the light reaches her
    const reveal = dark > 0.1 ? clamp(this.exposed + (this.lamps.t.filter((v) => v > 0).length > 0 ? 0.35 : 0), 0, 1) : 1;
    if (this.sink < 0.98 && dyingFade > 0.01) {
      list.push({
        y: this.by,
        fn: () =>
          drawMother(p, this.bx - cx, this.by - cy, t + (this.state === 'dying' ? this.st * 8 : 0), {
            exposed: this.exposed,
            flash: this.flash > 0.12,
            sink: this.sink,
            shield: this.shieldA,
            fade: dyingFade * (dark > 0.1 ? 0.25 + 0.75 * reveal : 1),
            lashL,
            lashR,
            eyes,
          }, cx, cy),
      });
    }
    for (const m of this.min) {
      if (!onScreen(hub, m.x, m.y)) continue;
      const lampNear = this.lampsOn && this.lamps.inLight(m.x, m.y, 50);
      if (m.dark && dark > 0.1 && !lampNear && dist(m.x, m.y, this.pl.x, this.pl.y) > 42) continue;
      list.push({
        y: m.y,
        fn: () => {
          const a = m.mode === 'dying' ? Math.max(0, 1 + m.fade) : m.fade;
          drawGloom(p, m.x - cx, m.y - cy, t, m.seed, a);
          if (m.mode === 'wind') {
            p.alpha(0.6);
            p.line(m.x - cx, m.y - cy - 4, m.tx - cx, m.ty - cy - 4, C.redGlow, 1);
            p.alpha(1);
          }
        },
      });
    }
  }

  overlay() {
    const hub = this.hub;
    const p = hub.p;
    const cx = hub.camX;
    const cy = hub.camY;
    this.shots.draw(p, cx, cy, hub.time);
    // darkness with holes for the light
    if (this.phase === 2 && this.state === 'fight' && this.darkness > 0.05) this.drawDark();
    else if (this.state === 'dying' && this.darkness > 0.05) this.drawDark();
  }

  private darkCv: HTMLCanvasElement | null = null;

  private drawDark() {
    const hub = this.hub;
    const p = hub.p;
    const cx = hub.camX;
    const cy = hub.camY;
    if (!this.darkCv) {
      this.darkCv = document.createElement('canvas');
      this.darkCv.width = W;
      this.darkCv.height = H;
    }
    const c = this.darkCv.getContext('2d')!;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, W, H);
    // a dithered black veil: amount = how dark
    const a = this.darkness;
    c.fillStyle = '#03040a';
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const thr = a * 16;
    for (let y = 0; y < H; y++) {
      const row = BAYER[y & 3]!;
      let run = -1;
      for (let x = 0; x <= W; x++) {
        const on = x < W && row[x & 3]! < thr + (a > 0.7 ? 6 : 0);
        if (on && run < 0) run = x;
        if (!on && run >= 0) {
          c.fillRect(run, y, x - run, 1);
          run = -1;
        }
      }
    }
    // solid-ish at the edges, holes around the light
    c.fillStyle = '#03040a';
    c.globalAlpha = 0.55 * a;
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, k = 1) => {
      c.fillStyle = '#000';
      const rings: [number, number][] = [[1, 0.35], [0.8, 0.5], [0.6, 0.8], [0.42, 1]];
      for (const [rr, am] of rings) this.punch(c, x, y, r * rr, r * rr * 0.75, am * k);
    };
    hole(hub.player.x - cx, hub.player.y - cy - 6, 44);
    LAMPS.forEach((l, i) => {
      const lit = this.lamps.lit(i);
      if (lit > 0.02) hole(l.x - cx, l.y - cy - 6, 58 * (0.5 + 0.5 * lit), lit);
      else hole(l.x - cx, l.y - cy - 6, 12, 0.6);
    });
    // light pools and pulses keep their glow
    for (const q of hub.pulses) hole(q.x - cx, q.y - cy, 40 * (1 - q.t / 0.45) + 14, 1);
    c.globalCompositeOperation = 'source-over';
    p.blit(this.darkCv, 0, 0);
    // the shapes in the dark that have eyes
    const t = hub.time;
    const showEyes = (x: number, y: number, col: string) => {
      p.px(x - 2, y, col);
      p.px(x + 2, y, col);
    };
    if (this.state === 'fight' || this.state === 'dying') {
      EYES.forEach((e) => {
        if (Math.sin(t * 1.7 + e.ph) < -0.6) return;
        const ex = this.bx + e.dx - cx;
        const ey = this.by + e.dy - cy;
        p.rect(ex, ey, e.big ? 3 : 2, e.big ? 3 : 2, C.cyanEye);
      });
    }
    for (const m of this.min) {
      if (m.mode === 'dying') continue;
      if (m.dark) showEyes(m.x - cx, m.y - cy - 5, C.cyanEye);
    }
  }

  /** Punch a dithered hole in the veil. */
  private punch(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, amt: number) {
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const thr = clamp(amt, 0, 1) * 16;
    const y0 = Math.max(0, Math.floor(y - ry));
    const y1 = Math.min(H - 1, Math.ceil(y + ry));
    for (let yy = y0; yy <= y1; yy++) {
      const dy = (yy + 0.5 - y) / ry;
      if (dy * dy > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const xa = Math.max(0, Math.round(x - hw));
      const xb = Math.min(W - 1, Math.round(x + hw));
      const row = BAYER[yy & 3]!;
      let run = -1;
      for (let xx = xa; xx <= xb + 1; xx++) {
        const on = xx <= xb && row[xx & 3]! < thr;
        if (on && run < 0) run = xx;
        if (!on && run >= 0) {
          c.fillRect(run, yy, xx - run, 1);
          run = -1;
        }
      }
    }
  }
}

void hash2;
void arc;
void H;
