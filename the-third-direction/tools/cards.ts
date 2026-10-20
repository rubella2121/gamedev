import { Pix, W, H } from '../src/core/pix';

/** Shared layout for the boss cards: a phone-sized scene, two close-ups, and "how you fight it". */

/** A close-up on a dark stage with a soft coloured glow, in a small pixel canvas. */
export function portrait(accent: string, draw: (p: Pix) => void, w = 180, h = 124, floorY = h - 10): HTMLCanvasElement {
  const p = new Pix(w, h);
  p.clear('#060b12');
  // banded glow, not noise
  for (let i = 0; i < 6; i++) {
    p.alpha(0.055);
    p.ellipse(w / 2, h * 0.52, w * (0.5 - i * 0.065), h * (0.62 - i * 0.07), accent);
  }
  p.alpha(1);
  // a flat floor with a lit edge
  p.alpha(0.7);
  p.ellipse(w / 2, floorY + 3, w * 0.46, 7, '#02050a');
  p.alpha(0.16);
  p.ring(w / 2, floorY + 3, w * 0.46, 7, 1, accent);
  p.alpha(1);
  draw(p);
  return p.canvas;
}

export interface Shot {
  canvas: HTMLCanvasElement;
  label: string;
  /** integer zoom (by default chosen to fill the card) */
  k?: number;
}

export interface Card {
  name: string;
  zone: string;
  accent: string;
  tagline: string;
  /** [heading, text] pairs, shown under the close-ups */
  lines: [string, string][];
  scene: HTMLCanvasElement;
  shots: Shot[];
  /** brighten the scene a little (the 2D forest is very dark); off for 3D renders */
  lift?: boolean;
  /** which packages it belongs to, for the overview sheet */
  tag?: string;
  /** the image used on the overview sheet (defaults to the first close-up) */
  hero?: { canvas: HTMLCanvasElement; crop?: [number, number, number, number] };
}

interface HeroEntry {
  name: string;
  zone: string;
  accent: string;
  tag: string;
  canvas: HTMLCanvasElement;
  crop?: [number, number, number, number];
}
const heroes = new Map<string, HeroEntry>();
export const hasHero = (name: string) => heroes.has(name);

export const CARD_W = 1600;
export const CARD_H = 768;
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";

function ls(x: CanvasRenderingContext2D, v: string) {
  (x as unknown as { letterSpacing: string }).letterSpacing = v;
}

function wrap(x: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (x.measureText(trial).width > width && cur) {
      out.push(cur);
      cur = w;
    } else cur = trial;
  }
  if (cur) out.push(cur);
  return out;
}

function frameCard(accent: string): { cv: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = CARD_W;
  cv.height = CARD_H;
  const x = cv.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#05060c';
  x.fillRect(0, 0, CARD_W, CARD_H);
  const g = x.createRadialGradient(1050, 320, 40, 1050, 320, 760);
  g.addColorStop(0, accent + '30');
  g.addColorStop(1, '#05060c00');
  x.fillStyle = g;
  x.fillRect(432, 0, CARD_W - 432, CARD_H);
  return { cv, x };
}

function header(x: CanvasRenderingContext2D, name: string, zone: string, tagline: string, accent: string) {
  x.textBaseline = 'alphabetic';
  x.font = `800 48px ${MONO}`;
  ls(x, '6px');
  x.shadowColor = accent;
  x.shadowBlur = 20;
  x.fillStyle = '#f4fffd';
  x.fillText(name.toUpperCase(), 468, 72);
  x.shadowBlur = 0;
  ls(x, '3px');
  x.font = `600 17px ${MONO}`;
  x.fillStyle = accent;
  x.fillText(zone.toUpperCase(), 470, 104);
  ls(x, '1px');
  let px = 20;
  x.font = `italic ${px}px ${MONO}`;
  while (x.measureText(tagline).width > CARD_W - 470 - 30 && px > 12) {
    px -= 1;
    x.font = `italic ${px}px ${MONO}`;
  }
  x.fillStyle = '#c8e8e4';
  x.fillText(tagline, 470, 134);
}

function shotsRow(x: CanvasRenderingContext2D, shots: Shot[], top: number, linesH: number): number {
  const left = 468;
  const gap = 22;
  const totalW = shots.reduce((a, s) => a + s.canvas.width, 0);
  const maxH = Math.max(...shots.map((s) => s.canvas.height));
  const availW = CARD_W - left - 30 - gap * (shots.length - 1);
  const availH = CARD_H - top - 22 - 34 - linesH - 16;
  const auto = Math.max(2, Math.min(Math.floor(availW / totalW), Math.floor(availH / maxH), 4));
  let px = left;
  let bottom = top;
  shots.forEach((s) => {
    const k = s.k ?? auto;
    const w = s.canvas.width * k;
    const h = s.canvas.height * k;
    x.drawImage(s.canvas, 0, 0, s.canvas.width, s.canvas.height, px, top, w, h);
    x.strokeStyle = '#ffffff26';
    x.lineWidth = 1;
    x.strokeRect(px + 0.5, top + 0.5, w, h);
    ls(x, '2px');
    x.font = `600 14px ${MONO}`;
    x.fillStyle = '#9fb8b4';
    x.fillText(s.label.toUpperCase(), px + 4, top + h + 22);
    px += w + gap;
    bottom = Math.max(bottom, top + h + 22);
  });
  return bottom;
}

function fightLines(x: CanvasRenderingContext2D, lines: [string, string][], top: number, accent: string) {
  ls(x, '0px');
  x.font = `600 15px ${MONO}`;
  let y = top;
  const left = 470;
  const maxW = CARD_W - left - 40;
  for (const [head, text] of lines) {
    ls(x, '1px');
    x.font = `700 16px ${MONO}`;
    x.fillStyle = accent;
    x.fillText(head.toUpperCase(), left, y);
    const hw = x.measureText(head.toUpperCase()).width + 16;
    ls(x, '0px');
    x.font = `16px ${MONO}`;
    x.fillStyle = '#dff6f2';
    const rows = wrap(x, text, maxW - hw);
    rows.forEach((r, i) => x.fillText(r, left + hw, y + i * 22));
    y += Math.max(1, rows.length) * 22 + 6;
  }
}

export function card(c: Card): string {
  const first = c.shots[0]!.canvas;
  heroes.set(c.name, { name: c.name, zone: c.zone, accent: c.accent, tag: c.tag ?? '', canvas: (c.hero ?? { canvas: first }).canvas, crop: c.hero?.crop });
  const { cv, x } = frameCard(c.accent);
  // the phone-sized scene, lifted a little so the night is readable
  x.save();
  if (c.lift !== false) x.filter = 'brightness(1.28) contrast(1.04) saturate(1.1)';
  x.drawImage(c.scene, 0, 0, c.scene.width, c.scene.height, 0, 0, 432, 768);
  x.restore();
  x.fillStyle = '#05060c';
  x.fillRect(432, 0, 4, CARD_H);
  x.strokeStyle = c.accent + '88';
  x.lineWidth = 2;
  x.strokeRect(1, 1, 430, CARD_H - 2);
  header(x, c.name, c.zone, c.tagline, c.accent);
  const bottom = shotsRow(x, c.shots, 154, c.lines.length * 28 + 4);
  fightLines(x, c.lines, bottom + 34, c.accent);
  return cv.toDataURL('image/png');
}


/** One image with every boss on it, for choosing between them. */
export function sheet(order: string[], footer: string[]): string {
  const TW = 540;
  const TH = 400;
  const LBL = 66;
  const gap = 22;
  const cols = 3;
  const rows = Math.ceil(order.length / cols);
  const head = 150;
  const foot = 40 + footer.length * 26;
  const w = cols * TW + (cols + 1) * gap;
  const h = head + rows * (TH + LBL + gap) + foot;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const x = cv.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#05060c';
  x.fillRect(0, 0, w, h);
  x.textBaseline = 'alphabetic';
  ls(x, '7px');
  x.font = `800 46px ${MONO}`;
  x.shadowColor = '#6ff0ff';
  x.shadowBlur = 18;
  x.fillStyle = '#f4fffd';
  x.fillText('THE THIRD DIRECTION · BOSS CONCEPTS', gap + 6, 70);
  x.shadowBlur = 0;
  ls(x, '1px');
  x.font = `italic 19px ${MONO}`;
  x.fillStyle = '#c8e8e4';
  x.fillText("In-engine pixel-art concept renders, drawn in code by the game's own painter. They are not AI images.", gap + 8, 108);
  x.font = `15px ${MONO}`;
  x.fillStyle = '#7f9a96';
  x.fillText('Five zone guardians (2D forest), X the Hollow (the boss already in the game) and three candidates for the final boss (3D).', gap + 8, 134);
  order.forEach((name, i) => {
    const e = heroes.get(name);
    if (!e) return;
    const cx = gap + (i % cols) * (TW + gap);
    const cy = head + Math.floor(i / cols) * (TH + LBL + gap);
    x.fillStyle = '#080b14';
    x.fillRect(cx, cy, TW, TH);
    const img = e.canvas;
    const [sx, sy, sw, sh] = e.crop ?? [0, 0, img.width, img.height];
    const sc = Math.min(TW / sw, TH / sh);
    const dw = sw * sc;
    const dh = sh * sc;
    x.drawImage(img, sx, sy, sw, sh, cx + (TW - dw) / 2, cy + (TH - dh) / 2, dw, dh);
    x.strokeStyle = e.accent + '66';
    x.lineWidth = 2;
    x.strokeRect(cx + 1, cy + 1, TW - 2, TH - 2);
    ls(x, '3px');
    x.font = `800 24px ${MONO}`;
    x.fillStyle = e.accent;
    x.fillText(e.name.toUpperCase(), cx + 2, cy + TH + 30);
    ls(x, '1px');
    x.font = `15px ${MONO}`;
    x.fillStyle = '#9fb8b4';
    x.fillText(e.zone, cx + 4, cy + TH + 52);
    if (e.tag) {
      x.font = `700 14px ${MONO}`;
      ls(x, '2px');
      const tw = x.measureText(e.tag).width;
      x.fillStyle = e.accent + '30';
      x.fillRect(cx + TW - tw - 22, cy + TH + 10, tw + 18, 26);
      x.fillStyle = '#f4fffd';
      x.fillText(e.tag, cx + TW - tw - 13, cy + TH + 28);
    }
  });
  ls(x, '0px');
  x.font = `16px ${MONO}`;
  footer.forEach((l, i) => {
    x.fillStyle = i === 0 ? '#f4fffd' : '#9fb8b4';
    x.fillText(l, gap + 8, h - foot + 40 + i * 26);
  });
  return cv.toDataURL('image/png');
}
