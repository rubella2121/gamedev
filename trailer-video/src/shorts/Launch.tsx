import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { Flash, useShake } from "../components/Effects";
import LINES from "../data/lines-launch.json";
import VOICE from "../data/lines-launch.voice.json";
import shorts from "../data/shorts.json";
import { GOLD } from "../lib/colours";
import { POSTER, TERM, useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip } from "./kit";

const S = shorts.shorts.launch;
const PURPLE = "#b48cff";
const GREEN = "#3dff8a";

/**
 * LAUNCH DAY - the game "launches" on CrazyGames, so it launches. NOW ON CRAZYGAMES over a rocket on its pad in the pixel
 * forest, searchlights sweeping. Mission control: eight monitors come on, each a live feed of a fight, and the flight director
 * polls the stations - go / no-go - and the bosses answer GO one after another (X last, his monitor all static until his eyes
 * open). The countdown, the blob in the porthole looking up; ignition, liftoff; the rocket climbs out of the forest and smashes
 * through the flat 2D sky like glass, into 3D space, where the bosses tumble past. A portal; white; the logo: out now on
 * CrazyGames.
 */

type Station = { station: string; boss: string; clip: string; from: number; z: number; c: [number, number]; rate?: number; pixel?: boolean };
const STATIONS: Station[] = [
  { station: "SURGEON", boss: "GLOOMMOTHER", clip: "f-gloom", from: 400, z: 2.3, c: [0.5, 0.16], pixel: true },
  { station: "BOOSTER", boss: "THORNBACK KING", clip: "f-thicket", from: 200, z: 2.0, c: [0.52, 0.28], pixel: true },
  { station: "COMMS", boss: "TOLL QUEEN", clip: "f-marsh", from: 80, z: 1.9, c: [0.5, 0.2], pixel: true },
  { station: "STRUCTURES", boss: "BONE WYRM", clip: "f-bones", from: 106, z: 2.0, c: [0.48, 0.72], rate: 0.45, pixel: true },
  { station: "GUIDANCE", boss: "MIMIC QUEEN", clip: "f-meadow", from: 270, z: 2.2, c: [0.5, 0.15], pixel: true },
  { station: "PAYLOAD", boss: "THE COLLECTOR", clip: "collector-0", from: 30, z: 1.0, c: [0.5, 0.45] },
  { station: "PROPULSION", boss: "THE MASH", clip: "mash-3", from: 60, z: 1.0, c: [0.5, 0.5], rate: 0.8 },
  { station: "FLIGHT", boss: "X, THE HOLLOW", clip: "x-gaze", from: 0, z: 1.25, c: [0.5, 0.3] },
];

export const Launch: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shake = useShake([
    [S.crazy, 0.6],
    ...S.gos.map((g, i) => [g, i === 7 ? 0.7 : 0.22] as [number, number]),
    ...S.count.map((c) => [c, 0.45] as [number, number]),
    [S.ignition, 0.9],
    [S.liftoff, 1.1],
    [S.shatter, 1.4],
    [S.end, 0.4],
  ]);
  // the rumble under the engines: a steady shake from ignition to the shatter
  const rumble = t > S.ignition && t < S.shatter ? 5 * smooth((t - S.ignition) / 0.6) : 0;
  const rx = rumble ? (rand(frame * 3) - 0.5) * 2 * rumble : 0;
  const ry = rumble ? (rand(frame * 3 + 1) - 0.5) * 2 * rumble : 0;
  const white = t > S.portal ? smooth((t - (S.white - 0.35)) / 0.35) * (1 - smooth((t - S.end) / 0.5)) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#03040b" }}>
      <AbsoluteFill style={{ transform: `${shake === "none" ? "" : shake} translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)` }}>
        {t < S.control + 0.25 ? <Opening t={t} ready={ready} /> : null}
        {t >= S.control - 0.05 && t < S.count[0]! - 0.05 ? <Control t={t} ready={ready} /> : null}
        {t >= S.count[0]! - 0.1 && t < S.liftoff ? <Countdown t={t} ready={ready} /> : null}
        {t >= S.liftoff && t < S.shatter + 1.1 ? <Ascent t={t} /> : null}
        {t >= S.shatter && t < S.end + 0.1 ? <Space t={t} ready={ready} /> : null}
        {t >= S.shatter && t < S.shatter + 1.1 ? <Shards t={t} /> : null}
        {t >= S.end - 0.05 ? <End t={t} ready={ready} /> : null}
        {ready ? <Captions t={t} /> : null}
        <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, mixBlendMode: "overlay", opacity: 0.22 }} />
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 65% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)" }} />
      </AbsoluteFill>
      <Flash hits={[[S.crazy, 0.45], ...S.count.map((c) => [c, 0.22] as [number, number]), [S.ignition, 0.55], [S.liftoff, 0.6], [S.shatter, 1]]} />
      <IgnitionGlow t={t} />
      {white > 0.002 ? <AbsoluteFill style={{ backgroundColor: "#fff", opacity: white }} /> : null}
      {t > S.fadeOut ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: smooth((t - S.fadeOut) / (S.length - 0.05 - S.fadeOut)) }} /> : null}
      <Audio src={staticFile("audio/short-launch.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the rocket */

/** the rocket: cream and gold, red nose and fins, the blob in the porthole looking up; `flame` 0..1 */
const Rocket: React.FC<{ x: number; y: number; s: number; flame: number; t: number; tilt?: number }> = ({ x, y, s, flame, t, tilt = 0 }) => {
  const f = Math.floor(t * 30);
  const fl = flame * (1 + 0.16 * (rand(f) - 0.5));
  const len = 520 * fl;
  return (
    <div style={{ position: "absolute", left: x - 150 * s, top: y, width: 300 * s, height: 900 * s, transform: `rotate(${tilt}deg)`, transformOrigin: "50% 50%" }}>
      {/* the flame, under the engine */}
      {flame > 0.01 ? (
        <div style={{ position: "absolute", left: 0, top: 830 * s, width: 300 * s, height: (len + 60) * s, mixBlendMode: "screen" }}>
          <div style={{ position: "absolute", left: 30 * s, top: -20 * s, width: 240 * s, height: (len + 60) * s, borderRadius: "50% 50% 50% 50% / 20% 20% 80% 80%", background: "radial-gradient(ellipse at 50% 15%, rgba(255,200,90,0.95), rgba(255,110,30,0.7) 40%, rgba(255,60,20,0) 75%)", filter: `blur(${10 * s}px)` }} />
          <div style={{ position: "absolute", left: 80 * s, top: -10 * s, width: 140 * s, height: len * 0.7 * s, borderRadius: "50% 50% 50% 50% / 20% 20% 80% 80%", background: "radial-gradient(ellipse at 50% 10%, #ffffff, rgba(255,240,180,0.95) 30%, rgba(255,170,60,0) 75%)", filter: `blur(${5 * s}px)` }} />
          <div style={{ position: "absolute", left: 115 * s, top: -6 * s, width: 70 * s, height: len * 0.35 * s, borderRadius: "50%", background: "radial-gradient(ellipse at 50% 20%, #e8f6ff, rgba(160,210,255,0.8) 40%, rgba(160,210,255,0) 80%)" }} />
        </div>
      ) : null}
      <svg width={300 * s} height={900 * s} viewBox="0 0 300 900" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id="rb" x1="0" x2="1">
            <stop offset="0" stopColor="#9b917f" />
            <stop offset="0.3" stopColor="#fbf6ea" />
            <stop offset="0.6" stopColor="#e8e0cf" />
            <stop offset="1" stopColor="#7d7464" />
          </linearGradient>
          <linearGradient id="rr" x1="0" x2="1">
            <stop offset="0" stopColor="#8f1d1d" />
            <stop offset="0.35" stopColor="#ef5a45" />
            <stop offset="1" stopColor="#6e1414" />
          </linearGradient>
          <linearGradient id="rg" x1="0" x2="1">
            <stop offset="0" stopColor="#8a6424" />
            <stop offset="0.4" stopColor="#ffe08a" />
            <stop offset="1" stopColor="#8a6424" />
          </linearGradient>
          <linearGradient id="rm" x1="0" x2="1">
            <stop offset="0" stopColor="#2a2f3a" />
            <stop offset="0.45" stopColor="#8d96a6" />
            <stop offset="1" stopColor="#1d222c" />
          </linearGradient>
        </defs>
        <path d="M60,600 L4,770 L4,830 L60,780 Z" fill="url(#rr)" />
        <path d="M240,600 L296,770 L296,830 L240,780 Z" fill="url(#rr)" />
        <path d="M95,770 L205,770 L232,840 L68,840 Z" fill="url(#rm)" />
        <rect x="60" y="230" width="180" height="560" rx="26" fill="url(#rb)" />
        <path d="M60,262 C60,130 150,34 150,34 C150,34 240,130 240,262 Z" fill="url(#rr)" />
        <rect x="60" y="262" width="180" height="16" fill="url(#rg)" />
        <rect x="60" y="610" width="180" height="16" fill="url(#rg)" />
        <rect x="60" y="760" width="180" height="12" fill="url(#rg)" />
        <path d="M150,640 L150,760" stroke="#c9bfa9" strokeWidth="3" />
        <circle cx="150" cy="420" r="66" fill="url(#rg)" />
        <circle cx="150" cy="420" r="54" fill="#08131f" />
        <circle cx="150" cy="420" r="54" fill="none" stroke="rgba(160,230,255,0.25)" strokeWidth="6" />
        <text x="150" y="560" textAnchor="middle" fontFamily={POSTER} fontSize="34" letterSpacing="6" fill="#b3271f">T3D</text>
      </svg>
      {/* the blob, looking up through the porthole */}
      <div style={{ position: "absolute", left: (150 - 46) * s, top: (420 - 32) * s, width: 92 * s, height: 70 * s, overflow: "hidden", borderRadius: "50%" }}>
        <Img src={staticFile("launch/blob.png")} style={{ position: "absolute", left: 6 * s, top: 8 * s + Math.sin(t * 6) * 2 * s, width: 80 * s, height: 62 * s, imageRendering: "pixelated" }} />
      </div>
      <div style={{ position: "absolute", left: (150 - 40) * s, top: (420 - 44) * s, width: 34 * s, height: 22 * s, borderRadius: "50%", background: "rgba(255,255,255,0.35)", transform: "rotate(-30deg)" }} />
    </div>
  );
};

/** the launch tower beside the pad: a lattice of girders */
const Tower: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => {
  const rows = 14;
  return (
    <svg width={120 * s} height={980 * s} viewBox="0 0 120 980" style={{ position: "absolute", left: x, top: y }}>
      <rect x="10" y="0" width="8" height="980" fill="#1b2433" />
      <rect x="102" y="0" width="8" height="980" fill="#1b2433" />
      {Array.from({ length: rows }, (_, i) => (
        <g key={i} stroke="#1b2433" strokeWidth="5">
          <line x1="14" y1={i * 70} x2="106" y2={i * 70 + 70} />
          <line x1="106" y1={i * 70} x2="14" y2={i * 70 + 70} />
          <line x1="14" y1={i * 70} x2="106" y2={i * 70} />
        </g>
      ))}
      <rect x="0" y="120" width="120" height="10" fill="#26324a" />
      <circle cx="60" cy="0" r="7" fill="#ff3b3b" opacity={0.9} />
    </svg>
  );
};

/** stars, twinkling; `drift` scrolls them down (the camera climbing) */
const Stars: React.FC<{ t: number; n?: number; drift?: number; seed?: number }> = ({ t, n = 120, drift = 0, seed = 1 }) => (
  <AbsoluteFill>
    {Array.from({ length: n }, (_, i) => {
      const x = rand(i * 3 + seed) * W;
      const y = (((rand(i * 5 + seed) * H + drift * (0.3 + 0.7 * rand(i + seed))) % H) + H) % H;
      const r = 1 + 2.5 * rand(i * 7 + seed) ** 3;
      const tw = 0.45 + 0.55 * Math.sin(t * (1 + 2 * rand(i + 9)) + i);
      return <div key={i} style={{ position: "absolute", left: x, top: y, width: r * 2, height: r * 2, borderRadius: "50%", background: "#eaf4ff", opacity: tw, boxShadow: r > 2 ? "0 0 8px rgba(200,230,255,0.8)" : undefined }} />;
    })}
  </AbsoluteFill>
);

/** the pixel forest along the bottom: the game's own trees, black against the night */
const Forest: React.FC<{ y: number }> = ({ y }) => {
  const trees: [string, number, number][] = [
    ["tree-b", 30, 7],
    ["tree-a", 190, 6],
    ["tree-c", 330, 5],
    ["tree-a", 760, 6],
    ["tree-b", 900, 7],
    ["tree-c", 1010, 5],
  ];
  const SZ: Record<string, [number, number]> = { "tree-a": [48, 103], "tree-b": [57, 109], "tree-c": [41, 88] };
  return (
    <>
      {trees.map(([n, x, k], i) => {
        const [w, h] = SZ[n]!;
        return <Img key={i} src={staticFile(`launch/${n}.png`)} style={{ position: "absolute", left: x - (w * k) / 2, top: y - h * k, width: w * k, height: h * k, imageRendering: "pixelated", filter: "brightness(0.6)" }} />;
      })}
      <div style={{ position: "absolute", left: 0, top: y - 8, width: W, height: 700, overflow: "hidden" }}>
        <Img src={staticFile("launch/ground.jpg")} style={{ width: W, height: 700, objectFit: "cover", imageRendering: "pixelated", filter: "brightness(0.65)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(3,4,11,0.2), rgba(3,4,11,0.85))" }} />
      </div>
    </>
  );
};

/* ------------------------------------------------------------------------------------------------ 1. now on crazygames */

const Opening: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const out = smooth((t - (S.control - 0.25)) / 0.3);
  const zoom = 1 + 0.06 * smooth(t / S.control) + 0.5 * out;
  const slam = (at: number) => ({ opacity: clamp((t - at) / 0.05), transform: `scale(${(1 + 0.6 * (1 - easeOut((t - at) / 0.2))).toFixed(3)})` });
  const sweep = (k: number) => Math.sin(t * 1.3 + k * 2.1) * 16;
  return (
    <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${zoom})` }}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #050812 0%, #0b1530 60%, #121c38 100%)" }} />
      <Stars t={t} n={140} />
      <Img src={staticFile("launch/moon.png")} style={{ position: "absolute", left: 800, top: 60, width: 59 * 4, height: 59 * 4, imageRendering: "pixelated", opacity: 0.9 }} />
      {/* searchlights */}
      {[260, 820].map((x, k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: x - 220,
            top: 300,
            width: 440,
            height: 1500,
            transformOrigin: "50% 100%",
            transform: `rotate(${(k ? -1 : 1) * 14 + sweep(k)}deg)`,
            background: "linear-gradient(0deg, rgba(190,225,255,0.32), rgba(190,225,255,0) 85%)",
            clipPath: "polygon(46% 100%, 54% 100%, 100% 0, 0 0)",
            mixBlendMode: "screen",
          }}
        />
      ))}
      <Tower x={640} y={760} s={0.85} />
      <Rocket x={540} y={1040} s={0.62} flame={0} t={t} />
      <Forest y={1600} />
      {ready ? (
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 230, textAlign: "center" }}>
          <div style={{ fontFamily: POSTER, fontSize: 230, lineHeight: 0.9, color: "#fff", letterSpacing: 10, textShadow: "0 8px 0 #000, 0 0 40px rgba(255,255,255,0.3)", ...slam(S.now) }}>{t >= S.now ? "NOW" : ""}</div>
          <div style={{ fontFamily: POSTER, fontSize: 96, lineHeight: 1, color: GOLD, letterSpacing: 20, marginTop: 6, ...slam(S.now + 0.3) }}>{t >= S.now + 0.3 ? "ON" : ""}</div>
          <div
            style={{
              fontFamily: POSTER,
              fontSize: 196,
              lineHeight: 0.95,
              letterSpacing: 6,
              marginTop: 10,
              color: PURPLE,
              textShadow: "0 0 30px rgba(150,100,255,0.9), 0 0 80px rgba(150,100,255,0.6), 0 8px 0 #12062e",
              ...slam(S.crazy),
            }}
          >
            {t >= S.crazy ? "CRAZYGAMES" : ""}
          </div>
          <div style={{ fontFamily: TERM, fontSize: 46, letterSpacing: 10, color: "rgba(232,242,255,0.85)", marginTop: 26, opacity: clamp((t - S.crazy - 0.5) / 0.3) }}>
            THE THIRD DIRECTION · LAUNCH DAY
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ 2. mission control */

const MW = 470;
const MH = 300;
const mx = (i: number) => (i % 2 === 0 ? 50 : 560);
const my = (i: number) => 290 + Math.floor(i / 2) * 345;

const Control: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.control;
  const inn = smooth(u / 0.25);
  const off = smooth((t - (S.count[0]! - 0.35)) / 0.3);
  const push = 1 + 0.035 * smooth(u / (S.count[0]! - S.control));
  const left = Math.max(0, S.ignition - t);
  const clock = `T-00:00:${String(Math.ceil(left)).padStart(2, "0")}`;
  const allGo = t >= S.goForLaunch;
  return (
    <AbsoluteFill style={{ opacity: inn, transform: `scale(${push}) scaleY(${(1 - 0.98 * off).toFixed(3)})`, filter: off > 0 ? `brightness(${1 + 3 * off})` : undefined }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #0d1830 0%, #070b18 60%, #03040b 100%)" }} />
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(120,170,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(120,170,255,0.05) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
      {ready ? (
        <div style={{ position: "absolute", left: 50, right: 50, top: 150, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: TERM, color: "#cfe6ff" }}>
          <div style={{ fontSize: 46, letterSpacing: 6 }}>
            <span style={{ color: "#ff4a5a", opacity: Math.floor(t * 2) % 2 ? 1 : 0.3 }}>●</span> MISSION CONTROL
          </div>
          <div style={{ fontSize: 60, letterSpacing: 4, color: allGo ? GREEN : GOLD, textShadow: `0 0 18px ${allGo ? GREEN : GOLD}` }}>{clock}</div>
        </div>
      ) : null}
      {STATIONS.map((st, i) => (
        <Monitor key={i} t={t} i={i} st={st} ready={ready} />
      ))}
      {ready && allGo ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 800, height: 250, background: "rgba(2,10,6,0.86)", borderTop: `4px solid ${GREEN}`, borderBottom: `4px solid ${GREEN}`, boxShadow: `0 0 60px rgba(61,255,138,0.45)`, display: "flex", alignItems: "center", justifyContent: "center", opacity: clamp((t - S.goForLaunch) / 0.08), transform: `scaleY(${easeOut((t - S.goForLaunch) / 0.15).toFixed(3)})` }}>
          <div style={{ fontFamily: POSTER, fontSize: 150, letterSpacing: 16, color: GREEN, textShadow: `0 0 30px ${GREEN}, 0 6px 0 #000`, transform: `scale(${1 + 0.3 * (1 - easeOut((t - S.goForLaunch) / 0.25))})` }}>GO FOR LAUNCH</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const Monitor: React.FC<{ t: number; i: number; st: Station; ready: boolean }> = ({ t, i, st, ready }) => {
  const on = S.control + 0.15 + 0.11 * i;
  const crt = easeOut((t - on) / 0.18);
  const go = S.gos[i]!;
  const isGo = t >= go;
  const isX = i === 7;
  const col = isX ? "#ff4a5a" : GREEN;
  const pulse = t >= S.goForLaunch ? 0.6 + 0.4 * Math.sin(t * 12) : 1;
  const stamp = isGo ? backOut((t - go) / 0.22) : 0;
  const frame = Math.floor(t * 30);
  return (
    <div style={{ position: "absolute", left: mx(i), top: my(i), width: MW, height: MH + 40 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: MW,
          height: MH,
          borderRadius: 12,
          overflow: "hidden",
          background: "#000",
          border: `6px solid ${isGo ? col : "#1c2738"}`,
          boxShadow: isGo ? `0 0 ${(30 * pulse).toFixed(0)}px ${col}` : "0 10px 30px rgba(0,0,0,0.6)",
          transform: `scaleY(${Math.max(0.02, crt).toFixed(3)})`,
        }}
      >
        {crt > 0.05 ? (
          isX && t < go - 0.35 ? (
            // his station is nothing but static until he answers
            <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) contrast(3) brightness(0.9)" }} />
          ) : (
            <>
              <Clip clip={st.clip} at={S.control} from={st.from} dur={S.count[0]! - S.control + 0.2} box={[0, 0, MW - 12, MH - 12]} z={st.z} c={st.c} rate={st.rate} pixel={st.pixel} />
              {isX ? <Img src={staticFile("launch/x-eyes.png")} style={{ position: "absolute", left: 60, top: 70, width: 340, height: 84, imageRendering: "pixelated", filter: "drop-shadow(0 0 20px rgba(255,40,60,0.9))", opacity: clamp((t - (go - 0.35)) / 0.2) }} /> : null}
            </>
          )
        ) : null}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(180deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px)" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)" }} />
        {crt < 1 ? <div style={{ position: "absolute", left: 0, right: 0, top: MH / 2 - 3, height: 6, background: "#fff", opacity: 1 - crt }} /> : null}
        {ready ? <div style={{ position: "absolute", left: 14, top: 10, fontFamily: TERM, fontSize: 28, color: "rgba(230,240,255,0.85)", letterSpacing: 2 }}>CAM {String(i + 1).padStart(2, "0")}</div> : null}
        {ready && isGo ? (
          <div style={{ position: "absolute", left: 0, right: 0, top: MH / 2 - 95, textAlign: "center", fontFamily: POSTER, fontSize: 170, lineHeight: 1, color: col, textShadow: `0 0 26px ${col}, 0 6px 0 #000`, transform: `scale(${(2.2 - 1.2 * clamp(stamp)).toFixed(3)}) rotate(-6deg)`, opacity: clamp(stamp * 2) }}>
            {isX ? "GO." : "GO"}
          </div>
        ) : null}
      </div>
      {ready ? (
        <div style={{ position: "absolute", left: 0, top: MH + 6, width: MW, height: 34, display: "flex", justifyContent: "space-between", fontFamily: TERM, fontSize: 30, letterSpacing: 3, color: isGo ? col : "rgba(200,220,240,0.75)" }}>
          <span>{st.station}</span>
          <span>{st.boss}</span>
        </div>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ 3. the countdown */

/** the countdown cuts: wide on the pad at three, the blob at the porthole at two, the engine bells at one, wide for ignition */
const SHOTS: { z: number; o: [number, number]; num: number }[] = [
  { z: 1, o: [540, 900], num: 640 },
  { z: 2.4, o: [540, 711], num: 1060 },
  { z: 2.1, o: [540, 1340], num: 230 },
  { z: 1.05, o: [540, 1100], num: 0 },
];

const Countdown: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.count[0]!;
  const inn = smooth((u + 0.1) / 0.25);
  const k = t < S.count[1]! ? 0 : t < S.count[2]! ? 1 : t < S.ignition ? 2 : 3;
  const from = [S.count[0]!, S.count[1]!, S.count[2]!, S.ignition][k]!;
  const shot = SHOTS[k]!;
  const z = shot.z * (1 + 0.05 * (t - from));
  const ign = t >= S.ignition ? easeOut((t - S.ignition) / 0.5) : 0;
  return (
    <AbsoluteFill style={{ opacity: inn }}>
      <AbsoluteFill style={{ transform: `scale(${z.toFixed(4)})`, transformOrigin: `${shot.o[0]}px ${shot.o[1]}px` }}>
        <AbsoluteFill style={{ background: "linear-gradient(180deg, #050812 0%, #0b1530 62%, #1a1a2a 100%)" }} />
        <Stars t={t} n={90} seed={7} />
        <Forest y={1760} />
        <Tower x={820} y={160} s={1.5} />
        <Pad />
        <Rocket x={540} y={60} s={1.55} flame={ign} t={t} />
        <Steam t={t} from={S.count[0]! - 1} y={1430} k={1 + 2 * ign} />
      </AbsoluteFill>
      {ready
        ? S.count.map((c, i) => {
            const d = t - c;
            if (d < 0 || d > 0.95) return null;
            const o = clamp(d / 0.04) * (1 - smooth((d - 0.72) / 0.22));
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: SHOTS[i]!.num,
                  textAlign: "center",
                  fontFamily: POSTER,
                  fontSize: 640,
                  lineHeight: 1,
                  color: "#fff",
                  textShadow: "0 0 50px rgba(255,190,90,0.85), 0 14px 0 #000, 0 0 120px rgba(0,0,0,0.8)",
                  opacity: o,
                  transform: `scale(${(1.45 - 0.45 * easeOut(d / 0.28)).toFixed(3)})`,
                }}
              >
                {3 - i}
              </div>
            );
          })
        : null}
    </AbsoluteFill>
  );
};

/** the launch pad under the rocket: a steel deck with hazard stripes and lights over the flame pit */
const Pad: React.FC = () => (
  <svg width={W} height={600} viewBox="0 0 1080 600" style={{ position: "absolute", left: 0, top: 1350 }}>
    <defs>
      <pattern id="haz" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="30" height="60" fill="#f2c14e" />
        <rect x="30" width="30" height="60" fill="#14161c" />
      </pattern>
      <linearGradient id="deck" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a4254" />
        <stop offset="1" stopColor="#151a24" />
      </linearGradient>
    </defs>
    <path d="M120,40 L960,40 L1010,110 L70,110 Z" fill="url(#deck)" />
    <rect x="70" y="110" width="940" height="34" fill="url(#haz)" />
    <rect x="160" y="144" width="70" height="420" fill="#141925" />
    <rect x="850" y="144" width="70" height="420" fill="#141925" />
    <rect x="380" y="144" width="320" height="420" fill="#07090f" />
    {[150, 330, 750, 930].map((x, i) => (
      <circle key={i} cx={x} cy={72} r={9} fill="#ff4a3a" />
    ))}
  </svg>
);

/** steam venting from the pad: soft white puffs that rise and spread; `k` how much */
const Steam: React.FC<{ t: number; from: number; y: number; k: number }> = ({ t, from, y, k }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {Array.from({ length: 36 }, (_, i) => {
      const born = from + (i / 36) * 4;
      const a = t - born;
      if (a < 0) return null;
      const life = (a % 2.2) / 2.2;
      const side = rand(i) < 0.5 ? -1 : 1;
      const x = W / 2 + side * (60 + 520 * life * (0.4 + rand(i + 3))) * k * 0.6;
      const yy = y - 300 * life * rand(i + 5) + 60 * rand(i + 9);
      const r = (60 + 220 * life) * (0.6 + 0.5 * rand(i + 7)) * Math.min(1.6, k);
      return <div key={i} style={{ position: "absolute", left: x - r, top: yy - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: "radial-gradient(circle, rgba(230,236,245,0.55), rgba(230,236,245,0) 70%)", opacity: (1 - life) * 0.9 }} />;
    })}
  </AbsoluteFill>
);

/** the orange light of the engines on everything, flickering */
const IgnitionGlow: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.ignition || t > S.shatter) return null;
  const o = smooth((t - S.ignition) / 0.4) * (1 - smooth((t - (S.shatter - 0.6)) / 0.6)) * (0.8 + 0.2 * rand(Math.floor(t * 30)));
  return <AbsoluteFill style={{ background: "radial-gradient(ellipse 90% 60% at 50% 100%, rgba(255,140,40,0.55), rgba(255,90,20,0) 70%)", mixBlendMode: "screen", opacity: o }} />;
};

/* ------------------------------------------------------------------------------------------------ 4. liftoff and the climb */

const RS = 0.7;
const NOSE = 30 * RS;

const Ascent: React.FC<{ t: number }> = ({ t }) => {
  const u = t - S.liftoff;
  // the rocket rises off the pad into place; then the world falls away beneath it, faster and faster
  const rocketY = 1260 - 560 * easeInOut(u / 1.0);
  const scroll = Math.max(0, u - 0.6) ** 2 * 900;
  const hit = S.shatter - S.liftoff;
  const ceil = 700 + NOSE - 820 * Math.max(0, hit - u) ** 1.15;
  const near = smooth((u - (hit - 1.8)) / 1.2);
  const speed = clamp((u - 0.8) / 1.5);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, #03040b 0%, #070c1e ${(60 - 40 * speed).toFixed(0)}%, #0b1530 100%)` }} />
      <Stars t={t} n={140} drift={scroll * 0.5} seed={3} />
      {/* speed: streaks falling past */}
      {Array.from({ length: 26 }, (_, i) => {
        const x = rand(i * 11) * W;
        const y = ((rand(i * 13) * H + scroll * (1.2 + rand(i))) % (H + 400)) - 200;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: 3, height: 160 + 300 * speed, background: "linear-gradient(180deg, rgba(200,230,255,0), rgba(200,230,255,0.5))", opacity: speed * 0.8 }} />;
      })}
      {/* the world below, falling away */}
      <div style={{ position: "absolute", left: 0, top: scroll, width: W, height: H }}>
        <Img src={staticFile("launch/moon.png")} style={{ position: "absolute", left: 90, top: -900, width: 59 * 6, height: 59 * 6, imageRendering: "pixelated" }} />
        <Tower x={680} y={600} s={0.95} />
        <Forest y={1640} />
        {/* the smoke left on the pad */}
        {Array.from({ length: 30 }, (_, i) => {
          const a = clamp((u - i * 0.03) / 2.5);
          const side = rand(i) < 0.5 ? -1 : 1;
          const x = W / 2 + side * 700 * a * (0.3 + rand(i + 2));
          const y = 1560 - 200 * a * rand(i + 4);
          const r = 120 + 420 * a * (0.5 + rand(i + 6));
          return <div key={i} style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: "radial-gradient(circle, rgba(225,228,238,0.7), rgba(225,228,238,0) 70%)" }} />;
        })}
      </div>
      {/* the sky that is a page: the flat world's own night, coming down to meet the rocket */}
      {/* (its glow reaches down before it shows) */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(170,140,255,0.55), rgba(170,140,255,0) 45%)", opacity: near * 0.8 }} />
      {ceil > -10 ? (
        <div style={{ position: "absolute", left: 0, top: ceil - H, width: W, height: H, overflow: "hidden", boxShadow: "0 30px 90px rgba(170,140,255,0.7)" }}>
          <Img src={staticFile("launch/skypane.jpg")} style={{ width: W, height: H, imageRendering: "pixelated" }} />
          <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(170,140,255,0.12) 2px, transparent 2px), linear-gradient(90deg, rgba(170,140,255,0.12) 2px, transparent 2px)", backgroundSize: "40px 40px" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 12, background: "rgba(220,200,255,0.95)", boxShadow: "0 0 40px rgba(200,180,255,1)" }} />
        </div>
      ) : null}
      {/* the trail of fire and smoke behind */}
      <div style={{ position: "absolute", left: W / 2 - 90, top: rocketY + 840 * RS, width: 180, height: H, background: "linear-gradient(180deg, rgba(255,200,120,0.6), rgba(230,230,240,0.35) 30%, rgba(230,230,240,0) 90%)", filter: "blur(18px)" }} />
      <Rocket x={W / 2} y={rocketY} s={RS} flame={1} t={t} tilt={Math.sin(t * 3) * 1.2} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the sky breaks */

/** shards of the flat sky: a jittered grid of triangles, each flying out from where the rocket hit */
const SHARDS = (() => {
  const cols = 5;
  const rows = 8;
  const pts: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    pts.push([]);
    for (let c = 0; c <= cols; c++) {
      const jx = c > 0 && c < cols ? (rand(r * 31 + c) - 0.5) * 120 : 0;
      const jy = r > 0 && r < rows ? (rand(r * 17 + c * 5) - 0.5) * 140 : 0;
      pts[r]!.push([(c / cols) * W + jx, (r / rows) * H + jy]);
    }
  }
  const tris: [number, number][][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const a = pts[r]![c]!;
      const b = pts[r]![c + 1]!;
      const d = pts[r + 1]![c]!;
      const e = pts[r + 1]![c + 1]!;
      tris.push([a, b, e], [a, e, d]);
    }
  return tris;
})();

const Shards: React.FC<{ t: number }> = ({ t }) => {
  const u = t - S.shatter;
  const hx = W / 2;
  const hy = 720;
  return (
    <AbsoluteFill>
      {SHARDS.map((tri, i) => {
        const cx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3;
        const cy = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3;
        const dx = cx - hx;
        const dy = cy - hy;
        const d = Math.hypot(dx, dy) + 1;
        const v = 1400 + 900 * rand(i);
        const k = easeOut(u / 1.1);
        const tx = (dx / d) * v * k;
        const ty = (dy / d) * v * k + 600 * u * u;
        const rot = (rand(i + 50) - 0.5) * 220 * k;
        const sc = 1 + 0.6 * k;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translate(${tx.toFixed(0)}px, ${ty.toFixed(0)}px) rotate(${rot.toFixed(1)}deg) scale(${sc.toFixed(3)})`,
              transformOrigin: `${cx.toFixed(0)}px ${cy.toFixed(0)}px`,
              opacity: 1 - smooth((u - 0.5) / 0.6),
            }}
          >
            <div style={{ position: "absolute", inset: 0, clipPath: `polygon(${tri.map(([x, y]) => `${x.toFixed(0)}px ${y.toFixed(0)}px`).join(",")})` }}>
              <Img src={staticFile("launch/skypane.jpg")} style={{ width: W, height: H, imageRendering: "pixelated", filter: "brightness(1.3)" }} />
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${(rand(i) * 360).toFixed(0)}deg, rgba(220,205,255,0.45), rgba(255,255,255,0) 45%)` }} />
            </div>
            <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
              <polygon points={tri.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(" ")} fill="none" stroke="rgba(225,210,255,0.85)" strokeWidth={3} />
            </svg>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ 5. the third direction: space */

type Flyer = { img: string; w: number; h: number; pixel?: boolean; at: number; dir: [number, number]; spin: number; glow: string };
const FLYERS: Flyer[] = [
  { img: "gloommother", w: 150, h: 112, pixel: true, at: 0.5, dir: [-1, -0.6], spin: -20, glow: "rgba(111,240,255,0.7)" },
  { img: "queen", w: 124, h: 151, pixel: true, at: 1.1, dir: [1, -0.8], spin: 25, glow: "rgba(217,184,255,0.7)" },
  { img: "king", w: 152, h: 107, pixel: true, at: 1.7, dir: [-1, 0.5], spin: 30, glow: "rgba(232,178,122,0.6)" },
  { img: "mimic", w: 102, h: 123, pixel: true, at: 2.3, dir: [1, 0.4], spin: -25, glow: "rgba(255,138,168,0.7)" },
  { img: "wyrm", w: 169, h: 111, pixel: true, at: 2.9, dir: [-1, -0.2], spin: 40, glow: "rgba(244,239,224,0.5)" },
  { img: "collector-hd", w: 670, h: 544, at: 3.5, dir: [1, -0.4], spin: -15, glow: "rgba(247,213,110,0.5)" },
  { img: "mash-hd", w: 868, h: 503, at: 4.1, dir: [-1, 0.6], spin: 18, glow: "rgba(255,90,120,0.5)" },
];

const Space: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.shatter;
  const warp = 1 - smooth((u - 0.8) / 1.0);
  const toPortal = smooth((t - (S.portal + 0.6)) / 1.6);
  const xIn = smooth((u - 3.0) / 1.2) * (1 - smooth((t - (S.portal + 0.2)) / 0.8));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 50% at 30% 30%, rgba(110,60,220,0.55), rgba(0,0,0,0) 70%), radial-gradient(ellipse 60% 45% at 75% 70%, rgba(20,140,160,0.45), rgba(0,0,0,0) 70%), #05030f" }} />
      <Stars t={t} n={160} drift={u * 120} seed={11} />
      {/* hyperspace: the first moments, every star a streak from the middle */}
      {warp > 0.01
        ? Array.from({ length: 70 }, (_, i) => {
            const a = rand(i * 7) * Math.PI * 2;
            const r0 = 60 + rand(i * 3) * 300;
            const len = (200 + 900 * rand(i * 5)) * warp;
            return (
              <div
                key={i}
                style={{ position: "absolute", left: W / 2, top: 900, width: len, height: 3, transformOrigin: "0 50%", transform: `rotate(${a}rad) translateX(${r0 + u * 1200}px)`, background: "linear-gradient(90deg, rgba(220,210,255,0), rgba(220,210,255,0.9))", opacity: warp }}
              />
            );
          })
        : null}
      {/* X, enormous, looming in from the side with his eyes on the rocket */}
      <Img src={staticFile("launch/x-hd.png")} style={{ position: "absolute", left: 1080 - 900 * xIn, top: 360, width: 900, height: 900 * (1042 / 582), filter: "brightness(0.9) drop-shadow(0 0 60px rgba(255,30,60,0.55))", opacity: xIn * 0.85 }} />
      {/* the bosses tumbling past */}
      {FLYERS.map((f, i) => {
        const a = (u - f.at) / 1.4;
        if (a < 0 || a > 1) return null;
        const e = a * a;
        const sc = (f.pixel ? 0.4 : 0.06) + (f.pixel ? 5 : 0.9) * e;
        const x = W / 2 + f.dir[0] * 1100 * e;
        const y = 820 + f.dir[1] * 1200 * e;
        return (
          <Img
            key={i}
            src={staticFile(`launch/${f.img}.png`)}
            style={{ position: "absolute", left: x - (f.w * sc) / 2, top: y - (f.h * sc) / 2, width: f.w * sc, height: f.h * sc, imageRendering: f.pixel ? "pixelated" : "auto", transform: `rotate(${f.spin * a}deg)`, filter: `drop-shadow(0 0 22px ${f.glow})`, opacity: clamp(a * 6) }}
          />
        );
      })}
      <Portal t={t} />
      <Rocket x={W / 2 + Math.sin(t * 1.6) * 30 * (1 - toPortal)} y={1080 - 300 * toPortal} s={0.62 * (1 - 0.9 * toPortal)} flame={1} t={t} tilt={Math.sin(t * 1.6) * 4 * (1 - toPortal)} />
      {ready && u > 1.4 && t < S.portal ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 230, textAlign: "center", fontFamily: POSTER, fontSize: 120, letterSpacing: 10, color: "#fff", textShadow: "0 0 30px rgba(150,100,255,0.9), 0 6px 0 #000", opacity: smooth((u - 1.4) / 0.3) * (1 - smooth((t - (S.portal - 0.3)) / 0.3)) }}>
          8 BOSSES · 2D → 3D
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** the portal at the end of the climb: rings of purple and gold, opening */
const Portal: React.FC<{ t: number }> = ({ t }) => {
  const u = t - S.portal;
  if (u < -0.2) return null;
  const open = easeOut(u / 1.2);
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      {Array.from({ length: 7 }, (_, k) => {
        const r = (90 + k * 85) * open * (1 + 0.05 * Math.sin(t * 5 + k));
        const col = k % 2 ? "rgba(180,140,255,0.8)" : "rgba(255,215,122,0.75)";
        return (
          <div
            key={k}
            style={{ position: "absolute", left: W / 2 - r, top: 760 - r * 0.55, width: 2 * r, height: 1.1 * r, borderRadius: "50%", border: `${6 - k * 0.5}px solid ${col}`, boxShadow: `0 0 40px ${col}, inset 0 0 40px ${col}`, transform: `rotate(${(t * (k % 2 ? 30 : -24)).toFixed(1)}deg)`, opacity: open * (1 - k * 0.09) }}
          />
        );
      })}
      <div style={{ position: "absolute", left: W / 2 - 260 * open, top: 760 - 150 * open, width: 520 * open, height: 300 * open, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,255,255,0.95), rgba(200,170,255,0.6) 40%, rgba(150,100,255,0) 75%)" }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ 6. out now */

const End: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.end;
  const inn = smooth(u / 0.4);
  const logo = easeOut(u / 0.8);
  const line = (at: number) => ({ opacity: clamp((u - at) / 0.3), transform: `translateY(${((1 - easeOut((u - at) / 0.45)) * 30).toFixed(1)}px)` });
  return (
    <AbsoluteFill style={{ opacity: inn, background: "radial-gradient(ellipse 90% 60% at 50% 35%, #241452 0%, #0d0a26 55%, #04030b 100%)" }}>
      <Stars t={t} n={120} drift={u * 30} seed={21} />
      <Img src={staticFile("launch/logo.png")} style={{ position: "absolute", left: W / 2 - 520, top: 110 + (1 - logo) * 60, width: 1040, height: 1040 * (1900 / 2400), opacity: logo }} />
      {ready ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: 990, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontFamily: POSTER, fontSize: 88, letterSpacing: 26, color: GOLD, textShadow: "0 0 30px rgba(255,215,120,0.45)", ...line(0.5) }}>OUT NOW ON</div>
          <div style={{ fontFamily: POSTER, fontSize: 200, lineHeight: 0.95, letterSpacing: 6, color: PURPLE, textShadow: "0 0 30px rgba(150,100,255,0.95), 0 0 90px rgba(150,100,255,0.6), 0 8px 0 #12062e", marginTop: 6, ...line(0.8) }}>CRAZYGAMES</div>
          <div style={{ marginTop: 50, padding: "26px 70px", borderRadius: 80, background: "linear-gradient(180deg, #ffe08a, #e0a83a)", boxShadow: `0 0 ${(40 + 20 * Math.sin(t * 5)).toFixed(0)}px rgba(255,210,110,0.7), 0 10px 0 #7a5418`, fontFamily: POSTER, fontSize: 84, letterSpacing: 8, color: "#1a1030", ...line(1.3) }}>▶ PLAY FREE</div>
          <div style={{ fontFamily: '"Inter"', fontWeight: 600, fontSize: 44, color: "rgba(240,236,255,0.9)", marginTop: 44, ...line(1.6) }}>in your browser · no download · link in bio</div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the radio */

/** what mission control says, as a headset caption: the countdown numbers and the last line are shown on their own */
const Captions: React.FC<{ t: number }> = ({ t }) => {
  const k = VOICE.findIndex((v) => t >= v.at - 0.05 && t < v.at + v.dur + 0.4);
  if (k < 0) return null;
  const v = VOICE[k]!;
  if (["c3", "c4", "c5", "c6", "c8"].includes(v.id)) return null;
  const text = LINES.find((l) => l.id === v.id)!.caption;
  const o = smooth((t - (v.at - 0.05)) / 0.15) * (1 - smooth((t - (v.at + v.dur + 0.2)) / 0.2));
  const shown = text.slice(0, Math.floor(Math.max(0, t - v.at + 0.1) * 40));
  return (
    <div style={{ position: "absolute", left: 60, right: 60, bottom: 90, display: "flex", justifyContent: "center", opacity: o }}>
      <div style={{ padding: "14px 26px", background: "rgba(3,6,14,0.78)", border: "2px solid rgba(120,200,255,0.4)", borderRadius: 10, fontFamily: TERM, fontSize: 48, color: "#d8ecff", letterSpacing: 2, textAlign: "center" }}>
        <span style={{ color: "#7fd0ff" }}>◉ MISSION CONTROL: </span>
        {shown}
      </div>
    </div>
  );
};
