"""The trailer's spoken lines (Kokoro, kokoro-onnx), from src/data/lines.json, written to <out>/<id>.s<speed>.wav.
   python3 audio/lines.py <kokoroDir> <out> [sheet.json]      (kokoroDir holds kokoro-v1.0.int8.onnx and voices-v1.0.bin)
A short with its own narrator has its own sheet of lines (src/data/lines-<short>.json).

The Mother tells it (af_heart, the most natural voice Kokoro has), at close to her own speed: slowing a voice down is what
makes it sound synthetic. A '|' in a line is a held breath: each side is spoken on its own and joined with a pause.
A line can also be performed, phrase by phrase (the noir narrator's are): "rates" sets each phrase's own pace (times the
take's speed), "pauses" each pause after a phrase, and "breath" puts an inhale of that many seconds before the first word.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro
from scipy.signal import butter, lfilter

kdir, out = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
LINES = json.load(open(sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, '..', 'src', 'data', 'lines.json')))
k = Kokoro(os.path.join(kdir, 'kokoro-v1.0.int8.onnx'), os.path.join(kdir, 'voices-v1.0.bin'))
PAUSE = 0.45
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(5)


def say(text, voice, sp):
    s, sr = k.create(text, voice=voice, speed=sp, lang='en-us')
    # trim the silence Kokoro leaves at either end
    on = np.where(np.abs(s) > 0.01)[0]
    return s[max(0, on[0] - int(0.03 * sr)) : on[-1] + int(0.12 * sr)], sr


def inhale(sr, dur, level=0.045):
    """a breath in through the mouth: air through two soft resonances, swelling and cut off as the words begin"""
    n = int(dur * sr)
    x = rng.normal(0, 1, n)
    y = sum(lfilter(*butter(2, [lo / (sr / 2), hi / (sr / 2)], 'band'), x) * g for lo, hi, g in ((400, 900, 1.0), (1500, 2600, 0.6)))
    u = np.linspace(0, 1, n)
    env = np.sin(np.pi * np.minimum(1, u * 1.15)) ** 1.4 * (0.5 + 0.5 * u)
    return (y / (np.abs(y).max() + 1e-9) * level * env).astype(np.float32)


for ln in LINES:
    texts = ln['text'].split('|')
    rates = ln.get('rates', [1.0] * len(texts))
    pauses = ln.get('pauses', [PAUSE] * (len(texts) - 1)) + [0]
    for sp in ln['speeds']:
        parts = [say(t, ln['voice'], sp * r) for t, r in zip(texts, rates)]
        sr = parts[0][1]
        s = np.concatenate([x for (p, _), ps in zip(parts, pauses) for x in (p, np.zeros(int(ps * sr), np.float32))])
        if ln.get('breath'):
            s = np.concatenate([inhale(sr, ln['breath']), np.zeros(int(0.04 * sr), np.float32), s])
        sf.write(f"{out}/{ln['id']}.s{round(sp * 100)}.wav", s, sr)
        print(ln['id'], sp, round(len(s) / sr, 2))
