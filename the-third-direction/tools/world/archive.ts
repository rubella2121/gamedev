import * as THREE from 'three';
import { rng } from '../../src/core/util';
import { lin, mulRgb, mixRgb, tube } from './geo';
import { glowMat, std } from './shade';
import { glowSprite } from './fx';
import { BoxBatch } from './cubes';
import { makeLantern } from './pieces';
import { makeHearth, makePin } from './props';
import { makeLabel, specimenSprites } from './wall';
import { V } from './g-common';

/**
 * The Archive: the Collector's wing. Walnut cabinets full of small drawers with brass handles, glass jars with something pressed inside, amber lamps, giant pins, labels on strings.
 * (The Collector's own body is already a drawer cabinet, src/act2/models/collector-body.ts; these are the rest of his collection.)
 */

const wood = [0x3a2418, 0x32201a, 0x42281c, 0x2c1a14];
const brass = lin(0xd8a63a);

/** a cabinet of drawers: `cols` x `rows` of small drawers with brass handles and a cream label on each, a few pulled out */
export function makeCabinet(cols: number, rows: number, o: { seed?: number; open?: number; dw?: number; dh?: number; depth?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const r = rng((o.seed ?? 1) * 19 + 3);
  const dw = o.dw ?? 1.5;
  const dh = o.dh ?? 1.1;
  const depth = o.depth ?? 3.2;
  const w = cols * dw + 0.8;
  const h = rows * dh + 1.0;
  const body = new BoxBatch();
  const hand = new BoxBatch();
  const lab = new BoxBatch();
  const pick = () => lin(wood[Math.floor(r() * wood.length)]!);
  const b0 = pick();
  body.box(0, h / 2, 0, w, h, depth, mulRgb(b0, 1.3), mulRgb(b0, 0.8), mulRgb(b0, 0.5));
  // a cornice and a plinth
  body.box(0, h + 0.25, 0.1, w + 0.5, 0.5, depth + 0.4, mulRgb(b0, 1.5), mulRgb(b0, 0.9), mulRgb(b0, 0.6));
  body.box(0, 0.2, 0.1, w + 0.3, 0.4, depth + 0.3, mulRgb(b0, 1.2), mulRgb(b0, 0.7), mulRgb(b0, 0.5));
  const openFrac = o.open ?? 0.12;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = (i - (cols - 1) / 2) * dw;
      const y = 0.9 + j * dh + dh / 2;
      const out = r() < openFrac ? 0.6 + r() * 1.6 : 0.08;
      const c = pick();
      body.box(x, y, depth / 2 + out / 2 - 0.02, dw - 0.14, dh - 0.12, out + 0.04, mulRgb(c, 1.5), mulRgb(c, 1.0), mulRgb(c, 0.5));
      hand.box(x, y - 0.05, depth / 2 + out + 0.1, 0.38, 0.14, 0.14, brass, brass, brass);
      lab.box(x, y + dh * 0.22, depth / 2 + out + 0.03, 0.62, 0.22, 0.03, lin(0xe8dcb8), lin(0xe8dcb8), lin(0xe8dcb8));
    }
  }
  const m = new THREE.Mesh(body.geometry(), std({ vertexColors: true, roughness: 0.75, vary: 0.35, bump: 0.8, scale: [0.9, 0.9], rim: { color: 0xffb05a, k: 0.35 } }));
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  g.add(new THREE.Mesh(hand.geometry(), glowMat({ vertexColors: true, opacity: 0.55 })));
  g.add(new THREE.Mesh(lab.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })));
  return g;
}

/** a glass jar with a liquid that glows and a pressed specimen floating in it */
export function makeJar(h = 3.4, hue = 0xffa020, kind = 0): THREE.Group {
  const g = new THREE.Group();
  const R = h * 0.34;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.92, h, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = h / 2;
  g.add(glass);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.93, R * 0.86, h * 0.8, 16), glowMat({ color: hue, opacity: 0.2 }));
  liquid.position.y = h * 0.42;
  g.add(liquid);
  const t = specimenSprites()[kind % specimenSprites().length]!;
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(R * 1.5, R * 1.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: true }));
  sp.position.y = h * 0.5;
  g.add(sp);
  const rimMat = std({ color: 0xc9a24a, roughness: 0.35, metalness: 0.6, emissive: 0x2a1a04, emissiveIntensity: 0.6 });
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.04, 0.28, 16), rimMat);
  lid.position.y = h + 0.14;
  g.add(lid);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.22, 16), rimMat);
  foot.position.y = 0.11;
  g.add(foot);
  g.add(glowSprite(0, h * 0.5, 0, h * 1.5, hue, 0.16));
  return g;
}

/** a low table with jars on it */
export function makeJarTable(n = 3, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed * 7 + 1);
  const b = new BoxBatch();
  const c = lin(0x3a2418);
  b.box(0, 1.3, 0, 1.6 + n * 1.5, 0.3, 2.2, mulRgb(c, 1.6), mulRgb(c, 0.9), mulRgb(c, 0.5));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (0.7 + n * 0.7), 0.6, sz * 0.9, 0.3, 1.3, 0.3, mulRgb(c, 1.2), mulRgb(c, 0.8), mulRgb(c, 0.5));
  const m = new THREE.Mesh(b.geometry(), std({ vertexColors: true, roughness: 0.8, rim: { color: 0xffb05a, k: 0.4 } }));
  m.castShadow = true;
  g.add(m);
  for (let i = 0; i < n; i++) {
    const j = makeJar(2.2 + r() * 1.6, [0xffa020, 0x7fe8a0, 0xff8aa8, 0x9fe8ff][Math.floor(r() * 4)], Math.floor(r() * 12));
    j.position.set((i - (n - 1) / 2) * 1.9, 1.45, 0);
    g.add(j);
  }
  return g;
}

/** the dressing of the Archive island: a curved back wall of cabinets, a lamp ring, jars, pins in the floor, labels on strings */
export function dressArchive(R = 18, seed = 3): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed * 23 + 9);
  // the wall behind the Collector: cabinets of three heights standing in an arc on the far side
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (1.18 + (i / (n - 1)) * 0.64);
    const rows = [9, 14, 20, 12, 17][i % 5]!;
    const cab = makeCabinet(4, rows, { seed: i + seed, open: 0.1 });
    const rad = R + 24 + (i % 2) * 3;
    cab.position.set(Math.cos(a) * rad, -0.3, Math.sin(a) * rad);
    cab.rotation.y = -a - Math.PI / 2;
    g.add(cab);
  }
  // amber lamps standing round the near half of the floor (the third one is the Archive's hearth: a ring of stones and a pool of light, a little way in from the rim)
  for (let i = 0; i < 4; i++) {
    if (i === 2) continue;
    const a = Math.PI * (0.1 + (i / 3) * 0.8);
    const lamp = makeLantern(0xffb05a, 4.8);
    lamp.position.set(Math.cos(a) * (R - 1.6), 0, Math.sin(a) * (R - 1.6));
    lamp.rotation.y = -a + Math.PI;
    g.add(lamp);
  }
  const hearth = makeHearth();
  hearth.position.set(-6.2, 0.3, 12.8);
  g.add(hearth);
  // a couple of tables of jars
  // (the arena's pillars stand on two rings, so the tables sit between them at the back)
  for (const [x, z, ry] of [[-9.5, -14, 0.35], [9.5, -14, -0.35]] as [number, number, number][]) {
    const t = makeJarTable(3 + Math.floor(r() * 2), x + z);
    t.position.set(x, 0, z);
    t.rotation.y = ry;
    g.add(t);
  }
  // giant pins standing in the floor, tilted, the way the Collector leaves them
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const d = 6 + r() * 9;
    const px = Math.cos(a) * d;
    const pz = Math.sin(a) * d;
    // the aisle in front of the Collector stays clear, and so does the half of the floor you arrive on
    if ((Math.abs(px) < 6 && pz < 14) || pz > 0) continue;
    const pin = makePin(0.9 + r() * 0.5);
    pin.position.set(px, 0, pz);
    pin.rotation.z = (r() - 0.5) * 0.5;
    pin.rotation.x = (r() - 0.5) * 0.5;
    g.add(pin);
  }
  // labels that hang over the aisle on strings
  for (let i = 0; i < 6; i++) {
    const lab = makeLabel([`NO. ${String(100 + i * 37).padStart(4, '0')}`, ['GLOOMLING', 'ROOTMAW', 'BELLWETHER', 'SKITTER', 'MIMIC', 'MOTH'][i]!], 6, 2.4);
    const a = Math.PI * (1.22 + i * 0.11);
    lab.position.set(Math.cos(a) * 17, 13 + (i % 3) * 1.6, Math.sin(a) * 17);
    lab.rotation.y = -a - Math.PI / 2;
    g.add(lab);
    g.add(new THREE.Mesh(tube([lab.position.clone().add(V(0, 1.2, 0)), lab.position.clone().add(V(0, 9, 0))], [0.04, 0.04], 3, () => mixRgb(lin(0x8a7a5a), lin(0x8a7a5a), 0)), new THREE.MeshBasicMaterial({ color: 0x8a7a5a, fog: true })));
  }
  return g;
}
