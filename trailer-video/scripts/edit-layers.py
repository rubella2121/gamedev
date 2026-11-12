"""
Where the Blob is in every frame of the song edit's footage, for the film (src/data/edit2-layers.json).

The capture (../the-third-direction/tools/trailer/capture.mjs, shots-skins.mjs) leaves public/edit2/<shot>/layers.json: for a
2D shot the Blob's place on the forest's canvas (216 x 384) and whether it was drawn, and which frames are the screen as it
was (h<n>.jpg: the forest torn open, or the 3D part); for a 3D shot the Blob's middle and the box it fills on the 720 x 1280
frame. This gathers them, rounded, and adds a camera that follows the Blob without its jitter (an average over half a
second either side, held where the Blob is not drawn).

    python3 scripts/edit-layers.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'public', 'edit2')
OUT = os.path.join(ROOT, 'src', 'data', 'edit2-layers.json')
HALF = 15  # frames either side of the average


def follow(pts):
    """a smoothed path through the points (None where there is none: the last one is held)"""
    held = []
    last = None
    for p in pts:
        if p is not None:
            last = p
        held.append(last)
    first = next((p for p in held if p is not None), (0, 0))
    held = [p if p is not None else first for p in held]
    out = []
    for i in range(len(held)):
        a, b = max(0, i - HALF), min(len(held), i + HALF + 1)
        xs = [p[0] for p in held[a:b]]
        ys = [p[1] for p in held[a:b]]
        out.append([round(sum(xs) / len(xs), 1), round(sum(ys) / len(ys), 1)])
    return out


def main():
    shots = {}
    for name in sorted(os.listdir(SRC)):
        f = os.path.join(SRC, name, 'layers.json')
        if not os.path.exists(f):
            continue
        meta = json.load(open(f))
        if not meta:
            continue
        if 'box' in meta[0] or 'glow' in meta[0]:
            p = []
            for m in meta:
                b = m['box'] or [m['x'], m['y'], m['x'], m['y']]
                p.append([m['x'], m['y'], *b, 1 if m['glow'] else 0])
            c = follow([((b[2] + b[4]) / 2, (b[3] + b[5]) / 2) if meta[i]['box'] else None for i, b in enumerate(p)])
            shots[name] = {'k': '3d', 'n': len(meta), 'w': meta[0]['w'], 'h': meta[0]['h'], 'p': p, 'c': c}
        else:
            p = []
            for m in meta:
                flags = (1 if m.get('shown') else 0) | (2 if m.get('hd') else 0) | (4 if 'x' in m else 0)
                p.append([round(m.get('x', 0), 1), round(m.get('y', 0), 1), flags])
            c = follow([(q[0], q[1] - 6) if q[2] & 1 else None for q in p])
            shots[name] = {'k': '2d', 'n': len(meta), 'p': p, 'c': c}
    json.dump(shots, open(OUT, 'w'), separators=(',', ':'))
    for k, v in shots.items():
        print(f"{k}: {v['k']} {v['n']} frames")


if __name__ == '__main__':
    main()
