import * as THREE from 'three';
import { blob, lin, mixRgb, tube } from './geo';
import { fogged } from './shade';
import { glowSprite } from './fx';

/** Big set pieces: X's foot, lanterns, and the like. Local coordinates, origin on the ground. */

/**
 * X's foot, seen from below: a wide black sole, five toes that end in long pale talons, and a leg like a tower going up out of the picture.
 * It is lit from behind by the moon, so what you see is a silhouette with a red edge. Local coordinates: the sole faces down (-y), the toes point +z.
 */
export function makeFoot(redK = 1): THREE.Group {
  const g = new THREE.Group();
  const dark = (t: number, a: number, p: THREE.Vector3): [number, number, number] => {
    const scale = Math.abs(Math.sin(p.x * 0.55 + Math.sin(p.z * 0.4 + p.y * 0.2) * 2.1) * Math.sin(p.z * 0.6 + p.y * 0.3)) < 0.06 ? 0.45 : 0;
    return mixRgb(mixRgb(lin(0x07040c), lin(0x1e1232), a * 0.9 * t), lin(0x8a2030), scale);
  };
  const skin = (rimK = 1.0) => fogged(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, emissive: 0x24060c, emissiveIntensity: 0.6 }), { rim: { color: 0xff2a3a, k: rimK * redK }, vary: 0.4, bump: 1.2, scale: [0.25, 0.25] });
  // the sole: a wide, flat, rounded oval
  const sole = new THREE.Mesh(blob(new THREE.Vector3(0, 0, 0), 1, 3, (t, a, p) => dark(t, a, p.clone().multiplyScalar(30)), 2.2, 0.12, 0.3), skin());
  sole.scale.set(31, 9, 25);
  sole.position.set(0, 0, -3);
  g.add(sole);
  // five toes, each a fat pad with a talon that hooks down and out
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) / 2;
    const a = t * 0.66;
    const reach = 25.5 - Math.abs(t) * 7;
    const base = new THREE.Vector3(Math.sin(a) * 33, -1.5, Math.cos(a) * reach - 3);
    const r = 8.6 - Math.abs(t) * 1.8;
    const toe = new THREE.Mesh(blob(new THREE.Vector3(0, 0, 0), 1, 2, (tt, aa, p) => dark(tt, aa, p.clone().multiplyScalar(9)), 5 + i, 0.1, 0.75), skin());
    toe.scale.set(r, r * 0.8, r * 1.2);
    toe.position.copy(base);
    g.add(toe);
    const dir = new THREE.Vector3(Math.sin(a) * 0.8, 0, Math.cos(a)).normalize();
    const start = base.clone().addScaledVector(dir, r * 0.95).add(new THREE.Vector3(0, -2.5, 0));
    const len = 21 - Math.abs(t) * 3.5;
    const path = [0, 0.22, 0.46, 0.72, 1].map((u) => start.clone().addScaledVector(dir, u * len * 0.8).add(new THREE.Vector3(0, -Math.pow(u, 1.8) * len * 0.62, 0)));
    g.add(new THREE.Mesh(tube(path, [3.6 - Math.abs(t) * 0.5, 3.0, 2.2, 1.2, 0.05], 8, (u) => mixRgb(lin(0x160c20), lin(0xcfc8e0), Math.pow(u, 1.5))), skin()));
  }
  // the leg: a tower of dark scaled flesh, leaning back and away
  const leg = [0, 1, 2, 3, 4, 5].map((k) => new THREE.Vector3(0, 6 + k * 52, -8 - k * 9));
  g.add(new THREE.Mesh(tube(leg, [15, 15.5, 17, 19, 21, 23], 18, (u, a, p) => dark(u, a, p.clone().multiplyScalar(2.4))), skin(0.45)));
  return g;
}

/** A hearth: a post with a lantern, a pool of warm light round it (the places the Cinderfox does not enter). */
export function makeLantern(color = 0xffb05a, height = 4.2): THREE.Group {
  const g = new THREE.Group();
  const iron = fogged(new THREE.MeshStandardMaterial({ color: 0x1a1820, roughness: 0.6, metalness: 0.7 }));
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
  const l = new THREE.PointLight(color, 140, 34, 1.7);
  l.position.copy(lamp.position);
  g.add(l);
  g.add(glowSprite(lamp.position.x, lamp.position.y, 0, 3.4, color, 0.55));
  return g;
}
