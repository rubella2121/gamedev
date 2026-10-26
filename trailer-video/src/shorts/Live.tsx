import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Flash, GlitchDefs, useGlitch, useShake } from "../components/Effects";
import shorts from "../data/shorts.json";
import { GOLD, RED } from "../lib/colours";
import { POSTER, useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip, span } from "./kit";

const S = shorts.shorts.live;
const [s1, s2, s3, s4, s5] = S.splits as [number, number, number, number, number];
const [k1, k2, k3] = S.bosses as [number, number, number];
const VIOLET = "#b9a2ff";
const GREEN = "#3ce07a";
const UI = "Inter";

/**
 * LIVE: WORLD RECORD ATTEMPT - a speedrun, streamed: the timer, the splits, the runner's camera, the chat. Five 2D guardians
 * fall in a blur; at the edge of the little world the stream's own picture cracks, and the game goes 3D and fills the frame;
 * the chat loses its mind. Three bosses, no hits, a new world record - and then a split nobody put there. The timer turns red,
 * something opens an eye, and the stream goes offline. The runner was last seen looking up. Next runner: you.
 */

/* the layout (pixels): the header, the game, the splits and the camera, the chat */
const GAME = { x: 0, y: 196, w: W, h: 930 };
const ROW = { y: 1138, h: 352 };
const SPLITS = { x: 18, w: 690 };
const CAM = { x: 720, w: 342 };
const CHAT = { y: 1502, h: 400 };

/* the run's clock: the video's seconds stand for a hundred of the game's */
const RATE = 100.37;
const clock = (t: number) => Math.max(0, (t - S.go) * RATE);
const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(2).padStart(5, "0")}`;
};
const RECORD = clock(S.wr) + 1.22;

/** each split: its name, when it falls, and how far ahead of the record (negative) or behind it is then */
const ROWS: [string, number, number][] = [
  ["GLOOMMOTHER", s1, -0.84],
  ["THORNBACK KING", s2, -1.31],
  ["TOLL QUEEN", s3, -2.07],
  ["BONE WYRM", s4, -1.62],
  ["MIMIC QUEEN", s5, -1.9],
  ["THE EDGE", k1, +0.41],
  ["THE COLLECTOR", k2, -0.27],
  ["THE MASH", k3, -0.66],
  ["X, THE HOLLOW", S.wr, -1.22],
];

/** what plays on the stream: (from, to, clip, its frame then, rate, zoom, centre, 2D) */
const FEED: [number, number, string, number, number, number, [number, number], boolean][] = [
  [0, S.go, "opening", 129, 0.05, 1.25, [0.5, 0.46], true],
  [S.go, s1, "g-gloom", 70, 2.2, 1.05, [0.5, 0.3], true],
  [s1, s2, "g-thicket", 60, 2.2, 1.05, [0.5, 0.33], true],
  [s2, s3, "g-marsh", 50, 2.2, 1.05, [0.5, 0.3], true],
  [s3, s4, "g-bones", 40, 2.2, 1.05, [0.55, 0.32], true],
  [s4, s5, "g-meadow", 40, 2.2, 1.05, [0.5, 0.3], true],
  [S.edge, S.edge + 0.3, "edge-stars", 7, 1.2, 1.3, [0.5, 0.3], true],
  [S.edge + 0.3, S.crack, "edge", 182, 1.0, 1.5, [0.5, 0.15], true],
  [S.crack, S.boom, "edge", 846, 1.0, 1.2, [0.5, 0.4], true],
  // it goes 3D, and it is the whole frame
  [S.boom, k1, "edge", 1092, 1.3, 1.0, [0.5, 0.5], false],
  [k1, k1 + 1.0, "collector-0", 40, 1.0, 1.05, [0.5, 0.45], false],
  [k1 + 1.0, k2, "c-collector", 10, 1.0, 1.1, [0.5, 0.45], false],
  [k2, k2 + 0.8, "mash-0", 80, 1.0, 1.05, [0.5, 0.45], false],
  [k2 + 0.8, k3, "c-mash", 20, 1.0, 1.1, [0.5, 0.42], false],
  [k3, k3 + 0.6, "c-x-hero", 20, 1.0, 1.0, [0.5, 0.5], false],
  [k3 + 0.6, k3 + 1.2, "x-jaws", 120, 1.0, 1.05, [0.5, 0.45], false],
  [k3 + 1.2, S.wr, "h-x-death", 60, 1.2, 1.0, [0.5, 0.45], false],
  // the run is done: the three of them
  [S.wr, S.extra, "reunion", 300, 0.7, 1.05, [0.5, 0.55], false],
  // and something else is
  [S.extra, S.offline, "t-eye", 50, 0.9, 1.2, [0.5, 0.56], false],
];

/** the chat: (when, who, their colour, what) */
type Msg = [number, string, string, string];
const NAMES: [string, string][] = [
  ["pixel_pete", "#7fd4ff"],
  ["mothwatcher", "#ffd77a"],
  ["sir_squishy", "#ff9ad5"],
  ["lil_lamp", "#ffb35a"],
  ["nightjar", "#9be38a"],
  ["cozy_gremlin", "#c8a6ff"],
  ["bell_ringer", "#ffe08a"],
  ["jamjudge", "#6ff0d8"],
  ["bonezone", "#f4efe0"],
  ["frogpond", "#7fe08a"],
  ["moonpie", "#a8c8ff"],
  ["slime_time", "#ffcf5a"],
];
const who = (i: number) => NAMES[i % NAMES.length]!;
const say = (at: number, i: number, text: string): Msg => [at, who(i)[0], who(i)[1], text];
const spam = (t0: number, step: number, lines: string[], seed: number): Msg[] => lines.map((l, i) => say(t0 + i * step, seed + i * 5, l));
const CHATLOG: Msg[] = [
  say(0.15, 0, "LETS GOOOO"),
  say(0.45, 7, "no-hit any% is actually insane"),
  say(0.8, 3, "first try??"),
  say(1.4, 1, "clean"),
  say(1.8, 4, "gloommother in 9 seconds LMAO"),
  say(2.45, 2, "he didn't even dodge"),
  say(2.9, 9, "skip skip skip"),
  say(3.55, 4, "thornback just got deleted"),
  say(3.95, 5, "the bosses are so cute"),
  say(4.4, 6, "THE TOLL QUEEN 😭"),
  say(4.85, 7, "how is this a jam game"),
  say(5.3, 8, "BONE WYRM DOWN"),
  say(5.7, 0, "-2.0 ahead of WR 👀"),
  say(6.15, 9, "mimic queen jumpscare"),
  say(6.55, 2, "the stars look weird"),
  say(6.9, 3, "wait why are the stars blinking"),
  say(7.25, 10, "what's at the edge??"),
  say(7.55, 1, "uh"),
  say(7.75, 5, "THE SCREEN"),
  ...spam(S.boom + 0.62, 0.09, ["WAIT IT GOES 3D??", "IT'S 3D", "BRO WHAT", "NO WAY", "CLIP IT CLIP IT", "3D?????", "this is a JAM game??", "😱😱😱"], 1),
  say(9.5, 7, "he lost time on the edge"),
  say(9.85, 9, "+0.41 it's over"),
  say(10.2, 8, "it's not over"),
  say(10.75, 0, "BACK AHEAD"),
  say(11.15, 11, "the collector is terrifying"),
  say(11.6, 2, "MASH IS ALL OF THEM"),
  say(11.95, 3, "😭😭😭"),
  say(12.35, 4, "-0.66. X. HERE WE GO"),
  say(12.75, 1, "don't get hit don't get hit"),
  say(13.15, 7, "NO HIT STILL"),
  say(13.55, 9, "COME ON COME ON"),
  ...spam(S.wr + 0.1, 0.085, ["WORLD RECORD", "WR WR WR WR", "🏆🏆🏆🏆", "HISTORY", "GG GG GG", "LETS GOOOOOOO", "-1.22 INSANE", "he did it 😭", "WR WR WR", "GGGGGG", "🏆"], 0),
  say(14.95, 6, "wait"),
  say(15.15, 10, "the timer didn't stop"),
  ...spam(S.extra + 0.2, 0.14, ["why is there another split", "that split wasn't there", "chat what is ???", "the timer is red", "is that an eye"], 3),
];
/** after the extra split, someone else is in the chat */
const THEM: Msg[] = Array.from({ length: 7 }, (_, i) => [S.extra + 0.55 + i * 0.09 + (i > 2 ? 0.25 : 0), "???", VIOLET, "look up."] as Msg);
const ALL = [...CHATLOG, ...THEM].sort((a, b) => a[0] - b[0]);

/** the alerts that drop into the stream: (when, the kind, its colour, who, what they said) */
const ALERTS: [number, string, string, string, string][] = [
  [2.95, "NEW FOLLOWER", "#7fd4ff", "lil_blob_fan", ""],
  [k1 + 0.1, "★ NEW SUBSCRIBER · 12 MONTHS", GOLD, "the_moth", '"i\'ll take the hit for you."'],
  [k2 + 0.4, "♥ TIP · $5.00", "#ff8aa8", "mama_slime", '"it\'s past your bedtime."'],
  [S.extra + 0.3, "??? HAS JOINED", VIOLET, "???", '"found you."'],
];

export const Live: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const shake = useShake([
    [S.crack, 0.5],
    [S.boom, 1.3],
    [k1, 0.5],
    [S.wr, 0.9],
    [S.extra, 0.8],
    [S.offline, 0.6],
  ]);
  const tear = useGlitch([S.crack, S.boom - 0.04, k1, S.extra, S.extra + 0.5, S.extra + 0.9, S.offline - 0.02]);
  // when it goes 3D, the game takes the whole frame for a moment
  const out = t < S.boom || t >= k1 ? 0 : t < S.boom + 0.12 ? easeOut((t - S.boom) / 0.12) : t > k1 - 0.16 ? 1 - easeInOut((t - (k1 - 0.16)) / 0.16) : 1;
  const box: [number, number, number, number] = [GAME.x * (1 - out), GAME.y * (1 - out), GAME.w + (W - GAME.w) * out, GAME.h + (H - GAME.h) * out];
  const live = t < S.offline;
  return (
    <AbsoluteFill style={{ backgroundColor: "#07070c" }}>
      <GlitchDefs s={tear} />
      {live ? (
        <AbsoluteFill style={{ transform: shake, filter: tear > 0.02 ? "url(#tear)" : undefined }}>
          <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 50% at 50% 40%, #141426 0%, #07070c 100%)" }} />
          {ready ? (
            <>
              <Header t={t} />
              <Splits t={t} />
              <Cam t={t} />
              <Chat t={t} />
            </>
          ) : null}
          <Game t={t} box={box} out={out} />
          {ready && out < 0.02 ? (
            <>
              <Timer t={t} />
              <Countdown t={t} />
              {ALERTS.map((a, i) => (
                <Alert key={i} t={t} a={a} />
              ))}
              <Record t={t} />
            </>
          ) : null}
          {t >= S.wr && t < S.extra + 0.3 ? <Confetti t={t - S.wr} /> : null}
          {/* the extra split: the stream bleeds violet */}
          {t >= S.extra ? <AbsoluteFill style={{ boxShadow: `inset 0 0 ${(120 + 60 * Math.sin(t * 14)).toFixed(0)}px rgba(150,90,255,0.55)`, opacity: smooth((t - S.extra) / 0.3) }} /> : null}
        </AbsoluteFill>
      ) : null}
      {!live && ready ? <Offline t={t} /> : null}
      <Flash
        hits={[
          [S.go, 0.4],
          [S.boom, 1],
          [k1, 0.5],
          [S.wr, 0.7],
          [S.extra, 0.6],
          [S.offline, 0.5],
          [S.end, 0.4],
        ]}
      />
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-live.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the game */

const Game: React.FC<{ t: number; box: [number, number, number, number]; out: number }> = ({ t, box, out }) => {
  const [x, y, w, h] = box;
  // a hard little flash on each of the speedrun's cuts
  const cut = FEED.reduce((m, [a]) => (t >= a && t - a < m ? t - a : m), 9);
  const pop = cut < 0.1 && t > S.go ? 0.35 * (1 - cut / 0.1) : 0;
  const violet = t >= S.extra;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, overflow: "hidden", backgroundColor: "#000", borderRadius: 18 * (1 - out), boxShadow: out < 1 ? "0 0 0 3px rgba(127,244,234,0.35), 0 0 40px rgba(127,140,255,0.25)" : undefined }}>
      {FEED.map(([a, b, clip, from, rate, z, c, pixel], i) => (
        <Clip key={i} clip={clip} at={a} from={from} dur={b - a} rate={rate} box={[0, 0, w, h]} z={z} c={c} pixel={pixel} filter={violet ? "brightness(1.15) contrast(1.25) saturate(0.6) hue-rotate(-20deg)" : undefined} />
      ))}
      {violet ? <AbsoluteFill style={{ mixBlendMode: "soft-light", background: "linear-gradient(180deg, rgba(130,80,255,0.9), rgba(40,10,90,0.6))" }} /> : null}
      {t >= S.crack && t < S.boom ? <Crack t={t} w={w} h={h} /> : null}
      {pop > 0 ? <AbsoluteFill style={{ backgroundColor: "#fff", opacity: pop }} /> : null}
    </div>
  );
};

/** the stream's picture cracking, from where the eyes are */
const Crack: React.FC<{ t: number; w: number; h: number }> = ({ t, w, h }) => {
  const u = easeOut((t - S.crack) / 0.15);
  const more = easeOut((t - S.crack - 0.25) / 0.12);
  const star = (ox: number, oy: number, k: number, seed: number) =>
    Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 + rand(seed + i);
      const len = (0.3 + 0.6 * rand(seed + i * 3)) * w * 0.6 * k;
      const bend = (rand(seed + i * 7) - 0.5) * 0.5;
      const pts = `${ox},${oy} ${ox + Math.cos(a) * len * 0.5},${oy + Math.sin(a) * len * 0.5} ${ox + Math.cos(a + bend) * len},${oy + Math.sin(a + bend) * len}`;
      return (
        <g key={seed + i}>
          <polyline points={pts} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={7} />
          <polyline points={pts} fill="none" stroke="rgba(235,250,255,0.95)" strokeWidth={3} />
        </g>
      );
    });
  return (
    <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
      {star(w * 0.45, h * 0.45, u, 3)}
      {more > 0 ? star(w * 0.66, h * 0.3, more, 41) : null}
    </svg>
  );
};

/* ------------------------------------------------------------------------------------------------ the stream's furniture */

const Header: React.FC<{ t: number }> = ({ t }) => {
  // the viewers: a steady climb, a jump when it goes 3D, another for the record; then a number nobody can read
  const v = 12400 + 160 * t + 19000 * smooth((t - S.boom) / 0.8) + 17000 * smooth((t - S.wr) / 0.6);
  const viewers = t >= S.extra ? (Math.floor(t * 12) % 2 ? "4,444" : "????") : `${(v / 1000).toFixed(1)}K`;
  return (
    <div style={{ position: "absolute", left: 0, top: 64, width: W, height: 120, display: "flex", alignItems: "center", padding: "0 28px", gap: 22, boxSizing: "border-box" }}>
      <Avatar size={96} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: UI, fontWeight: 800, fontSize: 40, color: "#fff" }}>blob_irl</div>
        <div style={{ fontFamily: UI, fontWeight: 600, fontSize: 25, color: "#c9cbd6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          WORLD RECORD attempt · any% no-hit · <span style={{ color: "#7ff4ea" }}>The Third Direction</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        <div style={{ fontFamily: UI, fontWeight: 800, fontSize: 28, color: "#fff", backgroundColor: "#e5193a", borderRadius: 8, padding: "4px 14px", letterSpacing: "0.06em", opacity: Math.floor(t * 2) % 2 ? 0.85 : 1 }}>● LIVE</div>
        <div style={{ fontFamily: UI, fontWeight: 800, fontSize: 26, color: t >= S.extra ? VIOLET : "#ff6b7d", fontVariantNumeric: "tabular-nums" }}>👁 {viewers}</div>
      </div>
    </div>
  );
};

/** the runner: a little blob, as an avatar */
const Avatar: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: "50%", background: "radial-gradient(circle at 38% 30%, #fff3b0, #ffc23a 45%, #e08a12 100%)", border: "4px solid #e5193a", position: "relative", flexShrink: 0 }}>
    <div style={{ position: "absolute", left: "28%", top: "42%", width: size * 0.12, height: size * 0.17, borderRadius: "50%", backgroundColor: "#2a1408" }} />
    <div style={{ position: "absolute", left: "60%", top: "42%", width: size * 0.12, height: size * 0.17, borderRadius: "50%", backgroundColor: "#2a1408" }} />
  </div>
);

/** the splits: a window on the list that follows the run; each split's time once it falls, and how far ahead it was */
const Splits: React.FC<{ t: number }> = ({ t }) => {
  const extra = t >= S.extra;
  const rows: [string, number, number][] = extra ? [...ROWS, ["???", Infinity, Infinity]] : ROWS;
  const cur = rows.findIndex(([, at]) => t < at);
  const now = cur < 0 ? rows.length - 1 : cur;
  const RH = 44;
  const VIS = 6;
  // the window scrolls, smoothly, to keep the current split near its foot
  const target = clamp(now - (VIS - 2), 0, rows.length - VIS);
  const prev = clamp(now - 1 - (VIS - 2), 0, rows.length - VIS);
  const since = cur < 0 ? 9 : t - (rows[now - 1]?.[1] ?? 0);
  const top = prev + (target - prev) * easeOut(since / 0.25);
  const gold = t >= S.wr && !extra;
  return (
    <div style={{ position: "absolute", left: SPLITS.x, top: ROW.y, width: SPLITS.w, height: ROW.h, borderRadius: 14, background: "linear-gradient(180deg, rgba(22,22,40,0.96), rgba(10,10,20,0.96))", border: "2px solid rgba(127,244,234,0.25)", overflow: "hidden", fontFamily: UI }}>
      <div style={{ height: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", borderBottom: "2px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontWeight: 800, fontSize: 24, color: "#fff", letterSpacing: "0.04em" }}>ANY% · NO HIT</div>
        <div style={{ fontWeight: 600, fontSize: 22, color: "#c9cbd6" }}>
          WR <span style={{ color: GOLD, fontVariantNumeric: "tabular-nums" }}>{fmt(RECORD)}</span>
        </div>
      </div>
      <div style={{ position: "relative", height: RH * VIS, overflow: "hidden" }}>
        {rows.map(([name, at, d], i) => {
          const done = t >= at;
          const isNow = i === now && !gold;
          const odd = name === "???";
          const flick = odd && Math.floor(t * 10) % 3 === 0;
          const dc = d < 0 ? (i === ROWS.length - 1 ? GOLD : GREEN) : RED;
          return (
            <div
              key={name}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (i - top) * RH,
                height: RH,
                display: "flex",
                alignItems: "center",
                padding: "0 18px",
                gap: 12,
                background: isNow ? (odd ? "linear-gradient(90deg, rgba(150,40,90,0.75), rgba(90,30,160,0.35))" : "linear-gradient(90deg, rgba(40,110,255,0.6), rgba(40,110,255,0.15))") : i % 2 ? "rgba(255,255,255,0.025)" : "transparent",
                transform: odd ? `translateX(${((1 - easeOut((t - S.extra) / 0.25)) * 400).toFixed(0)}px)` : undefined,
              }}
            >
              <div style={{ flex: 1, fontWeight: 800, fontSize: 25, color: odd ? (flick ? RED : VIOLET) : done ? "#e9ecf5" : "#9aa0b4", letterSpacing: "0.03em" }}>{name}</div>
              <div style={{ width: 120, textAlign: "right", fontWeight: 800, fontSize: 25, color: odd ? RED : dc, fontVariantNumeric: "tabular-nums", opacity: done || odd ? 1 : 0 }}>{odd ? "+∞" : `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(2)}`}</div>
              <div style={{ width: 150, textAlign: "right", fontWeight: 600, fontSize: 25, color: odd ? VIOLET : "#e9ecf5", fontVariantNumeric: "tabular-nums" }}>{odd ? "--:--.--" : done ? fmt(clock(at)) : "-"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** the runner's camera: the Blob, close; it jumps for the record; it loses its signal when something else arrives */
const Cam: React.FC<{ t: number }> = ({ t }) => {
  const hop = t >= S.wr && t < S.extra ? Math.abs(Math.sin((t - S.wr) * Math.PI * 3.2)) * 14 * Math.exp(-(t - S.wr) / 1.2) : 0;
  const lost = t >= S.extra + 0.6;
  const f = Math.floor(t * FPS);
  return (
    <div style={{ position: "absolute", left: CAM.x, top: ROW.y, width: CAM.w, height: ROW.h, borderRadius: 14, overflow: "hidden", border: "2px solid rgba(255,90,120,0.45)", backgroundColor: "#000" }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${(-hop).toFixed(1)}px) scale(${(1 + hop / 300).toFixed(3)})` }}>
        <Clip clip="reunion" at={0} from={285} rate={0.25} dur={S.offline} box={[0, 0, CAM.w, ROW.h]} z={2.4} c={[0.42, 0.5]} />
      </div>
      {t >= S.extra && !lost ? <AbsoluteFill style={{ backgroundColor: VIOLET, mixBlendMode: "color", opacity: 0.6 }} /> : null}
      {lost ? (
        <svg width={CAM.w} height={ROW.h} style={{ position: "absolute", left: 0, top: 0 }}>
          <rect width={CAM.w} height={ROW.h} fill="#111" />
          {Array.from({ length: 70 }, (_, i) => (
            <rect key={i} x={0} y={rand(i + f * 61) * ROW.h} width={CAM.w} height={1 + 5 * rand(i + f * 7)} fill={`rgba(220,220,255,${(0.1 + 0.5 * rand(i * 3 + f)).toFixed(2)})`} />
          ))}
          <text x={CAM.w / 2} y={ROW.h / 2 + 10} textAnchor="middle" fontFamily={UI} fontWeight={800} fontSize={30} fill={VIOLET}>
            NO SIGNAL
          </text>
        </svg>
      ) : null}
      <div style={{ position: "absolute", left: 12, bottom: 10, fontFamily: UI, fontWeight: 800, fontSize: 22, color: "#fff", backgroundColor: "rgba(0,0,0,0.55)", padding: "3px 10px", borderRadius: 6 }}>
        <span style={{ color: "#ff3b5c" }}>●</span> blob_irl
      </div>
    </div>
  );
};

/** the chat: each line comes in at the foot and pushes the rest up */
const Chat: React.FC<{ t: number }> = ({ t }) => {
  const LINE = 46;
  const seen = ALL.filter(([at]) => at <= t);
  const scroll = seen.reduce((s, [at]) => s + easeOut((t - at) / 0.12), 0);
  const foot = CHAT.h - 58;
  return (
    <div style={{ position: "absolute", left: 18, top: CHAT.y, width: W - 36, height: CHAT.h, borderRadius: 14, background: "rgba(14,14,26,0.92)", border: "2px solid rgba(255,255,255,0.07)", overflow: "hidden", fontFamily: UI, isolation: "isolate" }}>
      <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 18px", fontWeight: 800, fontSize: 20, letterSpacing: "0.16em", color: "#8a8fa6", borderBottom: "2px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(14,14,26,1)", position: "relative", zIndex: 2 }}>STREAM CHAT</div>
      {seen.map(([at, name, colour, text], j) => {
        const y = 44 + foot - (scroll - j) * LINE;
        if (y < -LINE || y > CHAT.h) return null;
        const them = name === "???";
        return (
          <div key={j} style={{ position: "absolute", left: 18, right: 18, top: y, height: LINE, display: "flex", alignItems: "center", whiteSpace: "nowrap", overflow: "hidden", fontSize: 30, opacity: smooth((t - at) / 0.08) * smooth((y - 30) / 40) }}>
            <span style={{ fontWeight: 800, color: colour }}>{name}</span>
            <span style={{ fontWeight: 600, color: them ? VIOLET : "#e9ecf5", marginLeft: 12, fontStyle: them ? "italic" : undefined, textShadow: them ? `0 0 12px ${VIOLET}` : undefined }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
};

/** the clock: green while ahead, red while behind, gold for the record; after it, red, and it will not stop */
const Timer: React.FC<{ t: number }> = ({ t }) => {
  const extra = t >= S.extra;
  const behind = t >= k1 && t < k2;
  const s = t >= S.wr && !extra ? clock(S.wr) : clock(t);
  let txt = fmt(s);
  if (extra) {
    const f = Math.floor(t * FPS);
    txt = txt
      .split("")
      .map((ch, i) => (/\d/.test(ch) && rand(f * 13 + i) < 0.25 + 0.5 * clamp((t - S.extra) / 1.0) ? "4" : ch))
      .join("");
  }
  const fill = extra ? `linear-gradient(180deg, #ffb0c0, ${RED})` : t >= S.wr ? `linear-gradient(180deg, #fff6d0, ${GOLD} 55%, #e0a030)` : behind ? `linear-gradient(180deg, #ffc0c8, ${RED})` : t >= S.go ? `linear-gradient(180deg, #d6ffe6, ${GREEN})` : "linear-gradient(180deg, #ffffff, #b8bccc)";
  return (
    <div style={{ position: "absolute", left: GAME.x, top: GAME.y + GAME.h - 190, width: GAME.w, height: 190, background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.7))", borderRadius: "0 0 18px 18px", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: "0 34px 14px 0", boxSizing: "border-box" }}>
      <div style={{ fontFamily: UI, fontWeight: 800, fontSize: 124, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", background: fill, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 4px 0 rgba(0,0,0,0.8))", transform: extra ? `translateX(${((rand(Math.floor(t * FPS)) - 0.5) * 12).toFixed(1)}px)` : undefined }}>{txt}</div>
    </div>
  );
};

const Countdown: React.FC<{ t: number }> = ({ t }) => {
  if (t > S.go + 0.45) return null;
  const marks: [number, string][] = [
    [0.1, "3"],
    [0.4, "2"],
    [0.7, "1"],
    [S.go, "GO!"],
  ];
  const i = marks.reduce((m, [a], j) => (t >= a ? j : m), -1);
  if (i < 0) return null;
  const [a, txt] = marks[i]!;
  const u = t - a;
  const go = txt === "GO!";
  return (
    <div style={{ position: "absolute", left: GAME.x, top: GAME.y, width: GAME.w, height: GAME.h - 120, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: go ? "transparent" : "rgba(0,0,0,0.35)" }}>
      <div style={{ fontFamily: POSTER, fontSize: go ? 300 : 340, color: go ? GREEN : "#fff", transform: `scale(${(1.5 - 0.5 * backOut(u / 0.2)).toFixed(3)})`, opacity: go ? 1 - smooth((u - 0.25) / 0.2) : 1, textShadow: `0 0 40px ${go ? GREEN : "rgba(255,255,255,0.6)"}, 0 10px 0 rgba(0,0,0,0.6)` }}>{txt}</div>
    </div>
  );
};

/** an alert dropping in at the top of the game */
const Alert: React.FC<{ t: number; a: [number, string, string, string, string] }> = ({ t, a: [at, kind, colour, name, text] }) => {
  const dur = text ? 1.9 : 1.2;
  if (t < at || t > at + dur) return null;
  const u = t - at;
  const y = -40 * (1 - backOut(u / 0.3)) - 260 * smooth((u - (dur - 0.25)) / 0.25);
  const them = name === "???";
  return (
    <div style={{ position: "absolute", left: 0, top: GAME.y + 34, width: W, display: "flex", justifyContent: "center", transform: `translateY(${y.toFixed(1)}px)`, opacity: smooth(u / 0.12) }}>
      <div style={{ minWidth: 640, padding: "20px 34px", borderRadius: 18, background: them ? "linear-gradient(135deg, rgba(40,10,70,0.95), rgba(10,4,24,0.95))" : "linear-gradient(135deg, rgba(24,24,44,0.96), rgba(10,10,22,0.96))", border: `3px solid ${colour}`, boxShadow: `0 0 40px ${colour}66, 0 14px 30px rgba(0,0,0,0.6)`, textAlign: "center", fontFamily: UI }}>
        <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: "0.16em", color: colour }}>{kind}</div>
        <div style={{ fontWeight: 800, fontSize: 52, color: "#fff", marginTop: 4, textShadow: them ? `0 0 18px ${VIOLET}` : undefined }}>{name}</div>
        {text ? <div style={{ fontWeight: 600, fontStyle: "italic", fontSize: 32, color: them ? VIOLET : "#e9ecf5", marginTop: 6 }}>{text}</div> : null}
      </div>
    </div>
  );
};

/** the record */
const Record: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.wr, S.extra - 0.05, 0.05, 0.15);
  if (k <= 0) return null;
  const u = t - S.wr;
  const s = 0.5 + 0.5 * backOut(u / 0.35);
  const shine = ((u * 0.9) % 1.4) * 140 - 20;
  return (
    <>
      <div style={{ position: "absolute", left: GAME.x, top: GAME.y, width: GAME.w, height: GAME.h, opacity: k, borderRadius: 18, background: "radial-gradient(ellipse 60% 40% at 50% 42%, rgba(0,0,0,0.55), rgba(0,0,0,0) 100%)" }} />
      <div style={{ position: "absolute", left: 0, top: GAME.y + 170, width: W, display: "flex", flexDirection: "column", alignItems: "center", opacity: k, transform: `scale(${s.toFixed(3)})` }}>
        <div style={{ fontFamily: UI, fontWeight: 800, fontSize: 34, letterSpacing: "0.3em", color: "#fff", backgroundColor: "rgba(0,0,0,0.6)", padding: "6px 22px 6px 32px", borderRadius: 8 }}>🏆 NEW 🏆</div>
        <div
          style={{
            fontFamily: POSTER,
            fontSize: 190,
            lineHeight: 0.95,
            textAlign: "center",
            marginTop: 10,
            background: `linear-gradient(110deg, ${GOLD} ${shine - 12}%, #fffbe8 ${shine}%, ${GOLD} ${shine + 12}%), linear-gradient(180deg, #fff2c0, ${GOLD} 60%, #d9902a)`,
            backgroundBlendMode: "screen",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 8px 0 rgba(0,0,0,0.75)) drop-shadow(0 0 30px rgba(255,190,80,0.6))",
          }}
        >
          WORLD
          <br />
          RECORD
        </div>
      </div>
    </>
  );
};

const Confetti: React.FC<{ t: number }> = ({ t }) => {
  const cols = ["#ffd77a", "#7ff4ea", "#ff6b9a", "#9be38a", "#b9a2ff", "#ffffff"];
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
      {Array.from({ length: 140 }, (_, i) => {
        const x0 = rand(i) * W;
        const vx = (rand(i + 3) - 0.5) * 500;
        const vy = -900 - 900 * rand(i + 7);
        const x = x0 + vx * t + 40 * Math.sin(t * 6 + i);
        const y = H * 0.62 + vy * t + 1300 * t * t;
        const r = (rand(i + 11) - 0.5) * 1440 * t;
        return <rect key={i} x={-9} y={-5} width={18} height={10} fill={cols[i % cols.length]} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${r.toFixed(0)}) scale(1 ${Math.cos(t * 9 + i).toFixed(2)})`} />;
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------------------------------------ offline */

const Offline: React.FC<{ t: number }> = ({ t }) => {
  const u = t - S.offline;
  const e = t - S.end;
  const f = Math.floor(t * FPS);
  const out = 1 - smooth((t - S.fadeOut) / 0.6);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 55% at 50% 42%, #191926 0%, #07070c 100%)", alignItems: "center", opacity: out }}>
      {/* the last of the static */}
      {u < 0.35 ? (
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: 1 - u / 0.35 }}>
          {Array.from({ length: 90 }, (_, i) => (
            <rect key={i} x={0} y={rand(i + f * 61) * H} width={W} height={2 + 10 * rand(i + f * 7)} fill={`rgba(220,220,255,${(0.1 + 0.6 * rand(i * 3 + f)).toFixed(2)})`} />
          ))}
        </svg>
      ) : null}
      <div style={{ position: "absolute", top: H * 0.2, display: "flex", flexDirection: "column", alignItems: "center", gap: 26, fontFamily: UI, transform: `translateY(${(-240 * easeInOut(e / 0.5)).toFixed(1)}px)` }}>
        <div style={{ filter: "grayscale(1) brightness(0.7)" }}>
          <Avatar size={200} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 30, letterSpacing: "0.2em", color: "#c9cbd6", backgroundColor: "#3a3a48", borderRadius: 8, padding: "6px 18px", opacity: smooth(u / 0.2) }}>● OFFLINE</div>
        <div style={{ fontWeight: 800, fontSize: 58, color: "#fff", opacity: smooth((u - 0.1) / 0.2) }}>blob_irl is offline</div>
        <div style={{ fontWeight: 600, fontStyle: "italic", fontSize: 40, color: VIOLET, opacity: smooth((u - 0.45) / 0.3), textShadow: `0 0 16px ${VIOLET}` }}>last seen: looking up</div>
      </div>
      {e >= 0 ? <Next e={e} /> : null}
    </AbsoluteFill>
  );
};

/** next runner: you */
const Next: React.FC<{ e: number }> = ({ e }) => {
  const pulse = 1 + 0.04 * Math.max(0, Math.sin(e * Math.PI * 2));
  return (
    <div style={{ position: "absolute", top: H * 0.34, width: W, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: UI }}>
      <div style={{ fontWeight: 800, fontSize: 30, letterSpacing: "0.3em", paddingLeft: "0.3em", color: "#9aa0b4", opacity: smooth(e / 0.25) }}>NEXT RUNNER</div>
      <div style={{ fontFamily: POSTER, fontSize: 260, lineHeight: 1, color: GOLD, transform: `scale(${(0.5 + 0.5 * backOut((e - 0.15) / 0.35)).toFixed(3)})`, opacity: smooth((e - 0.15) / 0.1), textShadow: "0 0 40px rgba(255,190,80,0.6), 0 10px 0 rgba(0,0,0,0.7)" }}>YOU</div>
      <div style={{ fontWeight: 600, fontSize: 36, color: "#e9ecf5", marginTop: 6, opacity: smooth((e - 0.6) / 0.25) }}>
        can you beat <span style={{ color: GOLD, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(clock(S.wr))}</span>?
      </div>
      <div style={{ marginTop: 40, fontWeight: 800, fontSize: 40, color: "#07070c", backgroundColor: "#7ff4ea", borderRadius: 16, padding: "18px 46px", opacity: smooth((e - 0.9) / 0.2), transform: `scale(${pulse.toFixed(3)})`, boxShadow: "0 0 40px rgba(127,244,234,0.5)" }}>▶ PLAY FREE ON RUN</div>
      <div style={{ marginTop: 26, fontWeight: 800, fontSize: 32, color: "#ff8aa8", opacity: smooth((e - 1.3) / 0.25) }}>♥ VOTE · RUN OCTOBER JAM</div>
      <div style={{ marginTop: 34, fontFamily: "Cinzel", fontWeight: 700, fontSize: 40, letterSpacing: "0.14em", color: "#fff1d0", opacity: smooth((e - 1.6) / 0.3) }}>THE THIRD DIRECTION</div>
    </div>
  );
};
