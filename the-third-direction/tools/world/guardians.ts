import * as THREE from 'three';
import { fbm } from '../../src/act2/kit/noise';
import { rng } from '../../src/core/util';
import { blob, glowOf, lathe, lin, merge, mixRgb, mulRgb, strip, tube, type Rgb } from './geo';
import { fogged, glowMat, std } from './shade';
import { glowSprite } from './fx';

/**
 * The five guardians as places you can see from far away: big, simple silhouettes with one colour of light each. Concept models for the world mock-up (the game's own bosses are
 * in src/act2/models). Local coordinates: origin on the ground at the middle of the arena, the guardian faces +z (towards you as you come in), 1 unit = the Blob is 1.8.
 */

import { V, frameAt } from './g-common';

/* ------------------------------------------------------------------------------------------ */
/* the Bone Wyrm (ivory): a skeleton so big the road runs under its ribs                          */
/* ------------------------------------------------------------------------------------------ */

export function makeBoneWyrm(): THREE.Group {
  const g = new THREE.Group();
  const bone = (t: number, a: number, p: THREE.Vector3): Rgb => {
    const n = fbm(p.x * 0.3, p.y * 0.3, p.z * 0.3, 3, 17);
    const stain = fbm(p.x * 0.8, p.y * 0.8, p.z * 0.8, 2, 5);
    let c = mixRgb(lin(0xb2a68a), lin(0xf3ecd6), Math.min(1, n * 1.5));
    c = mixRgb(c, lin(0x6a5a40), Math.max(0, stain - 0.62) * 1.8);
    return mulRgb(c, 0.78 + 0.3 * a);
  };
  const mat = std({ vertexColors: true, roughness: 0.72, vary: 0.45, bump: 1.3, scale: [0.5, 0.5], rim: { color: 0xf4efe0, k: 0.55 } });
  const parts: THREE.BufferGeometry[] = [];
  const spine = new THREE.CatmullRomCurve3([V(34, -2, -82), V(28, 3, -62), V(12, 10, -46), V(-8, 14, -34), V(-17, 10, -18), V(-9, 4, -4), V(-2, 12, 3), V(2, 20, 7), V(1, 25, 12)], false, 'catmullrom', 0.5);
  const N = 54;
  const r = rng(31);
  // the cord that holds the vertebrae together
  const cord = spine.getPoints(160);
  parts.push(tube(cord, cord.map((_, k) => 0.55 + 0.35 * Math.max(0, (k / 160 - 0.8) / 0.2)), 6, bone, false));
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const f = frameAt(spine, Math.min(0.995, u));
    const rad = 1.0 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.1)) ** 0.7 + 0.5 * Math.max(0, (u - 0.78) / 0.22);
    parts.push(blob(f.p, rad * 0.85, 1, bone, i * 1.7, 0.18, 0.9));
    // little wings of bone on each side of the vertebra
    for (const sd of [-1, 1]) parts.push(tube([f.p.clone().addScaledVector(f.side, sd * rad * 0.6), f.p.clone().addScaledVector(f.side, sd * (rad + 1.6)).addScaledVector(f.up, -0.4)], [0.28, 0.03], 4, bone));
    // the spine on top, a tooth that leans back
    const L = 1.4 + 2.6 * Math.sin(Math.PI * u) ** 0.8;
    parts.push(tube([f.p.clone().addScaledVector(f.up, rad * 0.7), f.p.clone().addScaledVector(f.up, rad + L * 0.6).addScaledVector(f.t, -L * 0.2), f.p.clone().addScaledVector(f.up, rad + L).addScaledVector(f.t, -L * 0.55)], [0.34, 0.2, 0.03], 4, bone));
    // the ribs, from the shoulders to the hips, big in the middle
    if (u > 0.1 && u < 0.64) {
      const rl = 3 + 8.5 * Math.sin((Math.PI * (u - 0.1)) / 0.54) ** 0.8;
      for (const sd of [-1, 1]) {
        const o = f.p.clone().addScaledVector(f.side, sd * rad * 0.7);
        const pts = [o, o.clone().addScaledVector(f.side, sd * rl * 0.5).addScaledVector(f.up, rl * 0.18), o.clone().addScaledVector(f.side, sd * rl * 0.78).addScaledVector(f.up, -rl * 0.5), o.clone().addScaledVector(f.side, sd * rl * 0.55).addScaledVector(f.up, -rl * 1.05).addScaledVector(f.t, r() * 0.8)];
        const c = new THREE.CatmullRomCurve3(pts).getPoints(9);
        parts.push(tube(c, c.map((_, k) => 0.42 * (1 - 0.86 * (k / (c.length - 1)) ** 1.2)), 5, bone));
      }
    }
  }
  // the skull, built flat along +z and then turned to follow the end of the neck
  const head = new THREE.Group();
  const bm = (geo: THREE.BufferGeometry, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    head.add(m);
    return m;
  };
  const ball = () => blob(V(0, 0, 0), 1, 3, bone, r() * 9, 0.1, 1);
  bm(ball(), 3.0, 2.4, 4.4, 0, 0, 0);
  bm(ball(), 1.7, 1.25, 5.0, 0, -0.25, 6.0, -0.04);
  bm(ball(), 1.5, 0.72, 5.4, 0, -2.0, 4.7, 0.2);
  for (let k = 0; k < 9; k++) {
    for (const sd of [-1, 1]) {
      const z = 3.2 + k * 0.78;
      const w = 1.3 - k * 0.025;
      head.add(new THREE.Mesh(tube([V(sd * w, -1.2, z), V(sd * w, -2.1 - (k % 2) * 0.3, z + 0.05)], [0.2, 0.01], 4, () => lin(0xfff6e0)), mat));
      head.add(new THREE.Mesh(tube([V(sd * (w - 0.1), -1.65, z + 0.3), V(sd * (w - 0.1), -0.9 - (k % 2) * 0.25, z + 0.32)], [0.17, 0.01], 4, () => lin(0xfff6e0)), mat));
    }
  }
  for (const sd of [-1, 1]) {
    // eye sockets: a dark hollow with a cold light in it
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.78, 18, 14), new THREE.MeshBasicMaterial({ color: 0x07060a }));
    socket.position.set(sd * 1.78, 0.55, 1.5);
    head.add(socket);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 10), glowMat({ color: 0xeaf4ff }));
    eye.position.set(sd * 1.95, 0.6, 1.78);
    head.add(eye);
    const sp = glowSprite(sd * 2.1, 0.62, 1.9, 5.5, 0xdfefff, 0.6);
    head.add(sp);
    // horns that sweep back over the neck
    const hp = new THREE.CatmullRomCurve3([V(sd * 1.5, 1.7, -0.8), V(sd * 2.3, 3.2, -2.8), V(sd * 2.8, 4.2, -6.2), V(sd * 2.4, 3.8, -9)]).getPoints(10);
    const horn = new THREE.Mesh(tube(hp, hp.map((_, k) => 0.55 * (1 - 0.9 * (k / (hp.length - 1)))), 6, bone), mat);
    head.add(horn);
    // cheek spikes
    head.add(new THREE.Mesh(tube([V(sd * 2.6, -0.6, 1.8), V(sd * 3.8, -0.9, 0.6), V(sd * 4.6, -1.7, -0.7)], [0.4, 0.28, 0.02], 5, bone), mat));
  }
  for (const sd of [-1, 1]) bm(ball(), 1.0, 0.45, 1.6, sd * 1.7, 1.35, 1.6, 0.1);
  for (let k = 0; k < 6; k++) head.add(new THREE.Mesh(tube([V(0, 2.1 - k * 0.1, -0.5 - k * 1.1), V(0, 3.4 - k * 0.25, -1.1 - k * 1.3), V(0, 3.6 - k * 0.3, -1.9 - k * 1.5)], [0.4 - k * 0.04, 0.22, 0.02], 5, bone), mat));
  const end = frameAt(spine, 0.995);
  const dir = V(0.05, -0.28, 1).normalize();
  head.position.copy(end.p).add(V(0, -0.5, 0));
  head.quaternion.setFromUnitVectors(V(0, 0, 1), dir);
  g.add(head);
  const body = new THREE.Mesh(merge(parts), mat);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  head.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== undefined && !((o as THREE.Mesh).material as THREE.Material).transparent) (o as THREE.Mesh).castShadow = true;
  });
  void glowOf;
  void lathe;
  void strip;
  void fogged;
  return g;
}
