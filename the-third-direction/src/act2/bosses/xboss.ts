import * as THREE from 'three';
import { D } from '../../core/difficulty';
import { clamp, lerp, smooth, TAU, unlerp } from '../../core/util';
import { ARENA_R, BOSS_Z, LANES } from '../arena';
import { Boss3D, type Danger, type Env, type Lance3, type Nova3, type Weak } from '../fight';
import type { Slicer } from '../kit/sdf';
import { XModel } from '../models/x';

/**
 * X, the Hollow. He cannot be hurt until he is stuck, and he only gets stuck by committing to an attack.
 *   1  foot   a shadow shrinks on the floor and a foot the size of a house stamps it flat
 *   2  rake   nine bony arms rake the floor in lanes; the second rake lands in the first one's gaps
 *   3  gaze   his neck stretches, his three eyes turn and a beam sweeps the floor: hide behind a pillar
 *   4  jaws   maws bloom under your feet; in the end his core drops out of the hollow and shows
 * Each phase takes several hits. After each one he gets faster.
 */

type FSt = 'wait' | 'tele' | 'impact' | 'stuck' | 'retract' | 'clear';
type Kind = 'foot' | 'rake' | 'gaze' | 'jaws';

/** One attack in a phase: wait before it, telegraph time, and whether it is the finisher that leaves X stuck. */
type Step = { w: number; T: number; lead?: number; fin?: boolean; flip?: boolean; off?: number };

const FOOT_STEPS: Step[] = [
  { w: 1.3, T: 1.45, lead: 0.22 },
  { w: 0.6, T: 1.2, lead: 0.45 },
  { w: 0.35, T: 0.95, lead: 0.6 },
  { w: 0.6, T: 1.1, lead: 0.3 },
  { w: 0.3, T: 0.85, lead: 0.65 },
  { w: 0.25, T: 0.8, lead: 0.65 },
  { w: 0.7, T: 1.15, lead: 0.3, fin: true },
];
const RAKE_STEPS: Step[] = [
  { w: 1.3, T: 1.3 },
  { w: 0.6, T: 1.15 },
  { w: 0.15, T: 0.95, flip: true, off: 2.35 },
  { w: 0.7, T: 1.1 },
  { w: 0.15, T: 0.9, flip: true, off: -2.35 },
  { w: 0.7, T: 1.0 },
  { w: 0.7, T: 1.25, fin: true },
];
const GAZE_ARC = 1.5;
const GAZE_SWEEP = [3.9, 3.4, 2.9, 2.5];
const JAW_STEPS = [
  { n: 3, r: 2.8, T: 1.1 },
  { n: 4, r: 2.8, T: 1.0 },
  { n: 4, r: 2.3, T: 0.85 },
  { n: 4, r: 2.0, T: 0.75 },
];
const KINDS: Kind[] = ['foot', 'rake', 'gaze', 'jaws'];
export const X_PIPS = [2, 2, 2, 3];
const BG_BOSS_Z = BOSS_Z + 1.5;
/** Where the Watcher's head hangs when it lowers to look along the floor. */
const HEAD_G = { x: 0, z: BG_BOSS_Z + 9.5 };
const FOOT_R = 3.5;
/** how high the foot hangs while its shadow closes in (the camera is behind the player, at about this height) */
const FOOT_HOVER = 19;
const RAKE_END = 10;
const LANE_GAP = 4.7;

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
  private rake = { dir: 1, lanes: [] as number[], armX: 0, base: 0 };
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

  /** each hit he takes makes the next round quicker */
  private get speedK(): number {
    return Math.pow(0.9, this.cycle) / D.tele;
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
    env.arena.lanes.forEach((l) => (l.visible = false));
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
      if (a.group.visible) a.group.position.x += this.rake.dir * 20 * dt;
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
          const dir = step.flip ? -this.rake.dir : Math.random() < 0.5 ? -1 : 1;
          const base = step.flip ? this.rake.base + step.off! : (Math.random() - 0.5) * LANE_GAP;
          this.rake = { dir, lanes: Array.from({ length: LANES }, (_, i) => base + (i - (LANES - 1) / 2) * LANE_GAP), armX: -dir * (ARENA_R + 8), base };
          m.rakeArms.forEach((arm, i) => {
            arm.group.visible = true;
            arm.setLength(1);
            arm.dig = 0;
            arm.group.rotation.y = dir > 0 ? Math.PI : 0;
            arm.group.position.set(this.rake.armX, 0.7, this.rake.lanes[i]!);
          });
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
        m.foot.position.set(this.foot.x, lerp(40, FOOT_HOVER, u * u), this.foot.z);
      } else {
        const blink = Math.floor(env.time * 9) % 2 === 0 || u < 0.5;
        a.lanes.forEach((l, i) => {
          l.visible = true;
          l.position.set(0, 0.08, this.rake.lanes[i]!);
          (l.material as THREE.MeshBasicMaterial).opacity = blink ? 0.9 : 0.35;
        });
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
        const fall = clamp(ft / 0.09, 0, 1);
        m.foot.position.set(this.foot.x, lerp(FOOT_HOVER, 1.3, fall * fall), this.foot.z);
        if (fall >= 1 && !this.footLanded) {
          this.footLanded = true;
          a.hideShadow();
          audio.slam();
          audio.v.xGrowl(1.1);
          env.ui.flash(0.4, 260);
          env.shake(1.1);
          a.burst3(this.foot.x, 0.4, this.foot.z, 22, [0x3a2a62, 0x46346f, 0x120a22], 9);
          if (Math.hypot(pl.x - this.foot.x, pl.z - this.foot.z) < FOOT_R * 0.92) env.hurt(pl.x - this.foot.x, pl.z - this.foot.z);
        }
        if (ft >= 0.09 + 0.2) {
          this.ft = 0;
          this.fst = step.fin ? 'stuck' : 'retract';
        }
      } else {
        const T = 1.0 / Math.max(0.8, 1 / k);
        const u = clamp(ft / T, 0, 1);
        const e = 1 - Math.pow(1 - u, 2);
        this.rake.armX = lerp(-this.rake.dir * (ARENA_R + 8), this.rake.dir * RAKE_END, e);
        m.rakeArms.forEach((arm, i) => {
          arm.group.position.set(this.rake.armX, 0.7, this.rake.lanes[i]!);
          arm.dig = u;
          const lane = this.rake.lanes[i]!;
          const lo = Math.min(this.rake.armX, this.rake.armX - this.rake.dir * 16);
          const hi = Math.max(this.rake.armX, this.rake.armX - this.rake.dir * 16);
          if (u < 1 && Math.abs(pl.z - lane) < 1.15 && pl.x > lo - 0.4 && pl.x < hi + 0.4) env.hurt(this.rake.dir, 0);
        });
        if (u >= 1) {
          this.ft = 0;
          this.fst = step.fin ? 'stuck' : 'retract';
          audio.slam();
          env.shake(0.8);
          if (step.fin) m.rakeArms.forEach((arm) => arm.setLength(0.2));
          for (const l of this.rake.lanes) a.burst3(this.rake.dir * RAKE_END, 0.4, l, 8, [0x3a2a62, 0x46346f], 6);
        }
      }
    } else if (this.fst === 'stuck') {
      const S = 2.6 * D.window;
      if (kind === 'foot') m.foot.position.y = 1.3 + Math.sin(env.time * 20) * 0.04;
      if (ft >= S) {
        this.ft = 0;
        this.fst = 'retract';
      }
    } else if (this.fst === 'retract') {
      const u = clamp(ft / (step.fin ? 0.9 : 0.45), 0, 1);
      if (kind === 'foot') m.foot.position.y = lerp(1.3, 40, u * u);
      else m.rakeArms.forEach((arm) => (arm.group.position.x += this.rake.dir * (step.fin ? 24 : 40) * dt));
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
        audio.whoosh();
        audio.v.xRoar();
      }
    } else if (this.fst === 'impact') {
      const T = GAZE_SWEEP[Math.min(this.si, GAZE_SWEEP.length - 1)]! / D.speed / Math.max(0.75, 1 / k);
      const u = clamp(ft / T, 0, 1);
      this.gazeTh = lerp(-this.gazeDir * GAZE_ARC, this.gazeDir * GAZE_ARC, u);
      const dx = Math.sin(this.gazeTh);
      const dz = Math.cos(this.gazeTh);
      let len = 46;
      a.pillarData.forEach((pd, i) => {
        if (!pd.alive) return;
        const rx = pd.x - HEAD_G.x;
        const rz = pd.z - HEAD_G.z;
        const t = rx * dx + rz * dz;
        const perp = Math.abs(rx * dz - rz * dx);
        if (t > 0 && perp < 1.5) {
          len = Math.min(len, t);
          pd.hp -= dt;
          if (pd.hp <= 0) {
            a.crumblePillar(i);
            audio.crumble();
            env.shake(0.6);
          }
        }
      });
      m.setGaze(true, HEAD_G.x, HEAD_G.z, this.gazeTh, len);
      m.setJaw(0.2 + 0.1 * Math.sin(env.time * 30));
      const rx = pl.x - HEAD_G.x;
      const rz = pl.z - HEAD_G.z;
      const t = rx * dx + rz * dz;
      const perp = Math.abs(rx * dz - rz * dx);
      if (t > 0 && t < len && perp < 0.85) env.hurt(rx, rz);
      if (ft >= T) {
        m.setGaze(false);
        this.ft = 0;
        if (this.si < GAZE_SWEEP.length - 1) {
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
      if (ft >= 3.0 * D.window) {
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
        this.si = GAZE_SWEEP.length - 2;
      }
    }
    void dt;
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
        if (this.si < JAW_STEPS.length) {
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
      if (this.si < JAW_STEPS.length) {
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
      if (ft >= 3.2 * D.window) {
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
    if (kind === 'rake') return this.rake.lanes.map((l) => ({ x: this.rake.dir * RAKE_END, y: 0.8, z: l, reach: 3.6, r: 1.7, tag: 'claw' }));
    if (kind === 'gaze') return [{ x: HEAD_G.x, y: 6.0, z: HEAD_G.z, reach: 4.6, r: 4.2, tag: 'head' }];
    return this.coreLit > 0.5 ? [{ x: this.lunge.x, y: 1.2, z: this.lunge.z, reach: 3.7, r: 2.4, tag: 'core' }] : [];
  }

  onLance(l: Lance3): boolean {
    // light that reaches his arms and foot while they are armoured does nothing: it is stopped by them
    void l;
    return false;
  }

  onNova(n: Nova3): void {
    void n;
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
      for (const l of this.rake.lanes) out.push({ shape: 'lane', x: 0, z: l, ang: Math.PI / 2, len: 60, half: 1.2, at, dur: 1.1 });
    } else if (kind === 'gaze' && this.fst === 'impact') {
      out.push({ shape: 'cone', x: HEAD_G.x, z: HEAD_G.z, ang: this.gazeTh, len: 46, half: 0.9, at: 0, dur: 0.3 });
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
