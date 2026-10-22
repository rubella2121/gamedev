import * as THREE from 'three';
import { fbm } from '../../src/act2/kit/noise';
import { rng } from '../../src/core/util';
import { blob, lathe, lin, merge, mixRgb, mulRgb, strip, tube, type Rgb } from './geo';
import { glowMat, std } from './shade';
import { glowSprite } from './fx';
import { V } from './g-common';

/**
 * The Gloommother (cyan light): a queen of shadow in a gown of torn night that spreads over the whole hollow, a crown of thorns, long hands, and eyes: dozens of them, opening all over
 * her and in the dark round her feet (the gloomlings). Local origin: the ground under her; she faces +z.
 */

/** a small cyan eye with a slit pupil, on a surface facing `n` */
export function eyeAt(p: THREE.Vector3, n: THREE.Vector3, size: number, color = 0x8ff8ff): THREE.Group {
  const e = new THREE.Group();
  const lens = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), glowMat({ color }));
  lens.scale.set(size, size * 0.62, size * 0.35);
  e.add(lens);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x021012 }));
  pupil.scale.set(size * 0.16, size * 0.55, size * 0.2);
  pupil.position.z = size * 0.26;
  e.add(pupil);
  e.position.copy(p);
  e.lookAt(p.clone().add(n));
  return e;
}

export function makeGloommother(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(91);
  const night = (t: number, a: number, p: THREE.Vector3): Rgb => {
    const n = fbm(p.x * 0.25, p.y * 0.18, p.z * 0.25, 3, 6);
    return mulRgb(mixRgb(lin(0x010607), lin(0x0a2a30), Math.min(1, n * 1.4)), 0.8 + 0.4 * a);
  };
  const cloth = std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, cut: { scale: 1.3, lo: 0.34, hi: 0.46, sy: 0.16 }, emissive: 0x041418, emissiveIntensity: 0.6, rim: { color: 0x6ff0ff, k: 1.1 } });

  // the gown: wide at the hem, pinched at the waist, broad at the shoulders
  const prof: [number, number][] = [[13.5, 0.2], [12, 2.5], [9.4, 7], [6.8, 13], [4.8, 18.5], [3.5, 22.5], [4.7, 25.2], [3.8, 27.6], [3.1, 29]];
  const fold = (a: number, y: number) => 1 + 0.11 * Math.sin(a * 7 + y * 0.25) + 0.07 * Math.sin(a * 13 - y * 0.4) + (y < 3 ? 0.07 * Math.sin(a * 23) : 0);
  g.add(new THREE.Mesh(lathe(prof, 56, night, fold), cloth));
  // light inside the gown, seen through the tears
  g.add(new THREE.Mesh(lathe(prof.map(([rr, y]) => [rr * 0.93, y] as [number, number]), 40, (t) => [0, 0.5 * (1 - t) ** 1.4 * 0.9, 0.6 * (1 - t) ** 1.4], fold), glowMat({ vertexColors: true, side: THREE.BackSide, opacity: 0.9 })));
  // the hem frays into ribbons that trail over the ground
  const rib: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + r() * 0.1;
    const d = V(Math.cos(a), 0, Math.sin(a));
    const L = 5 + r() * 9;
    const path = [0, 0.3, 0.65, 1].map((u) => d.clone().multiplyScalar(13 + u * L).add(V(0, 1.6 * (1 - u) + 0.1, 0)).add(V(-d.z, 0, d.x).multiplyScalar(Math.sin(u * 3 + i) * 1.2)));
    rib.push(strip(path, [2.2, 1.9, 1.1, 0.1], V(-d.z, 0, d.x), night, 0.1, 2));
  }
  g.add(new THREE.Mesh(merge(rib), cloth));

  // arms that hang to the ground, and long fingers
  const arms: THREE.BufferGeometry[] = [];
  const handY = 4.4;
  for (const sx of [-1, 1]) {
    const pts = new THREE.CatmullRomCurve3([V(sx * 4.2, 24, 0.5), V(sx * 8.2, 17, 3.2), V(sx * 10.2, 9.4, 6.2), V(sx * 11, handY + 1, 8.6)]).getPoints(14);
    arms.push(tube(pts, pts.map((_, k) => 1.2 - 0.55 * (k / 14)), 8, night));
    for (let f = 0; f < 5; f++) {
      const a = -0.7 + f * 0.35;
      const L = 3.6 + r() * 2.4;
      const base = V(sx * 11, handY + 0.4, 8.8);
      const dir = V(Math.sin(a) * 0.6 + sx * 0.25, -0.35, 1).normalize();
      const fp = [0, 0.4, 0.75, 1].map((u) => base.clone().addScaledVector(dir, u * L).add(V(0, -u * u * 1.6, 0)));
      arms.push(tube(fp, [0.3, 0.26, 0.18, 0.03], 5, night));
    }
  }
  g.add(new THREE.Mesh(merge(arms), std({ vertexColors: true, roughness: 0.7, rim: { color: 0x6ff0ff, k: 1.2 } })));

  // the head: a black cowl, a pale mask, a column of eyes, and a crown of thorns
  const cowl = new THREE.Mesh(blob(V(0, 0, 0), 1, 3, night, 5, 0.06, 1), cloth);
  cowl.scale.set(3.1, 4.4, 3.1);
  cowl.position.set(0, 31, 0.2);
  g.add(cowl);
  const mask = new THREE.Mesh(blob(V(0, 0, 0), 1, 3, () => lin(0xb8eef2), 9, 0.03, 1), new THREE.MeshStandardMaterial({ color: 0xc8f4f8, roughness: 0.4, emissive: 0x2a8a96, emissiveIntensity: 0.7 }));
  mask.scale.set(1.9, 2.8, 1.45);
  mask.position.set(0, 30.6, 1.5);
  g.add(mask);
  for (const [sx, y, s] of [[-1, 31.6, 0.82], [1, 31.6, 0.82], [-1, 29.6, 0.52], [1, 29.6, 0.52]] as [number, number, number][]) g.add(eyeAt(V(sx * 0.95, y, 2.75), V(sx * 0.25, 0, 1), s));
  g.add(eyeAt(V(0, 27.9, 3.0), V(0, -0.1, 1), 0.4));
  const crown: THREE.BufferGeometry[] = [];
  const tipsGlow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const h = 8 + r() * 7;
    const base = V(Math.cos(a) * 1.8, 34.2, Math.sin(a) * 1.4 + 0.2);
    const path = new THREE.CatmullRomCurve3([base, base.clone().add(V(Math.cos(a) * 2.2, h * 0.4, Math.sin(a) * 1.8)), base.clone().add(V(Math.cos(a) * 4.8, h * 0.75, Math.sin(a) * 3.2)), base.clone().add(V(Math.cos(a) * 6.2, h, Math.sin(a) * 4.2))]).getPoints(10);
    crown.push(tube(path, path.map((_, k) => 0.5 * (1 - 0.94 * (k / 10))), 5, night));
    const fk = path[6]!;
    crown.push(tube([fk, fk.clone().add(V(Math.cos(a + 0.8) * 2.2, 2.6, Math.sin(a + 0.8) * 2.2))], [0.25, 0.02], 4, night));
    tipsGlow.push(tube(path.slice(8), path.slice(8).map((_, k) => 0.14 * (1 - k / 2)), 4, () => lin(0x8ff8ff)));
  }
  g.add(new THREE.Mesh(merge(crown), std({ vertexColors: true, roughness: 0.6, rim: { color: 0x6ff0ff, k: 1.0 } })));
  g.add(new THREE.Mesh(merge(tipsGlow), glowMat({ vertexColors: true })));
  // eyes opening all over the gown
  for (let i = 0; i < 16; i++) {
    const y = 9 + r() * 19;
    let rr = 4;
    for (let k = 0; k + 1 < prof.length; k++) if (y >= prof[k]![1] && y <= prof[k + 1]![1]) rr = prof[k]![0] + ((prof[k + 1]![0] - prof[k]![0]) * (y - prof[k]![1])) / (prof[k + 1]![1] - prof[k]![1]);
    const a = Math.PI * 0.5 + (r() - 0.5) * 2.6;
    const n = V(Math.cos(a), 0.1, Math.sin(a));
    g.add(eyeAt(n.clone().multiplyScalar(rr * 1.02).setY(y), n, 0.28 + r() * 0.35));
  }
  // the dark that spreads from her over the ground, and the gloomlings in it
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const cx = c.getContext('2d')!;
  const grd = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.92)');
  grd.addColorStop(0.55, 'rgba(0,3,4,0.8)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = grd;
  cx.fillRect(0, 0, 128, 128);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.35;
  pool.renderOrder = 3;
  g.add(pool);
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const d = 13 + r() * 14;
    const s = 0.8 + r() * 0.9;
    const gl = new THREE.Mesh(blob(V(0, 0, 0), 1, 2, night, i, 0.14, 0.8), std({ vertexColors: true, roughness: 0.8, rim: { color: 0x6ff0ff, k: 0.9 } }));
    gl.scale.set(s * 1.1, s * 0.85, s * 1.3);
    gl.position.set(Math.cos(a) * d, s * 0.7, Math.sin(a) * d);
    gl.rotation.y = Math.atan2(-Math.cos(a) * d + 0, -Math.sin(a) * d + 18) + (r() - 0.5);
    g.add(gl);
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s, 8, 6), glowMat({ color: 0x8ff8ff }));
      e.position.set(0, 0, 0);
      gl.add(e);
      e.position.set(sx * 0.35, 0.18, 0.92);
      e.scale.set(1, 1.4, 0.6);
    }
  }
  g.add(glowSprite(0, 31, 3, 15, 0x6ff0ff, 0.28));
  g.add(glowSprite(0, 12, 0, 40, 0x2ad0e0, 0.08));
  const l = new THREE.PointLight(0x6ff0ff, 200, 70, 1.5);
  l.position.set(0, 22, 9);
  g.add(l);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== undefined && !((o as THREE.Mesh).material as THREE.Material).transparent) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}
