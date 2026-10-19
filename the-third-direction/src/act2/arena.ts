import * as THREE from 'three';
import { W, H, makeSprite } from '../core/pix';
import { C } from '../core/palette';
import { hash2, rng, TAU } from '../core/util';
import { drawBlob } from '../core/art';

const BG = 0x120a22;
export const ARENA_R = 9;

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

function bigBlob(): THREE.CanvasTexture {
  const p = makeSprite(34, 26);
  drawBlob(p, 17, 24, { s: 2.2, shadow: false });
  return tex(p.canvas);
}

export class Arena {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(64, W / H, 0.1, 170);
  readonly world = new THREE.Group();
  readonly boss = new THREE.Group();
  readonly head = new THREE.Group();
  readonly foot = new THREE.Group();
  readonly arms: THREE.Group[] = [];
  /** shrink or restore the bony body of an arm while keeping its claw tip in place */
  setArmLength(arm: THREE.Group, k: number) {
    const seg = arm.userData['seg'] as THREE.Mesh;
    seg.scale.x = k;
    seg.position.x = 8 * k;
  }
  readonly player = new THREE.Group();
  readonly claw = new THREE.Group();
  readonly shadow = new THREE.Group();
  readonly lanes: THREE.Mesh[] = [];
  readonly pinned: THREE.Mesh[] = [];
  readonly armor = new THREE.Group();
  readonly jaw: THREE.Mesh;
  readonly eyes: THREE.Mesh[] = [];
  private tiles: { x: number; z: number; d: number }[] = [];
  private tileBase: THREE.Color[] = [];
  private tileForest: THREE.Color[] = [];
  readonly clearing = new THREE.Group();
  private flowers: { g: THREE.Group; delay: number }[] = [];
  private peekers: { g: THREE.Group; delay: number }[] = [];
  private platform!: THREE.InstancedMesh;
  private pillars: THREE.Group[] = [];
  readonly pillarData: { x: number; z: number; hp: number; alive: boolean; g: THREE.Group }[] = [];
  private body!: THREE.Mesh;
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
  private mothWings: THREE.Mesh[] = [];
  private mothLight!: THREE.PointLight;
  readonly gaze!: THREE.Mesh;
  readonly core!: THREE.Mesh;
  private coreLight!: THREE.PointLight;
  readonly jawSlots: { group: THREE.Group; ring: THREE.Mesh }[] = [];
  readonly flatBoss = new THREE.Mesh(new THREE.PlaneGeometry(9, 15), new THREE.MeshBasicMaterial({ color: 0x05030a, transparent: true, opacity: 0 }));

  constructor() {
    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 26, 70);
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
    this.buildStars();
    this.buildWall();
    this.buildBoss();
    this.buildPlayer();
    this.buildExtras();
    this.buildClearing();

    // ground telegraphs
    this.shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0.72 }));
    this.shadowDisc.rotation.x = -Math.PI / 2;
    this.shadowRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xe02b3a, side: THREE.DoubleSide }));
    this.shadowRing.rotation.x = -Math.PI / 2;
    this.shadow.add(this.shadowDisc, this.shadowRing);
    this.shadow.position.y = 0.06;
    this.shadow.visible = false;
    this.world.add(this.shadow);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(26, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: 0.9 }));
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

    this.jaw = this.boss.getObjectByName('jaw') as THREE.Mesh;
    this.world.visible = true;
    this.boss.visible = false;
    this.player.visible = false;
  }

  /* ------------------------------ builders ------------------------------ */

  private buildPlatform() {
    const rnd = rng(5);
    for (let x = -10; x <= 10; x++) {
      for (let z = -10; z <= 10; z++) {
        const d = Math.hypot(x, z);
        if (d <= ARENA_R + 0.3 && !(d > ARENA_R - 1.3 && rnd() < 0.25)) this.tiles.push({ x, z, d });
      }
    }
    this.platform = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.7, 0.96), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.tiles.length);
    this.platform.frustumCulled = false;
    const cols = [0x3a2a62, 0x2e2252, 0x46346f, 0x34285a, 0x1b5a5a, 0x2a2048];
    const forest = [0x14444f, 0x1b5a5a, 0x2e7d4f, 0x103846, 0x2a7a6c];
    this.tiles.forEach((t, i) => {
      const h = hash2(t.x * 3 + 1, t.z * 7 + 2);
      const c = h > 0.9 ? cols[4]! : cols[Math.floor(h * 4.5) % 4]!;
      const base = new THREE.Color(c).multiplyScalar(t.d > ARENA_R - 1.4 ? 0.7 : 1);
      this.tileBase.push(base);
      this.tileForest.push(new THREE.Color(forest[Math.floor(hash2(t.x + 9, t.z + 4) * forest.length)]!).multiplyScalar(t.d > ARENA_R - 1.4 ? 0.75 : 1));
      this.platform.setColorAt(i, base);
    });
    this.world.add(this.platform);
    this.setRise(1);

    // stone pillars
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.5 - k * 0.12, 1.05, 1.5 - k * 0.12), new THREE.MeshLambertMaterial({ color: k === 2 ? 0x6a5a98 : 0x4a3d6a }));
        b.position.set((k % 2) * 0.08, 0.52 + k * 1.05, 0);
        g.add(b);
      }
      g.position.set(Math.cos(a) * 5.6, 0, Math.sin(a) * 5.6 - 1.5);
      this.pillars.push(g);
      this.pillarData.push({ x: g.position.x, z: g.position.z, hp: 1.4, alive: true, g });
      this.world.add(g);
    }
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
      const d = 55 + r() * 20;
      pos[i * 3] = Math.cos(a) * Math.cos(b) * d;
      pos[i * 3 + 1] = Math.sin(b) * d + 6;
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
    const geo = new THREE.PlaneGeometry(1.9, 1.9);
    // a curved backdrop behind the boss, seen to either side of him
    for (let row = 0; row < 5; row++) {
      for (let i = 0; i < 17; i++) {
        const a = -Math.PI / 2 + (i - 8) * 0.17;
        if (Math.abs(i - 8) < 2 && row > 1) continue;
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: kinds[Math.floor(rnd() * 5)]!, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: true }));
        const r = 27 + (rnd() - 0.5) * 1.5;
        m.position.set(Math.cos(a) * r, 2.5 + row * 3.4 + rnd() * 0.5, Math.sin(a) * r);
        m.lookAt(0, m.position.y, 0);
        m.rotation.z += (rnd() - 0.5) * 0.18;
        this.pinned.push(m);
        this.world.add(m);
      }
    }
    const big = bigBlob();
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4), new THREE.MeshBasicMaterial({ map: big, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
      m.position.set(sx * 13, 21, -27);
      m.lookAt(0, 21, 0);
      this.pinned.push(m);
      this.world.add(m);
    }
  }

  private buildBoss() {
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a1a44 });
    const mid = new THREE.MeshLambertMaterial({ color: 0x3a2660 });
    const bone = new THREE.MeshLambertMaterial({ color: 0xd8d0b8 });
    const redGlow = new THREE.MeshBasicMaterial({ color: 0xff3040 });
    const B = this.boss;
    B.position.set(0, 0, -17);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(8, 28, 4.4), dark);
    torso.position.y = 2;
    B.add(torso);
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(6.4 - Math.abs(i - 2.5) * 0.5, 0.42, 0.6), bone);
      rib.position.set(0, 4 + i * 1.5, 2.3);
      B.add(rib);
    }
    for (const sx of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 3.2), mid);
      sh.position.set(sx * 5.2, 12, 0);
      B.add(sh);
    }
    // head
    this.head.position.set(0, 17, 0.5);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(6.2, 5, 4.6), mid);
    this.head.add(skull);
    const rnd = rng(77);
    for (let i = 0; i < 16; i++) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.26 + rnd() * 0.12, 8, 6), redGlow.clone());
      e.position.set((rnd() - 0.5) * 5.4, (rnd() - 0.45) * 3.6, 2.35);
      this.head.add(e);
      this.eyes.push(e);
    }
    for (const sx of [-1, 0, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffeeee }));
      e.position.set(sx * 1.9, 0.5 + (sx === 0 ? 0.6 : 0), 2.4);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.8, 0.2), new THREE.MeshBasicMaterial({ color: 0xe02b3a }));
      pupil.position.set(0, 0, 0.58);
      e.add(pupil);
      this.head.add(e);
      this.eyes.push(e);
    }
    // jaw and teeth
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.5, 3.8), dark);
    jaw.name = 'jaw';
    jaw.position.set(0, -3.2, 0.5);
    for (let i = -3; i <= 3; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.9, 0.46), bone);
      tooth.position.set(i * 0.75, 1.1, 1.7);
      jaw.add(tooth);
      const tooth2 = tooth.clone();
      tooth2.position.set(i * 0.75, 3.1, 1.7);
      this.head.add(tooth2);
    }
    this.head.add(jaw);
    B.add(this.head);

    // three bony arms hanging at the sides (animated in the rake)
    for (let i = 0; i < 3; i++) {
      // the group origin is the claw tip; the bony body trails behind it along local +x
      const arm = new THREE.Group();
      const seg = new THREE.Mesh(new THREE.BoxGeometry(16, 1.1, 1.1), bone);
      seg.position.x = 8;
      arm.add(seg);
      arm.userData['seg'] = seg;
      for (let k = -1; k <= 1; k++) {
        const claw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0xf4efe0 }));
        claw.position.set(-0.9, 0, k * 0.5);
        claw.rotation.y = k * 0.25;
        arm.add(claw);
      }
      arm.visible = false;
      this.arms.push(arm);
      this.world.add(arm);
    }

    // the stomping foot
    const sole = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.6, 7.6), dark);
    this.foot.add(sole);
    for (let i = -2; i <= 2; i++) {
      const toe = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 1.9), mid);
      toe.position.set(i * 1.25, -0.5, 4.5);
      this.foot.add(toe);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.9), bone);
      c.position.set(i * 1.25, -0.6, 5.7);
      this.foot.add(c);
    }
    const seam = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xff3040 }));
    seam.position.set(0, 1.35, -1);
    this.foot.add(seam);
    this.foot.position.set(0, 40, 0);
    this.foot.visible = false;
    this.world.add(this.foot);

    // Gloomling armour: a swarm of black cubes clinging to him
    const am = new THREE.MeshLambertMaterial({ color: 0x07040e });
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x6ff0ff });
    for (let i = 0; i < 110; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), am);
      const side = rnd() < 0.5 ? -1 : 1;
      c.position.set(side * (4.1 + rnd() * 0.5), -6 + rnd() * 16, (rnd() - 0.5) * 4.4);
      if (rnd() < 0.5) c.position.set((rnd() - 0.5) * 7.4, -6 + rnd() * 14, 2.4 + rnd() * 0.4);
      c.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      this.armor.add(c);
      if (rnd() < 0.14) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), eyeM);
        e.position.copy(c.position).add(new THREE.Vector3(0, 0.1, 0.34));
        this.armor.add(e);
      }
    }
    B.add(this.armor);
    this.world.add(B);
  }

  private buildPlayer() {
    const P = this.player;
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.66, 14, 10), new THREE.MeshLambertMaterial({ color: 0xf2d36b, emissive: 0x8a6420, emissiveIntensity: 0.7 }));
    this.body.scale.set(1, 0.84, 1);
    this.body.position.y = 0.56;
    P.add(this.body);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dark = new THREE.MeshBasicMaterial({ color: 0x3a1020 });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), white);
      e.position.set(sx * 0.26, 0.66, 0.56);
      const pu = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), dark);
      pu.position.set(0, 0, 0.1);
      e.add(pu);
      P.add(e);
    }
    this.thirdEye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a40 }));
    this.thirdEye.position.set(0, 1.0, 0.42);
    this.thirdEye.scale.setScalar(0.001);
    P.add(this.thirdEye);
    // the claw that grows from its side
    const cm = new THREE.MeshLambertMaterial({ color: 0x120a1c });
    this.claw.position.set(0.72, 0.55, 0.1);
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.1, 5), cm);
      c.rotation.set(Math.PI / 2 + i * 0.22, 0, -0.5);
      c.position.set(0.35, i * 0.14, 0.45);
      this.claw.add(c);
    }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.5), cm);
    arm.position.set(0.1, 0, 0);
    this.claw.add(arm);
    this.claw.scale.setScalar(0.001);
    P.add(this.claw);
    this.world.add(P);
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

    // the Watcher's gaze
    const g = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1.5), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.55 }));
    g.visible = false;
    (this as { gaze: THREE.Mesh }).gaze = g;
    this.world.add(g);

    // the Hollow Core
    const c = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), new THREE.MeshBasicMaterial({ color: 0x6a1a8a }));
    c.visible = false;
    (this as { core: THREE.Mesh }).core = c;
    this.coreLight = new THREE.PointLight(0xc060ff, 0, 14, 1.4);
    c.add(this.coreLight);
    this.world.add(c);

    // root-jaws that erupt in rings
    const bone = new THREE.MeshLambertMaterial({ color: 0xd8d0b8 });
    const root = new THREE.MeshLambertMaterial({ color: 0x4a3a28 });
    for (let i = 0; i < 4; i++) {
      const grp = new THREE.Group();
      for (const sx of [-1, 1]) {
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 1.5), root);
        jaw.position.set(sx * 0.7, 1.3, 0);
        jaw.rotation.z = -sx * 0.25;
        grp.add(jaw);
        for (let k = -1; k <= 1; k++) {
          const t = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 4), bone);
          t.position.set(sx * 0.3, 2.2 - Math.abs(k) * 0.15, k * 0.45);
          t.rotation.z = Math.PI + sx * 0.2;
          grp.add(t);
        }
      }
      grp.visible = false;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 32), new THREE.MeshBasicMaterial({ color: 0xe02b3a, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.07;
      ring.visible = false;
      this.world.add(grp, ring);
      this.jawSlots.push({ group: grp, ring });
    }
  }


  /** The old clearing, rebuilt in 3D after X falls: green ground, glowing flowers, the crater and curious little monsters. */
  private buildClearing() {
    const rnd = rng(31);
    const stem = new THREE.MeshLambertMaterial({ color: 0x0a2e30 });
    const bulb = new THREE.MeshBasicMaterial({ color: 0x7fd8f5 });
    for (let i = 0; i < 30; i++) {
      const a = rnd() * TAU;
      const d = 2.6 + rnd() * 5.6;
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
    const crater = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), new THREE.MeshBasicMaterial({ color: 0x03050a, transparent: true, opacity: 0.85 }));
    crater.rotation.x = -Math.PI / 2;
    crater.position.set(0, 0.04, -1);
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
    mk(0, 6.6, -3.4);
    mk(1, -6.4, -4);
    mk(2, 5.2, -6.2);
    mk(3, -5, -6.4);
    mk(1, 7.4, 1.6);
    mk(0, -7.6, 1.2);
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

  setHead(u: number) {
    this.head.position.set(0, 17 + (6.8 - 17) * u, 0.5 + (10.5 - 0.5) * u);
    this.head.rotation.x = u * 0.28;
  }

  setJaw(open: number) {
    this.jaw.position.y = -3.2 - open * 1.5;
    this.jaw.rotation.x = open * 0.3;
  }

  setGaze(on: boolean, gx = 0, gz = 0, theta = 0, len = 16) {
    this.gaze.visible = on;
    if (!on) return;
    const dx = Math.sin(theta);
    const dz = Math.cos(theta);
    this.gaze.scale.x = len;
    this.gaze.position.set(gx + dx * len * 0.5, 0.1, gz + dz * len * 0.5);
    this.gaze.rotation.y = Math.atan2(-dz, dx);
  }

  setMoth(x: number, y: number, z: number, t: number, show = true) {
    this.moth.visible = show;
    this.moth.position.set(x, y + Math.sin(t * 3) * 0.12, z);
    const f = Math.sin(t * 28);
    this.mothWings.forEach((w) => {
      const side = w.userData['side'] as number;
      w.rotation.z = side * (0.35 + 0.55 * f);
    });
  }

  setCore(on: boolean, x = 0, y = 1, z = 0, lit = 0) {
    this.core.visible = on;
    if (!on) return;
    this.core.position.set(x, y, z);
    const pulse = 1 + 0.08 * Math.sin(performance.now() / 120);
    this.core.scale.setScalar(pulse);
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(lit > 0.5 ? 0xe080ff : 0x2a1040);
    this.coreLight.intensity = 60 * lit;
  }

  setJawSlot(i: number, on: boolean, x = 0, z = 0, tele = 0, burst = 0) {
    const s = this.jawSlots[i]!;
    s.ring.visible = on && burst < 0.05;
    s.ring.position.set(x, 0.07, z);
    const r = 1.55 * Math.min(1, tele);
    s.ring.scale.set(Math.max(0.01, r), Math.max(0.01, r), 1);
    s.group.visible = on && burst > 0.02;
    s.group.position.set(x, 0, z);
    s.group.scale.set(1, Math.max(0.01, burst), 1);
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
      pd.hp = 1.4;
      pd.g.visible = true;
    }
  }

  /* ------------------------------ controls ------------------------------ */

  showPlayerClaw(u: number) {
    const s = Math.max(0.001, u);
    this.claw.scale.setScalar(s);
    this.thirdEye.scale.setScalar(Math.max(0.001, Math.min(1, (u - 0.3) / 0.7)));
  }

  setBelow(canvas: HTMLCanvasElement) {
    const t = tex(canvas);
    const mat = new THREE.MeshBasicMaterial({ map: t, fog: false });
    this.belowMat = mat;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 19.2), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -34, -6);
    this.world.add(m);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 20), new THREE.MeshBasicMaterial({ color: 0x05030a, fog: false }));
    frame.rotation.x = -Math.PI / 2;
    frame.position.set(0, -34.05, -6);
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

  update(dt: number, time: number) {
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

    // idle sway and eye pulse
    this.boss.position.y = Math.sin(time * 0.8) * 0.25;
    this.head.rotation.z = Math.sin(time * 0.6) * 0.03;
    this.eyes.forEach((e, i) => {
      const s = 1 + 0.18 * Math.sin(time * 3 + i);
      e.scale.setScalar(s);
    });
    // player glow follows the body
    this.glow.position.set(this.player.position.x, 2.6, this.player.position.z);
    if (this.belowMat) this.belowMat.needsUpdate = false;
  }
}
