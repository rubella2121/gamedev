import * as THREE from 'three';
import type { SkinId } from '../core/blobskins';
import { BLOB_LOOK, dome, shapeDome, type JellyRig } from './jelly';

/**
 * The Blob's skins in 3D (the 2D ones are in core/blobskins.ts). Whatever covers the head (a helmet, a cap, a cape) is cut out of
 * the jelly's own dome and pushed out a little, so it fits it exactly and squashes, leans and wobbles with it; the rest (goggles,
 * a hat, horns, a crown, flames) is placed on its surface. Inferno and Golden change the jelly's colours as well.
 *
 * Units: the dome is 1 wide and 0.68 tall before it is scaled to the Blob's size S; `f` is a height on it, 0 at the floor and 1 at
 * the top of the head, and (xu, zu) are across and front-to-back in the unit dome.
 */

/** what a skin adds to the Blob: its parts, what moves in them, and how far it pushes a third eye out (it must sit on top) */
export interface Dressed {
  group: THREE.Group;
  tick: (t: number) => void;
  /** how far out from the skin the third eye goes, so it shows on a helmet or a cap */
  lift: number;
  dispose: () => void;
}

const TOP = 0.68;

/** the dome's half-width and half-depth at height f (unit dome), worked out the way dome() shapes it */
function extent(f: number): { x: number; z: number } {
  const y = f * TOP;
  const ny = (y * 0.7) / TOP - 0.1;
  const yy = Math.max(0, Math.min(1, ny / 0.6));
  const r = 0.5 * Math.sqrt(Math.max(0, 1 - yy * yy));
  const sp = 1 + 0.1 * (1 - yy) * (1 - yy);
  return { x: r * sp, z: r * sp * 0.82 };
}

/** the point of the dome nearest to (xu, f) on its front (or back), and the way the skin faces there, at size S */
function surf(S: number, xu: number, f: number, back = false): { p: THREE.Vector3; n: THREE.Vector3 } {
  const g = dome();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const e = extent(f);
  const zf = e.z * Math.sqrt(Math.max(0, 1 - (xu / Math.max(1e-3, e.x)) ** 2)) * (back ? -1 : 1);
  const y = f * TOP;
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const d = (pos.getX(i) - xu) ** 2 + (pos.getY(i) - y) ** 2 + (pos.getZ(i) - zf) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return {
    p: new THREE.Vector3(pos.getX(best), pos.getY(best), pos.getZ(best)).multiplyScalar(S),
    n: new THREE.Vector3(nor.getX(best), nor.getY(best), nor.getZ(best)).normalize(),
  };
}

/** the polar angle on the sphere the dome is pressed from, for height f on the dome (see shapeDome) */
function thetaAt(f: number): number {
  const c = f >= 0.1 / 0.7 ? (0.7 * f - 0.1) / 0.6 : (0.7 * f - 0.1) / 0.1;
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/**
 * A part of the dome cut along its own lines: between heights f0 and f1, and round from angle phi0 for phiLen (0 is the Blob's
 * left side, PI/2 its front, PI its right, 3PI/2 its back), pushed out along the skin by `inflate(f)` (world units, at size S).
 * Its edges are smooth curves on the jelly, and it squashes with it.
 */
function part(S: number, f0: number, f1: number, inflate: number | ((f: number) => number), phi0 = 0, phiLen = Math.PI * 2): THREE.BufferGeometry {
  const t0 = thetaAt(f1);
  const t1 = thetaAt(f0);
  const w = Math.max(8, Math.round((64 * phiLen) / (Math.PI * 2)));
  const h = Math.max(4, Math.round((t1 - t0) * 24));
  const g = shapeDome(new THREE.SphereGeometry(0.5, w, h, phi0, phiLen, t0, t1 - t0));
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const inf = typeof inflate === 'number' ? () => inflate : inflate;
  for (let i = 0; i < p.count; i++) {
    const k = inf(p.getY(i) / TOP);
    p.setXYZ(i, p.getX(i) * S + n.getX(i) * k, p.getY(i) * S + n.getY(i) * k, p.getZ(i) * S + n.getZ(i) * k);
  }
  g.computeVertexNormals();
  // (it ripples with the jelly under it: see ripple)
  g.userData.shell = true;
  return g;
}

/**
 * Make a material on a part of the dome ripple exactly as the jelly's skin does when it sloshes (jelly.ts moves the skin's
 * vertices out along their normals; this moves the part's with the same wave, at the same place), so the jelly never shows
 * through it. Positions in a part are at the Blob's size S; the wave is worked out on the unit dome.
 */
function ripple(m: THREE.Material, wave: JellyRig['wave'], S: number) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWave = wave.uWave;
    sh.uniforms.uT = wave.uT;
    sh.uniforms.uS = { value: S };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWave;\nuniform float uT;\nuniform float uS;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n{ vec3 q = position / uS; transformed += normal * uWave * uS * sin(q.y * 24.0 - uT * 15.0 + q.x * 6.0) * smoothstep(0.02, 0.4, q.y); }',
      );
  };
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const glow = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const ball = new THREE.SphereGeometry(0.5, 18, 12);

/** the jelly's colours (and its shine) for this skin: Inferno and Golden change them, the others wear the Blob's own */
function recolour(rig: JellyRig, skin: SkinId) {
  const u = rig.mat.userData.jelly as { uCore: { value: THREE.Color }; uLow: { value: THREE.Color }; uRim: { value: THREE.Color }; uGlow: { value: number } };
  const look =
    skin === 'inferno'
      ? { core: 0xffb33a, low: 0xff4210, rim: 0xff2400, glow: 1.25, metal: 0, rough: 0.16 }
      : skin === 'golden'
        ? { core: 0xffc22e, low: 0xd2780a, rim: 0xffe8a0, glow: 0.95, metal: 0.55, rough: 0.16 }
        : { core: BLOB_LOOK.core, low: BLOB_LOOK.low, rim: BLOB_LOOK.rim, glow: BLOB_LOOK.glow ?? 0.85, metal: 0, rough: 0.16 };
  u.uCore.value.setHex(look.core);
  u.uLow.value.setHex(look.low);
  u.uRim.value.setHex(look.rim);
  u.uGlow.value = look.glow;
  rig.mat.color.setHex(look.core);
  rig.mat.metalness = look.metal;
  rig.mat.roughness = look.rough;
}

/** put a skin on the Blob (taking off whatever it wore before is the caller's: see Dressed.dispose) */
export function dressJelly(rig: JellyRig, skin: SkinId): Dressed {
  recolour(rig, skin);
  const group = new THREE.Group();
  const S = rig.size;
  let tick: (t: number) => void = () => {};
  let lift = 0;
  if (skin === 'explorer') ({ tick, lift } = explorer(group, S));
  else if (skin === 'knight') ({ tick, lift } = knight(group, S));
  else if (skin === 'wizard') ({ tick, lift } = wizard(group, S));
  else if (skin === 'inferno') ({ tick, lift } = inferno(group, S));
  else if (skin === 'golden') ({ tick, lift } = golden(group, S));
  // what is cut from the dome ripples with it
  const done = new Set<THREE.Material>();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry.userData.shell) return;
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) {
      if (done.has(x)) continue;
      done.add(x);
      ripple(x, rig.wave, S);
    }
  });
  rig.body.add(group);
  return {
    group,
    tick,
    lift,
    dispose: () => {
      group.removeFromParent();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          if (m.geometry !== ball) m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
        } else if ((o as THREE.Sprite).isSprite) (o as THREE.Sprite).material.dispose();
      });
    },
  };
}

type Part = { tick: (t: number) => void; lift: number };

/* ------------------------------------------------------------------------------------------------ Explorer */

const HALF = Math.PI / 2;
/** the back half of the dome, less a little at each side (where a cape hangs) */
const BACK0 = Math.PI + 0.32;
const BACK_LEN = Math.PI - 0.64;

/** a leather aviator cap, brass goggles with glass that catches the moon, and a red scarf with its tails in the wind */
function explorer(g: THREE.Group, S: number): Part {
  const leather = std({ color: 0x7c4a28, roughness: 0.62, metalness: 0.05 });
  const strap = std({ color: 0x3a2010, roughness: 0.55 });
  g.add(new THREE.Mesh(part(S, 0.66, 1, 0.024 * S), leather));
  // the band round its edge, and the seams over the top, front and back
  g.add(new THREE.Mesh(part(S, 0.64, 0.71, 0.036 * S), strap));
  g.add(new THREE.Mesh(part(S, 0.68, 1, 0.031 * S, HALF - 0.025, 0.05), strap));
  g.add(new THREE.Mesh(part(S, 0.68, 1, 0.031 * S, HALF * 3 - 0.025, 0.05), strap));
  // the goggles, high on the front of the cap, joined by a brass bridge
  const brass = std({ color: 0xd2a04a, metalness: 0.9, roughness: 0.26, emissive: 0x3a2808 });
  const glass = std({ color: 0x7ee4f6, metalness: 0.1, roughness: 0.04, emissive: 0x0e5068 });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const ring = new THREE.TorusGeometry(0.09 * S, 0.026 * S, 12, 28);
  for (const sx of [-1, 1]) {
    const { p, n } = surf(S, sx * 0.17, 0.82);
    const gg = new THREE.Group();
    gg.position.copy(p).addScaledVector(n, 0.05 * S);
    gg.lookAt(gg.position.clone().add(n));
    gg.add(new THREE.Mesh(ring, brass));
    const lens = new THREE.Mesh(ball, glass);
    lens.scale.set(0.15 * S, 0.15 * S, 0.06 * S);
    gg.add(lens);
    const glint = new THREE.Mesh(ball, white);
    glint.scale.set(0.035 * S, 0.035 * S, 0.01 * S);
    glint.position.set(-0.03 * S, 0.035 * S, 0.032 * S);
    gg.add(glint);
    g.add(gg);
  }
  const { p: bp, n: bn } = surf(S, 0, 0.83);
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * S, 0.018 * S, 0.12 * S, 8), brass);
  bridge.position.copy(bp).addScaledVector(bn, 0.05 * S);
  bridge.rotation.z = Math.PI / 2;
  g.add(bridge);
  // the scarf: wrapped low round the body, a darker fold along its bottom edge
  const red = std({ color: 0xd6303a, roughness: 0.82, emissive: 0x2a0406 });
  const redDark = std({ color: 0x8e1826, roughness: 0.85 });
  g.add(new THREE.Mesh(part(S, 0.17, 0.33, 0.04 * S), red));
  g.add(new THREE.Mesh(part(S, 0.15, 0.2, 0.05 * S), redDark));
  // the knot on the right, at the back, and its two tails out behind, flapping
  const fk = 0.25;
  const e = extent(fk);
  const ka = -0.5;
  const knotP = new THREE.Vector3(Math.cos(ka) * (e.x * S + 0.05 * S), fk * TOP * S, Math.sin(ka) * (e.z * S + 0.05 * S));
  const knot = new THREE.Mesh(ball, red);
  knot.position.copy(knotP);
  knot.scale.set(0.15 * S, 0.13 * S, 0.12 * S);
  g.add(knot);
  // the tails: two ribbons streaming out behind, drooping a little and rippling along their length (bent afresh every frame)
  const NS = 14;
  const L = 0.46 * S;
  const W = 0.13 * S;
  const side = (m: THREE.MeshStandardMaterial) => {
    const c = m.clone();
    c.side = THREE.DoubleSide;
    return c;
  };
  const out = new THREE.Vector3(Math.cos(ka), 0, Math.sin(ka));
  const tails = [0, 1].map((i) => {
    const geo = new THREE.PlaneGeometry(1, 1, 1, NS);
    const dir = out.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 0, -1)).normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), i ? 0.32 : -0.12);
    const flat = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const m = new THREE.Mesh(geo, side(i ? redDark : red));
    m.position.copy(knotP);
    m.frustumCulled = false;
    g.add(m);
    return { geo, dir, flat, len: L * (i ? 0.86 : 1) };
  });
  const v = new THREE.Vector3();
  const across = new THREE.Vector3();
  const bend = (t: number) =>
    tails.forEach(({ geo, dir, flat, len }, i) => {
      const p = geo.getAttribute('position');
      for (let k = 0; k < p.count; k++) {
        const u = Math.floor(k / 2) / NS;
        const w = (k % 2 ? 0.5 : -0.5) * W * (1 - 0.45 * u);
        const ph = t * 8.5 - u * 6 + i * 1.3;
        // (a ribbon, its face turned half to the side and twisting along its length, so it shows its width from any side)
        const tw = 0.9 + u * 0.9 + Math.sin(ph) * 0.25;
        across.set(0, Math.cos(tw), 0).addScaledVector(flat, Math.sin(tw));
        v.copy(dir).multiplyScalar(u * len);
        v.y -= u ** 1.5 * 0.12 * S + Math.cos(ph) * u * 0.035 * S;
        v.addScaledVector(across, w).addScaledVector(flat, Math.sin(ph) * u * 0.06 * S);
        p.setXYZ(k, v.x, v.y, v.z);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    });
  bend(0);
  return { lift: 0.04 * S, tick: bend };
}

/* ------------------------------------------------------------------------------------------------ Knight */

/** a polished steel helmet with its visor up, cheek guards, a ridge and rivets, and a red crest of feathers that sways */
function knight(g: THREE.Group, S: number): Part {
  const steel = std({ color: 0xd2dae6, metalness: 0.6, roughness: 0.3, emissive: 0x141a24 });
  const dark = std({ color: 0x737e92, metalness: 0.6, roughness: 0.36, emissive: 0x0a0e14 });
  const bright = std({ color: 0xf2f6fa, metalness: 0.65, roughness: 0.2, emissive: 0x1e2430 });
  // the dome, down to just above the eyes, and the rim of the raised visor
  g.add(new THREE.Mesh(part(S, 0.72, 1, 0.04 * S), steel));
  g.add(new THREE.Mesh(part(S, 0.69, 0.76, 0.058 * S), dark));
  // the cheek guards, down both sides beside the eyes, with a darker front edge
  for (const c of [0, Math.PI]) {
    g.add(new THREE.Mesh(part(S, 0.3, 0.73, 0.04 * S, c - 0.5, 1.0), steel));
    const edge = c === 0 ? 0.42 : Math.PI - 0.5;
    g.add(new THREE.Mesh(part(S, 0.3, 0.73, 0.052 * S, edge, 0.08), dark));
    g.add(new THREE.Mesh(part(S, 0.28, 0.33, 0.052 * S, c - 0.5, 1.0), dark));
  }
  // the ridge, front to back over the top
  g.add(new THREE.Mesh(part(S, 0.74, 1, 0.066 * S, HALF - 0.03, 0.06), bright));
  g.add(new THREE.Mesh(part(S, 0.74, 1, 0.066 * S, HALF * 3 - 0.03, 0.06), bright));
  // rivets along the rim, round the front
  const e = extent(0.725);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.12 + (0.76 * i) / 8);
    const r = new THREE.Mesh(ball, bright);
    r.position.set(Math.cos(a) * (e.x * S + 0.06 * S), 0.725 * TOP * S, Math.sin(a) * (e.z * S + 0.06 * S));
    r.scale.setScalar(0.045 * S);
    g.add(r);
  }
  // the crest: a fan of red feathers standing up along the ridge, front to back, longest at the back, their tips a scalloped edge
  const plume = new THREE.Group();
  plume.position.set(0, TOP * S - 0.05 * S, -0.03 * S);
  const red = std({ color: 0xe8363c, roughness: 0.72, emissive: 0x3c060a });
  const deep = std({ color: 0xb01c2c, roughness: 0.78, emissive: 0x26030a });
  const N = 15;
  const feathers: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const fg = new THREE.Group();
    // (rotating about x tips a feather to the front for a > 0 and to the back for a < 0)
    fg.rotation.x = 1.1 - u * 2.5;
    const len = (0.28 + 0.12 * u + 0.06 * Math.sin(u * Math.PI)) * S;
    // (two rows of feathers, side by side and a little apart, so the crest is bushy from behind as well as from the side)
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(ball, (i + (side > 0 ? 1 : 0)) % 2 ? deep : red);
      m.scale.set(0.085 * S, len * (side > 0 ? 1 : 0.94), 0.12 * S);
      m.position.set(side * 0.03 * S, len * 0.5, 0);
      m.rotation.z = side * 0.1;
      fg.add(m);
    }
    plume.add(fg);
    feathers.push(fg);
  }
  g.add(plume);
  return {
    lift: 0.07 * S,
    tick: (t) => {
      plume.rotation.x = Math.sin(t * 3) * 0.05;
      feathers.forEach((fg, i) => (fg.rotation.z = Math.sin(t * 5 + i * 0.7) * 0.035));
    },
  };
}

/* ------------------------------------------------------------------------------------------------ Wizard */

/** a five-pointed star, flat, for the hat */
function starGeo(r: number, depth: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: r * 0.06, bevelSegments: 2 });
  g.center();
  return g;
}

/** a cape down the back: royal for Golden, purple for the Wizard; it flares out towards the hem */
const flare = (S: number) => (f: number) => 0.03 * S + (1 - f) * 0.13 * S;
/** where a cape ends: the Blob's widest point (below it the dome curls in under the Blob, out of sight) */
const CAPE0 = 0.14;

/** a tall blue hat with a wide brim, its tip flopping back, a purple band and a gold star; and a purple cape behind */
function wizard(g: THREE.Group, S: number): Part {
  const blue = std({ color: 0x2f40ac, roughness: 0.62 });
  const purple = std({ color: 0x7a40c8, roughness: 0.55 });
  const gold = std({ color: 0xffd23a, metalness: 0.7, roughness: 0.28, emissive: 0x8a6400 });
  // the brim, sitting on the top of the head
  const brimY = 0.9 * TOP * S;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * S, 0.62 * S, 0.035 * S, 48), blue);
  brim.position.y = brimY;
  g.add(brim);
  // the cone, its tip leaning back and to the left (bent, vertex by vertex)
  const H = 0.95 * S;
  const cone = new THREE.ConeGeometry(0.33 * S, H, 40, 18);
  const cp = cone.getAttribute('position');
  for (let i = 0; i < cp.count; i++) {
    const t = (cp.getY(i) + H / 2) / H;
    cp.setX(i, cp.getX(i) - 0.2 * S * t * t * t);
    cp.setZ(i, cp.getZ(i) - 0.28 * S * t * t);
  }
  cone.computeVertexNormals();
  const coneM = new THREE.Mesh(cone, blue);
  coneM.position.y = brimY + H / 2;
  g.add(coneM);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.315 * S, 0.335 * S, 0.09 * S, 40, 1, true), purple);
  band.position.y = brimY + 0.06 * S;
  g.add(band);
  // the star, on the front of the cone a third of the way up
  const ts = 0.36;
  const star = new THREE.Mesh(starGeo(0.1 * S, 0.02 * S), gold);
  const r = 0.33 * S * (1 - ts);
  star.position.set(-0.2 * S * ts ** 3, brimY + ts * H, r - 0.28 * S * ts * ts + 0.02 * S);
  star.rotation.x = -0.32;
  g.add(star);
  // the cape, down the back, with two gold clasps where it is fastened at the shoulders
  const cape = std({ color: 0x6630a8, roughness: 0.78, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(part(S, CAPE0, 0.64, flare(S), BACK0, BACK_LEN), cape));
  const capeEdge = std({ color: 0x34185e, roughness: 0.8, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(part(S, CAPE0, 0.64, (f) => flare(S)(f) + 0.008 * S, BACK0, 0.06), capeEdge));
  g.add(new THREE.Mesh(part(S, CAPE0, 0.64, (f) => flare(S)(f) + 0.008 * S, BACK0 + BACK_LEN - 0.06, 0.06), capeEdge));
  for (const a of [BACK0 + 0.04, BACK0 + BACK_LEN - 0.04]) {
    const e = extent(0.6);
    const c = new THREE.Mesh(ball, gold);
    // (three's sphere: x = -cos(phi), z = sin(phi))
    c.position.set(-Math.cos(a) * (e.x * S + flare(S)(0.6) + 0.02 * S), 0.6 * TOP * S, Math.sin(a) * (e.z * S + flare(S)(0.6) + 0.02 * S));
    c.scale.setScalar(0.07 * S);
    g.add(c);
  }
  return { lift: 0.01 * S, tick: (t) => (gold.emissiveIntensity = 0.75 + 0.35 * Math.max(0, Math.sin(t * 4))) };
}

/* ------------------------------------------------------------------------------------------------ Inferno */

/** a horn: a tube along a curve, thick at the head and sharp at the tip */
function hornGeo(S: number, side: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.2 * S, 0.6 * S, 0.04 * S),
    new THREE.Vector3(side * 0.29 * S, 0.76 * S, 0.02 * S),
    new THREE.Vector3(side * 0.37 * S, 0.88 * S, -0.03 * S),
    new THREE.Vector3(side * 0.36 * S, 0.99 * S, -0.08 * S),
  ]);
  const tube = new THREE.TubeGeometry(curve, 24, 0.075 * S, 12, false);
  const p = tube.getAttribute('position');
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / 13) / 24;
    curve.getPointAt(t, c);
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(1 - t * 0.9);
    p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  tube.computeVertexNormals();
  return tube;
}

/** a tongue of fire, painted once: white-hot at its root, yellow, orange, a red edge, fading out to a flickering point */
let flameTex: THREE.CanvasTexture | null = null;
function flameTexture(): THREE.CanvasTexture {
  if (flameTex) return flameTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d')!;
  const tongue = (w: number, h: number) => {
    x.beginPath();
    x.moveTo(32, 128 - h);
    x.bezierCurveTo(32 + w * 0.35, 128 - h * 0.62, 32 + w, 128 - h * 0.35, 32 + w * 0.62, 124);
    x.quadraticCurveTo(32, 130, 32 - w * 0.62, 124);
    x.bezierCurveTo(32 - w, 128 - h * 0.35, 32 - w * 0.35, 128 - h * 0.62, 32, 128 - h);
    x.fill();
  };
  x.fillStyle = 'rgba(200,30,8,0.55)';
  tongue(30, 126);
  x.fillStyle = 'rgba(255,110,20,0.8)';
  tongue(24, 106);
  x.fillStyle = 'rgba(255,190,50,0.9)';
  tongue(16, 78);
  x.fillStyle = 'rgba(255,248,200,1)';
  tongue(8, 44);
  flameTex = new THREE.CanvasTexture(c);
  flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}

/** black horns glowing at the edges, fire licking up off the head and the shoulders, and sparks rising */
function inferno(g: THREE.Group, S: number): Part {
  const hornM = std({ color: 0x220806, roughness: 0.35, metalness: 0.2, emissive: 0x3a0a00 });
  g.add(new THREE.Mesh(hornGeo(S, -1), hornM), new THREE.Mesh(hornGeo(S, 1), hornM));
  // each flame is two crossed cards (so it is a flame from any side), standing on the head and the back
  const card = new THREE.PlaneGeometry(1, 1);
  card.translate(0, 0.5, 0);
  const fm = new THREE.MeshBasicMaterial({ map: flameTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const flames: { m: THREE.Group; w: number; h: number; ph: number }[] = [];
  const spots: [number, number, number, number, number][] = [
    // x, f, z, width, height (S)
    [0, 0.97, -0.06, 0.36, 0.7],
    [-0.2, 0.9, -0.1, 0.3, 0.52],
    [0.21, 0.9, -0.1, 0.3, 0.56],
    [-0.36, 0.72, -0.16, 0.26, 0.42],
    [0.36, 0.72, -0.16, 0.26, 0.44],
    [-0.1, 0.84, -0.28, 0.3, 0.5],
    [0.12, 0.82, -0.28, 0.3, 0.46],
    [-0.45, 0.48, -0.2, 0.22, 0.32],
    [0.45, 0.48, -0.2, 0.22, 0.34],
  ];
  spots.forEach(([x, f, z, w, h], i) => {
    const fl = new THREE.Group();
    fl.position.set(x * S, f * TOP * S, z * S);
    for (const ry of [0.4, 0.4 + Math.PI / 2]) {
      const m = new THREE.Mesh(card, fm);
      m.rotation.y = ry + i * 0.5;
      fl.add(m);
    }
    g.add(fl);
    flames.push({ m: fl, w: w * S, h: h * S, ph: i * 1.7 });
  });
  // sparks
  const sparkM = glow(0xffd070, 0.9);
  const sparks: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(ball, sparkM);
    g.add(s);
    sparks.push(s);
  }
  return {
    lift: 0,
    tick: (t) => {
      flames.forEach(({ m, w, h, ph }) => {
        const k = 1 + 0.2 * Math.sin(t * 13 + ph) + 0.12 * Math.sin(t * 23 + ph * 2.3);
        m.scale.set(w * (1 - 0.08 * (k - 1)), h * k, w);
        m.rotation.z = Math.sin(t * 6 + ph) * 0.1;
      });
      sparks.forEach((s, i) => {
        const u = (t * 0.7 + i / sparks.length) % 1;
        const a = i * 2.39;
        s.position.set(Math.cos(a) * 0.35 * S * (1 - u * 0.3), (0.8 + u * 1.3) * S, Math.sin(a) * 0.25 * S - 0.1 * S);
        s.scale.setScalar(0.05 * S * (1 - u));
      });
    },
  };
}

/* ------------------------------------------------------------------------------------------------ Golden */

/** a sparkle: a soft four-pointed star on a transparent square, drawn once */
let sparkTex: THREE.CanvasTexture | null = null;
function sparkle(): THREE.CanvasTexture {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,240,170,0.6)');
  gr.addColorStop(1, 'rgba(255,220,120,0)');
  x.fillStyle = gr;
  x.beginPath();
  x.moveTo(32, 0);
  x.quadraticCurveTo(36, 28, 64, 32);
  x.quadraticCurveTo(36, 36, 32, 64);
  x.quadraticCurveTo(28, 36, 0, 32);
  x.quadraticCurveTo(28, 28, 32, 0);
  x.fill();
  sparkTex = new THREE.CanvasTexture(c);
  sparkTex.colorSpace = THREE.SRGBColorSpace;
  return sparkTex;
}

/** a gold crown set with a ruby between two sapphires, a royal red cape trimmed with ermine, and sparkles all round */
function golden(g: THREE.Group, S: number): Part {
  const gold = std({ color: 0xffc83a, metalness: 0.92, roughness: 0.2, emissive: 0x5a3a00 });
  const goldIn = std({ color: 0xffc83a, metalness: 0.92, roughness: 0.2, emissive: 0x5a3a00, side: THREE.DoubleSide });
  // the crown, sitting on the top of the head
  const crown = new THREE.Group();
  crown.position.y = 0.93 * TOP * S;
  crown.add(new THREE.Mesh(new THREE.CylinderGeometry(0.27 * S, 0.29 * S, 0.13 * S, 48, 1, true), goldIn));
  for (const [y, w] of [
    [-0.065, 0.02],
    [0.065, 0.016],
  ] as const) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29 * S - (y > 0 ? 0.02 * S : 0), w * S, 8, 48), gold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y * S;
    crown.add(rim);
  }
  // five points, the front one tallest, each with a gold ball on its tip
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const h = (i === 0 ? 0.2 : 0.15) * S;
    const pt = new THREE.Mesh(new THREE.ConeGeometry(0.06 * S, h, 12), gold);
    const r = 0.275 * S;
    pt.position.set(Math.cos(a) * r, 0.065 * S + h / 2, Math.sin(a) * r);
    crown.add(pt);
    const tip = new THREE.Mesh(ball, gold);
    tip.position.set(Math.cos(a) * r, 0.065 * S + h + 0.012 * S, Math.sin(a) * r);
    tip.scale.setScalar(0.05 * S);
    crown.add(tip);
  }
  // the gems: a ruby at the front, sapphires either side
  const ruby = std({ color: 0xe8203c, metalness: 0.1, roughness: 0.08, emissive: 0x6a0614 });
  const sapphire = std({ color: 0x3a7cff, metalness: 0.1, roughness: 0.08, emissive: 0x0a2a6a });
  const gems: [number, THREE.Material, number][] = [
    [Math.PI / 2, ruby, 0.07],
    [Math.PI / 2 + 0.75, sapphire, 0.05],
    [Math.PI / 2 - 0.75, sapphire, 0.05],
  ];
  for (const [a, m, r] of gems) {
    const gm = new THREE.Mesh(ball, m);
    gm.position.set(Math.cos(a) * 0.3 * S, 0, Math.sin(a) * 0.3 * S);
    gm.scale.set(r * S, r * S, r * S * 0.6);
    gm.lookAt(gm.position.clone().multiplyScalar(2));
    crown.add(gm);
  }
  crown.rotation.z = -0.06;
  g.add(crown);
  // the cape: royal red down the back, flaring at the hem, white ermine along its hem, its edges and its collar
  const velvet = std({ color: 0xb6142c, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x1a0204 });
  const ermine = std({ color: 0xfff6e8, roughness: 0.95, side: THREE.DoubleSide, emissive: 0x6a6052 });
  const fl = flare(S);
  const on = (f: number) => fl(f) + 0.018 * S;
  g.add(new THREE.Mesh(part(S, CAPE0, 0.62, fl, BACK0, BACK_LEN), velvet));
  g.add(new THREE.Mesh(part(S, CAPE0, 0.22, on, BACK0, BACK_LEN), ermine));
  g.add(new THREE.Mesh(part(S, 0.55, 0.64, on, BACK0, BACK_LEN), ermine));
  g.add(new THREE.Mesh(part(S, CAPE0, 0.64, on, BACK0, 0.07), ermine));
  g.add(new THREE.Mesh(part(S, CAPE0, 0.64, on, BACK0 + BACK_LEN - 0.07, 0.07), ermine));
  // the little black tails in the ermine of the hem
  const spotM = std({ color: 0x141014, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const a = BACK0 + 0.2 + ((BACK_LEN - 0.4) * i) / 5;
    const f = 0.18;
    const e = extent(f);
    const d = fl(f) + 0.03 * S;
    const sp = new THREE.Mesh(ball, spotM);
    sp.position.set(-Math.cos(a) * (e.x * S + d), f * TOP * S, Math.sin(a) * (e.z * S + d));
    sp.scale.set(0.024 * S, 0.04 * S, 0.024 * S);
    g.add(sp);
  }
  // sparkles, here and there around it, coming and going
  const sm = new THREE.SpriteMaterial({ map: sparkle(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks: THREE.Sprite[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(sm);
    g.add(s);
    sparks.push(s);
  }
  return {
    lift: 0,
    tick: (t) =>
      sparks.forEach((s, i) => {
        const ph = (t * 0.6 + i / sparks.length) % 1;
        const a = i * 2.1 + Math.floor(t * 0.6 + i / sparks.length) * 1.3;
        // (never in front of the face: one that comes round to the front stays out at the side)
        const z = Math.sin(a) * 0.55 * S;
        const x = Math.cos(a) * 0.75 * S;
        s.position.set(z > 0 ? Math.sign(x || 1) * Math.max(Math.abs(x), 0.66 * S) : x, (0.25 + ((i * 0.37) % 1) * 0.8) * S, z);
        s.scale.setScalar(Math.max(0, Math.sin(ph * Math.PI)) * 0.3 * S);
      }),
  };
}
