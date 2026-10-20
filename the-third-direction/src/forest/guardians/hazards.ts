import type { Pix } from '../../core/pix';
import { clamp, TAU } from '../../core/util';
import type { Hub } from '../types';

export type HazardCol = 'red' | 'cyan' | 'gold' | 'violet' | 'bone' | 'pink' | 'green';

/** dark, mid, bright */
export const HCOL: Record<HazardCol, [string, string, string]> = {
  red: ['#5a0a18', '#e02b3a', '#ffb0a8'],
  cyan: ['#0c3a48', '#4fd8e8', '#e0ffff'],
  gold: ['#5a3e12', '#e0b84a', '#fff4b0'],
  violet: ['#2a1a5a', '#a78cff', '#f0eaff'],
  bone: ['#4a4430', '#e8e0c8', '#ffffff'],
  pink: ['#5a1a3a', '#ff7aa0', '#ffe0ea'],
  green: ['#0f3a24', '#4fd88a', '#d8ffe8'],
};

export type HazardKind = 'disc' | 'ring' | 'line';

/**
 * Everything a guardian can put on the floor that hurts: a disc that lands, a ring that spreads, a line that sweeps.
 * Each one first shows a warning (so it can be read), then goes live and hurts once, then fades.
 */
export interface Hazard {
  kind: HazardKind;
  x: number;
  y: number;
  /** disc: radius; ring: where the ring starts */
  r: number;
  /** ring: how thick it is */
  thick: number;
  /** ring: how fast it spreads (px/s) while live; the ring is r + grow * liveTime */
  grow: number;
  /** ring: a gap in it that is safe (centre angle, half width in radians) */
  gap: { a: number; w: number } | null;
  /** line: direction, length and half width */
  ang: number;
  len: number;
  wd: number;
  warn: number;
  live: number;
  fade: number;
  t: number;
  dmg: number;
  col: HazardCol;
  hit: boolean;
  /** when set the hazard follows this point while it is warning (a shadow that chases) */
  follow?: (h: Hazard, dt: number) => void;
  onLive?: (h: Hazard) => void;
  onEnd?: (h: Hazard) => void;
  tag?: string;
  /** draw the warning faintly (for things that should not shout) */
  soft?: boolean;
}

export type HazardInit = Partial<Hazard> & { kind: HazardKind; x: number; y: number };

const FLAT = 0.72;

export class Hazards {
  list: Hazard[] = [];
  private fired = new WeakSet<Hazard>();

  add(h: HazardInit): Hazard {
    const full: Hazard = {
      r: 20,
      thick: 5,
      grow: 0,
      gap: null,
      ang: 0,
      len: 100,
      wd: 6,
      warn: 1,
      live: 0.25,
      fade: 0.35,
      t: 0,
      dmg: 1,
      col: 'red',
      hit: false,
      ...h,
    };
    this.list.push(full);
    return full;
  }

  clear(tag?: string) {
    this.list = tag ? this.list.filter((h) => h.tag !== tag) : [];
  }

  any(tag: string): boolean {
    return this.list.some((h) => h.tag === tag);
  }

  /** Is this hazard hurting right now? */
  isLive(h: Hazard): boolean {
    return h.t >= h.warn && h.t < h.warn + h.live;
  }

  /** Current outer radius of a ring. */
  ringR(h: Hazard): number {
    return h.r + h.grow * Math.max(0, h.t - h.warn);
  }

  update(dt: number, hub: Hub) {
    const pl = hub.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i]!;
      h.t += dt;
      if (h.t < h.warn) h.follow?.(h, dt);
      if (h.t >= h.warn && !this.fired.has(h)) {
        this.fired.add(h);
        h.onLive?.(h);
      }
      if (this.isLive(h) && !h.hit && pl.dead <= 0 && !pl.hide && this.touches(h, pl.x, pl.y)) {
        h.hit = true;
        hub.hurt(h.x, h.y, h.dmg);
      }
      if (h.t >= h.warn + h.live + h.fade) {
        h.onEnd?.(h);
        this.list.splice(i, 1);
      }
    }
  }

  touches(h: Hazard, px: number, py: number): boolean {
    if (h.kind === 'disc') {
      const dx = (px - h.x) / (h.r + 3);
      const dy = (py - h.y) / ((h.r + 3) * FLAT);
      return dx * dx + dy * dy < 1;
    }
    if (h.kind === 'ring') {
      const R = this.ringR(h);
      const dx = px - h.x;
      const dy = (py - h.y) / FLAT;
      const d = Math.hypot(dx, dy);
      if (d > R + 2 || d < R - h.thick - 2) return false;
      if (h.gap) {
        let da = Math.atan2(dy, dx) - h.gap.a;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        if (Math.abs(da) < h.gap.w) return false;
      }
      return true;
    }
    // line: distance from the point to the segment
    const ex = Math.cos(h.ang) * h.len;
    const ey = Math.sin(h.ang) * h.len;
    const vx = px - h.x;
    const vy = py - h.y;
    const l2 = ex * ex + ey * ey || 1;
    const u = clamp((vx * ex + vy * ey) / l2, 0, 1);
    return Math.hypot(vx - ex * u, vy - ey * u) < h.wd + 2;
  }

  draw(p: Pix, camX: number, camY: number, time: number) {
    for (const h of this.list) this.drawOne(p, h, camX, camY, time);
  }

  private drawOne(p: Pix, h: Hazard, camX: number, camY: number, time: number) {
    const [dk, md, br] = HCOL[h.col];
    const sx = h.x - camX;
    const sy = h.y - camY;
    const warning = h.t < h.warn;
    const u = warning ? clamp(h.t / h.warn, 0, 1) : 0;
    const liveU = clamp((h.t - h.warn) / Math.max(0.01, h.live), 0, 1);
    const fadeU = h.t >= h.warn + h.live ? clamp((h.t - h.warn - h.live) / h.fade, 0, 1) : 0;
    const hot = u > 0.8 && Math.floor(time * 12) % 2 === 0;
    if (h.kind === 'disc') {
      const rx = h.r;
      const ry = h.r * FLAT;
      if (sx < -rx - 10 || sx > 226 + rx || sy < -ry - 10 || sy > 394 + ry) return;
      if (warning) {
        p.dither(sx, sy, rx, ry, dk, (h.soft ? 0.2 : 0.35) + 0.4 * u);
        p.dither(sx, sy, rx * 0.7, ry * 0.7, md, 0.1 + 0.3 * u);
        p.ring(sx, sy, rx, ry, u > 0.7 ? 2 : 1, hot ? br : md);
        if (u > 0.5) p.ring(sx, sy, rx * 0.55 * u, ry * 0.55 * u, 1, dk);
      } else if (liveU < 1) {
        p.ellipse(sx, sy, rx, ry, liveU < 0.3 ? br : md);
        p.ellipse(sx, sy, rx * 0.65, ry * 0.65, liveU < 0.3 ? '#ffffff' : dk);
        p.ring(sx, sy, rx * (1 + liveU * 0.3), ry * (1 + liveU * 0.3), 2, br);
      } else {
        p.alpha(1 - fadeU);
        p.dither(sx, sy, rx, ry, dk, 0.6);
        p.ring(sx, sy, rx, ry, 1, dk);
        p.alpha(1);
      }
      return;
    }
    if (h.kind === 'ring') {
      const R = warning ? h.r : this.ringR(h);
      const a = warning ? 0.35 + 0.4 * u : 1 - fadeU;
      if (sx < -R - 10 || sx > 226 + R || sy < -R - 10 || sy > 394 + R) return;
      p.alpha(clamp(a, 0, 1));
      const n = Math.max(24, Math.round(R * 0.9));
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU;
        if (h.gap) {
          let da = ang - h.gap.a;
          while (da > Math.PI) da -= TAU;
          while (da < -Math.PI) da += TAU;
          if (Math.abs(da) < h.gap.w) {
            // the safe gap is marked with little posts
            if (i % 3 === 0) p.px(sx + Math.cos(ang) * R, sy + Math.sin(ang) * R * FLAT, hot || !warning ? br : md);
            continue;
          }
        }
        const x = sx + Math.cos(ang) * R;
        const y = sy + Math.sin(ang) * R * FLAT;
        const th = warning ? 1 : Math.max(1, Math.round(h.thick * (1 - liveU * 0.4)));
        p.rect(x - th / 2, y - th / 2, th, th, warning ? (hot ? br : md) : i % 2 ? br : md);
      }
      p.alpha(1);
      return;
    }
    // line
    const ex = Math.cos(h.ang) * h.len;
    const ey = Math.sin(h.ang) * h.len;
    const x1 = sx + ex;
    const y1 = sy + ey;
    if (warning) {
      const th = Math.max(1, Math.round(h.wd * 2 * (0.3 + 0.7 * u)));
      p.alpha(h.soft ? 0.35 : 0.55);
      p.line(sx, sy, x1, y1, dk, th);
      p.alpha(1);
      p.line(sx, sy, x1, y1, hot ? br : md, 1);
    } else if (liveU < 1) {
      p.line(sx, sy, x1, y1, md, Math.round(h.wd * 2));
      p.line(sx, sy, x1, y1, liveU < 0.4 ? '#ffffff' : br, Math.max(1, Math.round(h.wd)));
    } else {
      p.alpha(1 - fadeU);
      p.line(sx, sy, x1, y1, dk, Math.max(1, Math.round(h.wd)));
      p.alpha(1);
    }
  }
}
