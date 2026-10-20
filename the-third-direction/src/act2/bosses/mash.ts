import * as THREE from 'three';
import { D } from '../../core/difficulty';
import { clamp, lerp, smooth, unlerp } from '../../core/util';
import { ARENA_R, BOSS_Z } from '../arena';
import { Boss3D, type Danger, type Env, type Lance3, type Nova3, type Weak } from '../fight';
import type { Slicer } from '../kit/sdf';
import { halo } from '../kit/skin';
import { MashModel } from '../models/mash';
import { EYE_POS, MASH_S, MASH_Z, SHELL_DOCK } from '../models/mash-layout';
import * as P from '../models/mash-poses';
import { copyCtrl, mixCtrl, newCtrl } from '../models/mash-tail';
import {
  Ball,
  BELL_C,
  BreathRunner,
  ClapperRunner,
  puddleDangers,
  puddleHurt,
  RollRunner,
  SpitRunner,
  StingRunner,
  SweepRunner,
  VolleyRunner,
  WatchRunner,
  type Hub,
  type MashFx,
  type Runner,
} from './mash-attacks';
import { BeaconFX, BeamFX, BlobFX, FanFX, FlashFX, LaneFX, PuddleFX, RingFX, ShockFX, StreamFX, WindFX, type StreamDef } from './mash-fx';

/**
 * THE MASH. Every guardian the forest gave you, stitched into one thing. It cannot be hurt until one of its patches
 * fails, and each phase borrows one guardian's way of fighting:
 *   1  the bell    tolls golden rings with a gap (stand in it); its eye watches the still; the bell cracks and drops its tongue
 *   2  the spine   a scorpion's tail: stings where you will be, lashes low across the floor, spits venom; a sting that
 *                  sticks leaves the stinger in the floor
 *   3  the shell   tears loose and rolls along red lanes, bounces off the rim, crushes pillars; then it crashes into the bell
 *                  and lies on its back
 *   4  the remix   two of them at once; the flower breathes in and drags you to its maw; then the lure drops to the floor
 * Each hit makes the next round a tenth quicker.
 */

export const MASH_PIPS = [2, 2, 2, 3];

interface Beat {
  make: (b: MashBoss) => Runner[];
  /** wait for everything to be gone, not just far enough away to start the next */
  hard?: boolean;
  /** seconds to rest after it */
  wait?: number;
  /** a weak point opens in this beat: nothing else runs */
  window?: boolean;
}

const HOME_Y = 0;

export class MashBoss extends Boss3D {
  protected introLen = 4.9;
  protected dyingLen = 6.6;
  readonly model: MashModel;
  private fx: MashFx;
  private streams: StreamFX;
  private flashes: FlashFX;
  private beacon: BeaconFX;
  private hub: Hub;
  private ball = new Ball();
  private active: Runner[] = [];
  private cur: Runner[] = [];
  private beats: Beat[] = [];
  private bi = 0;
  private pause = 1;
  private cycle = 0;
  private mode: 'run' | 'hurt' = 'run';
  private hurtT = 0;
  private hitJustLanded = false;
  private pendingStart = false;
  private hurtTag = '';
  private recoil = 0;
  private said = new Set<string>();
  private shown = false;
  private tailAbrupt = false;
  private blendT = 9;
  private blendFrom = newCtrl();
  private idleC = newCtrl();
  private deadT = -1;
  private introSaid = 0;
  private sewT = 0;
  private sewStarted = false;
  private misses = 0;
  private _ctrl = newCtrl();

  constructor(env: Env, world: THREE.Group, onVictory: () => void) {
    super(env, 'mash', 'The Mash', 'every guardian, stitched back together', '#ff8aa8', MASH_PIPS, onVictory);
    this.model = new MashModel(world);
    const lanes = [new LaneFX(world), new LaneFX(world), new LaneFX(world)];
    this.fx = {
      rings: new RingFX(world, 8),
      fan: new FanFX(world),
      lanes,
      puddles: new PuddleFX(world),
      blobs: new BlobFX(world, halo),
      shocks: new ShockFX(world),
      beam: new BeamFX(world),
      wind: new WindFX(world),
    };
    this.streams = new StreamFX(world, this.streamDefs());
    this.flashes = new FlashFX(world);
    this.beacon = new BeaconFX(world);
    this.hub = { env, model: this.model, fx: this.fx, k: 1, tail: newCtrl(), tailDriven: false, say: (l, ms) => this.say(l, ms) };
    this.ball.pos.set(0, 4, MASH_Z);
    // (tests) the page can look at the fight and start any one attack
    if (typeof location !== 'undefined' && location.search.includes('debug')) (window as unknown as { __mash: MashBoss }).__mash = this;
  }

  /** (tests) what is going on */
  debugInfo() {
    return {
      phase: this.phase,
      cycle: this.cycle,
      beat: this.bi,
      beats: this.beats.length,
      mode: this.mode,
      active: this.active.map((r) => r.kind + (r.done ? '!' : r.soft ? '~' : '')),
      states: this.active.map((r) => (r as unknown as { st?: string }).st ?? ''),
      hp: this.hp,
      t: Math.round(this.pt * 10) / 10,
      misses: this.misses,
    };
  }

  /** (tests) stop the script and run one attack now */
  debugRun(kind: string) {
    this.stopAll();
    this.fx.puddles.clear();
    this.beats = [];
    this.cur = [];
    this.bi = 0;
    this.pause = 999;
    const h = this.hub;
    h.k = this.k;
    let r: Runner | null = null;
    if (kind === 'volley') r = new VolleyRunner(h, { n: 3, echo: true, gapN: 10, space: 1.3, speed: 9.5 });
    else if (kind === 'watch') r = new WatchRunner(h, 5);
    else if (kind === 'sting') r = new StingRunner(h);
    else if (kind === 'stingf') r = new StingRunner(h, true);
    else if (kind === 'sweep') r = new SweepRunner(h);
    else if (kind === 'spit') r = new SpitRunner(h, 3);
    else if (kind === 'roll') r = new RollRunner(h, this.ball, { count: 1, finisher: false });
    else if (kind === 'rollf') r = new RollRunner(h, this.ball, { count: 0, finisher: true });
    else if (kind === 'breath') r = new BreathRunner(h);
    else if (kind === 'clapper') r = new ClapperRunner(h);
    if (r) {
      this.active.push(r);
      this.cur = [r];
    }
    return !!r;
  }

  build(slicer: Slicer) {
    return this.model.build(slicer);
  }

  flattenRoot() {
    return this.model.root;
  }

  ready() {
    return this.model.ready;
  }

  show() {
    this.model.root.visible = true;
    this.model.shell.visible = true;
    this.shown = true;
  }

  hide() {
    const { env } = this;
    this.stopAll();
    this.model.root.visible = false;
    this.model.shell.visible = false;
    this.model.lightsOut();
    this.fx.rings.hide();
    this.fx.fan.hide();
    this.fx.lanes.forEach((l) => l.hide());
    this.fx.puddles.hide();
    this.fx.blobs.hide();
    this.fx.shocks.hide();
    this.fx.beam.hide();
    this.fx.wind.hide();
    this.streams.hide();
    this.flashes.hide();
    this.beacon.hide();
    env.arena.marks.hideAll();
    env.arena.setRedLight(0);
    env.audio.setHeart(0, 0);
    env.trap(false);
    this.shown = false;
  }

  /* ---------------------------------------------------------------- */
  /* words                                                              */
  /* ---------------------------------------------------------------- */

  private say(line: string, ms = 2600) {
    const { env } = this;
    env.audio.v.mashSpeak(line);
    env.ui.caption(line, ms, true);
  }

  /* ---------------------------------------------------------------- */
  /* the entrance: five streams of light stitch it together             */
  /* ---------------------------------------------------------------- */

  private streamDefs(): StreamDef[] {
    const m = this.model;
    const to = (x: number, y: number, z: number) => m.toWorld(new THREE.Vector3(x, y, z));
    return [
      // the Gloommother: cyan, from the dark on the left, to the base
      { color: 0x6ff0ff, from: new THREE.Vector3(-58, 22, -52), to: to(0, 1.5, 5), at: 0.15, dur: 1.55, swirl: 8, turns: 1.6 },
      // the Thornback King: amber, from the right, to the shell
      { color: 0xffb35a, from: new THREE.Vector3(60, 12, -40), to: to(SHELL_DOCK.x, SHELL_DOCK.y, SHELL_DOCK.z), at: 0.5, dur: 1.6, swirl: 8, turns: 1.3 },
      // the Toll Queen: violet, from above, to the bell
      { color: 0xb08cff, from: new THREE.Vector3(-20, 46, -66), to: to(0, 4, 2), at: 0.85, dur: 1.65, swirl: 9, turns: 1.8 },
      // the Bone Wyrm: bone white, from the wall far on the right, to the root of the spine
      { color: 0xf4efe0, from: new THREE.Vector3(48, 34, -62), to: to(2.6, 4, -3), at: 1.2, dur: 1.65, swirl: 8, turns: 1.4 },
      // the Mimic Queen: pink, from the dark above, to the flower
      { color: 0xff7aa8, from: new THREE.Vector3(10, 52, -58), to: to(0, 5.0, 3.3), at: 1.55, dur: 1.7, swirl: 9, turns: 2.0 },
    ];
  }

  protected onBegin() {
    const { env, model: m } = this;
    this.show();
    this.resetAll();
    this.deadT = -1;
    m.resetDeath();
    const s = m.partScale;
    s.tendrils = s.shell = s.bell = s.tail = s.bloom = s.eye = 0;
    m.stitches.sew(0);
    m.bloomStitches.sew(0);
    m.eyeStitches.sew(0);
    m.shellStitches.sew(0);
    m.bloomOpen = 0.15;
    m.eyeOpen = 0.1;
    this.introSaid = 0;
    this.sewT = 0;
    this.sewStarted = false;
    this.said.clear();
    env.audio.setDrone(0.2, 1.5);
    env.audio.v.motherWhispers(3);
    window.setTimeout(() => env.audio.v.wyrmHiss(1.2), 600);
  }

  protected updateIntro(dt: number) {
    const { env, model: m } = this;
    const t = this.st;
    this.streams.update(t);
    const pop = (at: number) => easeOutBack(unlerp(at, at + 0.55, t));
    const s = m.partScale;
    s.tendrils = pop(1.7);
    s.shell = pop(2.05);
    s.bell = pop(2.4);
    s.tail = pop(2.75);
    s.bloom = pop(3.1);
    s.eye = pop(3.2);
    // every part lands with a thump, a flare and a ring of its colour on the floor
    const marks: [number, number, number, number, number][] = [
      [1.7, 0x6ff0ff, 0, 1.5, 4],
      [2.05, 0xffb35a, SHELL_DOCK.x, SHELL_DOCK.y, SHELL_DOCK.z],
      [2.4, 0xb08cff, 0, 4, 2],
      [2.75, 0xf4efe0, 2.6, 4, -3],
      [3.1, 0xff7aa8, 0, 5.0, 3.3],
    ];
    marks.forEach(([at, col, x, y, z], i) => {
      if (this.introSaid <= i && t >= at) {
        this.introSaid = i + 1;
        const w = m.toWorld(new THREE.Vector3(x, y, z));
        env.arena.burst3(w.x, w.y, w.z, 30, [col, 0xffffff, col, 0x07040a], 12);
        this.flashes.add(w.x, w.y, w.z, 18, 0.55, col);
        this.fx.shocks.add(w.x, Math.max(w.z, MASH_Z + 4), 13, col, 0.65);
        env.ui.flash(0.14, 140);
        m.flash(0.55);
        env.audio.thump(0.9);
        env.shake(0.55);
        env.audio.click();
      }
    });
    // the stitching: the black thread goes in white-hot, with a ratchet of clicks and a spark at every needle
    const p = unlerp(2.3, 3.95, t);
    const spark = (w: THREE.Vector3) => {
      this.flashes.add(w.x, w.y, w.z, 7.5, 0.5);
      env.arena.burst3(w.x, w.y, w.z, 2, [0xffd890, 0xffffff, 0xff9a4a], 5);
    };
    if (p > 0 && !this.sewStarted) {
      this.sewStarted = true;
      env.ui.flash(0.22, 200);
    }
    m.stitches.sew(p, dt, spark);
    m.bloomStitches.sew(p, dt, spark);
    m.eyeStitches.sew(p, dt, spark);
    m.shellStitches.sew(p, dt, spark);
    this.sewT -= dt;
    if (p > 0 && p < 1 && this.sewT <= 0) {
      this.sewT = 0.12;
      env.audio.click();
      env.audio.v.rattle({ n: 4, gap: 0.025, f: 2600, q: 5, gain: 0.55, dur: 0.02, wet: 0.1 });
    }
    // it wakes: the bloom opens, the eye
    const wake = smooth(unlerp(3.9, 4.7, t));
    m.bloomOpen = lerp(0.15, 1, wake);
    m.eyeOpen = lerp(0.1, 0.55, wake);
    m.lookAt(env.p.x, 2, env.p.z);
    if (this.introSaid === 5 && t >= 3.95) {
      this.introSaid = 6;
      env.audio.v.mashRoar();
      env.ui.flash(0.8, 600);
      env.shake(1.3);
      m.roar = 1;
      window.setTimeout(() => this.say('we were guarding you.', 2800), 500);
    }
    if (t > 3.95) m.roar = Math.max(0, 1 - (t - 3.95) * 0.9);
    env.arena.setRedLight(100 + 60 * Math.sin(t * 5));
    void dt;
  }

  /** the entrance is cut short (a debug jump): the Mash is whole */
  private finishAssembly() {
    const m = this.model;
    const s = m.partScale;
    s.tendrils = s.shell = s.bell = s.tail = s.bloom = s.eye = 1;
    m.stitches.reset();
    m.bloomStitches.reset();
    m.eyeStitches.reset();
    m.shellStitches.reset();
    m.bloomOpen = 1;
    m.eyeOpen = 0.35;
    m.roar = 0;
    this.streams.hide();
    this.flashes.hide();
  }

  /* ---------------------------------------------------------------- */
  /* phases                                                            */
  /* ---------------------------------------------------------------- */

  private get k(): number {
    return Math.pow(0.9, this.cycle);
  }

  private stopAll() {
    for (const r of this.active) r.stop();
    this.active.length = 0;
    this.cur.length = 0;
    this.hub.tailDriven = false;
    this.tailAbrupt = true;
    const { env } = this;
    env.arena.marks.hideAll();
    env.audio.setHeart(0, 0);
    this.fx.wind.hide();
    this.fx.fan.hide();
    this.fx.lanes.forEach((l) => l.hide());
    this.fx.beam.hide();
    this.fx.blobs.hide();
    this.model.tail.setPillars([]);
  }

  /** clear everything the fight put in the world and set the Mash to rest */
  private resetAll() {
    const { env, model: m } = this;
    this.stopAll();
    this.fx.rings.clear();
    this.fx.puddles.clear();
    this.fx.shocks.hide();
    this.beats = [];
    this.bi = 0;
    this.mode = 'run';
    this.hurtT = 0;
    this.pendingStart = false;
    this.hitJustLanded = false;
    this.recoil = 0;
    this.misses = 0;
    m.inhale = 0;
    m.lean = 0;
    m.roar = 0;
    m.mawOpen = 0.5;
    m.toll = 0;
    m.shake = 0;
    m.bellLift = 0;
    m.tendrilPull = 0;
    m.tendrilReach = 0;
    m.setLure(0, 0.6);
    m.setClapper(0, 0, 9.5);
    m.eyeOpen = Math.min(m.eyeOpen, 0.4);
    this.ball.docked = true;
    this.ball.shudder = 0;
    m.dockShell();
    for (let i = env.solids.length - 1; i >= 0; i--) if ((env.solids[i] as { mash?: boolean }).mash) env.solids.splice(i, 1);
    env.trap(false);
    env.arena.restorePillars();
    // how broken it looks follows the health it has now (a phase starts over, a debug jump)
    m.setDamage(clamp((this.maxHp - this.hp) / this.maxHp, 0, 1));
  }

  protected startPhase() {
    // the hit that ended the last phase plays out for a moment first
    if (this.hitJustLanded && this.state === 'fight') {
      this.pendingStart = true;
      return;
    }
    this.realStart();
  }

  private realStart() {
    const { env } = this;
    if (this.model.partScale.bell < 1) this.finishAssembly();
    this.resetAll();
    this.cycle = 0;
    this.pendingStart = false;
    this.beats = this.script();
    this.bi = 0;
    this.pause = this.phase === 0 && this.t < 6 ? 0.8 : 1.3;
    this.mode = 'run';
    const lines = ['stitch.', 'stay together.', 'do not run.', 'all of us. at once.'];
    const line = lines[Math.min(this.phase, 3)]!;
    if (this.phase > 0) {
      env.audio.v.mashRoar();
      env.shake(0.9);
      env.ui.flash(0.4, 260);
    }
    if (!this.said.has(line)) {
      this.said.add(line);
      window.setTimeout(() => {
        if (this.state === 'fight') this.say(line);
      }, 700);
    }
    this.pt = 0;
  }

  protected restartPhase() {
    this.resetAll();
    this.cycle = 0;
    this.beats = this.script();
    this.bi = 0;
    this.pause = 1.6;
    this.mode = 'run';
    this.tailAbrupt = true;
  }

  protected onPhaseEnd() {
    this.cycle = 0;
  }

  /** the beats of one round of the current phase */
  private script(): Beat[] {
    const k = this.k;
    const ph = Math.min(this.phase, 3);
    const c = this.cycle;
    const space = Math.max(0.95, 1.3 * k);
    const vol = (n: number, echo: boolean, gapN = 8, sp = space) => (b: MashBoss) => [new VolleyRunner(b.hub, { n, echo, gapN: Math.max(7, gapN - (c > 0 ? 1 : 0)), space: sp, speed: 9.5 })];
    if (ph === 0) {
      return [
        { make: vol(2, false, 9), hard: true, wait: 0.5 },
        { make: (b) => [new WatchRunner(b.hub, 2.0)], hard: true, wait: 0.3 },
        { make: vol(3, true, 8), hard: true, wait: 0.7 },
        { make: (b) => [new ClapperRunner(b.hub)], hard: true, window: true, wait: 0.6 },
      ];
    }
    if (ph === 1) {
      return [
        { make: (b) => [new StingRunner(b.hub)], wait: 0.35 },
        { make: (b) => [new SweepRunner(b.hub)], wait: 0.45 },
        { make: (b) => [new SpitRunner(b.hub, 3)], hard: true, wait: 0.6 },
        { make: (b) => [new StingRunner(b.hub)], wait: 0.3 },
        { make: (b) => [new StingRunner(b.hub, true)], hard: true, window: true, wait: 0.6 },
      ];
    }
    if (ph === 2) {
      return [
        { make: (b) => [new RollRunner(b.hub, b.ball, { count: 2, finisher: true })], hard: true, window: true, wait: 0.6 },
      ];
    }
    // the remix: two at once, and the flower. The first pair does not wait for its last ring to leave the floor (the next
    // beat starts when nothing it could still hurt you with is near), so the whole round is a run of overlapping dangers
    // rather than long gaps; the roll and spit pair waits for the shell to be home, the breath for the lure.
    const sp4 = Math.max(0.85, 1.05 * k);
    const combos: Beat[][] = [
      [
        { make: (b) => [...vol(2, true, 8, sp4)(b), new StingRunner(b.hub)], wait: 0.4 },
        { make: (b) => [new RollRunner(b.hub, b.ball, { count: 1, finisher: false }), new SpitRunner(b.hub, 3)], hard: true, wait: 0.4 },
      ],
      [
        { make: (b) => [...vol(3, false, 8, sp4)(b), new SpitRunner(b.hub, 3)], wait: 0.4 },
        { make: (b) => [new RollRunner(b.hub, b.ball, { count: 1, finisher: false }), new StingRunner(b.hub)], hard: true, wait: 0.4 },
      ],
      [
        { make: (b) => [...vol(2, true, 7, sp4)(b), new SweepRunner(b.hub)], wait: 0.4 },
        { make: (b) => [new RollRunner(b.hub, b.ball, { count: 2, finisher: false }), new SpitRunner(b.hub, 3)], hard: true, wait: 0.4 },
      ],
    ];
    return [...combos[c % 3]!, { make: (b) => [new BreathRunner(b.hub)], hard: true, window: true, wait: 0.5 }];
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  protected updateFight(dt: number) {
    const { env, model: m } = this;
    const h = this.hub;
    h.k = this.k;
    h.tailDriven = false;
    m.lookAt(env.p.x, 1.4, env.p.z);
    // everything that is out there runs
    for (let i = this.active.length - 1; i >= 0; i--) {
      const r = this.active[i]!;
      r.update(dt);
      if (r.done) this.active.splice(i, 1);
    }
    puddleHurt(h);
    if (this.mode === 'hurt') {
      this.hurtT += dt;
      // the tail jerks if no attack is still using it
      if (!h.tailDriven) {
        P.recoilPose(this.hurtT / 1.6, this.t, h.tail);
        h.tailDriven = true;
      }
      if (this.hurtT >= 1.3 && this.active.every((r) => r.done || r.soft)) this.endHurt();
      return;
    }
    // the script
    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }
    const beat = this.beats[this.bi];
    if (!beat) {
      this.roundOver();
      return;
    }
    if (this.cur.length === 0) {
      if (beat.window) this.fx.puddles.clear();
      this.cur = beat.make(this);
      this.active.push(...this.cur);
      return;
    }
    const finished = this.cur.every((r) => (beat.hard ? r.done : r.soft || r.done));
    if (finished) {
      this.cur = [];
      this.bi++;
      this.pause = (beat.wait ?? 0.4) * this.k;
      if (this.bi >= this.beats.length) {
        // the last one was a window nobody used: it goes round again, from further back
        this.roundOver();
      }
    }
  }

  /** a round ended without a hit (the window closed): replay the end of it */
  private roundOver() {
    this.misses++;
    this.bi = Math.max(0, this.beats.length - (this.phase === 3 ? 3 : this.phase === 0 ? 2 : this.phase === 1 ? 3 : 1));
    this.pause = 0.6;
    this.cur = [];
  }

  private endHurt() {
    this.mode = 'run';
    this.hitJustLanded = false;
    this.tailAbrupt = true;
    if (this.pendingStart) {
      this.realStart();
      return;
    }
    // more hits to go in this phase: the same round again, quicker
    this.cycle++;
    this.stopAll();
    this.fx.puddles.clear();
    this.fx.rings.clear();
    this.model.setLure(0, 0.6);
    this.model.setClapper(0, 0, 9.5);
    this.beats = this.script();
    this.bi = 0;
    this.pause = 0.8;
    this.misses = 0;
  }

  protected onHit(x: number, y: number, z: number) {
    const { env, model: m } = this;
    this.hitJustLanded = true;
    this.mode = 'hurt';
    this.hurtT = 0;
    this.recoil = 1;
    m.flash(1);
    env.ui.flash(0.5, 300);
    env.shake(1.1);
    // whichever patch failed
    for (const r of this.active) r.struck?.();
    this.cur = [];
    this.hurtTag = this.phase === 0 ? 'bell' : this.phase === 1 ? 'tail' : this.phase === 2 ? 'shell' : 'flower';
    const v = env.audio.v;
    if (this.hurtTag === 'bell') {
      v.queenShriek(1);
      env.arena.burst3(x, y, z, 30, [0xf4c95c, 0xff7ac0, 0xffffff, 0x2a9482], 11);
    } else if (this.hurtTag === 'tail') {
      v.wyrmScreech(0.9);
      env.arena.burst3(x, y, z, 30, [0xf4efe0, 0xb8ff7a, 0xffffff], 11);
    } else if (this.hurtTag === 'shell') {
      v.kingBellow();
      env.arena.burst3(x, y, z, 30, [0x3a4c7c, 0xe0502a, 0xffb35a, 0xffffff], 11);
    } else {
      v.mimicSnarl();
      v.queenShriek(0.8);
      env.arena.burst3(x, y, z, 34, [0xff7aa8, 0xff3a8a, 0x6ff0ff, 0xffffff], 12);
    }
    this.fx.puddles.clear();
    this.fx.rings.clear();
    const dmg = clamp((this.maxHp - Math.max(0, this.hp)) / this.maxHp, 0, 1);
    m.setDamage(dmg);
    const lines = ['no.', 'stay together.', 'stitch.', 'hold.'];
    if (this.hp > 0 && Math.random() < 0.7) window.setTimeout(() => this.state === 'fight' && this.say(lines[Math.floor(Math.random() * lines.length)]!, 1600), 350);
  }

  /* ---------------------------------------------------------------- */
  /* animation                                                          */
  /* ---------------------------------------------------------------- */

  protected animate(dt: number) {
    const { env, model: m } = this;
    const h = this.hub;
    this.recoil = Math.max(0, this.recoil - dt * 2.2);
    m.root.position.z = MASH_Z - this.recoil * 1.2;
    this.fx.rings.update();
    this.fx.puddles.update(dt, env.time);
    this.fx.shocks.update(dt);
    this.flashes.update(dt);
    this.fx.lanes.forEach((l) => l.scroll(env.time));
    // the tail: whatever an attack asked for, or the curl; a sudden change is blended
    let desired = h.tail;
    if (this.state === 'dying' || this.state === 'gone') desired = h.tail;
    else if (!h.tailDriven) {
      P.idlePose(env.time, this.idleC);
      desired = this.idleC;
    }
    if (this.tailAbrupt) {
      copyCtrl(this.blendFrom, m.tail.ctrl);
      this.blendT = 0;
      this.tailAbrupt = false;
    }
    if (this.state !== 'dying' && this.state !== 'gone') {
      if (this.blendT < 0.4) {
        this.blendT += dt;
        mixCtrl(this._ctrl, this.blendFrom, desired, smooth(this.blendT / 0.4));
        copyCtrl(m.tail.ctrl, this._ctrl);
      } else copyCtrl(m.tail.ctrl, desired);
    }
    // the shell: docked to the bell, or loose
    const b = this.ball;
    if (b.docked) m.dockShell();
    else {
      m.shell.position.copy(b.pos);
      m.spinner.quaternion.copy(b.q);
    }
    if (b.shudder > 0) m.spinner.position.set((Math.random() - 0.5) * b.shudder * 0.5, (Math.random() - 0.5) * b.shudder * 0.4, (Math.random() - 0.5) * b.shudder * 0.5);
    else m.spinner.position.set(0, 0, 0);
    // the light
    if (this.state === 'fight') env.arena.setRedLight(55 + 25 * Math.sin(env.time * 2.5) + (this.mode === 'hurt' ? 60 * (1 - this.hurtT) : 0));
    else if (this.state === 'dying') env.arena.setRedLight(Math.max(0, 90 * (1 - this.st / 3)));
    m.update(dt, env.time);
    this.weakGlow();
    // slow decay of the model's one-shot values
    m.toll = Math.max(0, m.toll - dt * 1.4);
    if (this.state === 'fight' && !this.active.some((r) => r instanceof ClapperRunner)) m.shake = Math.max(0, m.shake - dt * 2);
    // the eye closes again when nothing watches
    if (this.state === 'fight' && !this.active.some((r) => r instanceof WatchRunner)) m.eyeOpen += (0.38 - m.eyeOpen) * (1 - Math.exp(-3 * dt));
  }

  /** whatever can be hurt right now wears a column of light and, on the floor, the ring a strike must start inside */
  private weakGlow() {
    const { env } = this;
    const w = this.weak()[0];
    if (!w) {
      this.beacon.hide();
      env.arena.marks.set(13, false);
      return;
    }
    const col = w.tag === 'lure' ? 0xff8ab4 : w.tag === 'belly' ? 0xffb35a : w.tag === 'stinger' ? 0xdfffa0 : 0xffe070;
    // (the stinger in the floor is its own light: a column over it would only hide it)
    this.beacon.set(w.x, w.z, 1.0 + Math.min(w.r * 0.2, 0.6), col, env.time, w.tag !== 'stinger');
    const pulse = 0.5 + 0.5 * Math.sin(env.time * 7);
    env.arena.marks.set(13, true, w.x, w.z, w.reach, { col, fill: 0, alpha: 0.55 + 0.45 * pulse });
  }

  /* ---------------------------------------------------------------- */
  /* being hit                                                          */
  /* ---------------------------------------------------------------- */

  weak(): Weak[] {
    const out: Weak[] = [];
    if (this.state !== 'fight' || this.mode !== 'run') return out;
    for (const r of this.active) r.weak(out);
    return out;
  }

  dangers(): Danger[] {
    const out: Danger[] = [];
    if (this.state !== 'fight') return out;
    for (const r of this.active) r.dangers(out);
    puddleDangers(this.hub, out);
    return out;
  }

  onLance(_l: Lance3): boolean {
    return false;
  }

  onNova(n: Nova3): void {
    // light burns the venom away
    for (const p of this.fx.puddles.list) if (p.on && Math.hypot(p.x - n.x, p.z - n.z) < n.R + p.r * 0.5) p.t = Math.max(p.t, p.life - 0.8);
  }

  /* ---------------------------------------------------------------- */
  /* the end                                                           */
  /* ---------------------------------------------------------------- */

  protected onDie() {
    const { env, model: m } = this;
    this.stopAll();
    this.fx.puddles.clear();
    this.fx.rings.clear();
    env.audio.v.mashRoar();
    window.setTimeout(() => env.audio.v.mashRoar(), 1500);
    m.flash(1);
    this.deadT = 0;
    m.roar = 1;
    m.setClapper(0, 0, 9.5);
    m.setLure(0, 0.6);
    this.ball.docked = true;
    m.dockShell();
    for (let i = env.solids.length - 1; i >= 0; i--) if ((env.solids[i] as { mash?: boolean }).mash) env.solids.splice(i, 1);
    window.setTimeout(() => this.state === 'dying' && this.say('thank you.', 3400), 3800);
  }

  protected updateDying(dt: number) {
    const { env, model: m } = this;
    const t = this.st;
    this.deadT = t;
    const h = this.hub;
    h.tailDriven = true;
    m.setDeath(t, h.tail);
    copyCtrl(m.tail.ctrl, h.tail);
    // five lights leave: each guardian goes home
    if (t > 2.6) this.streams.update(t - 2.6, true);
    // the stitches tear, the pieces fall: sparks of every colour
    if (t < 4.8 && Math.random() < dt * 14) {
      const cols = [0x6ff0ff, 0xffb35a, 0xb08cff, 0xf4efe0, 0xff7aa8];
      env.arena.burst3((Math.random() - 0.5) * 22, 1 + Math.random() * 13, MASH_Z + (Math.random() - 0.3) * 8, 3, [cols[Math.floor(Math.random() * 5)]!, 0x07040a], 6);
    }
    env.shake(Math.max(0, 0.45 * (1 - t / 4)));
    if (Math.floor(t * 6) !== Math.floor((t - dt) * 6) && t < 3.4 && t > 0.8) env.audio.snap();
    void h;
  }

  cinematic() {
    // (the camera goes to (0.3 x, 0.8 y + 4, z + dist) and looks at (x, y, z): from far enough out the whole width is in view)
    if (this.state === 'dying') return { x: 0, y: 9, z: MASH_Z, dist: 46 };
    return null;
  }
}

const easeOutBack = (t: number) => {
  t = clamp(t, 0, 1);
  return 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
};

void ARENA_R;
void BOSS_Z;
void HOME_Y;
void BELL_C;
void EYE_POS;
void MASH_S;
