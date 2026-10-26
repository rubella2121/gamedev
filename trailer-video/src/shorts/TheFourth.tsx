import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Flash, GlitchDefs, Look, useGlitch, useShake } from "../components/Effects";
import { Say } from "../components/Say";
import { Shot } from "../components/Shot";
import shorts from "../data/shorts.json";
import type { Cut } from "../edit";
import { GOLD, RED } from "../lib/colours";
import { TERM, useFonts } from "../lib/fonts";
import { FPS, H, W } from "../lib/time";
import { EndFourth } from "./ends";
import { span, Subtitle, Tape, Tesseract, Typed, useImpact } from "./kit";

const S = shorts.shorts["the-fourth"];
const VIOLET = "#b9a2ff";
const COLD = "brightness(1.12) contrast(1.18) saturate(1.05)";
const [f1, f2, f3, f4] = S.flashes as [number, number, number, number];

/**
 * IT'S NOT OVER - the ending, almost given away. It opens on a happy ending: the three of them, THE END, thank you for
 * playing. Then nothing moves. The moon goes out; where it was, something unfolds; in it an eye opens, and it speaks. Four
 * glimpses of where it takes them, a line typed on black, and its promise. Its end card's title is, for a frame here and there,
 * not the title it should be.
 */
export const CUTS: Cut[] = [
  { at: 0, end: S.freeze, clip: "reunion", from: 300, z: [1.0, 1.08], c: [0.5, 0.5] },
  // nothing moves
  { at: S.freeze, end: S.unfold, clip: "reunion", from: 300 + S.freeze * 30, rate: 0.02, z: [1.08, 1.16], c: [0.5, 0.5], in: "glitch", grade: "grayscale(0.9) brightness(0.85) contrast(1.2)" },
  // the moon goes out, and it unfolds where the moon was
  { at: S.unfold, end: S.eye, clip: "t-unfold", from: 35, rate: 1.1, z: [1.0, 1.1], c: [0.5, 0.4], in: "glitch", grade: COLD },
  // its eye
  { at: S.eye, end: f1, clip: "t-eye", from: 18, rate: 0.75, z: [1.0, 1.12], c: [0.5, 0.5], in: "iris", o: [0.5, 0.48], grade: COLD },
  // where it takes them: up into the tear; down onto the dial; the fight; it tearing its way out
  { at: f1, end: f2, clip: "t-lift", from: 95, in: "glitch", grade: COLD },
  { at: f2, end: f3, clip: "t-descend", from: 120, in: "glitch", grade: COLD },
  { at: f3, end: f4, clip: "fourth-fight", from: 60, z: [1.15, 1.15], in: "glitch", grade: COLD },
  { at: f4, end: S.found, clip: "flee", from: 250, in: "glitch", grade: COLD },
  // its promise
  { at: S.flee, end: S.black, clip: "flee", from: 300, z: [1.0, 1.08], c: [0.5, 0.45], in: "flash", grade: COLD },
];

export const TheFourth: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const shake = useShake([
    [S.freeze, 0.5],
    [S.foundYou, 1.1],
    [S.flee, 0.8],
    [S.end, 0.7],
  ]);
  const tear = useGlitch([S.freeze, S.unfold, S.unfold + 1.6, ...S.flashes, S.found, S.foundYou, S.black, S.end + 2.3, S.end + 2.95]);
  const impact = useImpact([f1, f2, f3, f4, S.foundYou]);
  const tape = t < S.freeze ? 0 : t < S.end ? 1 : 0.5;
  // the colour goes out of the world when it comes
  const violet = span(t, S.unfold, S.black, 0.6, 0.2);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={Math.max(tear, impact ? 0.6 : 0)} />
      <AbsoluteFill style={{ transform: shake, filter: [tear > 0.02 ? "url(#tear)" : "", impact ?? ""].join(" ").trim() || undefined }}>
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
        <AbsoluteFill style={{ mixBlendMode: "soft-light", opacity: 0.75 * violet, background: "linear-gradient(180deg, rgba(120,80,255,0.9), rgba(40,10,90,0.6))" }} />
        {/* on black: its shape */}
        {t >= S.found && t < S.flee ? <Tesseract T={t - S.found + 2} cx={W / 2} cy={H * 0.36} size={W * 0.22} colour={VIOLET} grow={Math.min(1, (t - S.found) / 0.6)} eye={span(t, S.foundYou, S.flee, 0.25, 0.1)} /> : null}
        {ready ? <EndFourth at={S.end} fade={S.fadeOut} colour={VIOLET} /> : null}
        <Look />
        {tape > 0 ? <Tape k={tape} /> : null}
      </AbsoluteFill>
      <Flash hits={[[S.freeze, 0.5], [S.eye, 0.4], ...S.flashes.map((a) => [a, 0.5] as [number, number]), [S.flee, 0.9], [S.end, 0.6]]} />
      {ready ? (
        <>
          <Opening t={t} />
          <Typed at={S.freeze + 0.15} end={S.unfold - 0.05} text="and then nothing moves." y={0.62} size={84} colour="#cfeee8" cps={24} />
          <Subtitle at={S.meant} end={f1 - 0.05} who="THE FOURTH" text="You were never meant to leave." colour={VIOLET} />
          <Typed at={S.found + 0.15} end={S.foundYou - 0.05} text={"YOU FOUND THE\nTHIRD DIRECTION."} y={0.6} size={104} colour="#7ff4ea" cps={30} />
          <Say words={[{ at: S.foundYou, end: S.flee - 0.04, text: "SOMETHING|FOUND YOU.", hot: ["FOUND", "YOU."], hue: RED, y: 0.58, style: "slam" }]} />
          <Subtitle at={S.back} end={S.black - 0.1} who="THE FOURTH" text="I will come back." colour={VIOLET} />
        </>
      ) : null}
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-the-fourth.wav")} />
    </AbsoluteFill>
  );
};

/** the happy ending it opens on: a spoiler warning, THE END, thank you for playing; frozen, and shaking, when time stops */
const Opening: React.FC<{ t: number }> = ({ t }) => {
  if (t > S.unfold + 0.05) return null;
  const frozen = t >= S.freeze;
  const f = Math.floor(t * FPS);
  const jit = frozen ? ((f * 7919) % 13) - 6 : 0;
  const blink = Math.floor(t * 3) % 2 === 0;
  return (
    <>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.075, opacity: span(t, 0.08, S.freeze, 0.1, 0.05) }}>
        <div style={{ fontFamily: TERM, fontSize: 54, color: "#fff", backgroundColor: blink ? "#d2192e" : "rgba(210,25,46,0.75)", padding: "4px 22px", letterSpacing: "0.12em" }}>⚠ ENDING SPOILER</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 30%, rgba(0,0,0,0) 45%)", opacity: span(t, 0, S.unfold, 0.01, 0.12) }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.15, opacity: span(t, 0.3, S.unfold, 0.6, 0.12), transform: `translateX(${jit}px)` }}>
        <div
          style={{
            fontFamily: "Cinzel",
            fontWeight: 700,
            fontSize: 124,
            letterSpacing: "0.3em",
            paddingLeft: "0.3em",
            color: frozen ? "#d8d8d8" : "#fff1d0",
            textShadow: frozen ? "-5px 0 0 rgba(255,40,80,0.7), 5px 0 0 rgba(60,200,255,0.7)" : `0 0 30px ${GOLD}, 0 4px 0 rgba(0,0,0,0.8)`,
          }}
        >
          THE END
        </div>
        <div style={{ marginTop: 20, fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 50, color: frozen ? "#bbbbbb" : "#f6efe2", opacity: span(t, 0.9, S.unfold, 0.5, 0.1), textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>
          thank you for playing
        </div>
      </AbsoluteFill>
    </>
  );
};
