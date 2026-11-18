import { burst } from '../core/art';
import { drawGloom } from '../core/art2';
import { C } from '../core/palette';
import { clamp, dist, TAU } from '../core/util';
import type { Drawable, Hub, Lance } from './types';

/**
 * The tutorial, the first time someone plays, in the clearing where the blob wakes: taught in a fight, a step at a time, each
 * one a threat to deal with, not a chore. Move; shades come out of the dark and drift at you (hit three with a Light Lance; a
 * quick tap is a pulse that shoves them back); a brute charges (dash through it, twice); a pack closes in all round (your orbs
 * are full: a Nova clears it); then where to go. Nothing here costs a heart: a hit knocks the blob back, the screen flinches,
 * and the thing that hit it backs off. The panel at the top says what to do in words for the device in hand (touch or keys)
 * and counts it; a step that is done ticks, chimes and moves on. It can be skipped at any time. The forest asks it what the
 * button may do (`button`), tells it what the player did (`onPulse`, `hitLance`, `onDash`, `onNova`) and draws its props among
 * its own (`push`).
 */

export type TutButton = 'none' | 'pulse' | 'powers' | 'next';

interface Step {
  id: 'move' | 'lance' | 'dash' | 'nova' | 'way';
  title: string;
  touch: string;
  keys: string;
  /** which of the guide's gesture pictures goes with it (src/ui.ts GESTURES) */
  icon: number;
  need: number;
  /** a card to read (it moves on by itself after a moment, or on the button) */
  info?: boolean;
}

export const STEPS: Step[] = [
  { id: 'move', title: 'Move', touch: 'Drag anywhere on the left side of the screen.', keys: 'Move with WASD or the arrow keys.', icon: 0, need: 1 },
  {
    id: 'lance',
    title: 'Shades!',
    touch: 'Hold the button and let go: a Light Lance flies at the nearest one. A quick tap is a pulse that shoves them back. Hit three.',
    keys: 'Hold Space and let go: a Light Lance flies at the nearest one. A quick tap is a pulse that shoves them back. Hit three.',
    icon: 2,
    need: 3,
  },
  {
    id: 'dash',
    title: 'It charges!',
    touch: 'When it turns red and charges, double-tap the button to dash through it: nothing can hurt you mid-dash. Dodge it twice.',
    keys: 'When it turns red and charges, double-tap Space to dash through it: nothing can hurt you mid-dash. Dodge it twice.',
    icon: 4,
    need: 2,
  },
  {
    id: 'nova',
    title: 'Surrounded!',
    touch: 'Your three light orbs (top left) are full: hold the button until it glows pink, then let go. A Nova clears them all.',
    keys: 'Your three light orbs (top left) are full: hold Space until it glows pink, then let go. A Nova clears them all.',
    icon: 3,
    need: 1,
  },
  {
    id: 'way',
    title: 'Find your family',
    touch: 'Five guardians hold this forest. Follow the arrow beside you, beat them all, and the road to your family opens.',
    keys: 'Five guardians hold this forest. Follow the arrow beside you, beat them all, and the road to your family opens.',
    icon: -2,
    need: 1,
    info: true,
  },
];

const PULSE_R = 36;
/** how long a finished step shows its tick before the next one */
const TICK = 0.8;
/** how long the last card stays if nobody taps it away */
const WAY_HOLD = 4.2;

/** something from the dark: a shade (small, slow), one of the pack, or the brute that charges */
interface Foe {
  x: number;
  y: number;
  seed: number;
  /** seconds since it appeared (it fades in out of the dark) */
  age: number;
  /** set when it is hit: it fades out over half a second */
  hit: number;
  /** pushed back (by a pulse, or after it touched the blob): drifts away and waits */
  vx: number;
  vy: number;
  stun: number;
}

/** the brute's charge: it stalks, turns red and aims (tele), rushes along that line, then rests */
interface Brute extends Foe {
  st: 'stalk' | 'tele' | 'rush' | 'rest';
  t: number;
  dx: number;
  dy: number;
}

export class Tutorial {
  i = 0;
  count = 0;
  /** seconds since the step was done (the tick), or -1 */
  doneT = -1;
  /** how long it has run (the run clock gives it back) */
  t = 0;
  /** how long the current step has run */
  private st = 0;
  private from = { x: 0, y: 0 };
  private shades: Foe[] = [];
  private pack: Foe[] = [];
  private brute: Brute | null = null;
  private over = false;
  /** where it all happens: the middle of the clearing the blob woke in */
  private c = { x: 0, y: 0 };

  constructor(
    private hub: Hub,
    private onEnd: (skipped: boolean) => void,
  ) {
    const pl = hub.player;
    this.c = { x: pl.x, y: pl.y - 40 };
    this.from = { x: pl.x, y: pl.y };
    this.show();
  }

  get step(): Step {
    return STEPS[this.i]!;
  }

  /** what the action button does now */
  get button(): TutButton {
    // (between steps, the button keeps what it was: it does not blink away)
    if (this.doneT >= 0) return this.i === 0 ? 'none' : 'powers';
    const id = this.step.id;
    if (id === 'move') return 'none';
    if (this.step.info) return 'next';
    return 'powers';
  }

  /** the meters (orbs and dashes) are shown from the Lance on */
  get meters(): boolean {
    return this.i >= 1;
  }

  /** an open spot near (x, y) that the blob could stand on (a foe does not appear inside a tree) */
  private spot(x: number, y: number) {
    for (let r = 0; r <= 40; r += 5) {
      for (let k = 0; k < Math.max(1, r); k++) {
        const a = (k / Math.max(1, r)) * TAU;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * 0.8;
        if (this.hub.canStand(px, py, 6)) return { x: Math.round(px), y: Math.round(py) };
      }
    }
    return { x, y };
  }

  /** a foe at this angle round the blob, this far out */
  private foeAt(a: number, r: number, seed: number): Foe {
    const pl = this.hub.player;
    const s = this.spot(pl.x + Math.cos(a) * r, pl.y + Math.sin(a) * r * 0.75);
    return { ...s, seed, age: 0, hit: 0, vx: 0, vy: 0, stun: 0 };
  }

  /** a little bouncing chevron over a thing to deal with */
  private marker(sx: number, sy: number, t: number, col = '#ffe9a0') {
    const p = this.hub.p;
    const b = Math.round(Math.abs(Math.sin(t * 4)) * 3);
    const y = sy - b;
    p.alpha(0.95);
    p.line(sx - 3, y - 3, sx, y, '#05090f', 3);
    p.line(sx + 3, y - 3, sx, y, '#05090f', 3);
    p.line(sx - 3, y - 3, sx, y, col, 1);
    p.line(sx + 3, y - 3, sx, y, col, 1);
    p.alpha(1);
  }

  /** something touched the blob: no heart lost, but it is knocked back, the screen flinches, and the foe backs off */
  private bump(f: Foe) {
    const hub = this.hub;
    const pl = hub.player;
    if (pl.invuln > 0 || pl.dashT > 0) return;
    const dx = pl.x - f.x;
    const dy = pl.y - f.y;
    const l = Math.hypot(dx, dy) || 1;
    pl.vx = (dx / l) * 140;
    pl.vy = (dy / l) * 140;
    pl.invuln = 0.7;
    f.vx = (-dx / l) * 90;
    f.vy = (-dy / l) * 90;
    f.stun = 0.7;
    hub.audio.hurt();
    hub.ui.red(0.3, 260);
    hub.shake(4);
    burst(hub.parts, pl.x, pl.y - 6, 6, [C.blob, C.blobLight], 36, 1);
  }

  /** a foe drifts toward the blob at `speed`, wobbling; pushed back, it drifts away instead and waits */
  private drift(f: Foe, dt: number, speed: number) {
    const pl = this.hub.player;
    f.age += dt;
    if (f.hit > 0) {
      f.hit += dt;
      return;
    }
    if (f.stun > 0) {
      f.stun -= dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= Math.exp(-4 * dt);
      f.vy *= Math.exp(-4 * dt);
      return;
    }
    if (f.age < 0.6) return; // (still coming out of the dark)
    const dx = pl.x - f.x;
    const dy = pl.y - 4 - f.y;
    const l = Math.hypot(dx, dy) || 1;
    const w = Math.sin(this.t * 2.3 + f.seed) * 0.5;
    f.x += ((dx / l) * Math.cos(w) - (dy / l) * Math.sin(w)) * speed * dt;
    f.y += ((dy / l) * Math.cos(w) + (dx / l) * Math.sin(w)) * speed * dt;
    if (l < 10) this.bump(f);
  }

  update(dt: number) {
    if (this.over) return;
    this.t += dt;
    this.st += dt;
    const hub = this.hub;
    const pl = hub.player;
    if (this.doneT >= 0) {
      this.doneT += dt;
      // (what is left of a step's foes fades away while its tick shows)
      for (const f of [...this.shades, ...this.pack]) if (f.hit === 0) f.hit = 0.001;
      for (const f of [...this.shades, ...this.pack]) f.hit += f.hit > 0 ? dt : 0;
      if (this.doneT >= TICK) this.advance();
      return;
    }
    const id = this.step.id;
    if (id === 'move') {
      if (dist(pl.x, pl.y, this.from.x, this.from.y) > 34) this.count = 1;
    } else if (id === 'lance') {
      // three shades, one after another, out of the dark on three sides; each comes a little faster
      const want = Math.min(3, 1 + Math.floor(this.st / 1.1));
      while (this.shades.length < want) {
        const k = this.shades.length;
        this.shades.push(this.foeAt(-Math.PI / 2 + (k - 1) * 1.15, 92, k * 3.1 + 1));
        hub.audio.blip(0.6);
      }
      this.shades.forEach((s, k) => this.drift(s, dt, 15 + k * 3 + Math.min(10, this.st)));
    } else if (id === 'dash') {
      this.updateBrute(dt);
    } else if (id === 'nova') {
      if (pl.light < 3) hub.addLight(3);
      if (this.pack.length === 0) {
        for (let k = 0; k < 6; k++) this.pack.push(this.foeAt((k / 6) * TAU + 0.3, 78, k * 2.3 + 5));
        hub.audio.blip(0.5);
      }
      for (const f of this.pack) this.drift(f, dt, 12);
    } else if (this.step.info) {
      // the last card: the arrow is up; it goes by itself after a moment, or on a tap
      if (hub.input.actionPressed || this.st > WAY_HOLD) this.next();
      return;
    }
    if (this.count >= this.step.need) this.done();
  }

  /** the brute: stalks to a charging distance, turns red and aims (a line on the ground), rushes, rests, again */
  private updateBrute(dt: number) {
    const hub = this.hub;
    const pl = hub.player;
    if (!this.brute) {
      const f = this.foeAt(-Math.PI / 2, 84, 7.7);
      this.brute = { ...f, st: 'stalk', t: 0, dx: 0, dy: 0 };
      hub.audio.blip(0.4);
    }
    const b = this.brute;
    b.age += dt;
    b.t += dt;
    const dx = pl.x - b.x;
    const dy = pl.y - 4 - b.y;
    const l = Math.hypot(dx, dy) || 1;
    if (b.st === 'stalk') {
      // keep at about seventy, closing slowly, until it has stalked long enough
      const k = l > 74 ? 1 : l < 60 ? -1 : 0;
      b.x += (dx / l) * 22 * k * dt;
      b.y += (dy / l) * 22 * k * dt;
      if (b.age > 0.8 && b.t > 1.0) {
        b.st = 'tele';
        b.t = 0;
        b.dx = dx / l;
        b.dy = dy / l;
        hub.audio.charge1();
      }
    } else if (b.st === 'tele') {
      // it turns red and its line is drawn: where it will go
      if (b.t > 0.8) {
        b.st = 'rush';
        b.t = 0;
        hub.audio.charge2();
        hub.shake(2);
      }
    } else if (b.st === 'rush') {
      b.x += b.dx * 230 * dt;
      b.y += b.dy * 230 * dt;
      if (l < 13 && pl.dashT <= 0) this.bump(b);
      if (b.t > 0.62 || !hub.canStand(b.x + b.dx * 8, b.y + b.dy * 8, 4)) {
        b.st = 'rest';
        b.t = 0;
        burst(hub.parts, b.x, b.y - 6, 8, [C.ink, '#2a8aa0'], 30, 0, 0);
      }
    } else if (b.t > 0.7) {
      b.st = 'stalk';
      b.t = 0;
    }
    if (b.stun > 0) b.stun -= dt;
  }

  /** a pulse at (x, y): it shoves the shades back */
  onPulse(x: number, y: number) {
    if (this.doneT >= 0) return;
    for (const f of [...this.shades, ...this.pack]) {
      if (f.hit > 0) continue;
      const d = dist(x, y, f.x, f.y);
      if (d < PULSE_R + 8) {
        const l = d || 1;
        f.vx = ((f.x - x) / l) * 120;
        f.vy = ((f.y - y) / l) * 120;
        f.stun = 0.55;
        burst(this.hub.parts, f.x, f.y - 5, 6, [C.moonCore, '#2a8aa0'], 30, 0, 0);
      }
    }
  }

  /** a Lance in flight: did it hit a shade (or bounce off the brute)? */
  hitLance(l: Lance): boolean {
    const id = this.step.id;
    if (id === 'lance') {
      for (const s of this.shades) {
        if (s.hit === 0 && s.age > 0.3 && dist(l.x, l.y, s.x, s.y - 5) < 13) {
          s.hit = 0.001;
          this.count++;
          this.hub.audio.bossHit();
          this.hub.addLight(1);
          this.hub.shake(2);
          burst(this.hub.parts, s.x, s.y - 5, 18, [C.ink, '#2a8aa0', C.cyanEye, C.moonCore], 50, 0, 0);
          this.show();
          return true;
        }
      }
    }
    if (id === 'dash' && this.brute && dist(l.x, l.y, this.brute.x, this.brute.y - 8) < 16) {
      // (light glances off it: this one has to be dodged)
      burst(this.hub.parts, l.x, l.y, 6, [C.moonCore], 30, 0, 0);
      return true;
    }
    return false;
  }

  /** where the Lance should go if it is thrown near it: the nearest shade still standing */
  lanceTarget(): { x: number; y: number } | null {
    if (this.step.id !== 'lance') return null;
    const pl = this.hub.player;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const s of this.shades) {
      if (s.hit > 0 || s.age < 0.3) continue;
      const d = dist(pl.x, pl.y, s.x, s.y);
      if (d < bd) {
        bd = d;
        best = { x: s.x, y: s.y - 5 };
      }
    }
    return best;
  }

  onDash() {
    if (this.step.id !== 'dash' || this.doneT >= 0 || !this.brute) return;
    // a dodge: a dash while it aims or rushes
    if (this.brute.st === 'tele' || this.brute.st === 'rush') {
      this.count++;
      this.hub.audio.chime();
      this.show();
    }
  }

  onNova() {
    if (this.step.id !== 'nova' || this.doneT >= 0) return;
    for (const f of this.pack) {
      if (f.hit > 0) continue;
      f.hit = 0.001;
      burst(this.hub.parts, f.x, f.y - 5, 14, [C.ink, '#2a8aa0', '#ff9ad0', C.moonCore], 60, 0, 0);
    }
    this.count++;
    this.show();
  }

  /** the panel's Next (on a card) */
  next() {
    if (this.over || this.doneT >= 0) return;
    this.count = this.step.need;
    this.hub.audio.click();
    this.advance();
  }

  skip() {
    if (this.over) return;
    this.finish(true);
  }

  private done() {
    this.doneT = 0;
    this.hub.audio.chime();
    const pl = this.hub.player;
    burst(this.hub.parts, pl.x, pl.y - 10, 18, [C.moonCore, C.blobLight, '#ffe9a0'], 46, 0, 0);
    if (this.step.id === 'dash' && this.brute) {
      burst(this.hub.parts, this.brute.x, this.brute.y - 8, 24, [C.ink, '#2a8aa0', C.cyanEye, C.moonCore], 60, 0, 0);
      this.hub.audio.kill();
      this.brute = null;
    }
    this.show();
  }

  private advance() {
    this.doneT = -1;
    this.count = 0;
    this.st = 0;
    this.i++;
    if (this.i >= STEPS.length) {
      this.finish(false);
      return;
    }
    this.show();
  }

  private finish(skipped: boolean) {
    this.over = true;
    this.hub.ui.tutorial(null);
    this.onEnd(skipped);
  }

  get ended() {
    return this.over;
  }

  /** the panel: what to do, for the device in hand, and how far along it is */
  private show() {
    const s = this.step;
    if (this.meters) this.hub.addLight(0);
    this.hub.input.highlight(this.doneT < 0 && s.id !== 'move' && !s.info);
    const touch = this.hub.input.usingTouch || window.matchMedia('(pointer: coarse)').matches;
    this.hub.ui.tutorial(
      {
        step: this.i,
        steps: STEPS.length,
        title: s.title,
        text: touch ? s.touch : s.keys,
        icon: s.icon,
        count: s.info || s.need < 2 ? '' : `${Math.min(this.count, s.need)} / ${s.need}`,
        done: this.doneT >= 0,
        next: s.info ? "Let's go" : undefined,
        joy: s.id === 'move' && touch,
        orbs: s.id === 'nova' || s.id === 'dash',
        hearts: false,
      },
      () => this.skip(),
      () => this.next(),
    );
  }

  /** a foe, drawn: a shade fading in out of the dark, or out when hit */
  private drawFoe(f: Foe, cx: number, cy: number, t: number, mark: boolean) {
    const p = this.hub.p;
    const fade = f.hit > 0 ? 1 - f.hit / 0.5 : clamp(f.age / 0.6, 0, 1);
    if (fade <= 0) return;
    const sx = f.x - cx;
    const sy = f.y - cy + Math.sin(t * 2 + f.seed) * 1.5;
    // (a pale glow round it and a ring under it: a dark thing on dark ground has to be seen at once)
    p.alpha(fade);
    p.dither(sx, sy - 4, 12, 10, '#9ff4ee', 0.16);
    p.ring(sx, sy + 1, 8, 3.4, 1, '#2a8aa0');
    p.alpha(1);
    drawGloom(p, sx, sy, t, f.seed, fade);
    if (mark && f.hit === 0 && f.age > 0.4) {
      this.marker(sx, sy - 15, t, C.red);
      p.alpha(0.5 + 0.25 * Math.sin(t * 5 + f.seed));
      p.ring(sx, sy + 1, 9, 4, 1, C.red);
      p.alpha(1);
    }
  }

  /** the brute: a big shade with a ragged crown; red-eyed while it aims, its line on the ground */
  private drawBrute(b: Brute, cx: number, cy: number, t: number) {
    const p = this.hub.p;
    const sx = b.x - cx;
    const sy = b.y - cy;
    const fade = clamp(b.age / 0.6, 0, 1);
    const angry = b.st === 'tele' || b.st === 'rush';
    if (b.st === 'tele') {
      // its line: where it will rush
      const len = 120;
      const n = 16;
      p.alpha(0.35 + 0.4 * (b.t / 0.8));
      for (let k = 2; k < n; k++) {
        const u = k / n;
        if (Math.floor(t * 12 + k) % 2) continue;
        p.rect(Math.round(sx + b.dx * len * u) - 1, Math.round(sy + b.dy * len * u) - 1, 2, 2, C.red);
      }
      p.alpha(1);
    }
    const sh = b.st === 'tele' ? Math.round(Math.sin(t * 60) * 1) : 0;
    const bob = Math.sin(t * 4 + b.seed) * 1.2;
    p.alpha(fade);
    p.dither(sx, sy - 9, 20, 15, angry ? '#ff8a8a' : '#9ff4ee', 0.14);
    p.ring(sx, sy + 1, 14, 5, 1, angry ? C.red : '#2a8aa0');
    p.dither(sx, sy, 13, 4, C.ink, 0.7);
    p.dither(sx, sy - 9, 15, 11, angry ? C.redDark : '#2a8aa0', 0.25);
    p.ellipse(sx + sh, sy - 9 + bob, 11, 9, '#1d4a5c');
    p.ellipse(sx + sh, sy - 9 + bob, 9.8, 7.8, '#010208');
    for (let k = -2; k <= 2; k++) p.line(sx + sh + k * 4, sy - 16 + bob, sx + sh + k * 5, sy - 21 - Math.abs(k) * -1 + bob, '#010208', 2);
    const eye = angry ? C.red : C.cyanEye;
    p.rect(sx + sh - 5, sy - 11 + bob, 3, 2, eye);
    p.rect(sx + sh + 2, sy - 11 + bob, 3, 2, eye);
    if (angry) {
      p.px(sx + sh - 4, sy - 11 + bob, C.white);
      p.px(sx + sh + 3, sy - 11 + bob, C.white);
    }
    p.alpha(1);
    if (b.st === 'stalk' && b.age > 0.5) this.marker(sx, sy - 26, t, C.red);
  }

  /** the step's foes, drawn among everything else (screen space from the camera) */
  push(list: Drawable[]) {
    if (this.over) return;
    const t = this.hub.time;
    const cx = this.hub.camX;
    const cy = this.hub.camY;
    for (const s of this.shades) if (s.hit < 0.5) list.push({ y: s.y, fn: () => this.drawFoe(s, cx, cy, t, true) });
    for (const f of this.pack) if (f.hit < 0.5) list.push({ y: f.y, fn: () => this.drawFoe(f, cx, cy, t, false) });
    const b = this.brute;
    if (b) list.push({ y: b.y, fn: () => this.drawBrute(b, cx, cy, t) });
  }
}
