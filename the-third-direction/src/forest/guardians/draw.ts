import { makeSprite, type Pix } from '../../core/pix';
import { lerp, rng } from '../../core/util';

/** Small sprite buffers, cached by name: every guardian paints itself into one, adds a rim light, then stamps it on the scene. */
const bufs = new Map<string, Pix>();
export function buf(key: string, w: number, h: number): Pix {
  let b = bufs.get(key);
  if (!b || b.w !== w || b.h !== h) {
    b = makeSprite(w, h);
    bufs.set(key, b);
  }
  b.ctx.clearRect(0, 0, w, h);
  b.ctx.globalAlpha = 1;
  return b;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Light from the upper right: a thin bright edge on every pixel whose right or upper neighbour is empty. */
export function rimPass(s: Pix, rim: string, chance: number, seed: number, top?: string) {
  const w = s.w;
  const h = s.h;
  const img = s.ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = rng(seed);
  const [R, G, B] = rgb(rim);
  const [TR, TG, TB] = top ? rgb(top) : [R, G, B];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;
      const rightEmpty = d[i + 4 + 3] === 0;
      const topEmpty = y > 0 && d[((y - 1) * w + x) * 4 + 3] === 0;
      if ((rightEmpty || topEmpty) && r() < chance) {
        const useTop = topEmpty && !rightEmpty;
        d[i] = useTop ? TR : R;
        d[i + 1] = useTop ? TG : G;
        d[i + 2] = useTop ? TB : B;
      }
    }
  }
  s.ctx.putImageData(img, 0, 0);
}

/** A curved stroke made of short segments. */
export function arc(s: Pix, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, col: string, th = 1) {
  const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * 0.6));
  let px = cx + Math.cos(a0) * rx;
  let py = cy + Math.sin(a0) * ry;
  for (let i = 1; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    s.line(px, py, x, y, col, th);
    px = x;
    py = y;
  }
}

/** A tapering tendril along a list of offsets from (x, y). Returns where the tip is. */
export function tendril(s: Pix, x: number, y: number, pts: [number, number][], th0: number, col: string, sway: number) {
  let px = x;
  let py = y;
  pts.forEach((q, i) => {
    const nx = x + q[0] + Math.sin(sway + i * 1.3) * (1 + i * 0.5);
    const ny = y + q[1];
    const th = Math.max(2, Math.round(th0 * (1 - i / (pts.length + 0.5))));
    s.line(px, py, nx, ny, col, th);
    px = nx;
    py = ny;
  });
  return { x: px, y: py };
}

/**
 * A whip: a quadratic curve from (x0, y0) to (x1, y1) that bows sideways by `bow` and wriggles with time, drawn thick at the
 * root and thin at the tip. `reach` (0..1) is how far it has unrolled. Returns the tip.
 */
export function whip(p: Pix, x0: number, y0: number, x1: number, y1: number, o: { bow?: number; wig?: number; t?: number; th?: number; col: string; hi?: string; reach?: number; n?: number; tipCol?: string }) {
  const n = o.n ?? 14;
  const reach = o.reach ?? 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = o.bow ?? 0;
  const wig = o.wig ?? 0;
  const t = o.t ?? 0;
  let px = x0;
  let py = y0;
  let tx = x0;
  let ty = y0;
  for (let i = 1; i <= n; i++) {
    const u = (i / n) * reach;
    const off = bow * 4 * u * (1 - u) + Math.sin(t * 9 + u * 7) * wig * u;
    const x = x0 + dx * u + nx * off;
    const y = y0 + dy * u + ny * off;
    const th = Math.max(1, Math.round((o.th ?? 5) * (1 - u * 0.85)));
    p.line(px, py, x, y, o.col, th);
    if (o.hi && th >= 3) p.line(px + 1, py - 1, x + 1, y - 1, o.hi, 1);
    px = x;
    py = y;
    tx = x;
    ty = y;
  }
  if (o.tipCol) p.px(tx, ty, o.tipCol);
  return { x: tx, y: ty };
}

/** Stamp a sprite that is sinking into the ground: the part below the ground line is cut away. */
export function blitSink(p: Pix, img: HTMLCanvasElement, dx: number, dy: number, groundRow: number, sink: number) {
  const cut = Math.round(sink * groundRow);
  const h = groundRow - cut;
  if (h <= 0) return;
  p.ctx.drawImage(img, 0, 0, img.width, h, Math.round(dx), Math.round(dy + cut), img.width, h);
}
