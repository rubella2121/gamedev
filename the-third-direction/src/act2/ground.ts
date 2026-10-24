import * as THREE from 'three';

/**
 * The shape of the Crater's floor, the one truth for everything that stands on it.
 *
 * The fighting floor is flat (y = 0). Two low terraces rise at its sides, each with a way up: the west terrace (the Moonwell's)
 * by a stone ramp, the east terrace by the back of a fallen tree. Their edges are cliffs: you can drop down, you cannot climb up.
 *
 * `groundY` is written twice, in TypeScript and in GLSL (`GROUND_GLSL`), with the same numbers, so that a warning drawn on the
 * floor (lifted in its vertex shader) lies exactly where the hit is tested and where the Blob stands. Change one, change both.
 */

export const TERRACE_H = { west: 0.8, east: 0.8 };
/** the terraces: centre, half size, corner radius */
export const WEST = { x: -18.5, z: -4, hx: 4, hz: 8.5, r: 1.5 };
export const EAST = { x: 18.5, z: -8.5, hx: 3.5, hz: 6.5, r: 1.5 };
/** the stone ramp up to the west terrace: along x, from the floor (x0) to the top (x1), between z0 and z1 */
export const STONE_RAMP = { x0: -9.5, x1: -14.8, z0: 0.6, z1: 3.6 };
/** the fallen tree up to the east terrace: from a (on the floor) to b (on the terrace), this wide either side of its line */
export const TREE_RAMP = { ax: 7.5, az: 4.5, bx: 15.6, bz: -3.4, half: 1.0 };
/** how sharp the edges are: the width of a cliff, in units */
const EDGE = 0.22;

function sdBox(x: number, z: number, b: { x: number; z: number; hx: number; hz: number; r: number }) {
  const dx = Math.abs(x - b.x) - b.hx + b.r;
  const dz = Math.abs(z - b.z) - b.hz + b.r;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - b.r;
}

function step(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** the height of the floor at (x, z): what the Blob stands on, and what a warning is drawn on */
export function groundY(x: number, z: number): number {
  let h = Math.max((1 - step(-EDGE, 0, sdBox(x, z, WEST))) * TERRACE_H.west, (1 - step(-EDGE, 0, sdBox(x, z, EAST))) * TERRACE_H.east);
  // the stone ramp: it rises along x, and has steep sides
  const s = STONE_RAMP;
  const side = Math.min(z - s.z0, s.z1 - z);
  if (side > -EDGE) {
    const t = Math.min(1, Math.max(0, (x - s.x0) / (s.x1 - s.x0)));
    h = Math.max(h, t * TERRACE_H.west * (1 - step(-EDGE, 0, -side)));
  }
  // the fallen tree: it rises along its own line
  const r = TREE_RAMP;
  const lx = r.bx - r.ax;
  const lz = r.bz - r.az;
  const len2 = lx * lx + lz * lz;
  const t = Math.min(1, Math.max(0, ((x - r.ax) * lx + (z - r.az) * lz) / len2));
  const d = Math.hypot(x - (r.ax + lx * t), z - (r.az + lz * t));
  h = Math.max(h, t * TERRACE_H.east * (1 - step(r.half - EDGE, r.half, d)));
  return h;
}

/** the same, for a vertex shader (vec2 p = world xz) */
export const GROUND_GLSL = /* glsl */ `
float gSdBox(vec2 p, vec2 c, vec2 hs, float r) {
  vec2 d = abs(p - c) - hs + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
float groundY(vec2 p) {
  float h = max((1.0 - smoothstep(-${EDGE.toFixed(3)}, 0.0, gSdBox(p, vec2(${WEST.x.toFixed(3)}, ${WEST.z.toFixed(3)}), vec2(${WEST.hx.toFixed(3)}, ${WEST.hz.toFixed(3)}), ${WEST.r.toFixed(3)}))) * ${TERRACE_H.west.toFixed(3)},
                (1.0 - smoothstep(-${EDGE.toFixed(3)}, 0.0, gSdBox(p, vec2(${EAST.x.toFixed(3)}, ${EAST.z.toFixed(3)}), vec2(${EAST.hx.toFixed(3)}, ${EAST.hz.toFixed(3)}), ${EAST.r.toFixed(3)}))) * ${TERRACE_H.east.toFixed(3)});
  float side = min(p.y - ${STONE_RAMP.z0.toFixed(3)}, ${STONE_RAMP.z1.toFixed(3)} - p.y);
  if (side > -${EDGE.toFixed(3)}) {
    float t = clamp((p.x - ${STONE_RAMP.x0.toFixed(3)}) / (${(STONE_RAMP.x1 - STONE_RAMP.x0).toFixed(3)}), 0.0, 1.0);
    h = max(h, t * ${TERRACE_H.west.toFixed(3)} * (1.0 - smoothstep(-${EDGE.toFixed(3)}, 0.0, -side)));
  }
  vec2 a = vec2(${TREE_RAMP.ax.toFixed(3)}, ${TREE_RAMP.az.toFixed(3)});
  vec2 l = vec2(${(TREE_RAMP.bx - TREE_RAMP.ax).toFixed(3)}, ${(TREE_RAMP.bz - TREE_RAMP.az).toFixed(3)});
  float t = clamp(dot(p - a, l) / dot(l, l), 0.0, 1.0);
  float d = length(p - (a + l * t));
  h = max(h, t * ${TERRACE_H.east.toFixed(3)} * (1.0 - smoothstep(${(TREE_RAMP.half - EDGE).toFixed(3)}, ${TREE_RAMP.half.toFixed(3)}, d)));
  return h;
}
`;

/**
 * Lay a flat thing on the floor (a warning ring, a shadow, a puddle): its vertices are lifted, in the shader, to the ground under
 * them. Works for instanced meshes too. Safe to call twice.
 */
export function onGround(m: THREE.Material) {
  if (m.userData['onGround']) return;
  m.userData['onGround'] = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GROUND_GLSL).replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  vec4 gWorld = modelMatrix * mvPosition;
  gWorld.y += groundY(gWorld.xz);
  mvPosition = viewMatrix * gWorld;
  gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '|ground';
  m.needsUpdate = true;
}

/**
 * Find the flat things lying on the floor under `root` and lay them on the ground (see `onGround`). A thing is "flat on the floor"
 * when its geometry has no depth (a ring, a circle, a plane), it faces up, and it sits low. Run it once the bosses have made their
 * effects; anything it has already done is skipped.
 */
const _q = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
export function groundDecals(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (mesh.userData['noGround']) return;
    const g = mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!;
    const depth = bb.max.z - bb.min.z;
    const flatY = bb.max.y - bb.min.y;
    // a shape drawn in its own xy plane, turned to face up; or one already lying in xz
    const lying = depth < 1e-4 && flatY > 1e-4;
    const flatXZ = flatY < 1e-4 && depth > 1e-4;
    if (!lying && !flatXZ) return;
    mesh.getWorldQuaternion(_q);
    _n.set(0, 0, 1);
    if (flatXZ) _n.set(0, 1, 0);
    _n.applyQuaternion(_q);
    if (Math.abs(_n.y) < 0.95) return;
    mesh.getWorldPosition(_p);
    if (_p.y > 0.5 || _p.y < -0.5) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) onGround(m);
  });
}
