import { CUE } from '../src/cinematic/cues';
import { TrailerScore } from '../src/cinematic/score';

/**
 * Renders the trailer's score on an OfflineAudioContext, through the same chain the game uses (the score bus, then the master
 * compressor), and reports what it did: peak and loudness for every second, how much of it is clipped, a spectrogram with the cue
 * times marked, and a WAV to listen to.
 *   __score.render() -> { stats, png, wav (base64) }
 */

const SR = 44100;
/** the score starts this far into the buffer */
const T0 = 0.1;

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

const db = (v: number) => +(20 * Math.log10(v + 1e-9)).toFixed(1);

function wavBase64(L: Float32Array, R: Float32Array): string {
  const n = L.length;
  const bytes = new Uint8Array(44 + n * 4);
  const dv = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVEfmt ');
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

async function render() {
  const secs = CUE.duration + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  // the same chain as the game: score bus (0.9) -> master compressor -> speakers
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  comp.connect(ctx.destination);
  const out = ctx.createGain();
  out.gain.value = 0.9;
  out.connect(comp);
  const noise = ctx.createBuffer(1, SR * 2, SR);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // count what the score asks the audio engine for
  const counts: Record<string, number> = {};
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(ctx)) as object;
  for (const k of Object.getOwnPropertyNames(proto)) {
    const f = Object.getOwnPropertyDescriptor(proto, k)?.value as unknown;
    if (k.startsWith('create') && typeof f === 'function') {
      (ctx as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => {
        counts[k.slice(6)] = (counts[k.slice(6)] ?? 0) + 1;
        return (f as (...x: unknown[]) => unknown).apply(ctx, a);
      };
    }
  }
  // schedule the way the game does: a little of the future at a time, so the graph stays small
  const score = new TrailerScore({ ctx, out, noise });
  score.begin(T0);
  const AHEAD = 1.4;
  const STEP = 0.25;
  score.pumpTo(AHEAD);
  for (let t = STEP; t < secs; t += STEP) {
    void ctx.suspend(t).then(() => {
      score.pumpTo(t + AHEAD);
      void ctx.resume();
    });
  }
  const t1 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = Math.round(performance.now() - t1);

  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const n = L.length;
  const mono = new Float32Array(n);
  let peak = 0;
  let clipped = 0;
  let nan = 0;
  for (let i = 0; i < n; i++) {
    const v = (L[i]! + R[i]!) * 0.5;
    if (!Number.isFinite(v)) nan++;
    mono[i] = Number.isFinite(v) ? v : 0;
    const a = Math.max(Math.abs(L[i]!), Math.abs(R[i]!));
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
  }
  // loudness and peak for every 0.5 s of the trailer
  const win = Math.floor(SR * 0.5);
  const perHalf: { t: number; peakDb: number; rmsDb: number }[] = [];
  for (let s = 0; s * win < n; s++) {
    let pk = 0;
    let sum = 0;
    let cnt = 0;
    for (let i = s * win; i < Math.min(n, (s + 1) * win); i++) {
      const a = Math.abs(mono[i]!);
      if (a > pk) pk = a;
      sum += mono[i]! * mono[i]!;
      cnt++;
    }
    perHalf.push({ t: +(s * 0.5 - T0).toFixed(1), peakDb: db(pk), rmsDb: db(Math.sqrt(sum / Math.max(1, cnt))) });
  }
  let total = 0;
  for (let i = 0; i < n; i++) total += mono[i]! * mono[i]!;

  // sudden loud starts (a hit): 10 ms of loudness that jumps at least 9 dB over the 40 ms before it
  const fr10 = Math.floor(SR * 0.01);
  const lvl: number[] = [];
  for (let i = 0; i + fr10 < n; i += fr10) {
    let s2 = 0;
    for (let k = i; k < i + fr10; k++) s2 += mono[k]! * mono[k]!;
    lvl.push(20 * Math.log10(Math.sqrt(s2 / fr10) + 1e-6));
  }
  const onsets: { t: number; db: number }[] = [];
  for (let i = 4; i < lvl.length; i++) {
    const before = Math.max(lvl[i - 1]!, lvl[i - 2]!, lvl[i - 3]!, lvl[i - 4]!);
    if (lvl[i]! > before + 9 && lvl[i]! > -30 && (onsets.length === 0 || (i * 0.01 - T0) - onsets[onsets.length - 1]!.t > 0.08)) onsets.push({ t: +(i * 0.01 - T0).toFixed(2), db: +lvl[i]!.toFixed(1) });
  }

  // spectrogram: time across, frequency up on a log axis (40 Hz - 12 kHz), with the cue times marked
  const N = 2048;
  const hop = Math.floor(SR * 0.04);
  const frames = Math.floor((n - N) / hop);
  const PXS = 22;
  const Wd = Math.floor((n / SR) * PXS);
  const H = 420;
  const cv = document.createElement('canvas');
  cv.width = Wd;
  cv.height = H + 90;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#05060c';
  g.fillRect(0, 0, cv.width, cv.height);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const fLo = 40;
  const fHi = 12000;
  const yOf = (f: number) => H - 1 - Math.floor((Math.log(f / fLo) / Math.log(fHi / fLo)) * (H - 1));
  const bins = N / 2;
  const band = [0, 0, 0];
  for (let fr = 0; fr < frames; fr++) {
    const off = fr * hop;
    for (let i = 0; i < N; i++) {
      re[i] = mono[off + i]! * w[i]!;
      im[i] = 0;
    }
    fft(re, im);
    const x = Math.floor(((off / SR) * Wd) / (n / SR));
    const x2 = Math.floor((((off + hop) / SR) * Wd) / (n / SR));
    for (let b = 1; b < bins; b++) {
      const f = (b / bins) * (SR / 2);
      if (f < 20 || f > fHi) continue;
      const mag = Math.hypot(re[b]!, im[b]!) / N;
      band[f < 150 ? 0 : f < 3000 ? 1 : 2]! += mag * mag;
      if (f < fLo) continue;
      const u = Math.max(0, Math.min(1, (20 * Math.log10(mag + 1e-9) + 95) / 70));
      if (u < 0.04) continue;
      const y = yOf(f);
      const y2 = yOf((((b + 1) / bins) * SR) / 2);
      g.fillStyle = `rgb(${Math.floor(255 * Math.pow(u, 1.7))},${Math.floor(210 * Math.pow(u, 2.8))},${Math.floor(110 + 145 * u)})`;
      g.fillRect(x, y2, Math.max(1, x2 - x), Math.max(1, y - y2 + 1));
    }
  }
  // loudness curve under the spectrogram
  g.fillStyle = '#0b1018';
  g.fillRect(0, H, Wd, 90);
  g.strokeStyle = '#9ff4ee';
  g.beginPath();
  const step = Math.floor(SR * 0.05);
  for (let i = 0; i + step < n; i += step) {
    let s2 = 0;
    for (let k = i; k < i + step; k++) s2 += mono[k]! * mono[k]!;
    const d = 20 * Math.log10(Math.sqrt(s2 / step) + 1e-6);
    const y = H + 85 - Math.max(0, Math.min(1, (d + 60) / 60)) * 80;
    const x = (i / SR) * PXS;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  // cue lines
  g.font = '11px monospace';
  const marks: [number, string][] = [
    [CUE.cardIn, 'card'], [CUE.openingStart, 'clearing'], [CUE.dontLookUp, 'mother'], [CUE.shadowCreep, 'shadow'], [CUE.jumpCut, 'jump'], [CUE.slam, 'SLAM'], [CUE.eyesOpen, 'eyes'],
    [CUE.montageStart, 'places'], [CUE.footLands, 'foot'], [CUE.guardianCuts[0]!, 'guardians'], [CUE.edgeStart, 'EDGE'], [CUE.riserStart, 'riser'], [CUE.crack, 'CRACK'], [CUE.boom, 'boom'],
    [CUE.boom + 0.55, 'burst'], [CUE.reveal, 'X'], [CUE.title, 'TITLE'], [CUE.collector, 'collector'], [CUE.mash, 'mash'], [CUE.finale, 'finale'], [CUE.fadeOut, 'fade'],
  ];
  marks.forEach(([t, label], i) => {
    const x = (t + T0) * PXS;
    g.strokeStyle = '#ffffff30';
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H + 90);
    g.stroke();
    g.fillStyle = '#e8fffb';
    g.fillText(`${label} ${t.toFixed(1)}`, x + 2, 12 + (i % 3) * 12);
  });
  ([...CUE.guardianCuts, ...CUE.zoneCuts] as number[]).forEach((t) => {
    g.strokeStyle = '#ffd87855';
    g.beginPath();
    g.moveTo((t + T0) * PXS, 0);
    g.lineTo((t + T0) * PXS, H);
    g.stroke();
  });
  g.fillStyle = '#9fb8b4';
  for (const f of [100, 200, 500, 1000, 2000, 5000, 10000]) {
    g.fillText(`${f}`, 2, yOf(f) - 2);
    g.strokeStyle = '#ffffff15';
    g.beginPath();
    g.moveTo(0, yOf(f));
    g.lineTo(Wd, yOf(f));
    g.stroke();
  }

  return {
    stats: { seconds: +(n / SR).toFixed(1), renderMs, nodesCreated: counts, onsets, lowMidHigh: band.map((b) => Math.round((100 * b) / Math.max(1e-12, band[0]! + band[1]! + band[2]!))), peakDb: db(peak), rmsDb: db(Math.sqrt(total / n)), clippedSamples: clipped, nan, perHalf },
    png: cv.toDataURL('image/png'),
    wav: wavBase64(L, R),
  };
}

(window as unknown as { __score: unknown }).__score = { render };
