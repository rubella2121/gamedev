import { say, STORY } from '../../core/story';
import * as THREE from 'three';
import { D } from '../../core/difficulty';
import { clamp, lerp, smooth, TAU, unlerp } from '../../core/util';
import { ARENA_R, BOSS_Z, groundY, LANES } from '../arena';
import { Boss3D, type Danger, type Env, type Lance3, type Nova3, type Weak } from '../fight';
import type { Slicer } from '../kit/sdf';
import { XModel } from '../models/x';

/**
 * X, the Hollow. He cannot be hurt until he is stuck, and he only gets stuck by committing to an attack.
 *   1  foot   a shadow shrinks on the floor and a foot the size of a house stamps it flat
 *             AFTERSHOCK: some stamps crack the floor, and a ring of shock runs out from the foot: dash through it
 *   2  rake   nine bony arms rake the floor in lanes; the second rake lands in the first one's gaps
 *             CROSS-RAKE: the arms come at you from his side of the floor instead, lanes running towards you
 *   3  gaze   his neck stretches, his three eyes turn and a beam sweeps the floor: hide behind a pillar
 *             GLARE: between sweeps his eyes pick you out, three times, and fire short beams where you stood
 *   4  jaws   maws bloom under your feet; in the end his core drops out of the hollow and shows
 *             MAW CHASE: maws open one after another just ahead of you: keep turning
 * Each phase takes several hits. After each one he gets faster.
 */

type FSt = 'wait' | 'tele' | 'impact' | 'stuck' | 'retract' | 'clear';
type Kind = 'foot' | 'rake' | 'gaze' | 'jaws';

/** One attack in a phase: wait before it, telegraph time, and whether it is the finisher that leaves X stuck. */
type Step = { w: number; T: number; lead?: number; fin?: boolean; flip?: boolean; off?: number; quake?: boolean; cross?: boolean };

const FOOT_STEPS: Step[] = [
  { w: 1.2, T: 1.6, lead: 0.15 },
  { w: 0.7, T: 1.4, lead: 0.3, quake: true },
  { w: 0.55, T: 1.25, lead: 0.35 },
  { w: 0.55, T: 1.2, lead: 0.4 },
  { w: 0.75, T: 1.35, lead: 0.25, quake: true },
  { w: 0.55, T: 1.15, lead: 0.4 },
  { w: 0.55, T: 1.1, lead: 0.4 },
  { w: 0.8, T: 1.35, lead: 0.2, fin: true },
];
const RAKE_STEPS: Step[] = [
  { w: 1.1, T: 1.2 },
  { w: 0.15, T: 0.9, flip: true, off: 2.35 },
  { w: 0.6, T: 1.15, cross: true },
  { w: 0.15, T: 0.85, cross: true, flip: true, off: -2.35 },
  { w: 0.6, T: 1.0 },
  { w: 0.15, T: 0.8, flip: true, off: -2.35 },
  { w: 0.5, T: 1.0, cross: true },
  { w: 0.6, T: 1.15, fin: true },
];
const GAZE_ARC = 1.5;
/** each beat of the gaze: a sweep across the floor (its length in seconds), or a glare (three aimed shots) */
const GAZE_SEQ: (number | 'glare')[] = [3.7, 'glare', 3.1, 'glare', 2.7, 2.4];
/** aiming, locked (it blinks), firing: seconds, for each shot of a glare */
const GLARE = { aim: 0.75, lock: 0.28, fire: 0.24, shots: 3 };
/** a maw chase: how many, how far apart in time, how far ahead of you */
const CHASE = { n: 7, gap: 0.3, lead: 0.42, T: 0.7 };
const JAW_STEPS: { n: number; r: number; T: number; chase?: boolean }[] = [
  { n: 3, r: 2.8, T: 1.0 },
  { n: 0, r: 0, T: CHASE.T, chase: true },
  { n: 4, r: 2.6, T: 0.9 },
  { n: 4, r: 2.2, T: 0.8 },
  { n: 0, r: 0, T: CHASE.T * 0.9, chase: true },
  { n: 4, r: 2.0, T: 0.7 },
];
const KINDS: Kind[] = ['foot', 'rake', 'gaze', 'jaws'];
export const X_PIPS = [3, 3, 3, 4];
const BG_BOSS_Z = BOSS_Z + 1.5;
/** Where the Watcher's head hangs when it lowers to look along the floor. */
const HEAD_G = { x: 0, z: BG_BOSS_Z + 9.5 };
const FOOT_R = 3.5;
/** how high the foot hangs while its shadow closes in (the camera is behind the player, at about this height) */
const FOOT_HOVER = 19;
const RAKE_END = 10;
const LANE_GAP = 4.7;
/** floor marks of his own (the Collector uses the low ones) */
const MARK_QUAKE = 10;
const MARK_GLARE = 11;
/** the shock ring of a quake: a moment of rumble after the stamp, then it runs out (how far, how fast, how thick) */
const QUAKE = { wait: 0.4, max: 14, speed: 7.0, half: 0.55 };

export class XBoss extends Boss3D {
  protected introLen = 3.4;
  protected dyingLen = 4.6;
  readonly model: XModel;
  private fst: FSt = 'wait';
  private ft = 0;
  private si = 0;
  private cycle = 0;
  private deferred = false;
  private foot = { x: 0, z: 0 };
  private rake = { dir: 1, lanes: [] as number[], armX: 0, base: 0, cross: false };
  /** the shock ring of the last quake (r < 0: none) */
  private quake = { x: 0, z: 0, r: -1, hit: false, wait: 0 };
  /** the glare: which shot, where it is aiming, where it locked */
  private glare = { shot: 0, t: 0, x: 0, z: 0, ax: 0, az: 0, th: 0 };
  /** the maw chase: where each one is, and when it was placed */
  private chase: { x: number; z: number; t0: number; shut: boolean }[] = [];
  private gazeDir = 1;
  private gazeTh = 0;
  private headLow = false;
  private jawT: { x: number; z: number }[] = [];
  private lunge = { x: 0, z: 0 };
  private coreOn = false;
  private coreLit = 0;
  private chimes = 0;
  private armorU = 0;
  private recoil = 0;
  private shown = false;
  private dieMat = 0;
  private said = new Set<string>();
  private warnT = 0;
  private footLanded = false;

  constructor(env: Env, world: THREE.Group, onVictory: () => void) {
    super(env, 'x', 'X, the Hollow', 'it fell in from the third dimension', '#ff3a4a', X_PIPS, onVictory);
    this.model = new XModel(world, BG_BOSS_Z);
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

  private get kind(): Kind {
    return KINDS[Math.min(this.phase, KINDS.length - 1)]!;
  }

  /** how long his warnings and waits are: each hit he takes makes the next round quicker, an easier mode gives more time */
  private get speedK(): number {
    // a little quicker each time round, but never more than a fifth
    return Math.max(0.8, Math.pow(0.93, this.cycle)) * D.tele;
  }

  show() {
    this.model.root.visible = true;
    this.shown = true;
  }

  hide() {
    this.model.root.visible = false;
    this.model.foot.visible = false;
    this.model.rakeArms.forEach((a) => (a.group.visible = false));
    this.model.setGaze(false);
    this.model.setCore(false);
    for (let i = 0; i < 4; i++) this.model.setJawSlot(i, false);
    this.env.arena.marks.set(MARK_QUAKE, false);
    this.env.arena.marks.set(MARK_GLARE, false);
    this.quake.r = -1;
    this.chase = [];
    this.shown = false;
  }

  /* ---------------------------------------------------------------- */
  /* entrance and exit                                                 */
  /* ---------------------------------------------------------------- */

  protected onBegin() {
    const { env, model: m } = this;
    this.show();
    m.setHead(0);
    m.setJaw(0);
    m.setWide(0);
    m.setArmor(0);
    m.setGaze(false);
    m.setCore(false);
    this.armorU = 0;
    this.resetState();
    this.said.clear();
    this.dieMat = 0;
    env.audio.v.xBreath();
    window.setTimeout(() => env.audio.v.xGrowl(1), 1500);
    window.setTimeout(() => env.audio.v.xRoar(), 2400);
    window.setTimeout(() => this.say('there you are.'), 3000);
  }

  private say(line: string, ms = 2600) {
    if (this.cut) return;
    const { env } = this;
    env.audio.v.xSpeak(line);
    env.ui.caption(line, ms, true);
  }

  protected updateIntro(dt: number) {
    const m = this.model;
    // he straightens up, his lids open one after another, his mouth works
    const u = smooth(unlerp(0.2, 2.6, this.st));
    m.setWide(u);
    m.setJaw(0.25 * Math.sin(this.st * 2.4) * u);
    m.lookAt(this.env.p.x, 2, this.env.p.z);
    void dt;
  }

  protected onHit(x: number, y: number, z: number) {
    const { env, model: m } = this;
    this.recoil = 1;
    env.audio.v.xGrowl(1.3);
    m.flash(1);
    env.ui.flash(0.5, 300);
    // everything he had out stops where it is
    this.fst = 'clear';
    this.ft = 0;
    env.arena.hideShadow();
    env.arena.marks.set(MARK_GLARE, false);
    if (this.kind === 'foot' && this.phase === 0 && this.armorU === 0) this.armorU = 0.001;
    // what he was hit with bursts
    if (this.kind === 'foot') env.arena.burst3(this.foot.x, 1.5, this.foot.z, 24, [0x07040e, 0x6ff0ff, 0x2a1a44], 9);
    else if (this.kind === 'rake') for (const l of this.rake.lanes) env.arena.burst3(this.rake.dir * RAKE_END, 0.7, l, 8, [0xf4efe0, 0xd8d0b8, 0x6a5a98], 8);
    else if (this.kind === 'gaze') env.arena.burst3(HEAD_G.x, 5.5, HEAD_G.z, 30, [0xff3040, 0xffeeee, 0x3a2660], 9);
    else env.arena.burst3(this.lunge.x, 1.2, this.lunge.z, 40, [0xe080ff, 0xffffff, 0x6a1a8a], 11);
    void x;
    void y;
    void z;
  }

  protected onPhaseEnd() {
    this.cycle = 0;
  }

  protected onDie() {
    const { env, model: m } = this;
    env.arena.hideShadow();
    env.audio.v.xRoar();
    window.setTimeout(() => env.audio.v.xBreath(), 1800);
    this.fst = 'clear';
    m.setGaze(false);
    for (let i = 0; i < 4; i++) m.setJawSlot(i, false);
    env.ui.caption('...', 1200, true);
    window.setTimeout(() => say(env.ui, STORY.xDies), 1500);
  }

  protected updateDying(dt: number) {
    const { env, model: m } = this;
    const u = this.st / this.dyingLen;
    // the foot, the arms and the beam are gone; his light goes out and he comes apart
    m.foot.position.y = lerp(m.foot.position.y, 40, 1 - Math.exp(-4 * dt));
    m.rakeArms.forEach((a) => (a.group.visible = false));
    m.setCore(false);
    m.setHead(smooth(unlerp(0, 0.5, u)) * 0.55);
    m.setJaw(smooth(unlerp(0, 0.4, u)));
    m.setWide(1 - smooth(unlerp(0.2, 0.7, u)));
    this.armorU = Math.min(1, this.armorU + dt * 0.4);
    // turn him to a silhouette
    this.dieMat = smooth(unlerp(0.15, 0.8, u));
    m.root.position.y = -3.5 - smooth(unlerp(0.6, 1, u)) * 7;
    if (Math.random() < dt * 12) env.arena.burst3((Math.random() - 0.5) * 8, 4 + Math.random() * 12, BG_BOSS_Z + 1, 6, [0x05030a, 0x1a1030, 0xff3a4a], 5);
    env.arena.setRedLight(80 * (1 - this.dieMat));
    env.shake(0.35 * (1 - u));
  }

  /* ---------------------------------------------------------------- */
  /* the phases                                                        */
  /* ---------------------------------------------------------------- */

  private resetState() {
    const { env, model: m } = this;
    this.fst = 'wait';
    this.ft = -0.6;
    this.si = 0;
    this.headLow = false;
    this.coreOn = false;
    this.coreLit = 0;
    this.chimes = 0;
    m.foot.visible = false;
    m.rakeArms.forEach((a) => (a.group.visible = false));
    m.setGaze(false);
    m.setCore(false);
    m.setHead(0);
    m.setJaw(0);
    for (let i = 0; i < 4; i++) m.setJawSlot(i, false);
    env.arena.hideShadow();
    env.arena.lanes.forEach((l) => {
      l.visible = false;
      l.rotation.y = 0;
    });
    env.arena.marks.set(MARK_QUAKE, false);
    env.arena.marks.set(MARK_GLARE, false);
    this.quake.r = -1;
    this.chase = [];
    if (this.phase <= 2) env.arena.restorePillars();
  }

  protected startPhase() {
    // the hit that ended the last phase plays out for a moment first
    if (this.fst === 'clear' && this.state === 'fight' && this.phase > 0) {
      this.deferred = true;
      return;
    }
    this.realStart();
  }

  private realStart() {
    const { env } = this;
    this.cycle = 0;
    this.resetState();
    this.ft = -0.6;
    const lines = ['hold still.', 'come here, little line.', 'i see all of you.', 'open.'];
    const line = lines[Math.min(this.phase, 3)]!;
    if (!this.said.has(line)) {
      this.said.add(line);
      window.setTimeout(() => this.say(line), 500);
    }
    if (this.phase > 0) {
      env.audio.v.xRoar();
      env.shake(0.8);
    }
    this.pt = 0;
  }

  protected restartPhase() {
    this.cycle = 0;
    this.deferred = false;
    this.resetState();
    this.ft = -1.2;
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  protected updateFight(dt: number) {
    const { env, model: m } = this;
    const pl = env.p;
    this.ft += dt;
    m.lookAt(pl.x, 1.5, pl.z);
    this.warnT = Math.max(0, this.warnT - dt);
    this.runQuake(dt);
    if (this.fst === 'clear') {
      this.updateClear(dt);
      return;
    }
    const kind = this.kind;
    if (kind === 'gaze') this.runGaze(dt);
    else if (kind === 'jaws') this.runJaws(dt);
    else this.runStomp(dt, kind);
  }

  protected animate(dt: number) {
    const { env, model: m } = this;
    // recoil when he is hit: the whole body jerks back
    this.recoil = Math.max(0, this.recoil - dt * 2.2);
    m.root.position.z = BG_BOSS_Z - this.recoil * 1.4;
    if (this.state !== 'dying') m.root.position.y = -3.5;
    if (this.state !== 'intro' && this.state !== 'dying') env.arena.setRedLight(80 + 50 * Math.sin(env.time * 3) + (this.fst === 'tele' ? 70 : 0));
    else if (this.state === 'intro') env.arena.setRedLight(120);
    if (this.armorU > 0 && this.armorU < 1 && this.state !== 'dying') this.armorU = Math.min(1, this.armorU + dt / 1.3);
    m.setArmor(this.armorU);
    // when he is turned to a silhouette
    if (this.dieMat > 0) {
      for (const mat of [(m as unknown as { skinMat: THREE.MeshToonMaterial }).skinMat]) mat.color.setScalar(1 - this.dieMat * 0.92);
    } else (m as unknown as { skinMat: THREE.MeshToonMaterial }).skinMat.color.setScalar(1);
    m.update(dt, env.time);
  }

  private updateClear(dt: number) {
    const { model: m } = this;
    const kind = this.kind;
    const ft = this.ft;
    if (kind === 'gaze') m.setHead(Math.max(0, 1 - smooth(ft / 1.6)));
    if (kind === 'jaws') {
      this.coreLit = Math.max(0, this.coreLit - dt);
      m.setCore(this.coreLit > 0.02, this.lunge.x, 1.1, this.lunge.z, this.coreLit);
    }
    if (m.foot.visible) m.foot.position.y = lerp(m.foot.position.y, 40, 1 - Math.exp(-3 * dt));
    m.rakeArms.forEach((a) => {
      if (!a.group.visible) return;
      if (this.rake.cross) a.group.position.z += 20 * dt;
      else a.group.position.x += this.rake.dir * 20 * dt;
    });
    if (ft >= 1.9) {
      m.foot.visible = false;
      m.rakeArms.forEach((a) => (a.group.visible = false));
      m.setCore(false);
      m.setJaw(0);
      for (let i = 0; i < 4; i++) m.setJawSlot(i, false);
      if (this.deferred) {
        this.deferred = false;
        this.fst = 'wait';
        this.realStart();
      } else {
        // more hits to go in this phase: the same round again, quicker
        this.cycle++;
        this.resetState();
        this.ft = -0.5;
        this.si = 0;
        this.headLow = false;
      }
    }
  }

  /* ---- foot and rake ---- */

  private runStomp(dt: number, kind: Kind) {
    const { env, model: m } = this;
    const a = env.arena;
    const pl = env.p;
    const audio = env.audio;
    const ft = this.ft;
    const steps = kind === 'foot' ? FOOT_STEPS : RAKE_STEPS;
    const step = steps[Math.min(this.si, steps.length - 1)]!;
    const k = this.speedK;
    if (this.fst === 'wait') {
      if (ft >= step.w * (0.6 + 0.4 * k)) {
        this.ft = 0;
        this.fst = 'tele';
        if (kind === 'foot') {
          const f = new THREE.Vector3(pl.vx, 0, pl.vz).multiplyScalar(step.lead ?? 0.22);
          this.foot = { x: pl.x + f.x, z: pl.z + f.z };
          const fr = Math.hypot(this.foot.x, this.foot.z);
          if (fr > ARENA_R - 1.5) {
            this.foot.x *= (ARENA_R - 1.5) / fr;
            this.foot.z *= (ARENA_R - 1.5) / fr;
          }
          m.foot.visible = true;
          audio.v.xGrowl(0.8);
        } else {
          // a cross-rake always comes from his side of the floor, towards you; a flip lands in the last rake's gaps
          const cross = !!step.cross;
          const dir = cross ? 1 : step.flip ? -this.rake.dir : Math.random() < 0.5 ? -1 : 1;
          const base = step.flip ? this.rake.base + step.off! : (Math.random() - 0.5) * LANE_GAP;
          this.rake = { dir, lanes: Array.from({ length: LANES }, (_, i) => base + (i - (LANES - 1) / 2) * LANE_GAP), armX: -dir * (ARENA_R + 8), base, cross };
          m.rakeArms.forEach((arm, i) => {
            arm.group.visible = true;
            arm.setLength(1);
            arm.dig = 0;
            arm.group.rotation.y = cross ? Math.PI / 2 : dir > 0 ? Math.PI : 0;
            this.placeArm(arm.group, i);
          });
          if (cross) audio.v.xGrowl(1.2);
          audio.v.xBreath();
        }
        audio.rumble();
      }
    } else if (this.fst === 'tele') {
      const T = step.T * k;
      const u = clamp(ft / T, 0, 1);
      audio.setHeart(1.2 + u * 1.6, 0.7);
      if (kind === 'foot') {
        a.setShadow(this.foot.x, this.foot.z, FOOT_R + 0.4, u, u > 0.8 && Math.floor(env.time * 10) % 2 === 0);
        m.foot.position.set(this.foot.x, lerp(40, FOOT_HOVER, u * u) + groundY(this.foot.x, this.foot.z), this.foot.z);
        // a stamp that will crack the floor shows a violet ring round its shadow, throbbing
        if (step.quake && this.quake.r < 0) a.marks.set(MARK_QUAKE, true, this.foot.x, this.foot.z, FOOT_R + 1.3 + 0.25 * Math.sin(env.time * 14), { col: 0xb070ff, fill: 0, alpha: 0.4 + 0.5 * u });
      } else {
        const blink = Math.floor(env.time * 9) % 2 === 0 || u < 0.5;
        a.lanes.forEach((l, i) => {
          l.visible = true;
          const lane = this.rake.lanes[i]!;
          // a cross-rake's lanes run towards you
          l.rotation.y = this.rake.cross ? Math.PI / 2 : 0;
          if (this.rake.cross) l.position.set(lane, 0.08, 0);
          else l.position.set(0, 0.08, lane);
          (l.material as THREE.MeshBasicMaterial).opacity = blink ? 0.9 : 0.35;
        });
        // the arms wait at the edge, twitching
        m.rakeArms.forEach((arm, i) => this.placeArm(arm.group, i));
      }
      if (ft >= T) {
        this.ft = 0;
        this.fst = 'impact';
        audio.setHeart(0, 0);
        if (kind === 'foot') {
          this.footLanded = false;
        } else {
          audio.whoosh();
          a.lanes.forEach((l) => (l.visible = false));
        }
      }
    } else if (this.fst === 'impact') {
      if (kind === 'foot') {
        // the foot falls the last of the way in a blink, and lands
        const fall = clamp(ft / 0.14, 0, 1);
        m.foot.position.set(this.foot.x, lerp(FOOT_HOVER, 1.3, fall * fall) + groundY(this.foot.x, this.foot.z), this.foot.z);
        if (fall >= 1 && !this.footLanded) {
          this.footLanded = true;
          a.hideShadow();
          audio.slam();
          audio.v.xGrowl(1.1);
          env.ui.flash(0.4, 260);
          env.shake(1.1);
          a.burst3(this.foot.x, 0.4, this.foot.z, 22, [0x3a2a62, 0x46346f, 0x120a22], 9);
          if (Math.hypot(pl.x - this.foot.x, pl.z - this.foot.z) < FOOT_R * 0.85) env.hurt(pl.x - this.foot.x, pl.z - this.foot.z);
          if (step.quake) {
            // the floor cracks: a ring of shock runs out from the foot
            this.quake = { x: this.foot.x, z: this.foot.z, r: FOOT_R, hit: false, wait: QUAKE.wait * D.tele };
            audio.crumble();
            audio.boom();
            a.burst3(this.foot.x, 0.3, this.foot.z, 30, [0xb070ff, 0xe8d0ff, 0x3a2a62], 12);
          }
        }
        if (ft >= 0.14 + 0.2) {
          this.ft = 0;
          this.fst = step.fin ? 'stuck' : 'retract';
        }
      } else {
        const T = 1.0 / Math.max(0.8, 1 / k);
        const u = clamp(ft / T, 0, 1);
        const e = 1 - Math.pow(1 - u, 2);
        this.rake.armX = lerp(-this.rake.dir * (ARENA_R + 8), this.rake.dir * RAKE_END, e);
        const cross = this.rake.cross;
        m.rakeArms.forEach((arm, i) => {
          this.placeArm(arm.group, i);
          arm.dig = u;
          const lane = this.rake.lanes[i]!;
          const lo = Math.min(this.rake.armX, this.rake.armX - this.rake.dir * 16);
          const hi = Math.max(this.rake.armX, this.rake.armX - this.rake.dir * 16);
          // across: the lane is a line of z, the arm runs along x; a cross-rake the other way round
          const off = cross ? pl.x - lane : pl.z - lane;
          const along = cross ? pl.z : pl.x;
          if (u < 1 && Math.abs(off) < 1.15 && along > lo - 0.4 && along < hi + 0.4) env.hurt(cross ? 0 : this.rake.dir, cross ? 1 : 0);
        });
        if (u >= 1) {
          this.ft = 0;
          this.fst = step.fin ? 'stuck' : 'retract';
          audio.slam();
          env.shake(0.8);
          if (step.fin) m.rakeArms.forEach((arm) => arm.setLength(0.2));
          for (const l of this.rake.lanes) {
            if (this.rake.cross) a.burst3(l, 0.4, RAKE_END, 8, [0x3a2a62, 0x46346f], 6);
            else a.burst3(this.rake.dir * RAKE_END, 0.4, l, 8, [0x3a2a62, 0x46346f], 6);
          }
        }
      }
    } else if (this.fst === 'stuck') {
      const S = 2.1 * D.window;
      if (kind === 'foot') m.foot.position.y = 1.3 + groundY(this.foot.x, this.foot.z) + Math.sin(env.time * 20) * 0.04;
      if (ft >= S) {
        this.ft = 0;
        this.fst = 'retract';
      }
    } else if (this.fst === 'retract') {
      const u = clamp(ft / (step.fin ? 0.9 : 0.45), 0, 1);
      if (kind === 'foot') m.foot.position.y = lerp(1.3, 40, u * u) + groundY(this.foot.x, this.foot.z);
      else
        m.rakeArms.forEach((arm) => {
          if (this.rake.cross) arm.group.position.z += (step.fin ? 24 : 40) * dt;
          else arm.group.position.x += this.rake.dir * (step.fin ? 24 : 40) * dt;
        });
      if (u >= 1) {
        this.ft = 0;
        this.fst = 'wait';
        m.foot.visible = false;
        m.rakeArms.forEach((arm) => (arm.group.visible = false));
        // a missed finisher replays the last three attacks, not the whole sequence
        this.si = step.fin ? steps.length - 3 : this.si + 1;
      }
    }
  }

  /* ---- gaze ---- */

  private runGaze(dt: number) {
    const { env, model: m } = this;
    const a = env.arena;
    const audio = env.audio;
    const pl = env.p;
    const ft = this.ft;
    const k = this.speedK;
    if (this.fst === 'wait') {
      if (ft >= 1.2 * (0.6 + 0.4 * k)) {
        this.ft = 0;
        this.fst = 'tele';
        if (!this.headLow) this.gazeDir = Math.random() < 0.5 ? -1 : 1;
        this.chimes = 0;
        audio.rumble();
        if (!this.headLow) audio.v.xGrowl(1);
      }
    } else if (this.fst === 'tele') {
      const TT = (this.headLow ? 0.9 : 1.6) * k;
      const u = clamp(ft / TT, 0, 1);
      if (!this.headLow) {
        m.setHead(smooth(u));
        m.setJaw(0.3 * smooth(u));
      }
      m.setWide(1);
      if (ft > this.chimes * 0.5 + 0.1 && this.chimes < (this.headLow ? 2 : 3)) {
        this.chimes++;
        audio.bell(0.8 + this.chimes * 0.12);
      }
      if (ft >= TT) {
        this.ft = 0;
        this.fst = 'impact';
        this.headLow = true;
        this.gazeTh = -this.gazeDir * GAZE_ARC;
        this.glare = { shot: 0, t: 0, x: pl.x, z: pl.z, ax: pl.x, az: pl.z, th: 0 };
        audio.whoosh();
        audio.v.xRoar();
      }
    } else if (this.fst === 'impact') {
      const beat = GAZE_SEQ[Math.min(this.si, GAZE_SEQ.length - 1)]!;
      let over: boolean;
      if (beat === 'glare') over = this.runGlare(dt);
      else {
        const T = beat / D.speed / Math.max(0.75, 1 / k);
        const u = clamp(ft / T, 0, 1);
        this.gazeTh = lerp(-this.gazeDir * GAZE_ARC, this.gazeDir * GAZE_ARC, u);
        this.fireBeam(this.gazeTh, dt);
        over = ft >= T;
      }
      if (over) {
        m.setGaze(false);
        a.marks.set(MARK_GLARE, false);
        this.ft = 0;
        if (this.si < GAZE_SEQ.length - 1) {
          this.si++;
          this.gazeDir = -this.gazeDir;
          this.fst = 'tele';
          this.chimes = 0;
        } else {
          this.fst = 'stuck';
          audio.thump(0.8);
          m.setJaw(0.7);
        }
      }
    } else if (this.fst === 'stuck') {
      if (ft >= 2.4 * D.window) {
        this.ft = 0;
        this.fst = 'retract';
      }
    } else if (this.fst === 'retract') {
      const u = clamp(ft / 1.0, 0, 1);
      m.setHead(1 - smooth(u));
      m.setJaw(0.7 * (1 - u));
      if (u >= 1) {
        this.ft = 0;
        this.fst = 'wait';
        this.headLow = false;
        this.si = GAZE_SEQ.length - 3;
      }
    }
    void dt;
  }

  /** the beam along `th` from his lowered head: pillars stop it (and crumble under it), you do not */
  private fireBeam(th: number, dt: number, maxLen = 46) {
    const { env, model: m } = this;
    const a = env.arena;
    const pl = env.p;
    const dx = Math.sin(th);
    const dz = Math.cos(th);
    let len = maxLen;
    a.pillarData.forEach((pd, i) => {
      if (!pd.alive) return;
      const rx = pd.x - HEAD_G.x;
      const rz = pd.z - HEAD_G.z;
      const t = rx * dx + rz * dz;
      const perp = Math.abs(rx * dz - rz * dx);
      if (t > 0 && perp < 1.5 && t < len + 1) {
        len = Math.min(len, t);
        pd.hp -= dt;
        if (pd.hp <= 0) {
          a.crumblePillar(i);
          env.audio.crumble();
          env.shake(0.6);
        }
      }
    });
    m.setGaze(true, HEAD_G.x, HEAD_G.z, th, len);
    m.setJaw(0.2 + 0.1 * Math.sin(env.time * 30));
    const rx = pl.x - HEAD_G.x;
    const rz = pl.z - HEAD_G.z;
    const t = rx * dx + rz * dz;
    const perp = Math.abs(rx * dz - rz * dx);
    // (it cannot see you in the ferns)
    if (t > 0 && t < len && perp < 0.85 && !env.hidden) env.hurt(rx, rz);
  }

  /**
   * The glare: his eyes pick you out. A red ring follows you (a little behind), stops and blinks, and a short beam fires where it
   * stopped. Three times. Moving sideways after the blink is the answer; a pillar between you and him still works.
   */
  private runGlare(dt: number): boolean {
    const { env, model: m } = this;
    const a = env.arena;
    const pl = env.p;
    const g = this.glare;
    const k = Math.max(0.7, this.speedK);
    const aim = GLARE.aim * k;
    const lock = GLARE.lock * k;
    g.t += dt;
    if (g.t < aim) {
      // the ring hunts you
      const f = env.hidden ? 0 : 1 - Math.exp(-7 * dt);
      g.ax += (pl.x - g.ax) * f;
      g.az += (pl.z - g.az) * f;
      a.marks.set(MARK_GLARE, true, g.ax, g.az, 2.1 - 0.7 * (g.t / aim), { col: 0xff3a4a, fill: 0.22, alpha: 0.9 });
      m.setGaze(false);
      m.setJaw(0.25);
    } else if (g.t < aim + lock) {
      if (g.t - dt < aim) {
        g.th = Math.atan2(g.ax - HEAD_G.x, g.az - HEAD_G.z);
        env.audio.bell(1.3);
      }
      a.marks.set(MARK_GLARE, true, g.ax, g.az, 1.4, { fill: 0.65, hot: Math.floor(env.time * 18) % 2 === 0 });
    } else if (g.t < aim + lock + GLARE.fire) {
      if (g.t - dt < aim + lock) {
        env.audio.whoosh();
        env.audio.v.xGrowl(1.4);
        env.shake(0.4);
      }
      a.marks.set(MARK_GLARE, false);
      // a short beam that ends a little past where it locked
      this.fireBeam(g.th, dt, Math.hypot(g.ax - HEAD_G.x, g.az - HEAD_G.z) + 7);
    } else {
      m.setGaze(false);
      g.shot++;
      g.t = 0;
      g.ax = pl.x;
      g.az = pl.z;
      if (g.shot >= GLARE.shots) return true;
    }
    return false;
  }

  /** the shock ring of a quake runs out across the floor: it hurts where it passes (a dash goes through it) */
  private runQuake(dt: number) {
    const q = this.quake;
    if (q.r < 0) return;
    const { env } = this;
    if (q.wait > 0) {
      // the floor round the foot shudders first: that is the moment to get clear, or to get ready to dash
      q.wait -= dt;
      env.arena.marks.set(MARK_QUAKE, true, q.x, q.z, FOOT_R + 0.3 + 0.15 * Math.sin(env.time * 40), { col: 0xe0b0ff, fill: 0, alpha: 0.9 });
      env.shake(0.15);
      return;
    }
    q.r += QUAKE.speed * D.speed * dt;
    if (q.r > QUAKE.max) {
      q.r = -1;
      env.arena.marks.set(MARK_QUAKE, false);
      return;
    }
    env.arena.marks.set(MARK_QUAKE, true, q.x, q.z, q.r, { col: 0xc890ff, fill: 0, alpha: 1 - 0.6 * (q.r / QUAKE.max) });
    const pl = env.p;
    const d = Math.hypot(pl.x - q.x, pl.z - q.z);
    if (!q.hit && Math.abs(d - q.r) < QUAKE.half + 0.07 * q.r) {
      q.hit = true;
      env.hurt(pl.x - q.x, pl.z - q.z);
    }
  }

  /** a rake arm's place: along x (or, for a cross-rake, along z) at its lane */
  private placeArm(g: THREE.Group, i: number) {
    const lane = this.rake.lanes[i]!;
    if (this.rake.cross) g.position.set(lane, 0.7 + groundY(lane, this.rake.armX), this.rake.armX);
    else g.position.set(this.rake.armX, 0.7 + groundY(this.rake.armX, lane), lane);
  }

  /**
   * The maw chase: maws open one after another just ahead of where you are going. Each one blooms, then shuts. Running straight on
   * runs into them; turning leaves them behind.
   */
  private runChase(T: number): boolean {
    const { env, model: m } = this;
    const a = env.arena;
    const pl = env.p;
    const ft = this.ft;
    const k = Math.max(0.7, this.speedK);
    const gap = CHASE.gap * k;
    const n = CHASE.n;
    if (this.chase.length < n && ft >= this.chase.length * gap) {
      let x = pl.x + pl.vx * CHASE.lead;
      let z = pl.z + pl.vz * CHASE.lead;
      const rr = Math.hypot(x, z);
      if (rr > ARENA_R - 1) {
        x *= (ARENA_R - 1) / rr;
        z *= (ARENA_R - 1) / rr;
      }
      this.chase.push({ x, z, t0: ft, shut: false });
      env.audio.tone(90 + this.chase.length * 12, 0.12, 'triangle', 0.18, 40);
    }
    let last = 0;
    this.chase.forEach((j, i) => {
      const u = (ft - j.t0) / T;
      const slot = i % 4;
      if (u < 1) m.setJawSlot(slot, true, j.x, j.z, clamp(u, 0, 1), 0);
      else {
        if (!j.shut) {
          j.shut = true;
          env.audio.snap();
          env.shake(0.35);
          a.burst3(j.x, 0.5, j.z, 10, [0x4a3a28, 0x6a5640, 0xd8d0b8], 6);
          if (Math.hypot(pl.x - j.x, pl.z - j.z) < 1.7) env.hurt(pl.x - j.x, pl.z - j.z);
        }
        const e = clamp((ft - j.t0 - T) / 0.18, 0, 1);
        if (ft - j.t0 - T < 0.4) m.setJawSlot(slot, true, j.x, j.z, 1, e);
        else if (i + 4 >= this.chase.length) m.setJawSlot(slot, false);
      }
      last = Math.max(last, j.t0 + T + 0.45);
    });
    return this.chase.length >= n && ft >= last;
  }

  /* ---- jaws and the core ---- */

  private runJaws(dt: number) {
    const { env, model: m } = this;
    const a = env.arena;
    const audio = env.audio;
    const pl = env.p;
    const ft = this.ft;
    const k = this.speedK;
    if (this.fst === 'wait') {
      if (ft >= (this.si === 0 ? 1.3 : this.si < JAW_STEPS.length ? 0.6 : 0.8) * (0.6 + 0.4 * k)) {
        this.ft = 0;
        this.fst = 'tele';
        audio.rumble();
        if (this.si < JAW_STEPS.length && JAW_STEPS[this.si]!.chase) {
          this.chase = [];
          this.jawT = [];
          audio.v.xLaugh();
        } else if (this.si < JAW_STEPS.length) {
          const { n, r } = JAW_STEPS[this.si]!;
          const base = Math.random() * TAU;
          this.jawT = [];
          for (let i = 0; i < n; i++) {
            const ang = base + (i / n) * TAU;
            let x = pl.x + Math.cos(ang) * r;
            let z = pl.z + Math.sin(ang) * r;
            const rr = Math.hypot(x, z);
            if (rr > ARENA_R - 1) {
              x *= (ARENA_R - 1) / rr;
              z *= (ARENA_R - 1) / rr;
            }
            this.jawT.push({ x, z });
          }
        } else {
          const f = new THREE.Vector3(pl.vx, 0, pl.vz).multiplyScalar(0.2);
          this.lunge = { x: pl.x + f.x, z: pl.z + f.z };
          const lr = Math.hypot(this.lunge.x, this.lunge.z);
          if (lr > ARENA_R - 3) {
            this.lunge.x *= (ARENA_R - 3) / lr;
            this.lunge.z *= (ARENA_R - 3) / lr;
          }
          audio.v.xLaugh();
        }
      }
    } else if (this.fst === 'tele') {
      if (this.si < JAW_STEPS.length && JAW_STEPS[this.si]!.chase) {
        if (this.runChase(JAW_STEPS[this.si]!.T * Math.max(0.75, k))) {
          for (let i = 0; i < 4; i++) m.setJawSlot(i, false);
          this.chase = [];
          this.si++;
          this.ft = 0;
          this.fst = 'wait';
        }
      } else if (this.si < JAW_STEPS.length) {
        const TJ = JAW_STEPS[this.si]!.T * k;
        const u = clamp(ft / TJ, 0, 1);
        this.jawT.forEach((j, i) => m.setJawSlot(i, true, j.x, j.z, u, 0));
        if (ft >= TJ) {
          this.ft = 0;
          this.fst = 'impact';
          audio.snap();
          audio.slam();
          env.shake(0.6);
          this.jawT.forEach((j) => {
            a.burst3(j.x, 0.5, j.z, 10, [0x4a3a28, 0x6a5640, 0xd8d0b8], 6);
            if (Math.hypot(pl.x - j.x, pl.z - j.z) < 1.7) env.hurt(pl.x - j.x, pl.z - j.z);
          });
        }
      } else {
        const TL = 1.5 * k;
        const u = clamp(ft / TL, 0, 1);
        m.setHead(smooth(u) * 0.8);
        m.setJaw(smooth(u));
        m.setWide(1);
        a.setShadow(this.lunge.x, this.lunge.z, 3.4, u, u > 0.8 && Math.floor(env.time * 10) % 2 === 0);
        if (ft >= TL) {
          this.ft = 0;
          this.fst = 'impact';
          a.hideShadow();
          m.setJaw(0);
          audio.slam();
          env.ui.flash(0.45, 280);
          env.shake(1.2);
          a.burst3(this.lunge.x, 0.5, this.lunge.z, 24, [0x2a1a44, 0xd8d0b8, 0x6a1a8a], 9);
          if (Math.hypot(pl.x - this.lunge.x, pl.z - this.lunge.z) < 3.2) env.hurt(pl.x - this.lunge.x, pl.z - this.lunge.z);
          this.coreOn = true;
          this.coreLit = 0;
        }
      }
    } else if (this.fst === 'impact') {
      if (this.si < JAW_STEPS.length) {
        const e = clamp(ft / 0.18, 0, 1);
        const burst = 1 + 0.15 * Math.sin(e * Math.PI) * (e < 1 ? 1 : 0);
        this.jawT.forEach((j, i) => m.setJawSlot(i, true, j.x, j.z, 1, e < 1 ? e * burst : 1));
        if (ft >= 0.7) {
          for (let i = 0; i < 4; i++) m.setJawSlot(i, false);
          this.si++;
          this.ft = 0;
          this.fst = 'wait';
        }
      } else if (ft >= 0.25) {
        this.ft = 0;
        this.fst = 'stuck';
      }
    } else if (this.fst === 'stuck') {
      this.coreLit = Math.min(1, this.coreLit + dt * 2.2);
      m.setCore(true, this.lunge.x, 1.1, this.lunge.z, this.coreLit);
      if (ft >= 2.6 * D.window) {
        this.ft = 0;
        this.fst = 'retract';
      }
    } else if (this.fst === 'retract') {
      const u = clamp(ft / 0.9, 0, 1);
      m.setHead(0.8 * (1 - smooth(u)));
      this.coreLit = Math.max(0, this.coreLit - dt * 2);
      m.setCore(this.coreLit > 0.02, this.lunge.x, 1.1, this.lunge.z, this.coreLit);
      if (u >= 1) {
        this.coreOn = false;
        m.setCore(false);
        m.setHead(0);
        this.si = JAW_STEPS.length - 2;
        this.ft = 0;
        this.fst = 'wait';
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* being hit                                                         */
  /* ---------------------------------------------------------------- */

  weak(): Weak[] {
    if (this.fst !== 'stuck' || this.state !== 'fight') return [];
    const kind = this.kind;
    if (kind === 'foot') return [{ x: this.foot.x, y: 1.2, z: this.foot.z, reach: FOOT_R + 1.9, r: 3.4, tag: 'foot' }];
    if (kind === 'rake') return this.rake.lanes.map((l) => (this.rake.cross ? { x: l, y: 0.8, z: RAKE_END, reach: 3.6, r: 1.7, tag: 'claw' } : { x: this.rake.dir * RAKE_END, y: 0.8, z: l, reach: 3.6, r: 1.7, tag: 'claw' }));
    if (kind === 'gaze') return [{ x: HEAD_G.x, y: 6.0, z: HEAD_G.z, reach: 4.6, r: 4.2, tag: 'head' }];
    return this.coreLit > 0.5 ? [{ x: this.lunge.x, y: 1.2, z: this.lunge.z, reach: 3.7, r: 2.4, tag: 'core' }] : [];
  }

  onLance(l: Lance3): boolean {
    // light that reaches his arms and foot while they are armoured does nothing: it is stopped by them
    void l;
    return false;
  }

  /** a nova tears up the maws it reaches before they close */
  onNova(n: Nova3): void {
    if (this.kind !== 'jaws') return;
    for (const j of this.chase) {
      if (!j.shut && Math.hypot(j.x - n.x, j.z - n.z) < n.R + 1.2) {
        j.shut = true;
        j.t0 = -99;
        this.env.arena.burst3(j.x, 0.6, j.z, 14, [0x4a3a28, 0xd8d0b8, 0xffe9a0], 7);
      }
    }
    if (this.jawT.length === 0) return;
    const keep = this.jawT.filter((j) => Math.hypot(j.x - n.x, j.z - n.z) > n.R + 1.2);
    if (keep.length === this.jawT.length) return;
    for (const j of this.jawT) if (!keep.includes(j)) this.env.arena.burst3(j.x, 0.6, j.z, 14, [0x4a3a28, 0xd8d0b8, 0xffe9a0], 7);
    this.jawT = keep;
    for (let i = keep.length; i < 4; i++) this.model.setJawSlot(i, false);
  }

  dangers(): Danger[] {
    const out: Danger[] = [];
    const k = this.speedK;
    const kind = this.kind;
    if (this.state !== 'fight') return out;
    const steps = kind === 'foot' ? FOOT_STEPS : RAKE_STEPS;
    const step = steps[Math.min(this.si, steps.length - 1)]!;
    if (kind === 'foot' && (this.fst === 'tele' || (this.fst === 'impact' && this.ft < 0.2))) {
      out.push({ shape: 'disc', x: this.foot.x, z: this.foot.z, r: FOOT_R, at: this.fst === 'tele' ? Math.max(0, step.T * k - this.ft) : 0, dur: 0.25 });
    } else if (kind === 'rake' && (this.fst === 'tele' || this.fst === 'impact')) {
      const at = this.fst === 'tele' ? Math.max(0, step.T * k - this.ft) : 0;
      for (const l of this.rake.lanes) {
        if (this.rake.cross) out.push({ shape: 'lane', x: l, z: 0, ang: 0, len: 60, half: 1.2, at, dur: 1.1 });
        else out.push({ shape: 'lane', x: 0, z: l, ang: Math.PI / 2, len: 60, half: 1.2, at, dur: 1.1 });
      }
    } else if (kind === 'gaze' && this.fst === 'impact') {
      const beat = GAZE_SEQ[Math.min(this.si, GAZE_SEQ.length - 1)];
      if (beat === 'glare') {
        const g = this.glare;
        const aim = GLARE.aim * Math.max(0.7, this.speedK);
        // where it will fire, once it has locked (before that, it is still hunting)
        if (g.t >= aim) out.push({ shape: 'cone', x: HEAD_G.x, z: HEAD_G.z, ang: g.th, len: Math.hypot(g.ax - HEAD_G.x, g.az - HEAD_G.z) + 7, half: 0.9, at: Math.max(0, aim + GLARE.lock * Math.max(0.7, this.speedK) - g.t), dur: GLARE.fire });
        else out.push({ shape: 'disc', x: g.ax, z: g.az, r: 1.4, at: aim - g.t + 0.2, dur: GLARE.fire });
      } else out.push({ shape: 'cone', x: HEAD_G.x, z: HEAD_G.z, ang: this.gazeTh, len: 46, half: 0.9, at: 0, dur: 0.3 });
    }
    const q = this.quake;
    if (q.r >= 0) {
      // where the ring will be in a moment (it is coming outwards)
      const ahead = q.wait > 0 ? FOOT_R + 1.2 : q.r + 1.4;
      out.push({ shape: 'ring', x: q.x, z: q.z, r: ahead, w: ahead - Math.max(0, q.r - QUAKE.half) + 0.2, at: Math.max(0, q.wait), dur: 0.3 });
    }
    if (kind === 'jaws' && this.chase.length) {
      for (const j of this.chase) if (!j.shut) out.push({ shape: 'disc', x: j.x, z: j.z, r: 1.8, at: Math.max(0, j.t0 + CHASE.T - this.ft), dur: 0.3 });
    } else if (kind === 'jaws') {
      if (this.si < JAW_STEPS.length && (this.fst === 'tele' || this.fst === 'impact')) {
        const T = JAW_STEPS[this.si]!.T * k;
        for (const j of this.jawT) out.push({ shape: 'disc', x: j.x, z: j.z, r: 1.8, at: this.fst === 'tele' ? Math.max(0, T - this.ft) : 0, dur: 0.3 });
      } else if (this.si >= JAW_STEPS.length && this.fst === 'tele') {
        out.push({ shape: 'disc', x: this.lunge.x, z: this.lunge.z, r: 3.2, at: Math.max(0, 1.5 * k - this.ft), dur: 0.3 });
      }
    }
    return out;
  }

  cinematic() {
    if (this.state === 'dying') return { x: 0, y: 12, z: BG_BOSS_Z, dist: 30 };
    return null;
  }
}
