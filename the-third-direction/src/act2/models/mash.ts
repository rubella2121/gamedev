import * as THREE from 'three';
import { TubeChain } from '../kit/chain';
import { fbm, mix, scale, rgb, type RGB } from '../kit/noise';
import type { Slicer } from '../kit/sdf';
import { glow, halo, skin } from '../kit/skin';
import { BELL_PATCHES, BELL_R, bellRadius, buildBell, buildBloom, buildShell, crackPoints, fangGeometry, featherGeometry, outwardTube, paint, petalGeometry, PAL, rnd, SHELL_R, thornGeometry, FACE_DIR } from './mash-shapes';
import { BLOOM_POS, BLOOM_SQUASH, BLOOM_TILT, EYE_POS, MASH_S, MASH_Y, MASH_Z, SHELL_DOCK, TAIL_BASE } from './mash-layout';
import { ScorpionTail } from './mash-tail';
import * as P from './mash-poses';

/**
 * THE MASH. Every guardian the forest gave you, stitched back together by X into one thing that should not move:
 *   the Toll Queen's bell for a body, with her winged eye hung on it,
 *   the Mimic Queen's bloom for a head, with a glowing lure deep in its throat,
 *   the Thornback King's shell on its left, its face half under the plates,
 *   the Bone Wyrm's spine rising behind it as a scorpion's tail, ending in a hollow bone stinger,
 *   the Gloommother's black tendrils writhing around its base.
 * Built from distance functions (bell, bloom, shell), tubes (neck, tail, tendrils, rope) and instanced parts (petals,
 * fangs, thorns, vertebrae, feathers, stitches). This file is the body; the fight lives in bosses/mash.ts.
 */

export { BLOOM_POS, BLOOM_SQUASH, BLOOM_TILT, EYE_POS, MASH_S, MASH_Y, MASH_Z, SHELL_DOCK, TAIL_BASE };

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutBack = (t: number) => {
  t = clamp01(t);
  return 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
};
const smooth = (t: number) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};

/** the tentacles' vertex colours: black-violet, faint grooves along the length, a little lighter towards the tip */
const tendrilColor = (u: number, _a: number): RGB => {
  const ring = Math.pow(Math.abs(Math.sin(u * 15 * Math.PI)), 10);
  const c = mix(rgb(0x030208), rgb(0x0e0722), 0.2 + 0.8 * u * u);
  return mix(c, rgb(0x241552), ring * 0.4 * (0.4 + u));
};

/* ---------------------------------------------------------------- */
/* a wet, dark skin                                                  */
/* ---------------------------------------------------------------- */

/**
 * A black toon skin that looks wet: a wide bright rim round the silhouette and a small hard-edged glint where the surface
 * faces the top left. (The vertex colours carry the dark pattern.)
 */
function glossSkin(o: { rim: number; rimPower: number; glint: number }): THREE.MeshToonMaterial {
  const m = skin({ vertexColors: true });
  const rimC = new THREE.Color(o.rim);
  const glintC = new THREE.Color(o.glint);
  m.onBeforeCompile = (sh) => {
    sh.uniforms['rimColor'] = { value: rimC };
    sh.uniforms['glintColor'] = { value: glintC };
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 rimColor;\nuniform vec3 glintColor;\nvoid main() {').replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
    vec3 nn = normalize(normal);
    float fr = 1.0 - saturate(dot(normalize(vViewPosition), nn));
    // a thin bright rim on the silhouette, a deep violet sheen inside it, and a hard glint where the surface faces the light
    totalEmissiveRadiance += rimColor * pow(fr, ${o.rimPower.toFixed(2)}) + rimColor * 0.04 * pow(fr, 1.5);
    float gl = saturate(dot(nn, normalize(vec3(-0.45, 0.7, 0.55))));
    totalEmissiveRadiance += glintColor * (step(0.955, gl) * 0.62 + pow(gl, 14.0) * 0.1);`,
    );
  };
  m.customProgramCacheKey = () => 'mashgloss';
  return m;
}

/* ---------------------------------------------------------------- */
/* stitches                                                          */
/* ---------------------------------------------------------------- */

const STITCH_COOL = new THREE.Color(0x07040a);
const STITCH_HOT = new THREE.Color(2.2, 1.5, 0.7);
const _stc = new THREE.Color();

/**
 * Thick black stitches across the seams. They sew themselves on in the entrance (white-hot as the thread goes in, black
 * when it cools) and tear off in the death.
 */
export class StitchSet {
  readonly mesh: THREE.InstancedMesh;
  private base: THREE.Matrix4[] = [];
  private at: number[] = [];
  private vel: THREE.Vector3[] = [];
  private n = 0;
  private o = new THREE.Object3D();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private pos: THREE.Vector3[] = [];
  private quat: THREE.Quaternion[] = [];
  private sc: THREE.Vector3[] = [];
  private heat: number[] = [];
  private seen: boolean[] = [];

  constructor(
    parent: THREE.Object3D,
    mat: THREE.Material,
    private max: number,
    geo = new THREE.CylinderGeometry(0.1, 0.1, 1.05, 6, 1),
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, STITCH_COOL);
    parent.add(this.mesh);
  }

  /** a bar centred at `p`, lying along `dir`, `len` times the standard length */
  add(p: THREE.Vector3, dir: THREE.Vector3, len = 1, thick = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const d = dir.clone().normalize();
    this.q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    this.pos[i] = p.clone();
    this.quat[i] = this.q.clone();
    this.sc[i] = new THREE.Vector3(thick, len, thick);
    this.base[i] = new THREE.Matrix4().compose(this.pos[i]!, this.quat[i]!, this.sc[i]!);
    this.at[i] = Math.random();
    this.heat[i] = 0;
    this.seen[i] = false;
    this.vel[i] = new THREE.Vector3((Math.random() - 0.5) * 7, 2 + Math.random() * 7, (Math.random() - 0.5) * 7);
  }

  finish() {
    this.mesh.count = this.n;
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, this.base[i]!);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get count() {
    return this.n;
  }

  /**
   * 0 = none sewn, 1 = all sewn: each pops in at its own moment, white-hot, and cools to black over a second or so.
   * `dt` is the time since the last call; `pop` is told where (world) a stitch has just gone in (every third one).
   */
  sew(p: number, dt = 0, pop?: (where: THREE.Vector3) => void) {
    if (p <= 0) {
      this.seen.fill(false);
      this.heat.fill(0);
    }
    for (let i = 0; i < this.n; i++) {
      const k = p >= 1 ? 1 : easeOutBack(clamp01((p - this.at[i]! * 0.78) / 0.22));
      if (k > 0.02 && !this.seen[i]) {
        this.seen[i] = true;
        this.heat[i] = 1;
        if (pop && i % 3 === 0) pop(this.mesh.parent!.localToWorld(this.v.copy(this.pos[i]!)));
      }
      this.o.position.copy(this.pos[i]!);
      this.o.quaternion.copy(this.quat[i]!);
      // a stitch swells while it is hot
      const h = this.heat[i] ?? 0;
      this.o.scale.copy(this.sc[i]!).multiplyScalar(Math.max(0.0001, k) * (1 + 0.9 * h));
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
      _stc.copy(STITCH_COOL).lerp(STITCH_HOT, h * h);
      this.mesh.setColorAt(i, _stc);
      if (h > 0) this.heat[i] = Math.max(0, h - dt * 1.3);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** 0 = whole, 1 = all torn away and fallen (time in seconds since the tearing began) */
  tear(sec: number) {
    for (let i = 0; i < this.n; i++) {
      const t = Math.max(0, sec - this.at[i]! * 1.8);
      const vel = this.vel[i]!;
      this.o.position.copy(this.pos[i]!).addScaledVector(vel, t * 0.9);
      this.o.position.y -= 9 * t * t;
      this.o.quaternion.copy(this.quat[i]!);
      this.o.rotateX(t * 6 + i);
      const k = t <= 0 ? 1 : Math.max(0.0001, 1 - Math.max(0, t - 1.0) * 0.8);
      this.o.scale.copy(this.sc[i]!).multiplyScalar(k);
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** the first `frac` of the stitches (by their random order) are gone: it is coming apart */
  damage(frac: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.at[i]! < frac) {
        this.o.position.copy(this.pos[i]!);
        this.o.quaternion.copy(this.quat[i]!);
        this.o.scale.setScalar(0.0001);
        this.o.updateMatrix();
        this.mesh.setMatrixAt(i, this.o.matrix);
      } else this.mesh.setMatrixAt(i, this.base[i]!);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (let i = 0; i < this.n; i++) {
      this.mesh.setMatrixAt(i, this.base[i]!);
      this.mesh.setColorAt(i, STITCH_COOL);
    }
    this.heat.fill(0);
    this.seen.fill(true);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- */
/* the model                                                         */
/* ---------------------------------------------------------------- */

export interface Tendril {
  chain: TubeChain;
  base: THREE.Vector3;
  dir: THREE.Vector3;
  ph: number;
  len: number;
}

export class MashModel {
  readonly root = new THREE.Group();
  readonly bellG = new THREE.Group();
  readonly bloom = new THREE.Group();
  readonly eye = new THREE.Group();
  /** the shell lives in the world so it can roll about the arena */
  readonly shell = new THREE.Group();
  readonly spinner = new THREE.Group();
  readonly tail = new ScorpionTail();
  ready = false;

  // materials
  readonly bronzeMat = skin({ vertexColors: true, rim: 0xd8a860, rimPower: 3.2 });
  readonly fleshMat = skin({ vertexColors: true, rim: 0xc85070, rimPower: 2.8 });
  readonly petalMat = skin({ vertexColors: true, rim: 0x58b8a0, rimPower: 3.2, side: THREE.DoubleSide });
  readonly boneMat = skin({ vertexColors: true, rim: 0xd8c488, rimPower: 3.2 });
  readonly shellMat = skin({ vertexColors: true, rim: 0x4a68b8, rimPower: 3.6 });
  /** the Gloommother's tentacles: black-violet, wet, with a bright rim and a hard glint */
  readonly darkMat = glossSkin({ rim: 0x9a6cff, rimPower: 5.2, glint: 0xd0c0ff });
  /** (every stitch tints its own colour: white-hot as it goes in, black when it cools) */
  readonly stitchMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  private mats: THREE.MeshToonMaterial[] = [];

  // bell
  private bellMesh!: THREE.Mesh;
  private crackGlow!: THREE.Mesh;
  private crackHalo: THREE.Sprite;
  private clapperRope!: TubeChain;
  private clapperBulb!: THREE.Mesh;
  private clapperHalo: THREE.Sprite;

  clapperTip = new THREE.Vector3(0, 0.6, 9.5);
  // bloom
  private core!: THREE.Mesh;
  private neck!: TubeChain;
  private petals!: THREE.InstancedMesh;
  private petalP: { ang: number; len: number; wid: number; rho: number; z0: number; layer: number; ph: number }[] = [];
  private fangs!: THREE.InstancedMesh;
  private fangP: { a: number; ring: number; len: number; wid: number; ph: number; jx: number; jy: number }[] = [];
  private lure!: TubeChain;
  private lureBulb: THREE.Mesh;
  private lureHalo: THREE.Sprite;
  private lureLight: THREE.PointLight;
  readonly lureTip = new THREE.Vector3();
  lureOut = 0;
  lureGlow = 0.5;
  private lureFloor = new THREE.Vector3(0, 0.8, 9.5);
  // eye
  private eyeBall = new THREE.Group();
  private eyeLid!: THREE.Mesh;
  private eyeHalo: THREE.Sprite;
  private feathers!: THREE.InstancedMesh;
  private featherP: { side: number; phi: number; len: number; wid: number; ph: number }[] = [];
  private lookT = new THREE.Vector3(0, 2, 20);
  eyeOpen = 0.3;
  // shell
  private shellFace: THREE.Mesh[] = [];
  private shellHalo: THREE.Sprite;
  private thorns!: THREE.InstancedMesh;
  // tendrils
  readonly tendrils: Tendril[] = [];
  private tendrilTips!: THREE.InstancedMesh;
  // stitches
  readonly stitches: StitchSet;
  readonly shellStitches: StitchSet;
  readonly bloomStitches: StitchSet;
  readonly eyeStitches: StitchSet;
  // controls
  dmg = 0;
  /** seconds since it died, or -1 */
  deathT = -1;
  /** the tendrils go limp (death) */
  limp = 0;
  bloomOpen = 1;
  inhale = 0;
  roar = 0;
  lean = 0;
  tilt = 0;
  toll = 0;
  bellLift = 0;
  crack = 0;
  shake = 0;
  mawOpen = 0.5;
  private time = 0;
  private flashT = 0;
  private tmp = new THREE.Vector3();
  private o = new THREE.Object3D();
  private m4 = new THREE.Matrix4();
  private m5 = new THREE.Matrix4();
  private m6 = new THREE.Matrix4();
  private m7 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private lookPull = 0;
  /** where the tendrils reach, in root space, and how much (0..1) */
  readonly tendrilTarget = new THREE.Vector3(0, 2, 14);
  tendrilReach = 0;
  /** the tendrils lean towards the maw when it inhales */
  tendrilPull = 0;
  /** all parts' pop-in scales (entrance), 0..1 */
  readonly partScale = { tendrils: 1, shell: 1, bell: 1, tail: 1, bloom: 1, eye: 1 };

  constructor(readonly world: THREE.Group) {
    this.mats.push(this.bronzeMat, this.fleshMat, this.petalMat, this.boneMat, this.shellMat, this.darkMat);
    this.root.position.set(0, MASH_Y, MASH_Z);
    this.root.scale.setScalar(MASH_S);
    world.add(this.root, this.shell);
    this.root.add(this.bellG, this.bloom, this.eye);
    this.bloom.position.copy(BLOOM_POS);
    this.eye.position.copy(EYE_POS);
    this.stitches = new StitchSet(this.root, this.stitchMat, 220);
    this.bloomStitches = new StitchSet(this.bloom, this.stitchMat, 60);
    this.shellStitches = new StitchSet(this.spinner, this.stitchMat, 50);
    this.eyeStitches = new StitchSet(this.eye, this.stitchMat, 30);
    this.crackHalo = halo(0xff7a3a, 5, 0.0);
    this.clapperHalo = halo(0xff7ac0, 7, 0.0);
    this.lureHalo = halo(0xff5fb0, 5.5, 0.7);
    this.lureBulb = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), glow(0xff7ac0));
    this.lureLight = new THREE.PointLight(0xff5fb0, 0, 26, 1.3);
    this.eyeHalo = halo(0xff7a30, 5, 0.3);
    this.shellHalo = halo(0xff3a2a, 2.6, 0.7);
    this.buildSmall();
    this.root.visible = false;
    this.shell.visible = false;
  }

  /* ---------------------------------------------------------------- */
  /* the parts that need no meshing                                    */
  /* ---------------------------------------------------------------- */

  private buildSmall() {
    this.buildPetals();
    this.buildFangs();
    this.buildLure();
    this.buildNeck();
    this.buildEye();
    this.buildTendrils();
    this.buildThorns();
    this.buildClapper();
    this.root.add(this.tail.group);
    this.tail.base.copy(TAIL_BASE);
  }

  private buildPetals() {
    const geo = petalGeometry();
    // three layers: a back ring of dark sepals, the big open petals, a corona of pink ones round the lip
    const layers: { n: number; len: number; wid: number; rho: number; z0: number; off: number }[] = [
      { n: 15, len: 3.5, wid: 2.1, rho: 1.9, z0: -1.4, off: 0.2 },
      { n: 14, len: 4.1, wid: 2.25, rho: 2.35, z0: -0.5, off: 0 },
      { n: 11, len: 2.3, wid: 1.45, rho: 2.1, z0: 0.15, off: 0.3 },
    ];
    let total = 0;
    for (const l of layers) total += l.n;
    this.petals = new THREE.InstancedMesh(geo, this.petalMat, total);
    this.petals.frustumCulled = false;
    const tints = [new THREE.Color(0.45, 0.62, 0.75), new THREE.Color(1, 1, 1), new THREE.Color(1.1, 0.78, 0.92)];
    let k = 0;
    layers.forEach((l, li) => {
      for (let i = 0; i < l.n; i++) {
        const a = ((i + l.off) / l.n) * TAU;
        this.petalP.push({ ang: a, len: l.len * (0.88 + 0.24 * rnd(k, 3)), wid: l.wid * (0.9 + 0.2 * rnd(k, 5)), rho: l.rho, z0: l.z0, layer: li, ph: rnd(k, 7) * TAU });
        this.petals.setColorAt(k, tints[li]!.clone().multiplyScalar(rnd(k, 9) < 0.2 ? 0.45 : 0.72 + 0.28 * rnd(k, 11)));
        k++;
      }
    });
    this.bloom.add(this.petals);
  }

  private buildFangs() {
    const rings = [
      { n: 19, r: 2.02, z: 0.6, len: 1.5, wid: 1.55 },
      { n: 15, r: 1.55, z: -0.1, len: 1.2, wid: 1.4 },
      { n: 11, r: 1.1, z: -0.8, len: 1.0, wid: 1.25 },
    ];
    let total = 0;
    for (const r of rings) total += r.n;
    this.fangs = new THREE.InstancedMesh(fangGeometry(), new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: this.fleshMat.gradientMap }), total);
    this.fangs.frustumCulled = false;
    rings.forEach((r, ri) => {
      for (let i = 0; i < r.n; i++) {
        const j = rnd(i + ri * 13, 6);
        this.fangP.push({
          a: ((i + (ri % 2) * 0.5) / r.n) * TAU + (rnd(i + ri * 7, 8) - 0.5) * 0.12,
          ring: ri,
          len: r.len * (j < 0.15 ? 0.4 : 0.65 + 0.7 * rnd(i + ri * 31, 2)),
          wid: r.wid * (0.8 + 0.5 * rnd(i + ri * 17, 4)),
          ph: rnd(i, ri) * TAU,
          jx: (rnd(i + ri * 3, 12) - 0.5) * 0.6,
          jy: (rnd(i + ri * 5, 14) - 0.5) * 0.6,
        });
      }
    });
    this.fangRings = rings;
    this.bloom.add(this.fangs);
  }
  private fangRings: { n: number; r: number; z: number; len: number; wid: number }[] = [];

  private buildLure() {
    // the lure: a thin stalk from deep in the throat, and a glowing bulb at its end
    this.lure = new TubeChain(20, 6, this.fleshMat, (u) => 0.2 - 0.09 * u, (u) => mix(PAL.fleshD, PAL.flesh, u * 0.6));
    outwardTube(this.lure.mesh.geometry);
    this.root.add(this.lure.mesh, this.lureBulb, this.lureHalo);
    // the light lives in the world and is never hidden (only dimmed to nothing), so the number of lights in the scene
    // never changes when the Mash comes and goes: no shader is rebuilt at its entrance
    this.world.add(this.lureLight);
  }

  /** the one light it owns goes out (it stays in the scene) */
  lightsOut() {
    this.lureLight.intensity = 0;
  }

  private buildNeck() {
    this.neck = new TubeChain(
      14,
      12,
      this.fleshMat,
      (u) => 1.75 - 0.45 * Math.sin(u * Math.PI) * 0.4 - 0.2 * u + 0.1 * Math.sin(u * 14),
      (u, a) => {
        let c = mix(PAL.stem, PAL.stemL, 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(a * 3 + u * 9)));
        c = mix(c, PAL.bruise, 0.35 * (0.5 + 0.5 * Math.sin(a * 2 - u * 5)));
        if (Math.sin(u * 40) > 0.9) c = mix(c, PAL.black, 0.4);
        return c;
      },
    );
    outwardTube(this.neck.mesh.geometry);
    this.root.add(this.neck.mesh);
  }

  private buildEye() {
    // the Toll Queen's eye: a veined ball, a violet iris with a slit, a gold ring, a crown of reeds, wings
    const ball = new THREE.SphereGeometry(1.25, 30, 22);
    paint(ball, (x, y, z) => {
      let c = mix(rgb(0xd0c288), rgb(0x9a5040), clamp01(0.4 - z * 0.45));
      const v = fbm(x * 3.2, y * 3.2, z * 3.2, 3, 7);
      if (v > 0.44) c = mix(c, rgb(0xa80e1c), clamp01((v - 0.44) * 6) * 0.95);
      return c;
    });
    const sclera = new THREE.Mesh(ball, skin({ vertexColors: true, rim: 0xb0504a, rimPower: 3.4 }));
    this.eyeBall.add(sclera);
    // the iris is a cap of a slightly bigger sphere, so it hugs the ball
    const iris = new THREE.SphereGeometry(1.275, 28, 8, 0, TAU, 0, 0.68);
    iris.rotateX(Math.PI / 2);
    paint(iris, (x, y, z) => {
      const ang = Math.acos(clamp01(z / 1.275));
      const r = ang / 0.68;
      // a hot amber round the slit, going to rust and then a black ring at the edge
      if (r > 0.86) return rgb(0x160606);
      return mix(rgb(0xffc230), rgb(0x7a1a00), Math.pow(clamp01(r * 1.12), 1.1) + 0.12 * Math.sin(Math.atan2(y, x) * 9));
    });
    const irisM = new THREE.Mesh(iris, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.eyeBall.add(irisM);
    const pupil = new THREE.SphereGeometry(1.285, 14, 6, 0, TAU, 0, 0.36);
    pupil.rotateX(Math.PI / 2);
    pupil.scale(0.26, 1, 1);
    const pupilM = new THREE.Mesh(pupil, new THREE.MeshBasicMaterial({ color: 0x05020a }));
    this.eyeBall.add(pupilM);
    const hl = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hl.position.set(-0.36, 0.36, 1.22);
    hl.lookAt(-0.36 * 2, 0.36 * 2, 3);
    this.eyeBall.add(hl);
    this.eyeBall.add(this.eyeHalo);
    this.eyeHalo.position.z = 1.0;
    this.eye.add(this.eyeBall);
    // the lid, pulled over the top
    const lid = new THREE.Mesh(new THREE.SphereGeometry(1.36, 20, 10, 0, TAU, 0, Math.PI * 0.5), skin({ color: 0x4a2230, rim: 0xe0a05a, rimPower: 3 }));
    lid.rotation.x = -0.5;
    this.eye.add(lid);
    this.eyeLid = lid;
    // reeds on top like a crown
    const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 1, 5).translate(0, 0.5, 0), skin({ color: 0x4fd0b0, rim: 0xb0fff0, rimPower: 3 }), 9);
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 1.5;
      this.o.position.set(Math.sin(a) * 1.0, 1.0 + Math.cos(a) * 0.35, 0.1);
      this.o.rotation.set(0, 0, -a * 0.9);
      const L = 0.9 + 0.7 * rnd(i, 3);
      this.o.scale.set(1, L, 1);
      this.o.updateMatrix();
      reeds.setMatrixAt(i, this.o.matrix);
    }
    reeds.frustumCulled = false;
    this.eye.add(reeds);
    // wings: two fans of feathers
    const N = 12;
    this.feathers = new THREE.InstancedMesh(featherGeometry(), skin({ vertexColors: true, rim: 0x7a5ac0, rimPower: 3, side: THREE.DoubleSide }), N * 2);
    this.feathers.frustumCulled = false;
    for (const side of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        this.featherP.push({ side, phi: -0.12 + u * 1.3, len: (3.0 + 2.6 * Math.sin(u * 2.6 + 0.3) * 0.9 - 0.4 * u) * 0.8, wid: 0.62 + 0.2 * Math.sin(u * 3), ph: rnd(i, side + 3) * TAU });
      }
    }
    this.eye.add(this.feathers);
  }

  private buildTendrils() {
    const n = 18;
    const grp = new THREE.Group();
    this.root.add(grp);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (rnd(i, 1) - 0.5) * 0.25;
      // the ones that lie towards the player stay short: they must not cover the floor where the tongue and the lure land
      const front = Math.sin(a) > 0.25;
      const len = (5.4 + rnd(i, 2) * 4.2) * (front ? 0.42 : 1);
      // thick at the root, a long taper; the vertex colours put faint grooves along it
      const ch = new TubeChain(15, 8, this.darkMat, (u) => 1.0 * Math.pow(1 - u, 0.75) + 0.07, tendrilColor);
      outwardTube(ch.mesh.geometry);
      const base = new THREE.Vector3(Math.cos(a) * 5.3, 0.9, Math.sin(a) * 5.3);
      const dir = new THREE.Vector3(Math.cos(a), 0.4 + rnd(i, 4) * 0.5, Math.sin(a)).normalize();
      this.tendrils.push({ chain: ch, base, dir, ph: rnd(i, 5) * TAU, len });
      grp.add(ch.mesh);
    }
    // a cyan spark on every tip (the Gloommother's eyes)
    this.tendrilTips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 7, 5), new THREE.MeshBasicMaterial({ color: 0x6ff0ff, fog: false }), n);
    this.tendrilTips.frustumCulled = false;
    grp.add(this.tendrilTips);
    this.tendrilGroup = grp;
  }
  private tendrilGroup!: THREE.Group;

  private buildThorns() {
    // big and small thorns on the shell's back, on the spine ridge first
    const items: { dir: THREE.Vector3; len: number; rad: number }[] = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.399963;
      const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
      if (d.y < -0.2 || d.z > 0.7) continue;
      const ridge = Math.exp(-((d.x / 0.3) ** 2));
      const len = (0.9 + 1.5 * rnd(i, 9)) * (0.8 + 0.9 * ridge) * (d.y > 0.5 ? 1.2 : 0.8);
      items.push({ dir: d, len, rad: 0.22 + 0.15 * rnd(i, 11) + 0.1 * ridge });
    }
    this.thorns = new THREE.InstancedMesh(thornGeometry(), this.shellMat, items.length);
    this.thorns.frustumCulled = false;
    items.forEach((it, i) => {
      this.o.position.copy(it.dir).multiplyScalar(SHELL_R * 0.93);
      this.o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), it.dir.clone().add(new THREE.Vector3((rnd(i, 13) - 0.5) * 0.25, 0, (rnd(i, 15) - 0.5) * 0.25)).normalize());
      this.o.scale.set(it.rad, it.len, it.rad);
      this.o.updateMatrix();
      this.thorns.setMatrixAt(i, this.o.matrix);
    });
    this.spinner.add(this.thorns);
    this.shell.add(this.spinner);
    // the King's eyes: one open and glaring, one sewn shut
    const eyeM = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), glow(0xff3a2a));
    eyeM.position.set(-1.2, -0.55, 3.4);
    this.spinner.add(eyeM);
    this.shellFace.push(eyeM);
    this.shellHalo.position.set(-1.2, -0.55, 3.8);
    this.spinner.add(this.shellHalo);
    const shut = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), skin({ color: 0x5a3a4a, rim: 0x9a6aff, rimPower: 3 }));
    shut.position.set(1.2, -0.55, 3.4);
    shut.scale.set(1, 0.45, 0.8);
    this.spinner.add(shut);
  }

  private buildClapper() {
    // a thick braided rope with a heavy, wet tongue on the end; it lives in the bell until the bell cracks
    this.clapperRope = new TubeChain(
      16,
      8,
      this.fleshMat,
      (u) => 0.5 + 0.08 * u,
      (u, a) => {
        const braid = 0.5 + 0.5 * Math.sin(a * 3 + u * 40);
        return mix(mix(rgb(0x6a4a30), rgb(0xc09a64), braid), PAL.fleshD, clamp01(u * 1.6 - 0.8));
      },
    );
    outwardTube(this.clapperRope.mesh.geometry);
    this.bellG.add(this.clapperRope.mesh);
    const tongue = new THREE.SphereGeometry(1, 16, 12);
    const tp = tongue.getAttribute('position');
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i);
      const y = tp.getY(i);
      const z = tp.getZ(i);
      tp.setXYZ(i, x * 1.35, y * 0.95, z * 1.7 + 0.15 * Math.sin(y * 3));
    }
    tongue.computeVertexNormals();
    paint(tongue, (x, y, z) => {
      let c = mix(PAL.flesh, rgb(0xd05070), clamp01(0.5 + z * 0.3));
      const v = fbm(x * 2, y * 2, z * 2, 3, 41);
      c = mix(c, PAL.fleshD, v * 0.5);
      if (Math.abs(x) < 0.08 && z > 0) c = mix(c, PAL.lipDark, 0.7);
      return c;
    });
    this.clapperBulb = new THREE.Mesh(tongue, skin({ vertexColors: true, rim: 0xffb0d0, rimPower: 2.4 }));
    this.bellG.add(this.clapperBulb, this.clapperHalo);
    this.mats.push(this.clapperBulb.material as THREE.MeshToonMaterial);
  }

  /* ---------------------------------------------------------------- */
  /* the heavy meshes                                                  */
  /* ---------------------------------------------------------------- */

  build(slicer: Slicer): Promise<void> {
    const jobs: Promise<void>[] = [];
    const job = <T>(gen: Generator<void, T, void>, done: (v: T) => void) => jobs.push(new Promise<void>((res) => slicer.add(gen, (v) => (done(v), res()))));
    job(buildBell(), (g) => {
      this.bellMesh = new THREE.Mesh(g, this.bronzeMat);
      this.bellG.add(this.bellMesh);
    });
    job(buildBloom(), (g) => {
      this.core = new THREE.Mesh(g, this.fleshMat);
      this.bloom.add(this.core);
    });
    job(buildShell(), (g) => {
      this.spinner.add(new THREE.Mesh(g, this.shellMat));
    });
    return Promise.all(jobs).then(() => this.finish());
  }

  private finish() {
    this.buildSeams();
    this.buildCrackGlow();
    this.ready = true;
    this.dockShell();
    this.tail.snap();
    this.update(0, 0);
  }

  private buildCrackGlow() {
    const pts = crackPoints(-0.02);
    const ch = new TubeChain(pts.length * 3, 5, new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), () => 0.07);
    for (let i = 0; i < ch.pts.length; i++) {
      const f = (i / (ch.pts.length - 1)) * (pts.length - 1);
      const a = pts[Math.min(pts.length - 1, Math.floor(f))]!;
      const b = pts[Math.min(pts.length - 1, Math.floor(f) + 1)]!;
      const t = f - Math.floor(f);
      ch.pts[i]!.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + 0.03);
    }
    ch.update();
    this.crackGlow = ch.mesh;
    this.bellG.add(ch.mesh);
    this.crackHalo.position.set(-1.3, 2.8, 4.5);
    this.bellG.add(this.crackHalo);
  }

  /** the black stitches, along every seam */
  private buildSeams() {
    const S = this.stitches;
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const d = new THREE.Vector3();
    // 1. the collar where the neck is sewn onto the bell's crown
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      p.set(Math.cos(a) * 1.95, 5.98, Math.sin(a) * 1.95);
      d.set(Math.cos(a) * 0.55, 0.85, Math.sin(a) * 0.55);
      S.add(p, d, 1.15, 1.2);
    }
    // 2. stitches across the crack, like a wound sewn shut
    const cr = crackPoints(-0.05);
    for (let i = 0; i < cr.length - 1; i++) {
      for (const f of [0.25, 0.75]) {
        const a = cr[i]!;
        const b = cr[i + 1]!;
        p.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
        const tx = b[0] - a[0];
        const ty = b[1] - a[1];
        const tz = b[2] - a[2];
        // across the crack: perpendicular to its tangent and to the surface normal
        const nrm = new THREE.Vector3(p.x, 0, p.z).normalize();
        d.set(tx, ty, tz).cross(nrm).normalize();
        d.add(new THREE.Vector3(0, 0.0, 0)).normalize();
        S.add(p, d, 1.5, 1.1);
      }
    }
    // 3. the borders of the patches sewn into the bell
    for (const pt of BELL_PATCHES) {
      const steps = (side: 'top' | 'bottom' | 'left' | 'right') => {
        const horiz = side === 'top' || side === 'bottom';
        const n = Math.max(3, Math.round((horiz ? pt.w * 2 * 4.5 : pt.h * 2) / 0.62));
        for (let i = 0; i < n; i++) {
          const f = ((i + 0.5) / n) * 2 - 1;
          const th = horiz ? pt.th + f * pt.w : pt.th + (side === 'left' ? -pt.w : pt.w);
          const y = horiz ? pt.y + (side === 'top' ? pt.h : -pt.h) : pt.y + f * pt.h;
          const r = bellRadius(y) + 0.02;
          p.set(Math.cos(th) * r, y, Math.sin(th) * r);
          const dr = (bellRadius(y + 0.1) - bellRadius(y - 0.1)) / 0.2;
          if (horiz) d.set(Math.cos(th) * dr, 1, Math.sin(th) * dr);
          else d.set(-Math.sin(th), 0, Math.cos(th));
          S.add(p, d, 1.0, 1.0);
        }
      };
      steps('top');
      steps('bottom');
      steps('left');
      steps('right');
    }
    // 4. the shell is stitched to the bell along the line where their surfaces meet: bars across that seam
    {
      const sx = SHELL_DOCK.x;
      const sy = SHELL_DOCK.y;
      const sz = SHELL_DOCK.z;
      const dd = Math.hypot(sx, sz);
      const ux = sx / dd;
      const uz = sz / dd;
      for (let i = 0; i < 15; i++) {
        const y = sy - 2.7 + (i / 14) * 5.4;
        const rb = bellRadius(Math.max(0.3, y));
        const rs2 = SHELL_R * SHELL_R - (y - sy) * (y - sy);
        if (rs2 <= 0.3 || rb <= 0.3) continue;
        const rs = Math.sqrt(rs2);
        if (dd > rb + rs || dd < Math.abs(rb - rs)) continue;
        // where the bell's circle at this height meets the shell's: the one on the player's side is the seam you see
        const a = (rb * rb - rs * rs + dd * dd) / (2 * dd);
        const hh = Math.sqrt(Math.max(0, rb * rb - a * a));
        const ax = ux * a;
        const az = uz * a;
        const q1x = ax - uz * hh;
        const q1z = az + ux * hh;
        const q2x = ax + uz * hh;
        const q2z = az - ux * hh;
        const front = q1z > q2z;
        const px = front ? q1x : q2x;
        const pz = front ? q1z : q2z;
        p.set(px, y, pz);
        d.set(sx - px, 0, sz - pz);
        S.add(p, d, 1.7, 1.15);
      }
    }
    // 5. a ring of stitches where the tail goes into the bell's back
    const tb = TAIL_BASE;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      p.set(tb.x + Math.cos(a) * 1.05, tb.y + 0.4, tb.z - 0.4 + Math.sin(a) * 1.05);
      d.set(Math.cos(a) * 0.35, 0.9, Math.sin(a) * 0.35 - 0.3);
      S.add(p, d, 1.1, 1.0);
    }
    S.finish();
    // the seam round the back of the bloom
    const B = this.bloomStitches;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      p.set(Math.cos(a) * 2.8, Math.sin(a) * 2.8, -2.15);
      d.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -0.8);
      B.add(p, d, 1.2, 1.15);
    }
    B.finish();
    // the eye is stapled to the bell: staples all around the ball and across the base of the wings
    const E = this.eyeStitches;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      p.set(Math.cos(a) * 1.18, Math.sin(a) * 1.18, 0.25);
      d.set(Math.cos(a), Math.sin(a), 0.1);
      E.add(p, d, 0.8, 1.1);
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        p.set(sx * (1.5 + i * 0.1), -0.7 + i * 0.45, -0.2);
        d.set(1, 0.1, 0);
        E.add(p, d, 1.1, 1.0);
      }
    }
    E.finish();
    // the King's mouth and shut eye
    const K = this.shellStitches;
    for (let i = 0; i < 7; i++) {
      const x = -0.9 + (i / 6) * 1.8;
      p.set(x, -2.15, 4.08);
      d.set(0.0, 1, 0.25);
      K.add(p, d, 0.55, 0.95);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      p.set(1.2, -0.55, 3.8);
      d.set(Math.cos(a), Math.sin(a), 0);
      K.add(p, d, 0.9, 0.95);
    }
    // stitches along the plates of the back
    for (let i = 0; i < 14; i++) {
      const phi = 0.2 + (i / 13) * 2.2;
      p.set(Math.sin(phi * 3) * 1.4, Math.cos(phi) * SHELL_R * 0.98, -Math.sin(phi) * SHELL_R * 0.9 + 0.4);
      d.set(1, 0, 0);
      K.add(p, d, 0.8, 0.9);
    }
    K.finish();
    void up;
  }

  /* ---------------------------------------------------------------- */
  /* control                                                           */
  /* ---------------------------------------------------------------- */

  /** the shell sits against the bell's left side, tipped so its back shows and the face peers out from under it */
  dockShell(x = SHELL_DOCK.x, z = SHELL_DOCK.z) {
    const w = this.toWorld(this.tmp.set(x, SHELL_DOCK.y, z));
    this.shell.position.copy(w);
    this.shell.scale.setScalar(MASH_S);
    this.spinner.quaternion.setFromAxisAngle(Y_AXIS, 0.42).multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, 0.22));
  }

  toWorld(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(local).multiplyScalar(MASH_S).add(this.root.position);
  }

  toLocal(world: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(world).sub(this.root.position).multiplyScalar(1 / MASH_S);
  }

  flash(v: number) {
    this.flashT = v;
  }

  /** Look at a world point. */
  lookAt(x: number, y: number, z: number) {
    this.lookT.set(x, y, z);
  }

  /** the bloom, in root space: where the throat is */
  bloomAnchor(out: THREE.Vector3, z = 0) {
    return out.set(0, 0, z).applyMatrix4(this.bloom.matrix);
  }

  setLureFloor(x: number, z: number) {
    this.lureFloor.set(x, 0.8, z);
  }

  /** Where the lure bulb is on the floor (root space) and how far it has dropped (0 hanging in the maw .. 1 on the floor). */
  setLure(out: number, glowAmt: number) {
    this.lureOut = out;
    this.lureGlow = glowAmt;
  }

  /* ---------------------------------------------------------------- */
  /* animation                                                         */
  /* ---------------------------------------------------------------- */

  update(dt: number, t: number) {
    this.time = t;
    if (!this.ready) return;
    const m = this.partScale;
    // ---- the bell
    const tollK = this.toll * Math.sin(t * 38) * 0.02;
    this.bellG.position.set(Math.sin(t * 61) * this.shake * 0.12, this.bellLift * 1.5, Math.cos(t * 47) * this.shake * 0.1);
    this.bellG.rotation.set(-this.bellLift * 0.08, 0, Math.sin(t * 0.45) * 0.01 + tollK * 2);
    this.bellG.scale.setScalar(Math.max(0.0001, m.bell) * (1 + tollK));
    const cg = this.crackGlow.material as THREE.MeshBasicMaterial;
    const cr = Math.max(this.crack, this.dmg * 0.7);
    cg.opacity = clamp01(0.25 + cr * 0.8 + Math.sin(t * 3) * 0.08 * cr);
    this.crackGlow.visible = cr > 0.01;
    this.crackHalo.material.opacity = cr * 0.55;
    this.updateClapper(t);
    // ---- the bloom, neck and lure
    this.updateBloom(t);
    this.updateNeck(t);
    this.updateLure(t);
    // ---- the eye
    this.updateEye(t);
    // ---- the shell (in the world: its owner moves it when it rolls)
    this.shellHalo.material.opacity = 0.5 + 0.3 * Math.sin(t * 5);
    // ---- the tendrils and the tail
    this.updateTendrils(t);
    this.tail.update(dt);
    const tl = Math.max(0.0001, m.tail);
    this.tail.group.scale.setScalar(tl);
    this.tail.group.position.copy(TAIL_BASE).multiplyScalar(1 - tl);
    // flash
    this.flashT = Math.max(0, this.flashT - dt * 5);
    const f = this.flashT;
    for (const mt of this.mats) mt.emissive.setRGB(f, f * 0.9, f * 0.95);
    this.tail.flash(f);
    // the heavy parts' pop-in scale
    const bs = Math.max(0.0001, m.bloom) * (1 + this.roar * 0.1 + 0.015 * Math.sin(t * 1.3));
    this.bloom.scale.set(bs, bs * BLOOM_SQUASH, bs);
    this.eye.scale.setScalar(Math.max(0.0001, m.eye));
    this.shell.scale.setScalar(MASH_S * Math.max(0.0001, m.shell));
    this.tendrilGroup.scale.setScalar(Math.max(0.0001, m.tendrils));
    if (this.deathT >= 0) this.applyDeath(t);
  }

  /* ---------------------------------------------------------------- */
  /* hurt and dying                                                    */
  /* ---------------------------------------------------------------- */

  /** how broken it is, 0..1: more of the crack glows, the stitches start to go, the petals droop */
  setDamage(u: number) {
    this.dmg = u;
    this.stitches.damage(u * 0.5);
    this.bloomStitches.damage(u * 0.4);
    this.eyeStitches.damage(u * 0.4);
  }

  resetDeath() {
    this.deathT = -1;
    this.limp = 0;
    this.dmg = 0;
    this.stitches.reset();
    this.bloomStitches.reset();
    this.eyeStitches.reset();
    this.shellStitches.reset();
    for (const mt of this.mats) mt.emissive.setRGB(0, 0, 0);
    this.tail.tint(0, 0, 0);
    this.partScale.tendrils = this.partScale.shell = this.partScale.bell = this.partScale.tail = this.partScale.bloom = this.partScale.eye = 1;
  }

  /**
   * The death, t seconds in: every stitch tears, the patches come apart and each turns into its own guardian's colour, then
   * fades. Returns nothing; the tail's control is written to `ctrl`.
   */
  setDeath(t: number, ctrl: import('./mash-tail').TailCtrl) {
    this.deathT = t;
    const s = this.partScale;
    const fade = (at: number) => 1 - smooth((t - at) / 0.9);
    s.tendrils = fade(3.5);
    s.shell = fade(3.8);
    s.bell = fade(4.1);
    s.tail = fade(4.4);
    s.bloom = fade(4.7);
    s.eye = fade(4.0);
    this.bloomOpen = clamp01(1 - 1.15 * smooth((t - 0.7) / 2.2)) - 0.25 * smooth((t - 2) / 1.5);
    this.eyeOpen = Math.max(0, 0.45 - (t - 0.5) * 0.4);
    this.roar = Math.max(0, 1 - t * 0.8);
    this.shake = t < 1.2 ? 1.1 : 0;
    this.limp = smooth((t - 0.9) / 1.8);
    this.crack = 1;
    P.deadPose(t, ctrl);
  }

  private applyDeath(t: number) {
    // stitches tear one by one
    const ts = Math.max(0, t - 0.9);
    this.stitches.tear(ts);
    this.bloomStitches.tear(ts);
    this.eyeStitches.tear(ts);
    this.shellStitches.tear(ts);
    // the patches come apart
    const sb = smooth((t - 1.4) / 2.6);
    this.bellG.position.y -= 2.4 * sb;
    this.bellG.position.x += 0.9 * sb;
    this.bellG.rotation.z += 0.3 * sb;
    const sw = smooth((t - 1.0) / 2.4);
    this.bloom.position.y -= 3.4 * sw;
    this.bloom.position.z += 2.2 * sw;
    this.bloom.rotation.x += 0.9 * sw;
    this.bloom.rotation.z += 0.25 * sw;
    this.eye.position.y += 2.8 * smooth((t - 1.2) / 2.8);
    this.eye.position.x += 1.2 * smooth((t - 1.2) / 2.8);
    const ss = smooth((t - 1.0) / 2.6);
    this.shell.position.x -= 6.5 * ss;
    this.spinner.rotateZ(1.4 * ss * Math.min(1, (t - 1.0)));
    // each patch turns into the colour of the guardian it was
    const k = 0.62 * smooth((t - 1.2) / 1.8);
    const tint = (m: THREE.MeshToonMaterial, r: number, g: number, b: number) => m.emissive.setRGB(r * k, g * k, b * k);
    tint(this.bronzeMat, 0.8, 0.62, 1.0);
    tint(this.shellMat, 1.0, 0.62, 0.22);
    tint(this.fleshMat, 1.0, 0.42, 0.6);
    tint(this.petalMat, 1.0, 0.42, 0.62);
    tint(this.boneMat, 0.96, 0.94, 0.86);
    tint(this.darkMat, 0.2, 0.8, 0.95);
    this.tail.tint(0.96 * k, 0.94 * k, 0.86 * k);
  }

  private updateClapper(t: number) {
    // the clapper hangs in the bell; when it drops it slides out under the rim and lies on the floor in front
    const e = this.clapperExtVal;
    const rope = this.clapperRope;
    const n = rope.pts.length;
    const A = this.o.position.set(0, 4.7, 0.2);
    const mid = this.tmp.set(0, 0.5, 2.2);
    const tip = this.clapperTip;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      // inside the bell: straight down; out of the mouth: along the floor to the tip
      const split = 0.36;
      const p = rope.pts[i]!;
      if (u < split) {
        const k = u / split;
        p.set(A.x + (mid.x - A.x) * k, A.y + (mid.y - A.y) * k, A.z + (mid.z - A.z) * k);
      } else {
        const k = (u - split) / (1 - split);
        const ex = mid.x + (tip.x - mid.x) * Math.min(1, k * e + (e < 1 ? 0 : 0));
        const ez = mid.z + (tip.z - mid.z) * Math.min(1, k * e);
        const wob = Math.sin(t * 6 + k * 9) * 0.35 * Math.sin(k * Math.PI) * e;
        p.set(ex + wob, 0.55 + 0.7 * Math.sin(k * Math.PI) * (1 - e) , ez);
      }
    }
    rope.update();
    const end = rope.pts[n - 1]!;
    this.clapperBulb.position.copy(end).add(this.tmp.set(0, 0.35, 0.5 * e));
    this.clapperBulb.scale.setScalar(Math.max(0.001, 0.9 * (0.35 + 0.65 * e)));
    this.clapperBulb.rotation.y = Math.sin(t * 2) * 0.1;
    rope.mesh.visible = e > 0.02;
    this.clapperBulb.visible = e > 0.02;
    this.clapperHalo.position.copy(this.clapperBulb.position);
    this.clapperHalo.material.opacity = e > 0.9 ? 0.45 + 0.25 * Math.sin(t * 6) : 0;
  }

  private clapperExt() {
    return this.clapperExtVal;
  }
  private clapperExtVal = 0;
  setClapper(e: number, x = 0, z = 9.5) {
    this.clapperExtVal = e;
    this.clapperTip.set(x, 0.6, z);
  }

  private updateBloom(t: number) {
    const b = this.bloom;
    // lean forward and down when it breathes in, tilt up when it roars
    const roar = this.roar;
    b.position.set(BLOOM_POS.x + Math.sin(t * 0.6) * 0.12, BLOOM_POS.y - this.lean * 1.3 + 0.12 * Math.sin(t * 1.1) + roar * 0.4, BLOOM_POS.z + this.lean * 3.4 - roar * 0.8);
    b.rotation.set(BLOOM_TILT + this.lean * 0.55 - roar * 0.28 + Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.43) * 0.06, Math.sin(t * 0.8) * 0.03);
    b.updateMatrix();
    // petals
    const open = this.bloomOpen;
    const inh = this.inhale;
    const { m4, m5, m6, m7, o } = this;
    const mm = this.petalP;
    for (let i = 0; i < mm.length; i++) {
      const p = mm[i]!;
      const lo = p.layer === 0 ? 0.95 : p.layer === 1 ? 0.55 : 0.25;
      const beta0 = (p.layer === 0 ? -0.55 : p.layer === 1 ? -0.02 : 0.62) + (1 - open) * (p.layer === 2 ? 0.3 : 0.9);
      const flutter = Math.sin(t * 1.7 + p.ph) * 0.045 + roar * (Math.sin(t * 33 + p.ph) * 0.1 - 0.35);
      const beta = beta0 + inh * (p.layer === 2 ? 0.5 : 0.62) + flutter;
      const len = p.len * (1 + roar * 0.08 + (1 - open) * -0.05);
      m4.makeRotationZ(p.ang);
      m5.makeTranslation(0, p.rho, p.z0);
      m6.makeRotationX(beta);
      m7.makeScale(p.wid, len, 1);
      m4.multiply(m5).multiply(m6).multiply(m7);
      this.petals.setMatrixAt(i, m4);
      void lo;
    }
    this.petals.instanceMatrix.needsUpdate = true;
    // fangs
    const mo = this.mawOpen;
    const q = this.q;
    const dir = this.tmp;
    for (let i = 0; i < this.fangP.length; i++) {
      const f = this.fangP[i]!;
      const r = this.fangRings[f.ring]!;
      const rad = r.r * (0.85 + 0.3 * mo) * (1 - inh * 0.06);
      const ca = Math.cos(f.a);
      const sa = Math.sin(f.a);
      dir.set(-ca * (0.85 + 0.2 * (1 - mo)) + f.jx, -sa * (0.85 + 0.2 * (1 - mo)) + f.jy, 0.55 + 0.25 * f.ring - 0.3 * mo).normalize();
      q.setFromUnitVectors(Y_AXIS, dir);
      o.position.set(ca * rad, sa * rad, r.z);
      o.quaternion.copy(q);
      const len = f.len * (0.9 + 0.2 * mo + roar * 0.2 + 0.06 * Math.sin(t * 2 + f.ph));
      o.scale.set(f.wid, len, f.wid);
      o.updateMatrix();
      this.fangs.setMatrixAt(i, o.matrix);
    }
    this.fangs.instanceMatrix.needsUpdate = true;
  }

  private updateNeck(t: number) {
    // from deep in the bell's crown to the back of the bloom
    const a = this.tmp;
    this.bloomAnchor(a, -2.6);
    const n = this.neck.pts.length;
    const p0 = this.o.position.set(0, 4.4, 0.3);
    const p1x = 0;
    const p1y = 6.6;
    const p1z = 0.2 + this.lean * 1.2;
    const p2y = a.y - 1.6;
    const p2z = a.z - 2.0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const w0 = (1 - u) ** 3;
      const w1 = 3 * u * (1 - u) ** 2;
      const w2 = 3 * u * u * (1 - u);
      const w3 = u ** 3;
      const x = w0 * p0.x + w1 * p1x + w2 * a.x + w3 * a.x;
      const y = w0 * p0.y + w1 * p1y + w2 * p2y + w3 * a.y;
      const z = w0 * p0.z + w1 * p1z + w2 * p2z + w3 * a.z;
      this.neck.pts[i]!.set(x + Math.sin(t * 1.1 + u * 4) * 0.12 * Math.sin(u * Math.PI), y, z);
    }
    this.neck.update();
    this.neck.mesh.scale.setScalar(1);
    this.neck.mesh.visible = this.partScale.bloom > 0.05;
  }

  private updateLure(t: number) {
    // the lure hangs from deep in the throat; when `lureOut` is 1 it has dropped to the floor in front
    const a = this.bloomAnchor(this.tmp, -2.3);
    const anchor = this.o.position.copy(a);
    const out = this.lureOut;
    const n = this.lure.pts.length;
    const hang = new THREE.Vector3();
    // resting: curls out of the throat and dangles in the maw
    this.bloomAnchor(hang, 0.4);
    hang.y -= 0.35 + 0.15 * Math.sin(t * 1.6);
    hang.x += Math.sin(t * 1.1) * 0.35;
    const floor = this.lureFloor;
    const tip = hang.clone();
    // the drop: out of the mouth, falling in an arc to the floor
    const e = out * out * (3 - 2 * out);
    tip.lerp(floor, e);
    tip.y += Math.sin(Math.PI * Math.min(1, out)) * 2.6 * (1 - out * 0.3);
    const D = anchor.distanceTo(tip);
    const slack = Math.max(0, 22 - D);
    const sag = Math.min(7, 0.5 * Math.sqrt(slack * 14)) * (0.3 + 0.7 * out);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const p = this.lure.pts[i]!;
      p.lerpVectors(anchor, tip, u);
      p.y -= sag * 4 * u * (1 - u);
      p.x += Math.sin(t * 2.2 + u * 5) * 0.18 * Math.sin(u * Math.PI);
      if (p.y < 0.3) p.y = 0.3 + 0.2 * Math.sin(u * 20);
    }
    this.lure.update();
    this.lureTip.copy(this.lure.pts[n - 1]!);
    this.lureBulb.position.copy(this.lureTip);
    const g = this.lureGlow;
    const pulse = 1 + 0.14 * Math.sin(t * 7) * g;
    this.lureBulb.scale.setScalar((0.55 + 0.4 * g) * pulse * (1 + out * 0.6));
    (this.lureBulb.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.35 + 0.25 * g, 0.65 + 0.15 * g);
    this.lureHalo.position.copy(this.lureTip);
    this.lureHalo.material.opacity = 0.2 + 0.5 * g;
    this.lureHalo.scale.setScalar((2.4 + 3.6 * g) * (1 + out * 0.5));
    this.toWorld(this.lureTip, this.lureLight.position);
    this.lureLight.intensity = this.root.visible && this.partScale.bloom > 0.05 ? 2 + 28 * g * (0.18 + 0.82 * out) : 0;
    this.lure.mesh.visible = this.partScale.bloom > 0.05;
    this.lureBulb.visible = this.lure.mesh.visible;
    this.lureHalo.visible = this.lure.mesh.visible;
  }

  private updateEye(t: number) {
    const eye = this.eye;
    eye.position.set(EYE_POS.x, EYE_POS.y + Math.sin(t * 0.9) * 0.22, EYE_POS.z + Math.sin(t * 0.7 + 1) * 0.12);
    eye.updateMatrixWorld(true);
    // the iris follows the target, within a cone
    const wp = this.tmp.setFromMatrixPosition(eye.matrixWorld);
    const dir = new THREE.Vector3().copy(this.lookT).sub(wp).normalize();
    dir.z = Math.max(dir.z, 0.35);
    dir.normalize();
    this.eyeBall.quaternion.setFromUnitVectors(Z_AXIS, dir);
    // the lid
    const open = this.eyeOpen;
    this.eyeLid.rotation.x = -0.45 - (1 - open) * 1.0;
    const blink = Math.sin(t * 0.7) > 0.992 || (t + 1.3) % 5.1 < 0.1;
    if (blink) this.eyeLid.rotation.x = -1.35;
    this.eyeHalo.material.opacity = 0.1 + 0.32 * open;
    // wings fan
    const { m4, m5, m6 } = this;
    for (let i = 0; i < this.featherP.length; i++) {
      const f = this.featherP[i]!;
      const flap = Math.sin(t * 1.5 + f.ph * 0.2 + i * 0.12) * 0.05 + (open - 0.3) * 0.28;
      const ang = f.side > 0 ? f.phi + flap : Math.PI - (f.phi + flap);
      m4.makeRotationZ(ang - Math.PI / 2);
      m5.makeTranslation(0, 0.9, 0);
      m6.makeScale(f.wid, f.len, 1);
      // the root of each feather sits at the side of the eye
      this.o.position.set(f.side * 1.15, -0.1 + f.phi * 0.2, -0.15);
      this.o.updateMatrix();
      m4.premultiply(this.o.matrix);
      m4.multiply(m6);
      this.feathers.setMatrixAt(i, m4);
      void m5;
    }
    this.feathers.instanceMatrix.needsUpdate = true;
  }

  private updateTendrils(t: number) {
    const pull = this.tendrilPull;
    const reach = this.tendrilReach;
    for (const td of this.tendrils) {
      const n = td.chain.pts.length;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const sway = 1.1 + 0.5 * reach;
        // a slow heave along the whole length, and a quicker ripple running out to the tip: they writhe
        const rip = Math.sin(t * 2.7 + td.ph * 2 - u * 8) * 0.55 * u;
        let x = td.base.x + td.dir.x * u * td.len + Math.sin(t * 1.3 + td.ph + u * 3.4) * sway * u + rip * td.dir.z;
        let y = td.base.y + td.dir.y * u * td.len * 0.9 - u * u * td.len * 0.42 + Math.sin(t * 0.9 + td.ph * 1.3 + u * 2.6) * 0.9 * u + Math.abs(rip) * 0.4;
        let z = td.base.z + td.dir.z * u * td.len + Math.cos(t * 1.1 + td.ph) * sway * u - rip * td.dir.x;
        // breathing in: they stream towards the maw
        if (pull > 0) {
          x = lerp(x, x * (1 - 0.5 * u * pull), 1);
          z = lerp(z, z - u * u * 4.5 * pull * (td.dir.z > -0.2 ? 1 : 0.2), 1);
          y += u * 1.8 * pull;
        }
        // or they reach for something
        if (reach > 0 && td.dir.z > -0.3) {
          const k = reach * u * u;
          x = lerp(x, this.tendrilTarget.x, k * 0.8);
          y = lerp(y, this.tendrilTarget.y, k * 0.8);
          z = lerp(z, this.tendrilTarget.z, k * 0.8);
        }
        if (this.limp > 0) {
          // dead: they slump on the floor
          y = lerp(y, 0.2 + 0.5 * Math.sin(u * 9 + td.ph) * (1 - u), this.limp);
          x += Math.sin(u * 5 + td.ph) * 0.8 * this.limp * u;
        }
        // the thick root lies on the floor
        const floor = 0.2 + 0.8 * Math.pow(1 - u, 0.75);
        if (y < floor) y = floor;
        td.chain.pts[i]!.set(x, y, z);
      }
      td.chain.update();
    }
    for (let i = 0; i < this.tendrils.length; i++) {
      const td = this.tendrils[i]!;
      const tip = td.chain.pts[td.chain.pts.length - 1]!;
      this.o.position.copy(tip);
      this.o.scale.setScalar(0.8 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + i)));
      this.o.rotation.set(0, 0, 0);
      this.o.updateMatrix();
      this.tendrilTips.setMatrixAt(i, this.o.matrix);
    }
    this.tendrilTips.instanceMatrix.needsUpdate = true;
  }

  /** every Object3D this model put in the world */
  parts(): THREE.Object3D[] {
    return [this.root, this.shell, this.lureLight];
  }
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/* ---------------------------------------------------------------- */
/* the lab                                                           */
/* ---------------------------------------------------------------- */

export async function labMash(slicer: Slicer, world: THREE.Group) {
  const m = new MashModel(world);
  m.root.visible = true;
  m.shell.visible = true;
  await m.build(slicer);
  // a scripted tail for the lab: `play` starts a timeline, `step` in the spec advances it
  let anim = 0;
  let at = 0;
  let manual: ((tt: number) => void) | null = null;
  const tgtW = new THREE.Vector3(-3, 0, 6);
  const tgt = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const labA = P.newCtrl();
  const labB = P.newCtrl();
  const api = {
    update: (dt: number, tt: number) => {
      at += dt;
      m.toLocal(tgtW, tgt);
      const c = m.tail.ctrl;
      if (manual) manual(tt);
      else if (anim === 1) {
        // sting: rear 0.9, strike 0.2, stuck 1.4, retract 1.2
        if (at < 0.9) P.rearPose(at / 0.9, tt, tgt, c);
        else if (at < 1.1) P.strikePose((at - 0.9) / 0.2, tt, tgt, c);
        else if (at < 2.5) P.stuckPose(at - 1.1, tt, tgt, c);
        else if (at < 3.7) P.retractPose((at - 2.5) / 1.2, tt, tgt, c);
        else P.idlePose(tt, c);
      } else if (anim === 2) {
        // sweep: 0.8 s of warning (rear), then 1.3 s lash from -0.65 to +0.65 rad round the pivot
        m.toLocal(pivot.set(0, 0, MASH_Z), pivot);
        const rin = 13 / MASH_S;
        const rt = 38 / MASH_S;
        if (at < 0.8) P.rearPose(at / 0.8, tt, tgt.set(Math.sin(-0.65) * 20, 0, pivot.z + Math.cos(-0.65) * 20), c);
        else if (at < 2.1) {
          const th = -0.65 + 1.3 * Math.pow((at - 0.8) / 1.3, 1.15);
          P.sweepPose(th, rin, rt, pivot, c);
          const bl = Math.min(1, (at - 0.8) / 0.22);
          if (bl < 1) {
            P.rearPose(1, tt, tgt.set(Math.sin(-0.65) * 20, 0, pivot.z + Math.cos(-0.65) * 20), labA);
            P.mixCtrl(c, labA, c, bl * bl * (3 - 2 * bl));
          }
        } else if (at < 3.2) {
          P.sweepPose(0.65, rin, rt, pivot, labA);
          P.idlePose(tt, labB);
          const u = (at - 2.1) / 1.1;
          P.mixCtrl(c, labA, labB, u * u * (3 - 2 * u));
        } else P.idlePose(tt, c);
      } else if (anim === 3) {
        const kick = at > 1.2 ? Math.max(0, 1 - ((at - 1.2) % 0.5) * 4) : 0;
        P.spitPose(Math.min(1, at / 0.9), tt, tgt, kick, c);
      } else if (anim === 4) {
        P.recoilPose(at / 1.6, tt, c);
      } else P.idlePose(tt, c);
      m.update(dt, tt);
    },
    pose(name: string, v = 1) {
      if (name === 'crack') m.crack = v;
      else if (name === 'bloom') m.bloomOpen = v;
      else if (name === 'inhale') m.inhale = v;
      else if (name === 'roar') m.roar = v;
      else if (name === 'lean') m.lean = v;
      else if (name === 'maw') m.mawOpen = v;
      else if (name === 'eye') m.eyeOpen = v;
      else if (name === 'clapper') m.setClapper(v, 0, 9.5);
      else if (name === 'lure') m.setLure(v, 1);
      else if (name === 'toll') m.toll = v;
      else if (name === 'play') {
        anim = v;
        at = 0;
        manual = null;
        if (v === 0) m.tail.snap();
      } else if (name === 'targetx') tgtW.x = v;
      else if (name === 'targetz') tgtW.z = v;
      else if (name === 'shell') m.dockShell();
      else if (name === 'snap') m.tail.snap();
    },
  };
  return api;
}
