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
}
