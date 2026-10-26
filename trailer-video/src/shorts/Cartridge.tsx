import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Flash, GlitchDefs, Look, useGlitch, useShake } from "../components/Effects";
import { Say } from "../components/Say";
import { Shot } from "../components/Shot";
import shorts from "../data/shorts.json";
import type { Cut } from "../edit";
import { GOLD, RED } from "../lib/colours";
import { PIXEL, useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip, Fireflies, Typed } from "./kit";

const S = shorts.shorts.cartridge;
const [p1, p2, p3, p4] = S.play as [number, number, number, number];
const [b1, b2, b3, b4, b5, b6, b7, b8] = S.battle as number[] as [number, number, number, number, number, number, number, number];

/**
 * THE CARTRIDGE - a handheld game, on a desk in the dark. The cartridge goes in, the light comes on, it boots, and the little
 * 2D game plays on its little screen: the three of them, the pulse, a guardian, the stars going out. The stars are eyes. The
 * screen's glass cracks, and the game breaks out of it: the console flies apart and the world is suddenly the size of the
 * frame, and deep. At the end it is back in its console, waiting - your turn.
 */

/* the console, and the screen in it (pixels) */
const BODY = { x: 170, y: 360, w: 740, h: 1200 };
const SCREEN = { x: 300, y: 492, w: 480, h: 536 };
const CART = { x: 330, w: 420, h: 280, y: 236 };

/** the box the picture fills: the little screen, the whole frame, or on the way between */
const lerpBox = (k: number): [number, number, number, number] => [SCREEN.x * (1 - k), SCREEN.y * (1 - k), SCREEN.w + (W - SCREEN.w) * k, SCREEN.h + (H - SCREEN.h) * k];

/** the full-screen part: after it breaks out */
export const CUTS: Cut[] = [
  { at: b1, end: b2, clip: "c-x-hero", from: 20, z: [1.0, 1.06], c: [0.5, 0.55], in: "flash" },
  { at: b2, end: b3, clip: "x-foot", from: 79, z: [1.14, 1.04], c: [0.5, 0.55], in: "whip" },
  { at: b3, end: b4, clip: "c-chase", from: 40, in: "glitch" },
  { at: b4, end: b5, clip: "mash-0", from: 80, z: [1.1, 1.0], c: [0.5, 0.45], in: "zoom" },
  { at: b5, end: b6, clip: "collector-0", from: 58, z: [1.12, 1.04], in: "whip" },
  { at: b6, end: b7, clip: "c-mash", from: 20, z: [1.0, 1.06], c: [0.5, 0.45], in: "flash" },
  { at: b7, end: b8, clip: "x-jaws", from: 120, in: "glitch" },
  { at: b8, end: S.fall, clip: "c-x-stomp", from: 172, in: "cut" },
  { at: S.fall, end: S.back, clip: "h-x-death", from: 60, rate: 1.1, z: [1.0, 1.08], c: [0.5, 0.45], in: "flash" },
];

export const Cartridge: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const shake = useShake([[S.insert, 0.25], [S.burst, 1.4], [S.its, 0.6], ...S.cracks.map((c) => [c, 0.5] as [number, number])]);
  const tear = useGlitch([S.eyes, ...S.cracks, S.burst - 0.05, S.back]);
  // out: the picture grows from the little screen to the frame; back: it shrinks into the console again
  const out = t < S.burst ? 0 : t < S.back ? easeInOut((t - S.burst) / 0.35) : 1 - easeInOut((t - S.back) / 0.5);
  const consoleOn = t < S.burst + 0.02 || t >= S.back;
  // the camera creeps in on the little screen while it plays, and lets go as the picture takes the frame
  const push = t < p1 || t >= S.back ? 0 : easeInOut(clamp((t - p1) / (S.burst - p1)));
  const zoom = 1 + 0.08 * push * (1 - out);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill style={{ transform: shake, filter: tear > 0.02 ? "url(#tear)" : undefined }}>
        <Desk t={t} />
        <AbsoluteFill style={{ transform: `scale(${zoom.toFixed(4)})`, transformOrigin: `${SCREEN.x + SCREEN.w / 2}px ${SCREEN.y + SCREEN.h / 2}px` }}>
          {consoleOn ? <Console t={t} /> : null}
          {/* what is on the screen */}
          <Screen t={t} out={out} />
        </AbsoluteFill>
        {/* after it breaks out: the world, full size */}
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
        {t >= S.burst && t < S.burst + 1.2 ? <Shards t={t - S.burst} /> : null}
        <Look />
      </AbsoluteFill>
      <Flash hits={[[S.start, 0.35], [S.burst, 1], [S.its, 0.5], ...CUTS.filter((c) => c.in === "flash").map((c) => [c.at, 0.8] as [number, number]), [S.end, 0.5]]} />
      {ready ? (
        <>
          <Typed at={0.12} end={S.start - 0.05} text={"THIS CARTRIDGE\nSHOULDN'T EXIST."} y={0.045} size={40} colour={GOLD} font={PIXEL} cps={26} />
          <Typed at={p1 + 0.1} end={S.eyes - 0.05} text={"IT'S JUST A\nLITTLE 2D GAME."} y={0.045} size={40} colour="#ffffff" font={PIXEL} cps={26} />
          <Typed at={S.eyes + 0.05} end={S.burst - 0.02} text="...RIGHT?" y={0.065} size={56} colour={RED} font={PIXEL} cps={14} cursor={false} />
          <Say
            words={[
              { at: S.its, end: b1 - 0.05, text: "IT'S NOT.", hot: ["NOT."], hue: RED, y: 0.4, size: 190, style: "slam" },
              { at: b3, end: b5 - 0.05, text: "IT BROKE OUT|OF ITS SCREEN.", y: 0.18 },
            ]}
          />
          <End t={t} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-cartridge.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the desk */

const Desk: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 55% at 50% 48%, #23283a 0%, #11131c 55%, #040507 100%)" }}>
    {t >= S.back ? <AbsoluteFill style={{ opacity: smooth((t - S.back) / 0.8), background: "radial-gradient(ellipse 55% 40% at 50% 46%, rgba(255,200,110,0.4), rgba(0,0,0,0) 70%)" }} /> : null}
    <Fireflies n={22} colour="200,210,255" k={0.35} />
  </AbsoluteFill>
);

/* ------------------------------------------------------------------------------------------------ the console */

const Console: React.FC<{ t: number }> = ({ t }) => {
  // it trembles once the stars are eyes, harder as the glass goes
  const k = t >= S.eyes && t < S.burst ? smooth((t - S.eyes) / (S.burst - S.eyes)) : 0;
  const f = Math.floor(t * FPS);
  const jx = (rand(f) - 0.5) * 2 * (2 + 14 * k) * (k > 0 ? 1 : 0);
  const jy = (rand(f + 31) - 0.5) * 2 * (2 + 10 * k) * (k > 0 ? 1 : 0);
  // it comes back assembled, glowing
  const back = t >= S.back ? easeOut((t - S.back) / 0.6) : 1;
  const sc = t >= S.back ? 1.12 - 0.12 * back : 1;
  const ledOn = t >= S.power;
  const ledRed = t >= S.eyes && t < S.burst && Math.floor(t * 9) % 2 === 0;
  const led = !ledOn ? "#2a1010" : ledRed ? "#ff2a3a" : "#3cff8a";
  // the cartridge going in
  const ci = clamp(t / S.insert);
  const cy = -420 + (CART.y + 420) * (ci < 1 ? ci * ci : 1) + (t > S.insert && t < S.insert + 0.12 ? 6 * Math.sin(((t - S.insert) / 0.12) * Math.PI) : 0);
  const press = (at: number) => (t > at && t < at + 0.15 ? 6 : 0);
  const aPulse = t >= S.end + 1.2 ? 1 + 0.08 * Math.max(0, Math.sin((t - S.end) * Math.PI * 2.5)) : 1;
  return (
    <AbsoluteFill style={{ transform: `translate(${jx}px, ${jy}px) scale(${sc})`, opacity: t >= S.back ? back : 1, transformOrigin: "50% 50%" }}>
      {/* the cartridge */}
      <div style={{ position: "absolute", left: CART.x, top: cy, width: CART.w, height: CART.h, borderRadius: "14px 14px 6px 6px", background: "linear-gradient(180deg, #a9afb6, #7d848c)", boxShadow: "inset 0 3px 0 rgba(255,255,255,0.35), 0 10px 20px rgba(0,0,0,0.5)" }}>
        <div style={{ position: "absolute", left: 40, top: 30, width: CART.w - 80, height: 150, borderRadius: 8, background: "linear-gradient(160deg, #0b1a2a, #241040)", border: "3px solid #2b2f36", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: PIXEL, fontSize: 18, color: GOLD, textAlign: "center", lineHeight: 1.5, textShadow: "2px 2px 0 #000" }}>THE THIRD<br />DIRECTION</div>
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{ position: "absolute", left: 60 + i * 64, top: 200, width: 40, height: 8, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.25)" }} />
        ))}
      </div>
      {/* the body */}
      <div
        style={{
          position: "absolute",
          left: BODY.x,
          top: BODY.y,
          width: BODY.w,
          height: BODY.h,
          borderRadius: "48px 48px 170px 48px",
          background: "linear-gradient(160deg, #35666f 0%, #1d4148 55%, #10262b 100%)",
          boxShadow: `inset 0 5px 0 rgba(255,255,255,0.14), inset 0 -10px 0 rgba(0,0,0,0.35), 0 40px 90px rgba(0,0,0,0.7)${t >= S.back ? `, 0 0 ${(80 * back).toFixed(0)}px rgba(255,200,110,0.45)` : ""}`,
        }}
      >
        <div style={{ position: "absolute", left: 30, right: 30, top: 34, height: 3, backgroundColor: "rgba(0,0,0,0.25)" }} />
        {/* the screen's surround */}
        <div style={{ position: "absolute", left: 70, top: 80, width: 600, height: 650, borderRadius: "22px 22px 70px 22px", background: "#23272f", boxShadow: "inset 0 4px 14px rgba(0,0,0,0.7)" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 18, textAlign: "center", fontFamily: "Inter", fontWeight: 600, fontSize: 15, letterSpacing: "0.3em", color: "#7d8794" }}>
            · PIXEL SCREEN · STEREO SOUND ·
          </div>
          <div style={{ position: "absolute", left: 18, top: 260, width: 16, height: 16, borderRadius: "50%", backgroundColor: led, boxShadow: ledOn ? `0 0 14px ${led}, 0 0 30px ${led}` : "none" }} />
          <div style={{ position: "absolute", left: 6, top: 286, fontFamily: "Inter", fontWeight: 600, fontSize: 11, letterSpacing: "0.1em", color: "#7d8794" }}>POWER</div>
        </div>
        <div style={{ position: "absolute", left: 80, top: 750, fontFamily: "Cinzel", fontWeight: 900, fontStyle: "italic", fontSize: 34, color: GOLD, letterSpacing: "0.04em", textShadow: "0 2px 0 rgba(0,0,0,0.5)" }}>
          THE THIRD DIRECTION
        </div>
        {/* the pad */}
        <div style={{ position: "absolute", left: 125, top: 840, width: 70, height: 210, borderRadius: 10, background: "#0c1416", boxShadow: "inset 0 3px 0 rgba(255,255,255,0.12), 0 4px 0 rgba(0,0,0,0.5)" }} />
        <div style={{ position: "absolute", left: 55, top: 910, width: 210, height: 70, borderRadius: 10, background: "#0c1416", boxShadow: "inset 0 3px 0 rgba(255,255,255,0.12), 0 4px 0 rgba(0,0,0,0.5)" }} />
        {/* A and B */}
        {[
          [620, 830, "A", press(S.start)],
          [480, 900, "B", 0],
        ].map(([x, y, l, p]) => (
          <div key={l as string} style={{ position: "absolute", left: x as number, top: (y as number) + (p as number), width: 112, height: 112 }}>
            <div style={{ width: 112, height: 112, borderRadius: "50%", background: "radial-gradient(circle at 40% 35%, #e0495d, #9a1b2e 70%)", boxShadow: (p as number) ? "0 1px 0 rgba(0,0,0,0.6)" : "0 7px 0 rgba(0,0,0,0.55)", transform: l === "A" ? `scale(${aPulse.toFixed(3)})` : undefined }} />
            <div style={{ marginTop: 10, textAlign: "center", fontFamily: PIXEL, fontSize: 18, color: "#8fa1a6" }}>{t >= S.end && l === "A" ? "VOTE" : t >= S.end ? "PLAY" : (l as string)}</div>
          </div>
        ))}
        {/* select, start */}
        {[
          [240, "SELECT", 0],
          [360, "START", press(S.start)],
        ].map(([x, l, p]) => (
          <div key={l as string} style={{ position: "absolute", left: x as number, top: 1080 + (p as number) }}>
            <div style={{ width: 96, height: 26, borderRadius: 13, backgroundColor: "#4b5258", transform: "rotate(-25deg)", boxShadow: (p as number) ? "none" : "0 4px 0 rgba(0,0,0,0.5)" }} />
            <div style={{ marginTop: 14, fontFamily: "Inter", fontWeight: 800, fontSize: 14, letterSpacing: "0.12em", color: "#7d8794" }}>{l as string}</div>
          </div>
        ))}
        {/* the speaker */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ position: "absolute", left: 560 + i * 26, top: 1030 - i * 4, width: 12, height: 120, borderRadius: 6, backgroundColor: "rgba(0,0,0,0.45)", transform: "rotate(-25deg)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the screen */

const Screen: React.FC<{ t: number; out: number }> = ({ t, out }) => {
  if (t < S.power) return <div style={{ position: "absolute", left: SCREEN.x, top: SCREEN.y, width: SCREEN.w, height: SCREEN.h, backgroundColor: "#0b0e0c" }} />;
  const box = lerpBox(out);
  const [x, y, w, h] = box;
  const radius = 6 * (1 - out);
  const k = t >= S.eyes && t < S.burst ? smooth((t - S.eyes) / (S.burst - S.eyes)) : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, overflow: "hidden", borderRadius: radius, backgroundColor: "#000", boxShadow: out < 1 ? "inset 0 0 30px rgba(0,0,0,0.8)" : undefined }}>
      {/* switched on: static; then it boots */}
      {t < S.boot ? <Static t={t} w={w} h={h} /> : null}
      {t >= S.boot && t < p1 ? <Boot t={t} w={w} h={h} /> : null}
      {/* the little game */}
      <Clip clip="opening" at={p1} from={129} dur={p2 - p1} box={[0, 0, w, h]} z={1.5} c={[0.5, 0.46]} pixel />
      <Clip clip="w-pulse" at={p2} from={18} dur={p3 - p2} box={[0, 0, w, h]} z={1.8} c={[0.5, 0.58]} pixel />
      <Clip clip="g-gloom" at={p3} from={62} dur={p4 - p3} box={[0, 0, w, h]} z={1.7} c={[0.5, 0.22]} pixel />
      <Clip clip="edge-stars" at={p4} from={7} rate={1.2} dur={S.eyes - p4} box={[0, 0, w, h]} z={1.5} c={[0.5, 0.3]} pixel />
      <Clip clip="edge" at={S.eyes} from={182} dur={S.cracks[0]! - S.eyes} box={[0, 0, w, h]} z={1.7} c={[0.5, 0.14]} pixel />
      <Clip clip="edge" at={S.cracks[0]!} from={846} dur={S.burst - S.cracks[0]!} box={[0, 0, w, h]} z={1.2} c={[0.5, 0.4]} pixel />
      {/* out: the light, the Blob landing in a world that is deep */}
      <Clip clip="edge" at={S.burst} from={1092} rate={1.3} dur={b1 - S.burst} box={[0, 0, w, h]} z={1.0} c={[0.5, 0.5]} />
      {/* back: the three of them, on the little screen again */}
      <Clip clip="reunion" at={S.back} from={300} rate={0.6} dur={S.end + 0.4 - S.back} box={[0, 0, w, h]} z={1.0} c={[0.5, 0.55]} />
      {/* an old screen's lines, and its glass cracking */}
      {out < 0.99 ? <AbsoluteFill style={{ opacity: 0.35 * (1 - out), background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 4px)" }} /> : null}
      {out < 0.99 ? <AbsoluteFill style={{ opacity: 1 - out, background: "linear-gradient(125deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 32%, rgba(255,255,255,0) 33%, rgba(255,255,255,0) 100%)" }} /> : null}
      {k > 0 ? <Cracks t={t} w={w} h={h} /> : null}
      {t >= S.end + 0.4 ? <MiniEnd t={t} w={w} h={h} /> : null}
    </div>
  );
};

const Static: React.FC<{ t: number; w: number; h: number }> = ({ t, w, h }) => {
  const f = Math.floor(t * FPS);
  return (
    <svg width={w} height={h} style={{ position: "absolute" }}>
      <rect width={w} height={h} fill="#151a17" />
      {Array.from({ length: 60 }, (_, i) => (
        <rect key={i} x={0} y={rand(i + f * 61) * h} width={w} height={1 + 4 * rand(i + f * 7)} fill={`rgba(220,255,230,${(0.1 + 0.5 * rand(i * 3 + f)).toFixed(2)})`} />
      ))}
    </svg>
  );
};

/** its boot: the RUN logo dropping into place, then the title and PRESS START */
const Boot: React.FC<{ t: number; w: number; h: number }> = ({ t, w, h }) => {
  const drop = easeOut((t - S.boot) / (S.ding - S.boot));
  const title = t >= S.title2;
  const blink = Math.floor((t - S.title2) * 3) % 2 === 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0e1220", alignItems: "center", justifyContent: "center", width: w, height: h }}>
      {!title ? (
        <div style={{ transform: `translateY(${(-h * 0.6 * (1 - drop)).toFixed(1)}px)`, fontFamily: PIXEL, fontSize: 64, color: GOLD, textShadow: "4px 4px 0 #000, 0 0 20px #ff9a3c" }}>RUN</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
          <div style={{ fontFamily: PIXEL, fontSize: 30, color: GOLD, textAlign: "center", lineHeight: 1.5, textShadow: "3px 3px 0 #000" }}>THE THIRD<br />DIRECTION</div>
          <div style={{ fontFamily: PIXEL, fontSize: 18, color: "#fff", opacity: blink ? 1 : 0.15 }}>PRESS START</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/** the glass cracking: three blows, each a star of lines running out from where it struck */
const Cracks: React.FC<{ t: number; w: number; h: number }> = ({ t, w, h }) => (
  <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
    {S.cracks.map((at, ci) => {
      const u = easeOut((t - at) / 0.12);
      if (u <= 0) return null;
      const ox = w * [0.38, 0.66, 0.5][ci]!;
      const oy = h * [0.42, 0.3, 0.62][ci]!;
      return (
        <g key={ci}>
          {Array.from({ length: 9 }, (_, i) => {
            const a = (i / 9) * Math.PI * 2 + rand(ci * 13 + i);
            const len = (0.25 + 0.5 * rand(ci * 7 + i + 3)) * Math.max(w, h) * u;
            const mid = len * 0.5;
            const bend = (rand(ci + i * 5) - 0.5) * 0.6;
            const pts = `${ox},${oy} ${ox + Math.cos(a) * mid},${oy + Math.sin(a) * mid} ${ox + Math.cos(a + bend) * len},${oy + Math.sin(a + bend) * len}`;
            return (
              <g key={i}>
                <polyline points={pts} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={6} />
                <polyline points={pts} fill="none" stroke="rgba(235,250,255,0.9)" strokeWidth={2.5} />
              </g>
            );
          })}
          <circle cx={ox} cy={oy} r={10 + 8 * u} fill="none" stroke="rgba(235,250,255,0.9)" strokeWidth={3} />
        </g>
      );
    })}
  </svg>
);

/** what its little screen says at the end */
const MiniEnd: React.FC<{ t: number; w: number; h: number }> = ({ t, w, h }) => {
  const u = t - (S.end + 0.4);
  const blink = Math.floor(u * 2.5) % 2 === 0;
  return (
    <AbsoluteFill style={{ width: w, height: h, backgroundColor: `rgba(8,10,22,${smooth(u / 0.3).toFixed(2)})`, alignItems: "center", justifyContent: "center", gap: 30, display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: PIXEL, fontSize: 30, color: GOLD, textAlign: "center", lineHeight: 1.5, textShadow: "3px 3px 0 #000", opacity: smooth(u / 0.2) }}>THE THIRD<br />DIRECTION</div>
      <div style={{ fontFamily: PIXEL, fontSize: 20, color: "#fff", border: `4px solid ${GOLD}`, padding: "14px 16px", opacity: smooth((u - 0.4) / 0.15) }}>PLAY FREE ON RUN</div>
      <div style={{ fontFamily: PIXEL, fontSize: 22, color: "#ff6b7d", opacity: u > 0.8 ? (blink ? 1 : 0.35) : 0, textShadow: "3px 3px 0 #000" }}>♥ VOTE FOR US</div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ it flies apart */

const Shards: React.FC<{ t: number }> = ({ t }) => {
  const shards = Array.from({ length: 20 }, (_, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = BODY.x + (col + 0.5 + (rand(i) - 0.5) * 0.4) * (BODY.w / 4);
    const cy = BODY.y + (row + 0.5 + (rand(i + 9) - 0.5) * 0.4) * (BODY.h / 5);
    const r = 120 + 60 * rand(i + 3);
    const pts = Array.from({ length: 5 }, (_, k) => {
      const a = (k / 5) * Math.PI * 2 + rand(i * 5 + k) * 0.9;
      const rr = r * (0.6 + 0.5 * rand(i * 7 + k));
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
    return { cx, cy, pts, i };
  });
  const u = clamp(t / 1.1);
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
      {shards.map(({ cx, cy, pts, i }) => {
        const dx = cx - (SCREEN.x + SCREEN.w / 2);
        const dy = cy - (SCREEN.y + SCREEN.h / 2);
        const d = Math.hypot(dx, dy) || 1;
        const go = 500 * u + 1400 * u * u;
        const x = cx + (dx / d) * go;
        const y = cy + (dy / d) * go + 300 * u * u;
        const rot = (rand(i + 17) - 0.5) * 540 * u;
        const s = 1 + 1.6 * u;
        const o = 1 - smooth((u - 0.45) / 0.55);
        const fill = ["#35666f", "#264f57", "#1d4148", "#2e5a62"][i % 4];
        return (
          <polygon
            key={i}
            points={pts.map(([px, py]) => `${px},${py}`).join(" ")}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${s.toFixed(3)})`}
            fill={fill}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={3}
            opacity={o}
          />
        );
      })}
      {/* the light coming out of where the screen was */}
      <defs>
        <radialGradient id="burst">
          <stop offset="0%" stopColor="rgba(230,255,252,0.95)" />
          <stop offset="45%" stopColor="rgba(127,244,234,0.35)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <circle cx={SCREEN.x + SCREEN.w / 2} cy={SCREEN.y + SCREEN.h / 2} r={300 + 1600 * u} fill="url(#burst)" opacity={1 - u} />
    </svg>
  );
};

/* ------------------------------------------------------------------------------------------------ your turn */

const End: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.end || t > S.fadeOut + 0.6) return null;
  const u = t - S.end;
  const o = 1 - smooth((t - S.fadeOut) / 0.6);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.06 }}>
        <div style={{ fontFamily: PIXEL, fontSize: 58, color: GOLD, transform: `scale(${(0.4 + 0.6 * backOut(u / 0.3)).toFixed(3)})`, textShadow: "5px 5px 0 #000, 0 0 30px #ff9a3c" }}>YOUR TURN.</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: BODY.y + BODY.h + 50 }}>
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 30, letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#9ff4ee", opacity: smooth((u - 1.0) / 0.4) }}>RUN · OCTOBER JAM</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

