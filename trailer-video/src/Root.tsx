import { Composition } from "remotion";
import cues from "./data/cues.json";
import { H, W } from "./lib/time";
import { Promo } from "./Promo";
import { PROMOS } from "./promos";
import { Trailer } from "./Trailer";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Trailer" component={Trailer} durationInFrames={Math.round(cues.length * cues.fps)} fps={cues.fps} width={W} height={H} />
      {PROMOS.map((p) => (
        <Composition key={p.id} id={`promo-${p.id}`} component={Promo} defaultProps={{ id: p.id }} durationInFrames={Math.round(p.length * cues.fps)} fps={cues.fps} width={W} height={H} />
      ))}
    </>
  );
};
