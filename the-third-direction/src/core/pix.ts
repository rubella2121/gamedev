import { clamp } from './util';

/** Logical (pixel-art) resolution. Portrait 9:16, scaled up with nearest-neighbour filtering. */
export const W = 216;
export const H = 384;

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** A tiny pixel painter on top of Canvas2D. Everything is snapped to whole pixels. */
export class Pix {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;

  constructor(w = W, h = H) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    // CPU-backed canvas: thousands of tiny fillRects per frame are much cheaper than GPU draw calls.
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(color: string) {
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  alpha(a: number) {
    this.ctx.globalAlpha = clamp(a, 0, 1);
  }

  rect(x: number, y: number, w: number, h: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  px(x: number, y: number, c: string) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  /** Filled ellipse drawn as integer scanlines (crisp pixel edges). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    if (rx < 0.5 || ry < 0.5) return;
    this.ctx.fillStyle = c;
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const x0 = Math.round(cx - hw);
      const x1 = Math.round(cx + hw);
      if (x1 > x0) this.ctx.fillRect(x0, y, x1 - x0, 1);
    }
  }

  /** Ellipse ring of the given thickness. */
  ring(cx: number, cy: number, rx: number, ry: number, th: number, c: string) {
    if (rx < 1 || ry < 1) return;
    this.ctx.fillStyle = c;
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const inner = Math.max(0, (ry - th) / ry);
      const dyi = (y + 0.5 - cy) / Math.max(1, ry - th);
      const hwi = dyi * dyi < 1 ? (rx - th) * Math.sqrt(1 - dyi * dyi) : 0;
      const xo0 = Math.round(cx - hw);
      const xo1 = Math.round(cx + hw);
      if (hwi <= 0 || inner <= 0) {
        this.ctx.fillRect(xo0, y, xo1 - xo0, 1);
      } else {
        const xi0 = Math.round(cx - hwi);
        const xi1 = Math.round(cx + hwi);
        this.ctx.fillRect(xo0, y, xi0 - xo0, 1);
        this.ctx.fillRect(xi1, y, xo1 - xi1, 1);
      }
    }
  }

  /** Ordered-dither fill of an ellipse: `amt` in [0,1] is the coverage. */
  dither(cx: number, cy: number, rx: number, ry: number, c: string, amt: number) {
    if (amt <= 0) return;
    this.ctx.fillStyle = c;
    const thr = clamp(amt, 0, 1) * 16;
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const hw = rx * Math.sqrt(1 - dy * dy);
      const xa = Math.max(0, Math.round(cx - hw));
      const xb = Math.min(this.w - 1, Math.round(cx + hw));
      const row = BAYER4[y & 3]!;
      let runStart = -1;
      for (let x = xa; x <= xb + 1; x++) {
        const on = x <= xb && row[x & 3]! < thr;
        if (on && runStart < 0) runStart = x;
        if (!on && runStart >= 0) {
          this.ctx.fillRect(runStart, y, x - runStart, 1);
          runStart = -1;
        }
      }
    }
  }

  /** Dithered pie slice (a vision cone) from (ox, oy) pointing at angle `ang` (radians, 0 = east, PI/2 = south). */
  cone(ox: number, oy: number, ang: number, half: number, range: number, c: string, amt: number) {
    this.ctx.fillStyle = c;
    const thr = clamp(amt, 0, 1) * 16;
    const x0 = Math.max(0, Math.floor(ox - range));
    const x1 = Math.min(this.w - 1, Math.ceil(ox + range));
    const y0 = Math.max(0, Math.floor(oy - range));
    const y1 = Math.min(this.h - 1, Math.ceil(oy + range));
    for (let y = y0; y <= y1; y++) {
      const row = BAYER4[y & 3]!;
      for (let x = x0; x <= x1; x++) {
        if (row[x & 3]! >= thr) continue;
        const dx = x - ox;
        const dy = (y - oy) * 1.35;
        const d = Math.hypot(dx, dy);
        if (d > range || d < 3) continue;
        let da = Math.atan2(dy, dx) - ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < half) this.ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /** Dithered rectangle. */
  ditherRect(x: number, y: number, w: number, h: number, c: string, amt: number) {
    if (amt <= 0) return;
    this.ctx.fillStyle = c;
    const thr = clamp(amt, 0, 1) * 16;
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      const row = BAYER4[yy & 3]!;
      for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) {
        if (row[xx & 3]! < thr) this.ctx.fillRect(xx, yy, 1, 1);
      }
    }
  }

  /** Bresenham line with square brush of size `th`. */
  line(x0: number, y0: number, x1: number, y1: number, c: string, th = 1) {
    this.ctx.fillStyle = c;
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const off = Math.floor(th / 2);
    for (let i = 0; i < 4000; i++) {
      this.ctx.fillRect(x0 - off, y0 - off, th, th);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  blit(img: CanvasImageSource, x: number, y: number) {
    this.ctx.drawImage(img, Math.round(x), Math.round(y));
  }

  blitFlip(img: HTMLCanvasElement, x: number, y: number) {
    this.ctx.save();
    this.ctx.translate(Math.round(x) + img.width, Math.round(y));
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(img, 0, 0);
    this.ctx.restore();
  }
}

/** Make an offscreen pixel canvas and a painter for it. */
export function makeSprite(w: number, h: number): Pix {
  return new Pix(w, h);
}
