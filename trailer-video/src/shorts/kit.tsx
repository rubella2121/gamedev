/**
 * What the shorts are built from, over the trailer's own pieces: footage in a box, words typed or subtitled, an old tape's
 * scanlines, the Fourth's shape (a cube inside a cube, turning through itself), a marker pen's circles and arrows, drifting
 * lights, and the frames that flash in negative on a hit.
 */
import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import { MARKER, TERM } from "../lib/fonts";
import { clamp, easeInOut, easeOut, F, FPS, H, rand, smooth, W } from "../lib/time";

/* ------------------------------------------------------------------------------------------------ footage in a box */

export type ClipProps = {
  clip: string;
  /** when it starts (seconds, in the composition), the clip's frame then, and how long */
  at: number;
  from: number;
  dur: number;
  rate?: number;
  /** the box (pixels); the picture covers it, zoomed by z around the point c (0..1 of the picture) */
  box?: [number, number, number, number];
  z?: number;
  c?: [number, number];
  pixel?: boolean;
  filter?: string;
};

/** a clip of footage filling a box (by default the whole frame), cropped to cover it */
export const Clip: React.FC<ClipProps> = (p) => (
  <Sequence from={F(p.at)} durationInFrames={Math.max(1, F(p.dur))} layout="none">
    <ClipBody {...p} />
  </Sequence>
);

const ClipBody: React.FC<ClipProps> = ({ clip, from, rate = 1, box = [0, 0, W, H], z = 1, c = [0.5, 0.5], pixel, filter }) => {
  const [bx, by, bw, bh] = box;
  const s = Math.max(bw / W, bh / H) * z;
  const tx = clamp(bw / 2 - c[0] * W * s, bw - W * s, 0);
  const ty = clamp(bh / 2 - c[1] * H * s, bh - H * s, 0);
  return (
    <div style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile(`clips/${clip}.mp4`)}
        trimBefore={Math.max(0, Math.round(from))}
        playbackRate={rate}
        muted
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
          imageRendering: pixel ? "pixelated" : "auto",
          filter: filter ?? (pixel ? "brightness(1.22) contrast(1.1) saturate(1.28)" : "brightness(1.13) contrast(1.1) saturate(1.16)"),
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ words */

/** text typed out a character at a time from `at` (cps characters a second), with a block cursor that blinks after */
export const Typed: React.FC<{
  at: number;
  end: number;
  text: string;
  cps?: number;
  y: number;
  size: number;
  colour: string;
  font?: string;
  glow?: string;
  cursor?: boolean;
  align?: "center" | "left";
}> = ({ at, end, text, cps = 28, y, size, colour, font = TERM, glow, cursor = true, align = "center" }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > end) return null;
  const n = Math.floor((t - at) * cps);
  const shown = text.slice(0, n);
  const done = n >= text.length;
  const blink = done ? Math.floor((t - at) * 2.5) % 2 === 0 : true;
  const out = 1 - smooth((t - (end - 0.15)) / 0.15);
  return (
    <AbsoluteFill style={{ alignItems: align === "center" ? "center" : "flex-start", justifyContent: "flex-start", paddingTop: H * y, paddingLeft: align === "left" ? 80 : 0, opacity: out }}>
      <div
        style={{
          fontFamily: font,
          fontSize: size,
          lineHeight: 1.15,
          color: colour,
          whiteSpace: "pre-wrap",
          textAlign: align,
          maxWidth: W * 0.88,
          textShadow: `0 0 18px ${glow ?? colour}, 0 3px 0 rgba(0,0,0,0.85)`,
        }}
      >
        {shown}
        {cursor ? <span style={{ opacity: blink ? 1 : 0, backgroundColor: colour, color: "transparent", marginLeft: 4 }}>_</span> : null}
      </div>
    </AbsoluteFill>
  );
};

/** a line said in a cutscene, subtitled the way the game does it: who says it, small, over what is said */
export const Subtitle: React.FC<{ at: number; end: number; who?: string; text: string; colour: string; y?: number; size?: number; font?: string }> = ({
  at,
  end,
  who,
  text,
  colour,
  y = 0.66,
  size = 58,
  font = "Cormorant Garamond",
}) => {
  const t = useCurrentFrame() / FPS;
  if (t < at - 0.1 || t > end + 0.3) return null;
  const op = smooth((t - at) / 0.25) * (1 - smooth((t - end) / 0.3));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * y, opacity: op }}>
      {who ? (
        <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 26, letterSpacing: "0.5em", paddingLeft: "0.5em", color: colour, textShadow: `0 0 14px ${colour}, 0 2px 6px rgba(0,0,0,0.9)`, marginBottom: 14 }}>
          {who}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: font,
          fontStyle: font === "Cormorant Garamond" ? "italic" : undefined,
          fontWeight: 600,
          fontSize: size,
          color: "#f4efff",
          textAlign: "center",
          maxWidth: W * 0.86,
          textShadow: `0 0 22px ${colour}, 0 2px 14px rgba(0,0,0,0.95)`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ an old tape */

/** scanlines, a band of noise rolling down, the picture's colours pulled apart a little, the corners dark */
export const Tape: React.FC<{ k?: number }> = ({ k = 1 }) => {
  const frame = useCurrentFrame();
  const band = ((frame * 7) % (H + 300)) - 150;
  return (
    <>
      <AbsoluteFill style={{ opacity: 0.32 * k, background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0.55) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)" }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: band,
          width: W,
          height: 90,
          opacity: 0.16 * k,
          background: "linear-gradient(180deg, rgba(255,255,255,0), rgba(220,210,255,0.9) 45%, rgba(255,255,255,0))",
          mixBlendMode: "screen",
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 65% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 100%)" }} />
    </>
  );
};

/* ------------------------------------------------------------------------------------------------ the Fourth's shape */

/** the sixteen corners of a four-dimensional cube, and its thirty-two edges */
const V4 = Array.from({ length: 16 }, (_, i) => [0, 1, 2, 3].map((b) => ((i >> b) & 1) * 2 - 1));
const E4: [number, number][] = [];
for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) if ([1, 2, 4, 8].includes(a ^ b)) E4.push([a, b]);

/**
 * A cube inside a cube, turning through itself: a tesseract, turned in the planes that lean into the fourth direction, seen in
 * perspective from four dimensions down to three, and from three down to the page. `grow` (0..1) unfolds it out of a point.
 */
export const Tesseract: React.FC<{ T: number; cx: number; cy: number; size: number; colour: string; grow?: number; opacity?: number; eye?: number }> = ({
  T,
  cx,
  cy,
  size,
  colour,
  grow = 1,
  opacity = 1,
  eye = 0,
}) => {
  const a = T * 0.7;
  const b = T * 0.45 + 0.6;
  const pts = V4.map(([x0, y0, z0, w0]) => {
    // turn x into w, then z into w, then a slow turn in x-y
    let x = x0! * Math.cos(a) - w0! * Math.sin(a);
    let w = x0! * Math.sin(a) + w0! * Math.cos(a);
    const z = z0! * Math.cos(b) - w * Math.sin(b);
    w = z0! * Math.sin(b) + w * Math.cos(b);
    const c = Math.cos(T * 0.25);
    const s = Math.sin(T * 0.25);
    const y = y0! * c - x * s;
    x = y0! * s + x * c;
    const k4 = 2.4 / (3.2 - w);
    const k3 = 4 / (5.5 - z * k4);
    return [cx + x * k4 * k3 * size * grow, cy + y * k4 * k3 * size * grow, w] as const;
  });
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity, filter: `drop-shadow(0 0 10px ${colour}) drop-shadow(0 0 30px ${colour})` }}>
      {E4.map(([p, q], i) => {
        const depth = (pts[p]![2] + pts[q]![2]) / 2;
        return (
          <line
            key={i}
            x1={pts[p]![0]}
            y1={pts[p]![1]}
            x2={pts[q]![0]}
            y2={pts[q]![1]}
            stroke="#f2eaff"
            strokeOpacity={0.45 + 0.4 * (depth + 1) / 2}
            strokeWidth={2 + 2.5 * (depth + 1) / 2}
            strokeLinecap="round"
          />
        );
      })}
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3 + 3 * (p[2] + 1) / 2} fill="#ffffff" />
      ))}
      {eye > 0 ? (
        <g>
          <ellipse cx={cx} cy={cy} rx={size * 0.34 * grow} ry={size * 0.34 * grow} fill="#0b0614" stroke={colour} strokeWidth={3} />
          <ellipse cx={cx} cy={cy} rx={size * 0.05 * grow} ry={size * 0.28 * grow * eye} fill={colour} />
        </g>
      ) : null}
    </svg>
  );
};

/* ------------------------------------------------------------------------------------------------ a marker pen */

/** a ring drawn round something with a marker, the stroke going on in one sweep (a little past where it began) */
export const Ring: React.FC<{ at: number; end: number; x: number; y: number; rx: number; ry: number; colour?: string; spin?: number }> = ({
  at,
  end,
  x,
  y,
  rx,
  ry,
  colour = "#ff3b3b",
  spin = -20,
}) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > end) return null;
  const u = easeOut((t - at) / 0.35);
  const out = 1 - smooth((t - (end - 0.15)) / 0.15);
  // a hand-drawn ellipse: one and a bit turns, wobbling
  const n = 60;
  const d = Array.from({ length: n + 1 }, (_, i) => {
    const a = ((i / n) * 2.15 + spin / 360) * Math.PI;
    const wob = 1 + 0.05 * Math.sin(i * 0.9) + 0.03 * (i / n);
    return `${i ? "L" : "M"}${(x + Math.cos(a) * rx * wob).toFixed(1)} ${(y + Math.sin(a) * ry * wob).toFixed(1)}`;
  }).join(" ");
  const len = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2) * 1.1;
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: out, filter: "drop-shadow(0 3px 0 rgba(0,0,0,0.55))" }}>
      <path d={d} fill="none" stroke={colour} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - u)} />
    </svg>
  );
};

/** an arrow drawn with a marker from (x0, y0) to (x1, y1), its head drawn last */
export const Arrow: React.FC<{ at: number; end: number; x0: number; y0: number; x1: number; y1: number; colour?: string }> = ({ at, end, x0, y0, x1, y1, colour = "#ff3b3b" }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > end) return null;
  const u = easeOut((t - at) / 0.25);
  const h = smooth((t - at - 0.2) / 0.12);
  const out = 1 - smooth((t - (end - 0.15)) / 0.15);
  const xe = x0 + (x1 - x0) * u;
  const ye = y0 + (y1 - y0) * u;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const L = 34;
  const hx = (s: number) => x1 - L * Math.cos(ang + s * 0.5);
  const hy = (s: number) => y1 - L * Math.sin(ang + s * 0.5);
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: out, filter: "drop-shadow(0 3px 0 rgba(0,0,0,0.55))" }}>
      <path d={`M${x0} ${y0} Q${(x0 + xe) / 2 + 16} ${(y0 + ye) / 2 - 16} ${xe} ${ye}`} fill="none" stroke={colour} strokeWidth={9} strokeLinecap="round" />
      {h > 0 ? <path d={`M${hx(1)} ${hy(1)} L${x1} ${y1} L${hx(-1)} ${hy(-1)}`} fill="none" stroke={colour} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" opacity={h} /> : null}
    </svg>
  );
};

/** a few words written with the marker, popping on, tilted a little */
export const Scrawl: React.FC<{ at: number; end: number; x: number; y: number; text: string; size?: number; colour?: string; tilt?: number; align?: "left" | "center" | "right" }> = ({
  at,
  end,
  x,
  y,
  text,
  size = 56,
  colour = "#ffffff",
  tilt = -4,
  align = "center",
}) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > end) return null;
  const u = t - at;
  const s = 0.6 + 0.4 * easeOut(u / 0.18) + 0.06 * Math.sin(Math.min(1, u / 0.25) * Math.PI);
  const out = 1 - smooth((t - (end - 0.15)) / 0.15);
  const shift = align === "center" ? "-50%" : align === "right" ? "-100%" : "0%";
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(${shift}, -50%) rotate(${tilt}deg) scale(${s.toFixed(3)})`,
        opacity: smooth(u / 0.08) * out,
        fontFamily: MARKER,
        fontSize: size,
        color: colour,
        whiteSpace: "nowrap",
        textShadow: "0 4px 0 rgba(0,0,0,0.75), 0 0 16px rgba(0,0,0,0.6)",
      }}
    >
      {text}
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ light */

/** small warm lights drifting up through the frame, some close and soft, some far and sharp */
export const Fireflies: React.FC<{ n?: number; colour?: string; k?: number }> = ({ n = 26, colour = "255,214,140", k = 1 }) => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", opacity: k }}>
      {Array.from({ length: n }, (_, i) => {
        const near = rand(i + 3);
        const sp = 18 + 50 * rand(i + 7);
        const x = (rand(i) * W + 40 * Math.sin(t * (0.3 + rand(i + 9)) + i)) % W;
        const y = (((rand(i + 1) * H - t * sp) % H) + H) % H;
        const r = 4 + 22 * near * near;
        const tw = 0.55 + 0.45 * Math.sin(t * (1.5 + 2 * rand(i + 5)) + i * 2);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - r,
              top: y - r,
              width: 2 * r,
              height: 2 * r,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(${colour},${(0.9 * tw).toFixed(2)}) 0%, rgba(${colour},${(0.35 * tw).toFixed(2)}) 35%, rgba(${colour},0) 70%)`,
              filter: near > 0.7 ? `blur(${(4 * near).toFixed(1)}px)` : undefined,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** the frames that flash in negative on a hit (an anime's impact frames): the filter for now, or none */
export const useImpact = (hits: number[], len = 2 / 30) => {
  const t = useCurrentFrame() / FPS;
  const h = hits.find((a) => t >= a && t < a + len + 1e-4);
  if (h === undefined) return undefined;
  return (t - h) * FPS < 1 ? "invert(1) grayscale(1) contrast(4)" : "grayscale(1) contrast(5) brightness(1.4)";
};

/** a short punch in, settling, on each hit: the scale for now */
export const usePunch = (hits: number[], amount = 0.08) => {
  const t = useCurrentFrame() / FPS;
  let z = 1;
  for (const a of hits) if (t >= a && t < a + 0.6) z = Math.max(z, 1 + amount * Math.exp(-(t - a) / 0.12));
  return z;
};

/** 1 on [t0, t1], fading in over fin and out over fout */
export const span = (t: number, t0: number, t1: number, fin = 0.2, fout = 0.2) => (t < t0 || t > t1 ? 0 : smooth((t - t0) / fin) * smooth((t1 - t) / fout));
export { clamp, easeInOut, easeOut, smooth };
