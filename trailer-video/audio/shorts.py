"""The shorts' orchestral scores (src/shorts/, timed by src/data/shorts.json), on the trailer's orchestra (kit.py).
   python3 audio/shorts.py <soundfont.sf3> <outDir> [ids...]          -> <outDir>/short-<id>-orchestra.wav

  the-fourth  a happy ending on the music box that winds down like a tape stopping; then the dark, and something in it
  secrets     a pizzicato mystery that walks under the countdown, her lullaby on the music box for the song, a stamp for no. 1
  lullaby     the lullaby itself, sung by the music box one word to a note, with a harp, strings and soft voices under it
  cartridge   silent while the little game plays (that is the chip's); the sky looking back, her lullaby bursting out, the battle
  live        the orchestra wakes at the edge of the 2D run: the 3D boss groove, a brass fanfare for the record, then the dark
  festival    her lullaby on a slow piano with room around it, silence, everything at once, a note for each review, the title
  fighter, phonk and villain are made of synthesised sound (../the-third-direction/tools/trailer/shorts-sfx.ts): their orchestra is
  silent.
"""
import json
import os
import sys

from kit import *  # noqa: F403 (the orchestra, and how to write for it)
from promo import STARS, boom, braam, climb, crack, dread, hit, title  # noqa: F401

here = os.path.dirname(os.path.abspath(__file__))
SHORTS = json.load(open(os.path.join(here, '..', 'src', 'data', 'shorts.json')))['shorts']
A_ = [57, 61, 64]


def tape_stop(t, chans, dur=0.5):
    """everything that is sounding slows and sinks, like a tape stopping, and goes out"""
    for ch in chans:
        for i in range(17):
            u = i / 16
            bend(ch, t + dur * u, -200 * u * u)
        swell(ch, t, t + dur, 110, 25, 12)
    cut(t + dur + 0.05)


# ---------------------------------------------------------------- it's not over

def the_fourth(P):
    fr, un, ey, (f1, f2, f3, f4) = P['freeze'], P['unfold'], P['eye'], P['flashes']
    fo, fy, fe, bk, e, fade = P['found'], P['foundYou'], P['flee'], P['black'], P['end'], P['fadeOut']
    # the happy ending: her lullaby in A major on the music box, warm strings under it
    chord(PAD, 0, fr + 0.5, A_, 84)
    swell(PAD, 0, 0.4, 60, 104)
    chord(STR, 0, fr + 0.5, [69, 73, 76], 58)
    note(CELLO, 0, fr + 0.5, 45, 72)
    t = 0.1
    for m, g in zip([69, 73, 76, 74, 73, 69], [0.46, 0.46, 0.66, 0.46, 0.46, 0.66]):
        if t > fr:
            break
        note(BOX, t, 1.6, m, 116)
        note(CELESTA, t, 0.9, m + 12, 56)
        t += g
    # and then nothing moves
    tape_stop(fr, (PAD, STR, CELLO, BOX, CELESTA))
    # the moon goes out; something unfolds where it was: a drone, the strings shaking, her notes gone sour
    note(BASS, un, ey - un + 0.3, 33, 84)
    swell(BASS, un, ey, 80, 120)
    note(TUBA, un + 0.4, ey - un - 0.4, 21, 80)
    chord(PAD, un, ey - un, [45, 52, 58], 80)
    chord(TREM, un, ey - un, [45, 46, 52, 53], 84)
    swell(TREM, un, ey, 70, 124)
    chord(CHOIR, un + 0.2, ey - un - 0.2, [57, 58], 86)
    swell(CHOIR, un + 0.2, ey, 60, 124)
    for i, (dt, m) in enumerate([(0.2, 69), (1.0, 72), (1.8, 76)]):
        bend(BOX, un + dt - 0.01, -120 - 40 * i)
        note(BOX, un + dt, 1.8, m, 92)
    chord(CELESTA, un + 1.6, 1.4, [93, 94, 98], 70)
    roll(TIMP, ey - 0.8, ey - 0.02, 45, 40, 110)
    cut(ey - 0.01, keep=(BASS,))
    # its eye: high and thin, out of the way of its voice
    chord(HIT, ey, 0.5, [69, 70, 76], 96)
    chord(TREM, ey, f1 - ey, [81, 82, 88], 56)
    swell(TREM, ey, f1, 40, 100)
    chord(CHOIR, ey + 0.2, f1 - ey - 0.2, [64, 65, 69], 70)
    swell(CHOIR, ey + 0.2, f1, 40, 105)
    chord(PAD, ey, f1 - ey, [57, 58, 64], 60)
    roll(TIMP, f1 - 1.0, f1 - 0.02, 45, 40, 124)
    roll(DRUMS, f1 - 1.0, f1 - 0.02, 38, 30, 110, 0.05)
    # where it takes them: a hit on each glimpse
    for i, f in enumerate((f1, f2, f3, f4)):
        chord(HIT, f, 0.2, [57 + i, 58 + i, 64 + i], 112 + 3 * i)
        note(TAIKO, f, 0.4, 48, 120)
        drum(f, 49 if i % 2 == 0 else 57, 110)
        drum(f, 36, 118)
    cut(fo - 0.02)
    # black: a clock in the dark
    note(BASS, fo, fy - fo, 33, 48)
    for k in range(3):
        note(CELESTA, fo + 0.15 + 0.42 * k, 0.8, 93 - k, 64)
    chord(TREM, fo, fy - fo, [81, 82], 50)
    swell(TREM, fo, fy, 40, 110)
    # SOMETHING FOUND YOU
    mega(fy, dur=1.0)
    chord(HIT, fy, 0.4, [57, 58, 64], 127)
    drum(fy, 52, 124)
    chord(CHOIR, fy, fe - fy, [45, 46, 52], 96)
    swell(CHOIR, fy + 0.3, fe, 110, 50)
    # its promise
    braam(fe)
    chord(TREM, fe + 0.6, bk - fe - 0.6, [81, 82], 60)
    swell(TREM, fe + 0.6, bk, 50, 112)
    chord(CHOIR, fe + 0.7, bk - fe - 0.7, [69, 70], 66)
    swell(CHOIR, fe + 0.7, bk, 40, 110)
    roll(TIMP, bk - 1.0, bk - 0.02, 45, 40, 127)
    cut(bk)
    # one note, not in tune
    bend(BOX, bk + 0.1, -70)
    note(BOX, bk + 0.12, 1.4, 69, 96)
    # the end card: the blow, her tune falling asleep - its last note wrong - and a cold shimmer on the call
    mega(e, dur=2.4)
    drum(e, 52, 124)
    roll(TIMP, e + 0.1, e + 1.2, 45, 120, 60)
    chord(PAD, e + 0.8, fade - e - 0.8, [57, 60, 64, 69], 80)
    chord(CHOIR, e + 1.2, fade - e - 1.2, [57, 64, 69], 62)
    note(BASS, e + 0.8, fade - e - 0.8, 33, 66)
    for i, m in enumerate([76, 74, 72, 69]):
        tt = e + 0.6 + i * 0.55 + (0.2 if i == 3 else 0)
        if i == 3:
            bend(CELESTA, tt - 0.01, -60)
            bend(BOX, tt - 0.01, -60)
        note(CELESTA, tt, 1.6, m, 78)
        note(BOX, tt, 1.6, m, 70)
    chord(CELESTA, e + 1.5, 1.4, [81, 88, 92], 66)
    for ch in (PAD, CHOIR, BASS, CELESTA, BOX):
        swell(ch, fade, fade + 0.6, 110, 0, 12)
    cut(fade + 0.65)


# ---------------------------------------------------------------- 5 things you missed

SEC_B = 3.4 / 8  # two bars to a secret


def secrets(P):
    s5, s4, s3, s2, s1, e, fade = P['s5'], P['s4'], P['s3'], P['s2'], P['s1'], P['end'], P['fadeOut']
    B4 = SEC_B
    # the hook: four glimpses, four plucks climbing, and a breath in
    for i, (t, m) in enumerate(zip((0.0, 0.4, 0.8, 1.2), (45, 48, 50, 52))):
        note(CELLO, t, 0.3, m, 112)
        note(CELLO, t, 0.3, m + 12, 96)
        note(TAIKO, t, 0.4, 48, 100 + 6 * i)
        note(CELESTA, t + 0.02, 0.6, m + 36, 60)
    chord(TREM, 0.0, s5, [57, 64], 60)
    swell(TREM, 0.0, s5, 30, 110)
    # the mystery: a pizzicato walk under the count, a ticking hat, the celesta asking something
    walk = [45, 48, 52, 48, 41, 45, 48, 52]
    up = [[57, 60, 64]] * 4 + [[57, 60, 65]] * 4
    for sec in (s5, s4, s3):
        mega(sec, dur=0.3, big=0.6)
        for b in range(8):
            t = sec + b * B4
            note(CELLO, t, 0.2, walk[b], 100)
            chord(STR, t + B4 / 2, 0.12, up[b], 76)
            drum(t, 42, 56)
            drum(t + B4 / 2, 42, 40)
            if b % 2 == 1:
                drum(t, 37, 70)
            if b % 4 == 0:
                drum(t, 36, 96)
        for k, m in enumerate([76, 77, 76, 72]):
            note(CELESTA, sec + (4 + k) * B4, 0.5, m, 74)
    # the foot comes down on the moth's shield
    chord(HIT, s3 + 2.19, 0.4, [57, 64, 69], 110)
    note(TAIKO, s3 + 2.19, 0.5, 48, 124)
    drum(s3 + 2.19, 49, 110)
    # no. 2: her song, alone; then the same notes, in a fight
    song = s2 + 0.4
    for m, dt in zip(LULL, (0, 0.25, 0.5, 0.875, 1.125, 1.375, 1.75, 2.0)):
        note(BOX, song + dt, 1.4, m, 120)
        note(CELESTA, song + dt, 0.8, m + 12, 52)
    chord(PAD, s2, 2.2, AM, 70)
    for i, t in enumerate((s2 + 2.2, s2 + 2.6, s2 + 3.0)):
        chord(HIT, t, 0.35, [57 + 2 * i, 64 + 2 * i, 69 + 2 * i], 114)
        chord(BRASS, t, 0.3, [45 + 2 * i, 52 + 2 * i, 57 + 2 * i], 110)
        note(HORN, t, 0.38, LULL[2 + i] - 12, 110)
        note(TAIKO, t, 0.4, 48, 122)
        drum(t, 36, 118)
        drum(t, 49, 104)
    chord(TREM, s2 + 2.2, 1.2, [57, 64, 69, 76], 80)
    swell(TREM, s2 + 2.2, s1, 70, 125)
    roll(TIMP, s1 - 0.5, s1 - 0.02, 45, 60, 126)
    cut(s1 - 0.01)
    # no. 1: the happy ending, a moment; then it tears
    for i, m in enumerate((69, 73, 76)):
        note(BOX, s1 + 0.05 + 0.25 * i, 1.2, m, 100)
    chord(PAD, s1, 0.8, A_, 70)
    cut(s1 + 0.8)
    chord(TREM, s1 + 0.8, 1.0, [45, 46, 52, 53], 84)
    chord(CHOIR, s1 + 0.8, 1.0, [45, 46], 90)
    note(BASS, s1 + 0.8, e - s1 - 0.8, 33, 70)
    # the typing: a heart under it; the stamp; the last line
    for k in range(5):
        note(TIMP, s1 + 1.7 + 0.42 * k, 0.4, 33 + 12, 70 + 6 * k)
    chord(TREM, s1 + 1.6, 1.0, [69, 70], 60)
    stamp = s1 + 2.5
    chord(HIT, stamp, 0.4, [57, 58, 64], 124)
    note(TAIKO, stamp, 0.6, 48, 127)
    drum(stamp, 49, 120)
    drum(stamp, 36, 124)
    for i, m in enumerate((76, 74, 72, 69)):
        note(CELESTA, s1 + 3.0 + 0.16 * i, 0.9, m, 64)
    cut(e - 0.03)
    title(e, fade)


# ---------------------------------------------------------------- the lullaby


def lullaby_song(P):
    (v1, v2, v3), gap, si, e, fade = P['verse'], P['gap'], P['silence'], P['end'], P['fadeOut']
    gaps = [g * gap for g in GAPS]
    ons = [sum(gaps[:i]) for i in range(8)]
    HARP, OOH = HIT, CHOIR
    CH = [[57, 60, 64], [57, 60, 64], [57, 60, 64], [50, 53, 57], [53, 57, 60], [53, 57, 60], [55, 59, 62], [52, 56, 59]]
    ROOTS = [45, 45, 45, 38, 41, 41, 43, 40]
    # under her words: a slow pad, a few stars
    chord(PAD, 0.0, v1 + 0.2, [57, 60, 64], 90)
    swell(PAD, 0.0, 0.6, 50, 104)
    chord(STR, 0.3, v1 - 0.1, [64, 69], 52)
    note(CELLO, 0.2, v1, 45, 60)
    for k, m in enumerate((88, 93, 91, 96, 88)):
        note(CELESTA, 0.3 + 0.55 * k, 1.2, m, 56)
    for k, m in enumerate((45, 52, 57, 60, 64)):
        note(HARP, 2.2 + 0.12 * k, 2.0, m, 64)
    # three verses: the music box sings, the harp turns each chord over, the strings and voices come in as it goes
    for vi, v in enumerate((v1, v2, v3)):
        for i, dt in enumerate(ons):
            t = v + dt
            m = LULL[i]
            if vi == 2 and i == 7:
                bend(BOX, t + 0.5, -40)
                bend(BOX, t + 0.8, -110)
            note(BOX, t, 1.8, m, 114)
            if vi == 0:
                note(CELESTA, t, 1.0, m + 12, 38)
            for k, p in enumerate(CH[i]):
                note(HARP, t + 0.07 * k, 1.4, p, 58 + 4 * vi)
            if i in (0, 3, 4, 6, 7):
                end = v + (ons[i + 1] if i < 7 else ons[7] + 0.9) + (0.6 if i in (0, 4) else 0)
                note(CELLO, t, max(0.4, end - t), ROOTS[i], 64 + 4 * vi)
        chord(STR, v, ons[4], [64, 69, 72] if vi else [57, 64], 50 + 8 * vi)
        chord(STR, v + ons[4], ons[7] + 0.9 - ons[4], [65, 69, 72], 50 + 8 * vi)
        if vi >= 1:
            chord(OOH, v + 0.1, ons[7] + 0.8, [69, 72, 76], 48 + 10 * vi)
            swell(OOH, v + 0.1, v + 1.2, 30, 96)
    for ch in (STR, OOH, CELLO, HARP):
        swell(ch, si - 0.6, si, 110, 0, 12)
    cut(si, keep=(BOX,))
    # the end: no blow here - a soft swell into A major, her tune falling asleep, the harp running up on the call
    chord(PAD, e, fade - e, [57, 61, 64, 69], 80)
    swell(PAD, e, e + 0.8, 30, 100)
    chord(OOH, e + 0.3, fade - e - 0.3, [61, 64, 69], 70)
    note(CELLO, e, fade - e, 45, 70)
    for i, m in enumerate((76, 74, 73, 69)):
        t = e + 0.5 + 0.6 * i + (0.2 if i == 3 else 0)
        note(BOX, t, 1.8, m, 100)
        note(CELESTA, t, 1.0, m + 12, 46)
    for k, p in enumerate((57, 61, 64, 69, 73, 76, 81)):
        note(HARP, e + 1.5 + 0.06 * k, 2.0, p, 72)
    for ch in (PAD, OOH, CELLO, BOX, CELESTA, HARP):
        swell(ch, fade, fade + 0.6, 110, 0, 12)
    cut(fade + 0.65)


# ---------------------------------------------------------------- the cartridge

def cartridge(P):
    ey, cracks, bu, bt, fa, bk, e, fade = P['eyes'], P['cracks'], P['burst'], P['battle'], P['fall'], P['back'], P['end'], P['fadeOut']
    # the little game is the chip's: the orchestra waits in the dark until the stars are eyes, then the sky looks back
    dread(ey, bu)
    chord(CHOIR, ey + 0.3, bu - ey - 0.3, [57, 58], 72)
    swell(CHOIR, ey + 0.3, bu, 40, 122)
    note(BASS, ey, bu - ey, 33, 70)
    # the glass: a blow on each crack, each higher
    for i, k in enumerate(cracks):
        chord(HIT, k, 0.3, [81 + i, 82 + i, 88 + i], 100 + 8 * i)
        note(TAIKO, k, 0.4, 48, 104 + 8 * i)
        drum(k, 49 if i == 2 else 57, 96)
    cut(bu - 0.02)
    # it breaks out: the whole orchestra, and her lullaby sung by everyone
    boom(bu, bt[0], notes=4)
    # the fight, in 3D: the battle groove, a hit on every cut, the strings climbing into the fall
    groove(bt[0], bt[0] + BAR, 33, AM, heavy=True)
    groove(bt[0] + BAR, bt[0] + 2 * BAR, 29, F, heavy=True)
    groove(bt[0] + 2 * BAR, fa, 31, G, k=1.1, heavy=True)
    for i, b in enumerate(bt):
        hit(b, i, 104 + 2 * i)
    climb(fa - 0.8, fa)
    cut(fa - 0.01)
    # the fall: the blow, and the voices falling with him
    mega(fa, dur=1.4)
    drum(fa, 52, 124)
    chord(CHOIR, fa + 0.3, bk - fa - 0.3, [57, 60, 64], 100)
    swell(CHOIR, fa + 0.3, bk, 110, 50)
    for i, m in enumerate((76, 74, 72, 69)):
        note(HORN, fa + 0.35 + 0.22 * i, 0.5, m - 12, 104 - 6 * i)
    note(BASS, fa + 0.3, bk - fa - 0.3, 33, 80)
    cut(bk)
    # back in its console: the music box, small again
    for i, m in enumerate((69, 72, 76)):
        note(BOX, bk + 0.1 + 0.26 * i, 1.0, m, 92)
        note(CELESTA, bk + 0.1 + 0.26 * i, 0.6, m + 12, 46)
    chord(PAD, bk, e - bk, [57, 60, 64], 60)
    swell(PAD, bk, e, 40, 90)
    cut(e - 0.02)
    title(e, fade)


# ---------------------------------------------------------------- live: world record attempt

def fanfare(t, until):
    """the record: a brass fanfare in A major (da-da-da DAAA), the choir and the cymbals under the last chord"""
    for dt, m in ((0.0, 76), (0.15, 76), (0.3, 76)):
        chord(BRASS, t + dt, 0.13, [m - 12, m - 8, m - 5], 124)
        note(HORN, t + dt, 0.13, m - 12, 118)
        note(TAIKO, t + dt, 0.2, 48, 104)
    t1 = t + 0.45
    chord(BRASS, t1, until - t1, [57, 61, 64, 69], 127)
    swell(BRASS, t1 + 0.4, until, 127, 70)
    chord(TROM, t1, until - t1, [45, 52], 118)
    note(HORN, t1, until - t1, 69, 120)
    note(TUBA, t1, until - t1, 33, 120)
    note(BASS, t1, until - t1, 33, 110)
    chord(CHOIR, t1, until - t1, [57, 61, 64, 69, 73], 110)
    chord(STR, t1, until - t1, [69, 73, 76, 81], 104)
    chord(HIT, t1, 0.5, [69, 73, 76], 120)
    note(TIMP, t1, 0.6, 45, 127)
    roll(TIMP, t1 + 0.4, until - 0.1, 45, 110, 60)
    drum(t1, 49, 124)
    drum(t1, 57, 116)
    drum(t1, 36, 124)


def live(P):
    ed, ck, bm, (k1, k2, k3), wr, ex, off, e, fade = P['edge'], P['crack'], P['boom'], P['bosses'], P['wr'], P['extra'], P['offline'], P['end'], P['fadeOut']
    # the 2D run is the game's own chip music on the stream; at the edge the orchestra wakes, the screen cracks
    dread(ed, ck)
    crack(ck)
    # it goes 3D
    mega(bm, dur=1.2)
    drum(bm, 52, 124)
    roll(TIMP, bm + 0.1, k1 - 0.05, 45, 124, 80)
    # three bosses: the battle groove, a key for each, a hit on each cut, the strings climbing into the record
    groove(k1, k2, 33, AM, heavy=True)
    groove(k2, k3, 29, F, heavy=True)
    groove(k3, wr, 31, G, k=1.1, heavy=True)
    for i, b in enumerate((k1, k1 + 1.0, k2, k2 + 0.8, k3, k3 + 0.6, k3 + 1.2)):
        hit(b, i, 100 + 3 * i)
    climb(wr - 0.8, wr)
    cut(wr - 0.01)
    # NEW WORLD RECORD
    fanfare(wr, ex - 0.45)
    for ch in (BRASS, TROM, HORN, TUBA, BASS, CHOIR, STR):
        swell(ch, ex - 0.45, ex - 0.05, 110, 40, 8)
    cut(ex - 0.02)
    # a split nobody put there: the strings shaking, voices a semitone apart, a drone, the timpani rolling into the dark
    chord(TREM, ex, off - ex, [45, 46, 52, 53], 92)
    swell(TREM, ex, off, 60, 125)
    chord(CHOIR, ex + 0.1, off - ex - 0.1, [57, 58, 64], 88)
    swell(CHOIR, ex + 0.1, off, 50, 122)
    note(BASS, ex, off - ex, 33, 96)
    note(TUBA, ex + 0.3, off - ex - 0.3, 21, 90)
    chord(HIT, ex, 0.4, [69, 70, 76], 110)
    roll(TIMP, ex + 0.3, off - 0.03, 45, 50, 126)
    cut(off)
    # offline; then next runner: you
    title(e, fade)


# ---------------------------------------------------------------- the festival trailer

def festival(P):
    cards, shots, hu, bm, mon, la, qs, t2, fade = P['cards'], P['shots'], P['hush'], P['boom'], P['montage'], P['laurels'], P['quotes'], P['title2'], P['fadeOut']
    PIANO = BOX
    # her lullaby on a piano, slow and very quiet, with room around it; a low drone under the words
    note(CELLO, 0.2, hu - 0.4, 33, 56)
    swell(CELLO, 0.2, 2.5, 20, 76)
    chord(STR, shots[0], hu - shots[0] - 0.2, [45, 52], 44)
    swell(STR, shots[0], hu - 0.3, 30, 92)
    gaps = [g * 1.35 for g in GAPS]
    t = 0.6
    left = {0: (AM, 45), 3: (F, 41), 5: (G, 43), 7: (E, 40)}
    for i, m in enumerate(LULL):
        note(PIANO, t, 2.2, m, 92 + (i % 3) * 4)
        if i in left:
            ps, r = left[i]
            note(PIANO, t, 2.6, r, 76)
            chord(PIANO, t + 0.12, 2.2, [p - 12 for p in ps], 62)
        t += gaps[i]
    # once more, and it stops where the rule is, on a note that does not resolve
    for i, m in enumerate(LULL[:3]):
        note(PIANO, t, 2.0 if i < 2 else 3.0, m, 96 + 4 * i)
        if i == 0:
            note(PIANO, t, 2.6, 45, 76)
        t += gaps[i]
    chord(PAD, cards[3], hu - cards[3], [57, 58], 50)
    swell(PAD, cards[3], hu, 30, 90)
    cut(hu)
    # (silence; a whisper)
    # and then everything, very fast: the blow, the strings racing, a hit on every cut
    mega(bm, dur=1.2)
    drum(bm, 52, 124)
    n = int(round((la - bm) / 0.1))
    for s in range(n):
        note(STR, bm + s * 0.1, 0.09, [57, 60, 64, 69][s % 4] + (12 if s > n // 2 else 0), 90)
        note(CELLO, bm + s * 0.1, 0.09, 45 if s % 2 == 0 else 57, 96)
    chord(CHOIR, bm, la - bm, [57, 60, 64], 96)
    swell(CHOIR, bm, la, 90, 127)
    chord(TREM, bm, la - bm, [69, 72, 76], 70)
    swell(TREM, bm, la, 60, 127)
    for i, m in enumerate(mon[1:]):
        chord(HIT, m, 0.3, [57 + i, 64 + i, 69 + i], 108 + 2 * i)
        note(TAIKO, m, 0.4, 48, 112 + 2 * i)
        drum(m, 36, 120)
        drum(m, 49 if i % 2 else 57, 100)
        chord(BRASS, m, 0.22, [45 + i, 52 + i], 112)
    roll(TIMP, la - 0.5, la - 0.02, 45, 80, 127)
    roll(DRUMS, la - 0.5, la - 0.02, 38, 80, 124, 0.04)
    cut(la - 0.01)
    # the laurels: a high string, held; one piano note for each review, and the last one wrong
    chord(STR, la + 0.3, t2 - la - 0.5, [76, 81], 40)
    swell(STR, la + 0.3, la + 1.5, 20, 76)
    for i, (q, m) in enumerate(zip(qs, (69, 72, 76))):
        if i == 2:
            bend(PIANO, q - 0.01, -70)
            note(PIANO, q, 2.0, 70, 80)
        note(PIANO, q, 2.4, m, 96)
        note(PIANO, q, 2.4, m - 24, 72)
    cut(t2 - 0.02)
    bend(PIANO, t2 - 0.01, 0)
    # the title: one low blow, and the piano's last chord; her tune falling asleep
    note(TAIKO, t2, 1.0, 48, 122)
    note(TIMP, t2, 1.4, 45, 116)
    chord(BRASS, t2, 2.6, [33, 40, 45], 100)
    swell(BRASS, t2 + 0.4, t2 + 2.6, 100, 0)
    note(BASS, t2, fade - t2, 33, 84)
    chord(PIANO, t2 + 0.5, 3.0, [45, 57, 60, 64, 69], 88)
    chord(PAD, t2 + 0.3, fade - t2 - 0.3, [57, 60, 64, 69], 66)
    chord(CHOIR, t2 + 1.2, fade - t2 - 1.2, [57, 64, 69], 56)
    for i, m in enumerate((76, 74, 72, 69)):
        note(PIANO, t2 + 1.4 + 0.7 * i + (0.25 if i == 3 else 0), 2.0, m, 90 - 4 * i)
    for ch in (PIANO, PAD, CHOIR, BASS):
        swell(ch, fade, fade + 0.6, 110, 0, 12)
    cut(fade + 0.65)


def silent(P):
    """made of synthesised sound: nothing from the orchestra"""


SCORES = {
    'the-fourth': (the_fourth, None),
    'secrets': (secrets, {STR: 45, CELLO: 45}),
    'lullaby': (lullaby_song, {HIT: 46, CHOIR: 53}),
    'fighter': (silent, None),
    'phonk': (silent, None),
    'cartridge': (cartridge, None),
    'live': (live, None),
    'festival': (festival, {BOX: 0}),
    'villain': (silent, None),
}

if __name__ == '__main__':
    sf3, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    for sid in sys.argv[3:] or list(SCORES):
        fn, programs = SCORES[sid]
        start(programs)
        fn(SHORTS[sid])
        out = os.path.join(outdir, f'short-{sid}-orchestra.wav')
        print('short score', sid, render(sf3, out), 'events ->', out)
