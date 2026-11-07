import { burst } from '../core/art';
import { drawGloom } from '../core/art2';
import { C } from '../core/palette';
import { dist } from '../core/util';
import { drawLamp } from './art3';
import type { Drawable, Hub, Lance } from './types';

/**
 * The tutorial: right after the opening, the first time someone plays, in the clearing where the blob wakes. Each step is
 * something to do, not something to read: collect three lights (move), light two stone lamps (pulse), hit two shades with a
 * Light Lance, dash twice, burst a Nova, then two short cards (hearts and healing; the arrow, the goal and the 3D camera).
 * The panel at the top says what to do in words for the device in hand (touch or keys) and counts it; a step that is done
 * ticks, chimes and moves on. It can be skipped at any time. The forest asks it what the button may do (`button`), tells it
 * what the player did (`onPulse`, `hitLance`, `onDash`, `onNova`) and draws its props among its own (`push`).
 */

export type TutButton = 'none' | 'pulse' | 'powers' | 'next';

interface Step {
  id: 'move' | 'pulse' | 'lance' | 'dash' | 'nova' | 'hearts' | 'way';
  title: string;
  touch: string;
  keys: string;
  /** which of the guide's gesture pictures goes with it (src/ui.ts GESTURES) */
  icon: number;
  need: number;
  /** a card to read: the button says Next */
  info?: boolean;
}

export const STEPS: Step[] = [
  { id: 'move', title: 'Move', touch: 'Drag anywhere on the left side of the screen. Collect the three lights.', keys: 'Use WASD or the arrow keys. Collect the three lights.', icon: 0, need: 3 },
  {
    id: 'pulse',
    title: 'Pulse of light',
    touch: 'Tap the button for a pulse of light: it lights lamps and wakes things. Stand by each lamp and tap.',
    keys: 'Press Space for a pulse of light: it lights lamps and wakes things. Stand by each lamp and press Space.',
    icon: 1,
    need: 2,
  },
  {
    id: 'lance',
    title: 'Light Lance',
    touch: 'Hold the button and let go: a lance of light flies the way you face. Or drag the button to aim it. Hit both shades.',
    keys: 'Hold Space and let go: a lance of light flies the way you face (walk toward a shade to face it). Hit both shades.',
    icon: 2,
    need: 2,
  },
  {
    id: 'dash',
    title: 'Dash',
    touch: 'Double-tap the button to dash. Nothing can hurt you while you dash. Dashes come back slowly: see the bar beside your orbs.',
    keys: 'Double-tap Space to dash. Nothing can hurt you while you dash. Dashes come back slowly: see the bar beside your orbs.',
    icon: 4,
    need: 2,
  },
  {
    id: 'nova',
    title: 'Nova',
    touch: 'Every hit fills your three light orbs (top left). They are full: hold the button longer, until it glows pink, and let go.',
    keys: 'Every hit fills your three light orbs (top left). They are full: hold Space longer, until it glows pink, and let go.',
    icon: 3,
    need: 1,
  },
  {
    id: 'hearts',
    title: 'Hearts',
    touch: 'These are your hearts. Lose them all and you wake again at the last checkpoint. Stand in glowing flowers to heal.',
    keys: 'These are your hearts. Lose them all and you wake again at the last checkpoint. Stand in glowing flowers to heal.',
    icon: -1,
    need: 1,
    info: true,
  },
  {
    id: 'way',
    title: 'Find your family',
    touch: 'The arrow beside you points to the next zone; the line at the top says what to do there. Wake each guardian and beat it. Later, in 3D, drag the right side of the screen to turn the camera.',
    keys: 'The arrow beside you points to the next zone; the line at the top says what to do there. Wake each guardian and beat it. Later, in 3D, Q and E turn the camera.',
    icon: -2,
    need: 1,
    info: true,
  },
];

const PULSE_R = 36;
/** how long a finished step shows its tick before the next one */
const TICK = 1.1;

export class Tutorial {
  i = 0;
  count = 0;
  /** seconds since the step was done (the tick), or -1 */
  doneT = -1;
  /** how long it has run (the run clock gives it back) */
  t = 0;
  private motes: { x: number; y: number; got: boolean }[] = [];
  private lamps: { x: number; y: number; lit: number }[] = [];
  private shades: { x: number; y: number; hit: number; seed: number }[] = [];
  private over = false;

  constructor(
    private hub: Hub,
    private onEnd: (skipped: boolean) => void,
  ) {
    // everything is placed in the glade where the blob wakes (START, centre 640, 1720), out in the open where no tree hangs over it:
    // the lights lead up into the glade, the lamps stand in its middle, the shades wait at its far side
    this.motes = [
      [635, 1772],
      [578, 1728],
      [655, 1690],
    ].map(([x, y]) => ({ ...this.spot(x!, y!), got: false }));
    this.lamps = [
      [598, 1700],
      [688, 1712],
    ].map(([x, y]) => ({ ...this.spot(x!, y!), lit: 0 }));
    this.shades = [
      [606, 1622],
      [684, 1612],
    ].map(([x, y], k) => ({ ...this.spot(x!, y!), hit: 0, seed: k * 3.1 }));
    this.show();
  }

  get step(): Step {
    return STEPS[this.i]!;
  }

  /** what the action button does now */
  get button(): TutButton {
    // (between steps, the button keeps what it was: it does not blink away)
    if (this.doneT >= 0) return this.i === 0 ? 'none' : this.i === 1 ? 'pulse' : 'powers';
    const id = this.step.id;
    if (id === 'move') return 'none';
    if (id === 'pulse') return 'pulse';
    if (this.step.info) return 'next';
    return 'powers';
  }

  /** the meters (orbs and dashes) are shown from the Lance on */
  get meters(): boolean {
    return this.i >= 2;
  }

  /**
   * The open spot nearest the wish: ground you can stand on, with ground all round it and below it too (the trees grow where you
   * cannot walk, and their crowns hang up over the ground in front of them: a thing placed there would be hidden).
   */
  private spot(x: number, y: number) {
    const land = this.hub.land;
    const open = (px: number, py: number) =>
      this.hub.canStand(px, py, 8) &&
      [[-22, 0], [22, 0], [0, 30], [-16, 55], [16, 55], [0, 80]].every(([dx, dy]) => land.isWalk(px + dx!, py + dy!));
    for (let r = 0; r <= 60; r += 6) {
      for (let k = 0; k < Math.max(1, r); k++) {
        const a = (k / Math.max(1, r)) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * 0.8;
        if (open(px, py)) return { x: Math.round(px), y: Math.round(py) };
      }
    }
    return { x, y };
  }

  /** a little bouncing chevron over a thing to use, in gold */
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

  update(dt: number) {
    if (this.over) return;
    this.t += dt;
    const hub = this.hub;
    const pl = hub.player;
    if (this.doneT >= 0) {
      this.doneT += dt;
      if (this.doneT >= TICK) this.advance();
      return;
    }
    const id = this.step.id;
    if (id === 'move') {
      for (const m of this.motes) {
        if (!m.got && dist(pl.x, pl.y - 4, m.x, m.y) < 13) {
          m.got = true;
          this.count++;
          hub.audio.blip(0.9 + this.count * 0.15);
          burst(hub.parts, m.x, m.y - 8, 14, [C.moonCore, C.blobLight, '#ffffff'], 40, 0, 0);
          this.show();
        }
      }
    }
    for (const l of this.lamps) if (l.lit > 0 && l.lit < 1) l.lit = Math.min(1, l.lit + dt * 3);
    for (const s of this.shades) if (s.hit > 0) s.hit += dt;
    if (id === 'nova' && pl.light < 3 && this.count === 0) hub.addLight(3);
    if (this.step.info) {
      if (hub.input.actionPressed) this.next();
      return;
    }
    if (this.count >= this.step.need) this.done();
  }

  /** a pulse at (x, y): the lamps in reach light */
  onPulse(x: number, y: number) {
    if (this.step.id !== 'pulse' || this.doneT >= 0) return;
    for (const l of this.lamps) {
      if (l.lit === 0 && dist(x, y, l.x, l.y - 6) < PULSE_R + 6) {
        l.lit = 0.01;
        this.count++;
        this.hub.audio.warm();
        burst(this.hub.parts, l.x, l.y - 12, 16, [C.blobLight, '#fff4c8', C.moonCore], 40, 0, 0);
        this.show();
      }
    }
  }

  /** a Lance in flight: did it hit a shade? */
  hitLance(l: Lance): boolean {
    if (this.step.id !== 'lance') return false;
    for (const s of this.shades) {
      if (s.hit === 0 && dist(l.x, l.y, s.x, s.y - 5) < 13) {
        s.hit = 0.001;
        this.count++;
        this.hub.audio.bossHit();
        this.hub.addLight(1);
        burst(this.hub.parts, s.x, s.y - 5, 18, [C.ink, '#2a8aa0', C.cyanEye, C.moonCore], 50, 0, 0);
        this.show();
        return true;
      }
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
      if (s.hit > 0) continue;
      const d = dist(pl.x, pl.y, s.x, s.y);
      if (d < bd) {
        bd = d;
        best = { x: s.x, y: s.y - 5 };
      }
    }
    return best;
  }

  onDash() {
    if (this.step.id !== 'dash' || this.doneT >= 0) return;
    this.count++;
    this.show();
  }

  onNova() {
    if (this.step.id !== 'nova' || this.doneT >= 0) return;
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
    this.show();
  }

  private advance() {
    this.doneT = -1;
    this.count = 0;
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
    this.hub.input.highlight(this.doneT < 0 && s.id !== 'move');
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
        next: s.info ? (this.i === STEPS.length - 1 ? "Let's go" : 'Next') : undefined,
        joy: s.id === 'move' && touch,
        orbs: s.id === 'nova' || s.id === 'dash',
        hearts: s.id === 'hearts',
      },
      () => this.skip(),
      () => this.next(),
    );
  }

  /** the step's props, drawn among everything else (screen space from the camera) */
  push(list: Drawable[]) {
    if (this.over) return;
    const hub = this.hub;
    const p = hub.p;
    const t = hub.time;
    const cx = hub.camX;
    const cy = hub.camY;
    const id = this.step.id;
    if (id === 'move') {
      this.motes.forEach((m, k) => {
        if (m.got) return;
        list.push({
          y: m.y,
          fn: () => {
            const sx = m.x - cx;
            const sy = m.y - cy - 8 + Math.sin(t * 3 + k) * 2;
            p.ellipse(m.x - cx, m.y - cy + 1, 3, 1.2, '#05090f');
            p.dither(sx, sy, 12, 10, C.blobLight, 0.3 + 0.1 * Math.sin(t * 5 + k));
            p.ellipse(sx, sy, 2.6, 2.6, C.moonCore);
            p.px(sx - 1, sy - 1, '#ffffff');
          },
        });
      });
    }
    // the lamps stay once lit: the clearing keeps a little of the light you made
    if (this.i >= 1) {
      for (const l of this.lamps)
        list.push({
          y: l.y,
          fn: () => {
            drawLamp(p, l.x - cx, l.y - cy, t, l.lit);
            if (id === 'pulse' && l.lit === 0 && this.doneT < 0) this.marker(l.x - cx, l.y - cy - 24, t);
          },
        });
      // the reach of a pulse, shown around each lamp still dark
      if (id === 'pulse') {
        for (const l of this.lamps) {
          if (l.lit > 0) continue;
          list.push({
            y: l.y - 0.5,
            fn: () => {
              const n = 22;
              p.alpha(0.4 + 0.2 * Math.sin(t * 3));
              for (let k = 0; k < n; k++) {
                const a = (k / n) * Math.PI * 2;
                p.px(Math.round(l.x - cx + Math.cos(a) * 26), Math.round(l.y - cy + Math.sin(a) * 26 * 0.72), C.blobLight);
              }
              p.alpha(1);
            },
          });
        }
      }
    }
    if (id === 'lance') {
      this.shades.forEach((s) => {
        if (s.hit > 0.5) return;
        list.push({
          y: s.y,
          fn: () => {
            const fade = s.hit > 0 ? 1 - s.hit / 0.5 : 1;
            const sx = s.x - cx;
            const sy = s.y - cy + Math.sin(t * 2 + s.seed) * 1.5;
            drawGloom(p, sx, sy, t, s.seed, fade);
            if (s.hit === 0) {
              this.marker(sx, sy - 15, t, C.red);
              // a target mark under it, so it reads as something to hit
              p.alpha(0.55 + 0.25 * Math.sin(t * 5 + s.seed));
              p.ring(sx, sy + 1, 9, 4, 1, C.red);
              p.alpha(1);
            }
          },
        });
      });
    }
  }
}
