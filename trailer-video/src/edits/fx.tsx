import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import LAYERS from "../data/edit2-layers.json";
import { clamp, H, rand, W } from "../lib/time";

/**
 * The song edit's footage and its effects (SkinsEdit.tsx). Every shot has the Blob on a layer of its own (captured with it:
 * scripts/edit-layers.py says where it is in each frame), so the Blob can be lit, outlined, set on fire with its aura, popped
 * out of the picture or left in colour while the world goes grey, and words can go behind it.
 *
 *  - Forest: the forest's own pixels (216 x 384) enlarged by `zoom` screen pixels a game pixel, crisp; the Blob drawn alone
 *    over them, the same size, in the same place
 *  - Crater: the 3D frame (720 x 1280), the Blob cut out of it, and the light of what it wears that glows
 */

export type Skin = "explorer" | "knight" | "wizard" | "inferno" | "golden";
export const COLOUR: Record<Skin, string> = { explorer: "#f2b06a", knight: "#d8e4f4", wizard: "#b8a0ff", inferno: "#ff7a2a", golden: "#ffd24a" };
/** each skin's light, as r,g,b */
export const GLOW: Record<Skin, string> = { explorer: "255,170,90", knight: "150,200,255", wizard: "170,120,255", inferno: "255,100,20", golden: "255,196,60" };
export const SKINS: Skin[] = ["explorer", "knight", "wizard", "inferno", "golden"];

type L2 = { k: "2d"; n: number; p: number[][]; c: number[][] };
type L3 = { k: "3d"; n: number; w: number; h: number; p: number[][]; c: number[][] };
const DATA = LAYERS as unknown as Record<string, L2 | L3>;
export const shotLen = (shot: string) => DATA[shot]?.n ?? 1;
export const PX_W = 216;
export const PX_H = 384;
const pad = (n: number) => String(n).padStart(5, "0");

/* ------------------------------------------------------------------------------------------------ the Blob's effects */

export type BlobFx = {
  /** the skin's light round it (0 none, 1 strong) */
  aura?: number;
  /** its aura as fire, licking up off it (0 none, 1 strong) */
  flame?: number;
  /** a white sticker outline, this many screen pixels thick */
  outline?: number;
  outlineColour?: string;
  /** the Blob as a flat shape (an impact frame) */
  silhouette?: "white" | "black";
  /** ghosts of where it was a moment ago */
  trail?: number;
  /** popped toward the camera: scaled about its middle, lifted, with a shadow under it */
  pop?: number;
  /** the colour of its light (r,g,b) */
  glow?: string;
  hide?: boolean;
};

const flId = (seed: number, k: number, glow: string) => `fl${seed}_${Math.round(k * 100)}_${glow.replace(/[^0-9]/g, "")}`;

/** the SVG filter of the aura's fire (its noise moving with `seed`) */
const Defs: React.FC<{ flame: { seed: number; k: number; glow: string }; w: number; h: number }> = ({ flame, w, h }) => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <defs>
      <filter id={flId(flame.seed, flame.k, flame.glow)} filterUnits="userSpaceOnUse" x={0} y={0} width={w} height={h} colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius={Math.round(10 + 26 * flame.k)} result="d" />
        <feGaussianBlur in="d" stdDeviation={10 + 8 * flame.k} result="b" />
        <feTurbulence type="fractalNoise" baseFrequency="0.011 0.032" numOctaves={2} seed={flame.seed} result="n" />
        <feDisplacementMap in="b" in2="n" scale={70 + 90 * flame.k} xChannelSelector="R" yChannelSelector="G" result="w" />
        <feOffset in="w" dy={-(16 + 30 * flame.k)} result="o" />
        <feComponentTransfer in="o" result="a">
          <feFuncA type="linear" slope={1.6} />
        </feComponentTransfer>
        <feFlood floodColor={`rgb(${flame.glow})`} />
        <feComposite in2="a" operator="in" />
      </filter>
    </defs>
  </svg>
);

/** the drop-shadows that make the skin's light (in screen space, so it is smooth however big the pixels are) */
const auraFilter = (a: number, glow: string) =>
  a > 0.01
    ? `drop-shadow(0 0 ${(6 + 6 * a).toFixed(1)}px rgba(${glow},${Math.min(1, 0.9 * a).toFixed(2)})) drop-shadow(0 0 ${(22 * a).toFixed(1)}px rgba(${glow},${Math.min(1, 0.85 * a).toFixed(2)})) drop-shadow(0 0 ${(60 * a).toFixed(1)}px rgba(${glow},${Math.min(1, 0.7 * a).toFixed(2)}))`
    : "";

/* ------------------------------------------------------------------------------------------------ a view of a shot */

export type View = {
  shot: string;
  /** the frame (fractions are rounded) */
  i: number;
  /** forest: screen pixels a game pixel (5 fills the screen); Crater: how much closer than filling the screen (1) */
  zoom: number;
  /** the point of the picture to put at `to` (forest: game pixels; Crater: frame pixels); by default the Blob, followed */
  at?: [number, number];
  /** where on the screen that point goes (default the middle) */
  to?: [number, number];
  /** a CSS filter on the footage (not the Blob) */
  bg?: string;
  fx?: BlobFx;
  /** between the footage and the Blob: words behind it, rays */
  behind?: React.ReactNode;
  /** a seed for the effects that move (the film's frame) */
  frame: number;
  /** the frame stays inside the picture (no edge showing) */
  keepIn?: boolean;
  /** only the footage, or only the Blob (for a Blob that pops out of a card the footage is in) */
  part?: "bg" | "blob";
  /** the size of the box the view fills (a pane of a split screen; the whole screen by default) */
  vw?: number;
  vh?: number;
};

/** the follow camera's point in a frame (forest: game pixels; Crater: frame pixels) */
export const followAt = (shot: string, i: number): [number, number] => {
  const d = DATA[shot]!;
  return d.c[clamp(Math.round(i), 0, d.n - 1)] as [number, number];
};

/** where the Blob is on the screen in this view (for rays, sparks, words) */
export const blobOnScreen = (v: View): [number, number] => {
  const g = geom(v);
  const d = DATA[v.shot]!;
  const i = clamp(Math.round(v.i), 0, d.n - 1);
  const p = d.p[i]!;
  if (d.k === "2d") return [g.left + p[0]! * g.s, g.top + (p[1]! - 6) * g.s];
  return [g.left + ((p[2]! + p[4]!) / 2) * g.s, g.top + ((p[3]! + p[5]!) / 2) * g.s];
};
/** how big the Blob is on the screen (its width, roughly) */
export const blobSize = (v: View) => {
  const d = DATA[v.shot]!;
  const g = geom(v);
  if (d.k === "2d") return 16 * g.s;
  const p = d.p[clamp(Math.round(v.i), 0, d.n - 1)]!;
  return Math.max(40, (p[4]! - p[2]!) * g.s);
};

function geom(v: View) {
  const d = DATA[v.shot]!;
  const i = clamp(Math.round(v.i), 0, d.n - 1);
  const sw = d.k === "2d" ? PX_W : d.w;
  const sh = d.k === "2d" ? PX_H : d.h;
  const s = d.k === "2d" ? v.zoom : (H / sh) * v.zoom;
  let [cx, cy] = v.at ?? (d.c[i] as [number, number]);
  const VW = v.vw ?? W;
  const VH = v.vh ?? H;
  const [tx, ty] = v.to ?? [VW / 2, VH / 2];
  if (v.keepIn !== false) {
    // no edge of the frame on the screen
    const minX = tx / s;
    const maxX = sw - (VW - tx) / s;
    const minY = ty / s;
    const maxY = sh - (VH - ty) / s;
    cx = minX > maxX ? sw / 2 : clamp(cx, minX, maxX);
    cy = minY > maxY ? sh / 2 : clamp(cy, minY, maxY);
  }
  return { s, left: tx - cx * s, top: ty - cy * s, w: sw * s, h: sh * s, i, d };
}

/**
 * a layer cut to the screen before its filter: a filter works on everything an element draws, and an enlarged frame draws far
 * past the screen (the forest 26 times over is 5600 x 10000 pixels), so it is clipped first and filtered after
 */
const Clip: React.FC<{ filter?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ filter, style, children }) => (
  <AbsoluteFill style={{ overflow: "hidden", filter, ...style }}>{children}</AbsoluteFill>
);

type Rect = { x: number; y: number; w: number; h: number };
/**
 * a layer drawn only inside a box round the Blob, and filtered there: a filter costs by the area it covers (with no GPU, a
 * drop-shadow over the whole screen is a second or two, and the outline and the light are seven of them)
 */
const Region: React.FC<{ r: Rect; vw: number; vh: number; filter?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ r, vw, vh, filter, style, children }) => (
  <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h, overflow: "hidden", filter, ...style }}>
    <div style={{ position: "absolute", left: -r.x, top: -r.y, width: vw, height: vh }}>{children}</div>
  </div>
);

/** a shot, with the Blob on its own layer and its effects */
export const Shot: React.FC<View> = (v) => {
  const g = geom(v);
  const { d, i } = g;
  const fx = v.fx ?? {};
  const glow = fx.glow ?? "255,210,120";
  const box: React.CSSProperties = { position: "absolute", left: g.left, top: g.top, width: g.w, height: g.h };
  const flags = d.k === "2d" ? d.p[i]![2]! : 0;
  let foot: React.ReactNode;
  if (d.k === "2d") {
    // the forest's pixels, or the screen as it was when the forest is torn open (and once the 3D has taken over)
    const hd = (flags & 2) !== 0;
    const src = hd ? `edit2/${v.shot}/h${pad(i + 1)}.jpg` : `edit2/${v.shot}/${pad(i + 1)}.png`;
    foot = <Img src={staticFile(src)} style={{ ...box, imageRendering: hd ? "auto" : "pixelated" }} />;
  } else {
    foot = <Img src={staticFile(`edit2/${v.shot}/${pad(i + 1)}.jpg`)} style={box} />;
  }
  const has = d.k === "2d" ? (flags & 1) !== 0 && (flags & 4) !== 0 : true;
  const blobSrc = (j: number) => (d.k === "2d" ? `edit2/${v.shot}/b${pad(j + 1)}.png` : `edit2/${v.shot}/m${pad(j + 1)}.png`);
  const glowSrc = d.k === "3d" && d.p[i]![6] ? `edit2/${v.shot}/g${pad(i + 1)}.jpg` : null;
  const px = d.k === "2d" ? "pixelated" : "auto";
  const sil = fx.silhouette === "white" ? "brightness(0) invert(1)" : fx.silhouette === "black" ? "brightness(0)" : undefined;
  // the pop: the Blob's layer scaled about its own middle and lifted
  const [bx, by] = blobOnScreen(v);
  const pop = fx.pop ?? 0;
  const popT = pop ? `translate(0px, ${(-0.25 * pop * blobSize(v)).toFixed(1)}px) scale(${(1 + 0.22 * pop).toFixed(3)})` : undefined;
  const flame = fx.flame ?? 0;
  const seed = Math.floor(v.frame / 2) % 97;
  // the outline: four hard shadows, left, right, up and down (each one grows the last: a solid border round it); and then its light
  const r = fx.outline ?? 0;
  const oc = fx.outlineColour ?? "#ffffff";
  const outlineF = r ? `drop-shadow(${r}px 0 0 ${oc}) drop-shadow(-${r}px 0 0 ${oc}) drop-shadow(0 ${r}px 0 ${oc}) drop-shadow(0 -${r}px 0 ${oc})` : "";
  const auraF = auraFilter(fx.aura ?? 0, glow) || undefined;
  const trail = has && fx.trail ? fx.trail : 0;
  // the box round the Blob (and where it was, for the trail), with room for its light, its outline and its fire
  const VW = v.vw ?? W;
  const VH = v.vh ?? H;
  const boxOf = (j: number) => {
    const q = d.p[clamp(j, 0, d.n - 1)]!;
    return d.k === "2d" ? [q[0]! - 12, q[1]! - 30, q[0]! + 12, q[1]! + 3] : [q[2]!, q[3]!, q[4]!, q[5]!];
  };
  const bb = boxOf(i);
  for (let k = 1; k <= trail; k++) {
    const o = boxOf(i - 2 * k);
    bb[0] = Math.min(bb[0]!, o[0]!);
    bb[1] = Math.min(bb[1]!, o[1]!);
    bb[2] = Math.max(bb[2]!, o[2]!);
    bb[3] = Math.max(bb[3]!, o[3]!);
  }
  const m = Math.round(24 + 80 * (fx.aura ?? 0) + 2.2 * r + (flame > 0.01 ? 70 + 110 * flame : 0) + (trail ? 30 : 0));
  const rx0 = clamp(Math.floor(g.left + bb[0]! * g.s - m), 0, VW);
  const ry0 = clamp(Math.floor(g.top + bb[1]! * g.s - m - (flame > 0.01 ? 60 : 0)), 0, VH);
  const rx1 = clamp(Math.ceil(g.left + bb[2]! * g.s + m), 0, VW);
  const ry1 = clamp(Math.ceil(g.top + bb[3]! * g.s + m), 0, VH);
  const R: Rect = { x: rx0, y: ry0, w: Math.max(1, rx1 - rx0), h: Math.max(1, ry1 - ry0) };
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {flame > 0.01 ? <Defs flame={{ seed, k: flame, glow }} w={R.w} h={R.h} /> : null}
      {v.part === "blob" ? null : <Clip filter={v.bg}>{foot}</Clip>}
      {v.behind}
      {has && !fx.hide && v.part !== "bg" ? (
        <AbsoluteFill style={{ transformOrigin: `${bx}px ${by}px`, transform: popT }}>
          {pop ? (
            // its shadow on what it popped out of
            <div style={{ position: "absolute", left: bx - blobSize(v) * 0.7, top: by + blobSize(v) * 0.32, width: blobSize(v) * 1.4, height: blobSize(v) * 0.3, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.55), rgba(0,0,0,0) 70%)", transform: `translateY(${(0.25 * pop * blobSize(v)).toFixed(1)}px)` }} />
          ) : null}
          {flame > 0.01 ? (
            <Region r={R} vw={VW} vh={VH} filter={`url(#${flId(seed, flame, glow)})`} style={{ mixBlendMode: "screen", opacity: Math.min(1, 0.55 + 0.45 * flame) }}>
              <Img src={staticFile(blobSrc(i))} style={{ ...box, imageRendering: px }} />
            </Region>
          ) : null}
          {Array.from({ length: trail }, (_, k) => {
            const j = Math.max(0, i - 2 * (trail - k));
            return (
              <Region key={k} r={R} vw={VW} vh={VH} filter={`drop-shadow(0 0 10px rgba(${glow},0.9)) brightness(1.4)`} style={{ opacity: 0.12 + (0.4 * (k + 1)) / trail }}>
                <Img src={staticFile(blobSrc(j))} style={{ ...box, imageRendering: px }} />
              </Region>
            );
          })}
          {/* (drop-shadows only: a chain that mixes in an SVG filter takes Chrome's slow road, a minute a frame) */}
          <Region r={R} vw={VW} vh={VH} filter={auraF}>
            <Clip filter={[sil, outlineF].filter(Boolean).join(" ") || undefined}>
              <Img src={staticFile(blobSrc(i))} style={{ ...box, imageRendering: px }} />
            </Clip>
          </Region>
          {glowSrc && !sil ? (
            <Region r={R} vw={VW} vh={VH} style={{ mixBlendMode: "screen" }}>
              <Img src={staticFile(glowSrc)} style={box} />
            </Region>
          ) : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ light, sparks, lines */

/** beams of light turning behind a point */
export const Rays: React.FC<{ x: number; y: number; glow: string; t: number; a?: number; n?: number; reach?: number }> = ({ x, y, glow, t, a = 1, n = 14, reach = 1100 }) => {
  const step = 360 / n;
  return (
    <AbsoluteFill
      style={{
        background: `repeating-conic-gradient(from ${(t * 24).toFixed(1)}deg at ${x}px ${y}px, rgba(${glow},${(0.32 * a).toFixed(2)}) 0deg ${(step * 0.28).toFixed(1)}deg, rgba(${glow},0) ${(step * 0.5).toFixed(1)}deg ${step}deg)`,
        WebkitMaskImage: `radial-gradient(circle at ${x}px ${y}px, rgba(0,0,0,1) 0px, rgba(0,0,0,0.6) ${reach * 0.35}px, rgba(0,0,0,0) ${reach}px)`,
        maskImage: `radial-gradient(circle at ${x}px ${y}px, rgba(0,0,0,1) 0px, rgba(0,0,0,0.6) ${reach * 0.35}px, rgba(0,0,0,0) ${reach}px)`,
        mixBlendMode: "screen",
      }}
    />
  );
};

/** a soft light behind a point (the skin's colour) */
export const Halo: React.FC<{ x: number; y: number; glow: string; r?: number; a?: number }> = ({ x, y, glow, r = 520, a = 1 }) => (
  <AbsoluteFill style={{ background: `radial-gradient(circle ${r}px at ${x}px ${y}px, rgba(${glow},${(0.55 * a).toFixed(2)}), rgba(${glow},${(0.18 * a).toFixed(2)}) 45%, rgba(${glow},0) 100%)`, mixBlendMode: "screen" }} />
);

/** sparks rising off a point, in its light */
export const Sparks: React.FC<{ x: number; y: number; glow: string; t: number; n?: number; spread?: number; rise?: number; a?: number; seed?: number }> = ({ x, y, glow, t, n = 36, spread = 420, rise = 900, a = 1, seed = 1 }) => (
  <AbsoluteFill style={{ mixBlendMode: "screen" }}>
    {Array.from({ length: n }, (_, k) => {
      const life = 0.9 + 1.2 * rand(seed * 31 + k);
      const age = (t + rand(seed * 17 + k * 3) * life) % life;
      const u = age / life;
      const px = x + (rand(seed * 7 + k * 5) - 0.5) * spread + Math.sin(t * 3 + k) * 18 * u;
      const py = y + spread * 0.18 - u * rise * (0.6 + 0.6 * rand(k * 11 + seed));
      const s = 4 + 9 * rand(k * 13 + seed);
      const o = Math.sin(Math.PI * u) * a;
      return <div key={k} style={{ position: "absolute", left: px - s / 2, top: py - s / 2, width: s, height: s, borderRadius: "50%", background: `rgba(255,255,240,${o.toFixed(2)})`, boxShadow: `0 0 ${s * 2.5}px ${s}px rgba(${glow},${(o * 0.9).toFixed(2)})` }} />;
    })}
  </AbsoluteFill>
);

/** an anime's speed lines, closing on a point */
export const SpeedLines: React.FC<{ x: number; y: number; t: number; a?: number; colour?: string; hole?: number }> = ({ x, y, t, a = 1, colour = "255,255,255", hole = 260 }) => (
  <AbsoluteFill
    style={{
      background: `repeating-conic-gradient(from ${(rand(Math.floor(t * 30)) * 360).toFixed(1)}deg at ${x}px ${y}px, rgba(${colour},${(0.85 * a).toFixed(2)}) 0deg 0.7deg, rgba(${colour},0) 0.9deg 4.1deg, rgba(${colour},${(0.5 * a).toFixed(2)}) 4.2deg 4.6deg, rgba(${colour},0) 4.8deg 9deg)`,
      WebkitMaskImage: `radial-gradient(circle at ${x}px ${y}px, rgba(0,0,0,0) ${hole}px, rgba(0,0,0,1) ${hole * 2.4}px)`,
      maskImage: `radial-gradient(circle at ${x}px ${y}px, rgba(0,0,0,0) ${hole}px, rgba(0,0,0,1) ${hole * 2.4}px)`,
    }}
  />
);

/** a flash of light from one side (a lens's light leak), sweeping */
export const Leak: React.FC<{ t: number; glow: string; a?: number; side?: 1 | -1 }> = ({ t, glow, a = 1, side = 1 }) => {
  const x = side > 0 ? W * (1.1 - 0.5 * t) : W * (-0.1 + 0.5 * t);
  return <AbsoluteFill style={{ background: `radial-gradient(ellipse 520px 1300px at ${x}px ${H * 0.4}px, rgba(${glow},${(0.6 * a).toFixed(2)}), rgba(${glow},0) 70%)`, mixBlendMode: "screen" }} />;
};

/** the frame broken into slices, each pushed sideways (a glitch), for a frame or two */
export const Glitch: React.FC<{ seed: number; children: React.ReactNode; amount?: number }> = ({ seed, children, amount = 60 }) => {
  const n = 7;
  const cuts = Array.from({ length: n - 1 }, (_, k) => rand(seed * 13 + k)).sort();
  const edges = [0, ...cuts, 1];
  return (
    <AbsoluteFill>
      {edges.slice(0, -1).map((e, k) => {
        const dx = (rand(seed * 29 + k * 7) - 0.5) * 2 * amount;
        const tint = k % 3 === 0 ? "hue-rotate(160deg) saturate(2)" : k % 3 === 1 ? "none" : "hue-rotate(-40deg) saturate(1.6)";
        return (
          <AbsoluteFill key={k} style={{ clipPath: `inset(${(e * 100).toFixed(2)}% 0 ${((1 - edges[k + 1]!) * 100).toFixed(2)}% 0)`, transform: `translateX(${dx.toFixed(1)}px)`, filter: tint }}>
            {children}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
