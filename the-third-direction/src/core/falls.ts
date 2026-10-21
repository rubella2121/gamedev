/**
 * What happens when you keep falling in the same boss fight (a guardian in the forest or a boss in the arena).
 *
 *   Nightmare   four falls in one fight and it starts over from the very beginning. The third fall is a warning.
 *   Normal      three falls in the same phase and the moth gives you a Second Wind for that phase:
 *   Gentle      one more heart, and the windows where a boss can be hurt last 20% longer.
 *
 * `Falls` only counts and decides. The forest and the arena do the rest (hearts, captions, restarting the fight).
 */
import { D, PRESETS } from './difficulty';

export type Verdict = 'none' | 'warn' | 'assist' | 'restart';

/** Nightmare: this many falls in one fight start it over */
export const FALL_LIMIT = 4;
/** Normal and Gentle: this many falls in one phase call the moth */
export const ASSIST_AFTER = 3;
/** how much longer a boss stays stuck while the moth helps */
const ASSIST_WINDOW = 1.2;

export class Falls {
  /** falls in this whole fight */
  fight = 0;
  /** falls in the phase you are in */
  phase = 0;

  /** a fight begins, or starts over: nothing counts and no help is running */
  reset() {
    this.fight = 0;
    this.phase = 0;
    this.help(false);
  }

  /** a phase was beaten: the next one starts clean */
  newPhase() {
    this.phase = 0;
    this.help(false);
  }

  /** the player fell: what should happen now */
  fall(): Verdict {
    this.fight++;
    this.phase++;
    if (D.id === 'nightmare') {
      if (this.fight >= FALL_LIMIT) return 'restart';
      return this.fight === FALL_LIMIT - 1 ? 'warn' : 'none';
    }
    if (this.phase === ASSIST_AFTER) {
      this.help(true);
      return 'assist';
    }
    return 'none';
  }

  /** the moth is helping in this phase */
  get assisted(): boolean {
    return D.id !== 'nightmare' && this.phase >= ASSIST_AFTER;
  }

  /** one more heart while the moth helps */
  get extraHearts(): number {
    return this.assisted ? 1 : 0;
  }

  /** how many falls to show on the counter, or null when this difficulty has no limit */
  get shown(): { n: number; max: number } | null {
    return D.id === 'nightmare' ? { n: Math.min(this.fight, FALL_LIMIT), max: FALL_LIMIT } : null;
  }

  private help(on: boolean) {
    D.window = PRESETS[D.id].window * (on ? ASSIST_WINDOW : 1);
  }
}
