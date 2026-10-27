"""The trailer's spoken lines (Kokoro, kokoro-onnx), from src/data/lines.json, written to <out>/<id>.s<speed>.wav.
   python3 audio/lines.py <kokoroDir> <out> [sheet.json]      (kokoroDir holds kokoro-v1.0.int8.onnx and voices-v1.0.bin)
A short with its own narrator has its own sheet of lines (src/data/lines-<short>.json).

The Mother tells it (af_heart, the most natural voice Kokoro has), at close to her own speed: slowing a voice down is what
makes it sound synthetic. A '|' in a line is a held breath: each side is spoken on its own and joined with a pause.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

kdir, out = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
LINES = json.load(open(sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, '..', 'src', 'data', 'lines.json')))
k = Kokoro(os.path.join(kdir, 'kokoro-v1.0.int8.onnx'), os.path.join(kdir, 'voices-v1.0.bin'))
PAUSE = 0.45
os.makedirs(out, exist_ok=True)


def say(text, voice, sp):
    s, sr = k.create(text, voice=voice, speed=sp, lang='en-us')
    # trim the silence Kokoro leaves at either end
    on = np.where(np.abs(s) > 0.01)[0]
    return s[max(0, on[0] - int(0.03 * sr)) : on[-1] + int(0.12 * sr)], sr


for ln in LINES:
    for sp in ln['speeds']:
        parts = [say(t, ln['voice'], sp) for t in ln['text'].split('|')]
        sr = parts[0][1]
        gap = np.zeros(int(PAUSE * sr), np.float32)
        s = np.concatenate([x for p, _ in parts for x in (p, gap)][:-1])
        sf.write(f"{out}/{ln['id']}.s{round(sp * 100)}.wav", s, sr)
        print(ln['id'], sp, round(len(s) / sr, 2))
