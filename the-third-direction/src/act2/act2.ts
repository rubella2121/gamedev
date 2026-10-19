import * as THREE from 'three';
import { Arena, ARENA_R, BOSS_Z, LANES } from './arena';
import { D } from '../core/difficulty';
import type { Ctx } from '../ctx';
import { H, W } from '../core/pix';
import { clamp, easeOutBack, easeOutCubic, lerp, rng, smooth, TAU, unlerp } from '../core/util';

type St = 'boom' | 'fight' | 'ending' | 'end';
type FSt = 'wait' | 'tele' | 'impact' | 'stuck' | 'retract' | 'clear' | 'dead';

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
// the rake comes from one side, then the other, with the lanes interleaved
const RAKE_STEPS: Step[] = [
  { w: 1.3, T: 1.3 },
  { w: 0.6, T: 1.15 },
  { w: 0.15, T: 0.95, flip: true, off: 2.35 },
  { w: 0.7, T: 1.1 },
  { w: 0.15, T: 0.9, flip: true, off: -2.35 },
  { w: 0.7, T: 1.0 },
  { w: 0.7, T: 1.25, fin: true },
];
/** The beam sweeps almost the whole floor, so you have to hide behind a pillar. */
const GAZE_ARC = 1.5;
const GAZE_SWEEP = [3.9, 3.4, 2.9, 2.5];
const JAW_STEPS = [
  { n: 3, r: 2.8, T: 1.1 },
  { n: 4, r: 2.8, T: 1.0 },
  { n: 4, r: 2.3, T: 0.85 },
  { n: 4, r: 2.0, T: 0.75 },
];
const PHASES: { kind: Kind }[] = [{ kind: 'foot' }, { kind: 'rake' }, { kind: 'gaze' }, { kind: 'jaws' }];
const BG_BOSS_Z = BOSS_Z + 1.5;
/** Where the Watcher's head hangs when it lowers to look along the floor. */
const HEAD_G = { x: 0, z: BG_BOSS_Z + 9.5 };
const FOOT_R = 3.5;
const PLAYER_SPEED = 7.6;
const START_Z = 12;
/** Where the claw tips stop in a rake (the arms come from far beyond the edge). */
const RAKE_END = 10;
const LANE_GAP = 4.7;
const BOOM_POS = new THREE.Vector3(0, 9, 27);
const BOOM_LOOK = new THREE.Vector3(0, 8, -14);

export class Act2 {
  readonly arena = new Arena();
  state: St = 'boom';
  t = 0;
  private time = 0;
  private cubes!: THREE.InstancedMesh;
  private cubeData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; s: number }[] = [];
  private cubeGroup = new THREE.Group();
  private shard!: THREE.Mesh;
  private fired = new Set<string>();
  private tmp = new THREE.Object3D();
  private tmpC = new THREE.Color();
  private camPos = new THREE.Vector3(0, 0, 15.36);
  private camLook = new THREE.Vector3(0, 0, 0);
  private shake = 0;
  private hitStop = 0;
  private recoil = 0;

  // player
  private px = 0;
  private pz = START_Z;
  private dvx = 0;
  private dvz = 0;
  private walk = 0;
  private camYaw = 0;
  private camPitch = 0.56;
  private camDist = 15;
  private camManual = false;
  private lastFace = Math.PI;
  private pvx = 0;
  private pvz = 0;
  private yaw = Math.PI;
  private bob = 0;
  private strikeT = 0;
  private strikeCd = 0;
  private pending = 0;
  private invuln = 0;
  private control = false;

  // fight
  private phase = 0;
  private hearts = 3;
  /** hearts per phase: the difficulty's hearts plus the bonus hearts found in secrets */
  private get maxHearts() {
    return D.hearts + Math.min(3, this.ctx.stats.bonus);
  }
  private fst: FSt = 'wait';
  private ft = 0;
  private foot = { x: 0, z: 0 };
  private rake = { dir: 1, lanes: [] as number[], armX: 0, base: 0 };
  private deadT = 0;
  private armorFall = -1;
  private gazeDir = 1;
  private gazeTh = 0;
  private sub = 0;
  private headLow = false;
  private jawT: { x: number; z: number }[] = [];
  private lunge = { x: 0, z: 0 };
  private coreOn = false;
  private coreLit = 0;
  private mothP = new THREE.Vector3(0, 2, 6);
  private chimes = 0;

  // ending
  private et = 0;
  private bossMats: THREE.Material[] = [];
  private warm!: THREE.Points;
  private warmData: { x: number; y: number; z: number; at: number; mine: boolean; tx: number; tz: number }[] = [];
  private lights: THREE.Mesh[] = [];

  onEnd: (() => void) | null = null;

  constructor(private ctx: Ctx) {
    const a = this.arena;
    // cubes of the shattering 2D forest
    const bw = W / 4;
    const bh = H / 4;
    this.cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial({ fog: false }), bw * bh);
    this.cubes.frustumCulled = false;
    this.cubeGroup.scale.setScalar(0.05);
    this.cubeGroup.add(this.cubes);
    a.scene.add(this.cubeGroup);
    this.shard = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 5), new THREE.MeshBasicMaterial({ color: 0xf4efe0 }));
    this.shard.visible = false;
    a.scene.add(this.shard);
    a.boss.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !this.bossMats.includes(m)) this.bossMats.push(m);
    });
    // warm lights of the freed
    const n = a.pinned.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.warm = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd878, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.95, fog: false }));
    this.warm.frustumCulled = false;
    this.warm.visible = false;
    a.scene.add(this.warm);
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a0 }));
      m.visible = false;
      this.lights.push(m);
      a.world.add(m);
    }
  }

  /* ---------------------------------------------------------------- */
  /* the boom                                                          */
  /* ---------------------------------------------------------------- */

  begin(frame: HTMLCanvasElement) {
    const a = this.arena;
    this.state = 'boom';
    this.t = 0;
    this.fired.clear();
    this.phase = 0;
    this.hearts = 3;
    this.fst = 'wait';
    this.control = false;
    this.px = 0;
    this.pz = START_Z;
    a.player.visible = false;
    a.boss.visible = false;
    a.boss.scale.set(1, 1, 1);
    this.restoreBoss();
    a.armor.visible = true;
    a.armor.children.forEach((c) => c.scale.setScalar(1));
    this.armorFall = -1;
    a.setRise(0);
    a.showPlayerClaw(0);
    a.foot.visible = false;
    a.arms.forEach((m) => (m.visible = false));
    a.hideShadow();
    a.lanes.forEach((l) => (l.visible = false));
    a.pinned.forEach((p) => (p.visible = true));
    this.resetExtras();
    a.tint(0);
    a.setClearing(0);
    a.moth.visible = false;
    this.mothP.set(-1.7, 2.3, START_Z + 0.4);
    this.warm.visible = false;
    this.lights.forEach((l) => (l.visible = false));
    this.cubeGroup.visible = true;
    this.shard.visible = false;
    // capture the last 2D frame, 4x4 pixels per cube
    const ctx2 = frame.getContext('2d')!;
    const img = ctx2.getImageData(0, 0, W, H).data;
    const bw = W / 4;
    const bh = H / 4;
    this.cubeData = [];
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let yy = 0; yy < 4; yy++) {
          for (let xx = 0; xx < 4; xx++) {
            const i = ((by * 4 + yy) * W + bx * 4 + xx) * 4;
            r += img[i]!;
            g += img[i + 1]!;
            b += img[i + 2]!;
          }
        }
        this.cubes.setColorAt(by * bw + bx, this.tmpC.setRGB(r / 4080, g / 4080, b / 4080, THREE.SRGBColorSpace));
        const x = bx * 4 + 2 - W / 2;
        const y = H / 2 - (by * 4 + 2);
        const dx = x - 0;
        const dy = y + 22;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 90 + Math.random() * 260;
        this.cubeData.push({ x, y, z: 0, vx: (dx / d) * sp + (Math.random() - 0.5) * 60, vy: (dy / d) * sp * 0.6 + Math.random() * 120, vz: 40 + Math.random() * 520, rx: (Math.random() - 0.5) * 9, ry: (Math.random() - 0.5) * 9, rz: (Math.random() - 0.5) * 9, s: 1 });
      }
    }
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
    this.cubes.count = bw * bh;
    this.layoutCubes(0);
    // the old forest becomes a tiny flat picture far below
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d')!.drawImage(frame, 0, 0);
    a.setBelow(c);
    this.camPos.set(0, 0, 15.36);
    this.camLook.set(0, 0, 0);
    a.camera.position.copy(this.camPos);
    a.camera.lookAt(this.camLook);
    this.ctx.input.setAction(null);
    this.ctx.ui.hint(null);
    this.ctx.ui.hearts(null);
  }

  private restoreBoss() {
    for (const m of this.bossMats) {
      const mm = m as THREE.MeshLambertMaterial;
      if (mm.userData['c0'] !== undefined) mm.color.setHex(mm.userData['c0'] as number);
      else mm.userData['c0'] = mm.color.getHex();
    }
  }

  private layoutCubes(tt: number) {
    const m = this.tmp;
    for (let i = 0; i < this.cubeData.length; i++) {
      const d = this.cubeData[i]!;
      if (tt > 0) {
        d.x += d.vx * tt;
        d.y += d.vy * tt;
        d.z += d.vz * tt;
        d.vy -= 420 * tt;
      }
      m.position.set(d.x, d.y, d.z);
      m.rotation.set(tt > 0 ? this.t * d.rx : 0, tt > 0 ? this.t * d.ry : 0, tt > 0 ? this.t * d.rz : 0);
      m.scale.setScalar(d.s);
      m.updateMatrix();
      this.cubes.setMatrixAt(i, m.matrix);
    }
    this.cubes.instanceMatrix.needsUpdate = true;
  }

  private fire(key: string, cond: boolean, fn: () => void) {
    if (cond && !this.fired.has(key)) {
      this.fired.add(key);
      fn();
    }
  }

  private updateBoom(dt: number) {
    const { audio, ui } = this.ctx;
    const a = this.arena;
    const t = this.t;
    if (t < 0.55) {
      this.camPos.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, 15.36);
    }
    this.fire('burst', t >= 0.55, () => {
      audio.boom();
      ui.flash(0.8, 500);
      this.shake = 1;
    });
    if (t >= 0.55) {
      this.layoutCubes(dt);
      const fade = unlerp(2.6, 3.6, t);
      if (fade > 0) {
        for (const d of this.cubeData) d.s = Math.max(0.001, 1 - fade);
      }
      if (t > 3.8) this.cubeGroup.visible = false;
    }
    // the world rebuilds in 3D
    a.setRise(smooth(unlerp(1.0, 3.4, t)));
    const u = smooth(unlerp(0.7, 3.8, t));
    if (t >= 0.55) {
      this.camPos.lerpVectors(new THREE.Vector3(0, 0, 15.36), BOOM_POS, u);
      this.camLook.lerpVectors(new THREE.Vector3(0, 0, 0), BOOM_LOOK, u);
    }
    // you land, then swallow the claw tip
    this.fire('land', t >= 2.2, () => {
      a.player.visible = true;
      this.px = 0;
      this.pz = START_Z;
    });
    if (t >= 2.2) {
      const fall = unlerp(2.2, 3.0, t);
      const y = lerp(7, 0, fall * fall);
      a.player.position.set(0, Math.max(0, y), START_Z);
      a.player.rotation.y = Math.PI;
      this.fire('landed', t >= 3.0, () => {
        a.burst3(0, 0.2, START_Z, 14, [0x3a2a62, 0x46346f, 0xf2d36b], 5);
        audio.hit();
        this.shake = 0.5;
      });
    }
    if (t >= 3.6 && t < 4.3) {
      this.shard.visible = true;
      const u2 = unlerp(3.6, 4.3, t);
      this.shard.position.set(lerp(0, 0.2, u2), lerp(14, 1.1, u2 * u2), lerp(BOSS_Z + 4, START_Z + 0.2, u2));
      this.shard.rotation.set(u2 * 9, u2 * 5, 0);
    }
    this.fire('swallow', t >= 4.3, () => {
      this.shard.visible = false;
      ui.flash(0.55, 300);
      audio.hit();
      audio.strike();
      this.shake = 0.8;
      a.burst3(0.2, 1.1, START_Z + 0.2, 16, [0xf4efe0, 0x120a1c, 0xff2a40], 6);
    });
    if (t >= 4.3) a.showPlayerClaw(easeOutBack((t - 4.3) / 0.7));
    this.fire('reveal', t >= 5.1, () => {
      ui.flash(0.95, 700);
      audio.sting();
      a.boss.visible = true;
      a.setRedLight(120);
      this.shake = 1.2;
    });
    this.fire('title', t >= 5.5, () => {
      ui.title();
      audio.setDrone(0.22, 2);
    });
    this.fire('go', t >= 8.2, () => this.beginFight());
    a.player.position.y = t >= 3.0 ? 0 : a.player.position.y;
    if (t >= 3.0) {
      this.mothP.set(-1.7, 2.3, START_Z + 0.4);
      a.setMoth(this.mothP.x, this.mothP.y, this.mothP.z, this.time, true);
    }
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  private beginFight() {
    this.state = 'fight';
    this.control = true;
    this.fst = 'wait';
    this.ft = -1.0;
    this.hearts = this.maxHearts;
    this.ctx.input.setMoveEnabled(true);
    this.ctx.input.setCameraEnabled(true);
    this.ctx.input.setAction('strike');
    this.ctx.ui.hearts(this.hearts, this.maxHearts);
    this.ctx.ui.recenter(true, () => this.resetCamera());
    this.resetCamera();
    this.camManual = false;
    this.ctx.ui.caption('Strike.', 2400);
  }

  /** Which way the camera looks along the floor. */
  private camFwd(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
  }

  /** Swing the camera behind the player, looking at the Hollow. */
  private resetCamera() {
    const dx = 0 - this.px;
    const dz = BG_BOSS_Z - this.pz;
    this.camYaw = Math.atan2(-dx, -dz);
    this.camPitch = 0.56;
    this.camManual = false;
  }

  private hurt(kx: number, kz: number) {
    if (this.invuln > 0 || this.fst === 'dead') return;
    const { ui, audio } = this.ctx;
    this.hearts--;
    this.invuln = 1.5;
    ui.hearts(this.hearts, this.maxHearts);
    ui.red(0.55, 350);
    audio.hurt();
    this.shake = Math.max(this.shake, 0.7);
    const l = Math.hypot(kx, kz) || 1;
    this.pvx += (kx / l) * 9;
    this.pvz += (kz / l) * 9;
    this.arena.burst3(this.px, 0.8, this.pz, 8, [0xf2d36b, 0xfff1a6], 5);
    if (this.hearts <= 0) this.die();
  }

  private die() {
    const { ui, audio } = this.ctx;
    this.fst = 'dead';
    this.deadT = 1.1;
    this.ctx.stats.deaths++;
    ui.fade(1, 250);
    audio.death();
    this.control = false;
  }

  private resetPhase() {
    const a = this.arena;
    this.hearts = this.maxHearts;
    this.px = 0;
    this.pz = START_Z;
    this.pvx = this.pvz = 0;
    this.dvx = this.dvz = 0;
    this.invuln = 0;
    this.resetCamera();
    this.fst = 'wait';
    this.ft = -1.2;
    a.foot.visible = false;
    a.arms.forEach((m) => (m.visible = false));
    a.hideShadow();
    a.lanes.forEach((l) => (l.visible = false));
    this.resetExtras();
    this.ctx.ui.hearts(this.hearts, this.maxHearts);
    this.ctx.ui.fade(0, 450);
    this.control = true;
  }

  private landStrike() {
    const { audio, ui } = this.ctx;
    const a = this.arena;
    this.hitStop = 0.16;
    this.shake = 1.0;
    audio.hit();
    ui.flash(0.5, 300);
    this.recoil = 1;
    if (PHASES[this.phase]!.kind === 'foot') {
      a.burst3(this.foot.x, 1.5, this.foot.z, 26, [0x07040e, 0x6ff0ff, 0x2a1a44], 9);
      this.armorFall = 0;
    } else if (PHASES[this.phase]!.kind === 'rake') {
      for (const l of this.rake.lanes) a.burst3(this.rake.dir * RAKE_END, 0.7, l, 14, [0xf4efe0, 0xd8d0b8, 0x6a5a98], 8);
    } else if (PHASES[this.phase]!.kind === 'gaze') {
      a.burst3(HEAD_G.x, 5.5, HEAD_G.z, 30, [0xff3040, 0xffeeee, 0x3a2660], 9);
    } else {
      a.burst3(this.lunge.x, 1.2, this.lunge.z, 40, [0xe080ff, 0xffffff, 0x6a1a8a], 11);
    }
    this.fst = 'clear';
    this.ft = 0;
    a.hideShadow();
  }

  private updateFight(dt: number) {
    const { input, audio, ui } = this.ctx;
    const a = this.arena;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.04;
    }
    if (this.fst === 'dead') {
      this.deadT -= dt;
      if (this.deadT <= 0) this.resetPhase();
      return;
    }

    // --- player (movement is relative to the camera)
    this.invuln = Math.max(0, this.invuln - dt);
    this.strikeCd = Math.max(0, this.strikeCd - dt);
    if (this.control) {
      const f = this.camFwd();
      const rx = -f.z;
      const rz = f.x;
      const mx = rx * input.moveX + f.x * -input.moveY;
      const mz = rz * input.moveX + f.z * -input.moveY;
      const k = 1 - Math.exp(-14 * dt);
      this.pvx += (mx * PLAYER_SPEED - this.pvx) * k;
      this.pvz += (mz * PLAYER_SPEED - this.pvz) * k;
      if (input.actionPressed && this.strikeCd <= 0) {
        this.strikeT = 0.3;
        this.strikeCd = 0.42;
        this.pending = 0.14;
        audio.strike();
        this.strikeDash();
      }
    } else {
      this.pvx *= 0.9;
      this.pvz *= 0.9;
    }
    this.px += (this.pvx + this.dvx) * dt;
    this.pz += (this.pvz + this.dvz) * dt;
    const decay = Math.exp(-12 * dt);
    this.dvx *= decay;
    this.dvz *= decay;
    const rr = Math.hypot(this.px, this.pz);
    if (rr > ARENA_R - 0.9) {
      this.px *= (ARENA_R - 0.9) / rr;
      this.pz *= (ARENA_R - 0.9) / rr;
    }
    // pillars are solid
    for (const pd of a.pillarData) {
      if (!pd.alive) continue;
      const ox = this.px - pd.x;
      const oz = this.pz - pd.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.35) {
        this.px = pd.x + (ox / (od || 1)) * 1.35;
        this.pz = pd.z + (oz / (od || 1)) * 1.35;
      }
    }
    this.strikeT = Math.max(0, this.strikeT - dt);
    if (this.pending > 0) {
      this.pending -= dt;
      if (this.pending <= 0) this.resolveStrike();
    }

    // --- camera controls: Q / E, drag, and R to recentre
    const cam = input.takeCam();
    const turn = input.camKey * 2.4 * dt + cam.dx * -0.011;
    if (turn !== 0 || cam.dy !== 0) this.camManual = true;
    this.camYaw += turn;
    this.camPitch = clamp(this.camPitch + cam.dy * 0.008, 0.12, 1.25);
    if (input.camReset) {
      input.camReset = false;
      this.resetCamera();
    }

    // --- boss attack cycle
    this.runAttack(dt);

    // --- armour falls away after phase 1
    if (this.armorFall >= 0) {
      this.armorFall += dt;
      const u = this.armorFall / 1.3;
      a.armor.children.forEach((c, i) => {
        c.position.y -= dt * (4 + (i % 5));
        c.scale.setScalar(Math.max(0.001, 1 - u));
      });
      if (u >= 1) {
        a.armor.visible = false;
        this.armorFall = -2;
      }
    }

    // boss recoil
    this.recoil = Math.max(0, this.recoil - dt * 2.2);
    a.boss.position.z = BG_BOSS_Z - this.recoil * 1.4;
    a.setRedLight(80 + 50 * Math.sin(this.time * 3) + (this.fst === 'tele' ? 70 : 0));

    this.updatePlayerRig(dt);
    this.updateMoth(dt);
    void ui;
  }

  /** The thing a strike would hit right now, if X is stuck. */
  private strikeTarget(): { x: number; z: number; reach: number } | null {
    if (this.fst !== 'stuck') return null;
    const kind = PHASES[this.phase]!.kind;
    if (kind === 'foot') return { x: this.foot.x, z: this.foot.z, reach: FOOT_R + 1.9 };
    if (kind === 'rake') {
      let best: { x: number; z: number; reach: number } | null = null;
      let bd = 1e9;
      for (const l of this.rake.lanes) {
        const d = Math.hypot(this.px - this.rake.dir * RAKE_END, this.pz - l);
        if (d < bd) {
          bd = d;
          best = { x: this.rake.dir * RAKE_END, z: l, reach: 3.6 };
        }
      }
      return best;
    }
    if (kind === 'gaze') return { x: HEAD_G.x, z: HEAD_G.z, reach: 4.6 };
    return this.coreLit > 0.5 ? { x: this.lunge.x, z: this.lunge.z, reach: 3.7 } : null;
  }

  /** A strike lunges toward the stuck target, so a big arena never costs you the window. */
  private strikeDash() {
    const tg = this.strikeTarget();
    if (!tg) return;
    const dx = tg.x - this.px;
    const dz = tg.z - this.pz;
    const d = Math.hypot(dx, dz);
    this.lastFace = Math.atan2(dx, dz);
    const need = d - tg.reach * 0.7;
    if (need <= 0 || d > 11) return;
    const go = Math.min(7.5, need);
    this.dvx = (dx / d) * go * 12;
    this.dvz = (dz / d) * go * 12;
  }

  private resolveStrike() {
    if (this.fst !== 'stuck') return;
    let ok = false;
    if (PHASES[this.phase]!.kind === 'foot') {
      ok = Math.hypot(this.px - this.foot.x, this.pz - this.foot.z) <= FOOT_R + 1.9;
    } else if (PHASES[this.phase]!.kind === 'rake') {
      for (const l of this.rake.lanes) if (Math.hypot(this.px - this.rake.dir * RAKE_END, this.pz - l) <= 3.6) ok = true;
    } else if (PHASES[this.phase]!.kind === 'gaze') {
      ok = Math.hypot(this.px - HEAD_G.x, this.pz - HEAD_G.z) <= 4.6;
    } else {
      ok = this.coreLit > 0.5 && Math.hypot(this.px - this.lunge.x, this.pz - this.lunge.z) <= 3.7;
    }
    if (ok) this.landStrike();
  }


  /** Put the head, jaw, gaze, core and root-jaws back where a phase starts. */
  private resetExtras() {
    const a = this.arena;
    a.setHead(0);
    a.setJaw(0);
    a.setGaze(false);
    a.setCore(false);
    for (let i = 0; i < 4; i++) a.setJawSlot(i, false);
    this.coreOn = false;
    this.coreLit = 0;
    this.sub = 0;
    this.headLow = false;
    this.chimes = 0;
    if (this.phase <= 2) a.restorePillars();
  }

  private updateMoth(dt: number) {
    const a = this.arena;
    const target = new THREE.Vector3(this.px - 1.4, 2.1, this.pz + 0.4);
    if (this.coreOn) target.set(this.lunge.x, 3.6, this.lunge.z);
    this.mothP.lerp(target, 1 - Math.exp(-(this.coreOn ? 5 : 3.5) * dt));
    a.setMoth(this.mothP.x, this.mothP.y, this.mothP.z, this.time, this.state !== 'end');
  }

  private advancePhase() {
    const a = this.arena;
    a.foot.visible = false;
    a.arms.forEach((m) => (m.visible = false));
    this.phase++;
    this.hearts = this.maxHearts;
    this.ctx.ui.hearts(this.hearts, this.maxHearts);
    this.resetCamera();
    if (this.phase >= PHASES.length) this.beginEnding();
    else {
      this.resetExtras();
      this.fst = 'wait';
      this.ft = -0.4;
    }
  }

  private runGaze(dt: number) {
    const a = this.arena;
    const { audio } = this.ctx;
    const ft = this.ft;
    if (this.fst === 'wait') {
      if (ft >= 1.2) {
        this.ft = 0;
        this.fst = 'tele';
        if (!this.headLow) this.gazeDir = Math.random() < 0.5 ? -1 : 1;
        this.chimes = 0;
        audio.rumble();
      }
    } else if (this.fst === 'tele') {
      // the head only lowers once; later sweeps start from where the last one ended
      const TT = (this.headLow ? 0.9 : 1.6) * D.tele;
      const u = clamp(ft / TT, 0, 1);
      if (!this.headLow) a.setHead(smooth(u));
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
      }
    } else if (this.fst === 'impact') {
      const T = GAZE_SWEEP[Math.min(this.sub, GAZE_SWEEP.length - 1)]! / D.speed;
      const u = clamp(ft / T, 0, 1);
      this.gazeTh = lerp(-this.gazeDir * GAZE_ARC, this.gazeDir * GAZE_ARC, u);
      const dx = Math.sin(this.gazeTh);
      const dz = Math.cos(this.gazeTh);
      // the beam stops at the first pillar it touches, and wears it down
      let len = 46;
      this.arena.pillarData.forEach((pd, i) => {
        if (!pd.alive) return;
        const rx = pd.x - HEAD_G.x;
        const rz = pd.z - HEAD_G.z;
        const t = rx * dx + rz * dz;
        const perp = Math.abs(rx * dz - rz * dx);
        if (t > 0 && perp < 1.5) {
          len = Math.min(len, t);
          pd.hp -= dt;
          if (pd.hp <= 0) {
            this.arena.crumblePillar(i);
            audio.crumble();
            this.shake = Math.max(this.shake, 0.6);
          }
        }
      });
      a.setGaze(true, HEAD_G.x, HEAD_G.z, this.gazeTh, len);
      const rx = this.px - HEAD_G.x;
      const rz = this.pz - HEAD_G.z;
      const t = rx * dx + rz * dz;
      const perp = Math.abs(rx * dz - rz * dx);
      if (t > 0 && t < len && perp < 0.85) this.hurt(rx, rz);
      if (ft >= T) {
        a.setGaze(false);
        this.ft = 0;
        if (this.sub < GAZE_SWEEP.length - 1) {
          // not the last sweep: he swings back the other way, faster
          this.sub++;
          this.gazeDir = -this.gazeDir;
          this.fst = 'tele';
          this.chimes = 0;
        } else {
          this.fst = 'stuck';
          audio.thump(0.8);
        }
      }
    } else if (this.fst === 'stuck') {
      if (ft >= 3.0 * D.window) {
        this.ft = 0;
        this.fst = 'retract';
      }
    } else if (this.fst === 'retract') {
      const u = clamp(ft / 1.0, 0, 1);
      a.setHead(1 - smooth(u));
      if (u >= 1) {
        this.ft = 0;
        this.fst = 'wait';
        this.headLow = false;
        this.sub = GAZE_SWEEP.length - 2;
      }
    }
  }

  private runJaws(dt: number) {
    const a = this.arena;
    const { audio } = this.ctx;
    const ft = this.ft;
    if (this.fst === 'wait') {
      if (ft >= (this.sub === 0 ? 1.3 : this.sub < JAW_STEPS.length ? 0.6 : 0.8)) {
        this.ft = 0;
        this.fst = 'tele';
        audio.rumble();
        if (this.sub < JAW_STEPS.length) {
          const { n, r } = JAW_STEPS[this.sub]!;
          const base = Math.random() * TAU;
          this.jawT = [];
          for (let i = 0; i < n; i++) {
            const ang = base + (i / n) * TAU;
            let x = this.px + Math.cos(ang) * r;
            let z = this.pz + Math.sin(ang) * r;
            const rr = Math.hypot(x, z);
            if (rr > ARENA_R - 1) {
              x *= (ARENA_R - 1) / rr;
              z *= (ARENA_R - 1) / rr;
            }
            this.jawT.push({ x, z });
          }
        } else {
          const f = new THREE.Vector3(this.pvx, 0, this.pvz).multiplyScalar(0.2);
          this.lunge = { x: this.px + f.x, z: this.pz + f.z };
          const lr = Math.hypot(this.lunge.x, this.lunge.z);
          if (lr > ARENA_R - 3) {
            this.lunge.x *= (ARENA_R - 3) / lr;
            this.lunge.z *= (ARENA_R - 3) / lr;
          }
        }
      }
    } else if (this.fst === 'tele') {
      if (this.sub < JAW_STEPS.length) {
        const TJ = JAW_STEPS[this.sub]!.T * D.tele;
        const u = clamp(ft / TJ, 0, 1);
        this.jawT.forEach((j, i) => a.setJawSlot(i, true, j.x, j.z, u, 0));
        if (ft >= TJ) {
          this.ft = 0;
          this.fst = 'impact';
          audio.snap();
          audio.slam();
          this.shake = Math.max(this.shake, 0.6);
          this.jawT.forEach((j) => {
            a.burst3(j.x, 0.5, j.z, 10, [0x4a3a28, 0x6a5640, 0xd8d0b8], 6);
            if (Math.hypot(this.px - j.x, this.pz - j.z) < 1.7) this.hurt(this.px - j.x, this.pz - j.z);
          });
        }
      } else {
        const u = clamp(ft / (1.5 * D.tele), 0, 1);
        a.setHead(smooth(u) * 0.8);
        a.setJaw(smooth(u));
        a.setShadow(this.lunge.x, this.lunge.z, 3.4, u, u > 0.8 && Math.floor(this.time * 10) % 2 === 0);
        if (ft >= 1.5 * D.tele) {
          this.ft = 0;
          this.fst = 'impact';
          a.hideShadow();
          a.setJaw(0);
          audio.slam();
          this.ctx.ui.flash(0.45, 280);
          this.shake = Math.max(this.shake, 1.2);
          a.burst3(this.lunge.x, 0.5, this.lunge.z, 24, [0x2a1a44, 0xd8d0b8, 0x6a1a8a], 9);
          if (Math.hypot(this.px - this.lunge.x, this.pz - this.lunge.z) < 3.2) this.hurt(this.px - this.lunge.x, this.pz - this.lunge.z);
          this.coreOn = true;
          this.coreLit = 0;
        }
      }
    } else if (this.fst === 'impact') {
      if (this.sub < JAW_STEPS.length) {
        const e = clamp(ft / 0.18, 0, 1);
        const burst = 1 + 0.15 * Math.sin(e * Math.PI) * (e < 1 ? 1 : 0);
        this.jawT.forEach((j, i) => a.setJawSlot(i, true, j.x, j.z, 1, e < 1 ? e * burst : 1));
        if (ft >= 0.7) {
          for (let i = 0; i < 4; i++) a.setJawSlot(i, false);
          this.sub++;
          this.ft = 0;
          this.fst = 'wait';
        }
      } else if (ft >= 0.25) {
        this.ft = 0;
        this.fst = 'stuck';
      }
    } else if (this.fst === 'stuck') {
      // the Mournmoth's light exposes the core
      this.coreLit = Math.min(1, this.coreLit + dt * 2.2);
      a.setCore(true, this.lunge.x, 1.1, this.lunge.z, this.coreLit);
      if (ft >= 3.2 * D.window) {
        this.ft = 0;
        this.fst = 'retract';
      }
    } else if (this.fst === 'retract') {
      const u = clamp(ft / 0.9, 0, 1);
      a.setHead(0.8 * (1 - smooth(u)));
      this.coreLit = Math.max(0, this.coreLit - dt * 2);
      a.setCore(this.coreLit > 0.02, this.lunge.x, 1.1, this.lunge.z, this.coreLit);
      if (u >= 1) {
        this.coreOn = false;
        a.setCore(false);
        a.setHead(0);
        this.sub = JAW_STEPS.length - 2;
        this.ft = 0;
        this.fst = 'wait';
      }
    }
  }

  private clearStep(dt: number, kind: Kind) {
    const a = this.arena;
    const ft = this.ft;
    if (kind === 'gaze') a.setHead(Math.max(0, 1 - smooth(ft / 1.6)));
    if (kind === 'jaws') {
      this.coreLit = Math.max(0, this.coreLit - dt);
      a.setCore(this.coreLit > 0.02, this.lunge.x, 1.1, this.lunge.z, this.coreLit);
    }
    if (ft >= 1.9) this.advancePhase();
  }

  private runAttack(dt: number) {
    const a = this.arena;
    const { audio } = this.ctx;
    const kind = PHASES[this.phase]?.kind ?? 'foot';
    this.ft += dt;
    const ft = this.ft;
    if (kind === 'gaze' || kind === 'jaws') {
      if (this.fst === 'clear') this.clearStep(dt, kind);
      else if (kind === 'gaze') this.runGaze(dt);
      else this.runJaws(dt);
      return;
    }
    const steps = kind === 'foot' ? FOOT_STEPS : RAKE_STEPS;
    const step = steps[Math.min(this.sub, steps.length - 1)]!;
    if (this.fst === 'wait') {
      if (ft >= step.w) {
        this.ft = 0;
        this.fst = 'tele';
        if (kind === 'foot') {
          const f = new THREE.Vector3(this.pvx, 0, this.pvz).multiplyScalar(step.lead ?? 0.22);
          this.foot = { x: this.px + f.x, z: this.pz + f.z };
          const fr = Math.hypot(this.foot.x, this.foot.z);
          if (fr > ARENA_R - 1.5) {
            this.foot.x *= (ARENA_R - 1.5) / fr;
            this.foot.z *= (ARENA_R - 1.5) / fr;
          }
          a.foot.visible = true;
        } else {
          const dir = step.flip ? -this.rake.dir : Math.random() < 0.5 ? -1 : 1;
          // nine lanes cover the whole floor; you have to stand in a gap (the second rake lands in the first one's gaps)
          const base = step.flip ? this.rake.base + step.off! : (Math.random() - 0.5) * LANE_GAP;
          this.rake = { dir, lanes: Array.from({ length: LANES }, (_, i) => base + (i - (LANES - 1) / 2) * LANE_GAP), armX: -dir * (ARENA_R + 8), base };
          a.arms.forEach((m, i) => {
            m.visible = true;
            a.setArmLength(m, 1);
            m.rotation.y = dir > 0 ? Math.PI : 0;
            m.position.set(this.rake.armX, 0.7, this.rake.lanes[i]!);
          });
        }
        audio.rumble();
      }
    } else if (this.fst === 'tele') {
      const T = step.T * D.tele;
      const u = clamp(ft / T, 0, 1);
      audio.setHeart(1.2 + u * 1.6, 0.7);
      if (kind === 'foot') {
        a.setShadow(this.foot.x, this.foot.z, FOOT_R + 0.4, u, u > 0.8 && Math.floor(this.time * 10) % 2 === 0);
        a.foot.position.set(this.foot.x, lerp(40, 11, u * u), this.foot.z);
      } else {
        const blink = Math.floor(this.time * 9) % 2 === 0 || u < 0.5;
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
          a.foot.position.set(this.foot.x, 1.3, this.foot.z);
          a.hideShadow();
          audio.slam();
          this.ctx.ui.flash(0.4, 260);
          this.shake = 1.1;
          a.burst3(this.foot.x, 0.4, this.foot.z, 22, [0x3a2a62, 0x46346f, 0x120a22], 9);
          if (Math.hypot(this.px - this.foot.x, this.pz - this.foot.z) < FOOT_R * 0.92) this.hurt(this.px - this.foot.x, this.pz - this.foot.z);
        } else {
          audio.whoosh();
          a.lanes.forEach((l) => (l.visible = false));
        }
      }
    } else if (this.fst === 'impact') {
      if (kind === 'foot') {
        if (ft >= 0.2) {
          this.ft = 0;
          this.fst = step.fin ? 'stuck' : 'retract';
        }
      } else {
        const T = 1.0;
        const u = clamp(ft / T, 0, 1);
        const e = 1 - Math.pow(1 - u, 2);
        this.rake.armX = lerp(-this.rake.dir * (ARENA_R + 8), this.rake.dir * RAKE_END, e);
        a.arms.forEach((m, i) => {
          m.position.set(this.rake.armX, 0.7, this.rake.lanes[i]!);
          const lane = this.rake.lanes[i]!;
          const lo = Math.min(this.rake.armX, this.rake.armX - this.rake.dir * 16);
          const hi = Math.max(this.rake.armX, this.rake.armX - this.rake.dir * 16);
          if (u < 1 && Math.abs(this.pz - lane) < 1.15 && this.px > lo - 0.4 && this.px < hi + 0.4) this.hurt(this.rake.dir, 0);
        });
        if (u >= 1) {
          this.ft = 0;
          this.fst = step.fin ? 'stuck' : 'retract';
          audio.slam();
          this.shake = 0.8;
          if (step.fin) a.arms.forEach((m) => a.setArmLength(m, 0.2));
          for (const l of this.rake.lanes) a.burst3(this.rake.dir * RAKE_END, 0.4, l, 8, [0x3a2a62, 0x46346f], 6);
        }
      }
    } else if (this.fst === 'stuck') {
      const S = 2.6 * D.window;
      if (kind === 'foot') {
        a.foot.position.y = 1.3 + Math.sin(this.time * 20) * 0.04;
      }
      if (ft >= S) {
        this.ft = 0;
        this.fst = 'retract';
      }
    } else if (this.fst === 'retract') {
      const u = clamp(ft / (step.fin ? 0.9 : 0.45), 0, 1);
      if (kind === 'foot') a.foot.position.y = lerp(1.3, 40, u * u);
      else a.arms.forEach((m) => (m.position.x += this.rake.dir * (step.fin ? 24 : 40) * dt));
      if (u >= 1) {
        this.ft = 0;
        this.fst = 'wait';
        a.foot.visible = false;
        a.arms.forEach((m) => (m.visible = false));
        // a missed finisher replays the last three attacks, not the whole sequence
        this.sub = step.fin ? steps.length - 3 : this.sub + 1;
      }
    } else if (this.fst === 'clear') {
      // after a successful counterattack: attacks retreat, then the next phase (or the end)
      if (kind === 'foot') a.foot.position.y = lerp(a.foot.position.y, 40, 1 - Math.exp(-3 * dt));
      else a.arms.forEach((m) => (m.position.x += this.rake.dir * 20 * dt));
      if (ft >= 1.9) this.advancePhase();
    }
  }

  private updatePlayerRig(dt: number) {
    const a = this.arena;
    const p = a.player;
    const sp = Math.hypot(this.pvx, this.pvz);
    this.walk = sp / PLAYER_SPEED;
    this.bob += dt * (5 + sp * 1.3);
    // face the way you run; stand facing where the camera looks; a strike turns you to its target
    let targetYaw: number;
    if (this.strikeT > 0) targetYaw = this.lastFace;
    else if (sp > 0.6) targetYaw = Math.atan2(this.pvx, this.pvz);
    else {
      const f = this.camFwd();
      targetYaw = Math.atan2(f.x, f.z);
    }
    if (this.state !== 'fight') targetYaw = Math.PI;
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    this.yaw += dy * (1 - Math.exp(-14 * dt));
    p.position.set(this.px, 0, this.pz);
    p.rotation.y = this.yaw;
    p.visible = this.invuln > 0 ? Math.floor(this.time * 14) % 2 === 0 : true;
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const st = this.strikeT / 0.3;
    a.animatePlayer(dt, this.time, this.walk, this.bob, st, this.invuln > 0);
    if (this.strikeT > 0) {
      a.showSlash(this.px + f.x * 1.3, this.pz + f.z * 1.3, Math.atan2(f.x, f.z) + Math.PI / 2 - 0.4, st);
    } else {
      a.showSlash(0, -50, 0, 0);
    }
  }

  /* ---------------------------------------------------------------- */
  /* the ending                                                        */
  /* ---------------------------------------------------------------- */

  private beginEnding() {
    this.state = 'ending';
    this.et = 0;
    this.control = false;
    this.fired.clear();
    const { ui, input, audio } = this.ctx;
    input.setAction(null);
    input.setMoveEnabled(false);
    input.setCameraEnabled(false);
    ui.recenter(false);
    ui.hearts(null);
    ui.hint(null);
    audio.setDrone(0, 2.5);
    audio.setHeart(0, 0);
    audio.setLullaby(0.9, 0);
    this.arena.setRedLight(0);
    // each pinned specimen will flicker out at its own moment
    const rnd = rng(9);
    this.warmData = this.arena.pinned.map((m, i) => ({
      x: m.position.x,
      y: m.position.y,
      z: m.position.z,
      at: 3.2 + rnd() * 3.6,
      mine: i >= this.arena.pinned.length - 2,
      tx: i === this.arena.pinned.length - 2 ? -2.6 : 2.6,
      tz: 7.4,
    }));
    this.warm.visible = true;
  }

  private updateEnding(dt: number) {
    this.et += dt;
    const t = this.et;
    const { ui, audio } = this.ctx;
    const a = this.arena;
    // you walk back to the middle of the clearing
    const gx = 0 - this.px;
    const gz = 5.6 - this.pz;
    this.pvx = gx * 1.4;
    this.pvz = gz * 1.4;
    this.px += this.pvx * dt;
    this.pz += this.pvz * dt;
    // X does not scream. He flattens into a 2D cut-out, then crumbles.
    const flat = smooth(unlerp(0.4, 2.2, t));
    a.boss.scale.z = lerp(1, 0.03, flat);
    for (const m of this.bossMats) (m as THREE.MeshLambertMaterial).color?.lerp(new THREE.Color(0x05030a), flat * 0.2);
    a.setRedLight(80 * (1 - flat));
    this.fire('crumble', t >= 2.5, () => {
      audio.crumble();
      for (let i = 0; i < 6; i++) a.burst3((Math.random() - 0.5) * 6, 3 + Math.random() * 10, BG_BOSS_Z, 20, [0x05030a, 0x1a1030, 0x3a2660], 6);
    });
    if (t >= 2.5) {
      const u = unlerp(2.5, 4.0, t);
      a.boss.scale.y = Math.max(0.001, 1 - u);
      if (u >= 1) a.boss.visible = false;
    }
    // the pinned flicker out into warm lights
    this.fire('warm', t >= 3.2, () => audio.warm());
    const pos = this.warm.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.warmData.forEach((w, i) => {
      const sprite = a.pinned[i]!;
      if (t < w.at) {
        pos.setXYZ(i, 0, -999, 0);
        if (t > w.at - 0.5 && Math.floor(t * 18) % 2 === 0) sprite.visible = !sprite.visible;
        return;
      }
      sprite.visible = false;
      const u = t - w.at;
      if (w.mine) {
        const e = smooth(unlerp(0, 3.0, u));
        const x = lerp(w.x, w.tx, e);
        const y = lerp(w.y, 1.3, e);
        const z = lerp(w.z, w.tz, e);
        pos.setXYZ(i, x, y, z);
        const idx = i === a.pinned.length - 2 ? 0 : 1;
        const light = this.lights[idx]!;
        light.visible = e > 0.98;
        light.position.set(w.tx, 1.2 + Math.sin(t * 2 + idx) * 0.08, w.tz);
        pos.setXYZ(i, e > 0.98 ? 0 : x, e > 0.98 ? -999 : y, z);
      } else {
        pos.setXYZ(i, w.x + Math.sin(u * 2 + i) * 0.6, w.y + u * 2.2, w.z + u * 0.8);
      }
    });
    pos.needsUpdate = true;
    // the clearing is rebuilt around you
    const rb = smooth(unlerp(4.6, 9.0, t));
    a.tint(rb);
    a.setClearing(rb);
    // the camera rises and looks up
    const rise = smooth(unlerp(6.8, 12.8, t));
    const k = 1 - Math.exp(-2.6 * dt);
    this.camPos.lerp(new THREE.Vector3(0, lerp(9, 40, rise), lerp(20, 30, rise)), k);
    this.camLook.lerp(new THREE.Vector3(0, lerp(3, 70, rise), lerp(-2, -120, rise)), k);
    if (t >= 10.2) ui.moon(true);
    this.fire('line', t >= 10.8, () => ui.caption('I can look up now.', 3600, true));
    this.fire('blink', t >= 14.4, () => ui.moonBlink());
    this.fire('end', t >= 17.2, () => {
      this.state = 'end';
      this.onEnd?.();
    });
    this.updatePlayerRig(dt);
    this.updateMoth(dt);
  }

  /* ---------------------------------------------------------------- */

  update(dt: number) {
    this.time += dt;
    this.t += dt;
    const a = this.arena;
    if (this.state === 'boom') this.updateBoom(dt);
    else if (this.state === 'fight') this.updateFight(dt);
    else if (this.state === 'ending' || this.state === 'end') {
      if (this.state === 'ending') this.updateEnding(dt);
    }
    a.update(dt, this.time);

    // camera
    if (this.state === 'fight') {
      const f = this.camFwd();
      const cp = Math.cos(this.camPitch);
      const target = new THREE.Vector3(this.px - f.x * this.camDist * cp, 1.4 + Math.sin(this.camPitch) * this.camDist, this.pz - f.z * this.camDist * cp);
      this.camPos.lerp(target, 1 - Math.exp(-14 * dt));
      this.camLook.set(this.px + f.x * 5, 1.2, this.pz + f.z * 5);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake;
    a.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh * 0.5, this.camPos.y + (Math.random() - 0.5) * sh * 0.5, this.camPos.z);
    a.camera.lookAt(this.camLook);
  }

  /** The 1:45 teaser: a split-second look at the 3D world (no boss yet) before the forest snaps back. */
  prepareTeaser() {
    const a = this.arena;
    this.cubeGroup.visible = false;
    this.shard.visible = false;
    a.setRise(1);
    a.player.visible = false;
    a.boss.visible = false;
    a.foot.visible = false;
    a.arms.forEach((m) => (m.visible = false));
    a.hideShadow();
    a.lanes.forEach((l) => (l.visible = false));
    a.pinned.forEach((m) => (m.visible = true));
    a.camera.position.copy(BOOM_POS);
    a.camera.lookAt(BOOM_LOOK);
    a.update(0, this.time);
  }

  /** Debug / showcase: skip straight to the start of the fight. */
  skipToFight(phase = 0) {
    this.t = 9;
    this.phase = phase;
    this.fired = new Set(['burst', 'land', 'landed', 'swallow', 'reveal', 'title', 'go']);
    const a = this.arena;
    this.cubeGroup.visible = false;
    a.setRise(1);
    a.player.visible = true;
    a.boss.visible = true;
    a.showPlayerClaw(1);
    a.setRedLight(100);
    this.camPos.copy(BOOM_POS);
    this.camLook.copy(BOOM_LOOK);
    this.resetExtras();
    this.beginFight();
  }
}
