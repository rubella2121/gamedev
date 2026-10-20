import { Voice } from '../src/core/voice';

/**
 * Renders any voice to a buffer with an OfflineAudioContext and reports what it did: peak, loudness, how much of it is
 * clipped, where its energy sits, plus a spectrogram. It lets the voices be checked without listening.
 *   __lab.names()            -> every voice
 *   __lab.render(name)       -> { stats, png }
 */

const SR = 44100;

type Recipe = (v: Voice) => void;
const R: Record<string, { dur: number; run: Recipe }> = {
  xGrowl: { dur: 2.6, run: (v) => v.xGrowl(1) },
  xRoar: { dur: 3.4, run: (v) => v.xRoar() },
  xBreath: { dur: 3.2, run: (v) => v.xBreath() },
  xLaugh: { dur: 1.8, run: (v) => v.xLaugh() },
  xSpeak: { dur: 3.2, run: (v) => v.xSpeak('i see you little one') },
  xSpeak2: { dur: 3.6, run: (v) => v.xSpeak('found you. do not look up.') },
  motherWhispers: { dur: 3.2, run: (v) => v.motherWhispers(8) },
  motherWail: { dur: 3.2, run: (v) => v.motherWail(1) },
  kingBellow: { dur: 2.2, run: (v) => v.kingBellow() },
  kingSnort: { dur: 1.2, run: (v) => v.kingSnort(3) },
  kingClack: { dur: 1.0, run: (v) => v.kingClack(6) },
  queenToll: { dur: 4.5, run: (v) => v.queenToll(1, 1) },
  queenChoir: { dur: 4.2, run: (v) => v.queenChoir(1) },
  queenShriek: { dur: 2.2, run: (v) => v.queenShriek(1) },
  wyrmHiss: { dur: 1.8, run: (v) => v.wyrmHiss(1.2) },
  wyrmRattle: { dur: 1.2, run: (v) => v.wyrmRattle(18) },
  wyrmScreech: { dur: 2.6, run: (v) => v.wyrmScreech(1) },
  wyrmRoar: { dur: 3.0, run: (v) => v.wyrmRoar() },
  mimicHum: { dur: 4.0, run: (v) => v.mimicHum() },
  mimicLaugh: { dur: 1.4, run: (v) => v.mimicLaugh() },
  mimicSnarl: { dur: 2.0, run: (v) => v.mimicSnarl() },
  collectorTsk: { dur: 1.0, run: (v) => v.collectorTsk(3) },
  collectorChuckle: { dur: 1.6, run: (v) => v.collectorChuckle() },
  collectorSpeak: { dur: 3.4, run: (v) => v.collectorSpeak('hold still, little specimen') },
  glassBreak: { dur: 1.4, run: (v) => v.glassBreak() },
  mashRoar: { dur: 3.6, run: (v) => v.mashRoar() },
  mashSpeak: { dur: 3.4, run: (v) => v.mashSpeak('we are all of them') },
};

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const vr = re[i + k + len / 2]! * cr - im[i + k + len / 2]! * ci;
        const vi = re[i + k + len / 2]! * ci + im[i + k + len / 2]! * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

async function render(name: string) {
  const def = R[name];
  if (!def) throw new Error('no voice ' + name);
  const ctx = new OfflineAudioContext(2, Math.floor(SR * def.dur), SR);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(ctx.destination);
  const voice = new Voice(ctx, out);
  def.run(voice);
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0);
  const Rr = buf.getChannelData(1);
  const n = L.length;
  const mono = new Float32Array(n);
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  let nan = 0;
  for (let i = 0; i < n; i++) {
    const v = (L[i]! + Rr[i]!) * 0.5;
    if (!Number.isFinite(v)) nan++;
    mono[i] = Number.isFinite(v) ? v : 0;
    const a = Math.max(Math.abs(L[i]!), Math.abs(Rr[i]!));
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / n);
  // when does it start and stop being audible?
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) if (Math.abs(mono[i]!) > 0.01) {
    if (first < 0) first = i;
    last = i;
  }
  // spectrogram
  const N = 1024;
  const hop = 512;
  const frames = Math.floor((n - N) / hop);
  const maxHz = 9000;
  const bins = Math.floor((maxHz / (SR / 2)) * (N / 2));
  const W = Math.max(500, Math.min(frames, 1000));
  const H = 300;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, W, H);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let centroidNum = 0;
  let centroidDen = 0;
  const band = [0, 0, 0];
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  for (let fI = 0; fI < W; fI++) {
    const off = Math.floor((fI / W) * frames) * hop;
    for (let i = 0; i < N; i++) {
      re[i] = mono[off + i]! * win[i]!;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      const mag = Math.hypot(re[b]!, im[b]!) / N;
      const db = 20 * Math.log10(mag + 1e-9);
      const u = Math.max(0, Math.min(1, (db + 100) / 70));
      const y = H - 1 - Math.floor((b / bins) * H);
      const r = Math.floor(255 * Math.pow(u, 1.8));
      const gg = Math.floor(200 * Math.pow(u, 2.6));
      const bl = Math.floor(120 + 135 * u) * (u > 0.05 ? 1 : 0);
      g.fillStyle = `rgb(${r},${gg},${bl})`;
      g.fillRect(fI, y, 1, Math.ceil(H / bins) + 1);
      const f = (b / (N / 2)) * (SR / 2);
      centroidNum += f * mag * mag;
      centroidDen += mag * mag;
      band[f < 150 ? 0 : f < 3000 ? 1 : 2]! += mag * mag;
    }
  }
  // frequency grid
  g.strokeStyle = '#ffffff22';
  g.fillStyle = '#9fb8b4';
  g.font = '10px monospace';
  for (const hz of [500, 1000, 2000, 4000, 8000]) {
    const y = H - (hz / maxHz) * H;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
    g.fillText(`${hz}`, 2, y - 2);
  }
  const stats = {
    name,
    seconds: def.dur,
    audible: first < 0 ? null : [+(first / SR).toFixed(2), +(last / SR).toFixed(2)],
    peakDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1),
    rmsDb: +(20 * Math.log10(rms + 1e-9)).toFixed(1),
    clippedSamples: clipped,
    nan,
    centroidHz: Math.round(centroidNum / Math.max(1e-12, centroidDen)),
    // share of the energy: under 150 Hz (a phone speaker cannot play it), 150-3000 Hz (where voices live), over 3 kHz
    lowMidHigh: band.map((b) => Math.round((100 * b) / Math.max(1e-12, band[0]! + band[1]! + band[2]!))),
  };
  return { stats, png: cv.toDataURL('image/png') };
}

(window as unknown as { __lab: unknown }).__lab = {
  names: () => Object.keys(R),
  render,
  stats: async (name: string) => (await render(name)).stats,
};
