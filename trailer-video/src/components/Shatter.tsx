import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame } from "remotion";
import cues from "../data/cues.json";
import { easeOut, FPS, H, rand, smooth, W } from "../lib/time";

/**
 * The boom, as the game does it: the flat forest bursts into blocks, and the blocks fly out of the screen at you, turning, in
 * real perspective, while behind them the world is suddenly deep. The last 2D frame (public/stills/boom.png) is cut into a
 * grid; each block leaves when the crack reaches it, nearest the tear first.
 */
const COLS = 12;
const ROWS = 21;
const TW = W / COLS;
const TH = H / ROWS;
const OX = 0.5 * W;
const OY = 0.32 * H;
const LIFE = 1.15;

export const Shatter: React.FC<{ at?: number }> = ({ at = cues.boom }) => {
  const t = useCurrentFrame() / FPS - at;
  if (t < -0.01 || t > LIFE + 0.5) return null;
  const tiles: React.ReactNode[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const x = c * TW;
      const y = r * TH;
      const mx = x + TW / 2 - OX;
      const my = y + TH / 2 - OY;
      const dist = Math.hypot(mx / W, my / H);
      const delay = 0.32 * dist + 0.05 * rand(i);
      const u = Math.max(0, (t - delay) / (LIFE - delay * 0.5));
      if (u >= 1) continue;
      const e = easeOut(u);
      const dz = 2600 * Math.pow(u, 1.7) * (0.6 + 0.8 * rand(i + 3));
      const dx = mx * 1.6 * e + (rand(i + 7) - 0.5) * 260 * e;
      const dy = my * 1.3 * e + (rand(i + 11) - 0.5) * 260 * e + 180 * u * u;
      const rx = (rand(i + 13) - 0.5) * 720 * e;
      const ry = (rand(i + 17) - 0.5) * 720 * e;
      const op = u < 0.55 ? 1 : 1 - smooth((u - 0.55) / 0.45);
      // the edge of each block catches the light as it turns
      const lit = 0.35 * Math.abs(Math.sin((rx * Math.PI) / 180));
      tiles.push(
        <div
          key={i}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: TW + 1,
            height: TH + 1,
            backgroundImage: `url(${staticFile("stills/boom.png")})`,
            backgroundSize: `${W}px ${H}px`,
            backgroundPosition: `${-x}px ${-y}px`,
            imageRendering: "pixelated",
            transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, ${dz.toFixed(1)}px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg)`,
            opacity: op,
            boxShadow: u > 0 ? `inset 0 0 0 1px rgba(200,255,250,${(0.25 + lit).toFixed(2)})` : undefined,
            filter: "brightness(1.2) contrast(1.1) saturate(1.25)",
          }}
        />,
      );
    }
  }
  return (
    <AbsoluteFill style={{ perspective: 1100, perspectiveOrigin: `${(OX / W) * 100}% ${(OY / H) * 100}%`, overflow: "hidden" }}>
      <AbsoluteFill style={{ transformStyle: "preserve-3d" }}>{tiles}</AbsoluteFill>
      {/* the light pouring through the crack as it opens */}
      <AbsoluteFill
        style={{
          mixBlendMode: "screen",
          opacity: Math.max(0, 1 - t / 0.9),
          background: `radial-gradient(ellipse ${20 + 120 * smooth(t / 0.7)}% ${12 + 80 * smooth(t / 0.7)}% at 50% 32%, rgba(220,255,250,0.95), rgba(120,220,230,0.35) 40%, rgba(0,0,0,0) 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};
