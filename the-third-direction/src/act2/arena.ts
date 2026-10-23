import * as THREE from 'three';
import { W, H, makeSprite } from '../core/pix';
import { C } from '../core/palette';
import { hash2, rng, TAU } from '../core/util';
import { drawBlob } from '../core/art';
import { Cage } from './family';
import { animateJelly, BLOB_LOOK, makeJelly, type JellyRig } from './jelly';

const BG = 0x120a22;
export const ARENA_R = 18;
/** Where the Hollow stands, beyond the far edge of the platform. */
export const BOSS_Z = -29;
/** How many arms rake the floor at once. */
export const LANES = 9;

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Small flat "pressed specimen" sprites pinned on the wall. */
function specimen(kind: number): THREE.CanvasTexture {
  const p = makeSprite(18, 18);
  if (kind === 0) {
    drawBlob(p, 9, 15, { s: 1, shadow: false });
  } else if (kind === 1) {
    p.rect(8, 8, 1, 8, '#0a2e30');
    p.ellipse(8.5, 6, 5, 4.5, C.flower);
    p.ellipse(7, 5, 2, 2, C.flowerLight);
  } else if (kind === 2) {
    p.ellipse(9, 10, 6, 3, C.bone);
    for (let i = 0; i < 4; i++) p.line(4 + i * 3, 10, 2 + i * 3.6, 15, C.boneShade, 1);
    p.px(6, 9, C.ink);
    p.px(11, 9, C.ink);
  } else if (kind === 3) {
    p.ellipse(9, 10, 7, 4.5, '#1a1030');
    p.px(6, 9, C.cyanEye);
    p.px(11, 9, C.cyanEye);
  } else {
    p.ellipse(9, 11, 6, 5, C.root);
    for (let i = -2; i <= 2; i++) p.rect(9 + i * 2 - 0.5, 7, 1, 2, C.bone);
  }
  p.px(9, 1, C.redDark);
  p.px(9, 2, C.red);
  return tex(p.canvas);
}

/** A pool of rings and discs for the floor: warnings, impacts, zones. Index them yourself. */
export class Marks {
  private items: { ring: THREE.Mesh; disc: THREE.Mesh }[] = [];

  constructor(world: THREE.Group, n: number) {
    const ringG = new THREE.RingGeometry(0.86, 1, 40);
    const discG = new THREE.CircleGeometry(0.86, 32);
    for (let i = 0; i < n; i++) {
      const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xe02b3a, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
      const disc = new THREE.Mesh(discG, new THREE.MeshBasicMaterial({ color: 0x20040a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = disc.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      disc.position.y = 0.07;
      ring.visible = disc.visible = false;
      world.add(disc, ring);
      this.items.push({ ring, disc });
    }
  }

  get size() {
    return this.items.length;
  }

  /** Show mark i at (x, z) with radius r. `fill` is the opacity of the dark disc inside, `hot` flashes it. */
  set(i: number, on: boolean, x = 0, z = 0, r = 1, o: { col?: number; fill?: number; hot?: boolean; alpha?: number } = {}) {
    const m = this.items[i];
    if (!m) return;
    m.ring.visible = on;
    m.disc.visible = on && (o.fill ?? 0.4) > 0.01;
    if (!on) return;
    m.ring.position.set(x, 0.09, z);
    m.disc.position.set(x, 0.07, z);
    m.ring.scale.set(r, r, 1);
    m.disc.scale.set(r, r, 1);
    const rm = m.ring.material as THREE.MeshBasicMaterial;
    rm.color.setHex(o.hot ? 0xff9a9a : (o.col ?? 0xe02b3a));
    rm.opacity = o.alpha ?? 1;
    (m.disc.material as THREE.MeshBasicMaterial).opacity = (o.fill ?? 0.4) * (o.alpha ?? 1);
  }

  hideAll() {
    for (const m of this.items) m.ring.visible = m.disc.visible = false;
  }
}

export class Arena {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(64, W / H, 0.1, 320);
  readonly world = new THREE.Group();
  readonly player = new THREE.Group();
  readonly claw = new THREE.Group();
  readonly shadow = new THREE.Group();
  readonly lanes: THREE.Mesh[] = [];
  readonly pinned: THREE.Mesh[] = [];
  private tiles: { x: number; z: number; d: number }[] = [];
  private tileBase: THREE.Color[] = [];
  private tileForest: THREE.Color[] = [];
  readonly clearing = new THREE.Group();
  readonly marks: Marks;
  private lanceMeshes: THREE.Group[] = [];
  private novaRing!: THREE.Mesh;
  private novaWall!: THREE.Mesh;
  private flowers: { g: THREE.Group; delay: number }[] = [];
  private peekers: { g: THREE.Group; delay: number }[] = [];
  private platform!: THREE.InstancedMesh;
  private pillars: THREE.Group[] = [];
  readonly pillarData: { x: number; z: number; r: number; hp: number; alive: boolean; g: THREE.Group }[] = [];
  private skin!: THREE.MeshStandardMaterial;
  private rig!: JellyRig;
  private thirdEyeSize = new THREE.Vector3();
  private thirdEye!: THREE.Mesh;
  private glow: THREE.PointLight;
  private redLight: THREE.PointLight;
  private shadowDisc: THREE.Mesh;
  private shadowRing: THREE.Mesh;
  private slash: THREE.Mesh;
  private debris!: THREE.InstancedMesh;
  private debrisData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; rot: number }[] = [];
  private tmp = new THREE.Object3D();
  private tmpC = new THREE.Color();
  private belowMat: THREE.MeshBasicMaterial | null = null;
  readonly moth = new THREE.Group();
  /** Mother and Father, in the Collector's cage, hanging over the arena: three locks, one per boss */
  readonly cage = new Cage();
  private mothWings: THREE.Mesh[] = [];
  private shieldMesh!: THREE.Mesh;
  private mothLight!: THREE.PointLight;

  constructor() {
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 48, 160);
    this.scene.add(this.world);

    // lights (three r170 uses physical units, so intensities carry a PI factor)
    this.world.add(new THREE.AmbientLight(0x8a78c8, 1.25));
    const key = new THREE.DirectionalLight(0x9fe8ff, 1.9);
    key.position.set(-6, 14, 8);
    this.world.add(key);
    const back = new THREE.DirectionalLight(0xb060ff, 1.6);
    back.position.set(6, 10, -14);
    this.world.add(back);
    this.glow = new THREE.PointLight(0xffd878, 28, 11, 1.6);
    this.world.add(this.glow);
    this.redLight = new THREE.PointLight(0xff2a40, 0, 30, 1.4);
    this.redLight.position.set(0, 14, -10);
    this.world.add(this.redLight);

    this.buildPlatform();
    this.buildRocks();
    this.buildStars();
    this.buildWall();
    this.buildPlayer();
    this.buildExtras();
    this.buildClearing();
    this.marks = new Marks(this.world, 16);
    this.world.add(this.cage.g);
    this.buildLight();

    // ground telegraphs
    this.shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0.72 }));
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xe02b3a, side: THREE.DoubleSide }));
    this.shadowRing.rotation.x = -Math.PI / 2;
    this.shadow.add(this.shadowDisc, this.shadowRing);
    this.shadow.position.y = 0.06;
    this.shadow.visible = false;
    this.world.add(this.shadow);
    for (let i = 0; i < LANES; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(52, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: 0.9 }));
      m.position.y = 0.08;
      m.visible = false;
      this.lanes.push(m);
      this.world.add(m);
    }
    this.slash = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.35, 20, 1, 0, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    this.slash.rotation.x = -Math.PI / 2;
    this.world.add(this.slash);

    // debris
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshBasicMaterial({ color: 0xffffff }), 160);
    this.debris.frustumCulled = false;
    this.debris.count = 0;
    this.world.add(this.debris);

    this.world.visible = true;
    this.player.visible = false;
  }

  /* ------------------------------ builders ------------------------------ */

  private buildPlatform() {
    const rnd = rng(5);
    const R = ARENA_R;
    for (let x = -R - 1; x <= R + 1; x++) {
      for (let z = -R - 1; z <= R + 1; z++) {
        const d = Math.hypot(x, z);
        if (d <= R + 0.3 && !(d > R - 1.3 && rnd() < 0.25)) this.tiles.push({ x, z, d });
      }
    }
    this.platform = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.7, 0.96), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.tiles.length);
    this.platform.frustumCulled = false;
    const cols = [0x3a2a62, 0x2e2252, 0x46346f, 0x34285a, 0x1b5a5a, 0x2a2048];
    const forest = [0x14444f, 0x1b5a5a, 0x2e7d4f, 0x103846, 0x2a7a6c];
    this.tiles.forEach((t, i) => {
      const h = hash2(t.x * 3 + 1, t.z * 7 + 2);
      let c = h > 0.9 ? cols[4]! : cols[Math.floor(h * 4.5) % 4]!;
      // faint stone rings and spokes, so movement reads on such a big floor
      const ring = [9.5, 14.5].some((r) => Math.abs(t.d - r) < 0.55);
      const spoke = t.d > 2 && (Math.abs(t.x) < 0.5 || Math.abs(t.z) < 0.5);
      if (ring || spoke) c = 0x5a4a8a;
      const base = new THREE.Color(c).multiplyScalar(t.d > R - 1.4 ? 0.7 : 1);
      this.tileBase.push(base);
      this.tileForest.push(new THREE.Color(forest[Math.floor(hash2(t.x + 9, t.z + 4) * forest.length)]!).multiplyScalar(t.d > R - 1.4 ? 0.75 : 1));
      this.platform.setColorAt(i, base);
    });
    this.world.add(this.platform);
    this.setRise(1);

    // stone pillars: a near ring and a far ring, cover from the Watcher's gaze
    const spots: [number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      spots.push([Math.cos(a) * 7.5, Math.sin(a) * 7.5 - 2]);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.2;
      spots.push([Math.cos(a) * 13.5, Math.sin(a) * 13.5 - 2]);
    }
    for (const [px, pz] of spots) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.5 - k * 0.12, 1.05, 1.5 - k * 0.12), new THREE.MeshLambertMaterial({ color: k === 2 ? 0x6a5a98 : 0x4a3d6a }));
        b.position.set((k % 2) * 0.08, 0.52 + k * 1.05, 0);
        g.add(b);
      }
      g.position.set(px, 0, pz);
      this.pillars.push(g);
      this.pillarData.push({ x: px, z: pz, r: 0.9, hp: 0.85, alive: true, g });
      this.world.add(g);
    }
  }

  /** Small broken islands of the old world drifting around the arena. */
  private buildRocks() {
    const r = rng(41);
    const n = 90;
    const rocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    rocks.frustumCulled = false;
    const m = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const d = ARENA_R + 8 + r() * 38;
      const s = 0.8 + r() * r() * 5;
      m.position.set(Math.cos(a) * d, -3 - r() * 16 + (r() < 0.25 ? 14 : 0), Math.sin(a) * d);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      m.scale.set(s, s * (0.5 + r() * 0.8), s);
      m.updateMatrix();
      rocks.setMatrixAt(i, m.matrix);
      rocks.setColorAt(i, c.setHex([0x2a2048, 0x34285a, 0x1b3a4a, 0x46346f][Math.floor(r() * 4)]!));
    }
    this.world.add(rocks);
  }

  setRise(u: number) {
    const m = this.tmp;
    this.tiles.forEach((t, i) => {
      const local = Math.min(1, Math.max(0, (u * 1.6 - (t.d / ARENA_R) * 0.6)));
      const e = 1 - Math.pow(1 - local, 3);
      m.position.set(t.x, -0.35 - (1 - e) * 14, t.z);
      m.rotation.set(0, 0, 0);
      m.scale.setScalar(Math.max(0.001, e));
      m.updateMatrix();
      this.platform.setMatrixAt(i, m.matrix);
    });
    this.platform.instanceMatrix.needsUpdate = true;
    this.pillarData.forEach((pd, i) => {
      const e = Math.min(1, Math.max(0, u * 1.8 - 0.5));
      pd.g.scale.set(1, Math.max(0.001, e), 1);
      if (u >= 1) pd.g.visible = pd.alive;
      void i;
    });
  }

  private buildStars() {
    const r = rng(11);
    const n = 320;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const b = (r() - 0.25) * 1.5;
      const d = 120 + r() * 30;
      pos[i * 3] = Math.cos(a) * Math.cos(b) * d;
      pos[i * 3 + 1] = Math.sin(b) * d + 12;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(b) * d;
      c.setHex([0x9ff4ee, 0xe8fffb, 0xb88aff, 0xff7a9a][Math.floor(r() * 4)]!);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false }));
    this.scene.add(pts);
  }

  private buildWall() {
    const kinds = [0, 1, 2, 3, 4].map(specimen);
    const rnd = rng(21);
    const geo = new THREE.PlaneGeometry(4, 4);
    // a ring of pinned specimens all around the arena, like a collector's wall
    const N = 40;
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU + row * 0.07;
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: kinds[Math.floor(rnd() * 5)]!, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: true }));
        const r = 66 + (rnd() - 0.5) * 3;
        m.position.set(Math.cos(a) * r, 2 + row * 7 + rnd(), Math.sin(a) * r);
        m.lookAt(0, m.position.y, 0);
        m.rotation.z += (rnd() - 0.5) * 0.18;
        this.pinned.push(m);
        this.world.add(m);
      }
    }
  }

  /** The baby blob in 3D: a glowing jelly dome with big dark glassy eyes (see jelly.ts). */
  private buildPlayer() {
    const P = this.player;
    const jelly = makeJelly(BLOB_LOOK);
    P.add(jelly.g);
    this.skin = jelly.mat;
    const body = jelly.body;
    // the third eye opens later, in the middle of the forehead
    this.thirdEye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff2a40 }));
    const fh = jelly.forehead;
    this.thirdEye.position.copy(fh.p);
    this.thirdEye.lookAt(fh.p.clone().add(fh.n));
    this.thirdEyeSize.set(0.2, 0.26, 0.08);
    this.thirdEye.scale.setScalar(0.001);
    body.add(this.thirdEye);

    // the claw that grows from its right side
    const cm = new THREE.MeshLambertMaterial({ color: 0x120a1c });
    this.claw.position.set(0.9, 0.5, 0.06);
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.1, 5), cm);
      c.rotation.set(Math.PI / 2 + i * 0.22, 0, -0.5);
      c.position.set(0.35, i * 0.14, 0.45);
      this.claw.add(c);
    }
    const carm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.5), cm);
    carm.position.set(0.1, 0, 0);
    this.claw.add(carm);
    this.claw.scale.setScalar(0.001);
    body.add(this.claw);

    this.rig = jelly;
    this.world.add(P);
  }

  /** Waddle, breathing, blinking and the claw swing. `phase` advances with distance walked. */
  animatePlayer(dt: number, time: number, walk: number, phase: number, strike: number, hurt: boolean) {
    const r = this.rig;
    animateJelly(r, time, walk, phase, 0, 0, 0);
    // claw swing during a strike (strike runs 0..1)
    if (strike > 0) {
      const u = 1 - strike;
      this.claw.rotation.y = -0.9 + 2.1 * (1 - Math.pow(1 - u, 3));
      this.claw.rotation.z = Math.sin(u * Math.PI) * 0.6;
      r.body.rotation.x += 0.25 * Math.sin(u * Math.PI);
    } else {
      this.claw.rotation.y *= 0.8;
      this.claw.rotation.z *= 0.8;
    }
    // hurt flash
    this.skin.emissive.setHex(hurt ? 0xc02020 : 0x000000);
    void dt;
  }


  /** The moth, the red gaze beam, the exposed core and the root-jaws of the last phases. */
  private buildExtras() {
    // the Mournmoth: a tiny glowing companion
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xcff6ff, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.55), wingMat);
      w.position.set(sx * 0.4, 0, 0);
      w.userData['side'] = sx;
      this.moth.add(w);
      this.mothWings.push(w);
    }
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.moth.add(body);
    this.mothLight = new THREE.PointLight(0xb8f0ff, 16, 9, 1.5);
    this.moth.add(this.mothLight);
    this.moth.visible = false;
    this.world.add(this.moth);
    // the moth's shield: a bubble of moonlight around you while the moth can take a hit for you
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.shieldMesh.position.y = 1.05;
    this.shieldMesh.scale.set(1, 1.2, 1);
    this.shieldMesh.visible = false;
    this.player.add(this.shieldMesh);
  }


  /** Bolts and bursts of light: what the player throws. */
  private buildLight() {
    const core = new THREE.OctahedronGeometry(0.34, 0);
    core.scale(1, 1, 3.2);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(core, new THREE.MeshBasicMaterial({ color: 0xfffbe0, fog: false })));
      const glow = new THREE.Mesh(core, new THREE.MeshBasicMaterial({ color: 0xffd878, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.scale.set(2.2, 2.2, 1.7);
      g.add(glow);
      g.visible = false;
      this.lanceMeshes.push(g);
      this.world.add(g);
    }
    this.novaRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 56), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.novaRing.rotation.x = -Math.PI / 2;
    this.novaWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd878, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.novaRing.visible = this.novaWall.visible = false;
    this.world.add(this.novaRing, this.novaWall);
  }

  /** Show the bolts in flight (at most six). */
  setLances(list: { x: number; y: number; z: number; vx: number; vy: number; vz: number }[]) {
    this.lanceMeshes.forEach((g, i) => {
      const l = list[i];
      g.visible = !!l;
      if (!l) return;
      g.position.set(l.x, l.y, l.z);
      g.lookAt(l.x + l.vx, l.y + l.vy, l.z + l.vz);
    });
  }

  /** u: 0..1 through its life. */
  setNova(on: boolean, x = 0, z = 0, R = 1, u = 0) {
    this.novaRing.visible = this.novaWall.visible = on;
    if (!on) return;
    this.novaRing.position.set(x, 0.14, z);
    this.novaRing.scale.set(R, R, 1);
    (this.novaRing.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - u * u);
    this.novaWall.position.set(x, 0.9, z);
    this.novaWall.scale.set(R, 1.8 * (1 - u * 0.4), R);
    (this.novaWall.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - u);
  }

  /** The old clearing, rebuilt in 3D after X falls: green ground, glowing flowers, the crater and curious little monsters. */
  private buildClearing() {
    const rnd = rng(31);
    const stem = new THREE.MeshLambertMaterial({ color: 0x0a2e30 });
    const bulb = new THREE.MeshBasicMaterial({ color: 0x7fd8f5 });
    for (let i = 0; i < 90; i++) {
      const a = rnd() * TAU;
      const d = 4 + rnd() * (ARENA_R - 5.5);
      const g = new THREE.Group();
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), stem);
      st.position.y = 0.4;
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), bulb);
      bl.position.y = 0.9;
      g.add(st, bl);
      g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      g.scale.setScalar(0.001);
      this.flowers.push({ g, delay: rnd() * 0.5 });
      this.clearing.add(g);
    }
    // the crater where the family rested
    const crater = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), new THREE.MeshBasicMaterial({ color: 0x03050a, transparent: true, opacity: 0.85 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(0, 0.04, -2);
    crater.name = 'crater';
    this.clearing.add(crater);
    // tiny monsters peek over the rim
    const mk = (kind: number, x: number, z: number) => {
      const g = new THREE.Group();
      if (kind === 0) {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 6), new THREE.MeshLambertMaterial({ color: 0x4a3a28 }));
        b.position.y = 0.35;
        g.add(b);
        for (let k = -1; k <= 1; k++) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), new THREE.MeshBasicMaterial({ color: 0xf4efe0 }));
          t.position.set(k * 0.14, 0.62, 0.22);
          g.add(t);
        }
      } else if (kind === 1) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0xece8ff }));
        b.position.y = 0.55;
        const i = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0x6a4ad0 }));
        i.position.set(0, 0.55, 0.24);
        g.add(b, i);
      } else if (kind === 2) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.36), new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }));
        b.position.y = 0.3;
        g.add(b);
      } else {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshLambertMaterial({ color: 0x07040e }));
        b.position.y = 0.3;
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0x6ff0ff }));
        e.position.set(0, 0.38, 0.27);
        g.add(b, e);
      }
      g.position.set(x, 0, z);
      g.scale.setScalar(0.001);
      this.peekers.push({ g, delay: 0.5 + rnd() * 0.5 });
      this.clearing.add(g);
    };
    mk(0, 11, -5.5);
    mk(1, -10.5, -6.5);
    mk(2, 8.5, -10);
    mk(3, -8.5, -10.5);
    mk(1, 12.5, 2.6);
    mk(0, -12.8, 2);
    mk(2, 3.4, -9.4);
    mk(3, -4.6, -8.6);
    mk(0, 14, -10);
    mk(1, -14, -9);
    this.clearing.visible = false;
    this.world.add(this.clearing);
  }

  /** Recolour the platform from violet void-stone to forest ground (u: 0 to 1). */
  tint(u: number) {
    const c = this.tmpC;
    this.tiles.forEach((_t, i) => {
      c.copy(this.tileBase[i]!).lerp(this.tileForest[i]!, Math.min(1, Math.max(0, u)));
      this.platform.setColorAt(i, c);
    });
    if (this.platform.instanceColor) this.platform.instanceColor.needsUpdate = true;
  }

  setClearing(u: number) {
    this.clearing.visible = u > 0.001;
    const crater = this.clearing.getObjectByName('crater');
    if (crater) crater.visible = u > 0.5;
    for (const f of this.flowers) f.g.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - Math.min(1, Math.max(0, (u - f.delay * 0.5) * 2)), 3)));
    for (const p of this.peekers) p.g.scale.setScalar(Math.max(0.001, Math.min(1, Math.max(0, (u - p.delay * 0.6) * 3))));
  }

  /** `calm` 1: resting on your head (slow small wingbeats). `fast` 1: trembling. `glow`: how bright it is. */
  setMoth(x: number, y: number, z: number, t: number, show = true, calm = 0, glow = 1, fast = 0) {
    this.moth.visible = show;
    this.moth.position.set(x, y + Math.sin(t * 3) * 0.12 * (1 - calm), z);
    const f = Math.sin(t * (28 - 20 * calm + 18 * fast));
    this.mothWings.forEach((w) => {
      const side = w.userData['side'] as number;
      w.rotation.z = side * (0.35 + 0.55 * f * (1 - 0.6 * calm));
    });
    this.mothLight.intensity = 16 * glow;
  }

  /** The shield bubble: `u` 1 is up, 0 is gone; `flash` is the burst when it takes a hit or comes back. */
  setShield(u: number, flash: number, t: number) {
    const m = this.shieldMesh.material as THREE.MeshBasicMaterial;
    this.shieldMesh.visible = u > 0.01 || flash > 0.01;
    m.opacity = 0.13 * u + 0.4 * flash + 0.02 * Math.sin(t * 3) * u;
    const s = 1 + 0.04 * Math.sin(t * 3) + 0.25 * flash;
    this.shieldMesh.scale.set(s, 1.2 * s, s);
  }

  crumblePillar(i: number) {
    const pd = this.pillarData[i]!;
    if (!pd.alive) return;
    pd.alive = false;
    pd.g.visible = false;
    this.burst3(pd.x, 1.5, pd.z, 18, [0x4a3d6a, 0x6a5a98, 0x2a2048], 7);
  }

  restorePillars() {
    for (const pd of this.pillarData) {
      pd.alive = true;
      pd.hp = 0.85;
      pd.g.visible = true;
    }
  }

  /* ------------------------------ controls ------------------------------ */

  showPlayerClaw(u: number) {
    const s = Math.max(0.001, u);
    this.claw.scale.setScalar(s);
    this.thirdEye.scale.copy(this.thirdEyeSize).multiplyScalar(Math.max(0.001, Math.min(1, (u - 0.3) / 0.7)));
  }

  setBelow(canvas: HTMLCanvasElement) {
    const t = tex(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: t, fog: false });
    this.belowMat = mat;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 38.4), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -60, -6);
    this.world.add(m);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(23, 40), new THREE.MeshBasicMaterial({ color: 0x05030a, fog: false }));
    frame.rotation.x = -Math.PI / 2;
    frame.position.set(0, -60.05, -6);
    this.world.add(frame);
  }

  setShadow(x: number, z: number, R: number, u: number, hot: boolean) {
    this.shadow.visible = true;
    this.shadow.position.set(x, 0.06, z);
    const r = Math.max(0.05, R * (1 - Math.pow(1 - Math.min(1, u), 3)));
    this.shadow.scale.set(r, 1, r);
    (this.shadowRing.material as THREE.MeshBasicMaterial).color.setHex(hot ? 0xff7a7a : 0xe02b3a);
    (this.shadowDisc.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * u;
  }
  hideShadow() {
    this.shadow.visible = false;
  }

  showSlash(x: number, z: number, ang: number, a: number) {
    this.slash.position.set(x, 0.9, z);
    this.slash.rotation.z = ang;
    (this.slash.material as THREE.MeshBasicMaterial).opacity = a;
    this.slash.scale.setScalar(1 + (1 - a) * 1.4);
  }

  setRedLight(v: number) {
    this.redLight.intensity = v;
  }

  burst3(x: number, y: number, z: number, n: number, colors: number[], speed = 8) {
    for (let i = 0; i < n && this.debrisData.length < 150; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random());
      this.debrisData.push({ x, y, z, vx: Math.cos(a) * s, vy: 2 + Math.random() * speed, vz: Math.sin(a) * s, life: 0.8 + Math.random() * 0.9, rot: Math.random() * 6 });
      this.debris.setColorAt(this.debrisData.length - 1, this.tmpC.setHex(colors[Math.floor(Math.random() * colors.length)]!));
    }
  }

  update(dt: number, _time: number) {
    // debris
    const m = this.tmp;
    let n = 0;
    for (let i = 0; i < this.debrisData.length; i++) {
      const d = this.debrisData[i]!;
      d.life -= dt;
      if (d.life <= 0) {
        this.debrisData.splice(i, 1);
        i--;
        continue;
      }
      d.vy -= 22 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.rot += dt * 6;
      m.position.set(d.x, d.y, d.z);
      m.rotation.set(d.rot, d.rot * 0.7, 0);
      m.scale.setScalar(Math.min(1, d.life * 2));
      m.updateMatrix();
      this.debris.setMatrixAt(n++, m.matrix);
    }
    this.debris.count = n;
    this.debris.instanceMatrix.needsUpdate = true;
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;

    this.cage.update(dt, _time);
    // player glow follows the body
    this.glow.position.set(this.player.position.x, 2.6, this.player.position.z);
    if (this.belowMat) this.belowMat.needsUpdate = false;
  }
}
