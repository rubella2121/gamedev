"""The trailer's orchestra: a score written note by note to src/data/cues.json, played by real sampled instruments.
   python3 audio/orchestra.py <soundfont.sf3> <out.wav>          (mido; fluidsynth)

It is the game's own music grown up: the lullaby (A C E D C A G E) is the theme all the way through. It starts on a music box,
sags out of tune when the shadow comes, comes back on horns as the Blob sets off, is sung by the whole orchestra and choir as
it falls into the third direction, returns in A major on the music box when the family is together, and falls asleep (E D C A)
under the title. The battle runs at 150 beats a minute, a bar every 1.6 s, so every cut lands on a beat.

The score is written as MIDI (General MIDI programs, so any GM soundfont plays it; MuseScore General is the one it is
balanced for) and rendered with FluidSynth.
"""
import json
import os
import subprocess
import sys

import mido

sf3, out = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(here, '..', 'src', 'data', 'cues.json')))

TPB = 960  # ticks per beat; at 120 bpm one second is 1920 ticks
SEC = 1920
ev = []  # (tick, order, message)


def T(t):
    return max(0, int(round(t * SEC)))


def msg(t, m, order=1):
    ev.append((T(t), order, m))


# ---------------------------------------------------------------- the orchestra (channel: program)
BOX, CELESTA, PAD, STR, BASS, CHOIR, HORN, BRASS, TIMP, DRUMS, TAIKO, TREM, CELLO, HIT, TUBA, TROM = range(16)
PROGRAM = {BOX: 10, CELESTA: 8, PAD: 49, STR: 48, BASS: 43, CHOIR: 52, HORN: 60, BRASS: 61, TIMP: 47, TAIKO: 116, TREM: 44,
           CELLO: 42, HIT: 55, TUBA: 58, TROM: 57}
LEVEL = {BOX: 100, CELESTA: 80, PAD: 92, STR: 96, BASS: 110, CHOIR: 96, HORN: 104, BRASS: 104, TIMP: 118, DRUMS: 112,
         TAIKO: 120, TREM: 84, CELLO: 100, HIT: 90, TUBA: 100, TROM: 92}
PAN = {BOX: 64, CELESTA: 76, PAD: 64, STR: 46, BASS: 70, CHOIR: 64, HORN: 52, BRASS: 78, TIMP: 64, DRUMS: 64, TAIKO: 64,
       TREM: 84, CELLO: 58, HIT: 64, TUBA: 72, TROM: 80}
for ch in range(16):
    if ch in PROGRAM:
        msg(0, mido.Message('program_change', channel=ch, program=PROGRAM[ch]), 0)
    msg(0, mido.Message('control_change', channel=ch, control=7, value=LEVEL[ch]), 0)
    msg(0, mido.Message('control_change', channel=ch, control=10, value=PAN[ch]), 0)
    msg(0, mido.Message('control_change', channel=ch, control=11, value=110), 0)
    msg(0, mido.Message('control_change', channel=ch, control=91, value=70), 0)
    msg(0, mido.Message('pitchwheel', channel=ch, pitch=0), 0)


def note(ch, t, dur, p, v):
    v = max(1, min(127, int(v)))
    msg(t, mido.Message('note_on', channel=ch, note=int(p), velocity=v))
    msg(t + max(0.03, dur), mido.Message('note_off', channel=ch, note=int(p), velocity=0), 0)


def chord(ch, t, dur, ps, v):
    for p in ps:
        note(ch, t, dur, p, v)


def cc(ch, t, ctrl, val):
    msg(t, mido.Message('control_change', channel=ch, control=ctrl, value=max(0, min(127, int(val)))), 0)


def swell(ch, t0, t1, v0, v1, steps=24):
    for i in range(steps + 1):
        u = i / steps
        cc(ch, t0 + (t1 - t0) * u, 11, v0 + (v1 - v0) * u)


def bend(ch, t, cents):
    """pitch wheel, cents (the default range is two semitones each way)"""
    msg(t, mido.Message('pitchwheel', channel=ch, pitch=max(-8192, min(8191, int(cents / 200 * 8192)))), 0)


def cut(t, keep=()):
    """everything stops at once (the cut to black): all sound off, then the wheels and swells reset"""
    for ch in range(16):
        if ch in keep:
            continue
        cc(ch, t, 120, 0)
        cc(ch, t + 0.01, 11, 110)
        bend(ch, t + 0.01, 0)


def drum(t, n, v):
    note(DRUMS, t, 0.3, n, v)


def roll(ch, t0, t1, p, v0, v1, step=0.067):
    k = int((t1 - t0) / step)
    for i in range(k):
        note(ch, t0 + i * step, step * 1.2, p, v0 + (v1 - v0) * i / max(1, k - 1))


def mega(t, root=33, dur=1.4, big=1.0):
    """the whole orchestra on one chord of A minor: the hits"""
    v = int(127 * big)
    chord(BRASS, t, dur, [root + 12, root + 19, root + 24], v)
    chord(TROM, t, dur, [root + 12, root + 19], v)
    note(TUBA, t, dur, root, v)
    note(BASS, t, dur * 1.2, root, v)
    chord(CHOIR, t, dur * 1.3, [root + 24, root + 27, root + 31, root + 36], v)
    chord(STR, t, dur, [root + 24, root + 31, root + 36, root + 39], v)
    chord(HIT, t, 0.5, [root + 24, root + 31, root + 36], v)
    note(TIMP, t, 0.8, root + 12, 127)
    note(TAIKO, t, 0.6, 48, 127)
    drum(t, 36, 127)
    drum(t, 49, int(118 * big))
    drum(t, 57, int(105 * big))


LULL = [69, 72, 76, 74, 72, 69, 67, 64]
GAPS = [0.62, 0.62, 0.9, 0.62, 0.62, 0.9, 0.62, 0.62]
AM, F, G, E = [57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]

# ---------------------------------------------------------------- 0. the hook: his foot, beside you
h0, hh, ho = C['hookIn'], C['hookHit'], C['hookOut']
chord(TREM, h0, hh - h0 + 0.2, [45, 46, 52], 70)
swell(TREM, h0, hh, 40, 120)
note(BASS, h0, hh - h0 + 0.1, 33, 90)
chord(CHOIR, h0, hh - h0 + 0.1, [57, 58], 80)
swell(CHOIR, h0, hh, 30, 120)
mega(hh, dur=1.1)
cut(ho)

# ---------------------------------------------------------------- 1. the lullaby, and the shadow
lu, sh, jp, sl = C['lullaby'], C['shadow'], C['jump'], C['slam']
for t0, t1, ps in [(3.1, 6.2, AM), (6.2, 8.0, F), (8.0, sh, [50, 53, 57])]:
    chord(PAD, t0, t1 - t0 + 0.4, ps, 52)
swell(PAD, 3.1, 4.5, 20, 70)
note(BASS, 3.3, jp - 3.3, 33, 50)
t = lu
for rep in range(2):
    for i, m in enumerate(LULL):
        if t >= jp - 0.2:
            break
        if t >= sh:
            bend(BOX, t - 0.01, -min(170, 25 + (t - sh) * 60))
        note(BOX, t, 1.6, m, 88)
        if rep == 0:
            note(CELESTA, t, 0.9, m + 12, 38)
        t += GAPS[i]
# the shadow: a cluster that will not resolve, the strings shaking, the choir rising
chord(TREM, sh, jp - sh, [45, 46, 52], 74)
swell(TREM, sh, jp, 25, 125)
chord(CHOIR, sh + 1.2, jp - sh - 1.2, [57, 58, 60], 74)
swell(CHOIR, sh + 1.2, jp, 20, 120)
chord(BRASS, jp - 1.0, 1.0, [33, 34], 80)
swell(BRASS, jp - 1.0, jp, 30, 125)
swell(BASS, sh, jp, 60, 125)
cut(jp)
mega(sl, dur=0.9, big=1.0)
drum(sl, 52, 120)
cut(sl + 0.55)

# ---------------------------------------------------------------- the crater, and the eyes
note(BASS, sl + 0.8, C['journey'] - sl - 0.8, 33, 42)
note(CELESTA, sl + 1.0, 1.6, 76, 50)
bend(CELESTA, sl + 0.99, -80)
bend(CELESTA, sl + 2.7, 0)
ey = C['eyes']
chord(BRASS, ey, C['journey'] - ey, [33, 34], 88)
swell(BRASS, ey, C['journey'], 30, 110)
chord(CHOIR, ey, C['journey'] - ey, [45, 46, 52], 70)

# ---------------------------------------------------------------- 2. the journey: the lullaby on horns, the strings set off
jn, gs = C['journey'], C['guardians']
for i in range(8):
    note(STR, jn + i * 0.2, 0.18, [57, 60, 64, 60][i % 4], 58 + i * 2)
for i in range(4):
    note(BASS, jn + i * 0.4, 0.36, 33, 72)
note(HORN, jn, 0.78, 57, 78)
note(HORN, jn + 0.8, 0.38, 60, 80)
note(HORN, jn + 1.2, 0.38, 64, 84)
note(TAIKO, jn, 0.5, 48, 80)
note(TAIKO, jn + 0.8, 0.5, 48, 86)
chord(PAD, jn, gs[0] - jn, AM, 60)
roll(DRUMS, jn + 0.8, gs[0], 51, 30, 95, 0.05)

# ---------------------------------------------------------------- the five guardians: a bar each, the lullaby on horns
BAR = C['bar']
B = BAR / 4
CH = [AM, G, F, E, AM]
ROOT = [33, 31, 29, 28, 33]
for i, g in enumerate(gs):
    k = 1 + 0.06 * i
    ch3 = [p + 12 for p in CH[i]] + [CH[i][0] + 24]
    for s in range(16):
        note(STR, g + s * B / 4, 0.09, ch3[[0, 1, 2, 1, 0, 1, 2, 3][s % 8]], 72 * k)
    for s in range(8):
        note(CELLO, g + s * B / 2, 0.18, ROOT[i] + 12, 86 * k)
    for s in range(4):
        note(BASS, g + s * B, 0.36, ROOT[i], 96 * k)
    note(TIMP, g, 0.5, ROOT[i] + 12, 104 * k)
    note(TIMP, g + 2 * B, 0.5, ROOT[i] + 12, 92 * k)
    for dt, v in ((0, 118), (1.5 * B, 84), (2 * B, 100), (3 * B, 92), (3.5 * B, 80)):
        note(TAIKO, g + dt, 0.4, 48, v * k)
    drum(g, 36, 120)
    drum(g, 49, 104)
    drum(g + B, 38, 70 * k)
    drum(g + 3 * B, 38, 76 * k)
    chord(HIT, g, 0.45, [p + 12 for p in CH[i]], 112)
    chord(BRASS, g, 0.34, [ROOT[i] + 12, ROOT[i] + 19, ROOT[i] + 24], 112)
    chord(BRASS, g + 2 * B, 0.3, [ROOT[i] + 12, ROOT[i] + 19, ROOT[i] + 24], 96)
    chord(CHOIR, g, BAR, CH[i], 80 + 5 * i)
    chord(TREM, g, BAR, [p + 24 for p in CH[i]], 50)
    # the lullaby, now a call to arms: two notes a bar on horns
    note(HORN, g, 0.76, LULL[(2 * i) % 8] - 12, 96)
    note(HORN, g + 2 * B, 0.76, LULL[(2 * i + 1) % 8] - 12, 98)
fl, ff = C['forestFoot'], C['footLands']
roll(TAIKO, fl, ff, 48, 70, 125, 0.05)
roll(DRUMS, fl, ff, 38, 50, 115, 0.05)
for i in range(8):
    note(STR, fl + i * 0.05, 0.05, 57 + 2 * i, 90 + 4 * i)
mega(ff, dur=0.6, big=0.95)
cut(ff + 0.32)

# ---------------------------------------------------------------- 3. the Edge: the stars go out, and you look up
ed, lk, ck, bm = C['edge'], C['look'], C['crack'], C['boom']
chord(PAD, ed, ck - ed, [81, 88], 44)
swell(PAD, ed, ck, 25, 70)
note(BASS, ed, ck - ed, 33, 46)
stars = [100, 96, 93, 91, 88, 84, 81, 80]
for i, tp in enumerate(C['starPings']):
    note(CELESTA, tp, 1.4, stars[i] - 12, 66 - 3 * i)
chord(CHOIR, ed + 1.6, ck - ed - 1.6, [64, 65], 70)
swell(CHOIR, ed + 1.6, ck, 15, 115)
chord(TREM, lk - 0.6, ck - lk + 0.6, [45, 46, 52, 53], 76)
swell(TREM, lk - 0.6, ck, 20, 125)
roll(TIMP, lk, ck - 0.05, 45, 40, 124)
roll(DRUMS, lk, ck - 0.05, 51, 30, 110, 0.05)
chord(CELESTA, ck, 1.2, [88, 89, 93, 94], 110)
drum(ck, 52, 112)
chord(HIT, ck, 0.4, [81, 84, 88], 100)
cut(ck + 0.15)

# ---------------------------------------------------------------- the boom, and the third direction: the lullaby, sung
mega(bm, dur=2.2, big=1.0)
drum(bm, 52, 124)
roll(TIMP, bm + 0.1, bm + 1.0, 45, 124, 70)
th = bm + 0.4
step = (C['reveal'] - th) / 8
HARM = [(AM, 33), (AM, 33), (F, 29), (F, 29), ([48, 52, 55], 36), ([48, 52, 55], 36), (G, 31), (E, 28)]
for i, m in enumerate(LULL):
    t = th + i * step
    note(HORN, t, step * 0.98, m - 12, 112)
    note(STR, t, step * 0.98, m, 108)
    note(CHOIR, t, step * 0.98, m, 104)
    ps, r = HARM[i]
    chord(PAD, t, step, ps, 92)
    chord(BRASS, t, step * 0.9, [r + 12, r + 19], 98)
    note(BASS, t, step, r, 100)
    note(TUBA, t, step, r, 92)
    if i % 2 == 0:
        note(TAIKO, t, 0.5, 48, 110)
        note(TIMP, t, 0.5, r + 12, 100)
roll(TIMP, C['reveal'] - 0.6, C['reveal'] - 0.02, 45, 60, 126)
roll(DRUMS, C['reveal'] - 0.6, C['reveal'] - 0.02, 38, 60, 120, 0.05)

# ---------------------------------------------------------------- 4. the battle: 150 beats a minute, a hit on every cut


def groove(t0, t1, root, chordp, k=1.0, heavy=False):
    t = t0
    while t < t1 - 1e-6:
        span = min(BAR, t1 - t)
        steps = int(round(span / (B / 4)))
        tones = [p + 12 for p in chordp] + [chordp[0] + 24]
        for s in range(steps):
            note(STR, t + s * B / 4, 0.09, tones[[0, 1, 2, 1, 3, 1, 2, 1][s % 8]], 78 * k)
        for s in range(int(round(span / (B / 2)))):
            note(CELLO, t + s * B / 2, 0.18, root + 12, 90 * k)
            if heavy:
                note(TROM, t + s * B / 2, 0.16, root + 12, 92 * k)
        for s in range(int(round(span / B))):
            note(BASS, t + s * B, 0.36, root, 100 * k)
            drum(t + s * B, 38 if s % 2 else 36, (78 if s % 2 else 112) * k)
        for dt, v in ((0, 120), (1.5 * B, 86), (2 * B, 104), (3 * B, 96), (3.5 * B, 84)):
            if dt < span - 1e-6:
                note(TAIKO, t + dt, 0.4, 48, v * k)
        note(TIMP, t, 0.5, root + 12, 108 * k)
        chord(CHOIR, t, span, chordp, 84 * k)
        t += BAR


rv, bt, cg = C['reveal'], C['battle'], C['cage']
co, co2, ms, ms2, ru, fa, lo = C['collector'], C['collector2'], C['mash'], C['mash2'], C['rush'], C['fall'], C['lock']
# X: the braam
chord(BRASS, rv, 1.4, [33, 40, 45], 127)
note(TUBA, rv, 1.5, 33, 127)
chord(TROM, rv, 1.4, [40, 45], 124)
chord(CHOIR, rv, 1.5, [45, 52, 57], 120)
mega(rv, dur=0.5, big=0.9)
groove(rv + 0.4, bt[1], 33, AM)
groove(bt[1], bt[3], 29, F)
groove(bt[3], cg, 31, G)
for t in bt[1:]:
    chord(HIT, t, 0.4, [57, 64, 69], 104)
    drum(t, 49, 96)
note(HORN, bt[1], 0.75, 57, 100)
note(HORN, bt[2], 0.75, 60, 104)
note(HORN, bt[3], 0.75, 64, 108)
# the cage: everything drops away but the strings, the choir, and her tune
chord(PAD, cg, co - cg, [57, 60, 64, 71], 84)
swell(PAD, cg, cg + 0.8, 40, 100)
chord(CHOIR, cg, co - cg, [69, 72], 64)
note(BASS, cg, co - cg, 33, 70)
for i, m in enumerate([69, 72, 76]):
    note(BOX, cg + 0.2 + i * 0.5, 1.4, m, 92)
roll(TIMP, co - 0.5, co - 0.02, 45, 50, 124)
# the Collector, the Mash: the groove again, heavier each time
mega(co, dur=0.4, big=0.85)
groove(co, ms, 33, AM, 1.0)
chord(HIT, co2, 0.4, [57, 64, 69], 108)
drum(co2, 57, 100)
mega(ms, dur=0.4, big=0.9)
groove(ms, ru, 33, AM, 1.08, heavy=True)
chord(HIT, ms2, 0.4, [57, 64, 69], 112)
drum(ms2, 49, 104)
# the rush: a hit on every cut, the strings climbing, everything louder
for i, h in enumerate(C['rushCuts']):
    chord(HIT, h, 0.3, [57 + i, 64 + i, 69 + i], 112 + 2 * i)
    note(TAIKO, h, 0.4, 48, 116 + 2 * i)
    drum(h, 49 if i % 2 == 0 else 57, 100 + 4 * i)
    drum(h, 36, 118)
for s in range(int((fa - ru) / 0.1)):
    note(STR, ru + s * 0.1, 0.09, 57 + s, 82 + s * 2)
    note(CELLO, ru + s * 0.1, 0.09, 45 + (s // 2), 84 + s)
chord(CHOIR, ru, fa - ru, [57, 60, 64], 80)
swell(CHOIR, ru, fa, 60, 127)
roll(TIMP, fa - 0.6, fa - 0.02, 45, 70, 127)
roll(DRUMS, fa - 0.6, fa - 0.02, 38, 70, 124, 0.04)
# X falls: no drums; a lament, and the tune falling asleep on horns
mega(fa, dur=1.2, big=1.0)
chord(PAD, fa, 1.1, AM, 100)
chord(PAD, fa + 1.1, lo - fa - 1.1, F, 92)
chord(CHOIR, fa, 1.1, [57, 60, 64, 69], 100)
chord(CHOIR, fa + 1.1, lo - fa - 1.1, [57, 60, 65, 69], 92)
for i, m in enumerate([64, 62, 60, 57]):
    note(HORN, fa + 0.25 + i * 0.48, 0.46, m, 104 - 4 * i)
note(BASS, fa, lo - fa, 33, 96)
note(TUBA, fa, 1.0, 33, 100)
roll(TIMP, lo - 0.55, lo - 0.02, 45, 50, 124)
# the last lock: glass, then nothing
chord(CELESTA, lo, 1.4, [81, 88, 93], 112)
chord(HIT, lo, 0.4, [69, 76, 81], 104)
drum(lo, 57, 110)
cut(lo + 0.22, keep=(CELESTA,))

# ---------------------------------------------------------------- 5. together: the lullaby in A major, on the music box
fm, tt = C['family'], C['title']
A_, FSM, D_, E_ = [57, 61, 64], [54, 57, 61], [50, 54, 57], [52, 56, 59]
for t0, t1, ps, r in [(fm, fm + 1.6, A_, 45), (fm + 1.6, fm + 3.2, FSM, 42), (fm + 3.2, fm + 4.8, D_, 38), (fm + 4.8, tt - 0.9, E_, 40)]:
    chord(PAD, t0, t1 - t0 + 0.3, ps, 70)
    note(CELLO, t0, t1 - t0, r, 72)
    chord(CHOIR, t0, t1 - t0, [p + 12 for p in ps[:2]], 46)
swell(PAD, fm, fm + 1.2, 30, 96)
MAJ = [69, 73, 76, 74, 73, 69, 68, 64, 69]
MGAPS = [0.66, 0.66, 0.95, 0.66, 0.66, 0.95, 0.66, 0.66, 1.0]
t = fm + 0.35
for i, m in enumerate(MAJ):
    if t > tt - 1.0:
        break
    note(BOX, t, 1.8, m, 86)
    note(CELESTA, t, 1.0, m + 12, 34)
    t += MGAPS[i]
chord(TREM, tt - 1.0, 1.0, [57, 64, 69, 76], 72)
swell(TREM, tt - 1.0, tt, 20, 125)
roll(TIMP, tt - 0.8, tt - 0.02, 45, 40, 126)
roll(DRUMS, tt - 0.8, tt - 0.02, 51, 30, 116, 0.05)
cut(tt - 0.03)

# ---------------------------------------------------------------- 6. the title
mega(tt, dur=2.6, big=1.0)
drum(tt, 52, 124)
roll(TIMP, tt + 0.1, tt + 1.4, 45, 120, 60)
chord(PAD, tt + 1.0, C['fadeOut'] - tt, [57, 60, 64, 69], 80)
chord(CHOIR, tt + 1.4, C['fadeOut'] - tt - 1.4, [57, 64, 69], 62)
note(BASS, tt + 1.0, C['fadeOut'] - tt - 1.0, 33, 66)
for i, m in enumerate([76, 74, 72, 69]):
    note(CELESTA, C['endTune'] + i * 0.65 + (0.2 if i == 3 else 0), 1.6, m, 78)
    note(BOX, C['endTune'] + i * 0.65 + (0.2 if i == 3 else 0), 1.6, m, 70)
pn = C['playNow']
chord(CELESTA, pn, 1.6, [81, 88, 93], 70)
chord(CHOIR, pn, C['fadeOut'] - pn + 0.4, [57, 61, 64, 69], 70)
for ch in (PAD, CHOIR, BASS, CELESTA, BOX):
    swell(ch, C['fadeOut'], C['fadeOut'] + 0.6, 110, 0, 12)
cut(C['fadeOut'] + 0.65)

# ---------------------------------------------------------------- 7. after the end: one note in tune, one not; something deep
st, so = C['sting'], C['stingOut']
note(BOX, st, 1.8, 69, 84)
note(BOX, st + 0.65, 1.8, 72, 80)
bend(BOX, st + 0.64, -70)
note(BASS, st + 0.3, so - st - 0.3, 33, 52)
chord(TREM, st + 1.0, so - st - 1.0, [81, 82], 40)
swell(TREM, st + 1.0, so, 20, 90)
note(TIMP, so, 1.2, 40, 127)
drum(so, 35, 127)
note(TUBA, so, 1.4, 21, 127)
chord(CHOIR, so, 0.7, [45, 46, 52], 112)
cut(so + 0.9)

# ---------------------------------------------------------------- write it, play it
ev.sort(key=lambda e: (e[0], e[1]))
mid = mido.MidiFile(ticks_per_beat=TPB)
tr = mido.MidiTrack()
mid.tracks.append(tr)
tr.append(mido.MetaMessage('set_tempo', tempo=500000, time=0))
last = 0
for tick, _, m in ev:
    tr.append(m.copy(time=tick - last))
    last = tick
tr.append(mido.MetaMessage('end_of_track', time=T(2.0)))
midpath = out.rsplit('.', 1)[0] + '.mid'
mid.save(midpath)
subprocess.run(['fluidsynth', '-ni', '-q', '-F', out, '-r', '48000', '-g', '0.5', '-o', 'synth.reverb.active=1',
                '-o', 'synth.reverb.room-size=0.75', '-o', 'synth.reverb.level=0.55', '-o', 'synth.chorus.active=0', '-o', 'synth.polyphony=512',
                sf3, midpath], check=True)
print('orchestra', out, len(ev), 'events')
