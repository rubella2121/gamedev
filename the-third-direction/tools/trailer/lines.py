"""The trailer's voice lines (Kokoro, kokoro-onnx), written to lines/<name>.s<speed>.wav where the model files are.
Run it in the folder that holds kokoro-v1.0.int8.onnx and voices-v1.0.bin (see README.md).

The narrator is a blend of two of Kokoro's male voices (am_fenrir, the most expressive, and am_puck, the deepest clean one),
slow and deliberate; voices.py then takes his pitch down to a trailer voice's depth (Praat PSOLA, which keeps it human).
Mother is af_bella, the Blob af_nicole (small, breathy), Father am_michael. Each line gets a couple of takes at different
speeds; voices.py keeps the one that fits its slot. A '|' in a line is a held breath: each side is spoken on its own and the
two are joined with a pause, which is how a narrator lets a line land.
"""
import os

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

k = Kokoro('kokoro-v1.0.int8.onnx', 'voices-v1.0.bin')
NARR = 0.6 * k.get_voice_style('am_fenrir') + 0.4 * k.get_voice_style('am_puck')
L = [
    # name, voice, speeds, text
    ('n1', NARR, (0.8, 0.86), 'Every night...|the same lullaby.'),
    ('m1', 'af_bella', (0.85, 0.9), "Don't look up."),
    ('n2', NARR, (0.8, 0.86), 'She never told you why.'),
    ('n3', NARR, (0.8, 0.86), 'It took everything.'),
    ('n4', NARR, (0.82, 0.88), 'Now you are the only light left.'),
    ('n5', NARR, (0.82, 0.88), 'Five guardians stand between you...|and them.'),
    ('n6', NARR, (0.82, 0.88), 'And when the last star goes out...'),
    ('n7', NARR, (0.8, 0.86), 'look up.'),
    ('n8', NARR, (0.8, 0.86), 'There is a third direction.'),
    ('m2', 'af_bella', (0.85, 0.9), 'Little light...|you came.'),
    ('b1', 'af_nicole', (0.9, 0.95), 'I found you.'),
    ('f1', 'am_michael', (0.88, 0.93), 'You looked up.'),
    ('b2', 'af_nicole', (0.9, 0.95), "I'm not afraid of it anymore."),
    ('n9', NARR, (0.78, 0.84), 'The Third Direction.'),
    ('w1', 'af_nicole', (0.8, 0.85), 'Look up.'),
]
os.makedirs('lines', exist_ok=True)
PAUSE = 0.5


def say(text, voice, sp):
    s, sr = k.create(text, voice=voice, speed=sp, lang='en-us')
    # trim the silence Kokoro leaves at either end
    on = np.where(np.abs(s) > 0.01)[0]
    return s[max(0, on[0] - int(0.03 * sr)) : on[-1] + int(0.12 * sr)], sr


for name, voice, speeds, text in L:
    for sp in speeds:
        parts = [say(t, voice, sp) for t in text.split('|')]
        sr = parts[0][1]
        gap = np.zeros(int(PAUSE * sr), np.float32)
        s = np.concatenate([x for p, _ in parts for x in (p, gap)][:-1])
        sf.write(f'lines/{name}.s{round(sp * 100)}.wav', s, sr)
        print(name, sp, round(len(s) / sr, 2))
