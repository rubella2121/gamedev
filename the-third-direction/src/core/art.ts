import { Pix, makeSprite, W, H } from './pix';
import { C } from './palette';
import { clamp, hash2, rng, TAU } from './util';

/* ------------------------------------------------------------------ */
/* Pre-rendered tiles and sprites (drawn once, then blitted)           */
/* ------------------------------------------------------------------ */

export type GroundKind = 'forest' | 'marsh' | 'meadow' | 'bones' | 'thicket';

export function makeGroundTile(kind: GroundKind = 'forest'): HTMLCanvasElement {
  if (kind !== 'forest') return makeBiomeGround(kind);
  const p = makeSprite(64, 64);
  p.clear('#103846');
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const n = hash2(x * 3 + 11, y * 5 + 7);
      if (n < 0.1) p.px(x, y, '#0c2e3a');
      else if (n > 0.95) p.px(x, y, '#18505a');
      else if (n > 0.9 && (x + y) % 2 === 0) p.px(x, y, '#14444f');
    }
  }
  const r = rng(9);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * 62) + 1;
    const y = Math.floor(r() * 60) + 3;
    p.px(x, y, '#1f6a5e');
    p.px(x - 1, y - 1, '#2a8a70');
    p.px(x + 1, y - 1, '#2a8a70');
    p.px(x, y - 2, '#3aa282');
  }
  return p.canvas;
}

export function makePathTile(kind: GroundKind = 'forest'): HTMLCanvasElement {
  const p = makeSprite(64, 64);
  p.clear(kind === 'marsh' ? '#1a4a44' : kind === 'meadow' ? '#1b5750' : kind === 'bones' ? '#2a4a52' : kind === 'thicket' ? '#1a3c3c' : '#17494f');
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const n = hash2(x * 7 + 3, y * 3 + 19);
      if (n < 0.14) p.px(x, y, '#134247');
      else if (n > 0.94) p.px(x, y, '#215f5c');
      else if (n > 0.99) p.px(x, y, '#3f8a7c');
    }
  }
  return p.canvas;
}

function makeBiomeGround(kind: 'marsh' | 'meadow' | 'bones' | 'thicket'): HTMLCanvasElement {
  const p = makeSprite(64, 64);
  if (kind === 'thicket') {
    // dark soil laced with root veins
    p.clear('#0c2a2c');
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const n = hash2(x * 5 + 3, y * 3 + 8);
        if (n < 0.12) p.px(x, y, '#081f22');
        else if (n > 0.95) p.px(x, y, '#174548');
      }
    }
    const r = rng(23);
    for (let i = 0; i < 7; i++) {
      let x = r() * 64;
      let y = r() * 64;
      let a = r() * TAU;
      for (let k = 0; k < 14; k++) {
        a += (r() - 0.5) * 0.9;
        x += Math.cos(a) * 2.4;
        y += Math.sin(a) * 2.4;
        p.px(x, y, k % 3 === 0 ? '#3a2a1e' : '#2a1e16');
      }
    }
  } else if (kind === 'bones') {
    // ash-grey ground scattered with bone chips
    p.clear('#1b3840');
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const n = hash2(x * 3 + 17, y * 7 + 5);
        if (n < 0.1) p.px(x, y, '#142e36');
        else if (n > 0.95) p.px(x, y, '#2a5560');
      }
    }
    const r = rng(29);
    for (let i = 0; i < 22; i++) {
      const x = Math.floor(r() * 60) + 2;
      const y = Math.floor(r() * 60) + 2;
      p.px(x, y, '#b8ae94');
      p.px(x + 1, y, '#e8e0c8');
      if (r() < 0.4) p.px(x + 2, y + 1, '#b8ae94');
    }
  } else if (kind === 'marsh') {
    p.clear('#0c3236');
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const n = hash2(x * 3 + 5, y * 5 + 2);
        const cl = hash2(Math.floor(x / 9), Math.floor(y / 7) + 40);
        if (cl > 0.8) {
          // a puddle: still water that holds a little moonlight
          p.px(x, y, n > 0.93 ? '#4a9aa8' : n > 0.6 ? '#1c5c6a' : '#164a58');
        } else if (n < 0.1) p.px(x, y, '#092a2e');
        else if (n > 0.95) p.px(x, y, '#1a5252');
      }
    }
  } else {
    p.clear('#0f3b33');
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const n = hash2(x * 7 + 9, y * 3 + 1);
        if (n < 0.1) p.px(x, y, '#0b3029');
        else if (n > 0.95) p.px(x, y, '#1c6a52');
        else if (n > 0.992) p.px(x, y, '#7fd8f5');
      }
    }
    const r = rng(19);
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(r() * 62) + 1;
      const y = Math.floor(r() * 60) + 3;
      p.px(x, y, '#2a9a6a');
      p.px(x - 1, y - 1, '#3ab282');
      p.px(x + 1, y - 1, '#3ab282');
    }
  }
  return p.canvas;
}

function rimLight(p: Pix, col: string, chance: number, seed: number) {
  const img = p.ctx.getImageData(0, 0, p.w, p.h);
  const d = img.data;
  const r = rng(seed);
  const rc = parseInt(col.slice(1), 16);
  const R = (rc >> 16) & 255;
  const G = (rc >> 8) & 255;
  const B = rc & 255;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w - 1; x++) {
      const i = (y * p.w + x) * 4;
      const j = i + 4;
      if (d[i + 3]! > 0 && d[j + 3]! === 0 && r() < chance) {
        d[i] = R;
        d[i + 1] = G;
        d[i + 2] = B;
      }
    }
  }
  p.ctx.putImageData(img, 0, 0);
}

function branch(p: Pix, r: () => number, x: number, y: number, ang: number, len: number, th: number, col: string, fork: number) {
  let cx = x;
  let cy = y;
  let a = ang;
  const steps = Math.max(2, Math.floor(len / 3));
  for (let i = 0; i < steps; i++) {
    a += (r() - 0.5) * 0.55;
    const nx = cx + Math.cos(a) * 3;
    const ny = cy + Math.sin(a) * 3;
    const t = Math.max(1, Math.round(th * (1 - i / (steps + 1))));
    p.line(cx, cy, nx, ny, col, t);
    cx = nx;
    cy = ny;
    if (fork > 0 && i === Math.floor(steps * 0.5) && r() < 0.8) {
      branch(p, r, cx, cy, a + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.5), len * 0.55, Math.max(1, th - 1), col, fork - 1);
    }
  }
}

/** Gnarly silhouette tree, moon-lit from the right. */
export function makeTree(seed: number, h = 104, dead = false): HTMLCanvasElement {
  const w = 64;
  const p = makeSprite(w, h);
  const r = rng(seed);
  const col = dead ? '#161a26' : '#050914';
  const cx = w / 2 + (r() - 0.5) * 6;
  // trunk
  let tx = cx;
  const top = h * (dead ? 0.38 : 0.3);
  for (let y = h - 1; y > top; y -= 3) {
    const t = (h - y) / (h - top);
    tx += (r() - 0.5) * 0.9;
    const th = Math.round(7 - t * 4);
    p.rect(tx - th / 2, y, th, 4, col);
  }
  // branches
  const n = dead ? 6 : 7;
  for (let i = 0; i < n; i++) {
    const hy = top + r() * (h * 0.5);
    const side = r() < 0.5 ? -1 : 1;
    const ang = -Math.PI / 2 + side * (0.5 + r() * 0.9);
    branch(p, r, tx, hy, ang, 14 + r() * 18, dead ? 3 : 3, col, 1);
  }
  if (!dead) {
    // leaf clusters on the upper branches
    for (let i = 0; i < 7; i++) {
      const lx = cx + (r() - 0.5) * 40;
      const ly = top - 4 + r() * 30;
      p.ellipse(lx, ly, 5 + r() * 5, 3.5 + r() * 3, '#07121c');
    }
  }
  rimLight(p, dead ? '#3a4a60' : '#123a46', 0.55, seed + 5);
  return p.canvas;
}

export function makeBush(seed: number): HTMLCanvasElement {
  const p = makeSprite(30, 16);
  const r = rng(seed);
  for (let i = 0; i < 5; i++) p.ellipse(6 + i * 4.5 + r() * 2, 11 - r() * 3, 5 + r() * 2, 4 + r() * 2, '#07151e');
  rimLight(p, '#16414a', 0.6, seed + 2);
  return p.canvas;
}

export function makeRock(seed: number): HTMLCanvasElement {
  const p = makeSprite(18, 12);
  const r = rng(seed);
  p.ellipse(9, 8, 7 + r() * 2, 4 + r() * 1.5, '#0b1a24');
  p.ellipse(8, 6.5, 5, 2.5, '#16323c');
  p.px(11, 5, '#2a5a64');
  return p.canvas;
}

/** Glowing blue bulb flower (open or closed). */
export function makeFlower(open: boolean): HTMLCanvasElement {
  const p = makeSprite(13, 16);
  p.rect(6, 8, 1, 8, '#0a2e30');
  p.rect(4, 12, 2, 1, '#0a2e30');
  p.rect(7, 11, 2, 1, '#0a2e30');
  if (open) {
    p.ellipse(6.5, 6, 5.5, 5, C.flowerDark);
    p.ellipse(6.5, 5.5, 4.5, 4, C.flower);
    p.ellipse(5, 4.5, 2.2, 2.2, C.flowerLight);
    for (let i = -2; i <= 2; i++) p.px(6 + i * 2, 1 + (Math.abs(i) > 1 ? 1 : 0), C.flowerLight);
    p.px(6, 7, '#d8f8ff');
    p.px(7, 7, '#d8f8ff');
  } else {
    p.ellipse(6.5, 8, 2.5, 4.5, C.flowerDark);
    p.ellipse(6.5, 7.5, 1.6, 3.6, C.flower);
    p.px(6, 6, C.flowerLight);
  }
  return p.canvas;
}

/** A wavy tuft of grass for the foreground frame. */
function grassTuft(p: Pix, x: number, y: number, r: () => number, col: string) {
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    p.line(x + (r() - 0.5) * 6, y, x + Math.cos(a) * (6 + r() * 8), y + Math.sin(a) * (6 + r() * 8), col, 1);
  }
}

/** Dark branches framing the screen, like the reference image. */
export function makeFrame(): HTMLCanvasElement {
  const p = makeSprite(W, H);
  const r = rng(77);
  const col = '#04070f';
  // top-left bough
  branch(p, r, -4, -4, 0.55, 78, 8, col, 2);
  branch(p, r, 6, -6, 0.9, 58, 6, col, 2);
  branch(p, r, -6, 18, 0.1, 50, 6, col, 1);
  // top-right bough
  branch(p, r, W + 4, -4, Math.PI - 0.55, 78, 8, col, 2);
  branch(p, r, W - 6, -6, Math.PI - 0.9, 56, 6, col, 2);
  branch(p, r, W + 6, 20, Math.PI - 0.1, 46, 6, col, 1);
  // bottom grass and silhouettes
  for (let i = 0; i < 9; i++) grassTuft(p, 4 + i * 6 + r() * 3, H + 2, r, col);
  for (let i = 0; i < 9; i++) grassTuft(p, W - 4 - i * 6 - r() * 3, H + 2, r, col);
  rimLight(p, '#123a46', 0.4, 31);
  return p.canvas;
}

/** Pre-dithered vignette that darkens the screen edges. */
export function makeVignette(): HTMLCanvasElement {
  const p = makeSprite(W, H);
  const img = p.ctx.createImageData(W, H);
  const B = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx * 0.9 + dy * dy * 0.75);
      const a = clamp((d - 0.55) / 0.55, 0, 1);
      const thr = B[y & 3]![x & 3]!;
      const i = (y * W + x) * 4;
      if (a * 16 > thr) {
        img.data[i] = 5;
        img.data[i + 1] = 6;
        img.data[i + 2] = 14;
        img.data[i + 3] = 255;
      } else if (a * 16 * 1.7 > thr + 10) {
        img.data[i] = 8;
        img.data[i + 1] = 16;
        img.data[i + 2] = 28;
        img.data[i + 3] = 255;
      }
    }
  }
  p.ctx.putImageData(img, 0, 0);
  return p.canvas;
}

/* ------------------------------------------------------------------ */
/* Per-frame drawing helpers                                           */
/* ------------------------------------------------------------------ */

export interface BlobOpts {
  s?: number;
  squash?: number;
  lookX?: number;
  lookY?: number;
  blink?: number;
  third?: boolean;
  shadow?: boolean;
  alpha?: number;
  /** a little pink bow on the head (Mother wears one) */
  bow?: boolean;
}

/** The colours of Mother's bow: the only pink in the game, so she can always be told from Father. */
export const BOW = { pink: '#ff8cc0', light: '#ffe0f0', shade: '#d6568f', knot: '#b03470', line: '#8a2a5e' } as const;

/** The bow, drawn by hand: O outline, P pink, L light, S shade, K knot. A small one for most blobs, a bigger one for the pinned portrait. */
const BOW_SMALL = ['.OO...OO.', 'OPPO.OPPO', 'OLPPKPPPO', 'OPPSKSPPO', '.OOO.OOO.'];
const BOW_BIG = ['..OO...OO..', '.OPPO.OPPO.', 'OPLPPKPPPPO', 'OPPPSKSPPPO', '.OSSO.OSSO.', '..OO...OO..'];
const BOW_COL: Record<string, string> = { O: BOW.line, P: BOW.pink, L: BOW.light, S: BOW.shade, K: BOW.knot };

/** A little pink bow. (x, y) is the middle of its bottom edge; `s` is the scale of the blob wearing it. */
export function drawBow(p: Pix, x: number, y: number, s: number) {
  const bm = s >= 1.9 ? BOW_BIG : BOW_SMALL;
  const left = Math.round(x - bm[0]!.length / 2);
  const top = Math.round(y - bm.length);
  bm.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = BOW_COL[row[i]!];
      if (c) p.px(left + i, top + j, c);
    }
  });
}

/** The yellow blob. (x, y) is the ground-contact point at its bottom centre. */
export function drawBlob(p: Pix, x: number, y: number, o: BlobOpts = {}) {
  const s = o.s ?? 1;
  const sq = o.squash ?? 1;
  const rx = (7.5 * s) / Math.sqrt(sq);
  const ry = 5.6 * s * sq;
  const cy = y - ry;
  if (o.alpha !== undefined) p.alpha(o.alpha);
  if (o.shadow !== false) p.dither(x, y - 1, rx * 1.15, 2.4 * s, C.ink, 0.75);
  p.ellipse(x, cy, rx + 1, ry + 1, C.blobOutline);
  p.ellipse(x, cy, rx, ry, C.blobShade);
  p.ellipse(x, cy - ry * 0.12, rx * 0.93, ry * 0.86, C.blob);
  p.ellipse(x - rx * 0.36, cy - ry * 0.5, rx * 0.3, ry * 0.2, C.blobLight);
  const ex = 2.7 * s;
  const lx = (o.lookX ?? 0) * 1.3;
  const ly = (o.lookY ?? 0) * 1.0;
  const ey = cy + ry * 0.12 + ly;
  const blink = o.blink ?? 0;
  for (const sgn of [-1, 1]) {
    const bx = x + sgn * ex + lx;
    if (blink > 0.5) {
      p.rect(bx - 1.2 * s, ey + 0.5, 2.4 * s, 1, C.blobEye);
    } else {
      p.ellipse(bx, ey, 1.5 * s, 2.1 * s, C.blobEye);
      p.px(bx - 0.6 * s, ey - 1.2 * s, C.white);
    }
    p.px(x + sgn * ex * 1.65, ey + 2 * s, C.blush);
  }
  if (o.third) {
    p.ellipse(x, cy - ry * 0.55, 1.8 * s, 1.8 * s, C.red);
    p.px(x - 0.5, cy - ry * 0.55 - 0.5, C.redGlow);
  }
  if (o.bow) {
    // on the upper right of the head, where the curve of the egg starts to turn; its bottom edge sits a little way into the head
    drawBow(p, x + rx * 0.5, cy - ry * Math.sqrt(1 - 0.25) + 2.4, s);
  }
  if (o.alpha !== undefined) p.alpha(1);
}

export type MawState = 'idle' | 'rumble' | 'open' | 'snap';

/** A toothy Rootmaw. (x, y) is its base on the ground. */
export function drawRootmaw(p: Pix, x: number, y: number, st: MawState, t: number, seed: number) {
  const wob = Math.sin(t * 3 + seed) * 1;
  p.ellipse(x, y - 1, 12, 4.2, C.soil);
  p.ellipse(x, y - 2, 9.5, 3, '#2a2018');
  // tendrils
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const bx = x + i * 4.2;
    const tip = st === 'idle' ? 3 : 6;
    p.line(bx, y - 2, bx + i * 1.2 + wob, y - 2 - tip, C.root, 2);
    p.px(bx + i * 1.2 + wob, y - 3 - tip, C.rootLight);
  }
  if (st === 'idle') {
    p.ellipse(x, y - 5, 4, 3.4, C.root);
    p.ellipse(x - 1, y - 6, 2, 1.4, C.rootLight);
    return;
  }
  if (st === 'rumble') {
    const sh = Math.round(Math.sin(t * 60) * 1.2);
    p.ellipse(x + sh, y - 7, 5, 5, C.root);
    p.ellipse(x + sh - 1, y - 8, 2.6, 2, C.rootLight);
    for (let i = 0; i < 4; i++) p.px(x + (hash2(i, Math.floor(t * 30)) - 0.5) * 18, y - 8 - hash2(Math.floor(t * 30), i) * 8, '#4a3a28');
    return;
  }
  if (st === 'open') {
    p.ellipse(x, y - 13, 10.5, 11.5, C.rootLight);
    p.ellipse(x, y - 13, 8.4, 9.6, C.rootMouth);
    p.ellipse(x, y - 9.5, 3.6, 2.4, '#a0303a');
    for (let i = -3; i <= 3; i++) {
      p.rect(x + i * 2.3 - 0.5, y - 22 + Math.abs(i) * 0.6, 1.4, 3, C.bone);
      p.rect(x + i * 2.3 - 0.5, y - 6 - Math.abs(i) * 0.6, 1.4, 3, C.bone);
    }
    return;
  }
  // snap: lunges toward the viewer and clamps shut
  p.ellipse(x, y - 7, 11.5, 8, C.rootLight);
  p.ellipse(x, y - 7, 9.5, 5.8, C.root);
  for (let i = -4; i <= 4; i++) {
    p.rect(x + i * 2.2, y - 8 + (i & 1), 1.4, 2, C.bone);
  }
  p.px(x - 4, y - 11, C.white);
  p.px(x + 5, y - 10, C.white);
}

/** A pair of slit-pupil red eyes. */
export function drawRedEyes(p: Pix, x: number, y: number, open: number, lookX = 0, glow = 1) {
  if (open <= 0.05) return;
  p.dither(x, y, 9, 4.5, C.redDark, 0.5 * open * glow);
  for (const sgn of [-1, 1]) {
    const ex = x + sgn * 3.4;
    const h = Math.max(0.6, 2.2 * open);
    p.ellipse(ex, y, 2.2, h, C.red);
    p.px(ex - 1, y - 0.5, C.redGlow);
    p.rect(ex + lookX * 0.8, y - h * 0.8, 1, h * 1.6, C.ink);
  }
}

/** Glowing eyes in the dark (cyan = Gloomling). */
export function drawGlint(p: Pix, x: number, y: number, col: string) {
  p.px(x, y, col);
  p.px(x + 3, y, col);
}

export function drawMoon(p: Pix, x: number, y: number, r: number) {
  p.dither(x, y, r * 2.2, r * 2.2, C.tealMid, 0.25);
  p.dither(x, y, r * 1.6, r * 1.6, C.moon, 0.2);
  p.ellipse(x, y, r + 1, r + 1, C.tealMid);
  p.ellipse(x, y, r, r, C.moon);
  p.ellipse(x - r * 0.2, y - r * 0.2, r * 0.7, r * 0.7, C.moonCore);
}

/** Lurking silhouettes seen between the trees. */
export function drawLurker(p: Pix, kind: 'maw' | 'bell' | 'bones' | 'gloom', x: number, y: number, t: number) {
  const b = Math.sin(t * 2 + x) * 1.2;
  if (kind === 'maw') {
    p.ellipse(x, y, 7, 5, '#040a10');
    for (let i = -2; i <= 2; i++) p.px(x + i * 2, y - 1 + (t * 3 + i) % 2 > 1 ? 0 : 0, i % 2 ? C.bone : '#4a5a60');
  } else if (kind === 'bell') {
    p.ellipse(x, y - 8 + b, 4.5, 4.5, '#050b12');
    p.px(x, y - 8 + b, '#c9b8ff');
    p.px(x + 1, y - 8 + b, '#c9b8ff');
    p.px(x + 4, y - 4 + b, '#d8b45a');
  } else if (kind === 'bones') {
    p.ellipse(x, y - 2, 6, 3, '#040a10');
    for (let i = 0; i < 4; i++) p.line(x - 6 + i * 4, y - 2, x - 8 + i * 4.5, y + 3, '#040a10', 1);
    p.px(x - 3, y - 4, C.bone);
    p.px(x + 3, y - 4, C.bone);
  } else {
    for (let i = 0; i < 6; i++) p.ellipse(x - 8 + i * 3, y - (i % 2), 2.4, 2, '#040a10');
    for (let i = 0; i < 3; i++) {
      p.px(x - 7 + i * 7, y - 2, C.cyanEye);
      p.px(x - 5 + i * 7, y - 2, C.cyanEye);
    }
  }
}

/** Small spark/debris particle list helper. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  col: string;
  g: number;
  size: number;
}

export function burst(list: Particle[], x: number, y: number, n: number, cols: string[], speed: number, up = 1, g = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const s = speed * (0.3 + Math.random() * 0.9);
    const life = 0.4 + Math.random() * 0.7;
    list.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s * 0.6 - speed * 0.6 * up,
      life,
      max: life,
      col: cols[Math.floor(Math.random() * cols.length)]!,
      g,
      size: Math.random() < 0.3 ? 2 : 1,
    });
  }
}

export function updateParticles(list: Particle[], dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const q = list[i]!;
    q.life -= dt;
    if (q.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    q.vy += q.g * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
}

export function drawParticles(p: Pix, list: Particle[], camX: number, camY: number) {
  for (const q of list) {
    const a = clamp(q.life / q.max, 0, 1);
    p.alpha(a < 0.35 ? a * 2.5 : 1);
    p.rect(q.x - camX, q.y - camY, q.size, q.size, q.col);
  }
  p.alpha(1);
}
