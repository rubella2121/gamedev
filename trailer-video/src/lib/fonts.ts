import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/cinzel/900.css";
import "@fontsource/cormorant-garamond/600-italic.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/permanent-marker/400.css";
import "@fontsource/press-start-2p/400.css";
import "@fontsource/vt323/400.css";
import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { ITALIC, SANS, SERIF } from "../components/Words";

/** the shorts' display faces: an arcade's pixels, a terminal's, a poster's, a marker pen (a name with a part that starts with
 * a digit has to be quoted in CSS) */
export const PIXEL = '"Press Start 2P"';
export const TERM = "VT323";
export const POSTER = "Bebas Neue";
export const MARKER = "Permanent Marker";

/**
 * Wait for the type before the first frame is taken (a frame drawn in a fallback font would flicker), and only then draw the
 * words: their sizes are measured in the real fonts.
 */
export const useFonts = () => {
  const [handle] = useState(() => delayRender("fonts"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const faces = [`400 40px ${SERIF}`, `700 40px ${SERIF}`, `900 40px ${SERIF}`, `italic 600 40px "${ITALIC}"`, `600 40px ${SANS}`, `800 40px ${SANS}`];
    faces.push(...[PIXEL, TERM, POSTER, MARKER].map((f) => `400 40px ${f.startsWith('"') ? f : `"${f}"`}`));
    const done = () => {
      setReady(true);
      continueRender(handle);
    };
    Promise.all(faces.map((f) => document.fonts.load(f))).then(done, done);
  }, [handle]);
  return ready;
};
