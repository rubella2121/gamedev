/**
 * The trailer's music: a 48-second score made of oscillators and noise, played on the WebAudio clock.
 *
 * It reads the same cue sheet as the picture (cues.ts), so a hit lands on its cut. The key is A minor, the key of the game's own
 * music-box lullaby: the score starts with that tune, lets the shadow warp it, and gives it back at the end. Everything is
 * planned ahead of time (`AHEAD` seconds of the future at a time), so a slow frame on a phone never moves a note.
 *
 *   0 - 2     black, a low swell, the card
 *   2 - 10    the clearing: the lullaby, then the shadow (a heartbeat, a riser) and the foot
 *   10 - 12   ringing silence, a crater, red eyes
 *   12 - 20   five places, five cuts, a pulse that climbs
 *   20 - 28   the five guardians: a name slams in on every cut, each in its own voice
 *   28 - 33   the Edge: the stars go out one by one, you look up, the screen cracks
 *   33 - 38   the boom, the world rebuilt, the claw tip, X
 *   38 - 44   the title, then the other two bosses
 *   44 - 48   the end card: the lullaby again, in tune, and one heartbeat
 *
 * Tools (tools/scorelab.ts) render it on an offline context and report loudness per second and a spectrogram.
 */
import { Voice } from '../core/voice';
import { CUE } from './cues';
import type { ScoreLike } from './trailer';

export interface ScoreHost {
  ctx: BaseAudioContext;
  /** where the score is plugged in: the game's score bus, or a test's destination */
  out: AudioNode;
  noise: AudioBuffer;
}

/** seconds between asking for the score and its first sound (the picture waits `AUDIO_LEAD` in trailer.ts for the same reason) */
const LEAD = 0.1;
/** how far into the future the notes are turned into audio nodes */
const AHEAD = 1.4;
const TICK_MS = 120;

type Opt = {
  /** slide the pitch to this frequency (over `slide` seconds, default the whole sound) */
  to?: number;
  slide?: number;
  /** attack seconds */
  a?: number;
  /** a linear swell in and out instead of a struck sound */
  swell?: boolean;
  lp?: number;
  q?: number;
  /** cents */
  det?: number;
  /** reverb send, 0..1 */
  wet?: number;
  pan?: number;
  /** skip the ducks (the ringing in the silences) */
  post?: boolean;
};

/** MIDI note number to Hz (69 is A4) */
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** a small seeded random, so the score sounds the same every time it plays */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** a big dark room: noise that fades out and gets duller as it goes */
function hall(c: BaseAudioContext, secs: number, decay: number, rnd: () => number): AudioBuffer {
  const sr = c.sampleRate;
  const n = Math.floor(sr * secs);
  const b = c.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      lp += (rnd() * 2 - 1 - lp) * (0.5 - 0.42 * u);
      d[i] = lp * Math.pow(1 - u, decay) * Math.min(1, i / 240);
    }
  }
  return b;
}

export class TrailerScore implements ScoreLike {
  private readonly c: BaseAudioContext;
  private bus!: GainNode;
  private duckG!: GainNode;
  private postG!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private verb!: ConvolverNode;
  private voice!: Voice;
  private rnd = seeded(7);
  /** the audio time of T = 0 */
  private t0 = 0;
  private ev: { t: number; fn: () => void }[] = [];
  private next = 0;
  private timer = 0;
  private live = new Set<AudioScheduledSourceNode>();
  private dead = false;

  constructor(private h: ScoreHost) {
    this.c = h.ctx;
  }

  /* ------------------------------------------------------------------------------------------ */
  /* ScoreLike: what the trailer asks of it                                                       */
  /* ------------------------------------------------------------------------------------------ */

  /** Start the score. Returns the audio time of T = 0. */
  start(): number {
    this.begin(this.c.currentTime + LEAD);
    this.pump();
    this.timer = window.setInterval(() => this.pump(), TICK_MS);
    return this.t0;
  }

  /** Fade out and let go (the player skipped). */
  stop(fade = 0.35) {
    if (this.dead) return;
    this.dead = true;
    window.clearInterval(this.timer);
    const now = this.c.currentTime;
    for (const g of [this.bus, this.postG]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + fade);
    }
    window.setTimeout(() => {
      for (const s of this.live) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      this.live.clear();
      this.limiter.disconnect();
    }, fade * 1000 + 80);
  }

  /** (tools) build the graph with T = 0 at the given audio time, without starting the clock that feeds it */
  begin(t0: number) {
    this.t0 = t0;
    this.build();
  }

  /** (tools) turn everything that falls before this audio time into nodes */
  pumpTo(until: number) {
    while (this.next < this.ev.length && this.t0 + this.ev[this.next]!.t <= until) this.ev[this.next++]!.fn();
  }

  private pump() {
    this.pumpTo(this.c.currentTime + AHEAD);
  }

  /* ------------------------------------------------------------------------------------------ */
  /* the graph                                                                                    */
  /* ------------------------------------------------------------------------------------------ */

  private build() {
    const c = this.c;
    this.rnd = seeded(7);
    this.ev = [];
    this.next = 0;
    this.dead = false;
    // notes -> bus -> duck -> limiter -> out. The duck is how the score goes quiet on cue; the ringing goes round it.
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.15;
    this.limiter.connect(this.h.out);
    this.duckG = c.createGain();
    this.duckG.connect(this.limiter);
    this.bus = c.createGain();
    this.bus.connect(this.duckG);
    this.postG = c.createGain();
    this.postG.connect(this.limiter);
    this.verb = c.createConvolver();
    this.verb.buffer = hall(c, 3.4, 2.2, this.rnd);
    const wet = c.createGain();
    wet.gain.value = 0.85;
    this.verb.connect(wet).connect(this.bus);
    this.voice = new Voice(c, this.bus, this.h.noise);
    this.voice.maxActive = 60;
    this.compose();
    this.ev.sort((a, b) => a.t - b.t);
  }

  /** a thing to do when the score reaches `t` (it is made a moment early, then plays at its own time) */
  private at(t: number, fn: () => void) {
    this.ev.push({ t, fn });
  }

  /** the audio time of a moment in the trailer */
  private A(t: number) {
    return this.t0 + t;
  }

  /** everything goes quiet from `t`: it falls over `fall` seconds, stays quiet for `hold`, and comes back over `rise` */
  private duck(t: number, fall: number, hold: number, rise: number) {
    const p = this.duckG.gain;
    p.setValueAtTime(1, t);
    p.linearRampToValueAtTime(0.0, t + fall);
    p.setValueAtTime(0, t + fall + hold);
    p.linearRampToValueAtTime(1, t + fall + hold + rise);
  }

  /* ------------------------------------------------------------------------------------------ */
  /* sound building blocks (every one takes the audio time it starts at)                          */
  /* ------------------------------------------------------------------------------------------ */

  private keep(s: AudioScheduledSourceNode) {
    this.live.add(s);
    s.addEventListener('ended', () => this.live.delete(s));
  }

  private send(n: AudioNode, o: Opt) {
    const c = this.c;
    let tail = n;
    if (o.pan && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      n.connect(p);
      tail = p;
    }
    tail.connect(o.post ? this.postG : this.bus);
    if (o.wet) {
      const s = c.createGain();
      s.gain.value = o.wet;
      tail.connect(s).connect(this.verb);
    }
  }

  private shape(p: AudioParam, t: number, dur: number, g: number, a: number, swell?: boolean) {
    const at = Math.min(a, dur * 0.5);
    if (swell) {
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(g, t + at);
      p.linearRampToValueAtTime(0, t + dur);
    } else {
      p.setValueAtTime(0.0001, t);
      p.exponentialRampToValueAtTime(Math.max(0.0002, g), t + at);
      p.exponentialRampToValueAtTime(0.0001, t + dur);
    }
  }

  private osc(t: number, f: number, dur: number, g: number, type: OscillatorType = 'sine', o: Opt = {}) {
    const c = this.c;
    const s = c.createOscillator();
    s.type = type;
    s.frequency.setValueAtTime(f, t);
    if (o.to) s.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.slide ?? dur));
    if (o.det) s.detune.value = o.det;
    const e = c.createGain();
    this.shape(e.gain, t, dur, g, o.a ?? 0.012, o.swell);
    let tail: AudioNode = s.connect(e);
    if (o.lp) {
      const f2 = c.createBiquadFilter();
      f2.type = 'lowpass';
      f2.frequency.value = o.lp;
      f2.Q.value = o.q ?? 1;
      tail = tail.connect(f2);
    }
    this.send(tail, o);
    s.start(t);
    s.stop(t + dur + 0.06);
    this.keep(s);
  }

  /** filtered noise whose filter sweeps from f0 to f1; `rise` makes it grow instead of die away */
  private noise(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, g: number, o: Opt & { rise?: boolean } = {}) {
    const c = this.c;
    const s = c.createBufferSource();
    s.buffer = this.h.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const e = c.createGain();
    if (o.rise) {
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), t + dur * 0.97);
      e.gain.linearRampToValueAtTime(0, t + dur);
    } else this.shape(e.gain, t, dur, g, o.a ?? 0.008, o.swell);
    s.connect(f).connect(e);
    this.send(e, o);
    s.start(t, this.rnd() * 1.5);
    s.stop(t + dur + 0.06);
    this.keep(s);
  }

  /** a sine falling from f0 to f1, with its octave on top so a phone speaker (which cannot play the low note) still hears it */
  private thud(t: number, f0: number, f1: number, dur: number, g: number) {
    this.osc(t, f0, dur, g, 'sine', { to: f1, a: 0.006 });
    this.osc(t, f0 * 2.1, dur * 0.5, g * 0.5, 'triangle', { to: f1 * 2.1, a: 0.004, lp: 520 });
  }

  /** a thin ringing, like after a loud noise: it hardly fades, then goes (it plays around the ducks) */
  private ring(t: number, f: number, dur: number, g: number, to?: number) {
    const c = this.c;
    const s = c.createOscillator();
    s.type = 'sine';
    s.frequency.setValueAtTime(f, t);
    if (to) s.frequency.linearRampToValueAtTime(to, t + dur);
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + 0.05);
    e.gain.exponentialRampToValueAtTime(g * 0.3, t + dur - 0.2);
    e.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(e);
    this.send(e, { post: true });
    s.start(t);
    s.stop(t + dur + 0.05);
    this.keep(s);
  }

  /** something enormous lands. `p` is how enormous (1 is the biggest in the opening). */
  private impact(t: number, p = 1) {
    this.thud(t, 84, 26, 1.5 * p + 0.3, 0.8 * p);
    this.noise(t, 1.2 * p + 0.2, 'lowpass', 4200, 70, 0.62 * p, { wet: 0.35, a: 0.004 });
    this.noise(t, 0.09, 'highpass', 3000, 3000, 0.4 * p, { a: 0.002 });
    if (p > 0.6) this.bell(t, 110, 1.6, 0.05 * p, 0.5);
  }

  /** a church bell with a minor third in it: it tolls like a warning */
  private bell(t: number, f: number, dur: number, g: number, wet = 0.7) {
    const parts: [number, number, number][] = [
      [0.5, 0.5, 1],
      [1, 1, 0.9],
      [1.2, 0.55, 0.75],
      [1.5, 0.35, 0.55],
      [2, 0.3, 0.4],
      [2.5, 0.18, 0.28],
      [3, 0.1, 0.2],
      [4.1, 0.07, 0.12],
    ];
    for (const [r, a, d] of parts) this.osc(t, f * r, dur * d, g * a, 'sine', { a: 0.003, wet });
  }

  /** one struck note of the lullaby's music box (the same three partials the game's own lullaby uses, plus a little pluck) */
  private box(t: number, m: number, g = 0.2, cents = 0, wet = 0.6) {
    const f = hz(m);
    this.osc(t, f, 2.2, g, 'sine', { a: 0.004, wet, det: cents });
    this.osc(t, f * 2, 1.0, g * 0.38, 'sine', { a: 0.003, wet, det: cents });
    this.osc(t, f * 3.01, 0.4, g * 0.16, 'triangle', { a: 0.002, wet, det: cents });
    this.noise(t, 0.02, 'highpass', 5200, 5200, g * 0.08, { a: 0.002 });
  }

  /** a short, dry-ish bell tone for running figures */
  private pluck(t: number, m: number, g = 0.06) {
    this.osc(t, hz(m), 0.42, g, 'triangle', { a: 0.003, wet: 0.4 });
  }

  private ping(t: number, f: number, g = 0.08) {
    this.osc(t, f, 1.5, g, 'sine', { to: f * 0.93, slide: 0.18, a: 0.002, wet: 0.85 });
    this.osc(t, f * 2.76, 0.45, g * 0.3, 'sine', { a: 0.002, wet: 0.85 });
  }

  /** lub-dub */
  private heart(t: number, g = 0.5) {
    this.thud(t, 64, 38, 0.2, g);
    this.thud(t + 0.16, 58, 36, 0.2, g * 0.62);
  }

  /** a soft chord: every note is two slightly detuned oscillators, swelling in and out */
  private pad(t: number, dur: number, notes: number[], g: number, type: OscillatorType, lp: number, o: Opt = {}) {
    for (const m of notes) for (const det of [-7, 7]) this.osc(t, hz(m), dur, g / (notes.length * 1.6), type, { swell: true, a: o.a ?? dur * 0.45, lp, det, wet: o.wet ?? 0.4 });
  }

  /** the brass blast of every trailer: saws through a closing low-pass, a fifth, an octave, and a sine underneath */
  private braam(t: number, m: number, dur: number, g: number) {
    const c = this.c;
    const f = hz(m);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(Math.min(9000, f * 20), t);
    lp.frequency.exponentialRampToValueAtTime(f * 2.6, t + dur * 0.8);
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(g, t + 0.05);
    e.gain.exponentialRampToValueAtTime(g * 0.55, t + dur * 0.4);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const mix = c.createGain();
    mix.gain.value = 0.2;
    mix.connect(lp).connect(e);
    const voices: [number, number, number][] = [
      [1, 1, -9],
      [1, 1, 9],
      [1.5, 0.55, 0],
      [2, 0.6, 4],
      [0.5, 0.8, 0],
    ];
    for (const [r, a, det] of voices) {
      const s = c.createOscillator();
      s.type = 'sawtooth';
      s.frequency.value = f * r;
      s.detune.value = det;
      const v = c.createGain();
      v.gain.value = a;
      s.connect(v).connect(mix);
      s.start(t);
      s.stop(t + dur + 0.06);
      this.keep(s);
    }
    this.send(e, { wet: 0.35 });
    this.osc(t, f / 2, dur * 0.9, g * 0.9, 'sine', { a: 0.02 });
  }

  /** a rising whoosh of noise, with an optional pitch gliding up under it */
  private riser(t: number, dur: number, g: number, f0 = 260, f1 = 7000, tone?: [number, number]) {
    this.noise(t, dur, 'bandpass', f0, f1, g, { rise: true, q: 3, wet: 0.25 });
    if (tone) this.osc(t, tone[0], dur, g * 0.35, 'sawtooth', { to: tone[1], swell: true, a: dur * 0.95, lp: 3000, wet: 0.3 });
  }

  /** a breath of wind */
  private air(t: number, dur: number, g: number, f0: number, f1: number, q = 0.8) {
    this.noise(t, dur, 'bandpass', f0, f1, g, { swell: true, a: dur * 0.5, q, wet: 0.5 });
  }

  /** a stutter, like the picture tearing */
  private glitch(t: number, n: number, span: number, g = 0.18) {
    for (let i = 0; i < n; i++) {
      const tt = t + (span * i) / n;
      this.noise(tt, 0.03, 'bandpass', 800 + this.rnd() * 5000, 800 + this.rnd() * 5000, g, { q: 6, a: 0.002 });
      if (i % 2 === 0) this.osc(tt, 180 + this.rnd() * 900, 0.025, g * 0.5, 'square', { a: 0.002, lp: 3000 });
    }
  }

  private taiko(t: number, g = 0.7, f = 78) {
    this.thud(t, f * 1.5, f * 0.62, 0.38, g);
    this.noise(t, 0.22, 'lowpass', 900, 160, g * 0.35, { wet: 0.35, a: 0.003 });
    this.noise(t, 0.03, 'bandpass', 2200, 1800, g * 0.18, { a: 0.001, q: 2 });
  }

  /** a metal hit on the off beats */
  private clang(t: number, g = 0.3) {
    this.noise(t, 0.16, 'bandpass', 2400, 1500, g, { q: 1.2, wet: 0.35, a: 0.002 });
    this.bell(t, 330, 0.7, g * 0.22, 0.5);
  }

  private tick(t: number, g = 0.07) {
    this.noise(t, 0.035, 'bandpass', 6400, 5000, g, { q: 4, a: 0.001 });
  }

  private bass(t: number, m: number, g = 0.22, dur = 0.19) {
    this.osc(t, hz(m), dur, g, 'sawtooth', { a: 0.005, lp: 520, q: 2 });
    this.osc(t, hz(m), dur, g * 0.6, 'sine', { a: 0.005 });
  }

  /** a monster voice from the game's own voice kit, placed at an exact time */
  private say(t: number, fn: (v: Voice) => void, level = 1) {
    const v = this.voice;
    const keep = v.level;
    v.clock = t;
    v.level = keep * level;
    try {
      fn(v);
    } finally {
      v.clock = null;
      v.level = keep;
    }
  }

  /* ------------------------------------------------------------------------------------------ */
  /* the music, in the order the picture plays it                                                 */
  /* ------------------------------------------------------------------------------------------ */

  private compose() {
    const bar = CUE.zoneCuts[1] - CUE.zoneCuts[0];
    const beat = bar / 4;
    this.card();
    this.clearing();
    this.crater();
    this.montage(bar, beat);
    this.guardians(bar, beat);
    this.edge();
    this.boom();
    this.title();
    this.bosses();
    this.finale();
  }

  /** black, then a small card */
  private card() {
    this.at(0, () => this.pad(this.A(0.3), 3.2, [33, 40], 0.12, 'sawtooth', 170, { a: 1.8, wet: 0.2 }));
    this.at(CUE.cardIn - 0.2, () => {
      const t = this.A(CUE.cardIn);
      this.thud(t, 110, 50, 0.8, 0.22);
      this.pad(t, 2.6, [93, 100], 0.07, 'sine', 9000, { a: 1.3, wet: 0.9 });
    });
  }

  /** the family: the lullaby, then the shadow, then the foot */
  private clearing() {
    const NOTES = [69, 72, 76, 74, 72, 69, 67, 64];
    const GAPS = [0.62, 0.62, 0.9, 0.62, 0.62, 0.9, 0.62, 0.62];
    let t = CUE.openingStart + 0.15;
    NOTES.forEach((m, i) => {
      const when = t;
      // once the shadow creeps in the tune sags out of tune
      const sag = when >= CUE.shadowCreep ? -Math.round(20 + (when - CUE.shadowCreep) * 60) : 0;
      this.at(when - 0.2, () => this.box(this.A(when), m, 0.15, sag));
      t += GAPS[i]!;
    });
    this.at(CUE.openingStart - 0.2, () => this.pad(this.A(CUE.openingStart), 5.4, [45, 52, 57], 0.07, 'triangle', 700, { a: 2.2, wet: 0.5 }));
    this.at(CUE.dontLookUp - 0.3, () => this.air(this.A(CUE.dontLookUp - 0.1), 1.3, 0.04, 1800, 800));

    // the shadow: a cluster that will not resolve, a heartbeat that quickens, a riser, and the tune stumbling
    const s0 = CUE.shadowCreep;
    this.at(s0 - 0.2, () => {
      this.pad(this.A(s0), 3.2, [33, 34, 40], 0.22, 'sawtooth', 240, { a: 2.6, wet: 0.2 });
      this.pad(this.A(s0 + 0.1), 3.0, [45, 46], 0.06, 'triangle', 900, { a: 2.4 });
    });
    for (const [dt, g] of [[0, 0.28], [0.95, 0.34], [1.8, 0.4], [2.55, 0.46]] as const) this.at(s0 + dt - 0.2, () => this.heart(this.A(s0 + dt), g));
    this.at(7.4, () => this.riser(this.A(7.6), CUE.jumpCut - 7.6, 0.16, 300, 7500, [hz(57), hz(93)]));
    for (const [tt, m, c, g] of [[7.9, 69, -35, 0.11], [8.5, 72, -75, 0.1], [9.0, 76, -120, 0.09]] as const) this.at(tt - 0.2, () => this.box(this.A(tt), m, g, c));
    // the jump cut, a held breath, the foot
    this.at(CUE.jumpCut - 0.1, () => {
      this.glitch(this.A(CUE.jumpCut), 9, 0.25);
      this.noise(this.A(CUE.jumpCut + 0.1), 0.5, 'lowpass', 6500, 250, 0.12, { swell: true, a: 0.1, wet: 0.3 });
      this.heart(this.A(CUE.jumpCut + 0.05), 0.3);
    });
    this.at(CUE.slam - 0.2, () => {
      const t0 = this.A(CUE.slam);
      this.impact(t0, 1);
      this.noise(t0, 0.5, 'bandpass', 1800, 300, 0.3, { q: 0.6, a: 0.004, wet: 0.3 });
      // the rest of it is swallowed, and only a ringing is left
      this.ring(t0 + 0.2, 3900, 1.8, 0.05);
      this.ring(t0 + 0.2, 3926, 1.7, 0.028);
    });
    this.duck(this.A(CUE.slam + 0.34), 0.1, 0.3, 0.45);
  }

  /** the crater in the dark, and red eyes opening */
  private crater() {
    this.at(10.7, () => this.box(this.A(10.95), 76, 0.12, -80, 0.8));
    this.at(CUE.eyesOpen - 0.5, () => {
      this.pad(this.A(CUE.eyesOpen - 0.4), 1.7, [33, 34, 40], 0.22, 'sawtooth', 200, { a: 1.1 });
      this.bell(this.A(CUE.eyesOpen), hz(57), 3.2, 0.09);
      this.air(this.A(CUE.eyesOpen - 0.05), 1.0, 0.05, 900, 300);
    });
    this.at(CUE.montageStart - 0.7, () => this.riser(this.A(CUE.montageStart - 0.5), 0.45, 0.18, 500, 8000));
  }

  /** the five places: one hit for each cut, a pulse that climbs, and a foot at the end */
  private montage(bar: number, beat: number) {
    const roots = [33, 33, 41, 43, 40];
    const chords = [[69, 72, 76, 81], [69, 72, 76, 81], [65, 69, 72, 77], [67, 71, 74, 79], [64, 68, 71, 76]];
    this.at(CUE.montageStart - 0.2, () => this.riser(this.A(CUE.montageStart), CUE.footLands - CUE.montageStart, 0.15, 400, 9000, [hz(45), hz(81)]));
    CUE.zoneCuts.forEach((B, i) => {
      // every bar is louder than the one before
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
    // X's foot, in the meadow
    this.at(CUE.footLands - 0.2, () => {
      this.impact(this.A(CUE.footLands), 0.95);
      this.glitch(this.A(CUE.footLands + 0.02), 6, 0.18);
    });
    this.duck(this.A(CUE.footLands + 0.1), 0.05, 0.28, 0.2);
    this.at(CUE.guardianCuts[0]! - 0.7, () => this.riser(this.A(CUE.guardianCuts[0]! - 0.45), 0.45, 0.18, 800, 9000));
  }

  /** what each of the five places sounds like at the moment of its cut */
  private texture(i: number, t: number, k = 1) {
    if (i === 0) {
      this.air(t - 0.02, 0.9, 0.12 * k, 2500, 180, 1.2);
      this.say(t, (v) => v.motherWhispers(4), 4 * k);
    } else if (i === 1) {
      this.osc(t, 98, 0.5, 0.14 * k, 'sawtooth', { to: 52, lp: 600 });
      this.say(t, (v) => v.kingClack(3), 3 * k);
    } else if (i === 2) {
      this.bell(t, hz(64), 2.4, 0.1 * k);
    } else if (i === 3) {
      this.say(t, (v) => v.wyrmRattle(10), 0.8 * k);
    } else {
      // a sweet chord with one wrong note in it
      for (const [m, c] of [[76, 0], [81, 0], [84, 0], [82, 30]] as const) this.box(t, m, 0.09 * k, c, 0.7);
    }
  }

  /** the five guardians: a name slams in on every cut */
  private guardians(bar: number, beat: number) {
    const roots = [45, 43, 41, 40, 40];
    const chords = [[69, 72, 76, 81], [67, 71, 74, 79], [65, 69, 72, 77], [64, 68, 71, 76], [64, 68, 71, 76]];
    this.at(CUE.guardianCuts[0]! - 0.2, () => this.riser(this.A(CUE.guardianCuts[0]!), CUE.edgeStart - CUE.guardianCuts[0]! - 0.1, 0.14, 500, 10000, [hz(57), hz(93)]));
    CUE.guardianCuts.forEach((G, i) => {
      this.at(G - 0.3, () => {
        this.braam(this.A(G), roots[i]!, 1.5, 0.34 + 0.03 * i);
        this.impact(this.A(G), 0.55);
        if (i === 0) this.say(this.A(G), (v) => v.motherWhispers(6), 5);
        else if (i === 1) this.say(this.A(G), (v) => v.kingBellow(), 1);
        else if (i === 2) this.say(this.A(G), (v) => v.queenToll(1, 1), 0.9);
        else if (i === 3) this.say(this.A(G), (v) => v.wyrmScreech(0.9), 0.9);
        else {
          this.say(this.A(G), (v) => v.mimicLaugh(), 0.9);
          this.say(this.A(G + 0.3), (v) => v.mimicHum(), 0.8);
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
    // a drum roll into the drop
    const end = CUE.edgeStart;
    this.at(end - 1.0, () => {
      for (let k = 0; k < 10; k++) this.taiko(this.A(end - 0.82 + k * 0.08), 0.3 + 0.05 * k, 90);
    });
    this.duck(this.A(end - 0.01), 0.04, 0.2, 0.5);
  }

  /** everything drops away: wind, a low drone, the stars going out, and the look up */
  private edge() {
    const e = CUE.edgeStart;
    this.at(e - 0.1, () => {
      this.air(this.A(e + 0.1), 3.4, 0.07, 500, 800, 0.6);
      this.pad(this.A(e + 0.2), 3.3, [33, 40], 0.12, 'sawtooth', 150, { a: 2 });
    });
    const stars = [100, 96, 93, 91, 88, 84, 81, 80];
    CUE.starPings.forEach((tp, i) => this.at(tp - 0.2, () => this.ping(this.A(tp), hz(stars[i]!), 0.07 - 0.003 * i)));
    const r = CUE.riserStart;
    this.at(r - 0.2, () => {
      this.riser(this.A(r), CUE.crack - r - 0.05, 0.22, 200, 9000, [hz(45), hz(81)]);
      this.pad(this.A(r), CUE.crack - r, [33, 34, 40], 0.25, 'sawtooth', 260, { a: CUE.crack - r - 0.1 });
    });
    for (const dt of [0.2, 0.8, 1.25, 1.5]) this.at(r + dt - 0.2, () => this.heart(this.A(r + dt), 0.28 + 0.1 * dt));
    // the crack: glass, then a ringing in near silence
    this.at(CUE.crack - 0.2, () => {
      const t = this.A(CUE.crack);
      this.noise(t, 0.4, 'highpass', 9000, 2500, 0.5, { a: 0.002, wet: 0.4 });
      this.bell(t, hz(100), 0.9, 0.06, 0.8);
      this.bell(t, hz(101), 0.9, 0.04, 0.8);
      this.thud(t, 70, 30, 0.6, 0.6);
      this.ring(t + 0.12, 2400, 1.45, 0.05, 2420);
      this.ring(t + 0.12, 3900, 1.35, 0.022);
    });
    this.duck(this.A(CUE.crack + 0.12), 0.05, 1.0, 0.2);
  }

  /** the boom: the screen bursts into cubes, the world is rebuilt in 3D, you land, you swallow a piece of him */
  private boom() {
    const b = CUE.boom;
    this.at(b - 0.2, () => {
      this.riser(this.A(b - 0.05), 0.6, 0.12, 80, 900);
      this.osc(this.A(b - 0.05), 40, 0.6, 0.3, 'sine', { swell: true, a: 0.58 });
    });
    this.at(b + 0.35, () => {
      const t = this.A(b + 0.55);
      this.impact(t, 1.35);
      this.noise(t, 2.4, 'lowpass', 1400, 60, 0.35, { wet: 0.4, a: 0.01 });
      // cubes flying
      for (let k = 0; k < 40; k++) {
        const tt = t + 0.04 + k * 0.035 * (1 + k * 0.05);
        const f = 1800 + this.rnd() * 7000;
        this.noise(tt, 0.02, 'bandpass', f, f, 0.1 * (1 - k / 50), { q: 5, a: 0.001, pan: this.rnd() * 2 - 1 });
      }
    });
    // the world rebuilds itself, block by block
    this.at(b + 0.8, () => {
      this.noise(this.A(b + 1.0), 2.4, 'lowpass', 200, 2400, 0.3, { swell: true, a: 1.8, wet: 0.3 });
      const ladder = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];
      for (let k = 0; k < 24; k++) this.pluck(this.A(b + 1.2 + k * 0.1), ladder[k % ladder.length]! + (k >= 12 ? 12 : 0), 0.08 + 0.16 * (k / 24));
    });
    // you fall, you land
    this.at(b + 2.0, () => {
      this.noise(this.A(b + 2.1), 0.9, 'bandpass', 2400, 250, 0.2, { a: 0.05, wet: 0.3 });
      this.impact(this.A(b + 3.0), 0.5);
      this.noise(this.A(b + 3.0), 0.7, 'lowpass', 900, 200, 0.2, { wet: 0.3 });
    });
    // the claw tip flies to you, and you swallow it
    this.at(b + 3.5, () => {
      this.osc(this.A(b + 3.6), 900, 0.7, 0.05, 'sine', { to: 3600, swell: true, a: 0.65, wet: 0.5 });
      this.noise(this.A(b + 3.6), 0.7, 'bandpass', 800, 5000, 0.1, { rise: true, q: 2 });
    });
    this.at(b + 4.1, () => {
      const t = this.A(b + 4.3);
      this.noise(t, 0.18, 'bandpass', 3200, 600, 0.5, { a: 0.002 });
      this.osc(t, 260, 0.14, 0.2, 'sawtooth', { to: 80 });
      this.impact(t, 0.4);
      // it grows
      this.pad(t + 0.05, 0.85, [33, 34, 40, 45], 0.5, 'sawtooth', 300, { a: 0.7 });
      for (const dt of [0.15, 0.4, 0.6]) this.heart(t + dt, 0.4);
    });
  }

  /** X, whole, and the title */
  private title() {
    this.at(CUE.reveal - 0.3, () => {
      const t = this.A(CUE.reveal);
      this.say(t, (v) => v.xRoar(), 1);
      this.impact(t, 0.8);
    });
    this.at(CUE.title - 0.3, () => {
      const t = this.A(CUE.title);
      this.braam(t, 45, 3.0, 0.5);
      this.braam(t, 57, 2.4, 0.3);
      this.impact(t, 1);
      this.pad(t, 3.2, [45, 52, 57, 60, 64], 0.6, 'sawtooth', 1400, { a: 0.35, wet: 0.5 });
      this.bell(t, hz(57), 4.0, 0.14);
    });
  }

  /** the other two bosses */
  private bosses() {
    const c = CUE.collector;
    const m = CUE.mash;
    // the Collector: small, dry, patient
    this.at(c - 0.3, () => {
      const t = this.A(c);
      this.say(t, (v) => v.glassPing(), 2.5);
      this.say(t + 0.1, (v) => v.collectorTsk(3), 3);
      this.impact(t, 0.5);
      for (let s = 0; s < 10; s++) {
        this.bass(this.A(c + 0.15 + s * 0.2), s % 4 === 3 ? 34 : 33, 0.22);
        this.tick(this.A(c + 0.15 + s * 0.2), 0.08);
      }
      for (let s = 0; s < 5; s++) this.clang(this.A(c + 0.2 + s * 0.4), 0.22);
    });
    this.at(c + 0.7, () => this.riser(this.A(c + 0.8), m - c - 0.9, 0.2, 500, 9000, [hz(57), hz(93)]));
    // the Mash: everything at once
    this.at(m - 0.3, () => {
      const t = this.A(m);
      this.say(t, (v) => v.mashRoar(), 1);
      this.braam(t, 40, 1.8, 0.42);
      this.impact(t, 0.9);
      for (let s = 0; s < 20; s++) {
        this.bass(this.A(m + 0.1 + s * 0.1), 33 + (s % 8 === 7 ? 1 : 0), 0.26, 0.09);
        if (s % 4 === 0) this.taiko(this.A(m + 0.1 + s * 0.1), 0.6, 70);
      }
      for (let s = 0; s < 5; s++) this.clang(this.A(m + 0.2 + s * 0.4), 0.32);
    });
    this.at(m + 0.8, () => this.riser(this.A(m + 0.9), CUE.finale - m - 1.0, 0.24, 400, 10000, [hz(45), hz(93)]));
  }

  /** the end card: the lullaby again, in tune and finally settling, and one heartbeat */
  private finale() {
    const f = CUE.finale;
    // a breath of nothing, so the last hit lands clean
    this.duck(this.A(f - 0.09), 0.05, 0.03, 0.02);
    this.at(f - 0.3, () => {
      const t = this.A(f);
      this.impact(t, 1.1);
      this.braam(t, 33, 3.0, 0.4);
      this.bell(t, hz(57), 5, 0.12);
      this.pad(t + 0.4, CUE.duration - f - 0.6, [45, 52, 57, 60], 0.1, 'triangle', 800, { a: 1.6, wet: 0.55 });
    });
    // E D C A: the tune's own way of falling asleep
    [76, 74, 72, 69].forEach((m, i) => {
      const when = f + 0.9 + i * 0.65 + (i === 3 ? 0.2 : 0);
      this.at(when - 0.2, () => this.box(this.A(when), m, i === 3 ? 0.14 : 0.12 - 0.008 * i, 0, 0.7));
    });
    this.at(CUE.fadeOut - 0.2, () => this.heart(this.A(CUE.fadeOut + 0.15), 0.3));
  }
}
