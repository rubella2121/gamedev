import * as THREE from 'three';
import { fbm } from '../../src/act2/kit/noise';
import { rng } from '../../src/core/util';
import { blob, lathe, lin, merge, mixRgb, strip, tube, type Rgb } from './geo';
import { glowMat, std } from './shade';
import { glowSprite } from './fx';
import { V } from './g-common';

/**
 * The Mimic Queen (pink light): a flower the size of a house, with a ring of blue petals, a maw of teeth and a lure on a stalk that dangles a pink flower over it.
 * Every flower in the meadow might be hers. Local origin: the foot of the stalk; the maw faces +z and up.
 */
export function makeMimicQueen(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(77);
  const petalMat = std({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x0a1650, emissiveIntensity: 0.55, rim: { color: 0x7aa8ff, k: 0.45 } });
  const stemMat = std({ vertexColors: true, roughness: 0.7, vary: 0.4, rim: { color: 0xff8aa8, k: 0.5 } });
  const toothMat = std({ vertexColors: true, roughness: 0.35, emissive: 0x7a2a40, emissiveIntensity: 0.7, rim: { color: 0xffc0d0, k: 0.8 } });

  // stalk and leaves
  const stalk = new THREE.CatmullRomCurve3([V(0, -2, -7), V(0, 2, -6), V(0, 6, -3.2), V(0, 9, 0)]).getPoints(12);
  const stemCol = (t: number): Rgb => mixRgb(lin(0x0e3a3a), lin(0x2a7a68), t);
  const stem = [tube(stalk, stalk.map((_, k) => 1.9 - 0.5 * (k / 12)), 10, stemCol)];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    const d = V(Math.cos(a), 0, Math.sin(a));
    const path = [0, 0.3, 0.65, 1].map((t) => V(0, 0, -6).addScaledVector(d, 2 + t * 13).add(V(0, 1.5 + Math.sin(t * 2.6) * 5 - t * t * 2, 0)));
    stem.push(strip(path, [1.5, 4.4, 4.2, 0.4], V(0, 1, 0), (t, aa) => mixRgb(lin(0x0e3a3a), lin(0x3a9a78), t * (0.5 + 0.5 * Math.abs(aa - 0.5) * 2)), 0.15));
  }
  g.add(new THREE.Mesh(merge(stem), stemMat));

  // the head, built with its axis up and then tilted to face the way you come from
  const head = new THREE.Group();
  const petals: THREE.BufferGeometry[] = [];
  const NP = 11;
  for (let i = 0; i < NP; i++) {
    const phi = (i / NP) * Math.PI * 2 + r() * 0.25;
    const open = 0.8 + r() * 0.4;
    const rd = V(Math.cos(phi), 0, Math.sin(phi));
    const path = [0, 0.18, 0.4, 0.62, 0.82, 1].map((u) => V(0, 0, 0).addScaledVector(rd, 2.6 + (4.2 + 4.0 * open) * u + 3.2 * u * u * u).add(V(0, 0.4 + 12 * u - 4 * u * u * u, 0)));
    const wid = [1.6, 3.6, 5.2, 5.4, 4.0, 0.6];
    const side = V(-Math.sin(phi), 0, Math.cos(phi));
    petals.push(strip(path, wid, side, (u, a, p) => {
      const vein = Math.abs(Math.sin(a * Math.PI * 7 + i)) < 0.09 ? 0.55 : 1;
      let c = mixRgb(mixRgb(lin(0x0a1470), lin(0x1f58ff), Math.min(1, u * 1.6)), lin(0x9ad8ff), Math.max(0, u - 0.62) * 2.2);
      c = mixRgb(c, lin(0xff8aa8), Math.max(0, 0.18 - u) * 2.5);
      const n = fbm(p.x * 0.5, p.y * 0.5, p.z * 0.5, 2, 3);
      return [c[0] * vein * (0.8 + 0.4 * n), c[1] * vein * (0.8 + 0.4 * n), c[2] * vein * (0.8 + 0.4 * n)];
    }, 0.12, 5));
  }
  head.add(new THREE.Mesh(merge(petals), petalMat));
  // the throat: a funnel that goes down into the dark, with a pink light at the bottom
  const funnel = lathe([[4.4, 1.0], [3.8, 0], [2.8, -1.4], [1.8, -3.2], [1.0, -5]], 24, (t) => mixRgb(lin(0x3a0a24), lin(0x14040c), t));
  // the green cup the petals grow from, which hides the outside of the throat
  head.add(new THREE.Mesh(lathe([[1.9, -4.4], [2.6, -3.2], [4.0, -1.8], [5.0, -0.2], [5.2, 0.8]], 24, (t) => mixRgb(lin(0x0e3a3a), lin(0x2a8a74), t)), stemMat));
  head.add(new THREE.Mesh(funnel, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x4a0a2a, emissiveIntensity: 0.8 })));
  const teeth: THREE.BufferGeometry[] = [];
  const rings: [number, number, number, number][] = [[4.1, 0.7, 24, 2.7], [3.1, -0.8, 17, 2.3], [2.2, -2.6, 12, 1.9], [1.3, -4, 8, 1.4]];
  for (const [rho, y0, n, len] of rings) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (rho % 1) * 3;
      const base = V(Math.cos(a) * rho, y0, Math.sin(a) * rho);
      const tip = base.clone().add(V(-Math.cos(a) * len * 0.5, len * 0.86, -Math.sin(a) * len * 0.5));
      const mid = base.clone().lerp(tip, 0.5).add(V(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25));
      teeth.push(tube([base, mid, tip], [0.46, 0.34, 0.03], 5, (t) => mixRgb(lin(0xffe2ec), lin(0xff7aa0), t * t)));
    }
  }
  head.add(new THREE.Mesh(merge(teeth), toothMat));
  head.add(glowSprite(0, -2, 0, 12, 0xff4a8a, 0.55));
  const inner = new THREE.PointLight(0xff4a8a, 260, 40, 1.6);
  inner.position.set(0, 1, 0);
  head.add(inner);
  head.position.set(0, 9.3, 0);
  head.rotation.x = 0.8;
  g.add(head);

  // the lure: a thin stalk that arches over and dangles a flower that glows
  const lure = new THREE.CatmullRomCurve3([V(0, 8, -5), V(0, 19, -11), V(0, 31, -5), V(0, 33, 6), V(0, 28, 13)]).getPoints(26);
  g.add(new THREE.Mesh(tube(lure, lure.map((_, k) => 0.42 * (1 - 0.6 * (k / 26))), 6, (t) => mixRgb(lin(0xd8b0c0), lin(0xffd0e0), t)), stemMat));
  const bulb = new THREE.Group();
  bulb.position.copy(lure[26]!).add(V(0, -1.6, 0.4));
  bulb.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 14), glowMat({ color: 0xffc0d8 })));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const pet = new THREE.Mesh(blob(V(0, 0, 0), 1, 1, () => lin(0xff9ac0), k, 0.05, 0.4), glowMat({ color: 0xff8ab4, opacity: 0.9 }));
    pet.scale.set(1.5, 0.5, 0.8);
    pet.position.set(Math.cos(a) * 1.7, 0.1, Math.sin(a) * 1.7);
    pet.rotation.y = -a;
    bulb.add(pet);
  }
  bulb.add(glowSprite(0, 0, 0, 16, 0xff6aa0, 0.8));
  const bl = new THREE.PointLight(0xff6aa0, 380, 50, 1.5);
  bl.position.set(0, 0.5, 0);
  bulb.add(bl);
  g.add(bulb);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== undefined && !((o as THREE.Mesh).material as THREE.Material).transparent) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}
