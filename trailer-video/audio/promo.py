"""The promos' scores: one short piece for each promo, written note by note to its cue sheet (src/data/promos.json) on the
trailer's orchestra (kit.py), so every cut, word and hit lands on the music.
   python3 audio/promo.py <soundfont.sf3> <outDir> [ids...]          -> <outDir>/promo-<id>-orchestra.wav

The lullaby (A C E D C A G E) is the theme again: on the music box while the world is small and flat, sagging out of tune as
the stars go out, sung by everyone when the world bursts into the third direction. The fights run at 150 beats a minute, a hit
on every cut. Every promo ends the same way: the blow under the title, the lullaby falling asleep, and a lift into A major on
the call to play and vote.
"""
import json
import os
import sys

from kit import *  # noqa: F403 (the orchestra, and how to write for it)

here = os.path.dirname(os.path.abspath(__file__))
PROMOS = json.load(open(os.path.join(here, '..', 'src', 'data', 'promos.json')))
CLIPS = PROMOS['clips']
HALF = BAR / 2
STARS = [100, 96, 93, 91, 88, 84, 81, 80]
CH = [AM, G, F, E, AM]
ROOT = [33, 31, 29, 28, 33]


# ---------------------------------------------------------------- the pieces every promo is made of

def lullaby(t0, until, gaps=GAPS, sag_at=None, v=88, cel=38):
    """the lullaby on the music box (the celesta an octave up, softly), from t0 until `until`; out of tune after `sag_at`"""
    t = t0
    for rep in range(2):
        for i, m in enumerate(LULL):
            if t >= until:
                return
            if sag_at is not None and t >= sag_at:
                bend(BOX, t - 0.01, -min(170, 25 + (t - sag_at) * 60))
            note(BOX, t, 1.6, m, v)
            if rep == 0:
                note(CELESTA, t, 0.9, m + 12, cel)
            t += gaps[i]


def tick(t0, t1, p=45, v=70):
    """a soft pulse on every beat, like a clock under the lullaby: something is coming"""
    t = t0
    while t < t1 - 1e-6:
        note(CELLO, t, 0.12, p, v)
        t += B


def pings(ts):
    """a star going out: a celesta note, each lower and softer than the last"""
    for i, tp in enumerate(ts):
        note(CELESTA, tp, 1.4, STARS[i] - 12, 66 - 3 * i)


def dread(t0, t1):
    """the sky looking back: low brass and shaking strings that will not resolve, the choir rising, the timpani rolling in"""
    chord(BRASS, t0, t1 - t0, [33, 34], 88)
    swell(BRASS, t0, t1, 30, 120)
    chord(TREM, t0 - 0.3, t1 - t0 + 0.3, [45, 46, 52, 53], 76)
    swell(TREM, t0 - 0.3, t1, 20, 125)
    roll(TIMP, t0, t1 - 0.05, 45, 40, 124)
    roll(DRUMS, t0, t1 - 0.05, 51, 30, 110, 0.05)


def crack(t):
    """the sky cracks: glass, then nothing"""
    chord(CELESTA, t, 1.2, [88, 89, 93, 94], 110)
    drum(t, 52, 112)
    chord(HIT, t, 0.4, [81, 84, 88], 100)
    cut(t + 0.15)


def boom(t, until, notes=4):
    """the world bursts: the whole orchestra, then the first notes of the lullaby sung by everyone, rolling into `until`"""
    mega(t, dur=2.2, big=1.0)
    drum(t, 52, 124)
    roll(TIMP, t + 0.1, t + 1.0, 45, 124, 70)
    th = t + 0.4
    step = (until - th) / notes
    harm = [(AM, 33), (AM, 33), (F, 29), (G, 31)]
    for i in range(notes):
        tt = th + i * step
        m = LULL[i]
        ps, r = harm[i]
        note(HORN, tt, step * 0.98, m - 12, 112)
        note(STR, tt, step * 0.98, m, 108)
        note(CHOIR, tt, step * 0.98, m, 104)
        chord(PAD, tt, step, ps, 92)
        chord(BRASS, tt, step * 0.9, [r + 12, r + 19], 98)
        note(BASS, tt, step, r, 100)
        note(TUBA, tt, step, r, 92)
        if i % 2 == 0:
            note(TAIKO, tt, 0.5, 48, 110)
            note(TIMP, tt, 0.5, r + 12, 100)
    roll(TIMP, until - 0.6, until - 0.02, 45, 60, 126)
    roll(DRUMS, until - 0.6, until - 0.02, 38, 60, 120, 0.05)


def braam(t):
    """X: the brass blast of every trailer"""
    chord(BRASS, t, 1.4, [33, 40, 45], 127)
    note(TUBA, t, 1.5, 33, 127)
    chord(TROM, t, 1.4, [40, 45], 124)
    chord(CHOIR, t, 1.5, [45, 52, 57], 120)
    mega(t, dur=0.5, big=0.9)


def hit(t, i=0, v=104):
    """a hit on a cut, the horns calling the lullaby"""
    chord(HIT, t, 0.4, [57, 64, 69], v)
    drum(t, 49, 96)
    note(HORN, t, 0.75, LULL[i % 8] - 12, 100 + 2 * (i % 4))


def climb(t0, t1, step=0.1):
    """the strings climbing, the choir swelling, the drums rolling: into the next big hit"""
    n = int(round((t1 - t0) / step))
    for s in range(n):
        note(STR, t0 + s * step, step * 0.9, 57 + s, 82 + s * 2)
        note(CELLO, t0 + s * step, step * 0.9, 45 + (s // 2), 84 + s)
    chord(CHOIR, t0, t1 - t0, [57, 60, 64], 80)
    swell(CHOIR, t0, t1, 60, 127)
    roll(TIMP, t1 - 0.6, t1 - 0.02, 45, 70, 127)
    roll(DRUMS, t1 - 0.6, t1 - 0.02, 38, 70, 124, 0.04)


def guardian_bar(g, i, k=1.0):
    """a guardian's bar: the strings racing, the drums, a hit, and the lullaby on horns as a call to arms"""
    k = k * (1 + 0.06 * i)
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
    note(HORN, g, 0.76, LULL[(2 * i) % 8] - 12, 96)
    note(HORN, g + 2 * B, 0.76, LULL[(2 * i + 1) % 8] - 12, 98)


def title(e, fade):
    """the end card: the blow under the cube; the lullaby falling asleep (E D C A); a lift into A major on play and vote"""
    mega(e, dur=2.6, big=1.0)
    drum(e, 52, 124)
    roll(TIMP, e + 0.1, e + 1.4, 45, 120, 60)
    chord(PAD, e + 1.0, fade - e - 1.0, [57, 60, 64, 69], 80)
    note(BASS, e + 1.0, fade - e - 1.0, 33, 66)
    gap = min(0.6, (fade - e - 0.8) / 4)
    for i, m in enumerate([76, 74, 72, 69]):
        t = e + 0.6 + i * gap + (0.2 if i == 3 else 0)
        note(CELESTA, t, 1.6, m, 78)
        note(BOX, t, 1.6, m, 70)
    cta = e + 1.55
    chord(CELESTA, cta, 1.6, [81, 88, 93], 72)
    chord(CHOIR, cta, fade - cta + 0.4, [57, 61, 64, 69], 70)
    for ch in (PAD, CHOIR, BASS, CELESTA, BOX):
        swell(ch, fade, fade + 0.6, 110, 0, 12)
    cut(fade + 0.65)


# ---------------------------------------------------------------- 1. it's a 2D game, until you look up

def two_d(P):
    st, ey, ck, bm, rv, e = P['stars'], P['eyes'], P['crack'], P['boom'], P['reveal'], P['end']
    b1, b2, b3, b4 = P['battle']
    r1, r2 = P['rush']
    fade = P['length'] - 0.75
    # the forest asleep: the lullaby, quick; it sags as the stars go out
    for t0, t1, ps in [(0.0, st, AM), (st, st + 1.2, F), (st + 1.2, ey, [50, 53, 57])]:
        chord(PAD, t0, t1 - t0 + 0.4, ps, 72)
        chord(STR, t0, t1 - t0, [p + 12 for p in ps], 62)
    swell(PAD, 0.0, 0.6, 50, 96)
    note(BASS, 0.1, ey - 0.1, 33, 64)
    tick(0.12, ey)
    lullaby(0.12, ey - 0.1, gaps=[g * 0.8 for g in GAPS], sag_at=st + 0.6, v=116, cel=64)
    pings(P['starPings'])
    chord(CHOIR, st + 0.4, ck - st - 0.4, [64, 65], 70)
    swell(CHOIR, st + 0.4, ck, 15, 115)
    dread(ey, ck)
    crack(ck)
    boom(bm, rv)
    # X; the fight, a hit on every cut
    braam(rv)
    groove(rv + 0.4, b1, 33, AM)
    groove(b1, b3, 29, F)
    groove(b3, r1, 31, G, heavy=True)
    for i, t in enumerate(P['battle']):
        hit(t, i)
    for i, h in enumerate(P['rush']):
        chord(HIT, h, 0.3, [57 + 2 * i, 64 + 2 * i, 69 + 2 * i], 114 + 4 * i)
        note(TAIKO, h, 0.4, 48, 118)
        drum(h, 49 if i % 2 == 0 else 57, 104 + 4 * i)
        drum(h, 36, 118)
    climb(r1, e)
    cut(e - 0.03)
    title(e, fade)


# ---------------------------------------------------------------- 2. the boss rush

def boss_rush(P):
    hs, hh, gs, ck, bm, e = P['hookSlow'], P['hookHit'], P['guardians'], P['crack'], P['boom'], P['end']
    bx, bc, bmash = P['bosses']
    fade = P['length'] - 0.75
    # you, tiny: two little notes; then something enormous coming
    for t, m in ((0.06, 81), (0.3, 84), (0.54, 88)):
        note(BOX, t, 1.0, m, 127)
        note(CELESTA, t, 0.6, m + 12, 100)
    chord(TREM, 0.1, hh - 0.1 + 0.2, [45, 46, 52], 84)
    swell(TREM, 0.1, hh, 84, 127)
    note(BASS, 0.1, hh - 0.1 + 0.1, 33, 100)
    chord(CHOIR, 0.3, hh - 0.3 + 0.1, [57, 58], 90)
    swell(CHOIR, 0.3, hh, 74, 127)
    mega(hh, dur=1.0)
    cut(hh + 0.72)
    roll(DRUMS, hh + 0.75, gs[0] - 0.02, 38, 40, 118, 0.05)
    roll(TIMP, hh + 0.75, gs[0] - 0.02, 45, 40, 124)
    # five guardians: a bar each
    for i, g in enumerate(gs):
        guardian_bar(g, i)
    # the sky cracks: the drums run at it, then everything bursts into the third direction
    roll(TAIKO, ck, bm, 48, 70, 125, 0.05)
    roll(DRUMS, ck, bm, 38, 50, 115, 0.05)
    for i in range(8):
        note(STR, ck + i * 0.05, 0.05, 57 + 2 * i, 90 + 4 * i)
    chord(CELESTA, ck, 1.0, [88, 89, 93, 94], 96)
    boom(bm, bx, notes=2)
    # the three in 3D, each heavier than the last
    braam(bx)
    groove(bx + 0.4, bc, 33, AM)
    mega(bc, dur=0.4, big=0.85)
    groove(bc, bmash, 29, F)
    mega(bmash, dur=0.4, big=0.9)
    groove(bmash, e - 0.4, 31, G, k=1.08, heavy=True)
    for i, t in enumerate([bx + HALF, bc + HALF, bmash + HALF]):
        hit(t, i)
    climb(e - 0.8, e)
    cut(e - 0.03)
    title(e, fade)


# ---------------------------------------------------------------- 3. they took my parents

def family(P):
    hm, sh, sl, jn, gs, ck, bm, rv = P['home'], P['shadow'], P['slam'], P['journey'], P['guardians'], P['crack'], P['boom'], P['reveal']
    b1, b2, b3 = P['battle']
    fa, lo, fm, e = P['fall'], P['lock'], P['family'], P['end']
    fade = P['length'] - 0.75
    # the cage; home: the lullaby, the way she sang it
    for t0, t1, ps in [(0.0, hm, AM), (hm, hm + 0.9, F), (hm + 0.9, sh, [50, 53, 57])]:
        chord(PAD, t0, t1 - t0 + 0.4, ps, 76)
        chord(STR, t0, t1 - t0, [p + 12 for p in ps], 64)
    swell(PAD, 0.0, 0.5, 60, 100)
    note(CELLO, 0.1, sh - 0.1, 45, 70)
    note(BASS, 0.1, sl - 0.1, 33, 62)
    lullaby(0.1, sl - 0.2, sag_at=sh, v=116, cel=60)
    # the shadow comes, and takes them
    chord(TREM, sh, sl - sh, [45, 46, 52], 74)
    swell(TREM, sh, sl, 25, 125)
    chord(CHOIR, sh + 0.2, sl - sh - 0.2, [57, 58, 60], 74)
    swell(CHOIR, sh + 0.2, sl, 20, 120)
    chord(BRASS, sl - 0.8, 0.8, [33, 34], 80)
    swell(BRASS, sl - 0.8, sl, 30, 125)
    swell(BASS, sh, sl, 60, 125)
    cut(sl)
    mega(sl, dur=0.9, big=0.95)
    drum(sl, 52, 120)
    cut(sl + 0.55)
    note(BASS, sl + 0.6, jn - sl - 0.6, 33, 42)
    # the journey: the lullaby on horns, the strings set off
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
    # through every monster: a hit on every beat, the chords stepping down
    chord(CHOIR, gs[0], ck - gs[0], [57, 60, 64], 84)
    for i, g in enumerate(gs):
        ch3 = [p + 12 for p in CH[i]] + [CH[i][0] + 24]
        for s in range(4):
            note(STR, g + s * B / 4, 0.09, ch3[s % 4], 80 + 4 * i)
        chord(HIT, g, 0.35, [p + 12 for p in CH[i]], 112)
        chord(BRASS, g, 0.3, [ROOT[i] + 12, ROOT[i] + 19, ROOT[i] + 24], 112)
        note(TAIKO, g, 0.4, 48, 118)
        note(TIMP, g, 0.4, ROOT[i] + 12, 104)
        note(BASS, g, 0.36, ROOT[i], 100)
        note(HORN, g, 0.38, LULL[i] - 12, 100)
        drum(g, 36, 120)
        drum(g, 49 if i % 2 == 0 else 57, 100)
    crack(ck)
    boom(bm, rv, notes=3)
    # X; the fight
    braam(rv)
    groove(rv + 0.4, b3, 33, AM)
    groove(b3, fa, 29, F)
    for i, t in enumerate([b2, b3]):
        hit(t, i)
    roll(TIMP, fa - 0.6, fa - 0.02, 45, 70, 127)
    roll(DRUMS, fa - 0.6, fa - 0.02, 38, 70, 124, 0.04)
    # X falls: no drums; a lament, the tune falling asleep on horns
    mega(fa, dur=1.2, big=1.0)
    chord(PAD, fa, 0.8, AM, 100)
    chord(PAD, fa + 0.8, lo - fa - 0.8, F, 92)
    chord(CHOIR, fa, 0.8, [57, 60, 64, 69], 100)
    chord(CHOIR, fa + 0.8, lo - fa - 0.8, [57, 60, 65, 69], 92)
    for i, m in enumerate([64, 62, 60, 57]):
        note(HORN, fa + 0.2 + i * 0.36, 0.34, m, 104 - 4 * i)
    note(BASS, fa, lo - fa, 33, 96)
    note(TUBA, fa, 1.0, 33, 100)
    roll(TIMP, lo - 0.5, lo - 0.02, 45, 50, 124)
    # the last lock: glass
    chord(CELESTA, lo, 1.4, [81, 88, 93], 112)
    chord(HIT, lo, 0.4, [69, 76, 81], 104)
    drum(lo, 57, 110)
    cut(lo + 0.22, keep=(CELESTA,))
    # together: the lullaby in A major, on the music box
    A_, D_, E_ = [57, 61, 64], [50, 54, 57], [52, 56, 59]
    for t0, t1, ps, r in [(fm, fm + 1.2, A_, 45), (fm + 1.2, fm + 2.2, D_, 38), (fm + 2.2, e - 0.9, E_, 40)]:
        chord(PAD, t0, t1 - t0 + 0.3, ps, 70)
        note(CELLO, t0, t1 - t0, r, 72)
        chord(CHOIR, t0, t1 - t0, [p + 12 for p in ps[:2]], 46)
    swell(PAD, fm, fm + 0.8, 50, 104)
    for t0, t1, ps in [(fm, fm + 1.2, A_), (fm + 1.2, fm + 2.2, D_), (fm + 2.2, e - 0.9, E_)]:
        chord(STR, t0, t1 - t0, [p + 12 for p in ps], 66)
    t = fm + 0.35
    for m, gap in zip([69, 73, 76, 74, 73], [0.66, 0.66, 0.95, 0.66, 0.66]):
        if t > e - 1.0:
            break
        note(BOX, t, 1.8, m, 116)
        note(CELESTA, t, 1.0, m + 12, 56)
        t += gap
    chord(TREM, e - 1.2, 1.2, [57, 64, 69, 76], 80)
    swell(TREM, e - 1.2, e, 56, 126)
    roll(TIMP, e - 0.9, e - 0.02, 45, 60, 126)
    roll(DRUMS, e - 0.9, e - 0.02, 51, 50, 116, 0.05)
    cut(e - 0.03)
    title(e, fade)


# ---------------------------------------------------------------- 4. don't look up

def dont_look_up(P):
    st, ey, ft, fl, ru, bk, e = P['stars'], P['eyes'], P['foot'], P['footLands'], P['rush'], P['black'], P['end']
    fade, so = P['fadeOut'], P['sting']
    # the night: one note in tune, one not; something high and thin; something deep
    note(BOX, 0.25, 1.8, 69, 84)
    note(BOX, 0.95, 1.8, 72, 80)
    bend(BOX, 0.94, -70)
    note(BOX, 1.65, 1.8, 76, 74)
    bend(BOX, 1.64, -110)
    chord(TREM, 0.0, ey, [81, 82], 40)
    swell(TREM, 0.0, ey, 20, 70)
    note(BASS, 0.3, ft - 0.3, 33, 52)
    chord(PAD, 0.0, ey, [57, 60], 44)
    pings(P['starPings'])
    chord(CHOIR, st, ey - st + 0.6, [64, 65], 70)
    swell(CHOIR, st, ey + 0.6, 15, 110)
    # they open
    chord(HIT, ey, 0.5, [57, 58, 64], 110)
    dread(ey, ft)
    cut(ft)
    # his foot: the breath in, then the blow
    chord(CHOIR, ft, fl - ft + 0.1, [57, 58], 80)
    swell(CHOIR, ft, fl, 30, 124)
    chord(TREM, ft, fl - ft + 0.1, [45, 46, 52], 70)
    swell(TREM, ft, fl, 40, 124)
    mega(fl, dur=0.9)
    # him: a hit on every cut, higher each time
    for i, h in enumerate(ru):
        chord(HIT, h, 0.3, [57 + 2 * i, 64 + 2 * i, 69 + 2 * i], 112 + 4 * i)
        note(TAIKO, h, 0.4, 48, 116 + 2 * i)
        drum(h, 49 if i % 2 == 0 else 57, 100 + 4 * i)
        drum(h, 36, 118)
    climb(ru[0], bk)
    cut(bk)
    title(e, fade)
    # after the end: something deep
    note(TIMP, so, 1.2, 40, 127)
    drum(so, 35, 127)
    note(TUBA, so, 1.4, 21, 127)
    chord(CHOIR, so, 0.5, [45, 46, 52], 112)
    cut(P['length'] - 0.12)


SCORES = {'2d-to-3d': two_d, 'boss-rush': boss_rush, 'family': family, 'dont-look-up': dont_look_up}

if __name__ == '__main__':
    sf3, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    for pid in sys.argv[3:] or list(SCORES):
        start()
        SCORES[pid](CLIPS[pid])
        out = os.path.join(outdir, f'promo-{pid}-orchestra.wav')
        print('promo score', pid, render(sf3, out), 'events ->', out)
