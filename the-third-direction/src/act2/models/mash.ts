import * as THREE from 'three';
import type { Slicer } from '../kit/sdf';

/** PLACEHOLDER: the real model replaces this file. */
export async function labMash(_slicer: Slicer, world: THREE.Group) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshLambertMaterial({ color: 0xff8aa8 }));
  m.position.set(0, 8, -29);
  world.add(m);
  return {};
}
