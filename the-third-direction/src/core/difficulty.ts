/** Difficulty presets. `D` is a live object: encounters read it whenever they need a number. */
export type DiffId = 'gentle' | 'normal' | 'nightmare';

export interface Diff {
  id: DiffId;
  label: string;
  blurb: string;
  /** hearts per boss phase */
  hearts: number;
  /** multiplier on every warning time (bigger = more time to react) */
  tele: number;
  /** multiplier on how fast monsters move */
  speed: number;
  /** multiplier on how far and how wide monsters see */
  vision: number;
  /** multiplier on how long X stays stuck after an attack */
  window: number;
  /** only Normal and Nightmare times go on the leaderboard */
  ranked: boolean;
}

export const PRESETS: Record<DiffId, Diff> = {
  gentle: { id: 'gentle', label: 'Gentle', blurb: 'More time, more hearts. For the story.', hearts: 5, tele: 1.4, speed: 0.85, vision: 0.8, window: 1.35, ranked: false },
  normal: { id: 'normal', label: 'Normal', blurb: 'The game as designed.', hearts: 3, tele: 1, speed: 1, vision: 1, window: 1, ranked: true },
  nightmare: { id: 'nightmare', label: 'Nightmare', blurb: 'Fast, watchful, 2 hearts. No mercy.', hearts: 2, tele: 0.78, speed: 1.18, vision: 1.2, window: 0.78, ranked: true },
};

export const D: Diff = { ...PRESETS.normal };

const KEY = 'tt.difficulty';
const BEST = 'tt.best';

export function setDifficulty(id: DiffId) {
  Object.assign(D, PRESETS[id]);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage can be blocked */
  }
}

export function loadDifficulty() {
  let id: DiffId = 'normal';
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'gentle' || v === 'normal' || v === 'nightmare') id = v;
  } catch {
    /* ignore */
  }
  Object.assign(D, PRESETS[id]);
}

/** Best clear time in seconds for a difficulty, or null. */
export function bestTime(id: DiffId): number | null {
  try {
    const v = localStorage.getItem(`${BEST}.${id}`);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/** Remember a clear time; returns true if it is a new best. */
export function recordTime(id: DiffId, seconds: number): boolean {
  const prev = bestTime(id);
  if (prev !== null && prev <= seconds) return false;
  try {
    localStorage.setItem(`${BEST}.${id}`, String(Math.round(seconds)));
  } catch {
    /* ignore */
  }
  return true;
}
