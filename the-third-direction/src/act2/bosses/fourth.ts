import * as THREE from 'three';
import { D } from '../../core/difficulty';
import { clamp, lerp, smooth, TAU } from '../../core/util';
import { Boss3D, type Danger, type Env, type Lance3, type Nova3, type Weak } from '../fight';
import { FOLD_R } from '../fold';

/**
 * The Fourth: what lives one direction further than X. A three-dimensional thing sees it the way the Blob saw X: only the
 * shadow it casts here, a cube inside a cube, turning through itself, with the moments just past trailing behind it, and in the
 * middle an eye that has already seen how this ends.
 *
 * It fights with time. Each round is two to four of these, and then it unfolds: its eye comes down to the floor and can be struck
 * (by you, and by Mother and Father, who fight beside you; when all three of you are at it, your strike counts twice).
 *   ECHOES      where you were a moment ago bursts: never go back the way you came
 *   FORESIGHT   where you are about to be bursts: change your mind
 *   REWIND      a ring of time rolls out from it, stops at the edge, and comes back the way it went: cross it twice
 *   HANDS       the hands of a clock sweep the floor, one slow, one fast, turning opposite ways
 *   FOLD        half the floor lights up, and folds shut on itself: be on the other half
 * It cannot be killed here. When its last light is gone it tears a way out and is gone (the fight's own scene: see act2.ts).
 */

type Atk = 'echo' | 'foresight' | 'rewind' | 'hands' | 'fold';
type FMode = 'float' | 'windup' | 'run' | 'gap' | 'open' | 'close';

const PLAN: Atk[][][] = [
  [['echo', 'rewind'], ['foresight', 'rewind']],
  [['hands', 'echo'], ['fold', 'foresight', 'hands']],
  [['fold', 'rewind', 'hands'], ['echo', 'fold', 'foresight', 'hands']],
];
export const FOURTH_PIPS = [5, 6, 7];
/** how high its middle hangs over the floor */
const HOVER = 6.0;
const ECHO = { len: 4.2, every: 0.3, lag: 1.0, warn: 0.95, live: 0.15, r: 1.5 };
const SIGHT = { n: 5, every: 0.55, ahead: 1.0, warn: 1.05, live: 0.15, r: 1.8 };
const REWIND = { tele: 0.8, speed: 8, hold: 0.35, half: 0.55, from: 1.5 };
const HANDS = { tele: 1.1, live: 5, hour: 0.55, minute: -1.15, hourW: 0.9, minuteW: 0.6, inner: 1.2 };
const FOLDS = { tele: 1.4, tele2: 1.0, live: 0.2 };
const OPEN = { len: 3.4, hold: 1.0 };
const COLOUR = '#b9a2ff';

interface Burst {
  x: number;
  z: number;
  r: number;
  t: number;
  warn: number;
  live: number;
  slot: number;
  hit: boolean;
  /** the ally knock has happened (each burst knocks a parent once) */
  knocked: Set<number>;
}

/* ------------------------------------------------------------------ */
/* the model: a tesseract's shadow, its echoes, and an eye             */
/* ------------------------------------------------------------------ */

const V4: number[][] = [];
for (let i = 0; i < 16; i++) V4.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
const EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) if (!(i & (1 << b))) EDGES.push([i, i | (1 << b)]);

class FourthModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private edges: THREE.InstancedMesh[] = [];
  private nodes: THREE.InstancedMesh;
  readonly core = new THREE.Group();
  private iris: THREE.Group;
  private irisMat: THREE.MeshBasicMaterial;
  private edgeMats: THREE.MeshBasicMaterial[] = [];
  private glow: THREE.Sprite;
  private light: THREE.PointLight;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private pts: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());
  /** its 4D turning (the angles), how big its shadow is, how bright, how cracked */
  ang = 0;
  size = 1;
  open = 0;
  crack = 0;
  glowK = 1;

  constructor(world: THREE.Group) {
    const edgeG = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    // the edges now, and the same edges a moment ago, and a moment before that: fainter each time
    for (let k = 0; k < 4; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8ccff).multiplyScalar(k === 0 ? 1.6 : 1), transparent: k > 0, opacity: k === 0 ? 1 : [0, 0.32, 0.18, 0.09][k]!, depthWrite: k === 0, toneMapped: false, fog: false });
      const m = new THREE.InstancedMesh(edgeG, mat, EDGES.length);
      m.frustumCulled = false;
      this.edgeMats.push(mat);
      this.edges.push(m);
      this.body.add(m);
    }
    this.nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(1.6), toneMapped: false, fog: false }), 16);
    this.nodes.frustumCulled = false;
    this.body.add(this.nodes);
    // the eye: a black glass ball, a pale gold iris with a slit, a violet glow round it
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 16), new THREE.MeshStandardMaterial({ color: 0x07040e, roughness: 0.12, metalness: 0.3, emissive: 0x1a0a33 }));
    this.core.add(ball);
    this.iris = new THREE.Group();
    this.irisMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe9a0).multiplyScalar(1.5), toneMapped: false, fog: false });
    const irisM = new THREE.Mesh(new THREE.CircleGeometry(0.56, 24), this.irisMat);
    irisM.position.z = 1.09;
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.84), new THREE.MeshBasicMaterial({ color: 0x050208, fog: false }));
    slit.position.z = 1.1;
    this.iris.add(irisM, slit);
    this.core.add(this.iris);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xa98aff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.glow.scale.setScalar(12);
    this.core.add(this.glow);
    this.light = new THREE.PointLight(0xa98aff, 30, 20, 1.6);
    this.core.add(this.light);
    this.body.add(this.core);
    this.root.add(this.body);
    this.root.visible = false;
    this.root.traverse((o) => (o.userData['noGround'] = true));
    world.add(this.root);
  }

  /** where its eye looks */
  lookAt(x: number, y: number, z: number) {
    this.iris.lookAt(x, y, z);
  }

  private project(t: number, out: THREE.Vector3[]) {
    const a = t * 0.7;
    const b = t * 0.45;
    const c = t * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    const S = 3.2 * this.size * (1 + this.open * 0.45);
    for (let i = 0; i < 16; i++) {
      let [x, y, z, w] = V4[i]! as [number, number, number, number];
      // turn in the x-w plane, then z-w, then x-y
      let nx = x * ca - w * sa;
      let nw = x * sa + w * ca;
      x = nx;
      w = nw;
      const nz = z * cb - w * sb;
      nw = z * sb + w * cb;
      z = nz;
      w = nw;
      nx = x * cc - y * sc;
      const ny = x * sc + y * cc;
      x = nx;
      y = ny;
      const k = S / (3 - w);
      out[i]!.set(x * k, y * k, z * k);
    }
  }

  update(time: number) {
    for (let k = 0; k < 4; k++) {
      this.project(this.ang - k * 0.18, this.pts);
      const m = this.edges[k]!;
      EDGES.forEach(([i, j], e) => {
        const a = this.pts[i]!;
        const b = this.pts[j]!;
        this.v.subVectors(b, a);
        const len = this.v.length();
        this.q.setFromUnitVectors(this.up, this.v.normalize());
        const flick = this.crack > 0 && (e * 7 + Math.floor(time * 20)) % 5 === 0 ? 0 : 1;
        const th = (k === 0 ? 0.08 : 0.065) * (0.6 + 0.4 * this.size) * flick;
        this.m4.compose(this.v2.addVectors(a, b).multiplyScalar(0.5), this.q, this.v.set(th, len, th));
        m.setMatrixAt(e, this.m4);
      });
      m.instanceMatrix.needsUpdate = true;
      if (k === 0) {
        this.pts.forEach((p, i) => {
          this.m4.compose(p, this.q.identity(), this.v.setScalar(0.18 * (0.6 + 0.4 * this.size)));
          this.nodes.setMatrixAt(i, this.m4);
        });
        this.nodes.instanceMatrix.needsUpdate = true;
      }
    }
    // cracked: its light goes red and stutters
    const red = this.crack;
    this.edgeMats[0]!.color.setRGB(lerp(1.35, 1.8, red), lerp(1.2, 0.35, red), lerp(1.6, 0.5, red));
    this.irisMat.color.setRGB(1.5, lerp(1.4, 0.4, red), lerp(0.95, 0.3, red));
    this.glow.material.opacity = (0.55 + 0.15 * Math.sin(time * 3)) * this.glowK;
    this.light.intensity = 30 * this.glowK;
    this.core.scale.setScalar(Math.max(0.001, this.size));
  }
}

let glowT: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowT) return glowT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowT = new THREE.CanvasTexture(c);
  glowT.colorSpace = THREE.SRGBColorSpace;
  return glowT;
}

/* ------------------------------------------------------------------ */
/* the fight                                                           */
/* ------------------------------------------------------------------ */

export class FourthBoss extends Boss3D {
  protected introLen = 2.2;
  protected dyingLen = 1.2;
  readonly model: FourthModel;
  /** (read by the test bot and the fight) */
  mode: FMode = 'float';
  atk: Atk = 'echo';
  private mt = 0;
  private round: Atk[] = [];
  private ri = 0;
  private rounds = 0;
  /** where it floats (the point on the floor under it) */
  x = 0;
  z = -4;
  private to = { x: 0, z: -4 };
  private spin = 0;
  private spinRate = 1;
  /** the player's way here: where they were, for the echoes */
  private trail: { t: number; x: number; z: number }[] = [];
  private bursts: Burst[] = [];
  private slotN = 0;
  private emitT = 0;
  private emitted = 0;
  /** the rewind ring: radius now, going out (1) or back (-1), held at the edge, hit this pass */
  private ring = { on: false, r: 0, dir: 1, hold: 0, hit: false, knocked: new Set<number>() };
  private ringMesh: THREE.Mesh;
  private ringR = -1;
  /** the clock hands: their angles (0 = +z), live or still showing */
  private hands = { on: false, hour: 0, minute: 0, live: false, t: 0, knocked: new Map<number, number>() };
  private handMeshes: THREE.Mesh[] = [];
  /** the fold: which half (its direction from the middle), how far through */
  private fold = { on: false, ang: 0, t: 0, T: 1, second: false, slammed: false };
  private halfMesh: THREE.Mesh;
  private openLen = OPEN.len;
  private held = false;
  private said = new Set<string>();
  /** where the parents are, and whether all three of you are at its eye (the fight tells it) */
  allies: () => { x: number; z: number }[] = () => [];
  /** a parent caught by an attack (index 0 Mother, 1 Father): the fight knocks them back */
  onAllyHit: (i: number, fromX: number, fromZ: number) => void = () => {};

  constructor(env: Env, world: THREE.Group, onVictory: () => void) {
    super(env, 'fourth', 'The Fourth', 'it comes from when', COLOUR, FOURTH_PIPS, onVictory);
    this.model = new FourthModel(world);
    // the ring of time
    this.ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8b0ff).multiplyScalar(1.4), transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.position.y = 0.1;
    this.ringMesh.visible = false;
    world.add(this.ringMesh);
    // the hands of the clock
    for (const w of [HANDS.hourW, HANDS.minuteW]) {
      const g = new THREE.PlaneGeometry(w, 1);
      g.translate(0, 0.5, 0);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xd8c8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      m.position.y = 0.12;
      m.visible = false;
      world.add(m);
      this.handMeshes.push(m);
    }
    // the half of the floor that folds
    this.halfMesh = new THREE.Mesh(new THREE.CircleGeometry(FOLD_R + 1, 64, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x8a5aff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.halfMesh.rotation.x = -Math.PI / 2;
    this.halfMesh.position.y = 0.06;
    this.halfMesh.visible = false;
    world.add(this.halfMesh);
  }

  ready() {
    return true;
  }

  show() {
    this.model.root.visible = true;
  }

  hide() {
    this.model.root.visible = false;
    this.clearAll();
  }

  flattenRoot() {
    return this.model.root;
  }

  /** put it somewhere (the scenes move it themselves) */
  place(x: number, y: number, z: number, size = 1) {
    this.model.root.position.set(x, y, z);
    this.model.size = size;
  }

  /** the scenes turn it (and its eye) by hand */
  pose(dt: number, spinRate: number, lookAt?: THREE.Vector3) {
    this.model.ang += dt * spinRate;
    if (lookAt) this.model.lookAt(lookAt.x, lookAt.y, lookAt.z);
    this.model.update(this.env.time);
  }

  /** its light cracks and goes red (0..1), its glow (0..), how far it has unfolded (0..1) */
  look(crack: number, glow = 1, open = 0) {
    this.model.crack = crack;
    this.model.glowK = glow;
    this.model.open = open;
  }

  /* ---- the entrance (short: the scene before it is the real entrance) ---- */

  protected onBegin() {
    this.show();
    this.clearAll();
    this.x = 0;
    this.z = -4;
    this.to = { x: 0, z: -4 };
    this.mode = 'float';
    this.mt = 0;
    this.rounds = 0;
    this.model.size = 1;
    this.model.open = 0;
    this.model.crack = 0;
    this.model.glowK = 1;
    this.env.audio.setDrone(0.2, 1.5);
  }

  protected updateIntro(dt: number) {
    this.spinRate = 1.2;
    void dt;
  }

  protected startPhase() {
    this.clearAll();
    this.rounds = 0;
    this.toFloat();
    if (this.phase > 0) {
      this.env.audio.v.xRoar();
      this.env.shake(0.8);
      this.env.ui.flash(0.4, 300);
    }
  }

  protected restartPhase() {
    this.clearAll();
    this.rounds = 0;
    this.x = 0;
    this.z = -4;
    this.toFloat();
  }

  private clearAll() {
    for (const b of this.bursts) this.env.arena.marks.set(b.slot, false);
    this.bursts = [];
    this.ring.on = false;
    this.ringMesh.visible = false;
    this.hands.on = false;
    this.handMeshes.forEach((m) => (m.visible = false));
    this.fold.on = false;
    this.halfMesh.visible = false;
  }

  private toFloat() {
    this.mode = 'float';
    this.mt = 0;
    const p = this.env.p;
    // somewhere near the middle, not on top of you
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      const r = Math.random() * 6;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r - 2;
      if (Math.hypot(x - p.x, z - p.z) > 6) {
        this.to = { x, z };
        return;
      }
    }
    this.to = { x: 0, z: -3 };
  }

  private beginRound() {
    const plan = PLAN[Math.min(this.phase, PLAN.length - 1)]!;
    this.round = plan[Math.min(this.rounds, plan.length - 1)]!;
    this.rounds++;
    this.ri = 0;
    this.next();
  }

  private next() {
    if (this.ri >= this.round.length) {
      this.openUp();
      return;
    }
    this.atk = this.round[this.ri++]!;
    this.mode = 'windup';
    this.mt = 0;
    const au = this.env.audio;
    au.tone(1400, 0.05, 'square', 0.06, 1400);
    au.tone(1400, 0.05, 'square', 0.06, 1400, 0.25);
    if (this.atk === 'fold') au.rumble();
  }

  private openUp() {
    this.clearAll();
    this.mode = 'open';
    this.mt = 0;
    this.held = false;
    this.openLen = OPEN.len * D.window;
    const { audio, ui } = this.env;
    audio.crumble();
    audio.chime();
    if (!this.said.has('open')) {
      this.said.add('open');
      ui.hint('its eye is down: strike it, together');
      window.setTimeout(() => ui.hintIs('its eye is down: strike it, together') && ui.hint(null), 3600);
    }
  }

  /** Father has it held down: it stays open a little longer (once a time) */
  holdOpen() {
    if (this.mode !== 'open' || this.held) return false;
    this.held = true;
    this.openLen += OPEN.hold;
    return true;
  }

  protected updateFight(dt: number) {
    const p = this.env.p;
    this.mt += dt;
    // remember where the player has been
    this.trail.push({ t: this.t, x: p.x, z: p.z });
    while (this.trail.length && this.trail[0]!.t < this.t - 2.5) this.trail.shift();

    if (this.mode === 'float') {
      const k = 1 - Math.exp(-1.6 * dt);
      this.x += (this.to.x - this.x) * k;
      this.z += (this.to.z - this.z) * k;
      if (this.mt > 1.3) this.beginRound();
    } else if (this.mode === 'windup') {
      if (this.mt >= 0.55) this.startAttack();
    } else if (this.mode === 'run') this.runAttack(dt);
    else if (this.mode === 'gap') {
      if (this.mt > 0.5) this.next();
    } else if (this.mode === 'open') {
      if (this.mt >= this.openLen) {
        this.mode = 'close';
        this.mt = 0;
        this.env.audio.v.xRoar();
      }
    } else if (this.mode === 'close') {
      if (this.mt > 0.8) this.toFloat();
    }
    this.updateBursts(dt);
  }

  private startAttack() {
    const p = this.env.p;
    this.mode = 'run';
    this.mt = 0;
    this.emitT = 0;
    this.emitted = 0;
    if (this.atk === 'rewind') {
      this.ring = { on: true, r: REWIND.from, dir: 0, hold: REWIND.tele * D.tele, hit: false, knocked: new Set() };
      this.env.audio.rumble();
    } else if (this.atk === 'hands') {
      const toYou = Math.atan2(p.x - this.x, p.z - this.z);
      this.hands = { on: true, hour: toYou + Math.PI / 2, minute: toYou - Math.PI * 0.7, live: false, t: 0, knocked: new Map() };
    } else if (this.atk === 'fold') {
      // the half you are on folds
      const toYou = Math.atan2(p.x, p.z);
      this.fold = { on: true, ang: toYou, t: 0, T: FOLDS.tele * D.tele, second: false, slammed: false };
    }
  }

  private runAttack(dt: number) {
    const env = this.env;
    const p = env.p;
    const a = env.arena;
    if (this.atk === 'echo') {
      // where you were a moment ago
      this.emitT -= dt;
      if (this.emitT <= 0 && this.mt < ECHO.len) {
        this.emitT = ECHO.every;
        const past = this.trail.find((q) => q.t >= this.t - ECHO.lag) ?? { x: p.x, z: p.z };
        this.addBurst(past.x, past.z, ECHO.r, ECHO.warn * D.tele, ECHO.live);
      }
      if (this.mt >= ECHO.len + ECHO.warn * D.tele + 0.2) this.gap();
    } else if (this.atk === 'foresight') {
      // where you are about to be
      this.emitT -= dt;
      if (this.emitT <= 0 && this.emitted < SIGHT.n) {
        this.emitT = SIGHT.every;
        this.emitted++;
        let x = p.x + p.vx * SIGHT.ahead;
        let z = p.z + p.vz * SIGHT.ahead;
        const r = Math.hypot(x, z);
        if (r > FOLD_R - 1) {
          x *= (FOLD_R - 1) / r;
          z *= (FOLD_R - 1) / r;
        }
        this.addBurst(x, z, SIGHT.r, SIGHT.warn * D.tele, SIGHT.live);
      }
      if (this.emitted >= SIGHT.n && this.bursts.length === 0) this.gap();
    } else if (this.atk === 'rewind') this.runRing(dt);
    else if (this.atk === 'hands') this.runHands(dt);
    else this.runFold(dt);
    void a;
  }

  private gap() {
    this.mode = 'gap';
    this.mt = 0;
  }

  /* ---- bursts: echoes and foresight ---- */

  private addBurst(x: number, z: number, r: number, warn: number, live: number) {
    const slot = this.slotN++ % 10;
    // (a slot still in use is let go: its burst is the oldest)
    this.bursts = this.bursts.filter((b) => {
      if (b.slot !== slot) return true;
      this.env.arena.marks.set(slot, false);
      return false;
    });
    this.bursts.push({ x, z, r, t: 0, warn, live, slot, hit: false, knocked: new Set() });
    this.env.audio.tone(900 + (this.slotN % 4) * 120, 0.04, 'triangle', 0.05, 700);
  }

  private updateBursts(dt: number) {
    const env = this.env;
    const p = env.p;
    const a = env.arena;
    for (const b of this.bursts) {
      b.t += dt;
      const u = clamp(b.t / b.warn, 0, 1);
      if (b.t < b.warn) a.marks.set(b.slot, true, b.x, b.z, b.r, { col: 0xb48cff, fill: 0.15 + 0.35 * u, hot: u > 0.75 && Math.floor(env.time * 14) % 2 === 0, alpha: 0.5 + 0.5 * u });
      else if (b.t < b.warn + b.live) {
        if (b.t - dt < b.warn) {
          env.audio.snap();
          a.burst3(b.x, 0.4, b.z, 10, [0xd8c8ff, 0x8a5aff, 0xffffff], 6);
        }
        a.marks.set(b.slot, true, b.x, b.z, b.r * 1.1, { col: 0xffffff, fill: 0.7 });
        if (!b.hit && !p.dead && Math.hypot(p.x - b.x, p.z - b.z) < b.r) {
          b.hit = true;
          env.hurt(b.x, b.z);
        }
        this.knockAllies(b.knocked, (x, z) => Math.hypot(x - b.x, z - b.z) < b.r, b.x, b.z);
      }
    }
    const done = this.bursts.filter((b) => b.t >= b.warn + b.live + 0.1);
    for (const b of done) a.marks.set(b.slot, false);
    this.bursts = this.bursts.filter((b) => b.t < b.warn + b.live + 0.1);
  }

  /** an attack that catches a parent knocks them back (once each) */
  private knockAllies(done: Set<number>, inside: (x: number, z: number) => boolean, fx: number, fz: number) {
    this.allies().forEach((q, i) => {
      if (done.has(i) || !inside(q.x, q.z)) return;
      done.add(i);
      this.onAllyHit(i, fx, fz);
    });
  }

  /* ---- the rewind ring ---- */

  private runRing(dt: number) {
    const env = this.env;
    const p = env.p;
    const g = this.ring;
    const max = FOLD_R + 1;
    if (g.dir === 0) {
      // the warning: it throbs round it
      g.hold -= dt;
      g.r = REWIND.from + 0.3 * Math.sin(this.mt * 20);
      if (g.hold <= 0) {
        g.dir = 1;
        g.r = REWIND.from;
        env.audio.boom();
        env.shake(0.5);
      }
    } else if (g.dir === 1) {
      g.r += REWIND.speed * D.speed * dt;
      if (g.r >= max) {
        g.r = max;
        g.dir = 2;
        g.hold = REWIND.hold;
      }
    } else if (g.dir === 2) {
      // it stops at the edge, and time turns round
      g.hold -= dt;
      if (g.hold <= 0) {
        g.dir = -1;
        g.hit = false;
        g.knocked = new Set();
        env.audio.tone(300, 0.5, 'sawtooth', 0.08, 120);
      }
    } else {
      g.r -= REWIND.speed * D.speed * dt;
      if (g.r <= REWIND.from) {
        g.on = false;
        this.ringMesh.visible = false;
        this.gap();
        return;
      }
    }
    // it hurts as it passes (out once, back once)
    if (g.dir === 1 || g.dir === -1) {
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (!g.hit && !p.dead && Math.abs(d - g.r) < REWIND.half) {
        g.hit = true;
        env.hurt(this.x, this.z);
      }
      this.knockAllies(g.knocked, (x, z) => Math.abs(Math.hypot(x - this.x, z - this.z) - g.r) < REWIND.half, this.x, this.z);
    }
    this.drawRing(g.r, g.dir === 0 ? 0.4 + 0.3 * Math.sin(this.mt * 20) : 1);
  }

  private drawRing(r: number, a: number) {
    const m = this.ringMesh;
    if (Math.abs(r - this.ringR) > 0.02) {
      m.geometry.dispose();
      m.geometry = new THREE.RingGeometry(Math.max(0.05, r - REWIND.half), r + REWIND.half, 96);
      this.ringR = r;
    }
    m.position.set(this.x, 0.1, this.z);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * a;
    m.visible = true;
  }

  /* ---- the hands of the clock ---- */

  private runHands(dt: number) {
    const env = this.env;
    const p = env.p;
    const h = this.hands;
    h.t += dt;
    const tele = HANDS.tele * D.tele;
    const live = HANDS.live + (this.phase >= 2 ? 1 : 0);
    if (!h.live && h.t >= tele) {
      h.live = true;
      env.audio.whoosh();
    }
    const sp = h.live ? D.speed : 0.15;
    h.hour += HANDS.hour * sp * dt;
    h.minute += HANDS.minute * sp * dt;
    // a tick every second, like a clock
    if (h.live && Math.floor(h.t) !== Math.floor(h.t - dt)) env.audio.tone(1500, 0.03, 'square', 0.07, 1500);
    const len = FOLD_R + 1;
    [h.hour, h.minute].forEach((ang, i) => {
      const m = this.handMeshes[i]!;
      m.visible = true;
      m.position.set(this.x, 0.12 + i * 0.01, this.z);
      // (the hand's plane points down -z: turned half round, it points along `ang`)
      m.rotation.set(0, ang + Math.PI, 0);
      m.scale.set(1, 1, len);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = h.live ? 0.85 : 0.18 + 0.25 * (h.t / tele);
      mat.color.setHex(h.live ? 0xffffff : 0xb48cff);
      if (!h.live) return;
      const w = (i === 0 ? HANDS.hourW : HANDS.minuteW) / 2;
      const inHand = (x: number, z: number) => {
        const rx = x - this.x;
        const rz = z - this.z;
        const along = rx * Math.sin(ang) + rz * Math.cos(ang);
        const perp = Math.abs(rx * Math.cos(ang) - rz * Math.sin(ang));
        return along > HANDS.inner && along < len && perp < w + 0.35;
      };
      if (!p.dead && inHand(p.x, p.z)) env.hurt(this.x, this.z);
      this.allies().forEach((q, k) => {
        const last = h.knocked.get(k * 2 + i) ?? -9;
        if (h.t - last > 1.2 && inHand(q.x, q.z)) {
          h.knocked.set(k * 2 + i, h.t);
          this.onAllyHit(k, this.x, this.z);
        }
      });
    });
    if (h.t >= tele + live) {
      h.on = false;
      this.handMeshes.forEach((m) => (m.visible = false));
      this.gap();
    }
  }

  /* ---- the fold ---- */

  private runFold(dt: number) {
    const env = this.env;
    const p = env.p;
    const f = this.fold;
    f.t += dt;
    const m = this.halfMesh;
    const u = clamp(f.t / f.T, 0, 1);
    m.visible = true;
    m.position.set(0, 0.06, 0);
    // the half facing `ang` (the circle's half from angle -90 to +90 around its direction)
    // (laid flat, the half circle faces -z; turned round the world's up axis to face `ang`)
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, f.ang - Math.PI, 0);
    const mat = m.material as THREE.MeshBasicMaterial;
    const hot = u > 0.75 && Math.floor(env.time * 14) % 2 === 0;
    if (f.t < f.T) {
      mat.color.setHex(hot ? 0xff9ad8 : 0x8a5aff);
      mat.opacity = 0.15 + 0.35 * u;
    } else if (!f.slammed) {
      f.slammed = true;
      env.audio.slam();
      env.audio.boom();
      env.shake(1.0);
      env.ui.flash(0.35, 250);
      const inHalf = (x: number, z: number) => x * Math.sin(f.ang) + z * Math.cos(f.ang) > -0.3;
      if (!p.dead && inHalf(p.x, p.z)) env.hurt(-Math.sin(f.ang) * 3, -Math.cos(f.ang) * 3);
      this.knockAllies(new Set(), inHalf, -Math.sin(f.ang) * 3, -Math.cos(f.ang) * 3);
      for (let i = 0; i < 18; i++) {
        const a = f.ang + (Math.random() - 0.5) * Math.PI;
        const r = Math.random() * FOLD_R;
        env.arena.burst3(Math.sin(a) * r, 0.3, Math.cos(a) * r, 2, [0xd8c8ff, 0x8a5aff], 6);
      }
      mat.color.setHex(0xffffff);
      mat.opacity = 0.8;
    } else {
      mat.opacity = Math.max(0, 0.8 - (f.t - f.T) * 3);
      if (f.t >= f.T + FOLDS.live + 0.25) {
        // the last phase folds twice, the second across the first
        if (this.phase >= 2 && !f.second) {
          this.fold = { on: true, ang: f.ang + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2, t: 0, T: FOLDS.tele2 * D.tele, second: true, slammed: false };
          env.audio.rumble();
        } else {
          f.on = false;
          m.visible = false;
          this.gap();
        }
      }
    }
  }

  /* ---- being hit ---- */

  weak(): Weak[] {
    if (this.mode !== 'open' || this.state !== 'fight') return [];
    return [{ x: this.x, y: 1.3, z: this.z, reach: 2.6, r: 1.4, tag: 'eye' }];
  }

  /** all three of you at its eye */
  together(): boolean {
    if (this.mode !== 'open') return false;
    const p = this.env.p;
    if (Math.hypot(p.x - this.x, p.z - this.z) > 3.2) return false;
    const al = this.allies();
    return al.length === 2 && al.every((q) => Math.hypot(q.x - this.x, q.z - this.z) < 3.6);
  }

  hitBy(kind: 'strike' | 'lance' | 'nova', w: Weak): boolean {
    const two = kind === 'strike' && this.together();
    const ok = this.damage(two ? 2 : 1, w.x, w.y, w.z);
    if (ok && two) {
      this.env.arena.burst3(w.x, w.y + 0.5, w.z, 30, [0xffe9a0, 0xff9ac8, 0xffcf5a, 0xffffff], 10);
      if (!this.said.has('together')) {
        this.said.add('together');
        this.env.ui.caption('together!', 1600);
      }
    }
    return ok;
  }

  /** a parent strikes its eye (weaker than you, and it does not stop your strikes landing) */
  allyHit(n: number): boolean {
    if (this.mode !== 'open' || this.state !== 'fight' || this.hp <= 0) return false;
    if (this.hp - n <= this.phaseFloor) {
      // the blow that ends a phase is a real one
      const keep = this.iframes;
      this.iframes = 0;
      const ok = this.damage(this.hp - this.phaseFloor, this.x, 1.3, this.z);
      if (!ok) this.iframes = keep;
      return ok;
    }
    this.hp -= n;
    this.bar();
    this.env.arena.burst3(this.x, 1.5, this.z, 8, [0xffffff, 0xb9a2ff], 5);
    this.env.audio.bossHit();
    return true;
  }

  onLance(_l: Lance3): boolean {
    return false;
  }

  onNova(n: Nova3) {
    // light clears the bursts it reaches
    for (const b of this.bursts) {
      if (b.t < b.warn && Math.hypot(b.x - n.x, b.z - n.z) < n.R + b.r) {
        b.t = b.warn + b.live;
        this.env.arena.marks.set(b.slot, false);
      }
    }
  }

  dangers(): Danger[] {
    const out: Danger[] = [];
    for (const b of this.bursts) out.push({ shape: 'disc', x: b.x, z: b.z, r: b.r, at: Math.max(0, b.warn - b.t), dur: b.live });
    const g = this.ring;
    if (g.on && g.dir !== 0 && g.dir !== 2) {
      const ahead = g.dir === 1 ? g.r + 1.6 : g.r + 0.2;
      out.push({ shape: 'ring', x: this.x, z: this.z, r: ahead, w: 2.2, at: 0, dur: 0.4 });
    } else if (g.on) out.push({ shape: 'ring', x: this.x, z: this.z, r: g.dir === 0 ? REWIND.from + 1.6 : FOLD_R + 1, w: 2.2, at: g.dir === 0 ? Math.max(0, g.hold) : Math.max(0, g.hold), dur: 0.4 });
    const h = this.hands;
    if (h.on) {
      const at = h.live ? 0 : Math.max(0, HANDS.tele * D.tele - h.t);
      // where the hands will be in a moment
      for (const [ang, w, sp] of [[h.hour, HANDS.hourW, HANDS.hour], [h.minute, HANDS.minuteW, HANDS.minute]] as [number, number, number][]) {
        for (const ahead of [0, 0.3, 0.6]) out.push({ shape: 'cone', x: this.x, z: this.z, ang: ang + sp * D.speed * ahead, len: FOLD_R + 1, half: w / 2 + 0.3, at: at + ahead, dur: 0.3 });
      }
    }
    const f = this.fold;
    if (f.on && !f.slammed) {
      const R = FOLD_R + 1;
      out.push({ shape: 'box', x: Math.sin(f.ang) * (R / 2 - 0.3), z: Math.cos(f.ang) * (R / 2 - 0.3), ang: f.ang, len: R + 0.6, half: R, at: Math.max(0, f.T - f.t), dur: 0.3 });
    }
    return out;
  }

  /** is a parent standing in something that is hurting right now (for their own dodging) */
  livePoint(x: number, z: number): boolean {
    for (const b of this.bursts) if (b.t >= b.warn - 0.25 && b.t < b.warn + b.live && Math.hypot(x - b.x, z - b.z) < b.r + 0.4) return true;
    return false;
  }

  /* ---- the end (it does not die: it gets away) ---- */

  protected onDie() {
    this.clearAll();
    this.env.audio.v.xRoar();
  }

  protected updateDying(dt: number) {
    this.model.crack = Math.min(1, this.model.crack + dt * 2);
  }

  /* ---- every frame ---- */

  protected animate(dt: number) {
    if (!this.model.root.visible || this.state === 'gone') return;
    const open = this.mode === 'open' ? smooth(clamp(this.mt / 0.5, 0, 1)) : this.mode === 'close' ? 1 - smooth(clamp(this.mt / 0.6, 0, 1)) : 0;
    // its middle comes down to the floor when it opens
    const y = lerp(HOVER + Math.sin(this.t * 1.3) * 0.25, 1.3, open);
    this.model.root.position.set(this.x, y, this.z);
    this.model.open = open;
    const rate = this.state === 'dying' ? 4 : this.mode === 'open' ? 0.15 : this.mode === 'windup' ? 2.4 : this.spinRate;
    this.spin += dt * rate;
    this.model.ang = this.spin;
    const p = this.env.p;
    this.model.lookAt(p.x, 1, p.z);
    this.model.update(this.env.time);
  }

  cinematic() {
    return null;
  }
}
