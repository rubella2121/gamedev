import { fitText } from "@remotion/layout-utils";
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import lines from "../data/lines.json";
import voice from "../data/voice.json";
import { CUTS } from "../edit";
import { clamp, easeOut, FPS, H, rand, smooth, W } from "../lib/time";

export const SERIF = "Cinzel";
export const ITALIC = "Cormorant Garamond";
export const SANS = "Inter";

/* ------------------------------------------------------------------------------------------------ names */

/** a monster's name, slammed in on its cut: big, then settling, with what it is typed above it */
export const Names: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const c = CUTS.find((k) => k.name && t >= k.at + 0.03 && t < k.end - 0.03);
  if (!c || !c.name) return null;
  const { text, sub, colour } = c.name;
  const u = t - c.at;
  const len = c.end - c.at;
  const out = smooth((t - (c.end - 0.14)) / 0.12);
  const s = 1.5 - 0.5 * easeOut(u / 0.18) + 0.03 * (u / len) + 0.05 * out;
  const op = smooth(u / 0.05) * (1 - out);
  const size = Math.min(150, fitText({ text, withinWidth: W * 0.86, fontFamily: SERIF, fontWeight: 900, letterSpacing: "0.04em" }).fontSize);
  const typed = sub.slice(0, Math.floor(clamp((u - 0.08) / 0.025, 0, sub.length)));
  const j = u > 0.16 ? 14 * Math.exp(-(u - 0.16) / 0.08) : 0;
  const dx = (rand(Math.floor(t * 60)) - 0.5) * 2 * j;
  const dy = (rand(Math.floor(t * 60) + 9) - 0.5) * 2 * j;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.71, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 30, letterSpacing: "0.42em", color: colour, textShadow: "0 2px 8px rgba(0,0,0,0.9)", marginBottom: 14, minHeight: 36, paddingLeft: "0.42em" }}>
        {typed}
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: "0.04em",
          color: "#fff8f0",
          transform: `translate(${dx}px, ${dy}px) scale(${s})`,
          textShadow: `0 0 ${18 + 40 * Math.exp(-u / 0.15)}px ${colour}, 0 0 60px ${colour}, 0 4px 0 rgba(0,0,0,0.85)`,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <div style={{ marginTop: 18, height: 3, width: (W * 0.6 * easeOut((u - 0.08) / 0.3)) | 0, background: colour, boxShadow: `0 0 18px ${colour}` }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the story card */

/** "THERE IS A / THIRD DIRECTION": wiped up into view line by line, the letters drawing together */
export const Card: React.FC<{ at: number; end: number; lines: string[]; y?: number }> = ({ at, end, lines: ls, y = 0.74 }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > end) return null;
  const out = smooth((t - (end - 0.45)) / 0.45);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * y, opacity: 1 - out }}>
      {ls.map((ln, i) => {
        const p = easeOut((t - at - i * 0.28) / 0.7);
        // sized in the real font so that, drawn together (0.1em apart), the line fills nine tenths of the frame at most
        const size = Math.min(i === 0 ? 70 : 100, fitText({ text: ln, withinWidth: W * 0.9, fontFamily: SERIF, fontWeight: 700, letterSpacing: "0.1em" }).fontSize);
        const sp = 0.24 - 0.14 * p;
        return (
          <div key={i} style={{ overflow: "hidden", height: 118 }}>
            <div
              style={{
                fontFamily: SERIF,
                fontWeight: 700,
                fontSize: size,
                lineHeight: "118px",
                letterSpacing: `${sp}em`,
                paddingLeft: `${sp}em`,
                color: "#fff3d6",
                transform: `translateY(${(1 - p) * 118}px)`,
                textShadow: "0 0 30px rgba(255,200,120,0.75), 0 0 70px rgba(255,170,80,0.45), 0 4px 0 rgba(0,0,0,0.8)",
                whiteSpace: "nowrap",
              }}
            >
              {ln}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ what she says */

type Line = { id: string; caption: string | null; style: string };
const DUR: Record<string, { at: number; dur: number }> = Object.fromEntries((voice as { id: string; at: number; dur: number }[]).map((v) => [v.id, v]));

/** her words, quietly, low on the screen (for everyone watching with the sound off) */
export const Captions: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const ln = (lines as Line[]).find((l) => {
    const d = DUR[l.id];
    return l.caption && d && t >= d.at - 0.05 && t < d.at + d.dur + 0.35;
  });
  if (!ln || !ln.caption) return null;
  const d = DUR[ln.id]!;
  const op = smooth((t - (d.at - 0.05)) / 0.2) * (1 - smooth((t - (d.at + d.dur + 0.1)) / 0.25));
  const far = ln.style === "far";
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.865, opacity: op }}>
      <div
        style={{
          fontFamily: ITALIC,
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: 54,
          color: far ? "#d6ecf0" : "#f6efe2",
          letterSpacing: far ? "0.06em" : "0.01em",
          textShadow: "0 2px 14px rgba(0,0,0,0.95), 0 0 30px rgba(0,0,0,0.7)",
          textAlign: "center",
          maxWidth: W * 0.86,
          filter: far ? `blur(${(1.2 * (1 - smooth((t - d.at) / 0.6))).toFixed(2)}px)` : undefined,
        }}
      >
        {ln.caption}
      </div>
    </AbsoluteFill>
  );
};
