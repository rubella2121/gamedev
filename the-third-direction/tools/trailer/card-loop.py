"""The portfolio card's preview loop (brand/portfolio-card/ttd-preview.*), cut from real gameplay: every boss, about 13 s.

    node tools/trailer/capture.mjs dist-standalone tools/trailer/shots-card.mjs <foot>      # the footage (shots-card.mjs)
    python3 tools/trailer/card-loop.py <foot> <outDir> [--sheets]                           # the loop

The footage is 60 frames a second with the game running 1.3 times as fast as it plays. The forest shots are the game's own
pixels (682 x 384, see `pix` in capture.mjs). A guardian's arena is a tall column (it was made for phones): the boss at the top,
the Blob fighting from below. So the edit takes a 16:9 window most of the arena's height, centred between the boss and the
Blob, scaled up 3x with nearest neighbour (sharp pixels, a window that glides a third of a forest pixel at a time) and then
down to 960 x 540.
The 3D shots (1280 x 720) are scaled down, a little closer and held to the top so the boss stays whole.

For each shot the edit takes the stretch with the most going on in it (movement between frames, flashes of light), unless the
cut names a first frame. It writes ttd-preview.mp4 (H.264), ttd-preview.webm (VP9), ttd-poster.jpg and segments.json (where
each shot starts, for the card's label); with --sheets it also draws a contact sheet of every shot it took, to check by eye.
Needs Python 3 with numpy and Pillow, and ffmpeg.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

FPS = 60
W, H = 960, 540
UP = 3  # forest pixels to video pixels
FW, FH = 682, 384  # the forest's own size in the wide view
AH = 300  # the height of the window on a guardian's arena, in forest pixels (16:9: 533 across)

# shot folder, first frame (1-based; None: the busiest stretch), frames, label (dim, name), framing:
#   ('arena', boss)  the arena's middle across; up and down, halfway between the Blob and the boss (`boss`: how far down the
#                    frame the boss's middle is, in forest pixels)
#   ('fixed', x, y, w)  a still window w forest pixels across (16:9) centred on (x, y) in forest pixels; screen frames (once
#                    the world tears open) are cropped to the same place
#   ('zoom', z)      the screen, z times closer, held to its top edge and middle
# A shot that crosses from the forest's pixels to the screen (the tear) flashes there and its label turns to TEAR; the cut into
# the 3D fights flashes too.
CUT = [
    ('c-fight-gloom', None, 84, ('2D', 'Gloommother'), ('arena', 50)),
    ('c-fight-thicket', None, 84, ('2D', 'Thornback King'), ('arena', 85)),
    ('c-fight-marsh', None, 84, ('2D', 'Toll Queen'), ('arena', 85)),
    ('c-fight-bones', 150, 84, ('2D', 'Bone Wyrm'), ('arena', 150)),  # it is underground most of the time: where it comes up
    ('c-fight-meadow', None, 84, ('2D', 'Mimic Queen'), ('arena', 60)),
    ('c-edge', 26, 96, ('2D', 'X, in the sky'), ('fixed', 300, 214, 480)),
    ('c-3d-x', None, 96, ('3D', 'X, the Hollow'), ('zoom', 1.12)),
    ('c-3d-collector', None, 96, ('3D', 'the Collector'), ('zoom', 1.12)),
    ('c-3d-mash', None, 96, ('3D', 'the Mash'), ('zoom', 1.12)),
]
TEAR = ('3D', 'the world tears open')
FLASH = 4  # frames of white where the flat world gives way to 3D
SKIP = 24  # frames at the start of a shot the busiest-stretch search leaves alone (the bot is still finding its feet)


def frames_of(d):
    return sorted(f for f in os.listdir(d) if f[:5].isdigit() and (f.endswith('.png') or f.endswith('.jpg')))


def patches(m):
    """the connected patches of a mask, as lists of (y, x)"""
    seen = np.zeros(m.shape, bool)
    out = []
    for y0, x0 in zip(*np.nonzero(m)):
        if seen[y0, x0]:
            continue
        stack, patch = [(y0, x0)], []
        seen[y0, x0] = True
        while stack:
            y, x = stack.pop()
            patch.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    stack.append((yy, xx))
        out.append(patch)
    return out


def blob_at(a, near=None):
    """where the Blob is in a forest frame: a Blob-sized patch of its warm yellow (a golden bell is far bigger), the one
    nearest where it was; or None"""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    m = (r > 215) & (g > 170) & (b < 175) & (r - b > 70)
    best = None
    for p in patches(m):
        if not 6 <= len(p) <= 110:
            continue
        ys, xs = zip(*p)
        c = (float(np.mean(xs)), float(np.mean(ys)))
        if best is None or (near is not None and (c[0] - near[0]) ** 2 + (c[1] - near[1]) ** 2 < (best[0] - near[0]) ** 2 + (best[1] - near[1]) ** 2) or (near is None and len(p) > best[2]):
            best = (c[0], c[1], len(p))
    return None if best is None else (best[0], best[1])


def smooth(pts, k):
    """fill the gaps and take the jitter out of a track (a centred moving average, k frames each side)"""
    last = None
    filled = []
    for p in pts:
        last = p if p is not None else last
        filled.append(last)
    first = next((p for p in filled if p is not None), (FW / 2, FH / 2))
    filled = [p if p is not None else first for p in filled]
    arr = np.array(filled, dtype=float)
    out = arr.copy()
    for i in range(len(arr)):
        lo, hi = max(0, i - k), min(len(arr), i + k + 1)
        out[i] = arr[lo:hi].mean(axis=0)
    return out


def forest(img, cx, cy, h=AH):
    """a 16:9 window h forest pixels high, centred on (cx, cy): scaled up 3x with nearest neighbour, cut to a third of a
    forest pixel, then scaled to the video's size"""
    big = img.resize((img.size[0] * UP, img.size[1] * UP), Image.NEAREST)
    bh = h * UP
    bw = bh * 16 / 9
    x0 = int(round(min(max(cx * UP - bw / 2, 0), big.size[0] - bw)))
    y0 = int(round(min(max(cy * UP - bh / 2, 0), big.size[1] - bh)))
    return big.crop((x0, y0, x0 + int(round(bw)), y0 + int(bh))).resize((W, H), Image.LANCZOS)


def zoom(img, z):
    w, h = img.size
    cw, ch = w / z, h / z
    x0 = (w - cw) / 2
    return img.crop((round(x0), 0, round(x0 + cw), round(ch))).resize((W, H), Image.LANCZOS)


def fixed(img, flat, x, y, w):
    """a still 16:9 window w forest pixels across, centred on (x, y) in forest pixels, from either kind of frame"""
    k = 1.0 if flat else img.size[0] / FW
    cw, ch = w * k, w * 9 / 16 * k
    box = (round(x * k - cw / 2), round(y * k - ch / 2), round(x * k + cw / 2), round(y * k + ch / 2))
    return img.crop(box).resize((W, H), Image.NEAREST if flat else Image.LANCZOS)


def framed(shot_dir, names, framing):
    """the shot's frames, framed for the video"""
    imgs = [Image.open(os.path.join(shot_dir, f)).convert('RGB') for f in names]
    flat = [f.endswith('.png') for f in names]
    how = framing[0]
    out = []
    if how == 'arena':
        raw, near = [], None
        for im in imgs:
            p = blob_at(np.asarray(im), near)
            raw.append(p)
            near = p or near
        track = smooth(raw, 20)
        boss = framing[1]
        for im, fl, (bx, by) in zip(imgs, flat, track):
            cy = min(max((boss + by) / 2, AH / 2), FH - AH / 2)
            out.append(forest(im, im.size[0] / 2, cy) if fl else im.resize((W, H), Image.LANCZOS))
        return out, flat, [(boss, p) for p in raw]
    elif how == 'fixed':
        out = [fixed(im, fl, *framing[1:]) for im, fl in zip(imgs, flat)]
    else:
        out = [zoom(im, framing[1]) for im in imgs]
    return out, flat, None


def busiest(frames, count, both=None):
    """the first index of the `count` frames with the most going on: movement between frames, flashes of light, and (in a
    guardian's arena) the Blob close enough to the boss for the window to hold them both"""
    small = [np.asarray(f.resize((160, 90), Image.BILINEAR).convert('L'), dtype=float) for f in frames]
    score = [0.0]
    for a, b in zip(small, small[1:]):
        move = np.abs(b - a).mean()
        flash = (b > 225).mean() * 40
        score.append(move + flash)
    score = np.array(score)
    if both:
        score = score + np.array([3.0 if p and abs(p[1] - boss) < AH - 40 else 0.0 for boss, p in both])
    best, at = -1.0, SKIP
    for s in range(SKIP, max(SKIP + 1, len(frames) - count + 1)):
        v = score[s:s + count].sum()
        if v > best:
            best, at = v, s
    return at


def sheet(frames, path, label):
    """a strip of 8 frames from a shot, to check it by eye"""
    pick = [frames[int(i * (len(frames) - 1) / 7)] for i in range(8)]
    w, h = 240, 135
    out = Image.new('RGB', (w * 8, h + 18), (10, 12, 18))
    d = ImageDraw.Draw(out)
    d.text((4, 3), label, fill=(230, 230, 230))
    for i, f in enumerate(pick):
        out.paste(f.resize((w, h)), (i * w, 18))
    out.save(path, quality=82)


def main(foot, out, sheets=False):
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, 'loop-master.mkv')
    enc = subprocess.Popen(
        ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
         '-c:v', 'libx264', '-crf', '8', '-preset', 'fast', '-pix_fmt', 'yuv444p', tmp],
        stdin=subprocess.PIPE)
    segments = []
    n = 0
    poster = None
    prev_flat = None
    prev_dim = None
    white = Image.new('RGB', (W, H), (236, 255, 250))
    for shot, start, count, (dim, name), framing in CUT:
        d = os.path.join(foot, shot)
        names = frames_of(d)
        if start is None:
            allf, _, both = framed(d, names, framing)
            start = busiest(allf, count, both) + 1
        pick = names[start - 1:start - 1 + count]
        frames, flat, _ = framed(d, pick, framing)
        print(f'{shot}: frames {start}-{start + len(pick) - 1} of {len(names)}')
        if sheets:
            sheet(frames, os.path.join(out, f'sheet-{shot}.jpg'), f'{shot} {start}-{start + len(pick) - 1}  {dim} {name}')
        segments.append({'t': round(n / FPS, 2), 'dim': dim, 'name': name})
        cut_in = dim == '3D' and prev_dim == '2D'
        prev_dim = dim
        for i, (frame, fl) in enumerate(zip(frames, flat)):
            if (prev_flat is True and not fl) or (cut_in and i == 0):
                if dim == '2D':
                    segments.append({'t': round(n / FPS, 2), 'dim': TEAR[0], 'name': TEAR[1]})
                for k in range(FLASH):
                    enc.stdin.write(np.asarray(Image.blend(frame, white, (1 - k / FLASH) * 0.85)).tobytes())
                    n += 1
            prev_flat = fl
            enc.stdin.write(np.asarray(frame).tobytes())
            if shot == 'c-edge' and not fl and poster is None and i >= 70:
                poster = frame
            n += 1
    enc.stdin.close()
    enc.wait()
    print(f'{n} frames, {n / FPS:.2f} s')
    with open(os.path.join(out, 'segments.json'), 'w') as f:
        json.dump(segments, f, indent=1)
    if poster is not None:
        poster.save(os.path.join(out, 'ttd-poster.jpg'), quality=86, optimize=True, progressive=True)
    # the two files the card plays: small, quick to start, no sound
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '27',
                    '-preset', 'veryslow', '-tune', 'animation', '-g', '120', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                    os.path.join(out, 'ttd-preview.mp4')], check=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40',
                    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-g', '120', '-pix_fmt', 'yuv420p',
                    os.path.join(out, 'ttd-preview.webm')], check=True)
    os.remove(tmp)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], '--sheets' in sys.argv[3:])
