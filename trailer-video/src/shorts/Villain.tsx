import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { Flash, GlitchDefs, useGlitch, useShake } from "../components/Effects";
import { Shot } from "../components/Shot";
import shorts from "../data/shorts.json";
import type { Cut } from "../edit";
import { GOLD } from "../lib/colours";
import { useFonts } from "../lib/fonts";
import { backOut, easeInOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Tesseract, usePunch, useImpact } from "./kit";
import { ramp } from "./Phonk";

const S = shorts.shorts.villain;
const B = S.beat;
const D = S.drop;
const [w1, w2, w3] = S.words as [number, number, number];
const BLOOD = "#ff1f3d";
const VIOLET = "#a77bff";

/**
 * VILLAIN EDIT - X, the Hollow, in red and black, to a Brazilian phonk: he took them; he is the final boss; nothing is above
 * him. His bar along the foot of the frame, full, with FINAL BOSS beside his name. A record scratch: the picture stops and the
 * colour drains out of it. Above him, something unfolds - violet - and a second bar slides in above his, four bars deep, and
 * the FINAL BOSS tag leaves his name for its. Even villains have villains.
 */
export const CUTS: Cut[] = [
  // HE TOOK THEM.
  { at: 0, end: D, clip: "h-x-gaze", from: 0, rate: 0.3, z: [1.35, 1.65], c: [0.5, 0.5] },
  // the drop
  ...ramp("x-foot", 73, D, [[0.12, 1.6], [0.76, 0.35]], { z: [1.2, 1.1], c: [0.5, 0.55], in: "flash" }),
  ...ramp("h-x-slam", 13, D + 2 * B, [[0.1, 1.6], [0.34, 0.4]], { z: [1.1, 1.18], c: [0.5, 0.55] }),
  { at: D + 3 * B, end: w2, clip: "x-rake", from: 82, rate: 1.5, in: "glitch" },
  // HE'S THE FINAL BOSS.
  { at: w2, end: w2 + 2 * B, clip: "c-x-hero", from: 20, rate: 0.5, z: [1.25, 1.4], c: [0.5, 0.38], in: "flash" },
  ...ramp("c-x-stomp", 172, w2 + 2 * B, [[0.1, 1.5], [0.34, 0.4]], {}),
  { at: w2 + 3 * B, end: w3, clip: "x-jaws", from: 120, rate: 1.2, in: "glitch" },
  // NOTHING IS ABOVE HIM.
  { at: w3, end: w3 + 2 * B, clip: "h-x-gaze", from: 30, rate: 0.4, z: [1.55, 1.3], c: [0.5, 0.5], in: "zoom" },
  { at: w3 + 2 * B, end: w3 + 3 * B, clip: "x-gaze", from: 40, in: "cut" },
  { at: w3 + 3 * B, end: S.scratch, clip: "c-x-hero", from: 60, rate: 0.6, z: [1.0, 1.15], c: [0.5, 0.3], in: "cut" },
  // the scratch: it stops
  { at: S.scratch, end: S.twist, clip: "c-x-hero", from: 60 + 3 * B * 30 * 0.6, rate: 0.01, z: [1.15, 1.32], c: [0.5, 0.3], in: "cut" },
  // above him
  { at: S.twist, end: S.drop2, clip: "t-unfold", from: 35, rate: 1.0, z: [1.0, 1.12], c: [0.5, 0.4], in: "glitch" },
  // HAVE VILLAINS.
  { at: S.drop2, end: S.drop2 + B, clip: "t-eye", from: 60, in: "flash" },
  { at: S.drop2 + B, end: S.drop2 + 2 * B, clip: "fourth-fight", from: 60, z: [1.15, 1.15], in: "glitch" },
  { at: S.drop2 + 2 * B, end: S.drop2 + 3 * B, clip: "t-lift", from: 95, in: "cut" },
  { at: S.drop2 + 3 * B, end: S.drop2 + 4 * B, clip: "flee", from: 250, in: "glitch" },
  { at: S.drop2 + 4 * B, end: S.drop2 + 5 * B, clip: "t-descend", from: 120, in: "cut" },
  { at: S.drop2 + 5 * B, end: S.end, clip: "fourth-fight", from: 150, z: [1.1, 1.2], in: "glitch" },
];

/** the blows, where the picture inverts for a frame */
const HITS = [D + 0.12, D + 2 * B + 0.1, w2, w2 + 2 * B + 0.1, S.drop2, S.drop2 + 2 * B, S.drop2 + 4 * B];
const BEATS = [...Array.from({ length: Math.round((S.scratch - D) / B) }, (_, i) => D + i * B), ...Array.from({ length: Math.round((S.end - S.drop2) / B) }, (_, i) => S.drop2 + i * B)];

/** the words: (from, to, lines, colour, style) */
const WORDS: [number, number, string[], string, "slow" | "slam" | "small"][] = [
  [w1, D - 0.06, ["HE TOOK", "THEM."], "#fff", "slow"],
  [w2, w3 - 0.06, ["HE'S THE", "FINAL BOSS."], "#fff", "slam"],
  [w3, S.scratch - 0.02, ["NOTHING IS", "ABOVE HIM."], "#fff", "slam"],
  [S.scratch + 0.08, S.twist - 0.02, ["…right?"], "#fff", "small"],
  [S.twist + 0.12, S.drop2 - 0.04, ["EVEN", "VILLAINS"], "#e6dcff", "slow"],
  [S.drop2, S.end - 0.06, ["HAVE", "VILLAINS."], "#fff", "slam"],
];

export const Villain: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const stopped = t >= S.scratch && t < S.twist;
  const shake = useShake([...BEATS.map((b) => [b, 0.3] as [number, number]), ...HITS.map((h) => [h, 1.0] as [number, number]), [S.scratch, 0.6], [S.twist, 0.8], [S.end, 0.7]]);
  const tear = useGlitch([D + 3 * B, w2 + 3 * B, S.twist, S.twist + 0.6, S.drop2 + B, S.drop2 + 3 * B, S.drop2 + 5 * B, S.end - 0.03]);
  const impact = useImpact(HITS);
  const punch = usePunch(stopped ? [] : BEATS, 0.06);
  // the record stopping: the picture sags and slows, the colour goes
  const sag = stopped ? easeOut((t - S.scratch) / 0.35) : 0;
  // the duotone: red, until something above him is violet
  const hue = t >= S.twist ? VIOLET : BLOOD;
  const tint = stopped ? 0 : t < S.end ? 0.9 : 0;
  const kick = !stopped && t >= D && t < S.end ? Math.exp(-((t - (t < S.scratch ? D : S.drop2)) % B) / 0.12) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill
        style={{
          transform: `${shake === "none" ? "" : shake} scale(${(punch * (1 + 0.05 * sag)).toFixed(3)}) translateY(${(18 * sag).toFixed(1)}px)`,
          filter: [t < S.end ? `grayscale(1) contrast(${(1.5 - 0.3 * sag).toFixed(2)}) brightness(${(0.95 - 0.25 * sag).toFixed(2)})` : "", tear > 0.02 ? "url(#tear)" : "", impact ?? ""].join(" ").trim() || undefined,
        }}
      >
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
      </AbsoluteFill>
      {/* red and black (and then violet and black) */}
      {tint > 0 ? <AbsoluteFill style={{ backgroundColor: hue, mixBlendMode: "color", opacity: tint }} /> : null}
      {tint > 0 ? <AbsoluteFill style={{ backgroundColor: hue, mixBlendMode: "multiply", opacity: 0.25 }} /> : null}
      <AbsoluteFill style={{ opacity: 0.6 * kick, background: `radial-gradient(ellipse 75% 60% at 50% 50%, rgba(0,0,0,0) 45%, ${hue} 100%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.75) 100%)" }} />
      <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, mixBlendMode: "overlay", opacity: 0.32 }} />
      {/* an old film's scratches while the record is stopped */}
      {stopped ? <Scratches f={frame} /> : null}
      <Flash hits={[...HITS.map((h) => [h, 0.6] as [number, number]), [S.twist, 0.9], [S.end, 0.6]]} />
      {ready ? (
        <>
          <Bars t={t} />
          {WORDS.map(([a, e, lines, c, style], i) => (
            <Words key={i} at={a} end={e} lines={lines} colour={c} style={style} hue={a >= S.twist ? VIOLET : BLOOD} />
          ))}
          <End t={t} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-villain.wav")} />
    </AbsoluteFill>
  );
};

const Scratches: React.FC<{ f: number }> = ({ f }) => (
  <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
    {Array.from({ length: 5 }, (_, i) => (
      <rect key={i} x={rand(f * 3 + i) * W} y={0} width={1 + 2 * rand(f + i * 9)} height={H} fill={`rgba(255,255,255,${(0.08 + 0.2 * rand(f * 5 + i)).toFixed(2)})`} />
    ))}
  </svg>
);

/* ------------------------------------------------------------------------------------------------ the words */

const Words: React.FC<{ at: number; end: number; lines: string[]; colour: string; style: "slow" | "slam" | "small"; hue: string }> = ({ at, end, lines, colour, style, hue }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > end) return null;
  const u = t - at;
  const o = 1 - smooth((t - (end - 0.06)) / 0.06);
  if (style === "small") {
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: o * smooth(u / 0.1) }}>
        <div style={{ fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 96, color: "#fff", transform: `translateY(${-H * 0.05}px)`, textShadow: "0 4px 18px rgba(0,0,0,0.9)" }}>{lines[0]}</div>
      </AbsoluteFill>
    );
  }
  const slow = style === "slow";
  // slow: the letters close in from wide apart; slam: in big and hard, its colours split
  const spread = slow ? 0.5 * (1 - easeOut(u / 1.2)) : 0;
  const s = slow ? 1 : 1 + 0.6 * Math.exp(-u / 0.06);
  const split = slow ? 0 : 12 * Math.exp(-u / 0.12);
  const f = Math.floor(t * 30);
  const j = slow ? 0 : (rand(f) - 0.5) * 6;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: o * (slow ? smooth(u / 0.4) : 1) }}>
      <div style={{ transform: `translate(${j.toFixed(1)}px, ${-H * 0.06}px) scale(${s.toFixed(3)})`, textAlign: "center" }}>
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: "Cinzel",
              fontWeight: 900,
              fontSize: i === lines.length - 1 && l.length > 8 ? 128 : 112,
              lineHeight: 1.08,
              letterSpacing: `${(0.04 + spread).toFixed(3)}em`,
              color: colour,
              whiteSpace: "nowrap",
              WebkitTextStroke: slow ? undefined : `3px ${hue}`,
              textShadow: `${split.toFixed(1)}px 0 0 rgba(255,30,60,0.85), ${(-split).toFixed(1)}px 0 0 rgba(60,190,255,0.8), 0 0 40px ${hue}, 0 8px 0 rgba(0,0,0,0.85)`,
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the bars */

const BAR = { x: 90, w: W - 180, h: 22 };
const XROW = 1330;
const THEMROW = 1150;

/** a boss's bar: its name over it, the bar, and how full */
const Bar: React.FC<{ y: number; name: string; colour: string; fill: number; trail: number; o: number; dx?: number; stack?: number; dim?: number }> = ({ y, name, colour, fill, trail, o, dx = 0, stack = 0, dim = 0 }) => (
  <div style={{ position: "absolute", left: BAR.x + dx, top: y, width: BAR.w, opacity: o, filter: dim ? `grayscale(${dim}) brightness(${(1 - 0.45 * dim).toFixed(2)})` : undefined }}>
    <div style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 46, color: "#f2ece0", letterSpacing: "0.06em", textShadow: "0 3px 8px rgba(0,0,0,0.95)", marginBottom: 10 }}>{name}</div>
    <div style={{ position: "relative", height: BAR.h }}>
      {/* the bars stacked under it */}
      {Array.from({ length: stack }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: 0, right: 0, top: -(i + 1) * 7, height: BAR.h, border: "2px solid rgba(200,180,255,0.35)", backgroundColor: `rgba(120,70,255,${(0.35 - i * 0.07).toFixed(2)})` }} />
      ))}
      <div style={{ position: "absolute", inset: 0, border: "2px solid rgba(230,210,170,0.6)", backgroundColor: "rgba(10,6,8,0.85)", boxShadow: "0 4px 14px rgba(0,0,0,0.8)" }}>
        <div style={{ position: "absolute", left: 2, top: 2, bottom: 2, width: `calc(${(trail * 100).toFixed(2)}% - 4px)`, backgroundColor: "#f4e6b8" }} />
        <div style={{ position: "absolute", left: 2, top: 2, bottom: 2, width: `calc(${(fill * 100).toFixed(2)}% - 4px)`, background: `linear-gradient(180deg, ${colour}, ${colour}99)`, boxShadow: `0 0 16px ${colour}` }} />
      </div>
      {stack > 0 ? <div style={{ position: "absolute", right: -4, top: -92, fontFamily: "Cinzel", fontWeight: 900, fontSize: 64, color: "#e6dcff", textShadow: `0 0 18px ${VIOLET}, 0 3px 6px #000` }}>×{stack + 1}</div> : null}
    </div>
  </div>
);

const Bars: React.FC<{ t: number }> = ({ t }) => {
  if (t < D || t > S.end + 0.3) return null;
  const xin = easeOut((t - D) / 0.25);
  const out = 1 - smooth((t - S.end) / 0.3);
  // the scratch: his bar flickers
  const flick = t >= S.scratch && t < S.twist && Math.floor(t * 14) % 3 === 0 ? 0.35 : 1;
  // its bar: in above his on the twist; a bar deeper on each beat of the second drop
  const them = easeOut((t - S.twist - 0.3) / 0.4);
  const stack = t < S.drop2 ? 0 : Math.min(3, 1 + Math.floor((t - S.drop2) / (2 * B)));
  // the tag: FINAL BOSS beside his name; then it leaves it for its
  const move = easeInOut((t - (S.drop2 + 0.5)) / 0.5);
  const tx = BAR.x + 420 + 20 * move;
  const ty = XROW + 4 + (THEMROW - XROW) * move - 60 * Math.sin(Math.PI * move);
  const tagColour = move > 0.5 ? VIOLET : "#d81e32";
  const struck = t >= S.twist ? easeOut((t - S.twist - 0.1) / 0.25) : 0;
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 80%, rgba(0,0,0,0.2) 100%)", opacity: xin }} />
      {t >= S.twist ? <Bar y={THEMROW} name="???" colour={VIOLET} fill={them} trail={them} o={them} stack={stack} /> : null}
      <Bar y={XROW} name="X, THE HOLLOW" colour="#c8102a" fill={1} trail={1} o={xin * flick} dx={-60 * (1 - xin)} dim={struck} />
      {/* the tag */}
      <div style={{ position: "absolute", left: tx, top: ty, opacity: xin * (t >= S.scratch && t < S.twist ? flick : 1), transform: `rotate(${(-4 * Math.sin(Math.PI * move)).toFixed(2)}deg)` }}>
        <div style={{ position: "relative", fontFamily: "Inter", fontWeight: 800, fontSize: 24, letterSpacing: "0.18em", color: "#fff", backgroundColor: tagColour, padding: "6px 14px 6px 18px", borderRadius: 4, boxShadow: `0 0 18px ${tagColour}` }}>
          FINAL BOSS
          {struck > 0 && move < 0.05 ? <div style={{ position: "absolute", left: 6, top: "50%", height: 4, width: `${(struck * 92).toFixed(0)}%`, backgroundColor: "#fff", transform: "rotate(-6deg)" }} /> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the end */

const End: React.FC<{ t: number }> = ({ t }) => {
  const T = t - S.end;
  if (T < 0 || t > S.fadeOut + 0.6) return null;
  const o = 1 - smooth((t - S.fadeOut) / 0.6);
  const f = Math.floor(t * FPS);
  const pulse = 1 + 0.03 * Math.max(0, Math.sin(T * Math.PI * 2.2));
  return (
    <AbsoluteFill style={{ opacity: o, alignItems: "center" }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 38% at 50% 34%, rgba(110,50,200,${(0.45 * smooth(T / 0.8)).toFixed(3)}), rgba(0,0,0,0) 70%), radial-gradient(ellipse 70% 30% at 50% 70%, rgba(200,16,42,${(0.3 * smooth(T / 0.8)).toFixed(3)}), rgba(0,0,0,0) 70%)` }} />
      <Tesseract T={T + 2} cx={W / 2} cy={H * 0.375} size={W * 0.1} colour={VIOLET} grow={easeOut((T - 0.3) / 0.6)} eye={smooth((T - 0.8) / 0.4)} opacity={0.9} />
      <div style={{ position: "absolute", top: H * 0.2, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 30, letterSpacing: "0.32em", paddingLeft: "0.32em", color: "#cdbfff", opacity: smooth(T / 0.3) }}>WHO IS THE REAL</div>
        <div style={{ fontFamily: "Cinzel", fontWeight: 900, fontSize: 130, lineHeight: 1, color: "#fff", transform: `scale(${(0.6 + 0.4 * backOut((T - 0.1) / 0.3)).toFixed(3)}) translateX(${(T > 0.9 && T < 0.98 ? (rand(f) - 0.5) * 20 : 0).toFixed(1)}px)`, opacity: smooth((T - 0.1) / 0.1), textShadow: `-5px 0 0 rgba(255,31,61,0.8), 5px 0 0 rgba(167,123,255,0.8), 0 0 40px ${VIOLET}` }}>
          FINAL BOSS?
        </div>
      </div>
      <div style={{ position: "absolute", top: H * 0.47, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 }}>
        <div style={{ fontFamily: "Cinzel", fontWeight: 900, fontSize: 64, letterSpacing: "0.05em", color: "#fff1d0", opacity: smooth((T - 0.7) / 0.4), textShadow: `0 0 22px ${GOLD}, 0 4px 0 rgba(0,0,0,0.85)`, whiteSpace: "nowrap" }}>THE THIRD DIRECTION</div>
        <div style={{ height: 2, width: (W * 0.6 * easeOut((T - 0.9) / 0.5)) | 0, background: `linear-gradient(90deg, ${BLOOD}, ${VIOLET})` }} />
        <div style={{ marginTop: 18, fontFamily: "Inter", fontWeight: 800, fontSize: 40, letterSpacing: "0.2em", color: "#fff", padding: "22px 46px 22px 54px", border: `3px solid ${VIOLET}`, borderRadius: 60, backgroundColor: "rgba(20,8,40,0.6)", boxShadow: `0 0 26px ${VIOLET}`, opacity: smooth((T - 1.2) / 0.2), transform: `scale(${pulse.toFixed(3)})`, whiteSpace: "nowrap" }}>
          PLAY FREE ON RUN
        </div>
        <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 34, letterSpacing: "0.14em", color: "#ff8aa0", opacity: smooth((T - 1.6) / 0.3) }}>♥ VOTE · RUN OCTOBER JAM</div>
      </div>
    </AbsoluteFill>
  );
};

