/**
 * What the Mournmoth does for you, as plain logic shared by the 2D forest and the 3D arena.
 *
 *   MothShield  the moth takes the first hit of every fight, then flickers out and comes back after a while
 *   MothMood    how it behaves around you: it lands on your tuft when you stand still, trembles when you are hurt
 *               badly, and dims for a moment when you are hit
 */
import { D } from './difficulty';

/** seconds until a spent shield comes back: it is a free hit, not a free fight */
const RECHARGE = { gentle: 18, normal: 25, nightmare: 40 } as const;

export class MothShield {
  /** a hit would be taken by the moth right now */
  ready = false;
  /** seconds left until a spent shield returns (0 when it is ready or not armed) */
  recharge = 0;
  /** 1 right after the moth takes a hit, falls to 0: the moth glows and jumps to you */
  took = 0;
  /** 1 right after the shield returns, falls to 0 */
  back = 0;

  /** a fight begins (or begins again after a fall): the shield is up */
  arm() {
    this.ready = true;
    this.recharge = 0;
    this.took = 0;
    this.back = 0;
  }

  /** the fight is over, or there is no moth: no shield */
  disarm() {
    this.ready = false;
    this.recharge = 0;
    this.took = 0;
    this.back = 0;
  }

  /** a hit comes in. Returns true when the moth took it. */
  absorb(): boolean {
    if (!this.ready) return false;
    this.ready = false;
    this.recharge = RECHARGE[D.id];
    this.took = 1;
    return true;
  }

  /** true the moment the shield comes back */
  update(dt: number): boolean {
    this.took = Math.max(0, this.took - dt * 1.4);
    this.back = Math.max(0, this.back - dt * 1.2);
    if (!this.ready && this.recharge > 0) {
      this.recharge -= dt;
      if (this.recharge <= 0) {
        this.recharge = 0;
        this.ready = true;
        this.back = 1;
        return true;
      }
    }
    return false;
  }

  /** 0..1: how far a spent shield is from coming back (for the moth's glow) */
  get charge(): number {
    if (this.ready) return 1;
    const total = RECHARGE[D.id];
    return total > 0 ? 1 - this.recharge / total : 0;
  }
}

export class MothMood {
  /** how long you have stood still, in seconds */
  private still = 0;
  /** 0..1, eased: 1 means it has landed on your tuft */
  calm = 0;
  /** 0..1, eased: 1 means you are close to falling and it trembles */
  worry = 0;
  /** seconds left of the dim after a hit */
  private dim = 0;

  hurt() {
    this.dim = 0.9;
  }

  reset() {
    this.still = 0;
    this.calm = this.worry = this.dim = 0;
  }

  update(dt: number, moving: boolean, hearts: number, maxHearts: number) {
    this.still = moving ? 0 : this.still + dt;
    this.dim = Math.max(0, this.dim - dt);
    const k = 1 - Math.exp(-4 * dt);
    const low = maxHearts > 1 && hearts <= 1 && hearts > 0;
    this.calm += ((this.still > 1.6 && !low ? 1 : 0) - this.calm) * k;
    this.worry += ((low ? 1 : 0) - this.worry) * k;
  }

  /** 0..1: how much of its light it shows (it dims when you are hit, and burns bright when you are one hit from a fall) */
  get glow(): number {
    const d = this.dim > 0 ? 0.35 + 0.65 * (1 - this.dim / 0.9) : 1;
    return d * (1 + 0.25 * this.worry);
  }
}
