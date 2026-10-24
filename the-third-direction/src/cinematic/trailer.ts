/**
 * The cinematic intro: a 48-second trailer made of the game itself.
 *
 * Nothing here is a video. The director plays the REAL opening scene, flies the camera through the REAL forest, jumps into each
 * guardian's REAL entrance, scrubs the REAL edge scene, lets the REAL boom burst the picture into cubes, and cuts between the REAL
 * 3D bosses, with its own cameras, titles, light and glitches on top. Every beat is timed to `CUE` (cues.ts), the same sheet the
 * music (score.ts) is scheduled from, so a hit in the music lands on its cut in the picture.
 *
 * The clock is the wall clock, not the frame count: a slow phone drops frames but never drifts out of step with the music.
 */
import type { Act2 } from '../act2/act2';
import type { Sfx } from '../core/audio';
import type { Pix } from '../core/pix';
import { STORY } from '../core/story';
import { clamp, lerp, smooth, unlerp } from '../core/util';
import type { Forest } from '../forest/forest';
import type { UI } from '../ui';
import { CUE } from './cues';

export type Layer = 'black' | '2d' | '3d';

/** what the trailer needs from the music: start it (returns when T = 0 is on the audio clock) and stop it */
export interface ScoreLike {
  start(): number;
  stop(fade?: number): void;
}

export interface TrailerDeps {
  ui: UI;
  audio: Sfx;
  act1: Forest;
  act2: Act2;
  /** the music, or null when it is not available (the trailer plays in silence) */
  score: () => ScoreLike | null;
  /** zoom of the 2D picture (1 = normal) */
  zoom2d: (z: number) => void;
  /** the trailer ends or is skipped */
  onDone: () => void;
}

/** the audio clock starts a moment after we ask (scheduling lead + speaker latency), so the picture waits as long */
const AUDIO_LEAD = 0.14;

/** the five places of the montage: where the camera starts, where it glides to, and the name card */
const ZONES = [
  { name: 'Gloom Hollow', sub: 'they hate the light. stay in it.', from: [190, 1296], to: [300, 1196] },
  { name: 'Rootmaw Thicket', sub: 'the roots remember being trees.', from: [340, 940], to: [250, 812] },
  { name: 'Echo Marsh', sub: 'every bell here is listening.', from: [950, 940], to: [1064, 826] },
  { name: 'Bone Wastes', sub: 'something small runs on too many legs.', from: [986, 1296], to: [1098, 1186] },
  { name: 'Moth Meadow', sub: 'it is very quiet. quiet is how it starts.', from: [940, 1706], to: [1040, 1606] },
] as const;

/** the guardians, in the order of the road: the name that slams onto the screen, and its colour */
const GUARDIANS = [
  { id: 'gloom', name: 'Gloommother', sub: 'she is hungry', colour: '#6ff0ff', skip: 3.2 },
  { id: 'thicket', name: 'Thornback King', sub: 'when his back cracks open, strike', colour: '#e0a060', skip: 3.8 },
  { id: 'marsh', name: 'Toll Queen', sub: 'hush', colour: '#d9b8ff', skip: 4.0 },
  { id: 'bones', name: 'Bone Wyrm', sub: 'it hears you', colour: '#f4efe0', skip: 4.0 },
  { id: 'meadow', name: 'Mimic Queen', sub: 'follow the glow', colour: '#ff8aa8', skip: 3.8 },
] as const;

export class Trailer {
  /** which picture the game should draw right now */
  layer: Layer = 'black';
  running = false;
  private t0 = 0;
  private last = 0;
  private score: ScoreLike | null = null;
  private fired = new Set<string>();
  /** a clock the tests can set */
  private fake: number | null = null;
  /** a glitch that decays: 1 is a full tear of the picture */
  private glitch = 0;
  /** a punch-in that decays: 1 is a quick zoom that settles back */
  private kick = 0;
  private tmp: HTMLCanvasElement | null = null;
  private pan: { x0: number; y0: number; x1: number; y1: number; at: number; len: number } | null = null;
  private savedBoom: (() => void) | null = null;
  private boomed = false;
  private bossIndex = -1;
  private savedMaster = 0.9;

  private skipCb = () => this.skip();
  /** Escape, Enter or Space skips it too (a keyboard has no Skip button to aim at) */
  private keyCb = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.skip();
    }
  };

  constructor(private d: TrailerDeps) {}

  /** the picture's time in seconds (0 at the tap) */
  get T(): number {
    return this.fake ?? Math.max(0, (performance.now() - this.t0) / 1000 - AUDIO_LEAD);
  }

  /** Start the trailer. Call from a tap (the audio needs one). */
  begin() {
    const { ui, audio, act1 } = this.d;
    this.running = true;
    this.fired.clear();
    this.fake = null;
    this.layer = 'black';
    this.glitch = this.kick = 0;
    this.pan = null;
    this.boomed = false;
    this.bossIndex = -1;
    ui.cinematic(true);
    ui.skip(true, this.skipCb);
    window.addEventListener('keydown', this.keyCb);
    // the game's own sounds go quiet: the trailer has its own score on a bus of its own
    this.savedMaster = audio.level;
    audio.setMaster(0, 0.05);
    this.score = this.d.score();
    this.t0 = performance.now();
    this.score?.start();
    this.last = 0;
    this.savedBoom = act1.onBoom;
    act1.onBoom = () => this.startBoom();
    this.d.zoom2d(1);
  }

  /** The player skipped (or the trailer reached its end early). */
  skip() {
    if (!this.running) return;
    this.score?.stop(0.35);
    this.end();
  }

  private end() {
    if (!this.running) return;
    this.running = false;
    window.removeEventListener('keydown', this.keyCb);
    const { ui, audio, act1, act2 } = this.d;
    act1.onBoom = this.savedBoom;
    act2.trailerCutAway();
    ui.skip(false);
    ui.cinematic(false);
    ui.narrateClear();
    ui.caption(null);
    audio.setMaster(this.savedMaster, 0.3);
    this.d.zoom2d(1);
    this.d.onDone();
  }

  /** (tests) jump the trailer to a moment, running everything on the way at 30 steps a second */
  debugAdvance(to: number) {
    if (this.fake === null) this.fake = 0;
    while (this.fake < to && this.running) {
      this.fake = Math.min(to, this.fake + 1 / 30);
      this.update(1 / 30, true);
    }
  }

  /** Called every frame while the trailer plays. `step` is a fixed frame time for tests. */
  update(dtFrame: number, step = false) {
    if (!this.running) return;
    const { ui, act1, act2 } = this.d;
    const T = this.T;
    // the scenes borrowed from the game turn its own Skip button on and off: this one stays
    ui.skip(true, this.skipCb);
    // real elapsed time, so the 2D and 3D scenes keep pace with the music even when frames are slow
    let dt = step ? dtFrame : T - this.last;
    if (this.last === 0 && !step) dt = Math.min(dtFrame, 0.05);
    this.last = T;
    dt = clamp(dt, 0, 0.1);
    const at = (t: number, key: string, fn: () => void) => {
      if (T >= t && !this.fired.has(key)) {
        this.fired.add(key);
        fn();
      }
    };
    this.glitch = Math.max(0, this.glitch - dt * 3.2);
    this.kick = Math.max(0, this.kick - dt * 4.5);

    /* ------------------------------------------------ 0. black, a small card ------------------------------------------------ */
    at(CUE.cardIn, 'card', () => ui.card({ small: 'RUN.WORLD OCTOBER JAM', big: 'MONSTER MASH' }, (CUE.cardOut - CUE.cardIn) * 1000 + 400));

    /* ------------------------------------------------ 1. the clearing ------------------------------------------------ */
    if (T >= CUE.openingStart - 0.15 && T < CUE.montageStart) {
      at(CUE.openingStart - 0.15, 'opening', () => act1.trailerOpening(2.9));
      this.layer = T >= CUE.openingStart ? '2d' : 'black';
      at(CUE.dontLookUp, 'mother', () => ui.caption("Don't look up.", 2500, false, 'warm'));
      at(CUE.heroCard, 'hero', () => ui.zoneCard(STORY.hero.name, STORY.hero.sub, (CUE.jumpCut - CUE.heroCard - 0.3) * 1000));
      at(CUE.jumpCut, 'jump', () => {
        act1.trailerSeek(12.4);
        this.glitch = 1;
        ui.flash(0.3, 160);
      });
      at(CUE.slam + 0.6, 'jump2', () => {
        act1.trailerSeek(19.6);
        ui.caption('Mother?', 1700, false, 'thought');
      });
      act1.update(dt);
      // a slow push toward the family; after the foot lands, the dark closes in again
      let z = lerp(1, 1.07, smooth(unlerp(CUE.openingStart, CUE.jumpCut, T)));
      if (T >= CUE.slam) z = lerp(1.0, 1.05, smooth(unlerp(CUE.slam + 0.5, CUE.montageStart, T)));
      this.d.zoom2d(z + this.kickAmount());
    }

    /* ------------------------------------------------ 2. five places ------------------------------------------------ */
    if (T >= CUE.montageStart && T < CUE.guardianCuts[0]!) {
      at(CUE.montageStart, 'play', () => act1.trailerPlay());
      this.layer = '2d';
      CUE.zoneCuts.forEach((cut, i) => {
        at(cut, `zone${i}`, () => {
          const zn = ZONES[i]!;
          act1.trailerAt(zn.from[0], zn.from[1], true);
          this.pan = { x0: zn.from[0], y0: zn.from[1], x1: zn.to[0], y1: zn.to[1], at: cut, len: 1.7 };
          ui.zoneCard(zn.name, zn.sub, 1500);
          this.punch(0.7);
          act1.shake(4);
        });
      });
      // X's foot comes down in the last place
      at(CUE.footLands - 0.55, 'foot', () => act1.trailerSlam(act1.player.x - 6, act1.player.y - 6, 64, 0.55));
      at(CUE.footLands, 'foot2', () => {
        this.glitch = 1;
        this.punch(1.2);
      });
      this.glidePan(T);
      act1.update(dt);
      this.d.zoom2d(1.02 + this.kickAmount());
    }

    /* ------------------------------------------------ 3. the guardians ------------------------------------------------ */
    if (T >= CUE.guardianCuts[0]! && T < CUE.edgeStart) {
      this.layer = '2d';
      CUE.guardianCuts.forEach((cut, i) => {
        at(cut, `guardian${i}`, () => {
          const g = GUARDIANS[i]!;
          ui.narrateClear();
          ui.caption(null);
          ui.speech(null);
          act1.trailerArena(g.id, g.skip);
          ui.bossTitle(g.name, g.sub, g.colour);
          this.glitch = 0.8;
          this.punch(1.1);
          act1.shake(7);
        });
      });
      act1.update(dt);
      this.d.zoom2d(1.0 + this.kickAmount());
    }

    /* ------------------------------------------------ 4. the Edge ------------------------------------------------ */
    if (T >= CUE.edgeStart && !this.boomed) {
      this.layer = '2d';
      at(CUE.edgeStart, 'edge', () => {
        ui.narrateClear();
        ui.caption(null);
        ui.speech(null);
        ui.hideBossTitle();
        act1.trailerEdge();
        ui.flash(0.4, 200);
        this.glitch = 0.6;
      });
      at(CUE.edgeStart + 0.5, 'e1', () => ui.caption('the stars are blinking out, one by one.', 1900, false, 'world'));
      at(CUE.crack - 1.3, 'e2', () => ui.caption('They were never stars.', 1300, false, 'thought'));
      const et = 1.0 + (T - CUE.edgeStart) * 1.55;
      const look = T >= CUE.crack ? 1 : smooth(unlerp(CUE.crack - 1.0, CUE.crack - 0.02, T));
      act1.trailerEdgeDrive(et, look);
      act1.update(dt);
      // the screen cracks: shorten the crack so the cubes burst on the beat
      at(CUE.crack + 0.05, 'crack', () => {
        ui.narrateClear();
        ui.caption(null);
      });
      if (T >= CUE.crack) act1.trailerCrack(((T - CUE.crack) * 2.3) / (CUE.boom - CUE.crack));
      this.d.zoom2d(1.0 + 0.04 * smooth(unlerp(CUE.edgeStart, CUE.crack, T)) + this.kickAmount());
      // if the crack did not fire the boom by itself, do it now
      if (T >= CUE.boom + 0.25) this.startBoom();
    }

    /* ------------------------------------------------ 5. the third dimension ------------------------------------------------ */
    if (this.boomed && T < CUE.finale) {
      this.layer = '3d';
      const cam = act2.arena.camera;
      // the boom and X's entrance are the game's own, with its own camera until X is revealed
      if (T < CUE.collector) {
        act2.update(dt);
        if (T >= CUE.reveal) this.xShot(T);
        at(CUE.title, 'flare', () => ui.flare());
      } else if (T < CUE.mash) {
        this.cutToBoss(1, 1.1);
        act2.update(dt);
        this.collectorShot(T);
      } else {
        this.cutToBoss(2, 1.3);
        act2.update(dt);
        this.mashShot(T);
      }
      void cam;
    }

    /* ------------------------------------------------ 6. the end card ------------------------------------------------ */
    if (T >= CUE.finale) {
      at(CUE.finale, 'fin0', () => {
        act2.trailerCutAway();
        this.layer = 'black';
        ui.caption(null);
        ui.hideBossTitle();
        ui.flash(0.9, 500);
        ui.flare();
        ui.endCard(true, 1);
      });
      at(CUE.finale + 1.2, 'fin1', () => ui.endCard(true, 2));
      at(CUE.finale + 2.4, 'fin2', () => ui.endCard(true, 3));
      at(CUE.fadeOut, 'fade', () => ui.endCard(false));
      if (T >= CUE.duration) {
        this.end();
        return;
      }
    }
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* the 2D picture: glide, punch-in, glitch                                                          */
  /* ---------------------------------------------------------------------------------------------- */

  /** a quick zoom that settles back (1 is a hard punch) */
  private punch(k: number) {
    this.kick = Math.min(1.4, this.kick + k);
  }

  private kickAmount() {
    return this.kick * this.kick * 0.09;
  }

  /** the camera glides through a place while its cut lasts */
  private glidePan(T: number) {
    const p = this.pan;
    if (!p) return;
    const u = smooth(unlerp(p.at, p.at + p.len, T));
    this.d.act1.trailerAt(lerp(p.x0, p.x1, u), lerp(p.y0, p.y1, u));
  }

  /** drawn over the 2D picture before it is shown: tears and a ghost image on a cut */
  post2d(p: Pix) {
    const g = this.glitch;
    if (g < 0.03) return;
    const w = p.w;
    const h = p.h;
    if (!this.tmp) {
      this.tmp = document.createElement('canvas');
      this.tmp.width = w;
      this.tmp.height = h;
    }
    const tctx = this.tmp.getContext('2d')!;
    tctx.drawImage(p.canvas, 0, 0);
    const ctx = p.ctx;
    const step = Math.floor(this.T * 24);
    const rnd = (n: number) => {
      const v = Math.sin(n * 127.1 + step * 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let y = 0; y < h; y += 6) {
      if (rnd(y) < 0.5 * g) {
        const off = Math.round((rnd(y + 7) - 0.5) * 60 * g);
        ctx.drawImage(this.tmp, 0, y, w, 6, off, y, w, 6);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 * g;
    ctx.drawImage(this.tmp, 4 * g, 0);
    ctx.globalAlpha = 0.18 * g;
    ctx.drawImage(this.tmp, -3 * g, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------------------------------------- */
  /* the boom and the three bosses                                                                    */
  /* ---------------------------------------------------------------------------------------------- */

  /** the screen has cracked: the real boom bursts the last 2D frame into cubes and rebuilds the world in 3D */
  private startBoom() {
    if (this.boomed || !this.running) return;
    this.boomed = true;
    this.d.act2.begin(this.d.act1.p.canvas, 0);
    this.layer = '3d';
    this.d.zoom2d(1);
  }

  /** a hero shot of X: low, from behind the small blob, looking up the length of him */
  private xShot(T: number) {
    const cam = this.d.act2.arena.camera;
    const u = smooth(unlerp(CUE.reveal, CUE.collector, T));
    cam.position.set(lerp(0.9, 0.2, u), lerp(1.3, 3.0, u), lerp(19.5, 16.0, u));
    cam.lookAt(0, lerp(10.5, 13.5, u), -29);
    cam.fov = lerp(52, 60, u);
    cam.updateProjectionMatrix();
  }

  private collectorShot(T: number) {
    const cam = this.d.act2.arena.camera;
    const u = smooth(unlerp(CUE.collector, CUE.mash, T));
    cam.position.set(lerp(5.2, 3.0, u), lerp(2.2, 4.6, u), lerp(9.0, 4.6, u));
    cam.lookAt(lerp(0, 0.4, u), lerp(11.0, 14.5, u), -27);
    cam.fov = 58;
    cam.updateProjectionMatrix();
  }

  private mashShot(T: number) {
    const cam = this.d.act2.arena.camera;
    const u = smooth(unlerp(CUE.mash, CUE.finale, T));
    cam.position.set(lerp(-9.5, -5.5, u), lerp(2.4, 4.4, u), lerp(8.0, 3.4, u));
    cam.lookAt(lerp(-1, 1, u), lerp(8.0, 10.5, u), -24);
    cam.fov = 58;
    cam.updateProjectionMatrix();
  }

  /** jump to a boss's entrance, once, with a flash, a name and a punch */
  private cutToBoss(i: number, skip: number) {
    if (this.bossIndex === i) return;
    this.bossIndex = i;
    const { act2, ui } = this.d;
    act2.trailerBoss(i, skip);
    ui.caption(null);
    ui.flash(0.55, 180);
    ui.red(0.25, 200);
    const b = act2.boss;
    ui.bossTitle(b.name, b.sub, b.colour);
  }
}
