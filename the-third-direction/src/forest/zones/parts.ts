import { clamp, dist } from '../../core/util';
import type { Hub, Rect } from '../types';

/**
 * A set of things that a light pulse can light for a while (lamps, blossoms).
 * It is solved when every one is lit at the same moment.
 */
export class LightPuzzle {
  readonly t: number[];
  solved = false;
  constructor(
    readonly items: { x: number; y: number }[],
    private duration: number,
    private reach = 12,
  ) {
    this.t = items.map(() => 0);
  }

  reset(keepSolved = false) {
    this.t.fill(0);
    if (!keepSolved) this.solved = false;
  }

  /** returns true if anything was lit by this pulse */
  onPulse(x: number, y: number, R: number): boolean {
    let any = false;
    this.items.forEach((it, i) => {
      if (dist(x, y, it.x, it.y) <= R + this.reach) {
        this.t[i] = this.duration;
        any = true;
      }
    });
    return any;
  }

  /** Counts the timers down. Returns true on the frame the puzzle becomes solved. */
  update(dt: number): boolean {
    for (let i = 0; i < this.t.length; i++) this.t[i] = Math.max(0, this.t[i]! - dt);
    if (!this.solved && this.t.every((v) => v > 0)) {
      this.solved = true;
      return true;
    }
    return false;
  }

  /** 0..1: how lit item i is (fades out in the last second) */
  lit(i: number): number {
    return this.solved ? 1 : clamp(this.t[i]! / 1, 0, 1);
  }

  /** is this point inside the glow of a lit item? */
  inLight(x: number, y: number, r: number): boolean {
    for (let i = 0; i < this.items.length; i++) {
      if (this.lit(i) > 0.3 && dist(x, y, this.items[i]!.x, this.items[i]!.y) < r) return true;
    }
    return false;
  }
}

/** A gate that blocks a passage until it opens. */
export class Gate {
  open = 0;
  opening = false;
  constructor(readonly rect: Rect) {}

  update(dt: number) {
    if (this.opening) this.open = Math.min(1, this.open + dt / 1.2);
  }

  solid(): boolean {
    return this.open < 0.85;
  }

  get midY(): number {
    return (this.rect.y0 + this.rect.y1) / 2;
  }

  get x(): number {
    return (this.rect.x0 + this.rect.x1) / 2;
  }

  /** The player is beside this gate. */
  near(hub: Hub, d: number): boolean {
    const pl = hub.player;
    return pl.x > this.rect.x0 - d && pl.x < this.rect.x1 + d && pl.y > this.rect.y0 - 6 && pl.y < this.rect.y1 + 6;
  }
}

export const onScreen = (hub: Hub, x: number, y: number, m = 40) => {
  const sx = x - hub.camX;
  const sy = y - hub.camY;
  return sx > -m && sx < 216 + m && sy > -m && sy < 384 + m + 30;
};
