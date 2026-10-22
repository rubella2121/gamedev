import * as THREE from 'three';
import { archiveTile, driftRocks, gardenTile, makeBridge, makeIsland, makePillar, remixTile, summitTile, type TileColor } from './cubes';
import { lin } from './geo';
import { makeCrystal, makeGate, makeHearth, makeLandingSeal, makePad, makeWell } from './props';
import { makeMoonEye, makeParents, makeWall, pressedForest } from './wall';
import { skyCrack, telegraph } from './pieces';
import { dressArchive } from './archive';
import { dressRemix, makeSpineBridge } from './stitch';
import { beam, glowPool, glowSprite, motes } from './fx';
import type { CastName, Ctx } from './ctx';

/**
 * The layout of the explorable 3D part: the Pressed Garden (the arena, as it is) at the bottom of a drum whose inside wall is the Specimen Wall, and a way up the wall in three steps,
 * one for each boss, to the two big pinned blobs near the top. Units are the arena's (the Blob is 1.8 tall, the arena is 18 across the middle).
 * x is right, z is towards a camera that looks at the back wall, y is up. Every boss stands beyond the north edge of its disc, facing south, exactly as in the arena.
 */

export interface Place {
  /** the middle of the walkable disc, on its top face */
  c: [number, number, number];
  R: number;
}

export const WALL_R = 132;

export const PLACES: Record<'garden' | 'archive' | 'remix' | 'summit', Place> = {
  garden: { c: [0, 0, 0], R: 18 },
  archive: { c: [64, 46, -18], R: 18 },
  remix: { c: [-64, 92, -30], R: 18 },
  summit: { c: [0, 136, -62], R: 10 },
};
/** the pressed forest lies this far below the Garden */
export const FOREST_Y = -80;
/** the parents are pinned this high on the wall */
export const PARENTS_Y = 198;
/** where they can be reached from: a ledge under the frames */
export const LEDGE = new THREE.Vector3(0, 168, -WALL_R + 14);

/**
 * The arena's own furniture, the same on every island (only the dressing changes between the Garden, the Archive and the Remix): four pillars near and four far, three wells,
 * four surge pads on the middle ring, four light crystals on the terrace, the landing seal. `rune` adds X's stage, `hearth` puts a lantern pool at that spot (x, z).
 */
function addFurniture(c: Ctx, P: Place, o: { rune?: boolean; hearth?: [number, number] }): void {
  const place = (obj: THREE.Object3D, x: number, z: number, ry = 0, y = 0) => {
    obj.position.set(P.c[0] + x, P.c[1] + y, P.c[2] + z);
    obj.rotation.y = ry;
    c.add(obj);
    return obj;
  };
  // pillars: a near ring and a far ring, like the arena
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    place(makePillar(i), Math.cos(a) * 7.5, Math.sin(a) * 7.5 - 2);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.2;
    place(makePillar(i + 4), Math.cos(a) * 13.5, Math.sin(a) * 13.5 - 2);
  }
  // wells: two on the near half, one out on the far left
  for (const a of [(30 * Math.PI) / 180, (150 * Math.PI) / 180, (213 * Math.PI) / 180]) place(makeWell(), Math.cos(a) * 14.5, Math.sin(a) * 14.5, 0, 0.35);
  // surge pads on the middle ring, each throwing you clockwise
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    // the arrow points along +z in the pad's own frame; clockwise seen from above is the tangent (-sin a, cos a)
    place(makePad(), Math.cos(a) * 9.5, Math.sin(a) * 9.5, Math.atan2(-Math.sin(a), Math.cos(a)), 0);
  }
  for (const [x, z] of [[11.3, 11.3], [-11.3, 11.3], [11.3, -11.3], [-11.3, -11.3]] as [number, number][]) place(makeCrystal(1, Math.round(x + z)), x, z, 0, 0.35);
  place(makeLandingSeal(), 0, 12);
  if (o.rune) {
    place(stageRune(), 0, -14.5, 0, 0.5);
    c.add(glowPool(P.c[0], P.c[1] + 0.4, P.c[2] - 14.5, 12, 0xe02b3a, 0.18), { noDepth: true });
  }
  if (o.hearth) place(makeHearth(), o.hearth[0], o.hearth[1], 0, 0.3);
}

/** the Pressed Garden: the arena's platform, pillars, wells, pads, crystals and the stage where X plants its foot, plus the entry bridge from the crack */
export function addGarden(c: Ctx, o: { bridge?: boolean; furniture?: boolean } = {}): void {
  const P = PLACES.garden;
  const isl = makeIsland({ R: P.R, seed: 5, color: gardenTile, terraceR: 14.8, depth: 22 });
  isl.position.set(...P.c);
  c.add(isl);
  if (o.furniture === false) return;
  addFurniture(c, P, { rune: true, hearth: [5, 13.2] });
  if (o.bridge !== false) addEntryBridge(c);
}

/** the stage where X plants its foot: three red rings and a triangle painted on the floor */
function stageRune(): THREE.Group {
  const rune = new THREE.Group();
  for (const [r0, r1, op] of [[6.2, 6.5, 0.9], [4.4, 4.55, 0.6], [2.6, 2.7, 0.5]] as [number, number, number][]) rune.add(telegraph('ring', 0xe02b3a, r0, r1, { op }));
  const tri = new THREE.Shape();
  const hole = new THREE.Path();
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    if (i === 0) {
      tri.moveTo(Math.cos(a) * 5.2, Math.sin(a) * 5.2);
      hole.moveTo(Math.cos(a) * 4.9, Math.sin(a) * 4.9);
    } else {
      tri.lineTo(Math.cos(a) * 5.2, Math.sin(a) * 5.2);
      hole.lineTo(Math.cos(a) * 4.9, Math.sin(a) * 4.9);
    }
  }
  tri.closePath();
  hole.closePath();
  tri.holes.push(hole);
  const tm = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: 0xe02b3a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  tm.rotation.x = -Math.PI / 2;
  tm.renderOrder = 4;
  rune.add(tm);
  return rune;
}

/** the way you came in: a bridge south from the Garden that ends in the crack you fell through */
export function addEntryBridge(c: Ctx): void {
  const P = PLACES.garden;
  const end = new THREE.Vector3(P.c[0], 0, P.c[2] + 92);
  c.add(makeBridge(new THREE.Vector3(P.c[0], 0, P.c[2] + 18), end, { width: 3, posts: 8, seed: 3 }));
  c.add(skyCrack(end.clone().add(new THREE.Vector3(0, 4, 4)), new THREE.Vector3(0.02, -0.5, 0.2), new THREE.Vector3(-0.02, 0.9, 0.15), 8, 30, 70), { noDepth: true });
  c.add(glowSprite(end.x, end.y + 6, end.z + 2, 26, 0xe8e0ff, 0.5), { noDepth: true });
}

export function addArchiveIsland(c: Ctx, o: { dressed?: boolean } = {}): void {
  const P = PLACES.archive;
  const isl = makeIsland({ R: P.R, seed: 11, color: archiveTile, terraceR: 14.8, depth: 22 });
  isl.position.set(...P.c);
  c.add(isl);
  if (o.dressed !== false) {
    addFurniture(c, P, {});
    const d = dressArchive(P.R, 3);
    d.position.set(...P.c);
    c.add(d);
  }
}

export function addRemixIsland(c: Ctx, o: { dressed?: boolean } = {}): void {
  const P = PLACES.remix;
  const isl = makeIsland({ R: P.R, seed: 17, color: remixTile, terraceR: 14.8, depth: 22 });
  isl.position.set(...P.c);
  c.add(isl);
  if (o.dressed !== false) {
    addFurniture(c, P, { hearth: [5, 13.2] });
    // threads run out from the rim to points on the wall behind it
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const th = -0.62 + i * 0.12;
      pts.push(new THREE.Vector3(WALL_R * Math.sin(th) - P.c[0], 6 + (i % 3) * 9, -WALL_R * Math.cos(th) - P.c[2]));
    }
    const d = dressRemix(P.R, pts, 5);
    d.position.set(...P.c);
    c.add(d);
  }
}

export function addSummitIsland(c: Ctx): void {
  const P = PLACES.summit;
  const isl = makeIsland({ R: P.R, seed: 23, color: summitTile, depth: 14 });
  isl.position.set(...P.c);
  c.add(isl);
  const hearth = makeHearth();
  hearth.position.set(P.c[0] + 4, P.c[1] + 0.3, P.c[2] + 3);
  c.add(hearth);
}

/** the ways between: stair-bridges, each closed by a pinned gate until the boss before it falls */
export function addRoutes(c: Ctx, o: { gates?: boolean } = {}): void {
  const G = PLACES.garden;
  const A = PLACES.archive;
  const R = PLACES.remix;
  const S = PLACES.summit;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Garden -> Archive: out of the stage's north-east corner, climbing east
  const a0 = v(G.c[0] + 17, 0, G.c[2] - 5);
  const a1 = v(A.c[0] - 17, A.c[1], A.c[2] + 8);
  c.add(makeBridge(a0, a1, { width: 3, posts: 9, seed: 4 }));
  // Archive -> Remix: the long span across the middle of the drum, a bridge of vertebrae
  const b0 = v(A.c[0] - 17, A.c[1], A.c[2] - 6);
  const b1 = v(R.c[0] + 17, R.c[1], R.c[2] + 6);
  const bone: TileColor = (_x, _z, _d, h) => (h > 0.5 ? lin(0xb4a2a6) : lin(0xa59498));
  c.add(makeBridge(b0, b1, { width: 3, posts: 10, seed: 5, color: bone }));
  c.add(makeSpineBridge(b0, b1, 3));
  // Remix -> Summit
  const c0 = v(R.c[0] + 15, R.c[1], R.c[2] - 12);
  const c1 = v(S.c[0] - 9, S.c[1], S.c[2] + 4);
  c.add(makeBridge(c0, c1, { width: 3, posts: 9, seed: 6 }));
  // the last stair: from the summit to the ledge under the parents
  c.add(makeBridge(v(S.c[0], S.c[1], S.c[2] - 9), v(LEDGE.x, LEDGE.y, LEDGE.z + 7), { width: 4, posts: 7, seed: 7 }));
  const ledge = makeIsland({ R: 7, seed: 31, color: summitTile, depth: 8 });
  ledge.position.copy(LEDGE);
  c.add(ledge);
  if (o.gates) {
    for (const [p, ry] of [[a0, -Math.PI / 2], [b0, Math.PI / 2], [c0, -Math.PI / 4]] as [THREE.Vector3, number][]) {
      const gate = makeGate({ w: 5.5, h: 9 });
      gate.position.copy(p).add(v(ry < 0 ? 3 : -3, 0, 0));
      gate.rotation.y = ry;
      c.add(gate);
    }
  }
}

/** the wall of pinned specimens, the parents' frames near the top, the moon over the open top of the drum */
export function addWall(c: Ctx, o: { arc?: number; moon?: boolean; dim?: number } = {}): void {
  const arc = o.arc ?? 1.45;
  // the specimens fade into the dark towards the sides and the bottom, so the eye stays on the islands and on the parents
  const shade = (th: number, y: number) => {
    const side = 1 - Math.pow(Math.min(1, Math.abs(th) / arc), 2) * 0.85;
    const up = 0.45 + 0.55 * Math.min(1, Math.max(0, (y - FOREST_Y) / 120));
    const nearParents = Math.exp(-(Math.pow(th / 0.5, 2) + Math.pow((y - PARENTS_Y) / 60, 2)));
    return side * up * (0.8 + 0.5 * nearParents);
  };
  c.add(makeWall({ R: WALL_R, arc, y0: FOREST_Y - 10, y1: 330, holes: [[0, PARENTS_Y, 0.3, 24]], seed: 21, dim: o.dim ?? 0.5, shade }));
  c.add(makeParents({ R: WALL_R - 2, y: PARENTS_Y, angle: 0, spread: 0.19 }));
  if (o.moon !== false) {
    const moon = makeMoonEye(64, 0.8);
    moon.position.set(0, 312, -WALL_R * 0.6);
    moon.lookAt(0, 120, 80);
    c.add(moon, { noDepth: true });
    c.rays.push({ pos: [0, 312, -WALL_R * 0.6], k: 0.5, color: 0xc8c0ff, r: 0.06 });
  }
}

/** the old forest, pressed flat, lying far below at the bottom of the drum */
export function addForest(c: Ctx): void {
  const f = pressedForest(0.14);
  f.position.set(0, FOREST_Y, 62);
  c.add(f, { noDepth: true });
}

/** broken rocks of the old world, drifting everywhere there is nothing else */
export function addDrift(c: Ctx, n = 260): void {
  const avoid = Object.values(PLACES).map((p) => ({ c: new THREE.Vector3(...p.c).add(new THREE.Vector3(0, -8, 0)), r: p.R + 16 }));
  c.add(driftRocks(new THREE.Vector3(0, 100, -20), new THREE.Vector3(120, 170, 100), n, 41, avoid));
}

/** a few motes of light drifting in the void between the islands */
export function addMotes(c: Ctx, center: THREE.Vector3, half: THREE.Vector3, n = 120): void {
  c.add(motes(center, half, n, [0x9ff4ee, 0xe8fffb, 0xb88aff, 0xffd878], 0.9, 77), { noDepth: true });
}

/** the monsters of the 3D part, each on its own island, standing where the arena puts them: beyond the north edge */
export function addCast(c: Ctx, which: CastName[] = ['x', 'collector', 'mash']): void {
  const at: Record<CastName, Place> = { x: PLACES.garden, collector: PLACES.archive, mash: PLACES.remix, fox: PLACES.garden };
  for (const n of which) {
    const e = c.cast[n];
    if (!e) continue;
    e.group.position.set(...at[n].c);
    c.add(e.group);
    e.api?.update?.(0.05, 0.05);
  }
}

/** the named points the sheets pin their labels to (only the ones a picture can see are saved) */
export function addAnchors(c: Ctx): void {
  const A = c.anchors;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const G = PLACES.garden;
  const Ar = PLACES.archive;
  const Re = PLACES.remix;
  const Su = PLACES.summit;
  A['forest'] = v(0, FOREST_Y, 62);
  A['crack'] = v(0, 6, G.c[2] + 94);
  A['entry'] = v(0, 0, G.c[2] + 54);
  A['garden'] = v(...G.c);
  A['x'] = v(G.c[0], G.c[1] + 15, G.c[2] - 29);
  A['stage'] = v(G.c[0], 0.5, G.c[2] - 14.5);
  A['landing'] = v(G.c[0], 0.3, G.c[2] + 12);
  A['hearth-garden'] = v(G.c[0] + 5, 4, G.c[2] + 13.2);
  A['wells'] = v(G.c[0] + Math.cos(0.52) * 14.5, 1.5, G.c[2] + Math.sin(0.52) * 14.5);
  A['pads'] = v(G.c[0] + 9.5, 0.5, G.c[2]);
  A['crystals'] = v(G.c[0] - 11.3, 1.5, G.c[2] + 11.3);
  A['archive'] = v(...Ar.c);
  A['collector'] = v(Ar.c[0], Ar.c[1] + 12, Ar.c[2] - 29);
  A['cabinets'] = v(Ar.c[0] + 10, Ar.c[1] + 12, Ar.c[2] - 21);
  A['remix'] = v(...Re.c);
  A['mash'] = v(Re.c[0], Re.c[1] + 13, Re.c[2] - 26);
  A['threads'] = v(Re.c[0] - 6, Re.c[1] + 18, Re.c[2] - 30);
  A['summit'] = v(...Su.c);
  A['ledge'] = v(LEDGE.x, LEDGE.y + 1, LEDGE.z);
  A['parents'] = v(0, PARENTS_Y + 2, -WALL_R + 2);
  A['moon'] = v(0, 312, -WALL_R * 0.6);
  A['gate1'] = v(G.c[0] + 20, 5, G.c[2] - 5);
  A['gate2'] = v(Ar.c[0] - 20, Ar.c[1] + 5, Ar.c[2] - 6);
  A['gate3'] = v(Re.c[0] + 18, Re.c[1] + 5, Re.c[2] - 12);
  A['fox'] = v(30, 25, -6);
  A['wall'] = v(-70, 150, -WALL_R * 0.8);
}

/** columns of cold light falling through the open top of the drum, from the moon down onto the islands */
export function addMoonShafts(c: Ctx, k = 0.07): void {
  const top = new THREE.Vector3(0, 312, -WALL_R * 0.6);
  for (const [dx, dz, r] of [[-44, 4, 14], [52, -10, 12]] as [number, number, number][]) {
    c.add(beam(top.clone().add(new THREE.Vector3(dx * 0.15, 0, 0)), new THREE.Vector3(dx, -60, dz), 4, r, 0xc8c0ff, k), { noDepth: true });
  }
}
