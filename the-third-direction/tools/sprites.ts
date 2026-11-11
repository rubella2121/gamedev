import { Pix } from '../src/core/pix';
import { drawBlob, drawMoon, makeTree } from '../src/core/art';
import { C } from '../src/core/palette';
import * as boss from '../src/forest/bossart';
import { BOSS_Z } from '../src/act2/arena';
import { cutout3d } from './gallery3d';

/**
 * The bosses and the blob family as sprites on a transparent background, at the game's own pixel size, for the brand
 * art (tools/brand). The forest guardians come from the game's pixel painter; The Collector and The Mash are their real
 * 3D models drawn small, so they read as pixel art too. `__sprites.render()` returns { name: PNG data URL }.
 */

/** crop a canvas to what is drawn on it */
function trim(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext('2d')!;
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++)
      if (d[(y * c.width + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return c;
  const o = document.createElement('canvas');
  o.width = x1 - x0 + 1;
  o.height = y1 - y0 + 1;
  o.getContext('2d')!.drawImage(c, -x0, -y0);
  return o;
}

function pix(w: number, h: number, draw: (p: Pix) => void) {
  const p = new Pix(w, h);
  draw(p);
  return trim(p.canvas);
}

/** soften a 3D render into flat pixel art: every pixel either there or not, colours kept */
function hardAlpha(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!;
  const im = g.getImageData(0, 0, c.width, c.height);
  for (let i = 3; i < im.data.length; i += 4) im.data[i] = im.data[i]! > 110 ? 255 : 0;
  g.putImageData(im, 0, 0);
  return trim(c);
}

const SPRITES: Record<string, () => Promise<HTMLCanvasElement> | HTMLCanvasElement> = {
  gloommother: () => pix(240, 220, (p) => boss.drawGloommother(p, 120, 200, 3.9, { exposed: 0.6, pups: 0.9 })),
  king: () => pix(240, 220, (p) => boss.drawThornbackKing(p, 120, 200, 3.1, { mode: 2 })),
  queen: () => pix(240, 260, (p) => boss.drawTollQueen(p, 120, 240, 3.5, { toll: 1, hover: 10, look: [0.4, 0.3] })),
  wyrm: () => pix(240, 220, (p) => boss.drawBoneWyrm(p, 120, 200, 3.1, { mode: 1 })),
  mimic: () => pix(240, 220, (p) => boss.drawMimicQueen(p, 120, 200, 3.1, { open: 1 })),
  blob: () => pix(60, 40, (p) => drawBlob(p, 30, 34, { s: 1.6, lookY: -1, shadow: false })),
  mother: () => pix(60, 40, (p) => drawBlob(p, 30, 34, { s: 2, lookY: -1, bow: true, shadow: false })),
  father: () => pix(60, 40, (p) => drawBlob(p, 30, 34, { s: 2.3, lookY: -1, shadow: false })),
  collector: async () => hardAlpha(await cutout3d('collector', 190, 190)),
  mash: async () => hardAlpha(await cutout3d('mash', 190, 160)),
  // the forest's own trees and moon, and X's three eyes as he opens them at the Edge (for the pop-up book)
  'tree-a': () => trim(makeTree(3, 120)),
  'tree-b': () => trim(makeTree(11, 150)),
  'tree-c': () => trim(makeTree(23, 110, true)),
  moon: () => pix(60, 60, (p) => drawMoon(p, 30, 30, 20)),
  'x-eyes': () =>
    pix(130, 34, (p) => {
      for (const [x, y] of [[22, 18], [65, 14], [108, 18]] as [number, number][]) {
        p.dither(x, y, 26, 14, C.redDark, 0.35);
        p.ellipse(x, y, 16, 8, '#d9e4ff');
        p.ellipse(x, y + 1, 7, 6.5, C.red);
        p.ellipse(x, y + 1, 2, 5.5, C.ink);
        p.px(x + 2, y - 1, C.white);
        p.ring(x, y, 16, 8, 1, C.ink);
      }
    }),
  // the 3D bosses at full size, smooth (for the videos)
  'collector-hd': async () => trim(await cutout3d('collector', 900, 900)),
  'mash-hd': async () => trim(await cutout3d('mash', 1000, 840)),
  'x-hd': async () => trim(await cutout3d('x', 900, 1500, { pos: [0, 9, 22], look: [0, 9, BOSS_Z], fov: 52 })),
};

/** the 3D bosses again, large enough for a 4K wallpaper (tools/brand/wallpapers.html): only rendered when asked for by name */
const LARGE: typeof SPRITES = {
  'collector-4k': async () => trim(await cutout3d('collector', 2200, 2200)),
  'mash-4k': async () => trim(await cutout3d('mash', 2600, 2184)),
  'x-4k': async () => trim(await cutout3d('x', 2160, 3600, { pos: [0, 9, 22], look: [0, 9, BOSS_Z], fov: 52 })),
  // his head and shoulders, close
  'x-bust-4k': async () => trim(await cutout3d('x', 3800, 2375, { pos: [0, 12, 22], look: [0, 11.2, BOSS_Z], fov: 18.5 })),
};

(window as unknown as { __sprites: unknown }).__sprites = {
  /** one 3D boss from any camera (to frame a new shot without rebuilding) */
  cut: async (name: 'collector' | 'mash' | 'x', w: number, h: number, cam?: Parameters<typeof cutout3d>[3]) => trim(await cutout3d(name, w, h, cam)).toDataURL('image/png'),
  /** every sprite, or only the ones named (the large ones are only ever rendered by name) */
  render: async (names?: string[]) => {
    const out: Record<string, string> = {};
    const all = { ...SPRITES, ...LARGE };
    for (const k of names?.length ? names : Object.keys(SPRITES)) out[k] = (await all[k]!()).toDataURL('image/png');
    return out;
  },
};
