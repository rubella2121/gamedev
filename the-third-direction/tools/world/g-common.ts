import * as THREE from 'three';

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** a point on a curve with its tangent, and a sideways and an up vector that follow it (for hanging ribs and spines off a spine) */
export function frameAt(curve: THREE.Curve<THREE.Vector3>, u: number): { p: THREE.Vector3; t: THREE.Vector3; side: THREE.Vector3; up: THREE.Vector3 } {
  const p = curve.getPointAt(u);
  const t = curve.getTangentAt(u).normalize();
  const ref = Math.abs(t.y) > 0.92 ? V(1, 0, 0) : V(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(t, ref).normalize();
  const up = new THREE.Vector3().crossVectors(side, t).normalize();
  return { p, t, side, up };
}
