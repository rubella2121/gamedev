"""The orchestra the trailer and the promos are written for, and how to write for it: notes, chords, swells, rolls, the big hits
and the battle groove, on General MIDI channels; then the score is written as MIDI and played by FluidSynth.
   from kit import *; start(); ...the score...; render(sf3, out)

The battle runs at 150 beats a minute: a bar every 1.6 s (BAR), a beat every 0.4 s (B), so every cut lands on a beat.
"""
import subprocess

import mido

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


def start():
    """a clean score: every channel on its instrument, at its level and place"""
    ev.clear()
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

# ---------------------------------------------------------------- the battle: 150 beats a minute
BAR = 1.6
B = BAR / 4


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



def render(sf3, out):
    """write the score as MIDI (next to `out`) and play it to `out`; returns how many events it had"""
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
    return len(ev)
