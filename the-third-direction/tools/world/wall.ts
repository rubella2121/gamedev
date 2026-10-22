import * as THREE from 'three';
import { rng, TAU } from '../../src/core/util';
import { makeSprite, Pix, W as PW, H as PH } from '../../src/core/pix';
import { C } from '../../src/core/palette';
import { drawBlob, makeFlower, drawRootmaw } from '../../src/core/art';
import { drawBellwether, drawGloom, drawMimic, drawMoth, drawSkitter } from '../../src/core/art2';
import { drawThornback } from '../../src/forest/art3';
import { CLIFF_Y, Land, START, WORLD_H, WORLD_W } from '../../src/forest/land';
import { glowSprite } from './fx';

/**
 * The Specimen Wall: the forest's creatures, pressed flat and pinned in rows on a curved wall that goes up out of sight (the arena's own wall, src/act2/arena.ts, made as big as a world).
 * The sprites are painted by the game's own painters; nothing is drawn here that the 2D game does not already draw, except the frames and the labels.
 */

const SPR = 28;

function texOf(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** one pinned creature: painted small, with the red pin head at the top, as in the arena */
function specimen(draw: (p: Pix) => void, w = SPR, h = SPR): THREE.CanvasTexture {
  const p = makeSprite(w, h);
  draw(p);
  p.px(w / 2, 1, C.redDark);
  p.px(w / 2, 2, C.red);
  return texOf(p.canvas);
}

let cache: THREE.CanvasTexture[] | null = null;

/** the creatures of the 2D forest, as pressed specimens (the same set the wall of the arena uses, and the rest of the bestiary) */
export function specimenSprites(): THREE.CanvasTexture[] {
  if (cache) return cache;
  const flower = makeFlower(true);
  const m = SPR / 2;
  cache = [
    specimen((p) => drawBlob(p, m, 23, { s: 1.5, shadow: false })),
    specimen((p) => p.blit(flower, m - 6.5, 8)),
    specimen((p) => drawSkitter(p, m, 22, 0, 1, 'rest')),
    specimen((p) => drawGloom(p, m, 23, 0, 1)),
    specimen((p) => drawRootmaw(p, m, 24, 'idle', 0, 1)),
    specimen((p) => drawBellwether(p, m, 25, 0, 0, 0, 0, 1)),
    specimen((p) => drawMoth(p, m, 14, 0, 0.5)),
    specimen((p) => drawThornback(p, m, 22, 0, 'idle', 1, 2)),
    specimen((p) => drawMimic(p, flower, m, 24, 'idle', 0, false)),
    specimen((p) => {
      // a mushroom
      p.rect(m - 1, 14, 3, 8, C.bone);
      p.ellipse(m, 13, 7, 4.5, C.tealMid);
      p.ellipse(m - 1, 11.5, 3.5, 1.8, C.moon);
    }),
    specimen((p) => {
      // a skull
      p.ellipse(m, 13, 7, 6, C.bone);
      p.rect(m - 4, 17, 9, 4, C.bone);
      p.rect(m - 4, 11, 3, 3, C.ink);
      p.rect(m + 2, 11, 3, 3, C.ink);
      for (let i = 0; i < 4; i++) p.px(m - 3 + i * 2, 20, C.ink);
    }),
    specimen((p) => {
      // a blue moth with its wings flat
      p.ellipse(m - 6, 13, 6, 5, '#7fd8f5');
      p.ellipse(m + 6, 13, 6, 5, '#7fd8f5');
      p.ellipse(m - 6, 12, 4, 3, '#e8fffb');
      p.ellipse(m + 6, 12, 4, 3, '#e8fffb');
      p.rect(m - 1, 9, 2, 9, '#1a3a5a');
    }),
  ];
  return cache;
}

export interface WallOpts {
  R: number;
  /** arc to cover, in radians either side of due north (-z) */
  arc: number;
  y0: number;
  y1: number;
  /** size of a specimen card, and the gap between them */
  card?: number;
  gap?: number;
  seed?: number;
  /** brightness of the sprites (the wall is dim: the specimens are dead) */
  dim?: number;
  /** leave these rectangles empty: [angle, y, half-width in radians, half-height] */
  holes?: [number, number, number, number][];
  /** how bright each specimen is (0..1) by its angle and height: the wall fades into the dark towards its edges */
  shade?: (th: number, y: number) => number;
}

/** the wall: a dark curved panel, shelves, and a grid of framed, pinned specimens */
export function makeWall(o: WallOpts): THREE.Group {
  const g = new THREE.Group();
  const r = rng(o.seed ?? 21);
  const card = o.card ?? 11;
  const gap = o.gap ?? 1.6;
  const rowH = card + gap;
  const dth = (card + gap) / o.R;
  const rows = Math.floor((o.y1 - o.y0) / rowH);
  const cols = Math.floor((o.arc * 2) / dth);
  // the panel itself, and a shelf under every row
  const panel = new THREE.Mesh(
    new THREE.CylinderGeometry(o.R + 1, o.R + 1, o.y1 - o.y0 + 40, 96, 1, true, Math.PI - o.arc - 0.2, o.arc * 2 + 0.4),
    new THREE.MeshBasicMaterial({ color: 0x120a22, side: THREE.BackSide, fog: true }),
  );
  panel.position.y = (o.y0 + o.y1) / 2;
  g.add(panel);
  const shelfMat = new THREE.MeshBasicMaterial({ color: 0x2a1e48, side: THREE.DoubleSide, fog: true });
  for (let row = 0; row <= rows; row++) {
    const shelf = new THREE.Mesh(new THREE.CylinderGeometry(o.R - 0.5, o.R - 0.5, 1.1, 96, 1, true, Math.PI - o.arc - 0.2, o.arc * 2 + 0.4), shelfMat);
    shelf.position.y = o.y0 + row * rowH - gap * 0.5;
    g.add(shelf);
  }
  const kinds = specimenSprites();
  type Item = { m: THREE.Matrix4; k: number };
  const lists: Item[][] = kinds.map(() => []);
  const cards: Item[] = [];
  const frames: Item[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      const th = -o.arc + (c + 0.5 + (row % 2) * 0.5) * dth;
      if (Math.abs(th) > o.arc) continue;
      const y = o.y0 + row * rowH + card / 2;
      if (o.holes?.some(([a, hy, hw, hh]) => Math.abs(th - a) < hw && Math.abs(y - hy) < hh)) continue;
      const pos = new THREE.Vector3(o.R * Math.sin(th), y, -o.R * Math.cos(th));
      e.set(0, -th, (r() - 0.5) * 0.1);
      q.setFromEuler(e);
      const inward = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
      const sc = 0.85 + r() * 0.25;
      const k = o.shade ? o.shade(th, y) : 1;
      const put = (list: Item[], s: number, off: number) => {
        list.push({ m: new THREE.Matrix4().compose(pos.clone().addScaledVector(inward, off), q, new THREE.Vector3(s, s, 1)), k });
      };
      put(frames, card * 1.04, 0.0);
      put(cards, card * 0.94, 0.08);
      put(lists[Math.floor(r() * kinds.length)]!, card * 0.78 * sc, 0.16);
    }
  }
  const col = new THREE.Color();
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Item[]) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      im.setMatrixAt(i, it.m);
      im.setColorAt(i, col.setScalar(it.k));
    });
    im.frustumCulled = false;
    g.add(im);
  };
  const plane = new THREE.PlaneGeometry(1, 1);
  mk(plane, new THREE.MeshBasicMaterial({ color: 0x3a2e5a, side: THREE.DoubleSide, fog: true }), frames);
  mk(plane, new THREE.MeshBasicMaterial({ color: 0x1a1230, side: THREE.DoubleSide, fog: true }), cards);
  const dim = o.dim ?? 0.8;
  kinds.forEach((t, i) => mk(plane, new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: true, color: new THREE.Color(dim, dim, dim) }), lists[i]!));
  void m4;
  return g;
}

/** a specimen label: a small cream card with a typed line, lit by the lamp that hangs over it */
export function makeLabel(lines: string[], w = 12, h = 4): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = Math.round((128 * h) / w);
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8dcb8';
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#8a6a3a';
  x.lineWidth = 2;
  x.strokeRect(2, 2, c.width - 4, c.height - 4);
  x.fillStyle = '#3a2410';
  x.font = 'bold 13px "DejaVu Sans Mono", monospace';
  x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, 8, 14 + i * 16));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, fog: true }));
}

/** the two big pinned blobs: Mother (with her bow) and Father, at the top of the wall, glowing a little warmer than everything else on it */
export function makeParents(o: { R: number; y: number; angle?: number; spread?: number; scale?: number }): THREE.Group {
  const g = new THREE.Group();
  const sc = o.scale ?? 0.95;
  const big = (bow: boolean) => {
    const h = bow ? 34 : 26;
    const p = makeSprite(34, h);
    drawBlob(p, 17, h - 2, { s: 2.2, shadow: false, bow });
    p.px(17, 1, C.redDark);
    p.px(17, 2, C.red);
    return { t: texOf(p.canvas), h };
  };
  const spread = o.spread ?? 0.2;
  for (const sx of [-1, 1]) {
    const mother = sx < 0;
    const { t, h } = big(mother);
    const th = (o.angle ?? 0) + sx * spread;
    const wdt = 34 * sc;
    const hgt = h * sc;
    const pos = new THREE.Vector3(o.R * Math.sin(th), o.y + (mother ? 4 * sc : 0), -o.R * Math.cos(th));
    const grp = new THREE.Group();
    grp.position.copy(pos);
    grp.rotation.y = -th;
    // a pale card and a frame, so they read as the same kind of thing as the rest of the wall
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(wdt * 1.22, hgt * 1.16), new THREE.MeshBasicMaterial({ color: 0x4a3a6a, fog: true }));
    frame.position.z = -0.2;
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(wdt * 1.12, hgt * 1.06), new THREE.MeshBasicMaterial({ color: 0x241a3e, fog: true }));
    mat.position.z = -0.1;
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: false, color: 0xffffff }));
    grp.add(frame, mat, sprite);
    // warm halo, so they are the first thing the eye finds
    grp.add(glowSprite(0, 0, 1, wdt * 1.7, 0xffd070, 0.22));
    // a giant pin through the top of each, and its label below
    const pinHead = new THREE.Mesh(new THREE.SphereGeometry(1.6 * sc, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe02b3a, fog: false }));
    pinHead.position.set(0, hgt * 0.5 + 1, 1.4);
    grp.add(pinHead);
    const label = makeLabel(mother ? ['NO. 0001', 'MOTHER', 'warm; keep out of light'] : ['NO. 0002', 'FATHER', 'warm; keep out of light'], 22 * sc, 7.5 * sc);
    label.position.set(0, -hgt * 0.5 - 6 * sc, 0.3);
    grp.add(label);
    g.add(grp);
  }
  return g;
}

/** the moon, as the game paints it, with a golden eye in it (the way the Moon concept art has it): the lamp of the whole place, and the thing that blinks at the end */
export function makeMoonEye(radius: number, open = 0.8): THREE.Group {
  const g = new THREE.Group();
  const p = makeSprite(96, 96);
  const cx = 48;
  const cy = 48;
  p.ellipse(cx, cy, 46, 46, '#2a2050');
  p.ellipse(cx, cy, 45, 45, '#c8c0f0');
  p.ellipse(cx - 4, cy - 4, 40, 40, '#e6e0ff');
  p.ellipse(cx - 9, cy - 9, 28, 28, '#f6f2ff');
  const rn = rng(9);
  for (let i = 0; i < 9; i++) {
    const a = rn() * TAU;
    const d = 18 + rn() * 22;
    p.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + rn() * 4, 2 + rn() * 3, '#b4acdc');
  }
  // red veins running in from the rim
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + rn() * 0.2;
    let x = cx + Math.cos(a) * 45;
    let y = cy + Math.sin(a) * 45;
    const len = 8 + rn() * 14;
    for (let k = 0; k < len; k++) {
      p.px(x, y, '#c8283a');
      x -= Math.cos(a + (rn() - 0.5) * 0.9);
      y -= Math.sin(a + (rn() - 0.5) * 0.9);
    }
  }
  // the iris and its slit
  p.ellipse(cx, cy, 20, 20, '#5a3a08');
  p.ellipse(cx, cy, 18, 18, '#f2c64e');
  p.ellipse(cx - 2, cy - 2, 14, 14, '#ffd878');
  p.ring(cx, cy, 18, 18, 2, '#a86a10');
  p.ellipse(cx, cy, 4, 16, '#150a0a');
  p.px(cx - 8, cy - 9, '#ffffff');
  p.px(cx - 7, cy - 9, '#ffffff');
  // the lid, drawn down over the top of it by `open`
  if (open < 0.95) {
    const lid = Math.round((1 - open) * 46);
    p.ellipse(cx, cy - 46 + lid, 52, 46, '#150e2e');
    p.ring(cx, cy - 46 + lid, 52, 46, 2, '#6a5aa8');
  }
  const t = texOf(p.canvas);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, fog: false }));
  g.add(m);
  g.add(glowSprite(0, 0, -1, radius * 5, 0xb8a8ff, 0.4));
  return g;
}

/** the old forest, pressed flat: the 2D game's own ground, trees and flowers, painted by its own code onto one big page (the black round crater is where the foot came down) */
export function pressedForest(unit = 0.2): THREE.Group {
  const g = new THREE.Group();
  const big = document.createElement('canvas');
  big.width = WORLD_W;
  big.height = WORLD_H;
  const bctx = big.getContext('2d')!;
  bctx.fillStyle = '#07131b';
  bctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const pix = new Pix(PW, PH);
  const land = new Land(pix.ctx);
  for (let cy = 0; cy < WORLD_H; cy += PH) {
    for (let cx = 0; cx < WORLD_W; cx += PW) {
      pix.clear('#07131b');
      land.drawGround(pix, cx, cy);
      if (cy < CLIFF_Y + 120) land.drawVoid(pix, cx, cy);
      land.drawDecals(pix, cx, cy);
      land.drawFlowers(pix, cx, cy, 0, 0, 1);
      const list = land.visibleProps(cx, cy).slice().sort((a, b) => a.y - b.y);
      for (const pr of list) pix.blit(pr.img, pr.x - cx - pr.img.width / 2, pr.y - cy - pr.img.height + 3);
      bctx.drawImage(pix.canvas, cx, cy);
    }
  }
  // the crater in the starting glade
  bctx.fillStyle = '#02030a';
  bctx.beginPath();
  bctx.ellipse(START.x, START.y, 64, 46, 0, 0, TAU);
  bctx.fill();
  bctx.strokeStyle = '#0a1a22';
  bctx.lineWidth = 4;
  bctx.stroke();
  const t = new THREE.CanvasTexture(big);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const w = WORLD_W * unit;
  const h = WORLD_H * unit;
  const page = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(2.0, 2.0, 2.2), fog: true }));
  page.rotation.x = -Math.PI / 2;
  g.add(page);
  // the page it is pressed in: a pale mat and a dark board
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + 5, h + 5), new THREE.MeshBasicMaterial({ color: 0x3a3258, fog: true }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = -0.3;
  g.add(mat);
  return g;
}
