"""
Promo art for the Y8 game page (Media), from the brand art:
  brand/y8/promos/portrait-01.jpg   1080 x 1920: X looming over the night, the key art below (logo, guardians, the family)
  brand/y8/promos/portrait-02/03    1080 x 1920: the framed screenshots with their hook lines (brand/screens/framed)
  brand/y8/promos/card-01.jpg       760 x 570: the key art (brand/logo-on-night.jpg), cut to 4:3
  brand/y8/promos/card-02.jpg       760 x 570: X over the key art, as on the portrait
The landscape promo (1920 x 1080) is brand/crazygames/landscape.jpg as it is.
  python3 tools/brand/y8-promos.py   (Pillow; X's bust is tools/brand/sprites/x-bust-4k.png: node tools/brand/sprites.mjs x-bust-4k)
"""
import os
import random
import shutil

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'brand/y8/promos')
KEY = Image.open(os.path.join(ROOT, 'brand/logo-on-night.jpg')).convert('RGB')
X = Image.open(os.path.join(ROOT, 'tools/brand/sprites/x-bust-4k.png')).convert('RGBA')
NIGHT = (5, 6, 11)  # the key art's own background, so the sky meets it without a seam


def sky(w, h, seed):
    """near-black night, a faint violet glow from the top, sparse stars"""
    im = Image.new('RGB', (w, h), NIGHT)
    glow = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(glow)
    for i in range(60):
        r = 1 - i / 60
        d.ellipse((w / 2 - w * 0.9 * r, -h * 0.5 * r, w / 2 + w * 0.9 * r, h * 0.55 * r), fill=int(70 * (1 - r) ** 1.5))
    glow = glow.filter(ImageFilter.GaussianBlur(w / 20))
    im = Image.composite(Image.new('RGB', (w, h), (30, 16, 52)), im, glow)
    rnd = random.Random(seed)
    stars = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(stars)
    for _ in range(int(w * h / 2600)):
        x, y, s = rnd.random() * w, rnd.random() * h, rnd.choice((0.6, 0.8, 1, 1, 1.4, 2))
        d.ellipse((x - s, y - s, x + s, y + s), fill=int(90 + 165 * rnd.random() ** 2))
    stars = stars.filter(ImageFilter.GaussianBlur(0.6))
    return ImageChops.screen(im, Image.merge('RGB', (stars, stars, stars)))


def fade(im, top=0.0, bottom=(1.0, 1.0), sides=0):
    """multiply the picture's alpha: fades in over `top` (fraction of the height) at the top, out from bottom[0] to bottom[1]"""
    im = im.convert('RGBA')
    w, h = im.size
    col = Image.new('L', (1, h))
    for y in range(h):
        f = y / h
        a = 1.0
        if top > 0 and f < top:
            a *= f / top
        if f > bottom[0]:
            a *= max(0.0, 1 - (f - bottom[0]) / max(1e-6, bottom[1] - bottom[0]))
        col.putpixel((0, y), int(255 * a * a * (3 - 2 * a)))
    mask = col.resize((w, h))
    if sides:
        row = Image.new('L', (w, 1))
        for x in range(w):
            e = min(x, w - 1 - x) / sides
            row.putpixel((x, 0), int(255 * min(1.0, e)))
        mask = ImageChops.multiply(mask, row.resize((w, h)))
    im.putalpha(ImageChops.multiply(im.getchannel('A'), mask))
    return im


def keyart(width):
    """the key art without the three eyes at its top (X is above it already)"""
    k = KEY.crop((0, 300, 2400, 1900))
    return k.resize((width, round(width * k.height / k.width)), Image.LANCZOS)


def xbust(width):
    return X.resize((width, round(width * X.height / X.width)), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)

# portrait 1
c = sky(1080, 1920, 7).convert('RGBA')
x = fade(xbust(1240), bottom=(0.5, 0.92))
c.alpha_composite(x, ((1080 - x.width) // 2, 40))
k = fade(keyart(1080), top=0.22)
c.alpha_composite(k, (0, 1920 - k.height))
c.convert('RGB').save(os.path.join(OUT, 'portrait-01.jpg'), quality=92)
shutil.copy(os.path.join(ROOT, 'brand/screens/framed/07-x-the-hollow.jpg'), os.path.join(OUT, 'portrait-02.jpg'))
shutil.copy(os.path.join(ROOT, 'brand/screens/framed/01-family.jpg'), os.path.join(OUT, 'portrait-03.jpg'))

# card 1: the key art at 4:3
KEY.crop((0, 40, 2400, 1840)).resize((760, 570), Image.LANCZOS).save(os.path.join(OUT, 'card-01.jpg'), quality=92)

# card 2: X behind, the key art in front
c = sky(760, 570, 11).convert('RGBA')
x = fade(xbust(470), bottom=(0.42, 0.8))
c.alpha_composite(x, ((760 - x.width) // 2, -20))
k = fade(keyart(600), top=0.25, sides=60)
c.alpha_composite(k, ((760 - k.width) // 2, 570 - k.height + 4))
c.convert('RGB').save(os.path.join(OUT, 'card-02.jpg'), quality=92)

for f in sorted(os.listdir(OUT)):
    im = Image.open(os.path.join(OUT, f))
    print(f, im.size, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')
