import type { Pix } from '../core/pix';
import type { Particle } from '../core/art';
import type { Sfx } from '../core/audio';
import type { Input } from '../core/input';
import type { UI } from '../ui';
import type { World } from './world';

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lookX: number;
  lookY: number;
  squash: number;
  dead: number;
  blink: number;
  hide: boolean;
  speedMul: number;
}

export interface Features {
  teeth: boolean;
  eyes: boolean;
  limbs: boolean;
  cyan: boolean;
}

export interface SlamLike {
  x: number;
  y: number;
  R: number;
  T: number;
  t: number;
  phase: 'tele' | 'hit' | 'after';
  ph: number;
  tree?: boolean;
}

/** What an encounter may use from the Act 1 game. */
export interface Hub {
  p: Pix;
  world: World;
  audio: Sfx;
  ui: UI;
  input: Input;
  time: number;
  player: PlayerState;
  features: Features;
  parts: Particle[];
  slams: SlamLike[];
  moth: { has: boolean; x: number; y: number };
  spawnSlam(x: number, y: number, R: number, T: number, tree?: boolean): void;
  inEllipse(px: number, py: number, s: SlamLike, k: number): boolean;
  drawShadow(sx: number, sy: number, R: number, u: number): void;
  killPlayer(): void;
  shake(v: number): void;
  teaser(): void;
  checkpoint(y: number): void;
}

export type Drawable = { y: number; fn: () => void };

export interface Encounter {
  readonly id: string;
  readonly y0: number;
  readonly y1: number;
  /** Put the encounter back to its first state (new run). */
  reset(): void;
  /** The player died and came back at the last checkpoint. */
  onRespawn(): void;
  /** Mark the encounter as already passed (used by warps and the showcase). */
  complete(): void;
  update(dt: number): void;
  collide?(): void;
  onImpact?(s: SlamLike): void;
  push?(list: Drawable[], cam: number): void;
  ground?(cam: number): void;
  overlay?(cam: number): void;
}
