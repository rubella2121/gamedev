import type { Sfx } from '../core/audio';
import type { ScoreLike } from './trailer';

/** The trailer's music. Null (a silent trailer) when the audio is not available. */
export function makeScore(audio: Sfx): ScoreLike | null {
  void audio;
  return null;
}
