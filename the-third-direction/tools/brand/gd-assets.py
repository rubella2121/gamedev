"""
Images for the GameDistribution listing (Assets tab), cut from the brand art, in the sizes their new-game form asks for:
  brand/gamedistribution/1280x720.jpg   the landscape key art (brand/crazygames/landscape.jpg)
  brand/gamedistribution/1280x550.jpg   the logo and X (brand/banner.png, cut to the width)
  brand/gamedistribution/512x512.jpg    the square key art (brand/crazygames/square.jpg)
  brand/gamedistribution/512x384.jpg    the key art (brand/logo-on-night.jpg) at 4:3
  brand/gamedistribution/512x340.jpg    the key art at about 3:2, without the three eyes
  python3 tools/brand/gd-assets.py   (Pillow)
"""
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'brand/gamedistribution')
os.makedirs(OUT, exist_ok=True)


def load(p):
    return Image.open(os.path.join(ROOT, p)).convert('RGB')


def cover(im, w, h, cx=0.5, cy=0.5):
    """scale to fill w x h and cut the rest, keeping the point (cx, cy) of the picture in view"""
    s = max(w / im.width, h / im.height)
    r = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x = min(max(0, round(r.width * cx - w / 2)), r.width - w)
    y = min(max(0, round(r.height * cy - h / 2)), r.height - h)
    return r.crop((x, y, x + w, y + h))


key = load('brand/logo-on-night.jpg')
jobs = {
    '1280x720': cover(load('brand/crazygames/landscape.jpg'), 1280, 720),
    # (the banner is 3:1: keep the logo on the left and X on the right)
    '1280x550': cover(load('brand/banner.png'), 1280, 550, cx=0.48),
    '512x512': cover(load('brand/crazygames/square.jpg'), 512, 512),
    '512x384': cover(key, 512, 384, cy=0.5),
    # (too short for the three eyes and the family both: the eyes go, as on the Y8 portrait)
    '512x340': key.crop((0, 280, 2400, 1874)).resize((512, 340), Image.LANCZOS),
}
for name, im in jobs.items():
    p = os.path.join(OUT, f'{name}.jpg')
    im.save(p, quality=92)
    print(name, im.size, os.path.getsize(p) // 1024, 'KB')
