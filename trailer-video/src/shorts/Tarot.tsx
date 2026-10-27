import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame } from "remotion";
import { Flash, useShake } from "../components/Effects";
import shorts from "../data/shorts.json";
import { GOLD } from "../lib/colours";
import { useFonts } from "../lib/fonts";
import { backOut, clamp, easeInOut, easeOut, FPS, H, rand, smooth, W } from "../lib/time";
import { Clip, Fireflies, span } from "./kit";

const S = shorts.shorts.tarot;
const CARDS = S.cards as number[];
const SLOT = 2.4;

/**
 * YOUR OCTOBER FORTUNE - a tarot reading on a velvet cloth by candlelight. The deck is shuffled and fanned; pick a card. Seven are
 * turned, one by one, each a boss in a gilded frame under the arcana it was born for - the Moon, the Emperor, Judgement, Death,
 * the Magician, the Hermit, the Tower - with its own voice and its fortune. The last card is 0, the Fool: the Blob, the smallest
 * light, which walks in anyway. (X is not in this deck.)
 */

type Arcana = { numeral: string; arcana: string; boss: string; fortune: string; clip: string; from: number; z: number; c: [number, number]; colour: string; pixel?: boolean; rate?: number };

const DECK: Arcana[] = [
  { numeral: "XVIII", arcana: "THE MOON", boss: "GLOOMMOTHER", fortune: "What hides in the dark is hungry.", clip: "f-gloom", from: 425, z: 2.3, c: [0.5, 0.16], colour: "#7fe6ff", pixel: true },
  { numeral: "IV", arcana: "THE EMPEROR", boss: "THORNBACK KING", fortune: "Every throne grows thorns.", clip: "f-thicket", from: 200, z: 2.0, c: [0.52, 0.28], colour: "#e8a858", pixel: true },
  { numeral: "XX", arcana: "JUDGEMENT", boss: "TOLL QUEEN", fortune: "When the bell tolls, it tolls for you.", clip: "f-marsh", from: 80, z: 1.9, c: [0.5, 0.2], colour: "#d9b8ff", pixel: true },
  { numeral: "XIII", arcana: "DEATH", boss: "BONE WYRM", fortune: "It has too many legs. And no mercy.", clip: "f-bones", from: 105, z: 2.0, c: [0.48, 0.72], colour: "#f4efe0", pixel: true },
  { numeral: "I", arcana: "THE MAGICIAN", boss: "MIMIC QUEEN", fortune: "Nothing here is what it seems.", clip: "f-meadow", from: 270, z: 2.2, c: [0.5, 0.15], colour: "#ff8aa8", pixel: true },
  { numeral: "IX", arcana: "THE HERMIT", boss: "THE COLLECTOR", fortune: "He keeps what he takes. In jars.", clip: "tarot-collector", from: 30, z: 1.0, c: [0.5, 0.42], colour: "#ffcf5a" },
  { numeral: "XVI", arcana: "THE TOWER", boss: "THE MASH", fortune: "Everything you beat. All at once.", clip: "tarot-mash", from: 0, z: 1.0, c: [0.5, 0.62], colour: "#ff5a6e", rate: 0.7 },
];
const FOOL: Arcana = { numeral: "0", arcana: "THE FOOL", boss: "THE BLOB", fortune: "The smallest light. It walks in anyway.", clip: "wild-wellface", from: 0, z: 1.0, c: [0.5, 0.5], colour: GOLD, rate: 0.6 };
const TOWER = 6;

/* the card: its size, where it is read, and its art's arch */
const CW = 640;
const CH = 1060;
const CX = W / 2;
const CY = 840;
const AX = 40;
const AY = 104;
const AW = CW - 2 * AX;
const AH = 720;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

export const Tarot: React.FC = () => {
  const ready = useFonts();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const flips = [...CARDS.map((c) => c + 0.55), S.fool + 0.95];
  const shake = useShake([...flips.map((f, i) => [f, i === TOWER ? 1.2 : 0.35] as [number, number]), [S.end, 0.4]]);
  return (
    <AbsoluteFill style={{ backgroundColor: "#07040a" }}>
      <AbsoluteFill style={{ transform: shake }}>
        <Table t={t} />
        <Wheel t={t} />
        <Candles t={t} />
        <Fireflies n={22} colour="255,205,120" k={0.55} />
        {ready ? <Hook t={t} /> : null}
        {DECK.map((d, i) => (
          <Card key={i} t={t} d={d} at={CARDS[i]!} i={i} />
        ))}
        <Card t={t} d={FOOL} at={S.fool} i={7} />
        {ready ? <End t={t} /> : null}
        {/* the cloth's grain */}
        <Img src={staticFile(`grain/g${frame % 8}.png`)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, mixBlendMode: "overlay", opacity: 0.22 }} />
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 80% 60% at 50% 46%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.65) 100%)" }} />
      </AbsoluteFill>
      <Flash hits={[...flips.map((f, i) => [f, i === TOWER ? 0.75 : 0.32] as [number, number]), [S.end, 0.4]]} />
      {t > S.length - 0.04 ? <AbsoluteFill style={{ backgroundColor: "#000" }} /> : null}
      <Audio src={staticFile("audio/short-tarot.wav")} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ the table */

/** a velvet cloth in candlelight */
const Table: React.FC<{ t: number }> = ({ t }) => {
  const f1 = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 6.3 + 1);
  const f2 = 0.85 + 0.15 * Math.sin(t * 9.7 + 2) * Math.sin(t * 7.1);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 85% 62% at 50% 44%, #3a1840 0%, #220c28 45%, #0c050f 100%)" }} />
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: 0.22, mixBlendMode: "overlay" }}>
        <filter id="velvet">
          <feTurbulence type="fractalNoise" baseFrequency="0.9 0.012" numOctaves={2} seed={4} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={W} height={H} filter="url(#velvet)" />
      </svg>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 50% 32% at 10% 92%, rgba(255,160,80,${(0.32 * f1).toFixed(3)}), rgba(0,0,0,0) 70%), radial-gradient(ellipse 50% 32% at 90% 92%, rgba(255,160,80,${(0.32 * f2).toFixed(3)}), rgba(0,0,0,0) 70%)` }} />
    </AbsoluteFill>
  );
};

/** an astrologer's wheel, embroidered in gold, turning slowly behind the reading */
const Wheel: React.FC<{ t: number }> = ({ t }) => {
  const rot = t * 4;
  const R = [470, 430, 300];
  return (
    <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, opacity: 0.26 }}>
      <g transform={`translate(${CX} ${CY}) rotate(${rot.toFixed(2)})`} stroke={GOLD} fill="none">
        {R.map((r, i) => (
          <circle key={i} r={r} strokeWidth={i === 1 ? 1 : 2} strokeDasharray={i === 2 ? "4 10" : undefined} />
        ))}
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k / 12) * Math.PI * 2;
          return (
            <g key={k}>
              <line x1={Math.cos(a) * 300} y1={Math.sin(a) * 300} x2={Math.cos(a) * 470} y2={Math.sin(a) * 470} strokeWidth={1} />
              <circle cx={Math.cos(a + Math.PI / 12) * 450} cy={Math.sin(a + Math.PI / 12) * 450} r={6} strokeWidth={1.5} />
            </g>
          );
        })}
        {Array.from({ length: 72 }, (_, k) => {
          const a = (k / 72) * Math.PI * 2;
          return <line key={k} x1={Math.cos(a) * 430} y1={Math.sin(a) * 430} x2={Math.cos(a) * (k % 6 ? 440 : 452)} y2={Math.sin(a) * (k % 6 ? 440 : 452)} strokeWidth={1} />;
        })}
      </g>
    </svg>
  );
};

/** two candles at the cloth's edge, their smoke going up */
const Candles: React.FC<{ t: number }> = ({ t }) => (
  <>
    {[
      [110, 1690, 0],
      [W - 110, 1660, 1],
    ].map(([x, y, k]) => {
      const fl = 0.85 + 0.15 * Math.sin(t * (11 + k * 1.7)) * Math.sin(t * 6.3 + k);
      return (
        <React.Fragment key={k}>
          <div style={{ position: "absolute", left: x - 34, top: y, width: 68, height: 220, borderRadius: "8px 8px 0 0", background: "linear-gradient(90deg, #d8c6a8, #fff4e0 50%, #c9b493)" }} />
          <div style={{ position: "absolute", left: x - 2, top: y - 18, width: 4, height: 20, backgroundColor: "#2a2020" }} />
          <div style={{ position: "absolute", left: x - 90, top: y - 150, width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, rgba(255,190,110,${(0.5 * fl).toFixed(3)}), rgba(255,190,110,0) 70%)` }} />
          <div style={{ position: "absolute", left: x - 14, top: y - 66 + 2 * Math.sin(t * 17 + k), width: 28, height: 52 * fl, borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%", background: "radial-gradient(ellipse at 50% 70%, #fff8d8, #ffb648 60%, rgba(255,120,40,0.6))", transform: `rotate(${(4 * Math.sin(t * 5 + k)).toFixed(1)}deg)`, transformOrigin: "50% 100%" }} />
          <svg width={160} height={500} style={{ position: "absolute", left: x - 80, top: y - 560, opacity: 0.35 }}>
            <path d={`M80 500 q ${-30 + 20 * Math.sin(t)} -80 0 -160 q ${30 + 20 * Math.sin(t * 1.3)} -80 0 -160 q -25 -70 10 -160`} stroke="rgba(230,220,240,0.6)" strokeWidth={6} fill="none" strokeLinecap="round" style={{ filter: "blur(4px)" }} />
          </svg>
        </React.Fragment>
      );
    })}
  </>
);

/* ------------------------------------------------------------------------------------------------ the hook: shuffled and fanned */

const Hook: React.FC<{ t: number }> = ({ t }) => {
  if (t > CARDS[0]! + 0.6) return null;
  const titleK = span(t, 0.05, S.pick + 0.35, 0.3, 0.35);
  const out = smooth((t - (S.pick + 0.15)) / 0.45);
  // the shuffle: the two halves slide apart and riffle back, twice; then the fan opens from the stack
  const riff = t < S.fan ? Math.abs(Math.sin(((t - 0.25) / (S.fan - 0.25)) * Math.PI * 2)) * smooth((t - 0.2) / 0.2) : 0;
  const fan = easeOut((t - S.fan) / 0.8);
  const N = 9;
  return (
    <AbsoluteFill>
      {/* the title, in gold leaf */}
      <svg width={W} height={460} style={{ position: "absolute", left: 0, top: 110, opacity: titleK, transform: `scale(${(0.92 + 0.08 * easeOut(t / 0.8)).toFixed(3)})` }}>
        <defs>
          <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff4cf" />
            <stop offset="45%" stopColor={GOLD} />
            <stop offset="100%" stopColor="#b98228" />
          </linearGradient>
          <linearGradient id="leafShine" gradientUnits="userSpaceOnUse" x1={W * (-0.3 + ((t * 0.6) % 1.6))} y1="0" x2={W * (-0.1 + ((t * 0.6) % 1.6))} y2="120">
            <stop offset="0%" stopColor="#fff" stopOpacity={0} />
            <stop offset="50%" stopColor="#fff" stopOpacity={0.85} />
            <stop offset="100%" stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <filter id="leafGlow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        <text x={W / 2} y={70} textAnchor="middle" fontFamily="Inter" fontWeight={800} fontSize={30} letterSpacing="12" fill="#e8d6b0">✦ PICK A CARD ✦</text>
        {[
          ["YOUR OCTOBER", 190, 96],
          ["FORTUNE", 320, 138],
        ].map(([w, y, size]) => (
          <g key={w as string} fontFamily="Cinzel" fontWeight={700} fontSize={size as number} textAnchor="middle" letterSpacing="4">
            <text x={W / 2} y={y as number} fill="rgba(255,190,90,0.55)" filter="url(#leafGlow)">{w}</text>
            <text x={W / 2} y={(y as number) + 6} fill="rgba(0,0,0,0.7)">{w}</text>
            <text x={W / 2} y={y as number} fill="url(#leaf)">{w}</text>
            <text x={W / 2} y={y as number} fill="url(#leafShine)">{w}</text>
          </g>
        ))}
        <text x={W / 2} y={405} textAnchor="middle" fontFamily="Cormorant Garamond" fontStyle="italic" fontWeight={600} fontSize={46} fill="#efe2cc">seven bosses. one fool.</text>
      </svg>
      {/* the deck */}
      {Array.from({ length: N }, (_, k) => {
        const mid = (N - 1) / 2;
        const side = k < mid ? -1 : k > mid ? 1 : 0;
        const a = (k - mid) * 11 * fan;
        const R = 620;
        const px = CX + Math.sin((a * Math.PI) / 180) * R + side * 170 * riff;
        const py = CY + 330 + R - Math.cos((a * Math.PI) / 180) * R - 4 * k * (1 - fan);
        const picked = k === Math.round(mid);
        const lift = picked ? -60 * easeOut((t - (S.pick - 0.1)) / 0.4) : 0;
        const fall = picked ? 0 : out;
        // the picked card becomes the first card read; the rest fall away
        if (picked && t > CARDS[0]!) return null;
        return (
          <div key={k} style={{ position: "absolute", left: px - (CW * 0.5) / 2, top: py - (CH * 0.5) / 2 + lift + 600 * fall * fall, width: CW * 0.5, height: CH * 0.5, transform: `rotate(${a.toFixed(2)}deg)`, opacity: 1 - fall, filter: picked && t > S.pick - 0.1 ? `drop-shadow(0 0 ${(30 * smooth((t - S.pick + 0.1) / 0.3)).toFixed(0)}px rgba(255,210,120,0.9))` : "drop-shadow(0 10px 18px rgba(0,0,0,0.6))" }}>
            <div style={{ width: CW, height: CH, transform: "scale(0.5)", transformOrigin: "0 0" }}>
              <Back />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------------------------------------ a card */

const Card: React.FC<{ t: number; d: Arcana; at: number; i: number }> = ({ t, d, at, i }) => {
  const fool = i === 7;
  const hold = fool ? S.end - S.fool - 0.2 : SLOT - 0.25;
  const pullT = fool ? 0.6 : 0.35;
  const flipT = fool ? 0.5 : 0.4;
  const u = t - at;
  if (u < 0 || u > hold + 0.3) return null;
  // up from the deck (the first from where it was picked), turned over, read, and thrown aside for the next
  const pull = easeOut(u / pullT);
  const from = i === 0 ? { x: CX, y: CY + 330 - 60, s: 0.5 } : { x: CX + (i % 2 ? -1 : 1) * 120, y: H + 700, s: 1 };
  const flip = easeInOut((u - pullT) / flipT);
  const gone = fool ? smooth((u - hold) / 0.3) : easeOut((u - hold) / 0.25);
  const dir = i % 2 ? 1 : -1;
  const x = from.x + (CX - from.x) * pull + dir * 1000 * gone;
  const y = from.y + (CY - from.y) * pull - 420 * gone + 8 * Math.sin(u * 2.2) * (1 - gone);
  const s = (from.s + (1 - from.s) * pull) * (1 + 0.07 * Math.sin(Math.PI * clamp((u - pullT) / flipT))) * (1 - 0.3 * gone);
  const rz = (1 - pull) * (i % 2 ? -10 : 8) + dir * 28 * gone;
  const ry = 180 * (1 - flip);
  const open = u > pullT + flipT * 0.5;
  const read = u - (pullT + flipT);
  // the Tower cracks
  const tower = i === TOWER;
  return (
    <>
      {fool ? <Rays t={t} k={smooth((u - pullT) / 0.6) * (1 - gone)} /> : null}
      <div style={{ position: "absolute", left: x - CW / 2, top: y - CH / 2, width: CW, height: CH, transform: `scale(${s.toFixed(4)}) rotate(${rz.toFixed(2)}deg)`, perspective: 2200, opacity: 1 - (fool ? gone : 0) }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateY(${ry.toFixed(2)}deg)` }}>
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", filter: `drop-shadow(0 0 ${(open ? 40 : 14).toFixed(0)}px ${fool ? "rgba(255,225,150,0.75)" : "rgba(255,200,110,0.4)"})` }}>
            <Face d={d} at={at + pullT} read={read} tower={tower} t={t} />
          </div>
          <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <Back />
          </div>
        </div>
      </div>
      {/* gold sparks as it turns */}
      {u > pullT + flipT * 0.4 && u < pullT + flipT + 0.9 ? <Sparks u={u - (pullT + flipT * 0.4)} seed={i * 31} gold={tower ? "255,90,100" : "255,215,130"} /> : null}
      {/* which card, and what it says */}
      <Reading d={d} read={read} gone={gone} i={i} />
    </>
  );
};

/** the face: a gilded frame, the arcana's number, the boss under its arch, the arcana's name on a plaque */
const Face: React.FC<{ d: Arcana; at: number; read: number; tower: boolean; t: number }> = ({ d, at, read, tower, t }) => {
  const sheen = read > 0 ? ((read * 0.9) % 2.4) / 1.2 : -1;
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: 28, overflow: "hidden", background: "linear-gradient(180deg, #1d1126, #0c0712)" }}>
      {/* the boss, under the arch */}
      <div style={{ position: "absolute", left: AX, top: AY, width: AW, height: AH, overflow: "hidden", borderRadius: `${AW / 2}px ${AW / 2}px 14px 14px / ${AW / 2}px ${AW / 2}px 14px 14px`, backgroundColor: "#000" }}>
        <Clip clip={d.clip} at={at} from={d.from} dur={SLOT * 1.7} rate={d.rate} box={[0, 0, AW, AH]} z={d.z * (1 + 0.04 * clamp(read / 2))} c={d.c} pixel={d.pixel} />
        <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 60px rgba(0,0,0,0.75)", background: "linear-gradient(180deg, rgba(255,200,120,0.08), rgba(80,20,90,0.18))" }} />
      </div>
      <svg width={CW} height={CH} style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          <linearGradient id="gilt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff1c4" />
            <stop offset="35%" stopColor={GOLD} />
            <stop offset="65%" stopColor="#b8862e" />
            <stop offset="100%" stopColor="#ffe8a8" />
          </linearGradient>
        </defs>
        <rect x={5} y={5} width={CW - 10} height={CH - 10} rx={24} fill="none" stroke="url(#gilt)" strokeWidth={8} />
        <rect x={20} y={20} width={CW - 40} height={CH - 40} rx={14} fill="none" stroke="url(#gilt)" strokeWidth={2} />
        <path d={`M${AX} ${AY + AH} V${AY + AW / 2} A${AW / 2} ${AW / 2} 0 0 1 ${AX + AW} ${AY + AW / 2} V${AY + AH} Z`} fill="none" stroke="url(#gilt)" strokeWidth={4} />
        {/* corners */}
        {[
          [40, 40],
          [CW - 40, 40],
          [40, CH - 40],
          [CW - 40, CH - 40],
        ].map(([cx, cy], k) => (
          <g key={k} transform={`translate(${cx} ${cy})`}>
            <path d="M0 -14 L8 0 L0 14 L-8 0 Z" fill="url(#gilt)" />
            <circle r={20} fill="none" stroke="url(#gilt)" strokeWidth={1.5} />
          </g>
        ))}
        {/* the number */}
        <text x={CW / 2} y={78} textAnchor="middle" fontFamily="Cinzel" fontWeight={700} fontSize={48} fill="url(#gilt)" letterSpacing="4">
          {d.numeral}
        </text>
        {/* the plaque */}
        <line x1={70} y1={AY + AH + 38} x2={CW - 70} y2={AY + AH + 38} stroke="url(#gilt)" strokeWidth={2} />
        <line x1={70} y1={CH - 70} x2={CW - 70} y2={CH - 70} stroke="url(#gilt)" strokeWidth={2} />
        <text x={CW / 2} y={AY + AH + 128} textAnchor="middle" fontFamily="Cinzel" fontWeight={700} fontSize={d.arcana.length > 10 ? 50 : 58} fill="url(#gilt)" letterSpacing="3">
          {d.arcana}
        </text>
        <text x={70} y={AY + AH + 124} fontSize={26} fill={GOLD}>✦</text>
        <text x={CW - 92} y={AY + AH + 124} fontSize={26} fill={GOLD}>✦</text>
      </svg>
      {/* the gold catching the light as it is read */}
      {sheen >= 0 && sheen <= 1.2 ? <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen", background: `linear-gradient(115deg, rgba(255,255,255,0) ${(sheen * 120 - 30).toFixed(1)}%, rgba(255,240,200,0.4) ${(sheen * 120 - 15).toFixed(1)}%, rgba(255,255,255,0) ${(sheen * 120).toFixed(1)}%)` }} /> : null}
      {tower && read > 0.05 ? <Crack read={read} t={t} /> : null}
    </div>
  );
};

/** the Tower: a crack runs down the card */
const Crack: React.FC<{ read: number; t: number }> = ({ read }) => {
  const k = easeOut(read / 0.25);
  const pts: [number, number][] = [
    [CW * 0.62, 0],
    [CW * 0.55, CH * 0.14],
    [CW * 0.66, CH * 0.27],
    [CW * 0.5, CH * 0.42],
    [CW * 0.58, CH * 0.55],
    [CW * 0.44, CH * 0.7],
    [CW * 0.52, CH * 0.84],
    [CW * 0.4, CH],
  ];
  const n = Math.max(2, Math.round(pts.length * k));
  const d = pts.slice(0, n).map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <svg width={CW} height={CH} style={{ position: "absolute", left: 0, top: 0 }}>
      <path d={d} stroke="rgba(0,0,0,0.85)" strokeWidth={10} fill="none" />
      <path d={d} stroke="rgba(255,120,110,0.95)" strokeWidth={3} fill="none" style={{ filter: "drop-shadow(0 0 8px rgba(255,60,60,0.9))" }} />
    </svg>
  );
};

/** the back of every card: violet, gold, a sun, a moon, an eye */
const Back: React.FC = () => (
  <div style={{ position: "absolute", inset: 0, borderRadius: 28, overflow: "hidden", background: "radial-gradient(ellipse at 50% 45%, #4a2160, #22102e 70%)" }}>
    <svg width={CW} height={CH} style={{ position: "absolute", left: 0, top: 0 }}>
      <rect x={5} y={5} width={CW - 10} height={CH - 10} rx={24} fill="none" stroke={GOLD} strokeWidth={8} />
      <rect x={26} y={26} width={CW - 52} height={CH - 52} rx={14} fill="none" stroke={GOLD} strokeWidth={2} strokeDasharray="2 8" />
      <g transform={`translate(${CW / 2} ${CH / 2})`} stroke={GOLD} fill="none">
        {Array.from({ length: 24 }, (_, k) => {
          const a = (k / 24) * Math.PI * 2;
          return <line key={k} x1={Math.cos(a) * 130} y1={Math.sin(a) * 130} x2={Math.cos(a) * (k % 2 ? 190 : 240)} y2={Math.sin(a) * (k % 2 ? 190 : 240)} strokeWidth={2} />;
        })}
        <circle r={120} strokeWidth={3} />
        <circle r={260} strokeWidth={1.5} />
        <path d="M-70 0 Q0 -60 70 0 Q0 60 -70 0 Z" strokeWidth={4} />
        <circle r={22} fill={GOLD} />
        <path d="M-40 -330 a40 40 0 1 0 50 50 a32 32 0 1 1 -50 -50 Z" fill={GOLD} stroke="none" transform="translate(0 0)" />
        <circle cy={330} r={30} fill={GOLD} stroke="none" />
      </g>
      {Array.from({ length: 14 }, (_, k) => (
        <text key={k} x={60 + rand(k) * (CW - 120)} y={70 + rand(k + 9) * (CH - 140)} fontSize={14 + 10 * rand(k + 3)} fill={GOLD} opacity={0.7}>
          ✦
        </text>
      ))}
    </svg>
  </div>
);

/** sparks flying off the gilt */
const Sparks: React.FC<{ u: number; seed: number; gold: string }> = ({ u, seed, gold }) => (
  <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, mixBlendMode: "screen" }}>
    {Array.from({ length: 40 }, (_, k) => {
      const a = rand(seed + k) * Math.PI * 2;
      const sp = 500 + 900 * rand(seed + k + 50);
      const r = 240 + 140 * rand(seed + k + 7);
      const d = r + sp * u;
      const x = CX + Math.cos(a) * d;
      const y = CY + Math.sin(a) * d * 1.4 + 300 * u * u;
      const o = 1 - u / 0.9;
      return <circle key={k} cx={x} cy={y} r={2 + 4 * rand(seed + k + 3)} fill={`rgba(${gold},${o.toFixed(2)})`} />;
    })}
  </svg>
);

/** the Fool's light: rays turning behind its card */
const Rays: React.FC<{ t: number; k: number }> = ({ t, k }) =>
  k > 0.01 ? (
    <AbsoluteFill style={{ opacity: k, mixBlendMode: "screen" }}>
      <div style={{ position: "absolute", left: CX - 1100, top: CY - 1100, width: 2200, height: 2200, borderRadius: "50%", transform: `rotate(${(t * 8).toFixed(2)}deg)`, background: "repeating-conic-gradient(rgba(255,220,150,0.22) 0deg 6deg, rgba(255,220,150,0) 6deg 18deg)", maskImage: "radial-gradient(circle, black 20%, transparent 65%)", WebkitMaskImage: "radial-gradient(circle, black 20%, transparent 65%)" }} />
      <div style={{ position: "absolute", left: CX - 600, top: CY - 600, width: 1200, height: 1200, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,230,170,0.35), rgba(255,230,170,0) 60%)" }} />
    </AbsoluteFill>
  ) : null;

/** above the card, which of the seven; below it, the boss and its fortune */
const Reading: React.FC<{ d: Arcana; read: number; gone: number; i: number }> = ({ d, read, gone, i }) => {
  const k = smooth(read / 0.3) * (1 - smooth(gone / 0.4));
  if (k <= 0) return null;
  const fool = i === 7;
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 170, width: W, textAlign: "center", opacity: k, fontFamily: "Inter", fontWeight: 800, fontSize: 28, letterSpacing: "0.5em", paddingLeft: "0.5em", color: "#e8d6b0" }}>
        {fool ? "AND THE LAST CARD" : `CARD ${ROMAN[i]} OF VII`}
      </div>
      <div style={{ position: "absolute", left: 0, top: CY + CH / 2 + 34, width: W, textAlign: "center", opacity: k, transform: `translateY(${(16 * (1 - easeOut(read / 0.4))).toFixed(1)}px)` }}>
        <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 38, letterSpacing: "0.32em", paddingLeft: "0.32em", color: d.colour, textShadow: `0 0 18px ${d.colour}88, 0 3px 10px rgba(0,0,0,0.9)` }}>{fool ? "THE BLOB · THAT'S YOU" : d.boss}</div>
        <div style={{ marginTop: 10, fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 48, color: "#f3e7d3", textShadow: "0 3px 12px rgba(0,0,0,0.9)" }}>“{d.fortune}”</div>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------------------------------------ the end */

const End: React.FC<{ t: number }> = ({ t }) => {
  const k = span(t, S.end, S.fadeOut + 0.6, 0.5, 0.6);
  if (k <= 0) return null;
  const u = t - S.end;
  const pulse = 1 + 0.03 * Math.max(0, Math.sin(u * Math.PI * 2.2));
  const N = 8;
  return (
    <AbsoluteFill style={{ opacity: k }}>
      {/* the spread, laid out */}
      {Array.from({ length: N }, (_, i) => {
        const a = (i - (N - 1) / 2) * 9;
        const v = easeOut((u - 0.05 * i) / 0.5);
        const R = 900;
        const x = CX + Math.sin((a * Math.PI) / 180) * R;
        const y = 1320 - Math.cos((a * Math.PI) / 180) * R;
        return (
          <div key={i} style={{ position: "absolute", left: x - (CW * 0.3) / 2, top: y - (CH * 0.3) / 2 + 200 * (1 - v), width: CW * 0.3, height: CH * 0.3, opacity: v, transform: `rotate(${a}deg)`, filter: "drop-shadow(0 0 16px rgba(255,200,110,0.45))" }}>
            <div style={{ width: CW, height: CH, transform: "scale(0.3)", transformOrigin: "0 0" }}>
              <Back />
            </div>
          </div>
        );
      })}
      <div style={{ position: "absolute", top: 820, width: W, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontFamily: "Cormorant Garamond", fontStyle: "italic", fontWeight: 600, fontSize: 50, color: "#efe2cc", opacity: smooth((u - 0.3) / 0.4) }}>your fortune is waiting in</div>
        <div style={{ marginTop: 16, fontFamily: "Cinzel", fontWeight: 700, fontSize: 70, letterSpacing: "0.05em", color: GOLD, whiteSpace: "nowrap", transform: `scale(${(0.9 + 0.1 * backOut((u - 0.5) / 0.5)).toFixed(3)})`, opacity: smooth((u - 0.5) / 0.3), textShadow: "0 0 30px rgba(255,190,90,0.55), 0 4px 0 rgba(0,0,0,0.85)" }}>
          THE THIRD DIRECTION
        </div>
        <div style={{ marginTop: 50, fontFamily: "Inter", fontWeight: 800, fontSize: 38, letterSpacing: "0.18em", color: "#2a1230", backgroundColor: GOLD, borderRadius: 60, padding: "20px 46px 20px 54px", opacity: smooth((u - 1.0) / 0.3), transform: `scale(${pulse.toFixed(3)})`, boxShadow: "0 0 34px rgba(255,200,110,0.5)" }}>
          PLAY FREE ON RUN
        </div>
        <div style={{ marginTop: 28, fontFamily: "Inter", fontWeight: 800, fontSize: 30, letterSpacing: "0.14em", color: "#ff9aac", opacity: smooth((u - 1.4) / 0.3) }}>♥ VOTE · RUN OCTOBER JAM</div>
      </div>
    </AbsoluteFill>
  );
};
