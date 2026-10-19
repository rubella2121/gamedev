import { D } from '../core/difficulty';
import { Pix, W, H } from '../core/pix';
import { C } from '../core/palette';
import { clamp, dist, easeOutCubic, hash2, lerp, rng, smooth, TAU, unlerp } from '../core/util';
import { burst, drawBlob, drawGlint, drawLurker, drawMoon, drawParticles, drawRedEyes, updateParticles, type Particle } from '../core/art';
import { drawMoth } from '../core/art2';
import type { Sfx } from '../core/audio';
import type { Input } from '../core/input';
import type { UI } from '../ui';
import { BonesEncounter } from './bones';
import { GloomEncounter } from './gloom';
import type { Drawable, Encounter, Features, Hub, PlayerState, SlamLike } from './hub';
import { CLIFF_Y, SEC, moveHw, trailCx } from './layout';
import { MarshEncounter } from './marsh';
import { MeadowEncounter } from './meadow';
import { RootsEncounter } from './roots';
import { CLEARING, World } from './world';

export interface Ctx {
  audio: Sfx;
  ui: UI;
  input: Input;
  stats: { deaths: number };
}

type Mode = 'opening' | 'play' | 'edge' | 'crack' | 'done';

const OP = { nudge: 3.2, cap1: 3.4, shadow: 7.0, shove: 10.4, slam: 13.0, ring: 15.8, lurk: 17.6, eyes: 20.6, hint: 22.4, end: 23.8 };
const SPEED = 66;
const GLITCH = 2.3;

export class Act1 implements Hub {
  readonly p = new Pix();
  readonly world = new World(this.p.ctx);
  readonly audio: Sfx;
  readonly ui: UI;
  readonly input: Input;
  mode: Mode = 'opening';
  time = 0;
  private ot = 0;
  private et = 0;
  private ct = 0;
  camY = -190;
  private shakeV = 0;
  player: PlayerState = { x: 66, y: 74, vx: 0, vy: 0, lookX: 0, lookY: 0, squash: 1, dead: 0, blink: 0, hide: false, speedMul: 1 };
  slams: SlamLike[] = [];
  parts: Particle[] = [];
  features: Features = { teeth: false, eyes: false, limbs: false, cyan: false };
  moth = { has: false, x: 0, y: 0 };
  readonly encounters: Encounter[];
  private fired = new Set<string>();
  private cp = { x: 66, y: 74 };
  private lookHold = 0;
  private cracks: { x: number; y: number }[][] = [];
  private crackLen = 0;
  private dark: HTMLCanvasElement[] = [];
  private smudge = 0;
  private edgeFlakeT = 0;
  private mothDust = 0;
  private glitchT = 0;
  private glitchFlash = false;
  private tmp: HTMLCanvasElement;
  previewMode = false;
  onBoom: (() => void) | null = null;
  onSection: ((name: string) => void) | null = null;
  onTeaserFlash: (() => void) | null = null;

  constructor(private ctx: Ctx) {
    this.audio = ctx.audio;
    this.ui = ctx.ui;
    this.input = ctx.input;
    this.tmp = document.createElement('canvas');
    this.tmp.width = W;
    this.tmp.height = H;
    this.encounters = [new GloomEncounter(this), new RootsEncounter(this), new MarshEncounter(this), new BonesEncounter(this), new MeadowEncounter(this)];
    this.buildDark();
  }

  private buildDark() {
    const levels = [0.18, 0.34, 0.5, 0.66, 0.82];
    const B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    for (const lv of levels) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const x = c.getContext('2d')!;
      const img = x.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        for (let xx = 0; xx < W; xx++) {
          if (lv * 16 > B[y & 3]![xx & 3]!) {
            const i = (y * W + xx) * 4;
            img.data[i] = 4;
            img.data[i + 1] = 6;
            img.data[i + 2] = 14;
            img.data[i + 3] = 255;
          }
        }
      }
      x.putImageData(img, 0, 0);
      this.dark.push(c);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Hub interface (what encounters can do)                            */
  /* ---------------------------------------------------------------- */

  spawnSlam(x: number, y: number, R: number, T: number, tree = false) {
    this.slams.push({ x, y, R, T: T * D.tele, t: 0, phase: 'tele', ph: 0, tree });
    this.audio.rumble();
  }

  inEllipse(px: number, py: number, s: SlamLike, k: number) {
    const dx = (px - s.x) / (s.R * k);
    const dy = (py - s.y) / (s.R * 0.72 * k);
    return dx * dx + dy * dy < 1;
  }

  killPlayer() {
    const pl = this.player;
    if (pl.dead > 0 || this.mode === 'opening') return;
    pl.dead = 1.0;
    this.ctx.stats.deaths++;
    this.ui.fade(1, 160);
    this.ui.red(0.5, 400);
    this.audio.death();
    this.ui.hint(null);
    this.input.setAction(null);
    burst(this.parts, pl.x, pl.y - 5, 18, [C.blob, C.blobLight, C.blobShade], 55, 1);
    pl.hide = true;
  }

  shake(v: number) {
    this.shakeV = Math.max(this.shakeV, v);
  }

  checkpoint(y: number) {
    if (y < this.cp.y) this.cp = { x: trailCx(y), y };
  }

  teaser() {
    this.glitchT = GLITCH;
    this.glitchFlash = false;
    this.audio.slam();
    this.audio.sting();
    this.ui.flash(0.8, 320);
    this.shake(10);
  }

  /* ---------------------------------------------------------------- */
  /* lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  start(skipOpening = false) {
    this.mode = 'opening';
    this.ot = 0;
    this.et = 0;
    this.ct = 0;
    this.fired.clear();
    this.slams = [];
    this.parts = [];
    this.glitchT = 0;
    this.world.decals.length = 0;
    this.world.deadTree.alive = true;
    this.features = { teeth: false, eyes: false, limbs: false, cyan: false };
    this.moth = { has: false, x: 0, y: 0 };
    this.encounters.forEach((e) => e.reset());
    this.player = { x: 66, y: 74, vx: 0, vy: 0, lookX: 0, lookY: 0, squash: 1, dead: 0, blink: 0, hide: false, speedMul: 1 };
    this.cp = { x: 66, y: 74 };
    this.camY = -190;
    this.lookHold = 0;
    this.smudge = 0;
    this.audio.setWind(0.16, 2);
    this.audio.setCrickets(1);
    this.audio.setHeart(0, 0);
    this.audio.setDrone(0, 0.5);
    this.audio.setLullaby(0.9, 0);
    this.input.setMoveEnabled(false);
    this.input.setAction(null);
    this.ui.hint(null);
    this.ui.skip(true, () => this.skipOpening());
    if (skipOpening) this.skipOpening();
  }

  skipOpening() {
    if (this.mode !== 'opening') return;
    this.ot = OP.end;
    this.fired = new Set(['cap1', 'shadow', 'cap2', 'slam', 'quiet', 'lurk', 'eyes', 'hint']);
    this.world.decals.length = 0;
    this.world.addDecal(CLEARING.x, CLEARING.y, 62, 45, 1);
    this.ui.caption(null);
    this.audio.setWind(0.16, 1);
    this.audio.setCrickets(0);
    this.audio.setHeart(1.3, 0.6);
    this.audio.setLullaby(0.5, 0.5);
    this.beginPlay();
  }

  private beginPlay() {
    this.mode = 'play';
    this.ui.skip(false);
    this.input.setMoveEnabled(true);
    this.ui.hint(window.matchMedia('(pointer: coarse)').matches ? 'drag to move' : 'wasd / arrows to move');
    window.setTimeout(() => this.ui.hint(null), 5200);
    this.player.x = 66;
    this.player.y = 74;
    this.player.hide = false;
    this.onSection?.('run');
  }

  /** Jump to a section (debug / showcase). Everything before it counts as done. */
  warp(name: string) {
    if (this.mode === 'opening') this.skipOpening();
    const order = ['gloom', 'roots', 'marsh', 'bones', 'meadow'];
    const ys: Record<string, number> = { gloom: -150, roots: -812, marsh: -1292, bones: -2012, meadow: -2612, edge: CLIFF_Y + 80 };
    const y = ys[name];
    if (y === undefined) return;
    const upTo = name === 'edge' ? order.length : order.indexOf(name);
    this.encounters.forEach((e, i) => {
      if (i < upTo) e.complete();
    });
    this.player.y = y;
    this.player.x = trailCx(y);
    this.player.vx = this.player.vy = 0;
    this.camY = y - 0.62 * H;
    this.slams = [];
    this.cp = { x: this.player.x, y };
  }

  /** Showcase: freeze the moment the claws hit and the screen cracks, ready for the boom. */
  prepareShowcase() {
    this.warp('edge');
    this.moth = { has: true, x: 120, y: CLIFF_Y + 8 };
    this.mode = 'crack';
    this.et = 12;
    this.lookHold = 1;
    this.ct = 1.4;
    this.makeCracks();
    this.player.x = trailCx(CLIFF_Y + 40);
    this.player.y = CLIFF_Y + 28;
    this.player.lookY = 1;
    this.camY = CLIFF_Y + 28 - 0.62 * H - 120;
    this.slams = [];
    this.ui.hint(null);
    this.input.setAction(null);
  }

  /* ---------------------------------------------------------------- */
  /* update                                                            */
  /* ---------------------------------------------------------------- */

  update(dt: number) {
    this.time += dt;
    this.shakeV = Math.max(0, this.shakeV - dt * 22);
    updateParticles(this.parts, dt);
    if (this.glitchT > 0) {
      this.glitchT -= dt;
      if (!this.glitchFlash && this.glitchT < GLITCH - 0.9) {
        this.glitchFlash = true;
        this.onTeaserFlash?.();
      }
    }
    if (this.mode === 'opening') this.updateOpening(dt);
    else if (this.mode === 'play') this.updatePlay(dt);
    else if (this.mode === 'edge') this.updateEdge(dt);
    else if (this.mode === 'crack') this.updateCrack(dt);
    if (this.mode === 'play' || this.mode === 'edge' || this.mode === 'crack') this.updateMoth(dt);
    if (this.mode === 'play') {
      const s = this.slams.find((q) => q.phase === 'tele');
      const u = s ? s.t / s.T : 0;
      this.audio.setHeart(s ? 1.15 + u * 1.4 : 0.9, s ? 0.65 : 0.3);
      // calm in the meadow once the Mournmoth is with you, broken everywhere else
      this.audio.setLullaby(s ? 0.3 : 0.5, s ? 0.95 : this.moth.has ? 0.12 : 0.55);
    }
  }

  private fire(key: string, cond: boolean, fn: () => void) {
    if (cond && !this.fired.has(key)) {
      this.fired.add(key);
      fn();
    }
  }

  private updateOpening(dt: number) {
    this.ot += dt;
    const t = this.ot;
    const { ui, audio } = this;
    this.fire('cap1', t >= OP.cap1, () => {
      ui.caption("Don't look up.", 2800);
      audio.blip(0.7);
    });
    this.fire('shadow', t >= OP.shadow, () => {
      audio.setHeart(1.0, 0.85);
      audio.setLullaby(0.6, 0.8);
    });
    this.fire('cap2', t >= OP.shove, () => {
      ui.caption("Go. Don't stop.", 2200);
      audio.blip(1.15);
      audio.setHeart(1.8, 1);
    });
    this.fire('slam', t >= OP.slam, () => {
      ui.flash(1, 700);
      ui.caption(null);
      this.shake(12);
      audio.slam();
      audio.silence(0.05);
      audio.ring(2.6);
      this.world.addDecal(CLEARING.x, CLEARING.y, 62, 45, 1);
      burst(this.parts, CLEARING.x, CLEARING.y - 6, 40, [C.ink, '#1a2a30', C.blobShade, C.soil], 70, 1);
    });
    this.fire('quiet', t >= OP.ring, () => audio.setWind(0.15, 3));
    this.fire('lurk', t >= OP.lurk, () => audio.bell(0.75));
    this.fire('eyes', t >= OP.eyes, () => audio.setHeart(1.35, 0.8));
    if (t >= OP.slam) this.smudge += dt;
    if (t >= OP.end) this.beginPlay();
    this.camY = -190;
  }

  private respawn() {
    const pl = this.player;
    pl.x = this.cp.x;
    pl.y = this.cp.y;
    pl.vx = pl.vy = 0;
    pl.dead = 0;
    pl.hide = false;
    pl.speedMul = 1;
    this.slams = [];
    this.encounters.forEach((e) => e.onRespawn());
    this.camY = pl.y - 0.62 * H;
    this.ui.fade(0, 450);
  }

  private updateSlams(dt: number) {
    for (let i = this.slams.length - 1; i >= 0; i--) {
      const s = this.slams[i]!;
      if (s.phase === 'tele') {
        s.t += dt;
        if (s.t >= s.T) {
          s.phase = 'hit';
          s.ph = 0;
          this.impact(s);
        }
      } else if (s.phase === 'hit') {
        s.ph += dt;
        if (s.ph > 0.32) {
          s.phase = 'after';
          s.ph = 0;
        }
      } else {
        s.ph += dt;
        if (s.ph > 1.3) {
          this.world.addDecal(s.x, s.y, s.R * 0.95, s.R * 0.68, 0.7);
          this.slams.splice(i, 1);
        }
      }
    }
  }

  private impact(s: SlamLike) {
    this.audio.slam();
    this.ui.flash(0.55, 320);
    this.shake(9);
    burst(this.parts, s.x, s.y, 26, [C.ink, '#16303a', '#2a7a6c', C.soil], 85, 1);
    const pl = this.player;
    if (!pl.hide && this.inEllipse(pl.x, pl.y, s, 0.9)) this.killPlayer();
    const dt0 = this.world.deadTree;
    if (dt0.alive && this.inEllipse(dt0.x, dt0.y, s, 1.15)) {
      dt0.alive = false;
      burst(this.parts, dt0.x, dt0.y - 20, 30, ['#161a26', '#3a4a60', '#05060c'], 80, 1);
      this.audio.crumble();
    }
    this.encounters.forEach((e) => e.onImpact?.(s));
  }

  private updatePlay(dt: number) {
    const { input } = this;
    const pl = this.player;
    if (pl.dead > 0) {
      pl.dead -= dt;
      if (pl.dead <= 0) this.respawn();
      this.updateSlams(dt);
      return;
    }

    // --- movement
    const sp0 = SPEED * pl.speedMul;
    const k = 1 - Math.exp(-16 * dt);
    pl.vx += (input.moveX * sp0 - pl.vx) * k;
    pl.vy += (input.moveY * sp0 - pl.vy) * k;
    pl.x += pl.vx * dt;
    pl.y += pl.vy * dt;
    const sp = Math.hypot(pl.vx, pl.vy);
    if (sp > 8) {
      pl.lookX = pl.vx / SPEED;
      pl.lookY = pl.vy / SPEED;
    } else {
      pl.lookX *= 0.9;
      pl.lookY *= 0.9;
    }
    pl.squash = 1 + 0.09 * Math.sin(this.time * 14) * clamp(sp / SPEED, 0, 1) + 0.03 * Math.sin(this.time * 2.5);
    pl.blink = hash2(Math.floor(this.time * 5), 3) > 0.93 ? 1 : 0;

    // --- bounds and solid things
    const hw = moveHw(pl.y);
    const cx = trailCx(pl.y);
    pl.x = clamp(pl.x, cx - hw + 5, cx + hw - 5);
    pl.y = clamp(pl.y, CLIFF_Y + 24, 130);
    pl.speedMul = 1;
    this.encounters.forEach((e) => e.collide?.());

    // --- encounters
    for (const e of this.encounters) {
      if (pl.y < e.y0 - 6) this.checkpoint(e.y0 - 10);
      if (pl.y < e.y0 + 150 && pl.y > e.y1 - 220) e.update(dt);
      if (pl.dead > 0) break;
    }
    this.updateSlams(dt);

    // --- camera
    const target = pl.y - 0.62 * H;
    this.camY += (target - this.camY) * (1 - Math.exp(-6 * dt));

    // --- the edge
    if (pl.y <= CLIFF_Y + 70 && this.mode === 'play') this.beginEdge();
  }

  private updateMoth(dt: number) {
    const m = this.moth;
    if (!m.has) return;
    const pl = this.player;
    const tx = pl.x + 11;
    const ty = pl.y - 18 + Math.sin(this.time * 3) * 2;
    m.x += (tx - m.x) * (1 - Math.exp(-4 * dt));
    m.y += (ty - m.y) * (1 - Math.exp(-4 * dt));
    this.mothDust -= dt;
    if (this.mothDust <= 0) {
      this.mothDust = 0.07;
      this.parts.push({ x: m.x + (Math.random() - 0.5) * 4, y: m.y + 3, vx: (Math.random() - 0.5) * 8, vy: 6 + Math.random() * 8, life: 1.2, max: 1.2, col: Math.random() < 0.5 ? C.moonCore : C.moon, g: -1, size: 1 });
    }
    // the dust shows the invisible edge of the world
    if (pl.y < CLIFF_Y + 260 && Math.random() < dt * 14) {
      const x = 20 + Math.random() * 176;
      this.parts.push({ x, y: this.world.cliffAt(x) + 2, vx: (Math.random() - 0.5) * 4, vy: -6 - Math.random() * 6, life: 1.6, max: 1.6, col: C.moon, g: 0, size: 1 });
    }
  }

  /* ---------------------------------------------------------------- */
  /* the edge of the world                                             */
  /* ---------------------------------------------------------------- */

  private beginEdge() {
    this.mode = 'edge';
    this.et = 0;
    this.slams = [];
    this.lookHold = 0;
    this.audio.silence(0.4);
    this.ui.hint(null);
    this.input.setMoveEnabled(false);
    this.onSection?.('edge');
  }

  private clawU(): number {
    const a = clamp((this.et - 3.4) / 7, 0, 1) * 0.5;
    return a + 0.5 * smooth(this.lookHold);
  }

  private updateEdge(dt: number) {
    this.et += dt;
    const { input, ui, audio } = this;
    const pl = this.player;
    pl.vx *= 0.8;
    pl.vy *= 0.8;
    pl.x += (trailCx(CLIFF_Y + 40) - pl.x) * 0.02;
    pl.y += (CLIFF_Y + 28 - pl.y) * 0.04;
    pl.lookX = 0;
    pl.lookY = this.et > 0.8 ? 1 : 0;
    pl.squash = 1 + 0.025 * Math.sin(this.time * 3);
    pl.blink = 0;

    const baseCam = CLIFF_Y + 28 - 0.62 * H;
    const look = smooth(this.lookHold);
    this.camY += (baseCam - 120 * look - this.camY) * (1 - Math.exp(-3.5 * dt));

    this.edgeFlakeT -= dt;
    if (this.edgeFlakeT <= 0) {
      this.edgeFlakeT = 0.12;
      const x = 20 + Math.random() * 176;
      this.parts.push({ x, y: this.world.cliffAt(x) + 1, vx: (Math.random() - 0.5) * 6, vy: -10 - Math.random() * 10, life: 2.2, max: 2.2, col: Math.random() < 0.5 ? '#2a7a52' : '#1b5659', g: -2, size: 1 });
    }
    this.fire('edge-eyes', this.et >= 2.2, () => audio.sting());
    this.fire('edge-hint', this.et >= 5.0, () => {
      ui.hint('hold to look up');
      input.setAction('hold');
    });
    if (this.et >= 5.0) {
      const auto = this.et >= 10.0;
      if (input.actionDown || auto) this.lookHold = Math.min(1, this.lookHold + dt / 1.5);
      else this.lookHold = Math.max(0, this.lookHold - dt * 0.35);
    }
    if (this.lookHold >= 1) {
      ui.hint(null);
      input.setAction(null);
      this.mode = 'crack';
      this.ct = 0;
      this.makeCracks();
      ui.flash(1, 1100);
      audio.slam();
      audio.silence(0.02);
      audio.highTone(2.4);
      this.shake(14);
    }
  }

  private makeCracks() {
    const r = rng(4242);
    this.cracks = [];
    this.crackLen = 0;
    const ox = 108;
    const oy = 214;
    for (let i = 0; i < 11; i++) {
      let a = (i / 11) * TAU + (r() - 0.5) * 0.4;
      let x = ox;
      let y = oy;
      const pts = [{ x, y }];
      const n = 7 + Math.floor(r() * 6);
      for (let j = 0; j < n; j++) {
        a += (r() - 0.5) * 0.7;
        const l = 9 + r() * 12;
        x += Math.cos(a) * l;
        y += Math.sin(a) * l;
        pts.push({ x, y });
      }
      this.cracks.push(pts);
      this.crackLen = Math.max(this.crackLen, n);
    }
  }

  private updateCrack(dt: number) {
    this.ct += dt;
    if (this.ct >= 2.3) {
      this.mode = 'done';
      this.onBoom?.();
    }
  }

  /* ---------------------------------------------------------------- */
  /* drawing                                                           */
  /* ---------------------------------------------------------------- */

  drawShadow(sx: number, sy: number, R: number, u: number) {
    const p = this.p;
    const r = R * easeOutCubic(clamp(u, 0, 1));
    const rx = r;
    const ry = r * 0.72;
    if (rx < 2) return;
    p.dither(sx, sy, rx, ry, C.ink, 0.5 + 0.45 * u);
    p.dither(sx, sy, rx * 0.72, ry * 0.72, C.ink, 0.55);
    if (this.features.teeth) {
      const n = 18;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const ex = sx + Math.cos(a) * rx;
        const ey = sy + Math.sin(a) * ry;
        const tx = sx + Math.cos(a) * (rx + 6 + (k % 2) * 3);
        const ty = sy + Math.sin(a) * (ry + 4 + (k % 2) * 2);
        p.line(ex, ey, tx, ty, C.ink, 2);
        p.px(tx, ty, C.boneShade);
      }
    }
    if (this.features.limbs) {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + 0.3;
        const ex = sx + Math.cos(a) * rx;
        const ey = sy + Math.sin(a) * ry;
        const mx = sx + Math.cos(a + 0.18) * (rx + 7);
        const my = sy + Math.sin(a + 0.18) * (ry + 5);
        const fx = sx + Math.cos(a - 0.05) * (rx + 13);
        const fy = sy + Math.sin(a - 0.05) * (ry + 9);
        p.line(ex, ey, mx, my, C.ink, 2);
        p.line(mx, my, fx, fy, C.ink, 1);
      }
    }
    if (this.features.eyes) for (let k = 0; k < 5; k++) p.px(sx - rx * 0.5 + k * rx * 0.25, sy + Math.sin(k * 2) * ry * 0.4, C.red);
    if (this.features.cyan) for (let k = 0; k < 6; k++) p.px(sx - rx * 0.6 + k * rx * 0.24, sy + Math.cos(k * 3) * ry * 0.5, C.cyanEye);
    const hot = u > 0.82 && Math.floor(this.time * 10) % 2 === 0;
    const rim = u < 0.5 ? C.redDark : hot ? C.redGlow : C.red;
    p.ring(sx, sy, rx, ry, u > 0.75 ? 2 : 1, rim);
    if (u > 0.4) p.ring(sx, sy, rx * 0.62, ry * 0.62, 1, C.redDark);
  }

  private drawSlams(cam: number) {
    const p = this.p;
    for (const s of this.slams) {
      const sx = s.x;
      const sy = s.y - cam;
      if (s.phase === 'tele') {
        this.drawShadow(sx, sy, s.R, s.t / s.T);
      } else if (s.phase === 'hit') {
        const u = s.ph / 0.32;
        p.ellipse(sx, sy, s.R, s.R * 0.72, u < 0.25 ? C.white : C.ink);
        p.ring(sx, sy, s.R * (1 + u * 0.7), s.R * 0.72 * (1 + u * 0.7), 2, u < 0.5 ? C.redGlow : C.red);
        for (let k = 0; k < 5; k++) {
          const a = (k - 2) * 0.55 - Math.PI / 2;
          p.ellipse(sx + Math.cos(a) * s.R * 0.62, sy + Math.sin(a) * s.R * 0.45 - 4, 5, 4, C.ink);
        }
      } else {
        const a = 1 - s.ph / 1.3;
        p.alpha(a);
        p.ellipse(sx, sy, s.R * 0.95, s.R * 0.68, C.ink);
        p.alpha(1);
        p.ring(sx, sy, s.R * 0.95, s.R * 0.68, 1, '#16303a');
      }
    }
  }

  render(): HTMLCanvasElement {
    const p = this.p;
    const w = this.world;
    const sh = this.shakeV > 0.2 ? Math.round((Math.random() - 0.5) * this.shakeV) : 0;
    const shy = this.shakeV > 0.2 ? Math.round((Math.random() - 0.5) * this.shakeV) : 0;
    const cam = Math.round(this.camY) + shy;
    void sh;
    const opening = this.mode === 'opening';
    const t = this.time;
    p.alpha(1);
    p.clear('#0b1a24');
    w.drawGround(p, cam, cam < CLIFF_Y + 20);

    const ot = this.previewMode ? 2.6 : this.ot;
    const shadowU = opening ? smooth(unlerp(OP.shadow, OP.slam, ot)) : 0;
    const glow = opening ? (ot < OP.slam ? 1 - smooth(unlerp(7.2, 11, ot)) : 0) : 0.0;
    const closed = opening ? (ot < OP.slam ? smooth(unlerp(8.2, 10.5, ot)) : 1) : 1;
    if (this.camY < 100 && (opening || this.cp.y > -60)) w.drawGlowPatch(p, CLEARING.x, CLEARING.y + 6, cam, opening ? glow : 0, 62, 44);
    w.drawPatches(p, cam, t);
    w.drawDecals(p, cam);
    w.drawFlowers(p, cam, t, opening ? closed : 0, opening ? glow : 1);
    if (opening) drawMoon(p, 176, 36, 13);

    if (opening && ot >= OP.shadow && ot < OP.slam) {
      const cy = lerp(-120, 2, smooth(shadowU)) - cam;
      this.drawShadow(CLEARING.x, cy, 64, shadowU * 0.98 + 0.02);
    }
    if (opening && ot >= OP.slam && ot < OP.slam + 0.4) {
      const u = (ot - OP.slam) / 0.4;
      p.ellipse(CLEARING.x, CLEARING.y - cam, 64, 46, u < 0.3 ? C.white : C.ink);
    }
    for (const e of this.encounters) e.ground?.(cam);
    this.drawSlams(cam);

    // --- y-sorted drawables
    const list: Drawable[] = [];
    for (const pr of w.visibleProps(cam)) {
      list.push({ y: pr.y, fn: () => p.blit(pr.img, pr.x - pr.img.width / 2, pr.y - cam - pr.img.height + 3) });
    }
    const dtree = w.deadTree;
    if (dtree.alive) list.push({ y: dtree.y, fn: () => p.blit(dtree.img, dtree.x - dtree.img.width / 2, dtree.y - cam - dtree.img.height + 3) });
    for (const e of this.encounters) e.push?.(list, cam);
    if (opening) this.pushOpeningActors(list, cam);
    else if (!this.player.hide) {
      const pl = this.player;
      list.push({
        y: pl.y,
        fn: () => {
          this.drawGlowUnder(pl.x, pl.y - cam);
          drawBlob(p, pl.x, pl.y - cam, { squash: pl.squash, lookX: pl.lookX, lookY: pl.lookY, blink: pl.blink });
        },
      });
    }
    if (this.moth.has && !opening) {
      const m = this.moth;
      list.push({ y: this.player.y + 40, fn: () => drawMoth(p, m.x, m.y - cam, t, 1) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.fn();
    for (const e of this.encounters) e.overlay?.(cam);

    if (opening) this.drawLurkersAndEyes(cam);
    if (this.mode === 'edge' || this.mode === 'crack' || this.mode === 'done') {
      w.drawStars(p, cam, t, this.et, 6);
      this.drawClaws(cam);
    }
    drawParticles(p, this.parts, cam);

    // atmosphere
    if (opening && ot < OP.slam) {
      const d = smooth(unlerp(7, 12.5, ot));
      if (d > 0.02) this.drawDark(d * 0.55);
    }
    p.blit(w.frame, 0, 0);
    p.blit(w.vignette, 0, 0);
    if (this.mode === 'play' && this.slams.some((s) => s.phase === 'tele')) {
      const s = this.slams.find((q) => q.phase === 'tele')!;
      const u = s.t / s.T;
      if (u > 0.6) this.drawDark((u - 0.6) * 0.5);
    }
    if (opening && ot < 1.6) this.drawDark(1 - ot / 1.6);
    if (this.mode === 'crack') this.drawCracks();
    if (this.glitchT > 0) this.applyGlitch();
    return p.canvas;
  }

  /** The teaser: X's claw grazes you and the forest briefly bursts into cubes. */
  private applyGlitch() {
    const p = this.p;
    const age = GLITCH - this.glitchT;
    const u = clamp(this.glitchT / GLITCH, 0, 1);
    // the claw streak
    if (age < 0.45) {
      const k = age / 0.45;
      const x1 = lerp(W + 14, -14, k);
      const y1 = lerp(-14, H * 0.8, k);
      p.line(W + 14, -14, x1, y1, '#0e0818', 9);
      p.line(W + 12, -14, x1 + 3, y1, C.red, 1);
      p.line(W + 16, -14, x1 - 3, y1, C.redGlow, 1);
    }
    const ctx = p.ctx;
    const tctx = this.tmp.getContext('2d')!;
    tctx.drawImage(p.canvas, 0, 0);
    const strength = clamp(age * 3, 0, 1) * clamp(u * 1.8, 0, 1);
    const step = Math.floor(age * 16);
    for (let y = 0; y < H; y += 8) {
      if (hash2(y / 8, step) > 0.55) {
        const off = Math.round((hash2(y, step + 3) - 0.5) * 46 * strength);
        ctx.drawImage(this.tmp, 0, y, W, 8, off, y, W, 8);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 * strength;
    ctx.drawImage(this.tmp, 3, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // cubes bursting out
    const cols = [C.teal, C.tealMid, C.purple, C.purpleMid, C.blob, C.moon];
    for (let i = 0; i < 54; i++) {
      const hx = hash2(i, 11);
      const hy = hash2(i, 12);
      const sp = 20 + hash2(i, 13) * 90;
      const ang = hash2(i, 14) * TAU;
      const x = W / 2 + (hx - 0.5) * W * 0.9 + Math.cos(ang) * sp * age * 1.4;
      const y = H * 0.45 + (hy - 0.5) * H * 0.8 + Math.sin(ang) * sp * age * 1.4 + age * age * 60;
      const s = 4 + Math.floor(hash2(i, 15) * 6);
      p.alpha(clamp(u * 2.2, 0, 1));
      p.rect(x, y, s, s, cols[i % cols.length]!);
      p.rect(x, y, s, 1, C.white);
      p.rect(x, y, 1, s, '#9ff4ee');
      p.rect(x + s - 1, y + 1, 1, s - 1, C.ink);
    }
    p.alpha(1);
  }

  private drawDark(a: number) {
    const i = clamp(Math.round(a * 5) - 1, 0, 4);
    if (a < 0.08) return;
    this.p.blit(this.dark[i]!, 0, 0);
  }

  private drawGlowUnder(x: number, sy: number) {
    const p = this.p;
    p.dither(x, sy - 1, 18, 8, C.moss, 0.22);
    p.dither(x, sy - 1, 11, 5, C.mossLight, 0.22);
  }

  private pushOpeningActors(list: Drawable[], cam: number) {
    const p = this.p;
    const t = this.time;
    const ot = this.ot;
    const pl = this.player;
    const slammed = ot >= OP.slam;
    const lookUp = ot > 2.2 && ot < OP.cap1 + 0.2;
    const alarm = ot > OP.shadow + 0.5 && !slammed;
    const br = (k: number) => 1 + 0.04 * Math.sin(t * 2 + k);
    let kx = 108;
    let ky = 20;
    if (ot >= OP.shove) {
      const u = smooth(unlerp(OP.shove, OP.slam - 0.4, ot));
      kx = lerp(108, 66, u);
      ky = lerp(20, 74, u);
    }
    if (slammed) {
      kx = 66;
      ky = 74;
    }
    pl.x = kx;
    pl.y = ky;
    const squash = slammed && ot < OP.slam + 0.6 ? 0.7 + 0.3 * smooth((ot - OP.slam) / 0.6) : br(0);
    list.push({
      y: ky,
      fn: () => drawBlob(p, kx, ky - cam, { squash, lookX: alarm ? -0.4 : 0, lookY: lookUp || alarm ? -1 : 0.3, blink: hash2(Math.floor(t * 4), 9) > 0.94 ? 1 : 0 }),
    });
    if (!slammed) {
      const nudge = ot > OP.nudge && ot < OP.nudge + 0.7 ? Math.sin(((ot - OP.nudge) / 0.7) * Math.PI) * 5 : 0;
      list.push({ y: 4, fn: () => drawBlob(p, 90 + nudge, 4 - cam, { s: 1.5, squash: br(1), lookY: alarm ? -1 : 0.4, lookX: 0.3 }) });
      const lean = ot > OP.shove && ot < OP.shove + 0.8 ? -Math.sin(((ot - OP.shove) / 0.8) * Math.PI) * 4 : 0;
      list.push({ y: 6, fn: () => drawBlob(p, 127 + lean, 6 - cam, { s: 1.62, squash: br(2), lookY: alarm ? -1 : 0.4, lookX: -0.3 }) });
    } else {
      const a = clamp(1 - this.smudge / 3.6, 0, 1);
      if (a > 0) {
        p.alpha(a);
        p.ellipse(90, 4 - cam, 11, 2.2, C.blob);
        p.ellipse(127, 6 - cam, 12, 2.4, C.blobShade);
        p.alpha(1);
      }
    }
  }

  private drawLurkersAndEyes(cam: number) {
    const p = this.p;
    const ot = this.ot;
    const t = this.time;
    if (ot >= OP.lurk) {
      const a = clamp((ot - OP.lurk) / 1.2, 0, 1);
      p.alpha(a);
      drawLurker(p, 'maw', 30, -24 - cam, t);
      drawLurker(p, 'bell', 188, 6 - cam, t);
      drawLurker(p, 'bones', 24, 92 - cam, t);
      drawLurker(p, 'gloom', 186, 120 - cam, t);
      p.alpha(1);
    }
    if (ot >= OP.eyes) {
      const o = clamp((ot - OP.eyes) / 1.4, 0, 1);
      const blink = hash2(Math.floor(t * 3), 4) > 0.92 ? 0.2 : 1;
      drawRedEyes(p, 16, 40 - cam, o * blink, 0.6);
      drawRedEyes(p, 200, 76 - cam, o * blink, -0.6);
      drawRedEyes(p, 196, -52 - cam, o * (1 - 0.8 * (blink < 1 ? 1 : 0)), -0.6);
      drawRedEyes(p, 14, -70 - cam, o * blink, 0.6);
      drawGlint(p, 60, -120 - cam, C.cyanEye);
    }
  }

  private drawClaws(cam: number) {
    const p = this.p;
    void cam;
    if (this.et < 3.4 && this.mode === 'edge') return;
    const u = this.mode === 'edge' ? this.clawU() : 1;
    const tip = lerp(-30, 250, easeOutCubic(u));
    const xs = [54, 108, 162];
    xs.forEach((cx, i) => {
      const w = i === 1 ? 17 : 14;
      const t0 = tip - i * 8;
      for (let y = 0; y < t0; y++) {
        const f = 1 - y / Math.max(1, t0);
        const hw = Math.max(0.5, w * Math.pow(f, 0.55));
        const off = Math.sin(y / 38 + i) * 3;
        p.rect(cx + off - hw, y, hw * 2, 1, '#0e0818');
        if (hw > 1.5) {
          p.px(cx + off - hw, y, '#3a2a5a');
          p.px(cx + off + hw - 1, y, '#241a3c');
        }
      }
      p.dither(cx, t0, 12, 7, C.redDark, 0.45);
      p.px(cx, t0 - 1, C.red);
      p.px(cx, t0, C.redGlow);
    });
  }

  private drawCracks() {
    const p = this.p;
    const u = clamp(this.ct / 0.9, 0, 1);
    const maxSeg = this.crackLen * u;
    for (const pts of this.cracks) {
      for (let j = 1; j < pts.length; j++) {
        const segU = clamp(maxSeg - (j - 1), 0, 1);
        if (segU <= 0) break;
        const a = pts[j - 1]!;
        const b = pts[j]!;
        const ex = lerp(a.x, b.x, segU);
        const ey = lerp(a.y, b.y, segU);
        p.line(a.x + 1, a.y + 1, ex + 1, ey + 1, C.ink, 1);
        p.line(a.x, a.y, ex, ey, C.moonCore, 1);
      }
    }
  }
}

void dist;
void SEC;
