import * as THREE from 'three';
import { fbm } from '../../src/act2/kit/noise';
import { rng } from '../../src/core/util';
import { blob, lathe, lin, merge, mixRgb, mulRgb, strip, tube, type Rgb } from './geo';
import { fogged, glowMat, std } from './shade';
import { glowSprite } from './fx';
import { V } from './g-common';

/**
 * The Toll Queen (lavender light): a bell of old gold as big as a house, hung from a gallows of two dead trunks over the marsh, with a great winged eye on its face.
 * When it tolls the marsh rings. Local origin: the ground in the middle of the arena, under the bell; the eye faces +z.
 */
export function makeTollQueen(swing = 0): THREE.Group {
  const g = new THREE.Group();
  const r = rng(53);
  const wood = (t: number, a: number, p: THREE.Vector3): Rgb => {
    const n = fbm(p.x * 0.5, p.y * 0.2, p.z * 0.5, 3, 4);
    const moss = Math.max(0, fbm(p.x * 0.4, p.y * 0.4, p.z * 0.4, 2, 8) - 0.55) * 2.4;
    return mulRgb(mixRgb(mixRgb(lin(0x12101a), lin(0x2a2536), n * 1.5), lin(0x5a4a8a), moss), 0.75 + 0.5 * a);
  };
  const woodMat = std({ vertexColors: true, roughness: 0.85, vary: 0.45, bump: 1.6, streak: 1, rim: { color: 0xc8a8ff, k: 0.3 } });

  // the gallows: two twisted dead trunks and a beam
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const pts = [V(sx * 12, -1, 0), V(sx * 11.4, 8, -0.8), V(sx * 12.2, 17, 0.6), V(sx * 11, 27.5, 0)];
    const path = new THREE.CatmullRomCurve3(pts).getPoints(20);
    parts.push(tube(path, path.map((_, k) => 2.6 - 1.4 * (k / 20)), 10, wood));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + sx;
      const d = V(Math.cos(a), 0, Math.sin(a));
      const rp = new THREE.CatmullRomCurve3([V(sx * 12, 5.5, 0).addScaledVector(d, 1.5), V(sx * 12, 2, 0).addScaledVector(d, 4), V(sx * 12, -1.5, 0).addScaledVector(d, 8)]).getPoints(6);
      parts.push(tube(rp, rp.map((_, k) => 1.3 * (1 - 0.8 * (k / 6))), 6, wood));
    }
    // dead branches reaching up
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const base = V(sx * 11, 24 + r() * 3, 0);
      parts.push(tube([base, base.clone().add(V(Math.cos(a) * 3, 3 + r() * 2, Math.sin(a) * 3)), base.clone().add(V(Math.cos(a) * 6, 6 + r() * 3, Math.sin(a) * 6))], [0.6, 0.4, 0.04], 5, wood));
    }
  }
  const beam = new THREE.CatmullRomCurve3([V(-12.5, 26.6, 0), V(0, 25.9, 0), V(12.5, 26.6, 0)]).getPoints(16);
  parts.push(tube(beam, beam.map(() => 1.15), 8, wood));
  g.add(new THREE.Mesh(merge(parts), woodMat));

  // the bell: old gold, three bands, a crown ring, and a clapper
  const gold = (t: number, a: number, p: THREE.Vector3): Rgb => {
    const n = fbm(p.x * 0.6, p.y * 0.6, p.z * 0.6, 3, 2);
    return mulRgb(mixRgb(lin(0x8a6a22), lin(0xf0d06a), Math.min(1, 0.35 + n * 0.9)), 0.8 + 0.4 * a);
  };
  const bellMat = std({ vertexColors: true, roughness: 0.36, metalness: 0.62, side: THREE.DoubleSide, emissive: 0x1a1002, emissiveIntensity: 0.6, rim: { color: 0xd9b8ff, k: 0.5 } });
  const prof: [number, number][] = [[8.2, 0], [8.6, 0.35], [7.9, 1.1], [7.0, 2.8], [5.9, 6.2], [4.6, 10], [3.4, 13.2], [2.2, 15.2], [1.2, 16.2]];
  const bell = new THREE.Group();
  bell.add(new THREE.Mesh(lathe(prof, 40, gold, (a, y) => 1 + 0.012 * Math.sin(a * 9 + y)), bellMat));
  for (const [y, rr] of [[1.7, 7.6], [4.4, 6.5], [11.2, 3.9]] as [number, number][]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.32, 8, 44), bellMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    bell.add(band);
  }
  const crown = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.38, 8, 20), bellMat);
  crown.position.y = 17.3;
  bell.add(crown);
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), bellMat);
  clapper.position.y = 1.2;
  bell.add(clapper);
  bell.position.y = 6.6;
  g.add(bell);
  // chains from the beam to the crown
  const ironMat = fogged(new THREE.MeshStandardMaterial({ color: 0x1c1a24, roughness: 0.5, metalness: 0.7 }), { rim: { color: 0xd9b8ff, k: 0.5 } });
  for (let k = 0; k < 6; k++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.15, 6, 14), ironMat);
    link.position.set(0, 25.3 - k * 0.78, 0);
    link.rotation.y = k % 2 ? Math.PI / 2 : 0;
    link.scale.y = 1.4;
    g.add(link);
  }

  // the winged eye on its face
  const eye = new THREE.Group();
  eye.position.set(0, 6.6 + 9.6, 5.05);
  eye.rotation.x = -0.33;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 40), glowMat({ color: 0xcfb0ff, opacity: 0.7 }));
  lens.scale.set(3.3, 2.0, 1);
  eye.add(lens);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xf2e8ff }));
  halo.scale.set(2.7, 1.28, 1);
  halo.position.z = 0.05;
  eye.add(halo);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0x4a2a8a }));
  iris.scale.set(1.0, 1.0, 1);
  iris.position.z = 0.1;
  eye.add(iris);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x07030f }));
  pupil.scale.set(0.3, 0.9, 1);
  pupil.position.z = 0.15;
  eye.add(pupil);
  g.add(eye);
  const featherMat = std({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x4a2a90, emissiveIntensity: 0.5, rim: { color: 0xf2e8ff, k: 0.5 } });
  const feathers: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (let f = 0; f < 9; f++) {
      const t = f / 8;
      const ang = (62 - 78 * t) * (Math.PI / 180);
      const len = 6 + 9 * Math.sin(t * Math.PI * 0.9 + 0.3);
      const dir = V(sx * Math.cos(ang), Math.sin(ang), 0.18).normalize();
      const start = V(sx * 3.6, 6.6 + 10.0 + (t - 0.5) * 1.0, 4.2);
      const path = [0, 0.25, 0.55, 0.8, 1].map((u) => start.clone().addScaledVector(dir, u * len).add(V(0, -u * u * len * 0.12, u * 0.6)));
      const side = V(-dir.y, dir.x * sx, 0).normalize();
      feathers.push(strip(path, [0.5, 1.3, 1.6, 1.1, 0.1], side, (u) => mixRgb(lin(0x5a3ab0), lin(0xcfc0ff), u), 0.1, 3));
    }
  }
  g.add(new THREE.Mesh(merge(feathers), featherMat));
  g.add(glowSprite(0, 17.4, 5, 16, 0xcfb0ff, 0.22));
  g.add(glowSprite(0, 12, 0, 34, 0xb08aff, 0.07));
  const l = new THREE.PointLight(0xc8a0ff, 140, 70, 1.5);
  l.position.set(0, 21, 15);
  g.add(l);
  // wisps of lavender fire that drift round the rim
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const w = new THREE.Mesh(blob(V(0, 0, 0), 0.5, 1, () => lin(0xe0d0ff), k, 0.2, 1.8), glowMat({ color: 0xd9b8ff, opacity: 0.85 }));
    w.position.set(Math.cos(a) * 9.5, 5.5 + (k % 3) * 1.2, Math.sin(a) * 9.5);
    g.add(w);
    g.add(glowSprite(w.position.x, w.position.y, w.position.z, 3.6, 0xcfb0ff, 0.3));
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== undefined && !((o as THREE.Mesh).material as THREE.Material).transparent) (o as THREE.Mesh).castShadow = true;
  });
  if (swing) {
    // everything but the gallows hangs from the beam and swings with the bell
    const pivot = new THREE.Group();
    pivot.position.set(0, 25.9, 0);
    const inner = new THREE.Group();
    inner.position.set(0, -25.9, 0);
    pivot.add(inner);
    for (const ch of g.children.slice(1)) inner.add(ch);
    g.add(pivot);
    pivot.rotation.x = swing;
  }
  return g;
}
