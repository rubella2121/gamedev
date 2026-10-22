import * as THREE from 'three';
import { halo } from '../../src/act2/kit/skin';
import { fogged } from './shade';

/** The family in 3D: the Blob (gold, glowing, big eyes, a tuft), Mother with her pink bow, Father. Origin at the feet, facing +z. */

const GOLD = 0xf2c64e;
const GOLD_EMIT = 0xffa522;
const CREAM = 0xfff1a6;
const PINK = 0xff8cc0;

export interface BlobOpts {
  /** 1 is the Blob (1.8 tall) */
  scale?: number;
  bow?: boolean;
  /** how brightly it glows (a light is added too) */
  glow?: number;
  /** pupils look up/left: -1..1 */
  look?: [number, number];
  /** squashed (a sleepy curl) 0..1 */
  squash?: number;
  light?: boolean;
  /** a shy, worried face */
  worried?: boolean;
  /** multiplies the strength of the warm light it throws (the lab default suits a close shot; the world's trees are far) */
  lightK?: number;
  /** multiplies the soft halo round it (1 is a lab picture; the world's close shots want much less) */
  haloK?: number;
  /** the shell on its back with the three light sockets (the hero reference sheet: the view you play from) */
  shell?: boolean;
}

const matGold = (emit = 0.55) =>
  fogged(new THREE.MeshPhysicalMaterial({ color: GOLD, roughness: 0.42, metalness: 0, emissive: GOLD_EMIT, emissiveIntensity: emit, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.6, sheenColor: new THREE.Color(CREAM) }));

export function makeBow(): THREE.Group {
  const g = new THREE.Group();
  const m = fogged(new THREE.MeshPhysicalMaterial({ color: PINK, roughness: 0.4, emissive: 0xff5aa0, emissiveIntensity: 0.55, clearcoat: 0.6 }));
  const loopGeo = new THREE.SphereGeometry(1, 20, 14);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(loopGeo, m);
    loop.scale.set(0.36, 0.26, 0.12);
    loop.position.set(s * 0.33, 0, 0);
    loop.rotation.z = s * 0.28;
    g.add(loop);
    // a darker inner fold
    const fold = new THREE.Mesh(loopGeo, fogged(new THREE.MeshStandardMaterial({ color: 0xc0386e, roughness: 0.6, emissive: 0x6a1a3a, emissiveIntensity: 0.4 })));
    fold.scale.set(0.2, 0.13, 0.05);
    fold.position.set(s * 0.33, -0.02, 0.1);
    fold.rotation.z = s * 0.28;
    g.add(fold);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), m);
  knot.scale.set(1, 1.05, 0.9);
  g.add(knot);
  // two ribbon ends
  for (const s of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.025), m);
    tail.position.set(s * 0.09, -0.24, 0);
    tail.rotation.z = s * 0.35;
    g.add(tail);
  }
  return g;
}

export function makeBlob(o: BlobOpts = {}): THREE.Group {
  const s = o.scale ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const sq = 1 - (o.squash ?? 0) * 0.3;
  // the egg: wide below, rounder above, a little flat on the bottom
  const eggGeo = new THREE.SphereGeometry(1, 48, 36);
  const p = eggGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    const k = y > 0 ? 1 - 0.14 * y : 1 + 0.06 * -y;
    if (y < -0.7) y = -0.7 - (y + 0.7) * 0.5;
    p.setXYZ(i, x * k, y, z * k);
  }
  eggGeo.computeVertexNormals();
  const egg = new THREE.Mesh(eggGeo, matGold(0.5 * (o.glow ?? 1)));
  egg.scale.set(0.9, 0.9 * sq, 0.82);
  egg.position.y = 0.75 * sq + 0.1;
  egg.castShadow = true;
  body.add(egg);
  // a lighter belly
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), fogged(new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.6, emissive: 0xffd878, emissiveIntensity: 0.45 * (o.glow ?? 1), transparent: true, opacity: 0.55 })));
  belly.scale.set(0.5, 0.45, 0.2);
  belly.position.set(0, 0.62 * sq + 0.1, 0.62);
  body.add(belly);
  // eyes
  const look = o.look ?? [0, 0];
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.scale.set(0.2, 0.27, 0.1);
    eye.position.set(sx * 0.3, 0.98 * sq + 0.08, 0.71);
    eye.rotation.y = sx * 0.28;
    body.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x2a0c18 }));
    pupil.scale.set(0.64, 0.75, 0.45);
    pupil.position.set(look[0] * 0.3, look[1] * 0.32 - 0.04, 0.95);
    eye.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.scale.set(0.22, 0.26, 0.2);
    shine.position.set(look[0] * 0.3 - 0.18, look[1] * 0.32 + 0.2, 1.15);
    eye.add(shine);
    // a blush
    const blush = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff7a8a, transparent: true, opacity: 0.55 }));
    blush.scale.set(0.12, 0.07, 0.03);
    blush.position.set(sx * 0.52, 0.72 * sq + 0.1, 0.58);
    blush.rotation.y = sx * 0.7;
    body.add(blush);
  }
  // a small mouth
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 8, 18, Math.PI), new THREE.MeshBasicMaterial({ color: 0x5a1a2a }));
  mouth.position.set(0, 0.62 * sq + 0.1, 0.8);
  mouth.rotation.z = o.worried ? 0 : Math.PI;
  mouth.scale.set(1, o.worried ? 0.6 : 1, 1);
  body.add(mouth);
  // stubby arms and feet
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), matGold(0.4));
    arm.scale.set(0.15, 0.2, 0.15);
    arm.position.set(sx * 0.82, 0.58 * sq + 0.1, 0.1);
    arm.rotation.z = sx * 0.5;
    body.add(arm);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fogged(new THREE.MeshStandardMaterial({ color: 0xd9a03a, roughness: 0.6, emissive: 0x8a5a10, emissiveIntensity: 0.3 })));
    foot.scale.set(0.24, 0.13, 0.32);
    foot.position.set(sx * 0.34, 0.08, 0.12);
    foot.castShadow = true;
    body.add(foot);
  }
  // the tuft: three curls of light
  const tuft = new THREE.Group();
  const tm = fogged(new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.5, emissive: 0xffe9a0, emissiveIntensity: 0.9 * (o.glow ?? 1) }));
  for (const [ang, len, sway] of [[-0.35, 0.34, 0.2], [0.1, 0.46, -0.1], [0.5, 0.3, -0.25]] as [number, number, number][]) {
    const curl = new THREE.Mesh(new THREE.ConeGeometry(0.07, len, 8), tm);
    curl.position.set(Math.sin(ang) * 0.1, len / 2, 0);
    curl.rotation.z = -ang * 0.8 + sway;
    tuft.add(curl);
  }
  tuft.position.set(0, 1.68 * sq + 0.05, 0);
  body.add(tuft);
  if (o.shell) {
    // the back shell: a darker gold plate with a spiral groove and three light sockets (the meter you read from behind)
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), fogged(new THREE.MeshStandardMaterial({ color: 0xc98a2a, roughness: 0.4, emissive: 0x6a3a08, emissiveIntensity: 0.5 })));
    shell.scale.set(0.78, 0.8 * sq, 0.5);
    shell.position.set(0, 0.8 * sq + 0.1, -0.5);
    body.add(shell);
    const sp: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = t * Math.PI * 3.2;
      const rr = 0.08 + 0.55 * t;
      const x = Math.cos(a) * rr * 0.9;
      const y = Math.sin(a) * rr * 0.9;
      sp.push(new THREE.Vector3(x, (0.8 * sq + 0.1) + y, -0.5 - 0.5 * Math.sqrt(Math.max(0, 1 - (x / 0.78) ** 2 - (y / (0.8 * sq)) ** 2)) - 0.01));
    }
    const groove = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 60, 0.03, 5, false), fogged(new THREE.MeshStandardMaterial({ color: 0xffe9a0, roughness: 0.5, emissive: 0xffd070, emissiveIntensity: 0.7 })));
    body.add(groove);
    for (const [ox, oy] of [[0, 0.32], [-0.3, -0.08], [0.3, -0.08]] as [number, number][]) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const zz = -0.5 - 0.5 * Math.sqrt(Math.max(0, 1 - (ox / 0.78) ** 2 - (oy / (0.8 * sq)) ** 2)) - 0.03;
      orb.position.set(ox, 0.8 * sq + 0.1 + oy, zz);
      body.add(orb);
    }
  }
  if (o.bow) {
    const bow = makeBow();
    bow.position.set(0.52, 1.55 * sq, 0.12);
    bow.rotation.z = -0.35;
    bow.rotation.y = -0.25;
    bow.scale.setScalar(1.15);
    body.add(bow);
  }
  const g = o.glow ?? 1;
  if (g > 0) {
    const h = halo(0xffd070, 5.2, 0.36 * g * (o.haloK ?? 1));
    h.position.y = 1.05;
    root.add(h);
  }
  if (o.light !== false && g > 0) {
    const l = new THREE.PointLight(0xffc860, 5.5 * g * Math.max(1, s) * (o.lightK ?? 1), 26 * Math.max(1, s), 1.5);
    l.position.set(0, 1.3 * sq, 1.0);
    root.add(l);
  }
  root.scale.setScalar(s);
  root.traverse((ob) => {
    if ((ob as THREE.Mesh).isMesh) (ob as THREE.Mesh).castShadow = true;
  });
  return root;
}

/** A pink ribbon tied to something, trailing in a breeze: the trail the Blob follows. `len` units long, pointing +x from the knot. */
export function makeRibbon(len = 3, wave = 0.5): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(len, 0.34, 28, 2);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + len / 2;
    const u = x / len;
    p.setZ(i, Math.sin(u * 7.5) * wave * u);
    p.setY(i, p.getY(i) - u * u * len * 0.18 + Math.sin(u * 5 + 1) * 0.15 * u);
  }
  geo.computeVertexNormals();
  const m = fogged(new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.5, emissive: 0xff4a98, emissiveIntensity: 0.9, side: THREE.DoubleSide }));
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.x = len / 2;
  g.add(mesh);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), m);
  g.add(knot);
  const h = halo(0xff7ab0, 3.2, 0.4);
  h.position.set(len * 0.5, -0.2, 0);
  g.add(h);
  return g;
}
