import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import SONG from "../data/edit-skins.json";
import { PIXEL, POSTER, useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, H, lerp, rand, W } from "../lib/time";
import { blobOnScreen, blobSize, COLOUR, followAt, Glitch, GLOW, Halo, Leak, Rays, Shot, Skin, Sparks, SpeedLines, View } from "./fx";

/**
 * THE SKINS EDIT (v2): the skins update cut to a song (public/audio/edit-skins.wav, the owner's choice of track, 0-43.2 s of
 * it), mostly in the 2D forest, the Blob on a layer of its own all the way through (fx.tsx): its aura burning round it, a
 * sticker outline, the world going grey while it stays in colour, words behind it, popping out of a tilted card, impact frames.
 *
 *   0     the hook: each skin close, its aura on fire, NEW SKINS behind it, one on each of the song's three pickups
 *   0.72  "bro is 16 pixels tall": the 2D Blob, small, then fighting; "with final boss aura" (Golden under X)
 *   4.78  X comes into the forest; his foot on the hit at 6.62
 *   6.99  the drip check: four skins, four beats each (the fight; a freeze, the world grey, its name behind it; the 3D one
 *         popping out of a card); a roulette a beat at a time; a strobe of impact frames; NOW / WATCH.
 *  18.34  the first drop: a cut on every kick, 2D fights and 3D fights, velocity ramps, trails, impacts
 *  27.52  the breakdown: Golden alone in its aura, the world grey ("the 5th skin... only if you beat NIGHTMARE")
 *  30.07  the second drop: GOLDEN; the forest tears open into 3D; every skin in 2D and in 3D; the five; FREE
 *  41.08  PLAY FREE; on the last hit the logo and where to play
 *
 * The footage: ../the-third-direction/tools/trailer/shots-skins.mjs, captured into public/edit2/ (scripts/edit-layers.py).
 */

export const EDIT_LENGTH = 43.2;
const FPS = 30;
const SANS = "Inter";
const B = 0.3715; // a beat (161.5 a minute)
const BEATS: number[] = SONG.beats;
/** the song's own beat nearest t: every cut lands on one */
const snap = (t: number) => BEATS.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), BEATS[0]!);
const HIT = SONG.hits;
const DROP1 = 18.34;
const GAP = 27.52;
const DROP2 = 30.07;
const OUT = 41.08;
const LAST = 41.8;

const SKINS4: Skin[] = ["explorer", "knight", "wizard", "inferno"];
/** each skin's 2D fight, and who it is against */
const FIGHT: Record<Skin, string> = { golden: "e-f-gloom-golden", inferno: "e-f-thicket-inferno", knight: "e-f-marsh-knight", wizard: "e-f-bones-wizard", explorer: "e-f-meadow-explorer" };
const FOE: Record<Skin, string> = { golden: "GLOOM MOTHER", inferno: "THORNBACK KING", knight: "TOLL QUEEN", wizard: "BONE WYRM", explorer: "MIMIC QUEEN" };
/** a quiet frame of each 2D fight, the Blob in the open (for freezes and the split screens) */
const STILL: Record<Skin, number> = { golden: 270, inferno: 290, knight: 330, wizard: 345, explorer: 200 };

/** the looks: the forest brighter (it is drawn dark for a phone in the dark), the Crater a touch richer, the world gone grey */
const BG2 = "brightness(1.32) contrast(1.12) saturate(1.3)";
const BG3 = "contrast(1.1) saturate(1.2) brightness(1.05)";
const GREY = "grayscale(1) brightness(0.36) contrast(1.25)";

/** speed ramps over a cut: u in 0..1 to how far through the source; velocity: fast, slow in the middle, fast */
const velo = (u: number) => u + (0.8 * Math.sin(2 * Math.PI * u)) / (2 * Math.PI);
const ramp = (u: number) => 1 - Math.pow(1 - clamp(u), 2.2);
const lin = (u: number) => u;

/* ------------------------------------------------------------------------------------------------ words */

/** a big word struck in: poster caps, a black outline, its light, and a split of red and cyan */
const Big: React.FC<{ text: string; y: number; size?: number; colour?: string; glow?: string; lt: number; tilt?: number; solid?: boolean; x?: number }> = ({ text, y, size = 190, colour = "#ffffff", glow = "255,255,255", lt, tilt = 0, solid, x }) => {
  const u = solid ? 1 : clamp(lt / 0.12);
  const s = 1.7 - 0.7 * backOut(u);
  return (
    <div
      style={{
        position: "absolute",
        left: x === undefined ? 0 : x - 1000,
        width: x === undefined ? W : 2000,
        top: y - size * 0.55,
        textAlign: "center",
        fontFamily: POSTER,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "0.02em",
        color: colour,
        opacity: u,
        transform: `scale(${s.toFixed(3)}) rotate(${tilt}deg)`,
        WebkitTextStroke: `${Math.max(3, size / 40).toFixed(0)}px #000`,
        paintOrder: "stroke fill",
        textShadow: `-6px 0 0 rgba(255,40,80,0.55), 6px 0 0 rgba(40,230,255,0.55), 0 0 40px rgba(${glow},0.9), 0 10px 0 rgba(0,0,0,0.55)`,
      }}
    >
      {text}
    </div>
  );
};

/** the meme line: lower case, heavy, white in a black outline, a word at a time */
const Meme: React.FC<{ text: string; y: number; lt: number; size?: number; per?: number }> = ({ text, y, lt, size = 76, per = 0.08 }) => (
  <div style={{ position: "absolute", left: 50, right: 50, top: y, textAlign: "center", fontFamily: SANS, fontWeight: 800, fontSize: size, lineHeight: 1.12, color: "#fff", WebkitTextStroke: "4px #000", paintOrder: "stroke fill", textShadow: "0 5px 18px rgba(0,0,0,0.9)" }}>
    {text.split(" ").map((w, i) => {
      const u = clamp((lt - i * per) / 0.07);
      return (
        <span key={i} style={{ opacity: u, display: "inline-block", transform: `scale(${(0.5 + 0.5 * backOut(u)).toFixed(3)})`, marginRight: "0.24em" }}>
          {w}
        </span>
      );
    })}
  </div>
);

/** a tag in the forest's own lettering: SKIN vs WHO */
const Tag: React.FC<{ skin: Skin; vs?: string; lt: number; y?: number }> = ({ skin, vs, lt, y = 1390 }) => {
  const u = clamp(lt / 0.1);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", opacity: u, transform: `translateY(${((1 - easeOut(u)) * 40).toFixed(1)}px)` }}>
      <div style={{ fontFamily: PIXEL, fontSize: 34, lineHeight: 1.5, padding: "14px 24px", background: "rgba(6,8,14,0.82)", border: `4px solid ${COLOUR[skin]}`, boxShadow: `0 0 28px rgba(${GLOW[skin]},0.7)`, color: "#fff", whiteSpace: "nowrap" }}>
        <span style={{ color: COLOUR[skin] }}>{skin.toUpperCase()}</span>
        {vs ? <span style={{ color: "#8a93a8" }}> vs </span> : null}
        {vs ? <span>{vs}</span> : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ pictures */

type Ctx = { lt: number; d: number; t: number; frame: number };

/** a skin close in 3D, its aura on fire, words behind it (the hook, GOLDEN) */
const Hero: React.FC<{ skin: Skin; c: Ctx; word?: string; wordSize?: number; i0?: number; zoom?: number }> = ({ skin, c, word, wordSize = 300, i0 = 40, zoom = 1.25 }) => {
  const v: View = { shot: `e-face-${skin}`, i: i0 + c.lt * 30, zoom, to: [W / 2, 1230], bg: "brightness(0.42) saturate(0.85) contrast(1.1)", frame: c.frame, fx: { aura: 0.95, flame: 0.6, glow: GLOW[skin] } };
  const [bx, by] = blobOnScreen(v);
  const bs = blobSize(v);
  return (
    <Shot
      {...v}
      behind={
        <>
          <Halo x={bx} y={by} glow={GLOW[skin]} r={760} />
          <Rays x={bx} y={by} glow={GLOW[skin]} t={c.t} a={0.9} />
          {word ? <Big text={word} y={by - bs * 0.42} size={wordSize} colour={COLOUR[skin]} glow={GLOW[skin]} lt={c.lt} solid={c.t < 0.75} /> : null}
          <Sparks x={bx} y={by} glow={GLOW[skin]} t={c.t} spread={bs * 1.3} />
        </>
      }
    />
  );
};

/** a 2D fight: the forest's pixels, followed, the Blob lit */
type TagT = [Skin, string?];
/** a shot with its tag, out of the Blob's way (under it, or at the top when the Blob is low) */
const Tagged: React.FC<{ v: View; tag?: TagT; lt: number }> = ({ v, tag, lt }) => (
  <>
    <Shot {...v} />
    {tag ? <Tag skin={tag[0]} vs={tag[1]} lt={lt} y={blobOnScreen(v)[1] > 1120 ? 250 : 1390} /> : null}
  </>
);

const Fight: React.FC<{ shot: string; skin: Skin; c: Ctx; a: number; span: number; curve?: (u: number) => number; zoom?: number; z1?: number; aura?: number; trail?: number; up?: number; tag?: TagT }> = ({ shot, skin, c, a, span, curve = velo, zoom = 7, z1, aura = 0.45, trail = 0, up = 0, tag }) => {
  const i = a + span * curve(clamp(c.lt / c.d));
  const z = z1 === undefined ? zoom : lerp(zoom, z1, easeOut(c.lt / c.d));
  const f = followAt(shot, i);
  return <Tagged v={{ shot, i, zoom: z, at: [f[0], f[1] - up], bg: BG2, frame: c.frame, fx: { aura, glow: GLOW[skin], trail } }} tag={tag} lt={c.lt} />;
};

/** a 3D fight or close-up, the Blob lit */
const Fight3: React.FC<{ shot: string; skin: Skin; c: Ctx; a: number; span: number; curve?: (u: number) => number; zoom?: number; z1?: number; aura?: number; at?: [number, number]; to?: [number, number]; trail?: number; tag?: TagT }> = ({ shot, skin, c, a, span, curve = velo, zoom = 1.05, z1, aura = 0.3, at, to, trail = 0, tag }) => {
  const i = a + span * curve(clamp(c.lt / c.d));
  const z = z1 === undefined ? zoom : lerp(zoom, z1, easeOut(c.lt / c.d));
  return <Tagged v={{ shot, i, zoom: z, at: at ?? [360, 640], to, bg: BG3, frame: c.frame, fx: { aura, glow: GLOW[skin], trail } }} tag={tag} lt={c.lt} />;
};

/** the world stops and goes grey; the Blob stays in colour, outlined, burning, its name behind it; the camera pushes in */
const Freeze: React.FC<{ skin: Skin; shot: string; i: number; c: Ctx; z0?: number; z1?: number; name?: string }> = ({ skin, shot, i, c, z0 = 8, z1 = 15, name }) => {
  const v: View = { shot, i, zoom: lerp(z0, z1, easeOut(c.lt / Math.max(0.2, c.d))), to: [W / 2, 1060], bg: GREY, frame: c.frame, fx: { outline: 9, aura: 1, flame: 0.45, glow: GLOW[skin] } };
  const [bx, by] = blobOnScreen(v);
  const bs = blobSize(v);
  return (
    <Shot
      {...v}
      behind={
        <>
          <Halo x={bx} y={by} glow={GLOW[skin]} r={620} a={0.8} />
          <Rays x={bx} y={by} glow={GLOW[skin]} t={c.t} a={0.8} />
          <Big text={name ?? skin.toUpperCase()} y={by - bs * 0.55} size={skin === "explorer" ? 230 : 270} colour={COLOUR[skin]} glow={GLOW[skin]} lt={c.lt} />
        </>
      }
    />
  );
};

/** the 3D Blob in a tilted card, popping out over its top edge */
const PopCard: React.FC<{ skin: Skin; c: Ctx; shot?: string; i0?: number; zoom?: number; label?: string }> = ({ skin, c, shot, i0 = 20, zoom = 0.8, label }) => {
  const sh = shot ?? `e-face-${skin}`;
  const two = sh.startsWith("e-f-") || sh.startsWith("e-z-") || sh.startsWith("e-w-") || sh.startsWith("e-edge");
  const v: View = { shot: sh, i: two ? i0 : i0 + c.lt * 36, zoom, to: [W / 2, 1010], bg: two ? BG2 : BG3, frame: c.frame, keepIn: two };
  const by = blobOnScreen(v)[1];
  const bs = blobSize(v);
  const x0 = 130;
  const y0 = Math.round(by - bs * (two ? 0.1 : 0.05));
  const cw = W - 2 * x0;
  const ch = 760;
  const u = clamp(c.lt / 0.18);
  const tilt = `perspective(2000px) rotateX(${(10 - 4 * u).toFixed(2)}deg) rotateZ(${(-5 + 2 * easeOut(c.lt / c.d)).toFixed(2)}deg) scale(${(0.8 + 0.2 * backOut(u)).toFixed(3)})`;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 60% at 50% 50%, rgba(${GLOW[skin]},0.45), #05040a 78%)` }}>
      <Rays x={W / 2} y={y0} glow={GLOW[skin]} t={c.t} a={0.7} n={18} reach={1400} />
      <Sparks x={W / 2} y={y0 + 300} glow={GLOW[skin]} t={c.t} spread={900} rise={1400} n={44} seed={3} />
      <AbsoluteFill style={{ transform: tilt, transformOrigin: `${W / 2}px ${y0 + ch / 2}px` }}>
        <div style={{ position: "absolute", left: x0, top: y0, width: cw, height: ch, overflow: "hidden", borderRadius: 34, border: "10px solid #fff", boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 60px rgba(${GLOW[skin]},0.6)` }}>
          <div style={{ position: "absolute", left: -x0 - 10, top: -y0 - 10, width: W, height: H }}>
            <Shot {...v} part="bg" />
          </div>
        </div>
        <Shot {...v} part="blob" fx={{ pop: 1, aura: 0.8, flame: 0.3, glow: GLOW[skin], outline: two ? 6 : 0 }} />
      </AbsoluteFill>
      {label ? <Big text={label} y={330} size={170} colour={COLOUR[skin]} glow={GLOW[skin]} lt={c.lt - 0.05} /> : null}
    </AbsoluteFill>
  );
};

/** the same skin in 2D (top) and in 3D (below) */
const Split: React.FC<{ skin: Skin; c: Ctx }> = ({ skin, c }) => {
  const half = H / 2;
  const u = easeOut(clamp(c.lt / 0.14));
  const shot2 = FIGHT[skin];
  const i2 = STILL[skin] + c.lt * 30;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: half - 4, overflow: "hidden", transform: `translateX(${((1 - u) * -W).toFixed(1)}px)` }}>
        <Shot shot={shot2} i={i2} zoom={lerp(12, 14, c.lt / c.d)} vw={W} vh={half - 4} to={[W / 2, half * 0.58]} bg={BG2} frame={c.frame} fx={{ aura: 0.85, outline: 6, glow: GLOW[skin] }} />
        <div style={{ position: "absolute", left: 40, top: 40, fontFamily: PIXEL, fontSize: 64, color: "#fff", textShadow: `0 0 20px rgba(${GLOW[skin]},0.9), 4px 4px 0 #000` }}>2D</div>
      </div>
      <div style={{ position: "absolute", left: 0, top: half + 4, width: W, height: half - 4, overflow: "hidden", transform: `translateX(${((1 - u) * W).toFixed(1)}px)` }}>
        <Shot shot={`e-face-${skin}`} i={40 + c.lt * 30} zoom={0.95} vw={W} vh={half - 4} to={[W / 2, half * 0.58]} keepIn={false} bg={BG3} frame={c.frame} fx={{ aura: 0.85, flame: 0.35, glow: GLOW[skin] }} />
        <div style={{ position: "absolute", right: 40, bottom: 40, fontFamily: POSTER, fontSize: 120, lineHeight: 1, color: "#fff", WebkitTextStroke: "4px #000", textShadow: `0 0 30px rgba(${GLOW[skin]},0.9)` }}>3D</div>
      </div>
      <div style={{ position: "absolute", left: 0, top: half - 5, width: W, height: 10, background: COLOUR[skin], boxShadow: `0 0 40px 8px rgba(${GLOW[skin]},0.9)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: half - 70, display: "flex", justifyContent: "center", opacity: u }}>
        <div style={{ fontFamily: POSTER, fontSize: 110, lineHeight: 1.15, padding: "0 36px", background: "#05040a", border: `6px solid ${COLOUR[skin]}`, borderRadius: 16, color: COLOUR[skin], boxShadow: `0 0 40px rgba(${GLOW[skin]},0.8)` }}>{skin.toUpperCase()}</div>
      </div>
    </AbsoluteFill>
  );
};

/** the Blob alone, big, outlined and burning, over its colour (the roulette); 2D or 3D */
const Solo: React.FC<{ skin: Skin; c: Ctx; three: boolean; name?: boolean; dark?: boolean }> = ({ skin, c, three, name = true, dark }) => {
  const v: View = three
    ? { shot: `e-face-${skin}`, i: 50 + c.lt * 30, zoom: 1.05, to: [W / 2, 1150], frame: c.frame, part: "blob", fx: { outline: dark ? 8 : 0, aura: dark ? 0 : 1, flame: dark ? 0 : 0.5, glow: GLOW[skin], silhouette: dark ? "black" : undefined } }
    : { shot: FIGHT[skin], i: STILL[skin] + c.lt * 30, zoom: 26, to: [W / 2, 1100], frame: c.frame, part: "blob", fx: { outline: 12, aura: 1, flame: 0.5, glow: GLOW[skin] } };
  const [bx, by] = blobOnScreen(v);
  const bs = blobSize(v);
  const punch = 1 + 0.12 * Math.exp(-c.lt / 0.08);
  return (
    <AbsoluteFill style={{ background: dark ? "radial-gradient(ellipse 80% 60% at 50% 55%, #3a2c08, #050402 75%)" : `radial-gradient(ellipse 80% 60% at 50% 55%, rgba(${GLOW[skin]},0.55), #050308 76%)`, transform: `scale(${punch.toFixed(3)})` }}>
      <Rays x={bx} y={by} glow={dark ? "255,210,120" : GLOW[skin]} t={c.t} a={0.9} n={16} reach={1300} />
      {name && !dark ? <Big text={skin.toUpperCase()} y={by - bs * 0.62} size={250} colour={COLOUR[skin]} glow={GLOW[skin]} lt={c.lt} solid /> : null}
      {dark ? <Big text="???" y={by - bs * 0.7} size={300} colour="#ffd24a" glow="255,200,80" lt={c.lt} solid /> : null}
      <Shot {...v} />
      {!three ? <div style={{ position: "absolute", left: 50, top: 300, fontFamily: PIXEL, fontSize: 48, color: "#fff", textShadow: "4px 4px 0 #000" }}>2D</div> : null}
    </AbsoluteFill>
  );
};

/** an impact frame: the Blob a flat shape, black on white or white on black, speed lines closing on it */
const Impact: React.FC<{ skin: Skin; c: Ctx; white: boolean; k: number }> = ({ skin, c, white, k }) => {
  const three = k % 2 === 0;
  const v: View = three
    ? { shot: `e-face-${skin}`, i: 50, zoom: 0.9 + 0.05 * k, to: [W / 2, 1050], frame: c.frame, part: "blob", fx: { silhouette: white ? "black" : "white" } }
    : { shot: FIGHT[skin], i: STILL[skin], zoom: 18 + k, to: [W / 2, 1050], frame: c.frame, part: "blob", fx: { silhouette: white ? "black" : "white" } };
  const [bx, by] = blobOnScreen(v);
  return (
    <AbsoluteFill style={{ background: white ? "#f4f0ea" : "#000" }}>
      <SpeedLines x={bx} y={by} t={c.t + k} colour={white ? "0,0,0" : "255,255,255"} hole={300} />
      <Shot {...v} />
    </AbsoluteFill>
  );
};

/** all five on a ring (public/skins/3d/carousel), turning, under their light */
const Carousel: React.FC<{ c: Ctx }> = ({ c }) => {
  const i = clamp(Math.floor(20 + c.lt * FPS * 2.2), 0, 149);
  const st: React.CSSProperties = { position: "absolute", left: W / 2 - 720, top: 1240 - (760 / 1080) * 1440, width: 1440, height: 1440 };
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 60% at 50% 55%, #24365a, #04060c 80%)" }}>
      <Rays x={W / 2} y={900} glow="255,220,150" t={c.t} a={0.6} n={20} reach={1500} />
      <AbsoluteFill style={{ filter: "drop-shadow(0 0 18px rgba(255,220,140,0.55))" }}>
        <Img src={staticFile(`skins/3d/carousel/s${String(i).padStart(3, "0")}.png`)} style={st} />
      </AbsoluteFill>
      <Img src={staticFile(`skins/3d/carousel/g${String(i).padStart(3, "0")}.png`)} style={{ ...st, mixBlendMode: "screen" }} />
      <Sparks x={W / 2} y={1100} glow="255,210,120" t={c.t} spread={1000} rise={1300} n={50} seed={9} />
    </AbsoluteFill>
  );
};

/** the end: the logo, the five as pixels, PLAY FREE, where */
const End: React.FC<{ c: Ctx }> = ({ c }) => {
  const order: Skin[] = ["explorer", "knight", "golden", "wizard", "inferno"];
  const lt = c.lt;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 70% at 50% 45%, #1c1430, #030206 80%)" }}>
      <Sequence from={Math.round(LAST * FPS)} layout="none">
        <OffthreadVideo src={staticFile("skins/aurora.mp4")} muted trimBefore={300} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: 0.55 }} />
      </Sequence>
      <Img src={staticFile("lineup/logo.png")} style={{ position: "absolute", left: W / 2 - 380, top: 250, width: 760, transform: `scale(${(1.25 - 0.25 * backOut(clamp(lt / 0.2))).toFixed(3)})` }} />
      {order.map((s, i) => {
        const a = 0.05 + 0.06 * i;
        const h = clamp((lt - a) / 0.3);
        const x = W / 2 + (i - 2) * 190;
        const f = Math.floor((lt + i * 0.3) * FPS) % 60;
        return (
          <Img
            key={s}
            src={staticFile(`skins/px/${s}/${String(f).padStart(2, "0")}.png`)}
            style={{ position: "absolute", left: x - 32 * 6, top: 1000 - 54 * 6 - Math.sin(h * Math.PI) * 60, width: 64 * 6, height: 64 * 6, imageRendering: "pixelated", opacity: clamp((lt - a) / 0.05), filter: `drop-shadow(0 0 16px rgba(${GLOW[s]},0.9))` }}
          />
        );
      })}
      <Big text="PLAY FREE" y={1150} size={170} colour="#fff3d6" glow="255,210,120" lt={lt - 0.1} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 1270, textAlign: "center", opacity: clamp((lt - 0.25) / 0.15) }}>
        <span style={{ fontFamily: POSTER, fontSize: 84, letterSpacing: "0.06em", padding: "10px 40px", borderRadius: 14, background: "#ffd24a", color: "#120c04", boxShadow: "0 0 40px rgba(255,200,80,0.8)" }}>ON ITCH.IO</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1430, textAlign: "center", opacity: clamp((lt - 0.45) / 0.2), fontFamily: SANS, fontWeight: 800, fontSize: 44, color: "#fff", WebkitTextStroke: "2px #000", paintOrder: "stroke fill" }}>
        link in bio
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the cut */

type Cut = {
  at: number;
  draw: (c: Ctx) => React.ReactNode;
  /** on the cut's first frames: a white flash, an impact (the picture inverted), a punch in, a shake, a glitch */
  flash?: number;
  impact?: boolean;
  punch?: number;
  shake?: number;
  glitch?: boolean;
  /** a tag: the skin and who it is against */
  tag?: [Skin, string?];
};
const CUTS: Cut[] = [];
const add = (c: Cut) => CUTS.push(c);
const EDGE = "e-edge-golden";

// ---- the hook: each skin close, NEW SKINS behind it, on the song's pickup; the hit
add({ at: 0, draw: (c) => <Hero skin="golden" c={c} word="NEW SKINS" wordSize={250} i0={46} /> });
HIT.pickup.forEach((p: number, k: number) => add({ at: p, draw: (c) => <Hero skin={(["knight", "wizard", "inferno"] as Skin[])[k]!} c={c} word="NEW SKINS" wordSize={250} i0={46} />, flash: 0.45, punch: 0.06 }));
// ---- bro is 16 pixels tall: the pulse in slow motion, the camera pulling back to show how small he is
add({ at: HIT.boom, draw: (c) => <Fight shot="e-w-pulse-golden" skin="golden" c={c} a={14} span={100} curve={lin} zoom={20} z1={9} aura={0.25} />, flash: 1, impact: true, shake: 30, punch: 0.12 });
// he fights: the Bone Wyrm's lunge; the Thornback King's slash
add({ at: snap(2.23), draw: (c) => <Fight shot="e-f-bones-wizard" skin="wizard" c={c} a={96} span={44} zoom={7} up={20} />, flash: 0.5, punch: 0.06 });
add({ at: snap(2.93), draw: (c) => <Fight shot="e-f-thicket-inferno" skin="inferno" c={c} a={148} span={36} zoom={7.5} up={14} />, flash: 0.5, punch: 0.06 });
// with final boss aura: Golden, small, under X, the world grey and Golden burning
add({
  at: snap(3.71),
  draw: (c) => {
    const v: View = { shot: "e-hero-golden", i: 10 + c.lt * 40, zoom: 1.05, at: [360, 640], bg: "grayscale(1) brightness(0.66) contrast(1.15)", frame: c.frame, fx: { aura: 1.2, flame: 0.8, glow: GLOW.golden } };
    const [bx, by] = blobOnScreen(v);
    return <Shot {...v} behind={<><Halo x={bx} y={by} glow={GLOW.golden} r={420} /><Sparks x={bx} y={by} glow={GLOW.golden} t={c.t} spread={300} rise={700} /></>} />;
  },
  flash: 0.6,
});
// then X comes into the forest: his eyes in the sky, the camera coming down to the Blob
add({
  at: snap(4.78),
  draw: (c) => {
    const u = easeInOut(clamp((c.lt - 0.5) / (c.d - 0.6)));
    const i = 150 + c.lt * 90;
    const f = followAt(EDGE, i);
    return <Shot shot={EDGE} i={i} zoom={lerp(7, 9, u)} at={[lerp(108, f[0], u), lerp(46, f[1], u)]} bg={BG2} frame={c.frame} fx={{ aura: 0.5 * u, glow: GLOW.golden }} />;
  },
  flash: 0.4,
});
// his foot: the hit
add({ at: 6.62, draw: (c) => <Fight shot={EDGE} skin="golden" c={c} a={760} span={12} curve={ramp} zoom={13} z1={11} aura={0.7} />, flash: 1, impact: true, shake: 40, punch: 0.16, glitch: true });

// ---- the drip check: four beats a skin
const SHOW: [Skin, number, string, number, number][] = [
  // skin, its first beat, its 2D shot, from, span
  ["explorer", 6.99, "e-z-thicket-explorer", 30, 26],
  ["knight", 8.47, "e-f-marsh-knight", 150, 26],
  ["wizard", 9.89, "e-f-bones-wizard", 280, 26],
  ["inferno", 11.38, "e-f-thicket-inferno", 196, 24],
];
SHOW.forEach(([skin, t0, shot, a, span]) => {
  const k = BEATS.findIndex((b) => Math.abs(b - snap(t0)) < 0.01);
  const b = (j: number) => BEATS[k + j]!;
  add({ at: b(0), draw: (c) => <Fight shot={shot} skin={skin} c={c} a={a} span={span} curve={ramp} zoom={8} z1={9} aura={0.5} tag={[skin]} />, flash: 0.5, punch: 0.06 });
  add({ at: b(1), draw: (c) => <Freeze skin={skin} shot={shot} i={a + span} c={c} />, flash: 0.8, impact: true, shake: 18, punch: 0.1 });
  add({ at: b(2), draw: (c) => <PopCard skin={skin} c={c} label={skin.toUpperCase()} />, flash: 0.5, punch: 0.05 });
});
// a roulette, a beat at a time (3D, 2D...), and the fifth only a shadow
const ROUL = snap(12.84);
const STROBE = snap(16.16);
BEATS.filter((x) => x >= ROUL - 0.01 && x < STROBE - 0.05).forEach((x, k, all) => {
  const last = k === all.length - 1;
  add({ at: x, draw: (c) => (last ? <Solo skin="golden" c={c} three dark /> : <Solo skin={SKINS4[Math.floor(k / 2) % 4]!} c={c} three={k % 2 === 0} />), flash: 0.4, punch: 0.06, glitch: k % 3 === 2 });
});
// impact frames on the half beats, faster
for (let k = 0; k < 8; k++) {
  const at = STROBE + (k * (snap(17.6) - STROBE)) / 8;
  add({ at, draw: (c) => <Impact skin={SKINS4[k % 4]!} c={c} white={k % 2 === 0} k={k} /> });
}
// black: NOW / WATCH.
add({ at: snap(17.6), draw: () => <AbsoluteFill style={{ background: "#000" }} /> });

// ---- the first drop: a cut on every kick
type D = [(c: Ctx) => React.ReactNode, Cut["tag"]?, boolean?];
const D1: D[] = [
  [(c) => <Fight shot="e-f-gloom-golden" skin="golden" c={c} a={196} span={34} zoom={6.5} z1={7.5} aura={0.6} up={18} tag={["golden", FOE.golden]} />, undefined, true],
  [(c) => <Fight3 shot="e-chase-knight" skin="knight" c={c} a={30} span={44} zoom={1.0} z1={1.1} tag={["knight", "X"]} />, undefined],
  [(c) => <Fight shot="e-f-bones-wizard" skin="wizard" c={c} a={98} span={44} zoom={6} up={24} trail={3} tag={["wizard", FOE.wizard]} />, undefined],
  [(c) => <Fight3 shot="e-slam-inferno" skin="inferno" c={c} a={12} span={30} curve={ramp} zoom={1.0} z1={1.1} at={[360, 760]} aura={0.6} />, undefined, true],
  [(c) => <Fight shot="e-f-thicket-inferno" skin="inferno" c={c} a={84} span={44} zoom={6.5} up={18} trail={2} tag={["inferno", FOE.inferno]} />, undefined],
  [(c) => <Fight3 shot="e-chase-wizard" skin="wizard" c={c} a={40} span={44} zoom={1.0} z1={1.1} tag={["wizard", "THE COLLECTOR"]} />, undefined],
  [(c) => <Fight shot="e-f-gloom-golden" skin="golden" c={c} a={336} span={42} zoom={7.5} aura={0.8} trail={3} up={10} tag={["golden", FOE.golden]} />, undefined],
  [(c) => <Fight3 shot="e-chase-explorer" skin="explorer" c={c} a={40} span={44} zoom={1.0} z1={1.1} tag={["explorer", "THE MASH"]} />, undefined],
  [(c) => <Fight shot="e-f-thicket-inferno" skin="inferno" c={c} a={336} span={44} zoom={6.5} up={14} aura={0.7} tag={["inferno", FOE.inferno]} />, undefined, true],
  [(c) => <Fight shot="e-f-bones-wizard" skin="wizard" c={c} a={280} span={42} zoom={6.2} up={20} trail={3} tag={["wizard", FOE.wizard]} />, undefined],
  [(c) => <Fight3 shot="e-chase-knight" skin="knight" c={c} a={95} span={44} zoom={1.0} z1={1.12} tag={["knight", "X"]} />, undefined],
  [(c) => <Fight shot="e-f-marsh-knight" skin="knight" c={c} a={110} span={32} zoom={6.5} up={36} aura={0.6} tag={["knight", FOE.knight]} />, undefined],
  [(c) => <Fight shot="e-f-gloom-golden" skin="golden" c={c} a={396} span={22} curve={ramp} zoom={7} z1={9} aura={0.9} />, undefined, true],
];
D1.forEach(([draw, tag, imp], k) => add({ at: snap(DROP1 + k * 2 * B), draw, tag, flash: k === 0 ? 1 : 0.55, impact: !!imp, punch: k === 0 ? 0.16 : 0.09, shake: k === 0 ? 34 : imp ? 22 : 12 }));

// ---- the breakdown: Golden alone, burning, the world grey
add({
  at: GAP,
  draw: (c) => {
    const v: View = { shot: "e-orbit-golden", i: 30 + c.lt * 32, zoom: lerp(1.0, 1.3, easeInOut(c.lt / c.d)), at: followAt("e-orbit-golden", 30 + c.lt * 32), to: [W / 2, 1180], bg: GREY, frame: c.frame, fx: { aura: 1.3, flame: 1, glow: GLOW.golden } };
    const [bx, by] = blobOnScreen(v);
    const bs = blobSize(v);
    return (
      <Shot
        {...v}
        behind={
          <>
            <Halo x={bx} y={by} glow={GLOW.golden} r={800} a={0.9} />
            <Rays x={bx} y={by} glow={GLOW.golden} t={c.t} a={0.8} n={18} />
            <Sparks x={bx} y={by} glow={GLOW.golden} t={c.t} spread={bs * 1.4} rise={1000} n={50} />
          </>
        }
      />
    );
  },
  flash: 0.7,
});

// ---- the second drop
add({ at: DROP2, draw: (c) => <Hero skin="golden" c={c} word="GOLDEN" wordSize={320} i0={30} zoom={1.35} />, flash: 1, impact: true, shake: 36, punch: 0.18 });
const D2: [number, (c: Ctx) => React.ReactNode, Cut["tag"]?, boolean?][] = [
  // pinned under X's foot, burning
  [30.81, (c) => <Fight shot={EDGE} skin="golden" c={c} a={600} span={110} curve={lin} zoom={11} z1={13} aura={1} />],
  // the forest tears open: the 3D world through it
  [31.53, (c) => <Shot shot={EDGE} i={858 + c.lt * 60} zoom={lerp(5.6, 5.2, c.lt / c.d)} at={[108, 180]} bg={BG2} frame={c.frame} fx={{ aura: 0.6, glow: GLOW.golden }} />, undefined, true],
  // and the Blob goes through
  [32.28, (c) => <Shot shot={EDGE} i={1036 + 32 * ramp(c.lt / c.d)} zoom={5} at={[108, 192]} bg={BG3} frame={c.frame} fx={{ aura: 0.6, glow: GLOW.golden }} />],
  [32.65, (c) => <Shot shot={EDGE} i={1150 + 45 * velo(c.lt / c.d)} zoom={lerp(6.2, 7, c.lt / c.d)} at={[100, 236]} bg={BG3} frame={c.frame} />],
  // every skin, in 2D and in 3D
  [33.02, (c) => <Split skin="explorer" c={c} />],
  [33.74, (c) => <Split skin="knight" c={c} />],
  [34.48, (c) => <Split skin="wizard" c={c} />],
  [35.2, (c) => <Split skin="inferno" c={c} />],
  [35.94, (c) => <Split skin="golden" c={c} />],
  // Golden under X, small, burning
  [
    36.69,
    (c) => {
      const v: View = { shot: "e-hero-golden", i: 40 + c.lt * 50, zoom: lerp(1.0, 1.08, c.lt / c.d), at: [360, 640], bg: BG3, frame: c.frame, fx: { aura: 1.1, flame: 0.8, glow: GLOW.golden } };
      return <Shot {...v} />;
    },
    ["golden", "X"],
  ],
  // the 2D Golden pops out of the forest
  [37.41, (c) => <PopCard skin="golden" c={c} shot="e-f-gloom-golden" i0={270} zoom={18} label="GOLDEN" />],
  // the five
  [38.13, (c) => <Carousel c={c} />],
  [38.87, (c) => <Fight3 shot="e-orbit-golden" skin="golden" c={c} a={0} span={150} curve={lin} zoom={1.15} at={followAt("e-orbit-golden", 75)} aura={0.9} />],
  [39.61, (c) => <Solo skin="wizard" c={c} three={false} name={false} />],
  [39.96, (c) => <Solo skin="inferno" c={c} three name={false} />],
  [40.33, (c) => <Fight shot="e-f-thicket-inferno" skin="inferno" c={c} a={380} span={30} zoom={7} z1={8.5} aura={0.9} trail={3} tag={["inferno", FOE.inferno]} />, undefined],
  [40.7, (c) => <Hero skin="knight" c={c} i0={50} zoom={1.3} />],
];
D2.forEach(([at, draw, tag, imp], k) => add({ at: snap(at), draw, tag, flash: 0.6, impact: !!imp || k % 3 === 0, punch: 0.1, shake: 16, glitch: k % 4 === 1 }));
// ---- the end: black, PLAY / FREE; the last hit
add({ at: snap(OUT), draw: () => <AbsoluteFill style={{ background: "#000" }} /> });
add({ at: LAST, draw: (c) => <End c={c} />, flash: 1, shake: 26, punch: 0.12 });
CUTS.sort((a, b) => a.at - b.at);

/* ------------------------------------------------------------------------------------------------ the film */

export const SkinsEdit: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  let ci = 0;
  for (let i = 0; i < CUTS.length; i++) if (CUTS[i]!.at <= t + 1e-6) ci = i;
  const cut = CUTS[ci]!;
  const lt = t - cut.at;
  const d = (CUTS[ci + 1]?.at ?? EDIT_LENGTH) - cut.at;
  const fr = Math.round(lt * FPS);
  // the shake and the punch from the recent hits; in the drops a bounce on every beat
  let shake = 0;
  let punch = 1;
  for (const c of CUTS) {
    const u = t - c.at;
    if (u < 0 || u > 0.6) continue;
    if (c.shake) shake = Math.max(shake, c.shake * Math.exp(-u / 0.09));
    if (c.punch) punch = Math.max(punch, 1 + c.punch * Math.exp(-u / 0.1));
  }
  const inDrop = (t >= DROP1 && t < GAP) || (t >= DROP2 && t < snap(OUT));
  if (inDrop) {
    const b = BEATS.filter((x) => x <= t + 1e-6).pop() ?? 0;
    punch = Math.max(punch, 1 + 0.035 * Math.exp(-(t - b) / 0.07));
  }
  const sx = shake * Math.sin(t * 97 + 1);
  const sy = shake * Math.cos(t * 83);
  const rot = shake * 0.02 * Math.sin(t * 61);
  const neg = cut.impact && fr === 0 ? "invert(1) grayscale(1) contrast(3)" : cut.impact && fr === 1 ? "grayscale(1) contrast(3.5) brightness(1.3)" : undefined;
  const c: Ctx = { lt, d, t, frame };
  const body = cut.draw(c);
  // the colour split on the drops' hits
  const split = inDrop && lt < 0.12 ? 14 * (1 - lt / 0.12) : 0;
  const glitching = cut.glitch && fr < 3;
  const pic = glitching ? <Glitch seed={ci * 7 + fr}>{body}</Glitch> : body;
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <Audio src={staticFile("audio/edit-skins.wav")} />
      {ready ? (
        <>
          <AbsoluteFill style={{ transform: `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${punch.toFixed(4)})`, filter: neg }}>
            {pic}
            {split > 0 ? (
              <>
                <AbsoluteFill style={{ transform: `translateX(${split}px)`, mixBlendMode: "screen", opacity: 0.3, filter: "sepia(1) saturate(8) hue-rotate(-50deg) brightness(0.7)" }}>{body}</AbsoluteFill>
                <AbsoluteFill style={{ transform: `translateX(${-split}px)`, mixBlendMode: "screen", opacity: 0.3, filter: "sepia(1) saturate(8) hue-rotate(150deg) brightness(0.7)" }}>{body}</AbsoluteFill>
              </>
            ) : null}
          </AbsoluteFill>
          {t >= DROP2 - 0.4 && t < DROP2 + 0.5 ? <Leak t={clamp((t - DROP2 + 0.4) / 0.9)} glow="255,200,90" a={0.8} /> : null}
          {t >= DROP1 - 0.2 && t < DROP1 + 0.5 ? <Leak t={clamp((t - DROP1 + 0.2) / 0.7)} glow="160,220,255" a={0.6} side={-1} /> : null}
          <Words t={t} />
          {cut.tag && lt < d ? <Tag skin={cut.tag[0]} vs={cut.tag[1]} lt={lt} /> : null}
          {cut.flash ? <AbsoluteFill style={{ background: "#fff", opacity: cut.flash * Math.max(0, 1 - lt / 0.16) ** 2 }} /> : null}
          {/* the riser before the second drop: white, building */}
          {t >= 29.72 && t < DROP2 ? <AbsoluteFill style={{ background: "#fff8e0", opacity: 0.7 * ((t - 29.72) / (DROP2 - 29.72)) ** 2 }} /> : null}
        </>
      ) : null}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 70% at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.55) 100%)" }} />
      <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: 0.07, mixBlendMode: "overlay" }} />
      <AbsoluteFill style={{ background: "#000", opacity: clamp((t - 42.6) / 0.6) }} />
    </AbsoluteFill>
  );
};

/** the words over the cut (timed on the song, not on the shots) */
const Words: React.FC<{ t: number }> = ({ t }) => {
  const on = (a: number, b: number) => t >= a && t < b;
  return (
    <>
      {/* (whole from the very first frame: it is the frame the feed shows before anything plays) */}
      {on(0, HIT.boom) ? <Big text="THE BLOB GOT" y={330} size={120} lt={t + 1} solid /> : null}
      {on(HIT.boom + 0.05, snap(2.23)) ? <Meme text="bro is 16 pixels tall" y={300} lt={t - HIT.boom - 0.05} size={84} /> : null}
      {on(snap(3.71), snap(4.78)) ? <Meme text="but he has final boss aura" y={300} lt={t - snap(3.71)} size={80} /> : null}
      {on(snap(4.78) + 0.1, 6.62) ? <Meme text="then HE showed up" y={1380} lt={t - snap(4.78) - 0.1} size={84} per={0.12} /> : null}
      {on(snap(17.6), DROP1) ? (
        <>
          <Big text="NOW" y={860} size={280} lt={t - snap(17.6)} />
          {t >= snap(17.97) ? <Big text="WATCH." y={1120} size={280} colour="#ffd24a" glow="255,200,80" lt={t - snap(17.97)} /> : null}
        </>
      ) : null}
      {on(27.89, 28.63) ? <Meme text="the 5th skin…" y={300} lt={t - 27.89} size={86} /> : null}
      {on(28.63, DROP2) ? <Meme text="only if you beat" y={290} lt={t - 28.63} size={76} /> : null}
      {on(29.0, DROP2) ? <Big text="NIGHTMARE" y={480} size={170} colour="#ff4a5a" glow="255,60,80" lt={t - 29.0} /> : null}
      {on(snap(32.65), snap(33.02)) ? <Big text="3D" y={360} size={300} colour="#9ff4ee" glow="127,244,234" lt={t - snap(32.65)} /> : null}
      {on(snap(38.13), snap(38.87)) ? <Big text="5 SKINS" y={330} size={210} lt={t - snap(38.13)} /> : null}
      {on(snap(38.87), snap(39.61)) ? <Big text="2D + 3D" y={330} size={210} colour="#9ff4ee" glow="127,244,234" lt={t - snap(38.87)} /> : null}
      {on(snap(39.61), snap(40.33)) ? <Big text="FREE" y={330} size={260} colour="#ffd24a" glow="255,200,80" lt={t - snap(39.61)} /> : null}
      {on(snap(OUT), LAST) ? (
        <>
          <Big text="PLAY" y={860} size={280} lt={t - snap(OUT)} />
          {t >= snap(OUT + B) ? <Big text="FREE" y={1120} size={280} colour="#ffd24a" glow="255,200,80" lt={t - snap(OUT + B)} /> : null}
        </>
      ) : null}
    </>
  );
};

// (deterministic jitter for anything that wants it later)
export const jitter = (i: number) => rand(i);
