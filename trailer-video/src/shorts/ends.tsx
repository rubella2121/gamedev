/**
 * The shorts' end cards: each in its short's own look, all saying the same thing - play it free on RUN, vote for it in the
 * October Jam - in the middle of the frame, clear of what a phone lays over a reel.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { GOLD, RED } from "../lib/colours";
import { MARKER, PIXEL, POSTER, TERM } from "../lib/fonts";
import { backOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Ring, Tesseract } from "./kit";

const HEART = "M16 28 C 7 21 1 15.5 1 9 C 1 4.5 4.5 1 9 1 C 12 1 14.5 2.6 16 5 C 17.5 2.6 20 1 23 1 C 27.5 1 31 4.5 31 9 C 31 15.5 25 21 16 28 Z";

/** the heart, beating (every 0.8 s from `t0`) */
const Heart: React.FC<{ t: number; size: number; colour: string }> = ({ t, size, colour }) => {
  const beat = t > 0 ? Math.exp(-((t % 0.8) / 0.12)) : 0;
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 32 29" style={{ transform: `scale(${(1 + 0.22 * beat).toFixed(3)})`, filter: `drop-shadow(0 0 ${(10 + 16 * beat).toFixed(1)}px ${colour})` }}>
      <path d={HEART} fill={colour} stroke="#ffe0e6" strokeWidth={1.5} />
    </svg>
  );
};

const pop = (u: number) => ({ opacity: smooth(u / 0.12), transform: `scale(${(0.4 + 0.6 * backOut(u / 0.3)).toFixed(3)})` });
const out = (t: number, fade: number) => 1 - smooth((t - fade) / 0.6);

/* ------------------------------------------------------------------------------------------------ the Fourth */

/** black; its shape, turning, its eye open; the name, which for a few frames is not the name it should be */
export const EndFourth: React.FC<{ at: number; fade: number; colour: string }> = ({ at, fade, colour }) => {
  const t = useCurrentFrame() / FPS;
  const T = t - at;
  if (T < 0 || t > fade + 0.7) return null;
  // for a few frames here and there the title reads FOURTH
  const f = Math.floor(T * FPS);
  const wrong = (T > 0.9 && T < 1.0) || (T > 2.3 && T < 2.36) || (T > 2.9 && T < 3.05);
  const jit = wrong ? (rand(f) - 0.5) * 18 : 0;
  const play = T - 1.5;
  const vote = T - 1.9;
  return (
    <AbsoluteFill style={{ opacity: out(t, fade) }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 40% at 50% 28%, rgba(90,50,160,${(0.45 * smooth(T / 1)).toFixed(3)}), rgba(0,0,0,0) 70%)` }} />
      <Tesseract T={T + 3} cx={W / 2} cy={H * 0.27} size={W * 0.2} colour={colour} grow={easeOut(T / 0.7)} eye={smooth((T - 0.6) / 0.5)} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.47 }}>
        <div
          style={{
            fontFamily: "Cinzel",
            fontWeight: 900,
            fontSize: 74,
            letterSpacing: "0.05em",
            color: wrong ? "#e9dcff" : "#fff1d0",
            opacity: smooth((T - 0.4) / 0.4),
            transform: `translateX(${jit}px)`,
            textShadow: wrong ? `-6px 0 0 rgba(255,40,80,0.8), 6px 0 0 rgba(60,200,255,0.8), 0 0 30px ${colour}` : `0 0 22px ${GOLD}, 0 4px 0 rgba(0,0,0,0.85)`,
            whiteSpace: "nowrap",
          }}
        >
          {wrong ? "THE FOURTH DIRECTION" : "THE THIRD DIRECTION"}
        </div>
        <div style={{ marginTop: 26, height: 2, width: (W * 0.62 * easeOut((T - 0.9) / 0.6)) | 0, background: colour, boxShadow: `0 0 14px ${colour}` }} />
        <div style={{ marginTop: 24, fontFamily: TERM, fontSize: 52, color: "#cdbfff", letterSpacing: "0.12em", opacity: smooth((T - 1.0) / 0.5), textShadow: `0 0 14px ${colour}` }}>
          THIS IS NOT THE END.
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.63 }}>
        <div
          style={{
            ...pop(play),
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: "0.2em",
            color: "#fff",
            padding: "22px 46px 22px 54px",
            border: `3px solid ${colour}`,
            borderRadius: 60,
            backgroundColor: "rgba(20,8,40,0.6)",
            boxShadow: `0 0 26px ${colour}, inset 0 0 18px rgba(185,162,255,0.35)`,
            whiteSpace: "nowrap",
          }}
        >
          PLAY FREE ON RUN
        </div>
        <div style={{ ...pop(vote), marginTop: 44, display: "flex", alignItems: "center", gap: 22 }}>
          <Heart t={vote - 0.3} size={64} colour={RED} />
          <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 60, color: "#fff", textShadow: `0 0 22px rgba(255,74,90,0.75), 0 4px 0 rgba(0,0,0,0.8)`, whiteSpace: "nowrap" }}>VOTE FOR US</div>
        </div>
        <div style={{ marginTop: 18, fontFamily: "Inter", fontWeight: 600, fontSize: 28, letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#cdbfff", opacity: smooth((vote - 0.25) / 0.4) }}>
          RUN · OCTOBER JAM
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the arcade */

/** an arcade's attract screen: the name in pixels, play and vote, and PRESS START blinking */
export const EndArcade: React.FC<{ at: number; fade: number }> = ({ at, fade }) => {
  const t = useCurrentFrame() / FPS;
  const T = t - at;
  if (T < 0 || t > fade + 0.7) return null;
  const blink = Math.floor(T * 2.5) % 2 === 0;
  const glow = (c: string) => `0 0 12px ${c}, 0 0 30px ${c}, 4px 4px 0 #000`;
  return (
    <AbsoluteFill style={{ opacity: out(t, fade), alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.2 }}>
      <div style={{ ...pop(T - 0.0), fontFamily: PIXEL, fontSize: 30, color: "#7ff4ea", textShadow: glow("#3ad6cc"), textAlign: "center", lineHeight: 1.6 }}>
        WHO WOULD YOU
        <br />
        FIGHT FIRST?
      </div>
      <div style={{ ...pop(T - 0.25), marginTop: 18, fontFamily: PIXEL, fontSize: 24, color: "#fff", textShadow: glow("#888") }}>COMMENT ↓</div>
      <div style={{ ...pop(T - 0.6), marginTop: 90, fontFamily: PIXEL, fontSize: 58, color: GOLD, textShadow: glow("#ff9a3c"), textAlign: "center", lineHeight: 1.35 }}>
        THE THIRD
        <br />
        DIRECTION
      </div>
      <div style={{ ...pop(T - 1.3), marginTop: 70, fontFamily: PIXEL, fontSize: 30, color: "#fff", padding: "22px 30px", border: `5px solid ${GOLD}`, boxShadow: `0 0 20px ${GOLD}, inset 0 0 14px rgba(255,215,122,0.4)`, backgroundColor: "#140c02" }}>
        PLAY FREE ON RUN
      </div>
      <div style={{ ...pop(T - 1.7), marginTop: 46, display: "flex", alignItems: "center", gap: 20 }}>
        <Heart t={T - 2} size={54} colour={RED} />
        <div style={{ fontFamily: PIXEL, fontSize: 40, color: "#fff", textShadow: glow(RED) }}>VOTE FOR US</div>
      </div>
      <div style={{ marginTop: 22, fontFamily: PIXEL, fontSize: 18, color: "#9ff4ee", opacity: smooth((T - 2.0) / 0.3), letterSpacing: "0.1em" }}>RUN · OCTOBER JAM</div>
      <div style={{ marginTop: 60, fontFamily: PIXEL, fontSize: 30, color: "#fff", opacity: T > 2.2 && blink ? 1 : 0, textShadow: glow("#fff") }}>PRESS START</div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the secrets */

/** clean: the name with a marker line under it, "find them all", and VOTE FOR US circled in red */
export const EndSecrets: React.FC<{ at: number; fade: number }> = ({ at, fade }) => {
  const t = useCurrentFrame() / FPS;
  const T = t - at;
  if (T < 0 || t > fade + 0.7) return null;
  return (
    <AbsoluteFill style={{ opacity: out(t, fade) }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.27 }}>
        <div style={{ ...pop(T), fontFamily: "Inter", fontWeight: 800, fontSize: 84, lineHeight: 1.02, color: "#fff", textAlign: "center", textShadow: "0 6px 0 rgba(0,0,0,0.6)" }}>
          THE THIRD
          <br />
          DIRECTION
        </div>
        <svg width={620} height={40} style={{ marginTop: 6 }}>
          <path d="M10 26 Q 160 8 310 22 T 610 16" fill="none" stroke={GOLD} strokeWidth={10} strokeLinecap="round" strokeDasharray={640} strokeDashoffset={640 * (1 - easeOut((T - 0.4) / 0.4))} />
        </svg>
        <div style={{ ...pop(T - 0.8), marginTop: 30, fontFamily: MARKER, fontSize: 60, color: GOLD, transform: `rotate(-3deg) scale(${(0.4 + 0.6 * backOut((T - 0.8) / 0.3)).toFixed(3)})` }}>
          find them all.
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.6 }}>
        <div style={{ ...pop(T - 1.4), fontFamily: "Inter", fontWeight: 800, fontSize: 42, letterSpacing: "0.16em", color: "#111", backgroundColor: GOLD, padding: "20px 40px", borderRadius: 14, whiteSpace: "nowrap" }}>
          PLAY FREE ON RUN
        </div>
        <div style={{ ...pop(T - 1.8), marginTop: 70, display: "flex", alignItems: "center", gap: 20 }}>
          <Heart t={T - 2.1} size={60} colour={RED} />
          <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 64, color: "#fff", whiteSpace: "nowrap", textShadow: "0 5px 0 rgba(0,0,0,0.6)" }}>VOTE FOR US</div>
        </div>
        <div style={{ marginTop: 24, fontFamily: "Inter", fontWeight: 600, fontSize: 28, letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#bfeee9", opacity: smooth((T - 2.1) / 0.4) }}>RUN · OCTOBER JAM</div>
      </AbsoluteFill>
      <Ring at={at + 2.15} end={fade + 0.7} x={W / 2} y={H * 0.6 + 140 + 37} rx={300} ry={92} colour="#ff3b3b" />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the phonk */

/** a poster: the name stacked huge, white with a red edge; play and vote on red bars */
export const EndPhonk: React.FC<{ at: number; fade: number }> = ({ at, fade }) => {
  const t = useCurrentFrame() / FPS;
  const T = t - at;
  if (T < 0 || t > fade + 0.7) return null;
  const word = (s: string, i: number, size: number) => {
    const u = T - i * 0.12;
    return (
      <div
        style={{
          fontFamily: POSTER,
          fontSize: size,
          lineHeight: 0.92,
          color: "#fff",
          opacity: u > 0 ? 1 : 0,
          transform: `scale(${(u > 0 ? 1 + 0.6 * Math.exp(-u / 0.08) : 1).toFixed(3)})`,
          WebkitTextStroke: `4px ${RED}`,
          textShadow: `0 0 30px rgba(255,40,60,0.6), 8px 8px 0 rgba(0,0,0,0.9)`,
          letterSpacing: "0.02em",
        }}
      >
        {s}
      </div>
    );
  };
  const bar = (s: string, u: number, size: number) => (
    <div style={{ opacity: u > 0 ? 1 : 0, transform: `translateX(${((1 - easeOut(u / 0.2)) * -W).toFixed(0)}px)`, backgroundColor: RED, padding: "10px 30px", marginTop: 26 }}>
      <div style={{ fontFamily: POSTER, fontSize: size, color: "#fff", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{s}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ opacity: out(t, fade), alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.2 }}>
      {word("THE", 0, 150)}
      {word("THIRD", 1, 260)}
      {word("DIRECTION", 2, 200)}
      <div style={{ height: 40 }} />
      {bar("PLAY FREE ON RUN", T - 1.0, 74)}
      {bar("♥ VOTE FOR US · OCTOBER JAM", T - 1.4, 58)}
    </AbsoluteFill>
  );
};
