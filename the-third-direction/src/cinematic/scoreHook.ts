import type { Sfx } from '../core/audio';
import { TrailerScore } from './score';
import type { ScoreLike } from './trailer';

/** The trailer's music (score.ts). Null (a silent trailer) when the audio is not available. */
export function makeScore(audio: Sfx): ScoreLike | null {
  const host = audio.host();
  return host ? new TrailerScore(host) : null;
}
