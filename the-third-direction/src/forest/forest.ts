import { D } from '../core/difficulty';
import { Pix, W, H } from '../core/pix';
import { C } from '../core/palette';
import { clamp, easeOutCubic, hash2, lerp, rng, smooth, TAU, unlerp } from '../core/util';
import { burst, drawBlob, drawGlint, drawLurker, drawMoon, drawParticles, drawRedEyes, updateParticles, type Particle } from '../core/art';
import { drawMoth } from '../core/art2';
import type { Ctx } from '../ctx';
import { CLIFF_Y, HUB, Land, PLATEAU, START, WORLD_H, WORLD_W, ZONES, type ZoneId } from './land';
import { drawBeacon } from './art3';
import type { Drawable, Features, Hub, Patch, Player, Rect, Slam, Zone } from './types';
import { makeZones } from './zones';

type Mode = 'opening' | 'play' | 'consume' | 'edge' | 'crack' | 'done';

const OP = { nudge: 3.2, cap1: 3.4, shadow: 7.0, shove: 10.4, slam: 13.0, ring: 15.8, lurk: 17.6, eyes: 20.6, hint: 22.4, end: 23.8 };
const SPEED = 66;
const GLITCH = 2.3;
/** The opening is drawn in "local" coordinates where the family clearing is at (108, 0). */
const OX = START.x - 108;
const OY = START.y;
const LOCAL_CAM = -190;
const PULSE_R = 36;
const ENTRIES = [...ZONES.map((z) => z.entry), { x: 418, y: 812 }, { x: 858, y: 812 }, { x: 1034, y: 1500 }, { x: HUB.x, y: HUB.y }];
const ZONE_COLOR: Record<ZoneId, string> = { gloom: C.cyanEye, thicket: '#e0a060', marsh: '#c9b6ff', bones: C.bone, meadow: C.flowerLight };
const FEATURE: Record<ZoneId, keyof Features | null> = { gloom: 'cyan', thicket: 'teeth', marsh: 'eyes', bones: 'limbs', meadow: null };

export class Forest implements Hub {
  readonly p = new Pix();
  readonly land = new Land(this.p.ctx);
  readonly audio;
  readonly ui;
  readonly input;
  mode: Mode = 'opening';
  time = 0;
  camX = OX;
  camY = OY + LOCAL_CAM;
  private ot = 0;
  private et = 0;
  private ct = 0;
  private shakeV = 0;
  player: Player = this.newPlayer();
  slams: Slam[] = [];
  parts: Particle[] = [];
  features: Features = { teeth: false, eyes: false, limbs: false, cyan: false };
  patches: Patch[] = [];
  moth = { has: false, x: 0, y: 0 };
  pulses: { x: number; y: number; t: number }[] = [];
  readonly zones: Zone[];
  private fired = new Set<string>();
  private cp = { x: 598, y: OY + 74 };
  private lookHold = 0;
  private cracks: { x: number; y: number }[][] = [];
  private crackLen = 0;
  private dark: HTMLCanvasElement[] = [];
  private smudge = 0;
  private edgeFlakeT = 0;
  private mothDust = 0;
  private glitchT = 0;
  private glitchFlash = false;
  private teased = false;
  private pulseHinted = false;
  private tmp: HTMLCanvasElement;
  private holdReq: string | null = null;
  private healT = 0;
  private secrets = 0;
  private consumeT = 0;
  private consuming: Zone | null = null;
  private sealOpen = false;
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
    // flowers around the family clearing
    const r = rng(2025);
    for (let k = 0; k < 20; k++) {
      const a = r() * 6.28;
      const d = 34 + r() * 52;
      this.land.flowers.push({ x: START.x + Math.cos(a) * d * 1.25, y: START.y + Math.sin(a) * d * 0.8, ph: r() * 6.28 });
    }
    this.land.flowers.sort((a, b) => a.y - b.y);
    this.zones = makeZones(this);
    this.buildDark();
  }

  private newPlayer(): Player {
    return { x: 66 + OX, y: 74 + OY, vx: 0, vy: 0, lookX: 0, lookY: 0, squash: 1, dead: 0, blink: 0, hide: false, speedMul: 1, hearts: 3, maxHearts: 3, invuln: 0, pulseCd: 0, calm: 0 };
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
  /* Hub interface (what zones can do)                                 */
  /* ---------------------------------------------------------------- */

  spawnSlam(x: number, y: number, R: number, T: number, tree = false) {
    this.slams.push({ x, y, R, T: T * D.tele, t: 0, phase: 'tele', ph: 0, tree });
    this.audio.rumble();
  }

  inEllipse(px: number, py: number, s: Slam, k: number) {
    const dx = (px - s.x) / (s.R * k);
    const dy = (py - s.y) / (s.R * 0.72 * k);
    return dx * dx + dy * dy < 1;
  }

  get maxHearts() {
    return D.hearts + Math.min(3, this.ctx.stats.bonus);
  }

  hurt(fromX: number, fromY: number, dmg = 1) {
    const pl = this.player;
    if (pl.dead > 0 || pl.invuln > 0 || this.mode === 'opening' || this.mode === 'consume') return;
    pl.hearts -= dmg;
    pl.calm = 0;
    this.ui.hearts(Math.max(0, pl.hearts), pl.maxHearts);
    this.audio.hurt();
    this.ui.red(0.4, 300);
    this.shake(5);
    burst(this.parts, pl.x, pl.y - 6, 8, [C.blob, C.blobLight, C.red], 40, 1);
    if (pl.hearts <= 0) {
      this.killPlayer();
      return;
    }
    pl.invuln = 1.3;
    const dx = pl.x - fromX;
    const dy = pl.y - fromY;
    const l = Math.hypot(dx, dy) || 1;
    pl.vx = (dx / l) * 150;
    pl.vy = (dy / l) * 150;
  }

  killPlayer() {
    const pl = this.player;
    if (pl.dead > 0 || this.mode === 'opening') return;
    pl.dead = 1.0;
    pl.hearts = 0;
    this.ui.hearts(0, pl.maxHearts);
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

  checkpoint(x: number, y: number) {
    this.cp = { x, y };
  }

  canStand(x: number, y: number, r = 4): boolean {
    if (!this.land.canStand(x, y, r)) return false;
    for (const z of this.zones) {
      const rs = z.colliders?.();
      if (!rs) continue;
      for (const c of rs) if (x + r > c.x0 && x - r < c.x1 && y + 2 > c.y0 && y - 2 < c.y1) return false;
    }
    if (!this.sealOpen && x + r > 640 - 36 && x - r < 640 + 36 && y > 690 && y < 706) return false;
    return true;
  }

  inPatch(x: number, y: number, k = 0.92): Patch | null {
    for (const p of this.patches) {
      const dx = (x - p.x) / (p.rx * k);
      const dy = (y - p.y) / (p.ry * k);
      if (dx * dx + dy * dy < 1) return p;
    }
    return null;
  }

  requestHold(label: string) {
    this.holdReq = label;
  }

  secret(x: number, y: number) {
    this.secrets++;
    this.ctx.stats.bonus = Math.min(3, this.secrets);
    this.audio.warm();
    burst(this.parts, x, y - 8, 24, [C.red, C.blush, C.blobLight], 50, 1, 30);
    this.player.maxHearts = this.maxHearts;
    this.player.hearts = Math.min(this.player.maxHearts, this.player.hearts + 1);
    this.ui.hearts(this.player.hearts, this.player.maxHearts);
  }

  /** A zone's heart was reached: X's shadow comes down on everything in the zone. */
  reachHeart(z: Zone) {
    if (z.cleared || this.mode !== 'play') return;
    this.mode = 'consume';
    this.consuming = z;
    this.consumeT = 0;
    this.input.setAction(null);
    this.input.setMoveEnabled(false);
    this.ui.hint(null);
    this.audio.rumble();
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
    this.pulses = [];
    this.patches = [];
    this.glitchT = 0;
    this.teased = false;
    this.pulseHinted = false;
    this.secrets = 0;
    this.ctx.stats.bonus = 0;
    this.sealOpen = false;
    this.land.decals.length = 0;
    this.features = { teeth: false, eyes: false, limbs: false, cyan: false };
    this.moth = { has: false, x: 0, y: 0 };
    this.zones.forEach((z) => z.reset());
    this.player = this.newPlayer();
    this.player.maxHearts = this.maxHearts;
    this.player.hearts = this.player.maxHearts;
    this.cp = { x: 66 + OX, y: 74 + OY };
    this.camX = OX;
    this.camY = OY + LOCAL_CAM;
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
    this.ui.hearts(null);
    this.ui.skip(true, () => this.skipOpening());
    if (skipOpening) this.skipOpening();
  }

  skipOpening() {
    if (this.mode !== 'opening') return;
    this.ot = OP.end;
    this.fired = new Set(['cap1', 'shadow', 'cap2', 'slam', 'quiet', 'lurk', 'eyes', 'hint']);
    this.land.decals.length = 0;
    this.land.addDecal(START.x, START.y, 62, 45, 1);
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
    const pl = this.player;
    pl.x = 66 + OX;
    pl.y = 74 + OY;
    pl.hide = false;
    pl.maxHearts = this.maxHearts;
    pl.hearts = pl.maxHearts;
    this.ui.hearts(pl.hearts, pl.maxHearts);
    this.onSection?.('run');
  }

  /** Jump to a place (debug / showcase). Zones before it count as done. */
  warp(name: string) {
    if (this.mode === 'opening') this.skipOpening();
    const order: ZoneId[] = ['gloom', 'thicket', 'marsh', 'bones', 'meadow'];
    const pl = this.player;
    if (name === 'edge') {
      this.zones.forEach((z) => z.complete());
      this.openSeal(true);
      pl.x = PLATEAU.x;
      pl.y = CLIFF_Y + 90;
    } else if (name === 'hub') {
      pl.x = HUB.x;
      pl.y = HUB.y;
    } else {
      const z = ZONES.find((q) => q.id === name);
      if (!z) return;
      pl.x = z.entry.x;
      pl.y = z.entry.y;
    }
    void order;
    pl.vx = pl.vy = 0;
    this.slams = [];
    this.cp = { x: pl.x, y: pl.y };
    this.snapCamera();
  }

  /** Showcase: freeze the moment the claws hit and the screen cracks, ready for the boom. */
  prepareShowcase() {
    this.warp('edge');
    this.moth = { has: true, x: PLATEAU.x + 12, y: CLIFF_Y + 8 };
    this.mode = 'crack';
    this.et = 12;
    this.lookHold = 1;
    this.ct = 1.4;
    this.makeCracks();
    this.player.x = PLATEAU.x;
    this.player.y = CLIFF_Y + 28;
    this.player.lookY = 1;
    this.camX = PLATEAU.x - 108;
    this.camY = CLIFF_Y + 28 - 0.62 * H - 120;
    this.slams = [];
    this.ui.hint(null);
    this.ui.hearts(null);
    this.input.setAction(null);
  }

  private snapCamera() {
    const pl = this.player;
    this.camX = clamp(pl.x - W / 2, 0, WORLD_W - W);
    this.camY = clamp(pl.y - 0.58 * H, 0, WORLD_H - H);
  }

  private openSeal(instant = false) {
    if (this.sealOpen) return;
    this.sealOpen = true;
    if (!instant) {
      this.audio.warm();
      this.shake(6);
      burst(this.parts, 640, 700, 40, [C.red, C.redDark, C.moss], 70, 1);
    }
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
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      this.pulses[i]!.t += dt;
      if (this.pulses[i]!.t > 0.45) this.pulses.splice(i, 1);
    }
    if (this.mode === 'opening') this.updateOpening(dt);
    else if (this.mode === 'play') this.updatePlay(dt);
    else if (this.mode === 'consume') this.updateConsume(dt);
    else if (this.mode === 'edge') this.updateEdge(dt);
    else if (this.mode === 'crack') this.updateCrack(dt);
    if (this.mode === 'play' || this.mode === 'consume' || this.mode === 'edge' || this.mode === 'crack') this.updateMoth(dt);
    if (this.mode === 'play') {
      const s = this.slams.find((q) => q.phase === 'tele');
      const u = s ? s.t / s.T : 0;
      this.audio.setHeart(s ? 1.15 + u * 1.4 : 0.9, s ? 0.65 : 0.3);
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
      this.land.addDecal(START.x, START.y, 62, 45, 1);
      burst(this.parts, START.x, START.y - 6, 40, [C.ink, '#1a2a30', C.blobShade, C.soil], 70, 1);
    });
    this.fire('quiet', t >= OP.ring, () => audio.setWind(0.15, 3));
    this.fire('lurk', t >= OP.lurk, () => audio.bell(0.75));
    this.fire('eyes', t >= OP.eyes, () => audio.setHeart(1.35, 0.8));
    if (t >= OP.slam) this.smudge += dt;
    if (t >= OP.end) this.beginPlay();
    this.camX = OX;
    this.camY = OY + LOCAL_CAM;
  }

  private respawn() {
    const pl = this.player;
    pl.x = this.cp.x;
    pl.y = this.cp.y;
    pl.vx = pl.vy = 0;
    pl.dead = 0;
    pl.hide = false;
    pl.speedMul = 1;
    pl.maxHearts = this.maxHearts;
    pl.hearts = pl.maxHearts;
    pl.invuln = 1.2;
    pl.calm = 0;
    this.slams = [];
    this.ui.hearts(pl.hearts, pl.maxHearts);
    this.zones.forEach((z) => z.onRespawn());
    this.snapCamera();
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
          this.land.addDecal(s.x, s.y, s.R * 0.95, s.R * 0.68, 0.7);
          this.slams.splice(i, 1);
        }
      }
    }
  }

  private impact(s: Slam) {
    this.audio.slam();
    this.ui.flash(0.55, 320);
    this.shake(9);
    burst(this.parts, s.x, s.y, 26, [C.ink, '#16303a', '#2a7a6c', C.soil], 85, 1);
    const pl = this.player;
    if (!pl.hide && this.mode === 'play' && this.inEllipse(pl.x, pl.y, s, 0.9)) {
      // X is not a monster you fight: his slam is lethal (3 hearts on Gentle)
      pl.invuln = 0;
      this.hurt(s.x, s.y, D.id === 'gentle' ? 3 : 99);
    }
    this.zones.forEach((z) => z.onImpact?.(s));
  }

  /* ---------------------------------------------------------------- */
  /* playing                                                           */
  /* ---------------------------------------------------------------- */

  private castPulse() {
    const pl = this.player;
    pl.pulseCd = 0.55;
    this.pulses.push({ x: pl.x, y: pl.y - 4, t: 0 });
    this.audio.pulse();
    burst(this.parts, pl.x, pl.y - 6, 10, [C.blobLight, C.moonCore, C.mossGlow], 46, 0, 0);
    for (const z of this.zones) z.onPulse?.(pl.x, pl.y, PULSE_R);
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
    pl.invuln = Math.max(0, pl.invuln - dt);
    pl.pulseCd = Math.max(0, pl.pulseCd - dt);
    pl.calm += dt;

    // --- movement (free in every direction, stopped by trees, gates and blocks)
    const sp0 = SPEED * pl.speedMul;
    const k = 1 - Math.exp(-16 * dt);
    pl.vx += (input.moveX * sp0 - pl.vx) * k;
    pl.vy += (input.moveY * sp0 - pl.vy) * k;
    const nx = pl.x + pl.vx * dt;
    if (this.canStand(nx, pl.y)) pl.x = nx;
    else pl.vx = 0;
    const ny = pl.y + pl.vy * dt;
    if (this.canStand(pl.x, ny)) pl.y = ny;
    else pl.vy = 0;
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
    pl.speedMul = 1;

    // --- healing in the glowing flowers
    if (this.inPatch(pl.x, pl.y) && pl.hearts < pl.maxHearts) {
      this.healT += dt;
      if (this.healT > 2.4) {
        this.healT = 0;
        pl.hearts++;
        this.ui.hearts(pl.hearts, pl.maxHearts);
        this.audio.warm();
        burst(this.parts, pl.x, pl.y - 10, 12, [C.mossGlow, C.blobLight], 30, 1, -10);
      }
    } else this.healT = Math.max(0, this.healT - dt);

    // --- zones
    this.holdReq = null;
    for (const z of this.zones) {
      if (z.always || this.near(z)) z.update(dt);
      if (pl.dead > 0 || this.mode !== 'play') break;
    }
    this.updateSlams(dt);

    // --- the action button: pulse, unless a zone wants "hold"
    if (this.holdReq) input.setAction(this.holdReq);
    else {
      input.setAction('pulse');
      if (input.actionPressed && pl.pulseCd <= 0 && pl.dead <= 0) this.castPulse();
    }

    // --- camera
    const tx = clamp(pl.x - W / 2 + pl.lookX * 24, 0, WORLD_W - W);
    const ty = clamp(pl.y - 0.58 * H + pl.lookY * 30, 0, WORLD_H - H);
    const kc = 1 - Math.exp(-5 * dt);
    this.camX += (tx - this.camX) * kc;
    this.camY += (ty - this.camY) * kc;

    // --- the first time you step into a zone, a one-line reminder of what light does
    if (!this.pulseHinted) {
      for (const z of ZONES) {
        if (Math.hypot((pl.x - z.x) / z.rx, (pl.y - z.y) / z.ry) < 0.9) {
          this.pulseHinted = true;
          this.ui.hint('tap to pulse light');
          window.setTimeout(() => this.ui.hint(null), 4800);
          break;
        }
      }
    }

    // --- checkpoints where the roads meet the zones
    for (const e of ENTRIES) if (Math.abs(pl.x - e.x) < 34 && Math.abs(pl.y - e.y) < 34) this.checkpoint(e.x, e.y);

    // --- the seal on the road to the Edge opens when every zone is done
    if (!this.sealOpen && this.zones.every((z) => z.cleared)) this.openSeal();

    // --- the edge
    if (pl.y <= CLIFF_Y + 70 && this.mode === 'play') this.beginEdge();
  }

  private near(z: Zone): boolean {
    const d = ZONES.find((q) => q.id === z.id)!;
    const pl = this.player;
    return Math.abs(pl.x - d.x) < d.rx + 280 && Math.abs(pl.y - d.y) < d.ry + 330;
  }

  /** X's shadow comes down on a zone: its monsters are dragged in, and the shadow gains a feature. */
  private updateConsume(dt: number) {
    const z = this.consuming!;
    const d = ZONES.find((q) => q.id === z.id)!;
    this.consumeT += dt;
    const t = this.consumeT;
    const pl = this.player;
    pl.vx *= 0.8;
    pl.vy *= 0.8;
    this.updateSlams(dt);
    this.fire(`c-${z.id}-1`, t >= 0.5, () => {
      if (z.id === 'meadow') {
        // a shadow cannot swallow light: it flinches and shrinks away
        this.ui.flash(0.5, 700);
        this.audio.warm();
        burst(this.parts, d.x, d.y - 10, 40, [C.moonCore, C.moon, C.flowerLight], 60, 1, 10);
        return;
      }
      this.spawnSlam(d.x - 40, d.y - 10, 62, 1.1);
      this.spawnSlam(d.x + 40, d.y + 20, 62, 1.1);
    });
    this.fire(`c-${z.id}-2`, t >= 1.9, () => {
      z.complete();
      const f = FEATURE[z.id];
      if (f) this.features[f] = true;
      this.ui.flash(0.5, 400);
      this.shake(10);
    });
    if (t >= 3.2) {
      this.mode = 'play';
      this.consuming = null;
      this.input.setMoveEnabled(true);
      pl.invuln = 1;
      this.checkpoint(pl.x, pl.y);
      // the first time a zone falls, X's claw grazes you and the forest glitches into cubes
      if (!this.teased && this.zones.filter((q) => q.cleared).length === 1) {
        this.teased = true;
        this.glitchT = GLITCH;
        this.glitchFlash = false;
        this.audio.slam();
        this.audio.sting();
        this.ui.flash(0.8, 320);
        this.shake(10);
      }
    }
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
    // near the end of the world the dust shows the invisible edge
    if (pl.y < CLIFF_Y + 260 && Math.random() < dt * 14) {
      const x = this.camX + 20 + Math.random() * 176;
      this.parts.push({ x, y: this.land.cliffAt(x) + 2, vx: (Math.random() - 0.5) * 4, vy: -6 - Math.random() * 6, life: 1.6, max: 1.6, col: C.moon, g: 0, size: 1 });
    }
  }

  /** Collider rectangles of every zone (for debugging and bots). */
  colliderRects(): Rect[] {
    const out: Rect[] = [];
    for (const z of this.zones) out.push(...(z.colliders?.() ?? []));
    return out;
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
    this.ui.hearts(null);
    this.input.setMoveEnabled(false);
    this.input.setAction(null);
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
    pl.x += (PLATEAU.x - pl.x) * 0.02;
    pl.y += (CLIFF_Y + 28 - pl.y) * 0.04;
    pl.lookX = 0;
    pl.lookY = this.et > 0.8 ? 1 : 0;
    pl.squash = 1 + 0.025 * Math.sin(this.time * 3);
    pl.blink = 0;

    const baseY = CLIFF_Y + 28 - 0.62 * H;
    const look = smooth(this.lookHold);
    this.camX += (PLATEAU.x - W / 2 - this.camX) * (1 - Math.exp(-3 * dt));
    this.camY += (baseY - 120 * look - this.camY) * (1 - Math.exp(-3.5 * dt));

    this.edgeFlakeT -= dt;
    if (this.edgeFlakeT <= 0) {
      this.edgeFlakeT = 0.12;
      const x = this.camX + 20 + Math.random() * 176;
      this.parts.push({ x, y: this.land.cliffAt(x) + 1, vx: (Math.random() - 0.5) * 6, vy: -10 - Math.random() * 10, life: 2.2, max: 2.2, col: Math.random() < 0.5 ? '#2a7a52' : '#1b5659', g: -2, size: 1 });
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

  private drawSlams() {
    const p = this.p;
    for (const s of this.slams) {
      const sx = s.x - this.camX;
      const sy = s.y - this.camY;
      if (sx < -90 || sx > W + 90 || sy < -70 || sy > H + 70) continue;
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

  /** Light pools: the patches, drawn under everything. */
  private drawPatches() {
    const p = this.p;
    const t = this.time;
    for (const pt of this.patches) {
      const sx = pt.x - this.camX;
      const sy = pt.y - this.camY;
      if (sy < -40 || sy > H + 40 || sx < -60 || sx > W + 60) continue;
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.6 + pt.x);
      p.dither(sx, sy, pt.rx * 1.12, pt.ry * 1.12, C.tealMid, 0.3 * pulse);
      p.dither(sx, sy, pt.rx * 0.85, pt.ry * 0.85, C.moss, 0.34 * pulse);
      p.dither(sx, sy, pt.rx * 0.55, pt.ry * 0.55, C.mossLight, 0.3 * pulse);
      p.dither(sx, sy, pt.rx * 0.3, pt.ry * 0.3, C.mossGlow, 0.22 * pulse);
    }
  }

  private drawPulses() {
    const p = this.p;
    for (const q of this.pulses) {
      const u = q.t / 0.45;
      const r = PULSE_R * easeOutCubic(u);
      const sx = q.x - this.camX;
      const sy = q.y - this.camY;
      p.alpha(1 - u * 0.8);
      p.ring(sx, sy, r, r * 0.72, 2, u < 0.35 ? C.moonCore : C.blobLight);
      p.alpha((1 - u) * 0.5);
      p.dither(sx, sy, r, r * 0.72, C.blobLight, 0.35);
      p.alpha(1);
    }
  }

  render(): HTMLCanvasElement {
    const p = this.p;
    const land = this.land;
    const sh = this.shakeV > 0.2 ? Math.round((Math.random() - 0.5) * this.shakeV) : 0;
    const shy = this.shakeV > 0.2 ? Math.round((Math.random() - 0.5) * this.shakeV) : 0;
    const camX = Math.round(this.camX) + sh;
    const camY = Math.round(this.camY) + shy;
    const cx0 = this.camX;
    const cy0 = this.camY;
    this.camX = camX;
    this.camY = camY;
    const opening = this.mode === 'opening';
    const t = this.time;
    p.alpha(1);
    p.clear('#07131b');
    land.drawGround(p, camX, camY);
    if (camY < CLIFF_Y + 120) land.drawVoid(p, camX, camY);

    const ot = this.previewMode ? 2.6 : this.ot;
    const shadowU = opening ? smooth(unlerp(OP.shadow, OP.slam, ot)) : 0;
    const glow = opening ? (ot < OP.slam ? 1 - smooth(unlerp(7.2, 11, ot)) : 0) : 0.0;
    const closed = opening ? (ot < OP.slam ? smooth(unlerp(8.2, 10.5, ot)) : 1) : 1;
    if (camY > 1000) land.drawGlowPatch(p, START.x, START.y + 6, camX, camY, opening ? glow : 0, 62, 44);
    this.drawPatches();
    land.drawDecals(p, camX, camY);
    land.drawFlowers(p, camX, camY, t, opening ? closed : 0, opening ? glow : 1);
    if (opening) drawMoon(p, 176, 36, 13);

    if (opening && ot >= OP.shadow && ot < OP.slam) {
      const cy = lerp(-120, 2, smooth(shadowU)) - LOCAL_CAM;
      this.drawShadow(108, cy, 64, shadowU * 0.98 + 0.02);
    }
    if (opening && ot >= OP.slam && ot < OP.slam + 0.4) {
      const u = (ot - OP.slam) / 0.4;
      p.ellipse(108, -LOCAL_CAM, 64, 46, u < 0.3 ? C.white : C.ink);
    }
    for (const z of this.zones) z.ground?.();
    this.drawSlams();

    // --- y-sorted drawables
    const list: Drawable[] = [];
    const pl0 = this.player;
    for (const pr of land.visibleProps(camX, camY)) {
      list.push({
        y: pr.y,
        fn: () => {
          // a tree in front of you turns see-through so you never lose the blob behind a canopy
          const cover = pr.kind === 'tree' && !opening && pr.y > pl0.y && pr.y - pl0.y < pr.img.height - 8 && Math.abs(pr.x - pl0.x) < pr.img.width * 0.5;
          if (cover) p.alpha(0.38);
          p.blit(pr.img, pr.x - camX - pr.img.width / 2, pr.y - camY - pr.img.height + 3);
          if (cover) p.alpha(1);
        },
      });
    }
    for (const z of this.zones) z.push?.(list);
    if (!opening) {
      for (const z of ZONES) {
        const bx = z.entry.x;
        const by = z.entry.y - 14;
        if (Math.abs(bx - camX - W / 2) < W / 2 + 40 && Math.abs(by - camY - H / 2) < H / 2 + 40) {
          const done = this.zones.find((q) => q.id === z.id)!.cleared;
          list.push({ y: by, fn: () => drawBeacon(p, bx - camX, by - camY, t, ZONE_COLOR[z.id], done ? 0.35 : 1) });
        }
      }
    }
    if (opening) this.pushOpeningActors(list);
    else if (!this.player.hide) {
      const pl = this.player;
      const flick = pl.invuln > 0 && Math.floor(t * 16) % 2 === 0;
      if (!flick) {
        list.push({
          y: pl.y,
          fn: () => {
            this.drawGlowUnder(pl.x - camX, pl.y - camY);
            drawBlob(p, pl.x - camX, pl.y - camY, { squash: pl.squash, lookX: pl.lookX, lookY: pl.lookY, blink: pl.blink });
          },
        });
      }
    }
    if (this.moth.has && !opening) {
      const m = this.moth;
      list.push({ y: this.player.y + 40, fn: () => drawMoth(p, m.x - camX, m.y - camY, t, 1) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.fn();
    for (const z of this.zones) z.overlay?.();
    this.drawPulses();
    this.drawSeal();

    if (opening) this.drawLurkersAndEyes();
    if (this.mode === 'edge' || this.mode === 'crack' || this.mode === 'done') {
      land.drawStars(p, camY, t, this.et, 6);
      this.drawClaws();
    }
    drawParticles(p, this.parts, camX, camY);

    // atmosphere
    if (opening && ot < OP.slam) {
      const d = smooth(unlerp(7, 12.5, ot));
      if (d > 0.02) this.drawDark(d * 0.55);
    }
    p.blit(land.frame, 0, 0);
    p.blit(land.vignette, 0, 0);
    if (this.mode === 'play' && this.slams.some((s) => s.phase === 'tele')) {
      const s = this.slams.find((q) => q.phase === 'tele')!;
      const u = s.t / s.T;
      if (u > 0.6) this.drawDark((u - 0.6) * 0.5);
    }
    if (opening && ot < 1.6) this.drawDark(1 - ot / 1.6);
    if (this.mode === 'play' || this.mode === 'consume') {
      this.drawHud();
      if (this.mode === 'play') this.drawCompass();
    }
    if (this.mode === 'crack') this.drawCracks();
    if (this.glitchT > 0) this.applyGlitch();
    this.camX = cx0;
    this.camY = cy0;
    return p.canvas;
  }

  /** Five dots at the top: one for each zone you have finished, and a red one when the road to the Edge opens. */
  private drawHud() {
    const p = this.p;
    const cols: Record<ZoneId, string> = { gloom: C.cyanEye, thicket: '#c08a4a', marsh: '#c9b6ff', bones: C.bone, meadow: C.flowerLight };
    const order: ZoneId[] = ['gloom', 'thicket', 'marsh', 'bones', 'meadow'];
    const x0 = W / 2 - 22;
    order.forEach((id, i) => {
      const x = x0 + i * 11;
      const z = this.zones.find((q) => q.id === id)!;
      p.ring(x, 9, 3.5, 3.5, 1, z.cleared ? cols[id] : '#26404a');
      if (z.cleared) p.ellipse(x, 9, 2, 2, cols[id]);
    });
    if (this.sealOpen) {
      const blink = Math.floor(this.time * 3) % 2 === 0;
      p.ellipse(W / 2, 19, 2, 2, blink ? C.red : C.redDark);
    }
  }

  /** A small arrow beside the blob that points at the nearest zone you have not finished (or at the Edge), while you are out on the roads. */
  private drawCompass() {
    const pl = this.player;
    if (pl.dead > 0 || this.glitchT > 0) return;
    for (const z of ZONES) if (Math.hypot((pl.x - z.x) / z.rx, (pl.y - z.y) / z.ry) < 1.0) return;
    let tx = PLATEAU.x;
    let ty = 560;
    let col: string = C.red;
    let best = 1e9;
    for (const z of ZONES) {
      if (this.zones.find((q) => q.id === z.id)!.cleared) continue;
      const d = Math.hypot(pl.x - z.entry.x, pl.y - z.entry.y);
      if (d < best) {
        best = d;
        tx = z.entry.x;
        ty = z.entry.y;
        col = ZONE_COLOR[z.id];
      }
    }
    const d = Math.hypot(tx - pl.x, ty - pl.y);
    if (d < 130) return;
    const a = Math.atan2(ty - pl.y, tx - pl.x);
    const p = this.p;
    const sx = pl.x - this.camX + Math.cos(a) * 34;
    const sy = pl.y - this.camY - 8 + Math.sin(a) * 26;
    const hx = sx + Math.cos(a) * 8;
    const hy = sy + Math.sin(a) * 6;
    const segs: [number, number, number, number][] = [
      [sx, sy, hx, hy],
      [hx, hy, hx - Math.cos(a - 0.75) * 7, hy - Math.sin(a - 0.75) * 5.5],
      [hx, hy, hx - Math.cos(a + 0.75) * 7, hy - Math.sin(a + 0.75) * 5.5],
    ];
    p.alpha(0.8);
    for (const [x0, y0, x1, y1] of segs) p.line(x0, y0, x1, y1, C.ink, 4);
    p.alpha(0.7 + 0.3 * Math.sin(this.time * 4));
    for (const [x0, y0, x1, y1] of segs) p.line(x0, y0, x1, y1, col, 2);
    p.alpha(1);
  }

  /** The thorn seal across the road to the Edge. */
  private drawSeal() {
    if (this.sealOpen) return;
    const p = this.p;
    const sx = 640 - this.camX;
    const sy = 700 - this.camY;
    if (sy < -30 || sy > H + 30) return;
    for (let i = -4; i <= 4; i++) {
      const x = sx + i * 7;
      const h = 14 + ((i * 7) & 3) * 3 + 6;
      p.line(x, sy + 4, x + Math.sin(i) * 3, sy - h, '#0a0e18', 3);
      p.px(x + Math.sin(i) * 3, sy - h, C.red);
      p.px(x + 1 + Math.sin(i) * 3, sy - h + 2, C.redDark);
    }
    p.dither(sx, sy, 34, 8, C.redDark, 0.28 + 0.1 * Math.sin(this.time * 3));
  }

  /** The teaser: X's claw grazes you and the forest briefly bursts into cubes. */
  private applyGlitch() {
    const p = this.p;
    const age = GLITCH - this.glitchT;
    const u = clamp(this.glitchT / GLITCH, 0, 1);
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

  private pushOpeningActors(list: Drawable[]) {
    const p = this.p;
    const t = this.time;
    const ot = this.ot;
    const pl = this.player;
    const cam = LOCAL_CAM;
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
    pl.x = kx + OX;
    pl.y = ky + OY;
    const squash = slammed && ot < OP.slam + 0.6 ? 0.7 + 0.3 * smooth((ot - OP.slam) / 0.6) : br(0);
    list.push({
      y: ky + OY,
      fn: () => drawBlob(p, kx, ky - cam, { squash, lookX: alarm ? -0.4 : 0, lookY: lookUp || alarm ? -1 : 0.3, blink: hash2(Math.floor(t * 4), 9) > 0.94 ? 1 : 0 }),
    });
    if (!slammed) {
      const nudge = ot > OP.nudge && ot < OP.nudge + 0.7 ? Math.sin(((ot - OP.nudge) / 0.7) * Math.PI) * 5 : 0;
      list.push({ y: 4 + OY, fn: () => drawBlob(p, 90 + nudge, 4 - cam, { s: 1.5, squash: br(1), lookY: alarm ? -1 : 0.4, lookX: 0.3 }) });
      const lean = ot > OP.shove && ot < OP.shove + 0.8 ? -Math.sin(((ot - OP.shove) / 0.8) * Math.PI) * 4 : 0;
      list.push({ y: 6 + OY, fn: () => drawBlob(p, 127 + lean, 6 - cam, { s: 1.62, squash: br(2), lookY: alarm ? -1 : 0.4, lookX: -0.3 }) });
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

  private drawLurkersAndEyes() {
    const p = this.p;
    const cam = LOCAL_CAM;
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

  private drawClaws() {
    const p = this.p;
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
