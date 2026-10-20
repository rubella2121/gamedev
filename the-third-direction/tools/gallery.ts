import { Pix, W, H } from '../src/core/pix';
import { drawBlob } from '../src/core/art';
import { drawGloom } from '../src/core/art2';
import { Land } from '../src/forest/land';
import * as boss from '../src/forest/bossart';
import { card, portrait, sheet, hasHero } from './cards';
import { builders3d } from './gallery3d';

/**
 * Boss concept cards: each boss drawn by the game's own pixel painter, shown the way the game would show it
 * (a phone-sized scene in its zone) next to two close-up poses and a short "how you fight it".
 * Run with `npm run gallery`; the page exposes `__gallery.render(name)` which returns a PNG data URL.
 */

const sceneP = new Pix();
const land = new Land(sceneP.ctx);

interface Item {
  y: number;
  fn: () => void;
}

interface SceneOpts {
  /** world position of the boss's ground point */
  bx: number;
  by: number;
  /** world position of the blob (for scale) */
  px: number;
  py: number;
  draw: (p: Pix, sx: number, sy: number, t: number) => void;
  /** drawn on the ground under everything (telegraphs, rings, shadows) */
  under?: (p: Pix, camX: number, camY: number, t: number) => void;
  /** extra y-sorted things (minions, props) */
  extra?: (add: (y: number, fn: () => void) => void, camX: number, camY: number, t: number) => void;
  /** drawn on top of everything (effects) */
  over?: (p: Pix, camX: number, camY: number, t: number) => void;
  t?: number;
  /** where on the screen the boss should stand */
  at?: [number, number];
  blobLook?: [number, number];
  /** trees within this many world px of the boss are removed so the fight stays readable */
  clear?: number;
}

function drawScene(o: SceneOpts): HTMLCanvasElement {
  const p = sceneP;
  const t = o.t ?? 3.1;
  const at = o.at ?? [108, 236];
  const camX = Math.round(o.bx - at[0]);
  const camY = Math.round(o.by - at[1]);
  const clearR = o.clear ?? 80;
  p.alpha(1);
  p.clear('#07131b');
  land.drawGround(p, camX, camY);
  land.drawFlowers(p, camX, camY, t, 0, 1);
  o.under?.(p, camX, camY, t);
  const list: Item[] = [];
  for (const pr of land.visibleProps(camX, camY)) {
    // keep the arena readable: no big props right on top of the fight
    if (pr.kind === 'tree' && pr.y > o.by - 100 && pr.y < o.by + 30 && Math.abs(pr.x - o.bx) < clearR) continue;
    if (pr.kind === 'tree' && Math.hypot(pr.x - o.px, (pr.y - o.py) * 1.4) < 34) continue;
    list.push({ y: pr.y, fn: () => p.blit(pr.img, pr.x - camX - pr.img.width / 2, pr.y - camY - pr.img.height + 3) });
  }
  o.extra?.((y, fn) => list.push({ y, fn }), camX, camY, t);
  list.push({ y: o.by, fn: () => o.draw(p, o.bx - camX, o.by - camY, t) });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.fn();
  p.dither(o.px - camX, o.py - camY - 1, 18, 8, '#02050a', 0.5);
  drawBlob(p, o.px - camX, o.py - camY, { lookX: o.blobLook?.[0] ?? 0, lookY: o.blobLook?.[1] ?? -0.6, squash: 1 });
  o.over?.(p, camX, camY, t);
  p.blit(land.frame, 0, 0);
  p.blit(land.vignette, 0, 0);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  out.getContext('2d')!.drawImage(p.canvas, 0, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* little helpers for the effects on the scenes                         */
/* ------------------------------------------------------------------ */

/** A squashed circle on the ground, the way every ring in the forest is drawn. */
function groundRing(p: Pix, x: number, y: number, r: number, c: string, a: number, th = 2) {
  p.alpha(a);
  p.ring(x, y, r, r * 0.62, th, c);
  p.alpha(1);
}

function ringStack(p: Pix, x: number, y: number, radii: number[], c: string, aBase: number) {
  radii.forEach((r, i) => groundRing(p, x, y, r, c, aBase * (1 - i / (radii.length + 1)), i === 0 ? 3 : 2));
}

/* ------------------------------------------------------------------ */

const builders: Record<string, () => string> = {
  gloommother: () =>
    card({
      name: 'Gloommother',
      tag: 'PACKAGE A · B',
      zone: 'Gloom Hollow · guardian',
      accent: '#6ff0ff',
      tagline: 'A mountain of living shadow with a hundred eyes.',
      lines: [
        ['1 Brood', 'She hides behind her swarm. Pulse every Gloomling and the shield breaks.'],
        ['2 Dive', 'She sinks into the floor. A dark circle follows you, then she erupts out of it.'],
        ['3 Eclipse', 'The lamps go out. Pulse them back on and hold the light until she opens.'],
        ['Weak point', 'The glowing core in her chest, but only while she is open.'],
      ],
      scene: drawScene({
        bx: 150,
        by: 1262,
        px: 232,
        py: 1352,
        at: [96, 214],
        clear: 100,
        draw: (p, sx, sy, t) => boss.drawGloommother(p, sx, sy, t, { exposed: 0.3, pups: 0.9 }),
        under: (p, cx, cy) => {
          // the dive telegraph: a dark circle under the player that the Gloommother will erupt from
          p.dither(232 - cx, 1352 - cy, 30, 19, '#010208', 0.9);
          groundRing(p, 232 - cx, 1352 - cy, 30, '#6ff0ff', 0.55, 1);
        },
        extra: (add, cx, cy, t) => {
          [[198, 1316, 0], [214, 1290, 1], [178, 1330, 2], [260, 1304, 3]].forEach(([gx, gy, i]) => add(gy!, () => drawGloom(sceneP, gx! - cx, gy! - cy, t + i!, i! * 3, 1)));
        },
        blobLook: [-0.6, -0.5],
      }),
      shots: [
        { canvas: portrait('#6ff0ff', (p) => boss.drawGloommother(p, 90, 116, 3.1, { exposed: 0, pups: 1 })), label: 'guarded: pulse the swarm' },
        { canvas: portrait('#6ff0ff', (p) => boss.drawGloommother(p, 90, 116, 3.9, { exposed: 1, pups: 0.3 })), label: 'open: strike the core' },
      ],
    }),
  king: () =>
    card({
      name: 'Thornback King',
      tag: 'PACKAGE A · B',
      zone: 'Rootmaw Thicket · guardian',
      accent: '#e0a060',
      tagline: 'A beetle the size of a house, crowned in thorns.',
      lines: [
        ['Bullfight', 'He winds up, then charges in a straight line along the red marks.'],
        ['Sidestep', 'Let him smash into a tree and he is stunned for a few seconds. Every tree he hits falls.'],
        ['Strike', 'Pulse his unarmoured head while he is dizzy. Hit him three times.'],
        ['Later', 'He charges twice in a row and the thorns on his crown fire sideways.'],
      ],
      scene: drawScene({
        bx: 168,
        by: 842,
        px: 262,
        py: 832,
        at: [70, 232],
        clear: 120,
        draw: (p, sx, sy, t) => boss.drawThornbackKing(p, sx, sy, t, { mode: 2 }),
        under: (p, cx, cy) => {
          // the charge lane, drawn the way a Thornback's warning is drawn
          for (let i = 0; i < 12; i++) {
            const lx = 188 + i * 10 - cx;
            p.alpha(0.75 - i * 0.04);
            p.rect(lx, 836 - cy, 6, 2, '#ff4a5a');
            p.rect(lx, 846 - cy, 6, 2, '#ff4a5a');
            p.alpha(1);
          }
        },
        blobLook: [-0.9, 0.1],
      }),
      shots: [
        { canvas: portrait('#e0a060', (p) => boss.drawThornbackKing(p, 84, 118, 3.1, { mode: 2 })), label: 'charging' },
        { canvas: portrait('#e0a060', (p) => boss.drawThornbackKing(p, 84, 118, 3.1, { mode: 3 })), label: 'stunned: strike now' },
      ],
    }),
  queen: () =>
    card({
      name: 'Toll Queen',
      tag: 'PACKAGE A · B',
      zone: 'Echo Marsh · guardian',
      accent: '#d9b8ff',
      tagline: 'A bell the size of a house, hung from a winged eye.',
      lines: [
        ['Hush', 'She only sees what moves. Stand still and she loses you.'],
        ['Toll', 'Each toll sends a golden ring across the water. Step between the rings, never through one.'],
        ['Rhythm', 'Her reed gates open on the beat. Learn the beat and the water becomes a road.'],
        ['Weak point', 'The eye. It opens for one breath after a toll, when the bell cracks a little more.'],
      ],
      scene: drawScene({
        bx: 1052,
        by: 830,
        px: 1040,
        py: 905,
        at: [108, 222],
        clear: 110,
        draw: (p, sx, sy, t) => boss.drawTollQueen(p, sx, sy, t, { toll: 0.4, hover: 24 }),
        under: (p, cx, cy, t) => {
          ringStack(p, 1052 - cx, 832 - cy, [40, 62, 86, 112], '#ffe9a0', 0.9);
          void t;
        },
        blobLook: [0, -0.9],
      }),
      shots: [
        { canvas: portrait('#d9b8ff', (p) => boss.drawTollQueen(p, 90, 162, 3.1, { toll: 0.1, hover: 6 }), 180, 172, 162), label: 'watching' },
        { canvas: portrait('#d9b8ff', (p) => boss.drawTollQueen(p, 90, 162, 3.5, { toll: 1, hover: 10, look: [0.8, 0.3] }), 180, 172, 162), label: 'tolling' },
        { canvas: portrait('#d9b8ff', (p) => boss.drawTollQueen(p, 90, 162, 3.9, { toll: 0.4, crack: 0.8, hover: 14, fold: 0.85 }), 180, 172, 162), label: 'cracked: she dives' },
      ],
    }),
  wyrm: () =>
    card({
      name: 'Bone Wyrm',
      tag: 'PACKAGE B',
      zone: 'Bone Wastes · guardian',
      accent: '#f4efe0',
      tagline: 'A skeletal worm that arches in and out of the ground.',
      lines: [
        ['Burrow', 'It dives. Shaking dust marks where its head will rise: leave before it lands.'],
        ['Arch', 'Its body is a bridge of bone. Run under the arch to cross, never along its length.'],
        ['Lure', 'Make it smash through a bone barricade and the vertebrae break off for good.'],
        ['Weak point', 'The skull, once the spine behind it is gone.'],
      ],
      scene: drawScene({
        bx: 1090,
        by: 1262,
        px: 1020,
        py: 1330,
        at: [112, 228],
        clear: 130,
        draw: (p, sx, sy, t) => boss.drawBoneWyrm(p, sx, sy, t, { mode: 0 }),
        under: (p, cx, cy, t) => {
          // a dive marker where the head will rise
          p.dither(1020 - cx, 1330 - cy, 24, 14, '#05080c', 0.9);
          groundRing(p, 1020 - cx, 1330 - cy, 26, '#ff4a5a', 0.85, 2);
          groundRing(p, 1020 - cx, 1330 - cy, 14, '#ff4a5a', 0.6, 1);
          void t;
        },
        blobLook: [0.2, -0.9],
      }),
      shots: [
        { canvas: portrait('#f4efe0', (p) => boss.drawBoneWyrm(p, 85, 114, 3.1, { mode: 1 }), 176, 120, 114), label: 'roaring: the whole arch' },
        { canvas: portrait('#f4efe0', (p) => boss.drawBoneWyrm(p, 85, 114, 3.8, { mode: 0, whole: 0.55 }), 176, 120, 114), label: 'half the spine smashed: strike the skull' },
      ],
    }),
  mimicq: () =>
    card({
      name: 'Mimic Queen',
      tag: 'PACKAGE B',
      zone: 'Moth Meadow · guardian',
      accent: '#ff8aa8',
      tagline: 'A flower the size of a tree, with a lure that glows like the real thing.',
      lines: [
        ['Which is real', 'Dozens of flowers glow. Only the Mournmoth knows which are the real ones.'],
        ['Fake blooms', 'Step near a fake and it snaps. Follow the moth and the field is safe.'],
        ['Lure', 'She dangles a glowing bait to drag you into the maw. Do not walk toward the prettiest light.'],
        ['Weak point', 'Her tongue. It shows only for a moment after she bites a real flower by mistake.'],
      ],
      scene: drawScene({
        bx: 1140,
        by: 1628,
        px: 1050,
        py: 1690,
        at: [124, 222],
        clear: 120,
        draw: (p, sx, sy, t) => boss.drawMimicQueen(p, sx, sy, t, { open: 0.6 }),
        blobLook: [0.8, -0.6],
      }),
      shots: [
        { canvas: portrait('#ff8aa8', (p) => boss.drawMimicQueen(p, 90, 118, 3.1, { open: 0.15 })), label: 'blooming' },
        { canvas: portrait('#ff8aa8', (p) => boss.drawMimicQueen(p, 90, 118, 3.1, { open: 1 })), label: 'maw open' },
      ],
    }),
};

// The 3D bosses are built by the same page (three.js is already a dependency of the game).
Object.assign(builders, builders3d);

const ORDER = ['Gloommother', 'Thornback King', 'Toll Queen', 'Bone Wyrm', 'Mimic Queen', 'X, the Hollow', 'The Moon', 'The Mash', 'The Collector'];
const KEYS: Record<string, string> = { Gloommother: 'gloommother', 'Thornback King': 'king', 'Toll Queen': 'queen', 'Bone Wyrm': 'wyrm', 'Mimic Queen': 'mimicq', 'X, the Hollow': 'x', 'The Moon': 'moon', 'The Mash': 'mash', 'The Collector': 'collector' };
builders['sheet'] = () => {
  for (const n of ORDER) if (!hasHero(n)) builders[KEYS[n]!]!();
  return sheet(ORDER, [
    'PACKAGE A (recommended): Gloommother + Toll Queen + Thornback King, then The Moon as the final boss.',
    'PACKAGE B: all five guardians, then The Moon.      PACKAGE C: just The Moon (the cheapest, safest).',
    'The Mash and The Collector are alternatives to The Moon as the last fight: pick one finale, not all three.',
  ]);
};

(window as unknown as { __gallery: unknown }).__gallery = {
  names: () => Object.keys(builders),
  render: (name: string) => builders[name]!(),
};
