"""The spoken lines, placed and given a space: <out>/<id>.wav (48 kHz stereo), one file per line of src/data/lines.json.
   python3 audio/voices.py <takesDir> <out>          (numpy, scipy, soundfile; ffmpeg)

Nothing here bends the voice: pitch shifting and echo taps are what made the earlier cuts sound synthetic. Each style is a
place the voice is heard in, made with a convolution room:
  close    the Mother at the bedside: dry, near, a small warm room
  far      the Mother calling from the cage, a long way off: a big dark hall, the top and bottom of the voice thinned
  breathy  "Don't look up": half spoken, half breathed (the take's own breath, from its vocal tract, mixed under it)
  whisper  the thing above, at the very end: only breath, and a second, darker throat under it
For every line the slowest take that still ends before the next line is used.
"""
import glob
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

src, out = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
LINES = json.load(open(os.path.join(here, '..', 'src', 'data', 'lines.json')))
CUES = json.load(open(os.path.join(here, '..', 'src', 'data', 'cues.json')))
os.makedirs(out, exist_ok=True)
SR = 48000
rng = np.random.default_rng(3)


def room(secs, decay, bright, name):
    """a stereo impulse response: a few early reflections, then a diffuse tail that darkens as it dies"""
    n = int(secs * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    for ch in range(2):
        tail = rng.normal(0, 1, n) * np.exp(-t * 6.9 / decay)
        # a one-pole low-pass whose cutoff falls as the tail goes on
        a = bright * (1 - 0.85 * np.arange(n) / n)
        y = np.zeros(n)
        acc = 0.0
        for i in range(n):
            acc += a[i] * (tail[i] - acc)
            y[i] = acc
        for d, g in ((0.009, 0.45), (0.017, 0.32), (0.026, 0.26), (0.039, 0.2)):
            k = int((d + 0.0023 * ch) * SR)
            y[k] += g * (1 if (k + ch) % 2 else -1)
        ir[:, ch] = y
    ir /= np.abs(ir).max()
    path = f'{out}/_{name}.wav'
    sf.write(path, ir.astype(np.float32), SR)
    return path


ROOM = room(0.5, 0.35, 0.6, 'room')
HALL = room(3.0, 2.4, 0.3, 'hall')

EQ = 'equalizer=f=180:t=q:w=1:g=1.2,equalizer=f=3300:t=q:w=1.3:g=1.8,deesser=i=0.3,acompressor=threshold=-24dB:ratio=2.2:attack=10:release=180:makeup=1.6'
STYLE = {
    'close': ('highpass=f=75,' + EQ, ROOM, 0.09),
    'far': ('highpass=f=160,lowpass=f=7200,' + EQ, HALL, 0.42),
    'breathy': ('highpass=f=90,' + EQ + ',equalizer=f=8000:t=q:w=1.5:g=2', ROOM, 0.12),
    'whisper': ('highpass=f=120,equalizer=f=900:t=q:w=1:g=2,equalizer=f=5000:t=q:w=1.4:g=2.5', HALL, 0.45),
}


def lpc_breath(x, sr, order=24):
    """the take's own vocal tract (LPC, frame by frame), driven by breath noise instead of a voice: a true whisper"""
    n = len(x)
    hop, win = int(0.01 * sr), int(0.03 * sr)
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
            kk = -(r[i] + np.dot(a[1:i], r[i - 1:0:-1])) / e
            a[1:i + 1] = a[1:i + 1] + kk * a[i - 1::-1][:i]
            e *= 1 - kk * kk
        y[s:s + win] += lfilter([np.sqrt(max(e, 1e-12))], a, rng.normal(0, 1, win)) * w
    y = y[:n]
    return y / (np.abs(y).max() + 1e-9)


def darker(x, sr, fc=900):
    """the same breath through a bigger, darker throat: its top taken away (two one-pole low-passes), for the second layer"""
    a = np.exp(-2 * np.pi * fc / sr)
    y = lfilter([1 - a], [1, -a], lfilter([1 - a], [1, -a], x))
    return y / (np.abs(y).max() + 1e-9)


def place(inp, chain, ir, wet, dst):
    fc = (f'[0:a]aresample={SR}:resampler=soxr,aformat=channel_layouts=stereo,{chain},apad=pad_dur=3,asplit=2[d][w];'
          f'[w][1:a]afir=dry=10:wet=10[r];[r]volume={wet}[rw];[d][rw]amix=inputs=2:normalize=0,'
          f'areverse,silenceremove=start_periods=1:start_threshold=-66dB,areverse')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', inp, '-i', ir, '-filter_complex', fc, '-ar', str(SR), '-ac', '2', dst], check=True)


starts = sorted(LINES, key=lambda l: l['at'])
timing = []
for i, ln in enumerate(starts):
    nxt = starts[i + 1]['at'] if i + 1 < len(starts) else CUES['length']
    room_for = nxt - ln['at'] - 0.15
    takes = sorted(glob.glob(f"{src}/{ln['id']}.s*.wav"), key=lambda p: -sf.info(p).duration)
    pick = next((p for p in takes if sf.info(p).duration <= room_for), takes[-1])
    chain, ir, wet = STYLE[ln['style']]
    x, sr = sf.read(pick)
    if ln['style'] == 'breathy':
        x = 0.62 * x / (np.abs(x).max() + 1e-9) + 0.38 * lpc_breath(x, sr)
    elif ln['style'] == 'whisper':
        b = lpc_breath(x, sr)
        d = int(0.018 * sr)
        x = 0.75 * b + 0.55 * np.concatenate([np.zeros(d), darker(b, sr)])[:len(b)]
    x = x / (np.abs(x).max() + 1e-9) * 0.85
    tmp = f"{out}/_in_{ln['id']}.wav"
    sf.write(tmp, x.astype(np.float32), sr)
    place(tmp, chain, ir, wet, f"{out}/{ln['id']}.wav")
    timing.append({'id': ln['id'], 'at': ln['at'], 'dur': round(sf.info(pick).duration, 3)})
    print(f"{ln['id']}: {os.path.basename(pick)} ({sf.info(pick).duration:.2f} s of {room_for:.2f}) {ln['style']}")

# when each line is heard, for the captions in the picture
with open(os.path.join(here, '..', 'src', 'data', 'voice.json'), 'w') as f:
    json.dump(timing, f, indent=1)
