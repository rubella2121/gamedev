import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Leaks, Look } from "../components/Effects";
import { EndCard } from "../components/EndCard";
import { Shot } from "../components/Shot";
import { ITALIC } from "../components/Words";
import shorts from "../data/shorts.json";
import type { Cut } from "../edit";
import { GOLD } from "../lib/colours";
import { useFonts } from "../lib/fonts";
import { FPS, H, smooth, W } from "../lib/time";
import { Fireflies, span, Subtitle } from "./kit";

const S = shorts.shorts.lullaby;
const [v1, v2, v3] = S.verse as [number, number, number];

/**
 * THE LULLABY - the song the Mother sang every night, with its words, sung by the music box one word to a note. The moon, the
 * three of them, the stars (which watch), the clearing; and on the last line - don't look up - it stops, and the moon blinks.
 */

/** the lullaby's rhythm (the game's own: two short, one long), slowed a touch; every note carries one word */
const GAPS = [0.62, 0.62, 0.9, 0.62, 0.62, 0.9, 0.62, 0.62].map((g) => g * S.gap);
export const ONSETS = GAPS.map((_, i) => GAPS.slice(0, i).reduce((a, b) => a + b, 0));
/** each verse, and how far down the frame it sits (clear of the three of them) */
const VERSES: [number, string[], number][] = [
  [v1, ["Hush", "now,", "light", "of", "mine,", "close", "your", "eyes."], 0.17],
  [v2, ["Small", "stars", "shine,", "but", "they", "watch", "you", "sleep."], 0.6],
  [v3, ["Hold", "on", "tight,", "my", "love,", "don't", "look", "up."], 0.2],
];

/** where the moon is in the reunion's first frames, and the shot that holds on it */
const MOON = { clip: "reunion", from: 10, z: 2.4, c: [0.28, 0.225] as [number, number], r: 0.041 };

export const CUTS: Cut[] = [
  { at: 0, end: v1, clip: "reunion", from: 0, rate: 0.3, z: [1.0, 1.08], c: [0.4, 0.4] },
  { at: v1, end: v2, clip: "reunion", from: 300, rate: 0.4, z: [1.0, 1.12], c: [0.5, 0.55], in: "dissolve" },
  { at: v2, end: v3, clip: "edge", from: 92, rate: 0.7, z: [1.5, 1.35], c: [0.5, 0.2], pixel: true, in: "dissolve" },
  { at: v3, end: S.silence, clip: "flee", from: 468, rate: 0.6, z: [1.0, 1.08], c: [0.5, 0.55], in: "dissolve" },
  { at: S.silence, end: S.end, clip: MOON.clip, from: MOON.from, rate: 0.02, z: [MOON.z, MOON.z], c: MOON.c, in: "fade" },
];

export const Lullaby: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill>
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
        <Blink t={t} />
        <Fireflies n={30} k={span(t, 0, S.silence, 1, 0.4)} />
        {ready ? <EndCard at={S.end} fade={S.fadeOut} tag="SLEEP TIGHT, LITTLE LIGHT." /> : null}
        <Leaks leaks={[[0.2, 3.0], [v1 + 0.2, 3.4], [v3 + 0.3, 3.4], [S.end - 0.1, 2.6]]} />
        <Look />
      </AbsoluteFill>
      {ready ? (
        <>
          <Subtitle at={0.25} end={3.0} text="Every night… I sang you the same song." colour="rgba(255,200,140,0.9)" y={0.62} size={72} />
          {VERSES.map(([at, words, y], i) => (
            <Verse key={i} at={at} words={words} y={y} t={t} />
          ))}
          <Subtitle at={S.whisper} end={S.end - 0.1} text="look up." colour="rgba(159,244,238,0.9)" y={0.64} size={64} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-lullaby.wav")} />
    </AbsoluteFill>
  );
};

/** a verse: its words dim until the music box reaches them, then gold, the one being sung a little larger */
const Verse: React.FC<{ at: number; words: string[]; y: number; t: number }> = ({ at, words, y, t }) => {
  const last = at + ONSETS[7]! + 0.9;
  if (t < at - 0.5 || t > last + 0.4) return null;
  const o = smooth((t - (at - 0.5)) / 0.4) * (1 - smooth((t - last) / 0.4));
  const word = (w: string, i: number) => {
    const on = at + ONSETS[i]!;
    const next = i < 7 ? at + ONSETS[i + 1]! : on + 0.9;
    const sung = t >= on;
    const now = sung && t < next;
    const u = t - on;
    const s = now ? 1 + 0.1 * Math.exp(-u / 0.25) : 1;
    return (
      <span
        key={i}
        style={{
          display: "inline-block",
          margin: "0 0.16em",
          color: sung ? "#ffe6b0" : "rgba(255,255,255,0.42)",
          transform: `scale(${s.toFixed(3)}) translateY(${now ? (-6 * Math.exp(-u / 0.3)).toFixed(1) : 0}px)`,
          textShadow: sung ? `0 0 ${now ? 34 : 18}px ${GOLD}, 0 0 60px rgba(255,170,80,${now ? 0.7 : 0.3}), 0 3px 10px rgba(0,0,0,0.9)` : "0 3px 12px rgba(0,0,0,0.9)",
        }}
      >
        {w}
      </span>
    );
  };
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * y, opacity: o }}>
      <div style={{ fontFamily: ITALIC, fontStyle: "italic", fontWeight: 600, fontSize: 84, lineHeight: 1.2, textAlign: "center", maxWidth: W * 0.92 }}>
        <div>{words.slice(0, 4).map((w, i) => word(w, i))}</div>
        <div>{words.slice(4).map((w, i) => word(w, i + 4))}</div>
      </div>
    </AbsoluteFill>
  );
};

/** the moon, held close: and it blinks - two lids closing over it from above and below - and opens again as an eye */
const Blink: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.silence || t > S.end) return null;
  const u = t - S.blink;
  const shut = u < 0 ? 0 : u < 0.22 ? smooth(u / 0.22) : u < 0.4 ? 1 : 1 - smooth((u - 0.4) / 0.3);
  // the moon, where the held shot puts it
  const s = MOON.z;
  const tx = Math.min(0, Math.max(W - W * s, W / 2 - MOON.c[0] * W * s));
  const ty = Math.min(0, Math.max(H - H * s, H / 2 - MOON.c[1] * H * s));
  const x = tx + MOON.c[0] * W * s;
  const y = ty + MOON.c[1] * H * s;
  const r = MOON.r * W * s * 1.45;
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
      <defs>
        <clipPath id="moon">
          <circle cx={x} cy={y} r={r} />
        </clipPath>
      </defs>
      <g clipPath="url(#moon)">
        {u > 0.3 ? (
          <g opacity={smooth((u - 0.3) / 0.2)}>
            <circle cx={x} cy={y} r={r * 0.62} fill="rgba(150,110,255,0.35)" stroke="rgba(120,80,230,0.8)" strokeWidth={6} />
            <ellipse cx={x} cy={y} rx={r * 0.11} ry={r * 0.62} fill="#14062a" />
          </g>
        ) : null}
        <path d={`M${x - r} ${y - r} H${x + r} V${y - r + r * shut} Q${x} ${y - r + 2 * r * shut * 1.15} ${x - r} ${y - r + r * shut} Z`} fill="#0a1418" stroke="#000" strokeWidth={10} />
        <path d={`M${x - r} ${y + r} H${x + r} V${y + r - r * shut} Q${x} ${y + r - 2 * r * shut * 1.15} ${x - r} ${y + r - r * shut} Z`} fill="#0a1418" stroke="#000" strokeWidth={10} />
      </g>
    </svg>
  );
};
