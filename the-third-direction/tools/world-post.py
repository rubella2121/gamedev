#!/usr/bin/env python3
"""
Post-processing for the 3D world pictures (tools/world-render.mjs calls it when a shot has a "post" block):
light shafts from the moon and other lights, depth of field, and a wide soft glow on the highlights.

    world-post.py raw.png depth.png rays.json out.png

raw.png    the picture as the page drew it
depth.png  the distance to everything, in three bytes per pixel (red is the coarse part), 2000 units = 1; white = sky
rays.json  { "rays": [ { x, y, k, color, r } ... ], "post": { rays: {k, decay, density, samples}, dof: {focus, aperture, max}, glow, hl } }
"""
import json
import sys

import numpy as np
from PIL import Image, ImageFilter

FAR = 2000.0


def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32) / 255.0


def decode_depth(path):
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float64) / 255.0
    d = a[..., 0] + a[..., 1] / 255.0 + a[..., 2] / 255.0**2
    return (d * FAR).astype(np.float32)


def to_img(a):
    return Image.fromarray(np.clip(a * 255.0 + 0.5, 0, 255).astype(np.uint8))


def blur(a, r):
    if r <= 0.05:
        return a
    return np.asarray(to_img(a).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255.0


def hex_rgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], dtype=np.float32) / 255.0


def god_rays(img, depth, rays, cfg):
    """Screen-space light shafts: the unblocked sky round each light is smeared towards the light; trunks and leaves (anything that is not sky) cut it into beams."""
    h, w, _ = img.shape
    k = cfg.get("k", 0.6)
    decay = cfg.get("decay", 0.965)
    density = cfg.get("density", 0.95)
    n = int(cfg.get("samples", 64))
    sky = (depth > FAR * 0.995).astype(np.float32)
    out = np.zeros_like(img)
    hw, hh = w // 2, h // 2
    ys, xs = np.mgrid[0:hh, 0:hw]
    sky_h = np.asarray(to_img(sky).resize((hw, hh), Image.BILINEAR), dtype=np.float32) / 255.0
    for src in rays:
        cx, cy = src["x"] * hw, src["y"] * hh
        rad = max(4.0, src["r"] * hw * cfg.get("spread", 1.0))
        core = np.exp(-(((xs - cx) ** 2 + (ys - cy) ** 2) / (rad * rad)))
        mask = sky_h * core
        m = to_img(mask)
        acc = np.zeros((hh, hw), dtype=np.float32)
        wgt = 1.0
        tot = 0.0
        for i in range(n):
            s = 1.0 - density * i / n
            im = m.transform((hw, hh), Image.AFFINE, (s, 0, (1 - s) * cx, 0, s, (1 - s) * cy), resample=Image.BILINEAR)
            acc += np.asarray(im, dtype=np.float32) / 255.0 * wgt
            tot += wgt
            wgt *= decay
        acc = acc / tot
        acc = np.asarray(Image.fromarray((np.clip(acc, 0, 1) * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR), dtype=np.float32) / 255.0
        out += acc[..., None] * hex_rgb(src["color"])[None, None, :] * src["k"] * k * 3.0
    return 1.0 - (1.0 - img) * (1.0 - np.clip(out, 0, 0.9))


def depth_of_field(img, depth, cfg):
    h, w, _ = img.shape
    focus = cfg["focus"]
    aperture = cfg.get("aperture", 0.8)
    maxr = cfg.get("max", 9.0) * w / 1280.0
    d = np.minimum(depth, 1500.0)
    coc = np.clip(aperture * np.abs(d - focus) / np.maximum(d, 0.5) * w / 1280.0 * 10.0, 0, maxr)
    # what is behind the subject is softened less than what is in front of it, so a far landmark stays readable
    coc = np.where(d > focus, np.minimum(coc, maxr * cfg.get("far", 0.4)), coc)
    # highlights get brighter before they are blurred, so fireflies and lamps become soft discs
    hl = cfg.get("hl", 2.5)
    base = img + np.clip(img - 0.72, 0, None) * hl
    radii = [0.0] + [maxr * f for f in (0.12, 0.25, 0.4, 0.6, 0.8, 1.0)]
    stack = [base if r == 0 else blur(base, r) for r in radii]
    idx = np.interp(coc, radii, np.arange(len(radii)))
    lo = np.clip(np.floor(idx).astype(np.int32), 0, len(radii) - 2)
    t = (idx - lo)[..., None]
    arr = np.stack(stack, axis=0)
    a = np.take_along_axis(arr, lo[None, ..., None].repeat(3, axis=3), axis=0)[0]
    b = np.take_along_axis(arr, (lo + 1)[None, ..., None].repeat(3, axis=3), axis=0)[0]
    return np.clip(a * (1 - t) + b * t, 0, 1)


def glow(img, amount, radius_frac=0.018):
    h, w, _ = img.shape
    hi = np.clip(img - 0.62, 0, None)
    g = blur(np.clip(hi * 2.0, 0, 1), w * radius_frac) + blur(np.clip(hi * 2.0, 0, 1), w * radius_frac * 3.0) * 0.8
    return 1.0 - (1.0 - img) * (1.0 - np.clip(g * amount, 0, 1))


def main():
    raw_p, depth_p, json_p, out_p = sys.argv[1:5]
    info = json.load(open(json_p))
    post = info.get("post", {})
    img = load(raw_p)
    depth = decode_depth(depth_p)
    if depth.shape != img.shape[:2]:
        depth = np.asarray(Image.fromarray(depth).resize((img.shape[1], img.shape[0]), Image.NEAREST), dtype=np.float32)
    if "dof" in post:
        img = depth_of_field(img, depth, post["dof"])
    if "rays" in post and info.get("rays"):
        img = god_rays(img, depth, info["rays"], post["rays"])
    if post.get("glow"):
        img = glow(img, post["glow"])
    to_img(img).save(out_p)


if __name__ == "__main__":
    main()
