import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { Flash, useShake } from "../components/Effects";
import LINES from "../data/lines-popup.json";
import VOICE from "../data/lines-popup.voice.json";
import shorts from "../data/shorts.json";
import { GOLD } from "../lib/colours";
import { POSTER, useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip, Fireflies } from "./kit";

const S = shorts.shorts.popup;
const TURN = 0.7;

/**
 * THE POP-UP BOOK - the game's idea is a flat world that finds a third direction, and that is what a pop-up book does: flat
 * paper that stands up. A storybook on a desk under a lamp; the Mother reads it. Each page is printed with the 2D game, and the
 * cut-outs fold up off it: the family, X's eyes in the dark (the parents are pulled off the page), the five guardians one by one.
 * Then the page tears open on the 3D world, and X rises out from behind the book, past the top of the page, into the room. Two
 * more stand up in 3D; the last page is the family together again: "the rest of the story is yours". The book closes on its
 * cover - the logo - and it is free on itch.io.
 */

/* the book, in pixels: the standing page (backdrop), the page lying flat (floor), the paper's margin */
const BW = 960;
const PH = 780;
const PD = 780;
const M = 22;

type Piece = { img: string; x: number; z: number; w: number; at: number; flip?: boolean; pixel?: boolean; glow?: string; name?: string };
type Spread = { art: string; pieces: Piece[] };

const SIZE: Record<string, [number, number]> = {
  blob: [26, 20],
  mother: [32, 25],
  father: [36, 28],
  gloommother: [150, 112],
  king: [152, 107],
  queen: [124, 151],
  wyrm: [169, 111],
  mimic: [102, 123],
  "collector-hd": [670, 544],
  "mash-hd": [868, 503],
  "x-hd": [582, 1042],
  "tree-a": [48, 103],
  "tree-b": [57, 109],
  "tree-c": [41, 88],
  "x-eyes": [130, 32],
};

const [P1, P2, P3, P4, P5, P6] = S.spreads;
const G = S.guardians;
const SPREADS: Spread[] = [
  {
    art: "page1",
    pieces: [
      { img: "tree-a", x: 150, z: 150, w: 200, at: P1 + 0.05, pixel: true },
      { img: "tree-b", x: 820, z: 170, w: 230, at: P1 + 0.15, pixel: true },
      { img: "tree-c", x: 300, z: 330, w: 140, at: P1 + 0.25, pixel: true },
      { img: "father", x: 360, z: 560, w: 150, at: P1 + 0.45, pixel: true },
      { img: "blob", x: 480, z: 600, w: 110, at: P1 + 0.55, pixel: true, glow: "rgba(255,215,120,0.8)" },
      { img: "mother", x: 600, z: 560, w: 135, at: P1 + 0.65, pixel: true },
    ],
  },
  {
    art: "page2",
    pieces: [
      { img: "father", x: 360, z: 560, w: 150, at: P2 + 0.1, pixel: true },
      { img: "blob", x: 480, z: 600, w: 110, at: P2 + 0.15, pixel: true, glow: "rgba(255,215,120,0.8)" },
      { img: "mother", x: 600, z: 560, w: 135, at: P2 + 0.2, pixel: true },
    ],
  },
  {
    art: "page3",
    pieces: [
      { img: "blob", x: 480, z: 700, w: 80, at: P3 + 0.1, pixel: true, glow: "rgba(255,215,120,0.8)" },
      { img: "gloommother", x: 480, z: 200, w: 360, at: G[0]!, pixel: true, glow: "rgba(111,240,255,0.55)", name: "GLOOMMOTHER" },
      { img: "king", x: 185, z: 330, w: 290, at: G[1]!, pixel: true, flip: true, glow: "rgba(232,178,122,0.5)", name: "THORNBACK KING" },
      { img: "queen", x: 795, z: 330, w: 200, at: G[2]!, pixel: true, glow: "rgba(217,184,255,0.6)", name: "TOLL QUEEN" },
      { img: "wyrm", x: 265, z: 590, w: 250, at: G[3]!, pixel: true, glow: "rgba(244,239,224,0.45)", name: "BONE WYRM" },
      { img: "mimic", x: 715, z: 590, w: 160, at: G[4]!, pixel: true, glow: "rgba(255,138,168,0.55)", name: "MIMIC QUEEN" },
    ],
  },
  { art: "page4", pieces: [{ img: "blob", x: 480, z: 600, w: 100, at: P4 + 0.1, pixel: true, glow: "rgba(255,215,120,0.8)" }] },
  {
    art: "page5",
    pieces: [
      { img: "blob", x: 480, z: 720, w: 80, at: P5 + 0.1, pixel: true, glow: "rgba(255,215,120,0.8)" },
      { img: "collector-hd", x: 265, z: 430, w: 520, at: S.two[0]!, glow: "rgba(247,213,110,0.5)", name: "THE COLLECTOR" },
      { img: "mash-hd", x: 680, z: 520, w: 520, at: S.two[1]!, glow: "rgba(255,90,120,0.5)", name: "THE MASH" },
    ],
  },
  {
    art: "page6",
    pieces: [
      { img: "tree-a", x: 140, z: 200, w: 190, at: P6 + 0.25, pixel: true },
      { img: "tree-b", x: 830, z: 220, w: 210, at: P6 + 0.35, pixel: true },
      { img: "blob", x: 480, z: 560, w: 150, at: P6 + 0.1, pixel: true, glow: "rgba(255,215,120,0.9)" },
    ],
  },
];

/** which spread is open now (the one being turned away counts until its leaf lands) */
const spreadAt = (t: number) => {
  let i = 0;
  for (let k = 0; k < S.turns.length; k++) if (t >= S.turns[k]! + TURN) i = k + 1;
  return i;
};

/* ------------------------------------------------------------------------------------------------ the camera */

type Cam = { tilt: number; y: number; z: number };
const COVER: Cam = { tilt: -74, y: -660, z: -40 };
const OPEN: Cam = { tilt: -22, y: 40, z: -60 };
const UP: Cam = { tilt: -3, y: 1180, z: -340 };
const mix = (a: Cam, b: Cam, u: number): Cam => ({ tilt: a.tilt + (b.tilt - a.tilt) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });

const camAt = (t: number): Cam => {
  if (t < S.open) return { ...COVER, z: COVER.z + 60 * smooth(t / S.open) };
  if (t < P1 + 0.4) return mix({ ...COVER, z: COVER.z + 60 }, OPEN, easeInOut((t - S.open) / (P1 + 0.4 - S.open)));
  // a slow push in on each spread
  const i = spreadAt(t);
  const start = i === 0 ? P1 + 0.4 : S.spreads[i]!;
  let c: Cam = { ...OPEN, z: OPEN.z + 70 * smooth((t - start) / 4) };
  // X: the camera has to look up
  if (t >= S.rise - 0.2 && t < P5) {
    const up = easeInOut((t - (S.rise - 0.2)) / (S.eyes - S.rise + 0.2)) * (1 - easeInOut((t - S.turns[3]!) / 0.8));
    c = mix(c, UP, up);
  }
  // the book closes; the camera looks down on its cover
  if (t >= S.close) c = mix(c, COVER, easeInOut((t - S.close) / (S.end - S.close + 0.4)));
  return c;
};

/* ------------------------------------------------------------------------------------------------ the film */

export const Popup: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = camAt(t);
  const shake = useShake([[S.tear, 0.6], [S.eyes, 1.2], [S.end, 0.35]]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0705" }}>
      <AbsoluteFill style={{ transform: shake }}>
        {/* the room: a lamp's warm pool on a dark desk */}
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 55% at 45% 58%, #3b2817 0%, #1c120a 55%, #070504 100%)" }} />
        <AbsoluteFill style={{ perspective: 1700, perspectiveOrigin: "50% 30%" }}>
          <div
            style={{
              position: "absolute",
              left: W / 2,
              top: 1120,
              transformStyle: "preserve-3d",
              transform: `translateY(${cam.y.toFixed(1)}px) translateZ(${cam.z.toFixed(1)}px) rotateX(${cam.tilt.toFixed(2)}deg)`,
            }}
          >
            <Desk />
            <XRising t={t} />
            <Backdrop t={t} />
            <Floor t={t} />
            <Leaf t={t} />
          </div>
        </AbsoluteFill>
        {/* the lamp's light and the dust in it */}
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 45% at 30% 20%, rgba(255,196,120,0.16), rgba(0,0,0,0) 70%)", mixBlendMode: "screen" }} />
        <Fireflies n={20} colour="255,210,150" k={0.45} />
        {ready ? <Captions t={t} /> : null}
        {ready ? <Names t={t} /> : null}
        {ready ? <EndWords t={t} /> : null}
        <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, mixBlendMode: "overlay", opacity: 0.2 }} />
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 65% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.62) 100%)" }} />
      </AbsoluteFill>
      <EyesRed t={t} />
      <Flash hits={[[S.end, 0.25]]} />
      {t > S.fadeOut ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: smooth((t - S.fadeOut) / (S.length - 0.05 - S.fadeOut)) }} /> : null}
      <Audio src={staticFile("audio/short-popup.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the book */

const PAPER = "#efe4c9";

/** a dark wooden desk under the book */
const Desk: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: -1600,
      top: -1600,
      width: 3200,
      height: 3200,
      transform: "translateY(14px) rotateX(90deg)",
      background:
        "radial-gradient(ellipse 30% 30% at 50% 52%, rgba(255,190,110,0.22), rgba(0,0,0,0) 70%), repeating-linear-gradient(90deg, #2c1b0e 0px, #33200f 22px, #2a190c 31px, #3a2513 58px, #2e1c0d 80px)",
    }}
  />
);

/** a printed page: the art, the paper's margin, a little grain, the light falling off toward the spine */
const Printed: React.FC<{ art: string; shade: "back" | "floor" }> = ({ art, shade }) => (
  <div style={{ position: "absolute", inset: 0, backgroundColor: PAPER, overflow: "hidden" }}>
    <Img
      src={staticFile(`popup/${art}.jpg`)}
      style={{ position: "absolute", left: M, top: M, width: BW - 2 * M, height: PH - 2 * M, objectFit: "cover", objectPosition: "50% 38%", imageRendering: "pixelated", filter: "saturate(1.15) brightness(1.08)" }}
    />
    <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 ${M}px ${PAPER}, inset 0 0 40px rgba(60,40,20,0.35)` }} />
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: shade === "back" ? "linear-gradient(180deg, rgba(0,0,0,0) 70%, rgba(40,25,10,0.35) 100%)" : "linear-gradient(0deg, rgba(0,0,0,0) 70%, rgba(40,25,10,0.4) 100%)",
      }}
    />
  </div>
);

/** the book's closed cover: navy cloth, a gold border, the logo */
const Cover: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: -14,
      borderRadius: 10,
      background: "radial-gradient(ellipse at 40% 35%, #1d2f52 0%, #12203c 55%, #0b1428 100%)",
      boxShadow: "inset 0 0 0 10px #0a1224, inset 0 0 0 14px #c9a24e, inset 0 0 0 18px #0a1224, inset 0 0 60px rgba(0,0,0,0.6)",
    }}
  >
    <Img src={staticFile("popup/logo.png")} style={{ position: "absolute", left: (BW + 28) / 2 - 430, top: 70, width: 860, height: 860 * (1900 / 2400) }} />
  </div>
);

/** the page that stands: the art of the open spread on its front, the cover on its back. It stands up as the book opens and lies
 * back down as it closes. On the edge's spread it tears open, and the 3D world shows through. */
const Backdrop: React.FC<{ t: number }> = ({ t }) => {
  const opening = t < P1 ? -90 + 90 * easeInOut((t - S.open) / (P1 - S.open)) : 0;
  const closing = t > S.close ? -90 * easeInOut((t - S.close) / (S.end - S.close)) : 0;
  const ang = t < P1 ? opening : closing;
  const i = spreadAt(t);
  const art = SPREADS[i]!.art;
  // the tear: a hole that opens in the middle of the page and keeps growing
  const tearing = i === 3 && t >= S.tear ? easeOut((t - S.tear) / 0.7) : 0;
  const hole = tearing > 0 ? holePath(tearing) : null;
  return (
    <div style={{ position: "absolute", left: -BW / 2, top: -PH, width: BW, height: PH, transformStyle: "preserve-3d", transformOrigin: "50% 100%", transform: `rotateX(${ang.toFixed(2)}deg)` }}>
      {/* the board behind the page */}
      <div style={{ position: "absolute", inset: -14, borderRadius: 10, background: "#0e1830", transform: "translateZ(-8px)" }} />
      {/* through the tear: the 3D world, playing */}
      {tearing > 0 ? (
        <div style={{ position: "absolute", left: M, top: M, width: BW - 2 * M, height: PH - 2 * M, overflow: "hidden", transform: "translateZ(-3px)", backgroundColor: "#000" }}>
          <Clip clip="wild-moon" at={S.tear - 0.1} from={0} dur={P5 - S.tear + 0.2} rate={0.55} box={[0, 0, BW - 2 * M, PH - 2 * M]} z={1.15} c={[0.5, 0.36]} />
        </div>
      ) : null}
      <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", clipPath: hole ? `path(evenodd, "M0 0 H${BW} V${PH} H0 Z ${hole}")` : undefined }}>
        <Printed art={art} shade="back" />
      </div>
      {/* the torn edge of the paper */}
      {hole ? (
        <svg width={BW} height={PH} style={{ position: "absolute", left: 0, top: 0, transform: "translateZ(1px)", overflow: "visible" }}>
          <path d={hole} fill="none" stroke="#f6ecd4" strokeWidth={9} strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 10px rgba(255,220,150,0.6))" }} />
        </svg>
      ) : null}
      {/* X's eyes open in the dark above the family, and come forward off the page */}
      {i === 1 ? <EyesOnPage t={t} /> : null}
      {/* the cover: on the outside of the board */}
      <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "translateZ(-9px) rotateX(180deg)" }}>
        <Cover />
      </div>
    </div>
  );
};

/** the tear's outline: a jagged ring that grows from the middle of the page */
const holePath = (u: number) => {
  const cx = BW / 2;
  const cy = PH * 0.48;
  const n = 34;
  const pts: string[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const jag = k % 2 ? 0.82 + 0.1 * rand(k) : 1 + 0.12 * rand(k + 40);
    const r = u * 400 * jag;
    pts.push(`${(cx + Math.cos(a) * r * 1.08).toFixed(1)} ${(cy + Math.sin(a) * r * 0.92).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
};

const EyesOnPage: React.FC<{ t: number }> = ({ t }) => {
  const up = clamp(backOut((t - (P2 + 0.25)) / 0.5));
  const glow = 0.75 + 0.25 * Math.sin(t * 7);
  const w = 600;
  return (
    <div style={{ position: "absolute", left: BW / 2 - w / 2, top: 110, width: w, height: w * (32 / 130), transform: `translateZ(${(90 * up).toFixed(1)}px) scale(${0.6 + 0.4 * up})`, opacity: up }}>
      <Img src={staticFile("popup/x-eyes.png")} style={{ width: "100%", height: "100%", imageRendering: "pixelated", filter: `drop-shadow(0 0 ${(26 * glow).toFixed(0)}px rgba(255,40,60,0.9))` }} />
    </div>
  );
};

/** the page lying flat, and the cut-outs that stand up off it */
const Floor: React.FC<{ t: number }> = ({ t }) => {
  const i = spreadAt(t);
  const sp = SPREADS[i]!;
  // everything folds flat just before the page is turned (and before the book closes)
  const foldAt = i < S.turns.length ? S.turns[i]! - 0.3 : S.close - 0.4;
  const fold = smooth((t - foldAt) / 0.3);
  const open = t < P1 ? 0 : 1;
  return (
    <div style={{ position: "absolute", left: -BW / 2, top: 0, width: BW, height: PD, transformStyle: "preserve-3d", transformOrigin: "50% 0", transform: "rotateX(90deg)" }}>
      <div style={{ position: "absolute", inset: -14, borderRadius: 10, background: "#0e1830", transform: "translateZ(-8px)", boxShadow: "0 0 60px rgba(0,0,0,0.7)" }} />
      {/* the stack of pages under this one */}
      <div style={{ position: "absolute", left: 4, top: 6, width: BW - 8, height: PD, background: "#d9cba8", transform: "translateZ(-4px)" }} />
      <div style={{ position: "absolute", inset: 0 }}>
        <Ground />
      </div>
      {open
        ? sp.pieces.map((p, k) => {
            let up = clamp(backOut((t - p.at) / 0.5)) * (1 - fold);
            let lift = 0;
            let fade = 1;
            // the parents are taken: pulled up off the page, into the dark
            if (i === 1 && (p.img === "mother" || p.img === "father")) {
              const u = easeInOut((t - S.taken) / 0.8);
              lift = 340 * u;
              fade = 1 - smooth((t - S.taken - 0.35) / 0.4);
            }
            if (t < p.at - 0.02) up = 0;
            // a piece folded flat is put away (it would stick out past the spine)
            if (up < 0.01) return null;
            return <Cutout key={`${i}-${k}`} p={p} up={up} lift={lift} fade={fade} t={t} />;
          })
        : null}
    </div>
  );
};

/** the floor's ground: the 2D forest's own moss, printed */
const Ground: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, backgroundColor: PAPER, overflow: "hidden" }}>
    <Img src={staticFile("popup/ground.jpg")} style={{ position: "absolute", left: M, top: M, width: BW - 2 * M, height: PD - 2 * M, objectFit: "cover", imageRendering: "pixelated", filter: "brightness(1.15) saturate(1.1)" }} />
    <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 0 ${M}px ${PAPER}, inset 0 0 40px rgba(60,40,20,0.35)` }} />
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(30,18,8,0.45) 0%, rgba(0,0,0,0) 30%)" }} />
  </div>
);

/** a cut-out: paper with a white edge, hinged at its foot, standing up off the floor page (up: 0 flat, 1 standing) */
const Cutout: React.FC<{ p: Piece; up: number; lift: number; fade: number; t: number }> = ({ p, up, lift, fade, t }) => {
  const [sw, sh] = SIZE[p.img]!;
  const w = p.w;
  const h = (w / sw) * sh;
  const bob = p.img === "blob" ? Math.sin(t * 5) * 3 : 0;
  return (
    <>
      {/* its shadow on the page, behind it (toward the spine) */}
      <div
        style={{
          position: "absolute",
          left: p.x - w * 0.5,
          top: p.z - 30 - h * 0.25 * up,
          width: w,
          height: 40 + h * 0.25 * up,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(20,10,0,0.55), rgba(0,0,0,0) 70%)",
          opacity: up * fade,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: p.x - w / 2,
          top: p.z - h - lift,
          width: w,
          height: h,
          transformOrigin: "50% 100%",
          transform: `translateZ(${(lift * 0.6).toFixed(1)}px) rotateX(${(-90 * up).toFixed(2)}deg)`,
          opacity: fade,
        }}
      >
        <Img
          src={staticFile(`popup/${p.img}.png`)}
          style={{
            width: w,
            height: h,
            transform: `${p.flip ? "scaleX(-1)" : ""} translateY(${bob.toFixed(1)}px)`,
            imageRendering: p.pixel ? "pixelated" : "auto",
            filter: `drop-shadow(5px 0 0 #fbf5e6) drop-shadow(-5px 0 0 #fbf5e6) drop-shadow(0 5px 0 #fbf5e6) drop-shadow(0 -5px 0 #fbf5e6)${p.glow ? ` drop-shadow(0 0 18px ${p.glow})` : ""}`,
          }}
        />
      </div>
    </>
  );
};

/** the leaf being turned: lifted off the floor, over the spine, laid on the standing page; its back is the next page's art */
const Leaf: React.FC<{ t: number }> = ({ t }) => {
  const k = S.turns.findIndex((tt) => t >= tt && t < tt + TURN);
  if (k < 0) return null;
  const u = easeInOut((t - S.turns[k]!) / TURN);
  const ang = 90 + 90 * u;
  const next = SPREADS[k + 1]!.art;
  return (
    <div style={{ position: "absolute", left: -BW / 2, top: 0, width: BW, height: PD, transformStyle: "preserve-3d", transformOrigin: "50% 0", transform: `rotateX(${ang.toFixed(2)}deg)` }}>
      <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "translateZ(1px)" }}>
        <Ground />
        <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(0,0,0,${(0.35 * Math.sin(u * Math.PI)).toFixed(2)})` }} />
      </div>
      <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateX(180deg)" }}>
        <Printed art={next} shade="back" />
        <div style={{ position: "absolute", inset: 0, backgroundColor: `rgba(0,0,0,${(0.35 * Math.sin(u * Math.PI)).toFixed(2)})` }} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ X rises out of the book */

const XW = 1050;
const XH = (XW / SIZE["x-hd"]![0]) * SIZE["x-hd"]![1];
const EYES: [number, number][] = [
  [0.402, 0.166],
  [0.494, 0.141],
  [0.583, 0.168],
];

const XRising: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.rise - 0.1 || t > P5 + 0.2) return null;
  const u = easeInOut((t - S.rise) / (S.eyes - S.rise));
  const down = easeInOut((t - S.turns[3]!) / 0.6);
  // his top rises from the spine to well above the page; behind the page, below the desk, he is hidden
  const top = 3000 - XH * 0.05 - (PH + 820) * u + (PH + 820) * down;
  const lit = smooth((t - S.eyes) / 0.2);
  return (
    <div style={{ position: "absolute", left: -900, top: -3000, width: 1800, height: 3000, overflow: "hidden", transform: "translateZ(-110px)" }}>
      <Img
        src={staticFile("popup/x-hd.png")}
        style={{ position: "absolute", left: 900 - XW / 2, top, width: XW, height: XH, filter: `brightness(${(1.45 + 0.35 * lit).toFixed(2)}) contrast(1.08) drop-shadow(0 0 50px rgba(255,40,70,${(0.25 + 0.4 * lit).toFixed(2)}))` }}
      />
      {EYES.map(([ex, ey], k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: 900 - XW / 2 + ex * XW - 90,
            top: top + ey * XH - 90,
            width: 180,
            height: 180,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,80,90,0.95) 0%, rgba(255,40,60,0.45) 30%, rgba(255,0,40,0) 70%)",
            mixBlendMode: "screen",
            opacity: lit * (0.85 + 0.15 * Math.sin(t * 9 + k)),
          }}
        />
      ))}
    </div>
  );
};

const EyesRed: React.FC<{ t: number }> = ({ t }) => {
  const d = t - S.eyes;
  if (d < -0.05 || d > 0.8) return null;
  return <AbsoluteFill style={{ backgroundColor: "#ff1030", mixBlendMode: "screen", opacity: 0.5 * Math.exp(-Math.max(0, d) / 0.18) * clamp((d + 0.05) / 0.05) }} />;
};

/* ------------------------------------------------------------------------------------------------ words */

/** the story, as the Mother reads it, set like a book's text above the page */
const Captions: React.FC<{ t: number }> = ({ t }) => {
  const k = VOICE.findIndex((v) => t >= v.at - 0.1 && t < v.at + v.dur + 0.7);
  if (k < 0 || t > S.end - 0.3) return null;
  const v = VOICE[k]!;
  const text = LINES.find((l) => l.id === v.id)!.caption;
  const o = smooth((t - (v.at - 0.1)) / 0.3) * (1 - smooth((t - (v.at + v.dur + 0.4)) / 0.3));
  const dark = v.id === "b6";
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top: 150, textAlign: "center", opacity: o, transform: `translateY(${((1 - o) * 14).toFixed(1)}px)` }}>
      <div
        style={{
          fontFamily: '"Cormorant Garamond"',
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: dark ? 84 : 68,
          lineHeight: 1.15,
          color: dark ? "#ff6b74" : "#f6ead0",
          textShadow: dark ? "0 0 30px rgba(255,40,60,0.7), 0 3px 0 #000" : "0 0 24px rgba(255,200,120,0.35), 0 3px 0 rgba(0,0,0,0.85)",
        }}
      >
        <span style={{ color: dark ? "#ff6b74" : GOLD, fontSize: "1.25em" }}>{text[0]}</span>
        {text.slice(1)}
      </div>
    </div>
  );
};

/** each boss's name as it stands up */
const Names: React.FC<{ t: number }> = ({ t }) => {
  for (const sp of SPREADS)
    for (const p of sp.pieces) {
      if (!p.name) continue;
      const d = t - p.at;
      if (d >= 0 && d < 0.95) {
        const o = smooth(d / 0.15) * (1 - smooth((d - 0.75) / 0.2));
        return (
          <div style={{ position: "absolute", left: 0, right: 0, top: 318, textAlign: "center", opacity: o, fontFamily: POSTER, fontSize: 64, letterSpacing: 16, color: "#f6ead0", textShadow: "0 0 24px rgba(255,200,120,0.4), 0 4px 0 #000" }}>
            {p.name}
          </div>
        );
      }
    }
  return null;
};

/** the closed book's words: out now, free */
const EndWords: React.FC<{ t: number }> = ({ t }) => {
  const u = t - S.end;
  if (u < 0) return null;
  const line = (at: number) => ({ opacity: clamp((u - at) / 0.35), transform: `translateY(${((1 - easeOut((u - at) / 0.45)) * 26).toFixed(1)}px)` });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 1410, textAlign: "center" }}>
      <div style={{ fontFamily: POSTER, fontSize: 84, letterSpacing: 24, color: GOLD, textShadow: "0 0 30px rgba(255,215,120,0.45), 0 4px 0 #000", ...line(0.4) }}>OUT NOW</div>
      <div style={{ fontFamily: POSTER, fontSize: 150, lineHeight: 0.95, letterSpacing: 6, color: "#fff", textShadow: "0 6px 0 #000, 0 0 50px rgba(255,215,120,0.35)", marginTop: 8, ...line(0.7) }}>FREE ON ITCH.IO</div>
      <div style={{ fontFamily: '"Inter"', fontWeight: 600, fontSize: 42, color: "rgba(240,232,215,0.88)", marginTop: 24, ...line(1.1) }}>play in your browser · link in bio</div>
    </div>
  );
};
