import * as THREE from 'three';

/**
 * The family in 3D: soft jelly domes that glow from inside. Warm in the middle, going amber lower down, with a rose rim where the
 * surface turns away from you, a wet shine on top, and two big dark glassy eyes with a sparkle in each. No mouth, no limbs: a jelly
 * says everything by how it squashes.
 *
 * The Blob, Mother and Father are all made here, only the size, the colour and one detail differ (Mother's bow, Father's brow).
 */

export interface JellyLook {
  /** width of the dome (its height is about two thirds of this) */
  size: number;
  /** the warm middle, the lower amber, the rim */
  core: number;
  low: number;
  rim: number;
  /** how much it glows from inside */
  glow?: number;
  bow?: boolean;
  brow?: boolean;
}

export interface JellyRig {
  g: THREE.Group;
  /** squash and stretch this: the dome, its eyes and whatever it wears (its origin is on the floor) */
  body: THREE.Group;
  eyes: THREE.Group[];
  mat: THREE.MeshStandardMaterial;
  /** the height of the top of the dome, at rest */
  height: number;
  /** a point in the middle of the forehead, and the way the skin faces there (for a third eye) */
  forehead: { p: THREE.Vector3; n: THREE.Vector3 };
  /** the springs that make it slosh */
  wob: Wobble;
  /** the skin's ripple: how strong, and its clock */
  wave: { uWave: { value: number }; uT: { value: number } };
}

let domeGeo: THREE.BufferGeometry | null = null;
/** a unit dome: a sphere with the bottom pressed flat and the base spread out a little (1 wide, 0.68 tall, 0.82 deep) */
function dome(): THREE.BufferGeometry {
  if (domeGeo) return domeGeo;
  const g = new THREE.SphereGeometry(0.5, 48, 32);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const y = v.y / 0.5; // -1..1
    let ny: number;
    let spread: number;
    if (y >= 0) {
      ny = y * 0.6;
      // the sides bulge out towards the base, like jelly settling
      spread = 1 + 0.1 * (1 - y) * (1 - y);
    } else {
      // the underside is almost flat, with a soft rounded edge
      ny = y * 0.1;
      spread = 1.1 - 0.05 * y * y;
    }
    p.setXYZ(i, v.x * 2 * spread * 0.5, (ny + 0.1) * 0.68 / 0.7, v.z * 2 * spread * 0.41);
  }
  g.computeVertexNormals();
  domeGeo = g;
  return g;
}

/** the jelly's skin: lit like a wet surface, but glowing from inside, warm in the middle and rose at the edge */
function jellyMaterial(look: JellyLook, wave: JellyRig['wave']): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: look.core, roughness: 0.16, metalness: 0, emissive: 0x000000 });
  const u = {
    uCore: { value: new THREE.Color(look.core) },
    uLow: { value: new THREE.Color(look.low) },
    uRim: { value: new THREE.Color(look.rim) },
    uGlow: { value: look.glow ?? 0.85 },
    ...wave,
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vJy;\nuniform float uWave;\nuniform float uT;')
      // ripples run up the skin, strongest at the top, none where it sits on the floor
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvJy = position.y;\ntransformed += normal * uWave * sin(position.y * 24.0 - uT * 15.0 + position.x * 6.0) * smoothstep(0.02, 0.4, position.y);',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCore;\nuniform vec3 uLow;\nuniform vec3 uRim;\nuniform float uGlow;\nvarying float vJy;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float jFr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
        vec3 jIn = mix(uLow, uCore, smoothstep(0.0, 0.62, vJy));
        totalEmissiveRadiance += (jIn * (1.0 - jFr * 0.7) + uRim * jFr * 0.9) * uGlow;`,
      );
  };
  m.customProgramCacheKey = () => 'jelly';
  return m;
}

const eyeMat = new THREE.MeshStandardMaterial({ color: 0x4a0f18, roughness: 0.08, metalness: 0, emissive: 0x2a0408 });
const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
const gloss = new THREE.MeshBasicMaterial({ color: 0xfff8ec, transparent: true, opacity: 0.55, depthWrite: false });
const sphere = new THREE.SphereGeometry(0.5, 20, 14);

export function makeJelly(look: JellyLook): JellyRig {
  const S = look.size;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const wave = { uWave: { value: 0 }, uT: { value: 0 } };
  const mat = jellyMaterial(look, wave);
  const skin = new THREE.Mesh(dome(), mat);
  skin.scale.setScalar(S);
  body.add(skin);
  skin.updateMatrixWorld(true);
  // find a point on the surface, from the front (or from above)
  const ray = new THREE.Raycaster();
  const onSkin = (x: number, y: number, fromTop = false) => {
    if (fromTop) ray.set(new THREE.Vector3(x, 10, y), new THREE.Vector3(0, -1, 0));
    else ray.set(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(skin)[0];
    return hit ? { p: hit.point, n: hit.face!.normal.clone() } : { p: new THREE.Vector3(x, y, 0.4 * S), n: new THREE.Vector3(0, 0, 1) };
  };
  const height = onSkin(0, 0, true).p.y;
  // the eyes: tall dark ovals, a little apart, set into the front, each with two sparkles
  const eyes: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const { p, n } = onSkin(sx * 0.17 * S, height * 0.55);
    const eg = new THREE.Group();
    eg.position.copy(p);
    eg.lookAt(p.clone().add(n));
    const ball = new THREE.Mesh(sphere, eyeMat);
    ball.scale.set(0.15 * S, 0.21 * S, 0.06 * S);
    eg.add(ball);
    const s1 = new THREE.Mesh(sphere, shine);
    s1.scale.set(0.05 * S, 0.055 * S, 0.02 * S);
    s1.position.set(0.025 * S, 0.045 * S, 0.026 * S);
    const s2 = new THREE.Mesh(sphere, shine);
    s2.scale.setScalar(0.018 * S);
    s2.position.set(0.012 * S, -0.03 * S, 0.028 * S);
    eg.add(s1, s2);
    body.add(eg);
    eyes.push(eg);
  }
  // the wet shine: a long soft streak over the top-left and a couple of smaller ones on the right
  const streaks: [number, number, number, number, number][] = [
    [-0.24, 0.8, 0.2, 0.05, 0.5],
    [0.27, 0.78, 0.08, 0.035, -0.4],
    [0.36, 0.55, 0.05, 0.03, -0.9],
  ];
  for (const [x, yk, w, h, rot] of streaks) {
    const { p, n } = onSkin(x * S, height * yk);
    const m = new THREE.Mesh(sphere, gloss);
    m.position.copy(p).addScaledVector(n, 0.004 * S);
    m.lookAt(p.clone().add(n));
    m.rotateZ(rot);
    m.scale.set(w * S, h * S, 0.006 * S);
    body.add(m);
  }
  if (look.bow) {
    // Mother's bow: two soft pink loops and a knot, on the top, a little to one side
    const bowMat = new THREE.MeshStandardMaterial({ color: 0xff7fb0, roughness: 0.25, emissive: 0x6a1838 });
    const { p } = onSkin(0.16 * S, 0, true);
    const bow = new THREE.Group();
    bow.position.copy(p).add(new THREE.Vector3(0, -0.02 * S, 0));
    bow.rotation.z = -0.35;
    for (const sx of [-1, 1]) {
      const loop = new THREE.Mesh(sphere, bowMat);
      loop.scale.set(0.16 * S, 0.11 * S, 0.07 * S);
      loop.position.x = sx * 0.075 * S;
      loop.rotation.z = sx * 0.35;
      bow.add(loop);
    }
    const knot = new THREE.Mesh(sphere, bowMat);
    knot.scale.setScalar(0.06 * S);
    bow.add(knot);
    body.add(bow);
  }
  if (look.brow) {
    // Father's brow: two thick dark strokes over the eyes, worried at the middle
    const browMat = new THREE.MeshStandardMaterial({ color: 0x5a1e10, roughness: 0.4 });
    for (const sx of [-1, 1]) {
      const { p, n } = onSkin(sx * 0.17 * S, height * 0.83);
      const b = new THREE.Mesh(sphere, browMat);
      b.position.copy(p);
      b.lookAt(p.clone().add(n));
      b.rotateZ(sx * -0.28);
      b.scale.set(0.14 * S, 0.035 * S, 0.03 * S);
      body.add(b);
    }
  }
  body.matrixAutoUpdate = false;
  return { g, body, eyes, mat, height, forehead: onSkin(0, height * 0.86), wob: new Wobble(), wave };
}

/**
 * The slosh of a jelly: three springs. `sq` is how much taller (+) or flatter (-) than at rest it is; `lx`/`lz` is how far its
 * top leans (a shear: the bottom stays on the floor, the top swings), in its own frame. Moving pushes the springs: when it starts,
 * its top is left behind; when it stops, the top runs on and sloshes back. A kick (a landing, a dash, a hit) sets them ringing.
 */
export class Wobble {
  sq = 0;
  private sqV = 0;
  lx = 0;
  private lxV = 0;
  lz = 0;
  private lzV = 0;
  /** how hard it is ringing right now (for the ripples) */
  energy = 0;
  private px = NaN;
  private pz = NaN;
  private vx = 0;
  private vz = 0;
  private wasDown = true;
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();

  /** set the springs ringing: `sq` < 0 splats it, > 0 stretches it up; `lx`/`lz` throw its top sideways / forwards */
  kick(sq: number, lx = 0, lz = 0) {
    this.sqV += sq;
    this.lxV += lx;
    this.lzV += lz;
  }

  /** forget where it was (after a teleport, a respawn) */
  reset() {
    this.px = NaN;
    this.sq = this.sqV = this.lx = this.lxV = this.lz = this.lzV = 0;
    this.vx = this.vz = 0;
  }

  /** follow it through the world: its acceleration pushes the top the other way. `g` is the object that turns with it. */
  step(dt: number, g: THREE.Object3D) {
    if (dt <= 0) return;
    g.getWorldPosition(this.v);
    const x = this.v.x;
    const z = this.v.z;
    if (Number.isNaN(this.px)) {
      this.px = x;
      this.pz = z;
    }
    let vx = (x - this.px) / dt;
    let vz = (z - this.pz) / dt;
    this.px = x;
    this.pz = z;
    // a jump across the floor is a teleport, not a dash
    if (Math.hypot(vx, vz) > 45) {
      vx = this.vx;
      vz = this.vz;
    }
    let ax = clampN((vx - this.vx) / dt, 260);
    let az = clampN((vz - this.vz) / dt, 260);
    this.vx = vx;
    this.vz = vz;
    // into its own frame
    g.getWorldQuaternion(this.q).invert();
    this.v.set(ax, 0, az).applyQuaternion(this.q);
    ax = this.v.x;
    az = this.v.z;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      // squash: stiff and bouncy; lean: softer, sloshier
      this.sqV += (-170 * this.sq - 6.5 * this.sqV) * h;
      this.sq += this.sqV * h;
      this.lxV += (-105 * this.lx - 5.2 * this.lxV - ax * 0.32) * h;
      this.lzV += (-105 * this.lz - 5.2 * this.lzV - az * 0.32) * h;
      this.lx += this.lxV * h;
      this.lz += this.lzV * h;
    }
    this.lx = clampN(this.lx, 0.55);
    this.lz = clampN(this.lz, 0.55);
    this.sq = Math.max(-0.45, Math.min(0.6, this.sq));
    this.energy = Math.min(1, Math.abs(this.sqV) * 0.12 + Math.hypot(this.lxV, this.lzV) * 0.1);
  }

  /** a hop has landed (`down` true when the hop is at the floor) */
  stepHop(down: boolean, w: number) {
    if (down && !this.wasDown && w > 0.2) this.kick(-2.6 * w, 0, -0.8 * w);
    if (!down && this.wasDown && w > 0.2) this.kick(1.4 * w);
    this.wasDown = down;
  }
}

function clampN(v: number, m: number) {
  return v > m ? m : v < -m ? -m : v;
}

const shear = new THREE.Matrix4();

/**
 * How a jelly moves. `walk` 0..1 is a hop-and-splat: it moves in little bounces, stretching as it leaves the floor and splatting
 * as it lands. `lift` stretches it up (a reach, a hug, a look up), `hop` is a bounce of joy on the spot, `lean` tips its top forward
 * (a strike). Breathing, blinking and the slosh go on underneath.
 */
export function animateJelly(r: JellyRig, dt: number, time: number, walk: number, phase: number, lift: number, hop: number, seed: number, lean = 0) {
  const w = Math.min(1, walk);
  const wob = r.wob;
  wob.step(dt, r.g);
  // the hops: up and down twice a stride
  const s = Math.sin(phase);
  const up = Math.abs(s);
  wob.stepHop(up < 0.25, w);
  const jump = hop * Math.abs(Math.sin(time * 7 + seed));
  const breath = Math.sin(time * 2.3 + seed) * 0.035 * (1 - w);
  // stretched in the air, flat on the floor, plus whatever the springs are doing
  let sy = 1 + (up - 0.35) * 0.2 * w + breath + lift * 0.16 + (jump - 0.35) * 0.22 * hop + wob.sq;
  sy = Math.max(0.55, Math.min(1.7, sy));
  // the same jelly, so what it loses in height it gains in width (and a little more as it splats)
  const sxz = 1 / Math.sqrt(sy) + Math.max(0, 1 - sy) * 0.18;
  const y = up * 0.26 * w + jump * 0.4;
  const lx = wob.lx + Math.sin(phase * 0.5) * 0.06 * w;
  const lz = wob.lz + 0.08 * w - lift * 0.05 + lean;
  // scale, then shear (the top moves, the bottom stays), then lift
  shear.set(sxz, lx * sy, 0, 0, 0, sy, 0, y, 0, lz * sy, sxz, 0, 0, 0, 0, 1);
  r.body.matrix.copy(shear);
  r.body.matrixWorldNeedsUpdate = true;
  // the skin ripples while it is sloshing
  r.wave.uT.value = time;
  r.wave.uWave.value = 0.004 + 0.016 * wob.energy + 0.006 * w;
  const blink = Math.sin(time * 1.1 + seed) > 0.985 || (time + seed) % 3.7 < 0.09;
  r.eyes.forEach((e) => (e.scale.y = blink ? 0.12 : 1));
}

/** the Blob: the colours of the reference jelly, honey in the middle and rose at the rim */
export const BLOB_LOOK: JellyLook = { size: 1.75, core: 0xffd860, low: 0xff9a2e, rim: 0xff4a6a, glow: 0.9 };
export const MOTHER_LOOK: JellyLook = { size: 2.2, core: 0xffb48c, low: 0xf07468, rim: 0xff4f8f, glow: 0.62, bow: true };
export const FATHER_LOOK: JellyLook = { size: 2.4, core: 0xffb24a, low: 0xe06a1e, rim: 0xd8402a, glow: 0.68, brow: true };
