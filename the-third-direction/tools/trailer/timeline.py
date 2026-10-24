"""The trailer's timeline: one sheet that the picture (edit.py), the music (music.py) and the mix (mix.py) all read, so a cut,
a hit in the music and a line of voice land together.

Seconds from the first frame. 100 beats a minute in the action (a beat is 0.6 s, a bar 2.4 s).
"""

FPS = 30
W, H = 1080, 1920
LENGTH = 106.0
BEAT = 0.6

# ---- the cuts: (start, end, clip, first frame of the clip to use, speed, label) ----
# speed 1 = as captured (30 a second of game time); 0.5 = slow motion (each frame shown twice, blended)
CUTS = [
    # cold open: black, the card, then three small lights in the dark wood, a shadow over them, and the foot (frame 392, at 8.5)
    (3.2, 8.7, 'opening', 233, 1.0, None),
    (9.0, 12.0, 'z-gloom', 0, 1.0, None),
    # five places
    (12.0, 13.2, 'z-gloom', 40, 1.0, 'GLOOM HOLLOW'),
    (13.2, 14.4, 'z-thicket', 20, 1.0, 'ROOTMAW THICKET'),
    (14.4, 15.6, 'z-marsh', 20, 1.0, 'ECHO MARSH'),
    (15.6, 16.8, 'z-bones', 20, 1.0, 'BONE WASTES'),
    (16.8, 18.0, 'z-meadow', 20, 1.0, 'MOTH MEADOW'),
    # five guardians
    (19.2, 21.6, 'g-gloom', 20, 1.0, None),
    (21.6, 24.0, 'g-thicket', 20, 1.0, None),
    (24.0, 26.4, 'g-marsh', 20, 1.0, None),
    (26.4, 28.8, 'g-bones', 20, 1.0, None),
    (28.8, 31.2, 'g-meadow', 20, 1.0, None),
    # the Edge, the boom, the fall (frames picked from the edge clip: see EDGE below)
    (31.2, 36.0, 'edge', 'x-arrives', 1.0, None),
    (36.0, 38.4, 'edge', 'x-pins', 1.0, None),
    (38.4, 40.8, 'edge', 'boom', 1.0, None),
    (40.8, 45.6, 'edge', 'fall', 1.0, None),
    # the three in the Crater
    (45.6, 47.4, 'x-foot', 40, 1.0, None),
    (47.4, 49.2, 'x-rake', 74, 1.0, None),
    (49.2, 51.0, 'x-gaze', 100, 1.0, None),
    (51.0, 52.8, 'x-jaws', 44, 1.0, None),
    (52.8, 54.6, 'collector-0', 40, 1.0, None),
    (54.6, 56.4, 'collector-2', 40, 1.0, None),
    (56.4, 58.2, 'mash-0', 40, 1.0, None),
    (58.2, 60.0, 'mash-2', 52, 1.0, None),
    (60.0, 61.8, 'mash-3', 30, 1.0, None),
    # the last lock, and the family
    (61.8, 64.8, 'reunion', 30, 1.0, None),
    (64.8, 75.0, 'reunion', 120, 1.0, None),
    # the Fourth
    (75.0, 77.4, 't-unfold', 6, 1.0, None),
    (77.4, 80.4, 't-unfold', 60, 1.0, None),
    (80.4, 83.4, 't-eye', 10, 1.0, None),
    (83.4, 84.6, 't-family', 20, 1.0, None),
    (84.6, 87.0, 't-lift', 50, 1.0, None),
    (87.0, 89.4, 't-dial', 30, 1.0, None),
    (89.4, 90.6, 't-descend', 104, 1.0, None),
    (90.6, 91.8, 'fourth-fight', 150, 1.0, None),
    (91.8, 94.8, 'flee', 200, 1.0, None),
    # the sting after the title: its eye, once more
    (103.6, 105.4, 't-eye', 12, 0.6, None),
]

# where in the edge clip each part is (frame numbers, picked from a contact sheet of the clip)
EDGE = {'x-arrives': 180, 'x-pins': 430, 'boom': 826, 'fall': 1075}

# ---- the words on the screen ----
#   (start, end, kind, text, colour)   kinds: card (thin, tracked), slam (huge, hits), label (low, small), world (italic line), title
TEXT = [
    (0.6, 3.4, 'card', 'SOMETHING HUGE\nTOOK YOUR FAMILY', '#e8fffb'),
    (18.15, 19.15, 'card', 'FIVE GUARDIANS', '#e8fffb'),
    (19.3, 21.5, 'slam', 'GLOOMMOTHER', '#7fe6ff'),
    (21.7, 23.9, 'slam', 'THORNBACK KING', '#e0a050'),
    (24.1, 26.3, 'slam', 'TOLL QUEEN', '#d9b8ff'),
    (26.5, 28.7, 'slam', 'BONE WYRM', '#f4efe0'),
    (28.9, 31.1, 'slam', 'MIMIC QUEEN', '#ff8aa8'),
    (40.9, 44.6, 'big', 'THERE IS A\nTHIRD DIRECTION', '#ffe9a0'),
    (45.7, 48.6, 'slam', 'X, THE HOLLOW', '#ff3a4a'),
    (52.9, 55.6, 'slam', 'THE COLLECTOR', '#ffcf5a'),
    (56.5, 59.4, 'slam', 'THE MASH', '#ff8aa8'),
    (75.3, 77.3, 'world', 'and then nothing moves.', '#cfeee8'),
    (87.1, 89.3, 'big', 'THE FOURTH\nDIMENSION', '#c9b8ff'),
    (95.6, 102.8, 'title', 'THE THIRD DIRECTION', '#ffe9a0'),
]

# ---- the voices: (start, file, gain) ----
VOICE = [
    (0.8, 'n1', 1.0),
    (4.4, 'm1', 0.95),
    (6.4, 'f1', 0.95),
    (9.4, 'n2', 1.0),
    (12.2, 'n3', 1.0),
    (16.4, 'n4', 0.95),
    (31.6, 'n5', 1.0),
    (41.0, 'n6', 1.05),
    (46.0, 'n7', 0.95),
    (66.4, 'm2', 1.0),
    (68.8, 'b1', 0.95),
    (71.6, 'b2', 1.0),
    (75.2, 'n8', 0.9),
    (80.6, 'w1', 0.5), (80.95, 'x1', 1.0), (80.97, 'x1u', 0.55),
    (83.5, 'm3', 1.0),
    (84.7, 'w2', 0.5), (85.05, 'x2', 1.0), (85.07, 'x2u', 0.55),
    (90.0, 'm4', 0.95),
    (92.0, 'w3', 0.5), (92.35, 'x3', 1.1), (92.37, 'x3u', 0.6),
    (97.4, 'n9', 1.05),
    (104.0, 'w4', 0.6), (104.3, 'x4', 0.9), (104.32, 'x4u', 0.5),
]

# ---- the big transitions (edit.py draws them; music.py hits them) ----
# (time, kind)  kinds: flash, glitch, whip, black (a beat of black), shatter
FX = [
    (12.0, 'whip'), (13.2, 'glitch'), (14.4, 'whip'), (15.6, 'glitch'), (16.8, 'whip'),
    (19.2, 'flash'), (21.6, 'flash'), (24.0, 'flash'), (26.4, 'flash'), (28.8, 'flash'),
    (31.2, 'glitch'), (38.4, 'glitch'), (40.8, 'flash'),
    (45.6, 'flash'), (47.4, 'whip'), (49.2, 'glitch'), (51.0, 'whip'), (52.8, 'flash'), (54.6, 'whip'),
    (56.4, 'flash'), (58.2, 'glitch'), (60.0, 'whip'), (61.8, 'glitch'),
    (77.4, 'glitch'), (80.4, 'glitch'), (83.4, 'whip'), (84.6, 'glitch'), (87.0, 'flash'), (89.4, 'whip'), (91.8, 'glitch'),
    (103.6, 'glitch'),
]
