import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Flash, GlitchDefs, Look, useGlitch, useShake } from "../components/Effects";
import { Shot } from "../components/Shot";
import shorts from "../data/shorts.json";
import type { Cut } from "../edit";
import { GOLD, RED } from "../lib/colours";
import { MARKER, TERM, useFonts } from "../lib/fonts";
import { backOut, easeOut, FPS, H, smooth, W } from "../lib/time";
import { EndSecrets } from "./ends";
import { Arrow, Ring, Scrawl, span } from "./kit";

const S = shorts.shorts.secrets;
const LEN = 3.4;
const MARK = "#ff3b3b";

/**
 * 5 THINGS YOU MISSED - the game's secrets, counted down, each one frozen and marked up with a red pen. The stars were never
 * stars. The Mash is every guardian, stitched together. The moth takes the hit for you. The whole score is her lullaby. And
 * number one is classified.
 */
export const CUTS: Cut[] = [
  // the hook: four glimpses under the title
  { at: 0, end: 0.4, clip: "edge", from: 200, z: [1.7, 1.8], c: [0.5, 0.14], pixel: true, grade: "brightness(0.7) contrast(1.1)" },
  { at: 0.4, end: 0.8, clip: "c-mash", from: 40, z: [1.2, 1.25], c: [0.5, 0.4], in: "cut", grade: "brightness(0.6) contrast(1.1)" },
  { at: 0.8, end: 1.2, clip: "h-x-slam", from: 4, z: [1.2, 1.25], c: [0.45, 0.5], in: "cut", grade: "brightness(0.6) contrast(1.1)" },
  { at: 1.2, end: S.s5, clip: "t-eye", from: 70, z: [1.2, 1.3], c: [0.5, 0.48], in: "cut", grade: "brightness(0.6) contrast(1.1)" },
  // 5: the stars
  { at: S.s5, end: S.s5 + 1.7, clip: "edge", from: 150, rate: 0.9, z: [1.5, 1.7], c: [0.5, 0.15], pixel: true, in: "zoom" },
  { at: S.s5 + 1.7, end: S.s4, clip: "edge", from: 196, rate: 0.02, z: [1.7, 1.9], c: [0.5, 0.13], pixel: true, in: "cut" },
  // 4: the Mash
  { at: S.s4, end: S.s4 + 1.0, clip: "c-mash", from: 20, z: [1.08, 1.0], c: [0.5, 0.4], in: "whip" },
  { at: S.s4 + 1.0, end: S.s3, clip: "c-mash", from: 50, rate: 0.02, z: [1.0, 1.0], c: [0.5, 0.4], in: "cut" },
  // 3: the moth, and the foot it keeps off you
  { at: S.s3, end: S.s3 + 1.2, clip: "h-x-slam", from: 0, rate: 0.35, z: [1.0, 1.05], c: [0.45, 0.5], in: "blocks" },
  { at: S.s3 + 1.2, end: S.s3 + 2.0, clip: "h-x-slam", from: 12, rate: 0.02, z: [1.05, 1.08], c: [0.45, 0.5], in: "cut" },
  { at: S.s3 + 2.0, end: S.s2, clip: "h-x-slam", from: 13, z: [1.05, 1.12], c: [0.45, 0.55], in: "cut" },
  // 2: her song, everywhere
  { at: S.s2, end: S.s2 + 2.2, clip: "opening", from: 129, z: [1.1, 1.3], c: [0.5, 0.46], pixel: true, in: "zoom", grade: "brightness(0.75) contrast(1.1) saturate(1.2)" },
  { at: S.s2 + 2.2, end: S.s2 + 2.6, clip: "f-thicket", from: 168, z: [1.4, 1.3], c: [0.5, 0.4], pixel: true, in: "flash" },
  { at: S.s2 + 2.6, end: S.s2 + 3.0, clip: "c-x-hero", from: 20, in: "flash" },
  { at: S.s2 + 3.0, end: S.s1, clip: "mash-0", from: 80, z: [1.1, 1.0], c: [0.5, 0.45], in: "flash" },
  // 1: the end, and what is after it
  { at: S.s1, end: S.s1 + 0.8, clip: "reunion", from: 300, z: [1.0, 1.06], in: "glitch" },
  { at: S.s1 + 0.8, end: S.s1 + 1.2, clip: "t-unfold", from: 100, in: "glitch", grade: "brightness(1.1) contrast(1.2)" },
  { at: S.s1 + 1.2, end: S.s1 + 1.6, clip: "t-eye", from: 60, z: [1.1, 1.2], in: "glitch", grade: "brightness(1.1) contrast(1.2)" },
];

/** the melody, as notes on the staff (half-steps of the staff up from its bottom line, E) and when each is played */
const NOTES: [number, number][] = [
  [3, 0],
  [5, 0.25],
  [7, 0.5],
  [6, 0.875],
  [5, 1.125],
  [3, 1.375],
  [2, 1.75],
  [0, 2.0],
];
export const SONG_AT = S.s2 + 0.4;

export const Secrets: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const shake = useShake([
    [S.s5, 0.5],
    [S.s4, 0.5],
    [S.s3 + 2.19, 1.2],
    [S.s2 + 2.2, 0.6],
    [S.s1 + 0.8, 0.8],
    [S.s1 + 2.2, 0.9],
  ]);
  const tear = useGlitch([S.s1, S.s1 + 0.8, S.s1 + 1.2, S.s1 + 1.6]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill style={{ transform: shake, filter: tear > 0.02 ? "url(#tear)" : undefined }}>
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
        {/* dark at the top and the bottom, where the words go */}
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.7) 82%)" }} />
        {ready ? <EndSecrets at={S.end} fade={S.fadeOut} /> : null}
        <Look />
      </AbsoluteFill>
      <Flash hits={[[S.s5, 0.5], [S.s4, 0.4], [S.s3 + 2.19, 0.9], [S.s2 + 2.2, 0.7], [S.s2 + 2.6, 0.6], [S.s2 + 3.0, 0.6], [S.s1 + 0.8, 0.6], [S.end, 0.6]]} />
      {ready ? (
        <>
          <Hook t={t} />
          <Header n={5} at={S.s5} title={"THE STARS ARE|WATCHING"} y={0.64} />
          <Ring at={S.s5 + 1.85} end={S.s4 - 0.05} x={540} y={430} rx={430} ry={150} />
          <Scrawl at={S.s5 + 2.2} end={S.s4 - 0.05} x={540} y={700} text="they were never stars." size={66} colour={MARK} />

          <Header n={4} at={S.s4} title={"THE MASH IS|ALL OF THEM"} y={0.07} />
          {MASH.map(([x, y, tx, ty, label, align], i) => (
            <React.Fragment key={label}>
              <Arrow at={S.s4 + 1.1 + i * 0.4} end={S.s3 - 0.05} x0={tx} y0={ty} x1={x} y1={y} />
              <Scrawl at={S.s4 + 1.15 + i * 0.4} end={S.s3 - 0.05} x={tx} y={ty} text={label} size={44} align={align} tilt={i % 2 ? 4 : -4} />
            </React.Fragment>
          ))}

          <Header n={3} at={S.s3} title={"THE MOTH|PROTECTS YOU"} y={0.08} />
          <Ring at={S.s3 + 1.25} end={S.s3 + 2.0} x={465} y={1130} rx={210} ry={130} />
          <Arrow at={S.s3 + 1.4} end={S.s3 + 2.0} x0={850} y0={900} x1={680} y1={1070} />
          <Scrawl at={S.s3 + 1.45} end={S.s3 + 2.0} x={850} y={850} text="the moth" size={64} colour={MARK} />
          <Scrawl at={S.s3 + 2.25} end={S.s2 - 0.05} x={540} y={1180} text="it takes the hit for you." size={60} colour="#ffffff" tilt={-3} />

          <Header n={2} at={S.s2} title={"THE WHOLE SOUNDTRACK|IS ONE LULLABY"} y={0.08} />
          <Staff t={t} />
          <Scrawl at={S.s2 + 1.0} end={S.s2 + 2.2} x={540} y={1150} text="mom's song." size={70} colour={GOLD} />
          <Scrawl at={S.s2 + 2.25} end={S.s1 - 0.05} x={540} y={1180} text="in every fight." size={70} colour={MARK} />

          <Header n={1} at={S.s1} title={"IT'S NOT|THE END"} y={0.08} />
          <Classified t={t} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-secrets.wav")} />
    </AbsoluteFill>
  );
};

/** the Mash's parts, where they are on the frozen frame, and where their labels go */
const MASH: [number, number, number, number, string, "left" | "center" | "right"][] = [
  [500, 880, 330, 520, "mimic queen", "center"],
  [960, 790, 860, 470, "bone wyrm", "center"],
  [170, 1180, 190, 1450, "thornback", "center"],
  [760, 1120, 850, 1460, "toll queen", "center"],
];

/** the title: the count, then the words */
const Hook: React.FC<{ t: number }> = ({ t }) => {
  if (t > S.s5 + 0.1) return null;
  const o = 1 - smooth((t - (S.s5 - 0.12)) / 0.12);
  const u = t - 0.05;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.32, opacity: o }}>
      <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 112, lineHeight: 1.0, color: "#fff", textAlign: "center", transform: `scale(${(0.5 + 0.5 * backOut(u / 0.25)).toFixed(3)})`, textShadow: "0 8px 0 rgba(0,0,0,0.6), 0 0 30px rgba(0,0,0,0.8)" }}>
        <span style={{ color: GOLD }}>5</span> THINGS
        <br />
        YOU
      </div>
      <div style={{ marginTop: 4, fontFamily: MARKER, fontSize: 150, color: MARK, transform: `rotate(-5deg) scale(${(u > 0.35 ? 1 + 0.6 * Math.exp(-(u - 0.35) / 0.08) : 0).toFixed(3)})`, textShadow: "0 6px 0 rgba(0,0,0,0.7)" }}>
        MISSED
      </div>
      <div style={{ marginTop: 26, fontFamily: "Inter", fontWeight: 600, fontSize: 36, letterSpacing: "0.3em", paddingLeft: "0.3em", color: "#e8e8e8", opacity: smooth((u - 0.6) / 0.2) }}>IN THE THIRD DIRECTION</div>
    </AbsoluteFill>
  );
};

/** a section's number (big, outlined, slapped on) and what it is */
const Header: React.FC<{ n: number; at: number; title: string; y: number }> = ({ n, at, title, y }) => {
  const t = useCurrentFrame() / FPS;
  if (t < at || t > at + LEN) return null;
  const u = t - at;
  const o = 1 - smooth((t - (at + LEN - 0.12)) / 0.12);
  const lines = title.split("|");
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * y, opacity: o }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <div
          style={{
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 150,
            lineHeight: 1,
            color: GOLD,
            WebkitTextStroke: "5px #000",
            transform: `rotate(-7deg) scale(${(u > 0 ? 1 + 1.2 * Math.exp(-u / 0.08) : 0).toFixed(3)})`,
            textShadow: "8px 8px 0 rgba(0,0,0,0.75)",
          }}
        >
          #{n}
        </div>
        <div>
          {lines.map((ln, i) => (
            <div
              key={i}
              style={{
                fontFamily: "Inter",
                fontWeight: 800,
                fontSize: lines.join("").length > 26 ? 50 : 62,
                lineHeight: 1.08,
                color: "#fff",
                opacity: smooth((u - 0.12 - i * 0.1) / 0.12),
                transform: `translateX(${((1 - easeOut((u - 0.12 - i * 0.1) / 0.25)) * 60).toFixed(1)}px)`,
                textShadow: "0 5px 0 rgba(0,0,0,0.65), 0 0 20px rgba(0,0,0,0.8)",
                whiteSpace: "nowrap",
              }}
            >
              {ln}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** five lines, and her eight notes landing on it one by one as the music box plays them; then they burn red */
const Staff: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.s2 || t > S.s1) return null;
  const o = span(t, S.s2 + 0.15, S.s1 - 0.02, 0.2, 0.12);
  const x0 = 140;
  const x1 = 960;
  const yb = 860;
  const gap = 46;
  const battle = smooth((t - (S.s2 + 2.2)) / 0.15);
  const ink = battle > 0.5 ? RED : "#fff8e6";
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: o, filter: `drop-shadow(0 0 ${(10 + 20 * battle).toFixed(0)}px ${battle > 0.5 ? RED : GOLD}) drop-shadow(0 4px 0 rgba(0,0,0,0.7))` }}>
      <rect x={x0 - 40} y={yb - 4 * gap - 90} width={x1 - x0 + 80} height={4 * gap + 180} rx={20} fill="rgba(0,0,0,0.55)" />
      {[0, 1, 2, 3, 4].map((k) => (
        <line key={k} x1={x0} x2={x0 + (x1 - x0) * easeOut((t - S.s2 - 0.15 - k * 0.04) / 0.35)} y1={yb - k * gap} y2={yb - k * gap} stroke={ink} strokeWidth={4} />
      ))}
      {NOTES.map(([pos, dt], i) => {
        const u = t - (SONG_AT + dt);
        if (u < 0) return null;
        const x = x0 + 200 + i * 88;
        const y = yb - (pos * gap) / 2;
        const s = 1 + 0.8 * Math.exp(-u / 0.08);
        return (
          <g key={i} transform={`translate(${x} ${y}) scale(${s.toFixed(3)})`}>
            <ellipse cx={0} cy={0} rx={24} ry={17} transform="rotate(-20)" fill={ink} />
            <line x1={pos >= 6 ? -22 : 22} y1={0} x2={pos >= 6 ? -22 : 22} y2={pos >= 6 ? 120 : -120} stroke={ink} strokeWidth={5} />
          </g>
        );
      })}
      {NOTES.map(([pos, dt], i) => {
        const u = t - (SONG_AT + dt);
        if (u < 0 || u > 0.5) return null;
        return <circle key={`r${i}`} cx={x0 + 200 + i * 88} cy={yb - (pos * gap) / 2} r={24 + 90 * easeOut(u / 0.5)} fill="none" stroke={GOLD} strokeWidth={4} opacity={1 - u / 0.5} />;
      })}
    </svg>
  );
};

/** number one: what it is, blacked out, and stamped */
const Classified: React.FC<{ t: number }> = ({ t }) => {
  const at = S.s1 + 1.6;
  if (t < at || t > S.end) return null;
  const u = t - at;
  const text = "AFTER THE THIRD DIRECTION, THERE IS A";
  const n = Math.floor(u * 40);
  const stamp = u - 0.9;
  const o = 1 - smooth((t - (S.end - 0.15)) / 0.15);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.36, opacity: o }}>
      <div style={{ width: W * 0.86, fontFamily: TERM, fontSize: 90, lineHeight: 1.1, color: "#e8e8e8", textShadow: "0 0 14px rgba(255,255,255,0.3)" }}>
        {text.slice(0, n)}
        {n >= text.length ? (
          <>
            {" "}
            <span style={{ backgroundColor: "#000", color: "#000", border: "2px solid #333", padding: "0 12px" }}>FOURTH</span>{" "}
            {"DIRECTION."}
          </>
        ) : null}
      </div>
      {stamp > 0 ? (
        <div
          style={{
            marginTop: 60,
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: 108,
            letterSpacing: "0.08em",
            color: RED,
            border: `10px solid ${RED}`,
            padding: "6px 30px",
            transform: `rotate(-12deg) scale(${(1 + 1.6 * Math.exp(-stamp / 0.06)).toFixed(3)})`,
            opacity: 0.92,
            textShadow: "0 0 2px rgba(0,0,0,0.5)",
          }}
        >
          CLASSIFIED
        </div>
      ) : null}
      <div style={{ marginTop: 70, fontFamily: MARKER, fontSize: 62, color: GOLD, opacity: smooth((u - 1.4) / 0.15), transform: "rotate(-3deg)" }}>play to the end.</div>
    </AbsoluteFill>
  );
};
