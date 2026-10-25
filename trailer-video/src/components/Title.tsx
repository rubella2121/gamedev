import { fitText } from "@remotion/layout-utils";
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import cues from "../data/cues.json";
import { easeInOut, easeOut, FPS, H, smooth, W } from "../lib/time";
import { SANS, SERIF } from "./Words";

const C = cues;
const GOLD = "#ffd77a";
const NAME = "THE THIRD DIRECTION";

/** the eight corners of a cube, stretched by (sx, sy, sz): a line, then a square, then the cube */
const corners = (sx: number, sy: number, sz: number) =>
  Array.from({ length: 8 }, (_, i) => [((i & 1) * 2 - 1) * sx, (((i >> 1) & 1) * 2 - 1) * sy, (((i >> 2) & 1) * 2 - 1) * sz]);
const EDGES: [number, number][] = [];
for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) if ([1, 2, 4].includes(a ^ b)) EDGES.push([a, b]);

const project = (p: number[], yaw: number, pitch: number, size: number, cx: number, cy: number) => {
  const [x0, y0, z0] = p as [number, number, number];
  const x1 = x0 * Math.cos(yaw) + z0 * Math.sin(yaw);
  const z1 = -x0 * Math.sin(yaw) + z0 * Math.cos(yaw);
  const y2 = y0 * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = y0 * Math.sin(pitch) + z1 * Math.cos(pitch);
  const f = 7 / (7 + z2);
  return [cx + x1 * f * size, cy - y2 * f * size];
};

export const Title: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const T = t - C.title;
  if (T < 0 || t > C.fadeOut + 0.7) return null;
  const fade = 1 - smooth((t - C.fadeOut) / 0.6);
  // the cube: shot out as a line on the hit, opened into a square, pulled out into the third direction
  const sx = easeOut(T / 0.5);
  const sy = easeInOut((T - 0.45) / 0.55);
  const sz = easeInOut((T - 1.0) / 0.9);
  const spin = Math.max(0, T - 1.0);
  const yaw = 0.55 * spin + 0.25 * easeInOut(spin / 1.2);
  const pitch = 0.42 * easeInOut((T - 1.0) / 1.2);
  const cy = H * (0.36 + 0.012 * Math.sin(T * 1.3));
  const pts = corners(sx, sy, sz).map((p) => project(p, yaw, pitch, W * 0.17, W / 2, cy));
  const pulse = 1 + 0.6 * Math.exp(-T / 0.3) + (t > C.playNow ? 0.5 * Math.exp(-(t - C.playNow) / 0.4) : 0);
  // the name, letter by letter
  const nameT = t - C.name;
  const sweep = (t - (C.name + 1.25)) / 0.9;
  const ask = t - C.ask;
  const play = t - C.playNow;
  const size = Math.min(80, fitText({ text: NAME, withinWidth: W * 0.88, fontFamily: SERIF, fontWeight: 900, letterSpacing: "0.06em" }).fontSize);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 40% at 50% 38%, rgba(30,70,80,${0.55 * smooth(T / 1.2)}), rgba(0,0,0,0) 70%)` }} />
      <svg width={W} height={H} style={{ position: "absolute", filter: `drop-shadow(0 0 ${14 * pulse}px ${GOLD}) drop-shadow(0 0 ${36 * pulse}px rgba(255,190,90,0.7))` }}>
        {EDGES.map(([a, b], i) => (
          <line key={i} x1={pts[a]![0]} y1={pts[a]![1]} x2={pts[b]![0]} y2={pts[b]![1]} stroke="#fff1c8" strokeWidth={4} strokeLinecap="round" />
        ))}
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={6} fill="#fff6dc" />
        ))}
      </svg>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.565 }}>
        <div style={{ display: "flex", whiteSpace: "pre" }}>
          {NAME.split("").map((ch, i) => {
            const u = nameT - i * 0.04;
            const s = 1 + 1.4 * (1 - easeOut(u / 0.4));
            const o = smooth(u / 0.18);
            const x = (i / (NAME.length - 1)) * 1.2 - 0.1;
            const shine = sweep > 0 && sweep < 1 ? Math.exp(-(((x - sweep * 1.4 + 0.2) / 0.1) ** 2)) : 0;
            return (
              <span
                key={i}
                style={{
                  fontFamily: SERIF,
                  fontWeight: 900,
                  fontSize: size,
                  letterSpacing: "0.06em",
                  display: "inline-block",
                  opacity: u > 0 ? o : 0,
                  transform: `scale(${u > 0 ? s : 2.4})`,
                  color: shine > 0.2 ? "#ffffff" : "#fff1d0",
                  textShadow: `0 0 ${16 + 30 * Math.exp(-Math.max(0, u) / 0.2) + 40 * shine}px ${GOLD}, 0 0 50px rgba(255,180,80,0.5), 0 4px 0 rgba(0,0,0,0.85)`,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>
        <div style={{ marginTop: 26, height: 2, width: (W * 0.62 * easeOut((t - (C.name + 0.95)) / 0.6)) | 0, background: GOLD, boxShadow: `0 0 14px ${GOLD}` }} />
        <div
          style={{
            marginTop: 34,
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 40,
            color: "#e8fffb",
            letterSpacing: `${0.62 - 0.2 * easeOut(ask / 1.6)}em`,
            paddingLeft: `${0.62 - 0.2 * easeOut(ask / 1.6)}em`,
            opacity: smooth(ask / 0.7),
            textShadow: "0 0 18px rgba(159,244,238,0.6)",
          }}
        >
          DON&apos;T LOOK UP.
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.78, opacity: smooth(play / 0.4) }}>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 38,
            letterSpacing: "0.34em",
            paddingLeft: "0.34em",
            color: "#fff",
            padding: "20px 54px 20px 64px",
            border: `3px solid ${GOLD}`,
            borderRadius: 60,
            boxShadow: `0 0 ${20 + 18 * (0.5 + 0.5 * Math.cos((play * Math.PI) / 0.6))}px ${GOLD}, inset 0 0 18px rgba(255,215,122,0.35)`,
            textShadow: `0 0 14px ${GOLD}`,
          }}
        >
          PLAY NOW
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
