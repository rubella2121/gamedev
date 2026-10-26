import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import cues from "./data/cues.json";
import { CUTS } from "./edit";
import { Flash, GlitchDefs, Leaks, Look, useGlitch, useShake } from "./components/Effects";
import { Shatter } from "./components/Shatter";
import { Shot } from "./components/Shot";
import { Title } from "./components/Title";
import { Captions, Card, Names } from "./components/Words";
import { useFonts } from "./lib/fonts";
import { FPS } from "./lib/time";

/**
 * THE THIRD DIRECTION - the trailer.
 * The footage is the real game (captured frame by frame), cut to the cue sheet the orchestra, the game's sound design and the
 * Mother's voice are built on; over it the boom, the names, her words and the title. Then the grade, the light and the grain.
 */
export const Trailer: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shake = useShake();
  const tear = useGlitch();
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill style={{ transform: shake, filter: tear > 0.02 ? "url(#tear)" : undefined }}>
        {CUTS.map((c, i) => (
          <Shot key={i} cut={c} next={CUTS[i + 1]} />
        ))}
        <Shatter />
        {ready ? <Title /> : null}
        <Leaks />
        <Look />
      </AbsoluteFill>
      <Flash />
      {ready ? (
        <>
          <Names />
          <Card at={cues.boom + 0.85} end={cues.reveal - 0.25} lines={["THERE IS A", "THIRD DIRECTION"]} />
          <Captions />
        </>
      ) : null}
      {/* the very end: black */}
      {t > cues.stingOut ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/mix.wav")} />
    </AbsoluteFill>
  );
};
