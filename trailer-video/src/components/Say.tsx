import { fitText } from "@remotion/layout-utils";
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { GOLD } from "../lib/colours";
import { backOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { SANS, SERIF } from "./Words";

/**
 * Words on the screen, for everyone scrolling with the sound off. "|" breaks the line. `pop` brings the words in one by one
 * with a little bounce, `slam` drops the whole line in from huge, `hush` lets the letters surface out of a blur, one by one.
 * The `hot` words are drawn in `hue`; `arrow` points down from under the words (at the Blob).
 */
export type Words = {
  at: number;
  end: number;
  text: string;
  hot?: string[];
  hue?: string;
  /** the top of the words, 0..1 of the frame */
  y?: number;
  /** the biggest the type may be (it is made smaller to fit nine tenths of the width) */
  size?: number;
  style?: "pop" | "slam" | "hush";
  arrow?: boolean;
};

const SHADOW = "0 5px 0 rgba(0,0,0,0.6), 0 0 26px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.9)";

export const Say: React.FC<{ words: Words[] }> = ({ words }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <>
      {words.map((w, i) => (t >= w.at && t < w.end ? <Line key={i} w={w} t={t} /> : null))}
    </>
  );
};

const Line: React.FC<{ w: Words; t: number }> = ({ w, t }) => {
  const style = w.style ?? "pop";
  const hush = style === "hush";
  const font = hush ? SERIF : SANS;
  const weight = hush ? 700 : 800;
  const spacing = hush ? "0.22em" : "0.01em";
  const lines = w.text.split("|");
  const size = Math.min(
    w.size ?? (hush ? 76 : 104),
    ...lines.map((ln) => fitText({ text: ln, withinWidth: W * 0.88, fontFamily: font, fontWeight: weight, letterSpacing: spacing }).fontSize),
  );
  const hue = w.hue ?? GOLD;
  const hot = new Set(w.hot ?? []);
  // leaving: up, out of focus, gone
  const outLen = hush ? 0.4 : 0.16;
  const e = smooth((t - (w.end - outLen)) / outLen);
  const u = t - w.at;
  // a slam lands with a jolt
  const j = style === "slam" && u > 0.12 ? 16 * Math.exp(-(u - 0.12) / 0.08) : 0;
  const dx = (rand(Math.floor(t * 60)) - 0.5) * 2 * j;
  const dy = (rand(Math.floor(t * 60) + 9) - 0.5) * 2 * j;
  const slam = style === "slam" ? 2.3 - 1.3 * easeOut(u / 0.14) : 1;
  let k = 0;
  let letter = 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * (w.y ?? 0.2) }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: (1 - e) * (style === "slam" ? smooth(u / 0.05) : 1),
          transform: `translate(${dx}px, ${dy - 34 * e}px) scale(${slam})`,
          filter: e > 0.01 ? `blur(${(8 * e).toFixed(1)}px)` : undefined,
        }}
      >
        {lines.map((ln, li) => (
          <div key={li} style={{ display: "flex", gap: hush ? "0.5em" : "0.26em", whiteSpace: "pre", lineHeight: 1.08 }}>
            {ln.split(" ").map((word, wi) => {
              const isHot = hot.has(word);
              const colour = isHot ? hue : hush ? "#e2f6f4" : "#ffffff";
              const glow = isHot ? `0 0 24px ${hue}, 0 0 60px ${hue}, ` : hush ? "0 0 22px rgba(127,244,234,0.55), " : "";
              if (hush) {
                // letter by letter, each coming into focus
                return (
                  <span key={wi} style={{ display: "inline-flex" }}>
                    {word.split("").map((ch, ci) => {
                      const v = smooth((u - 0.045 * letter++) / 0.5);
                      return (
                        <span
                          key={ci}
                          style={{
                            fontFamily: font,
                            fontWeight: weight,
                            fontSize: size,
                            letterSpacing: spacing,
                            color: colour,
                            opacity: v,
                            filter: v < 0.99 ? `blur(${(10 * (1 - v)).toFixed(1)}px)` : undefined,
                            textShadow: glow + SHADOW,
                          }}
                        >
                          {ch}
                        </span>
                      );
                    })}
                  </span>
                );
              }
              // pop: word by word, up and in with a bounce (a slam brings them all at once)
              const v = style === "pop" ? (u - 0.075 * k++) / 0.24 : 1;
              return (
                <span
                  key={wi}
                  style={{
                    display: "inline-block",
                    fontFamily: font,
                    fontWeight: weight,
                    fontSize: size,
                    letterSpacing: spacing,
                    color: colour,
                    opacity: v > 0 ? smooth(v / 0.4) : 0,
                    transform: `translateY(${(40 * (1 - easeOut(v))).toFixed(1)}px) scale(${(0.35 + 0.65 * backOut(v)).toFixed(3)})`,
                    textShadow: glow + SHADOW,
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        ))}
        {w.arrow ? <Arrow t={u} /> : null}
      </div>
    </AbsoluteFill>
  );
};

/** a fat arrow pointing down, bobbing */
const Arrow: React.FC<{ t: number }> = ({ t }) => {
  const v = smooth((t - 0.3) / 0.2);
  const bob = 16 * Math.sin(t * Math.PI * 4);
  return (
    <svg width={140} height={300} style={{ marginTop: 20, opacity: v, transform: `translateY(${bob.toFixed(1)}px)`, filter: "drop-shadow(0 0 14px rgba(0,0,0,0.9))" }}>
      <path d="M70 10 L70 230 M22 180 L70 236 L118 180" fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M70 10 L70 230 M22 180 L70 236 L118 180" fill="none" stroke="#ffffff" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
