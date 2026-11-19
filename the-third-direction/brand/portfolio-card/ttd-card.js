/**
 * The Third Direction: a live project card for a portfolio site.
 *
 * One self-contained ES module, no dependencies, no assets (everything is drawn in code).
 *
 *   <script type="module" src="/ttd-card.js"></script>
 *   <ttd-card></ttd-card>
 *
 * The card is a custom element with its own shadow DOM, so its styles cannot clash with the site's.
 * It inherits the page's font and reads optional --ttd-* tokens (see IMPLEMENT.md) to match the site.
 *
 * The live preview on the right is the game's hook in 13 seconds: a top-down pixel forest (the 2D game)
 * tilts up into a floating 3D island, the pixels sharpen into HD, X rises out of a hole in the ground and
 * the Blob lances it, then the world folds flat again. Hovering steers the camera. It pauses when off
 * screen or in a hidden tab, and shows one still frame for people who ask for reduced motion.
 *
 * Only the preview is wanted (the site has its own card markup)? Use the exported function instead:
 *
 *   import { mountTTDPreview } from './ttd-card.js';
 *   const preview = mountTTDPreview(canvasElement, { caption: captionElement });
 *   // later: preview.destroy();
 */

export const TTD_LINKS = {
  play: 'https://www.crazygames.com/game/the-third-direction-vjd',
  itch: 'https://gautam-jain.itch.io/the-third-direction',
  source: 'https://github.com/rubella2121/gamedev',
};

/* ------------------------------------------------------------------------------------------------ */
/* the preview                                                                                      */
/* ------------------------------------------------------------------------------------------------ */

/** the game's own palette (src/core/palette.ts), plus a few ground and tree tones made from it */
const HEX = {
  ink: '#05060c', night: '#0b1226', flowerLight: '#7fd8f5', tealLight: '#2a7a6c', mossGlow: '#8fe29a',
  purple: '#3a1a52', purpleMid: '#5a2a78', purpleDark: '#24103a', magenta: '#8a3a8a',
  moon: '#9ff4ee', moonCore: '#e8fffb', blob: '#f2d36b', blobLight: '#fff1a6', blobShade: '#d9a94a',
  blobOutline: '#8a3b4a', blobEye: '#3a1020', blush: '#e88a8a', redDark: '#7a1020', redGlow: '#ff6a6a',
  soil: '#1e1812', soilDeep: '#120e0b', root: '#4a3a28',
  grass: '#133e48', grassDark: '#0e303c', path: '#21615d', underTree: '#0a2530', stone: '#2f726a',
  tree1: '#061018', tree2: '#091820', tree3: '#0e222c', rim: '#2a7a6c', trunk: '#2a2119',
};
const C = {};
for (const k in HEX) C[k] = [parseInt(HEX[k].slice(1, 3), 16), parseInt(HEX[k].slice(3, 5), 16), parseInt(HEX[k].slice(5, 7), 16)];
const FOG = [17, 32, 50];

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const backOut = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
/** a pulse that is 1 at a and fades to 0 at b */
const env = (t, a, b) => (t >= a && t <= b ? 1 - (t - a) / (b - a) : 0);
function hash(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** a colour with a brightness factor, fog, a flash towards white and alpha */
function col(c, k = 1, fog = 0, a = 1, white = 0) {
  let r = c[0] * k, g = c[1] * k, b = c[2] * k;
  if (fog) { r += (FOG[0] - r) * fog; g += (FOG[1] - g) * fog; b += (FOG[2] - b) * fog; }
  if (white) { r += (255 - r) * white; g += (255 - g) * white; b += (255 - b) * white; }
  r = Math.min(255, r) | 0; g = Math.min(255, g) | 0; b = Math.min(255, b) | 0;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

/* the world: 10 x 10 tiles, x and y from -5 to 5, z up. T tree, f flowers, = path, , dark grass, O the hole X waits in */
const MAP = [
  'TT,.,TTTTT',
  'T,..T.T,TT',
  ',T...f.T,T',
  '.f.O..,.TT',
  'T..=..f.T.',
  ',..==..TfT',
  'TT..=.f..,',
  '.f.==.....',
  'TT.=.f..,T',
  'TT,=.,.,TT',
];
const N = 10;
const HALF = N / 2;
const HOLE = { x: -1.5, y: -1.5 };
const DEPTH = 1.1; // how thick the island is under the grass

/* the loop, in seconds */
const LOOP = 13;
const STILL_T = 8.7; // the frame shown to people who ask for reduced motion

/** where the Blob is (t, x, y); the last key repeats the first so the loop closes */
const KEYS = [
  [0, -1.2, 3.2], [1.5, -0.2, 1.8], [3.0, 1.0, 0.7], [4.2, 0.3, -0.1], [5.6, 0.8, 1.0], [7.2, 1.6, 1.6],
  [8.5, 0.2, 2.0], [9.3, 0.5, 0.6], [10.6, 0.5, 0.6], [11.8, -0.4, 2.4], [13, -1.2, 3.2],
];

function pathAt(t) {
  t = ((t % LOOP) + LOOP) % LOOP;
  const n = KEYS.length - 1;
  let i = 0;
  while (i < n - 1 && t >= KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  if (a[1] === b[1] && a[2] === b[2]) return [a[1], a[2]];
  const p0 = KEYS[(i - 1 + n) % n], p3 = KEYS[(i + 2) % n];
  const s = (t - a[0]) / (b[0] - a[0]), s2 = s * s, s3 = s2 * s;
  const cr = (q0, q1, q2, q3) => 0.5 * (2 * q1 + (-q0 + q2) * s + (2 * q0 - 5 * q1 + 4 * q2 - q3) * s2 + (-q0 + 3 * q1 - 3 * q2 + q3) * s3);
  return [cr(p0[1], a[1], b[1], p3[1]), cr(p0[2], a[2], b[2], p3[2])];
}

/** 0 = the flat 2D game seen from above, 1 = the 3D island */
function foldAt(t) {
  if (t < 4.4) return 0;
  if (t < 6.6) return ease((t - 4.4) / 2.2);
  if (t < 11.6) return 1;
  if (t < 12.9) return 1 - ease((t - 11.6) / 1.3);
  return 0;
}
/** how far X has risen out of the ground */
function riseAt(t) {
  if (t < 5.7 || t > 12.4) return 0;
  if (t < 7.0) return Math.max(0, backOut((t - 5.7) / 1.3));
  if (t < 11.6) return 1;
  return 1 - sstep(11.6, 12.4, t);
}
function blobAt(t) {
  const [x, y] = pathAt(t);
  const [x2, y2] = pathAt(t + 0.04);
  const vx = (x2 - x) / 0.04, vy = (y2 - y) / 0.04, sp = Math.hypot(vx, vy);
  const mv = sstep(0.1, 0.45, sp);
  const ph = Math.abs(Math.sin(t * Math.PI * 2.4));
  const hop = mv * ph * 0.17;
  const sq = mv * Math.pow(1 - ph, 6) * 0.45 + env(t, 10.1, 10.4) * 0.3;
  let dx = sp > 0.05 ? vx / sp : 0, dy = sp > 0.05 ? vy / sp : 1;
  const tx = HOLE.x - x, ty = HOLE.y - y, tl = Math.hypot(tx, ty) || 1;
  const look = clamp(sstep(3.7, 4.2, t) * (1 - sstep(11.5, 11.9, t)) * (1.15 - mv), 0, 1);
  dx = lerp(dx, tx / tl, look); dy = lerp(dy, ty / tl, look);
  const dl = Math.hypot(dx, dy) || 1;
  const charge = t >= 9.3 && t < 10.1 ? sstep(9.3, 10.05, t) : 0;
  const fire = env(t, 10.1, 10.5);
  return { x, y, hop, sq, dx: dx / dl, dy: dy / dl, charge, fire };
}
function captionAt(t) {
  const A = 'the world is flat.', B = 'the world was never flat.', P = 'the world ', Q = 'was never flat.';
  const blink = (t * 1.6) % 1 < 0.55;
  const p = (a, b) => clamp((t - a) / (b - a), 0, 1);
  if (t < 0.3) return ['', false];
  if (t < 1.3) return [A.slice(0, Math.ceil(A.length * p(0.3, 1.3))), true];
  if (t < 3.95) return [A, blink];
  if (t < 4.35) return [A.slice(0, Math.round(lerp(A.length, P.length, p(3.95, 4.35)))), true];
  if (t < 4.6) return [P, true];
  if (t < 5.8) return [P + Q.slice(0, Math.ceil(Q.length * p(4.6, 5.8))), true];
  if (t < 11.6) return [B, blink];
  if (t < 12.3) return [B.slice(0, Math.round(lerp(B.length, 0, p(11.6, 12.3)))), true];
  return ['', false];
}
function shakeAt(t) {
  return env(t, 4.0, 4.55) * 1.0 + env(t, 5.75, 6.7) * 0.75 + env(t, 10.1, 10.45) * 0.8;
}

/* things that are made once */
const tiles = [];
const trees = [];
const tufts = [];
const flowers = [];
const stones = [];
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const ch = MAP[j][i];
    const x0 = i - HALF, y0 = j - HALF;
    const base = ch === '=' ? C.path : ch === ',' ? C.grassDark : ch === 'T' ? C.underTree : C.grass;
    tiles.push({ x0, y0, c: base, v: 0.84 + hash(i, j, 1) * 0.3 });
    if (ch === 'T') {
      trees.push({
        x: x0 + 0.5 + (hash(i, j, 2) - 0.5) * 0.24,
        y: y0 + 0.5 + (hash(i, j, 3) - 0.5) * 0.24,
        sc: 0.86 + hash(i, j, 4) * 0.28,
        rot: hash(i, j, 5) * TAU,
        lurk: hash(i, j, 6) < 0.28,
        ph: hash(i, j, 7) * 10,
      });
    } else {
      const n = ch === 'f' ? 2 : 3;
      for (let q = 0; q < n; q++) tufts.push({ x: x0 + 0.1 + hash(i, j, 10 + q) * 0.8, y: y0 + 0.1 + hash(i, j, 20 + q) * 0.8 });
    }
    if (ch === 'f') for (let q = 0; q < 4; q++) flowers.push({ x: x0 + 0.15 + hash(i, j, 30 + q) * 0.7, y: y0 + 0.15 + hash(i, j, 40 + q) * 0.7, ph: hash(i, j, 50 + q) * TAU });
    if (ch === '=') for (let q = 0; q < 2; q++) stones.push({ x: x0 + 0.2 + hash(i, j, 60 + q) * 0.6, y: y0 + 0.2 + hash(i, j, 70 + q) * 0.6 });
  }
}
const cracks = [];
for (let q = 0; q < 7; q++) {
  let a = (q / 7) * TAU + hash(q, 1, 80) * 0.6;
  let x = HOLE.x, y = HOLE.y;
  const pts = [[x, y]];
  for (let k = 0; k < 4; k++) {
    a += (hash(q, k, 81) - 0.5) * 0.9;
    const len = 0.32 + hash(q, k, 82) * 0.32;
    x += Math.cos(a) * len; y += Math.sin(a) * len;
    pts.push([x, y]);
  }
  cracks.push(pts);
}
const fireflies = Array.from({ length: 12 }, (_, i) => ({
  x: -3.8 + hash(i, 1, 90) * 7.6, y: -3.8 + hash(i, 2, 90) * 7.6, ph: hash(i, 3, 90) * TAU,
  f1: 0.5 + hash(i, 4, 90) * 0.6, f2: 0.5 + hash(i, 5, 90) * 0.6, cyan: i % 3 !== 0,
}));
const octagon = (cx, cy, r, rot) => Array.from({ length: 8 }, (_, i) => [cx + Math.cos(rot + (i * TAU) / 8) * r, cy + Math.sin(rot + (i * TAU) / 8) * r]);
const square = (cx, cy, r) => [[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r]];

function glowSprite(rgb) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.22, `rgba(${rgb},.6)`);
  gr.addColorStop(0.55, `rgba(${rgb},.16)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return cv;
}
/** a 4 x 4 ordered-dither tile: the grain of the game's 2D art */
function bayerTile() {
  const m = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 4;
  const g = cv.getContext('2d');
  for (let i = 0; i < 16; i++) {
    if (m[i] < 2) { g.fillStyle = 'rgba(0,0,0,.24)'; g.fillRect(i % 4, (i / 4) | 0, 1, 1); }
    else if (m[i] > 14) { g.fillStyle = 'rgba(127,216,245,.08)'; g.fillRect(i % 4, (i / 4) | 0, 1, 1); }
  }
  return cv;
}

/**
 * Draw the live preview into a canvas and keep it running.
 * @param {HTMLCanvasElement} canvas  sized by CSS; the backing store follows its size and the screen's pixel ratio
 * @param {{caption?: HTMLElement, hoverTarget?: HTMLElement, still?: boolean}} [opts]
 *   caption: an element to type the caption into ("the world is flat." / "the world was never flat.")
 *   hoverTarget: the element whose pointer steers the camera (default: the canvas)
 *   still: force the single still frame (default: follows prefers-reduced-motion)
 * @returns {{destroy(): void, pause(): void, resume(): void, renderAt(t: number): void, duration: number}}
 */
export function mountTTDPreview(canvas, opts = {}) {
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const forced = typeof opts.still === 'boolean';
  let still = forced ? opts.still : !!(mq && mq.matches);
  const capEl = opts.caption || null;
  const hoverEl = opts.hoverTarget || canvas;
  const ctx = canvas.getContext('2d');
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');
  const SPR = {
    warm: glowSprite('255,206,110'), cyan: glowSprite('127,216,245'), red: glowSprite('255,80,90'),
    teal: glowSprite('50,150,150'), white: glowSprite('236,255,250'), moss: glowSprite('143,226,154'), magenta: glowSprite('190,80,200'),
  };
  const grain = bctx.createPattern(bayerTile(), 'repeat');
  let cssW = 0, cssH = 0, dpr = 1, W = 0, H = 0;
  let vignette = null;
  const hov = { x: 0, y: 0, tx: 0, ty: 0 };
  let raf = 0, last = 0, clock = 0, inView = true, shown = true, paused = false, lastCap = null, lastCaret = null;
  let cam = { sY: 0, cY: 1, sT: 1, cT: 0, u: 0 };

  function size() {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(0, r.width);
    cssH = Math.max(0, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.round(cssW * dpr);
    H = Math.round(cssH * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    vignette = null;
    if (!running()) renderAt(still ? STILL_T : clock % LOOP);
  }

  /* -------------------------------------------- the scene, drawn at any resolution -------------------------------------------- */
  function scene(g, w, h, t, u, px) {
    // px: size of one art pixel in canvas units (>1 in the pixel-art phases, 0 when drawing in HD)
    const k = w / 480;
    const b = blobAt(t);
    const xh = riseAt(t);
    const yaw = u * (Math.PI / 4 + 0.09 * Math.sin((t - 6.6) * 0.5)) + hov.x * 0.42 * u;
    const pitch = lerp(Math.PI / 2, 0.56, u) - hov.y * 0.1 * u;
    const sT = Math.sin(pitch), cT = Math.max(0, Math.cos(pitch)), sY = Math.sin(yaw), cY = Math.cos(yaw);
    cam = { sY, cY, sT, cT, u };
    const s2 = Math.max(w / 8.2, h / 6.4);
    const s3 = Math.min((0.92 * w) / (N * Math.SQRT2), (0.84 * h) / 8.44);
    const s = s2 * Math.pow(s3 / s2, u);
    // the 2D camera follows the Blob, like the game's; the 3D camera looks at the middle of the island
    const lag = pathAt(t - 0.45);
    const mx = Math.max(0, HALF - w / 2 / s2 - 0.05), my = Math.max(0, HALF - h / 2 / s2 - 0.05);
    const fx = lerp(clamp(lag[0], -mx, mx), 0, u), fy = lerp(clamp(lag[1], -my, my), 0, u);
    const sh = shakeAt(t) * w * 0.007;
    let ox = w / 2 + sh * Math.sin(t * 91.7);
    let oy = h / 2 - u * 0.47 * s + sh * Math.sin(t * 73.3 + 1);
    if (px) { ox = Math.round(ox); oy = Math.round(oy); }
    /** world to screen: [x, y, depth (bigger = nearer), yr (distance towards the viewer along the ground)] */
    const P = (x, y, z) => {
      x -= fx; y -= fy;
      const xr = x * cY - y * sY, yr = x * sY + y * cY;
      return [ox + s * xr, oy + s * (yr * sT - z * cT), yr * cT + z * sT, yr];
    };
    const yrOf = (x, y) => (x - fx) * sY + (y - fy) * cY;
    const fogAt = (yr) => u * clamp(0.3 - yr * 0.05, 0, 0.55);
    const dot = (x, y, r) => { const d = Math.max(1, r); g.fillRect(x - d / 2, y - d / 2, d, d); };
    const poly = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); };
    const glow = (spr, x, y, r, a, flat = false) => {
      if (a <= 0.003 || r <= 0) return;
      g.globalAlpha = Math.min(1, a);
      if (flat) { g.save(); g.translate(x, y); g.scale(1, Math.max(0.06, sT)); g.drawImage(spr, -r, -r, r * 2, r * 2); g.restore(); }
      else g.drawImage(spr, x - r, y - r, r * 2, r * 2);
      g.globalAlpha = 1;
    };
    const lw = (v) => (px ? 1 : Math.max(1, v));

    /** a prism standing on a convex footprint, lit from the moon (upper right) */
    const prism = (foot, z0, z1, c, fog, white = 0) => {
      const n = foot.length;
      let cx = 0, cy = 0;
      for (const p of foot) { cx += p[0]; cy += p[1]; }
      cx /= n; cy /= n;
      const B = foot.map((p) => P(p[0], p[1], z0)), T = foot.map((p) => P(p[0], p[1], z1));
      if (cT > 0.015) {
        for (let i = 0; i < n; i++) {
          const a = foot[i], q = foot[(i + 1) % n];
          let nx = q[1] - a[1], ny = -(q[0] - a[0]);
          if (nx * ((a[0] + q[0]) / 2 - cx) + ny * ((a[1] + q[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl; ny /= nl;
          const nyr = nx * sY + ny * cY;
          if (nyr <= 0.001) continue;
          const nxr = nx * cY - ny * sY;
          g.fillStyle = col(c, 0.5 + 0.22 * nxr + 0.12 * nyr, fog, 1, white);
          poly([B[i], B[(i + 1) % n], T[(i + 1) % n], T[i]]);
        }
      }
      g.fillStyle = col(c, 1 + 0.18 * u, fog * 0.8, 1, white);
      poly(T);
      return T;
    };

    /** moonlight on the edges of a footprint's top that face the moon (upper right of the flat view) */
    const rim = (foot, z, a) => {
      if (a <= 0) return;
      g.strokeStyle = col(C.rim, 1, 0, a);
      g.lineWidth = lw(0.04 * s);
      g.beginPath();
      const n = foot.length;
      let cx = 0, cy = 0;
      for (const p of foot) { cx += p[0]; cy += p[1]; }
      cx /= n; cy /= n;
      for (let i = 0; i < n; i++) {
        const a2 = foot[i], q = foot[(i + 1) % n];
        const mxp = (a2[0] + q[0]) / 2 - cx, myp = (a2[1] + q[1]) / 2 - cy;
        if (mxp - myp < 0.18) continue;
        const A = P(a2[0], a2[1], z), B = P(q[0], q[1], z);
        g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]);
      }
      g.stroke();
    };

    /* sky, stars and the moon: only seen once the world tilts */
    g.globalCompositeOperation = 'source-over';
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0d1730'); sky.addColorStop(0.55, '#080d1c'); sky.addColorStop(1, '#05060c');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    if (u > 0.01) {
      for (let i = 0; i < 46; i++) {
        const a = u * (0.2 + 0.6 * hash(i, 3, 7)) * (0.55 + 0.45 * Math.sin(t * (0.8 + hash(i, 4, 7) * 2) + i));
        g.fillStyle = `rgba(220,240,255,${a.toFixed(3)})`;
        dot(hash(i, 1, 7) * w, hash(i, 2, 7) * h * 0.75, px ? 1 : 1.3 * k);
      }
      const mr = 0.055 * h, mxp = w * 0.86, myp = h * 0.19;
      g.globalCompositeOperation = 'lighter';
      glow(SPR.cyan, mxp, myp, mr * 6, 0.32 * u);
      glow(SPR.white, mxp, myp, mr * 2.2, 0.35 * u);
      g.globalCompositeOperation = 'source-over';
      const mg = g.createRadialGradient(mxp - mr * 0.3, myp - mr * 0.3, mr * 0.1, mxp, myp, mr);
      mg.addColorStop(0, `rgba(240,255,252,${u})`); mg.addColorStop(1, `rgba(159,244,238,${u})`);
      g.fillStyle = mg;
      g.beginPath(); g.arc(mxp, myp, mr, 0, TAU); g.fill();
      // mist round the island
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + t * 0.05;
        const p = P(Math.cos(a) * 5.5, Math.sin(a) * 5.5, -0.8);
        glow(SPR.teal, p[0], p[1], s * 3.4, 0.09 * u);
      }
      g.globalCompositeOperation = 'source-over';
    }

    /* the island's sides: soil, a lip of grass and hanging roots */
    if (cT > 0.02) {
      const sides = [
        { n: [0, 1], seg: (i) => [[i - HALF, HALF], [i + 1 - HALF, HALF]] },
        { n: [0, -1], seg: (i) => [[i - HALF, -HALF], [i + 1 - HALF, -HALF]] },
        { n: [1, 0], seg: (i) => [[HALF, i - HALF], [HALF, i + 1 - HALF]] },
        { n: [-1, 0], seg: (i) => [[-HALF, i - HALF], [-HALF, i + 1 - HALF]] },
      ];
      for (const sd of sides) {
        const nyr = sd.n[0] * sY + sd.n[1] * cY;
        if (nyr <= 0.001) continue;
        const nxr = sd.n[0] * cY - sd.n[1] * sY;
        const kk = 0.55 + 0.22 * nxr + 0.12 * nyr;
        for (let i = 0; i < N; i++) {
          const [a, q] = sd.seg(i);
          const fog = fogAt(yrOf((a[0] + q[0]) / 2, (a[1] + q[1]) / 2));
          g.fillStyle = col(C.soilDeep, kk, fog);
          poly([P(a[0], a[1], -0.5), P(q[0], q[1], -0.5), P(q[0], q[1], -DEPTH), P(a[0], a[1], -DEPTH)]);
          g.fillStyle = col(C.soil, kk, fog);
          poly([P(a[0], a[1], -0.1), P(q[0], q[1], -0.1), P(q[0], q[1], -0.5), P(a[0], a[1], -0.5)]);
          g.fillStyle = col(C.grass, kk * 1.1, fog);
          poly([P(a[0], a[1], 0), P(q[0], q[1], 0), P(q[0], q[1], -0.1), P(a[0], a[1], -0.1)]);
          const hr = hash(i, sd.n[0] + 2, sd.n[1] + 5);
          if (hr < 0.65) {
            const f = 0.2 + hr * 0.9;
            const rx = lerp(a[0], q[0], f), ry = lerp(a[1], q[1], f);
            const top = P(rx, ry, -DEPTH + 0.05), bot = P(rx, ry, -DEPTH - 0.2 - hr * 0.7);
            g.strokeStyle = col(C.root, 0.9, fog, 0.85);
            g.lineWidth = lw(0.035 * s);
            g.beginPath(); g.moveTo(top[0], top[1]); g.quadraticCurveTo(top[0] + s * 0.08, (top[1] + bot[1]) / 2, bot[0], bot[1]); g.stroke();
          }
        }
      }
    }

    /* the ground */
    g.fillStyle = col(C.grass, 0.95, u * 0.2);
    poly([P(-HALF, -HALF, 0), P(HALF, -HALF, 0), P(HALF, HALF, 0), P(-HALF, HALF, 0)]);
    for (const tl of tiles) {
      const fog = fogAt(yrOf(tl.x0 + 0.5, tl.y0 + 0.5));
      g.fillStyle = col(tl.c, tl.v * (1 + 0.1 * u), fog);
      poly([P(tl.x0, tl.y0, 0), P(tl.x0 + 1, tl.y0, 0), P(tl.x0 + 1, tl.y0 + 1, 0), P(tl.x0, tl.y0 + 1, 0)]);
    }
    if (u > 0.05) {
      // the faint grid of the arena
      g.strokeStyle = `rgba(127,216,245,${(0.075 * u).toFixed(3)})`;
      g.lineWidth = lw(0.9 * k);
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = P(i - HALF, -HALF, 0), q = P(i - HALF, HALF, 0), c = P(-HALF, i - HALF, 0), d = P(HALF, i - HALF, 0);
        g.moveTo(a[0], a[1]); g.lineTo(q[0], q[1]); g.moveTo(c[0], c[1]); g.lineTo(d[0], d[1]);
      }
      g.stroke();
    }
    g.fillStyle = col(C.tealLight, 1, 0, 0.55);
    for (const q of tufts) { const p = P(q.x, q.y, 0); dot(p[0], p[1], 0.065 * s); }
    g.fillStyle = col(C.stone, 1, 0, 0.6);
    for (const q of stones) { const p = P(q.x, q.y, 0); g.fillRect(p[0] - 0.05 * s, p[1] - 0.03 * s, Math.max(1, 0.1 * s), Math.max(1, 0.06 * s)); }

    /* the 2D art's dither grain on the ground, fading as the world sharpens */
    if (px && grain && u < 0.85) {
      g.globalAlpha = 1 - sstep(0.2, 0.85, u);
      g.fillStyle = grain;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }

    /* the hole X waits in, and the eyes that look up out of it */
    {
      const ring = Array.from({ length: 14 }, (_, i) => P(HOLE.x + Math.cos((i / 14) * TAU) * 0.38, HOLE.y + Math.sin((i / 14) * TAU) * 0.38, 0));
      g.fillStyle = col(C.ink);
      poly(ring);
      g.strokeStyle = col(C.redDark, 1, 0, 0.9);
      g.lineWidth = lw(0.045 * s);
      g.stroke();
      const peek = sstep(1.5, 1.9, t) * (1 - sstep(3.7, 3.95, t)) * (Math.sin(t * 7) > -0.85 ? 1 : 0);
      if (peek > 0) {
        g.fillStyle = col(C.redGlow, 1, 0, peek);
        for (const sg of [-1, 1]) { const p = P(HOLE.x + sg * 0.11, HOLE.y + 0.02, 0); dot(p[0], p[1], 0.07 * s); }
      }
    }

    /* cracks: white light as the world tears, then embers under X */
    {
      const grow = sstep(3.95, 4.45, t) * (1 - sstep(12.2, 12.9, t));
      const white = sstep(3.95, 4.1, t) * (1 - sstep(4.6, 5.6, t));
      const ember = sstep(5.6, 6.4, t) * (0.35 + 0.65 * xh) * (1 - sstep(11.8, 12.6, t)) * (0.75 + 0.25 * Math.sin(t * 5));
      if (grow > 0 && (white > 0 || ember > 0)) {
        g.globalCompositeOperation = 'lighter';
        for (const cr of cracks) {
          const pts = cr.map((p) => P(lerp(HOLE.x, p[0], grow), lerp(HOLE.y, p[1], grow), 0));
          for (const [c, a, wd] of [[C.moonCore, white, 0.045], [C.redGlow, ember * 0.8, 0.04]]) {
            if (a <= 0) continue;
            g.strokeStyle = col(c, 1, 0, a);
            g.lineWidth = lw(wd * s);
            g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
            g.stroke();
          }
        }
        g.globalCompositeOperation = 'source-over';
      }
    }

    /* shadows */
    const shade = (x, y, r, a) => {
      const p = P(x, y, 0);
      g.save(); g.translate(p[0], p[1]); g.scale(1, Math.max(0.06, sT));
      g.fillStyle = `rgba(0,0,0,${a})`;
      g.beginPath(); g.arc(0, 0, r * s, 0, TAU); g.fill();
      g.restore();
    };
    shade(b.x, b.y, 0.3 * (1 - b.hop * 1.6), 0.4);
    if (xh > 0.02) shade(HOLE.x, HOLE.y, 0.95 * Math.min(1, xh), 0.45);

    /* light on the ground: the Blob's warm glow, X's red one, the flowers */
    g.globalCompositeOperation = 'lighter';
    {
      const p = P(b.x, b.y, 0);
      glow(SPR.warm, p[0], p[1], s * (2.1 + b.charge * 0.6), 0.36 + b.charge * 0.25 + b.fire * 0.3, true);
      if (xh > 0.02) { const q = P(HOLE.x, HOLE.y, 0); glow(SPR.red, q[0], q[1], s * 1.7, 0.3 * Math.min(1, xh) + b.fire * 0.4, true); }
      for (const f of flowers) {
        const q = P(f.x, f.y, 0.02);
        glow(SPR.cyan, q[0], q[1], s * 0.42, 0.2 + 0.12 * Math.sin(t * 2 + f.ph));
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (const f of flowers) {
      const q = P(f.x, f.y, 0.02);
      g.fillStyle = col(C.flowerLight, 1, 0, 0.75 + 0.25 * Math.sin(t * 2 + f.ph));
      dot(q[0], q[1], 0.065 * s);
    }

    /* the things that stand up, far to near */
    const things = [];
    for (const tr of trees) {
      const yr = yrOf(tr.x, tr.y);
      things.push({
        d: yr * cT + 1.0 * sT,
        draw: () => {
          const fog = fogAt(yr);
          const sc = tr.sc;
          prism(square(tr.x, tr.y, 0.1 * sc), 0, 0.42 * sc, C.trunk, fog);
          prism(octagon(tr.x, tr.y, 0.5 * sc, tr.rot), 0.38 * sc, 0.95 * sc, C.tree1, fog);
          prism(octagon(tr.x, tr.y, 0.37 * sc, tr.rot + 0.3), 0.95 * sc, 1.42 * sc, C.tree2, fog);
          const top = prism(octagon(tr.x, tr.y, 0.21 * sc, tr.rot + 0.6), 1.42 * sc, 1.72 * sc, C.tree3, fog);
          rim(octagon(tr.x, tr.y, 0.5 * sc, tr.rot), 0.95 * sc, 0.5 - 0.25 * u);
          rim(octagon(tr.x, tr.y, 0.37 * sc, tr.rot + 0.3), 1.42 * sc, 0.4 - 0.2 * u);
          // lurkers: red eyes in the dark crowns, only in the flat world
          if (tr.lurk && u < 0.6) {
            const open = Math.sin(t * 0.9 + tr.ph) > 0.2 ? 1 : 0;
            if (open) {
              let cx = 0, cy = 0;
              for (const p of top) { cx += p[0]; cy += p[1]; }
              cx /= top.length; cy /= top.length;
              g.fillStyle = col(C.redGlow, 1, 0, 1 - u / 0.6);
              dot(cx - 0.08 * s, cy + 0.12 * s, 0.06 * s);
              dot(cx + 0.08 * s, cy + 0.12 * s, 0.06 * s);
            }
          }
        },
      });
    }
    if (xh > 0.01) {
      const ang = Math.atan2(b.y - HOLE.y, b.x - HOLE.x), ca = Math.cos(ang), sa = Math.sin(ang);
      const L2W = (f, l) => [HOLE.x + f * ca - l * sa, HOLE.y + f * sa + l * ca];
      const rect = (f0, f1, l0, l1) => [L2W(f0, l0), L2W(f1, l0), L2W(f1, l1), L2W(f0, l1)];
      const fog = fogAt(yrOf(HOLE.x, HOLE.y)) * 0.6;
      const hit = env(t, 10.12, 10.42);
      const facing = ca * sY + sa * cY; // > 0: X's face is towards the viewer
      const part = (foot, z0, z1, c, deco) => {
        let cx = 0, cy = 0;
        for (const p of foot) { cx += p[0]; cy += p[1]; }
        cx /= foot.length; cy /= foot.length;
        const yr = yrOf(cx, cy);
        things.push({ d: yr * cT + ((z0 + z1) / 2) * xh * sT, draw: () => { prism(foot, z0 * xh, z1 * xh, c, fog, hit * 0.75); if (deco) deco(); } });
      };
      /** a point on a front face: l across (-1..1 of half-width hw), v up the face (0..1) */
      const onFace = (f, hw, z0, z1, l, v) => { const w2 = L2W(f, l * hw); return P(w2[0], w2[1], lerp(z0, z1, v) * xh); };
      for (const sg of [-1, 1]) {
        part(rect(-0.17, 0.17, sg < 0 ? -0.42 : 0.14, sg < 0 ? -0.14 : 0.42), 0, 0.78, C.purpleDark);
        part(rect(-0.13, 0.13, sg < 0 ? -0.84 : 0.6, sg < 0 ? -0.6 : 0.84), 0.3, 1.66, C.purpleDark);
        part(rect(-0.19, 0.19, sg < 0 ? -0.9 : 0.54, sg < 0 ? -0.54 : 0.9), 0.02, 0.36, C.purple);
      }
      part(rect(-0.36, 0.36, -0.54, 0.54), 0.74, 1.76, C.purple, () => {
        if (facing <= 0.02 || cT < 0.05) return;
        // the hollow in X's chest
        const q = [onFace(0.365, 0.54, 0.74, 1.76, -0.46, 0.22), onFace(0.365, 0.54, 0.74, 1.76, 0.46, 0.22), onFace(0.365, 0.54, 0.74, 1.76, 0.46, 0.78), onFace(0.365, 0.54, 0.74, 1.76, -0.46, 0.78)];
        g.fillStyle = col(C.ink, 1, 0, 0.95);
        poly(q);
        g.globalCompositeOperation = 'lighter';
        const m = onFace(0.37, 0.54, 0.74, 1.76, 0, 0.5);
        glow(SPR.magenta, m[0], m[1], s * 0.34, 0.35 + 0.15 * Math.sin(t * 3));
        g.globalCompositeOperation = 'source-over';
      });
      part(rect(-0.46, 0.46, -0.68, 0.68), 1.74, 2.42, C.purpleMid, () => {
        if (facing <= 0.02 || cT < 0.05) return;
        const blinkOpen = Math.sin(t * 1.3) > -0.93 ? 1 : 0.15;
        const eyes = [[-0.58, 0.62], [-0.2, 0.74], [0.2, 0.74], [0.58, 0.62], [-0.32, 0.3], [0.32, 0.3], [0, 0.42]];
        for (const [l, v] of eyes) {
          const p = onFace(0.47, 0.68, 1.74, 2.42, l, v);
          g.globalCompositeOperation = 'lighter';
          glow(SPR.red, p[0], p[1], s * 0.22, (0.42 + 0.2 * Math.sin(t * 4 + l * 5)) * facing);
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = col(C.redGlow, 1, 0, Math.min(1, facing * 1.6));
          g.beginPath(); g.ellipse(p[0], p[1], Math.max(0.7, 0.055 * s), Math.max(0.5, 0.055 * s * blinkOpen), 0, 0, TAU); g.fill();
          if (!px) { g.fillStyle = 'rgba(255,235,235,.9)'; g.beginPath(); g.arc(p[0] - 0.014 * s, p[1] - 0.014 * s, Math.max(0.6, 0.016 * s), 0, TAU); g.fill(); }
        }
      });
      for (const sg of [-1, 1]) {
        part(rect(-0.09, 0.09, sg < 0 ? -0.66 : 0.48, sg < 0 ? -0.48 : 0.66), 2.42, 2.82, C.purpleDark);
        part(rect(-0.06, 0.06, sg < 0 ? -0.74 : 0.62, sg < 0 ? -0.62 : 0.74), 2.82, 3.1, C.purpleDark);
      }
    }
    {
      const r = 0.33;
      const zc = r * (1 - b.sq * 0.3) + b.hop;
      const yr = yrOf(b.x, b.y);
      things.push({ d: yr * cT + zc * sT, draw: () => drawBlob(zc) });
    }
    things.sort((p, q) => p.d - q.d);
    for (const th of things) th.draw();

    function drawBlob(zc) {
      const r = 0.33;
      const c = P(b.x, b.y, zc);
      const R = r * s;
      const rx = R * (1 + b.sq * 0.22), ry = R * (1 - b.sq * 0.22);
      const gr = g.createRadialGradient(c[0] - rx * 0.35, c[1] - ry * 0.42, R * 0.08, c[0], c[1], R * 1.05);
      gr.addColorStop(0, col(C.blobLight, 1, 0, 1, b.fire * 0.4)); gr.addColorStop(0.55, col(C.blob, 1, 0, 1, b.fire * 0.3)); gr.addColorStop(1, col(C.blobShade));
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(c[0], c[1], rx, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = col(C.blobOutline);
      g.lineWidth = lw(R * 0.08);
      g.stroke();
      // eyes: drawn face-on in the flat world (as the game's sprites are), turned with the head in 3D
      const ahead = P(b.x + b.dx, b.y + b.dy, zc);
      let vx = ahead[0] - c[0], vy = ahead[1] - c[1];
      const vl = Math.hypot(vx, vy) || 1;
      vx /= vl; vy /= vl;
      const fs = Math.min(1, vl / s);
      const toward = b.dx * sY + b.dy * cY;
      const facing = lerp(1, toward, u);
      if (facing <= -0.35) return;
      const a = sstep(-0.35, 0.1, facing);
      const blink = (t % 3.1) > 2.95 ? 0.15 : 1;
      for (const sg of [-1, 1]) {
        const flatX = c[0] + b.dx * R * 0.22 + sg * R * 0.3, flatY = c[1] + b.dy * R * 0.14 - R * 0.02;
        const tx = c[0] + vx * R * 0.4 * fs + -vy * R * 0.3 * sg, ty = c[1] + vy * R * 0.4 * fs + vx * R * 0.3 * sg - R * 0.1;
        const ex = lerp(flatX, tx, u), ey = lerp(flatY, ty, u);
        g.fillStyle = col(C.blobEye, 1, 0, a);
        g.beginPath(); g.ellipse(ex, ey, Math.max(0.6, R * 0.1), Math.max(0.6, R * 0.15 * blink), 0, 0, TAU); g.fill();
        if (!px) {
          g.fillStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
          g.beginPath(); g.arc(ex - R * 0.03, ey - R * 0.05, R * 0.035, 0, TAU); g.fill();
          g.fillStyle = col(C.blush, 1, 0, 0.55 * a);
          g.beginPath(); g.ellipse(ex + sg * R * 0.1, ey + R * 0.2, R * 0.09, R * 0.05, 0, 0, TAU); g.fill();
        }
      }
    }

    /* dust as X comes up, and bits of soil falling off the island */
    {
      const p = clamp((t - 5.7) / 1.7, 0, 1);
      if (t > 5.7 && p < 1) {
        for (let i = 0; i < 22; i++) {
          const a = hash(i, 1, 99) * TAU, rr = 0.5 + p * (0.4 + hash(i, 2, 99) * 0.7);
          const q = P(HOLE.x + Math.cos(a) * rr, HOLE.y + Math.sin(a) * rr, p * (0.5 + hash(i, 3, 99) * 1.1));
          g.fillStyle = `rgba(200,195,175,${((1 - p) * 0.75).toFixed(3)})`;
          dot(q[0], q[1], 0.05 * s);
        }
      }
      if (u > 0.4 && cT > 0.1) {
        for (let i = 0; i < 12; i++) {
          const e = hash(i, 4, 99), side = (i % 2) * 2 - 1;
          const ph = (t * 0.32 + hash(i, 5, 99)) % 1;
          const x = side > 0 ? HALF - 0.1 : -HALF + 0.1 + (e - 0.5) * 9;
          const y = side > 0 ? -HALF + e * N : HALF - 0.1;
          const q = P(x, y, -DEPTH - ph * 2.4);
          g.fillStyle = `rgba(110,92,70,${((1 - ph) * 0.7 * u).toFixed(3)})`;
          dot(q[0], q[1], 0.045 * s);
        }
      }
    }

    /* lights in the air: fireflies, the Blob's aura, the lance */
    g.globalCompositeOperation = 'lighter';
    for (const f of fireflies) {
      const x = f.x + 0.35 * Math.sin(t * 0.7 * f.f1 + f.ph), y = f.y + 0.35 * Math.cos(t * 0.6 * f.f2 + f.ph);
      const q = P(x, y, 0.45 + 0.3 * Math.sin(t * 0.9 + f.ph));
      const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 1.7 * f.f1 + f.ph));
      glow(f.cyan ? SPR.cyan : SPR.moss, q[0], q[1], s * 0.3, 0.42 * a);
      g.fillStyle = f.cyan ? `rgba(200,245,255,${a.toFixed(3)})` : `rgba(190,255,200,${a.toFixed(3)})`;
      dot(q[0], q[1], 0.045 * s);
    }
    {
      const c = P(b.x, b.y, 0.3 + b.hop);
      glow(SPR.warm, c[0], c[1], s * (0.95 + 0.5 * b.charge + 0.6 * b.fire), 0.5 + 0.08 * Math.sin(t * 3) + b.charge * 0.4);
      if (b.charge > 0) {
        // the charge: a ring that closes in on the Blob
        const rr = lerp(1.0, 0.42, b.charge) * s;
        const gp = P(b.x, b.y, 0.02);
        g.save(); g.translate(gp[0], gp[1]); g.scale(1, Math.max(0.06, sT));
        g.strokeStyle = col(C.blobLight, 1, 0, 0.35 + 0.6 * b.charge);
        g.lineWidth = lw(0.05 * s) / Math.max(0.06, sT) * Math.max(0.06, sT);
        g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke();
        g.restore();
      }
      if (b.fire > 0 && xh > 0.5) {
        const ang = Math.atan2(b.y - HOLE.y, b.x - HOLE.x);
        const hitP = P(HOLE.x + Math.cos(ang) * 0.45, HOLE.y + Math.sin(ang) * 0.45, 1.15 * xh);
        for (const [c2, wd, a] of [[C.blob, 0.3, 0.35], [C.blobLight, 0.13, 0.7], [[255, 255, 255], 0.045, 1]]) {
          g.strokeStyle = col(c2, 1, 0, a * b.fire);
          g.lineWidth = lw(wd * s);
          g.lineCap = 'round';
          g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(hitP[0], hitP[1]); g.stroke();
        }
        glow(SPR.white, hitP[0], hitP[1], s * 1.1, b.fire);
        for (let i = 0; i < 10; i++) {
          const a = hash(i, 7, 70) * TAU, d = (1 - b.fire) * (0.4 + hash(i, 8, 70) * 0.9);
          const q = [hitP[0] + Math.cos(a) * d * s, hitP[1] + Math.sin(a) * d * s * 0.8];
          g.fillStyle = `rgba(255,240,190,${b.fire.toFixed(3)})`;
          dot(q[0], q[1], 0.05 * s);
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.lineCap = 'butt';

  }

  /* -------------------------------------------- one frame -------------------------------------------- */
  function renderAt(t) {
    if (!W || !H) return;
    t = ((t % LOOP) + LOOP) % LOOP;
    const u = foldAt(t);
    // the pixels get finer as the world gains its third direction: 4, 3, 2, 1 screen pixels, then full resolution
    const step = u < 0.25 ? 4 : u < 0.5 ? 3 : u < 0.72 ? 2 : u < 0.92 ? 1 : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (step) {
      const bw = Math.max(1, Math.round(cssW / step)), bh = Math.max(1, Math.round(cssH / step));
      if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; }
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.imageSmoothingEnabled = true;
      scene(bctx, bw, bh, t, u, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf, 0, 0, bw, bh, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
    } else {
      scene(ctx, W, H, t, u, 0);
    }
    post(t, u);
    caption(t);
  }

  /** screen-space touches drawn at full resolution: glitch, flash, vignette, the axis gizmo */
  function post(t, u) {
    // the tear: slices of the picture slip sideways
    const gl = env(t, 3.95, 4.5) + env(t, 11.55, 11.8) * 0.6;
    if (gl > 0) {
      for (let i = 0; i < 7; i++) {
        const y = Math.floor(hash(i, Math.floor(t * 24), 3) * H);
        const hh = Math.max(2, Math.floor((0.01 + hash(i, Math.floor(t * 24), 4) * 0.05) * H));
        const dx = Math.round((hash(i, Math.floor(t * 24), 5) - 0.5) * 0.06 * W * gl);
        ctx.drawImage(canvas, 0, y, W, hh, dx, y, W, hh);
      }
    }
    const flash = env(t, 4.35, 4.8) * 0.32 + env(t, 10.1, 10.32) * 0.14;
    if (flash > 0) { ctx.fillStyle = `rgba(236,255,250,${flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (!vignette) {
      vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vignette.addColorStop(0, 'rgba(3,4,10,0)');
      vignette.addColorStop(1, 'rgba(3,4,10,.55)');
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    // the axis gizmo: x and y always, z (the third direction) grows as the world tilts
    const { sY, cY, sT, cT } = cam;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ox = 24, oy = 26, len = 14;
    const axes = [
      ['z', 0, -cT, 'rgba(159,244,238,', clamp(cT * 3, 0, 1)],
      ['y', -sY, cY * sT, 'rgba(143,226,154,', 1],
      ['x', cY, sY * sT, 'rgba(255,106,106,', 1],
    ];
    ctx.lineCap = 'round';
    ctx.font = '600 9px ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [name, ax, ay, c, a] of axes) {
      if (a <= 0.01) continue;
      const ex = ox + ax * len, ey = oy + ay * len;
      ctx.strokeStyle = c + (0.9 * a).toFixed(3) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
      const l = Math.hypot(ax, ay) || 1;
      ctx.fillStyle = c + a.toFixed(3) + ')';
      ctx.fillText(name, ox + (ax / l) * (len * Math.max(0.35, l) + 7), oy + (ay / l) * (len * Math.max(0.35, l) + 7));
    }
    ctx.fillStyle = 'rgba(230,237,243,.85)';
    ctx.beginPath(); ctx.arc(ox, oy, 1.8, 0, TAU); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineCap = 'butt';
  }

  function caption(t) {
    if (!capEl) return;
    const [text, caret] = still ? ['the world was never flat.', false] : captionAt(t);
    if (text !== lastCap) { capEl.textContent = text; lastCap = text; }
    if (caret !== lastCaret) { capEl.dataset.caret = caret ? '1' : '0'; lastCaret = caret; }
  }

  /* -------------------------------------------- running -------------------------------------------- */
  const running = () => raf !== 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    const k = Math.min(1, dt * 3.5);
    hov.x += (hov.tx - hov.x) * k;
    hov.y += (hov.ty - hov.y) * k;
    renderAt(clock % LOOP);
  }
  function update() {
    const want = !still && !paused && inView && shown && W > 0;
    if (want && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    else if (!want && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!want && still) renderAt(STILL_T);
  }

  const onMove = (e) => {
    if (still) return;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    hov.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1.2, 1.2);
    hov.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1.2, 1.2);
  };
  const onEnter = (e) => {
    onMove(e);
    // hovering while the world is still flat skips ahead to the tear
    const t = clock % LOOP;
    if (!still && t > 0.2 && t < 3.6) clock += 3.6 - t;
  };
  const onLeave = () => { hov.tx = 0; hov.ty = 0; };
  hoverEl.addEventListener('pointermove', onMove);
  hoverEl.addEventListener('pointerenter', onEnter);
  hoverEl.addEventListener('pointerleave', onLeave);

  const onVis = () => { shown = !document.hidden; update(); };
  document.addEventListener('visibilitychange', onVis);
  const onMotion = () => { if (!forced) { still = !!(mq && mq.matches); hov.x = hov.y = hov.tx = hov.ty = 0; update(); if (!running()) renderAt(still ? STILL_T : clock % LOOP); } };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMotion);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { size(); update(); }) : null;
  if (ro) ro.observe(canvas); else window.addEventListener('resize', size);
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; update(); }, { rootMargin: '80px' })
    : null;
  if (io) io.observe(canvas);

  size();
  update();

  return {
    duration: LOOP,
    /** draw the frame at t seconds (0..13) and stop the clock there; for screenshots and tests */
    renderAt(t) { paused = true; update(); hov.x = hov.y = hov.tx = hov.ty = 0; clock = t; renderAt(t); },
    pause() { paused = true; update(); },
    resume() { paused = false; update(); },
    destroy() {
      paused = true; update();
      hoverEl.removeEventListener('pointermove', onMove);
      hoverEl.removeEventListener('pointerenter', onEnter);
      hoverEl.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotion);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', size);
      if (io) io.disconnect();
    },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* the card                                                                                         */
/* ------------------------------------------------------------------------------------------------ */

const CSS = `
:host { display: block; container: ttd / inline-size; color: var(--ttd-text, #e6edf3); }
* { box-sizing: border-box; }
.card {
  --a: var(--ttd-accent, #a3e635);
  --b: var(--ttd-border, #30363d);
  --t: var(--ttd-text, #e6edf3);
  --m: var(--ttd-muted, #7d8590);
  --mono: var(--ttd-mono, ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace);
  position: relative; isolation: isolate;
  display: grid; grid-template-columns: minmax(0, 1fr);
  border: 1px solid var(--b); border-radius: var(--ttd-radius, 14px);
  background: var(--ttd-surface, #0d1117);
  overflow: hidden;
  transition: border-color .25s ease, transform .25s ease, box-shadow .25s ease;
}
/* a line of light along the top edge and a soft spotlight, both under the pointer */
.card::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px; z-index: 2; pointer-events: none;
  background: radial-gradient(180px 1px at var(--mx, 50%) 0, var(--a), transparent);
  opacity: 0; transition: opacity .3s ease;
}
.card::after {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(460px circle at var(--mx, 50%) var(--my, 0%), color-mix(in srgb, var(--a) 7%, transparent), transparent 62%);
  opacity: 0; transition: opacity .3s ease;
}
.card:hover { border-color: color-mix(in srgb, var(--a) 32%, var(--b)); transform: translateY(-2px); box-shadow: 0 20px 44px -26px rgba(0, 0, 0, .85); }
.card:hover::before, .card:hover::after { opacity: 1; }

.body { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 18px; min-width: 0; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; }
.status {
  display: inline-flex; align-items: center; gap: 8px; padding: 5px 11px 5px 9px; border-radius: 999px;
  font: 600 12px/1 var(--mono); color: var(--a);
  background: color-mix(in srgb, var(--a) 9%, transparent); border: 1px solid color-mix(in srgb, var(--a) 34%, transparent);
}
.status i { width: 7px; height: 7px; border-radius: 50%; background: var(--a); animation: ping 2.4s ease-out infinite; }
@keyframes ping {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--a) 65%, transparent); }
  70%, 100% { box-shadow: 0 0 0 7px transparent; }
}
.year { font: 500 12px/1 var(--mono); color: var(--m); }
h3 {
  margin: 0; font-family: var(--ttd-display, inherit); font-weight: 700; color: var(--t);
  font-size: clamp(1.4rem, 1.05rem + 1.5cqi, 1.9rem); line-height: 1.08; letter-spacing: -0.015em; text-wrap: balance;
}
h3 a { color: inherit; text-decoration: none; }
h3 a:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; text-decoration-color: color-mix(in srgb, var(--a) 70%, transparent); }
.desc { margin: 0; color: var(--t); opacity: .9; font-size: .95rem; line-height: 1.55; max-width: 48ch; }
.stats { display: flex; flex-wrap: wrap; gap: 10px 26px; margin: 0; }
.stats div { display: flex; flex-direction: column-reverse; gap: 5px; }
.stats dt { font: 500 11px/1.2 var(--mono); color: var(--m); }
.stats dd { margin: 0; font: 700 22px/1 var(--mono); color: var(--t); font-variant-numeric: tabular-nums; }
.stack { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.stack li { font: 500 11px/1 var(--mono); color: var(--m); padding: 5px 8px; border: 1px solid var(--b); border-radius: 6px; }
.foot { margin-top: auto; padding-top: 2px; display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; }
.plat { font: 500 11.5px/1.5 var(--mono); color: var(--m); min-width: 0; }
.links { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.play {
  display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 8px;
  background: var(--a); color: #0d1117; font: 700 13px/1 var(--mono); text-decoration: none;
  transition: transform .2s ease, box-shadow .2s ease;
}
.play svg { width: 10px; height: 10px; }
.play:hover { transform: translateY(-1px); box-shadow: 0 8px 22px -10px var(--a); }
.ext { font: 500 12.5px/1 var(--mono); color: var(--m); text-decoration: none; }
.ext:hover { color: var(--t); }
a:focus-visible { outline: 2px solid var(--a); outline-offset: 3px; border-radius: 6px; }

.preview {
  position: relative; display: block; order: -1; margin: 10px 10px 0; aspect-ratio: 16 / 9;
  border-radius: 10px; overflow: hidden; background: #05060c; border: 1px solid rgba(255, 255, 255, .06); cursor: pointer;
}
.preview canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.cap {
  position: absolute; left: 12px; bottom: 10px; pointer-events: none; white-space: nowrap;
  font: 600 11.5px/1 var(--mono); color: var(--a); text-shadow: 0 0 12px color-mix(in srgb, var(--a) 55%, transparent);
}
.cap[data-caret="1"]::after { content: "\\258C"; margin-left: 1px; opacity: .9; }
.hint {
  position: absolute; right: 10px; bottom: 9px; pointer-events: none;
  font: 600 11px/1 var(--mono); color: rgba(230, 237, 243, .8);
  padding: 5px 8px; border-radius: 6px; background: rgba(5, 6, 12, .55); border: 1px solid rgba(255, 255, 255, .08);
  opacity: 0; transform: translateY(3px); transition: opacity .25s ease, transform .25s ease;
}
.preview:hover .hint { opacity: 1; transform: none; }

@container ttd (min-width: 700px) {
  .card { grid-template-columns: minmax(0, 1fr) minmax(0, 1.12fr); }
  .body { padding: 24px 8px 22px 26px; }
  .preview { order: 2; margin: 12px; aspect-ratio: auto; min-height: 260px; }
}
@media (prefers-reduced-motion: reduce) {
  .card, .card::before, .card::after, .play, .hint { transition: none; }
  .card:hover, .play:hover { transform: none; }
  .status i { animation: none; }
}
`;

const PLAY_ICON = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 0.8v8.4L9 5z" fill="currentColor"/></svg>';
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

/** <ttd-card play="..." itch="..." source="..."></ttd-card>: every attribute is optional */
export class TTDCard extends Base {
  static get observedAttributes() { return ['play', 'itch', 'source']; }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
  }

  disconnectedCallback() {
    this.preview?.destroy();
    this.preview = null;
  }

  attributeChangedCallback() {
    if (this.shadowRoot && this.isConnected) this.render();
  }

  render() {
    this.preview?.destroy();
    const L = {
      play: this.getAttribute('play') || TTD_LINKS.play,
      itch: this.getAttribute('itch') || TTD_LINKS.itch,
      source: this.getAttribute('source') || TTD_LINKS.source,
    };
    const ext = 'target="_blank" rel="noopener"';
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
<article class="card" part="card">
  <div class="body">
    <div class="top">
      <span class="status"><i aria-hidden="true"></i>live on CrazyGames</span>
      <span class="year">2026 · web game</span>
    </div>
    <h3><a href="${esc(L.play)}" ${ext}>The Third Direction</a></h3>
    <p class="desc">A boss-rush action game: a hand-made pixel forest that breaks open into a full 3D arena. Eight bosses, three difficulty levels and one-thumb controls.</p>
    <dl class="stats">
      <div><dt>bosses</dt><dd>8</dd></div>
      <div><dt>difficulty levels</dt><dd>3</dd></div>
      <div><dt>thumb to play</dt><dd>1</dd></div>
    </dl>
    <ul class="stack" aria-label="Built with"><li>TypeScript</li><li>three.js</li><li>Canvas 2D</li><li>Vite</li></ul>
    <div class="foot">
      <span class="plat">HTML5 · Windows · macOS · Linux · Android</span>
      <span class="links">
        <a class="play" href="${esc(L.play)}" ${ext}>${PLAY_ICON}Play free</a>
        <a class="ext" href="${esc(L.itch)}" ${ext}>itch.io ↗</a>
        <a class="ext" href="${esc(L.source)}" ${ext}>code ↗</a>
      </span>
    </div>
  </div>
  <a class="preview" href="${esc(L.play)}" ${ext} tabindex="-1" aria-hidden="true">
    <canvas></canvas>
    <span class="cap" data-caret="0"></span>
    <span class="hint">play ↗</span>
  </a>
</article>`;
    const root = this.shadowRoot;
    const card = root.querySelector('.card');
    const preview = root.querySelector('.preview');
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    this.preview = mountTTDPreview(root.querySelector('canvas'), { caption: root.querySelector('.cap'), hoverTarget: preview });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ttd-card')) customElements.define('ttd-card', TTDCard);
