/**
 * Procedural monster voices. Nothing here is recorded: every growl, whisper and shriek is built out of oscillators,
 * noise and filters, so the game ships no audio files.
 *
 * The engine has four building blocks:
 *   vocal()   a throat: a pulse-train source, three moving formant filters, roughness (a growl is just a very fast tremolo),
 *             breath noise, distortion and reverb
 *   whisper() the same filters driven by noise only
 *   rattle()  a burst train (bone, scales, teeth, clicks)
 *   speak()   a tiny formant speech synth: letters become vowels, hisses, bursts and nasals on a pitch contour
 * Every named voice below is a recipe on top of those, with a little randomness so no two calls sound the same.
 *
 * The class only needs a BaseAudioContext and an output node, so it also runs on an OfflineAudioContext (tools/voicelab.ts
 * renders every voice to a spectrogram so they can be checked without ears).
 */

type Pt = [number, number];
type F3 = [number, number, number];

export interface VocalOpts {
  dur: number;
  delay?: number;
  /** [fraction of duration, Hz] keyframes */
  pitch: Pt[];
  /** [fraction, [F1, F2, F3]] keyframes */
  formants?: [number, F3][];
  /** formant filter Q (higher = more vowel-like, lower = breathier) */
  q?: number;
  wave?: OscillatorType;
  /** extra detuned layers as pitch multipliers (a choir is [1, 1.007, 0.993]) */
  layers?: number[];
  /** roughness: a tremolo of `hz` with `depth` 0..1 (30-60 Hz is a growl) */
  rough?: { hz: number; depth: number };
  /** vibrato: rate in Hz, depth in cents */
  vib?: { hz: number; cents: number };
  /** random wobble of the pitch (0..1) */
  jitter?: number;
  /** breath noise through the formants, 0..1 */
  breath?: number;
  /** a sine at the pitch under the voice, kept clean of the distortion, 0..1 */
  sub?: number;
  /** a chesty resonance at ~250 Hz (the part of a deep voice a phone speaker can actually play), 0..1 */
  body?: number;
  dist?: number;
  gain?: number;
  /** reverb send, 0..1 */
  wet?: number;
  /** attack seconds, release seconds */
  env?: [number, number];
  pan?: number;
  /** lowpass at the end of the chain, Hz */
  lp?: number;
}

export interface WhisperOpts {
  dur: number;
  delay?: number;
  gain?: number;
  pan?: number;
  wet?: number;
  /** syllable rate in Hz */
  rate?: number;
  /** formant keyframes; defaults to a drifting "sh-ee-ah" */
  formants?: [number, F3][];
  q?: number;
}

export interface SpeakOpts {
  /** base pitch in Hz (50-90 is a giant, 140+ is a thin whisperer) */
  f0?: number;
  /** 1 = normal speed */
  rate?: number;
  /** breath mixed into the voiced sound, 0..1 */
  breath?: number;
  rough?: number;
  dist?: number;
  gain?: number;
  wet?: number;
  pan?: number;
  /** how much the pitch falls over the line (0..1) */
  fall?: number;
  /** the rate of its roughness, Hz (34 is a growl; under 12 it judders, like something being wound) */
  growl?: number;
}

const VOWEL: Record<string, F3> = {
  a: [730, 1090, 2440],
  e: [530, 1840, 2480],
  i: [270, 2290, 3010],
  o: [570, 840, 2410],
  u: [300, 870, 2240],
  y: [300, 2100, 2900],
};
const GLIDE: Record<string, F3> = {
  l: [360, 1300, 2900],
  r: [420, 1300, 1600],
  w: [300, 610, 2200],
  m: [250, 1100, 2100],
  n: [250, 1500, 2300],
  g: [300, 1800, 2400],
};
const FRIC = new Set(['s', 'z', 'f', 'h', 'x', 'v', 'j', 'c']);
const PLOS = new Set(['k', 't', 'p', 'd', 'b', 'q']);

const MAX_ACTIVE = 14;

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** A big dark room: noise that fades out and gets duller as it goes. */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const k = 0.2 - 0.17 * u; // darker and darker
      lp += (Math.random() * 2 - 1 - lp) * k;
      lp2 += (lp - lp2) * (k * 1.4);
      d[i] = lp2 * Math.pow(1 - u, decay) * 3.2;
    }
  }
  return b;
}

export class Voice {
  private conv: ConvolverNode;
  private noise: AudioBuffer;
  private curves = new Map<number, Float32Array>();
  private active = 0;
  /** master volume of all voices (the game's mute switch lives on the main gain, this is for balance) */
  level = 1;
  /** when set, a recipe is placed at this audio time instead of "now" (the trailer's score plans its voices ahead of time) */
  clock: number | null = null;
  /** how many sound sources may be alive at once; a score that plans ahead raises it */
  maxActive = MAX_ACTIVE;

  constructor(
    readonly ctx: BaseAudioContext,
    private out: AudioNode,
    noise?: AudioBuffer,
  ) {
    this.noise = noise ?? noiseBuffer(ctx, 2);
    this.conv = ctx.createConvolver();
    this.conv.buffer = impulse(ctx, 2.8, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    this.conv.connect(wet).connect(out);
  }

  /* ------------------------------------------------------------------ */
  /* plumbing                                                             */
  /* ------------------------------------------------------------------ */

  private curve(drive: number): Float32Array {
    const key = Math.round(drive * 10);
    let c = this.curves.get(key);
    if (!c) {
      const n = 1024;
      c = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(x * drive) / Math.tanh(drive) + 0.05 * Math.sin(x * 9) * Math.min(1, drive / 4);
      }
      this.curves.set(key, c);
    }
    return c;
  }

  /** Where a voice is plugged in: a dry path to the output and a send to the reverb. */
  private bus(wet: number, pan = 0): GainNode {
    const ctx = this.ctx;
    const inp = ctx.createGain();
    let tail: AudioNode = inp;
    if (pan !== 0 && 'createStereoPanner' in ctx) {
      const p = (ctx as AudioContext).createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      inp.connect(p);
      tail = p;
    }
    const dry = ctx.createGain();
    dry.gain.value = 1;
    tail.connect(dry).connect(this.out);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      tail.connect(send).connect(this.conv);
    }
    return inp;
  }

  private busy(): boolean {
    return this.active >= this.maxActive;
  }

  private now(): number {
    return this.clock ?? this.ctx.currentTime;
  }

  private track(node: AudioScheduledSourceNode) {
    this.active++;
    node.addEventListener('ended', () => {
      this.active--;
    });
  }

  private src(loop = true): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* the throat                                                           */
  /* ------------------------------------------------------------------ */

  vocal(o: VocalOpts) {
    if (this.busy()) return;
    const ctx = this.ctx;
    const t0 = this.now() + (o.delay ?? 0);
    const dur = o.dur;
    const t1 = t0 + dur;
    const vol = (o.gain ?? 0.5) * this.level;
    const mix = ctx.createGain();
    mix.gain.value = 1;
    const jit = o.jitter ?? 0.02;

    // --- the source: one or more detuned pulse trains
    const layers = o.layers ?? [1];
    const srcMix = ctx.createGain();
    srcMix.gain.value = 1 / Math.sqrt(layers.length);
    let first: OscillatorNode | null = null;
    layers.forEach((m, li) => {
      const osc = ctx.createOscillator();
      osc.type = o.wave ?? 'sawtooth';
      const p = o.pitch;
      osc.frequency.setValueAtTime(Math.max(10, p[0]![1] * m), t0);
      for (let k = 1; k < p.length; k++) osc.frequency.exponentialRampToValueAtTime(Math.max(10, p[k]![1] * m), t0 + p[k]![0] * dur);
      if (o.vib) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = o.vib.hz * (1 + li * 0.07);
        const lg = ctx.createGain();
        lg.gain.value = p[0]![1] * m * (Math.pow(2, o.vib.cents / 1200) - 1);
        lfo.connect(lg).connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(t1 + 0.1);
      }
      if (jit > 0) {
        const nz = this.src();
        const nf = ctx.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.value = 14;
        const ng = ctx.createGain();
        ng.gain.value = p[0]![1] * m * jit * 3;
        nz.connect(nf).connect(ng).connect(osc.frequency);
        nz.start(t0, Math.random());
        nz.stop(t1 + 0.1);
      }
      osc.connect(srcMix);
      osc.start(t0);
      osc.stop(t1 + 0.1);
      if (!first) first = osc;
    });
    if (first) this.track(first);

    // --- roughness: a very fast tremolo is what a growl is
    let carrier: AudioNode = srcMix;
    if (o.rough && o.rough.depth > 0) {
      const am = ctx.createGain();
      am.gain.value = 1 - o.rough.depth * 0.5;
      const amo = ctx.createOscillator();
      amo.type = 'square';
      amo.frequency.value = o.rough.hz;
      const amg = ctx.createGain();
      amg.gain.value = o.rough.depth * 0.5;
      amo.connect(amg).connect(am.gain);
      amo.start(t0);
      amo.stop(t1 + 0.1);
      srcMix.connect(am);
      carrier = am;
    }

    // --- three moving formants
    const fk = o.formants ?? [[0, VOWEL['a']!]];
    const gains: [number, number, number] = [1, 0.75, 0.45];
    const q = o.q ?? 7;
    const fsum = ctx.createGain();
    fsum.gain.value = 1;
    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q * (1 + i * 0.4);
      bp.frequency.setValueAtTime(fk[0]![1][i]!, t0);
      for (let k = 1; k < fk.length; k++) bp.frequency.linearRampToValueAtTime(fk[k]![1][i]!, t0 + fk[k]![0] * dur);
      const g = ctx.createGain();
      g.gain.value = gains[i]! * (1 + q * 0.12);
      carrier.connect(bp);
      bp.connect(g).connect(fsum);
      // breath goes through the same throat
      if (o.breath && o.breath > 0) {
        const nz = this.src();
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 500;
        const ng = ctx.createGain();
        ng.gain.value = o.breath * 2.2;
        nz.connect(hp).connect(ng).connect(bp);
        nz.start(t0, Math.random());
        nz.stop(t1 + 0.1);
      }
    }
    // the chest: a wide low resonance, so a deep voice still has something a phone can play
    if (o.body && o.body > 0) {
      const bb = ctx.createBiquadFilter();
      bb.type = 'bandpass';
      bb.frequency.value = 250;
      bb.Q.value = 1.1;
      const bg = ctx.createGain();
      bg.gain.value = o.body * 2.2;
      carrier.connect(bb);
      bb.connect(bg).connect(fsum);
    }
    fsum.connect(mix);

    // --- distortion, dullness, envelope
    const ws = ctx.createWaveShaper();
    ws.curve = this.curve(o.dist ?? 2.5) as Float32Array<ArrayBuffer>;
    ws.oversample = '2x';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lp ?? 5200;
    lp.Q.value = 0.5;
    const env = ctx.createGain();
    const [a, r] = o.env ?? [Math.min(0.12, dur * 0.2), Math.min(0.5, dur * 0.4)];
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + a);
    env.gain.setValueAtTime(Math.max(0.0002, vol), Math.max(t0 + a, t1 - r));
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    mix.connect(ws).connect(lp).connect(env);
    if (o.sub && o.sub > 0) {
      const so = ctx.createOscillator();
      so.type = 'sine';
      const p = o.pitch;
      so.frequency.setValueAtTime(Math.max(10, p[0]![1]), t0);
      for (let k = 1; k < p.length; k++) so.frequency.exponentialRampToValueAtTime(Math.max(10, p[k]![1]), t0 + p[k]![0] * dur);
      const sg = ctx.createGain();
      sg.gain.value = o.sub * 0.5;
      so.connect(sg).connect(env);
      so.start(t0);
      so.stop(t1 + 0.1);
    }
    env.connect(this.bus(o.wet ?? 0.35, o.pan ?? 0));
  }

  whisper(o: WhisperOpts) {
    if (this.busy()) return;
    const ctx = this.ctx;
    const t0 = this.now() + (o.delay ?? 0);
    const t1 = t0 + o.dur;
    const vol = (o.gain ?? 0.3) * this.level;
    const fk = o.formants ?? [
      [0, [420, 1900, 2700]],
      [0.5, [700, 1200, 2500]],
      [1, [330, 900, 2300]],
    ];
    const nz = this.src();
    const sum = ctx.createGain();
    sum.gain.value = 1;
    const gains: F3 = [1, 0.9, 0.7];
    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = (o.q ?? 5) * (1 + i * 0.3);
      bp.frequency.setValueAtTime(fk[0]![1][i]!, t0);
      for (let k = 1; k < fk.length; k++) bp.frequency.linearRampToValueAtTime(fk[k]![1][i]!, t0 + fk[k]![0] * o.dur);
      const g = ctx.createGain();
      g.gain.value = gains[i]! * 2.2;
      nz.connect(bp);
      bp.connect(g).connect(sum);
    }
    // syllables: a slow tremolo on the whole thing
    const am = ctx.createGain();
    am.gain.value = 0.55;
    const amo = ctx.createOscillator();
    amo.frequency.value = (o.rate ?? 4.5) * (0.85 + Math.random() * 0.3);
    const amg = ctx.createGain();
    amg.gain.value = 0.45;
    amo.connect(amg).connect(am.gain);
    amo.start(t0);
    amo.stop(t1 + 0.1);
    sum.connect(am);
    const env = ctx.createGain();
    const a = Math.min(0.25, o.dur * 0.3);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    am.connect(env).connect(this.bus(o.wet ?? 0.5, o.pan ?? 0));
    nz.start(t0, Math.random());
    nz.stop(t1 + 0.1);
    this.track(nz);
  }

  /** A burst train: dry rattles, teeth, clicks, scales. */
  rattle(o: { n: number; gap: number; dur?: number; f: number; f2?: number; q?: number; gain?: number; delay?: number; pan?: number; wet?: number; type?: BiquadFilterType; spread?: number }) {
    if (this.busy()) return;
    const ctx = this.ctx;
    const base = this.now() + (o.delay ?? 0);
    const bus = this.bus(o.wet ?? 0.25, o.pan ?? 0);
    const vol = (o.gain ?? 0.25) * this.level;
    for (let i = 0; i < o.n; i++) {
      const t = base + i * o.gap * (1 + (Math.random() - 0.5) * (o.spread ?? 0.35));
      const d = o.dur ?? 0.035;
      const s = this.src(false);
      const f = ctx.createBiquadFilter();
      f.type = o.type ?? 'bandpass';
      f.frequency.setValueAtTime(o.f * (0.85 + Math.random() * 0.3), t);
      f.Q.value = o.q ?? 3;
      const g = ctx.createGain();
      const v = vol * (0.5 + Math.random() * 0.5);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(f).connect(g).connect(bus);
      s.start(t, Math.random());
      s.stop(t + d + 0.02);
      if (i === 0) this.track(s);
    }
  }

  /** A struck metal tone with inharmonic partials. */
  bell(freq: number, dur = 2.2, gain = 0.2, o: { delay?: number; pan?: number; wet?: number } = {}) {
    if (this.busy()) return;
    const ctx = this.ctx;
    const t0 = this.now() + (o.delay ?? 0);
    const bus = this.bus(o.wet ?? 0.6, o.pan ?? 0);
    const parts: [number, number, number][] = [
      [1, 1, 1],
      [2.0, 0.55, 0.7],
      [2.76, 0.6, 0.55],
      [5.4, 0.35, 0.35],
      [8.93, 0.18, 0.22],
    ];
    parts.forEach(([m, v, d], i) => {
      // partials above the audible range are left out (and would trip the oscillator's limit)
      if (freq * m > 14000) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * m * (1 + (Math.random() - 0.5) * 0.002);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * v * this.level), t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * d);
      osc.connect(g).connect(bus);
      osc.start(t0);
      osc.stop(t0 + dur * d + 0.05);
      if (i === 0) this.track(osc);
    });
  }

  /* ------------------------------------------------------------------ */
  /* formant speech                                                       */
  /* ------------------------------------------------------------------ */

  /** Roughly how long a line takes to say. */
  speakTime(text: string, rate = 1): number {
    return this.plan(text, rate).total;
  }

  private plan(text: string, rate: number) {
    type Ph = { kind: 'v' | 'g' | 'f' | 'p' | 's'; f?: F3; t: number; d: number; ch: string };
    const out: Ph[] = [];
    let t = 0;
    const s = text.toLowerCase().replace(/[^a-z .,!?'-]/g, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]!;
      if (ch === ' ') {
        t += 0.09 / rate;
        continue;
      }
      if (ch === '.' || ch === ',' || ch === '!' || ch === '?' || ch === '-') {
        t += (ch === ',' ? 0.2 : 0.38) / rate;
        continue;
      }
      if (ch === "'") continue;
      if (VOWEL[ch]) {
        const d = (s[i + 1] === ch ? 0.26 : 0.15) / rate;
        if (s[i + 1] === ch) i++;
        out.push({ kind: 'v', f: VOWEL[ch], t, d, ch });
        t += d;
      } else if (GLIDE[ch]) {
        const d = 0.085 / rate;
        out.push({ kind: 'g', f: GLIDE[ch], t, d, ch });
        t += d * 0.9;
      } else if (FRIC.has(ch)) {
        const d = (ch === 's' || ch === 'h' ? 0.13 : 0.1) / rate;
        out.push({ kind: 'f', t, d, ch });
        t += d * 0.9;
      } else if (PLOS.has(ch)) {
        out.push({ kind: 'p', t: t + 0.03 / rate, d: 0.04 / rate, ch });
        t += 0.075 / rate;
      } else {
        out.push({ kind: 's', t, d: 0.05 / rate, ch });
        t += 0.05 / rate;
      }
    }
    return { ph: out, total: t + 0.2 };
  }

  /** Say a line. Returns how long it lasts, in seconds. */
  speak(text: string, o: SpeakOpts = {}, delay = 0): number {
    const rate = o.rate ?? 0.8;
    const { ph, total } = this.plan(text, rate);
    if (this.busy()) return total;
    const ctx = this.ctx;
    const t0 = this.now() + delay;
    const t1 = t0 + total;
    const f0 = o.f0 ?? 62;
    const vol = (o.gain ?? 0.55) * this.level;
    const bus = this.bus(o.wet ?? 0.4, o.pan ?? 0);

    // voiced source: pulse train + a detuned partner, with a falling contour and a little drunkenness
    const voiced = ctx.createGain();
    voiced.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'sawtooth';
    const fall = o.fall ?? 0.22;
    osc.frequency.setValueAtTime(f0 * 1.08, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f0 * (1 - fall)), t1);
    osc2.frequency.setValueAtTime(f0 * 1.08 * 1.006, t0);
    osc2.frequency.exponentialRampToValueAtTime(Math.max(20, f0 * (1 - fall) * 1.006), t1);
    // stress: a rise on every vowel
    for (const p of ph) if (p.kind === 'v') {
      const f = f0 * (1.05 + Math.random() * 0.1) * (1 - fall * (p.t / total));
      osc.frequency.setValueAtTime(f * 0.94, t0 + p.t);
      osc.frequency.linearRampToValueAtTime(f, t0 + p.t + p.d * 0.4);
      osc2.frequency.setValueAtTime(f * 0.94 * 1.006, t0 + p.t);
      osc2.frequency.linearRampToValueAtTime(f * 1.006, t0 + p.t + p.d * 0.4);
    }
    const jn = this.src();
    const jf = ctx.createBiquadFilter();
    jf.type = 'lowpass';
    jf.frequency.value = 12;
    const jg = ctx.createGain();
    jg.gain.value = f0 * 0.05;
    jn.connect(jf).connect(jg);
    jg.connect(osc.frequency);
    jg.connect(osc2.frequency);
    const src = ctx.createGain();
    src.gain.value = 0.7;
    osc.connect(src);
    osc2.connect(src);
    // growl
    const am = ctx.createGain();
    const depth = o.rough ?? 0.55;
    am.gain.value = 1 - depth * 0.5;
    const amo = ctx.createOscillator();
    amo.type = 'square';
    amo.frequency.value = o.growl ?? 34;
    const amg = ctx.createGain();
    amg.gain.value = depth * 0.5;
    amo.connect(amg).connect(am.gain);
    src.connect(am);

    const formant = [0, 1, 2].map((i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 8 + i * 4;
      bp.frequency.setValueAtTime(VOWEL['a']![i]!, t0);
      return bp;
    });
    const fsum = ctx.createGain();
    fsum.gain.value = 1;
    formant.forEach((bp, i) => {
      am.connect(bp);
      const g = ctx.createGain();
      g.gain.value = [1.1, 0.8, 0.5][i]!;
      bp.connect(g).connect(voiced);
    });
    voiced.connect(fsum);

    // unvoiced noise: fricatives and plosive bursts
    const nz = this.src();
    const nHp = ctx.createBiquadFilter();
    nHp.type = 'highpass';
    nHp.frequency.value = 3500;
    const nBp = ctx.createBiquadFilter();
    nBp.type = 'bandpass';
    nBp.frequency.value = 5000;
    nBp.Q.value = 0.8;
    const unv = ctx.createGain();
    unv.gain.value = 0;
    nz.connect(nHp).connect(nBp).connect(unv);
    // whisper: a bit of the breath sits under the vowels too
    const breath = ctx.createGain();
    breath.gain.value = 0;
    const bnz = this.src();
    bnz.connect(breath);
    formant.forEach((bp) => breath.connect(bp));

    voiced.gain.setValueAtTime(0, t0);
    let lastF: F3 = VOWEL['a']!;
    for (const p of ph) {
      const ts = t0 + p.t;
      if (p.kind === 'v' || p.kind === 'g') {
        const f = p.f!;
        for (let i = 0; i < 3; i++) {
          formant[i]!.frequency.setTargetAtTime(f[i]!, ts, 0.018);
        }
        lastF = f;
        const lvl = p.kind === 'v' ? 1 : 0.55;
        voiced.gain.setTargetAtTime(lvl, ts, 0.012);
        voiced.gain.setTargetAtTime(p.kind === 'v' ? 0.28 : 0.1, ts + p.d * 0.78, 0.02);
        breath.gain.setTargetAtTime((o.breath ?? 0.12) * lvl, ts, 0.02);
        breath.gain.setTargetAtTime(0, ts + p.d, 0.03);
      } else if (p.kind === 'f') {
        voiced.gain.setTargetAtTime(0, ts, 0.01);
        const hi = p.ch === 'h' ? 1800 : p.ch === 'f' || p.ch === 'v' ? 3000 : 5200;
        nBp.frequency.setValueAtTime(hi, ts);
        unv.gain.setTargetAtTime(p.ch === 'h' ? 0.35 : 0.7, ts, 0.008);
        unv.gain.setTargetAtTime(0, ts + p.d, 0.015);
      } else if (p.kind === 'p') {
        voiced.gain.setTargetAtTime(0, ts - 0.03, 0.006);
        const f = p.ch === 'k' || p.ch === 'g' || p.ch === 'q' ? 2400 : p.ch === 'p' || p.ch === 'b' ? 900 : 4200;
        nBp.frequency.setValueAtTime(f, ts);
        unv.gain.setValueAtTime(0.0001, ts);
        unv.gain.exponentialRampToValueAtTime(1.0, ts + 0.004);
        unv.gain.exponentialRampToValueAtTime(0.0001, ts + p.d);
      }
    }
    void lastF;
    voiced.gain.setTargetAtTime(0, t1 - 0.25, 0.1);

    const ws = ctx.createWaveShaper();
    ws.curve = this.curve(o.dist ?? 3) as Float32Array<ArrayBuffer>;
    ws.oversample = '2x';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5600;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.05);
    env.gain.setValueAtTime(Math.max(0.0002, vol), t1 - 0.2);
    env.gain.exponentialRampToValueAtTime(0.0001, t1);
    fsum.connect(ws);
    unv.connect(ws);
    ws.connect(lp).connect(env).connect(bus);
    for (const n of [osc, osc2, amo]) {
      n.start(t0);
      n.stop(t1 + 0.1);
    }
    jn.start(t0, Math.random());
    jn.stop(t1 + 0.1);
    nz.start(t0, Math.random());
    nz.stop(t1 + 0.1);
    bnz.start(t0, Math.random());
    bnz.stop(t1 + 0.1);
    this.track(osc);
    return total;
  }

  /* ------------------------------------------------------------------ */
  /* X, the Hollow                                                        */
  /* ------------------------------------------------------------------ */

  /** A low, wet growl, like something very large deciding. */
  xGrowl(power = 1) {
    const d = 1.1 + 0.5 * power;
    this.vocal({
      dur: d,
      pitch: [[0, 64], [0.25, 84], [0.6, 72], [1, 46]],
      formants: [[0, [520, 1000, 2300]], [0.4, [680, 1100, 2400]], [1, [340, 800, 2200]]],
      q: 6,
      rough: { hz: 31 + Math.random() * 8, depth: 0.85 },
      vib: { hz: 5.2, cents: 28 },
      jitter: 0.05,
      breath: 0.16,
      sub: 0.22,
      body: 0.7,
      dist: 4,
      gain: 0.45 * power,
      wet: 0.5,
      layers: [1, 1.012, 0.5],
      lp: 3800,
    });
    this.whisper({ dur: d * 0.8, gain: 0.07, delay: 0.1, wet: 0.7, rate: 7, pan: -0.4 });
  }

  /** The big one: a roar that tears at the top and drops through the floor. */
  xRoar() {
    this.vocal({
      dur: 2.3,
      pitch: [[0, 56], [0.15, 84], [0.4, 170], [0.55, 142], [0.8, 82], [1, 42]],
      formants: [[0, [450, 900, 2200]], [0.3, [800, 1250, 2500]], [0.55, [900, 1500, 2600]], [1, [300, 700, 2000]]],
      q: 4.5,
      rough: { hz: 44, depth: 0.9 },
      vib: { hz: 6.5, cents: 55 },
      jitter: 0.09,
      breath: 0.28,
      sub: 0.28,
      body: 0.8,
      dist: 5,
      gain: 0.36,
      wet: 0.55,
      layers: [1, 1.018, 0.992, 0.5],
      lp: 4800,
    });
    // a scream hiding in it
    this.vocal({
      dur: 1.6,
      delay: 0.35,
      pitch: [[0, 360], [0.35, 980], [0.7, 620], [1, 210]],
      formants: [[0, [800, 1600, 2800]], [0.5, [1100, 2000, 3100]], [1, [600, 1300, 2600]]],
      q: 5,
      rough: { hz: 58, depth: 0.7 },
      vib: { hz: 7.5, cents: 80 },
      jitter: 0.12,
      breath: 0.5,
      dist: 6,
      gain: 0.12,
      wet: 0.6,
      lp: 6500,
    });
    this.rattle({ n: 9, gap: 0.09, f: 2600, gain: 0.08, delay: 0.2, q: 1.2, type: 'highpass' });
  }

  /** A breath that is much too slow. */
  xBreath() {
    this.whisper({ dur: 2.4, gain: 0.11, wet: 0.7, rate: 0.4, q: 2.5, formants: [[0, [380, 900, 2100]], [0.5, [520, 1100, 2300]], [1, [300, 800, 2000]]] });
    this.vocal({ dur: 2.2, delay: 0.1, pitch: [[0, 58], [0.5, 66], [1, 52]], formants: [[0, [400, 800, 2000]], [1, [350, 700, 1900]]], q: 3, breath: 0.4, rough: { hz: 24, depth: 0.6 }, sub: 0.2, body: 0.7, dist: 2, gain: 0.2, wet: 0.5, lp: 1500 });
  }

  xLaugh() {
    const n = 4 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      this.vocal({
        delay: i * 0.21,
        dur: 0.17,
        pitch: [[0, 118 - i * 6], [0.5, 140 - i * 8], [1, 96 - i * 6]],
        formants: [[0, [700, 1150, 2400]], [1, [560, 1000, 2300]]],
        q: 5,
        rough: { hz: 36, depth: 0.7 },
        breath: 0.2,
        dist: 3.5,
        gain: 0.34 * (1 - i * 0.07),
        wet: 0.55,
        sub: 0.15,
        body: 0.6,
        lp: 3500,
      });
    }
  }

  /** What he says. (`line` is also shown as a caption by the game.) */
  xSpeak(line: string): number {
    return this.speak(line, { f0: 58, rate: 0.72, rough: 0.7, dist: 4, gain: 0.6, wet: 0.55, fall: 0.3, breath: 0.1 });
  }

  /* ------------------------------------------------------------------ */
  /* Gloommother                                                          */
  /* ------------------------------------------------------------------ */

  /** A dozen whispering voices, none of them in the same place. */
  motherWhispers(n = 7) {
    for (let i = 0; i < n; i++) {
      const g = 0.3 + Math.random() * 0.12;
      this.whisper({
        dur: 0.9 + Math.random() * 1.4,
        delay: Math.random() * 1.2,
        gain: g,
        pan: (Math.random() - 0.5) * 1.8,
        rate: 3 + Math.random() * 4,
        wet: 0.65,
        q: 4 + Math.random() * 3,
        formants: [
          [0, [300 + Math.random() * 300, 1500 + Math.random() * 600, 2600]],
          [1, [450 + Math.random() * 300, 900 + Math.random() * 500, 2400]],
        ],
      });
    }
  }

  motherWail(power = 1) {
    this.vocal({
      dur: 1.9,
      pitch: [[0, 190], [0.3, 360], [0.6, 300], [1, 120]],
      formants: [[0, [320, 1300, 2500]], [0.5, [420, 1000, 2400]], [1, [280, 900, 2200]]],
      q: 9,
      vib: { hz: 5.5, cents: 70 },
      jitter: 0.06,
      breath: 0.3,
      wet: 0.8,
      dist: 1.8,
      gain: 0.3 * power,
      layers: [1, 1.006, 0.997, 1.5],
      lp: 3200,
    });
    this.motherWhispers(4);
  }

  motherLaugh() {
    for (let i = 0; i < 3; i++) this.whisper({ dur: 0.35, delay: i * 0.3, gain: 0.16, rate: 9, wet: 0.7, pan: i - 1, formants: [[0, [500, 1500, 2600]], [1, [800, 1200, 2500]]] });
  }

  /* ------------------------------------------------------------------ */
  /* Thornback King                                                       */
  /* ------------------------------------------------------------------ */

  /** A bull's bellow in a much bigger chest. */
  kingBellow() {
    this.vocal({
      dur: 1.5,
      pitch: [[0, 86], [0.2, 118], [0.7, 102], [1, 62]],
      formants: [[0, [420, 800, 2300]], [0.4, [560, 1000, 2400]], [1, [320, 700, 2100]]],
      q: 5,
      rough: { hz: 24, depth: 0.75 },
      vib: { hz: 4.2, cents: 35 },
      jitter: 0.05,
      breath: 0.25,
      sub: 0.25,
      body: 0.8,
      dist: 4,
      gain: 0.42,
      wet: 0.35,
      layers: [1, 1.01, 0.5],
      lp: 3600,
    });
  }

  kingSnort(n = 2) {
    for (let i = 0; i < n; i++) {
      this.whisper({ dur: 0.16, delay: i * 0.22, gain: 0.3, rate: 12, q: 2, wet: 0.2, formants: [[0, [500, 1100, 2000]], [1, [300, 900, 1800]]] });
      this.vocal({ dur: 0.18, delay: i * 0.22, pitch: [[0, 100], [1, 66]], formants: [[0, [400, 900, 2200]], [1, [350, 800, 2000]]], q: 3, rough: { hz: 40, depth: 0.7 }, dist: 3, gain: 0.26, wet: 0.2, sub: 0.15, body: 0.7, lp: 1800 });
    }
  }

  kingClack(n = 4) {
    this.rattle({ n, gap: 0.08, f: 1800, q: 6, gain: 1.4, dur: 0.03, spread: 0.2, wet: 0.15 });
  }

  /* ------------------------------------------------------------------ */
  /* Toll Queen                                                           */
  /* ------------------------------------------------------------------ */

  queenToll(pitch = 1, power = 1) {
    this.bell(196 * pitch, 3.4, 0.26 * power, { wet: 0.7 });
    this.bell(98 * pitch, 4.2, 0.16 * power, { wet: 0.8, delay: 0.01 });
  }

  /** A choir that sings one wrong note and holds it. */
  queenChoir(power = 1) {
    this.vocal({
      dur: 2.6,
      pitch: [[0, 392], [0.15, 415], [1, 411]],
      formants: [[0, [300, 2200, 3000]], [0.4, [650, 1100, 2500]], [1, [330, 900, 2300]]],
      q: 11,
      vib: { hz: 5.4, cents: 38 },
      jitter: 0.03,
      breath: 0.12,
      wet: 0.9,
      dist: 1.3,
      gain: 0.22 * power,
      layers: [1, 1.004, 0.996, 1.5, 0.75],
      env: [0.5, 1.2],
      lp: 4200,
    });
  }

  queenShriek(power = 1) {
    this.vocal({
      dur: 1.2,
      pitch: [[0, 700], [0.2, 1500], [0.6, 2300], [1, 900]],
      formants: [[0, [800, 1700, 2800]], [0.5, [1000, 2400, 3300]], [1, [700, 1500, 2700]]],
      q: 8,
      rough: { hz: 52, depth: 0.5 },
      vib: { hz: 8, cents: 90 },
      jitter: 0.1,
      breath: 0.5,
      dist: 4,
      gain: 0.26 * power,
      wet: 0.75,
      lp: 7500,
    });
    this.bell(520, 1.4, 0.1, { delay: 0.05, wet: 0.8 });
  }

  /* ------------------------------------------------------------------ */
  /* Bone Wyrm                                                            */
  /* ------------------------------------------------------------------ */

  wyrmHiss(dur = 1.1) {
    this.whisper({ dur, gain: 0.3, rate: 2.2, q: 1.1, wet: 0.35, formants: [[0, [3200, 5200, 7000]], [1, [2600, 4200, 6400]]] });
  }

  wyrmRattle(n = 14) {
    this.rattle({ n, gap: 0.045, f: 3400, q: 2.2, gain: 0.45, dur: 0.028, spread: 0.5, wet: 0.2, type: 'highpass' });
    this.rattle({ n: Math.floor(n * 0.6), gap: 0.07, f: 1200, q: 5, gain: 0.35, dur: 0.03, spread: 0.6, wet: 0.2, delay: 0.02 });
  }

  wyrmScreech(power = 1) {
    this.vocal({
      dur: 1.7,
      pitch: [[0, 260], [0.2, 900], [0.5, 1500], [0.8, 1100], [1, 420]],
      formants: [[0, [900, 1900, 2900]], [0.5, [1400, 2600, 3500]], [1, [700, 1600, 2700]]],
      q: 4,
      rough: { hz: 66, depth: 0.7 },
      vib: { hz: 9, cents: 60 },
      jitter: 0.14,
      breath: 0.6,
      dist: 7,
      gain: 0.3 * power,
      wet: 0.5,
      lp: 8000,
    });
    this.wyrmRattle(10);
  }

  wyrmRoar() {
    this.vocal({
      dur: 1.9,
      pitch: [[0, 76], [0.2, 150], [0.5, 235], [1, 62]],
      formants: [[0, [500, 1000, 2400]], [0.4, [800, 1400, 2500]], [1, [350, 800, 2100]]],
      q: 4,
      rough: { hz: 50, depth: 0.85 },
      jitter: 0.1,
      breath: 0.4,
      sub: 0.2,
      body: 0.5,
      dist: 5,
      gain: 0.46,
      wet: 0.4,
      layers: [1, 1.015, 0.5],
      lp: 5200,
    });
    this.wyrmHiss(0.9);
  }

  /* ------------------------------------------------------------------ */
  /* Mimic Queen                                                          */
  /* ------------------------------------------------------------------ */

  /** A child's lullaby hum, a little too slow. */
  mimicHum(notes: number[] = [440, 523.25, 659.25, 587.33, 523.25]) {
    let t = 0;
    for (const f of notes) {
      const d = 0.55 + Math.random() * 0.1;
      this.vocal({
        delay: t,
        dur: d,
        pitch: [[0, f * 0.985], [0.2, f], [1, f * 0.99]],
        formants: [[0, [320, 900, 2300]], [1, [380, 800, 2400]]],
        q: 12,
        wave: 'triangle',
        vib: { hz: 5, cents: 24 },
        jitter: 0.01,
        breath: 0.1,
        dist: 1,
        gain: 0.5,
        wet: 0.7,
        env: [0.06, 0.25],
        lp: 3000,
      });
      this.bell(f * 2, 0.8, 0.03, { delay: t, wet: 0.5 });
      t += d;
    }
    return t;
  }

  mimicLaugh() {
    for (let i = 0; i < 5; i++) {
      this.vocal({
        delay: i * 0.17,
        dur: 0.12,
        pitch: [[0, 520 + i * 40], [1, 380 + i * 20]],
        formants: [[0, [700, 1500, 2600]], [1, [500, 1900, 2800]]],
        q: 6,
        rough: { hz: 40, depth: 0.5 },
        breath: 0.3,
        dist: 2,
        gain: 0.42,
        wet: 0.6,
        lp: 5200,
      });
    }
  }

  mimicSnarl() {
    this.vocal({
      dur: 1.2,
      pitch: [[0, 132], [0.3, 190], [1, 84]],
      formants: [[0, [600, 1200, 2400]], [0.5, [750, 1400, 2500]], [1, [400, 900, 2200]]],
      q: 4,
      rough: { hz: 46, depth: 0.85 },
      vib: { hz: 7, cents: 40 },
      jitter: 0.08,
      breath: 0.35,
      sub: 0.15,
      body: 0.6,
      dist: 5,
      gain: 0.4,
      wet: 0.4,
      lp: 5000,
    });
    this.rattle({ n: 6, gap: 0.06, f: 1500, q: 4, gain: 0.12, dur: 0.03, wet: 0.2, delay: 0.1 });
  }

  /* ------------------------------------------------------------------ */
  /* The Collector                                                        */
  /* ------------------------------------------------------------------ */

  /** Tongue against teeth: tsk. */
  collectorTsk(n = 2) {
    this.rattle({ n, gap: 0.19, f: 5200, q: 4, gain: 0.95, dur: 0.045, spread: 0.15, wet: 0.35, type: 'bandpass' });
  }

  collectorChuckle() {
    for (let i = 0; i < 4; i++) {
      this.vocal({
        delay: i * 0.24,
        dur: 0.16,
        pitch: [[0, 150 - i * 6], [0.5, 175 - i * 6], [1, 130]],
        formants: [[0, [560, 1700, 2600]], [1, [420, 1500, 2500]]],
        q: 8,
        breath: 0.55,
        rough: { hz: 28, depth: 0.35 },
        dist: 1.5,
        gain: 0.42,
        wet: 0.5,
        lp: 4500,
      });
    }
  }

  collectorSpeak(line: string): number {
    return this.speak(line, { f0: 118, rate: 0.9, rough: 0.2, dist: 1.6, gain: 0.42, wet: 0.55, fall: 0.12, breath: 0.55 });
  }

  glassPing(pitch = 1) {
    this.bell(1760 * pitch, 0.9, 0.08, { wet: 0.7 });
    this.bell(2637 * pitch, 0.6, 0.04, { wet: 0.7, delay: 0.02 });
  }

  glassBreak() {
    this.rattle({ n: 26, gap: 0.014, f: 6200, q: 1.5, gain: 0.3, dur: 0.05, spread: 0.9, wet: 0.35, type: 'highpass' });
    this.bell(2093, 0.7, 0.06, { wet: 0.7 });
  }

  /* ------------------------------------------------------------------ */
  /* The Mash                                                             */
  /* ------------------------------------------------------------------ */

  /** Five voices at once, none of them agreeing. */
  mashRoar() {
    const keep = this.level;
    this.level = keep * 0.42;
    this.xRoar();
    this.kingBellow();
    this.wyrmScreech(0.8);
    this.queenChoir(0.9);
    this.motherWhispers(5);
    this.mimicSnarl();
    this.level = keep;
  }

  mashSpeak(line: string): number {
    const a = this.speak(line, { f0: 54, rate: 0.7, rough: 0.8, dist: 4, gain: 0.5, wet: 0.6, fall: 0.3, breath: 0.1, pan: -0.2 });
    this.speak(line, { f0: 178, rate: 0.7, rough: 0.1, dist: 1.2, gain: 0.22, wet: 0.7, fall: 0.1, breath: 0.6, pan: 0.3 }, 0.04);
    this.speak(line, { f0: 90, rate: 0.74, rough: 0.5, dist: 3, gain: 0.3, wet: 0.7, fall: 0.2, breath: 0.2, pan: 0.0 }, 0.09);
    return a;
  }

  /* ------------------------------------------------------------------ */
  /* The Fourth                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * It does not have one voice; it has the same voice at several moments. A breath says the line first (it has already said it),
   * then the voice itself, very low and slow, juddering like something being wound, with another an octave under it that you
   * feel more than hear; a thin cold echo of it comes after; and under all of it a slow clock ticks. Returns how long it lasts.
   */
  fourthSpeak(line: string): number {
    const pre = 0.32;
    // before: the whisper of it
    this.speak(line, { f0: 150, rate: 0.6, rough: 0, breath: 1, dist: 1, gain: 0.16, wet: 0.95, fall: 0.05, pan: -0.45 });
    // the voice, and the one under it
    const main = this.speak(line, { f0: 44, rate: 0.6, rough: 0.55, growl: 9, breath: 0.2, dist: 6, gain: 0.66, wet: 0.7, fall: 0.5 }, pre);
    this.speak(line, { f0: 29, rate: 0.6, rough: 0.3, growl: 6, breath: 0, dist: 9, gain: 0.34, wet: 0.45, fall: 0.5, pan: 0.1 }, pre + 0.015);
    // after: a thin cold echo of it
    this.speak(line, { f0: 98, rate: 0.6, rough: 0.7, growl: 23, breath: 0.6, dist: 2, gain: 0.12, wet: 1, fall: 0.3, pan: 0.5 }, pre + 0.42);
    // a slow clock under it
    const n = Math.max(2, Math.round((main + pre) * 1.6));
    this.rattle({ n, gap: 0.62, f: 1100, f2: 700, q: 9, gain: 0.07, dur: 0.05, wet: 0.8, type: 'bandpass', spread: 0.1 });
    // and the ground under that
    this.vocal({ dur: main + pre + 0.6, pitch: [[0, 36], [1, 27]], wave: 'sine', sub: 0.8, body: 0.3, gain: 0.2, wet: 0.35, env: [0.4, 0.8], lp: 300 });
    return main + pre;
  }

  /**
   * Its roar is not an animal's. A cluster of throats a semitone apart drags down through the floor, juddering slowly, with
   * a chime of something like glass high above it, and a long breath drawn in backwards before it.
   */
  fourthRoar() {
    // the breath in
    this.whisper({ dur: 0.9, gain: 0.14, wet: 0.9, rate: 14, pan: 0.3 });
    this.vocal({
      dur: 3.4,
      delay: 0.75,
      pitch: [[0, 78], [0.2, 64], [0.6, 46], [1, 26]],
      formants: [[0, [520, 880, 2300]], [0.4, [430, 760, 2200]], [1, [300, 600, 1900]]],
      q: 5,
      rough: { hz: 8, depth: 0.95 },
      vib: { hz: 0.7, cents: 60 },
      jitter: 0.04,
      breath: 0.3,
      sub: 0.6,
      body: 1,
      dist: 7,
      gain: 0.42,
      wet: 0.85,
      layers: [1, 1.059, 0.5, 0.749],
      lp: 2600,
    });
    // something like glass, very high, not quite in tune with itself
    this.bell(2960, 3.2, 0.05, { delay: 0.9, wet: 0.95, pan: -0.5 });
    this.bell(3136, 3.0, 0.045, { delay: 0.95, wet: 0.95, pan: 0.5 });
    this.rattle({ n: 7, gap: 0.42, f: 900, f2: 600, q: 9, gain: 0.08, dur: 0.05, delay: 1.0, wet: 0.8, type: 'bandpass', spread: 0.1 });
  }

  /** a shorter one: it closes again */
  fourthGrowl() {
    this.vocal({
      dur: 1.6,
      pitch: [[0, 52], [0.5, 46], [1, 32]],
      formants: [[0, [460, 800, 2200]], [1, [320, 640, 2000]]],
      q: 5,
      rough: { hz: 7, depth: 0.9 },
      breath: 0.25,
      sub: 0.5,
      body: 0.9,
      dist: 6,
      gain: 0.32,
      wet: 0.75,
      layers: [1, 1.059, 0.5],
      lp: 2400,
    });
    this.rattle({ n: 3, gap: 0.45, f: 900, q: 9, gain: 0.06, dur: 0.05, wet: 0.8, type: 'bandpass', spread: 0.1 });
  }
}
