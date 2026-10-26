import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { GOLD, RED } from "../lib/colours";
import { FPS, H, smooth } from "../lib/time";
import { SANS } from "./Words";

/**
 * The boss rush's tally, at the top of the screen: one diamond for every boss, lit (with a pop and a ring) as each one comes
 * up. After the last, one more that nobody has seen: a red "?", beating.
 */
export const Rush: React.FC<{ at: number[]; end: number; mystery: number }> = ({ at, end, mystery }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at[0]! - 0.2 || t > end) return null;
  const op = smooth((t - (at[0]! - 0.2)) / 0.2) * (1 - smooth((t - (end - 0.15)) / 0.15));
  const lit = at.filter((a) => t >= a).length;
  const q = t - mystery;
  const beat = q > 0 ? 0.5 + 0.5 * Math.cos((q * Math.PI * 2) / 0.8) : 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.115, opacity: op }}>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, letterSpacing: "0.5em", paddingLeft: "0.5em", color: "#fff", textShadow: "0 0 16px rgba(0,0,0,0.9), 0 3px 0 rgba(0,0,0,0.7)" }}>
        BOSS RUSH <span style={{ color: GOLD, textShadow: `0 0 16px ${GOLD}, 0 3px 0 rgba(0,0,0,0.7)` }}>{String(lit).padStart(2, "0")}</span>
      </div>
      <div style={{ display: "flex", gap: 22, marginTop: 22, alignItems: "center" }}>
        {at.map((a, i) => {
          const u = t - a;
          const on = u >= 0;
          const pop = on ? 1 + 0.9 * Math.exp(-u / 0.12) : 1;
          const ring = on && u < 0.45 ? u / 0.45 : -1;
          return (
            <div key={i} style={{ position: "relative", width: 26, height: 26 }}>
              {ring >= 0 ? (
                <div
                  style={{
                    position: "absolute",
                    left: 13 - 40 * ring,
                    top: 13 - 40 * ring,
                    width: 80 * ring,
                    height: 80 * ring,
                    borderRadius: "50%",
                    border: `3px solid rgba(255,215,122,${(1 - ring).toFixed(2)})`,
                  }}
                />
              ) : null}
              <div
                style={{
                  width: 26,
                  height: 26,
                  transform: `rotate(45deg) scale(${pop.toFixed(3)})`,
                  backgroundColor: on ? GOLD : "rgba(0,0,0,0.45)",
                  border: `3px solid ${on ? "#fff4d0" : "rgba(255,255,255,0.45)"}`,
                  boxShadow: on ? `0 0 18px ${GOLD}, 0 0 40px rgba(255,190,90,0.6)` : "0 0 10px rgba(0,0,0,0.8)",
                }}
              />
            </div>
          );
        })}
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 32,
            color: q > 0 ? "#fff" : "rgba(255,255,255,0.45)",
            border: `3px solid ${q > 0 ? RED : "rgba(255,255,255,0.45)"}`,
            backgroundColor: q > 0 ? `rgba(120,10,24,${(0.4 + 0.4 * beat).toFixed(2)})` : "rgba(0,0,0,0.45)",
            boxShadow: q > 0 ? `0 0 ${(14 + 26 * beat).toFixed(1)}px ${RED}` : "0 0 10px rgba(0,0,0,0.8)",
            transform: `scale(${(1 + 0.12 * beat).toFixed(3)})`,
          }}
        >
          ?
        </div>
      </div>
    </AbsoluteFill>
  );
};
