import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { GlitchDefs, useGlitch } from "../components/Effects";
import shorts from "../data/shorts.json";
import { useFonts } from "../lib/fonts";
import { easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip, span, Tesseract } from "./kit";

const S = shorts.shorts.lofi;
const VIOLET = "#b9a2ff";
/** the shot loops: each pass starts a second before the last ends and fades in over it */
const XF = 1.0;
const PASSES = Array.from({ length: Math.ceil(S.end / (S.loop - XF)) }, (_, i) => i * (S.loop - XF));

/**
 * lofi blob - beats to escape a crater to. The Blob asleep by the Moonwell, the moth asleep on its head, rain, a warm worn
 * picture, the lullaby as a lofi beat. For a moment the tape catches, the clock says 4:44, and something is in the sky above
 * the well, its eye open. Then it is just rain again. Did you see it?
 */
export const Lofi: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const eye = t >= S.eye && t < S.eyeEnd;
  const tear = useGlitch([S.eye, S.eye + 0.5, S.eyeEnd - 0.05]);
  // the tape catching: the picture drifts and wobbles
  const wob = eye ? Math.sin(t * 40) * 6 * (0.5 + 0.5 * rand(Math.floor(t * FPS))) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0c10" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill style={{ transform: `translateX(${wob.toFixed(1)}px)`, filter: [tear > 0.02 ? "url(#tear)" : "", eye ? "hue-rotate(-25deg) saturate(1.3)" : ""].join(" ").trim() || undefined }}>
        {PASSES.map((p, i) => (
          <Pass key={i} t={t} at={p} first={i === 0} />
        ))}
        {/* warm, worn: lifted blacks, a little sepia, a soft bloom */}
        <AbsoluteFill style={{ mixBlendMode: "soft-light", background: "linear-gradient(180deg, rgba(255,170,120,0.35), rgba(120,90,200,0.25))" }} />
        <AbsoluteFill style={{ backgroundColor: "rgba(40,30,50,0.18)" }} />
        {/* what is in the sky, for a moment */}
        {eye ? <Tesseract T={t - S.eye + 2} cx={W * 0.62} cy={H * 0.16} size={W * 0.11} colour={VIOLET} grow={easeOut((t - S.eye) / 0.4)} eye={smooth((t - S.eye - 0.3) / 0.4)} opacity={0.75} /> : null}
        <Rain t={t} />
        <Vhs t={t} />
      </AbsoluteFill>
      {ready ? (
        <>
          <Overlay t={t} eye={eye} />
          <Did t={t} />
          <End t={t} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-lofi.wav")} />
    </AbsoluteFill>
  );
};

/** one pass of the loop, fading in over the end of the one before */
const Pass: React.FC<{ t: number; at: number; first: boolean }> = ({ t, at, first }) => {
  const o = first ? 1 : smooth((t - at) / XF);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Clip clip="lofi" at={at} from={0} dur={S.loop} filter="brightness(1.12) contrast(0.92) saturate(0.9) sepia(0.12)" />
    </AbsoluteFill>
  );
};

const Rain: React.FC<{ t: number }> = ({ t }) => (
  <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: 0.5 }}>
    {Array.from({ length: 90 }, (_, i) => {
      const sp = 1500 + 700 * rand(i + 3);
      const x0 = rand(i) * (W + 300) - 150;
      const y = ((rand(i + 7) * H + t * sp) % (H + 200)) - 100;
      const x = x0 - (y + 100) * 0.12;
      const len = 30 + 40 * rand(i + 11);
      return <line key={i} x1={x} y1={y} x2={x - len * 0.12} y2={y + len} stroke={`rgba(200,220,255,${(0.25 + 0.35 * rand(i + 5)).toFixed(2)})`} strokeWidth={1.6} />;
    })}
  </svg>
);

/** a tape's scanlines and the odd tracking line rolling down it */
const Vhs: React.FC<{ t: number }> = ({ t }) => {
  const y = ((t * 0.21) % 1.2) * H - H * 0.1;
  return (
    <>
      <AbsoluteFill style={{ opacity: 0.18, background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)" }} />
      <div style={{ position: "absolute", left: 0, top: y, width: W, height: 26, background: "linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.07), rgba(255,255,255,0))" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 60% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
    </>
  );
};

/** the stream's corner: its name, the clock, and what is playing */
const Overlay: React.FC<{ t: number; eye: boolean }> = ({ t, eye }) => {
  const k = span(t, 0.3, S.end - 0.1, 0.6, 0.4);
  if (k <= 0) return null;
  const f = Math.floor(t * FPS);
  const clock = eye ? "4:44 AM" : t < S.eye ? "3:04 AM" : "3:05 AM";
  const pos = 7 + t;
  const total = 154;
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const title = eye && f % 6 < 3 ? "look up" : "lofi blob";
  return (
    <AbsoluteFill style={{ opacity: k, fontFamily: "Inter" }}>
      <div style={{ position: "absolute", left: 64, top: H * 0.115 }}>
        <div style={{ fontWeight: 800, fontSize: 58, color: eye ? VIOLET : "#fff3e6", textShadow: "0 3px 16px rgba(0,0,0,0.7)" }}>{title} ☾</div>
        <div style={{ marginTop: 6, fontWeight: 600, fontSize: 30, color: "#f1e2d6", opacity: 0.9, textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>beats to escape a crater to</div>
      </div>
      <div style={{ position: "absolute", right: 64, top: H * 0.118, fontWeight: 800, fontSize: 36, color: eye ? VIOLET : "#fff3e6", fontVariantNumeric: "tabular-nums", textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>{clock}</div>
      {/* now playing */}
      <div style={{ position: "absolute", left: 64, right: 64, top: H * 0.66, padding: "22px 28px", borderRadius: 22, backgroundColor: "rgba(20,14,26,0.55)", border: "2px solid rgba(255,240,230,0.18)", backdropFilter: "blur(6px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 74, height: 74, borderRadius: 14, background: "radial-gradient(circle at 40% 35%, #fff3b0, #ffc23a 50%, #c2700a)", position: "relative", flexShrink: 0 }}>
            <div style={{ position: "absolute", left: 21, top: 34, width: 9, height: 4, borderRadius: 2, backgroundColor: "#3a1e08" }} />
            <div style={{ position: "absolute", left: 44, top: 34, width: 9, height: 4, borderRadius: 2, backgroundColor: "#3a1e08" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 32, color: "#fff3e6" }}>her lullaby (rain mix)</div>
            <div style={{ fontWeight: 600, fontSize: 24, color: "#cdbfc0", marginTop: 4 }}>mother · the third direction OST</div>
          </div>
          <div style={{ fontSize: 40, color: "#ff9aac" }}>♥</div>
        </div>
        <div style={{ marginTop: 18, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" }}>
          <div style={{ width: `${((pos / total) * 100).toFixed(2)}%`, height: 6, borderRadius: 3, backgroundColor: eye ? VIOLET : "#fff3e6" }} />
        </div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 22, color: "#cdbfc0", fontVariantNumeric: "tabular-nums" }}>
          <div>{mm(pos)}</div>
          <div>{mm(total)}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** after: a question */
const Did: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.eyeEnd + 0.25, S.end - 0.1, 0.4, 0.3);
  if (k <= 0) return null;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.4, opacity: k }}>
      <div style={{ fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 62, color: "#fff3e6", textShadow: "0 3px 18px rgba(0,0,0,0.9)" }}>…did you see it?</div>
    </AbsoluteFill>
  );
};

const End: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.end, S.fadeOut + 0.6, 0.6, 0.6);
  if (k <= 0) return null;
  const u = t - S.end;
  return (
    <AbsoluteFill style={{ opacity: k, alignItems: "center", backgroundColor: "rgba(12,10,16,0.82)" }}>
      <div style={{ position: "absolute", top: H * 0.36, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "Inter" }}>
        <div style={{ fontWeight: 600, fontSize: 30, color: "#cdbfc0", letterSpacing: "0.1em", opacity: smooth((u - 0.2) / 0.4) }}>sleep tight, little light ☾</div>
        <div style={{ marginTop: 24, fontFamily: "Cinzel", fontWeight: 700, fontSize: 84, color: "#fff3e6", whiteSpace: "nowrap", opacity: smooth((u - 0.5) / 0.5) }}>THE THIRD DIRECTION</div>
        <div style={{ marginTop: 44, fontWeight: 800, fontSize: 36, letterSpacing: "0.16em", color: "#2a1630", backgroundColor: "#ffd9c4", borderRadius: 60, padding: "18px 44px 18px 50px", opacity: smooth((u - 1.0) / 0.4) }}>play free on RUN</div>
        <div style={{ marginTop: 26, fontWeight: 800, fontSize: 30, letterSpacing: "0.1em", color: "#ff9aac", opacity: smooth((u - 1.4) / 0.4) }}>♥ vote daily · RUN October Jam</div>
      </div>
    </AbsoluteFill>
  );
};
