import * as THREE from 'three';
import { D } from '../../core/difficulty';
import { clamp, lerp, smooth, TAU, unlerp } from '../../core/util';
import { ARENA_R, BOSS_Z } from '../arena';
import { Boss3D, type Danger, type Env, type Lance3, type Nova3, type Solid, type Weak } from '../fight';
import type { Slicer } from '../kit/sdf';
import { CollectorModel, ROOT_S } from '../models/collector';
import { DRAWERS } from '../models/collector-body';
import { JAR_R, PIN_FALL, PIN_FLY, PIN_HOVER, type MinionKind } from '../models/collector-props';

/**
 * THE COLLECTOR. He cannot be hurt until he lowers his jar-head to look at his collection, and he only does that after a
 * round of attacks. Everything he does is a way of adding to the collection:
 *   PINS     every phase   giant pins are thrown, hang over a red ring, then stab the floor and STAY: the arena fills up
 *   THE JAR  phase 2 on    a glass jar comes down over you and a brass lid closes under your feet; mash the button
 *   DRAWERS  phase 3       his drawers fall open and the things he has collected crawl out
 *   LOOKING  every round   the jar lowers to the floor, the lid comes off, the eye leans out: strike the eye
 */

/* ---------------------------------------------------------------- */
/* numbers                                                           */
/* ---------------------------------------------------------------- */

const PIN_RING = 1.6;
const PIN_HIT = 1.35;
const PIN_SOLID = 0.5;
const MAX_PINS = 10;
const JAR_RING = JAR_R + 0.2;
const TRAP_R = JAR_R - 0.2;
const JAR_HOVER = 10.5;
/** where he looks at his collection from: the pins must leave this part of the floor alone */
const KEEP_CLEAR = { x: 7.5, zMax: -9.5 };
const MINION_R = 0.95;
const MARK_PINS = 0;
const MARK_JAR = 8;

type Kind = 'wait' | 'pins' | 'jar' | 'drawers' | 'inspect';
interface Step {
  k: Kind;
  /** wait: seconds; pins: how many; drawers: how many */
  n?: number;
}

const ROUNDS: Step[][] = [
  // 1: pins, pins, then he looks
  [{ k: 'wait', n: 1.0 }, { k: 'pins', n: 3 }, { k: 'wait', n: 0.5 }, { k: 'pins', n: 4 }, { k: 'wait', n: 0.4 }, { k: 'inspect' }],
  // 2: the jar joins in
  [{ k: 'wait', n: 1.0 }, { k: 'pins', n: 3 }, { k: 'wait', n: 0.4 }, { k: 'jar' }, { k: 'wait', n: 0.4 }, { k: 'pins', n: 3 }, { k: 'wait', n: 0.4 }, { k: 'inspect' }],
  // 3: and the drawers
  [{ k: 'wait', n: 0.9 }, { k: 'jar' }, { k: 'wait', n: 0.4 }, { k: 'pins', n: 3 }, { k: 'wait', n: 0.3 }, { k: 'drawers', n: 5 }, { k: 'wait', n: 0.3 }, { k: 'inspect' }],
];

type Pattern = 'scatter' | 'sweep' | 'cage';
type MSt = 'queued' | 'open' | 'launch' | 'dazed' | 'crawl' | 'dying' | 'gone';

interface Pending {
  slot: number;
  x: number;
  z: number;
  t: number;
  /** from the throw to the stab */
  T: number;
  arm: number;
  launched: boolean;
  dropped: boolean;
  mark: number;
  done: boolean;
}

interface StuckPin {
  slot: number;
  x: number;
  z: number;
  solid: Solid;
}

interface Minion {
  id: number;
  kind: MinionKind;
  st: MSt;
  t: number;
  drawer: number;
  at: number;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  lx: number;
  lz: number;
  ph: number;
  yaw: number;
  speed: number;
  weave: number;
}

export const COLLECTOR_PIPS = [2, 3, 3];

export class CollectorBoss extends Boss3D {
  protected introLen = 4.2;
  protected dyingLen = 4.8;
  readonly model: CollectorModel;
  private fst: 'script' | 'inspect' | 'recoil' = 'script';
  private ft = 0;
  private si = 0;
  private cycle = 0;
  private deferred = false;
  private said = new Set<string>();
  private shown = false;
  private wallSaved: { x: number; y: number; z: number; rz: number }[] | null = null;
  private amb: THREE.AmbientLight | null = null;
  private ambBase = 1.25;
  private lights = 0;

  /* pins */
  private pend: Pending[] = [];
  private stuck: StuckPin[] = [];
  private pinsLeft = 0;
  private pinGap = 0;
  private pinTimer = 0;
  private armNext = 0;
  private armPin: (Pending | null)[] = [null, null];
  private volley = 0;
  private pattern: Pattern = 'scatter';
  private volleyIdx = 0;
  private cageA = 0;
  private sweepC = new THREE.Vector2();
  private sweepD = new THREE.Vector2();
  private stepDone = false;

  /* the jar */
  private jst: 'none' | 'tele' | 'drop' | 'trapped' | 'empty' | 'break' = 'none';
  private jt = 0;
  private jx = 0;
  private jz = 0;
  private jy = 30;
  private jLocked = false;
  private jT = 1.3;
  private jCracks = 0;
  private jLid = 0;
  private jSolid: Solid | null = null;
  private jWheel = 0;
  private jarCount = 0;

  /* the drawers and what comes out */
  private minions: Minion[] = [];
  private mCount = 0;
  private drawerQueue = 0;

  /* looking */
  private ist: 'lower' | 'unscrew' | 'window' | 'retreat' = 'lower';
  private headU = 0;
  private lidU = 0;
  private eyeOut = 0;
  private windowT = 0;
  private eyeHit = false;
  private recoilT = 0;
  private recoilV = 0;
  private dieMat = 0;
  private wTmp = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private weakPool: Weak[] = Array.from({ length: 10 }, () => ({ x: 0, y: 0, z: 0, reach: 0, r: 0, tag: '' }));
  private weakOut: Weak[] = [];
  private warm = 0;
  private jTick = 0;

  constructor(env: Env, world: THREE.Group, onVictory: () => void) {
    super(env, 'collector', 'The Collector', 'he wanted you on his wall', '#ffcf5a', COLLECTOR_PIPS, onVictory);
    this.model = new CollectorModel(world, BOSS_Z);
    this.model.pins.onLand = (slot) => this.pinLanded(slot);
    this.model.onRelease = (arm, pos, dir) => this.pinReleased(arm, pos, dir);
    const a = env.arena.world.children.find((c) => (c as THREE.AmbientLight).isAmbientLight) as THREE.AmbientLight | undefined;
    if (a) {
      this.amb = a;
      this.ambBase = a.intensity;
    }
  }

  build(slicer: Slicer) {
    return this.model.build(slicer);
  }

  ready() {
    return this.model.ready;
  }

  flattenRoot() {
    return this.model.root;
  }

  private get speedK(): number {
    // each hit he takes makes the next round a little quicker
    return Math.max(0.72, Math.pow(0.93, this.cycle));
  }

  /** a warning time, scaled by the difficulty and by how many rounds have passed */
  private tele(base: number): number {
    return base * D.tele * this.speedK;
  }

  show() {
    this.model.root.visible = true;
    this.shown = true;
  }

  hide() {
    const { env } = this;
    this.model.root.visible = false;
    this.clearHazards();
    this.model.pins.clear();
    this.model.jar.show(false);
    this.model.minions.hideAll();
    env.trap(false);
    this.restoreWorld();
    env.arena.setRedLight(0);
    this.shown = false;
  }

  /* ---------------------------------------------------------------- */
  /* the world around him: the lights, the wall                        */
  /* ---------------------------------------------------------------- */

  private saveWall() {
    if (this.wallSaved) return;
    this.wallSaved = this.env.arena.pinned.map((m) => ({ x: m.position.x, y: m.position.y, z: m.position.z, rz: m.rotation.z }));
  }

  private shudderWall(a: number, t: number) {
    this.saveWall();
    const w = this.wallSaved!;
    const pinned = this.env.arena.pinned;
    for (let i = 0; i < pinned.length; i++) {
      const m = pinned[i]!;
      const b = w[i]!;
      m.position.set(b.x + Math.sin(t * 38 + i * 1.7) * 0.5 * a, b.y + Math.sin(t * 31 + i * 2.3) * 0.4 * a, b.z + Math.cos(t * 35 + i) * 0.5 * a);
      m.rotation.z = b.rz + Math.sin(t * 27 + i * 3.1) * 0.12 * a;
    }
  }

  private restoreWorld() {
    if (this.wallSaved) {
      const pinned = this.env.arena.pinned;
      for (let i = 0; i < pinned.length; i++) {
        const b = this.wallSaved[i]!;
        pinned[i]!.position.set(b.x, b.y, b.z);
        pinned[i]!.rotation.z = b.rz;
      }
    }
    if (this.amb) this.amb.intensity = this.ambBase;
  }

  /** 0 = the arena's own lights, 1 = a candle in the dark */
  private dim(k: number) {
    if (this.amb) this.amb.intensity = this.ambBase * (1 - 0.5 * k);
  }

  /* ---------------------------------------------------------------- */
  /* speaking                                                          */
  /* ---------------------------------------------------------------- */

  private say(line: string, ms = 2600) {
    const { env } = this;
    env.audio.v.collectorSpeak(line);
    env.ui.caption(line, ms, true);
  }

  private sayOnce(key: string, line: string, ms = 2600) {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.say(line, ms);
  }

  /* ---------------------------------------------------------------- */
  /* the entrance                                                      */
  /* ---------------------------------------------------------------- */

  protected onBegin() {
    const { env, model: m } = this;
    this.show();
    this.hardReset();
    this.said.clear();
    this.dieMat = 0;
    m.rise = 0;
    m.death = 0;
    m.lookAt(0, 40, BOSS_Z - 6);
    this.saveWall();
    env.audio.rumble();
    env.audio.v.glassPing(0.55);
    window.setTimeout(() => env.audio.v.collectorTsk(2), 800);
    window.setTimeout(() => this.groan(), 1100);
    window.setTimeout(() => this.groan(), 1700);
    window.setTimeout(() => env.audio.sting(), 2300);
    window.setTimeout(() => {
      if (this.state === 'intro') this.say('hm. not on my wall yet.', 2800);
    }, 3000);
    window.setTimeout(() => {
      if (this.state === 'intro') env.audio.v.collectorChuckle();
    }, 3700);
  }

  private groan() {
    const a = this.env.audio;
    a.creak();
    a.tone(64 + Math.random() * 12, 0.9, 'sawtooth', 0.11, 38);
  }

  protected updateIntro(dt: number) {
    const { env, model: m } = this;
    const t = this.st;
    // the lights go down and the wall of specimens shudders
    const dimK = smooth(unlerp(0, 0.9, t)) * (1 - smooth(unlerp(3.3, 4.2, t)) * 0.8);
    this.dim(dimK);
    this.shudderWall(smooth(unlerp(0, 0.7, t)) * (1 - smooth(unlerp(2.4, 3.6, t))), env.time);
    env.shake(0.12 * (1 - unlerp(0, 3.2, t)));
    // he rises out of the dark beyond the edge
    m.rise = smooth(unlerp(0.4, 2.9, t));
    // a brass lid unscrews with a groan, and goes back on
    const unscrew = smooth(unlerp(1.0, 2.0, t)) * (1 - smooth(unlerp(2.5, 3.1, t)));
    m.lidU = 0.42 * unscrew;
    this.lidU = m.lidU;
    // the eye rolls round, then finds the player
    const find = smooth(unlerp(2.4, 3.2, t));
    this.v1.set(0, 30, BOSS_Z + 10);
    this.v2.set(env.p.x, 1.5, env.p.z);
    this.v1.lerp(this.v2, find);
    m.lookAt(this.v1.x, this.v1.y, this.v1.z);
    m.pupil = 0.65 - 0.5 * find;
    m.eyeOut = 0;
    if (t > 1.0 && t < 3.0 && Math.random() < dt * 8) m.puff(1, 0.6);
    void dt;
  }

  /* ---------------------------------------------------------------- */
  /* phases                                                            */
  /* ---------------------------------------------------------------- */

  /** forget everything that is out in the arena */
  private clearHazards() {
    const { env, model: m } = this;
    for (const s of this.stuck) this.dropSolid(s.solid);
    this.stuck.length = 0;
    this.pend.length = 0;
    this.armPin[0] = this.armPin[1] = null;
    m.pins.clear();
    if (this.jSolid) this.dropSolid(this.jSolid);
    this.jSolid = null;
    this.jst = 'none';
    m.jar.show(false);
    m.releaseArms();
    for (const mn of this.minions) m.minions.hide(mn.id);
    this.minions.length = 0;
    for (let i = 0; i < 16; i++) env.arena.marks.set(i, false);
    env.trap(false);
  }

  private dropSolid(s: Solid) {
    s.alive = false;
    const i = this.env.solids.indexOf(s);
    if (i >= 0) this.env.solids.splice(i, 1);
  }

  private hardReset() {
    const { env, model: m } = this;
    this.clearHazards();
    this.fst = 'script';
    this.ft = 0;
    this.si = 0;
    this.cycle = 0;
    this.deferred = false;
    this.stepDone = false;
    this.stepOn = false;
    this.ist = 'lower';
    this.headU = 0;
    this.lidU = 0;
    this.eyeOut = 0;
    this.recoilT = 0;
    this.recoilV = 0;
    this.jarCount = 0;
    m.headU = 0;
    m.lidU = 0;
    m.eyeOut = 0;
    m.steam = 0;
    m.pupil = 0.2;
    m.recoil = 0;
    m.rattle = 0;
    m.pinHeld[0] = m.pinHeld[1] = 1;
    for (let i = 0; i < DRAWERS; i++) m.setDrawer(i, 0, 0);
    env.arena.setRedLight(0);
  }

  protected startPhase() {
    // the hit that ended the last phase plays out for a moment first
    if (this.fst === 'recoil' && this.state === 'fight') {
      this.deferred = true;
      return;
    }
    this.realStart(true);
  }

  private realStart(announce: boolean) {
    const { env, model: m } = this;
    this.hardReset();
    m.rise = 1;
    m.death = 0;
    this.stepOn = false;
    this.ft = -0.6;
    this.volleyIdx = 0;
    const lines = ['this will only pin a little.', 'careful with the glass.', 'look. all my little friends.'];
    const line = lines[Math.min(this.phase, 2)]!;
    if (announce && !this.said.has(`p${this.phase}`)) {
      this.said.add(`p${this.phase}`);
      window.setTimeout(() => {
        if (this.state === 'fight') this.say(line);
      }, 500);
    }
    if (this.phase > 0 && announce) {
      env.audio.v.collectorChuckle();
      env.audio.rumble();
      env.shake(0.7);
      m.flash(0.3);
    }
    this.pt = 0;
  }

  protected restartPhase() {
    this.deferred = false;
    this.realStart(false);
    this.ft = -1.4;
  }

  debugSkipTo(phase: number) {
    // from anywhere: whatever he was doing is dropped
    this.fst = 'script';
    super.debugSkipTo(phase);
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  protected updateFight(dt: number) {
    const { env, model: m } = this;
    const pl = env.p;
    this.ft += dt;
    this.dim(0.18);
    if (this.fst === 'script') m.lookAt(pl.x, 1.4, pl.z);
    this.tickPins(dt);
    this.tickMinions(dt);
    this.tickJar(dt);
    if (this.fst === 'recoil') {
      this.runRecoil(dt);
      return;
    }
    if (this.fst === 'inspect') {
      this.runInspect(dt);
      return;
    }
    this.runScript(dt);
  }

  private stepOn = false;

  private runScript(dt: number) {
    if (this.ft < 0) return;
    const round = ROUNDS[Math.min(this.phase, ROUNDS.length - 1)]!;
    const step = round[this.si]!;
    if (!this.stepOn) {
      this.stepOn = true;
      this.stepDone = false;
      this.ft = 0;
      this.enterStep(step);
    }
    this.runStep(step, dt);
    if (this.stepDone && this.fst === 'script') {
      this.stepOn = false;
      this.si = (this.si + 1) % round.length;
    }
  }

  private trace(msg: string) {
    const w = window as unknown as { __colTrace?: string[] };
    if (w.__colTrace) w.__colTrace.push(`${this.t.toFixed(1)} p${this.phase} ${msg}`);
  }

  private enterStep(step: Step) {
    const { env } = this;
    this.trace(`step ${step.k} ${step.n ?? ''}`);
    if (step.k === 'pins') {
      this.pinsLeft = step.n ?? 3;
      this.pinTimer = 0;
      this.pinGap = 0.55 * D.tele * this.speedK;
      this.pinEnd = 0;
      this.volleyIdx++;
      const pats: Pattern[] = this.phase === 0 ? ['scatter', 'sweep'] : ['scatter', 'cage', 'sweep'];
      this.pattern = pats[(this.volleyIdx - 1) % pats.length]!;
      if (this.pattern === 'cage' && this.pinsLeft > 4) this.pattern = 'scatter';
      this.cageA = Math.random() * TAU;
      this.volley = 0;
      // a sweep starts at one side of the player and marches across
      const sa = Math.random() * TAU;
      this.sweepD.set(Math.cos(sa), Math.sin(sa));
      this.sweepC.set(env.p.x + env.p.vx * 0.4, env.p.z + env.p.vz * 0.4);
    } else if (step.k === 'jar') this.enterJar();
    else if (step.k === 'drawers') this.enterDrawers(step.n ?? 5);
    else if (step.k === 'inspect') this.enterInspect();
  }

  private runStep(step: Step, dt: number) {
    if (step.k === 'wait') {
      if (this.ft >= (step.n ?? 1) * (0.6 + 0.4 * this.speedK)) this.stepDone = true;
    } else if (step.k === 'pins') this.runPins(dt);
    else if (step.k === 'jar') this.runJar();
    else if (step.k === 'drawers') this.runDrawers();
    else if (step.k === 'inspect') {
      // the inspection takes over the whole fight until it is over
    }
  }

  protected animate(dt: number) {
    const { env, model: m } = this;
    const t = env.time;
    // where the model is in its pose, from the fight's own state
    m.headU = this.headU;
    m.eyeOut = this.eyeOut;
    if (this.state !== 'intro') m.lidU = this.lidU;
    this.recoilV = Math.max(0, this.recoilV - dt * 2.2);
    m.recoil = this.recoilV;
    m.rattle = Math.max(0, m.rattle - dt * 3);
    m.update(dt, t);
    // the red of the eye lights the floor while it is out
    if (this.state === 'fight') env.arena.setRedLight(26 * smooth(this.eyeOut) + 10 + 6 * Math.sin(t * 2.1));
    else if (this.state === 'intro') env.arena.setRedLight(30 * smooth(unlerp(2.2, 3.2, this.st)));
  }

  /* ---------------------------------------------------------------- */
  /* pins                                                              */
  /* ---------------------------------------------------------------- */

  /** is this a floor point a pin may land on? */
  private pinOk(x: number, z: number, minGap: number): boolean {
    if (Math.hypot(x, z) > ARENA_R - 1.6) return false;
    if (z < KEEP_CLEAR.zMax && Math.abs(x) < KEEP_CLEAR.x) return false;
    for (const s of this.stuck) if (Math.hypot(s.x - x, s.z - z) < minGap) return false;
    for (const p of this.pend) if (!p.done && Math.hypot(p.x - x, p.z - z) < minGap + 0.6) return false;
    return true;
  }

  private pickPinTarget(): { x: number; z: number } {
    const { env } = this;
    const pl = env.p;
    const first = this.volley === 0;
    // the first pin lands where you are going; the pattern decides the rest
    if (first && this.pattern !== 'sweep') {
      const x = pl.x + pl.vx * 0.5;
      const z = pl.z + pl.vz * 0.5;
      const r = Math.hypot(x, z);
      const k = r > ARENA_R - 2.2 ? (ARENA_R - 2.2) / r : 1;
      const px = x * k;
      const pz = z * k;
      if (this.pinOk(px, pz, 2.2)) return { x: px, z: pz };
    }
    if (this.pattern === 'cage' && this.volley < 4) {
      const n = Math.max(3, this.pinsLeft + this.volley);
      const a = this.cageA + (this.volley / n) * TAU;
      const cx = pl.x + pl.vx * 0.4;
      const cz = pl.z + pl.vz * 0.4;
      const x = cx + Math.cos(a) * 5.2;
      const z = cz + Math.sin(a) * 5.2;
      if (this.pinOk(x, z, 2.2)) return { x, z };
    }
    if (this.pattern === 'sweep') {
      const k = this.volley - 1.5;
      const x = this.sweepC.x + this.sweepD.x * k * 4.4;
      const z = this.sweepC.y + this.sweepD.y * k * 4.4;
      if (this.pinOk(x, z, 2.2)) return { x, z };
    }
    // scatter: the best of a handful of random spots, near enough to matter and far from each other
    let best = { x: 0, z: 8 };
    let bestS = -1e9;
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * (ARENA_R - 2.2);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (!this.pinOk(x, z, 2.6)) continue;
      const d = Math.hypot(x - pl.x, z - pl.z);
      let s = -Math.abs(d - (4 + Math.random() * 5));
      // spread over the floor: away from the last few
      for (const p of this.pend) s += Math.min(5, Math.hypot(p.x - x, p.z - z)) * 0.4;
      if (s > bestS) {
        bestS = s;
        best = { x, z };
      }
    }
    return best;
  }

  private pinEnd = 0;

  private runPins(dt: number) {
    const { model: m } = this;
    this.pinTimer -= dt;
    if (this.pinsLeft > 0 && this.pinTimer <= 0) {
      // pick an arm that is free
      let arm = this.armNext;
      if (this.armPin[arm] || m.isThrowing(arm)) arm = 1 - arm;
      if (!this.armPin[arm] && !m.isThrowing(arm)) {
        this.spawnPin(arm);
        this.armNext = 1 - arm;
        this.pinsLeft--;
        this.volley++;
        this.pinTimer = this.pinGap;
        this.pinEnd = 0;
      }
    }
    // the volley is over a moment after the last pin has stabbed the floor
    if (this.pinsLeft === 0 && this.pend.every((p) => p.done)) {
      this.pinEnd += dt;
      if (this.pinEnd > 0.4) this.stepDone = true;
    } else this.pinEnd = 0;
  }

  private spawnPin(arm: number) {
    const { env, model: m } = this;
    // keep the arena to a handful of pins: the oldest is pulled back out
    while (this.stuck.length >= MAX_PINS) this.pullPin(this.stuck[0]!);
    const slot = m.pins.alloc();
    if (slot < 0) return;
    const tgt = this.pickPinTarget();
    if (!m.throwPin(arm)) {
      m.pins.slots[slot]!.state = 'free';
      return;
    }
    const mark = MARK_PINS + (slot % 8);
    const p: Pending = { slot, x: tgt.x, z: tgt.z, t: 0, T: 0.08 + this.tele(0.9), arm, launched: false, dropped: false, mark, done: false };
    this.pend.push(p);
    this.armPin[arm] = p;
    env.audio.warnPing();
  }

  private pinReleased(arm: number, pos: THREE.Vector3, dir: THREE.Vector3) {
    const p = this.armPin[arm];
    if (!p || p.launched) return;
    this.launch(p, pos, dir);
  }

  private launch(p: Pending, pos: THREE.Vector3, dir: THREE.Vector3) {
    p.launched = true;
    this.armPin[p.arm] = null;
    this.model.pins.launch(p.slot, p.x, p.z, pos, dir);
    this.env.audio.whoosh();
  }

  private tickPins(dt: number) {
    const { env, model: m } = this;
    for (let i = this.pend.length - 1; i >= 0; i--) {
      const p = this.pend[i]!;
      p.t += dt;
      // the throw should have left his hand by now; if it did not (an arm was busy) it leaves from the shoulder
      if (!p.launched && p.t > 0.4) {
        this.v1.set(p.arm ? 9 : -9, 12, BOSS_Z + 3);
        this.v2.set(p.x - this.v1.x, 2 - this.v1.y, p.z - this.v1.z).normalize();
        this.launch(p, this.v1, this.v2);
      }
      const left = p.T - p.t;
      if (p.t >= 0.08 && !p.done) {
        const u = clamp((p.t - 0.08) / (p.T - 0.08), 0, 1);
        env.arena.marks.set(p.mark, true, p.x, p.z, PIN_RING, { fill: 0.2 + 0.5 * u, hot: u > 0.82 && Math.floor(env.time * 14) % 2 === 0, alpha: 0.65 + 0.35 * u });
      }
      if (!p.dropped && p.launched && left <= PIN_FALL + 0.005) {
        p.dropped = true;
        m.pins.drop(p.slot);
      }
      if (p.done) this.pend.splice(i, 1);
    }
  }

  private pinLanded(slot: number) {
    const { env } = this;
    const i = this.pend.findIndex((p) => p.slot === slot);
    if (i < 0) return;
    const p = this.pend[i]!;
    p.done = true;
    env.arena.marks.set(p.mark, false);
    env.audio.tone(150, 0.14, 'triangle', 0.4, 50);
    env.audio.burst(0.08, 0.45, 'bandpass', 2600, 900);
    env.audio.tone(2300, 0.3, 'sine', 0.035);
    env.shake(0.28);
    env.arena.burst3(p.x, 0.5, p.z, 9, [0x6a5a98, 0xffe4a0, 0x2a2048], 6);
    const pl = env.p;
    if (!pl.dead && Math.hypot(pl.x - p.x, pl.z - p.z) < PIN_HIT) env.hurt(pl.x - p.x, pl.z - p.z);
    // it stays: a needle in the floor that blocks walking and light
    const solid: Solid = {
      x: p.x,
      z: p.z,
      r: PIN_SOLID,
      alive: true,
      onLight: () => {
        this.breakPin(sp);
        return true;
      },
    };
    const sp: StuckPin = { slot, x: p.x, z: p.z, solid };
    this.stuck.push(sp);
    env.solids.push(solid);
  }

  private breakPin(sp: StuckPin) {
    const { env, model: m } = this;
    const i = this.stuck.indexOf(sp);
    if (i < 0) return;
    this.stuck.splice(i, 1);
    this.dropSolid(sp.solid);
    m.pins.breakPin(sp.slot);
    env.audio.snap();
    env.audio.tone(900, 0.12, 'triangle', 0.08, 300);
    env.arena.burst3(sp.x, 2.4, sp.z, 12, [0xffe4a0, 0xf4efe0, 0xd01e30, 0xb89038], 8);
    env.addLight(0.34);
  }

  private pullPin(sp: StuckPin) {
    const i = this.stuck.indexOf(sp);
    if (i < 0) return;
    this.stuck.splice(i, 1);
    this.dropSolid(sp.solid);
    this.model.pins.pull(sp.slot);
  }

  /* ---------------------------------------------------------------- */
  /* the jar                                                           */
  /* ---------------------------------------------------------------- */

  private enterJar() {
    const { env, model: m } = this;
    const pl = env.p;
    this.jst = 'tele';
    this.jt = 0;
    this.jLocked = false;
    this.jT = Math.max(0.95, this.tele(1.3));
    this.jCracks = 0;
    this.jLid = 0;
    this.jWheel = 0;
    // it comes down where you are going
    const x = pl.x + pl.vx * 0.35;
    const z = pl.z + pl.vz * 0.35;
    const r = Math.hypot(x, z);
    const k = r > ARENA_R - 3.4 ? (ARENA_R - 3.4) / r : 1;
    this.jx = x * k;
    this.jz = z * k;
    this.jy = 34;
    m.jar.show(true);
    m.jar.setCracks(0);
    m.jar.setIris(0);
    m.jar.setFade(1);
    m.jar.setPos(this.jx, this.jy, this.jz);
    env.audio.v.collectorTsk(2);
    env.audio.warnPing();
    this.jarCount++;
    if (this.jarCount === 1) this.sayOnce('jar', 'careful with the glass.');
  }

  private runJar() {
    if (this.jst === 'none' && this.ft > 0.1) this.stepDone = true;
  }

  private jarArm(top: THREE.Vector3, wheelAngle: number, w: number) {
    const m = this.model;
    // the hand reaches over the arena like a crane, in an arc
    const arm = m.arms[3]!;
    this.v2.copy(top);
    const sh = this.v3.copy(arm.shoulder);
    m.rootToWorld(sh);
    const dist = sh.distanceTo(this.v2);
    const reach = (arm.L1 + arm.L2) * 1.0;
    const stretch = Math.max(1, (dist * 1.16) / reach);
    m.steerArm(3, this.v2.x, this.v2.y + 0.3, this.v2.z, w, 0.8, stretch, 0.2, 1, -0.3, wheelAngle * 3);
  }

  private tickJar(dt: number) {
    const { env, model: m } = this;
    if (this.jst === 'none') return;
    const pl = env.p;
    this.jt += dt;
    const jar = m.jar;
    if (this.jst === 'tele') {
      const T = this.jT;
      const t = this.jt;
      // it swings in from the sky, hangs over the ring, and tracks you until the last moment
      const lockAt = T - 0.7;
      if (t < lockAt) {
        const gx = pl.x + pl.vx * 0.3;
        const gz = pl.z + pl.vz * 0.3;
        const dx = gx - this.jx;
        const dz = gz - this.jz;
        const d = Math.hypot(dx, dz);
        const sp = Math.min(d, 4.6 * D.speed * dt);
        if (d > 0.01) {
          this.jx += (dx / d) * sp;
          this.jz += (dz / d) * sp;
        }
        const r = Math.hypot(this.jx, this.jz);
        if (r > ARENA_R - 3.4) {
          this.jx *= (ARENA_R - 3.4) / r;
          this.jz *= (ARENA_R - 3.4) / r;
        }
      } else if (!this.jLocked) {
        this.jLocked = true;
        env.audio.v.glassPing(0.8);
        env.audio.bell(1.4);
      }
      const u = clamp(t / T, 0, 1);
      this.jy = lerp(34, JAR_HOVER, smooth(unlerp(0, 0.5, t)));
      if (t > T - 0.18) this.jy = lerp(JAR_HOVER, 0, Math.pow(unlerp(T - 0.18, T, t), 2));
      jar.setPos(this.jx, this.jy, this.jz);
      jar.setWheel(t * 4);
      this.top(this.v1);
      this.jarArm(this.v1, t * 4, smooth(unlerp(0, 0.35, t)));
      env.arena.marks.set(MARK_JAR, true, this.jx, this.jz, JAR_RING, { fill: 0.25 + 0.5 * u, hot: this.jLocked && Math.floor(env.time * 12) % 2 === 0, alpha: 0.6 + 0.4 * u, col: this.jLocked ? 0xff7a3a : 0xe02b3a });
      if (t >= T) this.landJar();
    } else if (this.jst === 'trapped') {
      this.jLid += dt;
      const L = this.lidTime();
      const u = clamp(this.jLid / L, 0, 1);
      jar.setIris(smooth(u));
      this.jWheel += dt * (3 + 6 * u);
      jar.setWheel(this.jWheel);
      jar.setPos(this.jx, 0, this.jz);
      this.top(this.v1);
      this.jarArm(this.v1, this.jWheel, 1);
      // a ticking that quickens as the lid closes
      this.jTick -= dt;
      if (this.jTick <= 0) {
        this.jTick = lerp(0.42, 0.14, u);
        env.audio.tone(1500 + 900 * u, 0.05, 'square', 0.04);
        env.audio.creak();
      }
      jar.setPulse(0.4 * Math.sin(this.jLid * 14) + 0.4);
      env.arena.marks.set(MARK_JAR, false);
      if (u >= 1) {
        // the lid is on: he keeps you, and then he lets you go
        env.audio.v.collectorTsk(3);
        env.audio.slam();
        env.hurt(pl.x - this.jx, pl.z - this.jz + 0.01);
        this.breakJar(false);
      }
    } else if (this.jst === 'empty') {
      jar.setPos(this.jx, 0, this.jz);
      jar.setWheel(this.jWheel);
      // it only becomes a wall once nobody is standing inside it
      if (this.jSolid && !this.jSolid.alive) {
        if (Math.hypot(pl.x - this.jx, pl.z - this.jz) > JAR_R + 0.5) this.jSolid.alive = true;
      }
      if (this.jt > 2.6) this.breakJar(true);
      const wk = clamp(unlerp(1.8, 2.6, this.jt), 0, 1);
      jar.setFade(1 - wk * 0.4);
      this.top(this.v1);
      this.jarArm(this.v1, this.jWheel, 1 - smooth(unlerp(0.3, 1.1, this.jt)));
    } else if (this.jst === 'break') {
      if (this.jt > 0.9) {
        this.jst = 'none';
        m.releaseArms();
      }
    }
  }

  private lidTime(): number {
    return 3.0 * D.tele;
  }

  private top(out: THREE.Vector3) {
    return out.set(this.jx, this.jy + 6.95, this.jz);
  }

  private landJar() {
    const { env, model: m } = this;
    const pl = env.p;
    this.jy = 0;
    this.jt = 0;
    m.jar.setPos(this.jx, 0, this.jz);
    env.arena.marks.set(MARK_JAR, false);
    env.audio.slam();
    env.audio.v.glassPing(0.6);
    env.audio.tone(2200, 0.4, 'sine', 0.05);
    env.shake(0.7);
    env.arena.burst3(this.jx, 0.4, this.jz, 16, [0x9fe8ff, 0xffffff, 0xffdf8a], 8);
    const inside = !pl.dead && Math.hypot(pl.x - this.jx, pl.z - this.jz) < TRAP_R && pl.invuln <= 0;
    this.trace(inside ? 'jar TRAPPED' : 'jar empty');
    if (inside) {
      this.jst = 'trapped';
      this.jLid = 0;
      this.jCracks = 0;
      this.jWheel = 0;
      env.trap(true);
      this.jTick = 0;
      this.say('labelled.', 1800);
    } else {
      this.jst = 'empty';
      // a clear jar standing on the floor: a wall of glass for a moment, once nobody is inside it
      const solid: Solid = {
        x: this.jx,
        z: this.jz,
        r: JAR_R,
        alive: Math.hypot(pl.x - this.jx, pl.z - this.jz) > JAR_R + 0.5,
        onLight: () => {
          this.breakJar(true);
          return true;
        },
      };
      this.jSolid = solid;
      env.solids.push(solid);
      env.audio.v.collectorTsk(1);
    }
  }

  private crackJar() {
    const { env, model: m } = this;
    if (this.jst !== 'trapped') return;
    this.jCracks++;
    m.jar.setCracks(this.jCracks);
    env.audio.v.glassPing(0.9 + this.jCracks * 0.15);
    env.audio.tone(2600 + this.jCracks * 400, 0.12, 'square', 0.05);
    env.shake(0.35);
    env.arena.burst3(this.jx, 2.5, this.jz, 4, [0xffffff, 0x9fe8ff], 5);
    if (this.jCracks >= 3) this.breakJar(true);
  }

  /** the glass goes everywhere; the player is free */
  private breakJar(freed: boolean) {
    const { env, model: m } = this;
    if (this.jst === 'break' || this.jst === 'none') return;
    this.trace(freed ? 'jar broken' : 'jar lid');
    this.jst = 'break';
    this.jt = 0;
    env.audio.v.glassBreak();
    env.shake(0.6);
    env.trap(false);
    if (this.jSolid) {
      this.dropSolid(this.jSolid);
      this.jSolid = null;
    }
    m.jar.shatter();
    env.arena.marks.set(MARK_JAR, false);
    m.releaseArms();
    if (freed) env.arena.burst3(this.jx, 2, this.jz, 14, [0xffffff, 0x9fe8ff, 0xffdf8a], 9);
    this.jLocked = false;
  }

  /* ---------------------------------------------------------------- */
  /* drawers and what comes out of them                                */
  /* ---------------------------------------------------------------- */

  private enterDrawers(n: number) {
    const { env, model: m } = this;
    this.minions.length = 0;
    const picks: number[] = [];
    const cols = [0, 1, 2];
    // drawers from all over his chest, never two next to each other
    while (picks.length < Math.min(n, 6)) {
      const d = Math.floor(Math.random() * DRAWERS);
      if (picks.some((p) => Math.abs((p % 3) - (d % 3)) + Math.abs(Math.floor(p / 3) - Math.floor(d / 3)) < 2)) continue;
      picks.push(d);
      if (picks.length > 24) break;
    }
    void cols;
    const kinds: MinionKind[] = [0, 1, 2, 1, 0, 2];
    picks.forEach((d, i) => {
      const k = kinds[i % kinds.length]!;
      this.minions.push({
        id: i,
        kind: k,
        st: 'queued',
        t: 0,
        drawer: d,
        at: 0.2 + i * 0.85 * D.tele,
        x: 0,
        y: 0,
        z: BOSS_Z,
        sx: 0,
        sy: 0,
        sz: 0,
        lx: 0,
        lz: 0,
        ph: Math.random() * TAU,
        yaw: 0,
        speed: (k === 0 ? 3.9 : k === 1 ? 4.7 : 4.2) * D.speed,
        weave: Math.random() * TAU,
      });
    });
    this.mCount = picks.length;
    this.drawerQueue = 0;
    this.stepDone = false;
    env.audio.rumble();
    env.audio.v.collectorTsk(2);
    this.sayOnce('drawers', 'look. all my little friends.', 2600);
    void m;
  }

  private runDrawers() {
    if (this.minions.length === 0) return;
    const alive = this.minions.filter((mn) => mn.st !== 'gone').length;
    if (alive === 0) {
      this.minions.length = 0;
      this.stepDone = true;
    } else if (this.ft > 22) {
      // the ones that are left go back into the dark
      for (const mn of this.minions) if (mn.st !== 'gone' && mn.st !== 'dying') this.killMinion(mn, false);
    }
  }

  private pickLanding(mn: Minion) {
    const pl = this.env.p;
    let bx = 0;
    let bz = -12;
    let bs = -1e9;
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const r = ARENA_R - 2.6 - Math.random() * 3;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const dp = Math.hypot(x - pl.x, z - pl.z);
      if (dp < 7) continue;
      let s = Math.min(dp, 14);
      for (const o of this.minions) if (o !== mn && o.st !== 'queued' && o.st !== 'gone') s += Math.min(5, Math.hypot(o.lx - x, o.lz - z)) * 0.6;
      if (s > bs) {
        bs = s;
        bx = x;
        bz = z;
      }
    }
    mn.lx = bx;
    mn.lz = bz;
  }

  private tickMinions(dt: number) {
    const { env, model: m } = this;
    if (this.minions.length === 0) return;
    const pl = env.p;
    for (const mn of this.minions) {
      if (mn.st === 'gone') continue;
      mn.t += dt;
      const dr = mn.drawer;
      if (mn.st === 'queued') {
        if (mn.t >= mn.at) {
          mn.st = 'open';
          mn.t = 0;
          this.pickLanding(mn);
          env.audio.creak();
          env.audio.tone(180, 0.3, 'sawtooth', 0.05, 90);
        }
        m.minions.hide(mn.id);
      } else if (mn.st === 'open') {
        // the drawer falls open and two eyes glow in the dark
        const T = this.tele(0.7);
        const u = clamp(mn.t / T, 0, 1);
        m.setDrawer(dr, smooth(u), smooth(unlerp(0.1, 0.6, u)));
        this.v1.set(0, 0, 0);
        m.drawerWorld(dr, this.v1);
        mn.sx = this.v1.x;
        mn.sy = this.v1.y;
        mn.sz = this.v1.z;
        m.minions.place(mn.id, mn.kind, mn.sx, mn.sy - 0.4, mn.sz - 0.4, 0, mn.ph, u, 0, 0.0001);
        if (u >= 1) {
          mn.st = 'launch';
          mn.t = 0;
          env.audio.squish();
        }
      } else if (mn.st === 'launch') {
        // it drops out of the drawer and lands at the far edge of the floor
        const T = 0.95;
        const u = clamp(mn.t / T, 0, 1);
        mn.x = lerp(mn.sx, mn.lx, u);
        mn.z = lerp(mn.sz, mn.lz, u);
        mn.y = lerp(mn.sy, 0, u * u) + Math.sin(Math.PI * u) * 3.4;
        mn.yaw = Math.atan2(pl.x - mn.x, pl.z - mn.z);
        m.minions.place(mn.id, mn.kind, mn.x, mn.y, mn.z, mn.yaw, mn.ph + mn.t * 10, 0.6, 0, lerp(0.35, 1, smooth(unlerp(0, 0.2, u))));
        // the drawer swings shut once it is out
        m.setDrawer(dr, 1 - smooth(unlerp(0.2, 0.7, u)), 0);
        if (u >= 1) {
          mn.st = 'dazed';
          mn.t = 0;
          mn.y = 0;
          env.audio.thump(0.5);
          env.arena.burst3(mn.x, 0.3, mn.z, 6, [0x3a2a62, 0x6a5a98], 4);
        }
      } else if (mn.st === 'dazed') {
        const u = clamp(mn.t / 0.55, 0, 1);
        m.minions.place(mn.id, mn.kind, mn.x, 0, mn.z, mn.yaw, mn.ph, 0.3, 1 - u, 1);
        if (u >= 1) {
          mn.st = 'crawl';
          mn.t = 0;
          m.setDrawer(dr, 0, 0);
        }
      } else if (mn.st === 'crawl') {
        this.crawl(mn, dt);
      } else if (mn.st === 'dying') {
        const u = clamp(mn.t / 0.35, 0, 1);
        m.minions.place(mn.id, mn.kind, mn.x, 0, mn.z, mn.yaw, mn.ph, 1, u * 0.6, 1 - u);
        if (u >= 1) {
          mn.st = 'gone';
          m.minions.hide(mn.id);
        }
      }
    }
  }

  private crawl(mn: Minion, dt: number) {
    const { env, model: m } = this;
    const pl = env.p;
    let dx = pl.x - mn.x;
    let dz = pl.z - mn.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    mn.weave += dt * (mn.kind === 1 ? 7 : 2.6);
    // a wobble across the line toward you, so they never come in a perfect row
    const wv = Math.sin(mn.weave) * (mn.kind === 1 ? 0.55 : 0.3);
    const ax = -dz * wv;
    const az = dx * wv;
    let sp = mn.speed;
    // the flower hops: fast in the air, still on the ground
    const hop = Math.abs(Math.sin(mn.ph));
    if (mn.kind === 2) sp *= 0.25 + 1.5 * hop;
    let vx = (dx + ax) * sp;
    let vz = (dz + az) * sp;
    // they walk round the pins and the jar rather than through them
    for (const s of env.solids) {
      if (!s.alive) continue;
      const ox = mn.x - s.x;
      const oz = mn.z - s.z;
      const od = Math.hypot(ox, oz);
      const R = s.r + 0.6;
      if (od < R + 0.5) {
        const push = (R + 0.5 - od) / 0.5;
        // slide along the column, not into it
        const tx = -oz / (od || 1);
        const tz = ox / (od || 1);
        const side = tx * dx + tz * dz >= 0 ? 1 : -1;
        vx += (ox / (od || 1)) * sp * push * 0.9 + tx * side * sp * push * 0.8;
        vz += (oz / (od || 1)) * sp * push * 0.9 + tz * side * sp * push * 0.8;
      }
    }
    mn.x += vx * dt;
    mn.z += vz * dt;
    for (const s of env.solids) {
      if (!s.alive) continue;
      const ox = mn.x - s.x;
      const oz = mn.z - s.z;
      const od = Math.hypot(ox, oz);
      if (od < s.r + 0.5) {
        mn.x = s.x + (ox / (od || 1)) * (s.r + 0.5);
        mn.z = s.z + (oz / (od || 1)) * (s.r + 0.5);
      }
    }
    const rr = Math.hypot(mn.x, mn.z);
    if (rr > ARENA_R - 0.8) {
      mn.x *= (ARENA_R - 0.8) / rr;
      mn.z *= (ARENA_R - 0.8) / rr;
    }
    mn.yaw = Math.atan2(vx, vz);
    mn.ph += dt * (mn.kind === 1 ? 14 : mn.kind === 2 ? 5.5 : 7);
    const mouth = mn.kind === 2 ? clamp(1 - d / 5, 0, 1) * (0.5 + 0.5 * Math.sin(mn.ph * 3)) : 0;
    m.minions.place(mn.id, mn.kind, mn.x, 0, mn.z, mn.yaw, mn.ph, mouth, 0, 1);
    if (!pl.dead && d < MINION_R + 0.1) env.hurt(pl.x - mn.x, pl.z - mn.z);
  }

  private killMinion(mn: Minion, light = true) {
    const { env } = this;
    if (mn.st === 'dying' || mn.st === 'gone') return;
    if (mn.st === 'queued' || mn.st === 'open') {
      // still in its drawer: it simply goes back to sleep
      mn.st = 'gone';
      this.model.setDrawer(mn.drawer, 0, 0);
      this.model.minions.hide(mn.id);
      return;
    }
    mn.st = 'dying';
    mn.t = 0;
    env.audio.kill();
    env.arena.burst3(mn.x, 0.9, mn.z, 9, mn.kind === 0 ? [0x6ff0ff, 0x07040e, 0x1a2a3a] : mn.kind === 1 ? [0xe8cf90, 0xa88a50, 0xf4efe0] : [0xe8f0ff, 0x3aa88a, 0xa01830], 7);
    if (light) env.addLight(0.25);
  }

  /* ---------------------------------------------------------------- */
  /* looking: the weak point                                           */
  /* ---------------------------------------------------------------- */

  private enterInspect() {
    const { env, model: m } = this;
    this.trace('inspect');
    this.fst = 'inspect';
    this.ft = 0;
    this.ist = 'lower';
    this.eyeHit = false;
    this.windowT = 0;
    env.audio.rumble();
    env.audio.v.collectorTsk(2);
    for (const mn of this.minions) if (mn.st !== 'gone') this.killMinion(mn, false);
    void m;
  }

  private runInspect(dt: number) {
    const { env, model: m } = this;
    const pl = env.p;
    const ft = this.ft;
    if (this.ist === 'lower') {
      // the jar sinks toward the far edge on its long neck; the eye keeps watching you
      const T = 1.1 * this.speedK;
      this.headU = smooth(ft / T);
      m.lookAt(pl.x, 1.4, pl.z);
      m.pupil = 0.25 + 0.2 * this.headU;
      if (Math.floor(ft * 4) !== Math.floor((ft - dt) * 4)) env.audio.creak();
      if (ft >= T) {
        this.ist = 'unscrew';
        this.ft = 0;
        env.audio.v.collectorTsk(2);
      }
    } else if (this.ist === 'unscrew') {
      // the lid turns and lifts off, steam and bubbles pour out, the eye leans out to look at his collection
      const T = 1.25 * this.speedK;
      const u = ft / T;
      this.lidU = smooth(unlerp(0, 0.85, u));
      m.steam = 18 * smooth(unlerp(0.15, 0.6, u));
      this.eyeOut = smooth(unlerp(0.45, 1, u));
      if (Math.floor(ft * 5) !== Math.floor((ft - dt) * 5)) env.audio.creak();
      if (u > 0.5 && !this.said.has('lidpop')) {
        this.said.add('lidpop');
        m.puff(26, 1.2);
        env.audio.tone(330, 0.5, 'sine', 0.1, 120);
        env.audio.burst(0.6, 0.25, 'highpass', 2200, 5200);
      }
      if (ft >= T) {
        this.said.delete('lidpop');
        this.trace('window');
        this.ist = 'window';
        this.ft = 0;
        this.windowT = 3.0 * D.window;
        m.puff(14, 1);
        env.audio.v.glassPing(0.5);
        env.audio.setHeart(1.4, 0.5);
        this.sayOnce('look', 'ah. there you are.', 2200);
      }
    } else if (this.ist === 'window') {
      this.eyeOut = 1;
      this.lidU = 1;
      m.steam = 14;
      // the eye sways over his collection; when you come close it turns to you and goes wide
      m.eyeSway = Math.sin(ft * 0.9 + 1) * 1.0;
      const dp = this.eyeDistance();
      const looking = clamp(1 - (dp - 5) / 6, 0, 1);
      this.v1.set(0, 1.5, -6);
      this.v2.set(pl.x, 1.4, pl.z);
      this.v1.x = Math.sin(ft * 1.3) * 7;
      this.v1.lerp(this.v2, smooth(looking));
      m.lookAt(this.v1.x, this.v1.y, this.v1.z);
      m.pupil = 0.35 + 0.6 * smooth(looking);
      this.warm += dt;
      if (ft >= this.windowT) {
        this.trace('missed');
        this.ist = 'retreat';
        this.ft = 0;
        env.audio.setHeart(0, 0);
        env.audio.v.collectorTsk(3);
      }
    } else if (this.ist === 'retreat') {
      // missed: the eye goes back in, the lid goes back on, the jar rises, and he starts a shorter round
      const T = 1.5;
      const u = ft / T;
      this.eyeOut = 1 - smooth(unlerp(0, 0.35, u));
      this.lidU = 1 - smooth(unlerp(0.1, 0.55, u));
      m.steam = 0;
      this.headU = 1 - smooth(unlerp(0.5, 1, u));
      m.lookAt(pl.x, 1.4, pl.z);
      if (u > 0.5 && !this.said.has('slam')) {
        this.said.add('slam');
        env.audio.slam();
        env.audio.v.glassPing(0.7);
        this.model.rattle = 0.7;
      }
      if (ft >= T) {
        this.said.delete('slam');
        this.fst = 'script';
        this.ft = -0.3;
        const round = ROUNDS[Math.min(this.phase, ROUNDS.length - 1)]!;
        this.si = Math.max(0, round.length - 3);
        this.stepOn = false;
        this.finishLook();
      }
    }
  }

  private eyeDistance(): number {
    this.model.eyeWorld(this.v3);
    return Math.hypot(this.env.p.x - this.v3.x, this.env.p.z - this.v3.z);
  }

  private finishLook() {
    const { model: m } = this;
    this.headU = 0;
    this.lidU = 0;
    this.eyeOut = 0;
    m.steam = 0;
    m.eyeSway = 0;
    m.pupil = 0.2;
  }

  protected onHit(x: number, y: number, z: number) {
    const { env, model: m } = this;
    // the eye is struck: he recoils, the eye snaps back, the lid slams shut, and the round starts over
    this.trace(`HIT hp ${this.hp}`);
    this.fst = 'recoil';
    this.ft = 0;
    this.recoilT = 0;
    this.recoilV = 1;
    this.eyeHit = true;
    m.flash(1);
    m.rattle = 1;
    m.puff(12, 1.4);
    m.splash(14, 1);
    env.ui.flash(0.4, 260);
    env.audio.v.collectorTsk(4);
    env.audio.setHeart(0, 0);
    env.audio.slam();
    this.cycle++;
    // everything he had out stops where it is
    for (const mn of this.minions) if (mn.st !== 'gone') this.killMinion(mn, false);
    void x;
    void y;
    void z;
  }

  protected onPhaseEnd() {
    this.cycle = 0;
  }

  private runRecoil(dt: number) {
    const { env, model: m } = this;
    const pl = env.p;
    this.recoilT += dt;
    const t = this.recoilT;
    m.lookAt(pl.x, 1.4, pl.z);
    // the eye whips back into the jar, then the lid goes down with a clang
    this.eyeOut = 1 - smooth(unlerp(0, 0.2, t));
    this.lidU = 1 - smooth(unlerp(0.15, 0.45, t));
    m.steam = 20 * (1 - smooth(unlerp(0.2, 0.8, t)));
    m.pupil = 0.9 * (1 - smooth(unlerp(0.3, 1.0, t)));
    if (t > 0.4 && !this.said.has('clang')) {
      this.said.add('clang');
      env.audio.slam();
      env.audio.v.glassPing(0.6);
      env.shake(0.5);
      m.rattle = 1;
    }
    if (t > 0.6) this.headU = 1 - smooth(unlerp(0.6, 1.5, t));
    if (t >= 1.7) {
      this.said.delete('clang');
      this.finishLook();
      m.steam = 0;
      this.fst = 'script';
      this.stepOn = false;
      this.si = 0;
      this.ft = -0.4;
      if (this.deferred) {
        this.deferred = false;
        this.realStart(true);
      } else if (this.hp > 0) {
        const lines = ['tsk. careless.', 'mind the lid.', 'oh dear.', 'that was my eye.'];
        if (Math.random() < 0.6) this.say(lines[Math.floor(Math.random() * lines.length)]!, 1800);
      }
    }
  }

  weak(): Weak[] {
    const out = this.weakOut;
    out.length = 0;
    if (this.state !== 'fight') return out;
    let n = 0;
    if (this.fst === 'inspect' && this.ist === 'window' && this.eyeOut > 0.85 && !this.eyeHit) {
      this.model.eyeWorld(this.wTmp);
      const w = this.weakPool[n++]!;
      w.x = this.wTmp.x;
      w.y = this.wTmp.y;
      w.z = this.wTmp.z;
      w.reach = 4.2;
      w.r = 2.2;
      w.tag = 'eye';
      out.push(w);
    }
    if (this.jst === 'trapped') {
      const w = this.weakPool[n++]!;
      w.x = this.jx;
      w.y = 2.4;
      w.z = this.jz;
      w.reach = 4.5;
      w.r = 3.4;
      w.tag = 'jar';
      out.push(w);
    }
    for (const mn of this.minions) {
      if (mn.st !== 'crawl' && mn.st !== 'dazed') continue;
      if (n >= this.weakPool.length) break;
      const w = this.weakPool[n++]!;
      w.x = mn.x;
      w.y = 0.9;
      w.z = mn.z;
      w.reach = 2.3;
      w.r = 1.3;
      w.tag = `m${mn.id}`;
      out.push(w);
    }
    return out;
  }

  hitBy(kind: 'strike' | 'lance' | 'nova', w: Weak): boolean {
    if (w.tag === 'jar') {
      // a strike cracks the glass; a lance or a nova from inside breaks it at once
      if (kind === 'strike') this.crackJar();
      else this.breakJar(true);
      return true;
    }
    if (w.tag.startsWith('m')) {
      const mn = this.minions.find((q) => q.id === Number(w.tag.slice(1)));
      if (mn) this.killMinion(mn);
      return true;
    }
    return super.hitBy(kind, w);
  }

  onLance(l: Lance3): boolean {
    // light passes through the empty jar's glass and breaks it
    void l;
    return false;
  }

  onNova(n: Nova3): void {
    const { env } = this;
    // a nova clears every minion, every pin and the jar within its reach
    for (const mn of this.minions) if ((mn.st === 'crawl' || mn.st === 'dazed') && Math.hypot(mn.x - n.x, mn.z - n.z) <= n.R + 0.6) this.killMinion(mn);
    for (const sp of this.stuck.slice()) if (Math.hypot(sp.x - n.x, sp.z - n.z) <= n.R + 0.5) this.breakPin(sp);
    if (this.jst === 'empty' && Math.hypot(this.jx - n.x, this.jz - n.z) <= n.R + JAR_R) this.breakJar(true);
    void env;
  }

  onPlayerStrike(x: number, z: number, fx: number, fz: number): void {
    // a claw through the pins and the empty jar's glass
    const sx = x + fx * 1.2;
    const sz = z + fz * 1.2;
    for (const sp of this.stuck.slice()) if (Math.hypot(sp.x - sx, sp.z - sz) <= 1.6 + 0.55) this.breakPin(sp);
    if (this.jst === 'empty' && this.jSolid && Math.hypot(this.jx - sx, this.jz - sz) <= JAR_R + 0.8) {
      this.env.addLight(0.34);
      this.breakJar(true);
    }
  }

  dangers(): Danger[] {
    const out: Danger[] = [];
    if (this.state !== 'fight') return out;
    for (const p of this.pend) {
      if (p.done || p.t < 0.08) continue;
      out.push({ shape: 'disc', x: p.x, z: p.z, r: PIN_HIT + 0.05, at: Math.max(0, p.T - p.t), dur: 0.25 });
    }
    if (this.jst === 'tele') out.push({ shape: 'disc', x: this.jx, z: this.jz, r: TRAP_R + 0.1, at: Math.max(0, this.jT - this.jt), dur: 0.35 });
    for (const mn of this.minions) {
      if (mn.st !== 'crawl') continue;
      // where it is, and where it will be
      for (let k = 0; k < 3; k++) {
        const t = k * 0.4;
        const dx = this.env.p.x - mn.x;
        const dz = this.env.p.z - mn.z;
        const d = Math.hypot(dx, dz) || 1;
        out.push({ shape: 'disc', x: mn.x + (dx / d) * mn.speed * t, z: mn.z + (dz / d) * mn.speed * t, r: MINION_R, at: t, dur: 0.45 });
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* the end                                                           */
  /* ---------------------------------------------------------------- */

  protected onDie() {
    const { env, model: m } = this;
    // all that he had out goes with him
    for (const mn of this.minions) if (mn.st !== 'gone') this.killMinion(mn, false);
    if (this.jst !== 'none') this.breakJar(true);
    for (const s of this.stuck.slice()) this.pullPin(s);
    for (let i = 0; i < 16; i++) env.arena.marks.set(i, false);
    env.trap(false);
    env.audio.setHeart(0, 0);
    this.fst = 'recoil';
    this.recoilT = 99;
    m.steam = 0;
    this.eyeOut = 0;
    this.lidU = 0;
    this.headU = 0;
    env.ui.caption('i was only keeping them safe.', 3200, true);
    env.audio.v.collectorSpeak('i was only keeping them safe.');
    window.setTimeout(() => env.audio.v.collectorTsk(3), 2400);
  }

  protected updateDying(dt: number) {
    const { env, model: m } = this;
    const u = this.st / this.dyingLen;
    m.death = u;
    this.dieMat = u;
    m.lookAt(env.p.x, 1.4, env.p.z);
    this.dim(0.15 + 0.5 * smooth(unlerp(0.2, 0.9, u)));
    this.shudderWall(0.5 * smooth(unlerp(0.55, 0.7, u)) * (1 - smooth(unlerp(0.85, 1, u))), env.time);
    // the jar cracks; at the first moment it gives, the liquid pours out and the glass goes everywhere
    if (u > 0.3 && !this.said.has('glass')) {
      this.said.add('glass');
      env.audio.v.glassBreak();
      env.shake(0.9);
      env.ui.flash(0.4, 300);
      m.shatterHead();
    }
    if (u > 0.3 && u < 0.7 && Math.random() < dt * 24) m.splash(2, 0.6);
    if (u > 0.3 && Math.random() < dt * 12) env.arena.burst3((Math.random() - 0.5) * 8, 4 + Math.random() * 10, BOSS_Z + 2, 3, [0x0a0612, 0xffdf8a, 0xe8d8b0], 5);
    // the brass goes dark, he sinks into the ink
    if (u > 0.62) m.drip(1, (Math.random() - 0.5) * 6, 3 - u * 4, BOSS_Z, 6);
    if (u > 0.55 && !this.said.has('sink')) {
      this.said.add('sink');
      env.audio.crumble();
      env.audio.tone(70, 1.6, 'sawtooth', 0.12, 30);
    }
    env.shake(0.25 * (1 - u));
    env.arena.setRedLight(60 * (1 - smooth(unlerp(0.2, 0.6, u))));
    this.eyeOut = 0;
  }

  cinematic() {
    if (this.state === 'dying') return { x: 0, y: 10, z: BOSS_Z, dist: 30 };
    return null;
  }
}

void ROOT_S;
void PIN_FLY;
void PIN_HOVER;
