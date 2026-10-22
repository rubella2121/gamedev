import * as THREE from 'three';
import { rng } from '../../src/core/util';
import { lin, merge, mixRgb, strip, tube } from './geo';
import { glowMat, std } from './shade';
import { glowSprite } from './fx';
import { V } from './g-common';
import { BoxBatch } from './cubes';

/**
 * The Remix: where the Mash lives. Cold cyan stitches run across the floor and out over the void, petals drift, and the light turns pink and teal
 * (the "Mash mood" of the arena sheet: concept-art/3d-reference/arena-map-sheet.png).
 */

/** a thread of cyan light from `a` to `b` with a sag, and little cross-stitches along it */
export function makeThread(a: THREE.Vector3, b: THREE.Vector3, sag = 3, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed * 5 + 1);
  const mid = a.clone().lerp(b, 0.5).add(V(0, -sag, 0));
  const path = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(24);
  g.add(new THREE.Mesh(tube(path, path.map(() => 0.1), 4, () => lin(0x6af0ff), false), glowMat({ vertexColors: true, opacity: 0.9 })));
  const stitches: THREE.BufferGeometry[] = [];
  for (let i = 2; i < path.length - 1; i += 2) {
    const p = path[i]!;
    const d = path[i + 1]!.clone().sub(path[i - 1]!).normalize();
    const s = new THREE.Vector3(-d.z, 0.3, d.x).normalize().multiplyScalar(0.55 + r() * 0.2);
    stitches.push(tube([p.clone().sub(s), p.clone().add(s)], [0.08, 0.08], 3, () => lin(0x9ff8ff), false));
  }
  if (stitches.length) g.add(new THREE.Mesh(merge(stitches), glowMat({ vertexColors: true, opacity: 0.85 })));
  return g;
}

/** a stack of drifting petals (the Mimic's flower, taken apart): pink and teal, instanced */
export function makePetals(center: THREE.Vector3, spread: THREE.Vector3, n = 80, seed = 3): THREE.InstancedMesh {
  const r = rng(seed);
  const path = [V(0, 0, 0), V(0.3, 0.08, 0.5), V(0.7, 0.0, 1.0), V(1.0, -0.1, 1.5)];
  const geo = strip(path, [0.2, 0.9, 0.7, 0.1], V(1, 0, 0), (u) => mixRgb(lin(0xff7aa8), lin(0xffd0e0), u), 0.2, 2);
  const m = new THREE.InstancedMesh(geo, std({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x6a1a3a, emissiveIntensity: 0.8, rim: { color: 0xffc0d0, k: 0.8 } }), n);
  m.frustumCulled = false;
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    o.position.set(center.x + (r() - 0.5) * 2 * spread.x, center.y + (r() - 0.5) * 2 * spread.y, center.z + (r() - 0.5) * 2 * spread.z);
    o.rotation.set(r() * 6, r() * 6, r() * 6);
    const s = 0.35 + r() * 0.7;
    o.scale.set(s, s, s);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, c.setHex(r() < 0.55 ? 0xffffff : 0x9fe8e0));
  }
  return m;
}

/**
 * the long span as the Wyrm's spine: a chain of vertebrae hangs under the road (each wider than the road, with the wings of its transverse processes and a keel below), tilted
 * with the slope, so the road reads as the backbone of the thing that lives at the far end: the Mash's tail is made of these.
 */
export function makeSpineBridge(a: THREE.Vector3, b: THREE.Vector3, seed = 2): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed * 11 + 1);
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const pitch = -Math.atan2(b.y - a.y, L);
  const n = Math.max(2, Math.round(L / 2.8));
  const bone = std({ vertexColors: true, roughness: 0.6, vary: 0.2, rim: { color: 0xffd8e0, k: 0.6 } });
  const b2 = new BoxBatch();
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    const s = 1 + 0.28 * Math.sin(t * Math.PI);
    const c = mixRgb(lin(0xd8c4bc), lin(0xf0d4d8), r());
    const dark = mixRgb(c, lin(0x7a5a6a), 0.5);
    const under = mixRgb(c, lin(0x3a2a3a), 0.65);
    // the body, the wings and the keel, all tilted with the slope (yaw first, then pitch about the side axis)
    b2.box(p.x, p.y - 1.75, p.z, 3.7 * s, 1.3, 2.0, c, dark, under, yaw, pitch, 0, 'YXZ');
    b2.box(p.x, p.y - 1.55, p.z, 6.6 * s, 0.28, 0.7, mixRgb(c, lin(0xffffff), 0.15), dark, under, yaw, pitch, 0, 'YXZ');
    b2.box(p.x, p.y - 3.05, p.z, 0.55, 1.5 * s, 1.2, dark, dark, under, yaw, pitch, 0, 'YXZ');
  }
  const m = new THREE.Mesh(b2.geometry(), bone);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

/** the dressing of the Remix island: threads out to the wall and across the floor, a ring of petals, pink and teal lights */
export function dressRemix(R = 18, wallPoints: THREE.Vector3[] = [], seed = 5): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed * 3 + 2);
  for (let i = 0; i < wallPoints.length; i++) {
    const a = r() * Math.PI * 2;
    const from = V(Math.cos(a) * (R - 0.5), 0.4, Math.sin(a) * (R - 0.5));
    g.add(makeThread(from, wallPoints[i]!, 8 + r() * 8, i + seed));
  }
  g.add(makePetals(V(0, 8, 0), V(26, 10, 26), 90, seed));
  const pink = new THREE.PointLight(0xff7aa8, 90, 40, 1.6);
  pink.position.set(-10, 7, 8);
  const teal = new THREE.PointLight(0x4ad0e0, 90, 40, 1.6);
  teal.position.set(10, 7, 6);
  g.add(pink, teal);
  g.add(glowSprite(-12, 7, 0, 10, 0xff7aa8, 0.16), glowSprite(12, 7, -2, 10, 0x4ad0e0, 0.16));
  return g;
}
