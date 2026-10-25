/**
 * The long trailer's music: the game's own intro score (src/cinematic/score.ts), with its instruments and its monster voices,
 * re-timed to the trailer's cue sheet (timeline.py CUE) and grown for the parts the intro does not have: X's fight, the other two
 * bosses, the last lock, the family, the title, and one note at the very end.
 *
 * Bundled with esbuild and run in headless Chromium on an OfflineAudioContext by score-render.mjs:
 *   window.__renderLong(cues) -> base64 WAV (48 kHz stereo)
 */
import { TrailerScore } from '../../src/cinematic/score';

type C = Record<string, number & number[]> & { [k: string]: any };

const SR = 48000;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// The intro score keeps its notes in private methods; the long score plays the same instruments in a different order.
const Base = TrailerScore as unknown as new (h: { ctx: BaseAudioContext; out: AudioNode; noise: AudioBuffer }) => any;

class LongScore extends Base {
  C!: C;

  compose() {
    const C = this.C;
    const bar = C.bar as number;
    const beat = bar / 4;
    this.card(C);
    this.clearing(C);
    this.crater(C);
    this.montage(C, bar, beat);
    this.guardians(C, bar, beat);
    this.edge(C);
    this.boom(C);
    this.xFight(C, bar, beat);
    this.bosses(C);
    this.lastLock(C);
    this.family(C);
    this.title(C);
    this.sting(C);
  }

  /** black, a low swell, the first words */
  card(C: C) {
    this.at(0, () => this.pad(this.A(0.2), 3.6, [33, 40], 0.12, 'sawtooth', 170, { a: 2.0, wet: 0.2 }));
    this.at(C.cardIn - 0.2, () => {
      const t = this.A(C.cardIn);
      this.thud(t, 110, 50, 0.8, 0.18);
      this.pad(t, 3.0, [93, 100], 0.06, 'sine', 9000, { a: 1.5, wet: 0.9 });
    });
  }

  /** the family: the lullaby, the shadow, the foot */
  clearing(C: C) {
    const NOTES = [69, 72, 76, 74, 72, 69, 67, 64];
    const GAPS = [0.62, 0.62, 0.9, 0.62, 0.62, 0.9, 0.62, 0.62];
    let t = C.openingStart + 0.15;
    NOTES.forEach((m, i) => {
      const when = t;
      const sag = when >= C.shadowCreep ? -Math.round(20 + (when - C.shadowCreep) * 60) : 0;
      this.at(when - 0.2, () => this.box(this.A(when), m, 0.15, sag));
      t += GAPS[i]!;
    });
    this.at(C.openingStart - 0.2, () => this.pad(this.A(C.openingStart), C.shadowCreep - C.openingStart + 1.2, [45, 52, 57], 0.07, 'triangle', 700, { a: 2.2, wet: 0.5 }));
    const s0 = C.shadowCreep;
    const run = C.jumpCut - s0;
    this.at(s0 - 0.2, () => {
      this.pad(this.A(s0), run + 0.3, [33, 34, 40], 0.22, 'sawtooth', 240, { a: run * 0.85, wet: 0.2 });
      this.pad(this.A(s0 + 0.1), run, [45, 46], 0.06, 'triangle', 900, { a: run * 0.8 });
    });
    for (let k = 0; k * 0.85 < run - 0.3; k++) this.at(s0 + k * 0.85 - 0.2, () => this.heart(this.A(s0 + k * 0.85), Math.min(0.5, 0.28 + 0.05 * k)));
    this.at(C.jumpCut - 1.8, () => this.riser(this.A(C.jumpCut - 1.6), 1.6, 0.16, 300, 7500, [hz(57), hz(93)]));
    for (const [dt, m, c, g] of [[1.3, 69, -35, 0.11], [0.7, 72, -75, 0.1], [0.2, 76, -120, 0.09]] as const) this.at(C.jumpCut - dt - 0.2, () => this.box(this.A(C.jumpCut - dt), m, g, c));
    this.at(C.jumpCut - 0.1, () => {
      this.glitch(this.A(C.jumpCut), 9, 0.25);
      this.noise(this.A(C.jumpCut + 0.1), 0.5, 'lowpass', 6500, 250, 0.12, { swell: true, a: 0.1, wet: 0.3 });
      this.heart(this.A(C.jumpCut + 0.05), 0.3);
    });
    this.at(C.slam - 0.2, () => {
      const t0 = this.A(C.slam);
      this.impact(t0, 1);
      this.noise(t0, 0.5, 'bandpass', 1800, 300, 0.3, { q: 0.6, a: 0.004, wet: 0.3 });
      this.ring(t0 + 0.2, 3900, 1.8, 0.05);
      this.ring(t0 + 0.2, 3926, 1.7, 0.028);
    });
    this.duck(this.A(C.slam + 0.34), 0.1, 0.45, 0.6);
  }

  /** the crater in the dark, and red eyes opening */
  crater(C: C) {
    this.at(C.slam + 0.9, () => this.box(this.A(C.slam + 1.15), 76, 0.1, -80, 0.8));
    this.at(C.eyesOpen - 0.5, () => {
      this.pad(this.A(C.eyesOpen - 0.4), C.montageStart - C.eyesOpen + 0.3, [33, 34, 40], 0.22, 'sawtooth', 200, { a: 1.1 });
      this.bell(this.A(C.eyesOpen), hz(57), 3.2, 0.09);
      this.air(this.A(C.eyesOpen - 0.05), 1.0, 0.05, 900, 300);
    });
    this.at(C.montageStart - 0.7, () => this.riser(this.A(C.montageStart - 0.5), 0.45, 0.18, 500, 8000));
  }

  /** the five places */
  montage(C: C, bar: number, beat: number) {
    const roots = [33, 33, 41, 43, 40];
    const chords = [[69, 72, 76, 81], [69, 72, 76, 81], [65, 69, 72, 77], [67, 71, 74, 79], [64, 68, 71, 76]];
    this.at(C.montageStart - 0.2, () => this.riser(this.A(C.montageStart), C.footLands - C.montageStart, 0.15, 400, 9000, [hz(45), hz(81)]));
    (C.zoneCuts as number[]).forEach((B, i) => {
      const k = [0.5, 0.62, 0.78, 0.92, 1.05][i]!;
      this.at(B - 0.3, () => {
        this.taiko(this.A(B), (0.6 + 0.07 * i) * k, 72);
        this.texture(i, this.A(B), k);
        for (let s = 0; s < 8; s++) {
          if (i === 0 && s % 2 === 1) continue;
          const t = this.A(B + (s * beat) / 2);
          this.bass(t, roots[i]! + (s === 6 ? 12 : 0), (s % 4 === 0 ? 0.3 : 0.2) * k);
          if (i >= 1) this.tick(t, (0.05 + 0.012 * i) * k);
        }
        if (i >= 1) {
          const n = i >= 3 ? 16 : 8;
          for (let s = 0; s < n; s++) this.pluck(this.A(B + (s * bar) / n), chords[i]![[0, 1, 2, 3, 2, 1, 2, 1][s % 8]!]!, (0.05 + 0.012 * i) * k);
        }
        if (i >= 2) {
          this.taiko(this.A(B + 2 * beat), 0.55 * k, 72);
          this.clang(this.A(B + beat), 0.3 * k);
          this.clang(this.A(B + 3 * beat), 0.32 * k);
        }
      });
    });
    this.at(C.footLands - 0.2, () => {
      this.impact(this.A(C.footLands), 0.95);
      this.glitch(this.A(C.footLands + 0.02), 6, 0.18);
    });
    this.duck(this.A(C.footLands + 0.1), 0.05, 0.28, 0.2);
    this.at(C.guardianCuts[0] - 0.7, () => this.riser(this.A(C.guardianCuts[0] - 0.45), 0.45, 0.18, 800, 9000));
  }

  /** the five guardians: a name slams in on every cut, each in its own voice */
  guardians(C: C, bar: number, beat: number) {
    const roots = [45, 43, 41, 40, 40];
    const chords = [[69, 72, 76, 81], [67, 71, 74, 79], [65, 69, 72, 77], [64, 68, 71, 76], [64, 68, 71, 76]];
    this.at(C.guardianCuts[0] - 0.2, () => this.riser(this.A(C.guardianCuts[0]), C.edgeStart - C.guardianCuts[0] - 0.1, 0.14, 500, 10000, [hz(57), hz(93)]));
    (C.guardianCuts as number[]).forEach((G, i) => {
      this.at(G - 0.3, () => {
        this.braam(this.A(G), roots[i]!, 1.5, 0.34 + 0.03 * i);
        this.impact(this.A(G), 0.55);
        if (i === 0) this.say(this.A(G), (v: any) => v.motherWhispers(6), 5);
        else if (i === 1) this.say(this.A(G), (v: any) => v.kingBellow(), 1);
        else if (i === 2) this.say(this.A(G), (v: any) => v.queenToll(1, 1), 0.9);
        else if (i === 3) this.say(this.A(G), (v: any) => v.wyrmScreech(0.9), 0.9);
        else {
          this.say(this.A(G), (v: any) => v.mimicLaugh(), 0.9);
          this.say(this.A(G + 0.3), (v: any) => v.mimicHum(), 0.8);
        }
        for (let s = 0; s < 8; s++) {
          const t = this.A(G + (s * beat) / 2);
          this.bass(t, roots[i]! - 12 + (s === 6 ? 12 : 0), s % 4 === 0 ? 0.34 : 0.24);
          this.tick(t, 0.07 + 0.01 * i);
        }
        for (let s = 0; s < 16; s++) this.pluck(this.A(G + (s * bar) / 16), chords[i]![[0, 1, 2, 3, 2, 1, 2, 1][s % 8]!]!, 0.06 + 0.01 * i);
        for (let k = 0; k < 4; k++) this.taiko(this.A(G + k * beat), k === 0 ? 0.7 : 0.5, 70);
        this.clang(this.A(G + beat), 0.34);
        this.clang(this.A(G + 3 * beat), 0.36);
      });
    });
    const end = C.edgeStart;
    this.at(end - 1.0, () => {
      for (let k = 0; k < 10; k++) this.taiko(this.A(end - 0.82 + k * 0.08), 0.3 + 0.05 * k, 90);
    });
    this.duck(this.A(end - 0.01), 0.04, 0.2, 0.5);
  }

  /** the Edge: wind, a drone, the stars going out one by one, and the look up */
  edge(C: C) {
    const e = C.edgeStart;
    this.at(e - 0.1, () => {
      this.air(this.A(e + 0.1), C.riserStart - e + 0.4, 0.07, 500, 800, 0.6);
      this.pad(this.A(e + 0.2), C.riserStart - e + 0.3, [33, 40], 0.12, 'sawtooth', 150, { a: 2 });
    });
    const stars = [100, 96, 93, 91, 88, 84, 81, 80];
    (C.starPings as number[]).forEach((tp, i) => this.at(tp - 0.2, () => this.ping(this.A(tp), hz(stars[i]!), 0.07 - 0.003 * i)));
    const r = C.riserStart;
    this.at(r - 0.2, () => {
      this.riser(this.A(r), C.crack - r - 0.05, 0.22, 200, 9000, [hz(45), hz(81)]);
      this.pad(this.A(r), C.crack - r, [33, 34, 40], 0.25, 'sawtooth', 260, { a: C.crack - r - 0.1 });
    });
    for (const dt of [0.2, 0.8, 1.25, 1.5]) this.at(r + dt - 0.2, () => this.heart(this.A(r + dt), 0.28 + 0.1 * dt));
    this.at(C.crack - 0.2, () => {
      const t = this.A(C.crack);
      this.noise(t, 0.4, 'highpass', 9000, 2500, 0.5, { a: 0.002, wet: 0.4 });
      this.bell(t, hz(100), 0.9, 0.06, 0.8);
      this.bell(t, hz(101), 0.9, 0.04, 0.8);
      this.thud(t, 70, 30, 0.6, 0.6);
      this.ring(t + 0.12, 2400, 1.45, 0.05, 2420);
      this.ring(t + 0.12, 3900, 1.35, 0.022);
    });
    this.duck(this.A(C.crack + 0.12), 0.05, C.boom - C.crack - 0.4, 0.2);
  }

  /** the boom: the world bursts, is rebuilt in 3D, and you fall into it */
  boom(C: C) {
    const b = C.boom;
    this.at(b - 0.2, () => {
      this.riser(this.A(b - 0.05), 0.6, 0.12, 80, 900);
      this.osc(this.A(b - 0.05), 40, 0.6, 0.3, 'sine', { swell: true, a: 0.58 });
    });
    this.at(b + 0.35, () => {
      const t = this.A(b + 0.55);
      this.impact(t, 1.35);
      this.noise(t, 2.4, 'lowpass', 1400, 60, 0.35, { wet: 0.4, a: 0.01 });
      for (let k = 0; k < 40; k++) {
        const tt = t + 0.04 + k * 0.035 * (1 + k * 0.05);
        const f = 1800 + this.rnd() * 7000;
        this.noise(tt, 0.02, 'bandpass', f, f, 0.1 * (1 - k / 50), { q: 5, a: 0.001, pan: this.rnd() * 2 - 1 });
      }
    });
    this.at(b + 0.8, () => {
      this.noise(this.A(b + 1.0), 2.4, 'lowpass', 200, 2400, 0.3, { swell: true, a: 1.8, wet: 0.3 });
      const ladder = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
      for (let k = 0; k < 24; k++) this.pluck(this.A(b + 1.2 + k * 0.1), ladder[k % ladder.length]! + (k >= 12 ? 12 : 0), 0.08 + 0.16 * (k / 24));
    });
    this.at(b + 2.0, () => {
      this.noise(this.A(b + 2.1), 0.9, 'bandpass', 2400, 250, 0.2, { a: 0.05, wet: 0.3 });
      this.impact(this.A(b + C.landAfter), 0.5);
      this.noise(this.A(b + C.landAfter), 0.7, 'lowpass', 900, 200, 0.2, { wet: 0.3 });
    });
    // under the last words before X: a held, growing chord
    this.at(b + C.landAfter + 0.1, () => this.pad(this.A(b + C.landAfter + 0.2), C.reveal - b - C.landAfter - 0.2, [33, 34, 40, 45], 0.4, 'sawtooth', 300, { a: C.reveal - b - C.landAfter - 0.4 }));
    for (const dt of [0.5, 1.1, 1.6]) this.at(C.reveal - 2.0 + dt - 0.2, () => this.heart(this.A(C.reveal - 2.0 + dt), 0.36));
  }

  /** X, whole, and his fight: the guardians' groove, a step lower and heavier, a hit on every cut */
  xFight(C: C, bar: number, beat: number) {
    this.at(C.reveal - 0.3, () => {
      const t = this.A(C.reveal);
      this.say(t, (v: any) => v.xRoar(), 1);
      this.impact(t, 1);
      this.braam(t, 33, 2.4, 0.46);
      this.braam(t, 45, 2.0, 0.24);
    });
    const cuts = C.xCuts as number[];
    const roots = [33, 33, 31, 29];
    cuts.forEach((X, i) => {
      this.at(X - 0.3, () => {
        if (i > 0) {
          this.impact(this.A(X), 0.6);
          this.braam(this.A(X), roots[i]! + 12, 1.2, 0.26);
        }
        for (let s = 0; s < 8; s++) {
          const t = this.A(X + (s * beat) / 2);
          this.bass(t, roots[i]! + (s === 6 ? 12 : s === 3 ? 1 : 0), s % 4 === 0 ? 0.36 : 0.26);
          this.tick(t, 0.09);
        }
        for (let k = 0; k < 4; k++) this.taiko(this.A(X + k * beat), k === 0 ? 0.75 : 0.5, 66);
        this.clang(this.A(X + beat), 0.36);
        this.clang(this.A(X + 3 * beat), 0.38);
        for (let s = 0; s < 16; s++) this.pluck(this.A(X + (s * bar) / 16), [57, 60, 64, 69, 64, 60, 63, 60][s % 8]! + (i >= 2 ? 12 : 0), 0.06 + 0.01 * i);
      });
    });
    this.at(cuts[0]! + 0.5, () => this.riser(this.A(cuts[0]! + 0.6), C.collector - cuts[0]! - 0.7, 0.14, 400, 9000));
  }

  /** the other two bosses */
  bosses(C: C) {
    const c = C.collector;
    const m = C.mash;
    this.at(c - 0.3, () => {
      const t = this.A(c);
      this.say(t, (v: any) => v.glassPing(), 2.5);
      this.say(t + 0.1, (v: any) => v.collectorTsk(3), 3);
      this.impact(t, 0.6);
      const n = Math.floor((m - c - 0.2) / 0.2);
      for (let s = 0; s < n; s++) {
        this.bass(this.A(c + 0.15 + s * 0.2), s % 4 === 3 ? 34 : 33, 0.22);
        this.tick(this.A(c + 0.15 + s * 0.2), 0.08);
      }
      for (let s = 0; s * 0.4 < m - c - 0.3; s++) this.clang(this.A(c + 0.2 + s * 0.4), 0.22);
    });
    this.at(c + 0.7, () => this.riser(this.A(c + 0.8), m - c - 0.9, 0.2, 500, 9000, [hz(57), hz(93)]));
    this.at(m - 0.3, () => {
      const t = this.A(m);
      this.say(t, (v: any) => v.mashRoar(), 1);
      this.braam(t, 40, 1.8, 0.42);
      this.impact(t, 0.9);
      const n = Math.floor((C.rush - m) / 0.1);
      for (let s = 0; s < n; s++) {
        this.bass(this.A(m + 0.1 + s * 0.1), 33 + (s % 8 === 7 ? 1 : 0), 0.26, 0.09);
        if (s % 4 === 0) this.taiko(this.A(m + 0.1 + s * 0.1), 0.6, 70);
      }
      for (let s = 0; s * 0.4 < C.rush - m - 0.2; s++) this.clang(this.A(m + 0.2 + s * 0.4), 0.32);
    });
    // the rush: every cut a hit, faster and faster, into the last lock
    const r = C.rush;
    this.at(r - 0.3, () => {
      this.riser(this.A(r), C.lock - r - 0.05, 0.26, 300, 11000, [hz(45), hz(93)]);
      const hits = C.rushCuts as number[];
      hits.forEach((h, i) => {
        this.taiko(this.A(h), 0.5 + 0.03 * i, 80 + 4 * i);
        this.bass(this.A(h), 33 + (i % 2) * 12, 0.3, 0.12);
        if (i % 2 === 1) this.clang(this.A(h), 0.3);
      });
      for (let k = 0; k < 12; k++) this.taiko(this.A(C.lock - 0.62 + k * 0.05), 0.25 + 0.04 * k, 96);
    });
  }

  /** the last lock: glass, then nothing */
  lastLock(C: C) {
    this.duck(this.A(C.lock - 0.06), 0.04, 0.02, 0.02);
    this.at(C.lock - 0.3, () => {
      const t = this.A(C.lock);
      this.say(t, (v: any) => v.glassBreak(), 2.2);
      this.noise(t, 0.6, 'highpass', 9000, 2200, 0.45, { a: 0.002, wet: 0.6 });
      this.impact(t, 0.8);
      this.bell(t, hz(81), 3.0, 0.08, 0.9);
      this.ring(t + 0.15, 2600, 2.0, 0.04);
    });
    this.duck(this.A(C.lock + 0.25), 0.4, C.family - C.lock - 0.9, 0.3);
  }

  /** the family: the lullaby again, in tune, warm, over slow chords that finally come home */
  family(C: C) {
    const f = C.family;
    const end = C.title - 0.25;
    const chords: [number, number[], number][] = [
      [0, [45, 52, 57, 60, 64], 2.4],
      [2.4, [41, 48, 53, 57, 60], 2.4],
      [4.8, [48, 55, 60, 64, 67], 2.4],
      [7.2, [43, 50, 55, 59, 62], end - f - 7.2],
    ];
    for (const [dt, notes, dur] of chords) this.at(f + dt - 0.3, () => this.pad(this.A(f + dt), dur + 0.6, notes, 0.11, 'triangle', 1500, { a: 1.0, wet: 0.6 }));
    const NOTES = [69, 72, 76, 74, 72, 69, 67, 64, 69, 72, 76, 74, 76, 81];
    const GAPS = [0.7, 0.7, 1.0, 0.7, 0.7, 1.0, 0.7, 1.2, 0.7, 0.7, 1.0, 0.7, 0.9, 1.4];
    let t = f + 0.4;
    NOTES.forEach((m, i) => {
      const when = t;
      if (when < end - 0.3) this.at(when - 0.2, () => this.box(this.A(when), m, 0.13, 0, 0.75));
      t += GAPS[i]!;
    });
    // the low A under it all, and a breath before the title
    this.at(f - 0.2, () => this.osc(this.A(f), hz(33), end - f, 0.05, 'sine', { swell: true, a: 2.5 }));
    this.at(end - 1.4, () => this.riser(this.A(end - 1.2), 1.2, 0.2, 300, 9000, [hz(57), hz(93)]));
    this.duck(this.A(C.title - 0.09), 0.05, 0.03, 0.02);
  }

  /** the title: everything at once, then the tune falling asleep, and a heartbeat */
  title(C: C) {
    const t0 = C.title;
    this.at(t0 - 0.3, () => {
      const t = this.A(t0);
      this.braam(t, 45, 3.4, 0.5);
      this.braam(t, 57, 2.6, 0.3);
      this.impact(t, 1.15);
      this.pad(t, 3.6, [45, 52, 57, 60, 64], 0.6, 'sawtooth', 1400, { a: 0.35, wet: 0.5 });
      this.bell(t, hz(57), 5.0, 0.14);
      this.pad(t + 1.2, C.fadeOut - t0, [45, 52, 57, 61, 64], 0.12, 'triangle', 900, { a: 1.6, wet: 0.6 });
    });
    [76, 74, 72, 69].forEach((m, i) => {
      const when = C.endTune + i * 0.65 + (i === 3 ? 0.2 : 0);
      this.at(when - 0.2, () => this.box(this.A(when), m, i === 3 ? 0.14 : 0.12 - 0.008 * i, 0, 0.7));
    });
    this.at(C.playNow - 0.2, () => {
      this.osc(this.A(C.playNow), hz(81), 1.6, 0.05, 'sine', { a: 0.01, wet: 0.8 });
      this.osc(this.A(C.playNow), hz(88), 1.4, 0.03, 'sine', { a: 0.01, wet: 0.8 });
    });
    this.at(C.fadeOut - 0.2, () => this.heart(this.A(C.fadeOut + 0.15), 0.3));
  }

  /** after the end: the tune, one note, out of tune again; something deep; and a whisper (in the mix) */
  sting(C: C) {
    const s = C.sting;
    this.at(s - 0.2, () => {
      this.box(this.A(s), 69, 0.12, 0, 0.8);
      this.box(this.A(s + 0.7), 72, 0.11, -40, 0.8);
      this.osc(this.A(s + 0.3), hz(33), C.stingOut - s, 0.1, 'sine', { swell: true, a: 1.0 });
    });
    this.at(C.stingOut - 0.3, () => {
      const t = this.A(C.stingOut);
      this.thud(t, 60, 24, 1.8, 0.7);
      this.noise(t, 1.6, 'lowpass', 600, 40, 0.3, { wet: 0.6 });
      this.ring(t + 0.1, 3100, 2.2, 0.03, 3060);
    });
  }
}

function wav(buf: AudioBuffer): string {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const n = L.length;
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 2, true);
  dv.setUint32(24, SR, true);
  dv.setUint32(28, SR * 4, true);
  dv.setUint16(32, 4, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i]!)) * 32767, true);
    dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i]!)) * 32767, true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** render the long score; T = 0 is the first sample */
async function renderLong(cues: C): Promise<string> {
  const secs = cues.length as number;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  // the game's master: a gentle compressor after the score bus
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  comp.connect(ctx.destination);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(comp);
  const noise = ctx.createBuffer(1, SR * 2, SR);
  const nd = noise.getChannelData(0);
  let seed = 99;
  for (let i = 0; i < nd.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    nd[i] = (seed / 4294967296) * 2 - 1;
  }
  const score = new LongScore({ ctx, out, noise });
  score.C = cues;
  score.begin(0);
  const AHEAD = 1.4;
  const STEP = 0.25;
  score.pumpTo(AHEAD);
  for (let t = STEP; t < secs; t += STEP) {
    void ctx.suspend(t).then(() => {
      score.pumpTo(t + AHEAD);
      void ctx.resume();
    });
  }
  return wav(await ctx.startRendering());
}

(window as unknown as { __renderLong: typeof renderLong }).__renderLong = renderLong;
