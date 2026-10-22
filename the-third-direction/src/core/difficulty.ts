import { storageGet, storageSet } from '../sdk';

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
  /** multiplier on every boss's health */
  boss: number;
  /** dash charges you carry, and the seconds one takes to come back (see core/dash.ts) */
  dashes: number;
  dashRefill: number;
  /** only Normal and Nightmare times go on the leaderboard */
  ranked: boolean;
}

export const PRESETS: Record<DiffId, Diff> = {
  gentle: { id: 'gentle', label: 'Gentle', blurb: 'More time, more hearts. For the story.', hearts: 5, tele: 1.4, speed: 0.85, vision: 0.8, window: 1.35, boss: 0.7, dashes: 3, dashRefill: 1.6, ranked: false },
  normal: { id: 'normal', label: 'Normal', blurb: 'The game as designed.', hearts: 3, tele: 1, speed: 1, vision: 1, window: 1, boss: 1, dashes: 2, dashRefill: 2.2, ranked: true },
  nightmare: { id: 'nightmare', label: 'Nightmare', blurb: 'Fast, watchful, 2 hearts. No mercy.', hearts: 2, tele: 0.78, speed: 1.18, vision: 1.2, window: 0.78, boss: 1.3, dashes: 2, dashRefill: 2.8, ranked: true },
};

export const D: Diff = { ...PRESETS.normal };

const KEY = 'tt.difficulty';
const BEST = 'tt.best';

export function setDifficulty(id: DiffId) {
  Object.assign(D, PRESETS[id]);
  storageSet(KEY, id);
}

export function loadDifficulty() {
  let id: DiffId = 'normal';
  const v = storageGet(KEY);
  if (v === 'gentle' || v === 'normal' || v === 'nightmare') id = v;
  Object.assign(D, PRESETS[id]);
}

/** Best clear time in seconds for a difficulty, or null. */
export function bestTime(id: DiffId): number | null {
  const v = storageGet(`${BEST}.${id}`);
  return v ? Number(v) : null;
}

/** Remember a clear time; returns true if it is a new best. */
export function recordTime(id: DiffId, seconds: number): boolean {
  const prev = bestTime(id);
  if (prev !== null && prev <= seconds) return false;
  storageSet(`${BEST}.${id}`, String(Math.round(seconds)));
  return true;
}

/** A boss's health in pips for the current difficulty. */
export function bossHp(base: number): number {
  return Math.max(2, Math.round(base * D.boss));
}
