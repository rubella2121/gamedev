import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from "remotion";
import type { Cut } from "../edit";
import { clamp, easeInOut, F, FPS, H, lerp, smooth, W } from "../lib/time";

/** how long a dissolve, a whip and a fade take (seconds) */
const DISSOLVE = 0.36;
const WHIP = 0.14;
const FADE = 0.7;

const overlapIn = (c: Cut) => (c.in === "dissolve" ? DISSOLVE / 2 : c.in === "whip" ? WHIP : 0);

/**
 * One shot of footage. It starts a little early (and runs a little late) when the cut into or out of it is a dissolve or a
 * whip, so the two shots overlap; the later one is drawn on top.
 */
export const Shot: React.FC<{ cut: Cut; next?: Cut }> = ({ cut, next }) => {
  const pre = overlapIn(cut);
  const post = next && Math.abs(next.at - cut.end) < 1e-6 ? overlapIn(next) : 0;
  const t0 = cut.at - pre;
  const dur = cut.end + post - t0;
  const rate = cut.rate ?? 1;
  // the clip's frame at the start of the sequence (the clips are 30 frames a second, like the trailer)
  const trim = Math.max(0, Math.round(cut.from - pre * FPS * rate));
  return (
    <Sequence from={F(t0)} durationInFrames={Math.max(1, F(dur))} layout="none">
      <ShotBody cut={cut} next={next} t0={t0} trim={trim} rate={rate} post={post} />
    </Sequence>
  );
};

const ShotBody: React.FC<{ cut: Cut; next?: Cut; t0: number; trim: number; rate: number; post: number }> = ({ cut, next, t0, trim, rate, post }) => {
  const frame = useCurrentFrame();
  const t = t0 + frame / FPS;
  const u = clamp((t - cut.at) / (cut.end - cut.at));
  // framing: a slow push (or pull), kept centred on the shot's point of interest, never showing past the picture's edge
  const [z0, z1] = cut.z ?? [1.0, 1.05];
  const [cx, cy] = cut.c ?? [0.5, 0.5];
  let z = lerp(z0, z1, easeInOut(u));
  // a hit punches in and settles
  if (cut.in === "flash" && t > cut.at) z += 0.09 * Math.exp(-(t - cut.at) / 0.16);
  const tx = clamp(W / 2 - z * cx * W, W - z * W, 0);
  const ty = clamp(H / 2 - z * cy * H, H - z * H, 0);

  // how it comes in, and how it goes out
  let opacity = 1;
  let shift = 0;
  let blur = 0;
  if (cut.in === "dissolve") opacity = smooth((t - (cut.at - DISSOLVE / 2)) / DISSOLVE);
  if (cut.in === "fade") opacity = smooth((t - cut.at) / FADE);
  if (cut.in === "whip" && t < cut.at + WHIP) {
    const k = 1 - smooth((t - (cut.at - WHIP)) / (2 * WHIP));
    shift = W * 0.42 * k;
    blur = 34 * k;
    opacity = smooth((t - (cut.at - WHIP)) / WHIP);
  }
  if (next?.in === "whip" && post > 0 && t > cut.end - WHIP) {
    const k = smooth((t - (cut.end - WHIP)) / (2 * WHIP));
    shift = -W * 0.42 * k;
    blur = 34 * k;
  }
  const dark = cut.dark ? cut.dark * smooth((t - (cut.end - 1.15)) / 1.0) : 0;
  const grade = cut.pixel ? "brightness(1.22) contrast(1.1) saturate(1.28)" : "brightness(1.13) contrast(1.1) saturate(1.16)";

  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translateX(${shift}px)`, filter: blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : undefined }}>
        <OffthreadVideo
          src={staticFile(`clips/${cut.clip}.mp4`)}
          trimBefore={trim}
          playbackRate={rate}
          muted
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
            transformOrigin: "0 0",
            transform: `translate(${tx}px, ${ty}px) scale(${z})`,
            imageRendering: cut.pixel ? "pixelated" : "auto",
            filter: grade,
          }}
        />
      </AbsoluteFill>
      {dark > 0 ? <AbsoluteFill style={{ backgroundColor: "black", opacity: dark }} /> : null}
    </AbsoluteFill>
  );
};
