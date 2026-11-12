import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import shorts from "../data/shorts.json";
import { useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, F, FPS, H, lerp, rand, smooth, W } from "../lib/time";
import { span } from "./kit";

const S = shorts.shorts.skins;
const SERIF = "Cinzel";
const ITALIC = '"Cormorant Garamond"';
const SANS = "Inter";

/**
 * SKINS (itch.io): the skins update as a short film. It opens on a flash of all five, then the dark: one small light, the Blob,
 * breathing ("every night... he was just... a small light"). The camera pulls back and the aurora is over it, the forest and
 * the whole sky ("lost... in a very big, very dark forest"). Everything dims; "but tonight... he isn't hiding anymore" - he
 * looks up, the light gathers, the drop. Four reveals, one a bar of the drive each: a curtain of light sweeps across, he lands
 * in the new skin in its own world (the Explorer's dawn wind, the Knight's cathedral light, the Wizard's sigil, Inferno's
 * embers), as pixel art - and a bar later breaks into the 3D jelly of the fights, turning. Then silence and one bell: a
 * spotlight on an empty stage, gold dust, a crown coming down out of the dark - "only for those who survive... the
 * Nightmare" - and Golden. The five on a carousel ("five new skins. free. on itch.io"), and the end: the five little Blobs,
 * the logo, play free on itch.io - "so... who will you be?"
 *
 * Every picture of the Blob is the game's own: pixel strips from core/art.ts and 3D turns of act2/skins3d.ts, rendered by
 * ../the-third-direction/tools/trailer/skins-assets.mjs into public/skins/; the night is the live Aurora wallpaper without
 * its Blob (tools/brand/live/render.mjs --no-blob).
 */

type Skin = { id: string; name: string; tag: string; colour: string; glow: string; light: boolean; where: string; size: number };
const SKINS: Skin[] = [
  { id: "explorer", name: "EXPLORER", tag: "for the curious", colour: "#f2b06a", glow: "242,176,106", light: false, where: "dawn", size: 116 },
  { id: "knight", name: "KNIGHT", tag: "for the brave", colour: "#d8e4f4", glow: "190,214,255", light: false, where: "hall", size: 146 },
  { id: "wizard", name: "WIZARD", tag: "for the dreamers", colour: "#b8a0ff", glow: "170,140,255", light: false, where: "sigil", size: 140 },
  { id: "inferno", name: "INFERNO", tag: "for the ones who burn bright", colour: "#ff8a3a", glow: "255,120,40", light: true, where: "embers", size: 124 },
];
const GOLD = { colour: "#ffd24a", glow: "255,200,80" };
/** the pixel strips: 60 frames (px/<skin>/00..59.png) of 64 x 64, the Blob standing at (32, 54) in each */
const PX = 64;
const PXN = 60;
/** the 3D turns: 900 x 900, the Blob's feet at y 714, its middle at x 450 */
const T3 = 900;
const FEET3 = 714;

const pad3 = (n: number) => String(n).padStart(3, "0");
const fr = (t: number) => Math.floor(t * FPS);

/* ------------------------------------------------------------------------------------------------ pictures */

/** the Blob as pixel art: frame of its strip at time t, its feet at (x, y), k screen pixels to an art pixel */
const Pixel: React.FC<{ skin: string; t: number; x: number; y: number; k: number; opacity?: number; sx?: number; sy?: number; filter?: string }> = ({
  skin,
  t,
  x,
  y,
  k,
  opacity = 1,
  sx = 1,
  sy = 1,
  filter,
}) => {
  const f = ((fr(t) % PXN) + PXN) % PXN;
  return (
    <Img
      src={staticFile(`skins/px/${skin}/${String(f).padStart(2, "0")}.png`)}
      style={{
        position: "absolute",
        left: x - 32 * k,
        top: y - 54 * k,
        width: PX * k,
        height: PX * k,
        imageRendering: "pixelated",
        opacity,
        transformOrigin: `50% ${(54 / 64) * 100}%`,
        transform: `scale(${sx}, ${sy})`,
        filter,
      }}
    />
  );
};

/** a 3D shot (its solid picture, and the light of what glows added over it), its frame for time t since it began */
const Three: React.FC<{ job: string; n: number; t: number; x: number; feet: number; width: number; glow?: boolean; loop?: boolean; opacity?: number; scale?: number; filter?: string; size?: number; feetAt?: number }> = ({
  job,
  n,
  t,
  x,
  feet,
  width,
  glow,
  loop,
  opacity = 1,
  scale = 1,
  filter,
  size = T3,
  feetAt = FEET3,
}) => {
  const i = loop ? ((fr(t) % n) + n) % n : clamp(fr(t), 0, n - 1);
  const k = width / size;
  const style: React.CSSProperties = {
    position: "absolute",
    left: x - width / 2,
    top: feet - feetAt * k,
    width,
    height: width,
    opacity,
    transformOrigin: `50% ${(feetAt / size) * 100}%`,
    transform: `scale(${scale})`,
  };
  return (
    <>
      <Img src={staticFile(`skins/3d/${job}/s${pad3(i)}.png`)} style={{ ...style, filter }} />
      {glow ? <Img src={staticFile(`skins/3d/${job}/g${pad3(i)}.png`)} style={{ ...style, mixBlendMode: "screen" }} /> : null}
    </>
  );
};

/** soft round lights drifting (dust, embers, gold, stars), deterministic: rise > 0 floats up, < 0 falls */
const Motes: React.FC<{ t: number; n: number; colour: string; seed: number; rise?: number; size?: [number, number]; box?: [number, number, number, number]; k?: number; drift?: number }> = ({
  t,
  n,
  colour,
  seed,
  rise = 30,
  size = [3, 10],
  box = [0, 0, W, H],
  k = 1,
  drift = 30,
}) => {
  const [bx, by, bw, bh] = box;
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", opacity: k }}>
      {Array.from({ length: n }, (_, i) => {
        const r0 = rand(seed + i * 7);
        const sp = rise * (0.5 + rand(seed + i * 11));
        const x = bx + ((rand(seed + i) * bw + drift * Math.sin(t * (0.4 + rand(seed + i * 3)) + i)) % bw);
        const y = by + ((((rand(seed + i * 5) * bh - t * sp) % bh) + bh) % bh);
        const r = size[0] + (size[1] - size[0]) * r0 * r0;
        const tw = 0.55 + 0.45 * Math.sin(t * (1.3 + 2 * rand(seed + i * 13)) + i * 2);
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
              background: `radial-gradient(circle, rgba(${colour},${(0.95 * tw).toFixed(2)}) 0%, rgba(${colour},${(0.35 * tw).toFixed(2)}) 38%, rgba(${colour},0) 70%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** the Aurora wallpaper, alive, without its Blob (24 s, a seamless loop), from `from` seconds into it */
const Night: React.FC<{ at: number; dur: number; from?: number; style?: React.CSSProperties }> = ({ at, dur, from = 0, style }) => (
  <Sequence from={F(at)} durationInFrames={F(dur)} layout="none">
    <OffthreadVideo src={staticFile("skins/aurora.mp4")} trimBefore={F(from)} muted style={{ position: "absolute", left: 0, top: 0, width: W, height: H, ...style }} />
  </Sequence>
);

/* ------------------------------------------------------------------------------------------------ words */

/** words that come up softly, a phrase at a time, under the picture (the narrator's, for anyone with the sound off) */
const Caption: React.FC<{ t: number; parts: [number, string][]; end: number; y?: number; size?: number; colour?: string }> = ({ t, parts, end, y = 1400, size = 60, colour = "#f4f1ea" }) => {
  const k = span(t, parts[0]![0] - 0.1, end, 0.25, 0.4);
  if (k <= 0) return null;
  return (
    <>
    {y < 600 ? <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: y + 260, opacity: k, background: "linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0.35) 60%, rgba(0,0,0,0))" }} /> : null}
    <div style={{ position: "absolute", left: 70, right: 70, top: y, textAlign: "center", opacity: k, fontFamily: ITALIC, fontStyle: "italic", fontWeight: 600, fontSize: size, lineHeight: 1.22, color: colour, textShadow: "0 2px 18px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.9)" }}>
      {parts.map(([at, w], i) => {
        const u = clamp((t - at + 0.05) / 0.35);
        return (
          <span key={i} style={{ opacity: u, filter: `blur(${((1 - u) * 6).toFixed(1)}px)`, display: "inline-block", transform: `translateY(${((1 - easeOut(u)) * 10).toFixed(1)}px)`, marginRight: "0.28em" }}>
            {w}
          </span>
        );
      })}
    </div>
    </>
  );
};

/** a skin's name, struck in: letters spread, then close; a glow behind */
const Name: React.FC<{ t: number; at: number; name: string; colour: string; glow: string; y?: number; size?: number; out?: number }> = ({ t, at, name, colour, glow, y = 300, size = 156, out = 99 }) => {
  const u = clamp((t - at) / 0.45);
  const k = span(t, at, out, 0.08, 0.25);
  if (k <= 0) return null;
  const sp = lerp(0.3, 0.1, easeOut(u));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, textAlign: "center", opacity: k }}>
      <div
        style={{
          fontFamily: SERIF,
          fontWeight: 900,
          fontSize: size,
          letterSpacing: `${sp}em`,
          marginRight: `-${sp}em`,
          color: colour,
          transform: `scale(${lerp(1.12, 1, backOut(u)).toFixed(3)})`,
          textShadow: `0 0 ${Math.round(40 + 40 * (1 - u))}px rgba(${glow},0.75), 0 0 6px rgba(${glow},0.6), 0 6px 0 rgba(0,0,0,0.45)`,
        }}
      >
        {name}
      </div>
    </div>
  );
};

const Label: React.FC<{ text: string; y: number; k: number; colour?: string; size?: number }> = ({ text, y, k, colour = "rgba(244,241,234,0.78)", size = 28 }) =>
  k <= 0 ? null : (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, textAlign: "center", opacity: k, fontFamily: SANS, fontWeight: 600, fontSize: size, letterSpacing: "0.42em", marginRight: "-0.42em", color: colour, textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>
      {text}
    </div>
  );

/* ------------------------------------------------------------------------------------------------ the worlds of the skins */

const World: React.FC<{ where: string; t: number }> = ({ where, t }) => {
  if (where === "dawn") {
    // the Explorer: a wide dawn, wind in long streaks, dust
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, #120a10 0%, #3a1a1c 32%, #8a4a2a 58%, #e8a058 74%, #2a1608 75.5%, #0c0604 100%)" }} />
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 22% at 50% 74%, rgba(255,214,140,0.65), rgba(255,160,80,0) 70%)", mixBlendMode: "screen" }} />
        {Array.from({ length: 14 }, (_, i) => {
          const y = 300 + rand(i + 40) * 1100;
          const len = 200 + rand(i + 41) * 500;
          const x = ((rand(i + 42) * (W + len) + t * (900 + 600 * rand(i + 43))) % (W + 2 * len)) - len;
          return <div key={i} style={{ position: "absolute", left: x, top: y, width: len, height: 2 + 2 * rand(i + 44), background: "linear-gradient(90deg, rgba(255,236,210,0), rgba(255,236,210,0.32), rgba(255,236,210,0))", borderRadius: 2 }} />;
        })}
        <Motes t={t} n={40} colour="255,214,160" seed={11} rise={-20} drift={160} size={[2, 7]} />
      </AbsoluteFill>
    );
  }
  if (where === "hall") {
    // the Knight: a dark hall of stone, light falling in shafts from high windows, sparks
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, #060a14 0%, #0e1a2e 55%, #182640 74%, #070b12 76%, #04060a 100%)" }} />
        {[-260, -90, 90, 260].map((dx, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: W / 2 + dx - 70,
              top: -200,
              width: 140,
              height: 1700,
              transformOrigin: "50% 0",
              transform: `rotate(${(dx / 260) * -9}deg)`,
              background: "linear-gradient(180deg, rgba(200,224,255,0.55), rgba(200,224,255,0.12) 70%, rgba(200,224,255,0))",
              filter: "blur(18px)",
              opacity: 0.55 + 0.25 * Math.sin(t * 1.3 + i),
              mixBlendMode: "screen",
            }}
          />
        ))}
        <Motes t={t} n={34} colour="255,200,140" seed={23} rise={70} size={[2, 6]} box={[200, 600, 680, 1000]} />
      </AbsoluteFill>
    );
  }
  if (where === "sigil") {
    // the Wizard: violet night, stars, a circle of light turning under him
    const rot = t * 18;
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 70% at 50% 62%, #2a1650 0%, #120a28 55%, #05030c 100%)" }} />
        <Motes t={t} n={60} colour="230,220,255" seed={31} rise={6} size={[1.5, 4]} drift={4} />
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, mixBlendMode: "screen" }}>
          <g transform={`translate(${W / 2} 1360) scale(1 0.34)`}>
            <g transform={`rotate(${rot})`} opacity={0.85}>
              <circle r={420} fill="none" stroke="rgba(190,160,255,0.75)" strokeWidth={5} />
              <circle r={360} fill="none" stroke="rgba(190,160,255,0.5)" strokeWidth={3} />
              {Array.from({ length: 12 }, (_, i) => (
                <g key={i} transform={`rotate(${i * 30})`}>
                  <path d="M 0 -360 L 22 -400 L 0 -440 L -22 -400 Z" fill="rgba(220,200,255,0.75)" />
                </g>
              ))}
              <polygon points={Array.from({ length: 5 }, (_, i) => `${360 * Math.sin((i * 4 * Math.PI) / 5)},${-360 * Math.cos((i * 4 * Math.PI) / 5)}`).join(" ")} fill="none" stroke="rgba(200,180,255,0.55)" strokeWidth={3} />
            </g>
          </g>
        </svg>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 40% 10% at 50% 71%, rgba(180,150,255,0.55), rgba(180,150,255,0) 70%)", mixBlendMode: "screen" }} />
      </AbsoluteFill>
    );
  }
  if (where === "embers") {
    // Inferno: black and red, a fire's glow from below, embers going up, the air shaking
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, #050102 0%, #1a0406 40%, #4a0c06 68%, #200403 76%, #080101 100%)" }} />
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 24% at 50% ${76 + 1.5 * Math.sin(t * 9)}%, rgba(255,120,30,0.7), rgba(255,60,10,0) 72%)`, mixBlendMode: "screen" }} />
        <Motes t={t} n={70} colour="255,150,60" seed={47} rise={260} size={[2, 8]} drift={50} />
      </AbsoluteFill>
    );
  }
  return null;
};

/** the floor he stands on in each world: a pool of his colour, and his reflection's glow */
const Floor: React.FC<{ y: number; glow: string; k?: number }> = ({ y, glow, k = 1 }) => (
  <div style={{ position: "absolute", left: W / 2 - 420, top: y - 70, width: 840, height: 140, opacity: k, borderRadius: "50%", background: `radial-gradient(ellipse at 50% 50%, rgba(${glow},0.45), rgba(${glow},0.12) 45%, rgba(${glow},0) 70%)`, mixBlendMode: "screen" }} />
);

/** the flat Blob breaking into 3D: little blocks of it flying out, and a ring of light */
const Shatter: React.FC<{ t: number; at: number; x: number; y: number; colour: string; glow: string }> = ({ t, at, x, y, colour, glow }) => {
  const u = (t - at) / 0.75;
  if (u < 0 || u > 1) return null;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: x - 40 - 520 * easeOut(u),
          top: y - 40 - 520 * easeOut(u) * 0.55,
          width: 80 + 1040 * easeOut(u),
          height: 80 + 1040 * easeOut(u) * 0.55,
          borderRadius: "50%",
          border: `${Math.round(10 * (1 - u)) + 2}px solid rgba(${glow},${(0.9 * (1 - u)).toFixed(2)})`,
          boxShadow: `0 0 40px rgba(${glow},${(0.8 * (1 - u)).toFixed(2)})`,
        }}
      />
      {Array.from({ length: 46 }, (_, i) => {
        const a = rand(i + 70) * Math.PI * 2;
        const v = 500 + 900 * rand(i + 71);
        const s = 10 + 26 * rand(i + 72);
        const px = x + Math.cos(a) * v * u;
        const py = y - 120 + Math.sin(a) * v * u * 0.8 + 900 * u * u;
        const c = i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? colour : "#ffd860";
        return (
          <div
            key={i}
            style={{ position: "absolute", left: px - s / 2, top: py - s / 2, width: s, height: s, background: c, opacity: 1 - u, transform: `rotate(${(rand(i + 73) * 720 * u).toFixed(1)}deg) scale(${(1 - 0.6 * u).toFixed(2)})`, boxShadow: `0 0 12px rgba(${glow},0.8)` }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** a curtain of the aurora's light sweeping across the frame (the cut between worlds) */
const Curtain: React.FC<{ t: number; at: number; glow: string }> = ({ t, at, glow }) => {
  const u = (t - (at - 0.22)) / 0.42;
  if (u < 0 || u > 1) return null;
  const x = lerp(-700, W + 700, easeInOut(u));
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      <div style={{ position: "absolute", left: x - 450, top: -100, width: 900, height: H + 200, transform: "skewX(-12deg)", background: `linear-gradient(90deg, rgba(${glow},0), rgba(${glow},0.55) 35%, rgba(255,255,255,0.95) 50%, rgba(140,255,230,0.5) 65%, rgba(${glow},0))`, filter: "blur(30px)" }} />
    </AbsoluteFill>
  );
};

const Flash: React.FC<{ t: number; at: number; dur?: number; k?: number; colour?: string }> = ({ t, at, dur = 0.3, k = 1, colour = "255,255,255" }) => {
  const u = (t - at) / dur;
  if (u < 0 || u > 1) return null;
  return <AbsoluteFill style={{ background: `rgba(${colour},${(k * (1 - u) * (1 - u)).toFixed(3)})` }} />;
};

/* ------------------------------------------------------------------------------------------------ the film */

export const Skins: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const rv = S.reveals;
  const pop = S.pop;
  // a shake on the big hits
  const hits = [S.flashes[0], S.drop, ...rv.slice(1), ...rv.map((r) => r + pop), S.crown];
  let shake = 0;
  for (const h of hits) if (t >= h && t < h + 0.5) shake = Math.max(shake, 14 * Math.exp(-(t - h) / 0.09));
  const sx = shake * Math.sin(t * 91);
  const sy = shake * Math.cos(t * 77);
  // which reveal is on (-1: none)
  const ri = rv.findIndex((r, i) => t >= r && t < (rv[i + 1] ?? S.golden));

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Audio src={staticFile("audio/short-skins.wav")} />
      {ready ? (
        <AbsoluteFill style={{ transform: `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)` }}>
          {t < S.coldOut ? <ColdOpen t={t} /> : null}
          {t >= S.coldOut && t < S.drop ? <Small t={t} /> : null}
          {ri >= 0 ? <Reveal t={t} i={ri} /> : null}
          {t >= S.golden && t < S.carousel ? <Golden t={t} /> : null}
          {t >= S.carousel && t < S.end ? <Carousel t={t} /> : null}
          {t >= S.end ? <End t={t} /> : null}
        </AbsoluteFill>
      ) : null}
      {/* the grade over everything: grain, and the corners darkened */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
      <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: 0.07, mixBlendMode: "overlay" }} />
      <AbsoluteFill style={{ background: "#000", opacity: clamp((t - S.fadeOut) / 0.7) }} />
    </AbsoluteFill>
  );
};

/** the cold open: all five, one after another, in a flash each; NEW SKINS over them */
const ColdOpen: React.FC<{ t: number }> = ({ t }) => {
  const order = ["explorer", "knight", "wizard", "inferno", "turn-golden"];
  const tints = ["#3a1a0c", "#0e1a2e", "#1c0e3a", "#3a0806", "#2a1e04"];
  const i = Math.max(0, S.flashes.findIndex((a, j) => t >= a && t < (S.flashes[j + 1] ?? S.coldOut)));
  const a = S.flashes[i]!;
  const u = t - a;
  const job = order[i]!.startsWith("turn-") ? order[i]! : `turn-${order[i]}`;
  return (
    <AbsoluteFill style={{ background: tints[i] }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 40% at 50% 55%, rgba(255,255,255,0.18), rgba(0,0,0,0) 70%)` }} />
      <Three job={job} n={100} t={1.0 + u} x={W / 2} feet={1330} width={1300} scale={1.12 - 0.25 * u} glow={i >= 3} filter="brightness(1.08) saturate(1.15)" />
      <Flash t={t} at={a} dur={0.12} k={0.85} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 260, textAlign: "center", fontFamily: SERIF, fontWeight: 900, fontSize: 132, letterSpacing: "0.12em", marginRight: "-0.12em", color: "#fff6dc", textShadow: "0 0 40px rgba(255,210,120,0.8), 0 6px 0 rgba(0,0,0,0.5)", opacity: 0.6 + 0.4 * ((i + 1) % 2) }}>
        NEW SKINS
      </div>
      <Label text="THE THIRD DIRECTION" y={420} k={1} colour="rgba(255,240,210,0.85)" size={30} />
      <Flash t={t} at={S.coldOut - 0.14} dur={0.14} k={1} />
    </AbsoluteFill>
  );
};

/** the small light in the dark; the camera pulls back on the aurora; the dimming; he looks up; the light gathers */
const Small: React.FC<{ t: number }> = ({ t }) => {
  const P = S.phrases;
  // the camera: the point on the forest floor where he sits (540, 1670) is on screen at (540, sy0) zoomed z
  const pull = easeInOut(clamp((t - S.aurora) / 3.4));
  const z = lerp(2.3, 1.0, pull);
  const groundY = lerp(1180, 1390, pull);
  // the push in, as the light gathers
  const push = easeInOut(clamp((t - S.rise) / (S.drop - S.rise)));
  const z2 = z * (1 + 0.55 * push);
  const gY = lerp(groundY, 1200, push);
  const tx = W / 2 - 540 * z2;
  const ty = gY - 1670 * z2;
  const show = smooth((t - S.aurora) / 1.6);
  const dimK = clamp((t - S.dim) / 0.6) * (1 - clamp((t - S.rise) / 0.8));
  const k = 3 * z2;
  const light = smooth((t - S.light) / 0.8);
  const glowR = 120 * z2 * (1 + 0.08 * Math.sin(t * 2.6)) * (1 + 1.5 * push);
  const look = t >= S.look ? "default-up" : "default";
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "#02040a", opacity: show }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${z2.toFixed(4)})`, opacity: show, filter: `brightness(${(1 - 0.55 * dimK + 0.35 * push).toFixed(3)}) saturate(${(1 + 0.3 * push).toFixed(2)})` }}>
        <Night at={0} dur={S.drop + 0.2} from={0} />
      </div>
      {/* his glow */}
      <div style={{ position: "absolute", left: W / 2 - glowR, top: gY - 30 * z2 - glowR, width: 2 * glowR, height: 2 * glowR, borderRadius: "50%", opacity: light * (0.85 + 0.15 * Math.sin(t * 2.2)), background: "radial-gradient(circle, rgba(255,214,110,0.55), rgba(255,214,110,0.12) 45%, rgba(255,214,110,0) 70%)", mixBlendMode: "screen" }} />
      <Pixel skin={look} t={t} x={W / 2} y={gY} k={k} opacity={light} />
      {/* the light gathering to him */}
      {t > S.rise ? (
        <AbsoluteFill style={{ mixBlendMode: "screen" }}>
          {Array.from({ length: 40 }, (_, i) => {
            const u = clamp((t - S.rise - rand(i + 90) * 0.7) / 0.9);
            const a = rand(i + 91) * Math.PI * 2 + u * 2.4;
            const r = (1 - easeInOut(u)) * (500 + 400 * rand(i + 92));
            const px = W / 2 + Math.cos(a) * r;
            const py = gY - 40 * z2 + Math.sin(a) * r * 0.8;
            const s = 6 + 10 * rand(i + 93);
            const col = ["127,244,234", "255,214,110", "200,170,255", "255,150,190"][i % 4];
            return <div key={i} style={{ position: "absolute", left: px - s, top: py - s, width: 2 * s, height: 2 * s, borderRadius: "50%", opacity: u > 0 && u < 1 ? 1 : 0, background: `radial-gradient(circle, rgba(${col},1), rgba(${col},0) 70%)` }} />;
          })}
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: "#fff", opacity: clamp((t - (S.drop - 0.18)) / 0.18) }} />
      <Caption t={t} parts={[[P.k1[0], "Every night…"], [P.k1[1], "he was just…"], [P.k1[2], "a small light."]]} end={6.5} y={330} />
      <Caption t={t} parts={[[P.k2[0], "Lost…"], [P.k2[1], "in a very big,"], [P.k2[2], "very dark forest."]]} end={11.4} y={330} />
      <Caption t={t} parts={[[P.k3[0], "But tonight…"], [P.k3[1], "he isn't hiding anymore."]]} end={15.3} y={330} />
    </AbsoluteFill>
  );
};

/** one reveal: his world, the curtain, he lands in his new skin as pixel art, his name; then he breaks into 3D */
const Reveal: React.FC<{ t: number; i: number }> = ({ t, i }) => {
  const sk = SKINS[i]!;
  const t0 = S.reveals[i]!;
  const u = t - t0;
  const pop = S.pop;
  const feet = 1250;
  // he drops in and lands with a squash
  const fall = clamp(u / 0.16);
  const land = u - 0.16;
  const sq = land > 0 ? 1 - 0.22 * Math.exp(-land / 0.08) * Math.cos(land * 28) : 1.12;
  const dy = (1 - fall) * -700;
  const three = u >= pop;
  const tu = u - pop;
  const lineAt = [S.reveals[0]! + 0.94, S.reveals[1]! + 0.94, S.reveals[2]! + 0.93, S.reveals[3]! + 0.85][i]!;
  const out = (S.reveals[i + 1] ?? S.golden) - 0.05;
  return (
    <AbsoluteFill>
      <World where={sk.where} t={t} />
      <Floor y={feet} glow={sk.glow} />
      {!three ? (
        <>
          <div style={{ position: "absolute", left: W / 2 - 230, top: feet - 290, width: 460, height: 460, borderRadius: "50%", background: `radial-gradient(circle, rgba(${sk.glow},0.45), rgba(${sk.glow},0) 68%)`, mixBlendMode: "screen" }} />
          <Pixel skin={sk.id} t={t} x={W / 2} y={feet + dy} k={13} sx={2 - sq} sy={sq} />
        </>
      ) : (
        <Three job={`turn-${sk.id}`} n={100} t={tu} x={W / 2} feet={feet + 24} width={1320} scale={lerp(0.7, 1, backOut(clamp(tu / 0.32)))} glow={sk.light} filter={`brightness(${(1 + 1.4 * Math.exp(-tu / 0.1)).toFixed(2)})`} />
      )}
      <Shatter t={t} at={t0 + pop} x={W / 2} y={feet - 120} colour={sk.colour} glow={sk.glow} />
      <Label text={`NEW SKIN  ·  0${i + 1} / 05`} y={210} k={span(t, t0 + 0.1, out, 0.2, 0.15)} />
      <Name t={t} at={t0 + 0.16} name={sk.name} colour={sk.colour} glow={sk.glow} out={out} size={sk.size} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 500, textAlign: "center", opacity: span(t, lineAt, out, 0.3, 0.15), fontFamily: ITALIC, fontStyle: "italic", fontWeight: 600, fontSize: 66, color: "#f6efe2", textShadow: `0 0 26px rgba(${sk.glow},0.7), 0 2px 12px rgba(0,0,0,0.9)` }}>
        {sk.tag}
      </div>
      {/* where you see him like this: the forest (2D), the boss fights (3D) */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 1370, display: "flex", justifyContent: "center", gap: 26, opacity: span(t, t0 + 0.3, out, 0.25, 0.15) }}>
        {[
          ["PIXEL · THE FOREST", !three],
          ["3D · THE BOSS FIGHTS", three],
        ].map(([w, on], j) => (
          <div key={j} style={{ fontFamily: SANS, fontWeight: 800, fontSize: 26, letterSpacing: "0.18em", padding: "14px 26px", borderRadius: 40, color: on ? "#120c06" : "rgba(244,241,234,0.55)", background: on ? sk.colour : "rgba(255,255,255,0.06)", border: `2px solid ${on ? sk.colour : "rgba(255,255,255,0.2)"}`, boxShadow: on ? `0 0 26px rgba(${sk.glow},0.6)` : "none" }}>
            {w as string}
          </div>
        ))}
      </div>
      <Curtain t={t} at={t0} glow={sk.glow} />
      <Flash t={t} at={t0} dur={0.35} k={i === 0 ? 1 : 0.7} />
      <Flash t={t} at={t0 + pop} dur={0.22} k={0.6} colour={sk.glow} />
      {/* the next curtain starts before this one ends */}
      {i + 1 < SKINS.length ? <Curtain t={t} at={S.reveals[i + 1]!} glow={SKINS[i + 1]!.glow} /> : null}
    </AbsoluteFill>
  );
};

/** Golden: the dark, a spotlight, gold dust; a crown comes down out of the dark; it lands, and Golden is there */
const Golden: React.FC<{ t: number }> = ({ t }) => {
  const P = S.phrases;
  const feet = 1250;
  const beam = smooth((t - S.spot) / 0.12) * (0.92 + 0.08 * Math.sin(t * 13) * Math.exp(-(t - S.spot) * 3));
  const crownAt = P.g1[1];
  const landed = t >= S.crown;
  const cu = clamp((t - crownAt) / (S.crown - crownAt));
  const cdy = lerp(-980, 0, easeInOut(cu));
  const gu = t - S.crown;
  return (
    <AbsoluteFill>
      {/* the beam */}
      <div style={{ position: "absolute", left: W / 2 - 520, top: -120, width: 1040, height: feet + 230, opacity: beam, clipPath: "polygon(38% 0, 62% 0, 100% 100%, 0 100%)", background: "linear-gradient(180deg, rgba(255,240,200,0.30), rgba(255,226,160,0.16) 70%, rgba(255,220,140,0.05))", filter: "blur(10px)" }} />
      <div style={{ position: "absolute", left: W / 2 - 430, top: feet - 80, width: 860, height: 160, opacity: beam, borderRadius: "50%", background: "radial-gradient(ellipse at 50% 50%, rgba(255,230,170,0.55), rgba(255,210,120,0.12) 50%, rgba(255,200,100,0) 72%)" }} />
      <Motes t={t} n={46} colour="255,214,120" seed={61} rise={-55} size={[2, 7]} drift={20} box={[W / 2 - 330, 0, 660, feet]} k={beam} />
      {!landed ? (
        t >= crownAt ? (
          <>
            <div style={{ position: "absolute", left: W / 2 - 260, top: feet + cdy - 760, width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,214,110,0.4), rgba(255,214,110,0) 65%)", mixBlendMode: "screen", opacity: cu * 0.9 + 0.1 }} />
            <Three job="crown" n={90} t={(t - crownAt) * (89 / 30 / (S.crown - crownAt))} x={W / 2} feet={feet + cdy} width={1320} opacity={smooth(cu / 0.15)} filter="brightness(1.15)" />
          </>
        ) : null
      ) : (
        <>
          <div style={{ position: "absolute", left: W / 2 - 360, top: feet - 600, width: 720, height: 720, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,214,110,0.5), rgba(255,214,110,0) 66%)", mixBlendMode: "screen" }} />
          <Three job="golden" n={90} t={gu} x={W / 2} feet={feet} width={1320} glow scale={lerp(0.92, 1, backOut(clamp(gu / 0.3)))} filter={`brightness(${(1 + 1.2 * Math.exp(-gu / 0.12)).toFixed(2)})`} />
          <Shatter t={t} at={S.crown} x={W / 2} y={feet - 300} colour={GOLD.colour} glow={GOLD.glow} />
          <Motes t={t} n={60} colour="255,220,120" seed={67} rise={120} size={[2, 9]} drift={60} k={clamp(gu / 0.2)} />
          <Label text="NEW SKIN  ·  05 / 05" y={210} k={span(t, S.crown + 0.05, 99, 0.2)} colour="rgba(255,236,190,0.85)" />
          <Name t={t} at={S.crown + 0.05} name="GOLDEN" colour={GOLD.colour} glow={GOLD.glow} size={136} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 1380, textAlign: "center", opacity: span(t, S.crown + 0.4, 99, 0.3), fontFamily: SANS, fontWeight: 800, fontSize: 30, letterSpacing: "0.3em", marginRight: "-0.3em", color: "#1a1004" }}>
            <span style={{ background: GOLD.colour, padding: "16px 30px", borderRadius: 40, boxShadow: "0 0 30px rgba(255,200,80,0.7)" }}>BEAT THE GAME ON NIGHTMARE</span>
          </div>
          <Flash t={t} at={S.crown} dur={0.45} k={1} colour="255,240,200" />
        </>
      )}
      {!landed ? <Caption t={t} parts={[[P.g1[0], "And one more…"], [P.g1[1], "only for those"], [P.g1[2], "who survive…"], [P.g1[3], "the Nightmare."]]} end={S.crown + 0.05} y={1400} /> : null}
    </AbsoluteFill>
  );
};

/** the five, turning on their carousel, under the aurora */
const Carousel: React.FC<{ t: number }> = ({ t }) => {
  const P = S.phrases;
  const u = t - S.carousel;
  const k = smooth(u / 0.4);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, filter: "brightness(0.75)" }}>
        <Night at={S.carousel} dur={S.end - S.carousel + 0.1} from={10} />
      </div>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.55))" }} />
      <Three job="carousel" n={150} t={u} x={W / 2} feet={1180} width={1240} size={1080} feetAt={760} glow opacity={k} scale={lerp(1.15, 1, easeOut(clamp(u / 1.2)))} />
      <Label text="THE THIRD DIRECTION" y={200} k={k} colour="rgba(200,250,240,0.9)" />
      <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center", opacity: k, fontFamily: SERIF, fontWeight: 900, fontSize: 132, letterSpacing: "0.1em", marginRight: "-0.1em", color: "#ffe9a8", textShadow: "0 0 50px rgba(255,200,90,0.7), 0 6px 0 rgba(0,0,0,0.45)" }}>NEW SKINS</div>
      <Caption t={t} parts={[[P.e1[0], "Five new skins."], [P.e1[1], "Free."], [P.e1[2], "On itch.io."]]} end={S.end + 0.1} y={1330} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 1450, textAlign: "center", opacity: span(t, P.e1[2], 99, 0.25) }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 34, letterSpacing: "0.24em", padding: "18px 36px", borderRadius: 50, color: "#130d05", background: "#ffd24a", boxShadow: "0 0 34px rgba(255,200,80,0.7)" }}>FREE · ON ITCH.IO</span>
      </div>
    </AbsoluteFill>
  );
};

/** the end: the five little Blobs, the logo, where to play; the question */
const End: React.FC<{ t: number }> = ({ t }) => {
  const P = S.phrases;
  const u = t - S.end;
  const order = ["explorer", "knight", "golden", "wizard", "inferno"];
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, filter: "brightness(0.55) blur(2px)" }}>
        <Night at={S.end} dur={S.length - S.end} from={14} />
      </div>
      <Img src={staticFile("lineup/logo.png")} style={{ position: "absolute", left: W / 2 - 360, top: 170, width: 720, opacity: smooth(u / 0.5), transform: `scale(${lerp(0.94, 1, easeOut(clamp(u / 0.8))).toFixed(3)})` }} />
      {order.map((id, i) => {
        const a = 0.3 + 0.13 * i;
        const h = clamp((u - a) / 0.35);
        const hop = Math.sin(h * Math.PI) * 60;
        const x = W / 2 + (i - 2) * 190;
        return <Pixel key={id} skin={id} t={t + i * 0.3} x={x} y={1010 - hop} k={6} opacity={clamp((u - a) / 0.08)} />;
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: 1070, textAlign: "center", opacity: smooth((u - 0.9) / 0.4), fontFamily: SERIF, fontWeight: 900, fontSize: 92, letterSpacing: "0.12em", marginRight: "-0.12em", color: "#fff3d6", textShadow: "0 0 36px rgba(255,210,120,0.6)" }}>PLAY FREE</div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1200, textAlign: "center", opacity: smooth((u - 1.1) / 0.4) }}>
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 40, letterSpacing: "0.2em", padding: "20px 44px", borderRadius: 60, color: "#130d05", background: "#ffd24a", boxShadow: "0 0 40px rgba(255,200,80,0.7)" }}>ON ITCH.IO</span>
      </div>
      <Label text="LINK IN BIO" y={1330} k={smooth((u - 1.4) / 0.4)} colour="rgba(220,250,245,0.85)" size={28} />
      <Caption t={t} parts={[[P.e2[0], "So…"], [P.e2[1], "who will you be?"]]} end={99} y={700} size={76} colour="#fff3d6" />
    </AbsoluteFill>
  );
};
