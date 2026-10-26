/**
 * The cut: every shot of the trailer, in order, timed to the cue sheet (data/cues.json) that the music and the voices are
 * built on, so a cut, a hit in the orchestra and a word land on the same frame.
 *
 * A shot is a clip of real game footage (public/clips/<clip>.mp4, made by scripts/clips.py from the capture), where in the clip
 * it starts, how fast it plays, how it is framed (a slow push or pull: zoom from z0 to z1, kept centred on cx, cy) and how it
 * comes in.
 */
import cues from "./data/cues.json";

/**
 * How a shot comes in. A zoom rushes the last shot into the lens and brings this one out of it; an iris opens this one in a
 * ring of light from a point (`o`); blocks cover the cut with a sweep of glowing squares.
 */
export type In = "cut" | "flash" | "whip" | "glitch" | "dissolve" | "fade" | "zoom" | "iris" | "blocks";

export type Cut = {
  at: number;
  end: number;
  clip: string;
  /** the clip's frame at `at` */
  from: number;
  rate?: number;
  /** framing: zoom at the start and at the end, and the point kept in the middle (0..1) */
  z?: [number, number];
  c?: [number, number];
  /** the forest is pixel art: drawn with hard pixels */
  pixel?: boolean;
  in?: In;
  /** where an iris opens (0..1 of the frame) */
  o?: [number, number];
  /** the name that slams in on this shot */
  name?: { text: string; sub: string; colour: string };
  /** how far it goes dark at its end (the light going out) */
  dark?: number;
};

const C = cues;
const [g1, g2, g3, g4, g5] = C.guardians;
const [r1, r2, r3, r4, r5, r6] = C.rushCuts;
/** how a guardian is framed as it comes up, and in the fight (the promos frame their fights closer) */
export const NEAR: Pick<Cut, "z" | "c"> = { z: [1.18, 1.08], c: [0.5, 0.42] };
const FIGHT: Pick<Cut, "z" | "c"> = { z: [1.28, 1.16], c: [0.5, 0.5] };

/** every monster's name card */
export const NAMES = {
  gloom: { text: "GLOOMMOTHER", sub: "GUARDIAN · I", colour: "#7fe6ff" },
  thicket: { text: "THORNBACK KING", sub: "GUARDIAN · II", colour: "#e8a858" },
  marsh: { text: "TOLL QUEEN", sub: "GUARDIAN · III", colour: "#d9b8ff" },
  bones: { text: "BONE WYRM", sub: "GUARDIAN · IV", colour: "#f4efe0" },
  meadow: { text: "MIMIC QUEEN", sub: "GUARDIAN · V", colour: "#ff8aa8" },
  x: { text: "X, THE HOLLOW", sub: "IT TOOK THEM", colour: "#ff4a5a" },
  collector: { text: "THE COLLECTOR", sub: "IT KEEPS THEM", colour: "#ffcf5a" },
  mash: { text: "THE MASH", sub: "IT IS ALL OF THEM", colour: "#ff8aa8" },
} satisfies Record<string, NonNullable<Cut["name"]>>;
const half = C.bar / 2;

export const CUTS: Cut[] = [
  // ---- the hook: his foot comes down beside you
  { at: C.hookIn, end: C.hookOut, clip: "h-x-slam", from: 0, z: [1.0, 1.1], c: [0.5, 0.56] },

  // ---- the lullaby: the night sky, the stars coming out; the three of them, a slow push in; the shadow; the foot
  { at: C.nightSky, end: C.clearing, clip: "edge", from: 92, rate: 0.6, z: [1.75, 1.55], c: [0.5, 0.22], pixel: true, in: "fade" },
  { at: C.clearing, end: C.jump, clip: "opening", from: 129, z: [1.06, 1.34], c: [0.5, 0.46], pixel: true, in: "dissolve" },
  { at: C.jump, end: C.slam, clip: "opening", from: 380, z: [1.3, 1.22], c: [0.5, 0.46], pixel: true, in: "glitch" },
  { at: C.slam, end: C.eyes, clip: "opening", from: 394, rate: 0.5, z: [1.25, 1.15], c: [0.5, 0.46], pixel: true, in: "flash" },
  { at: C.eyes, end: C.journey, clip: "edge", from: 300, z: [1.35, 1.45], c: [0.5, 0.3], pixel: true, in: "dissolve" },

  // ---- the only light left: one pulse, in slow motion
  { at: C.journey, end: g1, clip: "w-pulse", from: 18, z: [1.75, 1.5], c: [0.5, 0.58], pixel: true, in: "dissolve" },

  // ---- five guardians: each comes up, then the fight; a bar each
  { at: g1, end: g1 + half, clip: "g-gloom", from: 62, ...NEAR, pixel: true, in: "flash", name: NAMES.gloom },
  { at: g1 + half, end: g2, clip: "f-gloom", from: 226, ...FIGHT, pixel: true, in: "whip" },
  { at: g2, end: g2 + half, clip: "g-thicket", from: 150, ...NEAR, pixel: true, in: "flash", name: NAMES.thicket },
  { at: g2 + half, end: g3, clip: "f-thicket", from: 196, ...FIGHT, pixel: true, in: "whip" },
  { at: g3, end: g3 + half, clip: "g-marsh", from: 78, ...NEAR, pixel: true, in: "flash", name: NAMES.marsh },
  { at: g3 + half, end: g4, clip: "f-marsh", from: 84, ...FIGHT, pixel: true, in: "whip" },
  { at: g4, end: g4 + half, clip: "g-bones", from: 70, ...NEAR, pixel: true, in: "flash", name: NAMES.bones },
  { at: g4 + half, end: g5, clip: "f-bones", from: 108, ...FIGHT, pixel: true, in: "whip" },
  { at: g5, end: g5 + half, clip: "g-meadow", from: 44, ...NEAR, pixel: true, in: "flash", name: NAMES.meadow },
  { at: g5 + half, end: C.forestFoot, clip: "f-meadow", from: 270, ...FIGHT, pixel: true, in: "whip" },
  // his foot, in the forest (it lands on the hit)
  { at: C.forestFoot, end: C.edge, clip: "edge", from: 448, z: [1.2, 1.12], c: [0.5, 0.62], pixel: true, in: "glitch" },

  // ---- the Edge: the stars go out one by one (the clip backwards), then they open: eyes. The sky cracks.
  { at: C.edge, end: C.look, clip: "edge-stars", from: 0, z: [1.2, 1.12], c: [0.5, 0.36], pixel: true, in: "glitch" },
  { at: C.look, end: C.crack, clip: "edge", from: 182, z: [1.12, 1.32], c: [0.5, 0.3], pixel: true, in: "dissolve" },
  { at: C.crack, end: C.boom, clip: "edge", from: 828, z: [1.0, 1.08], c: [0.5, 0.45], pixel: true, in: "flash" },
  // ---- the third direction: through the cubes, the fall into the Crater
  { at: C.boom, end: C.reveal, clip: "edge", from: 1080, z: [1.0, 1.06], c: [0.5, 0.5] },

  // ---- X, from behind the small Blob; his eyes; you fight back; his foot, slow; the cage
  { at: C.reveal, end: C.battle[1], clip: "c-x-hero", from: 20, z: [1.0, 1.06], c: [0.5, 0.55], in: "flash", name: NAMES.x },
  { at: C.battle[1], end: C.battle[2], clip: "h-x-gaze", from: 62, z: [1.0, 1.06], c: [0.5, 0.4], in: "whip" },
  { at: C.battle[2], end: C.battle[3], clip: "c-chase", from: 40, z: [1.0, 1.05], c: [0.5, 0.5], in: "glitch" },
  { at: C.battle[3], end: C.cage, clip: "c-x-stomp", from: 166, z: [1.0, 1.05], c: [0.5, 0.5], in: "whip" },
  { at: C.cage, end: C.collector, clip: "c-cage", from: 44, z: [1.2, 1.42], c: [0.55, 0.44], in: "dissolve" },
  // ---- the Collector, the Mash
  { at: C.collector, end: C.collector2, clip: "c-collector", from: 30, z: [1.0, 1.06], c: [0.5, 0.45], in: "flash", name: NAMES.collector },
  { at: C.collector2, end: C.mash, clip: "collector-2", from: 46, z: [1.0, 1.05], c: [0.5, 0.5], in: "whip" },
  { at: C.mash, end: C.mash2, clip: "c-mash", from: 20, z: [1.0, 1.06], c: [0.5, 0.45], in: "flash", name: NAMES.mash },
  { at: C.mash2, end: C.rush, clip: "mash-3", from: 44, z: [1.0, 1.05], c: [0.5, 0.5], in: "glitch" },
  // ---- the rush: faster and faster
  { at: r1, end: r2, clip: "x-gaze", from: 128, in: "glitch" },
  { at: r2, end: r3, clip: "f-thicket", from: 205, ...FIGHT, pixel: true, in: "cut" },
  { at: r3, end: r4, clip: "c-chase", from: 108, in: "glitch" },
  { at: r4, end: r5, clip: "mash-2", from: 96, in: "cut" },
  { at: r5, end: r6, clip: "x-jaws", from: 84, in: "glitch" },
  { at: r6, end: C.fall, clip: "collector-2", from: 138, in: "cut" },
  // ---- X falls
  { at: C.fall, end: C.lock, clip: "h-x-death", from: 60, rate: 1.1, z: [1.0, 1.08], c: [0.5, 0.45], in: "flash" },
  // ---- the last lock breaks
  { at: C.lock, end: C.lock + 0.9, clip: "reunion", from: 66, z: [1.0, 1.1], c: [0.5, 0.45], in: "flash" },

  // ---- together
  { at: C.family, end: C.title, clip: "reunion", from: 135, z: [1.0, 1.08], c: [0.5, 0.5], in: "fade" },

  // ---- after the end: the three of them under the moon, and the light going out
  { at: C.sting, end: C.stingOut, clip: "moonlit", from: 10, rate: 0.7, z: [1.05, 1.15], c: [0.5, 0.5], in: "fade", dark: 0.9 },
];

/** the clips the cut uses (scripts/clips.py makes them) */
export const CLIPS = Array.from(new Set(CUTS.map((c) => c.clip)));
