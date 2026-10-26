import cues from "../data/cues.json";

export const FPS = cues.fps;
export const W = 1080;
export const H = 1920;

/** seconds to frames */
export const F = (s: number) => Math.round(s * FPS);

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (x: number) => {
  const u = clamp(x);
  return u * u * (3 - 2 * u);
};
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
export const easeInOut = (x: number) => {
  const u = clamp(x);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
};
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** an ease that runs a little past 1 and comes back: a bounce on arrival */
export const backOut = (x: number) => {
  const u = clamp(x) - 1;
  return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
};

/** a number from 0 to 1 that is always the same for the same seed */
export const rand = (seed: number) => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** 1 inside [t0, t1], easing in over `fin` and out over `fout` (seconds) */
export const env = (t: number, t0: number, t1: number, fin: number, fout: number) =>
  t < t0 || t > t1 ? 0 : smooth((t - t0) / fin) * smooth((t1 - t) / fout);
