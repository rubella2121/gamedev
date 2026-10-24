"""The trailer's music, made from nothing but numbers (numpy), to the timeline in timeline.py.
   python3 tools/trailer/music.py out.wav

A minor, the key of the game's music-box lullaby (the same eight notes open it, come back warm for the family, and close it).
  0 - 12      wind, a low drone, the lullaby on a music box; a heartbeat; a riser
  12 - 31     the forest: a pulse at 100 a minute, low strings, a chord each bar; a slam for every guardian
  31 - 46     the Edge: tremolo strings, ticking, a long rise, then the break (a brass blast, a drop through the floor)
  46 - 63     the Crater: everything, drums and brass on every bar, a hit for each boss's name; the last lock, then silence
  65 - 75     the family: the lullaby again, warm, over slow chords
  75 - 95     the Fourth: a clock, a cluster that will not resolve, the tear, the dimension, one more burst, and gone
  95 - 106    the title: one blow, the lullaby resolved into A major; a tick, and its eye
"""
import sys
import numpy as np

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from timeline import LENGTH, BEAT  # noqa: E402

SR = 48000
N = int(LENGTH * SR) + SR
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)
LULL = [69, 72, 76, 74, 72, 69, 67, 64]  # A4 C5 E5 D5 C5 A4 G4 E4


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(t0, sig, pan=0.0, gain=1.0):
    i = int(t0 * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    lg = np.cos((pan + 1) * np.pi / 4) * gain
    rg = np.sin((pan + 1) * np.pi / 4) * gain
    L[i : i + len(sig)] += sig * lg
    R[i : i + len(sig)] += sig * rg


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(t, a, d):
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)


def env_swell(t, a, r, dur):
    return np.clip(t / a, 0, 1) * np.clip((dur - t) / r, 0, 1)


def lowpass(x, cut):
    """a gentle one-pole low pass, done in the frequency domain (fast for long sounds)"""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X = np.fft.rfft(x)
    X /= np.sqrt(1 + (f / cut) ** 4)
    return np.fft.irfft(X, n)


def bandpass(x, lo, hi):
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X = np.fft.rfft(x)
    X *= (1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)) / np.sqrt(1 + (f / hi) ** 4)
    return np.fft.irfft(X, n)


# ---------------------------------------------------------------- instruments

def music_box(t0, m, gain=0.22, warp=0.0, pan=0.0, dec=1.6):
    t = tt(dec * 2.2)
    f = hz(m) * (1 + warp * (rng.random() - 0.5) * 0.06)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / dec)
    s += 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / (dec * 0.35))
    s += 0.18 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / (dec * 0.18))
    s += 0.12 * np.sin(2 * np.pi * f * 3 * t) * np.exp(-t / (dec * 0.5))
    s *= np.minimum(1, t / 0.003)
    add(t0, s, pan, gain)


def lullaby(t0, step, gain=0.2, warp=0.0, rep=1, pan_sway=0.25):
    k = 0
    for r in range(rep):
        for i, m in enumerate(LULL):
            music_box(t0 + k * step, m, gain * (0.85 + 0.15 * (i == 0)), warp, pan=np.sin(k * 0.9) * pan_sway)
            k += 1


def pad(t0, dur, notes, gain=0.05, bright=6, a=0.8, r=1.2, pan=0.0):
    t = tt(dur)
    s = np.zeros_like(t)
    for m in notes:
        f = hz(m)
        for det in (-0.0018, 0.0, 0.0021):
            for h in range(1, bright + 1):
                s += np.sin(2 * np.pi * f * h * (1 + det) * t + rng.random() * 6.28) / h ** 1.6
    s *= env_swell(t, a, r, dur) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.23 * t))
    add(t0, s / (len(notes) * 3), pan - 0.2, gain)
    add(t0 + 0.013, s / (len(notes) * 3), pan + 0.2, gain)


def drone(t0, dur, m, gain=0.12):
    t = tt(dur)
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2 * t + 1) + 0.25 * np.sin(2 * np.pi * f * 3.01 * t)
    s *= env_swell(t, 2.0, 2.0, dur) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t))
    add(t0, s, 0, gain)


def wind(t0, dur, gain=0.05):
    t = tt(dur)
    n = lowpass(rng.standard_normal(len(t)), 700)
    n *= env_swell(t, 2, 2, dur) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.17 * t) ** 2)
    add(t0, n, -0.4, gain)
    add(t0 + 0.4, n[::-1], 0.4, gain)


def kick(t0, gain=0.5):
    t = tt(0.5)
    f = 45 + 75 * np.exp(-t / 0.045)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    s += 0.3 * rng.standard_normal(len(t)) * np.exp(-t / 0.004)
    add(t0, np.tanh(s * 1.4), 0, gain)


def taiko(t0, gain=0.55):
    t = tt(1.3)
    f = 38 + 50 * np.exp(-t / 0.08)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5)
    s += 0.5 * bandpass(rng.standard_normal(len(t)), 80, 900) * np.exp(-t / 0.08)
    add(t0, np.tanh(s * 1.6), 0, gain)


def snare(t0, gain=0.25):
    t = tt(0.4)
    s = bandpass(rng.standard_normal(len(t)), 900, 7000) * np.exp(-t / 0.09)
    s += 0.4 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    add(t0, s, 0.1, gain)


def braam(t0, m=33, dur=2.6, gain=0.32):
    t = tt(dur)
    s = np.zeros_like(t)
    for det in (-0.004, 0.0, 0.005):
        f = hz(m) * (1 + det) * (1 - 0.02 * np.exp(-t / 0.2))
        ph = 2 * np.pi * np.cumsum(f) / SR
        for h in range(1, 28):
            w = 1 / h * (1.6 if 5 <= h <= 16 else 1)
            s += w * np.sin(h * ph)
    s = np.tanh(s * 0.35) * (np.minimum(1, t / 0.04) * np.exp(-t / (dur * 0.45)))
    s = lowpass(s, 2600)
    add(t0, s, -0.1, gain)
    add(t0 + 0.009, s, 0.1, gain)


def strings_stac(t0, m, gain=0.07, dur=0.24):
    t = tt(dur + 0.2)
    f = hz(m)
    s = np.zeros_like(t)
    for det in (-0.003, 0.003):
        for h in range(1, 14):
            s += np.sin(2 * np.pi * f * h * (1 + det) * t) / h
    s *= np.minimum(1, t / 0.012) * np.exp(-t / dur)
    add(t0, lowpass(s, 2400), -0.25, gain)


def tremolo(t0, dur, m, gain=0.05):
    t = tt(dur)
    f = hz(m)
    s = np.zeros_like(t)
    for h in range(1, 12):
        s += np.sin(2 * np.pi * f * h * t) / h
    s *= (0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 13 * t))) * env_swell(t, 0.6, 0.4, dur)
    add(t0, lowpass(s, 2000), 0.3, gain)


def pluck(t0, m, gain=0.06, pan=0.0):
    t = tt(0.5)
    f = hz(m)
    s = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t / 0.12)
    add(t0, s, pan, gain)


def riser(t0, dur, gain=0.18):
    t = tt(dur)
    u = t / dur
    s = np.zeros_like(t)
    for k in range(6):
        f = 120 * 2 ** (k + 3.2 * u)
        s += np.sin(2 * np.pi * np.cumsum(f) / SR + k)
    s /= 6
    n = bandpass(rng.standard_normal(len(t)), 2000, 12000) * u ** 2
    s = (s * 0.7 + n * 0.6) * u ** 2.2
    add(t0, s, 0, gain)


def subdrop(t0, gain=0.6, dur=1.6):
    t = tt(dur)
    f = 28 + 52 * np.exp(-t / 0.35)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.6))
    add(t0, np.tanh(s * 1.5), 0, gain)


def crash(t0, gain=0.22, dur=2.4):
    t = tt(dur)
    s = bandpass(rng.standard_normal(len(t)), 3000, 16000) * np.exp(-t / 0.7)
    add(t0, s, -0.3, gain)
    add(t0, bandpass(rng.standard_normal(len(t)), 3000, 16000) * np.exp(-t / 0.7), 0.3, gain)


def whoosh(t0, dur=0.55, gain=0.2):
    t = tt(dur)
    w = np.sin(np.pi * t / dur) ** 2
    s = bandpass(rng.standard_normal(len(t)), 300, 5000) * w
    add(t0 - dur * 0.6, s, -0.5, gain)
    add(t0 - dur * 0.6 + 0.05, s, 0.5, gain)


def glitch(t0, gain=0.16):
    for k in range(5):
        t = tt(0.04)
        f = 200 + rng.random() * 2400
        add(t0 + k * 0.035, np.sign(np.sin(2 * np.pi * f * t)) * 0.5, rng.random() * 2 - 1, gain)


def tick(t0, gain=0.12):
    t = tt(0.08)
    s = bandpass(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t / 0.012)
    add(t0, s, 0.2, gain)


def heartbeat(t0, gain=0.4):
    for dt, g in ((0, 1), (0.28, 0.7)):
        t = tt(0.35)
        s = np.sin(2 * np.pi * (40 + 30 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.09)
        add(t0 + dt, s, 0, gain * g)


def cluster(t0, dur, gain=0.08):
    t = tt(dur)
    s = np.zeros_like(t)
    for m in (33, 34, 40, 45, 46):
        f = hz(m)
        for h in range(1, 9):
            s += np.sin(2 * np.pi * f * h * t * (1 + 0.002 * np.sin(2 * np.pi * 0.3 * t))) / h ** 1.3
    s *= env_swell(t, dur * 0.6, 0.3, dur)
    add(t0, lowpass(s, 1600), 0, gain)


# ---------------------------------------------------------------- the score

CH = {'Am': [57, 60, 64], 'F': [53, 57, 60], 'C': [55, 60, 64], 'G': [55, 59, 62], 'E': [56, 59, 64], 'Dm': [57, 62, 65], 'A': [57, 61, 64]}
PROG = ['Am', 'F', 'C', 'G']
BASS = {'Am': 33, 'F': 29, 'C': 36, 'G': 31, 'E': 28, 'Dm': 26, 'A': 33}

# 0 - 12: the dark wood
wind(0, 13, 0.06)
drone(0, 12.5, 33, 0.09)
lullaby(0.5, 0.55, 0.2, warp=0.0)
lullaby(5.0, 0.55, 0.16, warp=0.7)
for k in range(5):
    heartbeat(7.4 + k * 0.95, 0.28 + k * 0.05)
riser(9.2, 2.8, 0.16)
# the foot comes down on them
taiko(8.5, 0.9)
subdrop(8.5, 0.45)
crash(8.5, 0.1, 2.5)

# 12 - 31.2: the forest and the guardians
for bar in range(8):
    t0 = 12.0 + bar * 2.4
    c = PROG[bar % 4]
    pad(t0, 2.6, CH[c], 0.045 if bar < 3 else 0.06)
    for b8 in range(8):
        strings_stac(t0 + b8 * 0.3, BASS[c] + 12 + (7 if b8 in (3, 7) else 0), 0.06 if bar < 3 else 0.08)
    for b in range(4):
        kick(t0 + b * BEAT, 0.35 if bar < 3 else 0.5)
        if bar >= 3 and b in (1, 3):
            snare(t0 + b * BEAT, 0.2)
    if bar >= 3:
        for s16 in range(16):
            pluck(t0 + s16 * 0.15, CH[c][s16 % 3] + 12 + (12 if s16 % 4 == 3 else 0), 0.035, pan=np.sin(s16) * 0.5)
riser(18.0, 1.2, 0.2)
for i, g in enumerate((19.2, 21.6, 24.0, 26.4, 28.8)):
    taiko(g, 0.7)
    braam(g, [33, 29, 36, 31, 28][i], 2.2, 0.28)
    crash(g, 0.12)
# 31.2 - 40.8: the Edge
drone(31.2, 10, 33, 0.1)
tremolo(31.2, 7.2, 45, 0.07)
tremolo(33.6, 4.8, 52, 0.05)
for k in range(12):
    tick(31.4 + k * 0.6, 0.1)
for k in range(4):
    heartbeat(33.8 + k * 1.2, 0.35)
riser(36.4, 4.4, 0.26)
glitch(38.4)
# 40.8: the break
braam(40.8, 21, 4.5, 0.5)
subdrop(40.8, 0.7, 2.4)
crash(40.8, 0.3, 3.5)
taiko(40.8, 0.9)
for k in range(1, 4):
    taiko(40.8 + k * 1.2, 0.45)
lullaby(42.0, 0.4, 0.06, warp=1.0)

# 45.6 - 61.8: the Crater, everything
for bar in range(7):
    t0 = 45.6 + bar * 2.4
    c = ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'E'][bar]
    pad(t0, 2.6, CH[c], 0.06, bright=8)
    braam(t0, BASS[c], 2.3, 0.22)
    for b8 in range(8):
        strings_stac(t0 + b8 * 0.3, BASS[c] + 12 + (12 if b8 % 2 else 0), 0.085)
    for b in range(4):
        kick(t0 + b * BEAT, 0.55)
        taiko(t0 + b * BEAT + 0.3, 0.3 if b % 2 else 0.0)
        if b in (1, 3):
            snare(t0 + b * BEAT, 0.26)
    for s16 in range(16):
        pluck(t0 + s16 * 0.15, CH[c][(s16 * 2) % 3] + 24, 0.03, pan=np.cos(s16) * 0.6)
for g in (45.6, 52.8, 56.4):
    crash(g, 0.2)
    taiko(g, 0.8)
riser(61.8, 1.2, 0.25)
# the last lock: a glass ring, then nothing
music_box(63.0, 93, 0.12, dec=2.5)
music_box(63.05, 88, 0.08, dec=2.5)

# 64.8 - 75: the family
for i, c in enumerate(['Am', 'F', 'C', 'G']):
    pad(64.8 + i * 2.55, 2.9, CH[c], 0.06, bright=4, a=1.2, r=1.4)
drone(64.8, 10.2, 45, 0.04)
lullaby(65.4, 0.62, 0.17)

# 75 - 95: the Fourth
for k in range(4):
    tick(75.1 + k * 0.62, 0.16)
cluster(77.4, 3.2, 0.1)
subdrop(77.4, 0.6, 2.2)
braam(77.4, 21, 3.2, 0.3)
drone(80.4, 7, 21, 0.14)
for k in range(5):
    tick(80.5 + k * 0.62, 0.1)
taiko(83.4, 0.6)
riser(84.6, 2.4, 0.3)
braam(87.0, 21, 3.0, 0.5)
crash(87.0, 0.3, 3.0)
subdrop(87.0, 0.6)
for bar in range(1):
    t0 = 89.4
    for b in range(4):
        kick(t0 + b * BEAT, 0.6)
        taiko(t0 + b * BEAT + 0.3, 0.4)
        snare(t0 + b * BEAT + 0.15, 0.2)
    for b8 in range(8):
        strings_stac(t0 + b8 * 0.3, 45 + (12 if b8 % 2 else 0), 0.09)
braam(91.8, 22, 2.9, 0.35)
cluster(91.8, 3.0, 0.08)
riser(93.4, 1.4, 0.22)

# 95 - 106: the title, and its eye
taiko(95.4, 0.9)
braam(95.4, 21, 4.5, 0.45)
crash(95.4, 0.25, 3.5)
subdrop(95.4, 0.5)
pad(96.0, 7.4, CH['Am'], 0.05, bright=5, a=1.5, r=2.5)
lullaby(96.2, 0.55, 0.17)
pad(100.4, 3.2, CH['A'], 0.05, bright=5, a=0.6, r=2.0)
music_box(100.6, 81, 0.18, dec=2.6)
music_box(100.6, 69, 0.12, dec=2.6)
tick(103.4, 0.2)
drone(103.6, 2.4, 21, 0.12)
glitch(103.6, 0.12)
subdrop(105.2, 0.35)

# the transitions get a whoosh or a glitch of their own
from timeline import FX  # noqa: E402

for t, k in FX:
    if k == 'whip':
        whoosh(t, 0.5, 0.16)
    elif k == 'glitch':
        glitch(t, 0.1)

# ---------------------------------------------------------------- a room for it all, and out

def reverb(x, secs=2.6, mix=0.25):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (secs / 6.5))
    ir = lowpass(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + y * mix


L = reverb(L)
R = reverb(R)
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L /= peak / 0.89
R /= peak / 0.89
out = np.stack([L, R], 1)[: int(LENGTH * SR)]
import wave  # noqa: E402

with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
print('music', sys.argv[1], round(len(out) / SR, 1), 's')
