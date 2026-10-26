import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import cues from "../data/cues.json";
import { CUTS } from "../edit";
import { clamp, FPS, H, rand, smooth, W } from "../lib/time";

const C = cues;

/* ------------------------------------------------------------------------------------------------ the hits */

/** every flash: the cuts that come in on one, and the big hits */
const FLASHES: [number, number][] = [
  ...CUTS.filter((c) => c.in === "flash").map((c) => [c.at, 0.9] as [number, number]),
  [C.hookHit, 1],
  [C.boom, 1],
  [C.title, 0.85],
];

/** the white flashes: (time, how bright); the trailer's by default */
export const Flash: React.FC<{ hits?: [number, number][] }> = ({ hits = FLASHES }) => {
  const t = useCurrentFrame() / FPS;
  let o = 0;
  for (const [at, k] of hits) {
    const d = t - at;
    if (d > -0.07 && d < 0.5) o = Math.max(o, k * (d < 0 ? 0.35 * smooth((d + 0.07) / 0.07) : Math.exp(-d / 0.085)));
  }
  return o > 0.004 ? <AbsoluteFill style={{ backgroundColor: "#fff", opacity: o, mixBlendMode: "screen" }} /> : null;
};

/** the impacts that shake the picture: (time, how hard) */
const SHAKES: [number, number][] = [
  [C.hookHit, 1.2],
  [C.slam, 1.2],
  ...C.guardians.map((g) => [g, 0.6] as [number, number]),
  [C.footLands, 1],
  [C.crack, 0.6],
  [C.boom, 1.3],
  [C.reveal, 1],
  ...C.battle.slice(1).map((b) => [b, 0.45] as [number, number]),
  [C.collector, 0.7],
  [C.mash, 0.9],
  ...C.rushCuts.map((r) => [r, 0.5] as [number, number]),
  [C.fall, 1.1],
  [C.lock, 0.6],
  [C.title, 0.9],
  [C.stingOut, 0.8],
];

export const useShake = (shakes: [number, number][] = SHAKES) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  let a = 0;
  for (const [at, k] of shakes) {
    const d = t - at;
    if (d >= 0 && d < 0.6) a = Math.max(a, k * Math.exp(-d / 0.12));
  }
  if (a < 0.01) return "none";
  const s = 26 * a;
  return `translate(${((rand(frame) - 0.5) * 2 * s).toFixed(1)}px, ${((rand(frame + 77) - 0.5) * 2 * s).toFixed(1)}px) rotate(${((rand(frame + 5) - 0.5) * 0.9 * a).toFixed(2)}deg)`;
};

/* ------------------------------------------------------------------------------------------------ the tears */

const GLITCHES = [...CUTS.filter((c) => c.in === "glitch").map((c) => c.at), C.jump, C.hookOut - 0.03, C.stingOut];

/** how torn the picture is now (0 = clean) */
export const useGlitch = (tears: number[] = GLITCHES) => {
  const t = useCurrentFrame() / FPS;
  let s = 0;
  for (const at of tears) {
    const d = t - at;
    if (d > -0.1 && d < 0.2) s = Math.max(s, 1 - Math.abs(d) / (d < 0 ? 0.1 : 0.2));
  }
  return s;
};

/** an SVG filter that splits the colours apart and tears the picture into bands; the strength and the seed change each frame */
export const GlitchDefs: React.FC<{ s: number }> = ({ s }) => {
  const frame = useCurrentFrame();
  const off = (14 * s).toFixed(1);
  return (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <filter id="tear" x="-5%" y="0" width="110%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={`0.0005 ${0.035 + 0.02 * rand(frame)}`} numOctaves={1} seed={frame % 97} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={160 * s} xChannelSelector="R" yChannelSelector="A" result="d" />
        <feColorMatrix in="d" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
        <feOffset in="r" dx={off} dy="0" result="r2" />
        <feColorMatrix in="d" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
        <feOffset in="gb" dx={`-${off}`} dy="0" result="gb2" />
        <feBlend in="r2" in2="gb2" mode="screen" />
      </filter>
    </svg>
  );
};

/* ------------------------------------------------------------------------------------------------ the look */

/** warm light spilling across the picture at its gentlest and its biggest moments */
const LEAKS: [number, number][] = [
  [C.boom + 0.2, 2.8],
  [C.family + 0.6, 4.0],
  [C.title - 0.1, 2.6],
  [C.playNow - 0.4, 2.4],
];

/** (start, how long) of each spill of light; the trailer's by default */
export const Leaks: React.FC<{ leaks?: [number, number][] }> = ({ leaks = LEAKS }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <>
      {leaks.map(([t0, d], i) => {
        const u = (t - t0) / d;
        if (u < 0 || u > 1) return null;
        const k = Math.sin(Math.PI * u) ** 2;
        const x = -20 + 140 * u;
        const y = 20 + 40 * u;
        return (
          <AbsoluteFill
            key={i}
            style={{
              mixBlendMode: "screen",
              opacity: 0.55 * k,
              background: `radial-gradient(ellipse 60% 45% at ${x}% ${y}%, rgba(255,170,90,0.9), rgba(255,90,60,0.35) 45%, rgba(0,0,0,0) 70%), radial-gradient(ellipse 40% 30% at ${x - 30}% ${y + 25}%, rgba(255,110,170,0.6), rgba(0,0,0,0) 70%)`,
            }}
          />
        );
      })}
    </>
  );
};

/** the grade, the vignette and the film grain, over everything but the words */
export const Look: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <AbsoluteFill style={{ mixBlendMode: "soft-light", opacity: 0.55, background: "linear-gradient(180deg, rgba(10,110,130,0.55) 0%, rgba(20,40,60,0.2) 50%, rgba(255,150,70,0.35) 100%)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.62) 100%)" }} />
      <Img
        src={staticFile(`grain/g${frame % 8}.png`)}
        style={{ position: "absolute", left: 0, top: 0, width: W, height: H, mixBlendMode: "overlay", opacity: 0.2 }}
      />
    </>
  );
};

/** the clamp the effects use to fade a layer in and out by time */
export const fadeAt = (t: number, t0: number, t1: number, fin = 0.3, fout = 0.3) =>
  t < t0 || t > t1 ? 0 : clamp(Math.min((t - t0) / fin, (t1 - t) / fout));

/* ------------------------------------------------------------------------------------------------ the blocks */

const BW = W / 9;
const BH = H / 16;

/**
 * A cut hidden behind the game's own cubes: dark blocks with glowing edges sweep up over the picture from the bottom left,
 * cover it completely on the cut, then sweep away the same way, showing the next shot.
 */
export const Blocks: React.FC<{ at: number[] }> = ({ at }) => {
  const t = useCurrentFrame() / FPS;
  const a = at.find((x) => Math.abs(t - x) < 0.25);
  if (a === undefined) return null;
  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 9; c++) {
      const i = r * 9 + c;
      const p = clamp((c / 8 + (1 - r / 15)) / 2 * 0.88 + 0.12 * rand(i + 40));
      const k = smooth((t - (a - 0.22 + 0.12 * p)) / 0.1) * (1 - smooth((t - (a + 0.02 + 0.12 * p)) / 0.1));
      if (k < 0.01) continue;
      const w = (BW + 1) * k;
      const h = (BH + 1) * k;
      tiles.push(
        <div
          key={i}
          style={{
            position: "absolute",
            left: c * BW + (BW - w) / 2,
            top: r * BH + (BH - h) / 2,
            width: w,
            height: h,
            backgroundColor: "#04090c",
            boxShadow: `inset 0 0 0 2px rgba(127,244,234,${(0.6 * k).toFixed(2)}), 0 0 18px rgba(127,244,234,${(0.3 * k).toFixed(2)})`,
          }}
        />,
      );
    }
  }
  return <AbsoluteFill>{tiles}</AbsoluteFill>;
};
