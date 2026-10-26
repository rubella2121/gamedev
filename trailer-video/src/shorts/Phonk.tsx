import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Flash, GlitchDefs, Look, useGlitch, useShake } from "../components/Effects";
import { Shot } from "../components/Shot";
import shorts from "../data/shorts.json";
import type { Cut } from "../edit";
import { GOLD, RED } from "../lib/colours";
import { POSTER, useFonts } from "../lib/fonts";
import { FPS, H, rand, smooth, W } from "../lib/time";
import { EndPhonk } from "./ends";
import { usePunch, useImpact } from "./kit";

const S = shorts.shorts.phonk;
const B = 0.4;

/**
 * BLOB MODE - a phonk edit: black and white with red words, the lullaby on a cowbell over an 808. Slow, then the drop: every
 * blow speed-ramped (slow into the hit, a frame in negative on it, slow after), a punch-in on every beat. SMALL. ALONE.
 * OUTNUMBERED. OUTSIZED. UNSTOPPABLE. Then the colour comes back, on the three of them: FOR THEM.
 */

/** a shot that ramps: consecutive pieces of one clip, each at its own speed, the clip running on without a jump */
export const ramp = (clip: string, from: number, at: number, pieces: [number, number][], extra: Partial<Cut> = {}): Cut[] => {
  const out: Cut[] = [];
  let f = from;
  let t = at;
  pieces.forEach(([dur, rate], i) => {
    out.push({ at: t, end: t + dur, clip, from: f, rate, ...extra, in: i === 0 ? extra.in : "cut" });
    f += dur * 30 * rate;
    t += dur;
  });
  return out;
};

const D = S.drop;
export const CUTS: Cut[] = [
  // SMALL. ALONE.
  { at: 0, end: D, clip: "h-x-slam", from: 0, rate: 0.25, z: [1.0, 1.15], c: [0.5, 0.6] },
  // the drop: his foot (fast in, the hit, slow out)
  ...ramp("h-x-slam", 13, D, [[0.1, 1.6], [0.7, 0.35]], { z: [1.1, 1.18], c: [0.5, 0.55] }),
  ...ramp("x-foot", 73, D + 2 * B, [[0.27, 1.5], [0.53, 0.4]], { z: [1.2, 1.1], c: [0.5, 0.55], in: "flash" }),
  // OUTNUMBERED.
  { at: D + 4 * B, end: D + 6 * B, clip: "c-mash", from: 20, rate: 0.7, z: [1.25, 1.1], c: [0.5, 0.42], in: "zoom" },
  { at: D + 6 * B, end: D + 7 * B, clip: "collector-0", from: 58, rate: 1.4, z: [1.15, 1.05], in: "cut" },
  { at: D + 7 * B, end: D + 8 * B, clip: "mash-0", from: 80, rate: 1.6, z: [1.1, 1.0], c: [0.5, 0.45], in: "cut" },
  // OUTSIZED.
  { at: D + 8 * B, end: D + 10 * B, clip: "c-x-hero", from: 20, rate: 0.6, z: [1.2, 1.32], c: [0.5, 0.38], in: "flash" },
  { at: D + 10 * B, end: D + 11 * B, clip: "f-thicket", from: 168, z: [1.4, 1.3], c: [0.5, 0.4], pixel: true, in: "cut" },
  { at: D + 11 * B, end: D + 12 * B, clip: "x-rake", from: 82, rate: 1.5, in: "cut" },
  { at: D + 12 * B, end: D + 12.5 * B, clip: "c-chase", from: 40, in: "glitch" },
  { at: D + 12.5 * B, end: D + 13 * B, clip: "c-x-stomp", from: 175, in: "cut" },
  { at: D + 13 * B, end: D + 14 * B, clip: "collector-2", from: 46, in: "glitch" },
  { at: D + 14 * B, end: D + 15 * B, clip: "mash-3", from: 44, in: "cut" },
  { at: D + 15 * B, end: S.words[4]!, clip: "x-jaws", from: 120, in: "glitch" },
  // UNSTOPPABLE.
  ...ramp("h-x-death", 40, S.words[4]!, [[0.4, 2.0], [1.2, 0.35]], { z: [1.0, 1.1], c: [0.5, 0.45], in: "flash" }),
  // FOR THEM. (the colour comes back)
  { at: S.breakdown, end: S.end, clip: "reunion", from: 290, rate: 0.5, z: [1.0, 1.08], c: [0.5, 0.55], in: "fade" },
];

/** the hits: where each blow lands */
const HITS = [D + 0.1, D + 2 * B + 0.27, D + 4 * B, D + 8 * B, S.words[4]!, S.words[4]! + 0.4];
const BEATS = Array.from({ length: Math.round((S.breakdown - D) / B) }, (_, i) => D + i * B);

const WORDS: [number, number, string, string][] = [
  [S.words[0]!, S.words[1]! - 0.05, "SMALL.", "#fff"],
  [S.words[1]!, D - 0.05, "ALONE.", "#fff"],
  [S.words[2]!, S.words[2]! + 0.78, "OUTNUMBERED.", "#fff"],
  [S.words[3]!, S.words[3]! + 0.78, "OUTSIZED.", "#fff"],
  [S.words[4]!, S.breakdown - 0.1, "UNSTOPPABLE.", RED],
  [S.forThem, S.end - 0.1, "FOR THEM.", GOLD],
];

export const Phonk: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const shake = useShake([...BEATS.map((b) => [b, 0.35] as [number, number]), ...HITS.map((h) => [h, 1.1] as [number, number]), [S.end, 0.8]]);
  const tear = useGlitch([D + 12 * B, D + 13 * B, D + 15 * B, S.breakdown - 0.05]);
  const impact = useImpact(HITS);
  const punch = usePunch(t < S.breakdown ? BEATS : [], 0.06);
  // black and white until it is for them
  const grey = t < S.breakdown ? 1 : t < S.end ? 1 - smooth((t - S.breakdown - 0.2) / 0.8) : 0;
  const red = t >= D && t < S.breakdown ? Math.exp(-((t - D) % B) / 0.12) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill
        style={{
          transform: `${shake === "none" ? "" : shake} scale(${punch.toFixed(3)})`,
          filter: [grey > 0.01 ? `grayscale(${grey.toFixed(2)}) contrast(${(1 + 0.4 * grey).toFixed(2)})` : "", tear > 0.02 ? "url(#tear)" : "", impact ?? ""].join(" ").trim() || undefined,
        }}
      >
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
        {ready ? <EndPhonk at={S.end} fade={S.fadeOut} /> : null}
        <Look />
      </AbsoluteFill>
      {/* the red at the edges, on every kick */}
      <AbsoluteFill style={{ opacity: 0.55 * red, background: `radial-gradient(ellipse 75% 60% at 50% 50%, rgba(0,0,0,0) 50%, rgba(220,20,40,0.9) 100%)` }} />
      <Flash hits={[...HITS.map((h) => [h, 0.7] as [number, number]), [S.end, 0.8]]} />
      {ready ? WORDS.map(([a, e, s, c], i) => <Word key={i} at={a} end={e} text={s} colour={c} />) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-phonk.wav")} />
    </AbsoluteFill>
  );
};

/** one word, as big as it will go: slammed in, its colours split for a moment, shaking */
const Word: React.FC<{ at: number; end: number; text: string; colour: string }> = ({ at, end, text, colour }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > end) return null;
  const u = t - at;
  const s = 1 + 0.7 * Math.exp(-u / 0.07);
  const split = 14 * Math.exp(-u / 0.12);
  const f = Math.floor(t * 30);
  const j = (rand(f) - 0.5) * 8;
  const size = Math.min(250, (W * 0.92) / (text.length * 0.42));
  const o = 1 - smooth((t - (end - 0.08)) / 0.08);
  const stroke = colour === "#fff" ? RED : "#000";
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: o }}>
      <div
        style={{
          fontFamily: POSTER,
          fontSize: size,
          lineHeight: 1,
          color: colour,
          letterSpacing: "0.02em",
          transform: `translate(${j}px, ${-H * 0.04}px) scale(${s.toFixed(3)}) rotate(${(-3 + 2 * Math.sin(u * 3)).toFixed(2)}deg)`,
          WebkitTextStroke: `5px ${stroke}`,
          textShadow: `${split.toFixed(1)}px 0 0 rgba(255,30,60,0.8), ${(-split).toFixed(1)}px 0 0 rgba(40,200,255,0.8), 10px 10px 0 rgba(0,0,0,0.85)`,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
