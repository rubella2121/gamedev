import { Pix } from '../core/pix';
import { arc, buf, rimPass, tendril } from './guardians/draw';
import { C } from '../core/palette';
import { drawGloom } from '../core/art2';
import { clamp, hash2, lerp, rng, TAU } from '../core/util';

/**
 * Sprites for the zone guardians. Each boss draws into a small buffer, gets a moon rim-light pass
 * (the moon is up and to the right, like everywhere else in the forest), then is stamped onto the scene.
 * (x, y) is always the ground point under the middle of the boss.
 */

/* ------------------------------------------------------------------ */
/* Gloommother (Gloom Hollow)                                          */
/* ------------------------------------------------------------------ */

export interface MotherOpts {
  /** 0..1: her chest opens and the core shows (the moment you can hurt her) */
  exposed?: number;
  flash?: number;
  /** 0..1 how many Gloomling pups still cling to her */
  pups?: number;
}

/** A mountain of living shadow with a hundred cyan eyes. */
export function drawGloommother(p: Pix, x: number, y: number, t: number, o: MotherOpts = {}) {
  const W = 150;
  const H = 116;
  const s = buf('mother', W, H);
  const bx = 75;
  const by = 108;
  const br = 1 + 0.02 * Math.sin(t * 1.8);
  const ex = o.exposed ?? 0;
  const body = o.flash ? '#1c3a4a' : '#04060d';
  const lit = o.flash ? '#2a5a6a' : '#0a1822';
  // the smoke around her goes straight onto the scene, behind her
  p.dither(x, y - 44, 66, 48, '#02030a', 0.38);
  p.dither(x, y - 50, 50, 38, '#0a1620', 0.28);
  p.dither(x, y - 3, 58, 9, '#010208', 0.85);
  // arms: heavy tendrils that drag along the ground, ending in claws
  for (const sg of [-1, 1]) {
    const hand = tendril(s, bx + sg * 26, by - 38, [[sg * 14, 6], [sg * 30, 22], [sg * 44, 32], [sg * 54, 40]], 13, body, t * 1.4 + sg);
    for (let k = -1; k <= 1; k++) {
      s.line(hand.x, hand.y, hand.x + sg * (7 + k * 2), hand.y + 4 + k * 3, body, 3);
      s.px(hand.x + sg * (9 + k * 2), hand.y + 5 + k * 3, C.cyanEye);
    }
  }
  // the mound of her body, a heap of lumps
  const lumps: [number, number, number, number][] = [
    [0, -34, 40, 30],
    [-26, -22, 24, 20],
    [26, -22, 24, 20],
    [0, -52, 30, 20],
    [-16, -10, 26, 15],
    [16, -10, 26, 15],
  ];
  for (const [dx, dy, rx, ry] of lumps) s.ellipse(bx + dx, by + dy, rx * br, ry * br, body);
  // the lit side is toward the moon (upper right)
  for (const [dx, dy, rx, ry] of lumps) s.ellipse(bx + dx + 3, by + dy - 3, rx * 0.72, ry * 0.72, lit);
  for (const [dx, dy, rx, ry] of lumps) s.ellipse(bx + dx + 5, by + dy - 5, rx * 0.4, ry * 0.4, o.flash ? '#3a7a8a' : '#10303e');
  // a hem of small tentacles along the bottom, where the pups crawl out
  for (let i = -8; i <= 8; i++) {
    const hx = bx + i * 5.5;
    const sway = Math.sin(t * 2.2 + i * 0.9) * 2;
    s.line(hx, by - 8, hx + sway, by + 2, body, 3);
    if (i % 3 === 0) s.px(hx + sway, by + 3, C.cyanEye);
  }
  // wet sheen
  const r = rng(7);
  for (let i = 0; i < 30; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r());
    const sx = bx + Math.cos(a) * 36 * d;
    const sy = by - 38 + Math.sin(a) * 26 * d;
    s.px(sx, sy, '#14384a');
    if (r() < 0.4) s.px(sx + 1, sy, '#1d5468');
  }
  // her hundred eyes
  const re = rng(31);
  for (let i = 0; i < 26; i++) {
    const a = re() * TAU;
    const d = 0.25 + Math.sqrt(re()) * 0.75;
    const ex2 = bx + Math.cos(a) * 38 * d;
    const ey2 = by - 34 + Math.sin(a) * 27 * d;
    if (ey2 < by - 62 || Math.hypot(ex2 - bx, ey2 - (by - 70)) < 18 || Math.hypot(ex2 - bx, ey2 - (by - 32)) < 12) continue;
    if (Math.sin(t * 1.7 + i * 1.9) < -0.6) continue;
    const big = i % 5 === 0;
    s.rect(ex2, ey2, big ? 3 : 2, big ? 3 : 2, C.cyanEye);
    s.px(ex2, ey2, '#d8ffff');
    if (big) s.dither(ex2 + 1, ey2 + 1, 5, 4, C.cyanEye, 0.25);
  }
  // her chest: the core that shows when she is open
  const core = 5 + 5 * ex;
  s.dither(bx, by - 32, core + 9, core + 7, C.cyanEye, 0.16 + 0.34 * ex);
  if (ex > 0.05) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3;
      s.line(bx, by - 32, bx + Math.cos(a) * 36 * ex, by - 32 + Math.sin(a) * 26 * ex, C.cyanEye, 1);
    }
    s.ellipse(bx, by - 32, core, core * 1.1, '#bff8ff');
    s.ellipse(bx, by - 32, core * 0.55, core * 0.6, '#ffffff');
  } else {
    s.ellipse(bx, by - 32, 3.5, 3.8, '#0f4a58');
    s.px(bx, by - 33, C.cyanEye);
  }
  // her head
  s.ellipse(bx, by - 70, 20, 16, body);
  s.ellipse(bx + 2, by - 73, 16, 12, lit);
  // a crown of shadow spikes
  for (let i = -3; i <= 3; i++) {
    const h2 = 10 + (3 - Math.abs(i)) * 3 + Math.sin(t * 2 + i) * 1.2;
    s.line(bx + i * 6, by - 82, bx + i * 8, by - 82 - h2, body, 4);
    s.line(bx + i * 8, by - 82 - h2 + 3, bx + i * 8.6, by - 82 - h2, body, 2);
    s.px(bx + i * 8.6, by - 83 - h2, C.cyanEye);
  }
  // two great eyes with slit pupils
  for (const sg of [-1, 1]) {
    const ex0 = bx + sg * 9;
    const ey0 = by - 72;
    s.dither(ex0, ey0, 12, 9, C.cyanEye, 0.3);
    s.ellipse(ex0, ey0, 6, 5, '#27d8e8');
    s.ellipse(ex0, ey0, 5, 4, C.cyanEye);
    s.ellipse(ex0 - 1, ey0 - 1, 2, 1.6, '#d8ffff');
    s.rect(ex0 - 0.5, ey0 - 3, 1.4, 6.5, '#02030a');
    s.line(ex0 - sg * 7, ey0 - 6, ex0 + sg * 5, ey0 - 3, body, 2);
  }
  // her mouth: a crescent of fangs
  s.ellipse(bx, by - 60, 15, 4.5, '#010208');
  for (let i = -7; i <= 7; i++) {
    const fx = bx + i * 2.1;
    const fy = by - 62 + Math.abs(i) * 0.45;
    s.rect(fx, fy, 1.4, 2 + (i & 1), '#bff8ff');
    if (i % 2 === 0) s.rect(fx, fy + 4 + (i & 1), 1.2, 2, '#7ad8e8');
  }
  for (let i = -2; i <= 2; i += 2) s.line(bx + i * 4, by - 57, bx + i * 4, by - 50 + Math.sin(t * 3 + i) * 2, '#27a8b8', 1);
  // her pups cling to her
  const pups = o.pups ?? 1;
  const spots: [number, number][] = [[-58, 0], [-44, 4], [54, 2], [40, 6], [-36, -52], [32, -50], [-12, -88], [20, -86]];
  spots.forEach(([dx, dy], i) => {
    if (i / spots.length > pups) return;
    drawGloom(s, bx + dx, by + dy, t + i, i * 3, 1);
  });
  rimPass(s, '#1d6a82', 0.75, 11, '#2a8aa0');
  p.blit(s.canvas, x - bx, y - by);
}

/* ------------------------------------------------------------------ */
/* Thornback King (Rootmaw Thicket)                                    */
/* ------------------------------------------------------------------ */

export interface KingOpts {
  /** 0 idle, 1 winding up, 2 charging, 3 stunned */
  mode?: 0 | 1 | 2 | 3;
  flash?: number;
}

/** A beetle the size of a house, crowned in thorns. Faces right. */
export function drawThornbackKing(p: Pix, x: number, y: number, t: number, o: KingOpts = {}) {
  const W = 140;
  const H = 104;
  const s = buf('king', W, H);
  const bx = 62;
  const by = 98;
  const mode = o.mode ?? 0;
  const run = mode === 2 ? 1 : mode === 0 ? 0.2 : 0;
  const bob = mode === 2 ? Math.sin(t * 26) * 1.4 : mode === 3 ? 0 : Math.sin(t * 2) * 0.7;
  const tilt = mode === 3 ? 6 : 0;
  const shell = o.flash ? '#5a7a8a' : '#0e1a24';
  // dust and shadow go straight onto the scene
  p.dither(x, y + 1, 58, 8, '#02050a', 0.8);
  if (mode === 2) {
    p.dither(x - 52, y - 3, 18, 6, '#7a9a9a', 0.4);
    p.dither(x - 62, y - 11, 12, 7, '#5a7a7a', 0.3);
    p.dither(x - 46, y - 17, 10, 6, '#5a7a7a', 0.25);
  }
  // six legs, jointed and spiked, under the shell
  for (let i = 0; i < 6; i++) {
    const front = i % 2 === 0;
    const ph = Math.sin(t * 26 * run + i * 1.9);
    const lift = Math.max(0, ph) * (mode === 2 ? 6 : 1);
    const sx = bx - 30 + (i >> 1) * 26 + (front ? 0 : 6);
    const dir = front ? 1 : -1;
    const kx = sx + dir * 12 + ph * 2;
    const ky = by - 24 - lift;
    const fx = sx + dir * 17 + ph * 5;
    const fy = by - lift * 0.5 - (mode === 3 ? 8 + (i % 3) * 4 : 0);
    const col = front ? '#0a121a' : '#060b12';
    s.line(sx, by - 30, kx, ky, col, 5);
    s.line(kx, ky, fx, fy, col, 4);
    s.line(kx, ky - 1, kx + dir * 2, ky - 7, '#8fb0c0', 1);
    s.line(kx - dir * 2, ky - 1, kx - dir * 4, ky - 5, '#4a6a7a', 1);
    s.px(fx, fy, '#c8d8e0');
    s.px(fx + dir, fy, '#c8d8e0');
  }
  // the great dome of the shell
  const sy = by - 52 - bob;
  s.ellipse(bx - 2, sy + 2, 48, 34, shell);
  s.ellipse(bx - 1, sy, 45, 31, o.flash ? '#8aa8b8' : '#1a2c3c');
  s.ellipse(bx + 7, sy - 8, 31, 17, o.flash ? '#a8c0cc' : '#27425a');
  s.ellipse(bx + 14, sy - 13, 17, 8, '#3a5a72');
  s.ellipse(bx + 18, sy - 16, 7, 3, '#5a82a0');
  // plates: ribs that run from the ridge down to the skirt of the shell
  const domeY = (dx: number, sign: number) => sy + sign * 31 * Math.sqrt(Math.max(0, 1 - (dx / 45) * (dx / 45)));
  for (let i = -3; i <= 3; i++) {
    const tx = bx - 1 + i * 10;
    const bxx = bx - 1 + i * 16;
    const ax = tx;
    const ay = domeY(i * 10, -1) + 1;
    const ex2 = bxx;
    const ey2 = domeY(i * 16, 1) - 1;
    const cx2 = bx - 1 + i * 23;
    const cy2 = sy;
    let qx = ax;
    let qy = ay;
    for (let k = 1; k <= 14; k++) {
      const u = k / 14;
      const nx = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cx2 + u * u * ex2;
      const ny = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cy2 + u * u * ey2;
      s.line(qx, qy, nx, ny, '#0a121a', 1);
      s.px(nx + 1, ny, '#3a566e');
      qx = nx;
      qy = ny;
    }
  }
  // the skirt of the shell
  arc(s, bx - 1, sy + 4, 44, 28, 0.25, Math.PI - 0.25, '#0a121a', 2);
  // red cracks: X's mark under the armour
  const redPulse = 0.55 + 0.45 * Math.sin(t * 4);
  s.line(bx - 24, sy + 10, bx - 16, sy + 3, redPulse > 0.5 ? C.redGlow : C.red, 1);
  s.line(bx - 16, sy + 3, bx - 18, sy - 8, C.red, 1);
  s.line(bx + 26, sy + 14, bx + 34, sy + 7, C.red, 1);
  // roots and moss that grew over him
  const re = rng(5);
  for (let k = 0; k < 3; k++) {
    let rx0 = bx - 40 + k * 31;
    let ry0 = sy + 26;
    for (let j = 0; j < 15; j++) {
      rx0 += 2 + re() * 2;
      ry0 -= 2.3 + re() * 1.6;
      s.px(rx0, ry0, k % 2 ? C.root : '#3a2a1e');
      s.px(rx0 + 1, ry0, C.rootLight);
    }
  }
  for (let i = 0; i < 44; i++) {
    const a = re() * Math.PI + Math.PI;
    const d = 0.7 + re() * 0.3;
    s.px(bx + Math.cos(a) * 44 * d, sy + Math.sin(a) * 31 * d + 5, re() < 0.5 ? '#2e7d4f' : '#5bbf6a');
  }
  // broken branches stuck in him from old charges
  for (const [bx2, by2, dx, dy] of [[-32, -4, -11, -13], [8, -34, 6, -15], [36, -14, 13, -7]] as [number, number, number, number][]) {
    s.line(bx + bx2, sy + by2 + 12, bx + bx2 + dx, sy + by2 + 12 + dy, '#3a2a1e', 2);
    s.px(bx + bx2 + dx, sy + by2 + 12 + dy, C.rootLight);
  }
  // the crown of thorns along the ridge
  for (let i = 0; i < 9; i++) {
    const u = i / 8;
    const a = lerp(Math.PI * 1.08, Math.PI * 1.92, u);
    const cx0 = bx - 2 + Math.cos(a) * 42;
    const cy0 = sy + Math.sin(a) * 30;
    const lean = lerp(-0.5, 0.45, u);
    const h = 12 + Math.sin(u * Math.PI) * 14 + (i === 6 ? 6 : 0);
    const tx = cx0 + Math.sin(lean) * h + Math.cos(a) * 3;
    const ty = cy0 - Math.cos(lean) * h;
    s.line(cx0, cy0 + 1, tx, ty, '#07101a', 5);
    s.line(cx0 + 1, cy0, tx + 0.5, ty + 3, '#2a4258', 3);
    s.line(cx0 + 1, cy0 - 1, tx, ty + 1, '#8fb0c0', 1);
    s.px(tx, ty - 1, '#f4efe0');
    s.px(tx, ty, '#f4efe0');
  }
  // the head, low and forward, tucked under the shell's brow
  const hx = bx + 53;
  const hy = by - 26 - bob * 0.5 + tilt * 0.6;
  s.ellipse(hx - 1, hy + 1, 15, 12, shell);
  s.ellipse(hx, hy, 13, 10, '#1a2c3c');
  s.ellipse(hx + 3, hy - 4, 7, 3.5, '#2e4a62');
  // a great horn that sweeps up from his brow
  const hornTip = tendril(s, hx + 3, hy - 8, [[8, -6], [15, -14], [19, -25], [17, -35]], 9, '#27425a', 0);
  s.line(hx + 5, hy - 11, hx + 13, hy - 19, '#5a82a0', 1);
  s.px(hornTip.x, hornTip.y - 1, '#f4efe0');
  // two curved mandibles with teeth on the inside, like a stag beetle's
  const open = mode === 1 ? 7 : mode === 2 ? 1 : 4;
  for (const sgn of [-1, 1]) {
    const y0 = hy + 3 + sgn * 3;
    const pts: [number, number][] = [
      [hx + 9, y0],
      [hx + 17, y0 + sgn * (open * 0.6 + 2)],
      [hx + 24, y0 + sgn * (open + 3)],
      [hx + 30, y0 + sgn * (open + 1)],
      [hx + 33, y0 + sgn * (open - 4)],
    ];
    for (let i = 1; i < pts.length; i++) s.line(pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], sgn < 0 ? '#e8e0c8' : '#b8ae94', i < 3 ? 3 : 2);
    for (let i = 1; i < 4; i++) s.line(pts[i]![0], pts[i]![1], pts[i]![0] + 1, pts[i]![1] - sgn * 4, '#f4efe0', 1);
    s.px(pts[4]![0], pts[4]![1], '#ffffff');
  }
  // eyes and war paint
  const eye = mode === 3 ? '#6a6a7a' : mode === 2 ? C.redGlow : C.red;
  for (const [ex2, ey2] of [[hx - 1, hy - 3], [hx + 6, hy - 1]] as [number, number][]) {
    if (mode === 3) {
      s.line(ex2 - 2, ey2 - 2, ex2 + 2, ey2 + 2, eye, 1);
      s.line(ex2 + 2, ey2 - 2, ex2 - 2, ey2 + 2, eye, 1);
    } else {
      s.rect(ex2 - 1, ey2 - 1, 3, 3, eye);
      s.px(ex2, ey2 - 1, '#ffffff');
      s.dither(ex2, ey2, 5, 4, C.red, 0.4);
    }
  }
  s.line(hx - 8, hy + 5, hx + 2, hy + 8, C.red, 1);
  s.line(hx - 8, hy + 8, hx, hy + 11, C.redDark, 1);
  if (mode === 3) {
    for (let i = 0; i < 4; i++) {
      const a = t * 4 + (i / 4) * TAU;
      s.rect(hx + Math.cos(a) * 14, hy - 24 + Math.sin(a) * 4, 2, 2, '#ffe9a0');
    }
  }
  rimPass(s, '#5a82a0', 0.65, 17, '#8fb0c0');
  p.blit(s.canvas, x - bx, y - by);
}

/* ------------------------------------------------------------------ */
/* Toll Queen (Echo Marsh)                                             */
/* ------------------------------------------------------------------ */

export interface QueenOpts {
  /** 0..1: how far her last toll has travelled (rings are drawn by the scene) */
  toll?: number;
  /** 0..1: the bell is cracked */
  crack?: number;
  /** pixels she hovers above her shadow */
  hover?: number;
  look?: [number, number];
  /** 0..1 wings folded (diving) */
  fold?: number;
}

function goldAt(xn: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [-1, [96, 70, 24]],
    [-0.55, [150, 110, 42]],
    [-0.05, [214, 176, 86]],
    [0.4, [255, 240, 160]],
    [0.75, [216, 180, 90]],
    [1, [128, 96, 38]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (xn <= stops[i]![0]) {
      const a = stops[i - 1]!;
      const b = stops[i]!;
      const u = (xn - a[0]) / (b[0] - a[0]);
      return [lerp(a[1][0], b[1][0], u), lerp(a[1][1], b[1][1], u), lerp(a[1][2], b[1][2], u)];
    }
  }
  return stops[stops.length - 1]![1];
}

/** A bell the size of a house, hung from a winged eye. She only sees what moves. */
export function drawTollQueen(p: Pix, x: number, y: number, t: number, o: QueenOpts = {}) {
  const W = 150;
  const H = 168;
  const s = buf('queen', W, H);
  const cx = 75;
  const hover = o.hover ?? 26;
  const bob = Math.sin(t * 1.6) * 2.5;
  const fold = o.fold ?? 0;
  const crack = o.crack ?? 0;
  // her shadow on the water
  p.dither(x, y, 34, 9, '#02050a', 0.75);
  p.dither(x, y, 22, 6, '#02050a', 0.6);
  const EY = 46;
  const topY = 78;
  const lipY = 134;
  // a soft halo behind the eye
  for (let i = 0; i < 4; i++) {
    s.alpha(0.07);
    s.ellipse(cx, EY + bob, 62 - i * 9, 40 - i * 6, '#cfc6ff');
  }
  s.alpha(1);
  // wings first, behind the bell
  for (const sg of [-1, 1]) {
    const flap = Math.sin(t * 3 + sg) * 0.1 - fold * 0.7;
    for (let k = 0; k < 8; k++) {
      const ang = (sg < 0 ? Math.PI : 0) + sg * (-0.25 - k * 0.2 + flap) * -1;
      const ax = cx + sg * 14 + Math.cos(ang) * (44 - k * 2.5);
      const ay = EY + bob + Math.sin(ang) * (44 - k * 2.5) * 0.9 - 6 + k * 0.4;
      s.line(cx + sg * 12, EY + bob, ax, ay, k % 2 ? '#8f84d8' : '#b9b0f0', 3);
      s.line(cx + sg * 12, EY + bob, ax, ay, '#efeaff', 1);
    }
  }
  // the bell
  const rr = rng(13);
  for (let yy = topY; yy <= lipY; yy++) {
    const u = (yy - topY) / (lipY - topY);
    const flare = Math.max(0, (u - 0.8) / 0.2);
    const hw = 7 + 17 * Math.pow(u, 0.7) + 9 * flare * flare;
    for (let xx = -Math.ceil(hw); xx <= Math.ceil(hw); xx++) {
      const xn = xx / hw;
      const [R, G, B] = goldAt(xn);
      const n = hash2(xx * 3 + 11, yy * 5 + 3);
      let r2 = R;
      let g2 = G;
      let b2 = B;
      if (u > 0.3 && n > 0.82) {
        r2 = 58;
        g2 = 154;
        b2 = 122;
      } else if (u > 0.5 && n > 0.74 && xx % 2 === 0) {
        r2 = 46;
        g2 = 122;
        b2 = 106;
      }
      s.rect(cx + xx, yy + bob, 1, 1, `rgb(${r2 | 0},${g2 | 0},${b2 | 0})`);
    }
  }
  // two bands of runes
  for (const bu of [0.42, 0.72]) {
    const yy = topY + (lipY - topY) * bu;
    const u = bu;
    const hw = 7 + 17 * Math.pow(u, 0.7);
    for (let xx = -hw + 4; xx < hw - 4; xx += 6) {
      const k = Math.floor((xx + hw) / 6) % 3;
      s.rect(cx + xx, yy + bob - 2, 1, 4, '#5a3e12');
      if (k === 0) s.rect(cx + xx + 1, yy + bob - 2, 2, 1, '#5a3e12');
      if (k === 1) s.px(cx + xx + 2, yy + bob + 1, '#5a3e12');
      if (k === 2) s.rect(cx + xx - 1, yy + bob + 1, 3, 1, '#5a3e12');
    }
  }
  // the lip of the bell and the clapper that glows
  s.ellipse(cx, lipY + 1 + bob, 34, 6, '#6a4e1c');
  s.ellipse(cx, lipY + bob, 33, 5, '#c89a3a');
  s.ellipse(cx + 2, lipY - 1 + bob, 28, 3, '#f0d070');
  s.ellipse(cx, lipY + 3 + bob, 30, 3.5, '#241608');
  const toll = o.toll ?? 0;
  s.ellipse(cx + Math.sin(t * 5) * 2 * (0.3 + toll), lipY + 7 + bob, 6, 6, '#c9b6ff');
  s.dither(cx, lipY + 7 + bob, 12 + toll * 8, 10 + toll * 6, '#c9b6ff', 0.3 + toll * 0.3);
  // tassels
  for (let i = -4; i <= 4; i++) {
    const tx = cx + i * 7;
    const sw = Math.sin(t * 2.4 + i) * 1.5;
    s.line(tx, lipY + 2 + bob, tx + sw, lipY + 10 + bob + Math.abs(i) * 0.4, '#c9b6ff', 1);
    s.px(tx + sw, lipY + 11 + bob + Math.abs(i) * 0.4, '#ffffff');
  }
  // a crack that opens when she is hurt
  if (crack > 0) {
    const cxk = cx + 11;
    const pts: [number, number][] = [[cxk, lipY], [cxk + 4, lipY - 10], [cxk - 1, lipY - 20], [cxk + 3, lipY - 32], [cxk, lipY - 44]];
    const n = Math.ceil(pts.length * crack);
    for (let i = 1; i < n && i < pts.length; i++) {
      s.line(pts[i - 1]![0], pts[i - 1]![1] + bob, pts[i]![0], pts[i]![1] + bob, '#1a0f05', 2);
      s.line(pts[i - 1]![0] + 1, pts[i - 1]![1] + bob, pts[i]![0] + 1, pts[i]![1] + bob, '#e8d8ff', 1);
    }
  }
  // chain from the eye
  for (let k = 0; k < 3; k++) {
    s.ring(cx, topY - 4 - k * 6 + bob, 3, 4, 1, '#9a9aaa');
    s.px(cx + 3, topY - 4 - k * 6 + bob, '#d8d8e8');
  }
  s.ellipse(cx, topY + 1 + bob, 9, 4, '#a8842a');
  // the great eye
  const ey = EY + bob;
  s.ellipse(cx, ey, 21, 18, '#4a3a88');
  s.ellipse(cx, ey, 19, 16, '#ece8ff');
  s.ellipse(cx + 2, ey - 3, 14, 8, '#f8f6ff');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    s.line(cx + Math.cos(a) * 18, ey + Math.sin(a) * 15, cx + Math.cos(a) * 11, ey + Math.sin(a) * 9, '#e8b8d8', 1);
  }
  const lx = (o.look?.[0] ?? 0) * 4;
  const ly = (o.look?.[1] ?? 0.4) * 3;
  s.ellipse(cx + lx, ey + ly, 9.5, 9.5, '#6a4ad0');
  s.ellipse(cx + lx, ey + ly, 8, 8, '#8a6af0');
  s.ellipse(cx + lx, ey + ly, 5.5, 5.5, '#4a2aa0');
  s.ring(cx + lx, ey + ly, 9, 9, 1, '#e0b84a');
  s.rect(cx + lx - 1, ey + ly - 6, 2.5, 12, '#05060c');
  s.px(cx + lx - 4, ey + ly - 4, '#ffffff');
  s.px(cx + lx - 3, ey + ly - 5, '#ffffff');
  // her lid and lashes of reed
  arc(s, cx, ey, 20, 17, Math.PI * 1.05, Math.PI * 1.95, '#1a1438', 2);
  // a crown of reeds and a plume
  for (let i = -4; i <= 4; i++) {
    const h = 9 + (4 - Math.abs(i)) * 2.5 + Math.sin(t * 2.4 + i) * 1.2;
    const sx = cx + i * 4.4;
    const sy2 = ey - 17 + Math.abs(i) * 0.9;
    s.line(sx, sy2, sx + i * 0.9, sy2 - h, '#2e8a72', 2);
    s.px(sx + i * 0.9, sy2 - h - 1, '#e0b84a');
    s.px(sx + i * 0.9, sy2 - h, '#fff0a0');
  }
  s.rect(cx - 12, ey - 17, 24, 2, '#c89a3a');
  rimPass(s, '#fff4c0', 0.5, 23, '#ffffff');
  p.blit(s.canvas, x - cx, y - lipY - hover);
}

/* ------------------------------------------------------------------ */
/* Bone Wyrm (Bone Wastes)                                             */
/* ------------------------------------------------------------------ */

export interface WyrmOpts {
  /** 0 idle, 1 roaring, 2 diving */
  mode?: 0 | 1 | 2;
  flash?: number;
  /** how many vertebrae are still whole, 0..1 */
  whole?: number;
}

/** A skeletal worm that arches in and out of the ground. (x, y) is the ground under the middle of the creature. */
export function drawBoneWyrm(p: Pix, x: number, y: number, t: number, o: WyrmOpts = {}) {
  const W = 190;
  const H = 150;
  const s = buf('wyrm', W, H);
  const gy = 138;
  const mx = 95;
  const mode = o.mode ?? 0;
  const whole = o.whole ?? 1;
  p.dither(x, y + 2, 76, 8, '#02050a', 0.6);
  const bone = o.flash ? '#ffffff' : '#d8d0b8';
  const boneHi = o.flash ? '#ffffff' : '#f4efe0';
  const boneLo = '#8a8068';
  const hole = (hx: number, hy: number, r: number) => {
    s.ellipse(hx, hy, r + 5, r * 0.4 + 3, '#2a3a40');
    s.ellipse(hx, hy + 1, r + 2, r * 0.4 + 1, '#04080c');
    s.dither(hx, hy, r + 12, r * 0.4 + 6, '#3a4a50', 0.3);
  };
  const segs: { x: number; y: number; r: number; legs: boolean; hidden: boolean }[] = [];
  const quad = (ax: number, ay: number, cx2: number, cy2: number, bx2: number, by2: number, n: number, r0: number, r1: number, legs: boolean) => {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const qx = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * cx2 + u * u * bx2;
      const qy = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * cy2 + u * u * by2;
      segs.push({ x: qx, y: qy, r: lerp(r0, r1, u), legs, hidden: false });
    }
  };
  // tail arch, then the neck and head
  const sway = Math.sin(t * 1.4) * 2;
  quad(24, gy, 46, gy - 84 + sway, 84, gy, 9, 4.5, 8.5, true);
  quad(100, gy, 168, gy - 66, 138, 62 + Math.sin(t * 1.8) * 2, 12, 9, 12.5, false);
  hole(24, gy, 8);
  hole(84, gy, 11);
  hole(100, gy, 11);
  // far legs, vertebrae, near legs
  const skip = segs.length - Math.ceil(segs.length * whole);
  segs.forEach((q, i) => {
    if (i < skip) return;
    if (q.legs && q.y < gy - 8) {
      for (const sg of [-1, 1]) {
        const kx = q.x + sg * (q.r + 5);
        const ky = (q.y + gy) / 2 - 2;
        s.line(q.x + sg * q.r * 0.7, q.y, kx, ky, boneLo, 2);
        s.line(kx, ky, kx + sg * 3, gy, boneLo, 2);
        s.px(kx + sg * 3, gy, boneHi);
      }
    }
  });
  segs.forEach((q, i) => {
    if (i < skip) {
      // a broken vertebra: just splinters on the ground
      if (q.legs) for (let k = 0; k < 3; k++) s.px(q.x + (k - 1) * 3, gy - 1 - (k % 2), boneLo);
      return;
    }
    const spike = 4 + q.r * 0.5;
    s.line(q.x, q.y - q.r, q.x + 1, q.y - q.r - spike, boneLo, 3);
    s.px(q.x + 1, q.y - q.r - spike, boneHi);
    s.ellipse(q.x, q.y, q.r, q.r * 0.92, boneLo);
    s.ellipse(q.x + 0.5, q.y - 0.5, q.r - 1.2, q.r * 0.92 - 1.2, bone);
    s.ellipse(q.x + q.r * 0.3, q.y - q.r * 0.35, q.r * 0.5, q.r * 0.35, boneHi);
    s.px(q.x - q.r * 0.3, q.y + 1, '#2a2418');
  });
  // the skull
  const hxp = segs[segs.length - 1]!.x;
  const hyp = segs[segs.length - 1]!.y;
  const roar = mode === 1 ? 1 : mode === 2 ? 0.2 : 0.45;
  // swept-back horns and a crest of spines down the neck
  for (const k of [-1, 1]) {
    const hn = tendril(s, hxp + 8 + k * 2, hyp - 10, [[8, -5 + k * 4], [16, -4 + k * 8], [22, 2 + k * 10]], 7, boneLo, 0);
    s.px(hn.x, hn.y, boneHi);
  }
  s.ellipse(hxp, hyp, 19, 15, boneLo);
  s.ellipse(hxp + 1, hyp - 1, 17, 13, bone);
  s.ellipse(hxp + 5, hyp - 6, 9, 4, boneHi);
  // the snout and the great jaws
  s.ellipse(hxp - 18, hyp + 6, 17, 8.5, boneLo);
  s.ellipse(hxp - 17, hyp + 5, 15, 7, bone);
  const jawOpen = 8 + roar * 12;
  s.ellipse(hxp - 18, hyp + 10 + jawOpen * 0.5, 15, 3, '#2a0a10');
  s.dither(hxp - 18, hyp + 11 + jawOpen * 0.4, 14, 5, C.red, 0.35 + 0.25 * Math.sin(t * 6));
  // lower jaw
  const jaw = tendril(s, hxp - 4, hyp + 12, [[-10, 6 + jawOpen * 0.5], [-24, 10 + jawOpen * 0.8], [-34, 8 + jawOpen * 0.8]], 7, boneLo, 0);
  s.line(hxp - 4, hyp + 11, hxp - 34, hyp + 7 + jawOpen * 0.8, bone, 3);
  // fangs
  for (let i = 0; i < 6; i++) {
    const fx = hxp - 8 - i * 5.5;
    s.line(fx, hyp + 10, fx - 0.5, hyp + 16 + (i % 2) * 3, boneHi, 2);
    s.px(fx - 0.5, hyp + 17 + (i % 2) * 3, '#ffffff');
  }
  for (let i = 0; i < 5; i++) {
    const fx = hxp - 10 - i * 5.5;
    const fy = hyp + 11 + jawOpen * 0.5 + i * 0.6;
    s.line(fx, fy + jawOpen * 0.2 + 4, fx + 0.5, fy + jawOpen * 0.2 - 3, boneHi, 2);
  }
  void jaw;
  // empty eye sockets that burn
  for (const [ex2, ey2] of [[hxp - 2, hyp - 3], [hxp + 9, hyp - 1]] as [number, number][]) {
    s.ellipse(ex2, ey2, 5.5, 5, '#05080c');
    s.dither(ex2, ey2, 9, 8, C.red, 0.4);
    s.ellipse(ex2, ey2, 2.4, 2.4, mode === 2 ? C.redDark : C.redGlow);
    s.px(ex2 - 1, ey2 - 1, '#ffffff');
  }
  s.rect(hxp - 20, hyp + 1, 3, 3, '#05080c');
  s.rect(hxp - 14, hyp + 2, 3, 3, '#05080c');
  rimPass(s, '#ffffff', 0.45, 29, '#fffbe8');
  p.blit(s.canvas, x - mx, y - gy);
  void clamp;
}

/* ------------------------------------------------------------------ */
/* Mimic Queen (Moth Meadow)                                           */
/* ------------------------------------------------------------------ */

export interface MimicQueenOpts {
  /** 0..1 how wide the maw is open */
  open?: number;
  flash?: number;
}

/** A flower the size of a tree, with a maw full of teeth and a lure that glows like the real thing. */
export function drawMimicQueen(p: Pix, x: number, y: number, t: number, o: MimicQueenOpts = {}) {
  const W = 130;
  const H = 136;
  const s = buf('mimicq', W, H);
  const cx = 65;
  const gy = 128;
  const open = o.open ?? 0.5;
  const sw = Math.sin(t * 1.6) * 1.5;
  p.dither(x, y, 40, 8, '#02050a', 0.7);
  // the thick stalk, with thorns
  for (let yy = gy; yy > 78; yy -= 2) {
    const u = (gy - yy) / (gy - 78);
    const sxp = cx + Math.sin(u * 2.2) * 3 + sw * u;
    s.rect(sxp - 5, yy, 10, 2, '#0c4a3c');
    s.rect(sxp - 1, yy, 5, 2, '#1c8a64');
    s.rect(sxp + 2, yy, 2, 2, '#3ac08a');
    if (Math.floor(yy / 6) % 2 === 0) s.line(sxp - 5, yy, sxp - 9, yy - 3, '#0a2e24', 2);
  }
  // two leaf-arms with toothed edges
  for (const sg of [-1, 1]) {
    const ly = gy - 26;
    let px = cx + sg * 4;
    let py = ly;
    for (let k = 1; k <= 7; k++) {
      const nx = cx + sg * (4 + k * 6.5);
      const ny = ly - Math.sin(k / 7 * 2.2) * 18 + (k > 5 ? 2 : 0);
      s.line(px, py, nx, ny, '#0e5a44', 5 - (k > 4 ? 2 : 0));
      s.line(px, py - 1, nx, ny - 1, '#2aa070', 1);
      if (k % 2 === 0) s.line(nx, ny, nx + sg * 2, ny + 4, '#e8f8f0', 1);
      px = nx;
      py = ny;
    }
  }
  // the petals: a back ring, then the front ring
  const hy = 58 + sw * 0.4;
  const petal = (ang: number, len: number, wid: number, shade: number) => {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang) * 0.82;
    for (let k = 0; k < 11; k++) {
      const d = 10 + k * (len / 11);
      const r2 = wid * (1 - Math.pow(k / 11, 1.6)) + 1.4;
      const col = k < 3 ? '#143c5a' : k < 6 ? (shade ? '#1f5f88' : '#1a4a68') : shade ? '#3a92b8' : '#2d7da0';
      s.ellipse(cx + dx * d, hy + dy * d, r2, r2 * 0.9, col);
      if (k > 4) s.ellipse(cx + dx * d + 1, hy + dy * d - 1, r2 * 0.5, r2 * 0.45, shade ? '#9fe8ff' : '#7fd8f5');
    }
  };
  for (let i = 0; i < 10; i++) petal((i / 10) * TAU + 0.15, 40, 7.5, 0);
  for (let i = 0; i < 8; i++) petal((i / 8) * TAU + 0.4, 34, 7, 1);
  // a crown of tall petals at the top
  for (let i = -3; i <= 3; i++) {
    const hh = 22 - Math.abs(i) * 3 + Math.sin(t * 2 + i) * 1;
    const bxp = cx + i * 7;
    for (let k = 0; k < 9; k++) {
      const u = k / 9;
      s.ellipse(bxp + i * u * 3, hy - 22 - u * hh, 3.6 * (1 - u * 0.7) + 0.8, 3, u < 0.5 ? '#2d7da0' : '#9fe8ff');
    }
    s.px(bxp + i * 3, hy - 23 - hh, '#ffffff');
  }
  // the maw
  const mw = 18 + open * 3;
  const mh = 10 + open * 8;
  s.ellipse(cx, hy + 2, mw + 3, mh + 3, '#7a1a2a');
  s.ellipse(cx, hy + 2, mw, mh, '#2a0610');
  s.ellipse(cx + 2, hy + 4 + open * 2, mw * 0.55, mh * 0.5, '#8a2a3a');
  s.ellipse(cx + 3, hy + 3 + open * 2, mw * 0.3, mh * 0.28, '#c04a5a');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    const tx = cx + Math.cos(a) * mw;
    const ty = hy + 2 + Math.sin(a) * mh;
    const ix = cx + Math.cos(a) * (mw - 5);
    const iy = hy + 2 + Math.sin(a) * (mh - 4);
    s.line(tx, ty, ix, iy, '#f4efe0', 2);
    s.px(ix, iy, '#ffffff');
  }
  // her face above the maw
  for (const sg of [-1, 1]) {
    s.ellipse(cx + sg * 9, hy - 12, 4, 3.4, '#ece8ff');
    s.ellipse(cx + sg * 9 + 0.5, hy - 11.5, 2, 2, '#4a2aa0');
    s.px(cx + sg * 9 - 1, hy - 13, '#ffffff');
  }
  // the lure: it glows just like the real flower
  const lureTipX = cx - 8;
  const lureTipY = hy - 2 + open * 3;
  const stem = tendril(s, cx + 10, hy - 26, [[-6, -8], [-16, -6], [-20, 2], [-18, 12]], 4, '#0e5a44', 0);
  s.line(stem.x, stem.y, lureTipX, lureTipY, '#0e5a44', 2);
  const gl = 1 + 0.2 * Math.sin(t * 5);
  s.dither(lureTipX, lureTipY, 12 * gl, 10 * gl, '#ffd0e0', 0.35);
  s.ellipse(lureTipX, lureTipY, 4, 4, '#ff8aa8');
  s.ellipse(lureTipX - 1, lureTipY - 1, 2, 2, '#ffffff');
  rimPass(s, '#bff0ff', 0.45, 41, '#ffffff');
  p.blit(s.canvas, x - cx, y - gy);
  void o.flash;
}

export { clamp, hash2, rimPass };
