import * as THREE from 'three';
import { D } from '../core/difficulty';
import type { Arena } from './arena';
import { FAR_Z, FERNS, FLOOR_R, WELL } from './crater';
import type { Danger, Solid } from './fight';
import { groundY } from './ground';
import { halo } from './kit/skin';

/**
 * What the Crater gives you, so a long fight is a fight and not a wall of luck, and nothing of it comes free:
 *   the Moonwell  a pool of moonlight up on the west terrace. Stand STILL in it and a ring fills; when it is full you get a heart
 *                 back. Moving drains it, a hit empties it, and it gives once per phase (it fills again when a phase begins).
 *   crystals      strike one, or hit it with a bolt or a nova: it bursts into light for you. They grow back.
 *   the heart     now and then, a heart falls into the fight. The monster's thorns close round it (two gaps to slip through),
 *                 and while you are near it the ground under you keeps erupting. Get in, take it, get out. It withers if you wait.
 */

export interface FeatureEnv {
  /** the player */
  p: { x: number; z: number; vx: number; vz: number; dead: boolean };
  hearts: number;
  maxHearts: number;
  light: number;
  heal(n: number): void;
  addLight(n: number): void;
  hurt(kx: number, kz: number): void;
  /** the fight's solid columns (the heart's thorns join them while they stand) */
  solids: Solid[];
  /** a short line on screen */
  say(text: string): void;
  /** the heart may only fall while a boss is fighting (not in an entrance, a cutscene or a death) */
  fighting: boolean;
  sfx: { warm(): void; chime(): void; dash(): void; click(): void; slam(): void; snap(): void };
}

/** (kept for the test bots: where the heal is, and whether it is ready) */
export interface Well {
  x: number;
  z: number;
  /** 1 = ready to give, 0 = spent for this phase */
  ready: number;
}

interface Crystal {
  x: number;
  z: number;
  /** 0 = gone, 1 = whole */
  grow: number;
  t: number;
  g: THREE.Group;
  body: THREE.Mesh;
  glow: THREE.Sprite;
}

/** seconds of standing still in the Moonwell for one heart (more on a hard setting, less on an easy one) */
const WELL_SECS = 5;
const RING_SEGS = 40;
/** the heart */
const GUARD_R = 4.4;
const HEDGE_R = 2.6;
const HEART_LIFE = 18;
const MARK_GUARD = 15;

const CRYSTALS: [number, number][] = [
  [-15.5, 13.5],
  [16.5, 6],
  [-1, -10.8],
  [8.2, -3.6],
];

export class Features {
  readonly wells: Well[] = [];
  /** (none any more: the ramps are the way to move about) */
  readonly pads: never[] = [];
  readonly crystals: Crystal[] = [];
  private root = new THREE.Group();
  private time = 0;

  /* the Moonwell */
  private well: Well;
  private fill = 0;
  private told = false;
  private water!: THREE.Mesh;
  private shaft!: THREE.Mesh;
  private wellGlow!: THREE.Sprite;
  private ring!: THREE.InstancedMesh;
  private ringBack!: THREE.Mesh;
  private motes!: THREE.Points;
  private moteBase!: Float32Array;

  /* the heart */
  private heart: { x: number; z: number; t: number; gap: number; taken: boolean; solids: Solid[]; strikeT: number; strike: { x: number; z: number; t: number } | null } | null = null;
  private nextDrop = 0;
  private fightT = 0;
  private heartG = new THREE.Group();
  private heartMesh!: THREE.Mesh;
  private heartGlow!: THREE.Sprite;
  private heartLight!: THREE.PointLight;
  private hedge!: THREE.InstancedMesh;
  private hedgeData: { a: number; r: number; h: number; tilt: number }[] = [];
  private tendrils: THREE.Mesh[] = [];
  private guardRing!: THREE.Mesh;
  private spikes!: THREE.InstancedMesh;
  private spikeT = -1;
  private spikeAt = { x: 0, z: 0 };
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private arena: Arena) {
    arena.world.add(this.root);
    this.well = { x: WELL.x, z: WELL.z, ready: 1 };
    this.wells.push(this.well);
    this.buildWell();
    for (const [x, z] of CRYSTALS) this.addCrystal(x, z);
    this.buildHeart();
    this.root.visible = false;
  }

  show(on: boolean) {
    this.root.visible = on;
  }

  /** a fight (or a phase after a fall) begins: everything as new, and no heart */
  reset() {
    this.well.ready = 1;
    this.fill = 0;
    for (const c of this.crystals) {
      c.grow = 1;
      c.t = 0;
    }
    this.clearHeart(null);
    this.fightT = 0;
    this.nextDrop = this.rollFirstDrop();
  }

  /** a new phase begins: the Moonwell can give again, the crystals come back */
  refresh() {
    this.well.ready = 1;
    for (const c of this.crystals) if (c.grow < 1) c.grow = Math.max(c.grow, 0.6);
  }

  /** the player was hit: whatever the Moonwell had gathered is lost */
  onHurt() {
    this.fill = 0;
  }

  private rollFirstDrop() {
    return 16 + Math.random() * 16;
  }

  /* ---------------------------------------------------------------- */
  /* building                                                          */
  /* ---------------------------------------------------------------- */

  private buildWell() {
    const W = WELL;
    const y = groundY(W.x, W.z);
    const g = new THREE.Group();
    g.position.set(W.x, y, W.z);
    this.water = new THREE.Mesh(
      new THREE.CircleGeometry(W.r, 40),
      new THREE.MeshStandardMaterial({ color: 0x0a2a32, roughness: 0.05, metalness: 0.3, emissive: 0x2a9a9a, emissiveIntensity: 0.5, envMapIntensity: 2 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.06;
    g.add(this.water);
    this.shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 2.0, 22, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8fe8e0, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.shaft.position.set(1.2, 11, -1.5);
    this.shaft.rotation.set(0.1, 0, -0.1);
    g.add(this.shaft);
    this.wellGlow = halo(0x9ff4ee, 6, 0.5);
    this.wellGlow.position.y = 0.9;
    g.add(this.wellGlow);
    // the ring that fills while you stand still: a dim track, and bright pieces for what is filled
    const back = new THREE.Mesh(new THREE.RingGeometry(W.r + 0.25, W.r + 0.45, 64), new THREE.MeshBasicMaterial({ color: 0x2a5a5a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    back.rotation.x = -Math.PI / 2;
    back.position.y = 0.1;
    this.ringBack = back;
    g.add(back);
    const seg = new THREE.RingGeometry(W.r + 0.22, W.r + 0.48, 3, 1, 0, (Math.PI * 2) / RING_SEGS - 0.03);
    seg.rotateX(-Math.PI / 2);
    this.ring = new THREE.InstancedMesh(seg, new THREE.MeshBasicMaterial({ color: 0xbffcf6, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }), RING_SEGS);
    for (let i = 0; i < RING_SEGS; i++) {
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(i / RING_SEGS) * Math.PI * 2 + Math.PI / 2);
      this.ring.setMatrixAt(i, this.m4.compose(this.v.set(0, 0.12, 0), this.q, this.s.set(1, 1, 1)));
    }
    this.ring.count = 0;
    g.add(this.ring);
    // motes of light rising off the water
    const n = 40;
    const p = new Float32Array(n * 3);
    this.moteBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * W.r;
      this.moteBase.set([Math.cos(a) * d, Math.random(), Math.sin(a) * d], i * 3);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xbffcf6, size: 0.14, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false;
    g.add(this.motes);
    this.root.add(g);
  }

  private addCrystal(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, groundY(x, z), z);
    const geo = new THREE.OctahedronGeometry(0.7, 0);
    geo.scale(0.8, 1.6, 0.8);
    const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9ff4ee, emissive: 0x5fd8d0, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0.2, envMapIntensity: 2 }));
    body.position.y = 1.6;
    g.add(body);
    const base = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ color: 0x4e555c, roughness: 0.9 }));
    base.scale.set(1, 0.5, 1);
    base.position.y = 0.2;
    g.add(base);
    const glow = halo(0x7ff4ee, 4, 0.5);
    glow.position.y = 1.6;
    g.add(glow);
    this.root.add(g);
    this.crystals.push({ x, z, grow: 1, t: 0, g, body, glow });
  }

  private buildHeart() {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.9);
    shape.bezierCurveTo(-0.15, -0.6, -1.0, -0.2, -1.0, 0.35);
    shape.bezierCurveTo(-1.0, 0.85, -0.45, 1.05, 0, 0.6);
    shape.bezierCurveTo(0.45, 1.05, 1.0, 0.85, 1.0, 0.35);
    shape.bezierCurveTo(1.0, -0.2, 0.15, -0.6, 0, -0.9);
    const hg = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 4, curveSegments: 18 });
    hg.center();
    this.heartMesh = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: 0xff2a40, emissive: 0xff1030, emissiveIntensity: 1.6, roughness: 0.2, envMapIntensity: 2 }));
    this.heartMesh.scale.setScalar(0.55);
    this.heartG.add(this.heartMesh);
    this.heartGlow = halo(0xff3a50, 4.5, 0.8);
    this.heartG.add(this.heartGlow);
    this.heartLight = new THREE.PointLight(0xff3040, 16, 9, 1.6);
    this.heartG.add(this.heartLight);
    // the hedge: dark thorns in a ring, two gaps
    const cone = new THREE.ConeGeometry(0.12, 1, 5);
    cone.translate(0, 0.5, 0);
    const thornMat = new THREE.MeshStandardMaterial({ color: 0x160a12, emissive: 0x3a0614, roughness: 0.5 });
    for (let i = 0; i < 44; i++) this.hedgeData.push({ a: (i / 44) * Math.PI * 2, r: HEDGE_R + (Math.random() - 0.5) * 0.5, h: 1.0 + Math.random() * 1.3, tilt: (Math.random() - 0.5) * 0.9 });
    this.hedge = new THREE.InstancedMesh(cone, thornMat, this.hedgeData.length);
    this.hedge.frustumCulled = false;
    this.heartG.add(this.hedge);
    // tendrils of the monster, curled over it like fingers
    const tMat = new THREE.MeshStandardMaterial({ color: 0x0c070c, roughness: 0.35, metalness: 0.1 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const st = new THREE.Vector3(Math.cos(a) * 3.0, -0.4, Math.sin(a) * 3.0);
      const top = new THREE.Vector3(Math.cos(a) * 1.5, 4.6, Math.sin(a) * 1.5);
      const en = new THREE.Vector3(Math.cos(a + 1.2) * 0.8, 3.0, Math.sin(a + 1.2) * 0.8);
      const curve = new THREE.CatmullRomCurve3([st, st.clone().lerp(top, 0.5), top, en]);
      const g = new THREE.TubeGeometry(curve, 24, 0.22, 6, false);
      const p = g.getAttribute('position');
      const v = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let j = 0; j < p.count; j++) {
        const t = Math.floor(j / 7) / 24;
        curve.getPointAt(Math.min(1, t), c);
        v.fromBufferAttribute(p, j).sub(c).multiplyScalar(1.3 - t);
        p.setXYZ(j, c.x + v.x, c.y + v.y, c.z + v.z);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, tMat);
      this.tendrils.push(m);
      this.heartG.add(m);
    }
    // the ring that says: this is his
    this.guardRing = new THREE.Mesh(new THREE.RingGeometry(GUARD_R - 0.12, GUARD_R + 0.08, 72), new THREE.MeshBasicMaterial({ color: 0xff2a40, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    this.guardRing.rotation.x = -Math.PI / 2;
    this.guardRing.position.y = 0.1;
    this.heartG.add(this.guardRing);
    this.heartG.visible = false;
    this.root.add(this.heartG);
    // the thorns that erupt under you when you come near it
    const sp = new THREE.ConeGeometry(0.16, 1.6, 5);
    sp.translate(0, 0.8, 0);
    this.spikes = new THREE.InstancedMesh(sp, thornMat, 9);
    this.spikes.frustumCulled = false;
    this.spikes.visible = false;
    this.root.add(this.spikes);
  }

  /* ---------------------------------------------------------------- */
  /* the heart                                                         */
  /* ---------------------------------------------------------------- */

  /** a place for it: on the open floor, away from you, away from cover, not in the ferns */
  private pickSpot(env: FeatureEnv): { x: number; z: number } | null {
    const p = env.p;
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 11;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (z < FAR_Z + 3.5 || Math.hypot(x, z) > FLOOR_R - 4.5) continue;
      // the whole guarded ring on flat floor (not half up a terrace)
      let flat = true;
      for (let i = 0; i < 8 && flat; i++) {
        const b = (i / 8) * Math.PI * 2;
        if (groundY(x + Math.cos(b) * GUARD_R, z + Math.sin(b) * GUARD_R) > 0.001) flat = false;
      }
      if (!flat || groundY(x, z) > 0.001) continue;
      if (Math.hypot(x - p.x, z - p.z) < 8) continue;
      if (Math.hypot(x - FERNS.x, z - FERNS.z) < FERNS.r + HEDGE_R + 1) continue;
      let clear = true;
      for (const s of env.solids) if (s.alive && Math.hypot(x - s.x, z - s.z) < s.r + HEDGE_R + 1.2) clear = false;
      if (clear) return { x, z };
    }
    return null;
  }

  private dropHeart(env: FeatureEnv) {
    const spot = this.pickSpot(env);
    if (!spot) {
      this.nextDrop = this.fightT + 6;
      return;
    }
    const gap = Math.random() * Math.PI * 2;
    // the hedge's thorns are solid, but for its two gaps
    const solids: Solid[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (this.inGap(a, gap)) continue;
      solids.push({ x: spot.x + Math.cos(a) * HEDGE_R, z: spot.z + Math.sin(a) * HEDGE_R, r: 0.42, alive: true });
    }
    env.solids.push(...solids);
    this.heart = { x: spot.x, z: spot.z, t: 0, gap, taken: false, solids, strikeT: 0.5, strike: null };
    this.heartG.position.set(spot.x, 0, spot.z);
    this.heartG.visible = true;
    env.sfx.chime();
    env.say('a heart fell. something guards it.');
  }

  private inGap(a: number, gap: number) {
    const d = (x: number) => Math.abs(Math.atan2(Math.sin(x), Math.cos(x)));
    return d(a - gap) < 0.42 || d(a - gap - Math.PI) < 0.42;
  }

  /** the heart is gone (taken, or withered, or the fight moved on); `env` null when there is nobody to tell */
  private clearHeart(env: FeatureEnv | null) {
    const h = this.heart;
    if (h) {
      const list = env ? env.solids : null;
      for (const s of h.solids) {
        s.alive = false;
        if (list) {
          const i = list.indexOf(s);
          if (i >= 0) list.splice(i, 1);
        }
      }
    }
    this.heart = null;
    this.heartG.visible = false;
    this.spikes.visible = false;
    this.spikeT = -1;
    this.arena.marks.set(MARK_GUARD, false);
  }

  private updateHeart(dt: number, env: FeatureEnv) {
    const h = this.heart;
    if (!h) return;
    h.t += dt;
    const p = env.p;
    const fall = Math.min(1, h.t / 0.7);
    // it falls out of the dark, then floats over its roots, slowly turning
    const y = 1.7 + (1 - fall * fall) * 14 + Math.sin(this.time * 2) * 0.12;
    this.heartMesh.position.y = y;
    this.heartMesh.rotation.y = this.time * 1.4;
    const fade = Math.min(1, (HEART_LIFE - h.t) / 2.5);
    const beat = 1 + 0.08 * Math.max(0, Math.sin(this.time * 7));
    this.heartMesh.scale.setScalar(0.55 * beat * Math.max(0.05, fade));
    this.heartGlow.position.y = y;
    this.heartGlow.material.opacity = 0.75 * fade;
    this.heartLight.position.y = y;
    this.heartLight.intensity = 16 * fade;
    if (fall >= 1 && h.t - dt < 0.7) {
      env.sfx.slam();
      this.arena.burst3(h.x, 0.6, h.z, 18, [0xff3a50, 0x3a0614, 0xffffff], 7);
    }
    // the thorns grow up round it as it lands
    const grow = Math.min(1, Math.max(0, (h.t - 0.5) / 0.6)) * Math.max(0.05, fade);
    this.hedgeData.forEach((d, i) => {
      const a = d.a;
      const inGap = this.inGap(a, h.gap);
      this.q.setFromAxisAngle(this.v.set(Math.sin(a), 0, -Math.cos(a)), d.tilt);
      this.m4.compose(this.v.set(Math.cos(a) * d.r, -0.1, Math.sin(a) * d.r), this.q, this.s.set(1, inGap ? 0.001 : d.h * grow + 0.001, 1));
      this.hedge.setMatrixAt(i, this.m4);
    });
    this.hedge.instanceMatrix.needsUpdate = true;
    this.tendrils.forEach((t, i) => t.scale.set(1, Math.max(0.01, grow) * (1 + 0.03 * Math.sin(this.time * 2 + i)), 1));
    (this.guardRing.material as THREE.MeshBasicMaterial).opacity = (0.35 + 0.2 * Math.sin(this.time * 4)) * grow;
    // take it
    const d = Math.hypot(p.x - h.x, p.z - h.z);
    if (!p.dead && fall >= 1 && d < 1.1) {
      if (env.hearts < env.maxHearts) env.heal(1);
      else env.addLight(2);
      env.sfx.warm();
      env.sfx.chime();
      this.arena.burst3(h.x, 1.7, h.z, 30, [0xff3a50, 0xffffff, 0xffb0c0], 8);
      env.say(env.hearts >= env.maxHearts ? 'got it.' : 'a heart. warm.');
      this.clearHeart(env);
      this.nextDrop = this.fightT + 45 + Math.random() * 30;
      return;
    }
    // the guard: near it, the ground under you erupts
    const s = h.strike;
    if (s) {
      s.t += dt;
      const T = 0.72 * D.tele;
      const u = Math.min(1, s.t / T);
      if (s.t < T) this.arena.marks.set(MARK_GUARD, true, s.x, s.z, 1.45, { col: 0xff2a40, fill: 0.15 + 0.5 * u, hot: u > 0.7 && Math.floor(this.time * 14) % 2 === 0 });
      else {
        this.arena.marks.set(MARK_GUARD, false);
        this.spikeT = 0;
        this.spikeAt = { x: s.x, z: s.z };
        env.sfx.snap();
        this.arena.burst3(s.x, 0.4, s.z, 12, [0x3a0614, 0xff3a50, 0x160a12], 7);
        if (!p.dead && Math.hypot(p.x - s.x, p.z - s.z) < 1.45) env.hurt(p.x - s.x, p.z - s.z);
        h.strike = null;
        h.strikeT = 1.05 * D.tele;
      }
    } else if (fall >= 1 && d < GUARD_R && !p.dead) {
      h.strikeT -= dt;
      if (h.strikeT <= 0) {
        // where you are about to be
        h.strike = { x: p.x + p.vx * 0.2, z: p.z + p.vz * 0.2, t: 0 };
        env.sfx.click();
      }
    } else h.strikeT = Math.max(h.strikeT, 0.35);
    if (h.t >= HEART_LIFE) {
      this.clearHeart(env);
      this.nextDrop = this.fightT + 40 + Math.random() * 30;
    }
  }

  private updateSpikes(dt: number) {
    if (this.spikeT < 0) return;
    this.spikeT += dt;
    const u = this.spikeT / 0.55;
    if (u >= 1) {
      this.spikeT = -1;
      this.spikes.visible = false;
      return;
    }
    this.spikes.visible = true;
    const k = u < 0.25 ? u / 0.25 : 1 - (u - 0.25) / 0.75;
    const gy = groundY(this.spikeAt.x, this.spikeAt.z);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + i;
      const r = i === 0 ? 0 : 0.5 + (i % 3) * 0.3;
      this.q.setFromAxisAngle(this.v.set(Math.sin(a), 0, -Math.cos(a)), r * 0.5);
      this.m4.compose(this.v.set(this.spikeAt.x + Math.cos(a) * r, gy - 0.2, this.spikeAt.z + Math.sin(a) * r), this.q, this.s.set(1, Math.max(0.001, k * (1.2 - r * 0.4)), 1));
      this.spikes.setMatrixAt(i, this.m4);
    }
    this.spikes.instanceMatrix.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- */

  /** Light has reached (x, z) with a reach of r (a strike, a lance, a nova). Returns true if it shattered a crystal. */
  hit(x: number, z: number, r: number, env: FeatureEnv): boolean {
    let any = false;
    for (const c of this.crystals) {
      if (c.grow < 1) continue;
      if (Math.hypot(c.x - x, c.z - z) > r + 0.7) continue;
      c.grow = 0;
      c.t = 0;
      any = true;
      env.addLight(1);
      env.sfx.chime();
      this.arena.burst3(c.x, 1.6 + groundY(c.x, c.z), c.z, 16, [0xb8fff6, 0xffffff, 0x7ff4ee], 7);
    }
    return any;
  }

  /** what the heart's guard is about to do, for the test bots */
  dangers(out: Danger[]) {
    const s = this.heart?.strike;
    if (s) out.push({ shape: 'disc', x: s.x, z: s.z, r: 1.5, at: Math.max(0, 0.72 * D.tele - s.t), dur: 0.2 });
  }

  update(dt: number, env: FeatureEnv) {
    this.time += dt;
    const p = env.p;
    // the Moonwell
    const w = this.well;
    const inWell = !p.dead && Math.hypot(p.x - w.x, p.z - w.z) < WELL.r - 0.1;
    const still = Math.hypot(p.vx, p.vz) < 1.2;
    const needs = env.hearts < env.maxHearts;
    if (inWell && w.ready >= 1 && needs) {
      if (!this.told) {
        this.told = true;
        env.say('stand still in the moonlight.');
      }
      if (still) this.fill = Math.min(1, this.fill + dt / (WELL_SECS / D.window));
      else this.fill = Math.max(0, this.fill - dt * 0.5);
      if (this.fill >= 1) {
        w.ready = 0;
        this.fill = 0;
        env.heal(1);
        env.sfx.warm();
        env.sfx.chime();
        this.arena.burst3(w.x, 1.4 + groundY(w.x, w.z), w.z, 26, [0x9fe8ff, 0xffffff, 0x7fd8f5], 6);
        env.say('the moonlight mends you.');
      }
    } else this.fill = Math.max(0, this.fill - dt * 1.2);
    this.ring.count = Math.round(this.fill * RING_SEGS);
    (this.ringBack.material as THREE.MeshBasicMaterial).opacity = w.ready >= 1 ? 0.55 : 0.15;
    const live = w.ready >= 1 ? 1 : 0.25;
    (this.shaft.material as THREE.MeshBasicMaterial).opacity = (0.05 + 0.07 * live + 0.08 * this.fill) * (0.9 + 0.1 * Math.sin(this.time * 2));
    this.wellGlow.material.opacity = 0.2 + 0.35 * live + 0.3 * this.fill;
    (this.water.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + 0.4 * live + 0.6 * this.fill;
    const mp = this.motes.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < mp.count; i++) {
      const b = this.moteBase;
      const yy = ((b[i * 3 + 1]! + this.time * (0.12 + 0.25 * this.fill)) % 1) * 3.2;
      mp.setXYZ(i, b[i * 3]!, 0.1 + yy, b[i * 3 + 2]!);
    }
    mp.needsUpdate = true;
    (this.motes.material as THREE.PointsMaterial).opacity = 0.25 + 0.5 * live;

    // crystals
    for (const c of this.crystals) {
      if (c.grow < 1) {
        c.t += dt;
        if (c.t > 14) c.grow = Math.min(1, c.grow + dt * 1.2);
      }
      c.g.visible = c.grow > 0.02;
      const s = Math.max(0.001, c.grow);
      c.body.scale.setScalar(s);
      c.body.rotation.y = this.time * 0.8;
      c.body.position.y = 1.6 + Math.sin(this.time * 1.6 + c.x) * 0.12;
      c.glow.position.y = c.body.position.y;
      c.glow.material.opacity = 0.5 * s;
    }

    // the heart
    if (env.fighting) {
      this.fightT += dt;
      if (!this.heart && this.fightT >= this.nextDrop) this.dropHeart(env);
    }
    this.updateHeart(dt, env);
    this.updateSpikes(dt);
  }

  /** the fight is over (or paused for a scene): the heart, if any, goes */
  endFight(env: FeatureEnv) {
    this.clearHeart(env);
  }
}
