import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Flash, Look, useShake } from "../components/Effects";
import { Shot } from "../components/Shot";
import lines from "../data/lines-wild.json";
import heard from "../data/lines-wild.voice.json";
import shorts from "../data/shorts.json";
import type { Cut } from "../edit";
import { GOLD, RED } from "../lib/colours";
import { useFonts } from "../lib/fonts";
import { backOut, easeOut, FPS, H, smooth, W } from "../lib/time";
import { span } from "./kit";

const S = shorts.shorts.wild;
const [moon, well, wellface, face, , moth, tele, xface, cage, stomp, fight] = S.shots as number[] as [number, number, number, number, number, number, number, number, number, number, number];

/**
 * WILDLIFE OF THE THIRD DIRECTION - a nature film of the Crater, narrated: night falling, the Moonwell, one of nature's smallest
 * creatures (the blob: small, soft, utterly defenceless) and its only friend, the moth. Then, on a long lens, what else lives
 * here: X, the Hollow, an apex predator, who has taken the blob's whole family. Most creatures would run. The blob does not.
 * Every shot is new: places and angles the game had never been filmed from.
 */
export const CUTS: Cut[] = [
  { at: moon, end: well, clip: "wild-moon", from: 0, z: [1.0, 1.03], in: "fade" },
  { at: well, end: wellface, clip: "wild-well", from: 30, z: [1.0, 1.03], in: "dissolve" },
  { at: wellface, end: face, clip: "wild-wellface", from: 6, z: [1.0, 1.04], in: "dissolve" },
  // the blob, slowed a little, as a nature film slows its animals
  { at: face, end: moth, clip: "wild-face", from: 0, rate: 0.75, z: [1.0, 1.05], in: "cut" },
  // the moth, over it, in its shield
  { at: moth, end: tele, clip: "wild-peek", from: 0, rate: 0.75, z: [1.0, 1.05], in: "dissolve" },
  // the music turns
  { at: tele, end: xface, clip: "wild-tele", from: 20, z: [1.0, 1.04], in: "cut" },
  { at: xface, end: cage, clip: "wild-xface", from: 2, rate: 0.75, z: [1.0, 1.06], in: "cut" },
  { at: cage, end: stomp, clip: "wild-cage", from: 2, rate: 0.9, z: [1.0, 1.04], in: "dissolve" },
  { at: stomp, end: fight, clip: "wild-stomp", from: 60, z: [1.0, 1.05], in: "cut" },
  { at: fight, end: S.end, clip: "wild-fight", from: 30, z: [1.0, 1.06], in: "cut" },
];

/** the field guide's cards: (from, to, name, its Latin, what is known of it, accent) */
const CARDS: [number, number, string, string, string, string][] = [
  [face + 0.15, moth - 0.3, "THE BLOB", "Gelatus minimus", "Length 0.4 m  ·  Courage: immeasurable", GOLD],
  [moth + 0.25, tele - 0.3, "THE MOTH", "Lepidoptera fidelis", "Bodyguard  ·  Unpaid", "#bfe9ff"],
  [xface + 0.2, cage - 0.2, "X, THE HOLLOW", "Predator maximus", "Height 14 m  ·  Diet: families", RED],
];

export const Wild: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const shake = useShake([[S.doesNot, 0.7]]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: shake }}>
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
        <Look />
        {/* the darkness under the words */}
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 46%, rgba(0,0,0,0.5) 72%, rgba(0,0,0,0.25) 100%)", opacity: t < S.end ? 1 : 0 }} />
      </AbsoluteFill>
      <Flash hits={[[S.doesNot, 0.55]]} />
      {ready ? (
        <>
          <Series t={t} />
          <Where t={t} />
          {CARDS.map(([a, e, name, latin, facts, accent], i) => (
            <Species key={i} t={t} at={a} end={e} name={name} latin={latin} facts={facts} accent={accent} />
          ))}
          <End t={t} />
          <Subtitles t={t} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-wild.wav")} />
    </AbsoluteFill>
  );
};

/** the series' title, over the moon */
const Series: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, 0.25, well - 0.15, 0.6, 0.35);
  if (k <= 0) return null;
  const u = t - 0.25;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.36, opacity: k }}>
      <div style={{ fontFamily: "Cinzel", fontWeight: 400, fontSize: 104, letterSpacing: `${(0.34 + 0.1 * (1 - easeOut(u / 2.5))).toFixed(3)}em`, paddingLeft: "0.34em", color: "#f6f1e6", textShadow: "0 4px 24px rgba(0,0,0,0.8)" }}>WILDLIFE</div>
      <div style={{ marginTop: 10, fontFamily: "Inter", fontWeight: 600, fontSize: 30, letterSpacing: "0.5em", paddingLeft: "0.5em", color: "#e9e3d6", textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>OF THE THIRD DIRECTION</div>
      <div style={{ marginTop: 34, width: (W * 0.3 * easeOut((u - 0.3) / 0.8)) | 0, height: 1, backgroundColor: "rgba(246,241,230,0.7)" }} />
      <div style={{ marginTop: 22, fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 40, color: "#e9e3d6", opacity: smooth((u - 0.6) / 0.5), textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>Episode one: The Crater</div>
    </AbsoluteFill>
  );
};

/** where, and when: typed into the corner, as the film's own record */
const Where: React.FC<{ t: number }> = ({ t }) => {
  const at = well + 0.25;
  const k = span(t, at, face - 0.2, 0.15, 0.3);
  if (k <= 0) return null;
  const text = "THE CRATER  ·  THE MOONWELL  ·  02:14";
  const n = Math.floor((t - at) * 34);
  return (
    <div style={{ position: "absolute", left: 64, top: H * 0.115, opacity: k, fontFamily: "Inter", fontWeight: 600, fontSize: 26, letterSpacing: "0.22em", color: "#e9e3d6", textShadow: "0 2px 10px rgba(0,0,0,0.9)" }}>
      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, backgroundColor: "#ff4a4a", marginRight: 16, verticalAlign: "middle", opacity: Math.floor(t * 2) % 2 ? 0.4 : 1 }} />
      {text.slice(0, n)}
    </div>
  );
};

/** a field guide's card for each creature: its name, its Latin, and what is known */
const Species: React.FC<{ t: number; at: number; end: number; name: string; latin: string; facts: string; accent: string }> = ({ t, at, end, name, latin, facts, accent }) => {
  const k = span(t, at, end, 0.2, 0.3);
  if (k <= 0) return null;
  const u = t - at;
  const line = easeOut(u / 0.5);
  return (
    <div style={{ position: "absolute", left: 0, top: H * 0.5, opacity: k }}>
      <div style={{ position: "absolute", left: 0, top: -30, width: W * 0.9, height: 300, background: "linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.35) 60%, rgba(0,0,0,0))" }} />
      <div style={{ position: "relative", marginLeft: 64 }}>
      <div style={{ width: (420 * line) | 0, height: 3, backgroundColor: accent, boxShadow: `0 0 12px ${accent}` }} />
      <div style={{ marginTop: 16, fontFamily: "Cinzel", fontWeight: 700, fontSize: 58, letterSpacing: "0.06em", color: "#fff", transform: `translateX(${(-30 * (1 - easeOut(u / 0.4))).toFixed(1)}px)`, opacity: smooth((u - 0.05) / 0.3), textShadow: "0 3px 14px rgba(0,0,0,0.9)" }}>{name}</div>
      <div style={{ marginTop: 2, fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 42, color: "#e9e3d6", opacity: smooth((u - 0.25) / 0.3), textShadow: "0 2px 10px rgba(0,0,0,0.9)" }}>{latin}</div>
      <div style={{ marginTop: 10, fontFamily: "Inter", fontWeight: 600, fontSize: 26, letterSpacing: "0.08em", color: accent, opacity: smooth((u - 0.5) / 0.3), textShadow: "0 2px 10px rgba(0,0,0,0.95)" }}>{facts}</div>
      </div>
    </div>
  );
};

/** the narration, word for word, for everyone watching with the sound off */
const Subtitles: React.FC<{ t: number }> = ({ t }) => {
  const cur = heard.find((h) => t >= h.at - 0.05 && t < h.at + h.dur + 0.25);
  if (!cur) return null;
  const caption = lines.find((l) => l.id === cur.id)?.caption ?? "";
  const k = span(t, cur.at - 0.05, cur.at + cur.dur + 0.25, 0.12, 0.15);
  const onEnd = t >= S.end;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * (onEnd ? 0.3 : 0.695), opacity: k }}>
      <div style={{ maxWidth: W * 0.86, textAlign: "center", fontFamily: onEnd ? "Cormorant Garamond" : "Inter", fontStyle: onEnd ? "italic" : "normal", fontWeight: 600, fontSize: onEnd ? 64 : 46, lineHeight: 1.3, color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.9), 0 0 18px rgba(0,0,0,0.85)" }}>
        {caption}
      </div>
    </AbsoluteFill>
  );
};

/** the end: the film's title, the game's, and where to play it */
const End: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.end, S.fadeOut + 0.6, 0.5, 0.6);
  if (k <= 0) return null;
  const u = t - S.end;
  const pulse = 1 + 0.03 * Math.max(0, Math.sin(u * Math.PI * 2.2));
  return (
    <AbsoluteFill style={{ opacity: k, alignItems: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 40% at 50% 46%, rgba(40,80,90,0.5), rgba(0,0,0,0) 70%)" }} />
      <div style={{ position: "absolute", top: H * 0.42, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 26, letterSpacing: "0.42em", paddingLeft: "0.42em", color: "#bfb8aa", opacity: smooth((u - 0.4) / 0.5) }}>WILDLIFE OF</div>
        <div style={{ marginTop: 14, fontFamily: "Cinzel", fontWeight: 700, fontSize: 70, letterSpacing: "0.05em", color: "#fff1d0", whiteSpace: "nowrap", transform: `scale(${(0.9 + 0.1 * backOut((u - 0.5) / 0.6)).toFixed(3)})`, opacity: smooth((u - 0.5) / 0.4), textShadow: `0 0 26px ${GOLD}66, 0 4px 0 rgba(0,0,0,0.85)` }}>
          THE THIRD DIRECTION
        </div>
        <div style={{ marginTop: 44, fontFamily: "Inter", fontWeight: 800, fontSize: 38, letterSpacing: "0.18em", paddingLeft: "0.18em", color: "#06181a", backgroundColor: "#9ff4ee", borderRadius: 60, padding: "20px 46px 20px 54px", opacity: smooth((u - 1.2) / 0.3), transform: `scale(${pulse.toFixed(3)})`, boxShadow: "0 0 30px rgba(159,244,238,0.45)" }}>
          PLAY FREE ON RUN
        </div>
        <div style={{ marginTop: 28, fontFamily: "Inter", fontWeight: 800, fontSize: 30, letterSpacing: "0.14em", color: "#ff9aac", opacity: smooth((u - 1.6) / 0.3) }}>♥ VOTE · RUN OCTOBER JAM</div>
      </div>
    </AbsoluteFill>
  );
};
