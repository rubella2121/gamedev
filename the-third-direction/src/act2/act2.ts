import * as THREE from 'three';
import { Arena, ARENA_R, BOSS_Z, FAR_Z, groundY, landY } from './arena';
import { FERNS } from './crater';
import { groundDecals } from './ground';
import { CollectorBoss } from './bosses/collector';
import { MashBoss } from './bosses/mash';
import { XBoss } from './bosses/xboss';
import { Features, type FeatureEnv } from './features';
import type { Boss3D, Env, Lance3, Nova3, Solid, Weak } from './fight';
import { Slicer } from './kit/sdf';
import { Cut, type CamKey } from './cut';
import { SkyRift } from './rift';
import { animateParent } from './family';
import { DashPool } from '../core/dash';
import { D } from '../core/difficulty';
import type { Ctx } from '../ctx';
import { H, W } from '../core/pix';
import { playTimed, say, STORY, type SubLine } from '../core/story';
import { MothMood, MothShield } from '../core/mothbond';
import { Falls, type Verdict } from '../core/falls';
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
  /** falls in the fight you are in: Nightmare starts it over at four, the moth steps in at three in a phase otherwise */
  private falls = new Falls();
  private fallVerdict: Verdict = 'none';
  /** the fight is starting over: skip the "Strike." hint and the name card */
  private quietStart = false;
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
  /** dash charges (a dash is free of danger, so it is not free to repeat) */
  dashPool = new DashPool();
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
    return D.hearts + Math.min(3, this.ctx.stats.bonus) + this.falls.extraHearts;
  }

  private showFalls() {
    const f = this.state === 'fight' ? this.falls.shown : null;
    this.ctx.ui.falls(f ? f.n : null, f ? f.max : 4);
  }

  // ending
  private et = 0;
  private warm!: THREE.Points;
  private warmData: { x: number; y: number; z: number; at: number; mine: boolean; tx: number; tz: number }[] = [];
  private lights: THREE.Mesh[] = [];

  onEnd: (() => void) | null = null;

  /** the cutscene playing now (it owns the camera, the letterbox and the subtitles) */
  private cut: Cut | null = null;
  private cutCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  /** this run opens with the cinematic way into 3D (the trailer and the boss picker keep the short boom) */
  private cineIntro = false;

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
      phaseBegan: () => this.falls.newPhase(),
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
      get hidden() {
        return self.hidden;
      },
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
      hurt: (kx, kz) => this.hurt(kx, kz),
      solids: this.solids,
      say: (text) => ctx.ui.caption(text, 2200, true),
      get fighting() {
        return self.state === 'fight' && self.boss.state === 'fight' && !self.cut && self.control;
      },
      sfx: { warm: () => ctx.audio.warm(), chime: () => ctx.audio.chime(), dash: () => ctx.audio.dash(), click: () => ctx.audio.click(), slam: () => ctx.audio.slam(), snap: () => ctx.audio.snap() },
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

  begin(frame: HTMLCanvasElement, boss = 0, cinematic = false) {
    const a = this.arena;
    this.state = 'boom';
    this.cineIntro = cinematic;
    if (this.cut) this.endCut(false);
    a.cage.reset();
    a.cage.auto = true;
    this.cubeGroup.position.set(0, 0, 0);
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
    this.dashPool.reset();
    this.hud = false;
    a.player.visible = false;
    a.jellyReset();
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
    // every warning the bosses draw on the floor lies on the ground, terraces too
    groundDecals(a.world);
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
    this.skyRift().setFlat(c);
    this.camPos.set(0, 0, 15.36);
    this.camLook.set(0, 0, 0);
    a.camera.position.copy(this.camPos);
    a.camera.lookAt(this.camLook);
    this.ctx.input.setAction(null);
    this.ctx.ui.hint(null);
    this.ctx.ui.hearts(null);
    this.ctx.ui.light(null);
    this.ctx.ui.bossBar(null);
    if (this.rift) this.rift.group.visible = false;
    if (cinematic) this.startIntro();
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
      a.burst3(0.2, 1.1, START_Z + 0.2, 10, [0xf4efe0, 0x120a1c, 0xff2a40], 3);
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

  private startBoss(titleDelay = 900, startOver = false) {
    this.state = 'fight';
    this.falls.reset();
    this.quietStart = startOver;
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
    this.showFalls();
    this.boss.begin(titleDelay, startOver);
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
    if (this.bi === 0 && !this.quietStart) {
      ui.caption('Strike.', 2400);
      if (!this.arenaStory) {
        this.arenaStory = true;
        for (const s of STORY.arena) window.setTimeout(() => this.state === 'fight' && say(ui, s.line), s.after);
      }
      window.setTimeout(() => ui.hint('hold + let go: lance   double-tap: dash'), 3600);
      window.setTimeout(() => ui.hint(null), 9600);
    }
    this.quietStart = false;
    input.setAction('strike');
  }

  /** can the Blob move by (dx, dz) from (x, z)? Not up a cliff: a rise steeper than a ramp, checked in small steps */
  private canStep(x: number, z: number, dx: number, dz: number): boolean {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return true;
    const n = Math.max(1, Math.ceil(d / 0.12));
    let h = groundY(x, z);
    for (let i = 1; i <= n; i++) {
      const h2 = groundY(x + (dx * i) / n, z + (dz * i) / n);
      // a ramp rises 0.8 in 5 or more; a cliff rises it in a fraction of a unit
      if (h2 - h > 0.05 + (0.45 * d) / n) return false;
      h = h2;
    }
    return true;
  }

  private resetSolids() {
    this.solids.length = 0;
    this.solids.push(...this.arena.pillarData);
  }

  /** in the fern thicket: what hunts by sight cannot see you (a strike or a bolt gives you away for a moment) */
  get hidden(): boolean {
    const pl = this.pl;
    return !pl.dead && this.strikeT <= 0 && this.revealT <= 0 && Math.hypot(pl.x - FERNS.x, pl.z - FERNS.z) < FERNS.r;
  }
  private revealT = 0;

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
    this.features.onHurt();
    this.arena.jellyKick(-3.4, (Math.random() - 0.5) * 3, -2.2);
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
    this.fallVerdict = this.falls.fall();
    this.showFalls();
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
    this.dashPool.reset();
    this.resetCamera();
    a.hideShadow();
    a.marks.hideAll();
    a.lanes.forEach((l) => (l.visible = false));
    this.resetSolids();
    this.features.reset();
    const verdict = this.fallVerdict;
    this.fallVerdict = 'none';
    const { ui, audio } = this.ctx;
    if (verdict === 'restart') {
      // too many falls on Nightmare: the whole fight again, from its first phase
      this.mood.reset();
      ui.hearts(null);
      ui.light(null);
      ui.fade(0, 450);
      this.boss.hide();
      this.startBoss(300, true);
      say(ui, STORY.retry.restart);
      return;
    }
    this.boss.onPlayerDied();
    this.shield.arm();
    this.mood.reset();
    if (verdict === 'warn') say(ui, STORY.retry.warn);
    if (verdict === 'assist') {
      say(ui, STORY.retry.assist);
      audio.chime();
      this.shield.back = 1;
    }
    ui.hearts(this.hearts, this.maxHearts);
    ui.light(this.light);
    ui.fade(0, 450);
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
    this.dashPool.use();
    pl.invuln = Math.max(pl.invuln, DASH_T + 0.05);
    this.lastFace = Math.atan2(dx, dz);
    // it stretches long and low into the dash
    this.arena.jellyKick(-2.2, 0, 1.2);
    audio.dash();
    this.arena.burst3(pl.x, 0.5, pl.z, 8, [0xf2d36b, 0xfff1a6, 0xffffff], 4);
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
      vy = ((tg.w.y - 1.1 - groundY(pl.x, pl.z)) / Math.max(0.2, l / LANCE_SPEED)) * 0.98;
    }
    this.lastFace = Math.atan2(dx, dz);
    this.strikeT = Math.max(this.strikeT, 0.2);
    this.revealT = 1.2;
    this.lances.push({ x: pl.x + dx * 0.9, y: 1.1 + groundY(pl.x, pl.z), z: pl.z + dz * 0.9, vx: dx * LANCE_SPEED, vy, vz: dz * LANCE_SPEED, t: 0, life: 1.15 });
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
        dead = l.t >= l.life || l.y < groundY(l.x, l.z) + 0.1 || l.y > 40 || Math.hypot(l.x, l.z) > ARENA_R + 16;
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
    this.dashPool.update(dt);
    this.ctx.ui.dashes(this.dashPool.charges, this.dashPool.max, this.dashPool.frac);
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
        if (input.doubleTap && this.dashCd <= 0 && !this.trapped && this.dashPool.can()) this.startDash();
        else if (this.strikeCd <= 0 && this.dashT <= 0) {
          if (input.doubleTap && this.dashCd <= 0 && !this.trapped) this.ctx.ui.dashEmpty();
          this.strikeT = 0.3;
          this.strikeCd = 0.42;
          this.pending = 0.14;
          this.arena.jellyKick(-1.4, 0, 1.6);
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
      if (this.dashT <= 0) {
        // the end of a dash or a throw: it splats down and sloshes
        this.arena.jellyKick(this.launchT > 0 ? -4.2 : -2.4);
        this.launchT = 0;
      }
    }
    ox += this.pullX * dt;
    oz += this.pullZ * dt;
    this.pullX = this.pullZ = 0;
    // the edge of a terrace is a cliff: you can drop down it, not climb it (try the whole step, then each half of it)
    if (!this.canStep(pl.x, pl.z, ox, oz)) {
      if (this.canStep(pl.x, pl.z, ox, 0)) oz = 0;
      else if (this.canStep(pl.x, pl.z, 0, oz)) ox = 0;
      else ox = oz = 0;
    }
    pl.x += ox;
    pl.z += oz;
    this.revealT = Math.max(0, this.revealT - dt);
    // the first time you slip into the ferns, you are told what they are for
    this.fire('ferns', this.hidden && this.state === 'fight', () => this.ctx.ui.caption('in the ferns, it cannot see you.', 2400, true));
    const decay = Math.exp(-12 * dt);
    this.dvx *= decay;
    this.dvz *= decay;
    const rr = Math.hypot(pl.x, pl.z);
    if (rr > ARENA_R - 0.9) {
      pl.x *= (ARENA_R - 0.9) / rr;
      pl.z *= (ARENA_R - 0.9) / rr;
    }
    // the boss's side of the floor ends where he stands
    if (pl.z < FAR_Z) pl.z = FAR_Z;
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
    p.position.set(pl.x, groundY(pl.x, pl.z), pl.z);
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
    if (this.state === 'ending' && this.et >= 19.8) {
      const k = unlerp(19.8, 24.0, this.et);
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
    // the ending, before that: it hangs over the family's heads
    if (this.state === 'ending') {
      this.mothP.lerp(this.tmpV.set(0.3 + Math.sin(this.time * 0.9) * 0.4, 4.4 + Math.sin(this.time * 1.7) * 0.15, 1.0), 1 - Math.exp(-2 * dt));
      a.setMoth(this.mothP.x, this.mothP.y, this.mothP.z, this.time, true, 0.6, 1, 0);
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
    const gy = groundY(pl.x, pl.z);
    const target = new THREE.Vector3(pl.x - 1.4, 2.1 + gy, pl.z + 0.4);
    target.lerp(new THREE.Vector3(pl.x + 0.05, 2.15 + gy, pl.z), rest);
    target.lerp(new THREE.Vector3(pl.x - 0.7, 1.95 + gy, pl.z + 0.3), worry * 0.8);
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
    this.features.endFight(this.fenv);
    this.trapped = false;
    this.arena.marks.hideAll();
    this.arena.setLances([]);
    this.lances = [];
    this.nova = null;
    this.hearts = this.maxHearts;
    ui.hearts(this.hearts, this.maxHearts);
    input.setCharge(0, 0);
    this.shield.disarm();
    this.falls.reset();
    this.ctx.ui.falls(null);
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
    // the boss's lock on the cage breaks
    this.lockCut(this.bi - 1);
  }

  private updateInterlude(dt: number) {
    if (this.cut) return;
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
  /* cutscenes                                                         */
  /* ---------------------------------------------------------------- */

  /** play a cutscene: the letterbox comes in, the HUD goes, the Skip button appears */
  private playCut(c: Cut) {
    const { ui, input } = this.ctx;
    this.cut = c;
    this.control = false;
    ui.cinematic(true);
    ui.widescreen(true);
    ui.recenter(false);
    input.setAction(null);
    input.setCharge(0, 0);
    ui.skip(true, () => {
      if (this.cut === c) {
        c.skip();
        this.endCut(true);
      }
    });
  }

  /** the scene is over (or skipped): the letterbox goes and whatever comes next takes over */
  private endCut(run: boolean) {
    const c = this.cut;
    if (!c) return;
    this.cut = null;
    const { ui } = this.ctx;
    ui.skip(false);
    ui.sub(null, null);
    ui.widescreen(false);
    ui.cinematic(false);
    const cam = this.arena.camera;
    cam.fov = 64;
    cam.updateProjectionMatrix();
    if (run) c.onEnd();
  }

  /** a subtitled line, and a soft voice for it (the family speak gently; the world has no voice) */
  private line(l: SubLine, skipping = false) {
    if (skipping) return;
    const colour = l.who === 'Mother' ? '#ffb0d8' : l.who === 'Father' ? '#ffd27a' : l.who === 'The Blob' ? '#fff1a6' : '#cfeee8';
    this.ctx.ui.sub(l.who, l.text, l.ms, colour);
    const v = this.ctx.audio.v;
    if (l.who === 'Mother') v.speak(l.text, { f0: 232, rate: 1.0, breath: 0.65, rough: 0.05, gain: 0.16, wet: 0.7, fall: 0.15 });
    else if (l.who === 'Father') v.speak(l.text, { f0: 132, rate: 0.95, breath: 0.5, rough: 0.12, gain: 0.18, wet: 0.65, fall: 0.2 });
    else if (l.who === 'The Blob') v.speak(l.text, { f0: 330, rate: 1.15, breath: 0.55, gain: 0.12, wet: 0.6, fall: 0.1 });
  }

  /** where the cage's people are, for the camera (the middle of the cage, at their height) */
  private cageLook(): THREE.Vector3 {
    return this.arena.cage.world.add(new THREE.Vector3(0, 1.8, 0));
  }

  /**
   * The way into 3D, as a film, picking up where the rift at the Edge left off: on the cage, close, the two of them in it. A cut to the
   * floor: high above, the rift hangs open in the sky and the Blob falls out of it, tumbling, into the Crater. A hard landing; a
   * piece of X's claw comes through after it and is swallowed. Over its shoulder, the cage. "I'm coming." The rift flares red: X
   * is coming through. Mother: "Behind you!" And X.
   */
  private startIntro() {
    const a = this.arena;
    const { ui, audio } = this.ctx;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    this.cubeGroup.visible = false;
    a.setRise(1);
    a.player.visible = false;
    a.showPlayerClaw(0);
    const rift = this.skyRift().group;
    const RIFT = V(3, 30, -6);
    rift.position.copy(RIFT);
    rift.visible = true;
    const blob = () => a.player.position.clone();
    const L = STORY.cut.intro;
    const cage = () => this.cageLook();
    const keys: CamKey[] = [
      // where the rift's own picture ended: the cage, close
      { t: 0, pos: () => cage().add(V(-2.9, -0.55, 9.1)), look: cage, fov: 44 },
      { t: 0.55, pos: () => cage().add(V(-2.75, -0.45, 8.6)), look: cage, fov: 44 },
      // from the floor, up: it falls out of the sky
      { t: 0.6, cut: true, pos: V(5.5, 1.6, START_Z + 9), look: () => blob().add(V(0, 0.6, 0)), fov: 62 },
      { t: 2.45, pos: V(4.5, 1.3, START_Z + 7.5), look: () => blob().add(V(0, 0.8, 0)), fov: 56 },
      // the landing: low, close
      { t: 2.5, cut: true, pos: V(2.8, 0.55, START_Z + 4.4), look: V(0, 0.95, START_Z), fov: 58 },
      { t: 4.3, pos: V(1.7, 0.9, START_Z + 3.7), look: V(0, 1.05, START_Z), fov: 52 },
      // over its shoulder, to the cage
      { t: 4.35, cut: true, pos: V(-1.5, 2.5, START_Z + 4.3), look: cage, fov: 52 },
      { t: 5.8, pos: V(-1.15, 2.3, START_Z + 3.7), look: cage, fov: 42 },
      // the rift flares: he is coming through after you
      { t: 5.85, cut: true, pos: V(0.5, 3.2, START_Z + 9), look: RIFT.clone(), fov: 60 },
      { t: 7.2, pos: V(0.3, 2.6, START_Z + 7.5), look: RIFT.clone().add(V(0, -3, 0)), fov: 56 },
    ];
    let landed = false;
    let flare = 0;
    const c = new Cut(
      7.2,
      keys,
      [
        { at: 0.25, fn: (s) => !s && audio.rumble() },
        {
          at: 0.6,
          fn: (s) => {
            a.player.visible = true;
            if (s) return;
            audio.whoosh();
            ui.flash(0.35, 260);
          },
        },
        { at: 1.0, fn: (s) => this.line(L.back, s) },
        {
          at: 2.5,
          fn: (s) => {
            landed = true;
            if (s) return;
            a.burst3(0, 0.2, START_Z, 18, [0x3a2f22, 0x356a4c, 0xf2d36b], 6);
            audio.hit();
            audio.thump(1);
            ui.flash(0.25, 250);
            this.shake = 0.9;
          },
        },
        {
          at: 3.7,
          fn: (s) => {
            this.shard.visible = false;
            if (s) return;
            ui.flash(0.5, 300);
            audio.hit();
            audio.strike();
            this.shake = 0.7;
            a.burst3(0.2, 1.1, START_Z + 0.2, 10, [0xf4efe0, 0x120a1c, 0xff2a40], 3);
          },
        },
        { at: 3.9, fn: (s) => this.line(L.swallow, s) },
        { at: 4.6, fn: (s) => this.line(L.coming, s) },
        {
          at: 5.85,
          fn: (s) => {
            flare = 1;
            if (s) return;
            audio.v.xRoar();
            audio.rumble();
            this.shake = 0.8;
          },
        },
        { at: 6.2, fn: (s) => this.line(L.behind, s) },
      ],
      () => {
        // X: the boss's own entrance takes it from here
        this.cubeGroup.visible = false;
        this.shard.visible = false;
        rift.visible = false;
        a.setRise(1);
        a.player.visible = true;
        a.player.position.set(0, 0, START_Z);
        a.player.rotation.set(0, 0, 0);
        a.player.scale.setScalar(1);
        a.showPlayerClaw(1);
        this.camPos.copy(BOOM_POS);
        this.camLook.copy(BOOM_LOOK);
        ui.flash(0.95, 700);
        audio.sting();
        // (his name card waits for the game's own title to go: 0.4s + 2.6s)
        this.startBoss(3100);
        this.shake = 1.2;
        window.setTimeout(() => {
          ui.title();
          audio.setDrone(0.22, 2);
        }, 400);
      },
      (t, dt) => {
        // the rift in the sky: it faces you, breathes, and flares red when he comes
        rift.quaternion.copy(a.camera.quaternion);
        const pulse = 1 + 0.03 * Math.sin(t * 5);
        rift.scale.setScalar((t < 0.6 ? 0.6 + t : 1.2) * pulse * (1 + flare * 0.35 * Math.min(1, (t - 5.85) * 2)));
        this.skyRift().update(this.time, flare > 0 ? Math.min(1, (t - 5.85) * 1.5) : 0);
        // the fall: out of the rift, tumbling, down onto the floor
        const p = a.player;
        if (t >= 0.6 && !landed) {
          const u = Math.min(1, (t - 0.6) / 1.9);
          p.position.set(lerp(RIFT.x, 0, u), RIFT.y * (1 - u * u), lerp(RIFT.z, START_Z, smooth(u)));
          p.rotation.set(u * 6.5, Math.PI * 0.2, u * 2);
        } else if (landed) {
          if (t < 2.55) a.jellyKick(-0.9);
          p.position.set(0, 0, START_Z);
          // it faces us, then turns to the cage
          const turn = smooth(unlerp(4.1, 4.5, t));
          p.rotation.set(0, lerp(0, Math.atan2(a.cage.hang.x, a.cage.hang.z - START_Z), turn), 0);
          const squash = t < 3.0 ? 1 - (3.0 - t) * 0.6 : 1;
          p.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
        }
        if (t >= 3.1) p.scale.setScalar(1);
        a.animatePlayer(dt, this.time, 0, this.bob, 0, false);
        // a piece of his claw comes through after you, and is swallowed
        if (t >= 3.0 && t < 3.7) {
          this.shard.visible = true;
          const u2 = unlerp(3.0, 3.7, t);
          this.shard.position.set(lerp(RIFT.x, 0.2, u2), lerp(RIFT.y, 1.1, u2 * u2), lerp(RIFT.z, START_Z + 0.2, u2));
          this.shard.rotation.set(u2 * 9, u2 * 5, 0);
        }
        a.showPlayerClaw(t >= 3.7 ? easeOutBack(Math.min(1, (t - 3.7) / 0.7)) : 0);
        // the moth finds you after the landing
        if (t >= 4.3) {
          this.mothP.lerp(new THREE.Vector3(1.5, 2.4, START_Z - 0.8), 1 - Math.exp(-4 * dt));
          a.setMoth(this.mothP.x, this.mothP.y, this.mothP.z, this.time, true);
        }
      },
    );
    this.mothP.set(-6, 9, START_Z - 6);
    this.playCut(c);
  }

  /** the rift in the sky the Blob falls out of (made the first time it is needed) */
  private rift: SkyRift | null = null;
  private skyRift(): SkyRift {
    if (!this.rift) {
      this.rift = new SkyRift();
      this.arena.world.add(this.rift.group);
    }
    return this.rift;
  }

  /** a boss has fallen: its lock on the cage breaks, and the family speaks (i = 0 after X, 1 after The Collector) */
  private lockCut(i: number) {
    const a = this.arena;
    const { ui, audio } = this.ctx;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const cage = () => this.cageLook();
    const pl = () => V(this.pl.x, groundY(this.pl.x, this.pl.z), this.pl.z);
    const L = STORY.cut.locks[i]!;
    const keys: CamKey[] = [
      { t: 0, pos: this.camPos.clone(), look: this.camLook.clone(), fov: 64 },
      { t: 1.6, pos: () => cage().add(V(-6, -1.2, 13)), look: cage, fov: 46 },
      { t: 3.9, pos: () => cage().add(V(-4.2, -0.3, 9.4)), look: cage, fov: 40 },
      { t: 3.95, cut: true, pos: () => pl().add(V(2.8, 1.5, 6.2)), look: () => pl().add(V(0, 1.2, 0)), fov: 50 },
      { t: 6.0, pos: () => pl().add(V(2.1, 1.4, 5.4)), look: () => pl().add(V(0, 1.25, 0)), fov: 48 },
    ];
    const c = new Cut(
      6.2,
      keys,
      [
        {
          at: 2.0,
          fn: (s) => {
            const p = a.cage.breakLock(i);
            if (s) return;
            a.burst3(p.x, p.y, p.z, 22, [0xff3a4a, 0xffcf5a, 0xff8aa8][i] !== undefined ? [[0xff3a4a, 0xffcf5a, 0xff8aa8][i]!, 0xfff1a6, 0xffffff] : [0xffffff], 7);
            audio.v.glassBreak();
            audio.unlock();
            ui.flash(0.35, 300);
            this.shake = 0.5;
          },
        },
        { at: 2.6, fn: (s) => this.line(L[0]!, s) },
        { at: 4.3, fn: (s) => this.line(L[1]!, s) },
      ],
      () => {
        this.control = true;
        this.it = 0;
        this.ctx.input.setAction('strike');
        ui.hearts(this.hearts, this.maxHearts);
        ui.light(this.light);
        ui.recenter(true, () => this.resetCamera());
      },
      (t, dt) => {
        // the Blob looks up at the cage, then at us
        const p = a.player;
        p.position.set(this.pl.x, groundY(this.pl.x, this.pl.z), this.pl.z);
        const toCage = Math.atan2(a.cage.hang.x - this.pl.x, a.cage.hang.z - this.pl.z);
        p.rotation.set(0, lerp(toCage, 0.4, smooth(unlerp(3.9, 4.4, t))), 0);
        a.animatePlayer(dt, this.time, 0, this.bob, 0, false);
        this.updateMoth(dt);
      },
    );
    this.playCut(c);
  }

  /* ---------------------------------------------------------------- */
  /* the ending                                                        */
  /* ---------------------------------------------------------------- */

  /**
   * The ending, as a film: the last lock breaks, the chain snaps, the cage comes down onto the floor, the door lifts and Mother and
   * Father step out to the Blob. The camera goes round the three of them while the pinned things flicker out and drift home, the
   * clearing grows back, and then, from behind the family, it tilts up: the moon blinks and the moth goes home.
   */
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
    // each pinned specimen flickers out at its own moment, and drifts home
    const rnd = rng(9);
    this.warmData = this.arena.pinned.map((m) => ({ x: m.position.x, y: m.position.y, z: m.position.z, at: 10 + rnd() * 2.6, mine: false, tx: 0, tz: 0 }));
    this.warm.visible = true;
    this.lights.forEach((l) => (l.visible = false));

    const a = this.arena;
    const cg = a.cage;
    cg.auto = false;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const L = STORY.cut.ending;
    const cage = () => this.cageLook();
    const BLOB = V(0, 0, 3.4);
    const MEET = V(0, 0, 2.2);
    const MUM = V(-1.3, 0, 0.4);
    const DAD = V(1.3, 0, 0.2);
    let T = 0;
    // round the three of them, slowly
    const orbit = () => {
      const ang = lerp(0.7, 1.7, unlerp(9.7, 14, T));
      return V(Math.sin(ang) * 5, 2.9 - 0.5 * unlerp(9.7, 14, T), 1.2 + Math.cos(ang) * 5);
    };
    const keys: CamKey[] = [
      { t: 0, pos: this.camPos.clone(), look: this.camLook.clone(), fov: 64 },
      { t: 1.8, pos: () => cage().add(V(-5, -1.0, 11)), look: cage, fov: 44 },
      { t: 3.1, pos: () => cage().add(V(-3.8, -0.4, 8.6)), look: cage, fov: 40 },
      // the fall, from the floor
      { t: 3.15, cut: true, pos: V(7, 2.4, 9), look: cage, fov: 58 },
      { t: 4.7, pos: V(7, 2.4, 9), look: cage, fov: 56 },
      { t: 5.4, pos: V(4, 2.2, 6), look: V(0, 1.6, -4), fov: 50 },
      // over the Blob's shoulder: the door lifts and they step out
      { t: 5.45, cut: true, pos: V(2.2, 2.7, 9.0), look: V(0, 1.2, -3), fov: 46 },
      { t: 8.25, pos: V(1.7, 2.4, 8.0), look: V(0, 1.1, -0.5), fov: 46 },
      // the other way: the Blob, from between them
      { t: 8.3, cut: true, pos: V(4.6, 4.2, -2.2), look: V(0, 0.8, 2.2), fov: 44 },
      { t: 9.65, pos: V(4.2, 3.8, -1.6), look: V(0, 0.85, 2.2), fov: 40 },
      // round the family
      { t: 9.7, cut: true, pos: orbit, look: V(0, 1.1, 1.2), fov: 50 },
      { t: 14, pos: orbit, look: V(0, 1.1, 1.2), fov: 50 },
      // the clearing grows back
      { t: 14.05, cut: true, pos: V(0, 7, 16), look: V(0, 1, 0), fov: 60 },
      { t: 17.95, pos: V(0, 9.5, 19.5), look: V(0, 2, -3), fov: 58 },
      // from behind the three of them, it tilts up to the sky
      { t: 18, cut: true, pos: V(0, 2.2, 10.5), look: V(0, 1.4, 1), fov: 54 },
      { t: 18.6, pos: V(0, 2.2, 10.5), look: V(0, 1.6, 0.8), fov: 54 },
      { t: 21.6, pos: V(0, 1.6, 11.5), look: V(0, 40, -70), fov: 62 },
      { t: 25, pos: V(0, 1.5, 11.9), look: V(0, 44, -72), fov: 62 },
    ];
    let mFrom: THREE.Vector3 | null = null;
    let fFrom: THREE.Vector3 | null = null;
    let bFrom = V(this.pl.x, 0, this.pl.z);
    const c = new Cut(
      25,
      keys,
      [
        {
          at: 2.2,
          fn: (s) => {
            const p = cg.breakLock(2);
            if (s) return;
            a.burst3(p.x, p.y, p.z, 24, [0xff8aa8, 0xfff1a6, 0xffffff], 7);
            audio.v.glassBreak();
            audio.unlock();
            ui.flash(0.35, 300);
          },
        },
        { at: 2.4, fn: (s) => this.line(L.last, s) },
        {
          at: 3.15,
          fn: (s) => {
            // the Blob stands back in the middle of the floor (the next shots look past it)
            bFrom = BLOB.clone();
            if (s) return;
            audio.snap();
            audio.rumble();
          },
        },
        {
          at: 4.6,
          fn: (s) => {
            if (s) return;
            const g = cg.ground;
            a.burst3(g.x, 0.3, g.z, 30, [0x3a2a62, 0xc9a24a, 0xf2d36b], 8);
            audio.slam();
            audio.thump(1);
            ui.flash(0.4, 300);
            this.shake = 1.1;
          },
        },
        { at: 5.8, fn: (s) => !s && audio.creak() },
        {
          at: 6.6,
          fn: () => {
            cg.release(a.world);
            mFrom = cg.mother.g.position.clone().setY(0);
            fFrom = cg.father.g.position.clone().setY(0);
          },
        },
        { at: 7.2, fn: (s) => this.line(L.mother, s) },
        { at: 8.6, fn: (s) => this.line(L.blob, s) },
        { at: 9.7, fn: (s) => !s && audio.chime() },
        { at: 10.0, fn: (s) => this.line(L.flicker, s) },
        { at: 10.0, fn: (s) => !s && audio.warm() },
        { at: 11.8, fn: (s) => this.line(L.home, s) },
        { at: 13.2, fn: (s) => this.line(L.touch, s) },
        { at: 15.0, fn: (s) => this.line(L.grows, s) },
        { at: 18.2, fn: (s) => this.line(L.look, s) },
        { at: 19.0, fn: () => ui.moon(true) },
        { at: 19.6, fn: (s) => this.line(L.can, s) },
        { at: 21.6, fn: (s) => !s && ui.moonBlink() },
        { at: 22.2, fn: (s) => this.line(L.moon, s) },
      ],
      () => {
        this.state = 'end';
        this.onEnd?.();
      },
      (t, dt) => {
        T = t;
        this.et = t;
        // the cage: it falls, it lands, the door lifts
        cg.drop = clamp((t - 3.2) / 1.4, 0, 1);
        cg.doorOpen = smooth(unlerp(5.8, 6.6, t));
        // the Blob: it stands where the fight ended, then in the middle, then takes a step to meet them
        const p = a.player;
        const bp = t < 3.15 ? bFrom : new THREE.Vector3().lerpVectors(BLOB, MEET, smooth(unlerp(6.8, 8.6, t)));
        this.pl.x = bp.x;
        this.pl.z = bp.z;
        this.pl.vx = this.pl.vz = 0;
        p.position.set(bp.x, groundY(bp.x, bp.z), bp.z);
        const toCage = Math.atan2(cg.world.x - bp.x, cg.world.z - bp.z);
        // it turns to us for the hug, and looks up at the end
        p.rotation.set(0, t < 9.7 ? toCage : Math.PI, 0);
        const bWalk = t > 6.8 && t < 8.6 ? 1 : 0;
        this.bob += dt * (5 + bWalk * 6);
        a.animatePlayer(dt, this.time, bWalk, this.bob, 0, false);
        if (t > 9.7 && t < 14) p.position.y = Math.abs(Math.sin(this.time * 6)) * 0.12;
        // Mother and Father: in the cage they wait; out of it they walk to the Blob and hold on
        const wk = smooth(unlerp(6.6, 8.8, t));
        if (mFrom && fFrom) {
          cg.mother.g.position.lerpVectors(mFrom, MUM, wk);
          cg.father.g.position.lerpVectors(fFrom, DAD, wk);
          for (const r of [cg.mother, cg.father]) {
            const q = r.g.position;
            r.g.rotation.y = Math.atan2(bp.x - q.x, bp.z - q.z);
          }
        }
        const walking = wk > 0 && wk < 1 ? 1 : 0;
        const hug = t > 8.6 ? smooth(unlerp(8.6, 9.6, t)) : 0;
        const hop = t > 9.7 && t < 14 ? 1 : 0;
        animateParent(cg.mother, dt, this.time, walking, t < 6.6 ? 0.2 + (t > 5.8 ? 0.6 : 0) : hug, hop * 0.4, 1);
        animateParent(cg.father, dt, this.time, walking, t < 6.6 ? 0.1 + (t > 5.8 ? 0.5 : 0) : hug * 0.8, hop * 0.3, 2.7);
        // the pinned flicker out into warm lights and drift up and away
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
          pos.setXYZ(i, w.x + Math.sin(u * 2 + i) * 0.6, w.y + u * 2.2, w.z + u * 0.8);
        });
        pos.needsUpdate = true;
        // the clearing is rebuilt around them
        const rb = smooth(unlerp(14, 17, t));
        a.tint(rb);
        a.setClearing(rb);
        this.updateMoth(dt);
      },
    );
    this.playCut(c);
  }

  /* ---------------------------------------------------------------- */

  update(dtReal: number) {
    this.time += dtReal;
    this.t += dtReal;
    const a = this.arena;
    const dt = dtReal;
    if (this.cut && !this.cut.step(dt)) this.endCut(true);
    if (this.state === 'boom') {
      if (!this.cineIntro) this.updateBoom(dt);
    } else if (this.state === 'fight') this.updateFight(dt);
    else if (this.state === 'interlude') this.updateInterlude(dt);
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
    // the camera never goes into the land (the crater's wall, a terrace) when it swings round behind you
    if (!this.cut && this.state !== 'boom') {
      const floor = landY(this.camPos.x, this.camPos.z) + 1.4;
      if (this.camPos.y < floor) this.camPos.y = floor;
    }
    // a cutscene holds the camera
    if (this.cut) {
      // a shot's fov is written for a wide screen; on a tall one it opens up so the same width of the scene still fits
      const asp = Math.min(1, a.camera.aspect);
      const f0 = this.cut.camera(this.cutCam);
      const fov = Math.min(92, (2 * Math.atan(Math.tan((f0 * Math.PI) / 360) / Math.pow(asp, 0.85)) * 180) / Math.PI);
      this.camPos.copy(this.cutCam.pos);
      this.camLook.copy(this.cutCam.look);
      if (a.camera.fov !== fov) {
        a.camera.fov = fov;
        a.camera.updateProjectionMatrix();
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

  /* ---------------------------------------------------------------- */
  /* glimpses: the 3D world seen through a tear in the forest          */
  /* ---------------------------------------------------------------- */

  /**
   * Get the Crater ready to be glimpsed from the forest (see game.ts, which draws it through the tear). The shots come closer each
   * time a guardian falls: the crater in its mist, the Moonwell, the cage far up, X himself, Mother's face; and at the Edge, the
   * portal: the cage close, the two of them in it.
   */
  prepareGlimpse(shot: number) {
    const a = this.arena;
    if (this.cut) this.endCut(false);
    this.cubeGroup.visible = false;
    this.shard.visible = false;
    a.cage.reset();
    a.cage.auto = true;
    a.cage.drop = 0;
    a.setRise(1);
    a.player.visible = false;
    a.moth.visible = false;
    for (const b of this.bosses) b.hide();
    a.hideShadow();
    a.marks.hideAll();
    a.lanes.forEach((l) => (l.visible = false));
    a.pinned.forEach((m) => (m.visible = true));
    a.setClearing(0);
    a.tint(0);
    a.setRedLight(0);
    this.warm.visible = false;
    this.lights.forEach((l) => (l.visible = false));
    this.features.show(false);
    this.glimpseShot = shot;
    // X, if he is built: towering at the far side, his eyes on you
    if (shot === 4) {
      const x = this.bosses[0] as XBoss;
      if (x.ready()) {
        x.show();
        x.model.root.position.y = -3.5;
        x.model.setWide(1);
        x.model.lookAt(0, 2, 6);
      } else this.glimpseShot = 1;
    }
  }

  /** move the glimpse on: `u` 0..1 through it (the camera drifts), `dt` for whatever lives in the Crater */
  glimpse(u: number, dt: number) {
    const a = this.arena;
    this.time += dt;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const cage = a.cage.world.add(V(0, 1.7, 0));
    const e = smooth(u);
    let pos: THREE.Vector3;
    let look: THREE.Vector3;
    let fov = 50;
    switch (this.glimpseShot) {
      case 1:
        pos = V(2, 7.5, 30).lerp(V(0, 6.6, 26), e);
        look = V(0, 2.5, -8);
        break;
      case 2:
        pos = V(-7.6, 2.6, 7.2).lerp(V(-9.2, 2.6, 5.2), e);
        look = V(-18.6, 1.5, -5.5);
        break;
      case 3:
        pos = V(1.5, 1.3, 8).lerp(V(1.1, 1.5, 6.6), e);
        look = cage;
        fov = 46;
        break;
      case 4: {
        pos = V(0.5, 5.5, 5).lerp(V(0, 6.2, 2.5), e);
        look = V(0, 12.5, -27.5);
        fov = 58;
        const x = this.bosses[0] as XBoss;
        if (x.ready()) x.model.update(dt, this.time);
        break;
      }
      case 5: {
        const m = a.cage.mother.g.getWorldPosition(new THREE.Vector3()).add(V(0, 1.1, 0));
        pos = m.clone().add(V(-1.7, 0.35, 4.8).lerp(V(-1.3, 0.45, 4.0), e));
        look = m;
        fov = 40;
        break;
      }
      default:
        // the portal at the Edge: the cage, close, and the two of them in it
        pos = cage.clone().add(V(-3.1, -0.7, 10).lerp(V(-2.7, -0.4, 8.2), e));
        look = cage;
        fov = 44;
    }
    // (a tall screen sees as much width as a wide one would: see update)
    const asp = Math.min(1, a.camera.aspect);
    a.camera.fov = Math.min(92, (2 * Math.atan(Math.tan((fov * Math.PI) / 360) / Math.pow(asp, 0.85)) * 180) / Math.PI);
    a.camera.updateProjectionMatrix();
    a.camera.position.copy(pos);
    a.camera.lookAt(look);
    a.update(dt, this.time);
  }
  private glimpseShot = 1;

  /** Debug / showcase: skip straight to the start of a boss's fight (and a phase of it). */
  /** The trailer: the arena stands risen and the boss's entrance begins, `skip` seconds in, with no HUD and no name card. */
  trailerBoss(boss: number, skip = 0) {
    if (this.cut) this.endCut(false);
    this.t = 9;
    this.fired = new Set(['burst', 'land', 'landed', 'swallow', 'reveal', 'title']);
    const a = this.arena;
    this.slicer.flush();
    this.cubeGroup.visible = false;
    a.setRise(1);
    a.player.visible = true;
    a.showPlayerClaw(1);
    a.tint(0);
    this.camPos.copy(BOOM_POS);
    this.camLook.copy(BOOM_LOOK);
    this.bi = boss;
    for (const b of this.bosses) {
      b.cut = true;
      b.hide();
    }
    this.startBoss(300, true);
    this.boss.st = skip;
  }

  /** The trailer cuts away from whoever is on screen. */
  trailerCutAway() {
    for (const b of this.bosses) b.cut = true;
  }

  skipToFight(phase = 0, boss = 0) {
    if (this.cut) this.endCut(false);
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
