import React, { useMemo } from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Blocks, Flash, GlitchDefs, Leaks, Look, useGlitch, useShake } from "./components/Effects";
import { EndCard } from "./components/EndCard";
import { Rush } from "./components/Rush";
import { Say } from "./components/Say";
import { Shatter } from "./components/Shatter";
import { Shot } from "./components/Shot";
import { Captions, Card, Names } from "./components/Words";
import { useFonts } from "./lib/fonts";
import { FPS } from "./lib/time";
import { PROMOS } from "./promos";

/**
 * One promo (src/promos.ts): the footage with its cuts, the boom, the end card, the grade and the grain; over them the hits,
 * the names, the words and the tally; under it all, its own score (public/audio/promo-<id>.wav).
 * The cuts make their own hits: a flash cut flashes and shakes, a glitch tears, a zoom jolts.
 */
export const Promo: React.FC<{ id: string }> = ({ id }) => {
  const p = PROMOS.find((x) => x.id === id)!;
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const fx = useMemo(() => {
    const at = (k: string) => p.cuts.filter((c) => c.in === k).map((c) => c.at);
    return {
      flashes: [...at("flash").map((a) => [a, 0.9] as [number, number]), ...(p.boom !== undefined ? [[p.boom, 1] as [number, number]] : []), [p.end, 0.85] as [number, number], ...(p.flashes ?? [])],
      shakes: [
        ...at("flash").map((a) => [a, 0.55] as [number, number]),
        ...at("zoom").map((a) => [a, 0.4] as [number, number]),
        ...(p.boom !== undefined ? [[p.boom, 1.3] as [number, number]] : []),
        [p.end, 0.9] as [number, number],
        ...(p.shakes ?? []),
      ],
      tears: [...at("glitch"), ...(p.tears ?? [])],
      blocks: at("blocks"),
      leaks: [...(p.leaks ?? []), [p.end - 0.1, 2.6] as [number, number]],
    };
  }, [p]);
  const shake = useShake(fx.shakes);
  const tear = useGlitch(fx.tears);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill style={{ transform: shake, filter: tear > 0.02 ? "url(#tear)" : undefined }}>
        {/* black under everything, so the grade and the light blend with black where there is no footage */}
        <AbsoluteFill style={{ backgroundColor: "#000" }} />
        {p.cuts.map((c, i) => (
          <Shot key={i} cut={c} next={p.cuts[i + 1]} />
        ))}
        {p.boom !== undefined ? <Shatter at={p.boom} /> : null}
        <Blocks at={fx.blocks} />
        {ready ? <EndCard at={p.end} fade={p.fade} tag={p.tag} /> : null}
        <Leaks leaks={fx.leaks} />
        <Look />
      </AbsoluteFill>
      <Flash hits={fx.flashes} />
      {ready ? (
        <>
          <Names cuts={p.cuts} y={0.6} />
          {p.card ? <Card at={p.card[0]} end={p.card[1]} lines={["THERE IS A", "THIRD DIRECTION"]} y={p.card[2]} /> : null}
          <Say words={p.words} />
          <Captions subs={p.subs} y={0.66} />
          {p.rush ? <Rush {...p.rush} /> : null}
        </>
      ) : null}
      {t > p.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile(`audio/promo-${p.id}.wav`)} />
    </AbsoluteFill>
  );
};
