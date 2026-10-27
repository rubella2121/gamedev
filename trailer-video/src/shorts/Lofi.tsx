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
 * lofi blob - beats to escape a crater to. A room at night, a candle on the sill, and through the rainy window the Crater: the
 * Blob by the Moonwell, the moth asleep on its head. The lullaby as a lofi beat. For a moment the tape catches, the candle goes
 * out, the clock says 4:44, and something is in the sky above the well, its eye open. Then it is just rain again. Did you see it?
 */

/** the window, in the room */
const WIN = { x: 90, y: 270, w: 900, h: 960 };

export const Lofi: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const eye = t >= S.eye && t < S.eyeEnd;
  const tear = useGlitch([S.eye, S.eye + 0.5, S.eyeEnd - 0.05]);
  // the tape catching: the picture drifts and wobbles
  const wob = eye ? Math.sin(t * 40) * 6 * (0.5 + 0.5 * rand(Math.floor(t * FPS))) : 0;
  // the candle: it flickers; it goes out while something looks in; it catches again
  const lit = t < S.eye || t > S.eyeEnd + 0.15;
  const flick = lit ? 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3 + 1) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#140d19" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill style={{ transform: `translateX(${wob.toFixed(1)}px)`, filter: tear > 0.02 ? "url(#tear)" : undefined }}>
        {/* the room: dark, the candle's warmth on the wall */}
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 45% at 78% 78%, rgba(255,160,90,${(0.32 * flick).toFixed(3)}), rgba(0,0,0,0) 70%), radial-gradient(ellipse 90% 60% at 50% 40%, #241826 0%, #140d19 75%)` }} />
        <Window t={t} eye={eye} />
        <Sill t={t} flick={flick} lit={lit} />
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

/** the window: the Crater outside in the rain, drops on the glass, a wooden frame and its cross */
const Window: React.FC<{ t: number; eye: boolean }> = ({ t, eye }) => (
  <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h }}>
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 8, filter: eye ? "hue-rotate(-25deg) saturate(1.3)" : undefined }}>
      {PASSES.map((p, i) => (
        <Pass key={i} t={t} at={p} first={i === 0} />
      ))}
      {/* night, rain, a little worn */}
      <AbsoluteFill style={{ mixBlendMode: "soft-light", background: "linear-gradient(180deg, rgba(120,140,255,0.35), rgba(255,150,110,0.25))" }} />
      <AbsoluteFill style={{ backgroundColor: "rgba(20,14,30,0.22)" }} />
      {/* what is in the sky, for a moment */}
      {eye ? <Tesseract T={t - S.eye + 2} cx={WIN.w * 0.66} cy={WIN.h * 0.15} size={WIN.w * 0.12} colour={VIOLET} grow={easeOut((t - S.eye) / 0.4)} eye={smooth((t - S.eye - 0.3) / 0.4)} opacity={0.8} /> : null}
      <Rain t={t} />
      <Drops t={t} />
      {/* the glass catching the room */}
      <AbsoluteFill style={{ background: "linear-gradient(125deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0) 31%)" }} />
    </div>
    {/* the frame */}
    <div style={{ position: "absolute", inset: -26, border: "26px solid #3d2b23", borderRadius: 14, boxShadow: "inset 0 0 0 3px rgba(255,200,150,0.12), 0 20px 50px rgba(0,0,0,0.6), inset 0 8px 18px rgba(0,0,0,0.6)" }} />
    <div style={{ position: "absolute", left: WIN.w / 2 - 8, top: 0, width: 16, height: WIN.h, backgroundColor: "#3d2b23", boxShadow: "0 0 10px rgba(0,0,0,0.5)" }} />
    <div style={{ position: "absolute", left: 0, top: WIN.h * 0.42 - 8, width: WIN.w, height: 16, backgroundColor: "#3d2b23", boxShadow: "0 0 10px rgba(0,0,0,0.5)" }} />
  </div>
);

/** drops on the glass: most of them still, some running down */
const Drops: React.FC<{ t: number }> = ({ t }) => (
  <svg width={WIN.w} height={WIN.h} style={{ position: "absolute", left: 0, top: 0 }}>
    {Array.from({ length: 70 }, (_, i) => {
      const run = i % 7 === 0;
      const x = rand(i * 3 + 1) * WIN.w;
      const y0 = rand(i * 5 + 2) * WIN.h;
      const y = run ? (y0 + t * (40 + 60 * rand(i))) % WIN.h : y0;
      const r = 3 + 6 * rand(i * 7 + 3);
      return (
        <g key={i} opacity={0.8}>
          {run ? <line x1={x} y1={y - 40} x2={x} y2={y} stroke="rgba(220,235,255,0.25)" strokeWidth={r * 0.6} strokeLinecap="round" /> : null}
          <ellipse cx={x} cy={y} rx={r} ry={r * 1.15} fill="rgba(200,220,255,0.18)" stroke="rgba(230,240,255,0.35)" strokeWidth={1.2} />
          <circle cx={x - r * 0.35} cy={y - r * 0.4} r={r * 0.25} fill="rgba(255,255,255,0.7)" />
        </g>
      );
    })}
  </svg>
);

/** the sill: a mug, steaming, and the candle */
const Sill: React.FC<{ t: number; flick: number; lit: boolean }> = ({ t, flick, lit }) => {
  const y = WIN.y + WIN.h + 26;
  const relit = t - (S.eyeEnd + 0.15);
  const flare = lit && relit > 0 && relit < 0.4 ? 1 + 0.8 * (1 - relit / 0.4) : 1;
  return (
    <>
      <div style={{ position: "absolute", left: 50, top: y, width: W - 100, height: 40, borderRadius: 6, background: "linear-gradient(180deg, #5a4032, #3d2b23)", boxShadow: "0 12px 30px rgba(0,0,0,0.6)" }} />
      {/* the mug */}
      <div style={{ position: "absolute", left: 170, top: y - 78, width: 76, height: 78, borderRadius: "6px 6px 14px 14px", background: "linear-gradient(90deg, #c96f5a, #e89a7e 50%, #b85e4c)" }} />
      <div style={{ position: "absolute", left: 238, top: y - 64, width: 30, height: 40, borderRadius: "0 20px 20px 0", border: "8px solid #c96f5a", borderLeft: "none" }} />
      <svg width={200} height={160} style={{ position: "absolute", left: 108, top: y - 240 }}>
        {[0, 1, 2].map((k) => {
          const ph = t * 0.8 + k * 0.33;
          const u = ph % 1;
          const x = 100 + (k - 1) * 18 + Math.sin(ph * 6) * 8;
          return <path key={k} d={`M${x} ${150 - 120 * u} q 12 -15 0 -30 q -12 -15 0 -30`} stroke={`rgba(255,240,230,${(0.25 * Math.sin(Math.PI * u)).toFixed(2)})`} strokeWidth={5} fill="none" strokeLinecap="round" />;
        })}
      </svg>
      {/* the candle */}
      <div style={{ position: "absolute", left: 800, top: y - 110, width: 46, height: 110, borderRadius: "6px 6px 2px 2px", background: "linear-gradient(90deg, #e9dcc6, #fff6e6 50%, #d8c8ae)" }} />
      <div style={{ position: "absolute", left: 821, top: y - 124, width: 4, height: 16, backgroundColor: "#2a2020" }} />
      {lit ? (
        <>
          <div style={{ position: "absolute", left: 823 - 60, top: y - 200, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle, rgba(255,190,110,${(0.45 * flick * flare).toFixed(3)}), rgba(255,190,110,0) 70%)` }} />
          <div style={{ position: "absolute", left: 823 - 11, top: y - 162 + 2 * Math.sin(t * 17), width: 22, height: 40 * flick * flare, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%", background: "radial-gradient(ellipse at 50% 70%, #fff8d8, #ffb648 60%, rgba(255,120,40,0.6))", transform: `rotate(${(4 * Math.sin(t * 5)).toFixed(1)}deg)`, transformOrigin: "50% 100%" }} />
        </>
      ) : (
        // just blown out: a thread of smoke
        <svg width={80} height={200} style={{ position: "absolute", left: 783, top: y - 330 }}>
          <path d={`M40 200 q -14 -30 0 -60 q 14 -30 0 -60 q -10 -25 4 -50`} stroke="rgba(220,220,230,0.35)" strokeWidth={4} fill="none" strokeLinecap="round" />
        </svg>
      )}
    </>
  );
};

/** one pass of the loop, fading in over the end of the one before */
const Pass: React.FC<{ t: number; at: number; first: boolean }> = ({ t, at, first }) => {
  const o = first ? 1 : smooth((t - at) / XF);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Clip clip="lofi" at={at} from={0} dur={S.loop} box={[0, 0, WIN.w, WIN.h]} z={1.0} c={[0.5, 0.55]} filter="brightness(1.02) contrast(1.02) saturate(0.95)" />
    </AbsoluteFill>
  );
};

const Rain: React.FC<{ t: number }> = ({ t }) => (
  <svg width={WIN.w} height={WIN.h} style={{ position: "absolute", left: 0, top: 0, opacity: 0.45 }}>
    {Array.from({ length: 70 }, (_, i) => {
      const sp = 1300 + 700 * rand(i + 3);
      const x0 = rand(i) * (WIN.w + 200) - 50;
      const y = ((rand(i + 7) * WIN.h + t * sp) % (WIN.h + 200)) - 100;
      const x = x0 - (y + 100) * 0.12;
      const len = 26 + 34 * rand(i + 11);
      return <line key={i} x1={x} y1={y} x2={x - len * 0.12} y2={y + len} stroke={`rgba(200,220,255,${(0.25 + 0.35 * rand(i + 5)).toFixed(2)})`} strokeWidth={1.5} />;
    })}
  </svg>
);

/** a tape's scanlines and the odd tracking line rolling down it */
const Vhs: React.FC<{ t: number }> = ({ t }) => {
  const y = ((t * 0.21) % 1.2) * H - H * 0.1;
  return (
    <>
      <AbsoluteFill style={{ opacity: 0.16, background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)" }} />
      <div style={{ position: "absolute", left: 0, top: y, width: W, height: 26, background: "linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.06), rgba(255,255,255,0))" }} />
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
      <div style={{ position: "absolute", left: 64, top: 96 }}>
        <div style={{ fontWeight: 800, fontSize: 58, color: eye ? VIOLET : "#fff3e6", textShadow: "0 3px 16px rgba(0,0,0,0.7)" }}>{title} ☾</div>
        <div style={{ marginTop: 6, fontWeight: 600, fontSize: 30, color: "#f1e2d6", opacity: 0.9, textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>beats to escape a crater to</div>
      </div>
      <div style={{ position: "absolute", right: 64, top: 104, fontWeight: 800, fontSize: 36, color: eye ? VIOLET : "#fff3e6", fontVariantNumeric: "tabular-nums", textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>{clock}</div>
      {/* now playing */}
      <div style={{ position: "absolute", left: 64, right: 64, top: WIN.y + WIN.h + 96, padding: "22px 28px", borderRadius: 22, backgroundColor: "rgba(20,14,26,0.55)", border: "2px solid rgba(255,240,230,0.18)", backdropFilter: "blur(6px)" }}>
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
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: WIN.y + WIN.h * 0.5, opacity: k }}>
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
