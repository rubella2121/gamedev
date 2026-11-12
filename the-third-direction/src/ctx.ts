import type { Sfx } from './core/audio';
import type { Input } from './core/input';
import type { UI } from './ui';

/** What the two halves of the game share. */
export interface Ctx {
  audio: Sfx;
  ui: UI;
  input: Input;
  /** deaths in this run, and bonus hearts found in secrets (used in the 3D fight) */
  stats: { deaths: number; bonus: number };
  /** a place a run can be picked up from: 'forest' (a guardian fell, a secret was found) or a 3D fight starting (0..2, 3 = the last) */
  progress?: (at: 'forest' | number) => void;
  /**
   * The player has fallen: on a site with rewarded ads, offer to get up right where they fell. Null when there is nothing to
   * offer (the player comes back at the checkpoint, as always); otherwise resolves true when they watched one to the end.
   */
  revive?: () => Promise<boolean> | null;
}
