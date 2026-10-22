import * as THREE from 'three';
import { rng } from '../../src/core/util';
import { lin, mixRgb, tube } from './geo';
import { fogged, glowMat } from './shade';
import { glowSprite } from './fx';
import { V } from './g-common';

/** Small set pieces shared by the shots: a hearth lantern, the marks a fight paints on the floor, the crack in the sky. */

/** A hearth: a post with a lantern and a pool of warm light round it (the places the Cinderfox does not enter). Local coordinates, origin on the ground. */
export function makeLantern(color = 0xffb05a, height = 4.2): THREE.Group {
  const g = new THREE.Group();
  const iron = fogged(new THREE.MeshStandardMaterial({ color: 0x1a1820, roughness: 0.6, metalness: 0.7 }), { rim: { color: 0xffb05a, k: 0.4 } });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, height, 8), iron);
  post.position.y = height / 2;
  g.add(post);
  const arm = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 14, Math.PI * 0.9), iron);
  arm.position.set(0.55, height - 0.2, 0);
  arm.rotation.z = Math.PI * 0.05;
  g.add(arm);
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
  lamp.scale.set(0.8, 1.2, 0.8);
  lamp.position.set(1.1, height - 0.85, 0);
  g.add(lamp);
  const cage = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: 0x2a2020, wireframe: true }));
  cage.scale.set(0.8, 1.2, 0.8);
  cage.position.copy(lamp.position);
  g.add(cage);
  const l = new THREE.PointLight(color, 45, 16, 1.7);
  l.position.copy(lamp.position);
  g.add(l);
  g.add(glowSprite(lamp.position.x, lamp.position.y, 0, 3.4, color, 0.55));
  return g;
}

/** what a boss's attack looks like on the floor before it lands: a ring with a gap you can step through, a lane, or a cone */
export function telegraph(kind: 'ring' | 'lane' | 'cone', hue: number, a: number, b: number, o: { gap?: number; gapAt?: number; len?: number; op?: number } = {}): THREE.Mesh {
  let geo: THREE.BufferGeometry;
  if (kind === 'ring') {
    const gap = o.gap ?? 0;
    geo = new THREE.RingGeometry(a, b, 96, 1, (o.gapAt ?? 0) + gap / 2, Math.PI * 2 - gap);
  } else if (kind === 'lane') {
    geo = new THREE.PlaneGeometry(a, o.len ?? 40);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -(o.len ?? 40) / 2);
  } else {
    geo = new THREE.CircleGeometry(b, 48, -Math.PI / 2 - a / 2, a);
    geo.rotateX(-Math.PI / 2);
  }
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: o.op ?? 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  if (kind === 'ring') m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  return m;
}

/** a crack in the sky: a jagged line of white light, with the world coming apart into cubes along it (the way you came in) */
export function skyCrack(center: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, seed = 5, R = 1100, cubes = 90): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const pts: THREE.Vector3[] = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = from.clone().lerp(to, t);
    const jit = (1 - Math.abs(t - 0.5) * 1.2) * 0.085;
    p.add(V((r() - 0.5) * jit, (r() - 0.5) * jit * 0.7, (r() - 0.5) * jit));
    pts.push(p);
  }
  const world = pts.map((p) => center.clone().add(p.clone().normalize().multiplyScalar(R)));
  g.add(new THREE.Mesh(tube(world, world.map((_, i) => R * 0.0013 * (1.4 + 1.8 * Math.sin((i / N) * Math.PI))), 5, () => lin(0xffffff), false), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })));
  g.add(new THREE.Mesh(tube(world, world.map((_, i) => R * 0.0013 * (9 + 12 * Math.sin((i / N) * Math.PI))), 6, () => lin(0x9a8aff), false), new THREE.MeshBasicMaterial({ color: 0x4a3aa8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  for (const w of world.filter((_, i) => i % 3 === 0)) g.add(glowSprite(w.x, w.y, w.z, R * 0.11, 0xb8a8ff, 0.35));
  for (let i = 0; i < cubes; i++) {
    const w = world[Math.floor(r() * world.length)]!;
    const s = R * 0.0018 * (2 + r() * r() * 14);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.62 + r() * 0.1, 0.5, 0.75 + r() * 0.2), fog: false, transparent: true, opacity: 0.9 }));
    cube.position.copy(w).add(V((r() - 0.5) * R * 0.15, (r() - 0.5) * R * 0.15 - R * 0.02, (r() - 0.5) * R * 0.15));
    cube.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(cube);
  }
  return g;
}

void glowMat;
void mixRgb;
