"""The trailer's picture: the captured footage cut to timeline.py, graded, with the transitions, the words and the title drawn on top,
then piped to ffmpeg with the mix.

    python3 tools/trailer/edit.py footDir mix.wav out.mp4              the whole trailer, 1080x1920
    python3 tools/trailer/edit.py footDir mix.wav out.mp4 --scale 0.5 --from 40 --to 60      a quick look at a part
    python3 tools/trailer/edit.py footDir - stills/ --still 20.1 45.9  single frames as PNG

footDir holds one folder of numbered JPEGs per shot (capture.mjs writes them).
"""
import argparse
import json
import math
import os
import subprocess
import sys
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from timeline import CUE, CUTS, FPS, FX, H, LENGTH, TEXT, TT, W  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument('foot')
ap.add_argument('mix')
ap.add_argument('out')
ap.add_argument('--scale', type=float, default=1.0)
ap.add_argument('--from', dest='t0', type=float, default=0.0)
ap.add_argument('--to', dest='t1', type=float, default=LENGTH)
ap.add_argument('--still', type=float, nargs='*')
ap.add_argument('--jobs', type=int, default=os.cpu_count())
ap.add_argument('--crf', type=int, default=18)
A = ap.parse_args()

SC = A.scale
OW, OH = round(W * SC) // 2 * 2, round(H * SC) // 2 * 2
RNG = np.random.default_rng(7)

INTER = '/usr/share/fonts/opentype/inter/'
BLACK, XBOLD, LIGHT, THIN = (INTER + f'InterDisplay-{w}.otf' for w in ('Black', 'ExtraBold', 'Light', 'Thin'))
MONO = '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf'
SERIF = '/usr/share/fonts/truetype/crosextra/Caladea-Italic.ttf'


def hexc(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def lerp(a, b, u):
    return a + (b - a) * u


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_io(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def env(t, t0, t1, fin, fout):
    """1 inside [t0, t1], easing in over fin and out over fout."""
    return smooth((t - t0) / fin) * smooth((t1 - t) / fout) if t0 <= t <= t1 else 0.0


# ================================================================ footage

@lru_cache(maxsize=None)
def count(clip):
    return len([f for f in os.listdir(f'{A.foot}/{clip}') if f.endswith('.jpg')])


@lru_cache(maxsize=48)
def src(clip, i):
    i = int(clamp(i, 0, count(clip) - 1))
    im = Image.open(f'{A.foot}/{clip}/{i + 1:05d}.jpg').convert('RGB')
    if im.width < 400:
        # the forest is pixel art: blow it up in whole pixels so it stays crisp
        im = im.resize((im.width * 5, im.height * 5), Image.NEAREST)
    return im


FX_AT = {round(t, 2): k for t, k in FX}
LIFT = [int(min(255, 255 * (v / 255) ** 0.86 * 1.12)) for v in range(256)] * 3
# a cut that lands on a flash eases in from slow motion: the hit hangs for a moment
SLOW_LO, SLOW_R = 0.3, 0.55


def clip_pos(cut, t):
    start, first, speed = cut[0], cut[3], cut[4]
    u = t - start
    if FX_AT.get(round(start, 2)) == 'flash' and u > 0:
        x = min(u, SLOW_R)
        a = x / SLOW_R
        u = u - (1 - SLOW_LO) * (x - SLOW_R * (a ** 3 - a ** 4 / 2))
    return first + u * FPS * speed


def footage(ci, t):
    cut = CUTS[ci]
    start, end, clip = cut[:3]
    f = clip_pos(cut, t)
    i = math.floor(f)
    k = f - i
    im = src(clip, i)
    flat = im.width >= 1000  # the forest, blown up from 216 wide
    if 0.08 < k < 0.92:
        nx = src(clip, i + 1)
        # (the edge clip turns from the 2D forest into 3D: no blending across that)
        if nx.size == im.size:
            im = Image.blend(im, nx, k)
    # a slow push in, drifting one way or the other (or the cut's own framing); a flash cut punches in and settles
    u = (t - start) / (end - start)
    fr = cut[6] if len(cut) > 6 else None
    z = lerp(*fr['z'], ease_io(u)) if fr else 1.0 + 0.05 * ease_io(u)
    if FX_AT.get(round(start, 2)) == 'flash':
        z += 0.12 * math.exp(-max(0.0, t - start) / 0.16)
    side = 1 if ci % 2 else -1
    fx0, fy0 = fr['c'] if fr else (0.5, 0.5)
    cx = fx0 + side * 0.012 * (u - 0.5)
    cy = fy0 - 0.008 * (u - 0.5)
    sw, sh = im.size
    bw, bh = sw / z, sh / z
    x0 = clamp(cx * sw - bw / 2, 0, sw - bw)
    y0 = clamp(cy * sh - bh / 2, 0, sh - bh)
    out = im.resize((OW, OH), Image.BICUBIC, box=(x0, y0, x0 + bw, y0 + bh))
    if FX_AT.get(round(start, 2)) == 'flash' and t - start < 0.22:
        out = zoom_blur(out, 1 - (t - start) / 0.22)
    # the forest is drawn darker than the 3D; lift it so the two cut together
    return out.point(LIFT) if flat else out


def zoom_blur(im, s):
    """a radial streak out of the centre, as if the shot rushed at you"""
    acc = np.asarray(im, np.float32)
    n = 5
    for k in range(1, n):
        z = 1 + 0.06 * s * k
        bw, bh = OW / z, OH / z
        acc += np.asarray(im.resize((OW, OH), Image.BILINEAR, box=((OW - bw) / 2, (OH - bh) / 2, (OW + bw) / 2, (OH + bh) / 2)), np.float32)
    return Image.fromarray((acc / n).astype(np.uint8))


def contiguous(a, b):
    return abs(CUTS[a][1] - CUTS[b][0]) < 1e-6


XF = 0.36  # a dissolve at a seam the timeline gives no transition of its own


def shot(t):
    """the footage at t, before the grade, as a PIL image, and how far it is faded up (0 = black)"""
    ci = next((i for i, c in enumerate(CUTS) if c[0] <= t < c[1]), None)
    if ci is None:
        return None, 0.0
    start, end = CUTS[ci][:2]
    im = footage(ci, t)
    nxt = ci + 1 if ci + 1 < len(CUTS) and contiguous(ci, ci + 1) else None
    prv = ci - 1 if ci > 0 and contiguous(ci - 1, ci) else None
    if nxt is not None and round(end, 2) not in FX_AT and t > end - XF / 2:
        im = Image.blend(im, footage(nxt, t), smooth((t - (end - XF / 2)) / XF))
    if prv is not None and round(start, 2) not in FX_AT and t < start + XF / 2:
        im = Image.blend(footage(prv, t), im, smooth((t - (start - XF / 2)) / XF))
    up = 1.0
    if prv is None and round(start, 2) not in FX_AT:
        up *= smooth((t - start) / 0.9)
    if nxt is None:
        up *= smooth((end - t) / 0.55)
    return im, up


# ================================================================ the grade

def _lut():
    x = np.linspace(0, 1, 256)
    c = 0.62 * x * x * (3 - 2 * x) + 0.38 * x  # an S, gently
    lo, hi = (1 - c) ** 2, c ** 2
    r = c - 0.035 * lo + 0.045 * hi
    g = c + 0.012 * lo + 0.008 * hi
    b = c + 0.06 * lo - 0.04 * hi
    out = []
    for ch in (r, g, b):
        out += list(np.clip(0.012 + ch * 0.985, 0, 1) * 255)
    return [int(v) for v in out]


LUT = _lut()
yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
_r = np.sqrt(((xx - OW / 2) / (OW * 0.62)) ** 2 + ((yy - OH / 2) / (OH * 0.62)) ** 2)
VIGNETTE = np.clip(1 - 0.42 * _r ** 2.4, 0.25, 1)[..., None].astype(np.float32)
del yy, xx, _r
GRAIN = [RNG.normal(0, 1, (OH, OW)).astype(np.float16) for _ in range(5)]


def grain(img, fi):
    g = np.roll(GRAIN[fi % 5], (fi * 131) % OH, axis=0).astype(np.float32)
    lum = img.mean(2, keepdims=True)
    return img + g[..., None] * (0.012 + 0.024 * lum * (1 - lum))


# drifting dust in the light: (x, y, speed, size, phase)
DUST = RNG.random((46, 5)).astype(np.float32)


@lru_cache(maxsize=8)
def dot(r):
    s = int(r * 4) | 1
    y, x = np.mgrid[0:s, 0:s] - s // 2
    return np.exp(-(x * x + y * y) / (2 * r * r)).astype(np.float32)


def add_sprite(img, spr, x, y, col, k):
    h, w = spr.shape
    x0, y0 = int(x - w / 2), int(y - h / 2)
    xa, ya, xb, yb = max(0, x0), max(0, y0), min(OW, x0 + w), min(OH, y0 + h)
    if xa >= xb or ya >= yb:
        return
    img[ya:yb, xa:xb] += spr[ya - y0:yb - y0, xa - x0:xb - x0, None] * (col * k)


def dust(img, t, k=1.0):
    col = np.array([1.0, 0.92, 0.75], np.float32)
    for x, y, sp, sz, ph in DUST:
        yy = ((y - t * (0.012 + 0.02 * sp)) % 1.0) * OH
        xx = (x + 0.02 * math.sin(t * 0.7 + ph * 6.28)) * OW
        tw = 0.5 + 0.5 * math.sin(t * (1.5 + sp * 2) + ph * 6.28)
        add_sprite(img, dot(max(1.0, (1.2 + sz * 3.2) * SC)), xx, yy, col, 0.10 * tw * k)


LEAKS = [(CUE['lock'] - 0.1, 2.6), (CUE['family'] + 3.5, 3.4), (TT - 0.2, 2.2), (CUE['playNow'] - 0.6, 2.6)]
_ly, _lx = np.mgrid[0:48, 0:27].astype(np.float32) / np.array([48, 27], np.float32)[:, None, None]


def leak(img, t):
    for t0, d in LEAKS:
        u = (t - t0) / d
        if not 0 <= u <= 1:
            continue
        k = math.sin(math.pi * u) ** 2
        cx, cy = -0.2 + 1.4 * u, 0.25 + 0.35 * u
        a = np.exp(-(((_lx - cx) / 0.45) ** 2 + ((_ly - cy) / 0.32) ** 2))
        b = np.exp(-(((_lx - cx + 0.35) / 0.3) ** 2 + ((_ly - cy - 0.2) / 0.25) ** 2))
        small = np.stack([a * 1.0 + b * 0.7, a * 0.6 + b * 0.25, a * 0.25 + b * 0.45], -1) * k * 0.42
        lay = np.asarray(Image.fromarray((np.clip(small, 0, 1) * 255).astype(np.uint8)).resize((OW, OH), Image.BICUBIC), np.float32) / 255
        img[:] = 1 - (1 - img) * (1 - lay)


# ================================================================ transitions

def fx(img, t, fi):
    for ft, kind in FX:
        d = t - ft
        if kind == 'flash' and -0.07 < d < 0.45:
            f = 0.35 * smooth((d + 0.07) / 0.07) if d < 0 else math.exp(-d / 0.08)
            img += f * 0.95
        elif kind == 'whip' and abs(d) < 0.15:
            s = 1 - abs(d) / 0.15
            L = s * 0.11 * OW
            acc = np.zeros_like(img)
            for k in range(-3, 4):
                acc += np.roll(img, int(L * k / 3 + (-1 if d < 0 else 1) * s * 0.05 * OW), axis=1)
            img[:] = acc / 7
        elif kind == 'glitch' and -0.12 < d < 0.2:
            s = 1 - (abs(d) / (0.12 if d < 0 else 0.2))
            r = np.random.default_rng(fi * 7919 + int(ft * 100))
            sh = int(s * 0.022 * OW) + 1
            img[..., 0] = np.roll(img[..., 0], sh, axis=1)
            img[..., 2] = np.roll(img[..., 2], -sh, axis=1)
            for _ in range(int(3 + 7 * s)):
                y0 = int(r.random() * OH)
                h = int((0.01 + 0.06 * r.random()) * OH)
                img[y0:y0 + h] = np.roll(img[y0:y0 + h], int((r.random() - 0.5) * 0.18 * OW * s), axis=1)
                if r.random() < 0.25:
                    img[y0:y0 + h] = img[y0:y0 + h, :, ::-1] * 1.25
            img[::max(2, int(4 * SC))] *= 1 - 0.35 * s


# ================================================================ words

@lru_cache(maxsize=None)
def font(path, size):
    return ImageFont.truetype(path, max(6, round(size * SC)))


def text_mask(text, fnt, track=0.0):
    """white-on-black text, each line centred, letters spaced by track (a fraction of the size); with room round it for a glow"""
    lines = text.split('\n')
    sp = fnt.size * track
    widths = [sum(fnt.getlength(ch) for ch in ln) + sp * max(0, len(ln) - 1) for ln in lines]
    lh = fnt.size * 1.08
    pad = int(fnt.size * 0.7)
    w, h = int(max(widths)) + 2 * pad, int(lh * len(lines)) + 2 * pad
    im = Image.new('L', (w, h))
    d = ImageDraw.Draw(im)
    for n, (ln, lw) in enumerate(zip(lines, widths)):
        x = pad + (max(widths) - lw) / 2
        for ch in ln:
            d.text((x, pad + n * lh), ch, font=fnt, fill=255)
            x += fnt.getlength(ch) + sp
    return im


@lru_cache(maxsize=64)
def sprite(text, path, size, track, glow):
    m = text_mask(text, font(path, size), track)
    g = m.filter(ImageFilter.GaussianBlur(glow * SC)) if glow else None
    return m, g


def fit(text, path, size, track, width):
    while size > 20 and text_mask(max(text.split('\n'), key=len), font(path, size), track).width > width * OW + font(path, size).size * 1.4:
        size -= 4
    return size


def put(img, mask, cx, cy, col, alpha=1.0, scale=1.0, add=False):
    """lay a mask (PIL L) on img centred at (cx, cy): over it in col, or added as light"""
    if alpha <= 0.003:
        return
    if abs(scale - 1) > 1e-3:
        mask = mask.resize((max(1, round(mask.width * scale)), max(1, round(mask.height * scale))), Image.BILINEAR)
    m = np.asarray(mask, np.float32) / 255
    h, w = m.shape
    x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
    xa, ya, xb, yb = max(0, x0), max(0, y0), min(OW, x0 + w), min(OH, y0 + h)
    if xa >= xb or ya >= yb:
        return
    a = m[ya - y0:yb - y0, xa - x0:xb - x0, None] * alpha
    reg = img[ya:yb, xa:xb]
    if add:
        reg += a * col
    else:
        reg[:] = reg * (1 - a) + a * col


def bar(img, cx, cy, w, h, col, alpha=1.0):
    xa, xb = int(max(0, cx - w / 2)), int(min(OW, cx + w / 2))
    ya, yb = int(max(0, cy - h / 2)), int(min(OH, cy + h / 2 + 1))
    if xa < xb and ya < yb and alpha > 0:
        img[ya:yb, xa:xb] = img[ya:yb, xa:xb] * (1 - alpha) + col * alpha


SUB = {'GLOOMMOTHER': 'GUARDIAN  I', 'THORNBACK KING': 'GUARDIAN  II', 'TOLL QUEEN': 'GUARDIAN  III', 'BONE WYRM': 'GUARDIAN  IV',
       'MIMIC QUEEN': 'GUARDIAN  V', 'X, THE HOLLOW': 'IT TOOK THEM', 'THE COLLECTOR': 'IT KEEPS THEM', 'THE MASH': 'IT IS ALL OF THEM'}
WHITE = np.array([1, 1, 1], np.float32)


def card(img, t, t0, t1, text, col):
    a = env(t, t0, t1, 0.6, 0.45)
    u = (t - t0) / (t1 - t0)
    m = text_mask(text, font(LIGHT, 58), 0.26 + 0.1 * u)
    g = m.filter(ImageFilter.GaussianBlur(14 * SC))
    put(img, g, OW / 2, OH / 2, col, a * 0.7, add=True)
    put(img, m, OW / 2, OH / 2, col, a)


def slam(img, t, t0, t1, text, col, fi):
    u = t - t0
    size = fit(text, BLACK, 128, 0.02, 0.86)
    m, g = sprite(text, BLACK, size, 0.02, 26)
    s = 1.55 - 0.55 * ease_out(u / 0.2) + 0.035 * u / (t1 - t0)
    out = smooth((t - (t1 - 0.25)) / 0.25)
    s += 0.1 * out
    a = smooth(u / 0.06) * (1 - out)
    y = OH * 0.79
    r = np.random.default_rng(fi)
    j = 16 * SC * math.exp(-max(0, u - 0.2) / 0.1) if u > 0.18 else 0
    dx, dy = (r.random() - 0.5) * 2 * j, (r.random() - 0.5) * 2 * j
    put(img, g, OW / 2 + dx, y + dy, col, a * (0.85 + 1.6 * math.exp(-u / 0.15)), s, add=True)
    put(img, m, OW / 2 + dx, y + dy, WHITE * 0.25 + col * 0.75, a, s)
    # a line drawn out under it, and what it is, typed above
    lw = (m.width - 1.2 * font(BLACK, size).size) * ease_out((u - 0.1) / 0.35)
    bar(img, OW / 2, y + m.height * 0.36, lw, max(2, 3 * SC), col, a * 0.9)
    sub = SUB.get(text)
    if sub:
        nch = int(clamp((u - 0.15) / 0.035, 0, len(sub)))
        sm = text_mask(sub[:nch] + ('_' if nch < len(sub) and fi % 4 < 2 else ''), font(MONO, 26), 0.32)
        put(img, sm, OW / 2, y - m.height * 0.42, col, a * 0.95)


def big(img, t, t0, t1, text, col):
    lines = text.split('\n')
    size = fit(text, XBOLD, 104, 0.04, 0.9)
    out = smooth((t - (t1 - 0.4)) / 0.4)
    lh = font(XBOLD, size).size * 1.15
    for n, ln in enumerate(lines):
        p = ease_out((t - t0 - n * 0.22) / 0.5)
        if p <= 0:
            continue
        m, g = sprite(ln, XBOLD, size, 0.04 + 0.03 * n, 22)
        # wiped up into view, line by line
        cut = Image.new('L', m.size)
        keep = int(m.height * p)
        cut.paste(m.crop((0, 0, m.width, keep)), (0, 0))
        cy = OH * 0.8 + (n - (len(lines) - 1) / 2) * lh + (1 - p) * 36 * SC - out * 20 * SC
        put(img, g, OW / 2, cy, col, (1 - out) * p * 1.1, add=True)
        put(img, cut, OW / 2, cy, WHITE * 0.3 + col * 0.7, 1 - out)


def world(img, t, t0, t1, text, col):
    a = env(t, t0, t1, 0.9, 0.5)
    p = smooth((t - t0) / 1.1)
    m, g = sprite(text, SERIF, 78, 0.02, 10)
    soft = m.filter(ImageFilter.GaussianBlur(6 * SC * (1 - p) + 0.1))
    y = OH * 0.7
    put(img, g, OW / 2, y, col, a * 0.6, add=True)
    put(img, soft, OW / 2, y, col, a * (1 - p))
    put(img, m, OW / 2, y, col, a * p)


def hero(img, t, t0, t1, text, col):
    """the one you play: a name, a line drawn under it, and what it is, in italics"""
    name, what = text.split('\n')
    a = env(t, t0, t1, 0.5, 0.5)
    p = ease_out((t - t0) / 0.8)
    m, g = sprite(name, XBOLD, 66, 0.34, 16)
    y = OH * 0.79 - (1 - p) * 22 * SC
    put(img, g, OW / 2, y, col, a * 0.8, add=True)
    put(img, m, OW / 2, y, WHITE * 0.45 + col * 0.55, a)
    bar(img, OW / 2, y + m.height * 0.3, m.width * 0.42 * ease_out((t - t0 - 0.2) / 0.6), max(1, 2 * SC), col, a * 0.8)
    sm, sg = sprite(what, SERIF, 46, 0.03, 8)
    a2 = a * smooth((t - t0 - 0.4) / 0.6)
    put(img, sg, OW / 2, y + m.height * 0.62, hexc('#9ff4ee'), a2 * 0.5, add=True)
    put(img, sm, OW / 2, y + m.height * 0.62, hexc('#e8fffb'), a2)


def label(img, t, ci, fi):
    start, end, text = CUTS[ci][0], CUTS[ci][1], CUTS[ci][5]
    idx = sum(1 for c in CUTS[:ci + 1] if c[5])
    full = f'{idx:02d}  {text}'
    nch = int(clamp((t - start - 0.04) / 0.03, 0, len(full)))
    a = smooth((end - t) / 0.12)
    m = text_mask(full[:nch] + ('_' if fi % 4 < 2 else ''), font(MONO, 40), 0.16)
    col = hexc('#e8fffb')
    x = 64 * SC + m.width / 2
    y = OH * 0.875
    put(img, m.filter(ImageFilter.GaussianBlur(8 * SC)), x, y, hexc('#7fe6ff'), a * 0.8, add=True)
    put(img, m, x, y, col, a)
    bar(img, 64 * SC + 210 * SC * ease_out((t - start) / 0.3) / 2, y - 38 * SC, 210 * SC * ease_out((t - start) / 0.3), max(2, 3 * SC), hexc('#7fe6ff'), a)


# ================================================================ the title: a line, a square, a cube; the name

GOLD = hexc('#ffd77a')
EDGES3 = [(a, b) for a in range(8) for b in range(a + 1, 8) if bin(a ^ b).count('1') == 1]
# when the title's parts come in, after the hit (TT): the name with the narrator, then what it asks of you, then play now
NAME_AT, SWEEP_AT, ASK_AT = TT + 2.0, TT + 3.25, TT + 3.5
FADE_AT = CUE['fadeOut'] - 0.6


def project(p, size, cx, cy, f=7.0):
    z = f / (f + p[:, 2])
    return np.stack([cx + p[:, 0] * z * size, cy - p[:, 1] * z * size], 1)


def rot(p, yaw, pitch):
    c, s = math.cos(yaw), math.sin(yaw)
    x, z = p[:, 0] * c + p[:, 2] * s, -p[:, 0] * s + p[:, 2] * c
    c, s = math.cos(pitch), math.sin(pitch)
    y, z = p[:, 1] * c - z * s, p[:, 1] * s + z * c
    return np.stack([x, y, z], 1)


def wire(pts, edges, width):
    m = Image.new('L', (OW, OH))
    d = ImageDraw.Draw(m)
    for a, b in edges:
        d.line([tuple(pts[a]), tuple(pts[b])], fill=255, width=width)
    r = width * 1.6
    for x, y in pts:
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)
    return m


def glow_of(m, r):
    small = m.resize((OW // 4, OH // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(r * SC / 4))
    return small.resize((OW, OH), Image.BILINEAR)


def title(img, t, fi):
    T = t - TT
    if T < -0.6 or t > FADE_AT + 0.62:
        return
    fade = 1 - smooth((t - FADE_AT) / 0.6)
    pn = CUE['playNow']
    # the cube: a line shot out on the hit, opened into a square, pulled out into the third direction
    sx = ease_out(T / 0.5)
    sy = ease_io((T - 0.45) / 0.55)
    sz = ease_io((T - 1.0) / 0.9)
    spin = max(0.0, T - 1.0)
    yaw = 0.55 * spin + 0.25 * ease_io(spin / 1.2)
    pitch = 0.42 * ease_io((T - 1.0) / 1.2)
    v = np.array([[(i & 1) * 2 - 1, (i >> 1 & 1) * 2 - 1, (i >> 2 & 1) * 2 - 1] for i in range(8)], np.float32)
    v *= np.array([sx, sy, sz], np.float32)
    bob = 0.03 * math.sin(T * 1.3)
    pts = project(rot(v, yaw, pitch), OW * 0.17, OW / 2, OH * (0.36 + bob))
    if T > 0 and fade > 0:
        m = wire(pts, EDGES3, max(2, round(4 * SC)))
        pulse = 1 + 0.6 * math.exp(-T / 0.3) + (0.4 * math.exp(-(t - pn) / 0.4) if t > pn else 0)
        put(img, glow_of(m, 26), OW / 2, OH / 2, GOLD, 1.5 * pulse * fade, add=True)
        put(img, m, OW / 2, OH / 2, GOLD * 0.6 + WHITE * 0.4, fade)
    # the name, letter by letter, out of the dark
    name = 'THE THIRD DIRECTION'
    size = fit(name, BLACK, 92, 0.1, 0.9)
    fnt = font(BLACK, size)
    sp = fnt.size * 0.1
    xs, x = [], 0.0
    for ch in name:
        xs.append(x + fnt.getlength(ch) / 2)
        x += fnt.getlength(ch) + sp
    x0 = OW / 2 - (x - sp) / 2
    ty = OH * 0.6
    sweep = (t - SWEEP_AT) / 0.9
    for i, ch in enumerate(name):
        if ch == ' ':
            continue
        u = t - (NAME_AT + i * 0.04)
        if u <= 0:
            continue
        m, g = sprite(ch, BLACK, size, 0, 18)
        s = 1 + 1.4 * (1 - ease_out(u / 0.4))
        a = smooth(u / 0.18) * fade
        cx = x0 + xs[i]
        shine = math.exp(-((cx / OW - (sweep * 1.4 - 0.2)) / 0.08) ** 2) if 0 < sweep < 1 else 0
        put(img, g, cx, ty, GOLD, a * (0.7 + 1.2 * math.exp(-u / 0.2) + 1.5 * shine), s, add=True)
        put(img, m, cx, ty, WHITE * (0.75 + 0.25 * shine) + GOLD * 0.25 * (1 - shine), a, s)
    bar(img, OW / 2, ty + fnt.size * 0.85, (x - sp) * 0.5 * ease_out((t - SWEEP_AT + 0.3) / 0.6), max(1, 2 * SC), GOLD, 0.8 * fade)
    # and what it asks of you
    if t > ASK_AT:
        a = smooth((t - ASK_AT) / 0.7) * fade
        m = text_mask("DON'T LOOK UP.", font(LIGHT, 40), 0.62 - 0.18 * ease_out((t - ASK_AT) / 1.6))
        put(img, m, OW / 2, ty + fnt.size * 1.7, hexc('#e8fffb'), a)
    if t > pn:
        a = smooth((t - pn) / 0.4) * fade
        m, g = sprite('PLAY NOW', MONO, 38, 0.3, 12)
        y = OH * 0.79
        w, h = m.width + 30 * SC, m.height * 0.9
        box = Image.new('L', (int(w + 40 * SC), int(h + 40 * SC)))
        ImageDraw.Draw(box).rounded_rectangle((20 * SC, 20 * SC, 20 * SC + w, 20 * SC + h), radius=h / 2, outline=255, width=max(1, round(3 * SC)))
        beat = 0.5 + 0.5 * math.cos((t - pn) * math.pi / 0.6)
        put(img, box.filter(ImageFilter.GaussianBlur(10 * SC)), OW / 2, y, GOLD, a * (0.8 + 0.8 * beat), add=True)
        put(img, box, OW / 2, y, GOLD, a)
        put(img, g, OW / 2, y, GOLD, a * 0.6, add=True)
        put(img, m, OW / 2, y, WHITE, a)


_ty, _tx = np.mgrid[0:OH // 8, 0:OW // 8].astype(np.float32)
TITLE_BG = np.exp(-(((_tx - OW / 16) / (OW / 8 * 0.5)) ** 2 + ((_ty - OH / 8 * 0.4) / (OH / 8 * 0.32)) ** 2))
TITLE_BG = np.asarray(Image.fromarray((TITLE_BG * 255).astype(np.uint8)).resize((OW, OH), Image.BICUBIC), np.float32)[..., None] / 255
TITLE_BG = TITLE_BG * np.array([0.05, 0.11, 0.12], np.float32)
del _ty, _tx


# ================================================================ a frame

def frame(fi):
    t = fi / FPS
    im, up = shot(t)
    if im is not None:
        img = np.asarray(im.point(LUT), np.float32) / 255 * up
    else:
        img = np.zeros((OH, OW, 3), np.float32)
    if TT - 0.6 < t < FADE_AT + 0.8:
        img += TITLE_BG * smooth((t - TT + 0.5) / 1.2) * (1 - smooth((t - FADE_AT) / 0.7))
    # after the end: the light over the three of them goes out
    if CUE['sting'] <= t < CUE['stingOut']:
        img *= 1 - 0.88 * smooth((t - (CUE['stingOut'] - 1.15)) / 1.0)
    fx(img, t, fi)
    leak(img, t)
    dust(img, t, 1.0 if im is not None else (0.6 if TT - 0.5 < t < FADE_AT + 0.5 else 0.25))
    img *= VIGNETTE
    title(img, t, fi)
    for t0, t1, kind, text, col in TEXT:
        if not t0 <= t <= t1:
            continue
        c = hexc(col)
        if kind == 'card':
            card(img, t, t0, t1, text, c)
        elif kind == 'slam':
            slam(img, t, t0, t1, text, c, fi)
        elif kind == 'big':
            big(img, t, t0, t1, text, c)
        elif kind == 'world':
            world(img, t, t0, t1, text, c)
        elif kind == 'hero':
            hero(img, t, t0, t1, text, c)
    ci = next((i for i, c in enumerate(CUTS) if c[0] <= t < c[1] and c[5]), None)
    if ci is not None:
        label(img, t, ci, fi)
    img = grain(img, fi)
    return (np.clip(img, 0, 1) * 255).astype(np.uint8).tobytes()


def loudness(path):
    """measure the mix (the first pass of ffmpeg's loudnorm) so the second pass can be linear"""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True)
    j = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    return (f"loudnorm=I=-14:TP=-1.0:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
            f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")


def main():
    if A.still:
        os.makedirs(A.out, exist_ok=True)
        for t in A.still:
            Image.frombytes('RGB', (OW, OH), frame(round(t * FPS))).save(f'{A.out}/t{t:06.2f}.png')
        return
    f0, f1 = round(A.t0 * FPS), round(A.t1 * FPS)
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-']
    if A.mix != '-':
        cmd += ['-ss', str(A.t0), '-t', str(A.t1 - A.t0), '-i', A.mix, '-af', loudness(A.mix) + ',aresample=48000', '-c:a', 'aac', '-b:a', '192k']
    cmd += ['-c:v', 'libx264', '-preset', 'slow', '-crf', str(A.crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', A.out]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(A.jobs) as pool:
        for n, buf in enumerate(pool.imap(frame, range(f0, f1), chunksize=3)):
            ff.stdin.write(buf)
            if n % 150 == 0:
                print(f'{(f0 + n) / FPS:6.1f} s', flush=True)
    ff.stdin.close()
    sys.exit(ff.wait())


if __name__ == '__main__':
    main()
