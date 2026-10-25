"""The trailer's voice lines (Kokoro, kokoro-onnx), written to lines/<name>.wav where the model files are.
Run it in the folder that holds kokoro-v1.0.int8.onnx and voices-v1.0.bin (see README.md).

Kokoro's most natural voices tell it: af_heart (the narrator, a storyteller, close and quiet), af_bella (Mother), af_nicole
(the Blob, small and breathy), am_michael (Father). Nothing is pitch-shifted afterwards: that is what made the first cut sound
synthetic. Each line gets a couple of takes at different speeds (name.s92.wav ...); voices.py keeps the one that fits its slot.
"""
import os

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

k = Kokoro('kokoro-v1.0.int8.onnx', 'voices-v1.0.bin')
NARR = 'af_heart'
L = [
    # name, voice, speeds, text
    ('n1', NARR, (0.9, 0.95), 'Every night, she sang you the same song.'),
    ('m1', 'af_bella', (0.85, 0.9), "Don't look up."),
    ('n2', NARR, (0.9, 0.95), 'But something up there... was listening.'),
    ('n3', NARR, (0.85, 0.9), 'It took them.'),
    ('n4', NARR, (0.9, 0.95), 'So you run.'),
    ('n5', NARR, (0.92, 0.97), 'Five guardians stand in your way.'),
    ('n6', NARR, (0.88, 0.93), 'And when the last star goes out...'),
    ('n7', NARR, (0.85, 0.9), 'look up.'),
    ('n8', NARR, (0.88, 0.93), 'There is a third direction.'),
    ('m2', 'af_bella', (0.85, 0.9), 'Little light...'),
    ('b1', 'af_nicole', (0.9, 0.95), 'I found you.'),
    ('f1', 'am_michael', (0.88, 0.93), 'You looked up.'),
    ('b2', 'af_nicole', (0.9, 0.95), "I'm not afraid of it anymore."),
    ('n9', NARR, (0.85, 0.9), 'The Third Direction.'),
    ('w1', 'af_nicole', (0.8, 0.85), 'Look up.'),
]
os.makedirs('lines', exist_ok=True)
for name, voice, speeds, text in L:
    for sp in speeds:
        s, sr = k.create(text, voice=voice, speed=sp, lang='en-us')
        # trim the silence Kokoro leaves at either end
        a = np.abs(s)
        on = np.where(a > 0.01)[0]
        s = s[max(0, on[0] - int(0.03 * sr)) : on[-1] + int(0.12 * sr)]
        sf.write(f'lines/{name}.s{round(sp * 100)}.wav', s, sr)
        print(name, sp, round(len(s) / sr, 2))
