import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Flash, GlitchDefs, useGlitch, useShake } from "../components/Effects";
import shorts from "../data/shorts.json";
import { GOLD, RED } from "../lib/colours";
import { PIXEL, useFonts } from "../lib/fonts";
import { backOut, clamp, easeOut, F, FPS, H, rand, smooth, W } from "../lib/time";
import { EndArcade } from "./ends";
import { Clip, span, Tape, useImpact } from "./kit";

const S = shorts.shorts.fighter;
const [p1, p2, p3] = S.play as [number, number, number];

/**
 * CHOOSE YOUR FIGHT - an arcade's select screen. The screen comes on; every boss in the game waits in its own card, alive;
 * the cursor spins through them like a roulette, slows, and lands on X. VERSUS: the Blob against him, and the stats. FIGHT!
 * Four blows, his bar emptying, K.O. Then back to the screen, where one card has been locked all along: it unlocks after the
 * end. For a moment, something looks out of it.
 */

type Fighter = { name: string; quote: string; colour: string; clip: string; from: number; z: number; c: [number, number]; pixel?: boolean };
const ROSTER: Fighter[] = [
  { name: "GLOOMMOTHER", quote: "THEY HATE THE LIGHT.", colour: "#7fe6ff", clip: "g-gloom", from: 62, z: 2.1, c: [0.5, 0.17], pixel: true },
  { name: "THORNBACK KING", quote: "THE ROOTS REMEMBER.", colour: "#e8a858", clip: "g-thicket", from: 120, z: 2.0, c: [0.5, 0.36], pixel: true },
  { name: "TOLL QUEEN", quote: "EVERY BELL IS LISTENING.", colour: "#d9b8ff", clip: "g-marsh", from: 78, z: 1.9, c: [0.5, 0.27], pixel: true },
  { name: "BONE WYRM", quote: "IT HAS TOO MANY LEGS.", colour: "#f4efe0", clip: "g-bones", from: 70, z: 2.0, c: [0.58, 0.22], pixel: true },
  { name: "MIMIC QUEEN", quote: "QUIET IS HOW IT STARTS.", colour: "#ff8aa8", clip: "g-meadow", from: 44, z: 2.0, c: [0.45, 0.25], pixel: true },
  { name: "X, THE HOLLOW", quote: "IT TOOK THEM.", colour: "#ff4a5a", clip: "h-x-gaze", from: 0, z: 1.7, c: [0.5, 0.5] },
  { name: "THE COLLECTOR", quote: "IT KEEPS THEM.", colour: "#ffcf5a", clip: "c-collector", from: 10, z: 1.6, c: [0.5, 0.5] },
  { name: "THE MASH", quote: "IT IS ALL OF THEM.", colour: "#ff8aa8", clip: "c-mash", from: 10, z: 1.4, c: [0.55, 0.45] },
];
const LOCKED = 8;
const X = 5;

/* the grid: three by three cards */
const CW = 286;
const CH = 320;
const GAP = 22;
const GX = (W - 3 * CW - 2 * GAP) / 2;
const GY = 470;
const cell = (i: number) => [GX + (i % 3) * (CW + GAP), GY + Math.floor(i / 3) * (CH + GAP)] as const;

/* the roulette: hops that start quick and slow down, landing on X */
const PATH = [0, 1, 2, 4, 3, 6, 7, 4, 2, 0, 3, 7, 6, 1, 4, 2, 7, X];
const HOPS: number[] = [];
{
  let t = S.roll;
  let d = 0.115;
  for (let i = 0; i < PATH.length; i++) {
    HOPS.push(t);
    t += d;
    d *= 1.12;
  }
  // stretch them so the last lands exactly on the pick
  const k = (S.pick - S.roll) / (HOPS[HOPS.length - 1]! - S.roll);
  for (let i = 0; i < HOPS.length; i++) HOPS[i] = S.roll + (HOPS[i]! - S.roll) * k;
}
/** the card under the cursor now (or -1) */
const hovered = (t: number) => {
  if (t >= S.locked + 0.2 && t < S.end) return LOCKED;
  if (t < S.roll || t >= S.vs) return -1;
  let i = 0;
  while (i + 1 < HOPS.length && t >= HOPS[i + 1]!) i++;
  return PATH[i]!;
};

export const Fighter: React.FC = () => {
  const ready = useFonts();
  const t = useCurrentFrame() / FPS;
  const shake = useShake([
    [S.pick, 0.4],
    [S.vsSlam, 1.1],
    [S.fight, 0.9],
    ...S.play.map((a) => [a, 0.6] as [number, number]),
    [S.ko, 1.2],
    [S.glimpse, 0.8],
  ]);
  const tear = useGlitch([S.glimpse, S.glimpse + 0.2, S.end - 0.12]);
  const impact = useImpact([S.vsSlam, S.ko]);
  // the screen coming on: a line, then the picture opening out of it
  const on = easeOut((t - 0.05) / 0.3);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <GlitchDefs s={tear} />
      <AbsoluteFill style={{ transform: `${shake === "none" ? "" : shake} scaleY(${Math.max(0.004, on).toFixed(3)})`, filter: [tear > 0.02 ? "url(#tear)" : "", impact ?? ""].join(" ").trim() || undefined }}>
        <Backdrop t={t} />
        {t < S.vs || (t >= S.locked && t < S.end) ? <Select t={t} ready={ready} /> : null}
        {t >= S.vs - 0.3 && t < S.fight + 0.1 ? <Versus t={t} ready={ready} /> : null}
        {t >= S.fight && t < S.locked ? <Fight t={t} ready={ready} /> : null}
        {ready ? <EndArcade at={S.end} fade={S.fadeOut} /> : null}
        <Tape k={0.55} />
      </AbsoluteFill>
      {/* the line of the screen coming on */}
      {t < 0.4 ? <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - smooth((t - 0.2) / 0.2) }}><div style={{ width: W * (0.2 + 0.8 * easeOut(t / 0.12)), height: 6, backgroundColor: "#fff", boxShadow: "0 0 40px #9ff" }} /></AbsoluteFill> : null}
      <Flash hits={[[S.pick, 0.7], [S.vsSlam, 0.9], [S.fight, 1], [S.ko, 0.9], [S.glimpse, 0.5], [S.end, 0.6]]} />
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-fighter.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ behind it all */

/** an arcade's night: stars, and a grid floor running away into a glowing horizon */
const Backdrop: React.FC<{ t: number }> = ({ t }) => {
  const scroll = (t * 60) % 60;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #05061a 0%, #0c0b2e 55%, #2a0c3a 78%, #05061a 100%)" }}>
      {Array.from({ length: 70 }, (_, i) => (
        <div key={i} style={{ position: "absolute", left: rand(i) * W, top: rand(i + 50) * H * 0.7, width: 3, height: 3, backgroundColor: "#fff", opacity: 0.25 + 0.6 * Math.abs(Math.sin(t * (1 + rand(i + 9) * 3) + i)) }} />
      ))}
      <div style={{ position: "absolute", left: -W, top: H * 0.78, width: W * 3, height: H * 0.4, transformOrigin: "50% 0", transform: "perspective(500px) rotateX(62deg)", backgroundImage: `linear-gradient(rgba(255,80,200,0.55) 2px, transparent 2px), linear-gradient(90deg, rgba(255,80,200,0.55) 2px, transparent 2px)`, backgroundSize: "60px 60px", backgroundPosition: `0 ${scroll}px` }} />
      <div style={{ position: "absolute", left: 0, top: H * 0.775, width: W, height: 4, background: "#ff7bd5", boxShadow: "0 0 30px #ff7bd5, 0 0 80px #ff3fb0" }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the select screen */

const Select: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const h = hovered(t);
  const second = t >= S.locked;
  const base = second ? S.locked : 0;
  const lockedShake = second && t > S.locked + 0.25 && t < S.glimpse + 0.4 ? Math.sin(t * 70) * 10 * smooth((t - S.locked - 0.25) / 0.2) : 0;
  const glimpse = t >= S.glimpse && t < S.glimpse + 0.36;
  const info = h >= 0 && h < LOCKED ? ROSTER[h]! : null;
  const picked = t >= S.pick && t < S.vs;
  return (
    <AbsoluteFill>
      {/* the title, and what the cursor is on */}
      {ready ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.09 }}>
          <div style={{ fontFamily: PIXEL, fontSize: 46, color: GOLD, textShadow: `0 0 14px #ff9a3c, 0 0 34px #ff9a3c, 5px 5px 0 #000`, opacity: span(t, base + 0.25, S.length, 0.05, 0.1) }}>
            {"CHOOSE YOUR FIGHT".slice(0, Math.floor((t - base - 0.25) * 40))}
          </div>
          <div style={{ marginTop: 34, height: 110, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            {info ? (
              <>
                <div style={{ fontFamily: PIXEL, fontSize: 38, color: info.colour, textShadow: `0 0 16px ${info.colour}, 4px 4px 0 #000` }}>{info.name}</div>
                <div style={{ fontFamily: PIXEL, fontSize: 20, color: "#fff", textShadow: "3px 3px 0 #000" }}>{info.quote}</div>
              </>
            ) : h === LOCKED ? (
              <>
                <div style={{ fontFamily: PIXEL, fontSize: 38, color: glimpse ? "#c9b8ff" : "#fff", textShadow: `0 0 16px #b9a2ff, 4px 4px 0 #000` }}>{glimpse ? "THE FOURTH" : "? ? ?"}</div>
                <div style={{ fontFamily: PIXEL, fontSize: 20, color: RED, opacity: Math.floor(t * 4) % 2 ? 1 : 0.4, textShadow: "3px 3px 0 #000" }}>UNLOCKS AFTER THE END</div>
              </>
            ) : (
              <div style={{ fontFamily: PIXEL, fontSize: 22, color: "#9ff4ee", opacity: span(t, 0.6, S.roll, 0.15, 0.05), textShadow: "3px 3px 0 #000" }}>YOU HAVE TO BEAT ALL OF THEM</div>
            )}
          </div>
        </AbsoluteFill>
      ) : null}
      {/* the cards */}
      {Array.from({ length: 9 }, (_, i) => {
        const [x, y] = cell(i);
        const arrive = easeOut((t - base - 0.2 - i * 0.05) / 0.25);
        const on = h === i;
        const flashing = picked && i === X && Math.floor((t - S.pick) * 20) % 2 === 0;
        const grow = picked && i === X ? easeOut((t - S.pick - 0.12) / 0.28) : 0;
        const r = ROSTER[i];
        const sx = i === LOCKED ? lockedShake : 0;
        const scale = (on ? 1.06 : 1) * (0.6 + 0.4 * arrive);
        // the picked card grows to fill the screen (the way into VERSUS)
        const style: React.CSSProperties =
          grow > 0
            ? { left: x + (0 - x) * grow, top: y + (0 - y) * grow, width: CW + (W - CW) * grow, height: CH + (H - CH) * grow, zIndex: 5 }
            : { left: x + sx, top: y, width: CW, height: CH, transform: `scale(${scale.toFixed(3)})`, zIndex: on ? 3 : 1 };
        const border = r ? (on ? r.colour : "rgba(255,255,255,0.25)") : on ? "#b9a2ff" : "rgba(185,162,255,0.4)";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              ...style,
              opacity: arrive,
              border: `5px solid ${border}`,
              boxShadow: on ? `0 0 26px ${border}, 0 0 60px ${border}` : "0 6px 20px rgba(0,0,0,0.7)",
              backgroundColor: "#06070f",
              overflow: "hidden",
              filter: flashing ? "brightness(3)" : on || grow > 0 ? undefined : "brightness(0.55) saturate(0.7)",
            }}
          >
            {r ? (
              <>
                <Sequence from={F(base)} durationInFrames={F(second ? S.end - S.locked : S.vs - 0)} layout="none">
                  <CardClip f={r} w={grow > 0 ? W : CW} h={grow > 0 ? H : CH} second={second} />
                </Sequence>
                <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", padding: "8px 0", textAlign: "center", fontFamily: PIXEL, fontSize: 14, color: on ? "#000" : "#fff", backgroundColor: on ? r.colour : "rgba(0,0,0,0.75)" }}>
                  {r.name}
                </div>
                <div style={{ position: "absolute", left: 8, top: 8, fontFamily: PIXEL, fontSize: 14, color: "#fff", textShadow: "2px 2px 0 #000" }}>{String(i + 1).padStart(2, "0")}</div>
                {second ? <div style={{ position: "absolute", right: 8, top: 8, fontFamily: PIXEL, fontSize: 13, color: "#000", backgroundColor: GOLD, padding: "4px 6px" }}>CLEAR</div> : null}
              </>
            ) : (
              <Locked t={t} glimpse={glimpse} on={on} />
            )}
          </div>
        );
      })}
      {/* the cursor */}
      {h >= 0 && !picked ? <Cursor i={h} t={t} colour={h === LOCKED ? "#b9a2ff" : GOLD} /> : null}
      {picked && ready ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.4, zIndex: 9 }}>
          <div style={{ fontFamily: PIXEL, fontSize: 74, color: "#fff", transform: `scale(${(0.5 + 0.5 * backOut((t - S.pick) / 0.18)).toFixed(3)})`, textShadow: `0 0 20px ${RED}, 6px 6px 0 #000` }}>SELECTED!</div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

const CardClip: React.FC<{ f: Fighter; w: number; h: number; second: boolean }> = ({ f, w, h, second }) => {
  const rate = f.pixel ? 0.6 : f.clip === "h-x-gaze" ? 0.3 : 0.45;
  return <Clip clip={f.clip} at={0} from={f.from + (second ? 20 : 0)} dur={8} rate={rate} box={[0, 0, w, h]} z={f.z} c={f.c} pixel={f.pixel} />;
};

/** the locked card: a big question mark and a padlock, and for a moment, the thing that is in there */
const Locked: React.FC<{ t: number; glimpse: boolean; on: boolean }> = ({ t, glimpse, on }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 45%, #2a1650, #06030f 70%)" }}>
    {glimpse ? (
      <Sequence from={F(S.glimpse)} durationInFrames={F(0.4)} layout="none">
        <Clip clip="t-eye" at={0} from={70} dur={0.4} box={[0, 0, CW, CH]} z={1.6} c={[0.5, 0.48]} filter="brightness(1.3) contrast(1.3) saturate(1.3)" />
      </Sequence>
    ) : (
      <>
        <div style={{ fontFamily: PIXEL, fontSize: 120, color: "#b9a2ff", textShadow: `0 0 ${on ? 30 : 12}px #b9a2ff, 6px 6px 0 #000`, opacity: 0.6 + 0.4 * Math.abs(Math.sin(t * 3)) }}>?</div>
        <svg width={60} height={70} viewBox="0 0 60 70" style={{ marginTop: 10 }}>
          <path d="M14 30 V20 a16 16 0 0 1 32 0 V30" fill="none" stroke="#cdbfff" strokeWidth={7} />
          <rect x={6} y={30} width={48} height={36} rx={5} fill="#cdbfff" />
          <rect x={27} y={42} width={6} height={12} fill="#2a1650" />
        </svg>
      </>
    )}
    <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", padding: "8px 0", textAlign: "center", fontFamily: PIXEL, fontSize: 14, color: "#fff", backgroundColor: "rgba(60,20,110,0.85)" }}>LOCKED</div>
  </AbsoluteFill>
);

/** the cursor: four gold corners round the card, breathing, with the player's tag */
const Cursor: React.FC<{ i: number; t: number; colour: string }> = ({ i, t, colour }) => {
  const [x, y] = cell(i);
  const p = 10 + 5 * Math.sin(t * 12);
  const L = 54;
  const c = (dx: number, dy: number) => (
    <path d={`M${dx ? CW + p : -p} ${dy ? CH + p - L : -p + L} L${dx ? CW + p : -p} ${dy ? CH + p : -p} L${dx ? CW + p - L : -p + L} ${dy ? CH + p : -p}`} fill="none" stroke={colour} strokeWidth={9} strokeLinecap="square" />
  );
  return (
    <div style={{ position: "absolute", left: x, top: y, width: CW, height: CH, zIndex: 6 }}>
      <svg width={CW + 60} height={CH + 60} style={{ position: "absolute", left: -30, top: -30, overflow: "visible", filter: `drop-shadow(0 0 10px ${colour})` }}>
        <g transform="translate(30 30)">
          {c(0, 0)}
          {c(1, 0)}
          {c(0, 1)}
          {c(1, 1)}
        </g>
      </svg>
      <div style={{ position: "absolute", left: -22, top: -48, fontFamily: PIXEL, fontSize: 18, color: "#fff", backgroundColor: RED, padding: "6px 8px", boxShadow: "3px 3px 0 #000" }}>P1</div>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------------ versus */

const Versus: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const u = t - S.vs;
  const open = easeOut(u / 0.3);
  const slam = t - S.vsSlam;
  const st = t - S.stats;
  // the screen splits on a diagonal: X above, the Blob below
  const topPoly = `polygon(0 0, 100% 0, 100% 38%, 0 62%)`;
  const botPoly = `polygon(0 62%, 100% 38%, 100% 100%, 0 100%)`;
  const bar = (v: number, colour: string, k: number, right?: boolean) => (
    <div style={{ width: 300, height: 30, backgroundColor: "rgba(0,0,0,0.6)", border: "3px solid #fff", display: "flex", justifyContent: right ? "flex-end" : "flex-start" }}>
      <div style={{ width: `${(v * 10 * clamp(k)).toFixed(1)}%`, height: "100%", backgroundColor: colour, boxShadow: `0 0 12px ${colour}` }} />
    </div>
  );
  const STATS: [string, number, number][] = [
    ["SIZE", 1, 10],
    ["COURAGE", 10, 2],
    ["CUTENESS", 10, 0],
  ];
  return (
    <AbsoluteFill style={{ opacity: smooth((t - (S.vs - 0.3)) / 0.3) }}>
      <AbsoluteFill style={{ clipPath: topPoly, transform: `translateX(${((1 - open) * W).toFixed(0)}px)`, background: "linear-gradient(135deg, #3a0008, #b3121f)" }}>
        <Clip clip="c-x-hero" at={S.vs - 0.3} from={20} dur={3.6} rate={0.3} z={1.4} c={[0.5, 0.59]} filter="brightness(1.15) contrast(1.15) saturate(1.2)" />
        <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(180,10,30,0.25), rgba(0,0,0,0) 60%)" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: botPoly, transform: `translateX(${((open - 1) * W).toFixed(0)}px)`, background: "linear-gradient(135deg, #b37a12, #3a2600)" }}>
        <Clip clip="reunion" at={S.vs - 0.3} from={250} dur={3.6} rate={0.3} z={1.1} c={[0.5, 0.72]} />
        <AbsoluteFill style={{ background: "linear-gradient(0deg, rgba(255,190,60,0.25), rgba(0,0,0,0) 60%)" }} />
      </AbsoluteFill>
      {/* the seam, crackling */}
      <svg width={W} height={H} style={{ position: "absolute", filter: "drop-shadow(0 0 12px #fff) drop-shadow(0 0 30px #9ff)" }}>
        <path d={Array.from({ length: 13 }, (_, i) => `${i ? "L" : "M"}${(i / 12) * W} ${H * (0.62 - 0.24 * (i / 12)) + (i % 12 ? (rand(i + Math.floor(t * 20) * 13) - 0.5) * 40 : 0)}`).join(" ")} fill="none" stroke="#fff" strokeWidth={6} opacity={open} />
      </svg>
      {ready ? (
        <>
          <div style={{ position: "absolute", right: 50, top: H * 0.1, textAlign: "right", opacity: open }}>
            <div style={{ fontFamily: PIXEL, fontSize: 44, color: "#fff", textShadow: `0 0 16px ${RED}, 5px 5px 0 #000` }}>X, THE HOLLOW</div>
            <div style={{ marginTop: 12, fontFamily: PIXEL, fontSize: 18, color: "#ffb3b8", textShadow: "3px 3px 0 #000" }}>IT TOOK THEM</div>
          </div>
          <div style={{ position: "absolute", left: 50, top: H * 0.74, opacity: open }}>
            <div style={{ fontFamily: PIXEL, fontSize: 44, color: "#fff", textShadow: `0 0 16px ${GOLD}, 5px 5px 0 #000` }}>THE BLOB</div>
            <div style={{ marginTop: 12, fontFamily: PIXEL, fontSize: 18, color: "#ffe9b0", textShadow: "3px 3px 0 #000" }}>THE LAST SMALL LIGHT</div>
          </div>
          {slam > 0 ? (
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.37 }}>
              <div style={{ fontFamily: PIXEL, fontSize: 170, color: GOLD, WebkitTextStroke: `6px ${RED}`, transform: `scale(${(1 + 2 * Math.exp(-slam / 0.07)).toFixed(3)}) rotate(-6deg)`, textShadow: "10px 10px 0 #000, 0 0 40px #ff9a3c" }}>VS</div>
            </AbsoluteFill>
          ) : null}
          {st > 0 ? (
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.52 }}>
              <div style={{ backgroundColor: "rgba(0,0,0,0.78)", border: "4px solid #fff", padding: "22px 26px", display: "flex", flexDirection: "column", gap: 18, opacity: smooth(st / 0.15) }}>
                {STATS.map(([name, a, b], i) => {
                  const k = (st - 0.15 - i * 0.3) / 0.35;
                  return (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {bar(a, GOLD, k, true)}
                      <div style={{ width: 170, textAlign: "center", fontFamily: PIXEL, fontSize: 18, color: "#fff" }}>{name}</div>
                      {bar(b, RED, k)}
                    </div>
                  );
                })}
              </div>
            </AbsoluteFill>
          ) : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the fight */

const BLOWS: [string, number, number, [number, number]][] = [
  ["x-foot", 73, 1.15, [0.5, 0.55]],
  ["c-x-stomp", 172, 1.0, [0.5, 0.5]],
  ["c-chase", 40, 1.05, [0.5, 0.5]],
  ["h-x-death", 60, 1.05, [0.5, 0.45]],
];

const Fight: React.FC<{ t: number; ready: boolean }> = ({ t, ready }) => {
  const starts = [p1, p2, p3, S.ko];
  const hits = starts.filter((a) => t >= a).length;
  const hp = [100, 72, 46, 18, 0][hits]!;
  const shown = hp + (([100, 100, 72, 46, 18][hits]! - hp) * Math.exp(-(t - (starts[hits - 1] ?? S.fight)) / 0.15));
  const ft = t - S.fight;
  const ko = t - S.ko;
  return (
    <AbsoluteFill>
      {BLOWS.map(([clip, from, z, c], i) => (
        <Clip key={i} clip={clip} at={starts[i]!} from={from} dur={(starts[i + 1] ?? S.locked) - starts[i]!} rate={i === 3 ? 0.6 : 1} z={z} c={c} />
      ))}
      {t < p1 ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: 1 - smooth((t - S.fight - 0.3) / 0.5) }} /> : null}
      {ready ? (
        <>
          {/* the bars */}
          <div style={{ position: "absolute", left: 40, right: 40, top: H * 0.075, display: "flex", alignItems: "center", gap: 18, opacity: smooth((t - p1 + 0.1) / 0.1) }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: PIXEL, fontSize: 16, color: "#fff", marginBottom: 8, textShadow: "2px 2px 0 #000" }}>THE BLOB</div>
              <div style={{ height: 30, border: "4px solid #fff", backgroundColor: "#300" }}>
                <div style={{ width: "100%", height: "100%", backgroundColor: GOLD }} />
              </div>
            </div>
            <div style={{ fontFamily: PIXEL, fontSize: 40, color: "#fff", textShadow: "3px 3px 0 #000" }}>{String(Math.max(0, 99 - Math.floor((t - p1) * 3))).padStart(2, "0")}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: PIXEL, fontSize: 16, color: "#fff", marginBottom: 8, textAlign: "right", textShadow: "2px 2px 0 #000" }}>X, THE HOLLOW</div>
              <div style={{ height: 30, border: "4px solid #fff", backgroundColor: "#300", display: "flex", justifyContent: "flex-end" }}>
                <div style={{ width: `${shown}%`, height: "100%", backgroundColor: RED }} />
              </div>
            </div>
          </div>
          {hits >= 1 && hits <= 3 ? (
            <div style={{ position: "absolute", left: 60, top: H * 0.2, fontFamily: PIXEL, fontSize: 40, color: GOLD, transform: `scale(${(1 + 0.6 * Math.exp(-(t - starts[hits - 1]!) / 0.1)).toFixed(3)})`, transformOrigin: "0 50%", textShadow: "4px 4px 0 #000" }}>
              {hits} HIT{hits > 1 ? "S" : ""}!
            </div>
          ) : null}
          {ft < 0.8 ? (
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.4 }}>
              <div style={{ fontFamily: PIXEL, fontSize: 150, color: RED, WebkitTextStroke: `5px ${GOLD}`, transform: `scale(${(1 + 1.5 * Math.exp(-ft / 0.08)).toFixed(3)})`, opacity: 1 - smooth((ft - 0.65) / 0.15), textShadow: "10px 10px 0 #000" }}>FIGHT!</div>
            </AbsoluteFill>
          ) : null}
          {ko > 0 ? (
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.38 }}>
              <div style={{ fontFamily: PIXEL, fontSize: 200, color: GOLD, WebkitTextStroke: `6px ${RED}`, transform: `scale(${(1 + 1.8 * Math.exp(-ko / 0.07)).toFixed(3)})`, textShadow: "12px 12px 0 #000" }}>K.O.</div>
            </AbsoluteFill>
          ) : null}
        </>
      ) : null}
    </AbsoluteFill>
  );
};
