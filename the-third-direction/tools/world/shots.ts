import * as THREE from 'three';
import { GLADE, zone3 } from './layout';
import { dressZone, makeWater } from './zones';
import type { ZoneId } from '../../src/forest/land';
import { makeBlob } from './blob';
import { glowPool, glowSprite, motes } from './fx';
import { makeFoot } from './pieces';
import { makeBoneWyrm } from './guardians';
import { makeMimicQueen } from './g-mimic';
import { makeTollQueen } from './g-toll';
import { makeThornbackKing } from './g-thorn';
import { makeGloommother } from './g-gloom';
import { bareTrees, clearTrees, cover, heroTree, num, put, type Ctx } from './ctx';

/**
 * The shot builders: each adds what one picture needs (people, landmarks, light, ground cover) to a scene that already has the terrain and the forest.
 * A shot in the spec names its builder (`"build": "clearing"`) and can pass numbers (`"params"`). The camera, fog, moon and grade live in the spec.
 */

const GOLD = 0xffc860;

/** the Blob and its parents, in the clearing, looking at each other and at the sky */
function family(c: Ctx, o: { lightK?: number; up?: boolean } = {}): { baby: THREE.Group; mother: THREE.Group; father: THREE.Group } {
  const lk = o.lightK ?? 2.2;
  const cx = GLADE.x;
  const cz = GLADE.z;
  const baby = makeBlob({ scale: 1, look: o.up ? [0.05, 0.95] : [0, 0], worried: true, lightK: lk * 0.7, glow: 0.75, haloK: 0.22 });
  put(c, baby, cx + 0.5, cz + 2.7, 0, 0.12);
  const mother = makeBlob({ scale: 1.5, bow: true, look: [0.4, -0.5], worried: true, lightK: lk, glow: 0.7, haloK: 0.22 });
  put(c, mother, cx - 3.6, cz - 1.2, 0, -0.18);
  const father = makeBlob({ scale: 1.62, look: [-0.5, -0.5], worried: true, lightK: lk, glow: 0.7, haloK: 0.22 });
  put(c, father, cx + 3.8, cz - 0.4, 0, 0.2);
  for (const [g, r, k] of [[baby, 3.2, 0.3], [mother, 4.6, 0.22], [father, 4.8, 0.2]] as [THREE.Group, number, number][]) {
    c.add(glowPool(g.position.x, g.position.y, g.position.z, r, GOLD, k), { noDepth: true });
  }
  return { baby, mother, father };
}

/** the Blob a few steps in front of the camera, a little to one side, looking at where it is going: the over-the-shoulder view */
function blobInFront(c: Ctx, tx: number, tz: number, o: { d?: number; side?: number; turn?: number; look?: [number, number] } = {}): THREE.Group {
  const fwd = new THREE.Vector3();
  c.cam.getWorldDirection(fwd);
  fwd.y = 0;
  fwd.normalize();
  const rx = -fwd.z;
  const rz = fwd.x;
  const d = o.d ?? 7.5;
  const side = o.side ?? -2.6;
  const bx = c.cam.position.x + fwd.x * d + rx * side;
  const bz = c.cam.position.z + fwd.z * d + rz * side;
  const b = makeBlob({ scale: 1, look: o.look ?? [0.1, 0.1], lightK: 2.6, glow: 0.8, haloK: 0.25 });
  put(c, b, bx, bz, 0, Math.atan2(tx - bx, tz - bz) + (o.turn ?? 0.75));
  c.add(glowPool(bx, c.gy(bx, bz), bz, 4.2, GOLD, 0.26), { noDepth: true });
  return b;
}

export const SHOTS: Record<string, (c: Ctx) => void> = {
  /** a guardian's place with the Blob walking in (params: zone, bd, bs, turn) */
  zone(c) {
    const id = String(c.p['zone'] ?? 'gloom') as ZoneId;
    const zn = zone3(id);
    dressZone(c, id, { guardian: num(c, 'guardian', 1) !== 0, lanterns: num(c, 'lanterns', 1) !== 0 });
    if (id === 'marsh') c.add(makeWater(c, zn.x, zn.z, zn.rx * 2.4, zn.rz * 2.4));
    if (num(c, 'blob', 1)) blobInFront(c, zn.heart.x, zn.heart.z, { d: num(c, 'bd', 8), side: num(c, 'bs', -2.1), turn: num(c, 'turn', 1.9) });
  },

  /** one guardian alone in its zone, for getting it right */
  gtest(c) {
    const which = String(c.p['g'] ?? 'wyrm');
    if (!num(c, 'trees', 0)) c.plants.length = 0;
    const make: Record<string, { z: Parameters<typeof zone3>[0]; f: () => THREE.Object3D }> = {
      wyrm: { z: 'bones', f: makeBoneWyrm },
      mimic: { z: 'meadow', f: makeMimicQueen },
      toll: { z: 'marsh', f: makeTollQueen },
      thorn: { z: 'thicket', f: makeThornbackKing },
      gloom: { z: 'gloom', f: makeGloommother },
    };
    const m = make[which]!;
    const zn = zone3(m.z);
    const o = m.f();
    put(c, o, zn.heart.x, zn.heart.z, 0, num(c, 'ry', 0));
    c.add(new THREE.AmbientLight(0x000000, 0));
  },

  /** the foot on its own, for getting its shape right */
  foottest(c) {
    c.plants.length = 0;
    const foot = makeFoot(num(c, 'red', 0.3));
    foot.position.set(0, num(c, 'y', 46), num(c, 'z', 120));
    foot.rotation.y = Math.PI + num(c, 'rot', 0.2);
    foot.rotation.x = num(c, 'tilt', 0);
    foot.scale.setScalar(num(c, 'scale', 1));
    c.add(foot);
  },

  /** "Don't look up": the family in the glade, X's foot over the moon */
  clearing(c) {
    const cx = GLADE.x;
    const cz = GLADE.z;
    family(c, { up: true });
    // framing trees, close
    heroTree(c, 'giant', cx - 10.5, cz + 7.5, 1.0, 2);
    heroTree(c, 'giant', cx + 12.5, cz + 5.5, 1.05, 4);
    heroTree(c, 'gnarl', cx - 15, cz - 9, 1.0, 1);
    heroTree(c, 'giant', cx + 17, cz - 8, 1.1, 3);
    bareTrees(c, cx, cz, num(c, 'bare', 70));
    // the foot, high above the family on the line to the moon (so its shadow falls on them and the moon peeks out past its edge)
    const d = num(c, 'footDist', 85);
    const right = new THREE.Vector3().crossVectors(c.md, new THREE.Vector3(0, 1, 0)).normalize();
    const foot = makeFoot(num(c, 'footRed', 0.35));
    foot.position.set(cx + 0.5, c.gy(cx, cz) + 1, cz + 2.7).addScaledVector(c.md, d).addScaledVector(right, num(c, 'footX', 0)).add(new THREE.Vector3(0, num(c, 'footY', 0), 0));
    foot.rotation.y = num(c, 'footRot', 0.25);
    foot.scale.setScalar(num(c, 'footScale', 0.8));
    c.add(foot);
    // a red wash from above that lights the tops of things (the sole faces down, so it does not light the foot)
    const wash = new THREE.DirectionalLight(0xff3040, num(c, 'wash', 0.9));
    wash.position.copy(foot.position);
    wash.target.position.set(cx, 0, cz);
    c.add(wash);
    c.add(wash.target);
    // the ground
    const hole = (x: number, z: number) => {
      const dd = Math.min(Math.hypot(x - (cx + 0.5), z - (cz + 2.7)), Math.hypot(x - (cx - 3.6), z - (cz - 1.2)), Math.hypot(x - (cx + 3.8), z - (cz - 0.4)));
      const dc = Math.hypot(x - c.cam.position.x, z - c.cam.position.z);
      return Math.min(1, Math.max(0, (dd - 1.1) / 3)) * Math.min(1, Math.max(0, (dc - 3) / 4));
    };
    cover(c, cx, cz + 4, 24, { grass: 2.4, fern: 0.18, bluebell: 0.22, pebble: 0.3, shroom: 0.03 }, (x, z) => hole(x, z), 5);
    cover(c, cx, cz, 48, { grass: 0.5, fern: 0.05, bluebell: 0.06, rock: 0.012 }, undefined, 6);
    c.add(motes(new THREE.Vector3(cx, 4, cz + 2), new THREE.Vector3(18, 5, 14), 160, [0xffe6a0, 0xffc860, 0xcaf6ff], 0.22, 11, 0.4), { noDepth: true });
    c.add(motes(new THREE.Vector3(cx, 2, cz + 6), new THREE.Vector3(5, 1.6, 4), 40, [0xfff0c0, 0xffd070], 0.34, 12, 0.3), { noDepth: true });
    c.add(glowSprite(cx, 1.4, cz + 2, 7, GOLD, 0.1), { noDepth: true });
  },
};
