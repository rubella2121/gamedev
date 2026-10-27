import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Flash, GlitchDefs, Look, useGlitch, useShake } from "../components/Effects";
import shorts from "../data/shorts.json";
import { GOLD, RED } from "../lib/colours";
import { useFonts } from "../lib/fonts";
import { backOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip, span } from "./kit";

const S = shorts.shorts.oner;
/** the take itself: 21 s, not one cut */
const TAKE = 21;

/**
 * ONE TAKE - the Crater in a single shot, no cuts: a slate, the clap, and the camera goes - out of the ferns, round in front of
 * the Blob and its moth, over the floor between the standing stones, up the ramp to the Moonwell and round it, and up - and he
 * is there, filling the frame - and round to his eyes, closer, until he roars. Black. The camera's own record runs in the corner the whole way, so you can see it never
 * stops.
 */
export const Oner: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const shake = useShake([[S.clap, 0.25], [S.reveal, 0.7], [S.roar, 1.1], [S.black, 0.6]]);
  const tear = useGlitch([S.black - 0.02]);
  const inTake = t >= S.take && t < S.black;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill style={{ transform: shake, filter: tear > 0.02 ? "url(#tear)" : undefined }}>
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        <Clip clip="oner" at={S.take} from={0} dur={TAKE} filter="brightness(1.12) contrast(1.1) saturate(1.14)" />
        {inTake ? <Look /> : null}
        {inTake ? <Lens t={t} /> : null}
      </AbsoluteFill>
      {/* the clap, the eyes, the black */}
      <Flash hits={[[S.clap, 0.6], [S.reveal, 0.4], [S.roar, 0.6], [S.end, 0.35]]} />
      {ready ? (
        <>
          <Slate t={t} />
          {inTake ? <Record t={t} /> : null}
          {(S.areas as [number, string][]).map(([a, name], i) => (
            <Area key={i} t={t} at={S.take + a} name={name} />
          ))}
          <Name t={t} />
          <End t={t} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-oner.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the slate */

const Slate: React.FC<{ t: number }> = ({ t }) => {
  if (t > S.take + 0.05) return null;
  // the sticks open, and clap shut; then the slate is pulled away
  const open = t < S.clap ? 26 * smooth((t - 0.15) / 0.35) * (1 - smooth((t - (S.clap - 0.18)) / 0.18)) : 0;
  const away = smooth((t - (S.clap + 0.12)) / 0.22);
  const BW = 860;
  const x0 = (W - BW) / 2;
  const y0 = H * 0.33;
  const stripes = (n: number) =>
    Array.from({ length: n }, (_, i) => <div key={i} style={{ position: "absolute", left: i * 110 - 30, top: -10, width: 55, height: 120, backgroundColor: "#f4f1ea", transform: "skewX(-35deg)" }} />);
  const row = (k: string, v: string, w = 1) => (
    <div style={{ flex: w, borderRight: "3px solid rgba(244,241,234,0.85)", padding: "12px 18px" }}>
      <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 20, letterSpacing: "0.2em", color: "#9a978f" }}>{k}</div>
      <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 52, color: "#f4f1ea", marginTop: 4 }}>{v}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ transform: `translateY(${(-H * 0.9 * away).toFixed(1)}px) rotate(${(-6 * away).toFixed(2)}deg)` }}>
      <div style={{ position: "absolute", left: x0, top: y0, width: BW }}>
        {/* the sticks */}
        <div style={{ position: "relative", height: 84, transformOrigin: "0% 100%", transform: `rotate(${(-open).toFixed(2)}deg)`, backgroundColor: "#16161a", overflow: "hidden", borderRadius: "8px 8px 0 0", border: "3px solid #f4f1ea" }}>{stripes(9)}</div>
        <div style={{ position: "relative", height: 70, backgroundColor: "#16161a", overflow: "hidden", border: "3px solid #f4f1ea", borderTop: "none" }}>{stripes(9)}</div>
        {/* the board */}
        <div style={{ backgroundColor: "#16161a", border: "3px solid #f4f1ea", borderTop: "none", borderRadius: "0 0 10px 10px" }}>
          <div style={{ padding: "18px 22px", borderBottom: "3px solid rgba(244,241,234,0.85)" }}>
            <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 20, letterSpacing: "0.2em", color: "#9a978f" }}>PRODUCTION</div>
            <div style={{ fontFamily: "Cinzel", fontWeight: 700, fontSize: 60, color: "#f4f1ea", marginTop: 4 }}>THE THIRD DIRECTION</div>
          </div>
          <div style={{ display: "flex", borderBottom: "3px solid rgba(244,241,234,0.85)" }}>
            {row("SCENE", "1")}
            {row("TAKE", "1")}
            {row("ROLL", "A")}
          </div>
          <div style={{ display: "flex" }}>
            {row("CUTS", "0", 1)}
            <div style={{ flex: 2, padding: "12px 18px" }}>
              <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 20, letterSpacing: "0.2em", color: "#9a978f" }}>DIRECTOR</div>
              <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 52, color: GOLD, marginTop: 4 }}>THE BLOB</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 34, textAlign: "center", fontFamily: "Inter", fontWeight: 800, fontSize: 40, letterSpacing: "0.32em", paddingLeft: "0.32em", color: "#f4f1ea", opacity: smooth((t - 0.2) / 0.3) }}>ONE TAKE. NO CUTS.</div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the camera's own record */

/** a camera's frame lines for the first seconds; light catching the lens as it turns past the Moonwell */
const Lens: React.FC<{ t: number }> = ({ t }) => {
  const u = t - S.take;
  const k = 1 - smooth((u - 2.6) / 0.6);
  const flare = span(u, 9.6, 12.8, 1.2, 1.2);
  return (
    <>
      {k > 0.01 ? (
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: k }}>
          {[
            [70, 260, 1, 1],
            [W - 70, 260, -1, 1],
            [70, H - 360, 1, -1],
            [W - 70, H - 360, -1, -1],
          ].map(([x, y, sx, sy], i) => (
            <path key={i} d={`M${x} ${y + sy * 70} V${y} H${x + sx * 70}`} stroke="rgba(255,255,255,0.8)" strokeWidth={4} fill="none" />
          ))}
          <circle cx={W / 2} cy={H / 2} r={10} stroke="rgba(255,255,255,0.6)" strokeWidth={3} fill="none" />
        </svg>
      ) : null}
      {flare > 0.01 ? <AbsoluteFill style={{ mixBlendMode: "screen", opacity: 0.55 * flare, background: "linear-gradient(100deg, rgba(0,0,0,0) 30%, rgba(120,255,240,0.35) 46%, rgba(255,255,255,0.5) 50%, rgba(120,255,240,0.35) 54%, rgba(0,0,0,0) 70%)" }} /> : null}
    </>
  );
};

/** REC, and the timecode: it never jumps, because nothing is cut */
const Record: React.FC<{ t: number }> = ({ t }) => {
  const u = Math.max(0, t - S.take);
  const f = Math.floor(u * FPS);
  const tc = `00:00:${String(Math.floor(f / FPS)).padStart(2, "0")}:${String(f % FPS).padStart(2, "0")}`;
  const blink = Math.floor(t * 2) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: 70, right: 70, top: 196, display: "flex", justifyContent: "space-between", fontFamily: "Inter", fontWeight: 800, fontSize: 30, letterSpacing: "0.12em", color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
      <div>
        <span style={{ color: "#ff3b3b", opacity: blink ? 1 : 0.25 }}>●</span> REC
      </div>
      <div style={{ fontVariantNumeric: "tabular-nums" }}>{tc}</div>
    </div>
  );
};

/** where the camera has got to, as an open world names a place when you reach it */
const Area: React.FC<{ t: number; at: number; name: string }> = ({ t, at, name }) => {
  const k = span(t, at, at + 2.6, 0.35, 0.5);
  if (k <= 0) return null;
  const u = t - at;
  const w = 120 * easeOut(u / 0.6);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.66, opacity: k }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ width: w, height: 2, background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.9))" }} />
        <div style={{ fontFamily: "Cinzel", fontWeight: 400, fontSize: 52, letterSpacing: `${(0.24 + 0.1 * (1 - easeOut(u / 1.4))).toFixed(3)}em`, paddingLeft: "0.24em", color: "#fff", whiteSpace: "nowrap", textShadow: "0 3px 16px rgba(0,0,0,0.9)" }}>{name}</div>
        <div style={{ width: w, height: 2, background: "linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0))" }} />
      </div>
    </AbsoluteFill>
  );
};

/** his name, when he fills the frame */
const Name: React.FC<{ t: number }> = ({ t }) => {
  const at = S.reveal + 0.3;
  const k = span(t, at, at + 3.2, 0.1, 0.4);
  if (k <= 0) return null;
  const u = t - at;
  const split = 12 * Math.exp(-u / 0.15);
  const f = Math.floor(t * FPS);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.64, opacity: k }}>
      <div style={{ fontFamily: "Cinzel", fontWeight: 900, fontSize: 110, letterSpacing: "0.04em", color: "#fff", whiteSpace: "nowrap", transform: `scale(${(1 + 0.25 * Math.exp(-u / 0.08)).toFixed(3)}) translateX(${((rand(f) - 0.5) * 4).toFixed(1)}px)`, textShadow: `${split.toFixed(1)}px 0 0 rgba(255,40,60,0.8), ${(-split).toFixed(1)}px 0 0 rgba(60,200,255,0.7), 0 0 34px ${RED}, 0 6px 0 rgba(0,0,0,0.85)` }}>
        X, THE HOLLOW
      </div>
    </AbsoluteFill>
  );
};

/** cut to black: and that was all one shot */
const End: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.end, S.fadeOut + 0.6, 0.25, 0.6);
  if (k <= 0) return null;
  const u = t - S.end;
  const pulse = 1 + 0.03 * Math.max(0, Math.sin(u * Math.PI * 2.2));
  return (
    <AbsoluteFill style={{ opacity: k, alignItems: "center" }}>
      <div style={{ position: "absolute", top: H * 0.33, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 30, letterSpacing: "0.4em", paddingLeft: "0.4em", color: "#bfb8aa", opacity: smooth(u / 0.3) }}>21 SECONDS. ZERO CUTS.</div>
        <div style={{ marginTop: 26, fontFamily: "Cinzel", fontWeight: 700, fontSize: 70, letterSpacing: "0.05em", color: "#fff1d0", whiteSpace: "nowrap", transform: `scale(${(0.9 + 0.1 * backOut((u - 0.3) / 0.5)).toFixed(3)})`, opacity: smooth((u - 0.3) / 0.3), textShadow: `0 0 26px ${GOLD}66, 0 4px 0 rgba(0,0,0,0.85)` }}>
          THE THIRD DIRECTION
        </div>
        <div style={{ marginTop: 22, fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 46, color: "#e9e3d6", opacity: smooth((u - 0.8) / 0.4) }}>Now go and walk it yourself.</div>
        <div style={{ marginTop: 50, fontFamily: "Inter", fontWeight: 800, fontSize: 38, letterSpacing: "0.18em", color: "#1a0a06", backgroundColor: GOLD, borderRadius: 60, padding: "20px 46px 20px 54px", opacity: smooth((u - 1.3) / 0.3), transform: `scale(${pulse.toFixed(3)})`, boxShadow: "0 0 30px rgba(255,215,122,0.45)" }}>
          PLAY FREE ON RUN
        </div>
        <div style={{ marginTop: 28, fontFamily: "Inter", fontWeight: 800, fontSize: 30, letterSpacing: "0.14em", color: "#ff9aac", opacity: smooth((u - 1.7) / 0.3) }}>♥ VOTE · RUN OCTOBER JAM</div>
      </div>
    </AbsoluteFill>
  );
};
