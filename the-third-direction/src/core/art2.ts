import { Pix } from './pix';
import { C } from './palette';
import { clamp, hash2 } from './util';

/** A Gloomling: a small crawling shadow with cyan eyes. (x, y) is its ground contact. */
export function drawGloom(p: Pix, x: number, y: number, t: number, seed: number, fade = 1) {
  const b = Math.sin(t * 9 + seed) * 0.8;
  if (fade < 1) p.alpha(fade);
  p.dither(x, y, 7, 2.6, C.ink, 0.65);
  p.dither(x, y - 3, 8, 5, '#2a8aa0', 0.22);
  p.ellipse(x, y - 4 + b, 5.6, 4.4, '#1d4a5c');
  p.ellipse(x, y - 4 + b, 4.7, 3.6, '#010208');
  p.rect(x - 2.6, y - 5.2 + b, 2, 2, C.cyanEye);
  p.rect(x + 0.8, y - 5.2 + b, 2, 2, C.cyanEye);
  p.px(x - 2, y - 5.2 + b, C.white);
  p.px(x + 1.4, y - 5.2 + b, C.white);
  const f = Math.sin(t * 14 + seed) > 0 ? 1 : 0;
  p.px(x - 3 + f, y - 0.5, C.ink);
  p.px(x + 3 - f, y - 0.5, C.ink);
  p.px(x - 1 - f, y - 0.5, C.ink);
  p.px(x + 1 + f, y - 0.5, C.ink);
  if (fade < 1) p.alpha(1);
}

/** A Bellwether: a winged floating eyeball carrying a bell. (x, y) is the ground point below it. */
export function drawBellwether(p: Pix, x: number, y: number, t: number, lookX: number, lookY: number, alert: number, seed: number) {
  const hover = 16 + Math.sin(t * 2.2 + seed) * 1.6;
  const by = y - hover;
  p.dither(x, y, 6.5, 2.6, C.ink, 0.55);
  const flap = Math.sin(t * 22 + seed);
  p.ellipse(x - 8.5, by - 2 + flap * 2, 4.2, 2.2, '#b9b0f0');
  p.ellipse(x + 8.5, by - 2 - flap * 2, 4.2, 2.2, '#b9b0f0');
  p.ellipse(x - 8.5, by - 2.5 + flap * 2, 3, 1.2, '#efeaff');
  p.ellipse(x + 8.5, by - 2.5 - flap * 2, 3, 1.2, '#efeaff');
  p.ellipse(x, by, 7.4, 7.4, '#6a5aa8');
  p.ellipse(x, by, 6.4, 6.4, '#ece8ff');
  const ix = x + lookX * 2.4;
  const iy = by + lookY * 2.4;
  p.ellipse(ix, iy, 3.4, 3.4, alert > 0.2 ? C.red : '#6a4ad0');
  p.ellipse(ix, iy, 1.6, 1.6, C.ink);
  p.px(ix - 1.4, iy - 1.4, C.white);
  const sw = Math.sin(t * 3 + seed) * 1.2 + (alert > 0.2 ? Math.sin(t * 40) * 2.2 : 0);
  p.line(x, by + 6.5, x + sw, by + 9.5, '#8a7a4a', 1);
  p.rect(x + sw - 2.5, by + 9.5, 5, 3, '#d8b45a');
  p.px(x + sw - 1, by + 10.5, '#fff0a0');
  p.px(x + sw + 1, by + 12.5, '#6a5a2a');
}

/** A Skitterbone: a bone-white critter on crooked legs. (x, y) is its ground contact. */
export function drawSkitter(p: Pix, x: number, y: number, t: number, seed: number, state: 'run' | 'tele' | 'air' | 'rest') {
  const squash = state === 'air' ? 1.3 : state === 'tele' ? 0.8 : 1;
  const lift = state === 'air' ? 5 : 0;
  p.dither(x, y, 6, 2.2, C.ink, state === 'air' ? 0.3 : 0.6);
  const run = state === 'run' || state === 'rest' ? 1 : 0.2;
  for (let i = 0; i < 3; i++) {
    for (const sgn of [-1, 1]) {
      const ph = Math.sin(t * 16 * run + i * 2 + (sgn > 0 ? 1.6 : 0) + seed);
      const bx = x + sgn * 2.5;
      const kx = x + sgn * (5.5 + ph * 1.2);
      const ky = y - 6.5 - lift;
      const fx = x + sgn * (5 + (i - 1) * 1.8 + ph * 1.6);
      p.line(bx, y - 3.5 - lift + (i - 1) * 0.6, kx, ky + (i - 1) * 1.2, C.boneShade, 1);
      p.line(kx, ky + (i - 1) * 1.2, fx, y - lift + (i - 1) * 0.5, C.bone, 1);
    }
  }
  p.ellipse(x, y - 4.5 - lift, 5.6 * squash, 2.8 / squash, C.bone);
  p.ellipse(x, y - 5 - lift, 4.4 * squash, 1.6, '#f4efe0');
  p.ellipse(x + 0.5, y - 6.6 - lift, 2.6, 2.2, C.bone);
  p.px(x - 0.5, y - 6.9 - lift, C.ink);
  p.px(x + 1.8, y - 6.9 - lift, C.ink);
  if (state === 'tele' || state === 'air') p.px(x + 0.6, y - 6.9 - lift, C.red);
}

/** A tiny glowing Mournmoth. (x, y) is its centre in the air. */
/** `calm` 1 is a moth resting on your head (slow, small wingbeats); `fast` 1 is a moth trembling for you. */
export function drawMoth(p: Pix, x: number, y: number, t: number, glow = 1, calm = 0, fast = 0) {
  p.dither(x, y, 15, 11, C.moon, Math.min(0.4, 0.14 * glow));
  p.dither(x, y, 9, 7, C.moonCore, Math.min(0.5, 0.2 * glow));
  const f = Math.abs(Math.sin(t * (13 - 9 * calm + 9 * fast)));
  const wy = 1.6 + f * 2.8 * (1 - 0.65 * calm);
  p.ellipse(x - 3.6, y - 1.2, 3.8, wy, '#7fd8f5');
  p.ellipse(x + 3.6, y - 1.2, 3.8, wy, '#7fd8f5');
  p.ellipse(x - 3.6, y - 1.4, 2.8, wy * 0.7, '#e8fffb');
  p.ellipse(x + 3.6, y - 1.4, 2.8, wy * 0.7, '#e8fffb');
  p.rect(x - 0.5, y - 2.5, 1, 5, '#f4efff');
  p.px(x - 1.5, y - 3.5, '#e8fffb');
  p.px(x + 1.5, y - 3.5, '#e8fffb');
}

/** Tall marsh reeds that hide whoever stands in them. */
export function drawReeds(p: Pix, x: number, y: number, seed: number, t: number, n = 7) {
  for (let i = 0; i < n; i++) {
    const h = 11 + hash2(seed, i) * 9;
    const sway = Math.sin(t * 1.4 + seed + i) * 1.4;
    const bx = x + (i - n / 2) * 2.2;
    p.line(bx, y, bx + sway, y - h, i % 3 === 0 ? '#0b3326' : '#08241c', 1);
    p.px(bx + sway, y - h - 1, '#2a8a62');
    if (i % 2 === 0) p.px(bx + sway + 0.5, y - h * 0.6, '#1b6a4a');
  }
}

export type MimicState = 'idle' | 'twitch' | 'snap';

/** A Mimic Bloom: looks like a friendly flower until it opens its mouth. */
export function drawMimic(p: Pix, flower: HTMLCanvasElement, x: number, y: number, st: MimicState, t: number, revealed: boolean) {
  if (st === 'snap') {
    p.ellipse(x, y - 4, 7, 5.5, C.redDark);
    p.ellipse(x, y - 4, 5.6, 4.2, C.rootMouth);
    for (let i = -2; i <= 2; i++) {
      p.rect(x + i * 2.2 - 0.5, y - 8.5, 1.2, 2.4, C.bone);
      p.rect(x + i * 2.2 - 0.5, y - 2.2, 1.2, 2.4, C.bone);
    }
    p.ellipse(x - 5, y - 8, 3, 2, C.flower);
    p.ellipse(x + 5, y - 8, 3, 2, C.flower);
    return;
  }
  const jit = st === 'twitch' ? Math.round(Math.sin(t * 70)) : revealed ? Math.round(Math.sin(t * 22) * 0.6) : 0;
  p.blit(flower, x - 6 + jit, y - 15);
  if (revealed) {
    p.alpha(0.7);
    p.px(x - 6 + jit, y - 9, C.red);
    p.px(x + 6 + jit, y - 9, C.red);
    p.alpha(1);
  }
}

/** The tangle of roots that traps the Mournmoth. `open` is 0 (closed) to 1 (burst). */
export function drawRootCage(p: Pix, x: number, y: number, t: number, open: number) {
  const o = clamp(open, 0, 1);
  p.ellipse(x, y, 13, 5, C.soil);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 9 + o * 14;
    const ex = x + Math.cos(a) * r;
    const ey = y - 9 + Math.sin(a) * r * 0.7 - o * 4;
    const w = Math.sin(t * 2 + i) * 0.8;
    p.line(x + Math.cos(a) * 2, y - 1, ex + w, ey, C.root, 2);
    p.px(ex + w, ey, C.rootLight);
    if (o < 0.4) p.line(ex + w, ey, x + Math.cos(a + 0.9) * 8, y - 12 + Math.sin(a + 0.9) * 5, C.rootLight, 1);
  }
}
