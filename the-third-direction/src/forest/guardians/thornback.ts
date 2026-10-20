import { burst, makeTree } from '../../core/art';
import { D } from '../../core/difficulty';
import { C } from '../../core/palette';
import type { Pix } from '../../core/pix';
import { clamp, dist, lerp, rng, smooth, TAU, unlerp } from '../../core/util';
import type { ArenaDef } from '../land';
import { drawThornbackKing } from '../bossart';
import type { Drawable, Hub, Lance, Nova, Rect } from '../types';
import { onScreen } from '../zones/parts';
import { Guardian } from './base';

/**
 * The Thornback King: a bullfight. He charges along a lane, and the only thing that hurts him is a tree. Stand behind one
 * and he crashes into it and is stunned (the tree falls); step in and light his unarmoured head.
 *   1  he charges
 *   2  he fires thorns first, and when he crashes into a wall he turns and charges again at once
 *   3  he curls into a ball and rolls, bouncing off the walls, until something stops him
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
  state: 'up' | 'shake' | 'down';
  t: number;
  /** growing back (0..1) */
  grow: number;
  img: HTMLCanvasElement;
}

type KMode = 'enter' | 'prowl' | 'windup' | 'charge' | 'stun' | 'recover' | 'roll' | 'dying';

let treeImgs: HTMLCanvasElement[] | null = null;

/** A rolling spiky ball: the King curled up. */
function drawBall(p: Pix, x: number, y: number, t: number, spin: number, flash: boolean, fade: number) {
  p.alpha(fade);
  p.dither(x, y + 1, 20, 6, '#02050a', 0.8);
  const cy = y - 15;
  const r = 15;
  // thorns around the rim, turning
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
  // plates
  for (let i = 0; i < 5; i++) {
    const a = spin * 1.3 + (i / 5) * TAU;
    p.line(x + Math.cos(a) * 3, cy + Math.sin(a) * 3, x + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), '#0a121a', 1);
  }
  // red cracks
  const hot = 0.5 + 0.5 * Math.sin(t * 9);
  p.line(x - 5, cy - 2, x + 1, cy + 4, hot > 0.5 ? C.redGlow : C.red, 1);
  p.px(x + 5, cy - 5, C.red);
  // two angry eyes peek out as it turns
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
  private mode: KMode = 'enter';
  private mt = 0;
  private trees: Tree[] = [];
  private lane: { y: number; dir: 1 | -1; endX: number; tree: Tree | null } | null = null;
  private stunT = 0;
  private stunKind: 'tree' | 'wall' | 'nova' | 'ball' = 'wall';
  private hitDone = false;
  private doubleLeft = 0;
  private hurtCd = 0;
  private prowlSide: 1 | -1 = 1;
  private aligned = 0;
  private spin = 0;
  private roll = { vx: 0, vy: 0, bounces: 0 };
  private fall = 0;
  private hinted = false;
  private snortT = 1;

  constructor(hub: Hub, a: ArenaDef, onVictory: () => void) {
    super(hub, a, 'Thornback King', 'let him hit a tree', ACCENT, [3, 3, 3], onVictory);
    this.x = a.x;
    this.y = a.boss.y;
    if (!treeImgs) treeImgs = [11, 12, 13, 14, 15].map((i) => makeTree(900 + i * 13, 92 + (i % 3) * 6));
    this.trees = TREE_SPOTS.map(([dx, dy], i) => ({ x: a.x + dx, y: a.y + dy, state: 'up', t: 0, grow: 1, img: treeImgs![i]! }));
  }

  focus() {
    return { x: this.x, y: this.y - 20 };
  }

  private head() {
    return { x: this.x + this.face * 46, y: this.y - 20 };
  }

  lanceTarget() {
    return this.mode === 'stun' && !this.hitDone ? this.head() : null;
  }

  colliders(): Rect[] {
    return this.trees.filter((t) => t.state !== 'down').map((t) => ({ x0: t.x - 6, x1: t.x + 6, y0: t.y - 5, y1: t.y + 3 }));
  }

  /* ---------------------------------------------------------------- */
  /* helpers                                                           */
  /* ---------------------------------------------------------------- */

  /** the x where his body stops when he runs at a wall from the middle of the arena */
  private wallX(y: number, dir: 1 | -1): number {
    let x = this.cx;
    for (let i = 0; i < 150; i += 2) {
      if (!this.hub.land.isWalk(this.cx + dir * i + dir * 40, y)) break;
      x = this.cx + dir * i;
    }
    return x;
  }

  private treeAt(nx: number, y: number, dir: 1 | -1): Tree | null {
    for (const t of this.trees) {
      if (t.state === 'down') continue;
      if (Math.abs(t.y - y) < 12 && (t.x - nx) * dir > 0 && (t.x - nx) * dir < 40) return t;
    }
    return null;
  }

  private dropTree(t: Tree) {
    t.state = 'shake';
    t.t = 0;
    this.hub.audio.crumble();
    this.hub.shake(7);
    burst(this.hub.parts, t.x, t.y - 40, 22, ['#07121c', '#123a46', '#2e7d4f', '#5bbf6a'], 60, 1, 60);
  }

  private regrow() {
    for (const t of this.trees) {
      if (t.state === 'down') {
        t.state = 'up';
        t.grow = 0;
      }
    }
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
    this.regrow();
    this.trees.forEach((t) => {
      t.state = 'up';
      t.grow = 1;
    });
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
  private landed = false;

  /* ---------------------------------------------------------------- */
  /* phases                                                            */
  /* ---------------------------------------------------------------- */

  protected startPhase() {
    this.regrow();
    this.hz.clear();
    this.shots.clear();
    this.mode = 'prowl';
    this.mt = 0;
    this.aligned = 0;
    this.doubleLeft = 0;
    this.hitDone = false;
    this.fall = 0;
    if (this.phase > 0) {
      this.hub.audio.v.kingBellow();
      this.hub.shake(8);
      this.hub.ui.flash(0.3, 250);
    }
    if (!this.hinted && this.phase === 0) {
      this.hinted = true;
      window.setTimeout(() => this.hub.ui.hint('stand behind a tree'), 600);
      window.setTimeout(() => this.hub.ui.hint(null), 5200);
    }
    this.pickSide();
  }

  protected restartPhase() {
    this.regrow();
    this.x = this.cx;
    this.y = this.a.boss.y;
    this.face = 1;
    this.mode = 'prowl';
    this.mt = 0;
    this.aligned = 0;
    this.doubleLeft = 0;
    this.hitDone = false;
    this.pickSide();
  }

  private pickSide() {
    // he comes from the wall on the far side of you, so the trees can be between you
    this.prowlSide = this.pl.x < this.cx ? 1 : -1;
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  protected updateFight(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    this.mt += dt;
    this.spin += dt * (this.mode === 'roll' ? 14 : 0);
    for (const t of this.trees) {
      if (t.state === 'shake') {
        t.t += dt;
        if (t.t > 0.45) {
          t.state = 'down';
          burst(hub.parts, t.x, t.y - 20, 10, ['#07121c', '#5bbf6a'], 50, 1, 80);
        }
      } else if (t.state === 'up' && t.grow < 1) t.grow = Math.min(1, t.grow + dt * 1.2);
    }
    hub.camFocus = this.focus();

    if (this.mode === 'prowl') this.doProwl(dt);
    else if (this.mode === 'windup') this.doWindup(dt);
    else if (this.mode === 'charge') this.doCharge(dt);
    else if (this.mode === 'roll') this.doRoll(dt);
    else if (this.mode === 'stun') {
      this.stunT -= dt;
      if (this.stunT <= 0) {
        this.mode = 'recover';
        this.mt = 0;
        hub.audio.v.kingSnort(2);
      }
    } else if (this.mode === 'recover') {
      if (this.mt > 0.9) {
        this.mode = 'prowl';
        this.mt = 0;
        this.aligned = 0;
        this.pickSide();
      }
    }
    // a player that walks into his body is shoved, never trapped
    if (this.mode !== 'charge' && this.mode !== 'roll') {
      const dx = pl.x - this.x;
      const dy = pl.y - this.y;
      if (Math.abs(dx) < 36 && Math.abs(dy) < 10 && pl.dead <= 0) {
        pl.x += Math.sign(dx || 1) * 70 * dt;
        pl.y += Math.sign(dy || 1) * 40 * dt;
      }
    }
  }

  private doProwl(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.snortT -= dt;
    if (this.snortT <= 0) {
      this.snortT = 3.2;
      hub.audio.v.kingSnort(2);
    }
    // walk to the wall on the far side of the player, level with them
    const tx = this.wallX(pl.y, this.prowlSide);
    const dx = tx - this.x;
    const dy = clamp(pl.y, this.a.y - this.a.ry + 80, this.a.y + this.a.ry - 40) - this.y;
    const sp = 88 * D.speed;
    const stepX = clamp(dx, -sp * dt, sp * dt);
    const stepY = clamp(dy, -sp * 0.7 * dt, sp * 0.7 * dt);
    if (hub.land.isWalk(this.x + stepX + this.prowlSide * 38, this.y)) this.x += stepX;
    if (hub.land.isWalk(this.x, this.y + stepY)) this.y += stepY;
    if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1;
    const near = Math.abs(dx) < 6 && Math.abs(dy) < 14;
    this.aligned = near ? this.aligned + dt : 0;
    if (this.aligned > 0.55 / D.speed && this.mt > 1.0) {
      this.face = this.prowlSide === 1 ? -1 : 1;
      this.beginWindup();
    }
  }

  private beginWindup() {
    const hub = this.hub;
    const pl = this.pl;
    const dir = this.face;
    this.mode = 'windup';
    this.mt = 0;
    this.shotDone = false;
    const rolling = this.phase >= 2;
    hub.audio.v.kingBellow();
    hub.audio.v.kingClack(3);
    if (rolling) {
      // the ball goes where you are now
      const dx = pl.x - this.x;
      const dy = pl.y - this.y;
      const l = Math.hypot(dx, dy) || 1;
      this.roll = { vx: dx / l, vy: dy / l, bounces: 0 };
      this.hz.add({ kind: 'line', x: this.x, y: this.y - 14, ang: Math.atan2(dy, dx), len: 150, wd: 8, warn: 0.95 * D.tele, live: 0.01, fade: 0.2, dmg: 0, col: 'red', tag: 'lane' });
    } else {
      // the lane runs along this row, up to the first tree or the wall
      const endX = this.wallX(this.y, dir);
      const tree = this.treeAt(this.x, this.y, dir);
      const stopX = tree ? tree.x - dir * 40 : endX;
      this.lane = { y: this.y, dir, endX: stopX, tree };
      this.hz.add({ kind: 'line', x: this.x + dir * 36, y: this.y - 6, ang: dir > 0 ? 0 : Math.PI, len: Math.abs(stopX - this.x) - 30, wd: 9, warn: 0.95 * D.tele, live: 0.01, fade: 0.2, dmg: 0, col: 'red', tag: 'lane' });
    }
  }
  private shotDone = false;

  private doWindup(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    const T = 0.95 * D.tele;
    // the second phase fires thorns first
    if (this.phase === 1 && !this.shotDone && this.mt > T * 0.35) {
      this.shotDone = true;
      const a0 = Math.atan2(pl.y - 8 - (this.y - 30), pl.x - this.x);
      for (let i = -2; i <= 2; i++) {
        const a = a0 + i * 0.34;
        this.shots.add({ x: this.x + this.face * 20, y: this.y - 30, vx: Math.cos(a) * 118 * D.speed, vy: Math.sin(a) * 118 * D.speed, kind: 'thorn', r: 3.2, life: 3, tag: 'thorn' });
      }
      hub.audio.snap();
    }
    if (this.mt >= T) {
      if (this.phase >= 2) {
        this.mode = 'roll';
        this.mt = 0;
        hub.audio.rumble();
      } else {
        this.mode = 'charge';
        this.mt = 0;
        this.hitDone = false;
        hub.audio.whoosh();
        hub.audio.v.kingBellow();
      }
    }
    void dt;
  }

  private crash(tree: Tree | null, kind: 'tree' | 'wall') {
    const hub = this.hub;
    hub.audio.stomp();
    hub.audio.bossHit();
    hub.shake(tree ? 10 : 6);
    hub.ui.flash(0.25, 200);
    burst(hub.parts, this.x + this.face * 44, this.y - 12, 22, ['#3a2a1e', '#8fb0c0', '#5a7a7a', '#f4efe0'], 80, 1);
    hub.land.addDecal(this.x + this.face * 40, this.y, 16, 10, 0.5);
    if (tree) {
      this.dropTree(tree);
      this.x = tree.x - this.face * 42;
    }
    this.hz.clear('lane');
    // phase two: a crash into a wall is not the end: he turns and charges straight back
    if (this.phase === 1 && kind === 'wall' && this.doubleLeft === 0) {
      this.doubleLeft = 1;
      this.face = (this.face * -1) as 1 | -1;
      this.lane = null;
      this.mode = 'windup';
      this.mt = 0;
      this.shotDone = true;
      const endX = this.wallX(this.y, this.face);
      const tr = this.treeAt(this.x, this.y, this.face);
      const stopX = tr ? tr.x - this.face * 40 : endX;
      this.lane = { y: this.y, dir: this.face, endX: stopX, tree: tr };
      this.hz.add({ kind: 'line', x: this.x + this.face * 36, y: this.y - 6, ang: this.face > 0 ? 0 : Math.PI, len: Math.abs(stopX - this.x) - 30, wd: 9, warn: 0.55 * D.tele, live: 0.01, fade: 0.2, dmg: 0, col: 'red', tag: 'lane' });
      hub.audio.v.kingBellow();
      return;
    }
    this.doubleLeft = 0;
    this.mode = 'stun';
    this.mt = 0;
    this.stunKind = kind;
    this.stunT = (kind === 'tree' ? 3.6 : 1.8) * D.window;
    this.hitDone = false;
    hub.audio.v.kingSnort(1);
  }

  private doCharge(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    const spd = 238 * D.speed;
    const dir = this.face;
    const nx = this.x + dir * spd * dt;
    const tree = this.treeAt(nx, this.y, dir);
    if (tree) {
      this.x = nx;
      this.crash(tree, 'tree');
      return;
    }
    if (!hub.land.isWalk(nx + dir * 40, this.y)) {
      this.crash(null, 'wall');
      return;
    }
    this.x = nx;
    if (Math.floor(this.mt * 20) !== Math.floor((this.mt - dt) * 20)) burst(hub.parts, this.x - dir * 30, this.y - 2, 1, ['#5a7a7a', '#3a2a1e'], 30, 0.2);
    this.contact(pl);
  }

  private contact(pl: Hub['player']) {
    if (this.hurtCd > 0 || pl.dead > 0 || pl.hide) return;
    if (Math.abs(pl.x - this.x) < 36 && Math.abs(pl.y - this.y) < 11) {
      this.hub.hurt(this.x, this.y, 1);
      this.hurtCd = 0.9;
    }
  }

  private doRoll(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    const spd = 168 * D.speed;
    const r = this.roll;
    let nx = this.x + r.vx * spd * dt;
    let ny = this.y + r.vy * spd * dt;
    // a tree stops the ball
    for (const t of this.trees) {
      if (t.state === 'down') continue;
      if (Math.hypot(nx - t.x, ny - (t.y - 3)) < 22) {
        this.face = nx < t.x ? 1 : -1;
        this.x = nx;
        this.y = ny;
        this.dropTree(t);
        this.mode = 'stun';
        this.mt = 0;
        this.stunKind = 'ball';
        this.stunT = 3.4 * D.window;
        this.hitDone = false;
        hub.audio.stomp();
        hub.audio.bossHit();
        return;
      }
    }
    const okX = hub.land.isWalk(nx + Math.sign(r.vx) * 22, this.y);
    const okY = hub.land.isWalk(this.x, ny + Math.sign(r.vy) * 10);
    if (!okX) {
      r.vx *= -1;
      r.bounces++;
      nx = this.x;
      hub.audio.snap();
      hub.shake(3);
    }
    if (!okY) {
      r.vy *= -1;
      r.bounces++;
      ny = this.y;
      hub.audio.snap();
      hub.shake(3);
    }
    this.x = nx;
    this.y = ny;
    if (Math.floor(this.mt * 18) !== Math.floor((this.mt - dt) * 18)) burst(hub.parts, this.x, this.y - 2, 1, ['#5a7a7a', '#3a2a1e'], 24, 0.2);
    if (this.hurtCd <= 0 && pl.dead <= 0 && !pl.hide && Math.hypot(pl.x - this.x, (pl.y - (this.y - 10)) / 0.9) < 19) {
      hub.hurt(this.x, this.y, 1);
      this.hurtCd = 0.9;
    }
    if (r.bounces >= 4 || this.mt > 6) {
      this.mode = 'stun';
      this.mt = 0;
      this.stunKind = 'ball';
      this.stunT = 1.6 * D.window;
      this.hitDone = false;
      this.face = r.vx >= 0 ? 1 : -1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* being hit                                                         */
  /* ---------------------------------------------------------------- */

  protected onHurt() {
    // he gets up angry, and the others of his phase come at you without waiting
    this.hitDone = true;
    this.mode = 'recover';
    this.mt = 0;
    this.hub.audio.v.kingBellow();
  }

  private tryHit(x: number, y: number, n = 1): boolean {
    if (this.mode !== 'stun' || this.hitDone) return false;
    const h = this.head();
    if (this.damage(n, h.x, h.y)) {
      this.hitDone = true;
      if (this.state === 'fight' && this.mode === 'stun') {
        this.mode = 'recover';
        this.mt = 0;
      }
      return true;
    }
    void x;
    void y;
    return false;
  }

  onPulse(x: number, y: number, R: number) {
    this.shots.clearIn(x, y, R + 2, true);
    if (this.mode === 'stun' && !this.hitDone) {
      const h = this.head();
      if (this.pulseReach(h.x, h.y, R, x, y, 16)) this.tryHit(x, y);
    }
  }

  onLance(l: Lance): boolean {
    if (this.mode === 'stun' && !this.hitDone) {
      const h = this.head();
      if (dist(l.x, l.y, h.x, h.y) < 15) {
        this.tryHit(l.x, l.y);
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
    const h = this.head();
    if (this.mode === 'stun' && !this.hitDone) {
      this.tryHit(h.x, h.y);
    } else if (this.mode === 'windup' || this.mode === 'charge' || this.mode === 'roll' || this.mode === 'prowl') {
      // a Nova rocks him: he is stunned, but not hurt
      this.hz.clear('lane');
      this.mode = 'stun';
      this.mt = 0;
      this.stunKind = 'nova';
      this.stunT = 2.4 * D.window;
      this.hitDone = false;
      this.hub.audio.v.kingBellow();
    }
  }

  /* ---------------------------------------------------------------- */
  /* dying                                                             */
  /* ---------------------------------------------------------------- */

  protected onDie() {
    this.mode = 'dying';
    this.face = this.face;
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
    this.hz.draw(p, hub.camX, hub.camY, hub.time);
    // where the charge will end
    if (this.mode === 'windup' && this.lane) {
      const lx = this.lane.endX + this.lane.dir * 36 - hub.camX;
      const ly = this.lane.y - hub.camY;
      const blink = Math.floor(hub.time * 10) % 2 === 0;
      const c = this.lane.tree ? '#ffe9a0' : '#ff6a6a';
      p.alpha(blink ? 1 : 0.5);
      p.line(lx - 4, ly - 4, lx + 4, ly + 4, c, 2);
      p.line(lx + 4, ly - 4, lx - 4, ly + 4, c, 2);
      p.alpha(1);
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
          if (tr.state === 'down') {
            // a stump
            p.ellipse(tr.x - cx, tr.y - cy - 1, 5, 2.4, '#0a121a');
            p.ellipse(tr.x - cx, tr.y - cy - 2, 4, 1.6, '#2a2018');
            return;
          }
          const sx = tr.x - cx + (tr.state === 'shake' ? Math.sin(tr.t * 70) * 2 : 0);
          const g = tr.grow < 1 ? smooth(tr.grow) : 1;
          if (g < 1) {
            p.alpha(g);
          }
          p.blit(tr.img, sx - tr.img.width / 2, tr.y - cy - tr.img.height + 3 + (1 - g) * 14);
          p.alpha(1);
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
          // a shadow on the ground that grows as he comes down
          const k = 1 - this.fall;
          p.dither(this.x - cx, this.y - cy, 22 + 36 * k, 7 + 10 * k, '#02050a', 0.3 + 0.5 * k);
        }
        const flash = this.flash > 0.1;
        if (this.mode === 'roll' || (this.mode === 'windup' && this.phase >= 2 && this.mt > 0.3)) {
          if (this.mode === 'roll') drawBall(p, x, y, t, this.spin, flash, fade);
          else {
            // curling up: the shell shakes
            drawThornbackKing(p, x + Math.sin(t * 60) * 1.2, y, t, { face: this.face, mode: 1, flash: flash ? 1 : 0, fade });
          }
          return;
        }
        let mode: 0 | 1 | 2 | 3 = 0;
        if (this.mode === 'windup') mode = 1;
        else if (this.mode === 'charge') mode = 2;
        else if (this.mode === 'stun' || this.mode === 'dying') mode = 3;
        const walk = this.mode === 'prowl' ? 1 : 0;
        const shake = this.mode === 'windup' ? Math.sin(t * 50) * 1.1 : 0;
        drawThornbackKing(p, x + shake, y, t, { face: this.face, mode, walk, flash: flash ? 1 : 0, fade });
        // steam from his nose before a charge, dizzy stars when he is stunned
        if (this.mode === 'windup') {
          for (let i = 0; i < 3; i++) {
            const k = (t * 3 + i * 0.33) % 1;
            p.alpha(0.6 * (1 - k));
            p.ellipse(x + this.face * (50 + k * 12), y - 14 - k * 12, 2 + k * 3, 1.5 + k * 2, '#c8d8e0');
          }
          p.alpha(1);
        }
        if (this.mode === 'stun' || this.mode === 'dying') {
          const h = this.head();
          for (let i = 0; i < 4; i++) {
            const a = t * 5 + (i / 4) * TAU;
            const sx = h.x - cx + Math.cos(a) * 13;
            const sy = h.y - cy - 20 + Math.sin(a) * 4;
            p.rect(sx - 1, sy - 1, 3, 3, '#ffe9a0');
            p.px(sx, sy, '#ffffff');
          }
          if (!this.hitDone && this.mode === 'stun') {
            // the head glows where to strike
            const pulse = 0.5 + 0.5 * Math.sin(t * 10);
            p.alpha(0.5 + 0.4 * pulse);
            p.ring(h.x - cx, h.y - cy, 12 + pulse * 3, 9 + pulse * 2, 1, '#ffe9a0');
            p.alpha(1);
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

void rng;
void lerp;
