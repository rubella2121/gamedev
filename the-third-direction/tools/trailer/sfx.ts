/**
 * The Remotion trailer's sound design (trailer-video/): the game's own sound kit - the impacts, risers, glitches, the ringing in
 * the silences, the cubes bursting, the glass, and every monster's own voice - placed on the trailer's cue sheet
 * (trailer-video/src/data/cues.json). The music itself is the orchestra (trailer-video/audio/orchestra.py); this is the layer of
 * hits and voices under it, so the two land on the same frames.
 *
 *   node tools/trailer/score-render.mjs <cues.json> <out.wav> tools/trailer/sfx.ts __renderSfx
 */
import { TrailerScore } from '../../src/cinematic/score';

type C = { [k: string]: any };

const SR = 48000;
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// The intro score keeps its sounds in private methods; this layer plays them in its own order.
const Base = TrailerScore as unknown as new (h: { ctx: BaseAudioContext; out: AudioNode; noise: AudioBuffer }) => any;

class Sfx extends Base {
  C!: C;

  compose() {
    const C = this.C;
    // ---- the hook: his foot, beside you, and then the ringing in the black
    this.at(C.hookIn, () => this.riser(this.A(C.hookIn), C.hookHit - C.hookIn, 0.14, 200, 6000));
    this.at(C.hookHit - 0.3, () => {
      const t = this.A(C.hookHit);
      this.impact(t, 1.35);
      this.noise(t, 1.0, 'bandpass', 1800, 300, 0.3, { q: 0.6, a: 0.004, wet: 0.3 });
      for (let k = 0; k < 18; k++) this.noise(t + 0.05 + k * 0.04, 0.02, 'bandpass', 1500 + this.rnd() * 5000, 1200, 0.07, { q: 4, a: 0.001, pan: this.rnd() * 2 - 1 });
    });
    this.at(C.hookOut - 0.2, () => {
      this.glitch(this.A(C.hookOut - 0.05), 6, 0.12);
      this.ring(this.A(C.hookOut), 3900, 2.0, 0.045);
      this.ring(this.A(C.hookOut), 3926, 1.9, 0.024);
    });
    // ---- the lullaby: wind in the trees; the shadow: a heart that quickens
    this.at(2.6, () => this.air(this.A(2.8), C.jump - 2.8, 0.035, 900, 500, 0.7));
    for (const [t, g] of [[C.shadow + 0.2, 0.26], [C.shadow + 1.0, 0.3], [C.shadow + 1.7, 0.34], [C.shadow + 2.2, 0.38], [C.shadow + 2.6, 0.42], [C.shadow + 2.85, 0.46]] as const)
      this.at(t - 0.2, () => this.heart(this.A(t), g));
    this.at(C.jump - 1.8, () => this.riser(this.A(C.jump - 1.6), 1.6, 0.16, 300, 7500));
    this.at(C.jump - 0.1, () => {
      this.glitch(this.A(C.jump), 9, 0.25);
      this.heart(this.A(C.jump + 0.05), 0.3);
    });
    this.at(C.slam - 0.2, () => {
      const t = this.A(C.slam);
      this.impact(t, 1.2);
      this.ring(t + 0.25, 3900, 1.9, 0.05);
      this.ring(t + 0.25, 3926, 1.8, 0.028);
    });
    // ---- the crater; the eyes
    this.at(C.eyes - 0.4, () => {
      this.bell(this.A(C.eyes), hz(57), 3.0, 0.08);
      this.air(this.A(C.eyes - 0.05), 1.0, 0.05, 900, 300);
    });
    // ---- the journey: one pulse of light
    this.at(C.journey - 0.1, () => {
      this.osc(this.A(C.journey + 0.5), 520, 1.2, 0.05, 'sine', { to: 1400, swell: true, a: 0.2, wet: 0.7 });
      this.noise(this.A(C.journey + 0.5), 0.9, 'bandpass', 2000, 6000, 0.05, { swell: true, a: 0.1, wet: 0.6 });
    });
    // ---- the five guardians, each in its own voice; a whoosh into each fight
    (C.guardians as number[]).forEach((g, i) => {
      this.at(g - 0.3, () => {
        const t = this.A(g);
        this.impact(t, 0.6);
        if (i === 0) this.say(t, (v: any) => v.motherWhispers(6), 5);
        else if (i === 1) this.say(t, (v: any) => v.kingBellow(), 1);
        else if (i === 2) this.say(t, (v: any) => v.queenToll(1, 1), 0.9);
        else if (i === 3) this.say(t, (v: any) => v.wyrmScreech(0.9), 0.9);
        else {
          this.say(t, (v: any) => v.mimicLaugh(), 0.9);
          this.say(t + 0.3, (v: any) => v.mimicHum(), 0.8);
        }
        this.noise(this.A(g + 0.62), 0.22, 'bandpass', 600, 4000, 0.12, { rise: true, q: 1.5 });
      });
    });
    // X's foot, in the forest
    this.at(C.footLands - 0.3, () => {
      this.impact(this.A(C.footLands), 1.0);
      this.glitch(this.A(C.footLands + 0.02), 6, 0.18);
    });
    // ---- the Edge: wind; the crack: glass, and a ringing in near silence
    this.at(C.edge - 0.1, () => this.air(this.A(C.edge), C.crack - C.edge, 0.06, 500, 800, 0.6));
    this.at(C.crack - 0.2, () => {
      const t = this.A(C.crack);
      this.noise(t, 0.45, 'highpass', 9000, 2500, 0.5, { a: 0.002, wet: 0.4 });
      this.thud(t, 70, 30, 0.6, 0.6);
      this.ring(t + 0.12, 2400, 1.0, 0.05, 2420);
    });
    // ---- the boom: a breath in, the world bursts into cubes, the cubes fly, the world builds itself again
    const b = C.boom;
    this.at(b - 0.8, () => {
      this.riser(this.A(b - 0.6), 0.6, 0.16, 80, 1200);
      this.osc(this.A(b - 0.6), 40, 0.62, 0.3, 'sine', { swell: true, a: 0.6 });
    });
    this.at(b - 0.2, () => {
      const t = this.A(b);
      this.impact(t, 1.4);
      this.noise(t, 2.4, 'lowpass', 1400, 60, 0.35, { wet: 0.4, a: 0.01 });
      for (let k = 0; k < 44; k++) {
        const tt = t + 0.03 + k * 0.03 * (1 + k * 0.05);
        const f = 1800 + this.rnd() * 7000;
        this.noise(tt, 0.02, 'bandpass', f, f, 0.1 * (1 - k / 50), { q: 5, a: 0.001, pan: this.rnd() * 2 - 1 });
      }
    });
    this.at(b + 1.0, () => this.noise(this.A(b + 1.2), 2.6, 'lowpass', 200, 2400, 0.2, { swell: true, a: 1.8, wet: 0.3 }));
    // ---- X: his roar; then a hit on every cut of the fight
    this.at(C.reveal - 0.3, () => {
      this.say(this.A(C.reveal), (v: any) => v.xRoar(), 1);
      this.impact(this.A(C.reveal), 0.9);
    });
    for (const t of (C.battle as number[]).slice(1)) this.at(t - 0.2, () => {
      this.impact(this.A(t), 0.45);
      this.noise(this.A(t - 0.18), 0.2, 'bandpass', 500, 5000, 0.1, { rise: true, q: 1.5 });
    });
    // the Collector, the Mash, each in its own voice
    this.at(C.collector - 0.3, () => {
      const t = this.A(C.collector);
      this.say(t, (v: any) => v.glassPing(), 2.5);
      this.say(t + 0.1, (v: any) => v.collectorTsk(3), 3);
      this.impact(t, 0.6);
    });
    this.at(C.collector2 - 0.2, () => this.impact(this.A(C.collector2), 0.5));
    this.at(C.mash - 0.3, () => {
      this.say(this.A(C.mash), (v: any) => v.mashRoar(), 1);
      this.impact(this.A(C.mash), 0.9);
    });
    this.at(C.mash2 - 0.2, () => this.impact(this.A(C.mash2), 0.55));
    // the rush: every cut tears
    (C.rushCuts as number[]).forEach((h, i) => this.at(h - 0.2, () => {
      this.impact(this.A(h), 0.4 + 0.05 * i);
      this.glitch(this.A(h), 4, 0.08, 0.12);
    }));
    // X falls: his last breath, the ground taking his weight
    this.at(C.fall - 0.3, () => {
      const t = this.A(C.fall);
      this.impact(t, 1.2);
      this.say(t + 0.2, (v: any) => v.xGrowl(1.2), 0.9);
      this.noise(t + 0.8, 1.4, 'lowpass', 900, 80, 0.25, { wet: 0.5 });
    });
    // the last lock: glass, and a ringing
    this.at(C.lock - 0.3, () => {
      const t = this.A(C.lock);
      this.say(t, (v: any) => v.glassBreak(), 2.2);
      this.noise(t, 0.6, 'highpass', 9000, 2200, 0.45, { a: 0.002, wet: 0.6 });
      this.ring(t + 0.15, 2600, 1.6, 0.04);
    });
    // ---- the title: the blow, and a whoosh as the line shoots out
    this.at(C.title - 0.3, () => {
      const t = this.A(C.title);
      this.impact(t, 1.2);
      this.noise(t + 0.02, 0.5, 'bandpass', 3000, 600, 0.12, { a: 0.003, wet: 0.5 });
    });
    // ---- after the end: something deep, and a ringing
    this.at(C.stingOut - 0.3, () => {
      const t = this.A(C.stingOut);
      this.thud(t, 60, 24, 1.8, 0.7);
      this.noise(t, 1.6, 'lowpass', 600, 40, 0.3, { wet: 0.6 });
      this.ring(t + 0.1, 3100, 2.2, 0.03, 3060);
      this.glitch(this.A(C.stingOut - 0.04), 5, 0.1);
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

async function renderSfx(cues: C): Promise<string> {
  const secs = cues.length as number;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
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
  const s = new Sfx({ ctx, out, noise });
  s.C = cues;
  s.begin(0);
  const AHEAD = 1.4;
  const STEP = 0.25;
  s.pumpTo(AHEAD);
  for (let t = STEP; t < secs; t += STEP) {
    void ctx.suspend(t).then(() => {
      s.pumpTo(t + AHEAD);
      void ctx.resume();
    });
  }
  return wav(await ctx.startRendering());
}

(window as unknown as { __renderSfx: typeof renderSfx }).__renderSfx = renderSfx;
