import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { backOut, easeOut, FPS, H, smooth, W } from "../lib/time";
import { GOLD, RED } from "../lib/colours";
import { Cube, Name } from "./Title";
import { SANS, SERIF } from "./Words";

/**
 * Every promo ends here: the cube shoots out on the hit, the name comes in letter by letter, then what to do about it - play
 * it free on RUN, and vote for it in the October Jam. All of it sits in the middle of the frame, clear of the buttons and the
 * caption a phone lays over the bottom and the right of a reel.
 */
export const EndCard: React.FC<{ at: number; fade: number; tag?: string }> = ({ at, fade, tag }) => {
  const t = useCurrentFrame() / FPS;
  const T = t - at;
  if (T < 0 || t > fade + 0.7) return null;
  const out = 1 - smooth((t - fade) / 0.6);
  const play = T - 1.55;
  const vote = T - 1.95;
  const pulse = 1 + 0.6 * Math.exp(-T / 0.3) + (play > 0 ? 0.4 * Math.exp(-play / 0.4) : 0);
  const cy = H * (0.27 + 0.01 * Math.sin(T * 1.3));
  // the heart beats
  const beat = vote > 0.3 ? Math.exp(-(((vote - 0.3) % 0.8) / 0.12)) : 0;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 45% at 50% 34%, rgba(30,70,80,${(0.6 * smooth(T / 1.0)).toFixed(3)}), rgba(0,0,0,0) 70%)` }} />
      <Cube T={T} cy={cy} size={W * 0.15} pulse={pulse} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.425 }}>
        <Name T={T - 0.35} />
        <div style={{ marginTop: 24, height: 2, width: (W * 0.62 * easeOut((T - 1.0) / 0.6)) | 0, background: GOLD, boxShadow: `0 0 14px ${GOLD}` }} />
        {tag ? (
          <div
            style={{
              marginTop: 26,
              fontFamily: SERIF,
              fontWeight: 400,
              fontSize: 38,
              color: "#e8fffb",
              letterSpacing: `${0.5 - 0.16 * easeOut((T - 1.1) / 1.4)}em`,
              paddingLeft: `${0.5 - 0.16 * easeOut((T - 1.1) / 1.4)}em`,
              opacity: smooth((T - 1.1) / 0.6),
              textShadow: "0 0 18px rgba(159,244,238,0.6)",
            }}
          >
            {tag}
          </div>
        ) : null}
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.6 }}>
        <div
          style={{
            opacity: smooth(play / 0.15),
            transform: `scale(${(0.4 + 0.6 * backOut(play / 0.3)).toFixed(3)})`,
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: "0.2em",
            color: "#fff",
            padding: "22px 46px 22px 54px",
            border: `3px solid ${GOLD}`,
            borderRadius: 60,
            backgroundColor: "rgba(20,14,4,0.55)",
            boxShadow: `0 0 ${(20 + 14 * (0.5 + 0.5 * Math.cos((play * Math.PI) / 0.6))).toFixed(1)}px ${GOLD}, inset 0 0 18px rgba(255,215,122,0.35)`,
            textShadow: `0 0 14px ${GOLD}`,
            whiteSpace: "nowrap",
          }}
        >
          PLAY FREE ON RUN
        </div>
        <div
          style={{
            marginTop: 44,
            display: "flex",
            alignItems: "center",
            gap: 22,
            opacity: smooth(vote / 0.15),
            transform: `scale(${(0.4 + 0.6 * backOut(vote / 0.3)).toFixed(3)})`,
          }}
        >
          <svg width={64} height={58} viewBox="0 0 32 29" style={{ transform: `scale(${(1 + 0.22 * beat).toFixed(3)})`, filter: `drop-shadow(0 0 ${(10 + 16 * beat).toFixed(1)}px ${RED})` }}>
            <path d="M16 28 C 7 21 1 15.5 1 9 C 1 4.5 4.5 1 9 1 C 12 1 14.5 2.6 16 5 C 17.5 2.6 20 1 23 1 C 27.5 1 31 4.5 31 9 C 31 15.5 25 21 16 28 Z" fill={RED} stroke="#ffd0d6" strokeWidth={1.5} />
          </svg>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 60, letterSpacing: "0.04em", color: "#fff", textShadow: `0 0 22px rgba(255,74,90,0.75), 0 4px 0 rgba(0,0,0,0.8)`, whiteSpace: "nowrap" }}>
            VOTE FOR US
          </div>
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: SANS,
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: "0.42em",
            paddingLeft: "0.42em",
            color: "#9ff4ee",
            opacity: smooth((vote - 0.25) / 0.4),
            textShadow: "0 0 14px rgba(127,244,234,0.6), 0 2px 0 rgba(0,0,0,0.8)",
          }}
        >
          RUN · OCTOBER JAM
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
