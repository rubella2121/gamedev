/**
 * The shorts' sound (trailer-video/src/shorts/, timed by trailer-video/src/data/shorts.json): the game's own sound kit and
 * monster voices for the sound design of all five, and, for the two that have no orchestra, the music itself, synthesised:
 *   fighter  a chiptune of her lullaby (pulse lead, a triangle bass, noise drums), an arcade's blips, and its speech chip
 *   phonk    the lullaby on an 808 cowbell, an 808 that slides, half-time trap drums, all of it driven into a little distortion
 *
 *   node tools/trailer/score-render.mjs <{"id": ..., "length": ...}.json> <out.wav> tools/trailer/shorts-sfx.ts __renderShortSfx
 */
import shorts from '../../../trailer-video/src/data/shorts.json';
import { Base, renderScore } from './sfx';

type V = any;
type C = Record<string, any>;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const LULL = [69, 72, 76, 74, 72, 69, 67, 64];

class ShortSfx extends Base {
  id!: string;
  C!: C;
  private pulse25?: PeriodicWave;
  private drive?: WaveShaperNode;

  /** do `fn` at the short's time `t` (it is given the audio time) */
  on(t: number, fn: (a: number) => void) {
    this.at(Math.max(0, t - 0.4), () => fn(this.A(t)));
  }

  /* ------------------------------------------------------------------------------------------ synth voices */

  /** a 25% pulse wave: the NES's own timbre */
  private pw(): PeriodicWave {
    if (!this.pulse25) {
      const n = 48;
      const re = new Float32Array(n);
      const im = new Float32Array(n);
      for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
      this.pulse25 = this.c.createPeriodicWave(re, im, { disableNormalization: false });
    }
    return this.pulse25!;
  }

  /** a soft clip everything synthesised can be driven into (warmth on a phone speaker; grit for the phonk) */
  private shaper(): WaveShaperNode {
    if (!this.drive) {
      const s = this.c.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(2.6 * x) / Math.tanh(2.6);
      }
      s.curve = curve;
      s.oversample = '2x';
      this.send(s, { wet: 0.12 });
      this.drive = s;
    }
    return this.drive!;
  }

  /** one note of a synth: an oscillator, a filter, a plain attack/hold/release envelope; optionally gliding, optionally driven */
  syn(
    t: number,
    f: number,
    dur: number,
    g: number,
    o: { type?: OscillatorType | 'pulse'; a?: number; r?: number; lp?: number; q?: number; to?: number; glide?: number; wet?: number; pan?: number; drive?: boolean; decay?: number } = {},
  ) {
    const c = this.c;
    const s = c.createOscillator();
    if (o.type === 'pulse') s.setPeriodicWave(this.pw());
    else s.type = o.type ?? 'square';
    s.frequency.setValueAtTime(f, t);
    if (o.to) s.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.glide ?? dur));
    const e = c.createGain();
    const a = o.a ?? 0.004;
    const r = o.r ?? 0.03;
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + a);
    if (o.decay) e.gain.setTargetAtTime(g * 0.0001, t + a, o.decay);
    else e.gain.setValueAtTime(g, t + Math.max(a, dur));
    e.gain.linearRampToValueAtTime(0, t + Math.max(a, dur) + r);
    let tail: AudioNode = s;
    if (o.lp) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lp;
      lp.Q.value = o.q ?? 0.7;
      tail = tail.connect(lp);
    }
    tail.connect(e);
    if (o.drive) e.connect(this.shaper());
    else this.send(e, { wet: o.wet ?? 0.15, pan: o.pan });
    s.start(t);
    s.stop(t + Math.max(a, dur) + r + 0.05);
    this.keep(s);
  }

  /* chip drums */
  chipKick(t: number, g = 0.5) {
    this.syn(t, 180, 0.09, g, { type: 'square', to: 45, glide: 0.08, lp: 900, r: 0.02 });
  }
  chipSnare(t: number, g = 0.22) {
    this.noise(t, 0.11, 'bandpass', 2600, 1800, g, { q: 0.8, a: 0.001 });
    this.syn(t, 220, 0.04, g * 0.6, { type: 'triangle', to: 140, glide: 0.04 });
  }
  chipHat(t: number, g = 0.06) {
    this.noise(t, 0.025, 'highpass', 9000, 9000, g, { a: 0.001 });
  }
  blip(t: number, f: number, g = 0.06, dur = 0.03) {
    this.syn(t, f, dur, g, { type: 'pulse', r: 0.01, wet: 0.05 });
  }

  /* phonk */
  /** an 808 cowbell, tuned: two square waves a fifth-and-a-bit apart through a band-pass, a sharp hit and a ringing tail */
  cowbell(t: number, m: number, g = 0.2, lp = 9000) {
    const c = this.c;
    const f = hz(m);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2.4;
    bp.Q.value = 1.1;
    const lo = c.createBiquadFilter();
    lo.type = 'lowpass';
    lo.frequency.value = lp;
    const e = c.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + 0.002);
    e.gain.setTargetAtTime(g * 0.32, t + 0.004, 0.018);
    e.gain.setTargetAtTime(0.0001, t + 0.05, 0.11);
    for (const k of [1, 1.4836]) {
      const s = c.createOscillator();
      s.type = 'square';
      s.frequency.value = f * k;
      s.connect(bp);
      s.start(t);
      s.stop(t + 0.7);
      this.keep(s);
    }
    bp.connect(lo).connect(e);
    e.connect(this.shaper());
    const w = c.createGain();
    w.gain.value = 0.25;
    e.connect(w);
    this.send(w, { wet: 0.5 });
  }
  /** the 808: a sine with a punch at the front and a long tail, sliding to `to` if given, driven so a phone can hear it */
  e808(t: number, m: number, dur: number, g = 0.45, to?: number) {
    const c = this.c;
    const s = c.createOscillator();
    s.type = 'sine';
    const f = hz(m);
    s.frequency.setValueAtTime(f * 2.2, t);
    s.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    if (to !== undefined) {
      s.frequency.setValueAtTime(f, t + dur * 0.55);
      s.frequency.exponentialRampToValueAtTime(hz(to), t + dur * 0.8);
    }
    const e = c.createGain();
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(g, t + 0.004);
    e.gain.setTargetAtTime(g * 0.6, t + 0.05, 0.25);
    e.gain.setValueAtTime(g * 0.5, t + dur);
    e.gain.linearRampToValueAtTime(0, t + dur + 0.06);
    s.connect(e).connect(this.shaper());
    s.start(t);
    s.stop(t + dur + 0.1);
    this.keep(s);
  }
  kick(t: number, g = 0.7) {
    this.syn(t, 150, 0.16, g, { type: 'sine', to: 44, glide: 0.12, r: 0.04, drive: true });
    this.noise(t, 0.012, 'highpass', 3000, 3000, g * 0.3, { a: 0.001 });
  }
  clap(t: number, g = 0.3) {
    for (let k = 0; k < 3; k++) this.noise(t + k * 0.011, 0.02, 'bandpass', 1500, 1500, g, { q: 1.2, a: 0.001 });
    this.noise(t + 0.033, 0.18, 'bandpass', 1400, 900, g * 0.8, { q: 1, a: 0.001, wet: 0.35 });
  }
  hat(t: number, g = 0.07, open = false) {
    this.noise(t, open ? 0.16 : 0.03, 'highpass', 7600, 7000, g, { a: 0.001 });
  }

  /** a line said by the arcade's speech chip */
  announce(t: number, text: string, g = 0.8) {
    this.say(t, (v: V) => v.speak(text, { f0: 96, rate: 0.95, rough: 0.35, growl: 0, breath: 0.15, dist: 4, gain: 0.75, wet: 0.35, fall: 0.35 }), g);
  }
  /** the Fourth speaks: its own voice from the game (several of it at once, a clock under it), a little quicker */
  fourth(t: number, line: string, rate = 0.85) {
    this.say(t, (v: V) => {
      const pre = 0.3;
      v.speak(line, { f0: 150, rate, rough: 0, breath: 1, dist: 1, gain: 0.18, wet: 0.95, fall: 0.05, pan: -0.45 });
      const main = v.speak(line, { f0: 46, rate, rough: 0.55, growl: 9, breath: 0.2, dist: 6, gain: 0.7, wet: 0.7, fall: 0.5 }, pre);
      v.speak(line, { f0: 30, rate, rough: 0.3, growl: 6, breath: 0, dist: 9, gain: 0.34, wet: 0.45, fall: 0.5, pan: 0.1 }, pre + 0.015);
      v.speak(line, { f0: 98, rate, rough: 0.7, growl: 23, breath: 0.6, dist: 2, gain: 0.13, wet: 1, fall: 0.3, pan: 0.5 }, pre + 0.38);
      v.rattle({ n: Math.max(2, Math.round((main + pre) * 1.6)), gap: 0.62, f: 1100, f2: 700, q: 9, gain: 0.07, dur: 0.05, wet: 0.8, type: 'bandpass', spread: 0.1 });
    }, 1.1);
  }

  /* shared moments */
  endCard(e: number, hearts = true) {
    this.on(e, (a) => {
      this.impact(a, 1.2);
      this.noise(a + 0.02, 0.5, 'bandpass', 3000, 600, 0.12, { a: 0.003, wet: 0.5 });
    });
    this.on(e + 1.55, (a) => this.ping(a, 1760, 0.05));
    if (hearts) {
      this.on(e + 2.25, (a) => this.heart(a, 0.3));
      this.on(e + 3.05, (a) => this.heart(a, 0.22));
    }
  }
  typing(t0: number, n: number, cps: number, g = 0.05) {
    for (let i = 0; i < n; i++) this.on(t0 + i / cps, (a) => this.noise(a, 0.018, 'bandpass', 3800 + this.rnd() * 1600, 3000, g, { q: 3, a: 0.001 }));
  }
  squeak(t: number, dur: number, g = 0.07) {
    this.on(t, (a) => this.noise(a, dur, 'bandpass', 1800, 4600, g, { q: 6, a: 0.01, swell: true }));
  }
  whoosh(t: number, g = 0.12, dur = 0.22) {
    this.on(t - dur, (a) => this.noise(a, dur, 'bandpass', 500, 5000, g, { rise: true, q: 1.5 }));
  }

  /* ------------------------------------------------------------------------------------------ the five */

  compose() {
    if (this.id === 'the-fourth') this.theFourth();
    if (this.id === 'fighter') this.fighter();
    if (this.id === 'secrets') this.secrets();
    if (this.id === 'phonk') this.phonk();
    if (this.id === 'lullaby') this.lullaby();
  }

  theFourth() {
    const C = this.C;
    const [f1, f2, f3, f4] = C.flashes as number[];
    this.on(0.02, (a) => this.air(a, C.freeze, 0.025, 800, 500, 0.7));
    // nothing moves: a tape stopping, then a ringing, and a clock
    this.on(C.freeze, (a) => {
      this.syn(a, 320, 0.5, 0.12, { type: 'sawtooth', to: 22, glide: 0.5, lp: 1200 });
      this.noise(a, 0.55, 'lowpass', 3000, 80, 0.16, { a: 0.005 });
      this.glitch(a - 0.02, 5, 0.1);
      this.ring(a + 0.5, 3900, 1.1, 0.04);
    });
    for (let k = 0; k < 3; k++) this.on(C.freeze + 0.5 + 0.32 * k, (a) => this.noise(a, 0.04, 'bandpass', 1100, 900, 0.06, { q: 9, a: 0.001, wet: 0.7 }));
    // the moon goes out; it unfolds
    this.on(C.unfold, (a) => {
      this.thud(a, 70, 28, 0.8, 0.5);
      this.glitch(a - 0.02, 6, 0.12);
      this.riser(a + 0.3, C.eye - C.unfold - 0.3, 0.1, 150, 2800);
    });
    this.on(C.unfold + 1.6, (a) => {
      this.impact(a, 0.7);
      this.bell(a, 2960, 3.2, 0.03, 0.95);
      this.bell(a + 0.05, 3136, 3.0, 0.028, 0.95);
    });
    // its eye: it opens; its heart; it speaks
    this.on(C.eye, (a) => {
      this.osc(a, 520, 0.9, 0.06, 'sine', { to: 1500, swell: true, a: 0.15, wet: 0.7 });
      this.noise(a, 0.8, 'bandpass', 2000, 7000, 0.06, { swell: true, a: 0.1, wet: 0.6 });
    });
    this.on(C.meant, (a) => this.fourth(a, 'You were never meant to leave.'));
    // where it takes them
    for (const f of [f1, f2, f3, f4]) this.on(f, (a) => {
      this.impact(a, 0.55);
      this.glitch(a, 5, 0.1, 0.2);
    });
    // typed on black
    this.typing(C.found + 0.15, 31, 30);
    // SOMETHING FOUND YOU
    this.on(C.foundYou, (a) => {
      this.impact(a, 1.35);
      this.glitch(a - 0.03, 6, 0.12);
      this.say(a + 0.25, (v: V) => v.fourthGrowl(), 1.1);
    });
    // its promise
    this.on(C.flee - 0.05, (a) => this.say(a, (v: V) => v.fourthRoar(), 0.8));
    this.on(C.flee, (a) => this.impact(a, 0.9));
    this.on(C.back + 0.3, (a) => this.fourth(a, 'I will come back.', 0.9));
    this.on(C.black, (a) => {
      this.glitch(a - 0.02, 5, 0.1);
      this.ring(a, 3100, 0.9, 0.03, 3060);
    });
    this.endCard(C.end);
    // the frames where the title is wrong
    for (const dt of [0.9, 2.3, 2.9]) this.on(C.end + dt, (a) => this.glitch(a, 4, 0.08, 0.14));
  }

  fighter() {
    const C = this.C;
    const B = 0.4;
    const Q = 0.1;
    // the screen coming on, the title typed
    this.on(0.02, (a) => {
      this.syn(a, 80, 0.3, 0.07, { type: 'square', to: 1600, glide: 0.3, lp: 4000 });
      this.noise(a, 0.25, 'highpass', 2000, 6000, 0.05, { a: 0.002 });
      this.thud(a, 90, 40, 0.2, 0.3);
    });
    for (let i = 0; i < 17; i++) this.on(0.25 + i / 40, (a) => this.blip(a, 1760 + (i % 3) * 220, 0.035, 0.022));
    for (let k = 0; k < 4; k++) this.on(0.8 + k * Q, (a) => this.chipSnare(a, 0.1 + 0.04 * k));
    // the theme: her lullaby, as a chiptune (A minor: Am F G E), while the cursor spins
    const ROOT = [45, 41, 43, 40];
    const TRIAD = [
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
      [52, 56, 59],
    ];
    const bars = [C.roll, C.roll + 1.6, C.roll + 3.2, C.roll + 4.8];
    bars.forEach((b0, bi) => {
      const end = Math.min(b0 + 1.6, C.pick);
      for (let s = 0; b0 + s * Q < end - 1e-6; s++) {
        const t = b0 + s * Q;
        if (s % 2 === 0) this.on(t, (a) => this.syn(a, hz(ROOT[bi]! + (s % 4 === 0 ? 0 : 12)), 0.17, 0.2, { type: 'triangle', r: 0.02 }));
        const tri = TRIAD[bi]!;
        const arp = [tri[0]! + 12, tri[1]! + 12, tri[2]! + 12, tri[0]! + 24][s % 4]!;
        this.on(t, (a) => this.syn(a, hz(arp), 0.08, 0.035, { type: 'pulse', r: 0.01, wet: 0.08 }));
        if (s % 8 === 0) this.on(t, (a) => this.chipKick(a));
        if (s % 8 === 4) this.on(t, (a) => this.chipSnare(a));
        if (s % 2 === 1) this.on(t, (a) => this.chipHat(a));
      }
      // the lead: four notes of the lullaby a bar, an octave up
      for (let k = 0; k < 4; k++) {
        const t = b0 + k * B;
        if (t >= C.pick - 0.05) break;
        const m = LULL[(bi % 2) * 4 + k]! + 12;
        this.on(t, (a) => this.syn(a, hz(m), 0.34, 0.07, { type: 'square', lp: 5000, r: 0.04, wet: 0.12 }));
      }
    });
    // the roulette's ticks, slowing (the same hops the picture uses)
    const path = 18;
    const hops: number[] = [];
    {
      let t = C.roll;
      let d = 0.115;
      for (let i = 0; i < path; i++) {
        hops.push(t);
        t += d;
        d *= 1.12;
      }
      const k = (C.pick - C.roll) / (hops[hops.length - 1]! - C.roll);
      for (let i = 0; i < hops.length; i++) hops[i] = C.roll + (hops[i]! - C.roll) * k;
    }
    hops.forEach((h, i) => this.on(h, (a) => this.blip(a, 1320 + (i % 2) * 180, 0.07, 0.03)));
    // picked: a bright jingle
    this.on(C.pick, (a) => {
      [69, 73, 76, 81].forEach((m, k) => this.syn(a + k * 0.05, hz(m + 12), 0.08, 0.08, { type: 'pulse', r: 0.02 }));
      this.syn(a + 0.2, hz(93), 0.3, 0.06, { type: 'square', lp: 6000, r: 0.1 });
    });
    // VERSUS: a pulsing bass, the slam, the crackle along the seam, the stat bars, a roll into FIGHT
    for (let t = C.vs; t < C.fight - 1e-6; t += Q) {
      const s = Math.round((t - C.vs) / Q);
      this.on(t, (a) => this.syn(a, hz(s % 4 === 0 ? 33 : 45), 0.08, s % 4 === 0 ? 0.26 : 0.14, { type: 'triangle', r: 0.02 }));
    }
    this.on(C.vsSlam, (a) => {
      this.impact(a, 1.1);
      for (const m of [45, 52, 57]) this.syn(a, hz(m), 0.5, 0.07, { type: 'square', lp: 1800, r: 0.3 });
      this.noise(a, 0.4, 'highpass', 4000, 1500, 0.2, { a: 0.002 });
    });
    for (let k = 0; k < 14; k++) {
      const t = C.vsSlam + 0.2 + k * 0.19 + 0.08 * Math.sin(k * 7);
      this.on(t, (a) => this.noise(a, 0.04, 'highpass', 6000, 3000, 0.05, { a: 0.001, pan: Math.sin(k) }));
    }
    for (let i = 0; i < 3; i++) this.on(C.stats + 0.15 + i * 0.3, (a) => this.syn(a, 300, 0.35, 0.05, { type: 'pulse', to: 1400, glide: 0.35, r: 0.02 }));
    for (let t = C.fight - 0.8; t < C.fight - 1e-6; t += 0.05) {
      const k = (t - (C.fight - 0.8)) / 0.8;
      this.on(t, (a) => this.chipSnare(a, 0.06 + 0.16 * k));
    }
    // FIGHT!
    this.on(C.fight, (a) => {
      this.impact(a, 1.1);
      for (const m of [57, 64, 69]) this.syn(a, hz(m), 0.4, 0.07, { type: 'square', lp: 3000, r: 0.2 });
      this.announce(a + 0.05, 'Fight!');
    });
    // the fight: faster, a blow on each cut
    for (let t = C.play[0]!; t < C.ko - 1e-6; t += Q) {
      const s = Math.round((t - C.play[0]!) / Q);
      this.on(t, (a) => this.syn(a, hz([45, 45, 48, 47][Math.floor(s / 4) % 4]! + (s % 2 ? 12 : 0)), 0.08, 0.18, { type: 'triangle', r: 0.02 }));
      if (s % 4 === 0) this.on(t, (a) => this.chipKick(a, 0.55));
      if (s % 4 === 2) this.on(t, (a) => this.chipSnare(a, 0.2));
      this.on(t, (a) => this.chipHat(a, 0.05));
    }
    for (const p of C.play as number[]) this.on(p, (a) => {
      this.impact(a, 0.5);
      this.noise(a, 0.08, 'bandpass', 3000, 800, 0.2, { a: 0.001 });
      this.syn(a, 900, 0.12, 0.08, { type: 'square', to: 120, glide: 0.12 });
    });
    // K.O.
    this.on(C.ko, (a) => {
      this.impact(a, 1.3);
      this.announce(a + 0.08, 'Kay. Oh!');
      [93, 88, 84, 81, 76, 72, 69, 64, 57].forEach((m, k) => this.syn(a + 0.25 + k * 0.05, hz(m), 0.06, 0.05, { type: 'pulse', r: 0.02 }));
    });
    // the locked card: two notes that should not be together; the lock rattling; something looking out
    this.on(C.locked + 0.05, (a) => {
      this.syn(a, hz(57), C.end - C.locked - 0.3, 0.03, { type: 'square', lp: 900, r: 0.2 });
      this.syn(a, hz(58), C.end - C.locked - 0.3, 0.03, { type: 'square', lp: 900, r: 0.2 });
    });
    for (const dt of [0.3, 0.55, 0.8, 1.05]) this.on(C.locked + dt, (a) => {
      this.noise(a, 0.06, 'bandpass', 2400, 1600, 0.12, { q: 2, a: 0.001 });
      this.clang(a, 0.12);
    });
    this.on(C.glimpse, (a) => {
      this.glitch(a - 0.02, 6, 0.14, 0.2);
      this.say(a + 0.02, (v: V) => v.fourthGrowl(), 1.2);
      this.noise(a, 0.4, 'lowpass', 2000, 100, 0.2, { a: 0.003 });
    });
    // the end: a level-clear jingle; then the attract screen's tune, and PRESS START
    this.on(C.end, (a) => {
      this.impact(a, 0.9);
      [69, 73, 76, 81].forEach((m, k) => this.syn(a + 0.05 + k * 0.08, hz(m + 12), 0.08, 0.08, { type: 'pulse', r: 0.02 }));
      for (const m of [69, 73, 76]) this.syn(a + 0.4, hz(m + 12), 0.6, 0.05, { type: 'square', lp: 5000, r: 0.3 });
    });
    for (let t = C.end + 1.2; t < C.fadeOut - 1e-6; t += Q) {
      const s = Math.round((t - (C.end + 1.2)) / Q);
      const tri = [[57, 61, 64], [54, 57, 61], [50, 54, 57], [52, 56, 59]][Math.floor(s / 8) % 4]!;
      this.on(t, (a) => this.syn(a, hz(tri[s % 3]! + 12), 0.08, 0.028, { type: 'pulse', r: 0.01, wet: 0.1 }));
      if (s % 4 === 0) this.on(t, (a) => this.syn(a, hz(tri[0]! - 12), 0.3, 0.12, { type: 'triangle', r: 0.05 }));
    }
    this.endCard(C.end, true);
    for (let t = C.end + 2.2; t < C.fadeOut; t += 0.8) this.on(t, (a) => this.blip(a, 1046, 0.03, 0.04));
  }

  secrets() {
    const C = this.C;
    // the hook: four glimpses; MISSED slapped on with a marker
    for (const t of [0.4, 0.8, 1.2]) this.whoosh(t, 0.08, 0.15);
    this.squeak(0.38, 0.25, 0.09);
    this.on(0.42, (a) => this.thud(a, 90, 40, 0.3, 0.5));
    this.whoosh(C.s5, 0.14, 0.3);
    // each number, stamped on
    for (const s of [C.s5, C.s4, C.s3, C.s2, C.s1]) this.on(s, (a) => {
      this.thud(a, 110, 45, 0.25, 0.55);
      this.noise(a, 0.08, 'bandpass', 1200, 600, 0.18, { a: 0.001 });
    });
    for (const s of [C.s4, C.s3, C.s2, C.s1]) this.whoosh(s, 0.12, 0.25);
    // the red pen
    this.squeak(C.s5 + 1.85, 0.35, 0.08);
    for (let i = 0; i < 4; i++) this.squeak(C.s4 + 1.1 + i * 0.4, 0.25, 0.07);
    this.squeak(C.s3 + 1.25, 0.35, 0.08);
    this.squeak(C.s3 + 1.4, 0.25, 0.06);
    for (const t of [C.s5 + 2.2, C.s3 + 2.25, C.s2 + 1.0, C.s2 + 2.25]) this.on(t, (a) => this.ping(a, 2093, 0.035));
    // the freeze frames: a camera's shutter
    for (const t of [C.s5 + 1.7, C.s4 + 1.0, C.s3 + 1.2]) this.on(t, (a) => {
      this.noise(a, 0.03, 'bandpass', 4000, 3000, 0.12, { q: 2, a: 0.001 });
      this.noise(a + 0.06, 0.04, 'bandpass', 3000, 2400, 0.1, { q: 2, a: 0.001 });
    });
    // the foot on the shield
    this.on(C.s3 + 2.19, (a) => {
      this.impact(a, 1.3);
      this.bell(a + 0.02, 1240, 1.4, 0.05, 0.6);
    });
    // number one: it tears; something growls; the file is typed and stamped
    this.on(C.s1 + 0.8, (a) => {
      this.glitch(a - 0.02, 7, 0.16, 0.2);
      this.noise(a, 0.8, 'bandpass', 3000, 800, 0.08, { a: 0.01 });
      this.say(a + 0.1, (v: V) => v.fourthGrowl(), 1.1);
    });
    this.on(C.s1 + 1.6, (a) => this.glitch(a - 0.02, 4, 0.08));
    this.typing(C.s1 + 1.6, 37, 40, 0.045);
    this.on(C.s1 + 2.5, (a) => {
      this.thud(a, 100, 36, 0.4, 0.8);
      this.noise(a, 0.12, 'bandpass', 900, 400, 0.3, { a: 0.001 });
    });
    this.endCard(C.end);
    this.squeak(C.end + 0.4, 0.4, 0.06);
    this.squeak(C.end + 2.15, 0.35, 0.08);
  }

  phonk() {
    const C = this.C;
    const B = 0.4;
    const Q = 0.1;
    const D = C.drop;
    // a crackle over the intro, as off a record
    this.on(0.01, (a) => this.noise(a, D, 'highpass', 3000, 2500, 0.025, { a: 0.05 }));
    for (let k = 0; k < 24; k++) this.on(0.03 + (k * 0.067 + 0.05 * Math.sin(k * 3.1)) % D, (a) => this.noise(a, 0.006, 'highpass', 5000, 5000, 0.08, { a: 0.0005 }));
    // the riff: two bars of her lullaby on the cowbell (sixteenth-note positions, MIDI notes)
    const RIFF: [number, number][][] = [
      [[0, 69], [3, 72], [6, 76], [8, 74], [11, 72], [14, 69]],
      [[0, 67], [3, 64], [6, 64], [8, 62], [10, 64], [12, 67], [14, 64]],
    ];
    const riff = (b0: number, bar: number, g: number, lp: number) => {
      for (const [p, m] of RIFF[bar % 2]!) this.on(b0 + p * Q, (a) => this.cowbell(a, m, g, lp));
    };
    // the intro: the riff, muffled, opening up; a breath in before the drop
    riff(0, 0, 0.13, 900);
    this.on(0.8, (a) => this.noise(a, 0.8, 'bandpass', 300, 6000, 0.1, { rise: true, q: 1.2 }));
    this.on(0.1, (a) => this.e808(a, 33, 0.7, 0.32));
    this.on(0.9, (a) => this.e808(a, 28, 0.6, 0.3));
    // the drop: five bars, then a breakdown
    const bars = Math.round((C.breakdown - D) / 1.6);
    const BASS: [number, number, number?][][] = [
      [[0, 33], [6, 33], [10, 29, 31]],
      [[0, 31], [6, 31], [10, 28]],
    ];
    for (let b = 0; b < bars; b++) {
      const b0 = D + b * 1.6;
      riff(b0, b, 0.2, 9000);
      for (const [p, m, to] of BASS[b % 2]!) {
        const next = BASS[b % 2]!.find(([q]) => q > p)?.[0] ?? 16;
        this.on(b0 + p * Q, (a) => {
          this.e808(a, m, (next - p) * Q - 0.02, 0.5, to);
          this.kick(a, 0.7);
        });
      }
      this.on(b0 + 8 * Q, (a) => this.clap(a, 0.32));
      for (let s = 0; s < 16; s += 2) this.on(b0 + s * Q, (a) => this.hat(a, s % 4 === 0 ? 0.07 : 0.045));
      // the rolls, every other bar
      if (b % 2 === 1) for (let k = 0; k < 8; k++) this.on(b0 + 12 * Q + k * 0.05, (a) => this.hat(a, 0.03 + 0.006 * k));
      if (b % 2 === 0) this.on(b0 + 14 * Q, (a) => this.hat(a, 0.06, true));
    }
    // the words, and every blow, hit harder
    for (const t of [C.words[0], C.words[1]]) this.on(t, (a) => {
      this.thud(a, 70, 32, 0.5, 0.45);
      this.noise(a - 0.1, 0.1, 'bandpass', 400, 3000, 0.08, { rise: true });
    });
    const hits = [D + 0.1, D + 2 * B + 0.27, D + 4 * B, D + 8 * B, C.words[4], C.words[4] + 0.4];
    for (const h of hits) {
      this.whoosh(h, 0.13, 0.2);
      this.on(h, (a) => this.impact(a, 0.75));
    }
    // breakdown: the tape stops; something warm, and the riff, far away
    this.on(C.breakdown, (a) => {
      this.syn(a, 260, 0.45, 0.1, { type: 'sawtooth', to: 25, glide: 0.45, lp: 1500 });
      this.noise(a, 0.45, 'lowpass', 2500, 80, 0.12, { a: 0.003 });
    });
    for (const m of [57, 61, 64, 69]) this.on(C.forThem - 0.15, (a) => this.osc(a, hz(m), C.end - C.forThem + 0.3, 0.05, 'sine', { swell: true, a: 0.6, wet: 0.6 }));
    riff(C.forThem, 0, 0.09, 2500);
    // the end: one more bar, full, then the 808 rings out
    this.on(C.end, (a) => {
      this.impact(a, 1.0);
      this.kick(a, 0.8);
      this.e808(a, 33, 1.5, 0.55);
      this.clap(a, 0.3);
    });
    riff(C.end + 0.2, 0, 0.16, 9000);
    for (let s = 0; s < 16; s += 2) this.on(C.end + 0.2 + s * Q, (a) => this.hat(a, 0.045));
    this.on(C.end + 1.8, (a) => {
      this.e808(a, 33, 1.8, 0.45, 21);
      this.kick(a, 0.6);
    });
  }

  lullaby() {
    const C = this.C;
    // a night: air, and crickets a long way off
    this.on(0.02, (a) => this.air(a, C.silence, 0.02, 700, 500, 0.6));
    for (let k = 0; k < 40; k++) {
      const t = 0.3 + k * 0.43 + 0.07 * Math.sin(k * 2.3);
      if (t > C.silence - 0.3) break;
      this.on(t, (a) => {
        for (let j = 0; j < 3; j++) this.osc(a + j * 0.045, 4700 + 80 * Math.sin(k), 0.025, 0.006, 'sine', { a: 0.003, wet: 0.6, pan: Math.sin(k * 1.7) * 0.7 });
      });
    }
    // the moon blinks: a breath drawn in, the lids, and something very low as it opens again
    this.on(C.silence + 0.05, (a) => this.noise(a, C.blink - C.silence, 'bandpass', 300, 2400, 0.04, { rise: true, q: 1 }));
    this.on(C.blink, (a) => {
      this.thud(a, 62, 30, 0.6, 0.35);
      this.noise(a, 0.2, 'lowpass', 600, 120, 0.12, { a: 0.003, wet: 0.5 });
    });
    this.on(C.blink + 0.4, (a) => {
      this.bell(a, 110, 2.6, 0.05, 0.9);
      this.osc(a, 55, 1.6, 0.18, 'sine', { swell: true, a: 0.5 });
    });
    this.endCard(C.end);
  }
}

async function renderShortSfx(cues: { id: string; length: number }): Promise<string> {
  const C = (shorts.shorts as Record<string, C>)[cues.id];
  if (!C) throw new Error(`no short ${cues.id}`);
  return renderScore(C.length as number, (h) => {
    const s = new ShortSfx(h);
    s.id = cues.id;
    s.C = C;
    return s;
  });
}

(window as unknown as { __renderShortSfx: typeof renderShortSfx }).__renderShortSfx = renderShortSfx;
