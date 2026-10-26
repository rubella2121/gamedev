/**
 * The promos' sound design (trailer-video/src/promos.ts): the game's own sound kit and monster voices, as in the trailer
 * (sfx.ts), placed on each promo's cuts and cue sheet (trailer-video/src/data/promos.json). Every kind of cut makes its own
 * sound - a flash is a blow, a whip a whoosh, a glitch a stutter, a zoom a rush and a thud, an iris a shimmer, the blocks a
 * run of blips - every monster says its name in its own voice, and the words on screen blip, slam or breathe as they come.
 * Then each promo's own moments: the sky cracking, the boom, the foot, the end card.
 *
 *   node tools/trailer/score-render.mjs <{"id": ..., "length": ...}.json> <out.wav> tools/trailer/promo-sfx.ts __renderPromoSfx
 */
import promos from '../../../trailer-video/src/data/promos.json';
import { PROMOS, type Promo } from '../../../trailer-video/src/promos';
import { Base, renderScore } from './sfx';

type V = any;

/** each monster's voice, as its name comes up */
const VOICE: Record<string, [(v: V) => void, number][]> = {
  GLOOMMOTHER: [[(v) => v.motherWhispers(6), 5]],
  'THORNBACK KING': [[(v) => v.kingBellow(), 1]],
  'TOLL QUEEN': [[(v) => v.queenToll(1, 1), 0.9]],
  'BONE WYRM': [[(v) => v.wyrmScreech(0.9), 0.9]],
  'MIMIC QUEEN': [[(v) => v.mimicLaugh(), 0.9]],
  'X, THE HOLLOW': [[(v) => v.xRoar(), 1]],
  'THE COLLECTOR': [[(v) => v.glassPing(), 2.5], [(v) => v.collectorTsk(3), 3]],
  'THE MASH': [[(v) => v.mashRoar(), 1]],
};

class PromoSfx extends Base {
  P!: Promo;
  C!: Record<string, any>;

  /** do `fn` at the promo's time `t` (it is given the audio time) */
  on(t: number, fn: (a: number) => void) {
    this.at(Math.max(0, t - 0.4), () => fn(this.A(t)));
  }

  compose() {
    const P = this.P;
    // ---- every cut makes its own sound
    for (const c of P.cuts) {
      const t = c.at;
      if (c.in === 'flash') this.on(t, (a) => this.impact(a, 0.55));
      if (c.in === 'whip') this.on(t, (a) => this.noise(a - 0.18, 0.2, 'bandpass', 500, 5000, 0.12, { rise: true, q: 1.5 }));
      if (c.in === 'glitch') this.on(t, (a) => this.glitch(a - 0.02, 6, 0.12, 0.16));
      if (c.in === 'zoom')
        this.on(t, (a) => {
          this.riser(a - 0.24, 0.24, 0.16, 300, 7000);
          this.thud(a, 76, 30, 0.35, 0.5);
        });
      if (c.in === 'iris')
        this.on(t, (a) => {
          this.osc(a, 520, 0.9, 0.06, 'sine', { to: 1500, swell: true, a: 0.15, wet: 0.7 });
          this.noise(a, 0.7, 'bandpass', 2000, 7000, 0.06, { swell: true, a: 0.1, wet: 0.6 });
          this.bell(a + 0.05, 220, 2.2, 0.05, 0.8);
        });
      if (c.in === 'blocks')
        this.on(t, (a) => {
          for (let k = 0; k < 10; k++) this.osc(a - 0.22 + k * 0.024, 600 + k * 140, 0.03, 0.05, 'square', { a: 0.002, lp: 4000 });
          for (let k = 0; k < 6; k++) this.osc(a + 0.02 + k * 0.03, 1900 - k * 200, 0.03, 0.04, 'square', { a: 0.002, lp: 4000 });
          this.thud(a, 70, 34, 0.3, 0.45);
        });
      // a monster's name: its voice
      if (c.name) for (const [say, level] of VOICE[c.name.text] ?? []) this.on(t, (a) => this.say(a, say, level));
    }
    // ---- the words have sounds too: a blip as each word pops up, a blow when a line slams down, a breath under a whisper
    for (const w of P.words) {
      const style = w.style ?? 'pop';
      if (style === 'pop')
        w.text
          .split('|')
          .join(' ')
          .split(' ')
          .forEach((_, k) =>
            this.on(w.at + 0.075 * k + 0.04, (a) => {
              this.osc(a, 740 + 110 * k, 0.09, 0.07, 'sine', { to: 1100 + 160 * k, slide: 0.05, a: 0.003, wet: 0.25 });
              this.noise(a, 0.03, 'bandpass', 5200, 4800, 0.05, { q: 3, a: 0.001 });
            }),
          );
      if (style === 'slam')
        this.on(w.at, (a) => {
          this.noise(a - 0.12, 0.13, 'bandpass', 400, 4000, 0.1, { rise: true, q: 1.2 });
          this.thud(a + 0.1, 90, 34, 0.35, 0.55);
          this.noise(a + 0.1, 0.12, 'highpass', 3000, 2000, 0.12, { a: 0.002 });
        });
      if (style === 'hush') this.on(w.at, (a) => this.noise(a, w.end - w.at, 'bandpass', 700, 2600, 0.05, { swell: true, a: 0.6, q: 0.9, wet: 0.7 }));
    }
    // ---- the boom: a breath in, the world bursts into cubes, the cubes fly, the world builds itself again
    const b = P.boom;
    if (b !== undefined) {
      this.on(b - 0.6, (a) => {
        this.riser(a, 0.6, 0.16, 80, 1200);
        this.osc(a, 40, 0.62, 0.3, 'sine', { swell: true, a: 0.6 });
      });
      this.on(b, (a) => {
        this.impact(a, 1.4);
        this.noise(a, 2.4, 'lowpass', 1400, 60, 0.35, { wet: 0.4, a: 0.01 });
        for (let k = 0; k < 44; k++) {
          const tt = a + 0.03 + k * 0.03 * (1 + k * 0.05);
          const f = 1800 + this.rnd() * 7000;
          this.noise(tt, 0.02, 'bandpass', f, f, 0.1 * (1 - k / 50), { q: 5, a: 0.001, pan: this.rnd() * 2 - 1 });
        }
      });
      this.on(b + 1.2, (a) => this.noise(a, 2.0, 'lowpass', 200, 2400, 0.18, { swell: true, a: 1.4, wet: 0.3 }));
    }
    // ---- the end card: the blow and the whoosh of the line; a chime on "play"; the heart on "vote"
    this.on(P.end, (a) => {
      this.impact(a, 1.2);
      this.noise(a + 0.02, 0.5, 'bandpass', 3000, 600, 0.12, { a: 0.003, wet: 0.5 });
    });
    this.on(P.end + 1.55, (a) => this.ping(a, 1760, 0.05));
    this.on(P.end + 2.25, (a) => this.heart(a, 0.32));
    this.on(P.end + 3.05, (a) => this.heart(a, 0.24));
    this.own();
  }

  /** the glass of the sky cracking, and a ringing in near silence */
  crack(t: number) {
    this.on(t, (a) => {
      this.noise(a, 0.45, 'highpass', 9000, 2500, 0.5, { a: 0.002, wet: 0.4 });
      this.thud(a, 70, 30, 0.6, 0.6);
      this.ring(a + 0.12, 2400, 1.0, 0.05, 2420);
    });
  }

  /** something enormous lands beside you, the ground breaks, and the world rings */
  stomp(t: number, from: number) {
    this.on(from, (a) => this.riser(a, t - from, 0.14, 200, 6000));
    this.on(t, (a) => {
      this.impact(a, 1.35);
      this.noise(a, 1.0, 'bandpass', 1800, 300, 0.3, { q: 0.6, a: 0.004, wet: 0.3 });
      for (let k = 0; k < 18; k++) this.noise(a + 0.05 + k * 0.04, 0.02, 'bandpass', 1500 + this.rnd() * 5000, 1200, 0.07, { q: 4, a: 0.001, pan: this.rnd() * 2 - 1 });
    });
  }

  /** each promo's own moments */
  own() {
    const C = this.C;
    const id = this.P.id;
    if (id === '2d-to-3d') {
      this.on(0.05, (a) => this.air(a, C.eyes, 0.035, 900, 500, 0.7));
      for (const [t, g] of [[C.eyes + 0.1, 0.3], [C.eyes + 0.42, 0.36], [C.eyes + 0.68, 0.42]] as const) this.on(t, (a) => this.heart(a, g));
      this.crack(C.crack);
      // the rush: every cut tears
      (C.rush as number[]).forEach((h, i) => this.on(h, (a) => this.impact(a, 0.45 + 0.05 * i)));
    }
    if (id === 'boss-rush') {
      this.stomp(C.hookHit, 0.1);
      this.on(C.hookHit + 0.4, (a) => {
        this.ring(a, 3900, 1.6, 0.04);
        this.ring(a, 3926, 1.5, 0.022);
      });
      this.crack(C.crack);
      // the "?" after the last boss: something that is not here yet breathes
      this.on(C.bosses[2] + 0.8, (a) => this.osc(a, 55, 0.9, 0.18, 'sine', { swell: true, a: 0.4 }));
    }
    if (id === 'family') {
      this.on(0.05, (a) => this.air(a, C.slam - 0.1, 0.03, 800, 500, 0.7));
      for (const [t, g] of [[C.shadow + 0.1, 0.28], [C.shadow + 0.4, 0.34], [C.shadow + 0.62, 0.42]] as const) this.on(t, (a) => this.heart(a, g));
      this.on(C.slam, (a) => {
        this.impact(a, 1.2);
        this.ring(a + 0.25, 3900, 1.6, 0.045);
        this.ring(a + 0.25, 3926, 1.5, 0.025);
      });
      this.on(C.journey + 0.2, (a) => {
        this.osc(a, 520, 1.2, 0.05, 'sine', { to: 1400, swell: true, a: 0.2, wet: 0.7 });
        this.noise(a, 0.9, 'bandpass', 2000, 6000, 0.05, { swell: true, a: 0.1, wet: 0.6 });
      });
      this.crack(C.crack);
      this.on(C.fall, (a) => {
        this.impact(a, 1.2);
        this.say(a + 0.2, (v: V) => v.xGrowl(1.2), 0.9);
        this.noise(a + 0.8, 1.2, 'lowpass', 900, 80, 0.25, { wet: 0.5 });
      });
      this.on(C.lock, (a) => {
        this.say(a, (v: V) => v.glassBreak(), 2.2);
        this.noise(a, 0.6, 'highpass', 9000, 2200, 0.45, { a: 0.002, wet: 0.6 });
        this.ring(a + 0.15, 2600, 1.4, 0.04);
      });
      this.on(C.family, (a) => this.air(a, 3.0, 0.025, 600, 900, 0.7));
    }
    if (id === 'dont-look-up') {
      this.on(0.02, (a) => {
        this.air(a, C.eyes, 0.04, 700, 400, 0.7);
        this.ring(a + 0.2, 5200, C.stars, 0.012, 5180);
      });
      const beats = [C.stars + 0.1, C.stars + 0.7, C.stars + 1.2, C.eyes - 0.25, C.eyes + 0.15, C.eyes + 0.45, C.eyes + 0.72, C.eyes + 0.95];
      beats.forEach((t, i) => this.on(t, (a) => this.heart(a, 0.24 + 0.03 * i)));
      this.on(C.eyes, (a) => {
        this.noise(a, 0.5, 'bandpass', 900, 3000, 0.16, { q: 1.2, a: 0.004, wet: 0.5 });
        this.say(a + 0.1, (v: V) => v.motherWhispers(4), 3);
      });
      this.stomp(C.footLands, C.foot);
      (C.rush as number[]).forEach((h, i) => this.on(h, (a) => this.impact(a, 0.42 + 0.05 * i)));
      this.on(C.black, (a) => {
        this.ring(a, 3900, 1.2, 0.045);
        this.ring(a, 3926, 1.1, 0.025);
      });
      this.on(C.sting, (a) => {
        this.thud(a, 60, 24, 1.4, 0.7);
        this.noise(a, 0.5, 'lowpass', 600, 40, 0.3, { wet: 0.6 });
        this.glitch(a - 0.02, 5, 0.1);
      });
    }
  }
}

async function renderPromoSfx(cues: { id: string; length: number }): Promise<string> {
  const P = PROMOS.find((p) => p.id === cues.id);
  if (!P) throw new Error(`no promo ${cues.id}`);
  const clips = promos.clips as Record<string, Record<string, any>>;
  return renderScore(P.length, (h) => {
    const s = new PromoSfx(h);
    s.P = P;
    s.C = clips[P.id]!;
    return s;
  });
}

(window as unknown as { __renderPromoSfx: typeof renderPromoSfx }).__renderPromoSfx = renderPromoSfx;
