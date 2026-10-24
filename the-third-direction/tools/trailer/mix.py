"""The trailer's sound: the music under the voices.
   python3 tools/trailer/mix.py music.wav voiceDir out.wav
Every voice goes in where timeline.VOICE puts it; the music steps back (about 7 dB, smoothly) while anyone speaks."""
import sys
import wave

import numpy as np

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from timeline import LENGTH, VOICE  # noqa: E402

SR = 48000


def read(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR, path
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32767
        return a.reshape(-1, w.getnchannels())


music_path, vdir, out_path = sys.argv[1:4]
music = read(music_path)
n = int(LENGTH * SR)
music = np.pad(music, ((0, max(0, n - len(music))), (0, 0)))[:n]
voice = np.zeros((n, 2))
for t0, name, gain in VOICE:
    v = read(f'{vdir}/{name}.wav') * gain
    i = int(t0 * SR)
    j = min(n, i + len(v))
    voice[i:j] += v[: j - i]

# how much someone is speaking, smoothed (fast in, slow out), and the music ducks under it
lvl = np.abs(voice).max(1)
k = int(0.05 * SR)
lvl = np.convolve(lvl, np.ones(k) / k, mode='same')
speak = np.clip(lvl / 0.02, 0, 1)
env = np.zeros(n)
a_in = 1 - np.exp(-1 / (0.06 * SR))
a_out = 1 - np.exp(-1 / (0.45 * SR))
e = 0.0
step = 64
for s in range(0, n, step):
    target = speak[s]
    e += (target - e) * (1 - (1 - (a_in if target > e else a_out)) ** step)
    env[s : s + step] = e
duck = 1 - 0.55 * env
mix = music * duck[:, None] * 0.9 + voice * 1.0
# a soft ceiling
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
print('mix', out_path)
