/**
 * The trailer's cue sheet: the ONE place that says when things happen, in seconds from the moment the player taps to begin (T = 0).
 * The visuals (trailer.ts) and the music (score.ts) both read it, so a hit in the music lands on its cut in the picture.
 * Change a time here and both move together. Total length: 48 s.
 */
export const CUE = {
  duration: 48,

  /* ---- 0. black, then a small card ---- */
  cardIn: 0.8,
  cardOut: 2.6,

  /* ---- 1. the clearing: three small lights, curled up in the dark wood. Calm, then a shadow ---- */
  openingStart: 2.2,
  /** Mother: "Don't look up." */
  dontLookUp: 3.4,
  /** the shadow starts to creep over the clearing: the lullaby begins to sag, the heartbeat starts */
  shadowCreep: 6.3,
  /** the hero's name card ("The Blob / the last small light") while the shadow creeps: every monster gets one, so does the one you play */
  heroCard: 6.7,
  /** a riser peaks and the picture jumps to the instant before the foot lands */
  jumpCut: 9.2,
  /** the foot lands: a white flash, then almost silence (a ringing tone) */
  slam: 9.8,
  /** the crater in the dark; red eyes open between the trees */
  eyesOpen: 11.4,

  /* ---- 2. the forest: five places, five quick cuts, one beat each (96 BPM, 1.6 s = 2.56 beats) ---- */
  montageStart: 12.0,
  /** Gloom Hollow, Rootmaw Thicket, Echo Marsh, Bone Wastes, Moth Meadow */
  zoneCuts: [12.0, 13.6, 15.2, 16.8, 18.4],
  /** in the meadow, X's foot comes down at the end of the montage */
  footLands: 19.2,

  /* ---- 3. the guardians: Gloommother, Thornback King, Toll Queen, Bone Wyrm, Mimic Queen. A name slams in on each ---- */
  guardianCuts: [20.0, 21.6, 23.2, 24.8, 26.4],

  /* ---- 4. the Edge: everything drops away. The stars were eyes ---- */
  edgeStart: 28.0,
  /** the stars blink out one by one (a quiet ping each) */
  starPings: [29.0, 29.35, 29.75, 30.05, 30.4, 30.7, 31.0, 31.25],
  /** a long riser under the look up */
  riserStart: 30.0,
  /** you look up: the screen cracks (a flash, the ringing tone, near silence) */
  crack: 31.6,
  /** the world bursts into cubes */
  boom: 33.0,

  /* ---- 5. the third dimension (the real boom plays: the cubes burst at +0.55, you land at +2.2, the claw tip hits at +4.3) ---- */
  /** X is shown whole: a flash and a roar */
  reveal: 38.1,
  /** the title slams onto the screen */
  title: 38.5,
  /** quick cuts to the other two bosses */
  collector: 40.0,
  mash: 42.0,

  /* ---- 6. the end card: don't look up ---- */
  finale: 44.0,
  /** everything fades to black */
  fadeOut: 47.0,
} as const;

export type CueName = keyof typeof CUE;
