import * as THREE from 'three';
import { fbm } from '../../src/act2/kit/noise';
import { rng } from '../../src/core/util';
import { blob, glowOf, lin, merge, mixRgb, mulRgb, tube, type Rgb } from './geo';
import { glowMat, std } from './shade';
import { glowSprite } from './fx';
import { V } from './g-common';

/**
 * The Thornback King (amber light): an armoured beetle with a dragon's head, asleep in the thicket so long that moss and thorns grew over its back until it looked like a hill.
 * Amber light leaks out of every crack. Local origin: the ground under its middle; it lies along z with its head (on the ground, in front) towards +z.
 */
export function makeThornbackKing(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(61);
  const SX = 11.5;
  const SY = 8.4;
  const SZ = 17;
  const CY = 7;
  const CZ = -3;
  const shell = (t: number, a: number, p: THREE.Vector3): Rgb => {
    const n = fbm(p.x * 0.18, p.y * 0.18, p.z * 0.18, 3, 12);
    const moss = Math.max(0, fbm(p.x * 0.14 + 3, p.y * 0.14, p.z * 0.14, 3, 22) - 0.5) * 2.6;
    let c = mixRgb(lin(0x1c130d), lin(0x4a3322), Math.min(1, n * 1.6));
    c = mixRgb(c, lin(0x3a4a1c), Math.min(1, moss) * (p.y > 6 ? 1 : 0.3));
    return mulRgb(c, 0.8 + 0.3 * a);
  };
  const hide = std({ vertexColors: true, roughness: 0.85, vary: 0.5, bump: 2.2, scale: [0.3, 0.3], rim: { color: 0xffa04a, k: 0.55 } });
  const plate = std({ vertexColors: true, roughness: 0.55, metalness: 0.15, vary: 0.3, rim: { color: 0xffa04a, k: 0.7 } });
  const crackAt = (p: THREE.Vector3): boolean => Math.abs(fbm(p.x * 0.16, p.y * 0.16, p.z * 0.16, 3, 41) - 0.5) < 0.022;

  // the carapace, with cracks that glow
  const dome = blob(V(0, 0, 0), 1, 4, shell, 3.1, 0.05, 1);
  dome.scale(SX, SY, SZ);
  dome.translate(0, CY, CZ);
  dome.computeVertexNormals();
  const domeMesh = new THREE.Mesh(dome, hide);
  g.add(domeMesh);
  g.add(new THREE.Mesh(glowOf(dome, (p) => (crackAt(p) && p.y > CY - 2 ? lin(0xff8a22) : null), 0.12), glowMat({ vertexColors: true })));
  // armour bands over the back
  const bands: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) {
    const z = CZ + (k - 4) * 3.5;
    const f = Math.sqrt(Math.max(0.02, 1 - ((z - CZ) / SZ) ** 2));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const a = -Math.PI * 0.46 + (i / 18) * Math.PI * 0.92;
      pts.push(V(Math.sin(a) * SX * f * 1.03, CY + Math.cos(a) * SY * f * 1.03 - 0.4, z));
    }
    bands.push(tube(pts, pts.map((_, i) => 0.9 + 0.35 * Math.sin((i / 18) * Math.PI)), 6, (t, a, p) => mixRgb(lin(0x2a1a10), lin(0x6a4a2a), a * 0.8 + 0.1 * fbm(p.x, p.y, p.z, 2, 3)), false));
  }
  g.add(new THREE.Mesh(merge(bands), plate));
  // thorns: big along the spine, smaller down the flanks; their tips glow
  const thorns: THREE.BufferGeometry[] = [];
  const tips: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 96; i++) {
    const th = Math.pow(r(), 0.8) * 1.3;
    const ph = r() * Math.PI * 2;
    const nx = Math.sin(th) * Math.cos(ph);
    const ny = Math.cos(th);
    const nz = Math.sin(th) * Math.sin(ph);
    const base = V(nx * SX * 0.98, CY + ny * SY * 0.98 - 0.3, CZ + nz * SZ * 0.96);
    const n = V(nx / (SX * SX), ny / (SY * SY), nz / (SZ * SZ)).normalize();
    const L = (2.2 + 5.6 * (1 - th / 1.3) ** 1.6) * (0.7 + 0.6 * r());
    const dir = n.clone().add(V(0, 0.25, -0.3)).normalize();
    const tip = base.clone().addScaledVector(dir, L);
    const mid = base.clone().lerp(tip, 0.5).add(V(0, 0.2 * L * 0.2, -0.15 * L * 0.3));
    thorns.push(tube([base.clone().addScaledVector(n, -0.5), mid, tip], [0.34 + L * 0.075, 0.2 + L * 0.03, 0.02], 6, (t) => mixRgb(lin(0x2a1a10), lin(0x6a5238), t)));
    tips.push(tube([base.clone().lerp(tip, 0.68), tip], [0.1 + L * 0.015, 0.01], 5, () => lin(0xffa040)));
  }
  g.add(new THREE.Mesh(merge(thorns), plate));
  g.add(new THREE.Mesh(merge(tips), glowMat({ vertexColors: true })));

  // six legs, planted wide, with spiked knees and glowing joints
  const legs: THREE.BufferGeometry[] = [];
  const claws: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const z of [-9, 1, 10]) {
      const pts = new THREE.CatmullRomCurve3([V(sx * 9.6, 5.5, z), V(sx * 16.5, 10.5, z + 1.5), V(sx * 19.5, 4.2, z + 3), V(sx * 20.2, 0.4, z + 4.2)]).getPoints(12);
      legs.push(tube(pts, pts.map((_, k) => 3.3 - 1.6 * Math.sin((k / 12) * Math.PI * 0.9) + (k > 9 ? 0.5 : 0)), 8, (t, a, p) => shell(t, a, p)));
      legs.push(tube([V(sx * 16.5, 10.8, z + 1.5), V(sx * 17.2, 14.4, z + 0.6), V(sx * 17.6, 17, z - 0.4)], [0.9, 0.5, 0.03], 6, (t) => mixRgb(lin(0x3a2a1a), lin(0x8a6a3a), t)));
      for (let c = -1; c <= 1; c++) claws.push(tube([V(sx * 20.2 + c * 0.9, 0.7, z + 4.8), V(sx * 20.6 + c * 1.3, 0.5, z + 8.2)], [0.55, 0.03], 5, () => lin(0xc8a878)));
      g.add(glowSprite(sx * 16.5, 10.5, z + 1.5, 6, 0xff8a22, 0.4));
    }
  }
  g.add(new THREE.Mesh(merge(legs), hide));
  g.add(new THREE.Mesh(merge(claws), plate));

  // the neck and the head, resting on the ground in front of it
  const neck = new THREE.CatmullRomCurve3([V(0, 6.5, 11), V(0, 7.2, 18), V(0, 5, 24), V(0, 3, 28)]).getPoints(14);
  g.add(new THREE.Mesh(tube(neck, neck.map((_, k) => 4.2 - 1.2 * (k / 14)), 12, shell), hide));
  const head = new THREE.Group();
  const hb = (sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(blob(V(0, 0, 0), 1, 3, shell, r() * 7, 0.08, 1), hide);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    head.add(m);
  };
  hb(3.4, 2.7, 4.8, 0, 0, 0);
  hb(2.1, 1.5, 4.2, 0, -0.5, 5.6, 0.05);
  hb(1.9, 0.85, 4.6, 0, -2.0, 4.6, -0.05);
  for (const sd of [-1, 1]) {
    head.add(new THREE.Mesh(tube([V(sd * 2.2, 1.7, -1.4), V(sd * 3.3, 4.6, -3.4), V(sd * 4.4, 7.8, -7)], [1.0, 0.6, 0.03], 8, (t) => mixRgb(lin(0x2a1a10), lin(0xb89868), t * t)), plate));
    head.add(new THREE.Mesh(tube([V(sd * 1.0, 0.9, 8), V(sd * 1.2, 2.2, 9.2), V(sd * 1.2, 3.8, 9.3)], [0.5, 0.3, 0.02], 6, (t) => mixRgb(lin(0x2a1a10), lin(0xb89868), t)), plate));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glowMat({ color: 0xffa040 }));
    eye.scale.set(1.0, 0.28, 0.5);
    eye.position.set(sd * 2.6, 1.0, 2.5);
    eye.rotation.z = -sd * 0.3;
    head.add(eye);
    head.add(glowSprite(sd * 2.7, 1.0, 2.7, 5, 0xff8a22, 0.6));
    for (let k = 0; k < 6; k++) head.add(new THREE.Mesh(tube([V(sd * 1.5, -1.3, 3 + k * 1.2), V(sd * 1.5, -2.3, 3.1 + k * 1.2)], [0.26, 0.01], 4, () => lin(0xe8dcc0)), plate));
  }
  head.add(glowSprite(0, -1.5, 6, 6, 0xff7a1a, 0.5));
  head.position.set(0, 2.8, 32.2);
  head.rotation.x = 0.1;
  g.add(head);

  // the tail, with a club of thorns
  const tail = new THREE.CatmullRomCurve3([V(0, 6, -17), V(0, 4.4, -26), V(6, 2.8, -33), V(13, 3.2, -31), V(15.5, 5, -24.5)]).getPoints(16);
  g.add(new THREE.Mesh(tube(tail, tail.map((_, k) => 3.8 - 2.2 * (k / 16)), 10, shell), hide));
  const club = new THREE.Mesh(blob(V(0, 0, 0), 3.2, 3, shell, 7, 0.1, 1), hide);
  club.position.copy(tail[16]!).add(V(0.4, 0.5, 1.2));
  g.add(club);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const d = V(Math.cos(a), 0.3 + 0.7 * r(), Math.sin(a)).normalize();
    g.add(new THREE.Mesh(tube([club.position.clone().addScaledVector(d, 2.8), club.position.clone().addScaledVector(d, 6.2)], [0.8, 0.03], 6, (t) => mixRgb(lin(0x3a2a1a), lin(0x9a7a4a), t)), plate));
  }
  g.add(glowSprite(club.position.x, club.position.y, club.position.z, 9, 0xff8a22, 0.4));
  const l = new THREE.PointLight(0xff8a2a, 260, 60, 1.5);
  l.position.set(0, 14, 6);
  g.add(l);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== undefined && !((o as THREE.Mesh).material as THREE.Material).transparent) (o as THREE.Mesh).castShadow = true;
  });
  void domeMesh;
  return g;
}
