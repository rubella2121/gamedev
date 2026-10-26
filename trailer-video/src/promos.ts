/**
 * The promos: four short vertical cuts of the game for Reels, TikTok and Shorts, each with its own hook in the first second,
 * its own score and sound design (audio/promo.py, ../the-third-direction/tools/trailer/promo-sfx.ts), and the same end card:
 * play it free on RUN, vote for it in the October Jam. Like the trailer, every shot, word and hit is timed to a cue sheet
 * (data/promos.json) that the music is written to, so they land on the same frames.
 *
 * None of them shows the Fourth: it stays a mystery.
 */
import type { Words } from "./components/Say";
import type { Sub } from "./components/Words";
import lines from "./data/lines.json";
import promos from "./data/promos.json";
import voice from "./data/voice.json";
import { NAMES, NEAR, type Cut } from "./edit";
import { CYAN, RED } from "./lib/colours";

export type Promo = {
  id: string;
  length: number;
  cuts: Cut[];
  /** the words on the screen */
  words: Words[];
  /** the Mother's words, as captions */
  subs: Sub[];
  /** the flat world bursting into blocks */
  boom?: number;
  /** "THERE IS A / THIRD DIRECTION": from, to, and how far down the frame */
  card?: [number, number, number];
  /** the boss rush's tally */
  rush?: { at: number[]; end: number; mystery: number };
  /** more hits than the cuts make: flashes, shakes and tears (time, how hard) */
  flashes?: [number, number][];
  shakes?: [number, number][];
  tears?: number[];
  /** warm light spilling over (start, how long) */
  leaks?: [number, number][];
  /** the end card, when it fades, and what it says under the name */
  end: number;
  fade: number;
  tag?: string;
};

type Line = { id: string; caption: string | null; style: string };
const said = (spoken: { id: string; at: number }[], ids: string[]): Sub[] =>
  spoken
    .filter((s) => ids.includes(s.id))
    .map((s) => {
      const l = (lines as Line[]).find((x) => x.id === s.id)!;
      const d = voice.find((v) => v.id === s.id)!;
      return { at: s.at, dur: d.dur, caption: l.caption ?? "", far: l.style === "far" };
    });

const X: Pick<Cut, "z" | "c"> = { z: [1.0, 1.06], c: [0.5, 0.55] };
const FOOT: Pick<Cut, "z" | "c"> = { z: [1.14, 1.04], c: [0.5, 0.55] };

/* ------------------------------------------------------------------------------------------------ 1. it's a 2D game */

const A = promos.clips["2d-to-3d"];
const [a1, a2, a3, a4] = A.battle;
const [ar1, ar2] = A.rush;

const twoD: Promo = {
  id: "2d-to-3d",
  length: A.length,
  cuts: [
    // the three of them, in the pixel forest; the stars go out; the eyes open; the sky cracks
    { at: 0, end: A.stars, clip: "opening", from: 129, z: [1.1, 1.36], c: [0.5, 0.46], pixel: true },
    { at: A.stars, end: A.eyes, clip: "edge-stars", from: A.starFrom, rate: A.starRate, z: [1.22, 1.12], c: [0.5, 0.36], pixel: true, in: "dissolve" },
    { at: A.eyes, end: A.crack, clip: "edge", from: 182, z: [1.15, 1.45], c: [0.5, 0.24], pixel: true, in: "iris", o: [0.5, 0.14] },
    { at: A.crack, end: A.boom, clip: "edge", from: 846, z: [1.0, 1.06], c: [0.5, 0.45], pixel: true, in: "flash" },
    // the third direction: through the light, the Blob lands in a world that is suddenly deep
    { at: A.boom, end: A.reveal, clip: "edge", from: 1092, rate: 1.3, z: [1.0, 1.06], c: [0.5, 0.5] },
    // X, and the fight, a cut on every other beat
    { at: A.reveal, end: a1, clip: "c-x-hero", from: 20, ...X, in: "flash", name: NAMES.x },
    { at: a1, end: a2, clip: "x-foot", from: 73, ...FOOT, in: "whip" },
    { at: a2, end: a3, clip: "c-chase", from: 40, z: [1.0, 1.05], in: "glitch" },
    { at: a3, end: a4, clip: "mash-0", from: 80, z: [1.1, 1.0], c: [0.5, 0.45], in: "zoom" },
    { at: a4, end: ar1, clip: "collector-0", from: 58, z: [1.12, 1.04], c: [0.5, 0.5], in: "blocks" },
    { at: ar1, end: ar2, clip: "x-jaws", from: 120, in: "glitch" },
    { at: ar2, end: A.end, clip: "c-x-stomp", from: 172, in: "cut" },
  ],
  words: [
    { at: 0.1, end: A.stars - 0.06, text: "THIS IS A|2D GAME.", hot: ["2D"], y: 0.2 },
    { at: A.stars + 0.12, end: A.eyes - 0.04, text: "UNTIL THE|STARS GO OUT…", y: 0.6 },
    { at: A.eyes + 0.08, end: A.crack, text: "AND YOU|LOOK UP.", hot: ["LOOK", "UP."], hue: RED, y: 0.4, style: "slam" },
  ],
  subs: [],
  boom: A.boom,
  card: [A.boom + 0.85, A.reveal - 0.25, 0.14],
  leaks: [[A.boom + 0.2, 2.6]],
  end: A.end,
  fade: A.length - 0.75,
  tag: "LOOK UP.",
};

/* ------------------------------------------------------------------------------------------------ 2. the boss rush */

const B = promos.clips["boss-rush"];
const [bx, bc, bm] = B.bosses;
const HALF = promos.bar / 2;
const Q = promos.bar / 4;

/** a guardian: it comes up (with its name), then two blows of the fight, framed close on where they land */
const guardian = (at: number, rise: string, from: number, fight: string, blows: [number, number], frame: Pick<Cut, "z" | "c">, name: Cut["name"]): Cut[] => [
  { at, end: at + HALF, clip: rise, from, ...NEAR, pixel: true, in: "flash", name },
  { at: at + HALF, end: at + HALF + Q, clip: fight, from: blows[0], ...frame, pixel: true, in: "whip" },
  { at: at + HALF + Q, end: at + promos.bar, clip: fight, from: blows[1], ...frame, pixel: true, in: "cut" },
];
const [g1, g2, g3, g4, g5] = B.guardians as [number, number, number, number, number];

const bossRush: Promo = {
  id: "boss-rush",
  length: B.length,
  cuts: [
    // you, tiny, in slow motion; then his foot comes down beside you
    { at: 0, end: B.hookSlow, clip: "h-x-slam", from: 0, rate: 0.25, z: [1.0, 1.04], c: [0.5, 0.56] },
    { at: B.hookSlow, end: g1, clip: "h-x-slam", from: 6, z: [1.04, 1.12], c: [0.5, 0.56] },
    ...guardian(g1, "g-gloom", 62, "f-gloom", [236, 378], { z: [1.5, 1.4], c: [0.5, 0.26] }, NAMES.gloom),
    ...guardian(g2, "g-thicket", 150, "f-thicket", [168, 360], { z: [1.4, 1.3], c: [0.5, 0.4] }, NAMES.thicket),
    ...guardian(g3, "g-marsh", 78, "f-marsh", [236, 420], { z: [1.35, 1.25], c: [0.5, 0.36] }, NAMES.marsh),
    ...guardian(g4, "g-bones", 70, "f-bones", [285, 444], { z: [1.45, 1.35], c: [0.62, 0.6] }, NAMES.bones),
    ...guardian(g5, "g-meadow", 44, "f-meadow", [252, 296], { z: [1.35, 1.25], c: [0.5, 0.42] }, NAMES.meadow),
    // and then it goes 3D
    { at: B.crack, end: B.boom, clip: "edge", from: 852, z: [1.0, 1.06], c: [0.5, 0.45], pixel: true, in: "glitch" },
    { at: B.boom, end: bx, clip: "edge", from: 1092, rate: 1.3, z: [1.0, 1.06], c: [0.5, 0.5] },
    { at: bx, end: bx + HALF, clip: "c-x-hero", from: 20, ...X, in: "flash", name: NAMES.x },
    { at: bx + HALF, end: bc, clip: "x-foot", from: 73, ...FOOT, in: "whip" },
    { at: bc, end: bc + HALF, clip: "c-collector", from: 30, z: [1.0, 1.06], c: [0.5, 0.45], in: "flash", name: NAMES.collector },
    { at: bc + HALF, end: bm, clip: "collector-0", from: 58, z: [1.12, 1.04], c: [0.5, 0.5], in: "whip" },
    { at: bm, end: bm + HALF, clip: "c-mash", from: 20, z: [1.0, 1.06], c: [0.5, 0.45], in: "flash", name: NAMES.mash },
    { at: bm + HALF, end: B.end, clip: "mash-0", from: 80, z: [1.1, 1.0], c: [0.5, 0.45], in: "zoom" },
  ],
  words: [
    { at: 0.06, end: B.hookHit - 0.02, text: "YOU'RE|THIS BIG.", y: 0.46, arrow: true },
    { at: B.hookHit, end: g1 - 0.06, text: "THEY'RE|THIS BIG.", hot: ["THIS", "BIG."], hue: RED, y: 0.2, style: "slam" },
    { at: B.boom + 0.1, end: bx - 0.05, text: "THEN IT|GOES 3D.", hot: ["3D."], hue: CYAN, y: 0.24, style: "slam" },
  ],
  subs: [],
  boom: B.boom,
  rush: { at: [g1, g2, g3, g4, g5, bx, bc, bm], end: B.end, mystery: bm + HALF },
  flashes: [[B.hookHit, 1]],
  shakes: [[B.hookHit, 1.2]],
  leaks: [[B.boom + 0.2, 2.2]],
  end: B.end,
  fade: B.length - 0.75,
  tag: "HOW FAR CAN YOU GET?",
};

/* ------------------------------------------------------------------------------------------------ 3. they took my parents */

const C = promos.clips.family;
const [c1, c2, c3, c4] = C.guardians;
const [cb1, cb2, cb3] = C.battle;

const family: Promo = {
  id: "family",
  length: C.length,
  cuts: [
    // them, in the cage; the three of them at home; the shadow; it takes them
    { at: 0, end: C.home, clip: "c-cage", from: 30, rate: 0.8, z: [1.15, 1.45], c: [0.55, 0.44] },
    { at: C.home, end: C.shadow, clip: "opening", from: 129, z: [1.06, 1.3], c: [0.5, 0.46], pixel: true, in: "dissolve" },
    { at: C.shadow, end: C.slam, clip: "opening", from: 290, z: [1.3, 1.22], c: [0.5, 0.46], pixel: true, in: "glitch" },
    { at: C.slam, end: C.journey, clip: "opening", from: 392, rate: 0.5, z: [1.25, 1.15], c: [0.5, 0.46], pixel: true, in: "flash" },
    // the only light left; the guardians, one on every beat
    { at: C.journey, end: c1, clip: "w-pulse", from: 18, z: [1.75, 1.5], c: [0.5, 0.58], pixel: true, in: "dissolve" },
    { at: c1, end: c2, clip: "g-gloom", from: 62, ...NEAR, pixel: true, in: "flash" },
    { at: c2, end: c3, clip: "g-thicket", from: 150, ...NEAR, pixel: true, in: "flash" },
    { at: c3, end: c4, clip: "g-marsh", from: 78, ...NEAR, pixel: true, in: "flash" },
    { at: c4, end: C.crack, clip: "g-bones", from: 70, ...NEAR, pixel: true, in: "flash" },
    // the sky cracks; the third direction
    { at: C.crack, end: C.boom, clip: "edge", from: 840, z: [1.0, 1.06], c: [0.5, 0.45], pixel: true, in: "glitch" },
    { at: C.boom, end: C.reveal, clip: "edge", from: 1140, rate: 1.2, z: [1.0, 1.06], c: [0.5, 0.5] },
    // X; the fight; X falls; the last lock; together
    { at: cb1, end: cb2, clip: "c-x-hero", from: 20, ...X, in: "flash", name: NAMES.x },
    { at: cb2, end: cb3, clip: "x-foot", from: 73, ...FOOT, in: "whip" },
    { at: cb3, end: C.fall, clip: "c-x-stomp", from: 168, in: "zoom" },
    { at: C.fall, end: C.lock, clip: "h-x-death", from: 60, rate: 1.1, z: [1.0, 1.08], c: [0.5, 0.45], in: "flash" },
    { at: C.lock, end: C.family, clip: "reunion", from: 66, z: [1.0, 1.1], c: [0.5, 0.45], in: "flash" },
    { at: C.family, end: C.end, clip: "reunion", from: 285, z: [1.0, 1.08], c: [0.5, 0.5], in: "fade" },
  ],
  words: [
    { at: 0.15, end: C.home - 0.05, text: "THEY TOOK|MY PARENTS.", hot: ["PARENTS."], y: 0.2 },
    { at: C.home + 0.25, end: C.shadow - 0.04, text: "I'M JUST A|BABY BLOB.", hot: ["BABY", "BLOB."], y: 0.2 },
    { at: C.journey + 0.15, end: c1 - 0.04, text: "BUT I WILL|FIND THEM.", hot: ["FIND", "THEM."], y: 0.2 },
    { at: c1 + 0.05, end: C.crack - 0.04, text: "THROUGH EVERY|MONSTER.", y: 0.2, style: "slam" },
    { at: C.boom + 0.15, end: C.reveal - 0.05, text: "INTO THE|THIRD DIRECTION.", hot: ["THIRD", "DIRECTION."], hue: CYAN, y: 0.2 },
  ],
  subs: said(C.lines, ["m5", "b1"]),
  boom: C.boom,
  shakes: [[C.slam, 1.1], [C.fall, 1.1]],
  leaks: [[C.boom + 0.2, 2.4], [C.family + 0.5, 3.0]],
  end: C.end,
  fade: C.length - 0.75,
  tag: "BRING THEM HOME.",
};

/* ------------------------------------------------------------------------------------------------ 4. don't look up */

const D = promos.clips["dont-look-up"];
const [d1, d2, d3, d4] = D.rush;

const dontLookUp: Promo = {
  id: "dont-look-up",
  length: D.length,
  cuts: [
    // the night sky; the stars going out; they were never stars
    { at: 0, end: D.stars, clip: "edge", from: 92, rate: 0.6, z: [1.75, 1.55], c: [0.5, 0.22], pixel: true },
    { at: D.stars, end: D.eyes, clip: "edge-stars", from: D.starFrom, rate: D.starRate, z: [1.3, 1.2], c: [0.5, 0.3], pixel: true, in: "dissolve" },
    { at: D.eyes, end: D.foot, clip: "edge", from: 182, z: [1.2, 1.6], c: [0.5, 0.2], pixel: true, in: "iris", o: [0.5, 0.14] },
    // his foot; him
    { at: D.foot, end: d1, clip: "h-x-slam", from: 0, z: [1.0, 1.1], c: [0.5, 0.56], in: "glitch" },
    { at: d1, end: d2, clip: "x-gaze", from: 128, in: "glitch" },
    { at: d2, end: d3, clip: "h-x-gaze", from: 62, in: "cut" },
    { at: d3, end: d4, clip: "x-jaws", from: 120, in: "glitch" },
    { at: d4, end: D.black, clip: "x-rake", from: 82, in: "cut" },
    // after the end, for a blink: the eyes
    { at: D.sting, end: D.sting + 0.2, clip: "edge", from: 200, z: [1.6, 1.6], c: [0.5, 0.14], pixel: true, in: "glitch" },
  ],
  words: [
    { at: 0.2, end: D.stars - 0.05, text: "DON'T LOOK UP.", y: 0.5, style: "hush" },
    { at: D.stars + 0.15, end: D.eyes - 0.02, text: "WHEN THE LAST|STAR GOES OUT…", y: 0.6, style: "hush" },
    { at: D.eyes + 0.12, end: D.foot - 0.04, text: "THEY'RE NOT|STARS.", hot: ["STARS."], hue: RED, y: 0.4, style: "slam" },
    { at: D.footLands, end: d2 - 0.04, text: "RUN.", hot: ["RUN."], hue: RED, y: 0.2, size: 230, style: "slam" },
  ],
  subs: [],
  flashes: [[D.footLands, 1], [D.sting, 0.5]],
  shakes: [[D.footLands, 1.2], [D.sting, 0.8]],
  tears: [D.sting + 0.2],
  end: D.end,
  fade: D.fadeOut,
  tag: "DON'T LOOK UP.",
};

export const PROMOS: Promo[] = [twoD, bossRush, family, dontLookUp];
