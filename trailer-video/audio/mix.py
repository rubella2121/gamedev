"""The trailer's sound: the orchestra and the game's sound design under the voices, mastered.
   python3 audio/mix.py <orchestra.wav> <sfx.wav> <voiceDir> <out.wav> [promo or short id]

With an id it mixes that promo or short instead: its length and its lines come from src/data/promos.json or shorts.json, and
a short can set its own balance ("mix": {"orch": ..., "sfx": ...}; for the synthesised ones the sfx layer is the music) and how
far its quiet moments may be brought up ("ride": the most gain, as a factor; 12 by default, less to keep a silence a silence).

Every line of src/data/lines.json goes in at its time; both music layers step back under speech (fast in, slow out) so the
words sit on top without the music ever stopping. Then the bus is glued (gentle compression), limited, and brought to -14 LUFS
(two-pass loudnorm, linear) so it plays as loud as everything else on a phone.
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

orch_path, sfx_path, vdir, out_path = sys.argv[1:5]
promo = sys.argv[5] if len(sys.argv) > 5 else None
here = os.path.dirname(os.path.abspath(__file__))
data = os.path.join(here, '..', 'src', 'data')
if promo:
    found = {**json.load(open(os.path.join(data, 'promos.json')))['clips'], **json.load(open(os.path.join(data, 'shorts.json')))['shorts']}
    CUES = found[promo]
    LINES = CUES['lines']
else:
    CUES = json.load(open(os.path.join(data, 'cues.json')))
    LINES = json.load(open(os.path.join(data, 'lines.json')))
SR = 48000
N = int(CUES['length'] * SR)


def read(path):
    with wave.open(path) as w:
        assert w.getframerate() == SR, path
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32767
        a = a.reshape(-1, w.getnchannels())
    if a.shape[1] == 1:
        a = np.repeat(a, 2, 1)
    return np.pad(a, ((0, max(0, N - len(a))), (0, 0)))[:N]


orch = read(orch_path)
sfx = read(sfx_path)
voice = np.zeros((N, 2))
for ln in LINES:
    v = read(f"{vdir}/{ln['id']}.wav") * ln['gain']
    v = v[: np.nonzero(np.abs(v).max(1) > 1e-4)[0][-1] + 1] if np.any(np.abs(v) > 1e-4) else v
    i = int(ln['at'] * SR)
    j = min(N, i + len(v))
    voice[i:j] += v[: j - i]

# how much someone is speaking, smoothed: the music ducks under it
lvl = np.abs(voice).max(1)
k = int(0.05 * SR)
lvl = np.convolve(lvl, np.ones(k) / k, mode='same')
speak = np.clip(lvl / 0.015, 0, 1)
env = np.zeros(N)
a_in, a_out = 1 - np.exp(-1 / (0.05 * SR)), 1 - np.exp(-1 / (0.5 * SR))
e = 0.0
step = 64
for s in range(0, N, step):
    target = speak[s]
    e += (target - e) * (1 - (1 - (a_in if target > e else a_out)) ** step)
    env[s:s + step] = e
duck = (1 - 0.6 * env)[:, None]
BAL = CUES.get('mix', {}) if promo else {}
mix = (orch * BAL.get('orch', 1.0) + sfx * BAL.get('sfx', 0.55)) * duck + voice * 1.7
tmp = out_path + '.raw.wav'
with wave.open(tmp, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    peak = np.abs(mix).max()
    w.writeframes((np.clip(mix / max(1.0, peak), -1, 1) * 32767).astype(np.int16).tobytes())

# master: glue, limit, and loudness (measure first, then a linear pass). A promo plays in a feed, on a phone, against
# everything else in it: its quiet moments are brought up first (a gain riding over about two seconds, at most +22 dB), so
# they still carry.
chain = 'acompressor=threshold=-18dB:ratio=2:attack=20:release=250:makeup=1.5,alimiter=limit=0.9:attack=3:release=60:level=disabled'
if promo:
    chain = f"dynaudnorm=f=250:g=7:p=0.9:m={BAL.get('ride', 12)}," + chain
r = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', chain + ',loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json', '-f', 'null', '-'],
                   capture_output=True, text=True)
j = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
ln = (f"loudnorm=I=-14:TP=-1.0:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
      f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-af', chain + ',' + ln + ',aresample=48000', '-c:a', 'pcm_s16le', out_path], check=True)
os.remove(tmp)
print('mix', out_path)
