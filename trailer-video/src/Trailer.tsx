import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/cinzel/900.css";
import "@fontsource/cormorant-garamond/600-italic.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import cues from "./data/cues.json";
import { CUTS } from "./edit";
import { Flash, GlitchDefs, Leaks, Look, useGlitch, useShake } from "./components/Effects";
import { Shatter } from "./components/Shatter";
import { Shot } from "./components/Shot";
import { Title } from "./components/Title";
import { Captions, Card, ITALIC, Names, SANS, SERIF } from "./components/Words";
import { FPS } from "./lib/time";

/** wait for the type before the first frame is taken (a frame drawn in a fallback font would flicker) */
const useFonts = () => {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    const faces = [`400 40px ${SERIF}`, `700 40px ${SERIF}`, `900 40px ${SERIF}`, `italic 600 40px "${ITALIC}"`, `600 40px ${SANS}`, `800 40px ${SANS}`];
    Promise.all(faces.map((f) => document.fonts.load(f)))
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle]);
};

/**
 * THE THIRD DIRECTION - the trailer.
 * The footage is the real game (captured frame by frame), cut to the cue sheet the orchestra, the game's sound design and the
 * Mother's voice are built on; over it the boom, the names, her words and the title. Then the grade, the light and the grain.
 */
export const Trailer: React.FC = () => {
  useFonts();
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
        <Title />
        <Leaks />
        <Look />
      </AbsoluteFill>
      <Flash />
      <Names />
      <Card at={cues.boom + 0.85} end={cues.reveal - 0.25} lines={["THERE IS A", "THIRD DIRECTION"]} />
      <Captions />
      {/* the very end: black */}
      {t > cues.stingOut ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/mix.wav")} />
    </AbsoluteFill>
  );
};
