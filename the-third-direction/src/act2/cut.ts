import * as THREE from 'three';
import { smooth, unlerp } from '../core/util';

/**
 * A cutscene: a list of camera keys and a list of beats on one clock.
 *
 * Camera keys glide from one to the next (eased), unless a key says `cut`: then the picture holds on the key before it and jumps at
 * that time, the way an edit does. A key's position and target can be functions, to follow something that moves (a falling blob,
 * a falling cage). A small hand-held drift is added on top, so a still shot still breathes.
 *
 * Beats fire once each, at their time. When the player skips, every beat that has not fired yet fires at once, in order, with
 * `skipping` true (so a beat can leave out its sound or its flash), and the scene ends.
 */

type V = THREE.Vector3 | (() => THREE.Vector3);

export interface CamKey {
  t: number;
  pos: V;
  look: V;
  fov?: number;
  /** a hard cut to this key at its time */
  cut?: boolean;
}

export interface Beat {
  at: number;
  fn: (skipping: boolean) => void;
}

const val = (v: V) => (typeof v === 'function' ? v() : v);

export class Cut {
  t = 0;
  done = false;
  private next = 0;

  constructor(
    readonly len: number,
    private keys: CamKey[],
    private beats: Beat[],
    readonly onEnd: () => void,
    /** called every frame with the scene's time: whatever has to move continuously */
    readonly tick: ((t: number, dt: number) => void) | null = null,
    /** how much the camera drifts by hand (0 = a tripod) */
    private hand = 1,
  ) {
    this.beats.sort((a, b) => a.at - b.at);
    this.keys.sort((a, b) => a.t - b.t);
  }

  /** move the clock on; true while the scene is still playing */
  step(dt: number): boolean {
    if (this.done) return false;
    this.t += dt;
    this.tick?.(this.t, dt);
    while (this.next < this.beats.length && this.beats[this.next]!.at <= this.t) this.beats[this.next++]!.fn(false);
    if (this.t >= this.len) {
      this.done = true;
      return false;
    }
    return true;
  }

  /** the player skipped: everything left happens now, quietly */
  skip() {
    if (this.done) return;
    while (this.next < this.beats.length) this.beats[this.next++]!.fn(true);
    this.t = this.len;
    this.tick?.(this.len, 0);
    this.done = true;
  }

  /** where the camera is at the scene's time */
  camera(out: { pos: THREE.Vector3; look: THREE.Vector3 }): number {
    const ks = this.keys;
    const t = this.t;
    let i = 0;
    while (i < ks.length - 1 && ks[i + 1]!.t <= t) i++;
    const a = ks[i]!;
    const b = ks[i + 1];
    let fov = a.fov ?? 64;
    if (!b || b.cut || t <= a.t) {
      out.pos.copy(val(a.pos));
      out.look.copy(val(a.look));
    } else {
      const u = smooth(unlerp(a.t, b.t, t));
      out.pos.lerpVectors(val(a.pos), val(b.pos), u);
      out.look.lerpVectors(val(a.look), val(b.look), u);
      fov = (a.fov ?? 64) + ((b.fov ?? 64) - (a.fov ?? 64)) * u;
    }
    // a hand on the camera
    const h = this.hand * 0.06;
    out.pos.x += Math.sin(t * 0.9) * h + Math.sin(t * 2.3) * h * 0.4;
    out.pos.y += Math.sin(t * 1.3 + 1) * h * 0.7;
    out.look.x += Math.sin(t * 0.7 + 2) * h * 0.8;
    return fov;
  }
}
