import { burst } from '../../core/art';
import { drawReeds } from '../../core/art2';
import { D } from '../../core/difficulty';
import { C } from '../../core/palette';
import { clamp, dist, lerp, smooth, TAU, unlerp } from '../../core/util';
import type { ArenaDef } from '../land';
import { drawTollQueen } from '../bossart';
import type { Drawable, Hub, Lance, Nova, Rect } from '../types';
import { onScreen } from '../zones/parts';
import { Guardian } from './base';

/**
 * The Toll Queen: a bell the size of a house hung from a winged eye. She only sees what moves.
 *   1  hush   her bell tolls golden rings across the water (find the gap), then her eye opens: stand still, or she sees you.
 *             The eye is hurt only by light thrown at it (a Lance), and only while it is open.
 *   2  echo   every ring has an echo, and the eye opens before the rings are gone. Reeds shield what stands behind them.
 *   3  dive   she folds her wings and rams along a line; when she crashes her bell is in reach.
 */

const ACCENT = '#d9b8ff';
const REEDS: [number, number][] = [
  [-62, 52],
  [62, 52],
  [0, 128],
];
const HOVER = 30;
const EYE_UP = 88;

type QMode = 'enter' | 'toll' | 'watch' | 'stagger' | 'warn' | 'dive' | 'crash' | 'rise' | 'dying';

export class TollQueen extends Guardian {
  protected introLen = 4.6;
  protected dyingLen = 3.8;
  qx: number;
  qy: number;
  private homeX: number;
  private homeY: number;
  private hover = 150;
  private open = 0;
  private mode: QMode = 'enter';
  private mt = 0;
  private crack = 0;
  private look: [number, number] = [0, 0.4];
  private ringsLeft = 0;
  private ringT = 0;
  private ringsSent = 0;
  private seen = 0;
  private beamCd = 1;
  private toll = 0;
  private fold = 0;
  private dive = { dx: 0, dy: 1, endX: 0, endY: 0, hit: false };
  private hitDone = false;
  private told = 0;
  private hushed = false;
  private reeds: { x: number; y: number }[];
  private heard = new WeakSet<Lance>();

  constructor(hub: Hub, a: ArenaDef, onVictory: () => void) {
    super(hub, a, 'Toll Queen', 'hush', ACCENT, [3, 3, 2], onVictory);
    this.homeX = a.x;
    this.homeY = a.boss.y + 58;
    this.qx = this.homeX;
    this.qy = this.homeY;
    this.reeds = REEDS.map(([dx, dy]) => ({ x: a.x + dx, y: a.y + dy }));
    this.hz.blockers = this.reeds.map((r) => ({ x: r.x, y: r.y - 6, r: 11 }));
  }

  private eye() {
    return { x: this.qx, y: this.qy - this.hover - EYE_UP };
  }

  focus() {
    return { x: this.qx, y: this.qy - 40 };
  }

  lanceTarget() {
    return this.mode === 'watch' && this.open > 0.7 && !this.hitDone ? this.eye() : null;
  }

  colliders(): Rect[] {
    return this.reeds.map((r) => ({ x0: r.x - 8, x1: r.x + 8, y0: r.y - 5, y1: r.y + 3 }));
  }

  /* ---------------------------------------------------------------- */
  /* entrance                                                          */
  /* ---------------------------------------------------------------- */

  protected onIntro() {
    this.mode = 'enter';
    this.hover = 170;
    this.open = 0;
    this.qx = this.homeX;
    this.qy = this.homeY;
    this.crack = 0;
    this.hub.audio.setDrone(0.14, 1.5);
    const v = this.hub.audio.v;
    window.setTimeout(() => v.queenToll(1, 0.8), 600);
    window.setTimeout(() => v.queenToll(0.9, 0.9), 1900);
    window.setTimeout(() => v.queenToll(0.8, 1), 3200);
    window.setTimeout(() => v.queenChoir(0.8), 3400);
    window.setTimeout(() => this.hub.ui.speech('hush', 2200, ACCENT), 2200);
  }

  protected updateIntro(dt: number) {
    const u = smooth(unlerp(0.5, 3.8, this.st));
    this.hover = lerp(170, HOVER, u);
    this.open = smooth(unlerp(3.4, 4.4, this.st));
    this.toll = Math.max(0, Math.sin(this.st * 3.2)) * 0.5;
    if (this.st > 0.5 && this.st < 3.8 && Math.random() < dt * 8) burst(this.hub.parts, this.qx + (Math.random() - 0.5) * 50, this.qy - this.hover, 1, ['#ffe9a0', '#fff4c0', ACCENT], 20, 0.5);
    this.hub.camFocus = this.focus();
  }

  /* ---------------------------------------------------------------- */
  /* phases                                                            */
  /* ---------------------------------------------------------------- */

  protected startPhase() {
    const hub = this.hub;
    this.hz.clear();
    this.shots.clear();
    this.hitDone = false;
    this.qx = this.homeX;
    this.qy = this.homeY;
    this.hover = HOVER;
    this.fold = 0;
    this.seen = 0;
    if (this.phase === 0) this.beginToll(2);
    else if (this.phase === 1) {
      hub.audio.v.queenShriek(0.9);
      hub.ui.speech('listen', 2000, ACCENT);
      hub.ui.flash(0.4, 260);
      hub.shake(8);
      this.beginToll(3);
    } else {
      hub.audio.v.queenShriek(1);
      hub.ui.speech('come closer', 2200, ACCENT);
      hub.ui.flash(0.5, 300);
      hub.shake(10);
      this.beginToll(1);
    }
  }

  protected restartPhase() {
    this.qx = this.homeX;
    this.qy = this.homeY;
    this.hover = HOVER;
    this.fold = 0;
    this.hitDone = false;
    this.seen = 0;
    this.beginToll(this.phase === 0 ? 2 : this.phase === 1 ? 3 : 1);
  }

  private beginToll(rings: number) {
    this.mode = 'toll';
    this.mt = 0;
    this.open = 0;
    this.ringsLeft = rings;
    this.ringsSent = 0;
    this.ringT = 0.5;
    this.hitDone = false;
  }

  private beginWatch() {
    this.mode = 'watch';
    this.mt = 0;
    this.seen = 0;
    this.beamCd = 1.0;
    this.hitDone = false;
    this.hub.audio.v.queenChoir(0.7);
    if (this.told < 2) {
      this.told++;
      this.hub.ui.speech('be still', 2000, ACCENT);
    }
  }

  protected onHurt() {
    // she shrieks, her eye snaps shut, and the bell answers
    this.hub.audio.v.queenShriek(1);
    this.hz.clear('beam');
    this.mode = 'stagger';
    this.mt = 0;
    this.crack = clamp(1 - (this.hp - 0) / this.maxHp, 0, 0.9);
    this.hitDone = true;
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  protected updateFight(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.mt += dt;
    this.toll = Math.max(0, this.toll - dt * 1.6);
    hub.camFocus = this.focus();
    this.crack = Math.max(this.crack, clamp(1 - this.hp / this.maxHp, 0, 0.9));
    // she drifts a little when she is not busy
    if (this.mode === 'toll' || this.mode === 'watch') {
      this.qx = this.homeX + Math.sin(this.t * 0.45) * (this.phase >= 1 ? 52 : 28);
      this.look = [clamp((pl.x - this.qx) / 70, -1, 1), clamp((pl.y - this.qy) / 90, -0.2, 1)];
    }
    this.hover += (HOVER + Math.sin(this.t * 1.6) * 3 - this.hover) * (1 - Math.exp(-4 * dt));

    if (this.mode === 'toll') this.doToll(dt);
    else if (this.mode === 'watch') this.doWatch(dt);
    else if (this.mode === 'stagger') this.doStagger(dt);
    else if (this.mode === 'warn') this.doWarn(dt);
    else if (this.mode === 'dive') this.doDive(dt);
    else if (this.mode === 'crash') this.doCrash(dt);
    else if (this.mode === 'rise') this.doRise(dt);
  }

  /** the bell tolls a ring that spreads over the water; there is always a gap */
  private sendRing(gapW: number) {
    const hub = this.hub;
    const pl = this.pl;
    const toPl = Math.atan2((pl.y - this.qy) / 0.72, pl.x - this.qx);
    // the gap is near where you are, but never exactly on you
    const gapA = toPl + (Math.random() < 0.5 ? -1 : 1) * (0.55 + Math.random() * 0.7);
    this.toll = 1;
    hub.audio.v.queenToll(0.8 + (this.ringsSent % 3) * 0.12, 0.8);
    hub.shake(3);
    this.hz.add({ kind: 'ring', x: this.qx, y: this.qy, r: 24, thick: 5, grow: 72 * D.speed, gap: { a: gapA, w: gapW }, warn: 0.6 * D.tele, live: 3.8, fade: 0.4, col: 'gold', dmg: 1 });
    this.ringsSent++;
  }

  private doToll(dt: number) {
    this.ringT -= dt;
    if (this.ringsLeft > 0 && this.ringT <= 0) {
      this.ringsLeft--;
      const gap = this.phase === 0 ? 0.46 : 0.4;
      this.sendRing(gap);
      if (this.phase === 1) {
        // the echo comes right behind it, through a different gap
        window.setTimeout(() => {
          if (this.state === 'fight' && this.mode !== 'dying') this.sendRing(0.4);
        }, 800 / D.speed);
      }
      this.ringT = (this.phase === 0 ? 1.15 : 1.4) / D.speed;
    }
    if (this.ringsLeft === 0 && this.ringT <= 0) {
      if (this.phase >= 2) this.beginWarn();
      else this.beginWatch();
    }
  }

  private doWatch(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    this.open = Math.min(1, this.open + dt * 3);
    this.beamCd -= dt;
    const moving = Math.hypot(pl.vx, pl.vy) > 14;
    // she hears the Lance and the Nova, and she sees anything that moves
    this.seen = moving ? this.seen + dt : Math.max(0, this.seen - dt * 2.4);
    if (this.seen > 0.34 && this.beamCd <= 0 && pl.dead <= 0 && !pl.hide) this.fireBeam();
    const len = (this.phase === 0 ? 3.8 : 3.4) * D.window;
    if (this.mt > len) {
      this.mode = 'toll';
      this.mt = 0;
      this.open = 0.1;
      this.ringsLeft = this.phase === 0 ? 2 : 3;
      this.ringsSent = 0;
      this.ringT = 0.35;
      hub.audio.v.queenToll(0.7, 0.7);
    }
  }

  private fireBeam() {
    const pl = this.pl;
    const e = this.eye();
    const tx = pl.x;
    const ty = pl.y - 6;
    const ang = Math.atan2(ty - e.y, tx - e.x);
    const d = Math.hypot(tx - e.x, ty - e.y);
    this.beamCd = 1.5 / D.speed;
    this.seen = 0;
    this.hub.audio.warnPing();
    this.hz.add({ kind: 'line', x: e.x, y: e.y, ang, len: d + 36, wd: 5, warn: 0.5 * D.tele, live: 0.16, fade: 0.25, col: 'violet', tag: 'beam', onLive: () => this.hub.audio.v.queenShriek(0.35) });
  }

  private doStagger(dt: number) {
    this.open = Math.max(0, this.open - dt * 4);
    this.hover += (HOVER + 14 - this.hover) * (1 - Math.exp(-6 * dt));
    if (this.mt > 1.2) {
      // the bell answers with a ring, then it goes on
      this.beginToll(this.phase === 0 ? 2 : this.phase === 1 ? 3 : 1);
      this.crack = Math.max(this.crack, 0.2);
    }
  }

  /** dive: she folds her wings and rams along a line */
  private beginWarn() {
    const hub = this.hub;
    const pl = this.pl;
    this.mode = 'warn';
    this.mt = 0;
    this.hitDone = false;
    const dx = pl.x - this.qx;
    const dy = (pl.y - this.qy) / 1;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    // she runs on through the place you stood, to the far side of the arena
    let ex = this.qx;
    let ey = this.qy;
    for (let i = 0; i < 400; i += 4) {
      const nx = this.qx + ux * i;
      const ny = this.qy + uy * i;
      if (!hub.land.isWalk(nx, ny)) break;
      ex = nx;
      ey = ny;
    }
    this.dive = { dx: ux, dy: uy, endX: ex, endY: ey, hit: false };
    hub.audio.v.queenShriek(0.8);
    hub.audio.rumble();
    this.hz.add({ kind: 'line', x: this.qx, y: this.qy - 8, ang: Math.atan2(uy, ux), len: Math.hypot(ex - this.qx, ey - this.qy), wd: 15, warn: 1.1 * D.tele, live: 0.01, fade: 0.2, dmg: 0, col: 'gold', tag: 'lane' });
  }

  private doWarn(dt: number) {
    const u = clamp(this.mt / (1.1 * D.tele), 0, 1);
    this.fold = u;
    this.hover += (10 - this.hover) * (1 - Math.exp(-5 * dt));
    this.open = Math.min(1, this.open + dt * 3);
    this.look = [clamp(this.dive.dx * 1.4, -1, 1), clamp(this.dive.dy * 1.2, -0.3, 1)];
    if (this.mt >= 1.1 * D.tele) {
      this.mode = 'dive';
      this.mt = 0;
      this.hub.audio.whoosh();
      this.hub.audio.v.queenShriek(1);
    }
  }

  private doDive(dt: number) {
    const hub = this.hub;
    const pl = this.pl;
    const spd = 290 * D.speed;
    const d = this.dive;
    const left = Math.hypot(d.endX - this.qx, d.endY - this.qy);
    const step = Math.min(left, spd * dt);
    this.qx += d.dx * step;
    this.qy += d.dy * step;
    this.hover += (6 - this.hover) * (1 - Math.exp(-8 * dt));
    if (Math.floor(this.mt * 30) !== Math.floor((this.mt - dt) * 30)) burst(hub.parts, this.qx, this.qy - 4, 1, ['#ffe9a0', '#fff4c0', ACCENT], 30, 0.4);
    if (!d.hit && pl.dead <= 0 && !pl.hide && Math.abs(pl.x - this.qx) < 30 && Math.abs(pl.y - this.qy) < 13) {
      d.hit = true;
      hub.hurt(this.qx, this.qy, 1);
    }
    if (left < 2) {
      this.hz.clear('lane');
      this.mode = 'crash';
      this.mt = 0;
      this.hitDone = false;
      hub.audio.stomp();
      hub.audio.bossHit();
      hub.audio.v.queenToll(0.6, 1);
      hub.shake(10);
      hub.ui.flash(0.3, 240);
      burst(hub.parts, this.qx, this.qy - 10, 26, ['#ffe9a0', '#fff4c0', ACCENT, '#9a9aaa'], 80, 1);
      // the wall of the arena shakes loose a few reeds' worth of water: a ring of ripples that is only for show
    }
  }

  private doCrash(dt: number) {
    this.open = Math.max(0, this.open - dt * 6);
    this.fold = 1;
    this.hover += (4 - this.hover) * (1 - Math.exp(-8 * dt));
    if (this.mt > 3.3 * D.window) {
      this.mode = 'rise';
      this.mt = 0;
    }
  }

  private doRise(dt: number) {
    this.fold = Math.max(0, 1 - this.mt / 0.8);
    this.qx += (this.homeX - this.qx) * (1 - Math.exp(-3 * dt));
    this.qy += (this.homeY - this.qy) * (1 - Math.exp(-3 * dt));
    this.hover += (HOVER - this.hover) * (1 - Math.exp(-4 * dt));
    if (this.mt > 1.1) this.beginToll(1);
  }

  /* ---------------------------------------------------------------- */
  /* being hit                                                         */
  /* ---------------------------------------------------------------- */

  private hurtEye(x: number, y: number): boolean {
    if (this.hitDone || this.mode !== 'watch' || this.open < 0.7) return false;
    if (this.damage(1, x, y)) {
      this.hitDone = true;
      return true;
    }
    return false;
  }

  /** she can be reached on the ground only while she is down */
  private bellReach(x: number, y: number, R: number): boolean {
    return this.mode === 'crash' && !this.hitDone && Math.hypot(x - this.qx, (y - this.qy) / 0.8) <= R + 36;
  }

  private hurtBell(): boolean {
    if (this.hitDone) return false;
    const ok = this.damage(1, this.qx, this.qy - 18);
    if (ok) {
      this.hitDone = true;
      if (this.state === 'fight' && this.mode === 'crash') {
        this.mode = 'rise';
        this.mt = 0;
        this.hub.audio.v.queenShriek(1);
      }
    }
    return ok;
  }

  onPulse(x: number, y: number, R: number) {
    // a pulse is a noise she hears, but it does not reach her in the air
    if (this.mode === 'watch') this.seen = Math.max(this.seen, 0.2);
    if (this.bellReach(x, y, R)) this.hurtBell();
  }

  onLance(l: Lance): boolean {
    const hub = this.hub;
    // throwing light makes a noise she hears: once per lance
    if (!this.heard.has(l)) {
      this.heard.add(l);
      if (this.mode === 'watch') this.seen += 0.34;
    }
    if (this.mode === 'watch' && this.open > 0.7 && !this.hitDone) {
      const e = this.eye();
      if (dist(l.x, l.y, e.x, e.y) < 15) {
        this.hurtEye(e.x, e.y);
        return true;
      }
    }
    if (this.mode === 'crash' && !this.hitDone && dist(l.x, l.y, this.qx, this.qy - 20) < 30) {
      this.hurtBell();
      return true;
    }
    // the bell rings when a lance strikes it, but it never stands in the way of her open eye
    const eyeOpen = this.mode === 'watch' && this.open > 0.7 && !this.hitDone;
    if (!eyeOpen && this.mode !== 'dying' && this.mode !== 'crash' && Math.abs(l.x - this.qx) < 30 && l.y > this.qy - this.hover - 70 && l.y < this.qy - this.hover + 8) {
      hub.audio.v.glassPing();
      burst(hub.parts, l.x, l.y, 5, ['#ffe9a0', '#ffffff'], 40, 0);
      return true;
    }
    return false;
  }

  onNova(n: Nova) {
    this.hz.clear('beam');
    if (this.state !== 'fight') return;
    // a Nova strikes the bell itself
    if (Math.hypot(n.x - this.qx, (n.y - this.qy) / 0.72) <= n.R + 34) {
      if (this.mode === 'crash') this.hurtBell();
      else if (this.mode === 'watch' || this.mode === 'toll' || this.mode === 'warn') {
        if (this.damage(1, this.qx, this.qy - this.hover - 20)) this.hitDone = true;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* dying                                                             */
  /* ---------------------------------------------------------------- */

  protected onDie() {
    this.mode = 'dying';
    this.hz.clear();
    this.hub.audio.v.queenShriek(1.3);
    this.hub.audio.v.queenToll(0.5, 1.2);
    this.hub.ui.speech('...hush', 2400, ACCENT);
  }

  protected updateDying(dt: number) {
    const hub = this.hub;
    const u = this.st / this.dyingLen;
    this.open = Math.max(0, 1 - u * 2);
    this.crack = 1;
    this.fold = 1;
    this.hover += ((u > 0.5 ? 2 : HOVER) - this.hover) * (1 - Math.exp(-3 * dt));
    if (Math.random() < dt * 40) burst(hub.parts, this.qx + (Math.random() - 0.5) * 60, this.qy - this.hover - Math.random() * 90, 2, ['#ffe9a0', '#fff4c0', ACCENT, '#9a9aaa'], 60, 1, 140);
    if (Math.floor(this.st * 2) !== Math.floor((this.st - dt) * 2) && this.st < 3) hub.audio.v.queenToll(0.6 + Math.random() * 0.4, 0.5);
    hub.camFocus = this.focus();
  }

  /* ---------------------------------------------------------------- */
  /* drawing                                                           */
  /* ---------------------------------------------------------------- */

  ground() {
    const hub = this.hub;
    const p = hub.p;
    this.hz.draw(p, hub.camX, hub.camY, hub.time);
    // her shadow on the water: it grows as she comes down
    const k = clamp(1 - this.hover / 90, 0.3, 1);
    p.dither(this.qx - hub.camX, this.qy - hub.camY, 24 + 12 * k, 7 + 3 * k, '#02050a', 0.55);
  }

  push(list: Drawable[]) {
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    for (const r of this.reeds) {
      if (onScreen(hub, r.x, r.y)) list.push({ y: r.y + 3, fn: () => drawReeds(p, r.x - cx, r.y - cy, r.x + r.y, t, 12) });
    }
    const fade = this.state === 'dying' ? clamp(1 - (this.st - 1.8) / 1.8, 0, 1) : 1;
    if (fade <= 0.01) return;
    list.push({
      y: this.qy,
      fn: () => {
        drawTollQueen(p, this.qx - cx, this.qy - cy, t, {
          toll: this.toll,
          crack: this.crack,
          hover: this.hover,
          look: this.look,
          fold: this.fold,
          open: this.mode === 'enter' || this.state !== 'fight' ? this.open : this.open,
          fade,
          flash: this.flash > 0.12,
        });
        // the eye glows where to throw the light, when it can be hurt
        if (this.lanceTarget()) {
          const e = this.eye();
          const pulse = 0.5 + 0.5 * Math.sin(t * 10);
          p.alpha(0.5 + 0.4 * pulse);
          p.ring(e.x - cx, e.y - cy, 14 + pulse * 3, 12 + pulse * 2, 1, '#ffe9a0');
          p.alpha(1);
        }
        if (this.mode === 'crash' && !this.hitDone) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 10);
          p.alpha(0.5 + 0.4 * pulse);
          p.ring(this.qx - cx, this.qy - cy - 12, 26 + pulse * 3, 15 + pulse * 2, 1, '#ffe9a0');
          p.alpha(1);
        }
        // when the eye is open and she is watching, show how seen you are
        if (this.mode === 'watch' && this.open > 0.7 && this.seen > 0.05) {
          const e = this.eye();
          p.alpha(0.8);
          const u = clamp(this.seen / 0.34, 0, 1);
          p.line(e.x - cx, e.y - cy + 20, lerp(e.x, this.pl.x, 0.2) - cx, lerp(e.y + 20, this.pl.y - 20, 0.2) - cy, '#c9b6ff', 1 + Math.round(u * 2));
          p.alpha(1);
        }
      },
    });
  }

  overlay() {
    const hub = this.hub;
    this.shots.draw(hub.p, hub.camX, hub.camY, hub.time);
    // a faint hush: the arena darkens a little while she is watching
    if (this.mode === 'watch' && this.open > 0.5) {
      const p = hub.p;
      p.alpha(0.18 * this.open);
      p.dither(108, 192, 130, 200, '#05060c', 0.3);
      p.alpha(1);
    }
  }
}

void C;
void TAU;
