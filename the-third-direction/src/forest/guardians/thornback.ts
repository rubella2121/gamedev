import { burst, makeTree } from '../../core/art';
import { D } from '../../core/difficulty';
import { C } from '../../core/palette';
import type { Pix } from '../../core/pix';
import { clamp, dist, TAU, unlerp } from '../../core/util';
import type { ArenaDef } from '../land';
import { drawThornbackKing } from '../bossart';
import type { Drawable, Hub, Lance, Nova, Rect } from '../types';
import { onScreen } from '../zones/parts';
import { Guardian } from './base';

/**
 * The Thornback King: an old beetle the roots grew over. One rule all fight long: after every attack he is spent, and the
 * crack in his back (X's mark) splits open and glows. Strike it, as often as you can, before it closes.
 *   1  ROOT SNARE   he stamps and a root crawls out of him and hunts you along the ground; thorns burst up behind its head.
 *                   It turns slower than you walk: step aside at the last moment. A tree stops it.
 *   2  THORN RAIN   he shakes his crown and the thorns come down where their shadows are; then the roots again
 *   3  THORN WHEEL  he curls up and spins, throwing three turning arms of thorns; after it he is dizzy for longer
 * A Nova knocks him out of whatever he is doing and opens his back.
 */

const ACCENT = '#e0a060';
const TREE_SPOTS: [number, number][] = [
  [-54, 40],
  [54, 40],
  [0, 92],
  [-72, 136],
  [72, 136],
];

interface Tree {
  x: number;
  y: number;
  img: HTMLCanvasElement;
  /** a root just hit it */
  shake: number;
}

/** a root crawling along the ground after you */
interface Runner {
  x: number;
  y: number;
  ang: number;
  t: number;
  life: number;
  drop: number;
  dead: boolean;
}

type Attack = 'roots' | 'roots2' | 'rain' | 'wheel';
type KMode = 'enter' | 'walk' | 'windup' | 'roots' | 'rain' | 'spin' | 'gap' | 'open' | 'recover' | 'dying';

/** what he does in each phase before his back opens (the first round of a phase is the short one) */
const PLAN: Attack[][][] = [
  [['roots'], ['roots2']],
  [['rain', 'roots'], ['rain', 'roots2']],
  [['roots2', 'wheel'], ['rain', 'roots2', 'wheel']],
];

/** the root: how fast it crawls (px/s, the Blob walks at 66), how fast it turns (rad/s), how long it lives (s) */
const ROOT = { speed: 52, turn: 1.5, life: 2.6, step: 0.09, warn: 0.3, r: 9 };
/** the thorn rain: how many fall, how big their shadows are, how long the shadows show */
const RAIN = { n: 7, r: 13, warn: 1.05 };
/** the thorn wheel: arms, how fast it turns (rad/s), thorns per second per arm, thorn speed, how long */
const WHEEL = { arms: 3, turn: 1.6, rate: 6, speed: 82, len: 3.2 };
/** how long his back stays open: after an ordinary round, after the wheel, after a Nova */
const OPEN = { round: 3.0, wheel: 3.6, nova: 2.4 };

let treeImgs: HTMLCanvasElement[] | null = null;

/** A spinning spiky ball: the King curled up. */
function drawBall(p: Pix, x: number, y: number, t: number, spin: number, flash: boolean, fade: number) {
  p.alpha(fade);
  p.dither(x, y + 1, 20, 6, '#02050a', 0.8);
  const cy = y - 15;
  const r = 15;
  for (let i = 0; i < 14; i++) {
    const a = spin + (i / 14) * TAU;
    const x0 = x + Math.cos(a) * (r - 1);
    const y0 = cy + Math.sin(a) * (r - 1);
    const x1 = x + Math.cos(a) * (r + 9 + (i % 2) * 3);
    const y1 = cy + Math.sin(a) * (r + 9 + (i % 2) * 3);
    p.line(x0, y0, x1, y1, '#07101a', 4);
    p.line(x0, y0, x1, y1, '#4a6a82', 2);
    p.px(x1, y1, '#f4efe0');
  }
  p.ellipse(x, cy, r + 1, r + 1, '#05080e');
  p.ellipse(x, cy, r, r, flash ? '#7a9aaa' : '#1a2c3c');
  p.ellipse(x + 2, cy - 2, r - 4, r - 4, flash ? '#9ab8c8' : '#27425a');
  for (let i = 0; i < 5; i++) {
    const a = spin * 1.3 + (i / 5) * TAU;
    p.line(x + Math.cos(a) * 3, cy + Math.sin(a) * 3, x + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), '#0a121a', 1);
  }
  const hot = 0.5 + 0.5 * Math.sin(t * 9);
  p.line(x - 5, cy - 2, x + 1, cy + 4, hot > 0.5 ? C.redGlow : C.red, 1);
  p.px(x + 5, cy - 5, C.red);
  const ex = x + Math.cos(spin * 0.6) * 5;
  p.px(ex - 2, cy - 7 + Math.sin(spin) * 2, C.redGlow);
  p.px(ex + 2, cy - 7 + Math.sin(spin) * 2, C.redGlow);
  p.alpha(1);
}

export class ThornbackKing extends Guardian {
  protected introLen = 4.4;
  protected dyingLen = 3.6;
  x: number;
  y: number;
  face: 1 | -1 = 1;
  /** (read by the test bot) */
  mode: KMode = 'enter';
  private mt = 0;
  private trees: Tree[] = [];
  /** the roots crawling now (read by the test bot) */
  runners: Runner[] = [];
  /** this round's attacks, and which one is next */
  private round: Attack[] = [];
  private ri = 0;
  private rounds = 0;
  private attack: Attack = 'roots';
  /** how long his back stays open this time */
  private openLen = OPEN.round;
  private hurtCd = 0;
  private spin = 0;
  private wheelA = 0;
  private wheelEmit = 0;
  private fall = 0;
  private landed = false;
  private hinted = false;
  private snortT = 1;
  /** where he is walking to between rounds */
  private walkTo = { x: 0, y: 0 };

  constructor(hub: Hub, a: ArenaDef, onVictory: () => void) {
    super(hub, a, 'Thornback King', 'when his back cracks open, strike', ACCENT, [3, 3, 4], onVictory);
    this.x = a.x;
    this.y = a.boss.y;
    if (!treeImgs) treeImgs = [11, 12, 13, 14, 15].map((i) => makeTree(900 + i * 13, 92 + (i % 3) * 6));
    this.trees = TREE_SPOTS.map(([dx, dy], i) => ({ x: a.x + dx, y: a.y + dy, img: treeImgs![i]!, shake: 0 }));
  }

  focus() {
    return { x: this.x, y: this.y - 20 };
  }

  /** the crack in his back: where it glows, and where light has to reach to hurt him */
  weak() {
    return { x: this.x - this.face * 3, y: this.y - 44 };
  }

  get isOpen() {
    return this.mode === 'open';
  }

  lanceTarget() {
    return this.isOpen ? this.weak() : null;
  }

  colliders(): Rect[] {
    return this.trees.map((t) => ({ x0: t.x - 6, x1: t.x + 6, y0: t.y - 5, y1: t.y + 3 }));
  }

  /* ---------------------------------------------------------------- */
  /* entrance                                                          */
  /* ---------------------------------------------------------------- */

  protected onIntro() {
    this.mode = 'enter';
    this.mt = 0;
    this.x = this.cx;
    this.y = this.a.boss.y;
    this.face = 1;
    this.fall = 1;
    this.landed = false;
    this.runners = [];
    this.hub.audio.setDrone(0.18, 1.5);
  }

  protected updateIntro(dt: number) {
    this.mt += dt;
    const hub = this.hub;
    // he drops in from above the screen
    const u = unlerp(1.2, 2.0, this.st);
    this.fall = 1 - u * u;
    if (this.st >= 2.0 && !this.landed) {
      this.landed = true;
      hub.audio.stomp();
      hub.audio.v.kingBellow();
      hub.shake(12);
      hub.ui.flash(0.35, 300);
      burst(hub.parts, this.x, this.y, 36, ['#3a2a1e', '#5a7a7a', '#1a2c3c'], 90, 1);
      this.hub.land.addDecal(this.x, this.y, 30, 20, 0.6);
    }
    if (this.st > 2.6 && this.snortT > 0) {
      this.snortT = 0;
      hub.audio.v.kingSnort(3);
    }
    hub.camFocus = this.focus();
  }

  /* ---------------------------------------------------------------- */
  /* phases                                                            */
  /* ---------------------------------------------------------------- */

  protected startPhase() {
    this.hz.clear();
    this.shots.clear();
    this.runners = [];
    this.rounds = 0;
    this.fall = 0;
    this.toWalk();
    if (this.phase > 0) {
      this.hub.audio.v.kingBellow();
      this.hub.shake(8);
      this.hub.ui.flash(0.3, 250);
    }
  }

  protected restartPhase() {
    this.x = this.cx;
    this.y = this.a.boss.y;
    this.face = 1;
    this.runners = [];
    this.rounds = 0;
    this.toWalk();
  }

  /** walk somewhere new, then begin the next round */
  private toWalk() {
    this.mode = 'walk';
    this.mt = 0;
    const pl = this.pl;
    // a spot across the floor from you, not too near and not too far
    const a = this.a;
    let best = { x: this.x, y: this.y };
    let bs = -1e9;
    for (let i = 0; i < 12; i++) {
      const x = a.x + (Math.random() - 0.5) * a.rx * 1.1;
      const y = a.boss.y + Math.random() * 110;
      if (!this.hub.land.isWalk(x - 40, y) || !this.hub.land.isWalk(x + 40, y)) continue;
      const d = Math.hypot(x - pl.x, y - pl.y);
      const score = -Math.abs(d - 105) - 0.3 * Math.hypot(x - this.x, y - this.y);
      if (score > bs) {
        bs = score;
        best = { x, y };
      }
    }
    this.walkTo = best;
  }

  private beginRound() {
    const plan = PLAN[Math.min(this.phase, PLAN.length - 1)]!;
    this.round = plan[Math.min(this.rounds, plan.length - 1)]!;
    this.rounds++;
    this.ri = 0;
    this.nextAttack();
  }

  private nextAttack() {
    if (this.ri >= this.round.length) {
      this.openUp(this.round[this.round.length - 1] === 'wheel' ? OPEN.wheel : OPEN.round);
      return;
    }
    this.attack = this.round[this.ri++]!;
    this.mode = 'windup';
    this.mt = 0;
    this.face = this.pl.x >= this.x ? 1 : -1;
    const v = this.hub.audio.v;
    if (this.attack === 'wheel') {
      v.kingBellow();
      v.kingClack(3);
    } else if (this.attack === 'rain') v.kingClack(2);
    else v.kingSnort(2);
  }

  /** his back splits: the window to hit him */
  private openUp(len: number) {
    this.hz.clear('root');
    this.mode = 'open';
    this.mt = 0;
    this.openLen = len * D.window;
    const hub = this.hub;
    hub.audio.crumble();
    hub.audio.v.kingSnort(1);
    const w = this.weak();
    burst(hub.parts, w.x, w.y, 16, ['#ffe9a0', C.redGlow, '#f4efe0'], 50, 1);
    if (!this.hinted) {
      this.hinted = true;
      hub.ui.hint('his back is open: strike it');
      window.setTimeout(() => {
        if (hub.ui.hintIs('his back is open: strike it')) hub.ui.hint(null);
      }, 3200);
    }
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  protected updateFight(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    this.mt += dt;
    for (const t of this.trees) t.shake = Math.max(0, t.shake - dt);
    hub.camFocus = this.focus();
    this.updateRunners(dt);

    if (this.mode === 'walk') this.doWalk(dt);
    else if (this.mode === 'windup') this.doWindup();
    else if (this.mode === 'roots') {
      // he holds the stamp while his roots crawl; when they are done, on to the next attack
      if (this.mt > 0.4 && this.runners.length === 0) this.gap();
    } else if (this.mode === 'rain') {
      if (this.mt > RAIN.warn * D.tele + 0.35) this.gap();
    } else if (this.mode === 'spin') this.doSpin(dt);
    else if (this.mode === 'gap') {
      if (this.mt > 0.45) this.nextAttack();
    } else if (this.mode === 'open') {
      if (this.mt >= this.openLen) {
        this.mode = 'recover';
        this.mt = 0;
        hub.audio.v.kingBellow();
      }
    } else if (this.mode === 'recover') {
      if (this.mt > 0.8) this.toWalk();
    }
    // a player that walks into his body is shoved, never trapped (and the spinning ball hurts)
    const dx = pl.x - this.x;
    const dy = pl.y - this.y;
    if (Math.abs(dx) < 36 && Math.abs(dy) < 10 && pl.dead <= 0) {
      if (this.mode === 'spin' && this.hurtCd <= 0 && !pl.hide) {
        hub.hurt(this.x, this.y, 1);
        this.hurtCd = 0.9;
      }
      pl.x += Math.sign(dx || 1) * 70 * dt;
      pl.y += Math.sign(dy || 1) * 40 * dt;
    }
  }

  private gap() {
    this.mode = 'gap';
    this.mt = 0;
  }

  private doWalk(dt: number) {
    const hub = this.hub;
    this.snortT -= dt;
    if (this.snortT <= 0) {
      this.snortT = 3.2;
      hub.audio.v.kingSnort(2);
    }
    const dx = this.walkTo.x - this.x;
    const dy = this.walkTo.y - this.y;
    const sp = 70 * D.speed;
    const stepX = clamp(dx, -sp * dt, sp * dt);
    const stepY = clamp(dy, -sp * 0.7 * dt, sp * 0.7 * dt);
    if (hub.land.isWalk(this.x + stepX + Math.sign(stepX) * 38, this.y)) this.x += stepX;
    if (hub.land.isWalk(this.x, this.y + stepY)) this.y += stepY;
    if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1;
    const there = Math.abs(dx) < 4 && Math.abs(dy) < 4;
    if ((there && this.mt > 0.6) || this.mt > 2.2) this.beginRound();
  }

  private doWindup() {
    const hub = this.hub;
    const pl = this.pl;
    const T = (this.attack === 'wheel' ? 0.85 : this.attack === 'rain' ? 0.7 : 0.75) * D.tele;
    if (this.mt < T) return;
    this.mt = 0;
    if (this.attack === 'roots' || this.attack === 'roots2') {
      this.mode = 'roots';
      hub.audio.stomp();
      hub.shake(6);
      burst(hub.parts, this.x + this.face * 36, this.y, 14, [C.root, C.rootLight, '#3a2a1e'], 50, 1);
      const a0 = Math.atan2(pl.y - this.y, pl.x - (this.x + this.face * 36));
      const n = this.attack === 'roots2' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ang = a0 + (n === 1 ? 0 : (i - 0.5) * 1.1);
        this.runners.push({ x: this.x + this.face * 36, y: this.y + 2, ang, t: 0, life: ROOT.life, drop: 0, dead: false });
      }
    } else if (this.attack === 'rain') {
      this.mode = 'rain';
      hub.audio.snap();
      const w = this.weak();
      burst(hub.parts, w.x, w.y - 10, 18, ['#f4efe0', '#8fb0c0', '#4a6a82'], 90, 1, 140);
      this.rain();
    } else {
      this.mode = 'spin';
      this.wheelA = Math.atan2(pl.y - this.y, pl.x - this.x);
      this.wheelEmit = 0;
      hub.audio.rumble();
    }
  }

  /** the thorns from his crown come down: one where you stand, the rest around you, each one's shadow showing first */
  private rain() {
    const pl = this.pl;
    const spots: { x: number; y: number }[] = [{ x: pl.x, y: pl.y }];
    let tries = 0;
    while (spots.length < RAIN.n && tries++ < 80) {
      const a = Math.random() * TAU;
      const r = 26 + Math.random() * 56;
      const x = pl.x + Math.cos(a) * r;
      const y = pl.y + Math.sin(a) * r * 0.75;
      if (!this.hub.land.isWalk(x, y)) continue;
      // never shoulder to shoulder: there is always a way between them
      if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < RAIN.r * 2.4)) continue;
      spots.push({ x, y });
    }
    for (const s of spots) {
      this.hz.add({
        kind: 'disc',
        x: s.x,
        y: s.y,
        r: RAIN.r,
        warn: RAIN.warn * D.tele,
        live: 0.2,
        fade: 0.5,
        col: 'bone',
        tag: 'rain',
        onLive: (h) => {
          this.hub.audio.thump(0.4);
          burst(this.hub.parts, h.x, h.y - 2, 8, ['#f4efe0', '#8fb0c0', '#3a2a1e'], 40, 1);
        },
      });
    }
  }

  private updateRunners(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    for (const r of this.runners) {
      r.t += dt;
      // it turns toward you, but slower than you can walk round it
      const want = Math.atan2(pl.y - r.y, pl.x - r.x);
      let da = want - r.ang;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      r.ang += clamp(da, -ROOT.turn * dt, ROOT.turn * dt);
      const sp = ROOT.speed * D.speed;
      const nx = r.x + Math.cos(r.ang) * sp * dt;
      const ny = r.y + Math.sin(r.ang) * sp * dt * 0.8;
      // a tree stops it; so does the edge of the arena
      const tree = this.trees.find((t) => Math.hypot(t.x - nx, (t.y - ny) / 0.8) < 10);
      if (tree || !hub.land.isWalk(nx, ny) || r.t >= r.life) {
        r.dead = true;
        if (tree) {
          tree.shake = 0.5;
          hub.audio.thump(0.5);
          burst(hub.parts, nx, ny - 4, 12, [C.root, C.rootLight, '#5bbf6a'], 50, 1);
        }
        continue;
      }
      r.x = nx;
      r.y = ny;
      // thorns burst up out of the ground behind its head
      r.drop -= dt;
      if (r.drop <= 0) {
        r.drop = ROOT.step;
        this.hz.add({ kind: 'disc', x: r.x, y: r.y, r: ROOT.r, warn: ROOT.warn * D.tele, live: 0.18, fade: 0.6, col: 'green', tag: 'root' });
        if (Math.random() < 0.5) burst(hub.parts, r.x, r.y - 2, 2, ['#3a2a1e', C.root, C.rootLight], 30, 1, 60);
      }
    }
    this.runners = this.runners.filter((r) => !r.dead);
  }

  private doSpin(dt: number) {
    const hub = this.hub;
    this.spin += dt * 16;
    this.wheelA += WHEEL.turn * D.speed * dt;
    this.wheelEmit -= dt;
    if (this.wheelEmit <= 0) {
      this.wheelEmit = 1 / WHEEL.rate;
      for (let i = 0; i < WHEEL.arms; i++) {
        const a = this.wheelA + (i / WHEEL.arms) * TAU;
        this.shots.add({ x: this.x + Math.cos(a) * 18, y: this.y - 14 + Math.sin(a) * 14, vx: Math.cos(a) * WHEEL.speed * D.speed, vy: Math.sin(a) * WHEEL.speed * D.speed * 0.8, kind: 'thorn', r: 3, life: 2.6, tag: 'wheel' });
      }
      if (Math.floor(this.mt * 4) !== Math.floor((this.mt - dt) * 4)) hub.audio.snap();
    }
    if (this.mt >= WHEEL.len) {
      // he stops, dizzy, and lies open
      hub.shake(5);
      this.mt = 0;
      this.nextAttack();
    }
  }

  /* ---------------------------------------------------------------- */
  /* being hit                                                         */
  /* ---------------------------------------------------------------- */

  private tryHit(): boolean {
    if (!this.isOpen) return false;
    const w = this.weak();
    return this.damage(1, w.x, w.y);
  }

  onPulse(x: number, y: number, R: number) {
    this.shots.clearIn(x, y, R + 2, true);
    if (!this.isOpen) return;
    // the light has to reach him: the crack, or anywhere on the near side of his shell
    const w = this.weak();
    if (this.pulseReach(w.x, w.y, R, x, y, 26) || this.pulseReach(this.x, this.y - 12, R, x, y, 34)) this.tryHit();
  }

  onLance(l: Lance): boolean {
    if (this.isOpen) {
      const w = this.weak();
      if (dist(l.x, l.y, w.x, w.y) < 18) {
        this.tryHit();
        return true;
      }
    }
    // his shell turns a lance away
    if (this.mode !== 'dying' && Math.abs(l.x - this.x) < 44 && l.y > this.y - 56 && l.y < this.y + 2) {
      burst(this.hub.parts, l.x, l.y, 5, ['#8fb0c0', '#ffffff'], 40, 0);
      return true;
    }
    return false;
  }

  onNova(n: Nova) {
    this.shots.clearIn(n.x, n.y, n.R);
    if (this.state !== 'fight') return;
    if (Math.hypot(n.x - this.x, (n.y - this.y) / 0.72) > n.R + 30) return;
    if (this.isOpen) {
      this.tryHit();
      return;
    }
    // a Nova knocks him out of whatever he was doing, and his back opens
    this.runners = [];
    this.hz.clear();
    this.shots.clear('wheel');
    this.hub.audio.v.kingBellow();
    this.openUp(OPEN.nova);
  }

  /* ---------------------------------------------------------------- */
  /* dying                                                             */
  /* ---------------------------------------------------------------- */

  protected onDie() {
    this.mode = 'dying';
    this.runners = [];
    this.hub.audio.v.kingBellow();
    this.hub.audio.v.kingSnort(4);
  }

  protected updateDying(dt: number) {
    const hub = this.hub;
    const u = this.st / this.dyingLen;
    if (Math.random() < dt * 30) {
      burst(hub.parts, this.x + (Math.random() - 0.5) * 80, this.y - 20 - Math.random() * 40, 2, ['#8fb0c0', '#f4efe0', C.red, '#3a2a1e'], 60, 1, 120);
    }
    if (u > 0.5 && Math.random() < dt * 20) burst(hub.parts, this.x + (Math.random() - 0.5) * 70, this.y - 10, 2, ['#2e7d4f', '#5bbf6a', '#07121c'], 40, 1, 40);
    hub.camFocus = this.focus();
  }

  /* ---------------------------------------------------------------- */
  /* drawing                                                           */
  /* ---------------------------------------------------------------- */

  ground() {
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    this.hz.draw(p, cx, cy, t);
    // the thorns that burst up behind a root, and the rain as it lands
    for (const h of this.hz.list) {
      if (h.t < h.warn) continue;
      const k = 1 - clamp((h.t - h.warn) / (h.live + h.fade), 0, 1);
      const x = h.x - cx;
      const y = h.y - cy;
      const n = h.tag === 'root' ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + h.x * 0.1;
        const bx = x + Math.cos(a) * h.r * 0.4;
        const by = y + Math.sin(a) * h.r * 0.25;
        const tall = (h.tag === 'root' ? 15 : 13) * k * (0.7 + 0.3 * ((i * 7) % 3));
        p.line(bx, by, bx + Math.cos(a) * 2, by - tall, h.tag === 'root' ? '#1a1008' : '#07101a', 4);
        p.line(bx, by, bx + Math.cos(a) * 2, by - tall, h.tag === 'root' ? C.rootLight : '#4a6a82', 2);
        p.px(bx + Math.cos(a) * 2, by - tall, '#f4efe0');
      }
    }
    // a root's head: the ground heaving as it crawls
    for (const r of this.runners) {
      const x = r.x - cx;
      const y = r.y - cy;
      const heave = Math.sin(t * 22 + r.x) * 1;
      // the earth bulges over it, cracked, and root tips break through
      p.dither(x, y + 1, 14, 6, '#1a1008', 0.8);
      p.ellipse(x, y - 1 + heave, 8, 4, '#2a1c10');
      p.ellipse(x, y - 2 + heave, 6, 3, C.root);
      p.ellipse(x + 1, y - 3 + heave, 3.5, 1.6, C.rootLight);
      for (let i = 0; i < 3; i++) {
        const a = r.ang + (i - 1) * 0.7;
        const tx = x + Math.cos(a) * 9;
        const ty = y + Math.sin(a) * 4 - 3 - Math.abs(Math.sin(t * 9 + i)) * 3;
        p.line(x + Math.cos(a) * 4, y - 2, tx, ty, C.rootLight, 1);
        p.px(tx, ty, '#f4efe0');
      }
    }
    // the thorn rain: each thorn falls on its shadow in the last moment
    for (const h of this.hz.list) {
      if (h.tag !== 'rain' || h.t >= h.warn) continue;
      const u = h.t / h.warn;
      if (u < 0.6) continue;
      const k = (u - 0.6) / 0.4;
      const x = h.x - cx;
      const y = h.y - cy - (1 - k) * 90;
      p.line(x, y - 9, x, y, '#2a4258', 3);
      p.line(x, y - 9, x, y, '#8fb0c0', 1);
      p.px(x, y + 1, '#f4efe0');
    }
  }

  push(list: Drawable[]) {
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    for (const tr of this.trees) {
      if (!onScreen(hub, tr.x, tr.y, 70)) continue;
      list.push({
        y: tr.y,
        fn: () => {
          const sx = tr.x - cx + (tr.shake > 0 ? Math.sin(tr.shake * 70) * 2 : 0);
          p.blit(tr.img, sx - tr.img.width / 2, tr.y - cy - tr.img.height + 3);
        },
      });
    }
    if (this.mode === 'enter' && this.st < 1.2) return;
    const fade = this.state === 'dying' ? clamp(1 - (this.st - 1.8) / 1.6, 0, 1) : 1;
    list.push({
      y: this.y,
      fn: () => {
        const drop = this.mode === 'enter' ? this.fall * 150 : 0;
        const x = this.x - cx;
        const y = this.y - cy - drop;
        if (drop > 4) {
          const k = 1 - this.fall;
          p.dither(this.x - cx, this.y - cy, 22 + 36 * k, 7 + 10 * k, '#02050a', 0.3 + 0.5 * k);
        }
        const flash = this.flash > 0.1;
        if (this.mode === 'spin') {
          drawBall(p, x, y, t, this.spin, flash, fade);
          return;
        }
        let mode: 0 | 1 | 2 | 3 = 0;
        if (this.mode === 'windup' || this.mode === 'roots' || this.mode === 'rain') mode = 1;
        else if (this.mode === 'open' || this.mode === 'dying') mode = 3;
        const walk = this.mode === 'walk' ? 1 : 0;
        const curling = this.mode === 'windup' && this.attack === 'wheel';
        const shake = this.mode === 'windup' ? Math.sin(t * 50) * (curling ? 2 : 1.1) : 0;
        drawThornbackKing(p, x + shake, y, t, { face: this.face, mode, walk, flash: flash ? 1 : 0, fade });
        // a stamp coming: the ground cracks under his front feet
        if (this.mode === 'windup' && (this.attack === 'roots' || this.attack === 'roots2')) {
          const u = clamp(this.mt / (0.75 * D.tele), 0, 1);
          const fx = x + this.face * 36;
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + 0.4;
            p.line(fx, y + 1, fx + Math.cos(a) * 14 * u, y + 1 + Math.sin(a) * 5 * u, '#1a1008', 1);
          }
        }
        // his crown rattles before the rain
        if (this.mode === 'windup' && this.attack === 'rain') {
          for (let i = 0; i < 5; i++) {
            const k = (t * 3 + i * 0.2) % 1;
            p.px(x - 30 + i * 14, y - 70 - k * 18, '#f4efe0');
          }
        }
        if (this.mode === 'open') {
          // the crack in his back, split open and glowing: strike here
          const w = this.weak();
          const wx = w.x - cx;
          const wy = w.y - cy;
          const pulse = 0.5 + 0.5 * Math.sin(t * 10);
          const left = 1 - this.mt / this.openLen;
          p.dither(wx, wy, 16, 9, C.redGlow, 0.35 + 0.25 * pulse);
          p.ellipse(wx, wy, 7, 3.5, '#ffe9a0');
          p.line(wx - 9, wy + 1, wx + 9, wy - 1, C.redGlow, 1);
          p.alpha(0.5 + 0.45 * pulse);
          p.ring(wx, wy, 16 + pulse * 3, 10 + pulse * 2, 1, '#ffe9a0');
          p.alpha(1);
          // how long it stays open: a ring that closes
          const n = 16;
          for (let i = 0; i < n * left; i++) {
            const a = -Math.PI / 2 + (i / n) * TAU;
            p.px(wx + Math.cos(a) * 22, wy + Math.sin(a) * 13, '#ffe9a0');
          }
        }
      },
    });
  }

  overlay() {
    const hub = this.hub;
    this.shots.draw(hub.p, hub.camX, hub.camY, hub.time);
  }
}
