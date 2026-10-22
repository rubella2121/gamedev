/**
 * Every line of story text that is not a monster's own voice, in one place, so the whole story can be read (and fixed) from top to bottom.
 * (The monsters' lines live with the monsters: src/forest/guardians/*.ts and src/act2/bosses/*.ts.)
 *
 * Three voices, so you always know who is talking:
 *   thought  the blob. First person, sentence case, small and plain. It does not talk much.   "Don't stop."
 *   warm     Mother and Father, gold. Sentence case. Always a memory, always short.             "Don't look up."
 *   world    the forest and the dark. Lower case, pale and a little wrong.                      "the trees are not empty."
 * Monsters speak in lower case too but in their own colour and glow, and never say "I" to the blob unless they mean it.
 *
 * The arc: "Don't look up." (Mother, to keep you safe) -> everyone you meet says some version of "stay" ->
 * "Look up." (Mother, at the end) -> "I can look up now." (the blob). Keep every line short: two lines of text at most on a phone.
 */
import type { Tone } from '../ui';

export interface Line {
  text: string;
  ms: number;
  tone: Tone;
  /** show it mid-screen instead of near the top */
  low?: boolean;
}
/** a line that plays `at` seconds into a scene */
export interface Timed extends Line {
  at: number;
}
/** where the line goes: the UI */
export interface Narrator {
  narrate(text: string, ms?: number, tone?: Tone, low?: boolean): void;
}

const thought = (text: string, ms = 2800): Line => ({ text, ms, tone: 'thought' });
const warm = (text: string, ms = 2600): Line => ({ text, ms, tone: 'warm' });
const world = (text: string, ms = 2800): Line => ({ text, ms, tone: 'world' });
const at = (t: number, l: Line): Timed => ({ ...l, at: t });
const low = (l: Timed): Timed => ({ ...l, low: true });

export const say = (ui: Narrator, l: Line) => ui.narrate(l.text, l.ms, l.tone, l.low);

/** Play every line of a scene whose time has come, once each (`fired` remembers which). */
export function playTimed(ui: Narrator, fired: Set<string>, prefix: string, t: number, lines: readonly Timed[]) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const key = `${prefix}${i}`;
    if (t >= l.at && !fired.has(key)) {
      fired.add(key);
      say(ui, l);
    }
  }
}

export const STORY = {
  /**
   * The hero, named the way every monster is: a name and one line under it. The first-time card, the trailer and the store thumbnail use it.
   * "small light" is the game's own word for the family ("three small lights, curled up in the dark wood"), and light is what the blob fights with.
   */
  hero: { name: 'The Blob', sub: 'the last small light' },

  /** What the game is about, in plain words: the first-time card, and the top of How to play. */
  brief: ['Something huge took your family.', 'Five guardians hold the paths of this forest. Beat them all.', 'Then the road opens. Follow the arrow.'] as readonly string[],

  /* ------------------------------ ACT I: the forest ------------------------------ */

  /** The opening, in the order it happens. The forest decides when (see OP in forest.ts). */
  opening: {
    wake: world('three small lights, curled up in the dark wood.', 2400),
    mother: warm("Don't look up.", 2800),
    father: warm("Go. Don't stop.", 2200),
    crater: thought('Mother?', 2000),
    bell: world('a bell, somewhere. the trees are not empty.', 2600),
    move: thought("Don't stop.", 2400),
  },

  /** the crossroads, the first time you reach it */
  crossroads: thought('Five paths. A faint warmth at the end of each.', 3400),

  /** a place name and one line under it, the first time you step into a zone */
  zones: {
    gloom: { name: 'Gloom Hollow', sub: 'they hate the light. stay in it.' },
    thicket: { name: 'Rootmaw Thicket', sub: 'the roots remember being trees.' },
    marsh: { name: 'Echo Marsh', sub: 'every bell here is listening.' },
    bones: { name: 'Bone Wastes', sub: 'something small runs on too many legs.' },
    meadow: { name: 'Moth Meadow', sub: 'it is very quiet. quiet is how it starts.' },
  },

  /** when a zone falls and X's shadow comes down on it */
  falls: {
    gloom: world('the shadows scatter. something above leans closer.', 3000),
    thicket: world('the roots go slack. a shadow slides over them.', 3000),
    marsh: world('the bells stop. the shadow does not.', 2800),
    bones: world('the bones lie still. the shadow gathers them up.', 3000),
    meadow: world('the meadow shines, and the shadow flinches.', 3000),
  },
  /** after the n-th zone has fallen (1 is the first, when X's claw grazes you) */
  hearts: [
    thought('It saw me.', 2200),
    thought('Two hearts. He is leaning closer.', 3000),
    thought('Three. The forest is going quiet.', 3000),
    thought('Four. One more, and the road opens.', 3000),
    thought('That is all of them.', 2600),
  ] as readonly Line[],
  /** the seal on the road to the Edge breaks */
  seal: world('the seal on the road breaks.', 2600),

  /** a hidden warmth: the first, the second, the third, and every one after */
  secrets: [
    thought('A hidden warmth. Some of it stays with me.', 3000),
    thought('Another. Someone hid these for me.', 2800),
    thought('I feel braver.', 2400),
    thought('Warm.', 1800),
  ] as readonly Line[],

  /** the Mournmoth is freed */
  moth: [
    thought('It was trapped, and it still shines.', 2600),
    world('a shadow cannot swallow light.', 2600),
    world('it is a child of the moon, a long way from home.', 3000),
  ] as readonly Line[],

  /** what the moth does for you: the first time its shield is up, and the first time it takes a hit */
  mothShield: {
    armed: thought('The moth is watching over me.', 2600),
    took: thought('It took the hit for me.', 2400),
  },
  /** when you keep falling: the Nightmare warning and restart, and the moth's Second Wind on the other difficulties */
  retry: {
    warn: world('one more fall, and it begins again.', 2800),
    restart: warm('From the start, then. You know it better now.', 3200),
    assist: thought('The moth gives me a little more light.', 2800),
  },
  /** the first time the moth leans toward something hidden */
  mothSense: thought('The moth wants to show me something.', 2800),

  /** Mother's voice, when it gets hard. Keyed by how many times you have fallen. */
  deaths: {
    1: warm("It's all right. Up we get.", 2600),
    5: warm('Breathe. Again.', 2200),
    12: warm('I am right here.', 2400),
  } as Record<number, Line>,

  /**
   * the Edge, in seconds from the moment you reach it. Each line waits for the one before, so these are spaced to fit: the hint to
   * look up shows at 5, you look up by yourself at 10, and the screen cracks at 11.5. Look up early and the rest is cut, which is the point.
   */
  edge: [
    at(0.4, world('the forest ends.', 1600)),
    at(2.3, world('the stars are blinking out, one by one.', 2300)),
    at(4.9, thought('They were never stars.', 1900)),
    at(7.1, warm("Don't look up.", 2200)),
    at(9.6, thought('I want to see.', 1700)),
  ] as readonly Timed[],

  /* ------------------------------ the boom ------------------------------ */

  /** in seconds from the moment the boom begins (the white flash is at 0.55, you land at 2.2, the claw tip hits at 4.3) */
  boom: [
    at(0.9, world('the world comes apart.', 1700)),
    at(3.0, thought('Everything has a back now.', 1500)),
    at(4.8, thought('I swallowed a piece of him.', 1700)),
  ] as readonly Timed[],

  /* ------------------------------ ACT II: the arena ------------------------------ */

  /** a few seconds into the first fight, in milliseconds after the fight begins */
  arena: [
    { after: 3200, line: thought('He is made of everything I met.', 3000) },
    { after: 7600, line: thought('Far below, the forest hangs like a pressed flower.', 3000) },
    { after: 12000, line: thought('Up on the wall, two yellow smudges. I know them.', 3400) },
  ] as readonly { after: number; line: Line }[],

  xDies: world('he does not scream. he goes flat, and then he is gone.', 3200),

  /** between bosses: [after X, after The Collector], in seconds from the end of the fight */
  interlude: [
    [at(0.8, world('the wall is quiet. it should not be.', 3000)), at(3.9, thought('Someone has been keeping all of this.', 2000))],
    [at(0.8, world('the forest remembers who guarded it.', 3000)), at(3.9, thought('They are all here. Stitched together.', 2000))],
  ] as readonly (readonly Timed[])[],

  /* ------------------------------ the ending ------------------------------ */

  /** in seconds from the end of the last fight; the closing line comes at 10.8 */
  ending: [
    low(at(1.2, world('the pinned things flicker. warm.', 2400))),
    low(at(3.7, world('most drift home. two stay.', 2400))),
    low(at(6.0, thought('Two small lights, close enough to touch.', 2300))),
    low(at(8.0, world('the clearing grows back. the crater stays.', 2300))),
    low(at(9.7, warm('Look up.', 1300))),
    low(at(10.8, thought('I can look up now.', 3600))),
    low(at(14.7, world('the moon blinks. the moth is home.', 2300))),
  ] as readonly Timed[],
};
