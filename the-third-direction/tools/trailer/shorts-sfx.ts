/**
 * The shorts' sound (trailer-video/src/shorts/, timed by trailer-video/src/data/shorts.json): the game's own sound kit and
 * monster voices for the sound design of all five, and, for the two that have no orchestra, the music itself, synthesised:
 *   fighter  a chiptune of her lullaby (pulse lead, a triangle bass, noise drums), an arcade's blips, and its speech chip
 *   phonk    the lullaby on an 808 cowbell, an 808 that slides, half-time trap drums, all of it driven into a little distortion
 *   villain  a Brazilian phonk: X's riff in A Phrygian on the cowbell, a carioca funk kick under a distorted 808, a record scratch,
 *            and the drop again a fourth higher once something is above him
 *   lofi     her lullaby as a lofi beat: a worn electric piano on Am9 Fmaj7 G6 Em7, a round bass, soft swung drums, rain, a record
 * and for the cartridge and the stream, the little game's own chip music (her lullaby in A major) under the orchestra's entrance;
 * for the wildlife film and the one take, a night of crickets, the Moonwell's bells, the moth's wings and X's breath; for the
 * skins reel, a night in the forest, a heartbeat and a climb, and a sound for each skin as it lands (the Explorer's wind and
 * the glint of his goggles, the Knight's sword, the Wizard's magic, Inferno catching fire), glass as each one breaks into 3D,
 * and for Golden a spotlight, gold dust and the crown coming down.
 *
 *   node tools/trailer/score-render.mjs <{"id": ..., "length": ...}.json> <out.wav> tools/trailer/shorts-sfx.ts __renderShortSfx
 */
import LAUNCH_VOICE from '../../../trailer-video/src/data/lines-launch.voice.json';
import NOIR_LINES from '../../../trailer-video/src/data/lines-noir.json';
import NOIR_VOICE from '../../../trailer-video/src/data/lines-noir.voice.json';
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
    if (this.id === 'cartridge') this.cartridge();
    if (this.id === 'live') this.stream();
    if (this.id === 'festival') this.festival();
    if (this.id === 'villain') this.villain();
    if (this.id === 'wild') this.wild();
    if (this.id === 'oner') this.oner();
    if (this.id === 'lofi') this.lofi();
    if (this.id === 'tarot') this.tarot();
    if (this.id === 'lineup') this.lineup();
    if (this.id === 'popup') this.popup();
    if (this.id === 'launch') this.launch();
    if (this.id === 'noir') this.noir();
    if (this.id === 'skins') this.skins();
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

  /* ------------------------------------------------------------------------------------------ the second four */

  /** a chip tune of her lullaby in A major, as the little game's own music: (from, to, how loud) */
  chipTheme(t0: number, t1: number, k = 1) {
    const Q = 0.1;
    const ROOT = [45, 42, 38, 40];
    const TRIAD = [
      [57, 61, 64],
      [54, 57, 61],
      [50, 54, 57],
      [52, 56, 59],
    ];
    const MAJOR = [69, 73, 76, 74, 73, 69, 68, 64];
    for (let s = 0; t0 + s * Q < t1 - 1e-6; s++) {
      const t = t0 + s * Q;
      const bar = Math.floor(s / 16) % 4;
      const tri = TRIAD[bar]!;
      if (s % 2 === 0) this.on(t, (a) => this.syn(a, hz(ROOT[bar]! + (s % 4 === 0 ? 0 : 12)), 0.17, 0.18 * k, { type: 'triangle', r: 0.02 }));
      this.on(t, (a) => this.syn(a, hz([tri[0]! + 12, tri[1]! + 12, tri[2]! + 12, tri[1]! + 12][s % 4]!), 0.07, 0.03 * k, { type: 'pulse', r: 0.01, wet: 0.08 }));
      if (s % 8 === 0) this.on(t, (a) => this.chipKick(a, 0.45 * k));
      if (s % 8 === 4) this.on(t, (a) => this.chipSnare(a, 0.18 * k));
      if (s % 2 === 1) this.on(t, (a) => this.chipHat(a, 0.05 * k));
      if (s % 4 === 0) {
        const m = MAJOR[(s / 4) % 8]! + 12;
        this.on(t, (a) => this.syn(a, hz(m), 0.32, 0.07 * k, { type: 'square', lp: 5000, r: 0.04, wet: 0.12 }));
      }
    }
  }

  /** glass cracking: a snap, a splinter of little ticks, a ringing */
  glassCrack(t: number, g = 1) {
    this.on(t, (a) => {
      this.noise(a, 0.09, 'highpass', 6000, 2500, 0.3 * g, { a: 0.001 });
      this.thud(a, 120, 50, 0.12, 0.35 * g);
      for (let k = 0; k < 9; k++) this.noise(a + 0.01 + k * 0.018 + 0.01 * this.rnd(), 0.01, 'bandpass', 3000 + this.rnd() * 6000, 3000, 0.08 * g, { q: 5, a: 0.0005, pan: this.rnd() * 2 - 1 });
      this.ring(a + 0.02, 4100 + 300 * this.rnd(), 0.5, 0.018 * g);
    });
  }

  /** everything flying apart: the blow, a rain of glass and plastic, the air rushing in */
  shatter(t: number) {
    this.on(t, (a) => {
      this.impact(a, 1.45);
      this.noise(a, 0.9, 'bandpass', 5000, 900, 0.28, { q: 0.7, a: 0.002, wet: 0.4 });
      for (let k = 0; k < 40; k++) this.noise(a + 0.02 + k * 0.02 + 0.03 * this.rnd(), 0.015, 'bandpass', 2500 + this.rnd() * 7000, 2500, 0.07, { q: 4, a: 0.0005, pan: this.rnd() * 2 - 1, wet: 0.4 });
    });
    this.whoosh(t, 0.16, 0.3);
  }

  cartridge() {
    const C = this.C;
    // a room at night
    this.on(0.02, (a) => this.air(a, C.burst, 0.016, 600, 400, 0.6));
    // the cartridge sliding down into the slot, and seating with a click
    this.on(0.04, (a) => this.noise(a, C.insert - 0.06, 'bandpass', 700, 1900, 0.05, { q: 2, a: 0.03, rise: true }));
    this.on(C.insert, (a) => {
      this.noise(a, 0.025, 'bandpass', 2600, 2200, 0.28, { q: 3, a: 0.001 });
      this.thud(a, 170, 70, 0.09, 0.32);
      this.noise(a + 0.06, 0.02, 'bandpass', 3600, 3200, 0.14, { q: 4, a: 0.001 });
    });
    // the power switch; the screen's hiss; the boot: the logo falling, the two-note chime
    this.on(C.power, (a) => {
      this.noise(a, 0.02, 'bandpass', 1900, 1600, 0.22, { q: 3, a: 0.001 });
      this.thud(a, 110, 60, 0.06, 0.16);
      this.noise(a + 0.03, C.boot - C.power, 'highpass', 4000, 6000, 0.03, { a: 0.01 });
    });
    this.on(C.boot, (a) => this.syn(a, hz(91), C.ding - C.boot - 0.04, 0.025, { type: 'pulse', to: hz(67), glide: C.ding - C.boot - 0.04, r: 0.02 }));
    this.on(C.ding, (a) => {
      this.syn(a, hz(83), 0.07, 0.09, { type: 'pulse', r: 0.02, wet: 0.2 });
      this.syn(a + 0.08, hz(88), 0.5, 0.09, { type: 'pulse', r: 0.25, wet: 0.3, decay: 0.18 });
    });
    this.on(C.title2, (a) => [69, 73, 76, 81].forEach((m, k) => this.syn(a + k * 0.045, hz(m + 12), 0.05, 0.05, { type: 'pulse', r: 0.02 })));
    // START
    this.on(C.start, (a) => {
      this.noise(a, 0.02, 'bandpass', 2200, 1800, 0.2, { q: 3, a: 0.001 });
      this.syn(a + 0.02, hz(81), 0.05, 0.06, { type: 'pulse', r: 0.01 });
      this.syn(a + 0.08, hz(93), 0.08, 0.06, { type: 'pulse', r: 0.02 });
    });
    // the little game's music, cheerful; until the stars are eyes, and it goes wrong
    this.chipTheme(C.play[0], C.eyes);
    this.on(C.eyes, (a) => {
      this.glitch(a - 0.02, 6, 0.14);
      this.syn(a, hz(81), 0.9, 0.06, { type: 'square', to: hz(57), glide: 0.9, lp: 3000, r: 0.1 });
      this.syn(a, hz(45), 1.4, 0.16, { type: 'triangle', to: hz(33), glide: 1.4, r: 0.1 });
    });
    // the cartridge's music stuck on one note, stuttering
    for (let k = 0; k < 10; k++) this.on(C.eyes + 0.6 + k * 0.08, (a) => this.blip(a, k % 3 === 0 ? 1244 : 1175, 0.035, 0.03));
    for (const c of C.cracks as number[]) this.glassCrack(c);
    // it breaks out
    this.shatter(C.burst);
    this.on(C.its, (a) => this.impact(a, 0.9));
    // the fight: a blow on each cut
    (C.battle as number[]).forEach((b, i) => {
      this.whoosh(b, 0.1, 0.16);
      this.on(b, (a) => this.impact(a, i === 0 ? 0.9 : 0.5));
    });
    this.on(C.fall, (a) => {
      this.impact(a, 1.2);
      this.thud(a + 0.05, 60, 28, 1.0, 0.5);
    });
    // back into the console: everything rushing in backwards, and a click
    this.on(C.back - 0.05, (a) => this.riser(a, 0.5, 0.12, 300, 5000));
    this.on(C.back + 0.5, (a) => {
      this.noise(a, 0.02, 'bandpass', 2400, 2000, 0.2, { q: 3, a: 0.001 });
      this.thud(a, 140, 70, 0.08, 0.2);
    });
    // your turn: a level-clear jingle; the little screen's tune, softly, on the call
    this.on(C.end + 0.4, (a) => {
      [69, 73, 76, 81].forEach((m, k) => this.syn(a + k * 0.07, hz(m + 12), 0.07, 0.07, { type: 'pulse', r: 0.02 }));
      for (const m of [69, 73, 76]) this.syn(a + 0.32, hz(m + 12), 0.5, 0.045, { type: 'square', lp: 5000, r: 0.3 });
    });
    this.chipTheme(C.end + 1.6, C.fadeOut, 0.35);
    this.endCard(C.end);
  }

  stream() {
    const C = this.C;
    // the count: three low beeps and a high one
    for (const t of [0.1, 0.4, 0.7]) this.on(t, (a) => this.syn(a, 880, 0.12, 0.09, { type: 'square', lp: 4000, r: 0.03 }));
    this.on(C.go, (a) => {
      this.syn(a, 1760, 0.32, 0.09, { type: 'square', lp: 6000, r: 0.08 });
      this.thud(a, 120, 50, 0.15, 0.3);
    });
    // the run, sped up: the game's chip music, a little faster and brighter than at home
    this.chipTheme(C.go, C.edge, 1.0);
    // a ding on every split
    for (const t of C.splits as number[]) this.on(t, (a) => {
      this.syn(a, hz(88), 0.05, 0.06, { type: 'pulse', r: 0.02, wet: 0.2 });
      this.syn(a + 0.06, hz(93), 0.22, 0.06, { type: 'pulse', r: 0.12, wet: 0.3, decay: 0.1 });
    });
    // the chat: a soft tick on each message, a rush of them when it goes 3D and when the record falls
    let t = 0.15;
    while (t < C.offline - 0.1) {
      const spam = (t > C.boom + 0.6 && t < C.boom + 1.4) || (t > C.wr + 0.1 && t < C.wr + 1.0) || (t > C.extra + 0.2 && t < C.extra + 1.4);
      const tt = t;
      this.on(tt, (a) => this.noise(a, 0.008, 'bandpass', 2600 + this.rnd() * 1200, 2600, spam ? 0.03 : 0.022, { q: 4, a: 0.0005, pan: 0.2 }));
      t += spam ? 0.09 : 0.33 + 0.12 * Math.sin(t * 7);
    }
    // the alerts: a follower; a subscriber; a tip; and something that has joined
    this.on(2.95, (a) => [76, 81].forEach((m, k) => this.syn(a + k * 0.09, hz(m + 12), 0.12, 0.04, { type: 'sine', r: 0.2, wet: 0.4 })));
    this.on(C.bosses[0] + 0.1, (a) => [69, 73, 76, 81].forEach((m, k) => this.syn(a + k * 0.08, hz(m + 12), 0.16, 0.05, { type: 'triangle', r: 0.25, wet: 0.45 })));
    this.on(C.bosses[1] + 0.4, (a) => {
      this.syn(a, hz(88), 0.06, 0.05, { type: 'square', lp: 6000, r: 0.02 });
      this.syn(a + 0.07, hz(95), 0.3, 0.05, { type: 'square', lp: 6000, r: 0.2, decay: 0.1 });
    });
    this.on(C.extra + 0.3, (a) => [81, 80, 76, 75].forEach((m, k) => this.syn(a + k * 0.12, hz(m + 12) * (1 - 0.01 * k), 0.3, 0.04, { type: 'triangle', r: 0.4, wet: 0.8 })));
    // the edge: the stars blink; the stream's picture cracks; it goes 3D
    this.on(C.edge, (a) => this.syn(a, hz(81), 0.6, 0.05, { type: 'square', to: hz(69), glide: 0.6, lp: 3000, r: 0.05 }));
    this.glassCrack(C.crack, 1.1);
    this.shatter(C.boom);
    // the bosses: a blow on each cut
    for (const b of [C.bosses[0], C.bosses[0] + 1.0, C.bosses[1], C.bosses[1] + 0.8, C.bosses[2], C.bosses[2] + 0.6, C.bosses[2] + 1.2]) {
      this.whoosh(b, 0.1, 0.16);
      this.on(b, (a) => this.impact(a, 0.5));
    }
    // the record: the blow, a bright chip fanfare, confetti popping
    this.on(C.wr, (a) => {
      this.impact(a, 1.1);
      [69, 73, 76, 81, 85, 88].forEach((m, k) => this.syn(a + 0.05 + k * 0.05, hz(m + 12), 0.06, 0.05, { type: 'pulse', r: 0.02 }));
      for (let k = 0; k < 24; k++) this.noise(a + 0.05 + k * 0.035 + 0.02 * this.rnd(), 0.012, 'bandpass', 1500 + this.rnd() * 3000, 1500, 0.05, { q: 3, a: 0.0005, pan: this.rnd() * 2 - 1 });
    });
    // the split nobody put there: it tears; the clock under it; something growls
    this.on(C.extra, (a) => {
      this.glitch(a - 0.02, 7, 0.16, 0.2);
      this.impact(a, 0.8);
      this.say(a + 0.6, (v: V) => v.fourthGrowl(), 0.9);
    });
    for (const dt of [0.5, 0.9]) this.on(C.extra + dt, (a) => this.glitch(a - 0.02, 5, 0.1, 0.16));
    for (let k = 0; k < 4; k++) this.on(C.extra + 0.2 + k * 0.3, (a) => this.noise(a, 0.04, 'bandpass', 1100, 900, 0.07, { q: 9, a: 0.001, wet: 0.7 }));
    // offline: the static, cut; then nothing but a ringing (and a whisper)
    this.on(C.offline, (a) => {
      this.noise(a, 0.35, 'highpass', 2000, 4000, 0.22, { a: 0.002 });
      this.syn(a + 0.35, 660, 0.25, 0.04, { type: 'square', to: 110, glide: 0.25, lp: 2000 });
      this.ring(a + 0.4, 3900, 1.0, 0.025);
    });
    // next runner: you
    this.endCard(C.end);
  }

  festival() {
    const C = this.C;
    // the projector: its motor, its gate clattering twenty-four times a second; stopping for the silence
    const projector = (t0: number, t1: number) => {
      this.on(t0, (a) => this.syn(a, 48, t1 - t0, 0.008, { type: 'sawtooth', lp: 200, a: 0.3, r: 0.4 }));
      for (let t = t0; t < t1 - 1e-6; t += 1 / 24) {
        const tt = t;
        this.on(tt, (a) => this.noise(a, 0.006, 'bandpass', 1800, 1800, 0.004 + 0.0015 * Math.sin(tt * 40), { q: 3, a: 0.0005 }));
      }
    };
    projector(0.0, C.hush);
    projector(C.laurels, C.fadeOut + 0.6);
    // a heart under the words, slowly quickening
    let h = C.cards[1] + 0.2;
    let gap = 1.0;
    while (h < C.hush - 0.2) {
      const g = 0.1 + 0.1 * ((h - C.cards[1]) / (C.hush - C.cards[1]));
      this.on(h, (a) => this.heart(a, g));
      h += gap;
      gap = Math.max(0.7, gap * 0.95);
    }
    // the hush: the projector slowing to a stop
    this.on(C.hush, (a) => this.syn(a, 48, 0.4, 0.008, { type: 'sawtooth', to: 20, glide: 0.4, lp: 200, r: 0.05 }));
    // a breath in, and the blow
    this.on(C.boom - 0.5, (a) => this.noise(a, 0.5, 'bandpass', 400, 7000, 0.12, { rise: true, q: 1 }));
    this.on(C.boom, (a) => {
      this.impact(a, 1.45);
      this.thud(a, 70, 28, 1.0, 0.5);
    });
    // everything, very fast
    for (const m of (C.montage as number[]).slice(1)) {
      this.whoosh(m, 0.1, 0.14);
      this.on(m, (a) => this.impact(a, 0.6));
    }
    // cut: a ringing in the black
    this.on(C.laurels, (a) => this.ring(a, 3900, 1.6, 0.03));
    // the reviews; the last one is wrong
    for (const q of (C.quotes as number[]).slice(0, 2)) this.on(q, (a) => this.ping(a, 1760, 0.025));
    this.on(C.quotes[2], (a) => {
      this.glitch(a, 4, 0.1, 0.12);
      this.say(a + 0.2, (v: V) => v.fourthGrowl(), 0.3);
    });
    // the title
    this.on(C.title2, (a) => {
      this.thud(a, 60, 26, 1.6, 0.6);
      this.bell(a + 0.1, 220, 3.5, 0.05, 0.9);
    });
  }

  villain() {
    const C = this.C;
    const B = C.beat;
    const Q = B / 4;
    const D = C.drop;
    const BAR = 4 * B;
    // his riff: A Phrygian, on the cowbell (sixteenth-note positions, MIDI notes); the twist takes it up a fourth
    const RIFF: [number, number][][] = [
      [[0, 69], [2, 70], [3, 69], [6, 67], [8, 69], [10, 72], [11, 70], [14, 69]],
      [[0, 69], [2, 70], [3, 69], [6, 67], [8, 64], [10, 65], [11, 64], [14, 62]],
    ];
    const riff = (b0: number, bar: number, g: number, lp: number, up = 0) => {
      for (const [p, m] of RIFF[bar % 2]!) this.on(b0 + p * Q, (a) => this.cowbell(a, m + up, g, lp));
    };
    // the funk under it: the kick on the off-beats a carioca's drum would play, the 808 under every kick, claps on two and four
    const KICKS: [number, number, number?][] = [
      [0, 33],
      [3, 33],
      [6, 33],
      [10, 34, 33],
      [12, 33],
    ];
    const bar = (b0: number, b: number, up = 0, heavy = false) => {
      riff(b0, b, heavy ? 0.24 : 0.2, 9000, up);
      KICKS.forEach(([p, m, to], i) => {
        const next = KICKS[i + 1]?.[0] ?? 16;
        this.on(b0 + p * Q, (a) => {
          this.e808(a, m + up, (next - p) * Q - 0.02, heavy ? 0.58 : 0.5, to !== undefined ? to + up : undefined);
          this.kick(a, 0.72);
        });
      });
      for (const p of [4, 12]) this.on(b0 + p * Q, (a) => this.clap(a, 0.34));
      // the tamborzão's toms, between
      for (const p of [7, 9, 15]) this.on(b0 + p * Q, (a) => this.syn(a, 190, 0.09, 0.22, { type: 'sine', to: 90, glide: 0.08, drive: true }));
      for (let s = 0; s < 16; s += heavy ? 1 : 2) this.on(b0 + s * Q, (a) => this.hat(a, s % 4 === 0 ? 0.07 : 0.04));
      if (b % 2 === 1) for (let k = 0; k < 6; k++) this.on(b0 + 13 * Q + k * Q / 2, (a) => this.hat(a, 0.03 + 0.008 * k));
    };
    // the intro: vinyl crackle, a drone, the riff muffled and opening up, a breath in before the drop
    this.on(0.01, (a) => this.noise(a, C.scratch + 0.5, 'highpass', 3000, 2500, 0.022, { a: 0.05 }));
    for (let k = 0; k < 40; k++) this.on(0.03 + ((k * 0.19 + 0.07 * Math.sin(k * 3.1)) % (C.end - 0.1)), (a) => this.noise(a, 0.006, 'highpass', 5000, 5000, 0.07, { a: 0.0005 }));
    this.on(0.02, (a) => this.syn(a, hz(33), D, 0.12, { type: 'sawtooth', lp: 300, a: 0.4, r: 0.1, drive: true }));
    riff(0, 0, 0.12, 700);
    riff(0 + BAR / 2, 1, 0.0, 0);
    this.on(D - 0.9, (a) => this.noise(a, 0.9, 'bandpass', 300, 6000, 0.12, { rise: true, q: 1.2 }));
    this.on(0.15, (a) => this.thud(a, 65, 30, 0.6, 0.45));
    // the drop: three bars of it
    for (let b = 0; b < 3; b++) bar(D + b * BAR, b, 0, b === 2);
    for (const t of [D, C.words[1], C.words[2]]) this.on(t, (a) => this.impact(a, t === D ? 1.2 : 0.7));
    for (const t of [D + 2 * B + 0.1, C.words[1] + 2 * B + 0.1]) this.on(t, (a) => this.impact(a, 0.55));
    // the record scratch: back, forth, and the tape stops; nothing but the crackle
    this.on(C.scratch, (a) => {
      this.noise(a, 0.12, 'bandpass', 600, 3000, 0.3, { q: 3, a: 0.002 });
      this.noise(a + 0.12, 0.1, 'bandpass', 3200, 500, 0.28, { q: 3, a: 0.002 });
      this.syn(a, 300, 0.35, 0.12, { type: 'sawtooth', to: 30, glide: 0.35, lp: 1500 });
    });
    // above him: something unfolds - a cold chord, its growl, a riser into the second drop
    this.on(C.twist, (a) => {
      this.impact(a, 0.9);
      this.glitch(a - 0.02, 6, 0.12);
      for (const m of [62, 63, 69, 74]) this.osc(a, hz(m), C.drop2 - C.twist + 0.2, 0.035, 'sine', { swell: true, a: 0.4, wet: 0.8 });
      this.say(a + 0.25, (v: V) => v.fourthGrowl(), 1.0);
      this.syn(a, hz(26), C.drop2 - C.twist, 0.3, { type: 'sine', a: 0.3, r: 0.05, drive: true });
    });
    riff(C.twist + 0.2, 0, 0.08, 2000, 5);
    this.on(C.drop2 - 0.7, (a) => this.riser(a, 0.7, 0.16, 200, 8000));
    // HAVE VILLAINS: the drop again, up a fourth, heavier
    const n2 = Math.round((C.end - C.drop2) / BAR + 0.49);
    for (let b = 0; b < n2; b++) {
      const b0 = C.drop2 + b * BAR;
      if (b0 >= C.end - 1e-6) break;
      bar(b0, b, 5, true);
    }
    for (let k = 0; k < 6; k++) this.on(C.drop2 + k * 2 * B, (a) => this.impact(a, k === 0 ? 1.3 : 0.55));
    // the end: one more blow, the 808 sliding down into the floor, the cowbell's last notes ringing out
    this.on(C.end, (a) => {
      this.impact(a, 1.1);
      this.kick(a, 0.8);
      this.e808(a, 38, 1.8, 0.6, 21);
      this.clap(a, 0.3);
    });
    for (const [k, m] of [[0, 74], [3, 75], [6, 74], [10, 72]] as const) this.on(C.end + 0.3 + k * Q * 1.6, (a) => this.cowbell(a, m, 0.12 - 0.02 * (k / 3), 4000));
    this.on(C.end + 0.6, (a) => {
      for (const m of [57, 58, 64]) this.osc(a, hz(m), C.fadeOut - C.end, 0.03, 'sine', { swell: true, a: 0.8, wet: 0.8 });
    });
    this.on(C.end + 1.55, (a) => this.ping(a, 1760, 0.04));
  }

  /* ------------------------------------------------------------------------------------------ the third batch */

  /** a night: air, and crickets, from t0 to t1 */
  night(t0: number, t1: number, g = 1) {
    this.on(t0 + 0.02, (a) => this.air(a, t1 - t0, 0.018 * g, 700, 500, 0.6));
    for (let k = 0; ; k++) {
      const t = t0 + 0.3 + k * 0.43 + 0.07 * Math.sin(k * 2.3);
      if (t > t1 - 0.3) break;
      this.on(t, (a) => {
        for (let j = 0; j < 3; j++) this.osc(a + j * 0.045, 4700 + 80 * Math.sin(k), 0.025, 0.006 * g, 'sine', { a: 0.003, wet: 0.6, pan: Math.sin(k * 1.7) * 0.7 });
      });
    }
  }

  /** a jelly's wobble: the Blob, being looked at */
  boing(t: number, g = 0.08) {
    this.on(t, (a) => {
      this.osc(a, 420, 0.22, g, 'sine', { to: 190, slide: 0.18, a: 0.004, wet: 0.2 });
      this.osc(a + 0.05, 300, 0.18, g * 0.5, 'sine', { to: 380, slide: 0.12, a: 0.004, wet: 0.2 });
    });
  }

  /** soft wings, beating */
  flutter(t0: number, t1: number, g = 0.02) {
    for (let t = t0; t < t1 - 1e-6; t += 1 / 22) {
      const tt = t;
      this.on(tt, (a) => this.noise(a, 0.02, 'bandpass', 700 + 300 * Math.sin(tt * 3), 600, g, { q: 1.5, a: 0.004, pan: 0.2 }));
    }
  }

  wild() {
    const C = this.C;
    const [moon, well, , face, peek, moth, tele, xface, cage, stomp, fight] = C.shots as number[];
    // the night, until the music turns
    this.night(0, tele + 0.4);
    // the Moonwell: a few high bells
    for (const [dt, f] of [[0.2, 2093], [0.7, 2637], [1.3, 3136], [1.9, 2794]] as const) this.on(well + dt, (a) => this.bell(a, f, 2.2, 0.018, 0.9));
    // the blob: it wobbles when it is named, and when it is called defenceless
    this.boing(face + 0.05, 0.07);
    this.boing(peek + 0.9, 0.06);
    // the moth's wings
    this.flutter(moth + 0.1, tele - 0.2);
    // not alone: the night goes quiet; something very big breathes, a long way off
    this.on(tele, (a) => this.thud(a, 50, 30, 1.6, 0.25));
    this.on(tele + 0.6, (a) => this.say(a, (v: V) => v.xBreath(), 0.5));
    this.on(xface + 0.05, (a) => this.thud(a, 60, 28, 1.2, 0.35));
    this.on(cage + 0.3, (a) => {
      this.noise(a, 1.2, 'bandpass', 900, 600, 0.02, { q: 6, a: 0.3, wet: 0.7 });
      this.bell(a + 0.6, 660, 2.0, 0.015, 0.9);
    });
    // his arm, sweeping in, in slow motion: the air pushed ahead of it, and the blow
    const land = stomp + C.slam;
    this.on(land - 0.6, (a) => this.noise(a, 0.6, 'lowpass', 200, 900, 0.12, { rise: true }));
    this.on(land, (a) => {
      this.impact(a, 1.25);
      this.thud(a, 48, 24, 1.8, 0.7);
      this.noise(a + 0.02, 1.4, 'lowpass', 1200, 90, 0.2, { a: 0.003, wet: 0.5 });
    });
    this.on(land + 0.35, (a) => this.say(a, (v: V) => v.xGrowl(0.8), 0.6));
    // it fights back
    for (const dt of [0.25, 0.75, 1.15]) {
      this.whoosh(fight + dt, 0.1, 0.16);
      this.on(fight + dt, (a) => this.impact(a, 0.45));
    }
    this.on(C.doesNot, (a) => {
      this.impact(a, 1.2);
      this.noise(a, 0.6, 'bandpass', 3000, 900, 0.1, { a: 0.003, wet: 0.5 });
    });
    for (const dt of [0.4, 0.9]) this.on(C.doesNot + dt, (a) => this.impact(a, 0.5));
    this.endCard(C.end, false);
    this.on(C.end + 0.3, (a) => this.air(a, C.fadeOut - C.end, 0.012, 700, 500, 0.6));
  }

  oner() {
    const C = this.C;
    const tk = C.take;
    const well = tk + (C.areas as [number, string][]).find(([, name]) => name === 'THE MOONWELL')![0];
    // the slate's clap: wood on wood, in a small room
    this.on(C.clap, (a) => {
      this.noise(a, 0.03, 'highpass', 1800, 1800, 0.55, { a: 0.0005 });
      this.noise(a, 0.12, 'bandpass', 1200, 900, 0.3, { q: 1.4, a: 0.0005, wet: 0.45 });
      this.thud(a, 180, 90, 0.06, 0.25);
    });
    // the night, until he is there
    this.night(tk, C.reveal);
    // out of the ferns
    for (let k = 0; k < 12; k++) this.on(tk + 0.1 + k * 0.17 + 0.05 * Math.sin(k), (a) => this.noise(a, 0.12, 'bandpass', 1500 + 900 * Math.sin(k * 2), 1200, 0.05, { q: 0.9, a: 0.01, pan: Math.sin(k * 1.3) * 0.6 }));
    // past the Blob (a wobble), past a standing stone
    this.boing(tk + 4.4, 0.05);
    this.whoosh(tk + 5.0, 0.1, 0.4);
    this.whoosh(tk + 7.0, 0.12, 0.5);
    // the Moonwell sings
    for (let k = 0; k < 7; k++) this.on(well + 0.2 + 0.4 * k, (a) => this.bell(a, [2093, 2637, 3136, 2349, 2794, 3520, 2637][k]!, 2.4, 0.016, 0.9));
    // up: the wind
    this.on(well + 1.5, (a) => this.air(a, C.roar - well - 1.5, 0.04, 400, 2400, 0.8));
    // he is there
    this.on(C.reveal, (a) => {
      this.impact(a, 1.3);
      this.say(a + 0.4, (v: V) => v.xBreath(), 0.8);
    });
    // and the camera goes to his eyes: something rising under everything, a heart
    this.on(C.reveal + 0.5, (a) => this.riser(a, C.roar - C.reveal - 0.55, 0.12, 120, 5000));
    let h = C.reveal + 1.2;
    let gap = 0.9;
    while (h < C.roar - 0.2) {
      const g = 0.3 + 0.25 * ((h - C.reveal) / (C.roar - C.reveal));
      this.on(h, (a) => this.heart(a, g));
      h += gap;
      gap = Math.max(0.36, gap * 0.85);
    }
    // he sees you
    this.on(C.roar, (a) => {
      this.impact(a, 1.4);
      this.say(a + 0.05, (v: V) => v.xRoar(), 1.0);
    });
    // black
    this.on(C.black, (a) => {
      this.impact(a, 1.0);
      this.glitch(a - 0.02, 5, 0.1);
      this.ring(a + 0.1, 3900, 1.0, 0.025);
    });
    this.endCard(C.end, false);
  }

  /** an electric piano, warm and a little worn: two sines and a bell, through a low-pass */
  rhodes(t: number, m: number, dur: number, g = 0.05, lp = 2200) {
    const f = hz(m);
    this.syn(t, f, dur, g, { type: 'sine', a: 0.006, decay: 0.9, r: 0.3, lp, wet: 0.35 });
    this.syn(t, f * 2.002, dur, g * 0.22, { type: 'sine', a: 0.004, decay: 0.4, r: 0.2, lp, wet: 0.35 });
    this.syn(t, f, dur, g * 0.12, { type: 'triangle', a: 0.006, decay: 0.7, r: 0.2, lp: lp * 0.7, wet: 0.35 });
    this.syn(t, f * 4.01, 0.12, g * 0.06, { type: 'sine', a: 0.002, decay: 0.05, r: 0.05, wet: 0.4 });
  }

  lofi() {
    const C = this.C;
    const BEAT = 0.75;
    const BAR = 4 * BEAT;
    const SW = 0.07;
    const quiet = (t: number) => t >= C.eye && t < C.eyeEnd;
    // her lullaby as a lofi beat: Am9, Fmaj7, G6, Em7
    const CH: [number, number[]][] = [
      [33, [60, 64, 67, 71]],
      [29, [57, 60, 64, 67]],
      [31, [59, 62, 64, 67]],
      [28, [55, 59, 62, 64]],
    ];
    // (beat, note): two bars of the tune, slow, a little behind the beat
    const TUNE: [number, number][][] = [
      [[0, 81], [1, 84], [2, 88]],
      [[0.5, 86], [1.5, 84], [2.5, 81]],
      [[0, 79], [1.5, 76]],
      [[3, 76]],
    ];
    // the rain and the record, all the way
    this.on(0.01, (a) => this.noise(a, C.fadeOut + 0.5, 'bandpass', 2400, 2400, 0.035, { q: 0.4, a: 0.6 }));
    this.on(0.01, (a) => this.noise(a, C.end + 0.5, 'highpass', 3500, 3000, 0.015, { a: 0.1 }));
    for (let k = 0; k < 70; k++) this.on(0.05 + ((k * 0.29 + 0.11 * Math.sin(k * 3.1)) % (C.fadeOut - 0.2)), (a) => this.noise(a, 0.005, 'highpass', 5000, 5000, 0.05, { a: 0.0005 }));
    for (let b0 = 0.2, bi = 0; b0 < C.end - 1e-6; b0 += BAR, bi++) {
      const [root, chord] = CH[bi % 4]!;
      if (!quiet(b0) && !quiet(b0 + BEAT)) {
        chord.forEach((m, k) => this.on(b0 + 0.018 * k, (a) => this.rhodes(a, m, BAR * 0.9, 0.042)));
      }
      // the bass, long and round
      for (const [bt, len] of [[0, 1.6], [2.5, 1.2]] as const) {
        const t = b0 + bt * BEAT;
        if (!quiet(t) && t < C.end) this.on(t, (a) => this.syn(a, hz(root + 12), len, 0.16, { type: 'sine', a: 0.01, decay: 0.8, r: 0.15, lp: 400, wet: 0.05 }));
      }
      // the drums: a soft kick on one and the and of two, the snare on two and four, swung hats
      for (let s = 0; s < 8; s++) {
        const t = b0 + s * (BEAT / 2) + (s % 2 ? SW : 0);
        if (quiet(t) || t >= C.end) continue;
        if (s === 0 || s === 3 || (s === 5 && bi % 2 === 1)) this.on(t, (a) => this.syn(a, 110, 0.16, 0.42, { type: 'sine', to: 42, glide: 0.12, lp: 900, r: 0.05 }));
        if (s === 2 || s === 6)
          this.on(t, (a) => {
            this.noise(a, 0.16, 'bandpass', 1700, 1200, 0.12, { q: 0.8, a: 0.002, wet: 0.3 });
            this.syn(a, 190, 0.05, 0.06, { type: 'triangle', to: 140, glide: 0.05, lp: 1500 });
          });
        this.on(t, (a) => this.noise(a, 0.025, 'highpass', 7000, 6500, s % 2 ? 0.022 : 0.032, { a: 0.001 }));
      }
      // the tune, on a bell-like piano an octave up
      for (const [bt, m] of TUNE[bi % 4]!) {
        const t = b0 + bt * BEAT + 0.03;
        if (!quiet(t) && t < C.end) this.on(t, (a) => this.rhodes(a, m, 1.3, 0.03, 3200));
      }
    }
    // the tape catches: everything sinks and stops; something low; the tape starts again
    this.on(C.eye, (a) => {
      this.syn(a, 260, 0.5, 0.1, { type: 'sawtooth', to: 25, glide: 0.5, lp: 1200 });
      this.noise(a, 0.5, 'lowpass', 2500, 80, 0.12, { a: 0.003 });
      this.glitch(a - 0.02, 5, 0.12, 0.14);
      this.say(a + 0.35, (v: V) => v.fourthGrowl(), 0.7);
    });
    this.on(C.eyeEnd - 0.25, (a) => this.syn(a, 40, 0.25, 0.08, { type: 'sawtooth', to: 300, glide: 0.25, lp: 1500 }));
    // the end: one last chord, rung out; the rain goes on a little
    this.on(C.end, (a) => {
      for (const [k, m] of [45, 60, 64, 67, 71, 76].entries()) this.rhodes(a + 0.03 * k, m, 3.6, 0.045);
      this.bell(a + 0.6, 1760, 2.4, 0.02, 0.9);
    });
  }

  /** a card: slid off the deck, a swish */
  cardSlide(t: number, g = 0.07) {
    this.on(t, (a) => this.noise(a, 0.18, 'bandpass', 2500, 5000, g, { q: 1.2, a: 0.01, rise: true }));
  }
  /** a card turned over: a snap, and the gilt ringing */
  cardFlip(t: number, g = 1) {
    this.on(t, (a) => {
      this.noise(a, 0.03, 'bandpass', 3000, 2400, 0.16 * g, { q: 2, a: 0.001 });
      this.thud(a, 140, 80, 0.06, 0.12 * g);
      [2637, 3136, 3951, 4699].forEach((f, k) => this.bell(a + 0.05 + k * 0.05, f, 1.6, 0.012 * g, 0.85));
    });
  }

  tarot() {
    const C = this.C;
    const cards = C.cards as number[];
    // candlelight: the air, a wick's crackle
    this.on(0.02, (a) => this.air(a, C.fadeOut, 0.014, 600, 450, 0.6));
    for (let k = 0; k < 30; k++) this.on(0.2 + k * 0.9 + 0.3 * Math.sin(k * 2.7), (a) => this.noise(a, 0.008, 'highpass', 3000, 3000, 0.03, { a: 0.0005 }));
    // the shuffle: two riffles; then the fan, card by card; one card lifted
    for (const r0 of [0.3, 0.85]) for (let k = 0; k < 16; k++) this.on(r0 + k * 0.028, (a) => this.noise(a, 0.012, 'bandpass', 3500 + 600 * Math.sin(k), 2500, 0.05, { q: 2, a: 0.0005, pan: k % 2 ? 0.3 : -0.3 }));
    for (const r0 of [0.72, 1.27]) this.on(r0, (a) => this.thud(a, 160, 90, 0.05, 0.12));
    for (let k = 0; k < 9; k++) this.cardSlide(C.fan + 0.08 * k, 0.04);
    this.on(C.pick, (a) => {
      for (let k = 0; k < 8; k++) this.bell(a + k * 0.045, 1760 * 2 ** (k / 7), 1.4, 0.012, 0.9);
    });
    // each card: off the deck, turned, and its boss speaks
    const VOICES: [(v: V) => void, number][][] = [
      [[(v) => v.motherWhispers(5), 3]],
      [[(v) => v.kingBellow(), 0.55]],
      [[(v) => v.queenToll(1, 1), 0.5]],
      [[(v) => v.wyrmScreech(0.9), 0.45]],
      [[(v) => v.mimicLaugh(), 0.9]],
      [[(v) => v.glassPing(), 2.2], [(v) => v.collectorChuckle(), 1.6]],
      [[(v) => v.mashRoar(), 1.2]],
    ];
    cards.forEach((c, i) => {
      if (i > 0) this.cardSlide(c + 0.02);
      this.cardFlip(c + 0.55);
      VOICES[i]!.forEach(([fn, g], k) => this.on(c + 0.75 + 0.35 * k, (a) => this.say(a, fn, g)));
    });
    // the Tower: it cracks, and everything shakes
    const tw = cards[cards.length - 1]! + 0.6;
    this.on(tw, (a) => {
      this.impact(a, 1.3);
      this.noise(a, 0.35, 'bandpass', 1800, 700, 0.18, { q: 0.8, a: 0.002 });
      for (let k = 0; k < 10; k++) this.noise(a + 0.02 + k * 0.025, 0.01, 'bandpass', 1500 + this.rnd() * 3000, 1500, 0.08, { q: 3, a: 0.0005 });
    });
    // the Fool: a held breath; it turns in a warm light; the Blob wobbles
    this.cardSlide(C.fool + 0.05, 0.05);
    this.cardFlip(C.fool + 0.95, 0.8);
    this.boing(C.fool + 1.25, 0.08);
    this.endCard(C.end, false);
  }

  /* ------------------------------------------------------------------------------------------ the lineup */

  /** a police siren's two tones, from t0 to t1, fading in and out */
  siren(t0: number, t1: number, g = 0.035) {
    const half = 0.36;
    for (let k = 0; t0 + k * half < t1; k++) {
      const t = t0 + k * half;
      const u = Math.min(1, (t - t0) / 0.4, (t1 - t) / 0.6);
      this.on(t, (a) => {
        this.osc(a, k % 2 ? 770 : 960, half * 1.05, g * u, 'square', { a: 0.02, lp: 2200, q: 0.8, wet: 0.45, pan: Math.sin(k * 0.7) * 0.5 });
        this.osc(a, (k % 2 ? 770 : 960) * 1.005, half * 1.05, g * u * 0.6, 'sawtooth', { a: 0.02, lp: 1600, wet: 0.45 });
      });
    }
  }
  /** a booking camera: the shutter, and the flash's whine charging back up */
  shutter(t: number, g = 1) {
    this.on(t, (a) => {
      this.noise(a, 0.012, 'highpass', 4000, 4000, 0.22 * g, { a: 0.0005 });
      this.noise(a + 0.045, 0.02, 'bandpass', 2600, 2200, 0.16 * g, { q: 2, a: 0.0008 });
      this.thud(a, 180, 120, 0.05, 0.08 * g);
      this.osc(a + 0.12, 2200, 0.7, 0.012 * g, 'sine', { to: 7600, a: 0.3, swell: true });
    });
  }
  /** a rubber stamp slammed on a desk */
  stampHit(t: number, g = 1) {
    this.on(t, (a) => {
      this.thud(a, 120, 52, 0.28, 0.7 * g);
      this.noise(a, 0.08, 'lowpass', 2400, 300, 0.4 * g, { a: 0.002, wet: 0.3 });
      this.noise(a + 0.01, 0.16, 'bandpass', 900, 500, 0.16 * g, { q: 1.2, a: 0.003 });
    });
  }

  lineup() {
    const C = this.C;
    const b = C.beat as number;
    const slots = C.slots as number[];
    // the hook: sirens, the radio, a stamp
    this.siren(0.0, slots[0]! + 0.1, 0.04);
    this.on(0.05, (a) => this.noise(a, 0.4, 'bandpass', 1800, 1400, 0.06, { q: 2, a: 0.01 }));
    this.on(0.1, (a) => this.osc(a, 1320, 0.09, 0.05, 'sine', { a: 0.003 }));
    this.on(0.22, (a) => this.osc(a, 1320, 0.09, 0.05, 'sine', { a: 0.003 }));
    this.on(b, (a) => this.thud(a, 140, 60, 0.3, 0.5));
    this.stampHit(2 * b, 1.1);
    this.on(3 * b, (a) => this.thud(a, 140, 60, 0.25, 0.4));
    // each booking: in on a whip, it lands; a flash; the letters go up; the evidence pinned; the profile, flashed
    const VOICES: [(v: V) => void, number][] = [
      [(v) => v.motherWhispers(5), 3],
      [(v) => v.kingBellow(), 0.55],
      [(v) => v.queenToll(1, 1), 0.5],
      [(v) => v.wyrmScreech(0.9), 0.45],
      [(v) => v.mimicLaugh(), 0.9],
      [(v) => v.collectorChuckle(), 1.6],
      [(v) => v.mashRoar(), 1.1],
    ];
    slots.forEach((t0, i) => {
      this.whoosh(t0 + 0.08, 0.1, 0.2);
      this.on(t0 + 0.2, (a) => this.thud(a, 110, 50, 0.22, 0.45));
      this.shutter(t0 + b, 1);
      this.typing(t0 + b + 0.05, 22, 60, 0.035);
      this.on(t0 + 2 * b, (a) => {
        this.noise(a, 0.05, 'bandpass', 1200, 700, 0.2, { q: 1, a: 0.002 });
        this.noise(a + 0.02, 0.02, 'highpass', 5000, 5000, 0.08, { a: 0.0008 });
      });
      this.on(t0 + 1.25 * b, (a) => this.say(a, VOICES[i]![0], VOICES[i]![1]));
      this.on(t0 + 3 * b - 0.05, (a) => this.noise(a, 0.1, 'bandpass', 700, 1400, 0.05, { q: 1, rise: true }));
      this.shutter(t0 + 3 * b, 0.85);
    });
    // X: the power dips; the lights stutter; the camera tilts up and up; his eyes
    this.whoosh(C.x + 0.08, 0.1, 0.2);
    this.on(C.x, (a) => {
      this.osc(a, 120, 0.9, 0.06, 'sawtooth', { to: 50, a: 0.01, lp: 600 });
      for (let k = 0; k < 9; k++) this.noise(a + 0.05 + k * 0.08 * (1 + 0.4 * Math.sin(k)), 0.02, 'bandpass', 3000, 2600, 0.07, { q: 3, a: 0.001 });
    });
    this.on(C.xTilt, (a) => {
      this.riser(a, C.xEyes - C.xTilt, 0.12, 120, 3800, [55, 220]);
      this.noise(a, C.xEyes - C.xTilt, 'lowpass', 200, 600, 0.12, { swell: true, a: (C.xEyes - C.xTilt) * 0.9, wet: 0.4 });
    });
    this.on(C.xEyes, (a) => {
      this.impact(a, 1.3);
      this.say(a + 0.1, (v: V) => v.xGrowl(1), 0.9);
    });
    this.shutter(C.xFlash, 1.1);
    this.on(C.xSay, (a) => this.say(a, (v: V) => v.xSpeak("Don't look up."), 1.1));
    // all eight: the sirens again, far off; the stamps
    this.siren(C.lineup + 0.2, C.wanted - 0.2, 0.012);
    this.stampHit(C.stamp1, 1.2);
    this.stampHit(C.stamp2, 1.1);
    this.on(C.stamp2 + 0.4, (a) => this.noise(a, 0.25, 'bandpass', 2600, 4200, 0.04, { q: 2, a: 0.01 }));
    // the wanted poster: it drops, swings, and is pinned at four corners
    this.on(C.wanted + 0.05, (a) => this.noise(a, 0.35, 'bandpass', 600, 2200, 0.12, { rise: true, q: 1 }));
    this.on(C.wanted + 0.4, (a) => {
      this.noise(a, 0.12, 'lowpass', 1800, 300, 0.25, { a: 0.002 });
      this.thud(a, 160, 80, 0.12, 0.2);
    });
    for (let k = 0; k < 4; k++)
      this.on(C.wanted + 0.45 + 0.12 * k, (a) => {
        this.noise(a, 0.015, 'highpass', 3500, 3500, 0.14, { a: 0.0005 });
        this.thud(a, 260, 160, 0.04, 0.08);
      });
    this.endCard(C.end, false);
  }

  /* ------------------------------------------------------------------------------------------ the pop-up book */

  /** a paper cut-out folding up off the page: a quick paper swish, and its little slap as it stands */
  fwip(t: number, g = 1) {
    this.on(t, (a) => {
      this.noise(a, 0.16, 'bandpass', 1400, 5200, 0.07 * g, { q: 1.4, rise: true, pan: this.rnd() * 0.8 - 0.4 });
      this.noise(a + 0.17, 0.035, 'bandpass', 2400, 1600, 0.12 * g, { q: 1.2, a: 0.001 });
      this.thud(a + 0.17, 220, 140, 0.05, 0.06 * g);
    });
  }
  /** a page turned: the paper lifting, the air under it, the page laid down */
  pageTurn(t: number, dur: number) {
    this.on(t, (a) => {
      this.noise(a, dur, 'bandpass', 900, 3800, 0.09, { q: 0.9, swell: true, a: dur * 0.6, wet: 0.2 });
      for (let k = 0; k < 6; k++) this.noise(a + 0.05 + k * 0.07, 0.03, 'bandpass', 2500 + this.rnd() * 2500, 2000, 0.03, { q: 2, a: 0.001 });
    });
    this.on(t + dur, (a) => {
      this.noise(a, 0.08, 'lowpass', 1800, 400, 0.12, { a: 0.002 });
      this.thud(a, 160, 90, 0.08, 0.1);
    });
  }

  popup() {
    const C = this.C;
    const sp = C.spreads as number[];
    const turns = C.turns as number[];
    const gd = C.guardians as number[];
    // a quiet room: a lamp's hum, a clock somewhere
    this.on(0.02, (a) => this.air(a, C.fadeOut, 0.012, 300, 260, 0.6));
    for (let k = 0; k < 36; k++) this.on(0.3 + k * 1.0, (a) => this.noise(a, 0.012, 'bandpass', 3200, 3000, 0.012, { q: 4, a: 0.0005, pan: 0.5 }));
    // the cover lifts, and the page stands
    this.on(C.open, (a) => {
      this.noise(a, 0.5, 'bandpass', 500, 1500, 0.06, { q: 1, swell: true, a: 0.3 });
      this.noise(a + 0.1, 0.4, 'bandpass', 2200, 1600, 0.025, { q: 3, swell: true, a: 0.2 });
    });
    this.on(sp[0]!, (a) => {
      this.thud(a, 140, 70, 0.12, 0.18);
      this.noise(a, 0.1, 'lowpass', 1500, 300, 0.1, { a: 0.002 });
    });
    // every cut-out standing up
    const pops = [sp[0]! + 0.05, sp[0]! + 0.15, sp[0]! + 0.25, sp[0]! + 0.45, sp[0]! + 0.55, sp[0]! + 0.65, sp[1]! + 0.1, sp[1]! + 0.15, sp[1]! + 0.2, sp[2]! + 0.1, ...gd, sp[3]! + 0.1, sp[4]! + 0.1, ...(C.two as number[]), sp[5]! + 0.1, sp[5]! + 0.25, sp[5]! + 0.35];
    pops.forEach((p) => this.fwip(p, 1));
    turns.forEach((t) => this.pageTurn(t, 0.7));
    // the eyes open in the dark; the parents are pulled off the page
    this.on(sp[1]! + 0.25, (a) => {
      this.say(a, (v: V) => v.xBreath(), 0.8);
      this.thud(a, 70, 40, 0.6, 0.25);
    });
    this.on(C.taken, (a) => {
      this.noise(a, 0.7, 'bandpass', 300, 2600, 0.12, { q: 1, rise: true });
      this.say(a + 0.3, (v: V) => v.xGrowl(0.6), 0.6);
    });
    // the guardians, each in its own voice
    const VOICES: [(v: V) => void, number][] = [
      [(v) => v.motherWhispers(4), 2.6],
      [(v) => v.kingBellow(), 0.5],
      [(v) => v.queenToll(1, 1), 0.45],
      [(v) => v.wyrmScreech(0.8), 0.4],
      [(v) => v.mimicLaugh(), 0.8],
    ];
    gd.forEach((g, i) => this.on(g + 0.35, (a) => this.say(a, VOICES[i]![0], VOICES[i]![1])));
    // the page tears
    this.on(C.tear, (a) => {
      for (let k = 0; k < 26; k++) {
        const tt = a + 0.7 * Math.pow(k / 26, 0.8);
        this.noise(tt, 0.03 + this.rnd() * 0.03, 'bandpass', 900 + this.rnd() * 3500, 1200 + this.rnd() * 2000, 0.07 + 0.05 * (k / 26), { q: 1.5, a: 0.001, pan: this.rnd() * 1.2 - 0.6 });
      }
      this.noise(a + 0.6, 0.15, 'lowpass', 2400, 500, 0.12, { a: 0.002 });
    });
    // X rises out of the book; his eyes
    this.on(C.rise, (a) => {
      this.riser(a, C.eyes - C.rise, 0.1, 100, 2800, [44, 176]);
      this.noise(a, C.eyes - C.rise, 'lowpass', 120, 500, 0.14, { swell: true, a: (C.eyes - C.rise) * 0.9, wet: 0.4 });
    });
    this.on(C.eyes, (a) => {
      this.impact(a, 1.2);
      this.say(a + 0.1, (v: V) => v.xGrowl(1), 0.9);
    });
    // two more
    this.on((C.two as number[])[0]! + 0.35, (a) => {
      this.say(a, (v: V) => v.glassPing(), 2);
      this.say(a + 0.25, (v: V) => v.collectorChuckle(), 1.4);
    });
    this.on((C.two as number[])[1]! + 0.35, (a) => this.say(a, (v: V) => v.mashRoar(), 1.0));
    // the book closes: the page laid down, the cover clapped shut
    this.on(C.close, (a) => this.noise(a, 0.7, 'bandpass', 3000, 700, 0.08, { q: 1, swell: true, a: 0.4 }));
    this.on(C.end, (a) => {
      this.thud(a, 120, 55, 0.25, 0.4);
      this.noise(a, 0.1, 'lowpass', 2600, 300, 0.22, { a: 0.002 });
    });
    this.on(C.end + 1.2, (a) => this.ping(a, 1760, 0.04));
  }

  /** the radio: the Quindar tones either side of a line (2525 Hz to talk, 2475 Hz to let go), and the hiss of the loop */
  quindar(t: number, dur: number) {
    this.on(t - 0.28, (a) => this.osc(a, 2525, 0.24, 0.035, 'sine', { a: 0.004, wet: 0.08 }));
    this.on(t, (a) => this.noise(a, dur, 'bandpass', 2600, 2400, 0.012, { q: 0.6, a: 0.03, wet: 0.05 }));
    this.on(t + dur + 0.05, (a) => this.osc(a, 2475, 0.24, 0.03, 'sine', { a: 0.004, wet: 0.08 }));
  }
  /** a monitor coming on: the click, the tube's whine, a bleep */
  crtOn(t: number, i: number) {
    this.on(t, (a) => {
      this.noise(a, 0.015, 'highpass', 3000, 3000, 0.08, { a: 0.0005, pan: i % 2 ? 0.45 : -0.45 });
      this.thud(a, 160, 90, 0.06, 0.05);
      this.osc(a + 0.02, 7800 + 120 * i, 0.5, 0.004, 'sine', { a: 0.05, pan: i % 2 ? 0.45 : -0.45 });
      this.osc(a + 0.05, 1200 + 90 * i, 0.06, 0.018, 'square', { a: 0.002, lp: 3000, pan: i % 2 ? 0.45 : -0.45 });
    });
  }

  launch() {
    const C = this.C;
    const gos = C.gos as number[];
    const cnt = C.count as number[];
    const ctl = C.control as number;
    // the night on the pad: crickets, the searchlights' hum
    this.night(0, ctl, 0.8);
    this.on(0.05, (a) => this.osc(a, 120, ctl - 0.2, 0.01, 'sawtooth', { a: 0.6, swell: true, lp: 500, wet: 0.3 }));
    // the radio, around every line but the numbers
    for (const v of LAUNCH_VOICE) if (!['c4', 'c5', 'c6'].includes(v.id)) this.quindar(v.at, v.dur);
    // NOW / ON / CRAZYGAMES
    this.whoosh(C.now, 0.12, 0.25);
    this.on(C.now, (a) => this.impact(a, 0.55));
    this.whoosh(C.now + 0.3, 0.06, 0.16);
    this.on(C.now + 0.3, (a) => this.thud(a, 140, 70, 0.12, 0.2));
    this.whoosh(C.crazy, 0.16, 0.3);
    this.on(C.crazy, (a) => {
      this.impact(a, 1.25);
      this.ring(a + 0.2, 3950, 1.6, 0.03);
      this.ring(a + 0.2, 3977, 1.5, 0.018);
    });
    // mission control: the room powers up, every monitor comes on, the room's hum and its computers
    this.on(ctl - 0.25, (a) => {
      this.noise(a, 0.3, 'bandpass', 300, 3000, 0.08, { rise: true, q: 1 });
      this.thud(a + 0.25, 90, 45, 0.3, 0.35);
    });
    this.on(ctl, (a) => this.osc(a, 60, cnt[0]! - ctl - 0.3, 0.02, 'sawtooth', { a: 0.4, swell: true, lp: 300, wet: 0.2 }));
    for (let i = 0; i < 8; i++) this.crtOn(ctl + 0.15 + 0.11 * i, i);
    for (let k = 0; k < 22; k++) {
      const t = ctl + 0.5 + k * 0.37 + 0.05 * Math.sin(k * 3.1);
      if (t > C.goForLaunch) break;
      this.on(t, (a) => this.osc(a, [1760, 2093, 1568, 2349][k % 4]!, 0.04, 0.006, 'sine', { a: 0.002, pan: Math.sin(k * 1.9) * 0.7, wet: 0.2 }));
    }
    // X's station: nothing but static, until he answers
    const xOn = ctl + 0.15 + 0.11 * 7;
    this.on(xOn, (a) => this.noise(a, gos[7]! - 0.35 - xOn, 'highpass', 3000, 2500, 0.022, { a: 0.05, pan: 0.45 }));
    // every station answers GO: the stamp, the green light's chirp, and the boss itself
    const VOICES: [(v: V) => void, number][] = [
      [(v) => v.motherLaugh(), 0.55],
      [(v) => v.kingSnort(2), 0.7],
      [(v) => v.queenToll(1.2, 0.8), 0.35],
      [(v) => v.wyrmScreech(0.6), 0.32],
      [(v) => v.mimicLaugh(), 0.5],
      [(v) => v.collectorChuckle(), 0.9],
      [(v) => v.mashRoar(), 0.5],
    ];
    gos.slice(0, 7).forEach((g, i) => {
      this.stampHit(g, 0.55);
      this.on(g, (a) => {
        this.osc(a + 0.02, 880 * 2 ** (i / 12), 0.06, 0.03, 'square', { a: 0.002, lp: 4000, pan: i % 2 ? 0.45 : -0.45 });
        this.osc(a + 0.09, 1320 * 2 ** (i / 12), 0.09, 0.03, 'square', { a: 0.002, lp: 4000, pan: i % 2 ? 0.45 : -0.45 });
      });
      this.on(g + 0.1, (a) => this.say(a, VOICES[i]![0], VOICES[i]![1]));
    });
    // X: his eyes open in the static, and he answers
    this.on(gos[7]! - 0.35, (a) => this.glitch(a, 6, 0.3, 0.12));
    this.on(gos[7]!, (a) => {
      this.impact(a, 0.9);
      this.say(a + 0.05, (v: V) => v.xGrowl(1), 0.85);
    });
    // GO FOR LAUNCH
    this.on(C.goForLaunch, (a) => {
      this.impact(a, 0.8);
      for (let k = 0; k < 3; k++) this.osc(a + k * 0.09, [1320, 1760, 2637][k]!, 0.12, 0.03, 'square', { a: 0.002, lp: 5000, wet: 0.3 });
    });
    // the CRT going off as we cut to the pad
    this.on(cnt[0]! - 0.35, (a) => this.osc(a, 3000, 0.3, 0.03, 'sine', { to: 200, a: 0.005 }));
    // the count: a tone on each number, the steam venting, the clamps letting go
    cnt.forEach((c) => {
      this.on(c, (a) => {
        this.osc(a, 1000, 0.18, 0.05, 'sine', { a: 0.003, wet: 0.2 });
        this.impact(a, 0.55);
      });
      this.whoosh(c, 0.08, 0.2);
    });
    this.on(cnt[0]! - 0.1, (a) => this.noise(a, C.ignition - cnt[0]! + 0.3, 'highpass', 2200, 1600, 0.05, { swell: true, a: 1.4, wet: 0.3 }));
    this.on(cnt[2]! + 0.55, (a) => this.clang(a, 0.22));
    // ignition: the engines catch and roar; liftoff; the climb, the air screaming past, faster
    const ign = C.ignition as number;
    const lo = C.liftoff as number;
    const sh = C.shatter as number;
    this.on(ign, (a) => {
      this.thud(a, 70, 30, 1.0, 0.5);
      this.noise(a, sh - ign, 'lowpass', 160, 520, 0.42, { swell: false, a: 0.6, wet: 0.2 });
      this.noise(a, sh - ign, 'bandpass', 900, 1500, 0.08, { a: 0.8, q: 0.6, wet: 0.2 });
    });
    for (let k = 0; ; k++) {
      const t = ign + 0.2 + k * 0.045;
      if (t > sh - 0.05) break;
      this.on(t, (a) => this.noise(a, 0.03, 'lowpass', 1800, 600, 0.06 + 0.04 * this.rnd(), { a: 0.002, pan: this.rnd() * 1.2 - 0.6 }));
    }
    this.on(lo, (a) => {
      this.impact(a, 1.3);
      this.noise(a, 1.2, 'lowpass', 3000, 200, 0.3, { a: 0.003, wet: 0.4 });
    });
    this.on(lo + 0.6, (a) => this.noise(a, sh - lo - 0.6, 'bandpass', 300, 3200, 0.1, { rise: true, q: 0.7, wet: 0.2 }));
    this.on(sh - 1.3, (a) => this.riser(a, 1.3, 0.14, 300, 8000, [110, 880]));
    // the sky breaks: glass, the blow, and the roar cut off by the quiet of space
    this.shatter(sh);
    this.glassCrack(sh, 1.2);
    this.on(sh + 0.05, (a) => {
      this.ring(a + 0.4, 3900, 2.4, 0.03);
      this.osc(a + 0.3, 55, 4.5, 0.06, 'sine', { a: 1.5, swell: true, wet: 0.5 });
    });
    // the bosses tumbling past (and two of them saying so); X looming; the portal
    [0.5, 1.1, 1.7, 2.3, 2.9, 3.5, 4.1].forEach((at, i) => this.on(sh + at + 0.9, (a) => this.noise(a, 0.45, 'bandpass', 600, 4200, 0.09, { rise: true, q: 1.4, pan: i % 2 ? 0.6 : -0.6 })));
    this.on(sh + 1.1 + 0.5, (a) => this.say(a, (v: V) => v.queenToll(1, 0.6), 0.25));
    this.on(sh + 4.1 + 0.6, (a) => this.say(a, (v: V) => v.mashRoar(), 0.4));
    this.on(sh + 3.2, (a) => this.say(a, (v: V) => v.xBreath(), 0.8));
    const po = C.portal as number;
    const wh = C.white as number;
    this.on(po, (a) => {
      this.riser(a, wh - po, 0.15, 200, 9000, [110, 880]);
      this.noise(a, wh - po, 'lowpass', 120, 600, 0.12, { swell: true, a: (wh - po) * 0.9, wet: 0.5 });
    });
    this.on(wh, (a) => {
      this.impact(a, 1.4);
      this.ring(a + 0.3, 3950, 2.0, 0.035);
    });
    // the end card: the button lands
    this.on(C.end + 1.3, (a) => {
      this.ping(a, 1760, 0.05);
      this.thud(a, 160, 90, 0.08, 0.12);
    });
  }

  /** rain: a hiss and a patter, from t0 to t1 (overlapping swells, so it holds steady) */
  rainBed(t0: number, t1: number, g = 1) {
    for (let t = t0 - 1.5; t < t1 - 0.5; t += 1.5) {
      this.on(Math.max(0.01, t), (a) => {
        this.noise(a, 3, 'bandpass', 4300, 3900, 0.05 * g, { q: 0.35, swell: true, a: 1.5, wet: 0.3 });
        this.noise(a, 3, 'lowpass', 900, 800, 0.035 * g, { swell: true, a: 1.5 });
      });
    }
    for (let k = 0; ; k++) {
      const t = t0 + 0.2 + k * 0.06 + 0.03 * Math.sin(k * 1.7);
      if (t > t1 - 0.2) break;
      this.on(t, (a) => this.noise(a, 0.012, 'bandpass', 2400 + this.rnd() * 5200, 3000, 0.03 * g * (0.3 + this.rnd()), { q: 5, a: 0.0005, pan: this.rnd() * 1.6 - 0.8, wet: 0.2 }));
    }
  }
  /** thunder: the crack, then the roll going away */
  thunder(t: number, g = 1) {
    this.on(t, (a) => {
      this.noise(a, 0.18, 'highpass', 2500, 1200, 0.25 * g, { a: 0.002 });
      this.thud(a, 70, 32, 1.2, 0.45 * g);
      this.noise(a + 0.05, 3.2, 'lowpass', 420, 70, 0.4 * g, { a: 0.1, wet: 0.5 });
      this.noise(a + 0.4, 2.2, 'lowpass', 260, 90, 0.25 * g, { swell: true, a: 0.6, wet: 0.6 });
    });
  }
  /** paper torn: fibres giving way one after another over `dur` */
  rip(t: number, dur: number, g = 1) {
    this.on(t, (a) => {
      const n = Math.round(dur * 40);
      for (let k = 0; k < n; k++) {
        const tt = a + dur * Math.pow(k / n, 0.85);
        this.noise(tt, 0.03 + this.rnd() * 0.03, 'bandpass', 900 + this.rnd() * 3600, 1300 + this.rnd() * 2000, (0.06 + 0.06 * (k / n)) * g, { q: 1.5, a: 0.001, pan: this.rnd() * 1.2 - 0.6 });
      }
      this.noise(a + dur - 0.05, 0.15, 'lowpass', 2400, 500, 0.12 * g, { a: 0.002 });
    });
  }
  /** a comic panel slammed down on the page */
  slam(t: number, g = 1) {
    this.on(t, (a) => {
      this.thud(a, 130, 55, 0.22, 0.55 * g);
      this.noise(a, 0.07, 'lowpass', 2600, 400, 0.3 * g, { a: 0.002, wet: 0.25 });
      this.noise(a, 0.03, 'highpass', 3500, 3500, 0.12 * g, { a: 0.001 });
    });
  }

  noir() {
    const C = this.C;
    const panels = C.panels as number[];
    const gd = C.guardians as number[];
    const color = C.color as number[];
    // the rain: all night, except in the colour behind the page
    this.rainBed(0, C.tear as number, 1);
    this.rainBed(C.splash as number, C.fadeOut as number, 1);
    this.rainBed(C.up as number, C.tear as number, 0.9);
    (C.thunder as number[]).forEach((t, i) => this.thunder(t, i ? 1.1 : 0.9));
    // a neon sign buzzing somewhere on the cover
    this.on(0.05, (a) => this.osc(a, 120, C.flip, 0.012, 'sawtooth', { a: 0.4, swell: true, lp: 1400, wet: 0.3, pan: 0.5 }));
    // the sticker, slapped on
    this.on(C.sticker, (a) => {
      this.noise(a, 0.06, 'bandpass', 1300, 700, 0.3, { q: 0.9, a: 0.001 });
      this.thud(a, 150, 70, 0.14, 0.4);
      this.noise(a + 0.05, 0.25, 'bandpass', 3000, 2000, 0.05, { q: 2, a: 0.01 });
    });
    this.whoosh(C.sticker, 0.1, 0.18);
    // the narrator's captions, typed as he speaks; the caption of the first panel
    for (const v of NOIR_VOICE) {
      if (v.id === 'n11') continue;
      const ln = NOIR_LINES.find((l) => l.id === v.id)!;
      const cps = Math.max(24, ln.caption.length / (v.dur * 0.8));
      this.typing(v.at - 0.05, Math.min(ln.caption.length, Math.floor(cps * (v.dur + 0.4))), cps, 0.035);
    }
    this.typing(panels[0]! + 0.1, 35, 26, 0.03);
    // the cover opens; the camera moves from panel to panel; the page turns
    this.pageTurn(C.flip, 0.5);
    panels.slice(1).forEach((p) => this.whoosh(p + 0.2, 0.05, 0.3));
    this.pageTurn(C.turn, 0.5);
    // the photograph torn in two; the eyes open in the dark
    this.rip(panels[2]! + 0.7, 0.3, 1.2);
    this.on(panels[3]! + 0.25, (a) => {
      this.thud(a, 60, 34, 0.9, 0.35);
      this.say(a + 0.05, (v: V) => v.xBreath(), 0.9);
    });
    // the guardians, slammed down one by one, each in its own voice
    const VOICES: [(v: V) => void, number][] = [
      [(v) => v.motherWhispers(3), 2.2],
      [(v) => v.kingBellow(), 0.5],
      [(v) => v.queenToll(1, 1), 0.45],
      [(v) => v.wyrmScreech(0.8), 0.4],
      [(v) => v.mimicLaugh(), 0.8],
    ];
    gd.forEach((g, i) => {
      this.whoosh(g, 0.09, 0.18);
      this.slam(g, 0.9);
      this.on(g + 0.08, (a) => this.say(a, VOICES[i]![0], VOICES[i]![1]));
    });
    // he looks up: the rain in his face, his heart; the crack of light; the page tears open
    const up = C.up as number;
    const crack = C.crack as number;
    const tear = C.tear as number;
    this.on(up + 0.1, (a) => this.noise(a, 1.8, 'bandpass', 600, 5000, 0.08, { rise: true, q: 0.8, wet: 0.3 }));
    [0, 0.85, 1.6].forEach((d) => this.on(up + 0.3 + d, (a) => this.heart(a, 0.35)));
    this.on(crack, (a) => {
      this.noise(a, 0.5, 'bandpass', 2000, 6000, 0.08, { q: 3, a: 0.01 });
      for (let k = 0; k < 10; k++) this.osc(a + k * 0.05, 300 + 900 * this.rnd(), 0.04, 0.02, 'square', { a: 0.002, lp: 4000, pan: this.rnd() - 0.5 });
      this.riser(a, tear - crack, 0.15, 300, 9000, [110, 880]);
    });
    this.rip(tear - 0.15, 0.55, 1.6);
    this.on(tear, (a) => {
      this.impact(a, 1.3);
      this.ring(a + 0.3, 3950, 1.6, 0.025);
    });
    this.whoosh(tear + 0.1, 0.16, 0.4);
    // the colour: the panels fly in, the Collector's machinery, the Mash
    this.whoosh(color[0]!, 0.12, 0.35);
    this.on(color[0]! + 0.2, (a) => {
      this.clang(a, 0.4);
      this.say(a + 0.15, (v: V) => v.collectorChuckle(), 1.2);
    });
    this.whoosh(color[1]!, 0.12, 0.35);
    this.on(color[1]! + 0.2, (a) => this.say(a, (v: V) => v.mashRoar(), 0.8));
    // X: the blow, his growl; FOUND YOU, in his own voice
    const sp = C.splash as number;
    this.on(sp, (a) => {
      this.impact(a, 1.2);
      this.say(a + 0.3, (v: V) => v.xGrowl(0.8), 0.7);
    });
    this.on(C.found as number, (a) => {
      this.impact(a, 1.1);
      this.say(a + 0.05, (v: V) => v.xSpeak('Found you.'), 1.1);
    });
    // the back cover: the sticker again; a bell on the typewriter
    this.on(C.end + 0.4, (a) => {
      this.noise(a, 0.06, 'bandpass', 1300, 700, 0.3, { q: 0.9, a: 0.001 });
      this.thud(a, 150, 70, 0.14, 0.45);
    });
    this.whoosh(C.end + 0.4, 0.1, 0.18);
    this.on(C.end + 1.3, (a) => this.ping(a, 2093, 0.035));
  }


  /** a little jelly landing: a soft low thump and a wet squish */
  squish(t: number, g = 1) {
    this.on(t, (a) => {
      this.thud(a, 150, 60, 0.18, 0.4 * g);
      this.noise(a, 0.12, 'lowpass', 1800, 300, 0.16 * g, { a: 0.003, wet: 0.2 });
      this.osc(a + 0.02, 320, 0.16, 0.05 * g, 'sine', { to: 160, slide: 0.12, a: 0.004 });
    });
  }

  /** gold dust in a beam of light: a few tiny high bells */
  twinkles(t0: number, t1: number, n: number, g = 0.02) {
    for (let k = 0; k < n; k++) {
      const t = t0 + ((t1 - t0) * (k + 0.5 * this.rnd())) / n;
      const f = 2600 + this.rnd() * 3800;
      this.on(t, (a) => this.ping(a, f, g * (0.6 + 0.4 * this.rnd())));
    }
  }

  /** what each skin sounds like as it lands */
  skinSound(i: number, t: number) {
    if (i === 0) {
      // the Explorer: a gust of wind, his scarf in it, the glint of his goggles
      this.on(t, (a) => this.noise(a, 1.5, 'bandpass', 380, 1500, 0.09, { swell: true, a: 0.5, q: 0.9, wet: 0.4 }));
      this.flutter(t + 0.15, t + 1.2, 0.022);
      this.on(t + 0.45, (a) => this.ping(a, 3520, 0.06));
      this.on(t + 0.47, (a) => this.ping(a, 5274, 0.03));
    } else if (i === 1) {
      // the Knight: a sword drawn (a swish and the ring of the steel), and a clank of armour
      this.on(t, (a) => {
        this.noise(a, 0.35, 'highpass', 2500, 7000, 0.12, { rise: true, q: 1 });
        this.ring(a + 0.33, 2480, 1.6, 0.05, 2510);
        this.ring(a + 0.33, 3720, 1.2, 0.025);
        this.noise(a + 0.33, 0.06, 'bandpass', 4200, 3000, 0.16, { q: 2, a: 0.001 });
      });
      this.on(t + 0.12, (a) => this.clang(a, 0.22));
    } else if (i === 2) {
      // the Wizard: a run of little bells going up, and shimmer
      for (let k = 0; k < 9; k++) this.on(t + 0.05 * k, (a) => this.ping(a, hz([74, 77, 81, 86, 89, 93, 98, 101, 105][k]!), 0.045));
      this.on(t, (a) => this.noise(a, 1.4, 'bandpass', 3000, 9000, 0.05, { swell: true, a: 0.3, q: 1.2, wet: 0.7 }));
      this.on(t + 0.05, (a) => this.osc(a, 220, 1.1, 0.05, 'sine', { to: 880, slide: 0.9, swell: true, a: 0.4, wet: 0.6 }));
    } else if (i === 3) {
      // Inferno: fire catching (a rush of air, low), then crackling, and something growling under it
      this.on(t, (a) => {
        this.noise(a, 0.9, 'lowpass', 300, 2400, 0.3, { swell: true, a: 0.25, wet: 0.3 });
        this.thud(a, 70, 34, 0.9, 0.35);
        this.osc(a + 0.1, 55, 1.3, 0.12, 'sawtooth', { lp: 220, swell: true, a: 0.4 });
      });
      for (let k = 0; k < 26; k++) {
        const dt = 0.2 + k * 0.055 + 0.03 * Math.sin(k * 7.1);
        this.on(t + dt, (a) => this.noise(a, 0.012, 'bandpass', 1800 + 2600 * Math.abs(Math.sin(k * 3.3)), 1500, 0.06, { q: 3, a: 0.0005, pan: Math.sin(k * 2.1) * 0.6 }));
      }
    }
  }

  /** the flat Blob breaks into 3D: glass, a burst of little blocks, a drop in the floor */
  popTo3d(t: number, g = 1) {
    this.glassCrack(t, 0.8 * g);
    this.on(t, (a) => {
      this.thud(a, 90, 30, 0.7, 0.5 * g);
      for (let k = 0; k < 22; k++) this.noise(a + 0.01 + k * 0.012, 0.012, 'bandpass', 900 + this.rnd() * 5000, 900, 0.06 * g, { q: 5, a: 0.0005, pan: this.rnd() * 2 - 1, wet: 0.3 });
      this.osc(a, 1200, 0.25, 0.03 * g, 'square', { to: 300, slide: 0.2, a: 0.002, lp: 2600 });
    });
    this.on(t + 0.05, (a) => this.noise(a, 0.9, 'bandpass', 6000, 2000, 0.05 * g, { a: 0.003, wet: 0.7 }));
  }

  skins() {
    const C = this.C;
    const [rv, pop] = [C.reveals as number[], C.pop as number];
    // the cold open: a whoosh and a glint for each skin as it flashes past, the first one hit hard
    this.on(C.flashes[0], (a) => this.impact(a, 0.9));
    (C.flashes as number[]).forEach((t, i) => {
      // (the first starts with the film: its whoosh cannot begin before it)
      if (t > 0.15) this.whoosh(t, 0.14, 0.14);
      this.on(t, (a) => this.ping(a, [1760, 2093, 2349, 2637, 3520][i]!, 0.05));
    });
    this.on(C.coldOut - 0.32, (a) => this.noise(a, 0.3, 'highpass', 1500, 9000, 0.18, { rise: true, q: 0.8 }));
    this.on(C.coldOut + 0.02, (a) => this.ring(a, 3900, 0.9, 0.02));
    // the small light: it glows; a night in the forest around it
    this.on(C.light, (a) => {
      this.ping(a, 1318, 0.05);
      this.osc(a, 110, 2.4, 0.05, 'sine', { swell: true, a: 1.0 });
    });
    this.night(C.light + 0.2, C.dim + 0.4, 0.9);
    this.on(C.light + 0.5, (a) => this.air(a, C.dim - C.light, 0.022, 520, 900, 0.7));
    // the aurora: air full of light
    this.on(C.aurora - 0.4, (a) => this.noise(a, 2.6, 'bandpass', 2400, 7000, 0.05, { swell: true, a: 1.2, q: 0.7, wet: 0.8 }));
    this.twinkles(C.aurora, C.aurora + 4.5, 8, 0.016);
    // but tonight: the wind drops; a heartbeat, quickening
    this.on(C.dim, (a) => this.thud(a, 70, 40, 0.8, 0.25));
    [0.2, 1.0, 1.7, 2.3, 2.8].forEach((dt, i) => this.on(C.dim + dt, (a) => this.heart(a, 0.22 + 0.05 * i)));
    // the climb, and the drop
    this.on(C.rise, (a) => this.riser(a, C.drop - C.rise - 0.02, 0.2, 300, 9000, [110, 880]));
    this.on(C.drop, (a) => {
      this.impact(a, 1.3);
      this.noise(a, 1.2, 'bandpass', 6000, 1500, 0.1, { a: 0.003, wet: 0.6 });
    });
    // each reveal: the curtain of light sweeps across, the Blob lands in its new skin, its sound; then it breaks into 3D
    rv.forEach((t0, i) => {
      this.whoosh(t0, 0.2, 0.32);
      this.squish(t0 + 0.12, 0.9);
      this.skinSound(i, t0 + 0.14);
      this.popTo3d(t0 + pop, 1);
      this.whoosh(t0 + pop, 0.12, 0.2);
    });
    // Golden: a spotlight thrown on; dust in its beam; the crown coming down, a shimmer rising to it; it lands
    this.on(C.spot, (a) => {
      this.thud(a, 95, 60, 0.2, 0.45);
      this.noise(a, 0.03, 'highpass', 3000, 3000, 0.18, { a: 0.001 });
      this.osc(a + 0.05, 100, C.crown - C.spot, 0.012, 'sawtooth', { lp: 400, swell: true, a: 0.3 });
    });
    this.twinkles(C.spot + 0.3, C.crown - 0.2, 16, 0.018);
    this.on(C.phrases.g1[2] - 0.2, (a) => this.riser(a, C.crown - C.phrases.g1[2] + 0.17, 0.08, 800, 8000, [440, 1760]));
    this.on(C.crown, (a) => {
      this.impact(a, 1.1);
      for (let k = 0; k < 18; k++) this.ping(a + 0.03 + k * 0.045, 2093 * 2 ** ((k % 6) / 6 + Math.floor(k / 6) * 0.5), 0.04 - k * 0.0015);
      this.noise(a, 1.6, 'bandpass', 7000, 3000, 0.06, { a: 0.003, wet: 0.8 });
    });
    // the five on their carousel: a sweep as it turns in; the end: each little Blob pops up in turn, and one last glint
    this.whoosh(C.carousel, 0.16, 0.4);
    this.on(C.carousel, (a) => this.noise(a, 1.8, 'bandpass', 4000, 9000, 0.04, { swell: true, a: 0.6, wet: 0.7 }));
    for (let k = 0; k < 5; k++) this.boing(C.end + 0.3 + 0.13 * k, 0.05);
    this.on(C.end, (a) => this.noise(a, 0.6, 'bandpass', 3000, 700, 0.08, { a: 0.003, wet: 0.5 }));
    this.on(C.phrases.e2[1] + 1.3, (a) => this.ping(a, 2637, 0.045));
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
