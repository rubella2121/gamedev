import { Composition } from "remotion";
import cues from "./data/cues.json";
import { H, W } from "./lib/time";
import { Trailer } from "./Trailer";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition id="Trailer" component={Trailer} durationInFrames={Math.round(cues.length * cues.fps)} fps={cues.fps} width={W} height={H} />
  );
};
