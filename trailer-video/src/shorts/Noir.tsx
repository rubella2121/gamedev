import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { useShake } from "../components/Effects";
import LINES from "../data/lines-noir.json";
import VOICE from "../data/lines-noir.voice.json";
import shorts from "../data/shorts.json";
import { COMIC, TYPE, useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip } from "./kit";

const S = shorts.shorts.noir;
const PAPER = "#ebe3cf";
const INK = "#0b0b0d";
const RED = "#e0262e";
const YELLOW = "#ffd21f";
const CAP = "#f4e4a6";

/**
 * NOIR - the game as a hardboiled comic book, read by its narrator. The cover (THE THIRD DIRECTION No. 1, "Night of the
 * Missing Family": X black against the moon, the blob in a fedora under a streetlamp) gets a NOW ON CRAZYGAMES sticker slapped
 * on it, and opens. Page one, panel by panel: the forest at midnight, the blob ("Name's Blob. Small. Round. Glows in the
 * dark."), the family photo torn in half, three red eyes. Page two: the five guardians slam in, each with its sound in letters.
 * "So I did what nobody does. I looked up." - the camera tilts up off the page into the rain, the sky cracks, the paper tears
 * open, and behind it the world is in colour and has depth: the Collector and the Mash in panels turning in 3D. Then the
 * splash page: X, inked, his eyes the only red. FOUND YOU. The back cover: out now on CrazyGames.
 * The game's footage is inked by scripts/make.sh (posterised, its edges drawn, only the reds kept): public/clips/noir-*.mp4.
 */

type Rect = [number, number, number, number];
type Cam = { z: number; cx: number; cy: number };

const star = (n: number, r1: number, r2: number, seed: number, sx = 1) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = (i % 2 ? r2 : r1) * (0.86 + 0.28 * rand(seed + i * 3));
    return `${(Math.cos(a) * r * sx).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");

export const Noir: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const shake = useShake([
    [S.sticker, 0.6],
    ...S.guardians.map((g) => [g, 0.35] as [number, number]),
    [S.tear, 1.0],
    [S.color[0]!, 0.4],
    [S.color[1]!, 0.4],
    [S.splash, 0.6],
    [S.found, 0.8],
    [S.end + 0.4, 0.6],
  ]);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <AbsoluteFill style={{ transform: shake === "none" ? undefined : shake }}>
        {t >= S.up - 0.1 && t < S.tear + 0.8 ? <Sky t={t} /> : null}
        {t >= S.turn - 0.1 && t < S.up + 1.9 ? <Page2 t={t} ready={ready} frame={frame} /> : null}
        {t >= S.flip - 0.1 && t < S.turn + 0.6 ? <Page1 t={t} ready={ready} frame={frame} /> : null}
        {t < S.flip + 0.55 ? <Cover t={t} ready={ready} frame={frame} /> : null}
        {t >= S.tear && t < S.splash + 0.05 ? <Colour t={t} /> : null}
        {t >= S.tear - 0.1 && t < S.tear + 0.8 ? <Tear t={t} /> : null}
        {t >= S.splash && t < S.end + 0.1 ? <Splash t={t} ready={ready} frame={frame} /> : null}
        {t >= S.end ? <End t={t} ready={ready} frame={frame} /> : null}
        {ready ? <Narration t={t} /> : null}
        <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, mixBlendMode: "overlay", opacity: 0.2 }} />
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 65% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)" }} />
      </AbsoluteFill>
      <Lightning t={t} />
      {t > S.fadeOut ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: smooth((t - S.fadeOut) / (S.length - 0.05 - S.fadeOut)) }} /> : null}
      <Audio src={staticFile("audio/short-noir.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the printed look */

/** rain: white streaks falling a little sideways */
const Rain: React.FC<{ t: number; n?: number; k?: number; seed?: number; w?: number; h?: number }> = ({ t, n = 70, k = 1, seed = 1, w = W, h = H }) => (
  <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
    {Array.from({ length: n }, (_, i) => {
      const sp = 1700 + 900 * rand(i * 3 + seed);
      const len = 40 + 90 * rand(i * 5 + seed);
      const y = ((rand(i * 11 + seed) * (h + 300) + t * sp) % (h + 300)) - 150;
      const x = rand(i * 7 + seed) * (w + 400) - 100 - y * 0.2;
      return (
        <line key={i} x1={x} y1={y} x2={x + len * 0.2} y2={y - len} stroke="#fff" strokeWidth={1.5 + 1.5 * rand(i + seed)} strokeOpacity={(0.22 + 0.4 * rand(i * 13 + seed)) * k} strokeLinecap="round" />
      );
    })}
  </svg>
);

/** the dots of a cheap print */
const Dots: React.FC<{ o?: number; size?: number; color?: string; blend?: React.CSSProperties["mixBlendMode"] }> = ({ o = 0.2, size = 9, color = "0,0,0", blend = "multiply" }) => (
  <AbsoluteFill style={{ backgroundImage: `radial-gradient(circle, rgba(${color},1) 27%, rgba(${color},0) 33%)`, backgroundSize: `${size}px ${size}px`, mixBlendMode: blend, opacity: o, pointerEvents: "none" }} />
);

const Paper: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{ background: PAPER }}>
    <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ width: W, height: H, mixBlendMode: "multiply", opacity: 0.35 }} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 55%, rgba(80,60,25,0.28) 100%)" }} />
  </AbsoluteFill>
);

/** a panel: its art inside a heavy ink border */
const Panel: React.FC<{ r: Rect; bg?: string; children?: React.ReactNode; style?: React.CSSProperties }> = ({ r, bg = INK, children, style }) => (
  <div style={{ position: "absolute", left: r[0], top: r[1], width: r[2], height: r[3], overflow: "hidden", background: bg, outline: `8px solid ${INK}`, ...style }}>{children}</div>
);

/** a sound, lettered: a burst behind it, the letters with a thick ink line, slammed on */
const Bang: React.FC<{ t: number; at: number; text: string; x: number; y: number; size: number; fill?: string; burst?: string; rot?: number; sx?: number }> = ({
  t,
  at,
  text,
  x,
  y,
  size,
  fill = "#fff",
  burst,
  rot = -6,
  sx = 1.5,
}) => {
  const d = t - at;
  if (d < 0) return null;
  const sc = 0.3 + 0.7 * backOut(clamp(d / 0.22));
  const j = d < 0.35 ? (rand(Math.floor(t * 30)) - 0.5) * 12 : 0;
  const wob = 1 + 0.03 * Math.sin(t * 9);
  const rw = size * 0.29 * text.length;
  return (
    <svg width={1600} height={900} style={{ position: "absolute", left: x - 800, top: y - 450, overflow: "visible", pointerEvents: "none" }}>
      <g transform={`translate(${800 + j} 450) rotate(${rot}) scale(${(sc * wob).toFixed(3)})`}>
        {burst ? (
          <>
            <polygon points={star(13, rw * 0.62 + size * 0.5, rw * 0.45 + size * 0.32, at * 10, sx)} transform="translate(12 14)" fill={INK} />
            <polygon points={star(13, rw * 0.62 + size * 0.5, rw * 0.45 + size * 0.32, at * 10, sx)} fill={burst} stroke={INK} strokeWidth={8} strokeLinejoin="round" />
          </>
        ) : null}
        <text x={10} y={12} textAnchor="middle" dominantBaseline="central" fontFamily={COMIC} fontSize={size} letterSpacing={4} fill={INK} stroke={INK} strokeWidth={size * 0.12} strokeLinejoin="round">
          {text}
        </text>
        <text textAnchor="middle" dominantBaseline="central" fontFamily={COMIC} fontSize={size} letterSpacing={4} fill={fill} stroke={INK} strokeWidth={size * 0.1} strokeLinejoin="round" paintOrder="stroke">
          {text}
        </text>
      </g>
    </svg>
  );
};

/** the yellow starburst of a sticker slapped on a cover: NOW ON CRAZYGAMES */
const Sticker: React.FC<{ t: number; at: number; x: number; y: number; s?: number; ready: boolean }> = ({ t, at, x, y, s = 1, ready }) => {
  const d = t - at;
  if (d < 0 || !ready) return null;
  const sc = s * (1 + 1.3 * (1 - easeOut(d / 0.17)));
  const pts = star(18, 300, 232, 7, 1.46);
  return (
    <svg width={1000} height={800} style={{ position: "absolute", left: x - 500, top: y - 400, overflow: "visible", opacity: clamp(d / 0.04) }}>
      <g transform={`translate(500 400) rotate(-9) scale(${sc.toFixed(3)})`}>
        <polygon points={pts} transform="translate(14 16)" fill={INK} />
        <polygon points={pts} fill={YELLOW} stroke={INK} strokeWidth={10} strokeLinejoin="round" />
        <text y={-78} textAnchor="middle" dominantBaseline="central" fontFamily={COMIC} fontSize={88} letterSpacing={6} fill={INK}>
          NOW ON
        </text>
        <text y={34} textAnchor="middle" dominantBaseline="central" fontFamily={COMIC} fontSize={112} letterSpacing={3} fill="#7b2ff7" stroke={INK} strokeWidth={10} strokeLinejoin="round" paintOrder="stroke">
          CRAZYGAMES
        </text>
        <text y={128} textAnchor="middle" dominantBaseline="central" fontFamily={COMIC} fontSize={54} letterSpacing={5} fill={INK}>
          FREE TO PLAY!
        </text>
      </g>
    </svg>
  );
};

/** lightning: the whole picture goes white twice */
const Lightning: React.FC<{ t: number }> = ({ t }) => {
  let o = 0;
  for (const at of S.thunder) {
    const d = t - at;
    if (d < 0 || d > 0.5) continue;
    o = Math.max(o, d < 0.04 ? 0.85 : d < 0.12 ? 0.12 : d < 0.18 ? 0.65 : 0.65 * (1 - smooth((d - 0.18) / 0.3)));
  }
  return o > 0.01 ? <AbsoluteFill style={{ backgroundColor: "#f4f6ff", opacity: o, mixBlendMode: "screen" }} /> : null;
};

/** the blob, in a fedora: the only warm thing in town */
const NoirBlob: React.FC<{ x: number; y: number; k: number; t: number }> = ({ x, y, k, t }) => {
  const w = 26 * k;
  const h = 20 * k;
  const bob = Math.sin(t * 2.2) * 0.03 * h;
  return (
    <div style={{ position: "absolute", left: x - w / 2, top: y - h + bob, width: w, height: h }}>
      <Img src={staticFile("noir/blob.png")} style={{ width: w, height: h, imageRendering: "pixelated", filter: `drop-shadow(0 0 ${(0.9 * k).toFixed(0)}px rgba(255,205,80,0.75))` }} />
      <svg viewBox="0 0 100 50" width={w * 0.92} height={w * 0.46} style={{ position: "absolute", left: w * 0.06, top: -w * 0.25, transform: "rotate(-9deg)", overflow: "visible" }}>
        <ellipse cx="50" cy="38" rx="50" ry="9" fill="#141416" stroke="#000" strokeWidth="2" />
        <path d="M24,38 C22,14 32,5 50,5 C68,5 78,14 76,38 Z" fill="#1d1d21" stroke="#000" strokeWidth="2" />
        <path d="M37,11 C45,16 55,16 63,11" stroke="#3b3b42" strokeWidth="3" fill="none" />
        <rect x="24" y="27" width="52" height="8" fill="#7a1418" />
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ the cover */

const Cover: React.FC<{ t: number; ready: boolean; frame: number }> = ({ t, ready, frame }) => {
  const flip = easeInOut((t - S.flip) / 0.5);
  const push = 1 + 0.035 * clamp(t / S.flip);
  const flare = S.thunder.some((a) => t - a > 0 && t - a < 0.6) ? 1.8 : 1;
  const XW = 860;
  const XH = XW * (1042 / 582);
  const xl = 70;
  const xt = 330;
  const eyes: [number, number][] = [
    [0.4, 0.167],
    [0.49, 0.136],
    [0.58, 0.167],
  ];
  return (
    <AbsoluteFill style={{ perspective: 2600 }}>
      <AbsoluteFill style={{ transformOrigin: "0% 50%", transform: `rotateY(${(-110 * flip).toFixed(2)}deg) scale(${push.toFixed(4)})`, backfaceVisibility: "hidden" }}>
        <Paper frame={frame} />
        <Panel r={[40, 40, 1000, 1840]} bg="radial-gradient(circle at 50% 33%, #34343c 0%, #121216 45%, #050506 80%)">
          {/* the moon, and X against it */}
          <div style={{ position: "absolute", left: 500 - 310, top: 640 - 310, width: 620, height: 620, borderRadius: "50%", background: "radial-gradient(circle at 42% 40%, #ffffff 0%, #e9e9ee 55%, #b9bac4 100%)", boxShadow: "0 0 120px rgba(230,230,255,0.35)" }} />
          <Img src={staticFile("noir/x-hd.png")} style={{ position: "absolute", left: xl, top: xt, width: XW, height: XH, filter: "brightness(0)" }} />
          {eyes.map(([ex, ey], i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: xl + ex * XW - 15,
                top: xt + ey * XH - 15,
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "radial-gradient(circle, #fff 0%, #ff4040 35%, #b00010 70%)",
                boxShadow: `0 0 ${(30 * flare).toFixed(0)}px ${(10 * flare).toFixed(0)}px rgba(255,30,40,0.8)`,
                opacity: 0.85 + 0.15 * Math.sin(t * 7 + i),
              }}
            />
          ))}
          {/* the street: a lamp, its light, the blob under it */}
          <svg width={1000} height={1840} style={{ position: "absolute", left: 0, top: 0 }}>
            <defs>
              <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fffbe8" stopOpacity="0.55" />
                <stop offset="1" stopColor="#fffbe8" stopOpacity="0.05" />
              </linearGradient>
            </defs>
            <polygon points="215,1100 265,1100 560,1660 -60,1660" fill="url(#cone)" />
            <rect x="120" y="1060" width="16" height="640" fill={INK} />
            <path d="M128,1070 C128,1040 170,1030 240,1060" stroke={INK} strokeWidth="12" fill="none" />
            <path d="M205,1060 L275,1060 L262,1100 L218,1100 Z" fill={INK} />
            <ellipse cx="240" cy="1102" rx="22" ry="7" fill="#fffbe8" />
            <rect x="0" y="1640" width="1000" height="200" fill="#050506" />
            <ellipse cx="300" cy="1652" rx="240" ry="16" fill="#fffbe8" opacity="0.18" />
          </svg>
          <NoirBlob x={300} y={1645} k={8} t={t} />
          <Rain t={t} n={80} w={1000} h={1840} />
          <Dots o={0.16} />
          {ready ? (
            <>
              <div style={{ position: "absolute", left: 30, top: 28, padding: "6px 14px", background: PAPER, border: `5px solid ${INK}`, fontFamily: COMIC, fontSize: 40, lineHeight: 1, color: INK, textAlign: "center" }}>
                No.1
                <div style={{ fontSize: 30, color: RED }}>FREE</div>
              </div>
              <div style={{ position: "absolute", left: 0, right: 0, top: 30, textAlign: "center", fontFamily: COMIC, color: "#fff", lineHeight: 0.86, WebkitTextStroke: `6px ${INK}`, textShadow: `10px 10px 0 ${RED}` }}>
                <div style={{ fontSize: 150, letterSpacing: 6 }}>THE THIRD</div>
                <div style={{ fontSize: 196, letterSpacing: 4 }}>DIRECTION</div>
              </div>
              <div style={{ position: "absolute", left: -10, right: -10, top: 1690, height: 120, background: RED, borderTop: `6px solid ${INK}`, borderBottom: `6px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: COMIC, fontSize: 82, letterSpacing: 4, color: "#fff", WebkitTextStroke: `3px ${INK}`, transform: "rotate(-2deg)" }}>
                NIGHT OF THE MISSING FAMILY
              </div>
            </>
          ) : null}
        </Panel>
        <Sticker t={t} at={S.sticker} x={705} y={1110} s={0.8} ready={ready} />
        <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.35), rgba(0,0,0,0) 4%)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ page one */

const P1: Rect = [36, 36, 1008, 520];
const P2: Rect = [36, 580, 600, 700];
const P3: Rect = [660, 580, 384, 700];
const P4: Rect = [36, 1304, 1008, 580];
const FULL: Cam = { z: 1, cx: W / 2, cy: H / 2 };
const at = (r: Rect, z: number, dx = 0): Cam => ({ z, cx: r[0] + r[2] / 2 + dx, cy: r[1] + r[3] / 2 });
const KEYS1: { t: number; c: Cam; d: number }[] = [
  { t: 0, c: FULL, d: 0.1 },
  { t: S.panels[0]!, c: at(P1, 1.95, -230), d: 0.45 },
  { t: S.panels[0]! + 0.45, c: at(P1, 1.95, 200), d: 0.4 },
  { t: S.panels[1]!, c: at(P2, 1.62), d: 0.45 },
  { t: S.panels[2]!, c: at(P3, 2.15), d: 0.45 },
  { t: S.panels[3]!, c: at(P4, 1.62), d: 0.45 },
  { t: S.turn - 0.45, c: FULL, d: 0.4 },
];

const camAt = (t: number, keys: { t: number; c: Cam; d: number }[]): Cam => {
  let cur = keys[0]!.c;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i]!;
    if (t < k.t) break;
    const end = keys[i + 1]?.t ?? Infinity;
    const u = easeInOut((Math.min(t, end) - k.t) / k.d);
    cur = { z: cur.z + (k.c.z - cur.z) * u, cx: cur.cx + (k.c.cx - cur.cx) * u, cy: cur.cy + (k.c.cy - cur.cy) * u };
  }
  return cur;
};

const camStyle = (c: Cam): React.CSSProperties => ({
  transformOrigin: "0 0",
  transform: `translate(${(W / 2 - c.cx * c.z).toFixed(1)}px, ${(H / 2 - c.cy * c.z).toFixed(1)}px) scale(${c.z.toFixed(4)})`,
});

/** a caption inside a panel, typed on */
const Typed: React.FC<{ t: number; at: number; text: string; x: number; y: number; size?: number; cps?: number }> = ({ t, at: t0, text, x, y, size = 30, cps = 26 }) => {
  if (t < t0) return null;
  const n = Math.floor((t - t0) * cps);
  return (
    <div style={{ position: "absolute", left: x, top: y, background: CAP, border: `4px solid ${INK}`, padding: "8px 14px", fontFamily: TYPE, fontSize: size, color: INK, lineHeight: 1.2 }}>
      {text.slice(0, n)}
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </div>
  );
};

const Page1: React.FC<{ t: number; ready: boolean; frame: number }> = ({ t, ready, frame }) => {
  const cam = camAt(t, KEYS1);
  const turn = easeInOut((t - S.turn) / 0.5);
  const tear = clamp((t - (S.panels[2]! + 0.7)) / 0.25);
  const eyes = easeOut((t - (S.panels[3]! + 0.25)) / 0.2);
  return (
    <AbsoluteFill style={{ perspective: 2600 }}>
      <AbsoluteFill style={{ transformOrigin: "0% 50%", transform: `rotateY(${(-110 * turn).toFixed(2)}deg)`, backfaceVisibility: "hidden" }}>
        <AbsoluteFill style={camStyle(cam)}>
          <Paper frame={frame} />
          {/* the forest at midnight */}
          <Panel r={P1}>
            <Clip clip="noir-wild-moon" at={S.flip - 0.1} from={0} dur={S.turn - S.flip + 0.8} box={[0, 0, P1[2], P1[3]]} z={1.0} c={[0.55, 0.22]} rate={0.4} filter="contrast(1.05)" />
            <Rain t={t} n={60} w={P1[2]} h={P1[3]} seed={3} />
            <Dots o={0.14} />
            {ready ? <Typed t={t} at={S.panels[0]! + 0.1} text="THE FOREST. MIDNIGHT. RAINING AGAIN." x={24} y={22} /> : null}
          </Panel>
          {/* the blob, under the lamp */}
          <Panel r={P2} bg="radial-gradient(ellipse at 30% 10%, #2c2c33 0%, #0c0c0f 60%)">
            <svg width={P2[2]} height={P2[3]} style={{ position: "absolute", left: 0, top: 0 }}>
              <polygon points="150,60 200,60 520,640 -120,640" fill="#fffbe8" opacity="0.2" />
              <rect x="90" y="40" width="14" height="660" fill={INK} />
              <path d="M97,48 C97,24 140,18 178,50" stroke={INK} strokeWidth="10" fill="none" />
              <path d="M150,50 L205,50 L196,72 L160,72 Z" fill={INK} />
              <ellipse cx="178" cy="73" rx="16" ry="5" fill="#fffbe8" />
              <rect x="0" y="600" width={P2[2]} height="100" fill="#060607" />
            </svg>
            <NoirBlob x={330} y={606} k={13} t={t} />
            <div style={{ position: "absolute", left: 330 - 169, top: 612, width: 338, height: 90, transform: "scaleY(-1)", opacity: 0.25, filter: "blur(3px)", overflow: "hidden" }}>
              <Img src={staticFile("noir/blob.png")} style={{ position: "absolute", left: 0, top: 0, width: 338, height: 260, imageRendering: "pixelated" }} />
            </div>
            <Rain t={t} n={50} w={P2[2]} h={P2[3]} seed={5} />
            <Dots o={0.12} />
          </Panel>
          {/* the family photograph, torn in two */}
          <Panel r={P3} bg="radial-gradient(ellipse at 50% 45%, #3a342c 0%, #121110 70%)">
            {[0, 1].map((half) => (
              <div
                key={half}
                style={{
                  position: "absolute",
                  left: 42,
                  top: 170,
                  width: 300,
                  height: 360,
                  clipPath: half ? "polygon(52% 0, 100% 0, 100% 100%, 47% 100%, 55% 80%, 46% 62%, 56% 44%, 48% 26%, 55% 12%)" : "polygon(0 0, 52% 0, 55% 12%, 48% 26%, 56% 44%, 46% 62%, 55% 80%, 47% 100%, 0 100%)",
                  transform: `translateX(${((half ? 26 : -26) * tear).toFixed(1)}px) rotate(${((half ? 7 : -5) * tear + 3).toFixed(2)}deg)`,
                }}
              >
                <div style={{ position: "absolute", inset: 0, background: "#f2efe6", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }} />
                <div style={{ position: "absolute", left: 18, top: 18, width: 264, height: 264, background: "#8d8d8d", overflow: "hidden" }}>
                  <Img src={staticFile("noir/mother.png")} style={{ position: "absolute", left: 8, top: 120, width: 128, height: 100, imageRendering: "pixelated", filter: "grayscale(1) contrast(1.2)" }} />
                  <Img src={staticFile("noir/father.png")} style={{ position: "absolute", left: 132, top: 106, width: 126, height: 98, imageRendering: "pixelated", filter: "grayscale(1) contrast(1.2)" }} />
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 50, background: "#5f5f5f" }} />
                </div>
              </div>
            ))}
            {ready && tear > 0 ? (
              <div style={{ position: "absolute", left: 30, top: 300, padding: "4px 14px", border: `6px solid ${RED}`, color: RED, fontFamily: COMIC, fontSize: 70, letterSpacing: 6, transform: `rotate(-16deg) scale(${(1.6 - 0.6 * easeOut(tear)).toFixed(3)})`, opacity: 0.9 * clamp(tear * 3), mixBlendMode: "multiply" }}>
                MISSING
              </div>
            ) : null}
            <Dots o={0.14} />
          </Panel>
          {/* three eyes, in the dark */}
          <Panel r={P4}>
            <Img src={staticFile("noir/x-eyes.png")} style={{ position: "absolute", left: (P4[2] - 585) / 2, top: (P4[3] - 144) / 2, width: 585, height: 144, imageRendering: "pixelated", transform: `scaleY(${Math.max(0.03, eyes).toFixed(3)})`, filter: "drop-shadow(0 0 26px rgba(255,30,40,0.95))" }} />
            <Rain t={t} n={50} w={P4[2]} h={P4[3]} seed={9} k={0.7} />
            <Dots o={0.12} />
          </Panel>
          {ready ? <Bang t={t} at={S.panels[2]! + 0.7} text="RRRIP!" x={P3[0] + 200} y={P3[1] + 600} size={84} rot={8} /> : null}
        </AbsoluteFill>
        <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.3), rgba(0,0,0,0) 5%)", opacity: turn > 0 ? 1 : 0 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ page two: the guardians */

const ROWS = (() => {
  const Y = (k: number) => 36 + (k * 1848) / 5;
  const d = [0, 34, -34, 34, -34, 0];
  const g = 12;
  return [0, 1, 2, 3, 4].map((i) => {
    const pts: [number, number][] = [
      [36, Y(i) + d[i]! + g],
      [1044, Y(i) - d[i]! + g],
      [1044, Y(i + 1) - d[i + 1]! - g],
      [36, Y(i + 1) + d[i + 1]! - g],
    ];
    const top = Math.min(pts[0]![1], pts[1]![1]);
    const bottom = Math.max(pts[2]![1], pts[3]![1]);
    return { pts, box: [36, top, 1008, bottom - top] as Rect };
  });
})();

const GUARDIANS: { clip: string; name: string; z: number; c: [number, number]; rate: number; sfx: string; fill: string; burst?: string }[] = [
  { clip: "noir-f-gloom", name: "THE GLOOMMOTHER", z: 1.25, c: [0.55, 0.15], rate: 0.45, sfx: "SHHHHH...", fill: "#fff" },
  { clip: "noir-f-thicket", name: "THE THORNBACK KING", z: 1.35, c: [0.55, 0.3], rate: 0.5, sfx: "KRAKK!", fill: "#fff", burst: RED },
  { clip: "noir-f-marsh", name: "THE TOLL QUEEN", z: 1.25, c: [0.5, 0.2], rate: 0.55, sfx: "DONNNG!", fill: INK, burst: "#f2f2f2" },
  { clip: "noir-f-bones", name: "THE BONE WYRM", z: 1.35, c: [0.42, 0.7], rate: 0.22, sfx: "SKREEEE!", fill: "#fff" },
  { clip: "noir-f-meadow", name: "THE MIMIC QUEEN", z: 1.3, c: [0.47, 0.13], rate: 0.75, sfx: "HA! HA! HA!", fill: RED },
];

const Page2: React.FC<{ t: number; ready: boolean; frame: number }> = ({ t, ready, frame }) => {
  const up = easeInOut((t - (S.up + 0.1)) / 1.7) ** 1.3;
  const last = S.guardians.filter((g) => t >= g).length - 1;
  const focus = last >= 0 ? ROWS[last]!.box : null;
  const push = 1 + 0.025 * clamp((t - S.turn) / 6);
  const cy = focus ? H / 2 + (focus[1] + focus[3] / 2 - H / 2) * 0.06 : H / 2;
  return (
    <AbsoluteFill style={{ transform: `translateY(${(up * 2100).toFixed(1)}px)` }}>
      <AbsoluteFill style={{ transformOrigin: `50% ${cy.toFixed(0)}px`, transform: `scale(${push.toFixed(4)})` }}>
        <Paper frame={frame} />
        {ROWS.map((row, i) => {
          const g = S.guardians[i]!;
          const G = GUARDIANS[i]!;
          const d = t - g;
          if (d < -0.05) return <svg key={i} width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}><polygon points={row.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="rgba(11,11,13,0.18)" strokeWidth={4} strokeDasharray="14 12" /></svg>;
          const k = easeOut(d / 0.16);
          const side = i % 2 ? 1 : -1;
          const [bx, by, bw, bh] = row.box;
          return (
            <div key={i} style={{ position: "absolute", inset: 0, transform: `translateX(${(side * 1100 * (1 - k)).toFixed(1)}px) rotate(${(side * 4 * (1 - k)).toFixed(2)}deg)` }}>
              <div style={{ position: "absolute", inset: 0, clipPath: `polygon(${row.pts.map(([x, y]) => `${x}px ${y}px`).join(",")})`, background: INK }}>
                <Clip clip={G.clip} at={g - 0.1} from={0} dur={S.up + 2.0 - g} box={[bx, by, bw, bh]} z={G.z} c={G.c} rate={G.rate} pixel filter="contrast(1.05)" />
                <Dots o={0.12} />
              </div>
              <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
                <polygon points={row.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={INK} strokeWidth={9} strokeLinejoin="round" />
              </svg>
              {ready ? (
                <div style={{ position: "absolute", left: i % 2 ? undefined : 60, right: i % 2 ? 60 : undefined, top: by + bh - 92, background: CAP, border: `4px solid ${INK}`, padding: "6px 14px", fontFamily: TYPE, fontSize: 32, color: INK }}>
                  {G.name}
                </div>
              ) : null}
            </div>
          );
        })}
        {ready
          ? GUARDIANS.map((G, i) => {
              const [, by, , bh] = ROWS[i]!.box;
              return <Bang key={i} t={t} at={S.guardians[i]! + 0.08} text={G.sfx} x={i % 2 ? 330 : 760} y={by + bh * 0.42} size={i === 4 ? 92 : 112} fill={G.fill} burst={G.burst} rot={i % 2 ? -8 : 7} />;
            })
          : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ looking up; the tear */

/** above the page: the night, the rain coming down at us, and (when it cracks) a line of colour */
const Sky: React.FC<{ t: number }> = ({ t }) => {
  const up = easeInOut((t - (S.up + 0.1)) / 1.7);
  const crack = clamp((t - S.crack) / 0.55);
  return (
    <AbsoluteFill style={{ transform: `translateY(${(-500 * (1 - up)).toFixed(1)}px)` }}>
      <SkyArt t={t} crack={crack} />
    </AbsoluteFill>
  );
};

const CRACK: [number, number][] = Array.from({ length: 26 }, (_, i) => [540 + (i === 0 || i === 25 ? 0 : (rand(i * 7 + 3) - 0.5) * 120), -10 + i * 78]);

const SkyArt: React.FC<{ t: number; crack: number }> = ({ t, crack }) => {
  const len = crack * CRACK.length;
  const pts = CRACK.slice(0, Math.max(0, Math.ceil(len)));
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 20%, #26262d 0%, #0e0e12 55%, #050506 100%)" }}>
      <div style={{ position: "absolute", left: 540 - 230, top: 260, width: 460, height: 460, borderRadius: "50%", background: "radial-gradient(circle at 45% 40%, #fff, #d9d9e0 60%, #9fa0aa)", boxShadow: "0 0 140px rgba(230,230,255,0.3)" }} />
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: rand(i * 5) * 900 - 200, top: 150 + rand(i * 9) * 900, width: 500 + 300 * rand(i), height: 120 + 60 * rand(i + 2), borderRadius: "50%", background: "#141418", filter: "blur(6px)", opacity: 0.9, transform: `translateX(${(Math.sin(t * 0.4 + i) * 30).toFixed(1)}px)` }} />
      ))}
      <Rain t={t} n={120} seed={13} k={1.2} />
      {pts.length > 1 ? (
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
          <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#ff5fd2" strokeWidth={26} opacity={0.5} style={{ filter: "blur(10px)" }} />
          <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#5ff3ff" strokeWidth={12} opacity={0.8} style={{ filter: "blur(3px)" }} />
          <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff" strokeWidth={5} />
        </svg>
      ) : null}
      <Dots o={0.1} />
    </AbsoluteFill>
  );
};

/** the paper tears down the crack and the two halves are pulled apart */
const Tear: React.FC<{ t: number }> = ({ t }) => {
  const u = easeInOut((t - S.tear) / 0.6);
  if (t < S.tear) return null;
  const left = `polygon(-200px -200px, ${CRACK.map(([x, y]) => `${x}px ${y}px`).join(", ")}, -200px ${H + 200}px)`;
  const right = `polygon(${W + 200}px -200px, ${CRACK.map(([x, y]) => `${x}px ${y}px`).join(", ")}, ${W + 200}px ${H + 200}px)`;
  return (
    <AbsoluteFill>
      {[left, right].map((cp, i) => (
        <AbsoluteFill key={i} style={{ transform: `translateX(${((i ? 1 : -1) * 900 * u).toFixed(1)}px) rotate(${((i ? 1 : -1) * 10 * u).toFixed(2)}deg)`, transformOrigin: i ? "100% 100%" : "0% 100%" }}>
          <AbsoluteFill style={{ clipPath: cp }}>
            <SkyArt t={t} crack={0} />
          </AbsoluteFill>
          <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <polyline points={CRACK.map(([x, y]) => `${x + (i ? 4 : -4)},${y}`).join(" ")} fill="none" stroke={PAPER} strokeWidth={14} strokeLinejoin="bevel" />
          </svg>
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the colour behind the page */

const Colour: React.FC<{ t: number }> = ({ t }) => {
  const u = t - S.tear;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #3a0d7a 0%, #b0177a 45%, #0d6a8a 100%)", perspective: 1800 }}>
      <Dots o={0.35} size={34} color="255,220,60" blend="screen" />
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: W / 2, top: 960, width: 1600, height: 70, transformOrigin: "0 50%", transform: `rotate(${(i * 22.5 + u * 12).toFixed(1)}deg)`, background: "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 80%)" }} />
      ))}
      <FloatPanel t={t} at={S.color[0]!} cy={560} clip="collector-0" from={30} c={[0.42, 0.2]} z={1.45} side={-1} sfx="KLANK!" fill={YELLOW} burst={RED} />
      <FloatPanel t={t} at={S.color[1]!} cy={1330} clip="mash-3" from={60} c={[0.4, 0.17]} z={1.4} side={1} sfx="RRAAWR!" fill="#fff" burst="#ff2fa8" />
    </AbsoluteFill>
  );
};

const FloatPanel: React.FC<{ t: number; at: number; cy: number; clip: string; from: number; c: [number, number]; z: number; side: number; sfx: string; fill: string; burst: string }> = ({ t, at: t0, cy, clip, from, c, z, side, sfx, fill, burst }) => {
  const d = t - t0;
  if (d < 0) return null;
  const k = backOut(clamp(d / 0.45));
  const ry = side * (34 - 20 * clamp(d / 3)) + Math.sin(t * 1.3) * 3;
  const pw = 900;
  const ph = 640;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: W / 2 - pw / 2,
          top: cy - ph / 2,
          width: pw,
          height: ph,
          transformStyle: "preserve-3d",
          transform: `translateZ(${(-1400 * (1 - k)).toFixed(0)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${(-side * 7).toFixed(1)}deg) rotateZ(${(side * 3).toFixed(1)}deg)`,
          opacity: clamp(d / 0.1),
        }}
      >
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: INK, border: `12px solid ${INK}`, boxShadow: "0 40px 80px rgba(0,0,0,0.55)" }}>
          <Clip clip={clip} at={t0 - 0.1} from={from} dur={S.splash - t0 + 0.3} box={[0, 0, pw - 24, ph - 24]} z={z} c={c} rate={0.8} />
        </div>
      </div>
      <Bang t={t} at={t0 + 0.2} text={sfx} x={W / 2 + side * 250} y={cy + (side < 0 ? 250 : -260)} size={120} fill={fill} burst={burst} rot={side * 8} />
    </>
  );
};

/* ------------------------------------------------------------------------------------------------ the splash page: X */

const Splash: React.FC<{ t: number; ready: boolean; frame: number }> = ({ t, ready, frame }) => {
  const u = t - S.splash;
  const push = 1 + 0.07 * clamp(u / 5);
  const inn = easeOut(u / 0.25);
  const out = smooth((t - (S.end - 0.15)) / 0.25);
  const fd = t - S.found;
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <Paper frame={frame} />
      <Panel r={[36, 36, 1008, 1848]} style={{ transform: `scale(${(1.15 - 0.15 * inn).toFixed(4)})` }}>
        <AbsoluteFill style={{ transform: `scale(${push.toFixed(4)})`, transformOrigin: "50% 30%" }}>
          <Clip clip="noir-x-gaze" at={S.splash - 0.1} from={0} dur={S.end - S.splash + 0.3} box={[0, 0, 1008, 1848]} z={1.45} c={[0.5, 0.2]} filter="contrast(1.08)" />
        </AbsoluteFill>
        <Rain t={t} n={90} w={1008} h={1848} seed={17} />
        <Dots o={0.14} />
      </Panel>
      {ready && fd >= 0 ? (
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          <g transform={`translate(560 1240) scale(${(0.4 + 0.6 * backOut(clamp(fd / 0.25))).toFixed(3)})`}>
            <polygon points={star(16, 330, 250, 41, 1.15)} transform="translate(10 12)" fill="#000" />
            <polygon points={star(16, 330, 250, 41, 1.15)} fill={INK} stroke="#fff" strokeWidth={8} strokeLinejoin="round" />
            <path d="M-60,-230 L-150,-470 L40,-245 Z" fill={INK} stroke="#fff" strokeWidth={8} strokeLinejoin="round" />
            <text textAnchor="middle" dominantBaseline="central" fontFamily={COMIC} fontSize={150} letterSpacing={6} fill={RED} stroke="#000" strokeWidth={6} paintOrder="stroke">
              FOUND YOU.
            </text>
          </g>
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the back cover */

const End: React.FC<{ t: number; ready: boolean; frame: number }> = ({ t, ready, frame }) => {
  const u = t - S.end;
  const inn = smooth(u / 0.35);
  const logo = easeOut(u / 0.7);
  const line = (a: number) => ({ opacity: clamp((u - a) / 0.25), transform: `translateY(${((1 - easeOut((u - a) / 0.4)) * 26).toFixed(1)}px)` });
  return (
    <AbsoluteFill style={{ opacity: inn }}>
      <Paper frame={frame} />
      <Panel r={[36, 36, 1008, 1848]} bg="radial-gradient(ellipse at 50% 30%, #23232a 0%, #0c0c0f 60%, #050506 100%)">
        <Rain t={t} n={60} w={1008} h={1848} seed={23} k={0.6} />
        <Img src={staticFile("noir/logo.png")} style={{ position: "absolute", left: 504 - 470, top: 70 + (1 - logo) * 40, width: 940, height: 940 * (1900 / 2400), opacity: logo }} />
        {ready ? (
          <>
            <div style={{ position: "absolute", left: 0, right: 0, top: 1420, textAlign: "center", fontFamily: COMIC, fontSize: 104, letterSpacing: 6, color: "#fff", WebkitTextStroke: `4px ${INK}`, textShadow: `8px 8px 0 ${RED}`, ...line(0.9) }}>
              PLAY FREE · LINK IN BIO
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 1580, display: "flex", justifyContent: "center", ...line(1.3) }}>
              <div style={{ background: CAP, border: `5px solid ${INK}`, boxShadow: `8px 8px 0 #000`, padding: "12px 26px", fontFamily: TYPE, fontSize: 44, color: INK, transform: "rotate(-1.5deg)" }}>CASE FILE No.1: STILL OPEN.</div>
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: 1735, textAlign: "center", fontFamily: TYPE, fontSize: 36, color: "rgba(255,255,255,0.8)", letterSpacing: 2, ...line(1.8) }}>TO BE CONTINUED… BY YOU.</div>
          </>
        ) : null}
        <Dots o={0.12} />
      </Panel>
      <Sticker t={t} at={S.end + 0.4} x={540} y={1160} s={0.95} ready={ready} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the narrator */

const POS: Record<string, React.CSSProperties> = {
  n1: { top: 690, left: 70, right: 430 },
  n5: { bottom: 130 },
  n6: { bottom: 130 },
  n9: { bottom: 150 },
  n10: { bottom: 150 },
};

/** his words, in the yellow boxes of a comic's narration, typed as he says them */
const Narration: React.FC<{ t: number }> = ({ t }) => {
  const v = VOICE.find((x) => t >= x.at - 0.1 && t < x.at + x.dur + 0.5);
  if (!v || v.id === "n11") return null;
  const ln = LINES.find((l) => l.id === v.id)!;
  const o = clamp((t - (v.at - 0.1)) / 0.1) * (1 - smooth((t - (v.at + v.dur + 0.3)) / 0.2));
  const text = ln.caption.toUpperCase();
  const n = Math.floor(Math.max(0, t - v.at + 0.05) * Math.max(24, text.length / (v.dur * 0.8)));
  const pos = POS[v.id] ?? { top: 110 };
  return (
    <div style={{ position: "absolute", left: 60, right: 60, display: "flex", justifyContent: "center", opacity: o, ...pos }}>
      <div style={{ background: CAP, border: `5px solid ${INK}`, boxShadow: `9px 9px 0 ${INK}`, padding: "16px 24px", fontFamily: TYPE, fontSize: 46, lineHeight: 1.22, color: INK, transform: `rotate(${(rand(v.at * 10) - 0.5) * 3}deg)`, maxWidth: 920 }}>
        {text.slice(0, n)}
        <span style={{ opacity: 0 }}>{text.slice(n)}</span>
      </div>
    </div>
  );
};
