import { Composition } from "remotion";
import cues from "./data/cues.json";
import shorts from "./data/shorts.json";
import { H, W } from "./lib/time";
import { Promo } from "./Promo";
import { PROMOS } from "./promos";
import { Cartridge } from "./shorts/Cartridge";
import { Fighter } from "./shorts/Fighter";
import { Live } from "./shorts/Live";
import { Lullaby } from "./shorts/Lullaby";
import { Phonk } from "./shorts/Phonk";
import { Secrets } from "./shorts/Secrets";
import { TheFourth } from "./shorts/TheFourth";
import { Trailer } from "./Trailer";

/** the shorts: each its own format, look and sound (src/shorts/) */
const SHORTS: [keyof typeof shorts.shorts, React.FC][] = [
  ["the-fourth", TheFourth],
  ["fighter", Fighter],
  ["secrets", Secrets],
  ["phonk", Phonk],
  ["lullaby", Lullaby],
  ["cartridge", Cartridge],
  ["live", Live],
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Trailer" component={Trailer} durationInFrames={Math.round(cues.length * cues.fps)} fps={cues.fps} width={W} height={H} />
      {PROMOS.map((p) => (
        <Composition key={p.id} id={`promo-${p.id}`} component={Promo} defaultProps={{ id: p.id }} durationInFrames={Math.round(p.length * cues.fps)} fps={cues.fps} width={W} height={H} />
      ))}
      {SHORTS.map(([id, C]) => (
        <Composition key={id} id={`short-${id}`} component={C} durationInFrames={Math.round(shorts.shorts[id].length * shorts.fps)} fps={shorts.fps} width={W} height={H} />
      ))}
    </>
  );
};
