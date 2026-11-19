"""The portfolio card's preview loop (brand/portfolio-card/ttd-preview.*), cut from real gameplay.

    node tools/trailer/capture.mjs dist-standalone tools/trailer/shots-card.mjs <foot>      # the footage
    python3 tools/trailer/card-loop.py <foot> <outDir>                                      # the loop

The forest shots are the game's own pixels (682 x 384, see `pix` in capture.mjs): the edit crops a 320 x 180 window that
follows the Blob and scales it up exactly 3x with nearest neighbour, so the pixel art stays sharp at 960 x 540. The 3D shots
(1280 x 720) are scaled down. It writes ttd-preview.mp4 (H.264), ttd-preview.webm (VP9), ttd-poster.jpg and segments.json
(where each shot starts, for the card's label).
Needs Python 3 with numpy and Pillow, and ffmpeg.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

FPS = 30
W, H = 960, 540
CW, CH = 320, 180  # the crop in the forest's own pixels (x3 = W x H)

# shot folder, first frame (1-based), frames, label (dim, name), how the camera frames it:
#   ('blob', lean)   a 320 x 180 window on the Blob, `lean` forest pixels above it (towards what it is fighting)
#   ('arena', lean)  the same, held on the arena's middle across
#   ('fixed', x, y, w)  a still window of w forest pixels across (16:9) centred on (x, y) in the forest's own pixels; the
#                    screen frames (once the world tears open) are cropped to the same place
#   ('zoom', z)      the screen, z times closer, held to its top edge and middle (the 3D shots: the boss stays whole)
#   None             the whole screen
# A shot that crosses from the forest's pixels to the screen (the tear) gets a flash, and its label turns to `tear`.
CUT = [
    ('c-run-meadow', 30, 52, ('2D', 'the forest'), ('blob', 8)),
    ('c-fight-gloom', 140, 78, ('2D', 'Gloommother'), ('arena', 34)),
    ('c-fight-thicket', 96, 72, ('2D', 'Thornback King'), ('arena', 70)),
    ('c-edge', 806, 92, ('2D', 'X, in the sky'), ('fixed', 300, 214, 480)),
    ('c-3d-x', 40, 84, ('3D', 'X, the Hollow'), ('zoom', 1.12)),
    ('c-3d-collector-b', 28, 72, ('3D', 'the Collector'), ('zoom', 1.12)),
]
TEAR = ('3D', 'the world tears open')
FLASH = 3  # white frames where the forest gives way to 3D


def frames_of(d):
    return sorted(f for f in os.listdir(d) if f[:5].isdigit() and (f.endswith('.png') or f.endswith('.jpg')))


def blob_at(a):
    """where the Blob is in a forest frame (its warm yellow), or None"""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    m = (r > 215) & (g > 170) & (b < 175) & (r - b > 70)
    ys, xs = np.nonzero(m)
    if len(xs) < 4:
        return None
    return float(np.median(xs)), float(np.median(ys))


def smooth(pts, k=9):
    """fill the gaps and take the jitter out of a track"""
    last = None
    filled = []
    for p in pts:
        last = p if p is not None else last
        filled.append(last)
    first = next((p for p in filled if p is not None), (341.0, 192.0))
    filled = [p if p is not None else first for p in filled]
    arr = np.array(filled, dtype=float)
    out = arr.copy()
    for i in range(len(arr)):
        lo, hi = max(0, i - k), min(len(arr), i + k + 1)
        out[i] = arr[lo:hi].mean(axis=0)
    return out


def forest(img, cx, cy):
    """a 320 x 180 window of the forest at (cx, cy), scaled up 3x"""
    w, h = img.size
    x0 = int(round(min(max(cx - CW / 2, 0), w - CW)))
    y0 = int(round(min(max(cy - CH / 2, 0), h - CH)))
    return img.crop((x0, y0, x0 + CW, y0 + CH)).resize((W, H), Image.NEAREST)


def screen(img):
    return img.resize((W, H), Image.LANCZOS)


def zoom(img, z):
    w, h = img.size
    cw, ch = w / z, h / z
    x0 = (w - cw) / 2
    return img.crop((round(x0), 0, round(x0 + cw), round(ch))).resize((W, H), Image.LANCZOS)


def fixed(img, flat, x, y, w):
    """a still 16:9 window w forest pixels across, centred on (x, y) in forest pixels, from either kind of frame"""
    k = 1.0 if flat else img.size[0] / 682
    cw, ch = w * k, w * 9 / 16 * k
    box = (round(x * k - cw / 2), round(y * k - ch / 2), round(x * k + cw / 2), round(y * k + ch / 2))
    return img.crop(box).resize((W, H), Image.NEAREST if flat else Image.LANCZOS)


def main(foot, out):
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
    for shot, start, count, (dim, name), follow in CUT:
        d = os.path.join(foot, shot)
        fs = frames_of(d)
        pick = fs[start - 1:start - 1 + count]
        imgs = [Image.open(os.path.join(d, f)).convert('RGB') for f in pick]
        flat = [f.endswith('.png') for f in pick]
        track = smooth([blob_at(np.asarray(im)) if fl and follow and follow[0] != 'fixed' else None for im, fl in zip(imgs, flat)])
        segments.append({'t': round(n / FPS, 2), 'dim': dim, 'name': name})
        cut_in = dim == '3D' and prev_dim == '2D'  # the cut into the 3D fights flashes too
        prev_dim = dim
        for i, (im, fl) in enumerate(zip(imgs, flat)):
            if follow and follow[0] == 'fixed':
                frame = fixed(im, fl, *follow[1:])
            elif follow and follow[0] == 'zoom':
                frame = zoom(im, follow[1])
            elif follow and fl and follow[0] in ('blob', 'arena'):
                bx, by = track[i]
                how, lean = follow
                frame = forest(im, im.size[0] / 2 if how == 'arena' else bx, by - lean)
            else:
                frame = screen(im)
            # a flash where the flat world gives way to 3D, and the label says so
            if (prev_flat is True and not fl) or (cut_in and i == 0):
                if dim == '2D':
                    segments.append({'t': round(n / FPS, 2), 'dim': TEAR[0], 'name': TEAR[1]})
                for k in range(FLASH):
                    a = 1 - k / FLASH
                    enc.stdin.write(np.asarray(Image.blend(frame, Image.new('RGB', (W, H), (236, 255, 250)), a * 0.85)).tobytes())
                    n += 1
            prev_flat = fl
            enc.stdin.write(np.asarray(frame).tobytes())
            if shot == 'c-edge' and i == 70:
                poster = frame
            n += 1
    enc.stdin.close()
    enc.wait()
    print(f'{n} frames, {n / FPS:.2f} s')
    with open(os.path.join(out, 'segments.json'), 'w') as f:
        json.dump(segments, f, indent=1)
    if poster is not None:
        poster.save(os.path.join(out, 'ttd-poster.jpg'), quality=86, optimize=True, progressive=True)
    # the two files the card plays: small, start fast, no sound
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '27',
                    '-preset', 'veryslow', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', os.path.join(out, 'ttd-preview.mp4')], check=True)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38',
                    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', os.path.join(out, 'ttd-preview.webm')], check=True)
    os.remove(tmp)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
