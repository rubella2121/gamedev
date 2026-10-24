import { DashPool } from '../core/dash';
import { storageGet, storageSet } from '../sdk';
import { D } from '../core/difficulty';
import { Pix, W, H } from '../core/pix';
import { C } from '../core/palette';
import { clamp, easeOutCubic, hash2, lerp, rng, smooth, TAU, unlerp } from '../core/util';
import { playTimed, say, STORY } from '../core/story';
import { MothMood, MothShield } from '../core/mothbond';
import { Falls } from '../core/falls';
import { BOW, burst, drawBlob, drawGlint, drawLurker, drawMoon, drawParticles, drawRedEyes, updateParticles, type Particle } from '../core/art';
import { drawMoth } from '../core/art2';
import type { Ctx } from '../ctx';
import type { PortalView } from '../cinematic/portal';
import { arenaDef, CLIFF_Y, HUB, Land, PLATEAU, START, WORLD_H, WORLD_W, ZONES, type ArenaDef, type ZoneId } from './land';
import { drawBeacon } from './art3';
import type { Drawable, Features, Hub, Lance, Nova, Patch, Player, Rect, Slam, Zone } from './types';
import { makeZones } from './zones';

type Mode = 'opening' | 'play' | 'consume' | 'edge' | 'crack' | 'done' | 'xfight' | 'pinned' | 'rift' | 'dive';

const OP = { nudge: 3.2, cap1: 3.4, shadow: 7.0, shove: 10.4, slam: 13.0, ring: 15.8, lurk: 17.6, eyes: 20.6, hint: 22.4, end: 23.8 };
const SPEED = 66;
const GLITCH = 2.3;
/** The opening is drawn in "local" coordinates where the family clearing is at (108, 0). */
const OX = START.x - 108;
const OY = START.y;
const LOCAL_CAM = -190;
const PULSE_R = 36;
/** hold the button this long for a Lance, and this long (with a full meter) for a Nova */
const LANCE_T = 0.5;
const NOVA_T = 1.3;
const LANCE_SPEED = 300;
const NOVA_R = 84;
const BRIEF_KEY = 'tt.briefed';
const PULSE_HINT = 'tap to pulse light';
const DASH_T = 0.17;
const DASH_SPEED = 235;
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
  /** falls in the guardian fight you are in: Nightmare starts it over at four, the moth steps in at three in a phase otherwise */
  private falls = new Falls();
  /** the moth's shield (first hit of every fight) and its moods (resting on you, trembling, dim) */
  private shield = new MothShield();
  private mood = new MothMood();
  /** where the moth is pointing at the moment: a hidden thing it wants to show you */
  private mothGuide: { x: number; y: number } | null = null;
  private glitchT = 0;
  /** is a glimpse of the 3D world showing right now */
  get glimpsing() {
    return this.glitchT > 0;
  }
  private glitchFlash = false;
  private teased = false;
  /** the trailer still plays the old Edge (look up, the screen cracks); the game plays the fight and the portal */
  private oldEdge = false;
  /** the fight at the Edge: its clock, what is in the air, the rift you run into */
  private xf = {
    t: 0,
    stompT: 0,
    rakeT: 0,
    beamT: 0,
    eyes: 0,
    pinT: 0,
    riftT: 0,
    diveT: 0,
    rakes: [] as { y: number; dir: number; t: number; T: number; hx: number; hit: boolean }[],
    beams: [] as { x: number; t: number; T: number; eye: number; hit: boolean }[],
    rift: { x: 0, top: 0, bot: 0, open: 0, grow: 0 },
    foot: { x: 0, y: 0 },
  };
  /** which glimpse of the 3D world is showing through a tear (1..5: the guardians fallen so far), 0 for none */
  private glimpseI = 0;
  private pulseHinted = false;
  /** the "tap to pulse light" hint stays up until the first pulse */
  private pulseHintOn = false;
  /** the "move" hint stays up until the blob has gone somewhere */
  private moveHintFrom: { x: number; y: number; t: number } | null = null;
  private tmp: HTMLCanvasElement;
  private holdReq: string | null = null;
  private chargeStage: 0 | 1 | 2 = 0;
  private healT = 0;
  private secrets = 0;
  private consumeT = 0;
  private consuming: Zone | null = null;
  private sealOpen = false;
  arena: ArenaDef | null = null;
  /** dash charges (a dash is free of danger, so it is not free to repeat) */
  dashPool = new DashPool();
  lances: Lance[] = [];
  novas: Nova[] = [];
  /** where the guardian's body is, so the camera can keep it and the player both in view */
  camFocus: { x: number; y: number } | null = null;
  /** the trailer's own framing of a guardian's clearing: the camera looks at this point instead of at the player */
  private cineFocus: { x: number; y: number } | null = null;
  private fightZone: Zone | null = null;
  private trans: { kind: 'in' | 'out'; t: number; zone: Zone; won: boolean; done: boolean } | null = null;
  private returnPos = { x: 0, y: 0 };
  private slowT = 0;
  private slowScale = 1;
  private freezeT = 0;
  private powersHinted = false;
  private ghosts: { x: number; y: number; t: number }[] = [];
  private aim = { x: 0, y: -1 };
  previewMode = false;
  /** set by the game when the player pressed Play: the first-time card may show when the opening ends (never in the trailer, the showcase or the preview) */
  briefNext = false;
  /** the trailer is filming: no zone rings or compass arrow over the picture */
  cinema = false;
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
    return { x: 66 + OX, y: 74 + OY, vx: 0, vy: 0, lookX: 0, lookY: 0, squash: 1, dead: 0, blink: 0, hide: false, speedMul: 1, hearts: 3, maxHearts: 3, invuln: 0, pulseCd: 0, calm: 0, light: 0, dashT: 0, dashX: 0, dashY: 0, dashCd: 0 };
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
    return D.hearts + Math.min(3, this.ctx.stats.bonus) + (this.arena ? this.falls.extraHearts : 0);
  }

  /** a guardian's next phase began: the moth's help (if any) ends with the phase it was for */
  phaseBegan() {
    this.falls.newPhase();
    const pl = this.player;
    pl.maxHearts = this.maxHearts;
    pl.hearts = Math.min(pl.hearts, pl.maxHearts);
    this.ui.hearts(Math.max(0, pl.hearts), pl.maxHearts);
  }

  private showFalls() {
    const f = this.arena ? this.falls.shown : null;
    this.ui.falls(f ? f.n : null, f ? f.max : 4);
  }

  hurt(fromX: number, fromY: number, dmg = 1) {
    const pl = this.player;
    if (pl.dead > 0 || pl.invuln > 0 || this.mode === 'opening' || this.mode === 'consume') return;
    if (this.arena && this.moth.has && this.shield.absorb()) {
      this.mothTakesIt();
      return;
    }
    this.mood.hurt();
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

  /** The Blob is inside something solid (a tree, a root, a wall): move it to the nearest spot it can stand on. */
  private unstick() {
    const pl = this.player;
    for (let r = 2; r <= 40; r += 2) {
      const n = Math.max(8, Math.round(r * 1.5));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const x = pl.x + Math.cos(a) * r;
        const y = pl.y + Math.sin(a) * r * 0.8;
        if (this.canStand(x, y)) {
          pl.x = x;
          pl.y = y;
          return;
        }
      }
    }
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
    say(this.ui, STORY.secrets[Math.min(this.secrets, STORY.secrets.length) - 1]!);
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

  addLight(n: number) {
    const pl = this.player;
    const before = pl.light;
    pl.light = clamp(pl.light + n, 0, 3);
    this.ui.light(pl.light);
    if (before < 3 && pl.light >= 3) this.audio.chime();
  }

  heal(n = 1) {
    const pl = this.player;
    pl.hearts = Math.min(pl.maxHearts, pl.hearts + n);
    this.ui.hearts(pl.hearts, pl.maxHearts);
    this.audio.warm();
    burst(this.parts, pl.x, pl.y - 10, 12, [C.mossGlow, C.blobLight], 30, 1, -10);
  }

  slowmo(scale: number, secs: number) {
    this.slowScale = scale;
    this.slowT = secs;
  }

  /** Lock the player in place for a moment (a guardian's entrance). */
  holdPlayer(secs: number) {
    this.freezeT = Math.max(this.freezeT, secs);
  }

  /** A guardian's heart was touched: fade to black and wake it in its own clearing. */
  enterArena(z: Zone) {
    if (this.trans || this.arena || this.mode !== 'play') return;
    this.trans = { kind: 'in', t: 0, zone: z, won: false, done: false };
    const pl = this.player;
    this.returnPos = { x: pl.x, y: pl.y };
    this.input.setMoveEnabled(false);
    this.input.setAction(null);
    this.ui.hint(null);
    this.ui.fade(1, 700);
    this.audio.rumble();
    this.audio.sting();
    this.shake(8);
  }

  leaveArena(z: Zone, won: boolean) {
    if (!this.arena || this.trans) return;
    this.trans = { kind: 'out', t: 0, zone: z, won, done: false };
    this.input.setMoveEnabled(false);
    this.input.setAction(null);
    this.input.setCharge(0, 0);
    this.ui.fade(1, 900);
  }

  private updateTrans(dt: number) {
    const tr = this.trans!;
    tr.t += dt;
    const pl = this.player;
    pl.vx *= 0.8;
    pl.vy *= 0.8;
    if (tr.kind === 'in' && !tr.done && tr.t >= 0.85) {
      tr.done = true;
      const a = arenaDef(tr.zone.id);
      this.arena = a;
      this.fightZone = tr.zone;
      pl.x = a.entry.x;
      pl.y = a.entry.y;
      pl.vx = pl.vy = 0;
      pl.hearts = pl.maxHearts;
      pl.light = 0;
      pl.invuln = 0;
      pl.dashT = pl.dashCd = 0;
      this.dashPool.reset();
      this.aim = { x: 0, y: -1 };
      this.slams = [];
      this.lances = [];
      this.novas = [];
      this.parts = [];
      this.cp = { x: a.entry.x, y: a.entry.y };
      this.ui.hearts(pl.hearts, pl.maxHearts);
      this.ui.light(0);
      this.snapCamera();
      this.ui.fade(0, 800);
      this.input.setMoveEnabled(true);
      if (!this.powersHinted) {
        this.powersHinted = true;
        window.setTimeout(() => this.ui.hint('hold + let go: lance   double-tap: dash'), 5200);
        window.setTimeout(() => this.ui.hint(null), 11000);
      }
      tr.zone.onArrive?.();
      this.falls.reset();
      this.showFalls();
      if (this.moth.has) {
        this.shield.arm();
        this.fire('shield-armed', true, () => window.setTimeout(() => this.arena && say(this.ui, STORY.mothShield.armed), 4800));
      }
      this.trans = null;
    } else if (tr.kind === 'out' && !tr.done && tr.t >= 1.0) {
      tr.done = true;
      this.arena = null;
      this.fightZone = null;
      this.camFocus = null;
      this.lances = [];
      this.novas = [];
      this.ghosts = [];
      this.parts = [];
      pl.x = this.returnPos.x;
      pl.y = this.returnPos.y;
      pl.vx = pl.vy = 0;
      pl.dead = 0;
      pl.hide = false;
      pl.invuln = 0;
      pl.hearts = pl.maxHearts;
      this.cp = { x: pl.x, y: pl.y };
      this.shield.disarm();
      this.falls.reset();
      this.ui.falls(null);
      this.ui.bossBar(null);
      this.ui.light(null);
      this.ui.speech(null);
      this.ui.hearts(pl.hearts, pl.maxHearts);
      this.input.setCharge(0, 0);
      this.input.setMoveEnabled(true);
      this.snapCamera();
      this.ui.fade(0, 700);
      this.trans = null;
      if (tr.won) this.reachHeart(tr.zone);
    }
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
    this.pulseHintOn = false;
    this.moveHintFrom = null;
    this.briefNext = false;
    this.secrets = 0;
    this.ctx.stats.bonus = 0;
    this.sealOpen = false;
    this.arena = null;
    this.fightZone = null;
    this.trans = null;
    this.camFocus = null;
    this.lances = [];
    this.novas = [];
    this.ghosts = [];
    this.slowT = 0;
    this.freezeT = 0;
    this.cinema = false;
    this.cineFocus = null;
    this.ui.bossBar(null);
    this.ui.light(null);
    this.land.decals.length = 0;
    this.features = { teeth: false, eyes: false, limbs: false, cyan: false };
    this.moth = { has: false, x: 0, y: 0 };
    this.shield.disarm();
    this.falls.reset();
    this.ui.falls(null);
    this.mood.reset();
    this.mothGuide = null;
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
    this.ui.narrateClear();
    this.audio.setWind(0.16, 1);
    this.audio.setCrickets(0);
    this.audio.setHeart(1.3, 0.6);
    this.audio.setLullaby(0.5, 0.5);
    this.beginPlay();
  }

  private beginPlay() {
    this.mode = 'play';
    this.ui.skip(false);
    const pl = this.player;
    pl.x = 66 + OX;
    pl.y = 74 + OY;
    pl.hide = false;
    pl.maxHearts = this.maxHearts;
    pl.hearts = pl.maxHearts;
    this.ui.hearts(pl.hearts, pl.maxHearts);
    this.onSection?.('run');
    // the first time anyone plays, say what the game is about before anything else (test builds skip it)
    const q = new URLSearchParams(location.search);
    const show = this.briefNext && !this.previewMode && !this.cinema && !storageGet(BRIEF_KEY) && !(q.has('debug') && !q.has('intro'));
    this.briefNext = false;
    if (show) {
      this.input.setMoveEnabled(false);
      this.ui.briefing(() => {
        storageSet(BRIEF_KEY, '1');
        this.input.setMoveEnabled(true);
        this.startMoveHint();
      });
    } else {
      this.input.setMoveEnabled(true);
      this.startMoveHint();
    }
  }

  /** "drag to move" stays until the blob has actually gone somewhere (or a long while has passed). */
  private startMoveHint() {
    this.ui.hint(window.matchMedia('(pointer: coarse)').matches ? 'drag to move' : 'wasd / arrows to move');
    this.moveHintFrom = { x: this.player.x, y: this.player.y, t: this.time };
  }

  /* ------------------------------------------------------------------------------------------ */
  /* the cinematic intro drives the real forest (src/cinematic/trailer.ts)                      */
  /* ------------------------------------------------------------------------------------------ */

  /** the opening scene starts, `at` seconds in (it plays on by itself) */
  trailerOpening(at: number) {
    this.start();
    this.cinema = true;
    this.ui.skip(false);
    this.ot = at;
    this.previewMode = false;
  }

  /** jump the opening forward (or back) to a moment in it */
  trailerSeek(at: number) {
    if (this.mode === 'opening') this.ot = at;
  }

  /** the forest as a film set: nobody plays, the camera is an invisible, untouchable player */
  trailerPlay() {
    if (this.mode === 'opening') this.skipOpening();
    this.arena = null;
    this.fightZone = null;
    this.mode = 'play';
    this.trailerSetUp();
  }

  private trailerSetUp() {
    const pl = this.player;
    pl.hide = true;
    pl.invuln = 1e9;
    pl.dead = 0;
    this.input.setMoveEnabled(false);
    this.input.setAction(null);
    this.ui.hearts(null);
    this.ui.hint(null);
  }

  /** where the camera looks (the invisible player stands there); `cut` snaps the camera, otherwise it glides */
  trailerAt(x: number, y: number, cut = false) {
    const pl = this.player;
    pl.x = x;
    pl.y = y;
    pl.vx = pl.vy = 0;
    pl.invuln = 1e9;
    this.cineFocus = null;
    if (cut) this.snapCamera();
  }

  /** an X slam, as in the game: a shadow grows for `tele` seconds, then the foot lands */
  trailerSlam(x: number, y: number, R: number, tele: number) {
    this.spawnSlam(x, y, R, tele);
  }

  /** straight into a guardian's arena, no fade: its entrance plays */
  trailerArena(id: ZoneId, skip = 0) {
    const prev = this.fightZone;
    if (prev) prev.reset();
    const z = this.zones.find((q) => q.id === id)!;
    const a = arenaDef(id);
    const pl = this.player;
    this.mode = 'play';
    this.arena = a;
    this.fightZone = z;
    pl.x = a.entry.x;
    pl.y = a.entry.y;
    pl.vx = pl.vy = 0;
    pl.hearts = pl.maxHearts;
    pl.light = 0;
    this.slams = [];
    this.lances = [];
    this.novas = [];
    this.parts = [];
    this.cp = { x: a.entry.x, y: a.entry.y };
    this.falls.reset();
    this.snapCamera();
    this.trailerSetUp();
    this.cineFocus = { x: a.x, y: a.boss.y + 14 };
    this.camX = clamp(a.x - W / 2, 0, WORLD_W - W);
    this.camY = clamp(a.boss.y + 14 - 0.41 * H, 0, WORLD_H - H);
    z.onArrive?.();
    // let the guardian rise before the camera sees it: the cut is only a second and a half long
    for (let s = 0; s < skip; s += 1 / 30) this.update(1 / 30);
  }

  /** the Edge: the forest ends, the stars start to turn */
  trailerEdge() {
    const prev = this.fightZone;
    if (prev) prev.reset();
    this.arena = null;
    this.fightZone = null;
    this.warp('edge');
    this.mode = 'play';
    this.trailerSetUp();
    this.player.y = CLIFF_Y + 60;
    this.cineFocus = null;
    this.beginEdge();
    this.oldEdge = true;
    this.snapCamera();
  }

  /** drive the Edge by hand: `et` is how far along the stars are, `look` is 0..1 of looking up (1 cracks the screen) */
  trailerEdgeDrive(et: number, look: number) {
    if (this.mode !== 'edge') return;
    this.et = et;
    this.lookHold = look;
  }

  /** shorten the crack so the boom lands on the beat */
  trailerCrack(ct: number) {
    if (this.mode === 'crack') this.ct = Math.max(this.ct, ct);
  }

  /** Debug: go straight into a guardian's arena. */
  debugArena(id: ZoneId) {
    if (this.mode === 'opening') this.skipOpening();
    const z = this.zones.find((q) => q.id === id)!;
    this.enterArena(z);
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
      say(this.ui, STORY.seal);
      this.audio.warm();
      this.shake(6);
      burst(this.parts, 640, 700, 40, [C.red, C.redDark, C.moss], 70, 1);
    }
  }

  /* ---------------------------------------------------------------- */
  /* update                                                            */
  /* ---------------------------------------------------------------- */

  update(dt: number) {
    if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= this.slowScale;
    }
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
    else if (this.mode === 'xfight') this.updateXFight(dt);
    else if (this.mode === 'pinned') this.updatePinned(dt);
    else if (this.mode === 'rift') this.updateRift(dt);
    else if (this.mode === 'dive') this.updateDive(dt);
    if (this.mode === 'play' || this.mode === 'consume' || this.mode === 'edge' || this.mode === 'crack' || this.mode === 'xfight' || this.mode === 'pinned' || this.mode === 'rift') this.updateMoth(dt);
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
    this.fire('wake', t >= 0.9, () => say(ui, STORY.opening.wake));
    this.fire('cap1', t >= OP.cap1, () => {
      say(ui, STORY.opening.mother);
      audio.blip(0.7);
    });
    this.fire('shadow', t >= OP.shadow, () => {
      audio.setHeart(1.0, 0.85);
      audio.setLullaby(0.6, 0.8);
    });
    this.fire('cap2', t >= OP.shove, () => {
      say(ui, STORY.opening.father);
      audio.blip(1.15);
      audio.setHeart(1.8, 1);
    });
    this.fire('slam', t >= OP.slam, () => {
      ui.flash(1, 700);
      ui.narrateClear();
      this.shake(12);
      audio.slam();
      audio.silence(0.05);
      audio.ring(2.6);
      this.land.addDecal(START.x, START.y, 62, 45, 1);
      burst(this.parts, START.x, START.y - 6, 40, [C.ink, '#1a2a30', C.blobShade, C.soil], 70, 1);
    });
    this.fire('quiet', t >= OP.ring, () => {
      audio.setWind(0.15, 3);
      say(ui, STORY.opening.crater);
    });
    this.fire('lurk', t >= OP.lurk, () => {
      audio.bell(0.75);
      say(ui, STORY.opening.bell);
    });
    this.fire('eyes', t >= OP.eyes, () => {
      audio.setHeart(1.35, 0.8);
      say(ui, STORY.opening.move);
    });
    if (t >= OP.slam) this.smudge += dt;
    if (t >= OP.end) this.beginPlay();
    this.camX = OX;
    this.camY = OY + LOCAL_CAM;
  }

  private respawn() {
    const pl = this.player;
    // a fall inside a guardian fight: Nightmare counts toward starting over, the others toward the moth's help
    let startOver: Zone | null = null;
    if (this.arena && this.fightZone) {
      const v = this.falls.fall();
      if (v === 'restart') startOver = this.fightZone;
      else if (v === 'warn') say(this.ui, STORY.retry.warn);
      else if (v === 'assist') {
        say(this.ui, STORY.retry.assist);
        this.audio.chime();
        this.shield.back = 1;
      }
      this.showFalls();
    }
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
    pl.dashT = 0;
    pl.dashCd = 0;
    this.dashPool.reset();
    this.lances = [];
    this.novas = [];
    this.ui.hearts(pl.hearts, pl.maxHearts);
    this.zones.forEach((z) => z !== startOver && z.onRespawn());
    this.snapCamera();
    this.ui.fade(0, 450);
    const mother = STORY.deaths[this.ctx.stats.deaths];
    if (mother) say(this.ui, mother);
    if (this.arena && this.moth.has) this.shield.arm();
    this.mood.reset();
    if (startOver) {
      // the whole fight again, from its first phase
      this.falls.reset();
      this.showFalls();
      this.player.light = 0;
      this.ui.light(0);
      say(this.ui, STORY.retry.restart);
      startOver.onArrive?.();
    }
  }

  private updateSlams(dt: number) {
    const list = this.slams;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      if (s.phase === 'tele') {
        s.t += dt;
        if (s.t >= s.T) {
          s.phase = 'hit';
          s.ph = 0;
          this.impact(s);
          // (a hit that pins you under X clears the slams: stop here)
          if (this.slams !== list) return;
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
          list.splice(i, 1);
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
    if (!pl.hide && this.mode === 'xfight' && this.inEllipse(pl.x, pl.y, s, 0.9)) this.xHurt(s.x, s.y);
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
    if (this.pulseHintOn) {
      this.pulseHintOn = false;
      if (this.ui.hintIs(PULSE_HINT)) this.ui.hint(null);
    }
    pl.pulseCd = 0.55;
    this.pulses.push({ x: pl.x, y: pl.y - 4, t: 0 });
    this.audio.pulse();
    burst(this.parts, pl.x, pl.y - 6, 10, [C.blobLight, C.moonCore, C.mossGlow], 46, 0, 0);
    for (const z of this.zones) z.onPulse?.(pl.x, pl.y, PULSE_R);
  }

  private castLance() {
    const pl = this.player;
    let ax = this.aim.x;
    let ay = this.aim.y;
    // aim assist: if the guardian is within about 40 degrees of where you face, the lance goes for it
    const tg = this.fightZone?.lanceTarget?.();
    if (tg) {
      const dx = tg.x - pl.x;
      const dy = tg.y - (pl.y - 8);
      const d = Math.hypot(dx, dy) || 1;
      if ((dx / d) * ax + (dy / d) * ay > 0.76) {
        ax = dx / d;
        ay = dy / d;
      }
    }
    this.lances.push({ x: pl.x + ax * 6, y: pl.y - 8 + ay * 4, vx: ax * LANCE_SPEED, vy: ay * LANCE_SPEED, t: 0, life: 0.85 });
    pl.pulseCd = Math.max(pl.pulseCd, 0.3);
    this.audio.lance();
    burst(this.parts, pl.x + ax * 6, pl.y - 8, 8, [C.moonCore, C.blobLight, '#ffe9a0'], 40, 0, 0);
  }

  private castNova() {
    const pl = this.player;
    pl.light = 0;
    this.ui.light(0);
    const n: Nova = { x: pl.x, y: pl.y - 4, t: 0, R: NOVA_R };
    this.novas.push(n);
    pl.pulseCd = 0.6;
    pl.invuln = Math.max(pl.invuln, 0.3);
    this.audio.nova();
    this.ui.flash(0.5, 380);
    this.shake(7);
    burst(this.parts, pl.x, pl.y - 6, 30, [C.moonCore, C.blobLight, '#ff9ad0', '#ffe9a0'], 90, 0, 0);
    this.fightZone?.onNova?.(n);
  }

  private dash() {
    const pl = this.player;
    const { input } = this;
    let dx = input.moveX;
    let dy = input.moveY;
    const l = Math.hypot(dx, dy);
    if (l < 0.2) {
      dx = this.aim.x;
      dy = this.aim.y;
    } else {
      dx /= l;
      dy /= l;
    }
    pl.dashT = DASH_T;
    pl.dashX = dx;
    pl.dashY = dy;
    pl.dashCd = 0.8;
    pl.invuln = Math.max(pl.invuln, DASH_T + 0.05);
    this.dashPool.use();
    this.audio.dash();
  }

  /** In a guardian's arena the one button does four things: tap pulses, double-tap dashes, hold-and-release throws a Lance, hold longer with a full meter bursts a Nova. */
  private updateAttacks(dt: number) {
    const { input } = this;
    const pl = this.player;
    if (this.freezeT > 0) {
      input.setAction(null);
      input.setCharge(0, 0);
      return;
    }
    input.setAction('light');
    if (input.actionPressed) {
      if (input.doubleTap && pl.dashCd <= 0) {
        if (this.dashPool.can()) this.dash();
        else this.ui.dashEmpty();
      }
      if (pl.pulseCd <= 0 && pl.dashT <= 0) this.castPulse();
    }
    const h = input.actionDown ? input.actionHold : 0;
    const full = pl.light >= 3;
    let stage: 0 | 1 | 2 = 0;
    let u = 0;
    if (h > 0.18) {
      if (full && h >= NOVA_T) stage = 2;
      else if (h >= LANCE_T) stage = 1;
      u = h < LANCE_T ? (h - 0.18) / (LANCE_T - 0.18) : full ? clamp((h - LANCE_T) / (NOVA_T - LANCE_T), 0, 1) : 1;
    }
    if (stage !== this.chargeStage) {
      if (stage === 1) this.audio.charge1();
      if (stage === 2) this.audio.charge2();
      this.chargeStage = stage;
    }
    input.setCharge(u, stage);
    if (input.actionReleased) {
      const r = input.releasedAfter;
      if (full && r >= NOVA_T) this.castNova();
      else if (r >= LANCE_T) this.castLance();
      this.chargeStage = 0;
      input.setCharge(0, 0);
    }
  }

  private updateFightFx(dt: number) {
    for (let i = this.lances.length - 1; i >= 0; i--) {
      const l = this.lances[i]!;
      l.t += dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      let dead = l.t >= l.life || !this.land.isWalk(l.x, l.y);
      if (!dead && this.fightZone?.onLance?.(l)) dead = true;
      if (dead) {
        burst(this.parts, l.x, l.y, 6, [C.moonCore, '#ffe9a0'], 30, 0, 0);
        this.lances.splice(i, 1);
      }
    }
    for (let i = this.novas.length - 1; i >= 0; i--) {
      this.novas[i]!.t += dt;
      if (this.novas[i]!.t > 0.5) this.novas.splice(i, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i]!.t += dt;
      if (this.ghosts[i]!.t > 0.3) this.ghosts.splice(i, 1);
    }
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
    if (this.trans) {
      this.updateTrans(dt);
      this.updateSlams(dt);
      return;
    }
    pl.invuln = Math.max(0, pl.invuln - dt);
    pl.pulseCd = Math.max(0, pl.pulseCd - dt);
    pl.dashCd = Math.max(0, pl.dashCd - dt);
    this.dashPool.update(dt);
    this.ui.dashes(this.dashPool.charges, this.dashPool.max, this.dashPool.frac);
    pl.calm += dt;
    this.freezeT = Math.max(0, this.freezeT - dt);
    const fighting = this.arena !== null;
    const frozen = this.freezeT > 0;
    const mvx = frozen ? 0 : input.moveX;
    const mvy = frozen ? 0 : input.moveY;

    // --- movement (free in every direction, stopped by trees, gates and blocks)
    const sp0 = SPEED * pl.speedMul;
    const k = 1 - Math.exp(-16 * dt);
    if (pl.dashT > 0) {
      pl.dashT -= dt;
      pl.vx = pl.dashX * DASH_SPEED;
      pl.vy = pl.dashY * DASH_SPEED;
      this.ghosts.push({ x: pl.x, y: pl.y, t: 0 });
    } else {
      pl.vx += (mvx * sp0 - pl.vx) * k;
      pl.vy += (mvy * sp0 - pl.vy) * k;
    }
    // (stuck inside something, however it happened: step out to the nearest free spot)
    if (!this.canStand(pl.x, pl.y)) this.unstick();
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
      this.aim = { x: pl.vx / sp, y: pl.vy / sp };
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
      if (z.always || z === this.fightZone || (!this.arena && this.near(z))) z.update(dt);
      if (pl.dead > 0 || this.mode !== 'play' || this.trans) break;
    }
    this.updateSlams(dt);

    // --- the action button: pulse, unless a zone wants "hold"
    if (this.holdReq) input.setAction(this.holdReq);
    else if (fighting) this.updateAttacks(dt);
    else {
      input.setAction('pulse');
      if (input.actionPressed && pl.pulseCd <= 0 && pl.dead <= 0) this.castPulse();
    }
    if (fighting) this.updateFightFx(dt);

    // --- camera
    let tx = clamp(pl.x - W / 2 + pl.lookX * 24, 0, WORLD_W - W);
    let ty = clamp(pl.y - 0.58 * H + pl.lookY * 30, 0, WORLD_H - H);
    if (this.arena) {
      // in an arena the camera holds the whole clearing, leaning toward the player and the guardian
      const a = this.arena;
      const f = this.camFocus ?? { x: a.x, y: a.boss.y };
      tx = clamp((pl.x * 0.4 + f.x * 0.6) - W / 2, a.x - a.rx - 6, a.x + a.rx + 6 - W);
      ty = clamp((pl.y * 0.55 + f.y * 0.45) - 0.55 * H, a.y - a.ry + 38, a.y + a.ry + 10 - H);
    }
    if (this.cineFocus) {
      tx = clamp(this.cineFocus.x - W / 2, 0, WORLD_W - W);
      ty = clamp(this.cineFocus.y - 0.41 * H, 0, WORLD_H - H);
    }
    const kc = 1 - Math.exp(-5 * dt);
    this.camX += (tx - this.camX) * kc;
    this.camY += (ty - this.camY) * kc;

    // --- the first time you step into a zone, a one-line reminder of what light does
    if (!this.pulseHinted) {
      for (const z of ZONES) {
        if (Math.hypot((pl.x - z.x) / z.rx, (pl.y - z.y) / z.ry) < 0.9) {
          this.pulseHinted = true;
          this.ui.hint(PULSE_HINT);
          this.pulseHintOn = true;
          window.setTimeout(() => {
            if (!this.pulseHintOn) return;
            this.pulseHintOn = false;
            if (this.ui.hintIs(PULSE_HINT)) this.ui.hint(null);
          }, 16000);
          break;
        }
      }
    }

    // --- the move hint goes when the blob has gone somewhere; the goal is on screen while you are out on the roads
    const mh = this.moveHintFrom;
    if (mh && (Math.hypot(pl.x - mh.x, pl.y - mh.y) > 14 || this.time - mh.t > 45)) {
      this.moveHintFrom = null;
      if (this.ui.hintIs('drag to move') || this.ui.hintIs('wasd / arrows to move')) this.ui.hint(null);
    }
    this.ui.goal(!this.arena && !this.cinema && this.mode === 'play' && !this.trans ? this.goalText() : null);

    // --- the story: the crossroads, and a name card the first time you step into each zone
    if (!this.arena && !this.cinema && this.mode === 'play') {
      if (Math.hypot((pl.x - HUB.x) / HUB.rx, (pl.y - HUB.y) / HUB.ry) < 0.8) this.fire('hub', true, () => say(this.ui, STORY.crossroads));
      for (const z of ZONES) {
        if (Math.hypot((pl.x - z.x) / z.rx, (pl.y - z.y) / z.ry) < 0.8) {
          this.fire(`card-${z.id}`, true, () => this.ui.zoneCard(STORY.zones[z.id].name, STORY.zones[z.id].sub));
        }
      }
    }

    // --- checkpoints where the roads meet the zones
    if (!this.arena) for (const e of ENTRIES) if (Math.abs(pl.x - e.x) < 34 && Math.abs(pl.y - e.y) < 34) this.checkpoint(e.x, e.y);

    // --- the seal on the road to the Edge opens when every zone is done
    if (!this.sealOpen && this.zones.every((z) => z.cleared)) this.openSeal();

    // --- the edge
    if (pl.y <= CLIFF_Y + 70 && this.mode === 'play' && !this.arena) this.beginEdge();
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
      say(this.ui, STORY.falls[z.id]);
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
      const fallen = this.zones.filter((q) => q.cleared).length;
      if (fallen > 0) say(this.ui, STORY.hearts[Math.min(fallen, STORY.hearts.length) - 1]!);
      // each time a guardian falls, X's claw grazes you and the forest tears open for a moment on the world behind it: a little
      // more of it every time (see portalView and Act2.glimpse)
      {
        this.teased = true;
        this.glimpseI = Math.min(5, this.zones.filter((q) => q.cleared).length);
        this.glitchT = GLITCH;
        this.glitchFlash = false;
        this.audio.slam();
        this.audio.sting();
        this.ui.flash(0.8, 320);
        this.shake(10);
      }
    }
  }

  /** The moth throws itself in front of a hit: no damage, a flash of cyan, a moment to get away. */
  private mothTakesIt() {
    const pl = this.player;
    pl.invuln = 1.0;
    pl.calm = 0;
    this.audio.chime();
    this.ui.flash(0.22, 220);
    this.shake(2);
    burst(this.parts, pl.x, pl.y - 8, 14, [C.moonCore, C.moon, '#ffffff'], 46, 1, 10);
    this.moth.x = pl.x;
    this.moth.y = pl.y - 11;
    this.fire('shield-took', true, () => say(this.ui, STORY.mothShield.took));
  }

  private updateMoth(dt: number) {
    const m = this.moth;
    if (!m.has) return;
    const pl = this.player;
    this.mood.update(dt, Math.hypot(pl.vx, pl.vy) > 6 || this.mode !== 'play', pl.hearts, pl.maxHearts);
    if (this.shield.update(dt) && this.arena) {
      this.audio.chime();
      burst(this.parts, m.x, m.y, 8, [C.moonCore, C.moon], 30, 1, 0);
    }

    // a hidden warmth close by: the moth leans toward it, and circles over it when you are near
    this.mothGuide = null;
    if (!this.arena && this.mode === 'play') {
      let bd = 150;
      for (const z of this.zones) {
        const s = z.secretSpot?.();
        if (!s) continue;
        const d = Math.hypot(s.x - pl.x, s.y - pl.y);
        if (d < bd) {
          bd = d;
          this.mothGuide = s;
        }
      }
    }
    const g = this.mothGuide;
    if (g) this.fire('moth-sense', true, () => say(this.ui, STORY.mothSense));

    // where it wants to be: beside you, resting on your head when you stand still, close and trembling when you are one hit from a fall
    let tx = pl.x + 11;
    let ty = pl.y - 18 + Math.sin(this.time * 3) * 2;
    const rest = g ? 0 : this.mood.calm;
    tx += (pl.x + 1 - tx) * rest;
    ty += (pl.y - 13 - ty) * rest;
    const worry = this.mood.worry;
    tx += (pl.x + 5 - tx) * worry * 0.8 + Math.sin(this.time * 31) * 0.9 * worry;
    ty += (pl.y - 15 - ty) * worry * 0.6 + Math.cos(this.time * 27) * 0.7 * worry;
    if (g) {
      const dx = g.x - pl.x;
      const dy = g.y - pl.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 46) {
        tx = g.x + Math.cos(this.time * 2.2) * 8;
        ty = g.y - 14 + Math.sin(this.time * 2.2) * 4;
      } else {
        tx = pl.x + (dx / d) * 30;
        ty = pl.y - 16 + (dy / d) * 14 + Math.sin(this.time * 3) * 2;
      }
      if (Math.random() < dt * 5) {
        this.parts.push({ x: m.x, y: m.y + 2, vx: (dx / d) * 14 + (Math.random() - 0.5) * 6, vy: (dy / d) * 14 - 4, life: 0.9, max: 0.9, col: C.moonCore, g: 0, size: 1 });
      }
    }
    const follow = rest > 0.5 ? 7 : 4;
    m.x += (tx - m.x) * (1 - Math.exp(-follow * dt));
    m.y += (ty - m.y) * (1 - Math.exp(-follow * dt));
    this.mothDust -= dt;
    if (this.mothDust <= 0) {
      this.mothDust = rest > 0.5 ? 0.25 : 0.07;
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
    this.oldEdge = false;
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
    if (!this.oldEdge) {
      this.updateEdgeOpen(dt);
      return;
    }
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
    playTimed(ui, this.fired, 'edge-', this.et, STORY.edge);
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
      ui.narrateClear();
      ui.flash(1, 1100);
      audio.slam();
      audio.silence(0.02);
      audio.highTone(2.4);
      this.shake(14);
    }
  }

  /* ---------------------------------------------------------------- */
  /* the Edge: X comes down into the flat world                        */
  /* ---------------------------------------------------------------- */

  /** where the camera holds at the Edge (the cliff a third of the way down, the sky above it) */
  private edgeCam(): { x: number; y: number } {
    return { x: PLATEAU.x - W / 2, y: CLIFF_Y + 28 - 0.62 * H };
  }

  /** X's three eyes, high in the sky over the cliff */
  private eyePos(i: number): { x: number; y: number } {
    return { x: PLATEAU.x + (i - 1) * 42, y: CLIFF_Y - 150 - (i === 1 ? 14 : 0) };
  }

  /** X speaks: his own voice, and his words on screen */
  private xSay(line: string, ms = 2200) {
    this.audio.v.xSpeak(line);
    this.ui.caption(line, ms, true);
  }

  /** the Edge, as the game plays it: the forest ends, the stars blink out, and they open: they were his eyes */
  private updateEdgeOpen(dt: number) {
    this.et += dt;
    const { ui, audio } = this;
    const pl = this.player;
    pl.vx *= 0.8;
    pl.vy *= 0.8;
    pl.x += (PLATEAU.x - pl.x) * 0.02;
    pl.y += (CLIFF_Y + 70 - pl.y) * 0.04;
    pl.lookX = 0;
    pl.lookY = this.et > 0.8 ? -1 : 0;
    pl.squash = 1 + 0.025 * Math.sin(this.time * 3);
    pl.blink = 0;
    const c = this.edgeCam();
    this.camX += (c.x - this.camX) * (1 - Math.exp(-3 * dt));
    this.camY += (c.y - this.camY) * (1 - Math.exp(-3.5 * dt));
    playTimed(ui, this.fired, 'edge2-', this.et, STORY.edgeFight.open);
    this.fire('edge-eyes', this.et >= 2.2, () => audio.sting());
    // the stars draw together into three eyes, and the eyes open
    this.xf.eyes = smooth(unlerp(5.6, 6.6, this.et));
    this.fire('edge-open', this.et >= 5.6, () => {
      audio.boom();
      audio.v.xBreath();
      this.shake(8);
    });
    this.fire('edge-hello', this.et >= 6.6, () => {
      audio.v.xRoar();
      this.xSay(STORY.edgeFight.x.hello);
    });
    if (this.et >= 8.0) this.beginXFight();
  }

  private beginXFight() {
    const pl = this.player;
    this.mode = 'xfight';
    const f = this.xf;
    f.t = 0;
    f.stompT = 0.8;
    f.rakeT = 7;
    f.beamT = 14;
    f.rakes = [];
    f.beams = [];
    this.slams = [];
    pl.maxHearts = this.maxHearts;
    pl.hearts = pl.maxHearts;
    pl.invuln = 0.5;
    this.ui.hearts(pl.hearts, pl.maxHearts);
    this.input.setMoveEnabled(true);
    this.audio.setDrone(0.25, 1.5);
  }

  /** the Edge fight's ground: the strip of plateau on screen, below the cliff */
  private xBounds() {
    const c = this.edgeCam();
    return { x0: c.x + 12, x1: c.x + W - 12, y0: CLIFF_Y + 20, y1: c.y + H - 22 };
  }

  /** a hit at the Edge: a heart, never the last one (this is not a fight you can lose; it is one you cannot win) */
  private xHurt(fromX: number, fromY: number) {
    const pl = this.player;
    if (pl.invuln > 0 || pl.dashT > 0 || this.mode !== 'xfight') return;
    pl.hearts = Math.max(1, pl.hearts - 1);
    pl.calm = 0;
    this.ui.hearts(pl.hearts, pl.maxHearts);
    this.audio.hurt();
    this.ui.red(0.4, 300);
    this.shake(5);
    burst(this.parts, pl.x, pl.y - 6, 8, [C.blob, C.blobLight, C.red], 40, 1);
    pl.invuln = 1.3;
    const dx = pl.x - fromX;
    const dy = pl.y - fromY;
    const l = Math.hypot(dx, dy) || 1;
    pl.vx = (dx / l) * 150;
    pl.vy = (dy / l) * 150;
    // down to the last heart (and he has had his fun): he pins you
    if (pl.hearts <= 1 && this.xf.t >= 12) this.beginPinned();
  }

  /** move the blob freely inside a box (the Edge fight) */
  private moveIn(dt: number, b: { x0: number; x1: number; y0: number; y1: number }, frozen = false) {
    const { input } = this;
    const pl = this.player;
    const mvx = frozen ? 0 : input.moveX;
    const mvy = frozen ? 0 : input.moveY;
    const k = 1 - Math.exp(-16 * dt);
    if (pl.dashT > 0) {
      pl.dashT -= dt;
      pl.vx = pl.dashX * DASH_SPEED;
      pl.vy = pl.dashY * DASH_SPEED;
      this.ghosts.push({ x: pl.x, y: pl.y, t: 0 });
    } else {
      pl.vx += (mvx * SPEED - pl.vx) * k;
      pl.vy += (mvy * SPEED - pl.vy) * k;
    }
    pl.x = clamp(pl.x + pl.vx * dt, b.x0, b.x1);
    pl.y = clamp(pl.y + pl.vy * dt, b.y0, b.y1);
    const sp = Math.hypot(pl.vx, pl.vy);
    if (sp > 8) {
      pl.lookX = pl.vx / SPEED;
      pl.lookY = pl.vy / SPEED;
      this.aim = { x: pl.vx / sp, y: pl.vy / sp };
    } else {
      pl.lookX *= 0.9;
      pl.lookY *= 0.9;
    }
    pl.squash = 1 + 0.09 * Math.sin(this.time * 14) * clamp(sp / SPEED, 0, 1) + 0.03 * Math.sin(this.time * 2.5);
    pl.blink = hash2(Math.floor(this.time * 5), 3) > 0.93 ? 1 : 0;
  }

  /** about half a minute: his foot, his raking hand, his eyes. It gets quicker. Your light passes through him. */
  private updateXFight(dt: number) {
    const f = this.xf;
    const pl = this.player;
    const { ui } = this;
    f.t += dt;
    const t = f.t;
    pl.invuln = Math.max(0, pl.invuln - dt);
    pl.pulseCd = Math.max(0, pl.pulseCd - dt);
    pl.dashCd = Math.max(0, pl.dashCd - dt);
    this.dashPool.update(dt);
    ui.dashes(this.dashPool.charges, this.dashPool.max, this.dashPool.frac);
    const b = this.xBounds();
    this.moveIn(dt, b);
    // the one button: a pulse (it does nothing to him), a double tap dashes
    this.input.setAction('light');
    if (this.input.actionPressed) {
      if (this.input.doubleTap && pl.dashCd <= 0 && this.dashPool.can()) this.dash();
      else if (pl.pulseCd <= 0 && pl.dashT <= 0) {
        this.castPulse();
        this.fire('x-through', true, () => say(ui, STORY.edgeFight.through));
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i]!.t += dt;
      if (this.ghosts[i]!.t > 0.3) this.ghosts.splice(i, 1);
    }
    this.fire('x-mid', t >= 11, () => this.xSay(STORY.edgeFight.x.mid));
    this.fire('x-late', t >= 22, () => this.xSay(STORY.edgeFight.x.late));
    const k = clamp(t / 30, 0, 1);
    const tele = D.tele;
    // his foot: where you are going
    f.stompT -= dt;
    if (f.stompT <= 0) {
      const lead = 0.3;
      const x = clamp(pl.x + pl.vx * lead, b.x0, b.x1);
      const y = clamp(pl.y + pl.vy * lead, b.y0, b.y1);
      this.spawnSlam(x, y, 26 + Math.random() * 6, lerp(1.25, 0.9, k));
      // late on, a second foot where you would run to
      if (t > 22) this.spawnSlam(clamp(2 * PLATEAU.x - x, b.x0, b.x1), clamp(y + (Math.random() - 0.5) * 40, b.y0, b.y1), 24, lerp(1.25, 0.95, k));
      f.stompT = lerp(1.8, 1.0, k) * tele;
    }
    // his hand rakes the ground in a line across
    f.rakeT -= dt;
    if (t >= 7 && f.rakeT <= 0) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      f.rakes.push({ y: clamp(pl.y + (Math.random() - 0.5) * 10, b.y0, b.y1), dir, t: 0, T: 0.9 * tele, hx: 0, hit: false });
      this.audio.v.xBreath();
      f.rakeT = lerp(3.4, 2.2, k) * tele;
    }
    // his eyes pick you out
    f.beamT -= dt;
    if (t >= 14 && f.beamT <= 0) {
      f.beams.push({ x: pl.x, t: 0, T: 0.95 * tele, eye: Math.floor(Math.random() * 3), hit: false });
      this.audio.bell(1.2);
      f.beamT = lerp(3.0, 2.0, k) * tele;
    }
    this.updateSlams(dt);
    this.updateRakes(dt);
    this.updateBeams(dt);
    // the camera holds, with his weight in it
    const c = this.edgeCam();
    this.camX += (c.x - this.camX) * (1 - Math.exp(-4 * dt));
    this.camY += (c.y - this.camY) * (1 - Math.exp(-4 * dt));
    // half a minute is all you get
    if (t >= 32) this.beginPinned();
  }

  private updateRakes(dt: number) {
    const f = this.xf;
    const pl = this.player;
    const c = this.edgeCam();
    const list = f.rakes;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i]!;
      r.t += dt;
      if (r.t < r.T) continue;
      const u = (r.t - r.T) / 0.5;
      if (r.t - dt < r.T) {
        this.audio.whoosh();
        this.shake(4);
      }
      // the claw's head crosses the screen
      r.hx = r.dir > 0 ? lerp(c.x - 30, c.x + W + 30, u) : lerp(c.x + W + 30, c.x - 30, u);
      const passed = r.dir > 0 ? pl.x < r.hx : pl.x > r.hx;
      if (!r.hit && u < 1 && passed && Math.abs(pl.y - r.y) < 9) {
        r.hit = true;
        this.xHurt(r.hx, r.y);
        // (that hit pinned you: the rakes are gone)
        if (f.rakes !== list) return;
      }
      if (u >= 1.3) list.splice(i, 1);
    }
  }

  private updateBeams(dt: number) {
    const f = this.xf;
    const pl = this.player;
    const list = f.beams;
    for (let i = list.length - 1; i >= 0; i--) {
      const bm = list[i]!;
      bm.t += dt;
      // it follows you, a little behind, then holds still for a blink before it fires
      if (bm.t < bm.T * 0.75) bm.x += (pl.x - bm.x) * (1 - Math.exp(-5 * dt));
      if (bm.t >= bm.T && bm.t - dt < bm.T) {
        this.audio.slam();
        this.shake(6);
        burst(this.parts, bm.x, pl.y, 14, [C.red, C.redGlow, C.white], 60, 1);
      }
      if (bm.t >= bm.T && bm.t < bm.T + 0.35 && !bm.hit && Math.abs(pl.x - bm.x) < 8) {
        bm.hit = true;
        this.xHurt(bm.x, pl.y - 20);
        if (f.beams !== list) return;
      }
      if (bm.t > bm.T + 0.5) list.splice(i, 1);
    }
  }

  /** he has you: the foot comes down over you, slowly. Mother calls. */
  private beginPinned() {
    if (this.mode !== 'xfight') return;
    const pl = this.player;
    this.mode = 'pinned';
    const f = this.xf;
    f.pinT = 0;
    f.rakes = [];
    f.beams = [];
    this.slams = [];
    f.foot = { x: pl.x, y: pl.y };
    this.lookHold = 0;
    pl.vx = pl.vy = 0;
    pl.dashT = 0;
    this.input.setMoveEnabled(false);
    this.input.setAction(null);
    this.audio.v.xRoar();
    this.audio.rumble();
    this.shake(10);
  }

  private updatePinned(dt: number) {
    const f = this.xf;
    const pl = this.player;
    const { ui, input } = this;
    f.pinT += dt;
    const t = f.pinT;
    // you struggle under it
    pl.squash = 0.82 + 0.06 * Math.sin(this.time * 20);
    pl.lookY = -1;
    this.fire('x-pin', t >= 0.3, () => this.xSay(STORY.edgeFight.x.pin, 1600));
    this.fire('pin-look', t >= 1.4, () => {
      say(ui, STORY.edgeFight.look);
      ui.hint('hold to look up');
      input.setAction('hold');
    });
    if (t >= 1.4) {
      const auto = t >= 5;
      if (input.actionDown || auto) this.lookHold = Math.min(1, this.lookHold + dt / 1.2);
      else this.lookHold = Math.max(0, this.lookHold - dt * 0.35);
    }
    // looking up: the camera rises to his eyes
    const c = this.edgeCam();
    this.camX += (c.x - this.camX) * (1 - Math.exp(-3 * dt));
    this.camY += (c.y - 95 * smooth(this.lookHold) - this.camY) * (1 - Math.exp(-4 * dt));
    if (this.lookHold >= 1) this.beginRift();
  }

  /** the sky tears open between his eyes, all the way down to the ground beside you: the real world is behind it */
  private beginRift() {
    const pl = this.player;
    const f = this.xf;
    this.mode = 'rift';
    f.riftT = 0;
    const c = this.edgeCam();
    // beside you, on the side with more room
    const side = pl.x < PLATEAU.x ? 1 : -1;
    const x = clamp(pl.x + side * 44, c.x + 34, c.x + W - 34);
    f.rift = { x, top: this.eyePos(1).y + 24, bot: pl.y + 6, open: 0, grow: 0 };
    this.ui.hint(null);
    this.input.setAction(null);
    this.ui.flash(0.8, 500);
    this.audio.highTone(1.6);
    this.audio.boom();
    this.shake(12);
  }

  private updateRift(dt: number) {
    const f = this.xf;
    const pl = this.player;
    const { ui, input } = this;
    f.riftT += dt;
    const t = f.riftT;
    f.rift.open = smooth(clamp(t / 0.9, 0, 1));
    this.fire('rift-see', t >= 0.6, () => say(ui, STORY.edgeFight.see));
    this.fire('rift-run', t >= 1.6, () => {
      say(ui, STORY.edgeFight.run);
      ui.hint('run!');
      input.setMoveEnabled(true);
    });
    // the camera comes halfway back down, so his eyes and the foot of the rift are both on screen
    const c = this.edgeCam();
    this.camX += (c.x - this.camX) * (1 - Math.exp(-3 * dt));
    this.camY += (c.y - 40 - this.camY) * (1 - Math.exp(-3 * dt));
    // the foot keeps coming
    const b = this.xBounds();
    const go = t >= 1.6;
    this.moveIn(dt, { ...b, y0: Math.min(b.y0, f.rift.bot - 30) }, !go);
    // too slow, and the rift pulls you in anyway
    if (t > 6.5) {
      pl.x += (f.rift.x - pl.x) * (1 - Math.exp(-3 * dt));
      pl.y += (f.rift.bot - 8 - pl.y) * (1 - Math.exp(-3 * dt));
    }
    if (go && Math.abs(pl.x - f.rift.x) < 16 && Math.abs(pl.y - (f.rift.bot - 8)) < 20) this.beginDive();
  }

  private beginDive() {
    this.mode = 'dive';
    this.xf.diveT = 0;
    this.ui.hint(null);
    this.input.setMoveEnabled(false);
    this.input.setAction(null);
    this.audio.whoosh();
    this.audio.rumble();
    this.ui.narrateClear();
  }

  /** into it: the rift swallows you and opens over everything */
  private updateDive(dt: number) {
    const f = this.xf;
    const pl = this.player;
    f.diveT += dt;
    const t = f.diveT;
    pl.x += (f.rift.x - pl.x) * (1 - Math.exp(-8 * dt));
    pl.y += (f.rift.bot - 20 - pl.y) * (1 - Math.exp(-6 * dt));
    pl.squash = Math.max(0.2, 1 - t * 1.6);
    if (t > 0.45) pl.hide = true;
    f.rift.grow = smooth(clamp((t - 0.25) / 0.9, 0, 1));
    this.shake(3);
    if (t >= 1.25) {
      this.mode = 'done';
      pl.hide = false;
      this.onBoom?.();
    }
  }

  /**
   * What of the 3D world shows through the forest right now (game.ts draws it): a claw-tear when a guardian has just fallen, the
   * rift at the Edge. `shot` picks what the Crater shows (see Act2.prepareGlimpse), `u` is how far through it is.
   */
  portalView(): { view: PortalView; shot: number; u: number } | null {
    if (this.glitchT > 0 && this.glimpseI > 0) {
      const age = GLITCH - this.glitchT;
      const open = smooth(clamp((age - 0.3) / 0.35, 0, 1)) * (1 - smooth(clamp((age - 1.65) / 0.4, 0, 1)));
      if (open <= 0.01) return null;
      // along the claw's slash, from top right to bottom left; wider every time
      const ry = (10 + this.glimpseI * 5) * open;
      return {
        view: { x: W / 2, y: H * 0.42, rx: 150, ry, ang: Math.atan2(H * 0.8 + 14, -(W + 28)), jag: 0.18, glow: 0.9, color: 0x9ff4ee },
        shot: this.glimpseI,
        u: clamp(age / 2, 0, 1),
      };
    }
    if (this.mode === 'rift' || this.mode === 'dive') {
      const r = this.xf.rift;
      const top = r.top - this.camY;
      const bot = r.bot - this.camY;
      const cy = (top + bot) / 2;
      const ry0 = Math.max(4, (bot - top) / 2);
      const g = r.grow;
      return {
        view: { x: lerp(r.x - this.camX, W / 2, g), y: lerp(cy, H / 2, g), rx: lerp(3 + 36 * r.open, 320, g * g), ry: lerp(ry0 * (0.3 + 0.7 * r.open), 420, g * g), ang: 0, jag: 0.12 * (1 - g), glow: 1 - g * 0.8, color: 0xbffcf6 },
        shot: 0,
        u: clamp(this.xf.riftT / 8, 0, 1),
      };
    }
    return null;
  }

  /** (tests) tear the forest open now on the `n`th glimpse */
  debugGlimpse(n: number) {
    this.glimpseI = clamp(n, 1, 5);
    this.glitchT = GLITCH;
    this.glitchFlash = false;
    this.audio.slam();
    this.audio.sting();
  }

  /** (tests) go straight to the Edge, as if the road there had just been walked */
  debugEdge() {
    this.warp('edge');
    // by the Edge the moth has long been with you
    this.moth = { has: true, x: this.player.x + 12, y: this.player.y - 10 };
    this.mode = 'play';
    this.beginEdge();
    this.snapCamera();
  }

  /** the Edge fight drawn: his eyes in the sky, his foot's shadow, the hand that rakes, the beams */
  private drawXFight() {
    const p = this.p;
    const f = this.xf;
    const t = this.time;
    const camX = this.camX;
    const camY = this.camY;
    // his eyes
    if (f.eyes > 0.01) {
      const pl = this.player;
      for (let i = 0; i < 3; i++) {
        const e = this.eyePos(i);
        const sx = e.x - camX;
        const sy = e.y - camY;
        if (sy < -30 || sy > H + 30) continue;
        const blink = hash2(Math.floor(t * 2.3), i + 7) > 0.94 ? 0.15 : 1;
        const o = f.eyes * blink;
        p.dither(sx, sy, 26, 14, C.redDark, 0.35 * f.eyes);
        p.ellipse(sx, sy, 16, Math.max(1, 8 * o), '#d9e4ff');
        if (o > 0.2) {
          const lx = clamp((pl.x - e.x) / 160, -1, 1) * 5;
          const ly = clamp((pl.y - e.y) / 300, -1, 1) * 2;
          p.ellipse(sx + lx, sy + ly, 7, Math.max(1, 6.5 * o), C.red);
          p.ellipse(sx + lx, sy + ly, 2, Math.max(1, 5.5 * o), C.ink);
          p.px(sx + lx + 2, sy + ly - 2, C.white);
        }
        p.ring(sx, sy, 16, Math.max(1, 8 * o), 1, C.ink);
      }
    }
    // the rakes: a warning line, then the bony hand across
    for (const r of f.rakes) {
      const sy = r.y - camY;
      if (r.t < r.T) {
        const on = Math.floor(t * 10) % 2 === 0 || r.t < r.T * 0.5;
        p.alpha(on ? 0.9 : 0.4);
        for (let x = 0; x < W; x += 6) p.rect(x, sy, 3, 1, C.red);
        p.alpha(1);
        const ex = r.dir > 0 ? 3 : W - 4;
        p.rect(ex - 1, sy - 3, 3, 7, C.redGlow);
      } else {
        // a long bony arm dragged across the ground, knuckled, with three hooked claws at its end
        const hx = r.hx - camX;
        const x0 = r.dir > 0 ? -16 : W + 16;
        p.dither((x0 + hx) / 2, sy + 3, Math.abs(hx - x0) / 2, 4, C.ink, 0.45);
        p.line(x0, sy - 4, hx, sy - 2, '#0e0818', 9);
        p.line(x0, sy - 7, hx, sy - 5, '#3a2a5a', 1);
        p.line(x0, sy - 1, hx, sy + 1, '#1a1030', 1);
        for (let k = 1; k < 12; k++) {
          const kx = hx - r.dir * k * 18;
          if (kx < -10 || kx > W + 10) break;
          p.ellipse(kx, sy - 3, 5, 6, '#0e0818');
          p.px(kx - 1, sy - 7, C.boneShade);
        }
        for (let k = -1; k <= 1; k++) {
          const tx = hx + r.dir * 15;
          const ty = sy + k * 6 - 1;
          p.line(hx, sy - 2, tx, ty, '#0e0818', 3);
          p.line(tx, ty, tx + r.dir * 3, ty + 3, '#0e0818', 2);
          p.px(tx + r.dir * 3, ty + 3, C.bone);
        }
        // it tears the moss up as it goes
        p.dither(hx - r.dir * 8, sy + 2, 14, 4, C.redDark, 0.45);
      }
    }
    // the beams from his eyes
    for (const bm of f.beams) {
      const e = this.eyePos(bm.eye);
      const ex = e.x - camX;
      const ey = e.y - camY;
      const gx = bm.x - camX;
      const gy = this.player.y - camY;
      if (bm.t < bm.T) {
        const lock = bm.t > bm.T * 0.75;
        p.alpha(lock ? (Math.floor(t * 16) % 2 ? 1 : 0.4) : 0.55);
        p.line(ex, ey, gx, gy, C.red, 1);
        p.ring(gx, gy, 9, 4, 1, lock ? C.redGlow : C.red);
        p.alpha(1);
      } else if (bm.t < bm.T + 0.35) {
        const w = 7 * (1 - (bm.t - bm.T) / 0.35) + 2;
        p.line(ex, ey, gx, gy, C.red, Math.round(w + 2));
        p.line(ex, ey, gx, gy, C.white, Math.max(1, Math.round(w * 0.4)));
        p.ellipse(gx, gy, 12, 5, C.redGlow);
      }
    }
    // pinned: the foot's shadow closes over you
    if (this.mode === 'pinned' || this.mode === 'rift' || this.mode === 'dive') {
      const u = clamp(0.25 + (f.pinT + (this.mode === 'pinned' ? 0 : f.riftT)) / 9, 0, 0.98);
      this.drawShadow(f.foot.x - camX, f.foot.y - camY, 52, u);
      // you, still there under it: small, lit by your own light
      const pl = this.player;
      if (this.mode !== 'dive') {
        this.drawGlowUnder(pl.x - camX, pl.y - camY);
        drawBlob(p, pl.x - camX, pl.y - camY, { squash: pl.squash, lookX: pl.lookX, lookY: pl.lookY, blink: pl.blink });
      }
    }
    // the rift: cracks running from between his eyes down to its top (the world behind it is drawn over this, smooth)
    if (this.mode === 'rift' || this.mode === 'dive') {
      const r = f.rift;
      const e = this.eyePos(1);
      const u = clamp(f.riftT / 0.5, 0, 1);
      const x0 = e.x - camX;
      const y0 = e.y - camY + 10;
      const x1 = r.x - camX;
      const y1 = r.top - camY;
      let px = x0;
      let py = y0;
      for (let k = 1; k <= 8; k++) {
        const kk = k / 8;
        if (kk > u) break;
        const nx = lerp(x0, x1, kk) + (hash2(k, 31) - 0.5) * 8;
        const ny = lerp(y0, y1, kk);
        p.line(px + 1, py + 1, nx + 1, ny + 1, C.ink, 1);
        p.line(px, py, nx, ny, C.moonCore, 1);
        px = nx;
        py = ny;
      }
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

  /** Lances in flight, novas, the afterimages of a dash. */
  private drawFightFx() {
    if (!this.arena && this.mode !== 'xfight') return;
    const p = this.p;
    const t = this.time;
    for (const g of this.ghosts) {
      const u = g.t / 0.3;
      p.alpha(0.5 * (1 - u));
      drawBlob(p, g.x - this.camX, g.y - this.camY, { squash: 0.8, lookX: this.aim.x, lookY: this.aim.y, shadow: false });
    }
    p.alpha(1);
    for (const l of this.lances) {
      const sx = l.x - this.camX;
      const sy = l.y - this.camY;
      const len = Math.hypot(l.vx, l.vy);
      const ux = l.vx / len;
      const uy = l.vy / len;
      p.alpha(0.35);
      p.line(sx - ux * 22, sy - uy * 22, sx, sy, C.blobLight, 3);
      p.alpha(1);
      p.line(sx - ux * 14, sy - uy * 14, sx + ux * 5, sy + uy * 5, '#ffe9a0', 2);
      p.line(sx - ux * 8, sy - uy * 8, sx + ux * 6, sy + uy * 6, C.white, 1);
      p.dither(sx, sy, 6, 5, C.moonCore, 0.35 + 0.15 * Math.sin(t * 40));
    }
    for (const n of this.novas) {
      const u = n.t / 0.5;
      const r = n.R * easeOutCubic(clamp(u * 1.6, 0, 1));
      const sx = n.x - this.camX;
      const sy = n.y - this.camY;
      p.alpha(1 - u * 0.9);
      p.ring(sx, sy, r, r * 0.72, 4, u < 0.3 ? C.white : '#ff9ad0');
      p.ring(sx, sy, r * 0.8, r * 0.58, 2, '#ffe9a0');
      p.alpha((1 - u) * 0.45);
      p.dither(sx, sy, r, r * 0.72, '#ffe9a0', 0.4);
      p.alpha(1);
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
            // the moth's shield: a thin bubble of moonlight while it is ready
            if (this.arena && this.moth.has && this.shield.ready) {
              const bx = pl.x - camX;
              const by = pl.y - camY - 6;
              const wob = 0.6 * Math.sin(t * 3);
              p.dither(bx, by, 11.5 + wob, 9.5 - wob * 0.5, C.moon, 0.2 + 0.25 * this.shield.back);
              p.alpha(0.55);
              p.ring(bx, by, 11 + wob, 9 - wob * 0.5, 1, C.moon);
              p.alpha(1);
            }
          },
        });
      }
    }
    if (this.moth.has && !opening) {
      const m = this.moth;
      const sh = this.shield;
      // a spent shield dims the moth until it comes back; a hit it just took makes it flare
      const glow = this.mood.glow * (this.arena && !sh.ready ? 0.4 + 0.5 * sh.charge : 1) * (1 + 0.8 * sh.took + 0.6 * sh.back) * (this.mothGuide ? 1.3 : 1);
      list.push({ y: this.player.y + 40, fn: () => drawMoth(p, m.x - camX, m.y - camY, t, glow, this.mothGuide ? 0 : this.mood.calm, Math.max(this.mood.worry, this.mothGuide ? 0.6 : 0)) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.fn();
    for (const z of this.zones) z.overlay?.();
    this.drawPulses();
    this.drawFightFx();
    this.drawSeal();

    if (opening) this.drawLurkersAndEyes();
    if (this.mode === 'edge' || this.mode === 'crack' || this.mode === 'done' || this.mode === 'xfight' || this.mode === 'pinned' || this.mode === 'rift' || this.mode === 'dive') {
      // (in the game's own Edge the stars stop blinking out once his eyes are open: they have all gone to make them)
      land.drawStars(p, camY, t, this.oldEdge ? this.et : Math.min(this.et, 6), 6);
      if (this.oldEdge || this.mode === 'crack') this.drawClaws();
      else this.drawXFight();
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
    if ((this.mode === 'play' || this.mode === 'consume') && !this.arena && !this.cinema) {
      this.drawHud();
      if (this.mode === 'play') this.drawCompass();
    }
    if (this.mode === 'crack') this.drawCracks();
    if (this.glitchT > 0) this.applyGlitch();
    this.camX = cx0;
    this.camY = cy0;
    return p.canvas;
  }

  /** The goal, in one line: how many guardians are down, or where to go once the road is open. */
  private goalText(): string {
    if (this.sealOpen) return 'the road is open · follow the red arrow';
    return `beat the five guardians · ${this.zones.filter((z) => z.cleared).length} of 5`;
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
    for (let i = 0; i < (this.glimpseI > 0 ? 0 : 54); i++) {
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
      list.push({ y: 4 + OY, fn: () => drawBlob(p, 90 + nudge, 4 - cam, { s: 1.5, squash: br(1), lookY: alarm ? -1 : 0.4, lookX: 0.3, bow: true }) });
      const lean = ot > OP.shove && ot < OP.shove + 0.8 ? -Math.sin(((ot - OP.shove) / 0.8) * Math.PI) * 4 : 0;
      list.push({ y: 6 + OY, fn: () => drawBlob(p, 127 + lean, 6 - cam, { s: 1.62, squash: br(2), lookY: alarm ? -1 : 0.4, lookX: -0.3 }) });
    } else {
      const a = clamp(1 - this.smudge / 3.6, 0, 1);
      if (a > 0) {
        p.alpha(a);
        p.ellipse(90, 4 - cam, 11, 2.2, C.blob);
        // her bow, pressed flat with her
        p.ellipse(93.5, 3 - cam, 2.4, 1, BOW.pink);
        p.ellipse(98.5, 3 - cam, 2.4, 1, BOW.pink);
        p.px(96, 3 - cam, BOW.knot);
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
