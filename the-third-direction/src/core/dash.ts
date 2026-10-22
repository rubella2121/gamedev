import { D } from './difficulty';

/**
 * Dash charges. A dash is free of danger while it lasts, so it cannot be free to repeat: you carry a few charges (`D.dashes`), each
 * dash spends one, and one comes back every `D.dashRefill` seconds. Mashing the button spends them all at once and then does nothing;
 * a dash you saved is there when it matters.
 */
export class DashPool {
  charges = D.dashes;
  /** seconds towards the next charge */
  private t = 0;

  get max() {
    return D.dashes;
  }

  /** a full set (a new fight, a respawn; the difficulty may have changed since the last one) */
  reset() {
    this.charges = D.dashes;
    this.t = 0;
  }

  can() {
    return this.charges >= 1;
  }

  use() {
    // spending from a full set starts the clock from nothing
    if (this.charges >= this.max) this.t = 0;
    this.charges = Math.max(0, this.charges - 1);
  }

  update(dt: number) {
    if (this.charges > this.max) this.charges = this.max;
    if (this.charges >= this.max) {
      this.t = 0;
      return;
    }
    this.t += dt;
    if (this.t >= D.dashRefill) {
      this.t -= D.dashRefill;
      this.charges++;
      if (this.charges >= this.max) this.t = 0;
    }
  }

  /** how far the next charge is, 0..1 (1 when the set is full) */
  get frac() {
    return this.charges >= this.max ? 1 : this.t / D.dashRefill;
  }
}
