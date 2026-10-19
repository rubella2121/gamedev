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
}
