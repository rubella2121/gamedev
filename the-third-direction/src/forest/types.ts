import type { Pix } from '../core/pix';
import type { Particle } from '../core/art';
import type { Sfx } from '../core/audio';
import type { Input } from '../core/input';
import type { UI } from '../ui';
import type { Land, ZoneId } from './land';

export interface Player {
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
  hearts: number;
  maxHearts: number;
  invuln: number;
  pulseCd: number;
  /** seconds since the last time something hurt you (used by healing) */
  calm: number;
}

export interface Features {
  teeth: boolean;
  eyes: boolean;
  limbs: boolean;
  cyan: boolean;
}

/** X's shadow, coming down. */
export interface Slam {
  x: number;
  y: number;
  R: number;
  T: number;
  t: number;
  phase: 'tele' | 'hit' | 'after';
  ph: number;
  tree?: boolean;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A pool of glowing flowers: shadows cannot enter, and it slowly heals. */
export interface Patch {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export type Drawable = { y: number; fn: () => void };

/** What a zone may use from the forest. */
export interface Hub {
  p: Pix;
  land: Land;
  audio: Sfx;
  ui: UI;
  input: Input;
  time: number;
  player: Player;
  features: Features;
  parts: Particle[];
  slams: Slam[];
  patches: Patch[];
  moth: { has: boolean; x: number; y: number };
  camX: number;
  camY: number;
  /** all five zones, so one can see whether another is done */
  zones: Zone[];
  spawnSlam(x: number, y: number, R: number, T: number, tree?: boolean): void;
  inEllipse(px: number, py: number, s: Slam, k: number): boolean;
  drawShadow(sx: number, sy: number, R: number, u: number): void;
  /** damage the player (1 heart by default). (fromX, fromY) decides the knockback. */
  hurt(fromX: number, fromY: number, dmg?: number): void;
  killPlayer(): void;
  shake(v: number): void;
  checkpoint(x: number, y: number): void;
  /** can the player stand here (ground, and no closed gate or block)? */
  canStand(x: number, y: number, r?: number): boolean;
  inPatch(x: number, y: number, k?: number): Patch | null;
  /** ask for the action button to show another label (and stop pulses) this frame */
  requestHold(label: string): void;
  /** a zone's heart was reached: X's shadow comes down on the zone */
  reachHeart(z: Zone): void;
  /** a secret was solved: +1 bonus heart in the fight (up to 3) */
  secret(x: number, y: number): void;
  /** a light pulse was cast */
  pulses: { x: number; y: number; t: number }[];
}

export interface Zone {
  readonly id: ZoneId;
  cleared: boolean;
  reset(): void;
  /** the player died and came back at the last checkpoint */
  onRespawn(): void;
  /** mark the zone as done (warps, showcase) */
  complete(): void;
  update(dt: number): void;
  onPulse?(x: number, y: number, R: number): void;
  onImpact?(s: Slam): void;
  colliders?(): Rect[];
  /** drawn under everything else (shadows, cones, marks) */
  ground?(): void;
  push?(list: Drawable[]): void;
  overlay?(): void;
  /** the zone wants to hear about the player every frame, even when far away */
  always?: boolean;
  /** (debug) the key positions of the zone, to check they are on walkable ground */
  debugPoints?(): { x: number; y: number; name: string }[];
}
