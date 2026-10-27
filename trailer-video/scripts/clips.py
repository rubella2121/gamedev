"""The footage, ready for Remotion: every clip the cuts use (the trailer's and the promos'), as a 1080x1920 MP4 in public/clips/, plus the stills and the grain.
   python3 scripts/clips.py <footDir>

footDir holds one folder of numbered JPEGs per shot (the-third-direction/tools/trailer/capture.mjs). The forest (216x384 pixel
art) is blown up in whole pixels so it stays crisp; the 3D (540x960 or 720x1280) is scaled smoothly. The Edge clip is both, so
every frame is scaled on its own. Also made here: edge-stars (the stars going out: part of the Edge played backwards), the
last 2D frame the boom bursts (public/stills/boom.png), and eight frames of film grain (public/grain/).
"""
import os
import subprocess
import sys

import numpy as np
from PIL import Image

foot = sys.argv[1]
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
pub = os.path.join(root, 'public')
W, H = 1080, 1920
CLIPS = ['h-x-slam', 'edge', 'opening', 'w-pulse', 'g-gloom', 'f-gloom', 'g-thicket', 'f-thicket', 'g-marsh', 'f-marsh', 'g-bones',
         'f-bones', 'g-meadow', 'f-meadow', 'c-x-hero', 'h-x-gaze', 'c-chase', 'c-x-stomp', 'c-cage', 'c-collector', 'collector-2',
         'c-mash', 'mash-3', 'x-gaze', 'mash-2', 'x-jaws', 'h-x-death', 'reunion', 'moonlit',
         # the promos also use these
         'x-foot', 'x-rake', 'mash-0', 'collector-0',
         # and the shorts: what comes after the end (the Fourth)
         't-family', 't-unfold', 't-eye', 't-lift', 't-descend', 't-dial', 'fourth-fight', 'flee',
         # and the third batch: places and angles never filmed before (the wildlife film, one take, lofi)
         'wild-moon', 'wild-well', 'wild-peek', 'wild-face', 'wild-wellface', 'wild-tele', 'wild-xface', 'wild-cage',
         'wild-stomp', 'wild-fight', 'oner', 'lofi',
         # and the tarot reading: the Collector and the Mash, close
         'tarot-collector', 'tarot-mash']


def frames(clip):
    d = os.path.join(foot, clip)
    return sorted(os.path.join(d, f) for f in os.listdir(d) if f.endswith('.jpg'))


def big(path):
    im = Image.open(path).convert('RGB')
    if im.size == (W, H):
        return im
    return im.resize((W, H), Image.NEAREST if im.width < 400 else Image.LANCZOS)


def encode(name, paths):
    out = os.path.join(pub, 'clips', f'{name}.mp4')
    if os.path.exists(out) and os.path.getmtime(out) > max(os.path.getmtime(p) for p in paths):
        return
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
                           '-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-g', '15', '-pix_fmt', 'yuv420p', out], stdin=subprocess.PIPE)
    for p in paths:
        ff.stdin.write(big(p).tobytes())
    ff.stdin.close()
    ff.wait()
    print(name, len(paths))


os.makedirs(os.path.join(pub, 'clips'), exist_ok=True)
os.makedirs(os.path.join(pub, 'stills'), exist_ok=True)
os.makedirs(os.path.join(pub, 'grain'), exist_ok=True)
for c in CLIPS:
    fs = frames(c)
    # (the Edge is long; the cut uses it up to the fall)
    encode(c, fs[:1260] if c == 'edge' else fs)
edge = frames('edge')
encode('edge-stars', edge[82:179][::-1])
big(edge[864]).save(os.path.join(pub, 'stills', 'boom.png'))
rng = np.random.default_rng(5)
for k in range(8):
    g = np.clip(128 + rng.normal(0, 38, (H // 2, W // 2)), 0, 255).astype(np.uint8)
    Image.fromarray(g, 'L').resize((W, H), Image.BILINEAR).save(os.path.join(pub, 'grain', f'g{k}.png'))
print('done')
