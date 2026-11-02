import { Pix } from '../src/core/pix';
import { drawBlob } from '../src/core/art';
import * as boss from '../src/forest/bossart';
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
};

(window as unknown as { __sprites: unknown }).__sprites = {
  render: async () => {
    const out: Record<string, string> = {};
    for (const [k, fn] of Object.entries(SPRITES)) out[k] = (await fn()).toDataURL('image/png');
    return out;
  },
};
