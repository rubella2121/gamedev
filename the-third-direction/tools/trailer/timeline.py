"""The trailer's timeline: one sheet that the picture (edit.py), the music (score.ts, through --cues) and the mix (mix.py) all read,
so a cut, a hit in the music and a line of voice land together.

Seconds from the first frame. The music is the game's own intro score, re-timed: 96 beats a minute in the action, a bar is 1.6 s.
What comes after the family stays a secret: the trailer never shows it.

    python3 timeline.py --cues > cues.json      the music's cue sheet, for score-render.mjs
"""

FPS = 30
W, H = 1080, 1920
BAR = 1.6

# ---- the music's cue sheet (score.ts reads exactly these names) ----
CUE = {
    'bar': BAR,
    'cardIn': 0.8,
    # the clearing: the lullaby; the shadow creeps in and the tune sags; the jump cut; the foot
    'openingStart': 3.0,
    'shadowCreep': 7.1,
    'jumpCut': 10.4,
    'slam': 11.0,
    # the crater in the dark; red eyes
    'eyesOpen': 12.8,
    # five places, five guardians: a bar each
    'montageStart': 13.6,
    'zoneCuts': [13.6, 15.2, 16.8, 18.4, 20.0],
    'footLands': 20.8,
    'guardianCuts': [21.6, 23.2, 24.8, 26.4, 28.0],
    # the Edge: the stars go out one by one; look up; the crack; the boom; the fall
    'edgeStart': 29.6,
    'starPings': [30.2, 30.6, 31.05, 31.4, 31.8, 32.15, 32.5, 32.8],
    'riserStart': 32.2,
    'crack': 33.9,
    'boom': 35.3,
    'landAfter': 3.0,
    # X, whole, and his fight (a bar a cut); the other two; the rush; the last lock
    'reveal': 40.3,
    'xCuts': [40.3, 41.9, 43.5, 45.1],
    'collector': 46.7,
    'mash': 48.7,
    'rush': 50.7,
    'rushCuts': [50.7, 51.3, 51.8, 52.2, 52.5, 52.75, 52.95],
    'lock': 53.1,
    # the family, the lullaby in tune
    'family': 55.0,
    # the title; the tune falls asleep; play now; black
    'title': 66.0,
    'endTune': 68.9,
    'playNow': 71.0,
    'fadeOut': 72.6,
    # after the end
    'sting': 73.4,
    'stingOut': 75.7,
    'length': 78.0,
}
LENGTH = CUE['length']
TT = CUE['title']

# ---- the cuts: (start, end, clip, first frame of the clip, speed, label) ----
# speed 1 = as captured; below 1 = slow motion (blended); negative = backwards
_Z, _G, _X, _R = CUE['zoneCuts'], CUE['guardianCuts'], CUE['xCuts'], CUE['rushCuts']
CUTS = [
    # the clearing: three small lights, the lullaby; the shadow; the foot (frame 392 of the opening lands on the slam)
    (3.0, 10.4, 'opening', 152, 1.0, None),
    (10.4, 11.0, 'opening', 374, 1.0, None),
    # the crater, and red eyes over it
    (11.0, 12.8, 'opening', 394, 0.5, None),
    (12.8, 13.6, 'edge', 300, 1.0, None),
    # five places
    (_Z[0], _Z[1], 'z-gloom', 30, 1.0, 'GLOOM HOLLOW'),
    (_Z[1], _Z[2], 'z-thicket', 20, 1.0, 'ROOTMAW THICKET'),
    (_Z[2], _Z[3], 'z-marsh', 20, 1.0, 'ECHO MARSH'),
    (_Z[3], _Z[4], 'z-bones', 20, 1.0, 'BONE WASTES'),
    (_Z[4], _G[0], 'z-meadow', 30, 1.0, 'MOTH MEADOW'),
    # five guardians, each cut on its entrance
    (_G[0], _G[1], 'g-gloom', 62, 1.0, None),
    (_G[1], _G[2], 'g-thicket', 150, 1.0, None),
    (_G[2], _G[3], 'g-marsh', 78, 1.0, None),
    (_G[3], _G[4], 'g-bones', 70, 1.0, None),
    (_G[4], CUE['edgeStart'], 'g-meadow', 44, 1.0, None),
    # the Edge: the stars go out (the clip played backwards), then the eyes; the crack shows the cage; the fall
    (CUE['edgeStart'], 32.9, 'edge', 178, -1.0, None),
    (32.9, CUE['crack'], 'edge', 182, 1.0, None),
    (CUE['crack'], CUE['boom'], 'edge', 828, 1.0, None),
    (CUE['boom'], CUE['reveal'], 'edge', 1080, 1.0, None),
    # X: a bar a cut
    (_X[0], _X[1], 'x-foot', 34, 1.0, None),
    (_X[1], _X[2], 'x-rake', 74, 1.0, None),
    (_X[2], _X[3], 'x-gaze', 104, 1.0, None),
    (_X[3], CUE['collector'], 'x-jaws', 40, 1.0, None),
    # the Collector, the Mash
    (CUE['collector'], 47.7, 'collector-0', 40, 1.0, None),
    (47.7, CUE['mash'], 'collector-2', 46, 1.0, None),
    (CUE['mash'], 49.7, 'mash-0', 40, 1.0, None),
    (49.7, CUE['rush'], 'mash-3', 44, 1.0, None),
    # the rush: faster and faster
    (_R[0], _R[1], 'g-thicket', 225, 1.0, None),
    (_R[1], _R[2], 'x-gaze', 128, 1.0, None),
    (_R[2], _R[3], 'g-marsh', 200, 1.0, None),
    (_R[3], _R[4], 'mash-2', 96, 1.0, None),
    (_R[4], _R[5], 'edge', 455, 1.0, None),
    (_R[5], _R[6], 'x-jaws', 84, 1.0, None),
    (_R[6], CUE['lock'], 'collector-2', 138, 1.0, None),
    # the last lock breaks, and the family
    (CUE['lock'], CUE['family'], 'reunion', 74, 1.0, None),
    (CUE['family'], TT, 'reunion', 135, 0.88, None),
    # after the end: the three of them under the moon, and the light going out
    (CUE['sting'], CUE['stingOut'], 'moonlit', 10, 0.7, None),
]

# ---- the words on the screen ----
#   (start, end, kind, text, colour)   kinds: card, hero, slam, big, world, title
TEXT = [
    (7.8, 10.3, 'hero', 'THE BLOB\nthe last small light', '#ffe9a0'),
    (_G[0] + 0.05, _G[1] - 0.1, 'slam', 'GLOOMMOTHER', '#7fe6ff'),
    (_G[1] + 0.05, _G[2] - 0.1, 'slam', 'THORNBACK KING', '#e0a050'),
    (_G[2] + 0.05, _G[3] - 0.1, 'slam', 'TOLL QUEEN', '#d9b8ff'),
    (_G[3] + 0.05, _G[4] - 0.1, 'slam', 'BONE WYRM', '#f4efe0'),
    (_G[4] + 0.05, CUE['edgeStart'] - 0.1, 'slam', 'MIMIC QUEEN', '#ff8aa8'),
    (36.5, 40.1, 'big', 'THERE IS A\nTHIRD DIRECTION', '#ffe9a0'),
    (CUE['reveal'] + 0.05, _X[2] - 0.1, 'slam', 'X, THE HOLLOW', '#ff3a4a'),
    (CUE['collector'] + 0.05, CUE['mash'] - 0.1, 'slam', 'THE COLLECTOR', '#ffcf5a'),
    (CUE['mash'] + 0.05, CUE['rush'] - 0.1, 'slam', 'THE MASH', '#ff8aa8'),
    (TT, CUE['fadeOut'], 'title', 'THE THIRD DIRECTION', '#ffe9a0'),
]

# ---- the voices: (start, file, gain) ----
VOICE = [
    (0.6, 'n1', 1.0),    # Every night, she sang you the same song.
    (4.55, 'm1', 0.9),   # Don't look up.
    (7.3, 'n2', 1.0),    # But something up there was listening.
    (11.55, 'n3', 1.0),  # It took them.
    (13.75, 'n4', 1.0),  # So you run.
    (18.55, 'n5', 0.95), # Five guardians stand in your way.
    (29.9, 'n6', 1.0),   # And when the last star goes out...
    (32.85, 'n7', 1.05), # ...look up.
    (36.6, 'n8', 1.05),  # There is a third direction.
    (56.0, 'm2', 0.95),  # Little light.
    (58.6, 'b1', 0.95),  # I found you.
    (60.9, 'f1', 0.9),   # You looked up.
    (63.0, 'b2', 0.95),  # I'm not afraid of it anymore.
    (68.0, 'n9', 1.05),  # The Third Direction.
    (74.3, 'w1', 1.5),   # Look up.
]

# ---- the big transitions (edit.py draws them) ----
# (time, kind)  kinds: flash, glitch, whip, cut (a plain hard cut; any other seam dissolves)
FX = [
    (CUE['jumpCut'], 'glitch'), (CUE['slam'], 'flash'),
    (_Z[1], 'whip'), (_Z[2], 'glitch'), (_Z[3], 'whip'), (_Z[4], 'glitch'),
    (_G[0], 'flash'), (_G[1], 'flash'), (_G[2], 'flash'), (_G[3], 'flash'), (_G[4], 'flash'),
    (CUE['edgeStart'], 'glitch'), (CUE['crack'], 'flash'), (CUE['boom'], 'glitch'),
    (CUE['reveal'], 'flash'), (_X[1], 'whip'), (_X[2], 'glitch'), (_X[3], 'whip'),
    (CUE['collector'], 'flash'), (47.7, 'whip'), (CUE['mash'], 'flash'), (49.7, 'glitch'),
    (_R[1], 'cut'), (_R[2], 'glitch'), (_R[3], 'cut'), (_R[4], 'glitch'), (_R[5], 'cut'), (_R[6], 'glitch'),
    (CUE['lock'], 'flash'), (CUE['stingOut'], 'glitch'),
]

if __name__ == '__main__':
    import json
    import sys
    if '--cues' in sys.argv:
        print(json.dumps(CUE))
