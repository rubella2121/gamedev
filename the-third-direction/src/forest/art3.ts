import type { Pix } from '../core/pix';
import { C } from '../core/palette';
import { clamp, hash2, TAU } from '../core/util';

/** Sprites for the open forest. All drawn in code. Every function takes screen coordinates. */

/** A stone lantern. `lit` is 0..1. */
export function drawLamp(p: Pix, x: number, y: number, t: number, lit: number) {
  p.ellipse(x, y + 1, 6, 2.5, '#05090f');
  p.rect(x - 4, y - 5, 8, 5, '#26343c');
  p.rect(x - 4, y - 5, 8, 1, '#3a4e58');
  p.rect(x - 3, y - 14, 6, 9, lit > 0.05 ? '#f5e6a8' : '#10202a');
  p.rect(x - 3, y - 14, 1, 9, lit > 0.05 ? '#fff4c8' : '#1a3140');
  p.rect(x - 5, y - 17, 10, 3, '#26343c');
  p.rect(x - 2, y - 19, 4, 2, '#3a4e58');
  if (lit > 0.05) {
    const f = 0.8 + 0.2 * Math.sin(t * 9 + x);
    p.dither(x, y - 10, 30 * lit, 20 * lit, C.blobLight, 0.28 * f);
    p.dither(x, y - 10, 18 * lit, 12 * lit, '#fff4c8', 0.3 * f);
    p.px(x - 1, y - 11, '#ffffff');
  } else {
    p.px(x, y - 9, '#2a5a6a');
  }
}

/** A mound of black with cyan eyes: where Gloomlings come from. `hp01` is 1 when healthy. */
export function drawNest(p: Pix, x: number, y: number, t: number, hp01: number, seed: number) {
  p.ellipse(x, y + 1, 13, 5, '#02030a');
  p.ellipse(x, y - 4, 11, 8, '#05070f');
  p.ellipse(x - 3, y - 6, 6, 4, '#0a1018');
  for (let i = 0; i < 5; i++) {
    const a = hash2(seed, i) * TAU;
    const ex = x + Math.cos(a) * 7;
    const ey = y - 5 + Math.sin(a) * 3;
    const blink = Math.sin(t * 2 + i * 1.7 + seed) > 0.85 ? 0 : 1;
    if (blink && hp01 > 0.1) {
      p.px(ex, ey, C.cyanEye);
      p.px(ex + 2, ey, C.cyanEye);
    }
  }
  // spikes
  for (let i = -2; i <= 2; i++) p.line(x + i * 4, y - 4, x + i * 5, y - 9 - Math.abs(i), '#05070f', 2);
}

/** The Gloom Heart: a great dark mass that breathes. */
export function drawGloomHeart(p: Pix, x: number, y: number, t: number, hp01: number, flash: number) {
  const br = 1 + 0.05 * Math.sin(t * 2.6);
  p.ellipse(x, y + 2, 26 * br, 9, '#02030a');
  p.ellipse(x, y - 10, 21 * br, 17 * br, flash > 0 ? '#2a4a5a' : '#05070f');
  p.ellipse(x - 5, y - 15, 11, 8, '#0b1620');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + t * 0.3;
    const ex = x + Math.cos(a) * 14;
    const ey = y - 10 + Math.sin(a) * 10;
    if (Math.sin(t * 1.5 + i * 2.3) > -0.6) {
      p.px(ex, ey, C.cyanEye);
      p.px(ex + 2, ey, C.cyanEye);
    }
  }
  // the glowing core, smaller as it is hurt
  const core = 3 + 5 * hp01;
  p.dither(x, y - 10, core + 6, core + 4, C.cyanEye, 0.35 + 0.15 * Math.sin(t * 5));
  p.ellipse(x, y - 10, core * 0.6, core * 0.5, flash > 0 ? '#ffffff' : C.cyanEye);
  for (let i = -4; i <= 4; i++) p.line(x + i * 5, y - 14, x + i * 7, y - 28 - Math.abs(i) * 1.5, '#05070f', 2);
}

/** A wall of thorns across a narrow passage. `open` 0 (closed) .. 1 (gone). */
export function drawThornGate(p: Pix, x: number, y0: number, y1: number, t: number, open: number, color: string = C.red) {
  if (open >= 0.99) return;
  const n = Math.max(3, Math.round((y1 - y0) / 6));
  for (let i = 0; i < n; i++) {
    const yy = y0 + ((i + 0.5) * (y1 - y0)) / n;
    const h = (1 - open) * (13 + ((i * 7) & 3) * 3);
    const sway = Math.sin(t * 2 + i) * 1.2;
    p.line(x - 3 + sway, yy + 3, x + sway * 1.5, yy - h, '#0a0e18', 3);
    p.line(x + 3 - sway, yy + 3, x + 1 - sway, yy - h * 0.8, '#0a0e18', 2);
    if (h > 3) {
      p.px(x + sway * 1.5, yy - h, color);
      p.px(x + 1 + sway * 1.5, yy - h + 1, C.redDark);
    }
  }
  p.dither(x, (y0 + y1) / 2, 7, (y1 - y0) / 2 + 4, C.redDark, 0.22 * (1 - open));
}

/** A glowing ring of petals on the ground: dormant, then lit. */
export function drawBlossom(p: Pix, x: number, y: number, t: number, lit: number, seed: number, col: string = C.flowerLight) {
  p.ellipse(x, y + 1, 5, 2, '#05090f');
  p.rect(x, y - 7, 1, 7, '#0a2e30');
  const r = 4 + 2 * lit;
  p.ellipse(x, y - 9, r, r * 0.9, lit > 0.05 ? col : '#173845');
  p.ellipse(x, y - 9, r * 0.5, r * 0.45, lit > 0.05 ? '#ffffff' : '#0f2a36');
  if (lit > 0.05) {
    p.dither(x, y - 9, 14 * lit + 6, 9 * lit + 4, col, 0.3 + 0.1 * Math.sin(t * 6 + seed));
  }
}

/** A heart-flower: the reward of a secret. */
export function drawHeartBloom(p: Pix, x: number, y: number, t: number) {
  const b = 1 + 0.1 * Math.sin(t * 4);
  p.dither(x, y - 8, 14 * b, 10 * b, C.red, 0.25);
  p.rect(x - 4, y - 12, 3, 2, C.red);
  p.rect(x + 1, y - 12, 3, 2, C.red);
  p.rect(x - 5, y - 10, 10, 3, C.red);
  p.rect(x - 4, y - 7, 8, 2, C.red);
  p.rect(x - 2, y - 5, 4, 2, C.red);
  p.rect(x - 1, y - 3, 2, 2, C.red);
  p.px(x - 3, y - 11, C.redGlow);
  p.px(x - 4, y - 9, C.redGlow);
}

/** Small health pips above a monster. */
export function drawPips(p: Pix, x: number, y: number, hp: number, max: number) {
  const w = max * 3;
  for (let i = 0; i < max; i++) p.rect(x - w / 2 + i * 3, y, 2, 1, i < hp ? C.redGlow : '#26343c');
}

void clamp;

export type BeetleState = 'idle' | 'wind' | 'charge' | 'stun';

/** A Thornback: an armoured beetle with spikes down its back. (x, y) is its ground contact. */
export function drawThornback(p: Pix, x: number, y: number, t: number, st: BeetleState, face: number, hp: number) {
  const run = st === 'charge' ? 1 : st === 'idle' ? 0.25 : 0;
  p.ellipse(x, y, 9, 3, '#04070d');
  // legs
  for (let i = -1; i <= 1; i++) {
    const ph = Math.sin(t * 24 * run + i * 2);
    p.line(x + i * 3, y - 2, x + i * 3 + ph * 2, y + 1, '#1a2430', 1);
    p.line(x + i * 3 - 1, y - 2, x + i * 3 - 3 + ph, y + 1.5, '#1a2430', 1);
  }
  const lean = st === 'wind' ? -face * 1.2 : 0;
  const tilt = st === 'stun' ? 1.5 * Math.sin(t * 7) : 0;
  p.ellipse(x + lean, y - 5 + tilt * 0.3, 8.2, 5.4, '#0e1a24');
  p.ellipse(x + lean, y - 6 + tilt * 0.3, 7, 4, hp <= 1 ? '#3a2a3a' : '#243a4a');
  p.ellipse(x + lean - 1, y - 7, 3.8, 1.8, '#3a5a6a');
  // spikes
  for (let i = -2; i <= 2; i++) {
    const sx = x + lean + i * 2.8;
    p.line(sx, y - 9, sx + i * 0.5, y - 12 - (2 - Math.abs(i)), '#0a1018', 2);
    p.px(sx + i * 0.5, y - 12 - (2 - Math.abs(i)), '#8fb0c0');
  }
  // head at the front
  const hx = x + face * 8;
  p.ellipse(hx, y - 4, 3.2, 2.8, '#0e1a24');
  const eyeCol = st === 'charge' ? C.redGlow : st === 'wind' ? C.red : st === 'stun' ? '#6a6a7a' : '#a03a48';
  p.px(hx + face * 1, y - 5, eyeCol);
  p.px(hx + face * 1, y - 4, eyeCol);
  if (st === 'stun') {
    for (let i = 0; i < 3; i++) {
      const a = t * 4 + (i / 3) * TAU;
      p.px(x + Math.cos(a) * 7, y - 14 + Math.sin(a) * 2, '#ffe9a0');
    }
  }
  if (st === 'wind') p.dither(x - face * 4, y, 8, 3, '#6a8a8a', 0.35);
  if (st === 'charge') p.dither(x - face * 10, y - 1, 10, 3, '#6a8a8a', 0.4);
}

/** A big root-mouth that guards the Rootmaw Thicket. `st`: closed, rumble, open, snap. */
export function drawRootHeart(p: Pix, x: number, y: number, t: number, st: 'closed' | 'rumble' | 'open' | 'snap', hp01: number, flash: number) {
  p.ellipse(x, y + 1, 26, 8, C.soil);
  p.ellipse(x, y - 1, 21, 6, '#2a2018');
  for (let i = -4; i <= 4; i++) {
    const bx = x + i * 5.5;
    const tip = st === 'closed' ? 6 : 12;
    p.line(bx, y - 2, bx + i * 1.6 + Math.sin(t * 3 + i) * 1.5, y - 2 - tip - (4 - Math.abs(i)), C.root, 3);
  }
  const sh = st === 'rumble' ? Math.round(Math.sin(t * 60) * 1.5) : 0;
  const hy = y - 16;
  if (st === 'closed' || st === 'rumble') {
    p.ellipse(x + sh, hy, 17, 15, '#2a1c14');
    p.ellipse(x + sh, hy, 15, 13, flash > 0 ? '#8a6a58' : C.root);
    p.ellipse(x + sh - 3, hy - 4, 8, 5, C.rootLight);
    p.rect(x + sh - 1, hy - 4, 2, 9, C.rootMouth);
    for (let i = 0; i < 6; i++) p.px(x + sh - 12 + i * 4.8, hy + 2 + (i & 1) * 3, '#2a1c14');
  } else if (st === 'open') {
    p.ellipse(x, hy, 19, 17, C.rootLight);
    p.ellipse(x, hy, 16, 14.5, C.rootMouth);
    const glow = 0.6 + 0.3 * Math.sin(t * 8);
    p.dither(x, hy + 1, 10, 8, C.redGlow, glow * 0.6);
    p.ellipse(x, hy + 2, 4 + 3 * hp01, 3 + 2.5 * hp01, flash > 0 ? '#ffffff' : C.red);
    for (let i = -5; i <= 5; i++) {
      p.rect(x + i * 3 - 0.5, hy - 17 + Math.abs(i) * 0.6, 1.6, 4, C.bone);
      p.rect(x + i * 3 - 0.5, hy + 12 - Math.abs(i) * 0.6, 1.6, 4, C.bone);
    }
  } else {
    p.ellipse(x, hy + 2, 21, 12, C.rootLight);
    p.ellipse(x, hy + 2, 18, 9, C.root);
    for (let i = -7; i <= 7; i++) p.rect(x + i * 2.6, hy + 1 + (i & 1), 1.6, 3, C.bone);
    p.px(x - 6, hy - 3, C.white);
    p.px(x + 7, hy - 2, C.white);
  }
}

/** A heavy stone block with a rune. */
export function drawStone(p: Pix, x: number, y: number, on: boolean) {
  p.ellipse(x, y + 1, 8, 3, '#04070d');
  p.rect(x - 6, y - 11, 12, 11, '#3a4a56');
  p.rect(x - 6, y - 11, 12, 3, '#5a6e7a');
  p.rect(x - 6, y - 2, 12, 2, '#242f38');
  p.rect(x + 4, y - 9, 2, 8, '#2c3842');
  const g = on ? '#ffe9a0' : '#8fb0c0';
  p.rect(x - 1, y - 8, 2, 5, g);
  p.rect(x - 3, y - 6, 6, 1, g);
}

/** A round stone plate in the ground. */
export function drawPlate(p: Pix, x: number, y: number, t: number, on: boolean) {
  p.ellipse(x, y, 9, 4.2, '#1a262e');
  p.ellipse(x, y - 0.5, 7.6, 3.4, on ? '#5a5a3a' : '#2c3c46');
  p.ring(x, y - 0.5, 6, 2.6, 1, on ? '#ffe9a0' : '#4a6a78');
  if (on) p.dither(x, y - 1, 13, 6, '#ffe9a0', 0.3 + 0.1 * Math.sin(t * 6));
  else p.px(x, y - 1, '#8fb0c0');
}

/** A segment of a wall of living roots. `broken` 0..1. */
export function drawRootWall(p: Pix, x: number, y0: number, y1: number, t: number, st: 'idle' | 'rumble' | 'open' | 'snap', broken: number, drawMaw: (x: number, y: number, st: 'idle' | 'rumble' | 'open' | 'snap', seed: number) => void) {
  if (broken >= 0.99) return;
  const n = Math.max(3, Math.round((y1 - y0) / 13));
  p.alpha(1 - broken);
  p.rect(x - 7, y0 - 2, 14, y1 - y0 + 6, '#120c0a');
  for (let i = 0; i < n; i++) {
    const yy = y0 + ((i + 1) * (y1 - y0)) / n + 4;
    drawMaw(x + (i % 2) * 2 - 1, yy, st, i);
  }
  p.alpha(1);
  void t;
}

/** The Bell Tower at the heart of the marsh. `rung` 0..1 is a ringing swing. */
export function drawBellTower(p: Pix, x: number, y: number, t: number, rung: number) {
  p.ellipse(x, y + 1, 14, 5, '#04070d');
  p.rect(x - 7, y - 36, 14, 36, '#2c3a48');
  p.rect(x - 7, y - 36, 4, 36, '#3e5062');
  p.rect(x + 4, y - 34, 3, 34, '#1c2834');
  for (let i = 0; i < 5; i++) p.rect(x - 7, y - 8 - i * 7, 14, 1, '#1c2834');
  p.rect(x - 9, y - 40, 18, 5, '#3e5062');
  p.rect(x - 5, y - 44, 10, 4, '#2c3a48');
  // the arch with the bell
  p.rect(x - 5, y - 31, 10, 14, '#0a1018');
  const sw = Math.sin(t * 6) * 4 * rung + Math.sin(t * 1.2) * 0.5;
  p.line(x, y - 31, x + sw * 0.3, y - 25, '#8a7a4a', 1);
  p.rect(x + sw - 3, y - 25, 6, 5, '#d8b45a');
  p.rect(x + sw - 1, y - 20, 2, 2, '#fff0a0');
  // a watching eye above
  p.ellipse(x, y - 46, 4, 3, '#ece8ff');
  p.ellipse(x, y - 46, 1.8, 1.8, rung > 0.2 ? C.red : '#6a4ad0');
  if (rung > 0.05) p.dither(x, y - 24, 18 * rung + 8, 14 * rung + 6, '#fff0a0', 0.25 * rung);
}

/** A lily on the water. `num` shows how many dots (1..4) tell its place in the song. */
export function drawLily(p: Pix, x: number, y: number, t: number, lit: number, num: number) {
  p.ellipse(x, y + 1, 9, 3.4, '#061a20');
  p.ellipse(x, y, 8, 3, lit > 0.05 ? '#2e7a6a' : '#1a4650');
  p.ellipse(x, y - 1, 6, 2.2, lit > 0.05 ? '#3a9a7a' : '#205a66');
  p.ellipse(x, y - 4, 3 + 2 * lit, 2.6 + 1.6 * lit, lit > 0.05 ? '#f0e8ff' : '#3a5a72');
  if (lit > 0.05) p.dither(x, y - 4, 16 * lit + 6, 10 * lit + 4, '#c9b6ff', 0.32 + 0.1 * Math.sin(t * 6));
  for (let i = 0; i < num; i++) p.px(x - ((num - 1) * 2) / 2 + i * 2, y - 10, lit > 0.05 ? '#ffffff' : '#7a9ab2');
}

/** A barricade of planted bones. `hp01` 1 = whole, lower = cracked; `shake` is a hit tremor. */
export function drawBoneBarricade(p: Pix, x: number, y0: number, y1: number, hp01: number, shake: number) {
  const n = Math.max(4, Math.round((y1 - y0) / 8));
  const sh = Math.round(Math.sin(shake * 60) * 2 * shake);
  p.rect(x - 8 + sh, y0 - 2, 16, y1 - y0 + 6, '#0a1218');
  for (let i = 0; i < n; i++) {
    const yy = y0 + ((i + 1) * (y1 - y0)) / n;
    const lean = ((i * 5) % 3) - 1;
    const h = 14 + ((i * 7) % 5) * 2 - (hp01 < 0.4 && i % 2 ? 7 : 0);
    p.line(x - 4 + sh, yy + 2, x - 4 + lean + sh, yy - h, '#b8ae94', 3);
    p.line(x + 3 + sh, yy + 2, x + 3 - lean + sh, yy - h * 0.8, '#e8e0c8', 3);
    p.px(x - 4 + lean + sh, yy - h, '#f4efe0');
    p.px(x + 3 - lean + sh, yy - h * 0.8, '#f4efe0');
  }
  p.rect(x - 6 + sh, y0 + 4, 12, 2, '#8a8068');
  p.rect(x - 6 + sh, (y0 + y1) / 2, 12, 2, '#8a8068');
}

/** The Bone Nest: a heap of bones with a great skull. */
export function drawBoneNest(p: Pix, x: number, y: number, t: number, hp01: number, flash: number) {
  p.ellipse(x, y + 2, 28, 8, '#04070d');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const bx = x + Math.cos(a) * 17;
    const by = y - 3 + Math.sin(a) * 6;
    p.line(bx, by, bx + Math.cos(a) * 6, by - 8 - (i % 3) * 3, i % 2 ? '#b8ae94' : '#e8e0c8', 3);
  }
  p.ellipse(x, y - 12, 17, 13, flash > 0 ? '#ffffff' : '#d8d0b8');
  p.ellipse(x - 3, y - 16, 8, 5, '#f4efe0');
  p.ellipse(x - 6, y - 12, 4, 4.5, '#0a1218');
  p.ellipse(x + 6, y - 12, 4, 4.5, '#0a1218');
  const g = 0.5 + 0.5 * Math.sin(t * 5);
  p.dither(x - 6, y - 12, 7, 6, C.red, 0.3 + 0.3 * g);
  p.dither(x + 6, y - 12, 7, 6, C.red, 0.3 + 0.3 * g);
  p.px(x - 6, y - 12, C.redGlow);
  p.px(x + 6, y - 12, C.redGlow);
  for (let i = -3; i <= 3; i++) p.rect(x + i * 2.4 - 0.5, y - 3, 1.6, 3 + (i & 1), '#f4efe0');
  p.dither(x, y - 12, 26, 18, '#e8e0c8', 0.1 + 0.1 * hp01);
}

/** The claw-scratch mark that shows where a Skitterbone will land. */
export function drawPounceMark(p: Pix, x: number, y: number, u: number, t: number) {
  const r = 9;
  const blink = u > 0.7 && Math.floor(t * 12) % 2 === 0;
  const col = blink ? C.redGlow : C.red;
  p.ring(x, y, r, r * 0.7, 1, C.redDark);
  p.line(x - 5, y - 4, x + 5, y + 4, col, 1);
  p.line(x + 5, y - 4, x - 5, y + 4, col, 1);
  p.line(x - 6, y - 1, x + 6, y + 1, col, 1);
}

/** The Lightseed on its pedestal. `awake` 0..1. */
export function drawLightSeed(p: Pix, x: number, y: number, t: number, awake: number) {
  p.ellipse(x, y + 1, 12, 4.5, '#04070d');
  p.rect(x - 6, y - 8, 12, 8, '#2c3a48');
  p.rect(x - 6, y - 8, 12, 2, '#4a6272');
  p.rect(x - 4, y - 10, 8, 2, '#3e5062');
  const bob = Math.sin(t * 2.2) * 1.2;
  const r = 4 + 3 * awake;
  p.ellipse(x, y - 17 + bob, r, r, awake > 0.05 ? C.moonCore : '#26404a');
  p.ellipse(x - 1, y - 18 + bob, r * 0.5, r * 0.5, awake > 0.05 ? '#ffffff' : '#3a5a6a');
  if (awake > 0.05) {
    p.dither(x, y - 17 + bob, 24 * awake + 6, 18 * awake + 5, C.moon, 0.3 + 0.1 * Math.sin(t * 5));
    p.dither(x, y - 17 + bob, 14 * awake, 10 * awake, '#ffffff', 0.25);
  }
}
