"""The trailer's voices, from the raw Kokoro takes (lines.py), placed and treated for the mix.
   python3 tools/trailer/voices.py <linesDir> <outDir>        (needs numpy, scipy, soundfile; ffmpeg)

No echo taps and no crude pitch shifting: both made the first cut sound synthetic. Each voice gets a real-sounding space
instead (a convolution reverb from a generated room), EQ and compression, and is resampled cleanly to 48 kHz. The narrator is
taken down to a trailer voice's depth with Praat's PSOLA (it moves the pitch and keeps the voice's own shape, a little larger),
with more range in his pitch, so he sounds deeper and more dramatic, not processed.
For every line the slowest take that still fits before the next line (timeline.VOICE) is kept.
The last line is a true whisper: the take's own vocal-tract filter (LPC) driven by breath noise instead of a voice.
"""
import glob
import os
import subprocess
import sys

import numpy as np
import parselmouth
import soundfile as sf
from parselmouth.praat import call
from scipy.signal import lfilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from timeline import LENGTH, VOICE  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
SR = 48000
rng = np.random.default_rng(3)


def room(secs, decay, bright, name):
    """a stereo impulse response: early reflections, then a diffuse tail that darkens as it dies"""
    n = int(secs * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        tail = rng.normal(0, 1, n) * np.exp(-t * 6.9 / decay)
        # darker as it goes: a one-pole low-pass whose cutoff falls
        y = np.zeros(n)
        acc = 0.0
        a0 = bright
        for i in range(n):
            a = a0 * (1 - 0.85 * i / n)
            acc += a * (tail[i] - acc)
            y[i] = acc
        for d, g in ((0.011, 0.5), (0.019, 0.35), (0.027, 0.3), (0.041, 0.22)):
            k = int((d + 0.002 * ch) * SR)
            y[k] += g * (1 if (k + ch) % 2 else -1)
        ir[:, ch] = y
    ir /= np.abs(ir).max()
    path = f'{out}/_{name}.wav'
    sf.write(path, ir.astype(np.float32), SR)
    return path


ROOM = room(0.6, 0.45, 0.55, 'room')
HALL = room(2.4, 1.9, 0.35, 'hall')
PLATE = room(1.4, 1.0, 0.3, 'plate')

#  name prefix -> (eq/dynamics chain, reverb, wet)
DRY = 'highpass=f=75,equalizer=f=190:t=q:w=0.9:g=1.5,equalizer=f=3400:t=q:w=1.2:g=2.2,deesser=i=0.35,acompressor=threshold=-24dB:ratio=2.6:attack=8:release=160:makeup=2'
NARR = ('highpass=f=50,equalizer=f=105:t=q:w=0.9:g=3.5,equalizer=f=320:t=q:w=1.1:g=-2.5,equalizer=f=2900:t=q:w=1.2:g=2.5,'
        'deesser=i=0.4,acompressor=threshold=-27dB:ratio=3.6:attack=5:release=200:makeup=3.2')
KIND = {
    'n': (NARR, PLATE, 0.13),
    'm': (DRY + ',lowpass=f=9500', HALL, 0.26),
    'f': (DRY + ',lowpass=f=9000', HALL, 0.26),
    'b': ('highpass=f=110,equalizer=f=3800:t=q:w=1.2:g=2,deesser=i=0.3,acompressor=threshold=-24dB:ratio=2.4:attack=8:release=160:makeup=2', ROOM, 0.16),
    'w': ('highpass=f=380,equalizer=f=5200:t=q:w=1.5:g=3', HALL, 0.42),
}


def whisper(x, sr):
    """keep the shape of the mouth (LPC, frame by frame), replace the voice with breath"""
    n = len(x)
    hop, win, order = int(0.01 * sr), int(0.03 * sr), 24
    y = np.zeros(n + win)
    w = np.hanning(win)
    for s in range(0, n - win, hop):
        f = x[s:s + win] * w
        r = np.correlate(f, f, 'full')[win - 1:win + order]
        if r[0] < 1e-9:
            continue
        a = np.zeros(order + 1)
        a[0] = 1
        e = r[0]
        for i in range(1, order + 1):
            k = -(r[i] + np.dot(a[1:i], r[i - 1:0:-1])) / e
            a[1:i + 1] = a[1:i + 1] + k * a[i - 1::-1][:i]
            e *= 1 - k * k
        g = np.sqrt(max(e, 1e-12))
        y[s:s + win] += lfilter([g], a, rng.normal(0, 1, win)) * w
    y = y[:n]
    return y / (np.abs(y).max() + 1e-9) * 0.8


def deepen(x, sr, median=92, formants=0.95, spread=1.2):
    """the narrator's depth: pitch median down to `median` Hz, formants a touch lower, the melody of the line a touch wider"""
    out = call(parselmouth.Sound(x.astype(np.float64), sr), 'Change gender', 60, 400, formants, median, spread, 1.0)
    y = out.values[0]
    return y / (np.abs(y).max() + 1e-9) * 0.85


def ff(inp, chain, ir, wet, dst):
    fc = (f'[0:a]aresample={SR}:resampler=soxr,aformat=channel_layouts=stereo,{chain},apad=pad_dur=2.2,asplit=2[d][w];'
          f'[w][1:a]afir=dry=10:wet=10[r];[r]volume={wet}[rw];[d][rw]amix=inputs=2:normalize=0,'
          f'areverse,silenceremove=start_periods=1:start_threshold=-66dB,areverse')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', inp, '-i', ir, '-filter_complex', fc, '-ar', str(SR), '-ac', '2', dst], check=True)


starts = sorted(VOICE)
for i, (t0, name, _) in enumerate(starts):
    nxt = next((t for t, n, _ in starts[i + 1:] if t > t0), LENGTH)
    room_for = nxt - t0 - 0.12
    takes = sorted(glob.glob(f'{src}/{name}.s*.wav'), key=lambda p: -sf.info(p).duration)
    pick = next((p for p in takes if sf.info(p).duration <= room_for), takes[-1])
    kind = name[0]
    chain, ir, wet = KIND[kind]
    inp = pick
    if kind == 'n':
        x, sr = sf.read(pick)
        inp = f'{out}/_n_{name}.wav'
        sf.write(inp, deepen(x, sr).astype(np.float32), sr)
    if kind == 'w':
        x, sr = sf.read(pick)
        inp = f'{out}/_w_{name}.wav'
        sf.write(inp, whisper(x, sr).astype(np.float32), sr)
    ff(inp, chain, ir, wet, f'{out}/{name}.wav')
    print(f'{name}: {os.path.basename(pick)} ({sf.info(pick).duration:.2f} s of {room_for:.2f})')
