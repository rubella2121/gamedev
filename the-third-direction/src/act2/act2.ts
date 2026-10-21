import * as THREE from 'three';
import { Arena, ARENA_R, BOSS_Z } from './arena';
import { CollectorBoss } from './bosses/collector';
import { MashBoss } from './bosses/mash';
import { XBoss } from './bosses/xboss';
import { Features, type FeatureEnv } from './features';
import type { Boss3D, Env, Lance3, Nova3, Solid, Weak } from './fight';
import { Slicer } from './kit/sdf';
import { D } from '../core/difficulty';
import type { Ctx } from '../ctx';
import { H, W } from '../core/pix';
import { playTimed, say, STORY } from '../core/story';
import { MothMood, MothShield } from '../core/mothbond';
import { clamp, easeOutBack, easeOutCubic, lerp, rng, smooth, TAU, unlerp } from '../core/util';

type St = 'boom' | 'fight' | 'interlude' | 'ending' | 'end';

const PLAYER_SPEED = 7.6;
const START_Z = 12;
/** hold the button this long for a Lance, and this long (with a full meter) for a Nova */
const LANCE_T = 0.5;
const NOVA_T = 1.3;
const LANCE_SPEED = 36;
const NOVA_R = 9.5;
const DASH_T = 0.22;
const DASH_SPEED = 19;
const DASH_CD = 0.8;
const BOOM_POS = new THREE.Vector3(0, 9, 27);
const BOOM_LOOK = new THREE.Vector3(0, 8, -14);
/** The fight camera: a little flatter than before, so the whole monster fits. */
const CAM_PITCH = 0.5;

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
  private arenaStory = false;
  /** the moth takes the first hit of every fight; it rests on your head when you stand still and trembles when you are low */
  private shield = new MothShield();
  private mood = new MothMood();
  private tmp = new THREE.Object3D();
  private tmpC = new THREE.Color();
  private tmpV = new THREE.Vector3();
  private camPos = new THREE.Vector3(0, 0, 15.36);
  private camLook = new THREE.Vector3(0, 0, 0);
  private shake = 0;
  private hitStopT = 0;
  private slowT = 0;
  private slowScale = 1;

  // player
  readonly pl = { x: 0, z: START_Z, vx: 0, vz: 0, dead: false, invuln: 0 };
  private dvx = 0;
  private dvz = 0;
  private walk = 0;
  private camYaw = 0;
  private camPitch = CAM_PITCH;
  private camDist = 15;
  private lastFace = Math.PI;
  private yaw = Math.PI;
  private bob = 0;
  private strikeT = 0;
  private strikeCd = 0;
  private pending = 0;
  private control = false;
  private hearts = 3;
  private deadT = 0;
  private light = 0;
  private dashT = 0;
  private dashCd = 0;
  private dashX = 0;
  private dashZ = 1;
  private launchT = 0;
  private trapped = false;
  private pullX = 0;
  private pullZ = 0;
  private chargeStage: 0 | 1 | 2 = 0;
  private lances: Lance3[] = [];
  private nova: (Nova3 & { hit: boolean }) | null = null;
  private lancesOut: { x: number; y: number; z: number; vx: number; vy: number; vz: number }[] = [];

  // the fight
  readonly bosses: Boss3D[] = [];
  boss!: Boss3D;
  bi = 0;
  private solids: Solid[] = [];
  private features: Features;
  private it = 0;
  private hud = false;
  private slicer = new Slicer();
  private mothP = new THREE.Vector3(0, 2, 6);
  /** hearts per phase: the difficulty's hearts plus the bonus hearts found in secrets */
  private get maxHearts() {
    return D.hearts + Math.min(3, this.ctx.stats.bonus);
  }

  // ending
  private et = 0;
  private warm!: THREE.Points;
  private warmData: { x: number; y: number; z: number; at: number; mine: boolean; tx: number; tz: number }[] = [];
  private lights: THREE.Mesh[] = [];

  onEnd: (() => void) | null = null;

  /** what a boss sees of the fight */
  private env: Env;
  private fenv: FeatureEnv;

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
    this.solids = [...a.pillarData];
    this.features = new Features(a);

    const self = this;
    this.env = {
      arena: a,
      audio: ctx.audio,
      ui: ctx.ui,
      p: this.pl,
      get time() {
        return self.time;
      },
      solids: this.solids,
      hurt: (kx, kz) => this.hurt(kx, kz),
      shake: (v) => (this.shake = Math.max(this.shake, v)),
      hitStop: (s) => (this.hitStopT = Math.max(this.hitStopT, s)),
      addLight: (v) => this.addLight(v),
      refillHearts: () => this.refillHearts(),
      slowmo: (scale, secs) => {
        this.slowScale = scale;
        this.slowT = secs;
      },
      trap: (on) => (this.trapped = on),
      pull: (vx, vz) => {
        this.pullX += vx;
        this.pullZ += vz;
      },
      camLook: null,
    };
    this.fenv = {
      p: this.pl,
      get hearts() {
        return self.hearts;
      },
      get maxHearts() {
        return self.maxHearts;
      },
      get light() {
        return self.light;
      },
      heal: (v) => this.heal(v),
      addLight: (v) => this.addLight(v),
      launch: (dx, dz, dist) => this.launch(dx, dz, dist),
      sfx: { warm: () => ctx.audio.warm(), chime: () => ctx.audio.chime(), dash: () => ctx.audio.dash(), click: () => ctx.audio.click() },
    };
    // the bosses, in the order you meet them
    const x = new XBoss(this.env, a.world, () => this.bossDown());
    this.bosses.push(x, new CollectorBoss(this.env, a.world, () => this.bossDown()), new MashBoss(this.env, a.world, () => this.bossDown()));
    this.boss = x;
    for (const b of this.bosses) void b.build(this.slicer);
  }

  /** Called every frame, in the forest too: builds the monsters a few milliseconds at a time. */
  pump(ms: number) {
    if (this.slicer.busy) this.slicer.run(ms);
  }

  get modelsReady(): boolean {
    return this.bosses.every((b) => b.ready());
  }

  /* ---------------------------------------------------------------- */
  /* the boom                                                          */
  /* ---------------------------------------------------------------- */

  begin(frame: HTMLCanvasElement, boss = 0) {
    const a = this.arena;
    this.state = 'boom';
    this.t = 0;
    this.fired.clear();
    this.arenaStory = false;
    this.ctx.ui.narrateClear();
    // if the monsters are not built yet (a slow phone), finish them now: a stall is better than a missing boss
    this.slicer.flush();
    this.bi = Math.min(Math.max(0, boss), this.bosses.length - 1);
    this.boss = this.bosses[this.bi]!;
    for (const b of this.bosses) b.hide();
    this.hearts = this.maxHearts;
    this.light = 0;
    this.control = false;
    this.pl.x = 0;
    this.pl.z = START_Z;
    this.pl.vx = this.pl.vz = 0;
    this.pl.dead = false;
    this.pl.invuln = 0;
    this.dvx = this.dvz = 0;
    this.lances = [];
    this.nova = null;
    this.dashT = this.dashCd = this.launchT = 0;
    this.hud = false;
    a.player.visible = false;
    a.setRise(0);
    a.showPlayerClaw(0);
    a.hideShadow();
    a.marks.hideAll();
    a.lanes.forEach((l) => (l.visible = false));
    a.pinned.forEach((p) => (p.visible = true));
    a.restorePillars();
    a.tint(0);
    a.setClearing(0);
    a.setLances([]);
    a.setNova(false);
    a.moth.visible = false;
    this.mothP.set(-1.7, 2.3, START_Z + 0.4);
    this.warm.visible = false;
    this.lights.forEach((l) => (l.visible = false));
    this.features.show(false);
    this.features.reset();
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
    this.ctx.ui.light(null);
    this.ctx.ui.bossBar(null);
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
    playTimed(ui, this.fired, 'boom', t, STORY.boom);
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
      this.pl.x = 0;
      this.pl.z = START_Z;
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
      this.startBoss(3000);
      this.shake = 1.2;
    });
    this.fire('title', t >= 5.5, () => {
      ui.title();
      audio.setDrone(0.22, 2);
    });
    if (t >= 3.0) {
      a.player.position.y = 0;
      this.mothP.set(-1.7, 2.3, START_Z + 0.4);
      a.setMoth(this.mothP.x, this.mothP.y, this.mothP.z, this.time, true);
    }
  }

  /* ---------------------------------------------------------------- */
  /* a boss begins                                                     */
  /* ---------------------------------------------------------------- */

  private startBoss(titleDelay = 900) {
    this.state = 'fight';
    this.boss = this.bosses[this.bi]!;
    this.hud = false;
    this.control = false;
    this.features.show(true);
    this.features.reset();
    this.hearts = this.maxHearts;
    this.light = 0;
    this.lances = [];
    this.nova = null;
    this.resetSolids();
    this.shield.arm();
    this.boss.begin(titleDelay);
  }

  /** the HUD and the controls come on when the entrance ends */
  private beginFight() {
    const { input, ui } = this.ctx;
    this.hud = true;
    this.control = true;
    input.setMoveEnabled(true);
    input.setCameraEnabled(true);
    ui.hearts(this.hearts, this.maxHearts);
    ui.light(this.light);
    ui.recenter(true, () => this.resetCamera());
    this.resetCamera();
    if (this.bi === 0) {
      ui.caption('Strike.', 2400);
      if (!this.arenaStory) {
        this.arenaStory = true;
        for (const s of STORY.arena) window.setTimeout(() => this.state === 'fight' && say(ui, s.line), s.after);
      }
      window.setTimeout(() => ui.hint('hold + let go: lance   double-tap: dash'), 3600);
      window.setTimeout(() => ui.hint(null), 9600);
    }
    input.setAction('strike');
  }

  private resetSolids() {
    this.solids.length = 0;
    this.solids.push(...this.arena.pillarData);
  }

  /** Which way the camera looks along the floor. */
  private camFwd(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
  }

  /** Swing the camera behind the player, looking at the boss. */
  private resetCamera() {
    const dx = 0 - this.pl.x;
    const dz = BOSS_Z + 1.5 - this.pl.z;
    this.camYaw = Math.atan2(-dx, -dz);
    this.camPitch = CAM_PITCH;
  }

  /* ---------------------------------------------------------------- */
  /* hearts, light and the player's powers                             */
  /* ---------------------------------------------------------------- */

  private hurt(kx: number, kz: number) {
    const pl = this.pl;
    if (pl.invuln > 0 || pl.dead || this.boss.state !== 'fight' || this.state !== 'fight') return;
    const { ui, audio } = this.ctx;
    if (this.shield.absorb()) {
      this.mothTakesIt();
      return;
    }
    this.mood.hurt();
    this.hearts--;
    pl.invuln = 1.5;
    ui.hearts(this.hearts, this.maxHearts);
    ui.red(0.55, 350);
    audio.hurt();
    this.shake = Math.max(this.shake, 0.7);
    const l = Math.hypot(kx, kz) || 1;
    this.dvx += (kx / l) * 9;
    this.dvz += (kz / l) * 9;
    this.arena.burst3(pl.x, 0.8, pl.z, 8, [0xf2d36b, 0xfff1a6], 5);
    if (this.hearts <= 0) this.die();
  }

  /** The moth throws itself in front of a hit: no damage, a flash of moonlight, a moment to get away. */
  private mothTakesIt() {
    const { ui, audio } = this.ctx;
    const pl = this.pl;
    pl.invuln = 1.0;
    audio.chime();
    ui.flash(0.22, 220);
    this.shake = Math.max(this.shake, 0.35);
    this.arena.burst3(pl.x, 1.2, pl.z, 14, [0x9fe8ff, 0xcff6ff, 0xffffff], 6);
    this.mothP.set(pl.x, 1.5, pl.z);
    this.fire('shield-took', true, () => say(ui, STORY.mothShield.took));
  }

  private die() {
    const { ui, audio } = this.ctx;
    this.pl.dead = true;
    this.trapped = false;
    this.deadT = 1.1;
    this.ctx.stats.deaths++;
    ui.fade(1, 250);
    audio.death();
    this.control = false;
    this.dashT = 0;
    this.lances = [];
    this.nova = null;
    this.arena.setLances([]);
    this.arena.setNova(false);
    this.ctx.input.setCharge(0, 0);
  }

  private resetPhase() {
    const a = this.arena;
    this.hearts = this.maxHearts;
    this.pl.x = 0;
    this.pl.z = START_Z;
    this.pl.vx = this.pl.vz = 0;
    this.dvx = this.dvz = 0;
    this.pl.invuln = 0;
    this.pl.dead = false;
    this.trapped = false;
    this.light = 0;
    this.dashT = this.dashCd = this.launchT = 0;
    this.resetCamera();
    a.hideShadow();
    a.marks.hideAll();
    a.lanes.forEach((l) => (l.visible = false));
    this.resetSolids();
    this.features.reset();
    this.boss.onPlayerDied();
    this.shield.arm();
    this.mood.reset();
    this.ctx.ui.hearts(this.hearts, this.maxHearts);
    this.ctx.ui.light(this.light);
    this.ctx.ui.fade(0, 450);
    this.control = true;
  }

  private refillHearts() {
    this.hearts = this.maxHearts;
    this.ctx.ui.hearts(this.hearts, this.maxHearts);
    this.features.refresh();
  }

  private heal(n: number) {
    this.hearts = Math.min(this.maxHearts, this.hearts + n);
    this.ctx.ui.hearts(this.hearts, this.maxHearts);
  }

  private addLight(n: number) {
    const before = this.light;
    this.light = clamp(this.light + n, 0, 3);
    this.ctx.ui.light(this.light);
    if (before < 3 && this.light >= 3) this.ctx.audio.chime();
  }

  /** the nearest thing a hit could land on, for the lunge and the aim */
  private nearestWeak(maxAng = Math.PI, from?: { x: number; z: number; yaw: number }): { w: Weak; d: number } | null {
    const ws = this.boss.weak();
    let best: { w: Weak; d: number } | null = null;
    let bs = 1e9;
    for (const w of ws) {
      const dx = w.x - this.pl.x;
      const dz = w.z - this.pl.z;
      const d = Math.hypot(dx, dz);
      let score = d;
      if (from) {
        let da = Math.atan2(dx, dz) - from.yaw;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) > maxAng) continue;
        score = Math.abs(da) * 20 + d * 0.2;
      }
      if (score < bs) {
        bs = score;
        best = { w, d };
      }
    }
    return best;
  }

  /** A strike lunges toward the nearest thing it can hit, so a big arena never costs you the window. */
  private strikeDash() {
    const tg = this.nearestWeak();
    if (!tg) return;
    const w = tg.w;
    const dx = w.x - this.pl.x;
    const dz = w.z - this.pl.z;
    const d = tg.d;
    this.lastFace = Math.atan2(dx, dz);
    const need = d - w.reach * 0.7;
    if (need <= 0 || d > 11) return;
    const go = Math.min(7.5, need);
    this.dvx = (dx / d) * go * 12;
    this.dvz = (dz / d) * go * 12;
  }

  private resolveStrike() {
    const pl = this.pl;
    const fx = Math.sin(this.lastFace);
    const fz = Math.cos(this.lastFace);
    this.features.hit(pl.x + fx * 1.2, pl.z + fz * 1.2, 1.6, this.fenv);
    this.boss.onPlayerStrike(pl.x, pl.z, fx, fz);
    for (const w of this.boss.weak()) {
      if (Math.hypot(pl.x - w.x, pl.z - w.z) <= w.reach) {
        if (this.boss.hitBy('strike', w)) return;
      }
    }
  }

  private startDash() {
    const { input, audio } = this.ctx;
    const pl = this.pl;
    let dx = input.moveX;
    let dz = input.moveY;
    if (Math.hypot(dx, dz) > 0.2) {
      const f = this.camFwd();
      const rx = -f.z;
      const rz = f.x;
      const mx = rx * dx + f.x * -dz;
      const mz = rz * dx + f.z * -dz;
      const l = Math.hypot(mx, mz) || 1;
      dx = mx / l;
      dz = mz / l;
    } else {
      dx = Math.sin(this.yaw);
      dz = Math.cos(this.yaw);
    }
    this.dashX = dx;
    this.dashZ = dz;
    this.dashT = DASH_T;
    this.dashCd = DASH_CD;
    pl.invuln = Math.max(pl.invuln, DASH_T + 0.14);
    this.lastFace = Math.atan2(dx, dz);
    audio.dash();
    this.arena.burst3(pl.x, 0.5, pl.z, 8, [0xf2d36b, 0xfff1a6, 0xffffff], 4);
  }

  /** a pad throws you */
  private launch(dx: number, dz: number, dist: number) {
    this.dashX = dx;
    this.dashZ = dz;
    this.dashT = dist / 24;
    this.launchT = this.dashT;
    this.pl.invuln = Math.max(this.pl.invuln, this.dashT + 0.2);
    this.lastFace = Math.atan2(dx, dz);
  }

  private castLance() {
    const pl = this.pl;
    let dx = Math.sin(this.yaw);
    let dz = Math.cos(this.yaw);
    let vy = 0;
    const tg = this.nearestWeak(0.75, { x: pl.x, z: pl.z, yaw: this.yaw });
    if (tg) {
      const l = tg.d || 1;
      dx = (tg.w.x - pl.x) / l;
      dz = (tg.w.z - pl.z) / l;
      vy = ((tg.w.y - 1.1) / Math.max(0.2, l / LANCE_SPEED)) * 0.98;
    }
    this.lastFace = Math.atan2(dx, dz);
    this.strikeT = Math.max(this.strikeT, 0.2);
    this.lances.push({ x: pl.x + dx * 0.9, y: 1.1, z: pl.z + dz * 0.9, vx: dx * LANCE_SPEED, vy, vz: dz * LANCE_SPEED, t: 0, life: 1.15 });
    this.ctx.audio.lance();
  }

  private castNova() {
    const pl = this.pl;
    this.light = 0;
    this.ctx.ui.light(0);
    this.nova = { x: pl.x, z: pl.z, t: 0, R: 0, max: NOVA_R, hit: false };
    pl.invuln = Math.max(pl.invuln, 0.6);
    this.ctx.audio.nova();
    this.shake = Math.max(this.shake, 0.7);
    this.ctx.ui.flash(0.35, 240);
    this.arena.burst3(pl.x, 0.8, pl.z, 22, [0xffe9a0, 0xffffff, 0xf2d36b], 11);
  }

  private updateLight(dt: number) {
    const a = this.arena;
    const pl = this.pl;
    for (let i = this.lances.length - 1; i >= 0; i--) {
      const l = this.lances[i]!;
      // move in small steps, so a slow frame cannot carry the bolt through a thin pillar or a weak point
      const steps = Math.max(1, Math.ceil((Math.hypot(l.vx, l.vy, l.vz) * dt) / 0.35));
      const sdt = dt / steps;
      let dead = false;
      for (let k = 0; k < steps && !dead; k++) {
        l.t += sdt;
        l.x += l.vx * sdt;
        l.y += l.vy * sdt;
        l.z += l.vz * sdt;
        dead = l.t >= l.life || l.y < 0.1 || l.y > 40 || Math.hypot(l.x, l.z) > ARENA_R + 16;
        if (!dead && l.y < 4.5) {
          for (const s of this.solids) {
            if (!s.alive) continue;
            if (Math.hypot(l.x - s.x, l.z - s.z) < s.r) {
              dead = s.onLight ? s.onLight('lance') : true;
              if (dead) {
                a.burst3(l.x, l.y, l.z, 6, [0xfffbe0, 0xffd878], 5);
                break;
              }
            }
          }
        }
        if (!dead && l.y < 3 && this.features.hit(l.x, l.z, 0.5, this.fenv)) dead = true;
        if (!dead && this.boss.state === 'fight') {
          if (this.boss.onLance(l)) dead = true;
          if (!dead) {
            for (const w of this.boss.weak()) {
              if (Math.hypot(l.x - w.x, l.y - w.y, l.z - w.z) < w.r) {
                this.boss.hitBy('lance', w);
                dead = true;
                break;
              }
            }
          }
        }
      }
      // a trail of sparks behind the bolt
      if (!dead && Math.floor(l.t * 45) !== Math.floor((l.t - dt) * 45)) a.burst3(l.x, l.y, l.z, 1, [0xfffbe0, 0xffd878], 1.2);
      if (dead) {
        a.burst3(l.x, l.y, l.z, 5, [0xfffbe0, 0xffd878], 4);
        this.lances.splice(i, 1);
      }
    }
    this.lancesOut = this.lances.map((l) => ({ x: l.x, y: l.y, z: l.z, vx: l.vx, vy: l.vy, vz: l.vz }));
    a.setLances(this.lancesOut);
    const n = this.nova;
    if (n) {
      n.t += dt;
      n.R = n.max * easeOutCubic(n.t / 0.5);
      a.setNova(true, n.x, n.z, n.R, n.t / 0.55);
      this.features.hit(n.x, n.z, n.R, this.fenv);
      if (this.boss.state === 'fight') {
        this.boss.onNova(n);
        if (!n.hit) {
          for (const w of this.boss.weak()) {
            if (Math.hypot(n.x - w.x, n.z - w.z) <= n.R + w.reach * 0.4) {
              if (this.boss.hitBy('nova', w)) {
                n.hit = true;
                break;
              }
            }
          }
        }
        for (const s of this.solids) if (s.alive && s.onLight && Math.hypot(s.x - n.x, s.z - n.z) <= n.R + s.r) s.onLight('nova');
      }
      if (n.t >= 0.55) {
        this.nova = null;
        a.setNova(false);
      }
    }
    void pl;
  }

  /* ---------------------------------------------------------------- */
  /* the fight                                                         */
  /* ---------------------------------------------------------------- */

  private updatePlayer(dt: number) {
    const { input, audio } = this.ctx;
    const pl = this.pl;
    this.pl.invuln = Math.max(0, pl.invuln - dt);
    this.strikeCd = Math.max(0, this.strikeCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    const dashing = this.dashT > 0;
    if (this.trapped) {
      pl.vx = pl.vz = 0;
      this.dvx = this.dvz = 0;
    }
    if (this.control) {
      const f = this.camFwd();
      const rx = -f.z;
      const rz = f.x;
      const mx = rx * input.moveX + f.x * -input.moveY;
      const mz = rz * input.moveX + f.z * -input.moveY;
      const k = 1 - Math.exp(-14 * dt);
      if (!this.trapped) {
        pl.vx += (mx * PLAYER_SPEED - pl.vx) * k;
        pl.vz += (mz * PLAYER_SPEED - pl.vz) * k;
      }
      // one button: tap strikes, double-tap dashes, hold then let go throws a lance, hold longer with a full meter bursts a nova
      if (input.actionPressed) {
        if (input.doubleTap && this.dashCd <= 0 && !this.trapped) this.startDash();
        else if (this.strikeCd <= 0 && this.dashT <= 0) {
          this.strikeT = 0.3;
          this.strikeCd = 0.42;
          this.pending = 0.14;
          audio.strike();
          this.strikeDash();
        }
      }
      const h = input.actionDown ? input.actionHold : 0;
      const full = this.light >= 3;
      let stage: 0 | 1 | 2 = 0;
      let u = 0;
      if (h > 0.18) {
        if (full && h >= NOVA_T) stage = 2;
        else if (h >= LANCE_T) stage = 1;
        u = h < LANCE_T ? (h - 0.18) / (LANCE_T - 0.18) : full ? clamp((h - LANCE_T) / (NOVA_T - LANCE_T), 0, 1) : 1;
      }
      if (stage !== this.chargeStage) {
        if (stage === 1) audio.charge1();
        if (stage === 2) audio.charge2();
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
    } else {
      pl.vx *= 0.9;
      pl.vz *= 0.9;
      if (this.chargeStage !== 0) {
        this.chargeStage = 0;
        input.setCharge(0, 0);
      }
    }
    // dash and pad throws replace walking for a moment
    let ox = (pl.vx + this.dvx) * dt;
    let oz = (pl.vz + this.dvz) * dt;
    if (dashing) {
      this.dashT -= dt;
      const sp = this.launchT > 0 ? 24 : DASH_SPEED;
      ox = this.dashX * sp * dt;
      oz = this.dashZ * sp * dt;
      if (Math.floor(this.time * 40) !== Math.floor((this.time - dt) * 40)) this.arena.burst3(pl.x, 0.5, pl.z, 1, [0xf2d36b, 0xfff1a6, 0xffffff], 1.5);
      if (this.dashT <= 0) this.launchT = 0;
    }
    ox += this.pullX * dt;
    oz += this.pullZ * dt;
    this.pullX = this.pullZ = 0;
    pl.x += ox;
    pl.z += oz;
    const decay = Math.exp(-12 * dt);
    this.dvx *= decay;
    this.dvz *= decay;
    const rr = Math.hypot(pl.x, pl.z);
    if (rr > ARENA_R - 0.9) {
      pl.x *= (ARENA_R - 0.9) / rr;
      pl.z *= (ARENA_R - 0.9) / rr;
    }
    // columns are solid: pillars, pins, jars
    for (const s of this.solids) {
      if (!s.alive) continue;
      const ox2 = pl.x - s.x;
      const oz2 = pl.z - s.z;
      const od = Math.hypot(ox2, oz2);
      const R = s.r + 0.45;
      if (od < R) {
        pl.x = s.x + (ox2 / (od || 1)) * R;
        pl.z = s.z + (oz2 / (od || 1)) * R;
      }
    }
    this.strikeT = Math.max(0, this.strikeT - dt);
    if (this.pending > 0) {
      this.pending -= dt;
      if (this.pending <= 0) this.resolveStrike();
    }
  }

  private updateFight(dt: number) {
    const { input } = this.ctx;
    const a = this.arena;
    const pl = this.pl;
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      dt *= 0.04;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= this.slowScale;
    }
    if (pl.dead) {
      this.deadT -= dt;
      this.updateRig(dt);
      if (this.deadT <= 0) this.resetPhase();
      return;
    }
    this.features.update(dt, this.fenv);
    const b = this.boss;
    if (!this.hud && b.state === 'fight') this.beginFight();
    if (this.hud && (b.state === 'dying' || b.state === 'gone')) {
      // a boss going down: the controls stay, the dangers are gone
      this.control = true;
    }
    this.updatePlayer(dt);
    this.updateLight(dt);
    // --- camera controls: Q / E, drag, and R to recentre
    if (this.control) {
      const cam = input.takeCam();
      const turn = input.camKey * 2.4 * dt + cam.dx * -0.011;
      this.camYaw += turn;
      this.camPitch = clamp(this.camPitch + cam.dy * 0.008, 0.12, 1.25);
      if (input.camReset) {
        input.camReset = false;
        this.resetCamera();
      }
    }
    b.update(dt);
    this.updateRig(dt);
    this.updateMoth(dt);
    void a;
  }

  private updateRig(dt: number) {
    const a = this.arena;
    const p = a.player;
    const pl = this.pl;
    const sp = Math.hypot(pl.vx, pl.vz);
    this.walk = sp / PLAYER_SPEED;
    this.bob += dt * (5 + sp * 1.3);
    // face the way you run; stand facing where the camera looks; a strike turns you to its target
    let targetYaw: number;
    if (this.strikeT > 0 || this.dashT > 0) targetYaw = this.lastFace;
    else if (sp > 0.6) targetYaw = Math.atan2(pl.vx, pl.vz);
    else {
      const f = this.camFwd();
      targetYaw = Math.atan2(f.x, f.z);
    }
    if (this.state === 'boom') targetYaw = Math.PI;
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    this.yaw += dy * (1 - Math.exp(-14 * dt));
    p.position.set(pl.x, 0, pl.z);
    p.rotation.y = this.yaw;
    p.visible = pl.invuln > 0 && this.dashT <= 0 ? Math.floor(this.time * 14) % 2 === 0 : true;
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const st = this.strikeT / 0.3;
    a.animatePlayer(dt, this.time, this.walk, this.bob, st, pl.invuln > 0 && this.dashT <= 0);
    if (this.strikeT > 0) {
      a.showSlash(pl.x + f.x * 1.3, pl.z + f.z * 1.3, Math.atan2(f.x, f.z) + Math.PI / 2 - 0.4, st);
    } else {
      a.showSlash(0, -50, 0, 0);
    }
  }

  private updateMoth(dt: number) {
    const a = this.arena;
    const pl = this.pl;
    const { audio } = this.ctx;
    // the ending: the moth goes home to the moon
    if (this.state === 'ending' && this.et >= 12.4) {
      const k = unlerp(12.4, 16.7, this.et);
      const e = smooth(k);
      // in the camera's own frame: from the bottom of the picture up to where the moon hangs, and further away as it goes
      const cam = a.camera;
      const fwd = cam.getWorldDirection(this.tmpV);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const right = new THREE.Vector3().crossVectors(fwd, up);
      const d = lerp(15, 70, e);
      const s = lerp(-0.8, 0.7, e);
      this.mothP.copy(cam.position).addScaledVector(fwd, d).addScaledVector(up, d * 0.62 * s).addScaledVector(right, Math.sin(this.et * 2.4) * d * 0.06);
      a.setMoth(this.mothP.x, this.mothP.y, this.mothP.z, this.time, k < 0.985, 0, 1.4 + 1.2 * e, 0);
      a.setShield(0, 0, this.time);
      return;
    }
    const moving = Math.hypot(pl.vx, pl.vz) > 0.6 || this.dashT > 0 || this.state === 'boom';
    this.mood.update(dt, moving, this.hearts, this.maxHearts);
    const inFight = this.state === 'fight';
    if (this.shield.update(dt) && inFight) {
      audio.chime();
      a.burst3(pl.x, 1.4, pl.z, 8, [0x9fe8ff, 0xcff6ff], 4);
    }
    // beside you; on your head when you stand still; close and trembling when you are one hit from a fall
    const rest = this.mood.calm;
    const worry = this.mood.worry;
    const target = new THREE.Vector3(pl.x - 1.4, 2.1, pl.z + 0.4);
    target.lerp(new THREE.Vector3(pl.x + 0.05, 2.15, pl.z), rest);
    target.lerp(new THREE.Vector3(pl.x - 0.7, 1.95, pl.z + 0.3), worry * 0.8);
    target.x += Math.sin(this.time * 31) * 0.05 * worry;
    target.y += Math.cos(this.time * 27) * 0.04 * worry;
    this.mothP.lerp(target, 1 - Math.exp(-(rest > 0.5 ? 7 : 3.5) * dt));
    const sh = this.shield;
    const glow = this.mood.glow * (inFight && !sh.ready ? 0.4 + 0.5 * sh.charge : 1) * (1 + 0.8 * sh.took + 0.6 * sh.back);
    a.setMoth(this.mothP.x, this.mothP.y, this.mothP.z, this.time, this.state !== 'end', rest, glow, worry);
    a.setShield(inFight && sh.ready ? 1 : 0, Math.max(sh.took, sh.back), this.time);
  }

  /* ---------------------------------------------------------------- */
  /* between the bosses                                                */
  /* ---------------------------------------------------------------- */

  private bossDown() {
    const { ui, input } = this.ctx;
    this.boss.hide();
    this.trapped = false;
    this.arena.marks.hideAll();
    this.arena.setLances([]);
    this.lances = [];
    this.nova = null;
    this.hearts = this.maxHearts;
    ui.hearts(this.hearts, this.maxHearts);
    input.setCharge(0, 0);
    this.shield.disarm();
    if (this.bi >= this.bosses.length - 1) {
      this.beginEnding();
      return;
    }
    this.bi++;
    this.state = 'interlude';
    this.it = 0;
    this.control = true;
    this.resetSolids();
    ui.bossBar(null);
  }

  private updateInterlude(dt: number) {
    this.it += dt;
    const { ui } = this.ctx;
    playTimed(ui, this.fired, `int${this.bi}-`, this.it, STORY.interlude[this.bi - 1] ?? []);
    this.features.update(dt, this.fenv);
    this.updatePlayer(dt);
    this.updateLight(dt);
    const input = this.ctx.input;
    const cam = input.takeCam();
    this.camYaw += input.camKey * 2.4 * dt + cam.dx * -0.011;
    this.camPitch = clamp(this.camPitch + cam.dy * 0.008, 0.12, 1.25);
    this.updateRig(dt);
    this.updateMoth(dt);
    if (this.it >= 5.2) this.startBoss();
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
    input.setCharge(0, 0);
    ui.recenter(false);
    ui.hearts(null);
    ui.light(null);
    ui.hint(null);
    ui.bossBar(null);
    audio.setDrone(0, 2.5);
    audio.setHeart(0, 0);
    audio.setLullaby(0.9, 0);
    this.arena.setRedLight(0);
    this.features.show(false);
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
    const pl = this.pl;
    // you walk back to the middle of the clearing
    const gx = 0 - pl.x;
    const gz = 5.6 - pl.z;
    pl.vx = gx * 1.4;
    pl.vz = gz * 1.4;
    pl.x += pl.vx * dt;
    pl.z += pl.vz * dt;
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
    playTimed(ui, this.fired, 'end-', t, STORY.ending);
    this.fire('blink', t >= 14.4, () => ui.moonBlink());
    this.fire('end', t >= 17.2, () => {
      this.state = 'end';
      this.onEnd?.();
    });
    this.updateRig(dt);
    this.updateMoth(dt);
  }

  /* ---------------------------------------------------------------- */

  update(dtReal: number) {
    this.time += dtReal;
    this.t += dtReal;
    const a = this.arena;
    const dt = dtReal;
    if (this.state === 'boom') this.updateBoom(dt);
    else if (this.state === 'fight') this.updateFight(dt);
    else if (this.state === 'interlude') this.updateInterlude(dt);
    else if (this.state === 'ending') this.updateEnding(dt);
    a.update(dt, this.time);

    // camera
    if (this.state === 'fight' || this.state === 'interlude') {
      const cine = this.state === 'fight' && this.boss.state === 'dying' ? this.boss.cinematic() : null;
      const f = this.camFwd();
      const cp = Math.cos(this.camPitch);
      const pl = this.pl;
      const target = new THREE.Vector3(pl.x - f.x * this.camDist * cp, 1.4 + Math.sin(this.camPitch) * this.camDist, pl.z - f.z * this.camDist * cp);
      // during an entrance the camera stays up and back, looking at the boss
      if (cine) {
        // a boss going down gets a wide shot from the middle of the floor
        const k = 1 - Math.exp(-2.4 * dt);
        this.camPos.lerp(this.tmpV.set(cine.x * 0.3, cine.y * 0.8 + 4, cine.z + cine.dist), k);
        this.camLook.lerp(this.tmpV.set(cine.x, cine.y, cine.z), k);
      } else if (this.state === 'fight' && !this.hud) {
        const k = 1 - Math.exp(-3 * dt);
        this.camPos.lerp(BOOM_POS, k);
        this.camLook.lerp(BOOM_LOOK, k);
      } else {
        this.camPos.lerp(target, 1 - Math.exp(-14 * dt));
        this.camLook.set(pl.x + f.x * 5, 1.2, pl.z + f.z * 5);
      }
    }
    this.shake = Math.max(0, this.shake - dtReal * 2.5);
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
    for (const b of this.bosses) b.hide();
    a.hideShadow();
    a.marks.hideAll();
    a.lanes.forEach((l) => (l.visible = false));
    a.pinned.forEach((m) => (m.visible = true));
    this.features.show(false);
    a.camera.position.copy(BOOM_POS);
    a.camera.lookAt(BOOM_LOOK);
    a.update(0, this.time);
  }

  /** Debug / showcase: skip straight to the start of a boss's fight (and a phase of it). */
  skipToFight(phase = 0, boss = 0) {
    this.t = 9;
    this.fired = new Set(['burst', 'land', 'landed', 'swallow', 'reveal', 'title']);
    const a = this.arena;
    this.slicer.flush();
    this.cubeGroup.visible = false;
    a.setRise(1);
    a.player.visible = true;
    a.showPlayerClaw(1);
    this.camPos.copy(BOOM_POS);
    this.camLook.copy(BOOM_LOOK);
    this.bi = boss;
    for (const b of this.bosses) b.hide();
    this.startBoss(300);
    this.boss.debugSkipTo(phase);
    this.beginFight();
  }
}
