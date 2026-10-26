import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { Flash, useShake } from "../components/Effects";
import { Shot } from "../components/Shot";
import shorts from "../data/shorts.json";
import type { Cut } from "../edit";
import { useFonts } from "../lib/fonts";
import { easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { span } from "./kit";

const S = shorts.shorts.festival;
const [c1, c2, c3, c4] = S.cards as [number, number, number, number];
const [p1, p2, p3] = S.shots as [number, number, number];
const M = S.montage;
const [q1, q2, q3] = S.quotes as [number, number, number];
const CREAM = "#f3ecdf";
const VIOLET = "#b9a2ff";

/**
 * THE FESTIVAL TRAILER - the game cut like an art-house film's: letterboxed, graded, grained, its gate weaving; white words on
 * black between slow shots. Every night she sang him the same song, and gave him one rule. Silence; a whisper - don't look up;
 * and then everything, very fast. The laurels, and the reviews (from the moth, from X, from something else). The title.
 */

/** the grade: a little faded, cool in the shadows, warm in the light */
const FILM = "grayscale(0.2) sepia(0.12) saturate(0.85) contrast(1.12) brightness(1.04)";
const HARD = "grayscale(0.15) saturate(0.9) contrast(1.3) brightness(1.08)";

export const CUTS: Cut[] = [
  { at: p1, end: c2, clip: "moonlit", from: 4, rate: 0.5, z: [1.0, 1.08], c: [0.5, 0.45], in: "fade", dark: 1, grade: FILM },
  { at: p2, end: c3, clip: "reunion", from: 296, rate: 0.4, z: [1.04, 1.12], c: [0.5, 0.55], in: "fade", dark: 1, grade: FILM },
  { at: p3, end: c4, clip: "flee", from: 470, rate: 0.5, z: [1.0, 1.08], c: [0.5, 0.55], in: "fade", dark: 1, grade: FILM },
  // and then everything, very fast
  { at: M[0]!, end: M[1]!, clip: "x-jaws", from: 120, grade: HARD, in: "cut" },
  { at: M[1]!, end: M[2]!, clip: "t-eye", from: 60, grade: HARD, in: "cut" },
  { at: M[2]!, end: M[3]!, clip: "c-mash", from: 20, z: [1.1, 1.0], c: [0.5, 0.45], grade: HARD, in: "cut" },
  { at: M[3]!, end: M[4]!, clip: "h-x-slam", from: 13, rate: 1.3, grade: HARD, in: "cut" },
  { at: M[4]!, end: M[5]!, clip: "collector-2", from: 46, grade: HARD, in: "cut" },
  { at: M[5]!, end: M[6]!, clip: "fourth-fight", from: 60, z: [1.15, 1.15], grade: HARD, in: "cut" },
  { at: M[6]!, end: M[7]!, clip: "c-chase", from: 40, grade: HARD, in: "cut" },
  { at: M[7]!, end: M[8]!, clip: "t-unfold", from: 60, grade: HARD, in: "cut" },
  { at: M[8]!, end: S.laurels, clip: "x-foot", from: 79, z: [1.12, 1.04], c: [0.5, 0.55], grade: HARD, in: "cut" },
];

/** the words on black: (from, to, lines) */
const CARDS: [number, number, string[]][] = [
  [c1 + 0.2, p1 - 0.1, ["THE RUN OCTOBER JAM", "PRESENTS"]],
  [c2 + 0.15, p2 - 0.1, ["EVERY NIGHT,"]],
  [c3 + 0.15, p3 - 0.1, ["SHE SANG HIM", "THE SAME SONG."]],
  [c4 + 0.15, S.hush - 0.05, ["AND GAVE HIM", "ONE RULE."]],
];

/** the picture's window: wide black bars, until everything happens at once */
const BAR = 290;

export const Festival: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shake = useShake([[S.boom, 1.2], ...M.slice(1).map((m) => [m, 0.5] as [number, number])]);
  // the gate weaving, and the light flickering, as a projector's would
  const wx = 2.2 * Math.sin(t * 2.3) + 1.2 * (rand(frame) - 0.5);
  const wy = 1.8 * Math.sin(t * 1.7 + 1) + 1.2 * (rand(frame + 9) - 0.5);
  const flicker = 0.035 * rand(frame * 3);
  const fast = t >= S.boom && t < S.laurels;
  const bar = fast ? BAR * (1 - easeOut((t - S.boom) / 0.12)) : BAR;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: `${shake === "none" ? "" : shake} translate(${wx.toFixed(2)}px, ${wy.toFixed(2)}px)` }}>
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
        {/* cool shadows, warm light */}
        <AbsoluteFill style={{ mixBlendMode: "soft-light", opacity: 0.7, background: "linear-gradient(180deg, rgba(40,110,120,0.7) 0%, rgba(30,60,70,0.3) 45%, rgba(255,160,80,0.45) 100%)" }} />
      </AbsoluteFill>
      {/* the bars */}
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: bar, backgroundColor: "#000" }} />
      <div style={{ position: "absolute", left: 0, bottom: 0, width: W, height: bar, backgroundColor: "#000" }} />
      {/* the vignette, the flicker, the grain, the dust */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 55% at 50% 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.7) 100%)" }} />
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: flicker }} />
      <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, mixBlendMode: "overlay", opacity: 0.42 }} />
      <Dust f={frame} />
      <Flash hits={[[S.boom, 1], ...M.slice(1).map((m) => [m, 0.35] as [number, number])]} />
      {ready ? (
        <>
          {CARDS.map(([a, e, lines], i) => (
            <Card key={i} t={t} at={a} end={e} lines={lines} />
          ))}
          <Rule t={t} />
          <Laurels t={t} />
          <Title t={t} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-festival.wav")} />
    </AbsoluteFill>
  );
};

/** specks and hairs, a few frames each */
const Dust: React.FC<{ f: number }> = ({ f }) => (
  <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, mixBlendMode: "screen" }}>
    {Array.from({ length: 4 }, (_, i) => {
      const seed = Math.floor(f / 3) * 7 + i * 13;
      if (rand(seed) < 0.55) return null;
      const x = rand(seed + 1) * W;
      const y = rand(seed + 2) * H;
      return rand(seed + 3) < 0.7 ? (
        <circle key={i} cx={x} cy={y} r={1.5 + 3 * rand(seed + 4)} fill="rgba(255,255,255,0.5)" />
      ) : (
        <path key={i} d={`M${x} ${y} q ${20 + 30 * rand(seed + 5)} ${-10} ${40 + 40 * rand(seed + 6)} ${10 + 20 * rand(seed + 7)}`} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} fill="none" />
      );
    })}
  </svg>
);

/* ------------------------------------------------------------------------------------------------ words on black */

const Card: React.FC<{ t: number; at: number; end: number; lines: string[] }> = ({ t, at, end, lines }) => {
  const k = span(t, at, end, 0.45, 0.3);
  if (k <= 0) return null;
  const u = t - at;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: k }}>
      <div style={{ textAlign: "center", filter: `blur(${(4 * (1 - smooth(u / 0.5))).toFixed(1)}px)`, transform: `translateY(${-H * 0.03}px)` }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontFamily: "Cinzel", fontWeight: 400, fontSize: lines.length > 1 && i === lines.length - 1 && l === "PRESENTS" ? 34 : 58, letterSpacing: "0.22em", paddingLeft: "0.22em", lineHeight: 1.5, color: CREAM, marginTop: l === "PRESENTS" ? 14 : 0 }}>
            {l}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** the rule, whispered, on black */
const Rule: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.whisper, S.boom - 0.04, 0.25, 0.02);
  if (k <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: k }}>
      <div style={{ fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 92, color: "#fff", transform: `translateY(${-H * 0.03}px) scale(${(1 + 0.04 * smooth((t - S.whisper) / 1)).toFixed(3)})`, textShadow: "0 0 30px rgba(255,255,255,0.25)" }}>Don't look up.</div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the laurels and the reviews */

/** one side of a laurel: leaves along an arc */
const Branch: React.FC<{ cx: number; cy: number; r: number; side: 1 | -1; colour: string; k: number }> = ({ cx, cy, r, side, colour, k }) => {
  const n = 9;
  const leaves = [];
  for (let i = 0; i < n; i++) {
    if (i / n > k) break;
    // from the bottom round to the top, on this side
    const a = Math.PI / 2 + side * (0.35 + (i / (n - 1)) * 2.2);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const tangent = (a * 180) / Math.PI + (side > 0 ? 90 : -90);
    for (const off of [-1, 1]) {
      leaves.push(<ellipse key={`${i}${off}`} cx={x} cy={y} rx={9} ry={24} fill={colour} transform={`rotate(${tangent + off * 32 * side} ${x} ${y}) translate(${off * 12} 0)`} />);
    }
  }
  return (
    <g>
      <path d={`M ${cx + Math.cos(Math.PI / 2 + side * 0.35) * r} ${cy + Math.sin(Math.PI / 2 + side * 0.35) * r} A ${r} ${r} 0 0 ${side > 0 ? 1 : 0} ${cx + Math.cos(Math.PI / 2 + side * 2.55) * r} ${cy + Math.sin(Math.PI / 2 + side * 2.55) * r}`} stroke={colour} strokeWidth={3} fill="none" opacity={k > 0 ? 1 : 0} />
      {leaves}
    </g>
  );
};

const Laurels: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.laurels, S.title2 - 0.05, 0.3, 0.35);
  if (k <= 0) return null;
  const u = t - S.laurels;
  const grow = easeOut(u / 0.7);
  const cx = W / 2;
  const cy = H * 0.25;
  const quotes: [number, string, string, string][] = [
    [q1, "★ ★ ★ ★ ★", "THE MOTH", CREAM],
    [q2, "“It should not have come this far.”", "X, THE HOLLOW", CREAM],
    [q3, "“10/10. Would look up again.”", "???", VIOLET],
  ];
  const f = Math.floor(t * FPS);
  return (
    <AbsoluteFill style={{ opacity: k }}>
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
        <Branch cx={cx} cy={cy} r={250} side={1} colour={CREAM} k={grow} />
        <Branch cx={cx} cy={cy} r={250} side={-1} colour={CREAM} k={grow} />
      </svg>
      <div style={{ position: "absolute", left: 0, top: cy - 100, width: W, textAlign: "center", fontFamily: "Cinzel", color: CREAM, opacity: smooth((u - 0.2) / 0.4) }}>
        <div style={{ fontWeight: 400, fontSize: 22, letterSpacing: "0.24em", paddingLeft: "0.24em" }}>OFFICIAL SELECTION</div>
        <div style={{ fontWeight: 700, fontSize: 44, letterSpacing: "0.08em", marginTop: 18, lineHeight: 1.1 }}>
          RUN
          <br />
          OCTOBER JAM
        </div>
        <div style={{ fontWeight: 400, fontSize: 28, letterSpacing: "0.3em", paddingLeft: "0.3em", marginTop: 14 }}>2026</div>
      </div>
      {quotes.map(([at, q, who, colour], i) => {
        const v = smooth((t - at) / 0.35);
        if (v <= 0) return null;
        const odd = who === "???";
        const jit = odd && Math.floor((t - at) * 8) % 5 === 0 ? (rand(f) - 0.5) * 16 : 0;
        return (
          <div key={i} style={{ position: "absolute", left: 0, top: H * (0.44 + i * 0.12), width: W, textAlign: "center", opacity: v, transform: `translate(${jit.toFixed(1)}px, ${(14 * (1 - v)).toFixed(1)}px)` }}>
            <div style={{ fontFamily: i === 0 ? "Inter" : "Cormorant Garamond", fontStyle: i === 0 ? "normal" : "italic", fontWeight: 600, fontSize: i === 0 ? 54 : 58, letterSpacing: i === 0 ? "0.12em" : "0", color: i === 0 ? "#ffd77a" : colour, textShadow: odd ? `0 0 18px ${VIOLET}` : undefined }}>{q}</div>
            <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 28, letterSpacing: "0.32em", paddingLeft: "0.32em", color: odd ? VIOLET : "#bdb6aa", marginTop: 12 }}>— {who}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the title */

const Title: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.title2, S.fadeOut + 0.6, 0.9, 0.6);
  if (k <= 0) return null;
  const u = t - S.title2;
  return (
    <AbsoluteFill style={{ opacity: k, alignItems: "center" }}>
      <div style={{ position: "absolute", top: H * 0.33, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: "Cinzel", fontWeight: 400, fontSize: 34, letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#c9c2b5", opacity: smooth((u - 0.3) / 0.6) }}>A SMALL GAME ABOUT</div>
        <div style={{ fontFamily: "Cinzel", fontWeight: 400, fontSize: 34, letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#c9c2b5", opacity: smooth((u - 0.3) / 0.6), marginTop: 10 }}>A VERY BIG WORLD</div>
        <div style={{ marginTop: 60, fontFamily: "Cinzel", fontWeight: 700, fontSize: 84, letterSpacing: `${(0.08 + 0.12 * (1 - easeOut(u / 2.2))).toFixed(3)}em`, color: CREAM, whiteSpace: "nowrap", textShadow: "0 0 30px rgba(255,220,170,0.25)" }}>THE THIRD</div>
        <div style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 84, letterSpacing: `${(0.08 + 0.12 * (1 - easeOut(u / 2.2))).toFixed(3)}em`, color: CREAM, whiteSpace: "nowrap", textShadow: "0 0 30px rgba(255,220,170,0.25)" }}>DIRECTION</div>
        <div style={{ marginTop: 56, height: 1, width: (W * 0.4 * easeOut((u - 0.8) / 0.8)) | 0, backgroundColor: CREAM, opacity: 0.6 }} />
        <div style={{ marginTop: 44, fontFamily: "Inter", fontWeight: 600, fontSize: 30, letterSpacing: "0.36em", paddingLeft: "0.36em", color: CREAM, opacity: smooth((u - 1.2) / 0.5) }}>NOW PLAYING · FREE ON RUN</div>
        <div style={{ marginTop: 26, fontFamily: "Inter", fontWeight: 600, fontSize: 28, letterSpacing: "0.3em", paddingLeft: "0.3em", color: "#ff9aac", opacity: smooth((u - 1.7) / 0.5) }}>♥ VOTE IN THE OCTOBER JAM</div>
      </div>
    </AbsoluteFill>
  );
};
