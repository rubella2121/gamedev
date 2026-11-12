import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { POSTER, useFonts } from "../lib/fonts";
import SONG from "../data/edit-skins.json";
import { backOut, clamp, easeOut, H, lerp, rand, W } from "../lib/time";

/**
 * THE SKINS EDIT: the skins update cut to a song (public/audio/edit-skins.wav: the owner's choice of track, 0-43.2 s of it).
 * Every cut is on the song: three flashes on its pickup and X's foot on its first hit; "the smallest guy in the game"; "but
 * his drip?" and a drip check through the build (close-ups and try-on cards, then a roulette a beat at a time, black, "NOW
 * WATCH."); the first drop a cut on every kick (the skins fighting X, the Collector and the Mash, close up, and in the 2D
 * forest), speed ramps, impact frames, punches; the gap a freeze on Golden ("the 5th one... only on NIGHTMARE"); the second
 * drop harder (GOLDEN, pixel to 3D swaps, the carousel, 5 SKINS / 2D + 3D / FREE); the last hit the logo and where to play.
 *
 * The footage is the real game with the Blob in its skins (../the-third-direction/tools/trailer/shots-skins.mjs, captured
 * frame by frame into public/edit/<shot>/), plus the skins' own pictures (public/skins/) and four boss clips (public/clips/).
 */

export const EDIT_LENGTH = 43.2;
const FPS = 30;
const SANS = "Inter";
const B = 0.3715; // a beat (161.5 a minute)
const K = 2 * B; // a kick (the drops hit every other beat)
/** the song's own beats (found in it, src/data/edit-skins.json): every cut lands on the nearest one, so nothing drifts */
const snap = (t: number) => SONG.beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), SONG.beats[0]!);
const HIT = SONG.hits;

type Skin = "explorer" | "knight" | "wizard" | "inferno" | "golden";
const COLOUR: Record<Skin, string> = { explorer: "#f2b06a", knight: "#d8e4f4", wizard: "#b8a0ff", inferno: "#ff7a2a", golden: "#ffd24a" };
const GLOW: Record<Skin, string> = { explorer: "242,176,106", knight: "190,214,255", wizard: "170,140,255", inferno: "255,110,30", golden: "255,200,80" };
const BG: Record<Skin, [string, string]> = {
  explorer: ["#3a1a0c", "#0c0604"],
  knight: ["#16243c", "#04060a"],
  wizard: ["#2a1450", "#05030c"],
  inferno: ["#4a0c06", "#050102"],
  golden: ["#4a3406", "#060402"],
};

/** the captured shots: their frame counts, and which are the forest's pixel art (540 x 960) */
const SHOT: Record<string, { n: number; px?: boolean }> = {
  "k-face-explorer": { n: 75 },
  "k-face-knight": { n: 75 },
  "k-face-wizard": { n: 75 },
  "k-face-inferno": { n: 75 },
  "k-face-golden": { n: 75 },
  "k-orbit-inferno": { n: 150 },
  "k-hero-golden": { n: 120 },
  "k-slam-inferno": { n: 120 },
  "k-chase-knight": { n: 150 },
  "k-chase-wizard": { n: 150 },
  "k-chase-explorer": { n: 150 },
  "k-f-gloom-golden": { n: 300, px: true },
  "k-f-thicket-inferno": { n: 300, px: true },
  "k-z-meadow-wizard": { n: 120, px: true },
  "k-w-pulse-knight": { n: 150, px: true },
};
/** the frame of the slow-motion slam where X's foot lands (on the song's first hit) */
const SLAM_AT = 15;

const pad = (n: number, w: number) => String(n).padStart(w, "0");
/** a speed ramp: fast in, slow out (the velocity edit's curve), u in 0..1 */
const ramp = (u: number, k = 2.4) => 1 - Math.pow(1 - clamp(u), k);

/* ------------------------------------------------------------------------------------------------ footage */

type Cut = {
  at: number;
  /** what fills the frame for local time lt (seconds into the cut) and the cut's length */
  draw: (lt: number, d: number) => React.ReactNode;
  /** a white flash, an impact frame (negative), a punch in, a shake: on the cut's first frame */
  flash?: number;
  impact?: boolean;
  punch?: number;
  shake?: number;
  /** a word in the corner: the skin and who it is fighting */
  tag?: [string, Skin];
};

/** a captured shot, frames src0..src0+span over the cut (by `curve`), zoomed z (from z0 to z1) around c */
const Foot: React.FC<{ shot: string; lt: number; d: number; src0: number; span: number; curve?: (u: number) => number; z0?: number; z1?: number; c?: [number, number]; filter?: string }> = ({
  shot,
  lt,
  d,
  src0,
  span,
  curve = ramp,
  z0 = 1.04,
  z1 = 1.12,
  c = [0.5, 0.5],
  filter,
}) => {
  const s = SHOT[shot]!;
  const u = clamp(lt / d);
  const i = Math.round(clamp(src0 + span * curve(u), 0, s.n - 1));
  const z = lerp(z0, z1, easeOut(u));
  return (
    <Img
      src={staticFile(`edit/${shot}/${pad(i + 1, 5)}.jpg`)}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: W,
        height: H,
        objectFit: "cover",
        imageRendering: s.px ? "pixelated" : "auto",
        transformOrigin: `${c[0] * 100}% ${c[1] * 100}%`,
        transform: `scale(${z.toFixed(4)})`,
        filter: filter ?? (s.px ? "contrast(1.12) saturate(1.3) brightness(1.15)" : "contrast(1.14) saturate(1.22) brightness(1.04)"),
      }}
    />
  );
};

/** one of the boss clips (an mp4 at 30 frames a second), from frame `from`, at `rate` */
const Clip: React.FC<{ at: number; d: number; clip: string; from: number; rate?: number; z?: number }> = ({ at, d, clip, from, rate = 1, z = 1.08 }) => (
  <Sequence from={Math.round(at * FPS)} durationInFrames={Math.max(1, Math.round(d * FPS))} layout="none">
    <OffthreadVideo
      src={staticFile(`clips/${clip}.mp4`)}
      trimBefore={from}
      playbackRate={rate}
      muted
      style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `scale(${z})`, filter: "contrast(1.14) saturate(1.22) brightness(1.06)" }}
    />
  </Sequence>
);

/** the Blob as pixel art in a skin, big, in its colour: a try-on card */
const Card: React.FC<{ skin: Skin | "default"; lt: number; name?: string; dark?: boolean }> = ({ skin, lt, name, dark }) => {
  const s = skin === "default" ? "explorer" : skin;
  const f = Math.floor(lt * FPS) % 60;
  const k = 15;
  const pop = backOut(clamp(lt / 0.16));
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 52%, ${BG[s][0]}, ${BG[s][1]} 75%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 54%, rgba(${GLOW[s]},0.55), rgba(${GLOW[s]},0) 38%)`, mixBlendMode: "screen" }} />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: W / 2 - 4, top: H * 0.52 - 900, width: 8, height: 1800, transformOrigin: "50% 50%", transform: `rotate(${i * 18 + lt * 40}deg)`, background: `linear-gradient(180deg, rgba(${GLOW[s]},0), rgba(${GLOW[s]},0.22) 50%, rgba(${GLOW[s]},0))` }} />
      ))}
      <Img
        src={staticFile(`skins/px/${skin}/${pad(f, 2)}.png`)}
        style={{ position: "absolute", left: W / 2 - 32 * k, top: 1060 - 54 * k, width: 64 * k, height: 64 * k, imageRendering: "pixelated", transformOrigin: "50% 84%", transform: `scale(${(0.6 + 0.4 * pop).toFixed(3)})`, filter: dark ? "brightness(0) drop-shadow(0 0 30px rgba(255,210,90,0.9))" : undefined }}
      />
      {name ? <Big text={name} y={1250} size={170} colour={COLOUR[s]} glow={GLOW[s]} lt={lt} /> : null}
    </AbsoluteFill>
  );
};

/** a skin on the 3D jelly, turning (public/skins/3d/turn-<skin>, or Golden in its spotlight) over a dark ground of its colour */
const Turn: React.FC<{ skin: Skin; lt: number; job?: string; n?: number; from?: number; speed?: number }> = ({ skin, lt, job, n = 100, from = 10, speed = 1.4 }) => {
  const j = job ?? `turn-${skin}`;
  const i = Math.min(n - 1, from + Math.floor(lt * FPS * speed));
  const glow = skin === "inferno" || skin === "golden";
  const w = 1500;
  const st: React.CSSProperties = { position: "absolute", left: W / 2 - w / 2, top: 1280 - (714 / 900) * w, width: w, height: w, transform: `scale(${(1 + 0.08 * Math.exp(-lt / 0.12)).toFixed(3)})`, transformOrigin: "50% 79%" };
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 55%, ${BG[skin][0]}, ${BG[skin][1]} 78%)` }}>
      <div style={{ position: "absolute", left: W / 2 - 520, top: 1200, width: 1040, height: 170, borderRadius: "50%", background: `radial-gradient(ellipse, rgba(${GLOW[skin]},0.5), rgba(${GLOW[skin]},0) 70%)` }} />
      <Img src={staticFile(`skins/3d/${j}/s${pad(i, 3)}.png`)} style={st} />
      {glow ? <Img src={staticFile(`skins/3d/${j}/g${pad(i, 3)}.png`)} style={{ ...st, mixBlendMode: "screen" }} /> : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ words */

/** a big word, struck in (the edit's caps), with an outline and its glow */
const Big: React.FC<{ text: string; y: number; size?: number; colour?: string; glow?: string; lt: number; tilt?: number }> = ({ text, y, size = 190, colour = "#ffffff", glow = "255,255,255", lt, tilt = 0 }) => {
  const u = clamp(lt / 0.14);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: y - size * 0.55,
        textAlign: "center",
        fontFamily: POSTER,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "0.02em",
        color: colour,
        opacity: u,
        transform: `scale(${(1.6 - 0.6 * backOut(u)).toFixed(3)}) rotate(${tilt}deg)`,
        WebkitTextStroke: "4px #000",
        textShadow: `0 0 34px rgba(${glow},0.85), 0 8px 0 rgba(0,0,0,0.6)`,
      }}
    >
      {text}
    </div>
  );
};

/** the meme line: lower case, bold, white with a black outline, word by word */
const Meme: React.FC<{ text: string; y: number; lt: number; size?: number; per?: number }> = ({ text, y, lt, size = 74, per = 0.09 }) => (
  <div style={{ position: "absolute", left: 60, right: 60, top: y, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: size, lineHeight: 1.12, color: "#fff", WebkitTextStroke: "3px #000", paintOrder: "stroke fill", textShadow: "0 4px 16px rgba(0,0,0,0.85)" }}>
    {text.split(" ").map((w, i) => {
      const u = clamp((lt - i * per) / 0.08);
      return (
        <span key={i} style={{ opacity: u, display: "inline-block", transform: `scale(${(0.6 + 0.4 * backOut(u)).toFixed(3)})`, marginRight: "0.25em" }}>
          {w}
        </span>
      );
    })}
  </div>
);

const Tag: React.FC<{ text: string; skin: Skin; lt: number }> = ({ text, skin, lt }) => {
  const u = clamp(lt / 0.12);
  return (
    <div style={{ position: "absolute", left: 60, top: 1330, opacity: u, transform: `translateX(${((1 - easeOut(u)) * -60).toFixed(1)}px)` }}>
      <span style={{ fontFamily: POSTER, fontSize: 64, letterSpacing: "0.06em", padding: "8px 26px", background: COLOUR[skin], color: "#0c0804", borderRadius: 8, boxShadow: `0 0 30px rgba(${GLOW[skin]},0.7)` }}>{text}</span>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ the cut */

const face = (skin: Skin, src0 = 20, span = 30) => (lt: number, d: number) => <Foot shot={`k-face-${skin}`} lt={lt} d={d} src0={src0} span={span} z0={1.0} z1={1.06} c={[0.5, 0.66]} />;
const card = (skin: Skin, name?: string) => (lt: number) => <Card skin={skin} lt={lt} name={name} />;
const turn = (skin: Skin, from = 10) => (lt: number) => <Turn skin={skin} lt={lt} from={from} />;
const foot = (shot: string, src0: number, span: number, z0 = 1.04, z1 = 1.14, c: [number, number] = [0.5, 0.5]) => (lt: number, d: number) => <Foot shot={shot} lt={lt} d={d} src0={src0} span={span} z0={z0} z1={z1} c={c} />;

const SKINS4: Skin[] = ["explorer", "knight", "wizard", "inferno"];
const CUTS: Cut[] = [];
const add = (c: Cut) => CUTS.push(c);

// ---- the hook: Golden, then three more on the song's pickup; X's foot on its first hit
add({ at: 0, draw: face("golden", 30, 8) });
add({ at: 0.197, draw: face("knight", 34, 6), flash: 0.5 });
add({ at: 0.383, draw: face("wizard", 34, 6), flash: 0.5 });
add({ at: 0.569, draw: face("inferno", 34, 6), flash: 0.5 });
add({ at: 0.72, draw: foot("k-slam-inferno", SLAM_AT, 75, 1.0, 1.16, [0.5, 0.62]), flash: 1, impact: true, shake: 34, punch: 0.14 });
// ---- the smallest guy in the game; his light; Inferno with X over it; but his drip?
add({ at: 2.9, draw: (lt, d) => <Foot shot="k-hero-golden" lt={lt} d={d} src0={0} span={110} curve={(u) => u} z0={1.0} z1={1.06} /> });
add({ at: 4.77, draw: foot("k-f-thicket-inferno", 70, 30, 2.0, 2.2, [0.34, 0.6]), flash: 0.4 });
add({ at: 5.52, draw: (lt, d) => <Foot shot="k-orbit-inferno" lt={lt} d={d} src0={0} span={60} curve={(u) => u} z0={1.0} z1={1.05} />, flash: 0.3 });
add({ at: 6.37, draw: (lt, d) => <Foot shot="k-chase-knight" lt={lt} d={d} src0={10} span={40} curve={(u) => u} z0={1.02} z1={1.08} />, flash: 0.3 });
// ---- the drip check: a close-up and a try-on card for each, two beats apiece; then a roulette a beat at a time; black
SKINS4.forEach((s, i) => {
  add({ at: snap(8.1 + 2 * i * K), draw: face(s, 10, 50), flash: 0.45, punch: 0.06 });
  add({ at: snap(8.1 + (2 * i + 1) * K), draw: card(s, s.toUpperCase()), flash: 0.35 });
});
const ROUL = snap(8.1 + 8 * K);
const BLACK = snap(17.6);
SONG.beats.filter((b) => b >= ROUL - 0.01 && b < BLACK - 0.05).forEach((b, i) => add({ at: b, draw: card(SKINS4[i % 4]!), flash: 0.25, punch: 0.05 }));
add({ at: BLACK, draw: () => <AbsoluteFill style={{ background: "#000" }} /> });
// ---- the first drop: a cut on every kick
const DROP1: [string, (lt: number, d: number) => React.ReactNode, [string, Skin]?][] = [
  ["chase-knight", foot("k-chase-knight", 40, 40), ["KNIGHT VS X", "knight"]],
  ["face-inferno", face("inferno", 20, 40), ["INFERNO", "inferno"]],
  ["chase-wizard", foot("k-chase-wizard", 30, 40), ["WIZARD VS THE COLLECTOR", "wizard"]],
  ["orbit-inferno", foot("k-orbit-inferno", 60, 30, 1.02, 1.1), ["INFERNO", "inferno"]],
  ["chase-explorer", foot("k-chase-explorer", 30, 40), ["EXPLORER VS THE MASH", "explorer"]],
  ["f-thicket", foot("k-f-thicket-inferno", 60, 50, 1.6, 1.75, [0.5, 0.55]), ["INFERNO · 2D", "inferno"]],
  ["face-knight", face("knight", 25, 40), ["KNIGHT", "knight"]],
  ["chase-knight2", foot("k-chase-knight", 95, 40), ["KNIGHT VS X", "knight"]],
  ["f-gloom", foot("k-f-gloom-golden", 80, 50, 1.6, 1.75, [0.5, 0.55]), ["GOLDEN · 2D", "golden"]],
  ["face-wizard", face("wizard", 25, 40), ["WIZARD", "wizard"]],
  ["chase-wizard2", foot("k-chase-wizard", 95, 40), ["WIZARD VS THE COLLECTOR", "wizard"]],
  ["z-meadow", foot("k-z-meadow-wizard", 30, 40, 1.5, 1.6, [0.5, 0.55]), ["WIZARD · 2D", "wizard"]],
  ["face-explorer", face("explorer", 25, 45), ["EXPLORER", "explorer"]],
];
DROP1.forEach(([, draw, tag], i) => add({ at: i === 0 ? HIT.drop1 : snap(HIT.drop1 + i * K), draw, tag, flash: i === 0 ? 1 : 0.55, impact: i % 3 === 0, punch: i === 0 ? 0.16 : 0.09, shake: i === 0 ? 30 : 12 }));
// ---- the gap: a freeze on Golden
add({ at: 28.1, draw: (lt) => <Foot shot="k-face-golden" lt={lt} d={1.92} src0={40} span={10} curve={(u) => u} z0={1.08} z1={1.22} filter={`contrast(1.2) saturate(${(0.2 + 0.8 * clamp((lt - 1.2) / 0.6)).toFixed(2)}) brightness(${(0.8 + 0.6 * clamp((lt - 1.5) / 0.4)).toFixed(2)})`} />, flash: 0.8 });
// ---- the second drop: GOLDEN; then harder
add({ at: HIT.drop2, draw: (lt) => <Turn skin="golden" job="golden" n={90} lt={lt} from={0} speed={1.3} />, flash: 1, impact: true, shake: 34, punch: 0.18 });
const DROP2: [number, (lt: number, d: number) => React.ReactNode, [string, Skin]?, boolean?][] = [
  [31.51, foot("k-hero-golden", 40, 70), ["GOLDEN VS X", "golden"]],
  [32.25, foot("k-slam-inferno", SLAM_AT - 6, 50, 1.0, 1.14, [0.5, 0.62]), undefined, true],
  [33.0, () => null],
  [33.74, card("knight", "KNIGHT")],
  [33.74 + B, turn("knight", 30), ["KNIGHT · 3D", "knight"]],
  [34.48, foot("k-chase-explorer", 95, 45), ["EXPLORER VS THE MASH", "explorer"]],
  [35.22, card("wizard", "WIZARD")],
  [35.22 + B, turn("wizard", 30), ["WIZARD · 3D", "wizard"]],
  [35.97, () => null],
  [36.71, card("inferno", "INFERNO")],
  [36.71 + B, turn("inferno", 30), ["INFERNO · 3D", "inferno"]],
  [37.45, foot("k-orbit-inferno", 100, 40, 1.02, 1.1), ["INFERNO", "inferno"]],
  [38.2, () => <Carousel />],
  [39.68, face("golden", 40, 30), ["GOLDEN", "golden"]],
  [40.42, foot("k-f-gloom-golden", 70, 40, 1.9, 2.1, [0.45, 0.45]), ["GOLDEN · 2D", "golden"]],
];
DROP2.forEach(([at, draw, tag, imp]) => add({ at: snap(at), draw, tag, flash: 0.6, impact: !!imp || Math.round((at - 30.02) / K) % 2 === 0, punch: 0.1, shake: 14 }));
// ---- the end: black, PLAY FREE; on the last hit the logo and the five
add({ at: snap(41.17), draw: () => <AbsoluteFill style={{ background: "#000" }} /> });
add({ at: HIT.last, draw: (lt) => <End lt={lt} />, flash: 1, shake: 26, punch: 0.12 });
CUTS.sort((a, b) => a.at - b.at);

/** the carousel of all five (public/skins/3d/carousel), under the aurora */
const Carousel: React.FC = () => {
  const lt = useCurrentFrame() / FPS - snap(38.2);
  const i = clamp(Math.floor(30 + lt * FPS * 1.6), 0, 149);
  const st: React.CSSProperties = { position: "absolute", left: W / 2 - 700, top: 1250 - (760 / 1080) * 1400, width: 1400, height: 1400 };
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 60% at 50% 55%, #1a2a44, #04060c 80%)" }}>
      <Img src={staticFile(`skins/3d/carousel/s${pad(i, 3)}.png`)} style={st} />
      <Img src={staticFile(`skins/3d/carousel/g${pad(i, 3)}.png`)} style={{ ...st, mixBlendMode: "screen" }} />
    </AbsoluteFill>
  );
};

const End: React.FC<{ lt: number }> = ({ lt }) => {
  const order: Skin[] = ["explorer", "knight", "golden", "wizard", "inferno"];
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 70% at 50% 45%, #1c1430, #030206 80%)" }}>
      <Sequence from={Math.round(41.72 * FPS)} layout="none">
        <OffthreadVideo src={staticFile("skins/aurora.mp4")} muted trimBefore={300} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: 0.55 }} />
      </Sequence>
      <Img src={staticFile("lineup/logo.png")} style={{ position: "absolute", left: W / 2 - 380, top: 230, width: 760, transform: `scale(${(1.25 - 0.25 * backOut(clamp(lt / 0.2))).toFixed(3)})` }} />
      {order.map((s, i) => {
        const a = 0.05 + 0.06 * i;
        const h = clamp((lt - a) / 0.3);
        const x = W / 2 + (i - 2) * 190;
        const f = Math.floor((lt + i * 0.3) * FPS) % 60;
        return (
          <Img
            key={s}
            src={staticFile(`skins/px/${s}/${pad(f, 2)}.png`)}
            style={{ position: "absolute", left: x - 32 * 6, top: 1000 - 54 * 6 - Math.sin(h * Math.PI) * 60, width: 64 * 6, height: 64 * 6, imageRendering: "pixelated", opacity: clamp((lt - a) / 0.05) }}
          />
        );
      })}
      <Big text="PLAY FREE" y={1150} size={170} colour="#fff3d6" glow="255,210,120" lt={lt - 0.1} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 1270, textAlign: "center", opacity: clamp((lt - 0.25) / 0.15) }}>
        <span style={{ fontFamily: POSTER, fontSize: 84, letterSpacing: "0.06em", padding: "10px 40px", borderRadius: 14, background: "#ffd24a", color: "#120c04", boxShadow: "0 0 40px rgba(255,200,80,0.8)" }}>ON ITCH.IO</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1430, textAlign: "center", opacity: clamp((lt - 0.45) / 0.2), fontFamily: SANS, fontWeight: 800, fontSize: 44, color: "#fff", WebkitTextStroke: "2px #000", paintOrder: "stroke fill" }}>
        link in bio
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the film */

export const SkinsEdit: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  let ci = 0;
  for (let i = 0; i < CUTS.length; i++) if (CUTS[i]!.at <= t + 1e-6) ci = i;
  const cut = CUTS[ci]!;
  const lt = t - cut.at;
  const d = (CUTS[ci + 1]?.at ?? EDIT_LENGTH) - cut.at;
  // the shake and the punch from the most recent hits
  let shake = 0;
  let punch = 1;
  for (const c of CUTS) {
    const u = t - c.at;
    if (u < 0 || u > 0.6) continue;
    if (c.shake) shake = Math.max(shake, c.shake * Math.exp(-u / 0.09));
    if (c.punch) punch = Math.max(punch, 1 + c.punch * Math.exp(-u / 0.1));
  }
  const sx = shake * Math.sin(t * 97 + 1);
  const sy = shake * Math.cos(t * 83);
  const fr = Math.round(lt * FPS);
  const neg = cut.impact && fr === 0 ? "invert(1) grayscale(1) contrast(3)" : cut.impact && fr === 1 ? "grayscale(1) contrast(4) brightness(1.3)" : undefined;
  // the RGB split on the second drop's hits
  const split = t >= HIT.drop2 && t < snap(41.17) && lt < 0.1 ? 12 * (1 - lt / 0.1) : 0;
  const body = cut.draw(lt, d);
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Audio src={staticFile("audio/edit-skins.wav")} />
      {/* the boss clips play on their own clock (they are videos) */}
      <Clip at={snap(33.0)} d={snap(33.74) - snap(33.0)} clip="x-rake" from={40} rate={1.4} />
      <Clip at={snap(35.97)} d={snap(36.71) - snap(35.97)} clip="mash-3" from={30} rate={1.4} />
      {ready ? (
        <>
          <AbsoluteFill style={{ transform: `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) scale(${punch.toFixed(4)})`, filter: neg }}>
            {body}
            {split > 0 ? (
              <>
                <AbsoluteFill style={{ transform: `translateX(${split}px)`, mixBlendMode: "screen", opacity: 0.28, filter: "sepia(1) saturate(8) hue-rotate(-50deg) brightness(0.7)" }}>{body}</AbsoluteFill>
                <AbsoluteFill style={{ transform: `translateX(${-split}px)`, mixBlendMode: "screen", opacity: 0.28, filter: "sepia(1) saturate(8) hue-rotate(150deg) brightness(0.7)" }}>{body}</AbsoluteFill>
              </>
            ) : null}
          </AbsoluteFill>
          <Words t={t} />
          {cut.tag && lt < d ? <Tag text={cut.tag[0]} skin={cut.tag[1]} lt={lt} /> : null}
          {cut.flash ? <AbsoluteFill style={{ background: "#fff", opacity: cut.flash * Math.max(0, 1 - lt / 0.16) ** 2 }} /> : null}
        </>
      ) : null}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 70% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)" }} />
      <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: 0.06, mixBlendMode: "overlay" }} />
      <AbsoluteFill style={{ background: "#000", opacity: clamp((t - 42.6) / 0.6) }} />
    </AbsoluteFill>
  );
};

/** the words over the cut (they hold across cuts, so they are timed on the song, not on the shots) */
const Words: React.FC<{ t: number }> = ({ t }) => {
  const on = (a: number, b: number) => t >= a && t < b;
  return (
    <>
      {/* (on screen, whole, from the very first frame: it is the frame the feed shows before anything plays) */}
      {on(0, HIT.boom) ? <Big text="THE BLOB GOT NEW SKINS" y={330} size={118} lt={t + 1} /> : null}
      {on(3.3, 4.77) ? <Meme text="the smallest guy in the game" y={300} lt={t - 3.3} /> : null}
      {on(6.6, 8.1) ? <Meme text="but his drip?" y={300} lt={t - 6.6} size={96} per={0.14} /> : null}
      {on(8.1, 17.6) ? <Big text="DRIP CHECK" y={250} size={150} colour="#ffe9a8" glow="255,200,90" lt={t - 8.1} /> : null}
      {on(BLACK, HIT.drop1) ? (
        <>
          <Big text="NOW" y={860} size={260} lt={t - BLACK} />
          {t >= snap(17.97) ? <Big text="WATCH." y={1110} size={260} colour="#ffd24a" glow="255,200,80" lt={t - snap(17.97)} /> : null}
        </>
      ) : null}
      {on(28.1, 30.02) ? (
        <>
          <Meme text="the 5th one…" y={300} lt={t - 28.2} size={84} />
          {t >= 28.9 ? <Big text="ONLY ON NIGHTMARE" y={1350} size={128} colour="#ff4a5a" glow="255,60,80" lt={t - 28.9} /> : null}
        </>
      ) : null}
      {on(HIT.drop2, snap(31.51)) ? <Big text="GOLDEN" y={330} size={230} colour="#ffd24a" glow="255,200,80" lt={t - HIT.drop2} /> : null}
      {on(snap(38.2), snap(38.94)) ? <Big text="5 SKINS" y={330} size={200} lt={t - snap(38.2)} /> : null}
      {on(snap(38.94), snap(39.68)) ? <Big text="2D + 3D" y={330} size={200} colour="#9ff4ee" glow="127,244,234" lt={t - snap(38.94)} /> : null}
      {on(snap(39.68), snap(40.42)) ? <Big text="FREE" y={330} size={240} colour="#ffd24a" glow="255,200,80" lt={t - snap(39.68)} /> : null}
      {on(snap(41.17), HIT.last) ? (
        <>
          <Big text="PLAY" y={860} size={260} lt={t - snap(41.17)} />
          {t >= snap(41.17 + B) ? <Big text="FREE" y={1110} size={260} colour="#ffd24a" glow="255,200,80" lt={t - snap(41.17 + B)} /> : null}
        </>
      ) : null}
    </>
  );
};

// (deterministic jitter for anything that wants it later)
export const jitter = (i: number) => rand(i);
