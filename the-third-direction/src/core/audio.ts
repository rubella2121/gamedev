import { clamp } from './util';

/** Tiny WebAudio synth: no audio files, everything is generated. */
export class Sfx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private droneGain!: GainNode;
  private heartRate = 0;
  private heartLevel = 0;
  private heartT = 0;
  private cricketLevel = 0;
  private cricketT = 0;
  private masterLevel = 0.9;

  /** Must be called from a user gesture (tap / key). */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    void ctx.resume();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.masterLevel;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // wind: looping noise through a slow, breathing band-pass
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(bp).connect(this.windGain).connect(this.master);
    wind.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 120;
    lfo.connect(lfoG).connect(bp.frequency);
    lfo.start();

    // drone: two slightly detuned saws
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    for (const f of [55, 55.6, 82.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    lp.connect(this.droneGain).connect(this.master);
  }

  private ramp(p: AudioParam, v: number, t: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(v, now + Math.max(0.01, t));
  }

  setMaster(v: number, t = 0.2) {
    this.masterLevel = v;
    if (this.ctx) this.ramp(this.master.gain, v, t);
  }
  setWind(v: number, t = 1) {
    if (this.ctx) this.ramp(this.windGain.gain, v, t);
  }
  setDrone(v: number, t = 1) {
    if (this.ctx) this.ramp(this.droneGain.gain, v, t);
  }
  setCrickets(v: number) {
    this.cricketLevel = v;
  }
  setHeart(rate: number, level: number) {
    this.heartRate = rate;
    this.heartLevel = level;
  }
  /** Cut everything ambient at once (used for the silence before the boom). */
  silence(t = 0.15) {
    this.setCrickets(0);
    this.setHeart(0, 0);
    this.setWind(0, t);
    this.setDrone(0, t);
  }

  update(dt: number) {
    if (!this.ctx) return;
    if (this.heartRate > 0 && this.heartLevel > 0) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 1 / this.heartRate;
        this.thump(this.heartLevel);
        window.setTimeout(() => this.thump(this.heartLevel * 0.6), 150);
      }
    }
    if (this.cricketLevel > 0) {
      this.cricketT -= dt;
      if (this.cricketT <= 0) {
        this.cricketT = 0.25 + Math.random() * 1.4;
        this.chirp(this.cricketLevel);
      }
    }
  }

  // ---------- building blocks ----------
  private env(g: GainNode, vol: number, a: number, d: number) {
    const now = this.ctx!.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + a + d);
  }

  tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  burst(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    const t0 = ctx.currentTime + delay;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t0, Math.random());
    s.stop(t0 + dur + 0.05);
  }

  // ---------- sounds ----------
  thump(level: number) {
    this.tone(62, 0.16, 'sine', 0.55 * level, 38);
  }
  chirp(level: number) {
    const base = 4200 + Math.random() * 500;
    for (let i = 0; i < 3; i++) this.tone(base, 0.035, 'sine', 0.03 * level, undefined, i * 0.07);
  }
  slam() {
    this.burst(0.6, 0.9, 'lowpass', 900, 70);
    this.tone(78, 0.7, 'sine', 0.9, 28);
    this.burst(0.12, 0.5, 'highpass', 3000, 3000);
  }
  rumble() {
    this.burst(0.5, 0.35, 'lowpass', 160, 90);
  }
  creak() {
    this.tone(95 + Math.random() * 25, 0.35, 'sawtooth', 0.07, 55);
  }
  snap() {
    this.burst(0.07, 0.6, 'bandpass', 2200, 1200);
    this.tone(180, 0.1, 'square', 0.12, 90);
  }
  squish() {
    this.burst(0.25, 0.3, 'bandpass', 500, 200);
  }
  bell(pitch = 1) {
    this.tone(880 * pitch, 1.6, 'sine', 0.16, undefined);
    this.tone(1318 * pitch, 1.1, 'sine', 0.08);
    this.tone(2200 * pitch, 0.5, 'sine', 0.04);
  }
  ring(dur = 2) {
    this.tone(3900, dur, 'sine', 0.07);
  }
  boom() {
    this.tone(46, 2.2, 'sine', 1.0, 22);
    this.burst(1.6, 0.9, 'lowpass', 2500, 60);
  }
  highTone(dur = 2.0) {
    this.tone(2400, dur, 'sine', 0.06, 2420);
  }
  strike() {
    this.burst(0.18, 0.5, 'bandpass', 3200, 600);
    this.tone(260, 0.12, 'sawtooth', 0.12, 80);
  }
  hit() {
    this.burst(0.35, 0.9, 'lowpass', 1800, 90);
    this.tone(120, 0.4, 'square', 0.25, 40);
  }
  hurt() {
    this.tone(220, 0.3, 'sawtooth', 0.22, 70);
    this.burst(0.2, 0.4, 'lowpass', 900, 150);
  }
  death() {
    this.tone(160, 0.5, 'sine', 0.35, 40);
  }
  blip(pitch = 1) {
    this.tone(420 * pitch, 0.07, 'square', 0.05);
    this.tone(520 * pitch, 0.07, 'square', 0.05, undefined, 0.08);
  }
  whoosh() {
    this.burst(0.7, 0.35, 'bandpass', 200, 2400);
  }
  crumble() {
    this.burst(0.9, 0.45, 'lowpass', 1400, 120);
  }
  sting() {
    this.tone(110, 1.4, 'sawtooth', 0.2, 55);
    this.tone(111.5, 1.4, 'sawtooth', 0.2, 55.5);
    this.burst(1.2, 0.3, 'lowpass', 900, 60);
  }
  flicker() {
    this.tone(1200 + Math.random() * 600, 0.08, 'sine', 0.03);
  }
  warm() {
    this.tone(523, 1.4, 'sine', 0.06);
    this.tone(784, 1.8, 'sine', 0.05, undefined, 0.2);
    this.tone(1046, 2.2, 'sine', 0.035, undefined, 0.4);
  }
  clamp01(v: number) {
    return clamp(v, 0, 1);
  }
}
