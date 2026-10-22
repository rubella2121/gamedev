import * as THREE from 'three';
import { addAnchors, addArchiveIsland, addCast, addDrift, addForest, addGarden, addMoonShafts, addMotes, addRemixIsland, addRoutes, addSummitIsland, addWall, LEDGE, PLACES, WALL_R } from './world';
import { flag, num, type CastName, type Ctx } from './ctx';
import { makeBlob } from './blob';
import { gardenTile, makeIsland } from './cubes';
import { glowPool, glowSprite, motes } from './fx';
import { makeMoonEye } from './wall';
import { telegraph } from './pieces';

/**
 * The shot builders: each adds what one picture needs to an empty scene (the void). A shot in the spec names its builder (`"build": "map"`) and can pass numbers (`"params"`).
 * The camera, fog, key light and grade live in the spec.
 */

const GOLD = 0xffc860;

/** the Blob, the 3D hero, standing at a point and turned to face another */
function blobAt(c: Ctx, x: number, y: number, z: number, faceX: number, faceZ: number, o: { turn?: number; squash?: number; look?: [number, number]; lightK?: number; shell?: boolean; glow?: number } = {}): THREE.Group {
  const gk = o.glow ?? 1;
  const b = makeBlob({ scale: 1, shell: o.shell ?? true, squash: o.squash ?? 0, look: o.look ?? [0, 0.1], lightK: o.lightK ?? 2.6, glow: 0.8 * gk, haloK: 0.25 * gk });
  b.position.set(x, y, z);
  b.rotation.y = Math.atan2(faceX - x, faceZ - z) + (o.turn ?? 0);
  c.add(b);
  c.add(glowPool(x, y, z, 4.4, GOLD, 0.28 * gk), { noDepth: true });
  return b;
}

/** a cast member (the game's own model) put at a point, with model-lab poses ("foot:0.5,armor:1") and a few steps of its own animation */
function castAt(c: Ctx, name: CastName, x: number, y: number, z: number, ry = 0, poses = '', steps = 6): void {
  const e = c.cast[name];
  if (!e) return;
  e.group.position.set(x, y, z);
  e.group.rotation.y = ry;
  c.add(e.group);
  for (const kv of poses.split(',').filter(Boolean)) {
    const [k, v] = kv.split(':');
    e.api?.pose?.(k!, Number(v));
  }
  for (let i = 0; i < steps; i++) e.api?.update?.(0.05, 0.05 * (i + 1));
}

export const SHOTS: Record<string, (c: Ctx) => void> = {
  /** the arena as the game has it, with one of the real bosses on it (param boss: x | collector | mash | fox): for checking the models in this renderer */
  casttest(c) {
    addGarden(c, { bridge: false });
    const name = String(c.p['boss'] ?? 'x') as CastName;
    castAt(c, name, 0, 0, 0, 0, String(c.p['poses'] ?? ''), num(c, 'steps', 3));
  },

  /** a creature on a small stage, for a portrait card (params: boss = x | collector | mash | fox, poses, steps): the game's own model, untouched, put at the middle of the stage */
  portrait(c) {
    const name = String(c.p['boss'] ?? 'x') as CastName;
    const isl = makeIsland({ R: 13, seed: 5, color: gardenTile, depth: 10 });
    c.add(isl);
    // the models are laid out for the arena (beyond the north edge): bring them to the middle
    const back = { x: 29, collector: 29, mash: 26, fox: 0 }[name];
    castAt(c, name, 0, 0, back, 0, String(c.p['poses'] ?? ''), num(c, 'steps', 8));
    c.add(glowPool(0, 0.3, 0, 22, num(c, 'pool', 0x9fe8ff), 0.16), { noDepth: true });
    c.add(motes(new THREE.Vector3(0, 8, 0), new THREE.Vector3(16, 9, 12), 50, [0x9ff4ee, 0xe8fffb, 0xb88aff], 0.2, 71, 0.5, { p: c.cam.position, r: 5 }), { noDepth: true });
  },

  /** the whole thing: the cutaway master map */
  map(c) {
    addGarden(c, {});
    addArchiveIsland(c);
    addRemixIsland(c);
    addSummitIsland(c);
    addRoutes(c, { gates: flag(c, 'gates', true) });
    addWall(c, { arc: num(c, 'arc', 1.45), dim: num(c, 'dim', 0.3) });
    if (flag(c, 'cast', true)) addCast(c, ['x', 'collector', 'mash']);
    addForest(c);
    addDrift(c, num(c, 'drift', 220));
    addMotes(c, new THREE.Vector3(0, 100, 0), new THREE.Vector3(100, 170, 70), 160);
    if (flag(c, 'shafts', true)) addMoonShafts(c, num(c, 'shaftK', 0.07));
    addAnchors(c);
  },

  /** the Pressed Garden, from the entry bridge or from the pilgrim road: X over the stage, the wall behind him (params: foot, poses, bx/bz = where the Blob stands) */
  garden(c) {
    const G = PLACES.garden;
    addGarden(c, { bridge: flag(c, 'bridge', true) });
    addWall(c, { arc: num(c, 'arc', 0.9), dim: num(c, 'dim', 0.45), moon: false });
    if (flag(c, 'routes', false)) {
      // the way on: the pinned gate and the stair-bridge to the Archive, with the Archive itself out in the dark
      addRoutes(c, { gates: true });
      addArchiveIsland(c, { dressed: false });
    }
    const foot = num(c, 'foot', 0);
    castAt(c, 'x', G.c[0], G.c[1], G.c[2], 0, `foot:${foot},armor:1${c.p['poses'] ? ',' + String(c.p['poses']) : ''}`, 8);
    if (foot > 0) {
      // the shadow that closes in on the stage before the foot lands
      const sh = telegraph('ring', 0xe02b3a, 0, 8.5, { gap: Math.PI * 2 - 0.02, op: 0.28 });
      sh.position.set(0, 0.45, -1);
      c.add(sh, { noDepth: true });
      const ring = telegraph('ring', 0xe02b3a, 8.4, 8.9, { op: 0.95 });
      ring.position.set(0, 0.46, -1);
      c.add(ring, { noDepth: true });
    }
    if (flag(c, 'blob', true)) blobAt(c, num(c, 'bx', 0.8), 0.3, num(c, 'bz', 12.5), 0, -29, { turn: num(c, 'turn', 0) });
    addDrift(c, num(c, 'drift', 70));
    c.add(motes(new THREE.Vector3(0, 8, 0), new THREE.Vector3(26, 8, 26), 90, [0x9ff4ee, 0xe8fffb, 0xb88aff], 0.22, 31, 0.5, { p: c.cam.position, r: 4 }), { noDepth: true });
    c.rays.push({ pos: [0, 22, -29], k: 0.5, color: 0xff2a3a, r: 0.05 });
    addAnchors(c);
  },

  /** the Collector's hall: cabinets, jars, lamps and the keeper himself (params: poses for the Collector) */
  archive(c) {
    const A = PLACES.archive;
    addArchiveIsland(c);
    addWall(c, { arc: num(c, 'arc', 0.9), dim: num(c, 'dim', 0.45), moon: false });
    castAt(c, 'collector', A.c[0], A.c[1], A.c[2], 0, String(c.p['poses'] ?? ''), 10);
    if (flag(c, 'blob', true)) blobAt(c, A.c[0] + num(c, 'bx', -1), A.c[1] + 0.3, A.c[2] + num(c, 'bz', 11), A.c[0], A.c[2] - 29, { turn: num(c, 'turn', 0) });
    // an amber lamp-glow in the haze over the aisle, so the room has air in it
    c.add(glowSprite(A.c[0], A.c[1] + 12, A.c[2] - 6, 46, 0xffa040, 0.1), { noDepth: true });
    c.add(motes(new THREE.Vector3(A.c[0], A.c[1] + 7, A.c[2] - 4), new THREE.Vector3(24, 8, 24), 110, [0xffd878, 0xffb05a, 0xfff0c0], 0.2, 41, A.c[1] + 0.5, { p: c.cam.position, r: 4 }), { noDepth: true });
    c.rays.push({ pos: [A.c[0], A.c[1] + 16, A.c[2] - 29], k: 0.35, color: 0xffa040, r: 0.05 });
    addAnchors(c);
  },

  /** the stitched wing: the Mash, the vertebra bridge, threads out to the wall, petals */
  remix(c) {
    const R = PLACES.remix;
    addRemixIsland(c);
    addWall(c, { arc: num(c, 'arc', 0.9), dim: num(c, 'dim', 0.45), moon: false });
    castAt(c, 'mash', R.c[0], R.c[1], R.c[2], 0, String(c.p['poses'] ?? ''), 10);
    if (flag(c, 'blob', true)) blobAt(c, R.c[0] + num(c, 'bx', -1), R.c[1] + 0.3, R.c[2] + num(c, 'bz', 11), R.c[0], R.c[2] - 26, { turn: num(c, 'turn', 0) });
    c.add(motes(new THREE.Vector3(R.c[0], R.c[1] + 8, R.c[2]), new THREE.Vector3(26, 9, 26), 110, [0xff9ac0, 0x9ff4ee, 0xe8fffb], 0.22, 43, R.c[1] + 0.5, { p: c.cam.position, r: 4 }), { noDepth: true });
    c.rays.push({ pos: [R.c[0], R.c[1] + 10, R.c[2] - 24], k: 0.3, color: 0xff7aa8, r: 0.05 });
    addAnchors(c);
  },

  /** crossing the long span between the Archive and the Remix: the drum, the wall, the drop, and the hound behind you */
  climb(c) {
    addArchiveIsland(c, { dressed: false });
    addRemixIsland(c, { dressed: true });
    addRoutes(c, { gates: false });
    addWall(c, { arc: num(c, 'arc', 1.1), dim: num(c, 'dim', 0.4), moon: false });
    addCast(c, ['mash']);
    addDrift(c, num(c, 'drift', 120));
    const bx = num(c, 'bx', 22);
    const bz = num(c, 'bz', -14);
    const by = num(c, 'by', 69);
    blobAt(c, bx, by, bz, bx - 30, bz - 4, { turn: num(c, 'turn', 0), lightK: num(c, 'lk', 2.6), glow: num(c, 'gk', 1) });
    const fox = c.cast.fox;
    if (fox) {
      fox.api?.pose?.('preset', 7);
      for (let i = 0; i < 8; i++) fox.api?.update?.(0.05, 0.05 * (i + 1));
      fox.group.position.set(bx + num(c, 'fx', 15), by + num(c, 'fy', -5.3), bz + num(c, 'fz', 4));
      // running up the span: yaw to face the Remix, then pitch the nose up with the slope
      fox.group.rotation.order = 'YXZ';
      fox.group.rotation.y = -Math.PI / 2 - 0.25;
      fox.group.rotation.x = -num(c, 'fpitch', 0);
      fox.group.scale.setScalar(num(c, 'fs', 1.1));
      c.add(fox.group);
      c.add(glowSprite(fox.group.position.x, fox.group.position.y + 2, fox.group.position.z, 22, 0xff7a2a, num(c, 'fglow', 0.35)), { noDepth: true });
    }
    addMotes(c, new THREE.Vector3(0, 80, -10), new THREE.Vector3(70, 40, 40), 120);
    addAnchors(c);
  },

  /** the last stair: the parents' frames over the ledge, the moon over everything */
  summit(c) {
    addSummitIsland(c);
    addRoutes(c, { gates: false });
    addWall(c, { arc: num(c, 'arc', 0.8), dim: num(c, 'dim', 0.5), moon: false });
    const moon = makeMoonEye(70, num(c, 'open', 0.82));
    moon.position.set(0, 330, -WALL_R * 0.5);
    moon.lookAt(0, 170, 40);
    c.add(moon, { noDepth: true });
    c.rays.push({ pos: [0, 330, -WALL_R * 0.5], k: 0.6, color: 0xc8c0ff, r: 0.07 });
    if (flag(c, 'blob', true)) blobAt(c, num(c, 'ax', LEDGE.x + 0.6), num(c, 'ay', LEDGE.y + 0.3), num(c, 'az', LEDGE.z + 3), 0, -WALL_R, { turn: num(c, 'turn', 0) });
    addDrift(c, num(c, 'drift', 60));
    c.add(motes(new THREE.Vector3(0, LEDGE.y + 10, LEDGE.z - 6), new THREE.Vector3(24, 14, 10), 90, [0xffd878, 0xfff0c0, 0xb88aff], 0.3, 51, LEDGE.y + 0.5, { p: c.cam.position, r: 4 }), { noDepth: true });
    addAnchors(c);
  },

  /** a hearth in the Garden: a pool of warm light, the Blob resting, the Cinderfox waiting at the edge of it */
  hearth(c) {
    const G = PLACES.garden;
    addGarden(c, { bridge: false });
    addWall(c, { arc: num(c, 'arc', 0.9), dim: num(c, 'dim', 0.4), moon: false });
    castAt(c, 'x', G.c[0], G.c[1], G.c[2], 0, 'armor:1', 4);
    blobAt(c, num(c, 'bx', 3), 0.3, num(c, 'bz', 15.2), 7, 12, { squash: 0.3, turn: 0.6, look: [0.4, 0.2], shell: true });
    const fox = c.cast.fox;
    if (fox) {
      fox.api?.pose?.('preset', 7);
      for (let i = 0; i < 8; i++) fox.api?.update?.(0.05, 0.05 * (i + 1));
      fox.group.position.set(num(c, 'fx', -8), 0.35, num(c, 'fz', 6));
      fox.group.rotation.y = num(c, 'fry', 0.9);
      fox.group.scale.setScalar(num(c, 'fs', 1.2));
      c.add(fox.group);
      c.add(glowPool(fox.group.position.x, 0.4, fox.group.position.z, 8, 0xff7a2a, 0.4), { noDepth: true });
      c.rays.push({ pos: [fox.group.position.x, 3, fox.group.position.z], k: 0.35, color: 0xff7a2a, r: 0.04 });
    }
    addDrift(c, 50);
    c.add(motes(new THREE.Vector3(0, 5, 10), new THREE.Vector3(18, 5, 16), 70, [0xffb060, 0xffe0a0, 0x9ff4ee], 0.22, 61, 0.5, { p: c.cam.position, r: 4 }), { noDepth: true });
    addAnchors(c);
  },
};
