import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { Flash, useShake } from "../components/Effects";
import shorts from "../data/shorts.json";
import { GOLD, RED } from "../lib/colours";
import { MARKER, POSTER, TERM, useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip, Fireflies, span, Subtitle } from "./kit";

const S = shorts.shorts.lineup;
const B = S.beat;
const SLOT = 4 * B;

/**
 * THE LINEUP - the game came out today, so its monsters were "released": each one is booked like a suspect. A mugshot against
 * a height chart, a camera flash, the letterboard placard with its charge, a pinned photo of the evidence (the fight itself,
 * playing), a second flash in profile. Seven of them, a bar of crime jazz each. Then X, too tall for the chart: the camera has
 * to look up - the third direction - until it finds his eyes. All eight in a row; RELEASED, stamped; BAIL: $0 (it is free);
 * and a wanted poster for the one who has to bring them in. It ends on the logo: free on itch.io.
 */

type Suspect = {
  img: string;
  name: string;
  charge: string;
  colour: string;
  /** pixel art at a whole-number zoom, or a 3D cutout drawn this wide */
  k?: number;
  wide?: number;
  clip: string;
  from: number;
  z: number;
  c: [number, number];
  rate?: number;
  pixel?: boolean;
};

const SUSPECTS: Suspect[] = [
  { img: "gloommother", name: "GLOOMMOTHER", charge: "SMOTHERING (1ST DEGREE)", colour: "#6ff0ff", k: 4, clip: "f-gloom", from: 400, z: 2.3, c: [0.5, 0.16], pixel: true },
  { img: "king", name: "THORNBACK KING", charge: "ASSAULT WITH A DEADLY BACK", colour: "#e8b27a", k: 4, clip: "f-thicket", from: 200, z: 2.0, c: [0.52, 0.28], pixel: true },
  { img: "queen", name: "TOLL QUEEN", charge: "NOISE COMPLAINTS AT 3 A.M.", colour: "#d9b8ff", k: 4, clip: "f-marsh", from: 80, z: 1.9, c: [0.5, 0.2], pixel: true },
  { img: "wyrm", name: "BONE WYRM", charge: "BREAKING IN (FROM BELOW)", colour: "#f4efe0", k: 4, clip: "f-bones", from: 106, z: 2.0, c: [0.48, 0.72], rate: 0.45, pixel: true },
  { img: "mimic", name: "MIMIC QUEEN", charge: "IMPERSONATING A FLOWER", colour: "#ff8aa8", k: 4, clip: "f-meadow", from: 270, z: 2.2, c: [0.5, 0.15], pixel: true },
  { img: "collector-hd", name: "THE COLLECTOR", charge: "KIDNAPPING. INTO JARS.", colour: "#f7d56e", wide: 720, clip: "collector-0", from: 30, z: 1.0, c: [0.5, 0.45] },
  { img: "mash-hd", name: "THE MASH", charge: "ALL OF THE ABOVE", colour: "#ff6a7e", wide: 900, clip: "mash-3", from: 60, z: 1.0, c: [0.5, 0.5], rate: 0.8 },
];
/** each sprite's size (pixels in the file), so a whole-number zoom can be worked out without loading it */
const SIZE: Record<string, [number, number]> = {
  gloommother: [150, 112],
  king: [152, 107],
  queen: [124, 151],
  wyrm: [169, 111],
  mimic: [102, 123],
  "collector-hd": [670, 544],
  "mash-hd": [868, 503],
  "x-hd": [582, 1042],
  blob: [26, 20],
  mother: [32, 25],
  father: [36, 28],
};
const FLOOR = 1180;
const FT = 60;
const LETTERS = "ABCDEFG";

export const Lineup: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const flashes: [number, number][] = [
    ...S.slots.flatMap((s) => [[s + B, 0.85], [s + 3 * B, 0.7]] as [number, number][]),
    [S.xFlash, 0.95],
    [S.end, 0.35],
  ];
  const shake = useShake([
    [S.hook + 2 * B, 0.7],
    ...S.slots.map((s) => [s + 0.14, 0.3] as [number, number]),
    [S.xEyes, 1.3],
    [S.stamp1, 1.0],
    [S.stamp2, 0.9],
    [S.wanted + 0.35, 0.45],
    [S.end, 0.35],
  ]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#05060c" }}>
      <RoughDefs />
      <AbsoluteFill style={{ transform: shake }}>
        {t < S.slots[0]! + 0.2 ? <Hook t={t} ready={ready} /> : null}
        {SUSPECTS.map((s, i) => (t >= S.slots[i]! - 0.05 && t < S.slots[i]! + SLOT + 0.05 ? <Booking key={i} t={t} s={s} i={i} at={S.slots[i]!} ready={ready} /> : null))}
        {t >= S.x - 0.05 && t < S.lineup + 0.05 ? <XBooking t={t} ready={ready} /> : null}
        {t >= S.lineup - 0.05 && t < S.wanted + 0.3 ? <Lineup8 t={t} ready={ready} /> : null}
        {t >= S.wanted - 0.05 && t < S.end + 0.3 ? <Wanted t={t} ready={ready} /> : null}
        {t >= S.end - 0.3 ? <End t={t} ready={ready} /> : null}
        {/* a booking camera's tape: grain and a heavy vignette over everything */}
        <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, mixBlendMode: "overlay", opacity: 0.26 }} />
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 62% at 50% 45%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.7) 100%)" }} />
      </AbsoluteFill>
      <Flash hits={flashes} />
      <XRed t={t} />
      {t > S.fadeOut ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: smooth((t - S.fadeOut) / (S.length - 0.05 - S.fadeOut)) }} /> : null}
      <Audio src={staticFile("audio/short-lineup.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ pieces */

/** a rough edge for stamped ink and old paper (an SVG filter the stamps and the poster use) */
const RoughDefs: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }}>
    <filter id="rough">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={4} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={7} />
    </filter>
    <filter id="ink">
      <feTurbulence type="fractalNoise" baseFrequency="0.06 0.5" numOctaves={3} seed={9} result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.6" result="holes" />
      <feComposite in="SourceGraphic" in2="holes" operator="in" result="inked" />
      <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves={1} seed={2} result="m" />
      <feDisplacementMap in="inked" in2="m" scale={5} />
    </filter>
    <filter id="paper">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={4} seed={12} result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale={18} />
    </filter>
  </svg>
);

/** the booking room's wall: painted concrete, a height chart in feet, a hard light from above, the floor */
const Wall: React.FC<{ t: number; ft?: number; top?: number; height?: number; floor?: number; light?: number; flicker?: number }> = ({
  t,
  ft = FT,
  top = 0,
  height = H,
  floor = FLOOR,
  light = 1,
  flicker = 0,
}) => {
  const n = Math.ceil(floor / ft) + 1;
  const on = flicker > 0 ? (rand(Math.floor(t * 14)) < flicker ? 0.25 : 1) : 1;
  return (
    <div style={{ position: "absolute", left: 0, top, width: W, height }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #1d2a38 0%, #172230 55%, #101822 100%)" }} />
      {/* the chart: a line every foot, a heavier one and its number every five */}
      {Array.from({ length: n }, (_, i) => {
        const y = floor - i * ft;
        if (y < -10) return null;
        const big = i % 5 === 0;
        return (
          <React.Fragment key={i}>
            <div style={{ position: "absolute", left: 0, top: y, width: W, height: big ? 4 : 2, backgroundColor: big ? "rgba(214,232,240,0.34)" : "rgba(214,232,240,0.15)" }} />
            {i > 0 ? (
              <>
                <div style={{ position: "absolute", left: 26, top: y - 40, fontFamily: POSTER, fontSize: big ? 44 : 28, color: big ? "rgba(225,238,244,0.62)" : "rgba(225,238,244,0.3)", letterSpacing: 2 }}>
                  {i}
                  <span style={{ fontSize: big ? 26 : 18 }}> FT</span>
                </div>
                <div style={{ position: "absolute", right: 26, top: y - 40, fontFamily: POSTER, fontSize: big ? 44 : 28, color: big ? "rgba(225,238,244,0.62)" : "rgba(225,238,244,0.3)", letterSpacing: 2 }}>
                  {i}
                  <span style={{ fontSize: big ? 26 : 18 }}> FT</span>
                </div>
              </>
            ) : null}
          </React.Fragment>
        );
      })}
      {/* the floor */}
      <div style={{ position: "absolute", left: 0, top: floor, width: W, height: Math.max(0, height - floor), background: "linear-gradient(180deg, #0c121a 0%, #06090d 100%)" }} />
      {/* the lamp above: a cone of hard light on the wall and a pool on the floor */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: light * on,
          background: `radial-gradient(ellipse 55% 48% at 50% ${((floor - 520) / height) * 100}%, rgba(210,240,255,0.22) 0%, rgba(210,240,255,0.07) 45%, rgba(0,0,0,0) 75%)`,
          mixBlendMode: "screen",
        }}
      />
      <div style={{ position: "absolute", left: W / 2 - 360, top: floor - 40, width: 720, height: 150, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(200,235,255,0.16), rgba(0,0,0,0) 70%)", opacity: light * on }} />
      {flicker > 0 && on < 1 ? <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)" }} /> : null}
    </div>
  );
};

/** how bright the camera flash still is (for the colour fringes it leaves on the suspect) */
const flashAt = (t: number, hits: number[]) => {
  let o = 0;
  for (const h of hits) {
    const d = t - h;
    if (d >= 0 && d < 0.5) o = Math.max(o, Math.exp(-d / 0.12));
  }
  return o;
};

const fringe = (f: number, glow: string) =>
  `drop-shadow(${(9 * f).toFixed(1)}px 0 0 rgba(255,40,80,${(0.55 * f).toFixed(2)})) drop-shadow(${(-9 * f).toFixed(1)}px 0 0 rgba(40,240,255,${(0.55 * f).toFixed(2)})) drop-shadow(0 0 26px ${glow})`;

/** the letterboard: the department, the name, the booking number, the charge, put up letter by letter after the flash */
const Placard: React.FC<{ t: number; at: number; name: string; no: string; charge: string; colour: string; y?: number; extra?: string }> = ({ t, at, name, no, charge, colour, y = 1236, extra }) => {
  const up = easeOut((t - (at - 0.45)) / 0.35);
  const n = Math.floor(Math.max(0, t - at) * 60);
  const typed = (s: string, off: number) => s.slice(0, Math.max(0, n - off));
  return (
    <div
      style={{
        position: "absolute",
        left: W / 2 - 400,
        top: y + (1 - up) * 700,
        width: 800,
        padding: "22px 0 26px",
        backgroundColor: "#0a0c0f",
        backgroundImage: "repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 9px)",
        border: "5px solid #23262b",
        borderRadius: 6,
        boxShadow: "0 22px 60px rgba(0,0,0,0.8)",
        textAlign: "center",
        color: "#f1f1ec",
      }}
    >
      <div style={{ fontFamily: POSTER, fontSize: 34, letterSpacing: 12, opacity: 0.75 }}>THE THIRD DIRECTION P.D.</div>
      <div style={{ fontFamily: POSTER, fontSize: name.length > 12 ? 96 : 112, letterSpacing: 6, lineHeight: 1.0, marginTop: 6, minHeight: 112, color: "#ffffff", textShadow: `0 0 18px ${colour}55` }}>
        {typed(name, 0)}
      </div>
      <div style={{ fontFamily: TERM, fontSize: 42, letterSpacing: 6, marginTop: 4, minHeight: 44, opacity: 0.85 }}>{typed(no, 6)}</div>
      <div style={{ fontFamily: POSTER, fontSize: 50, letterSpacing: 4, marginTop: 6, minHeight: 52, color: "#ff5d5d" }}>
        {n > 10 ? "CHARGE: " : ""}
        <span style={{ color: "#ffd2c8" }}>{typed(charge, 18)}</span>
      </div>
      {extra ? <div style={{ fontFamily: TERM, fontSize: 38, letterSpacing: 4, marginTop: 6, minHeight: 40, color: GOLD }}>{typed(extra, 46)}</div> : null}
    </div>
  );
};

/** a booking camera's corner: recording, which suspect, a running clock */
const Hud: React.FC<{ t: number; label: string }> = ({ t, label }) => {
  const s = 23 * 3600 + 58 * 60 + Math.floor(t);
  const hh = String(Math.floor(s / 3600) % 24).padStart(2, "0");
  const mm = String(Math.floor(s / 60) % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <>
      <div style={{ position: "absolute", left: 48, top: 64, fontFamily: TERM, fontSize: 46, color: "#e8f2f6", letterSpacing: 3, textShadow: "0 2px 0 #000" }}>
        <span style={{ color: RED, opacity: Math.floor(t * 2) % 2 ? 1 : 0.25 }}>●</span> REC&nbsp;&nbsp;{label}
      </div>
      <div style={{ position: "absolute", left: 48, bottom: 70, fontFamily: TERM, fontSize: 40, color: "rgba(232,242,246,0.7)", letterSpacing: 3 }}>
        BOOKING CAM 02 · {hh}:{mm}:{ss}
      </div>
    </>
  );
};

/** a photo of the evidence pinned to the wall: the fight itself, playing in it */
const Evidence: React.FC<{ t: number; at: number; s: Suspect; letter: string }> = ({ t, at, s, letter }) => {
  if (t < at) return null;
  const u = backOut((t - at) / 0.3);
  const w = 330;
  const ph = 300;
  return (
    <div
      style={{
        position: "absolute",
        left: 690,
        top: 150 - (1 - clamp(u)) * 120,
        width: w,
        padding: "18px 18px 0",
        backgroundColor: "#efeadf",
        transform: `rotate(${6 - 2 * (1 - u)}deg) scale(${0.6 + 0.4 * u})`,
        transformOrigin: "50% 0",
        boxShadow: "0 18px 40px rgba(0,0,0,0.75)",
        opacity: clamp(u * 3),
      }}
    >
      <div style={{ position: "relative", width: w - 36, height: ph, overflow: "hidden", backgroundColor: "#000" }}>
        <Clip clip={s.clip} at={at} from={s.from} dur={SLOT} box={[0, 0, w - 36, ph]} z={s.z} c={s.c} rate={s.rate} pixel={s.pixel} />
      </div>
      <div style={{ fontFamily: MARKER, fontSize: 40, color: "#9b1c22", textAlign: "center", padding: "8px 0 12px", transform: "rotate(-2deg)" }}>EXHIBIT {letter}</div>
      {/* the pin */}
      <div style={{ position: "absolute", left: w / 2 - 15, top: -12, width: 30, height: 30, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #ff8a8a, #c41a2a 60%, #6a0a12)", boxShadow: "0 4px 6px rgba(0,0,0,0.6)" }} />
    </div>
  );
};

/** a rubber stamp slammed onto the picture */
const Stamp: React.FC<{ t: number; at: number; text: string; sub?: string; colour?: string; x: number; y: number; rot: number; size?: number }> = ({
  t,
  at,
  text,
  sub,
  colour = "#e2283c",
  x,
  y,
  rot,
  size = 200,
}) => {
  if (t < at - 0.12) return null;
  const u = clamp((t - (at - 0.12)) / 0.12);
  const sc = 2.6 - 1.6 * easeOut(u);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${sc})`,
        opacity: u,
        border: `${Math.round(size / 18)}px solid ${colour}`,
        borderRadius: 18,
        padding: `${size * 0.04}px ${size * 0.16}px ${size * 0.06}px`,
        color: colour,
        fontFamily: POSTER,
        fontSize: size,
        lineHeight: 0.95,
        letterSpacing: size * 0.05,
        textAlign: "center",
        filter: "url(#ink)",
        textShadow: `0 0 30px ${colour}66`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
      {sub ? <div style={{ fontSize: size * 0.34, letterSpacing: size * 0.06, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
};

/** police tape across the picture */
const Tape: React.FC<{ t: number; at: number; y: number; rot: number; dir: number }> = ({ t, at, y, rot, dir }) => {
  const u = easeOut((t - at) / 0.4);
  const words = "POLICE LINE · DO NOT CROSS · ";
  return (
    <div
      style={{
        position: "absolute",
        left: -200 + dir * (1 - u) * 1500,
        top: y,
        width: W + 400,
        height: 92,
        backgroundColor: "#ffd21f",
        backgroundImage: "repeating-linear-gradient(90deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 40px, rgba(0,0,0,0.06) 40px, rgba(0,0,0,0.06) 42px)",
        transform: `rotate(${rot}deg)`,
        boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
        overflow: "hidden",
        whiteSpace: "nowrap",
        fontFamily: POSTER,
        fontSize: 64,
        lineHeight: "92px",
        letterSpacing: 6,
        color: "#111",
      }}
    >
      <span style={{ display: "inline-block", transform: `translateX(${-((t * 140) % 900)}px)` }}>{words.repeat(6)}</span>
    </div>
  );
};

/** a siren's lights washing over the edges, red then blue */
const Siren: React.FC<{ t: number; k: number }> = ({ t, k }) => {
  const a = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.7);
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", opacity: k }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at 0% 30%, rgba(255,30,60,${(0.55 * a).toFixed(2)}), rgba(0,0,0,0) 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at 100% 30%, rgba(40,90,255,${(0.6 * (1 - a)).toFixed(2)}), rgba(0,0,0,0) 70%)` }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the hook */

const Hook: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const out = 1 - smooth((t - (S.slots[0]! - 0.18)) / 0.18);
  const big = (at: number) => ({ opacity: clamp((t - at) / 0.06), transform: `scale(${1 + 0.5 * (1 - easeOut((t - at) / 0.18))})` });
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Wall t={t} light={0.35} />
      <AbsoluteFill style={{ backgroundColor: "rgba(4,6,12,0.55)" }} />
      <Siren t={t} k={1} />
      <Tape t={t} at={0.0} y={230} rot={-9} dir={-1} />
      <Tape t={t} at={0.12} y={1580} rot={7} dir={1} />
      {ready ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ fontFamily: TERM, fontSize: 56, letterSpacing: 10, color: "#ff5d6a", opacity: span(t, 0.1, 9, 0.1, 0.1) * (Math.floor(t * 4) % 2 ? 1 : 0.55), marginBottom: 10 }}>
            ⚠ ALL UNITS ⚠
          </div>
          <div style={{ fontFamily: POSTER, fontSize: 230, lineHeight: 0.9, color: "#fff", letterSpacing: 6, textShadow: "0 8px 0 #000, 0 0 40px rgba(255,255,255,0.25)", ...big(B) }}>
            {t >= B ? "8 MONSTERS" : ""}
          </div>
          <div style={{ height: 330 }} />
          <div style={{ fontFamily: POSTER, fontSize: 120, letterSpacing: 18, color: GOLD, textShadow: "0 6px 0 #000", ...big(3 * B) }}>{t >= 3 * B ? "TODAY." : ""}</div>
        </AbsoluteFill>
      ) : null}
      {ready ? <Stamp t={t} at={2 * B} text="RELEASED" x={W / 2} y={H / 2 + 120} rot={-8} size={180} /> : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ a booking */

const Booking: React.FC<{ t: number; s: Suspect; i: number; at: number; ready: boolean }> = ({ t, s, i, at, ready }) => {
  const u = t - at;
  // a whip-pan in from the right and out to the left
  const inn = 1 - easeOut(u / 0.14);
  const out = easeInOut((u - (SLOT - 0.14)) / 0.14);
  const dx = inn * W * 0.9 - out * W * 0.9;
  const blur = 18 * Math.max(inn, out);
  const push = 1 + 0.045 * smooth(u / SLOT);
  const drift = `translate(${(6 * Math.sin(t * 1.3 + i)).toFixed(1)}px, ${(4 * Math.sin(t * 1.7 + 2 * i)).toFixed(1)}px)`;
  const [sw, sh] = SIZE[s.img]!;
  const w = s.k ? sw * s.k : s.wide!;
  const h = s.k ? sh * s.k : (s.wide! / sw) * sh;
  // the suspect drops into frame, then turns for the profile on the fourth beat
  const drop = backOut(u / 0.24);
  const y = FLOOR - h + (1 - clamp(drop)) * -900;
  const turn = u < 3 * B - 0.06 ? 1 : u < 3 * B + 0.06 ? Math.cos(((u - (3 * B - 0.06)) / 0.12) * Math.PI) : -1;
  const f = flashAt(t, [at + B, at + 3 * B]);
  return (
    <AbsoluteFill style={{ transform: `translateX(${dx}px) ${drift}`, filter: blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : undefined }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: "50% 60%" }}>
        <Wall t={t} />
        {/* its shadow on the floor */}
        <div style={{ position: "absolute", left: W / 2 - w * 0.5, top: FLOOR - 26, width: w, height: 52, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.75), rgba(0,0,0,0) 70%)", opacity: clamp(drop) }} />
        <Img
          src={staticFile(`lineup/${s.img}.png`)}
          style={{
            position: "absolute",
            left: W / 2 - w / 2,
            top: y,
            width: w,
            height: h,
            imageRendering: s.pixel ? "pixelated" : "auto",
            transform: `scaleX(${turn})`,
            filter: `${fringe(f, `${s.colour}55`)} brightness(${(1.08 + 0.5 * f).toFixed(2)})`,
          }}
        />
        <Evidence t={t} at={at + 2 * B} s={s} letter={LETTERS[i]!} />
      </AbsoluteFill>
      {ready ? (
        <>
          <Placard t={t} at={at + B} name={s.name} no={`BOOKING NO. 00${i + 1} / 008`} charge={s.charge} colour={s.colour} />
          <Hud t={t} label={`SUSPECT ${i + 1}/8`} />
          {u > 3 * B ? (
            <div style={{ position: "absolute", right: 60, top: 600, fontFamily: TERM, fontSize: 40, color: "rgba(232,242,246,0.8)", letterSpacing: 4, opacity: span(u, 3 * B, 9, 0.05, 0.1) }}>
              PROFILE ▸
            </div>
          ) : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ X: the camera looks up */

/* his world is taller than the frame: the chart goes on up past him */
const XWH = 3700;
const XFLOOR = 3550;
const XW = 1640;
const XH = (XW / SIZE["x-hd"]![0]) * SIZE["x-hd"]![1];
const XTOP = XFLOOR + 60 - XH;
const EYES: [number, number][] = [
  [0.402, 0.166],
  [0.494, 0.141],
  [0.583, 0.168],
];
const EYE_Y = XTOP + 0.158 * XH;
const CAM0 = XWH - H;
const CAM1 = EYE_Y - 660;

const XBooking: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.x;
  const inn = 1 - easeOut(u / 0.14);
  const cam = CAM0 + (CAM1 - CAM0) * easeInOut((t - S.xTilt) / (S.xEyes - S.xTilt - 0.1));
  const lit = smooth((t - S.xEyes) / 0.25);
  const f = flashAt(t, [S.xFlash]);
  const out = smooth((t - (S.lineup - 0.25)) / 0.25);
  const heights: [number, string][] = [
    [S.xTilt + 0.3, "HEIGHT: ..."],
    [S.xTilt + 1.1, "HEIGHT: ...STILL GOING"],
    [S.xTilt + 2.0, "HEIGHT: YES."],
  ];
  let hl = "";
  for (const [at, s] of heights) if (t >= at) hl = s;
  return (
    <AbsoluteFill style={{ transform: `translateX(${inn * W * 0.9}px)`, filter: inn > 0.02 ? `blur(${(18 * inn).toFixed(1)}px)` : undefined, opacity: 1 - out }}>
      <div style={{ position: "absolute", left: 0, top: -cam, width: W, height: XWH }}>
        <Wall t={t} top={0} height={XWH} floor={XFLOOR} light={1} flicker={u < 0.8 ? 0.35 : 0} />
        <Img
          src={staticFile("lineup/x-hd.png")}
          style={{
            position: "absolute",
            left: W / 2 - XW / 2,
            top: XTOP,
            width: XW,
            height: XH,
            filter: `${fringe(f, "rgba(255,40,60,0.35)")} brightness(${(1.55 + 0.6 * f + 0.25 * lit).toFixed(2)}) contrast(1.08) saturate(1.15)`,
          }}
        />
        {/* the eyes light */}
        {EYES.map(([ex, ey], k) => (
          <div
            key={k}
            style={{
              position: "absolute",
              left: W / 2 - XW / 2 + ex * XW - 120,
              top: XTOP + ey * XH - 120,
              width: 240,
              height: 240,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,70,80,0.95) 0%, rgba(255,40,60,0.45) 30%, rgba(255,0,40,0) 70%)",
              mixBlendMode: "screen",
              opacity: lit * (0.85 + 0.15 * Math.sin(t * 9 + k)),
            }}
          />
        ))}
        <div style={{ position: "absolute", left: 0, top: XFLOOR - 40, width: W, height: 200, background: "linear-gradient(180deg, rgba(5,7,12,0) 0%, #06090d 60%)" }} />
      </div>
      {ready ? (
        <>
          <Hud t={t} label="SUSPECT 8/8" />
          {hl && t < S.xEyes + 0.2 ? (
            <div style={{ position: "absolute", left: 48, top: 130, fontFamily: TERM, fontSize: 54, color: GOLD, letterSpacing: 4, textShadow: "0 2px 0 #000" }}>{hl}</div>
          ) : null}
          {t >= S.xTilt - 0.2 && t < S.xEyes ? (
            <div style={{ position: "absolute", left: 0, right: 0, top: 820, textAlign: "center", fontFamily: POSTER, fontSize: 64, letterSpacing: 14, color: "rgba(255,255,255,0.85)", opacity: span(t, S.xTilt - 0.2, S.xEyes, 0.2, 0.25) }}>
              ▲ LOOK UP ▲
            </div>
          ) : null}
          <Subtitle at={S.xSay} end={S.lineup - 0.2} who="X" text="Don't look up." colour="#ff6b74" y={0.6} size={78} />
          <Placard t={t} at={S.xFlash} name="X, THE HOLLOW" no="BOOKING NO. 008 / 008" charge="TAKING A FAMILY" colour="#ff4a5a" extra="LAST SEEN: ABOVE YOU" y={1340} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

/** the red that floods in when his eyes open */
const XRed: React.FC<{ t: number }> = ({ t }) => {
  const d = t - S.xEyes;
  if (d < -0.05 || d > 0.8) return null;
  return <AbsoluteFill style={{ backgroundColor: "#ff1030", mixBlendMode: "screen", opacity: 0.55 * Math.exp(-Math.max(0, d) / 0.16) * clamp((d + 0.05) / 0.05) }} />;
};

/* ------------------------------------------------------------------------------------------------ all eight */

const ROW: [string, number][] = [
  ["gloommother", 1],
  ["king", 2],
  ["queen", 3],
  ["mash-hd", 7],
  ["wyrm", 4],
  ["mimic", 5],
  ["collector-hd", 6],
];

/* X in the back row: big, but small enough that his eyes are in the picture */
const LXH = 1500;
const LXW = (LXH / SIZE["x-hd"]![1]) * SIZE["x-hd"]![0];

const Lineup8: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.lineup;
  const inn = smooth(u / 0.3);
  const out = smooth((t - (S.wanted - 0.2)) / 0.3);
  const zoom = 1.12 - 0.12 * easeOut(u / 1.2);
  const floor = 1330;
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - 0.65 * out), transform: `scale(${zoom})` }}>
      <Wall t={t} ft={30} floor={floor} />
      {/* X behind them all, in the dark, too big for the room */}
      <Img
        src={staticFile("lineup/x-hd.png")}
        style={{ position: "absolute", left: W / 2 - LXW / 2, top: floor + 60 - LXH, width: LXW, height: LXH, filter: "brightness(0.55) contrast(1.1) drop-shadow(0 0 40px rgba(255,30,60,0.35))", opacity: 0.95 }}
      />
      {EYES.map(([ex, ey], k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: W / 2 - LXW / 2 + ex * LXW - 70,
            top: floor + 60 - LXH + ey * LXH - 70,
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,70,80,0.95) 0%, rgba(255,30,50,0.4) 35%, rgba(255,0,40,0) 70%)",
            mixBlendMode: "screen",
            opacity: 0.8 + 0.2 * Math.sin(t * 6 + k),
          }}
        />
      ))}
      <div style={{ position: "absolute", left: 0, top: floor - 520, width: W, height: 640, background: "linear-gradient(180deg, rgba(8,12,18,0) 0%, rgba(8,12,18,0.55) 55%, rgba(8,12,18,0.2) 100%)" }} />
      {ROW.map(([img, no], k) => {
        const [sw, sh] = SIZE[img]!;
        const pixel = !img.endsWith("-hd");
        const sc = Math.min(165 / sw, 230 / sh) * (pixel ? 1.0 : 1.15);
        const w = sw * sc;
        const h = sh * sc;
        const x = 82 + k * 152;
        const pop = backOut((u - 0.05 * k) / 0.25);
        return (
          <React.Fragment key={img}>
            <div style={{ position: "absolute", left: x - w * 0.5, top: floor - 12, width: w, height: 24, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(0,0,0,0.8), rgba(0,0,0,0) 70%)" }} />
            <Img
              src={staticFile(`lineup/${img}.png`)}
              style={{ position: "absolute", left: x - w / 2, top: floor - h + (1 - clamp(pop)) * 40, width: w, height: h, imageRendering: pixel ? "pixelated" : "auto", opacity: clamp(pop * 2), filter: "brightness(1.1) drop-shadow(0 0 14px rgba(200,235,255,0.25))" }}
            />
            <div style={{ position: "absolute", left: x - 30, top: floor + 26, width: 60, height: 60, backgroundColor: "#0a0c0f", border: "3px solid #2a2e33", color: "#fff", fontFamily: POSTER, fontSize: 48, lineHeight: "60px", textAlign: "center", opacity: clamp(pop * 2) }}>
              {no}
            </div>
          </React.Fragment>
        );
      })}
      {/* number eight is the one behind */}
      <div style={{ position: "absolute", left: W / 2 - 34, top: 380, width: 68, height: 68, backgroundColor: "#0a0c0f", border: "3px solid #5a1a22", color: "#ff5a6a", fontFamily: POSTER, fontSize: 54, lineHeight: "68px", textAlign: "center" }}>8</div>
      <Siren t={t} k={0.55} />
      {ready ? (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 1480, textAlign: "center", fontFamily: POSTER, fontSize: 92, letterSpacing: 10, color: "#fff", textShadow: "0 6px 0 #000", opacity: span(t, S.lineup + 0.3, 99, 0.25, 0.1) }}>
            8 BOSSES · 2D → 3D
          </div>
          <Stamp t={t} at={S.stamp1} text="RELEASED" sub="TODAY" x={W / 2} y={600} rot={-11} size={190} />
          <Stamp t={t} at={S.stamp2} text="BAIL: $0" x={W / 2 + 30} y={880} rot={6} size={150} colour="#ffd23a" />
          {t > S.stamp2 + 0.35 ? (
            <div style={{ position: "absolute", left: 650, top: 960, fontFamily: MARKER, fontSize: 64, color: GOLD, transform: "rotate(-6deg)", opacity: clamp((t - S.stamp2 - 0.35) / 0.15), textShadow: "0 3px 0 #000" }}>
              ↖ it's FREE
            </div>
          ) : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the wanted poster */

const Wanted: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.wanted;
  const drop = backOut(u / 0.45);
  const swing = Math.exp(-u / 0.5) * Math.sin(u * 14) * 4;
  const push = 1 + 0.06 * smooth(u / 3.4);
  const out = smooth((t - (S.end - 0.3)) / 0.3);
  const PW = 860;
  const PH = 1300;
  const px = W / 2 - PW / 2;
  const py = 300;
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <Wall t={t} light={0.5} />
      <AbsoluteFill style={{ backgroundColor: "rgba(3,5,9,0.62)" }} />
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <div
          style={{
            position: "absolute",
            left: px,
            top: py - (1 - clamp(drop)) * 1500,
            width: PW,
            height: PH,
            transform: `rotate(${(-1.5 + swing).toFixed(2)}deg)`,
            transformOrigin: "50% 0",
          }}
        >
          {/* the paper: old, stained, its edges torn */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              filter: "url(#paper)",
              background:
                "radial-gradient(ellipse 40% 30% at 20% 80%, rgba(120,80,30,0.28), rgba(0,0,0,0) 70%), radial-gradient(ellipse 30% 25% at 85% 15%, rgba(120,80,30,0.22), rgba(0,0,0,0) 70%), radial-gradient(ellipse at 50% 45%, #efe2c3 0%, #e2d0a8 70%, #c9b283 100%)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.85)",
            }}
          />
          {ready ? (
            <div style={{ position: "absolute", inset: 0, textAlign: "center", color: "#2b1a10", paddingTop: 40 }}>
              <div style={{ fontFamily: POSTER, fontSize: 250, lineHeight: 0.85, letterSpacing: 14, filter: "url(#ink)" }}>WANTED</div>
              <div style={{ fontFamily: POSTER, fontSize: 56, letterSpacing: 16, marginTop: 4 }}>ONE SMALL HERO</div>
              {/* the photo: the little blob, glowing in the night */}
              <div
                style={{
                  position: "relative",
                  margin: "26px auto 0",
                  width: 560,
                  height: 400,
                  background: "radial-gradient(ellipse at 50% 60%, #1f4a5a 0%, #0c1a26 60%, #050a10 100%)",
                  border: "10px solid #2b1a10",
                  boxShadow: "inset 0 0 60px rgba(0,0,0,0.7)",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "absolute", left: 280 - 220, top: 120, width: 440, height: 300, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,215,120,0.55), rgba(255,215,120,0) 65%)" }} />
                <Img
                  src={staticFile("lineup/blob.png")}
                  style={{ position: "absolute", left: 280 - 13 * 13, top: 380 - 20 * 13 + Math.sin(t * 5) * 6, width: 26 * 13, height: 20 * 13, imageRendering: "pixelated", filter: "drop-shadow(0 0 30px rgba(255,215,120,0.8))" }}
                />
              </div>
              <div style={{ fontFamily: '"Cormorant Garamond"', fontStyle: "italic", fontWeight: 600, fontSize: 56, marginTop: 22 }}>to bring all eight of them in</div>
              <div style={{ width: 600, height: 4, backgroundColor: "#2b1a10", margin: "18px auto", opacity: 0.7 }} />
              <div style={{ fontFamily: POSTER, fontSize: 84, letterSpacing: 6, color: "#7a1414" }}>REWARD: YOUR FAMILY BACK</div>
              <div style={{ fontFamily: POSTER, fontSize: 54, letterSpacing: 10, marginTop: 18, opacity: span(t, S.wanted + 1.1, 99, 0.2, 0.1) }}>APPLY AT ITCH.IO · NO FEE</div>
            </div>
          ) : null}
          {/* four tacks */}
          {[
            [26, 26],
            [PW - 56, 26],
            [26, PH - 56],
            [PW - 56, PH - 56],
          ].map(([x, y], k) => (
            <div
              key={k}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, #d8d8d8, #7a7a7a 60%, #2a2a2a)",
                boxShadow: "0 4px 6px rgba(0,0,0,0.6)",
                opacity: clamp((u - 0.45 - 0.12 * k) / 0.05),
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the end */

const End: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.end;
  const inn = smooth((u + 0.3) / 0.4);
  const logo = easeOut(u / 0.7);
  const line = (at: number) => ({ opacity: clamp((u - at) / 0.3), transform: `translateY(${(1 - easeOut((u - at) / 0.4)) * 30}px)` });
  return (
    <AbsoluteFill style={{ opacity: inn, background: "radial-gradient(ellipse 90% 70% at 50% 40%, #12243a 0%, #08101c 55%, #05060c 100%)" }}>
      <Fireflies n={26} colour="255,214,140" k={0.8} />
      <Siren t={t} k={0.18 * (1 - smooth(u / 2))} />
      <Img src={staticFile("lineup/logo.png")} style={{ position: "absolute", left: W / 2 - 520, top: 170 + (1 - logo) * 60, width: 1040, height: 1040 * (1900 / 2400), opacity: logo }} />
      {ready ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 1060, textAlign: "center" }}>
          <div style={{ fontFamily: POSTER, fontSize: 92, letterSpacing: 26, color: GOLD, textShadow: "0 0 30px rgba(255,215,120,0.45)", ...line(0.5) }}>OUT NOW</div>
          <div style={{ fontFamily: POSTER, fontSize: 170, lineHeight: 0.95, letterSpacing: 6, color: "#fff", textShadow: "0 6px 0 #000, 0 0 50px rgba(255,215,120,0.35)", marginTop: 10, ...line(0.8) }}>FREE ON ITCH.IO</div>
          <div style={{ fontFamily: '"Inter"', fontWeight: 600, fontSize: 44, color: "rgba(235,240,245,0.85)", marginTop: 30, ...line(1.2) }}>play in your browser · link in bio</div>
          <div style={{ fontFamily: TERM, fontSize: 40, letterSpacing: 8, color: "rgba(127,244,234,0.8)", marginTop: 26, ...line(1.6) }}>PHONE · TABLET · COMPUTER</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
