import * as THREE from 'three';
import { GLADE, HUB3, SEAL, ZONES3, zone3, ARENA_R, walkSD } from './layout';
import { dressZone, makeWater } from './zones';
import type { ZoneId } from '../../src/forest/land';
import { makeBlob } from './blob';
import { beam, glowPool, glowSprite, motes } from './fx';
import { glowMat, std } from './shade';
import { makeFoot, makeLantern } from './pieces';
import { beacon, makeSeal, makeSignpost, skyCrack, skyEyes, telegraph, trail, rockBox } from './pieces2';
import { makeRibbon } from './blob';
import { makeBellwether, makeGloomling, makeMimicBloom, makeMournmoth, makeRootCage, makeRootmaw, makeSkitterbone, makeThornback } from './monsters';
import { makeBoneWyrm } from './guardians';
import { makeMimicQueen } from './g-mimic';
import { makeTollQueen } from './g-toll';
import { makeThornbackKing } from './g-thorn';
import { makeGloommother } from './g-gloom';
import { bareTrees, clearCorridor, clearTrees, cover, heroTree, holeAround, num, put, type Ctx } from './ctx';

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

const slabStone = (t: number, a: number): [number, number, number] => [0.03 + a * 0.05, 0.04 + a * 0.06, 0.05 + a * 0.07];

/** the crossroads: the waystone, hearths, the long road to the Seal, and a light standing over every place you can go */
function crossroads(c: Ctx, o: { seal?: boolean; beacons?: boolean } = {}): void {
  const hx = HUB3.x;
  const hz = HUB3.z;
  const level = c.gy(hx, hz);
  clearTrees(c, hx, hz, 30);
  const post = put(c, makeSignpost(), hx, hz, 0, 0.3);
  void post;
  // an old paved round, a ring of light on it
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(17, 18.2, 0.7, 56), std({ color: 0x3a4650, roughness: 0.9, vary: 0.5, bump: 1.2, scale: [0.4, 0.4], rim: { color: 0x9fb0d0, k: 0.3 } }));
  plat.position.set(hx, level + 0.1, hz);
  plat.receiveShadow = true;
  c.add(plat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(11.6, 11.9, 96), glowMat({ color: 0xffc860, opacity: 0.45, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(hx, level + 0.5, hz);
  c.add(ring, { noDepth: true });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = hx + Math.cos(a) * 15.5;
    const z = hz + Math.sin(a) * 15.5;
    put(c, makeLantern(0xffb05a, 4.8), x, z, 0.4, -a + Math.PI);
    c.add(glowPool(x, c.gy(x, z), z, 7, 0xffb05a, 0.22), { noDepth: true });
  }
  cover(c, hx, hz, 46, { grass: 0.35, fern: 0.08, pebble: 0.2, rock: 0.02 }, holeAround(c, 9, (x, z) => (Math.hypot(x - hx, z - hz) < 17 ? 0.05 : 1)), 12);
  c.add(trail(c.gy), { noDepth: true });
  if (o.seal !== false) put(c, makeSeal(num(c, 'lit', 5)), SEAL.x, SEAL.z, -0.5, 0);
  if (o.beacons !== false) {
    for (const z of ZONES3) {
      c.add(beacon(z.heart.x, c.gy(z.heart.x, z.heart.z), z.heart.z, z.hue, 170, 0.22), { noDepth: true });
      c.add(glowSprite(z.heart.x, c.gy(z.heart.x, z.heart.z) + 6, z.heart.z, 60, z.hue, 0.35), { noDepth: true });
    }
  }
}

export const SHOTS: Record<string, (c: Ctx) => void> = {
  /** the small monsters in a row on a stage, with the Blob for scale */
  bestiary(c) {
    c.plants.length = 0;
    const Y = 600;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(95, 64), std({ color: 0x10202a, roughness: 0.95, vary: 0.5, bump: 0.8, scale: [0.3, 0.3] }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = Y;
    floor.receiveShadow = true;
    c.add(floor);
    const items: { make: () => THREE.Object3D; hue: number; dx?: number; lift?: number }[] = [
      { make: () => makeBlob({ scale: 1, look: [0.1, 0.1], lightK: 1.2, glow: 0.7, haloK: 0.3 }), hue: 0xffc860 },
      { make: makeGloomling, hue: 0x6ff0ff },
      { make: makeRootmaw, hue: 0xffa04a },
      { make: makeThornback, hue: 0xffa04a },
      { make: makeBellwether, hue: 0xd9b8ff },
      { make: makeSkitterbone, hue: 0xf4efe0 },
      { make: () => makeMimicBloom(1), hue: 0xff8aa8 },
      { make: makeMournmoth, hue: 0xbff4ff },
    ];
    const sp = num(c, 'gap', 6.6);
    items.forEach((it, i) => {
      const x = (i - (items.length - 1) / 2) * sp;
      const o = it.make();
      o.position.set(x, Y, -Math.abs(x) * 0.12);
      o.rotation.y = -x * 0.012;
      c.add(o);
      if (i === 7) {
        const cage = makeRootCage();
        cage.position.set(x, Y, -Math.abs(x) * 0.12);
        c.add(cage);
      }
      c.add(glowPool(x, Y, -Math.abs(x) * 0.12, 4.4, it.hue, 0.28), { noDepth: true });
      const l = new THREE.PointLight(it.hue, 38, 18, 1.6);
      l.position.set(x, Y + 3.4, 4.2);
      c.add(l);
    });
    c.add(motes(new THREE.Vector3(0, Y + 3, 0), new THREE.Vector3(30, 4, 6), 60, [0xffe0a0, 0xcaf6ff, 0xffb0d0], 0.2, 77, Y + 0.3, { p: c.cam.position, r: 3 }), { noDepth: true });
  },

  /** the crossroads, with the Blob at the signpost */
  hub(c) {
    crossroads(c, {});
    blobInFront(c, SEAL.x, SEAL.z, { d: num(c, 'bd', 9), side: num(c, 'bs', -2.4), turn: num(c, 'turn', 1.6), look: [0.1, 0.25] });
    c.add(motes(new THREE.Vector3(0, 6, HUB3.z), new THREE.Vector3(40, 7, 36), 140, [0xffe0a0, 0xffc860, 0xcaf6ff, 0xffb0d0], 0.26, 31, 0.5, { p: c.cam.position, r: 6 }), { noDepth: true });
  },

  /** the Seal: a gate that waits for five lights (param lit = how many are on) */
  seal(c) {
    clearTrees(c, SEAL.x, SEAL.z + 22, 36);
    clearCorridor(c, c.cam.position.x, c.cam.position.z, SEAL.x, SEAL.z, 14);
    if (num(c, 'gate', 1)) put(c, makeSeal(num(c, 'lit', 3)), SEAL.x, SEAL.z, -0.5, 0);
    if (num(c, 'cover', 1)) cover(c, SEAL.x, SEAL.z + 24, 44, { grass: 0.4, fern: 0.08, pebble: 0.2, rock: 0.02 }, holeAround(c, 8), 14);
    if (num(c, 'blob', 1)) blobInFront(c, SEAL.x, SEAL.z, { d: num(c, 'bd', 9), side: num(c, 'bs', -2.2), turn: num(c, 'turn', 1.7), look: [0, 0.4] });
    if (num(c, 'motes', 1)) c.add(motes(new THREE.Vector3(0, 6, SEAL.z + 14), new THREE.Vector3(24, 7, 20), 90, [0xffe0a0, 0xcaf6ff, 0xffb0d0], 0.26, 32, 0.5, { p: c.cam.position, r: 6 }), { noDepth: true });
  },

  /** the Edge: the ground stops, the stars are eyes, and the sky has a crack in it */
  edge(c) {
    const cx = c.cam.position.x;
    const cz = c.cam.position.z;
    c.plants.length = 0;
    const edgeZ = num(c, 'edgeZ', -205);
    const hx = num(c, 'hx', -0.28);
    const hy = num(c, 'hy', 0.2);
    c.add(skyEyes(new THREE.Vector3(cx, 0, cz), { n: 560, below: true, huge: [hx, hy, -1] }), { noDepth: true });
    if (num(c, 'crack', 1)) c.add(skyCrack(new THREE.Vector3(cx, 0, cz), new THREE.Vector3(num(c, 'cx0', 0.8), 0.04, -1), new THREE.Vector3(num(c, 'cx1', 0.42), 1.3, -0.7), 5), { noDepth: true });
    // broken pillars at the lip, and the ribbon tied to the last post
    const pillar = (x: number, z: number, h: number, seed: number) => {
      const m = new THREE.Mesh(rockBox(2.8, h, 2.8, seed * 4, slabStone, 0.16).translate(0, h / 2, 0), std({ vertexColors: true, roughness: 0.85, vary: 0.4, bump: 1.5, rim: { color: 0x9fb8e0, k: 1.1 } }));
      put(c, m, x, z, -0.3, seed * 0.7);
      m.rotation.z = (seed - 2) * 0.03;
    };
    pillar(-13, edgeZ + 9, 17, 1);
    pillar(11, edgeZ + 12, 11, 2);
    pillar(-5.5, edgeZ + 2, 3.4, 3);
    pillar(7, edgeZ + 3, 6, 4);
    const rb = makeRibbon(3.6, 0.8);
    put(c, rb, -5.5, edgeZ + 2, 3.5, 0.5);
    c.add(glowPool(-5.5, c.gy(-5.5, edgeZ + 2), edgeZ + 2, 4, 0xff7ab8, 0.25), { noDepth: true });
    cover(c, 0, edgeZ + 18, 42, { grass: 0.25, pebble: 0.5, rock: 0.06, twig: 0.06 }, (x, z) => (z < edgeZ - 1.5 ? 0 : 1) * (Math.hypot(x - cx, z - cz) < 6 ? 0.1 : 1), 16);
    const b = blobInFront(c, 0, edgeZ - 40, { d: num(c, 'bd', 12), side: num(c, 'bs', -0.8), turn: num(c, 'turn', 0.2), look: [0, 1] });
    b.position.z = Math.max(b.position.z, edgeZ + 5);
    c.add(glowPool(b.position.x, b.position.y, b.position.z, 6, 0xffc860, 0.3), { noDepth: true });
    c.rays.push({ pos: [hx * 1100 + cx, hy * 1100, -1100 + cz], k: 0.8, color: 0xff2a3a, r: 0.1 });
  },

  /** the whole world from the air */
  overview(c) {
    // cutaway: no trees on or beside the paths and in the clearings, bare trunks a little further out, so the layout can be read from the air
    c.plants = c.plants.filter((p) => walkSD(p.x, p.z) > 20);
    for (const p of c.plants) if (walkSD(p.x, p.z) < 34) p.s *= 0.82;
    crossroads(c, {});
    c.add(skyEyes(c.cam.position.clone(), { n: 420, below: true }), { noDepth: true });
    for (const zn of ZONES3) {
      const g = dressZone(c, zn.id, { guardian: true, lanterns: false, coverR: 8 });
      void g;
      c.add(glowPool(zn.heart.x, c.gy(zn.heart.x, zn.heart.z), zn.heart.z, 46, zn.hue, 0.42), { noDepth: true });
    }
    c.add(glowPool(GLADE.x, c.gy(GLADE.x, GLADE.z), GLADE.z, 34, 0xffc860, 0.4), { noDepth: true });
    c.add(motes(new THREE.Vector3(0, 40, 40), new THREE.Vector3(190, 40, 250), 260, [0xffe0a0, 0xcaf6ff, 0xffb0d0], 1.3, 41, 3), { noDepth: true });
    const water = zone3('marsh');
    c.add(makeWater(c, water.x, water.z, water.rx * 2.4, water.rz * 2.4));
  },

  /** a fight: the Blob and the Toll Queen, with the floor telling you what is coming */
  fight(c) {
    const zn = zone3('marsh');
    const guardianGroup = makeTollQueen(num(c, 'swing', 0.34));
    clearTrees(c, zn.heart.x, zn.heart.z, ARENA_R + 6);
    clearTrees(c, c.cam.position.x, c.cam.position.z, 10);
    const face = Math.atan2(zn.entry.x - zn.heart.x, zn.entry.z - zn.heart.z);
    put(c, guardianGroup, zn.heart.x, zn.heart.z, 0, face);
    dressZone(c, 'marsh', { guardian: false, lanterns: false, coverR: 40 });
    c.add(makeWater(c, zn.x, zn.z, zn.rx * 2.4, zn.rz * 2.4));
    const level = c.gy(zn.heart.x, zn.heart.z);
    // three rings of lavender light, each with a gap, and a lane: the floor's way of saying "move"
    for (const [r0, r1, gap, at, op] of [[8, 8.5, 1.0, 1.9, 0.9], [15, 15.6, 1.0, 3.1, 0.75], [22, 22.7, 1.0, 4.3, 0.6]] as [number, number, number, number, number][]) {
      const t = telegraph('ring', 0xd9b8ff, r0, r1, { gap, gapAt: at + face, op });
      t.position.set(zn.heart.x, level + 0.22, zn.heart.z);
      c.add(t, { noDepth: true });
    }
    const t2 = telegraph('ring', 0xd9b8ff, 0, 8, { gap: Math.PI * 2 - 0.02, op: 0.12 });
    t2.position.set(zn.heart.x, level + 0.2, zn.heart.z);
    c.add(t2, { noDepth: true });
    c.add(glowPool(zn.heart.x, level, zn.heart.z, 26, 0xd9b8ff, 0.2), { noDepth: true });
    const b = blobInFront(c, zn.heart.x, zn.heart.z, { d: num(c, 'bd', 7), side: num(c, 'bs', 1.6), turn: num(c, 'turn', 0.5), look: [0, 0.4] });
    // the dash: a streak of gold behind it, and the lance of light it is throwing
    const streak = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    streak.scale.set(0.5, 0.5, 4.2);
    streak.position.copy(b.position).add(new THREE.Vector3(0, 0.9, 0)).add(new THREE.Vector3(Math.sin(b.rotation.y), 0, Math.cos(b.rotation.y)).multiplyScalar(-3.4));
    streak.rotation.y = b.rotation.y;
    c.add(streak, { noDepth: true });
    const eyeTarget = new THREE.Vector3(zn.heart.x, level + 6.6 + 9.6, zn.heart.z).add(new THREE.Vector3(Math.sin(face), 0, Math.cos(face)).multiplyScalar(5));
    const from = b.position.clone().add(new THREE.Vector3(0, 1.6, 0));
    const lance = beam(eyeTarget, from, 0.35, 0.12, 0xffd070, 1.3);
    c.add(lance, { noDepth: true });
    c.rays.push({ pos: [eyeTarget.x, eyeTarget.y, eyeTarget.z], k: 0.5, color: 0xd9b8ff, r: 0.05 });
  },

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
    c.add(motes(new THREE.Vector3(cx, 4, cz + 2), new THREE.Vector3(18, 5, 14), 160, [0xffe6a0, 0xffc860, 0xcaf6ff], 0.22, 11, 0.4, { p: c.cam.position, r: 3 }), { noDepth: true });
    c.add(motes(new THREE.Vector3(cx, 2, cz + 6), new THREE.Vector3(5, 1.6, 4), 40, [0xfff0c0, 0xffd070], 0.34, 12, 0.3, { p: c.cam.position, r: 3 }), { noDepth: true });
    c.add(glowSprite(cx, 1.4, cz + 2, 7, GOLD, 0.1), { noDepth: true });
  },
};
