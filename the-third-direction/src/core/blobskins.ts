import type { Pix } from './pix';

/**
 * The Blob's skins, in the forest's pixels (drawBlob in art.ts draws them; the 3D ones are in act2/skins3d.ts, the wardrobe and
 * the unlocks in skins.ts). The Blob is tiny on screen, about 17 x 13 pixels, so every skin is placed pixel by pixel against the
 * body's own outline: each row of the body is measured exactly as Pix.ellipse fills it (span), and a helmet, a scarf or a crown
 * follows those rows, so it fits whatever shape the jelly is squashed into. Inferno and Golden change the body's colours too.
 */
export type SkinId = 'default' | 'explorer' | 'knight' | 'wizard' | 'inferno' | 'golden';

/** the body's colours: fill, highlight, shade, outline, the blush on its cheeks */
export interface BlobPal {
  blob: string;
  light: string;
  shade: string;
  outline: string;
  blush: string;
}

export const SKIN_PAL: Partial<Record<SkinId, BlobPal>> = {
  // a coal of a blob: orange in the middle, ember-red at the edge, a scorched outline
  inferno: { blob: '#ff8a2a', light: '#ffd877', shade: '#e0461c', outline: '#5c1208', blush: '#ffb3a0' },
  // polished gold: a deeper fill, a near-white shine and an amber edge (so the crown still stands out)
  golden: { blob: '#ffc21c', light: '#fff8d0', shade: '#cf7808', outline: '#5a3000', blush: '#ff9460' },
};

/** where the body is: (x, cy) its centre, rx / ry its half-width and half-height (without the outline), s its scale */
export interface BlobGeo {
  x: number;
  cy: number;
  rx: number;
  ry: number;
  s: number;
  /** seconds, for whatever flickers or flaps */
  t: number;
}

/** the columns of the body's outline on pixel row y (both ends included), exactly as Pix.ellipse fills it, or null */
function span(g: BlobGeo, y: number): [number, number] | null {
  const rx = g.rx + 1;
  const ry = g.ry + 1;
  const dy = (y + 0.5 - g.cy) / ry;
  if (dy * dy > 1) return null;
  const hw = rx * Math.sqrt(1 - dy * dy);
  const x0 = Math.round(g.x - hw);
  const x1 = Math.round(g.x + hw);
  return x1 > x0 ? [x0, x1 - 1] : null;
}

/** the top and bottom pixel rows of the body's outline */
function rows(g: BlobGeo): [number, number] {
  let top = Math.floor(g.cy - g.ry - 1);
  while (!span(g, top)) top++;
  let bot = Math.ceil(g.cy + g.ry + 1);
  while (!span(g, bot)) bot--;
  return [top, bot];
}

/** a little picture drawn pixel by pixel: `.` is empty, every other letter a colour from `key`; (x, y) is its top-left corner */
function stamp(p: Pix, x: number, y: number, map: readonly string[], key: Record<string, string>, flip = false) {
  map.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = key[row[flip ? row.length - 1 - i : i]!];
      if (c) p.px(x + i, y + j, c);
    }
  });
}

/** the Blob's eye row (its top), as drawBlob places the eyes when it looks straight ahead */
function eyeTop(g: BlobGeo): number {
  return Math.round(g.cy + g.ry * 0.12 - 2.1 * g.s);
}

/* ------------------------------------------------------------------------------------------------ behind the body */

/** what goes behind the body (drawn after its shadow, before the body): the Wizard's cape, the Inferno's flames */
export function skinBack(p: Pix, skin: SkinId, g: BlobGeo) {
  if (skin === 'wizard') wizardCape(p, g);
  else if (skin === 'inferno') infernoFlames(p, g);
  else if (skin === 'golden') royalCape(p, g);
}

/** what goes on the body (drawn after the eyes) */
export function skinFront(p: Pix, skin: SkinId, g: BlobGeo) {
  if (skin === 'explorer') explorer(p, g);
  else if (skin === 'knight') knight(p, g);
  else if (skin === 'wizard') wizardHat(p, g);
  else if (skin === 'inferno') infernoHorns(p, g);
  else if (skin === 'golden') golden(p, g);
}

/* ------------------------------------------------------------------------------------------------ Explorer */

const EXP = {
  cap: '#8a5530',
  capLight: '#b47a44',
  capDark: '#5c3418',
  strap: '#3a200e',
  strapLight: '#7a4a24',
  rim: '#b8862e',
  rimLight: '#f2c75a',
  glass: '#58c8e8',
  glint: '#e6fbff',
  scarf: '#dc323c',
  scarfLight: '#ff6e5e',
  scarfDark: '#8e1826',
};

/** Explorer: a leather aviator cap, big brass goggles pushed up on it, and a red scarf with its tail in the wind */
function explorer(p: Pix, g: BlobGeo) {
  const [top, bot] = rows(g);
  const cx = Math.round(g.x);
  // the cap: brown leather over the crown of the head, a row higher than it, stitched down the middle
  const capBot = top + 2;
  for (let y = top - 1; y <= capBot; y++) {
    const sp = span(g, Math.max(y, top));
    if (!sp) continue;
    let [a, b] = sp;
    if (y === top - 1) {
      a += 2;
      b -= 2;
    }
    for (let x = a; x <= b; x++) {
      const u = (x - a) / Math.max(1, b - a);
      let c = u < 0.3 ? EXP.capLight : u > 0.72 ? EXP.capDark : EXP.cap;
      if (x === a || x === b || y === top - 1) c = EXP.strap;
      p.px(x, y, c);
    }
  }
  for (let y = top; y < capBot; y++) p.px(cx, y, EXP.capDark);
  // the goggles: two big round brass rims on the front of the cap, the glass catching the moon on the upper left
  const lens = ['.RRR.', 'RGWGR', 'RGGGR', '.RRR.'];
  const lensKey = { R: EXP.rim, G: EXP.glass, W: EXP.glint };
  const ex = Math.round(2.7 * g.s);
  const ly = capBot - 1;
  for (const sgn of [-1, 1]) {
    const lx = Math.round(g.x + sgn * ex) - 2;
    stamp(p, lx, ly, lens, lensKey);
    p.px(lx + 1, ly, EXP.rimLight);
    p.px(lx + 2, ly, EXP.rimLight);
  }
  // the strap, from the goggles round the sides of the head
  const ss = span(g, ly + 1);
  if (ss) {
    for (let x = ss[0]; x <= Math.round(g.x - ex) - 3; x++) p.px(x, ly + 1, EXP.strap);
    for (let x = Math.round(g.x + ex) + 3; x <= ss[1]; x++) p.px(x, ly + 1, EXP.strap);
  }
  p.px(cx, ly + 1, EXP.rim);
  // the scarf: two rows wrapped low around the body, under the blush
  const r0 = bot - 2;
  for (let k = 0; k < 2; k++) {
    const y = r0 + k;
    const s2 = span(g, y);
    if (!s2) continue;
    for (let x = s2[0]; x <= s2[1]; x++) {
      const edge = x === s2[0] || x === s2[1];
      const c = edge ? EXP.scarfDark : k === 0 ? (x < g.x - 1 ? EXP.scarfLight : EXP.scarf) : x > g.x + 2 ? EXP.scarfDark : EXP.scarf;
      p.px(x, y, c);
    }
    // the folds
    if (k === 1) for (let x = s2[0] + 2; x < s2[1] - 1; x += 3) p.px(x, y, EXP.scarfDark);
  }
  // the knot and the tail, out to the right, flapping
  const s3 = span(g, r0);
  if (s3) {
    p.px(s3[1] - 2, r0, EXP.scarfDark);
    p.px(s3[1] - 1, r0, EXP.scarfLight);
    const flap = Math.sin(g.t * 9) > 0;
    const tail = flap ? ['RL.', 'DRL', '.DR', '..D'] : ['RL..', 'DRRL', '..DR', '....'];
    stamp(p, s3[1] + 1, r0, tail, { R: EXP.scarf, L: EXP.scarfLight, D: EXP.scarfDark });
  }
}

/* ------------------------------------------------------------------------------------------------ Knight */

const KN = {
  ink: '#22262f',
  dark: '#566173',
  mid: '#97a3b6',
  light: '#dfe7f1',
  shine: '#ffffff',
  plume: '#e2343c',
  plumeLight: '#ff7c6c',
  plumeDark: '#8e1a24',
};

/** Knight: a steel helmet over the top of the head with its visor raised, cheek guards, and a red plume */
function knight(p: Pix, g: BlobGeo) {
  const [top] = rows(g);
  const visor = eyeTop(g) - 1;
  // the dome of the helmet: one row taller than the head, every row of the head down to the visor
  for (let y = top - 1; y <= visor; y++) {
    const sp = span(g, Math.max(y, top));
    if (!sp) continue;
    let [a, b] = sp;
    if (y === top - 1) {
      a += 2;
      b -= 2;
    }
    for (let x = a; x <= b; x++) {
      let c = KN.mid;
      const u = (x - a) / Math.max(1, b - a);
      if (x === a || x === b || y === top - 1) c = KN.ink;
      else if (y === visor) c = KN.dark;
      else if (u < 0.32) c = KN.light;
      else if (u > 0.74) c = KN.dark;
      p.px(x, y, c);
    }
    // the ridge down the middle of the dome
    if (y > top - 1 && y < visor) p.px(Math.round(g.x) - 1, y, KN.light);
  }
  // rivets along the visor's rim, and a glint on the dome
  const sv = span(g, visor);
  if (sv) {
    for (let x = sv[0] + 2; x <= sv[1] - 2; x += 3) p.px(x, visor, KN.light);
    p.px(sv[0], visor, KN.ink);
    p.px(sv[1], visor, KN.ink);
  }
  const sg = span(g, top + 1);
  if (sg) p.px(sg[0] + 2, top + 1, KN.shine);
  // the cheek guards, down both sides of the face beside the eyes
  for (let y = visor + 1; y <= visor + 3; y++) {
    const sp = span(g, y);
    if (!sp) continue;
    p.px(sp[0], y, KN.ink);
    p.px(sp[0] + 1, y, y === visor + 3 ? KN.ink : KN.mid);
    p.px(sp[1], y, KN.ink);
    p.px(sp[1] - 1, y, y === visor + 3 ? KN.ink : KN.dark);
  }
  // the plume: out of the crest and curling back, swaying a little as it moves
  const sway = Math.sin(g.t * 3) > 0.2 ? 1 : 0;
  const plume = ['....LLP', '...LPPPd', '..LPPPd.', '.LPPd...', '.PPd....', '.Pd.....'];
  stamp(p, Math.round(g.x) - 2 + sway, top - 7, plume, { L: KN.plumeLight, P: KN.plume, d: KN.plumeDark });
  // the socket the plume sits in
  p.px(Math.round(g.x) - 1, top - 1, KN.ink);
  p.px(Math.round(g.x), top - 1, KN.dark);
}

/* ------------------------------------------------------------------------------------------------ Wizard */

const WZ = {
  ink: '#120e2e',
  hat: '#2e3da6',
  hatLight: '#5268e0',
  hatDark: '#1b2470',
  band: '#7a3fc4',
  star: '#ffd83a',
  starLight: '#fff6b0',
  cape: '#5a2a92',
  capeLight: '#8248c8',
  capeDark: '#34185e',
  clasp: '#ffd83a',
};

/** the Wizard's cape: a cloak around the lower half, wider than the body, falling to the ground (drawn behind it) */
function wizardCape(p: Pix, g: BlobGeo) {
  const [, bot] = rows(g);
  const y0 = Math.round(g.cy - g.ry * 0.1);
  for (let y = y0; y <= bot; y++) {
    const sp = span(g, y);
    if (!sp) continue;
    // a little wider at every row on the way down, like cloth hanging from the shoulders
    const out = 1 + Math.min(2, Math.floor((y - y0) / 2));
    const a = sp[0] - out;
    const b = sp[1] + out;
    for (let x = a; x <= b; x++) {
      const edge = x === a || x === b || y === bot;
      p.px(x, y, edge ? WZ.ink : x < g.x ? WZ.capeLight : WZ.cape);
    }
    // the folds
    p.px(a + 1, y, WZ.capeDark);
    p.px(b - 1, y, WZ.capeDark);
  }
}

/** the Wizard's hat: a wide brim, a tall cone flopping back with a gold star, a purple band; and the cape's clasp */
function wizardHat(p: Pix, g: BlobGeo) {
  const [top, bot] = rows(g);
  const cx = Math.round(g.x);
  // the brim: two rows over the top of the head, wider than it
  const sb = span(g, top + 1);
  if (sb) {
    const a = sb[0] - 2;
    const b = sb[1] + 2;
    for (let x = a; x <= b; x++) p.px(x, top + 1, x === a || x === b ? WZ.ink : WZ.hatDark);
    for (let x = a + 1; x <= b - 1; x++) p.px(x, top, x < cx - 2 ? WZ.hatLight : WZ.hat);
    p.px(a, top, WZ.ink);
    p.px(b, top, WZ.ink);
  }
  // the cone, its tip bending back to the left, and its band
  const cone = [
    '.......kk.....', // the tip
    '......kHk.....',
    '.....kHHk.....',
    '.....kHHk.....',
    '....kHHHHk....',
    '....kLHHHk....',
    '...kLHHHHHk...',
    '...kBBBBBBk...',
    '..kLHHHHHHDk..',
  ];
  const cx0 = cx - 7;
  stamp(p, cx0, top - cone.length, cone, { k: WZ.ink, H: WZ.hat, L: WZ.hatLight, D: WZ.hatDark, B: WZ.band });
  // the floppy tip, leaning back
  p.px(cx0 + 6, top - cone.length - 1, WZ.ink);
  p.px(cx0 + 5, top - cone.length - 1, WZ.hatDark);
  // the star on the cone, twinkling
  const sy = top - cone.length + 4;
  const tw = Math.sin(g.t * 4) > 0.6;
  p.px(cx - 1, sy, tw ? WZ.starLight : WZ.star);
  p.px(cx - 2, sy, WZ.star);
  p.px(cx, sy, WZ.star);
  p.px(cx - 1, sy - 1, WZ.star);
  p.px(cx - 1, sy + 1, WZ.star);
  // the cape's gold clasp, under the face
  p.px(cx - 1, bot - 2, WZ.clasp);
  p.px(cx, bot - 2, WZ.clasp);
}

/* ------------------------------------------------------------------------------------------------ Inferno */

const INF = {
  hot: '#fff3a0',
  yellow: '#ffc533',
  orange: '#ff7a1e',
  red: '#e2321a',
  deep: '#8e1408',
  horn: '#1c0604',
  hornRim: '#ff8a3a',
};

/** Inferno: flames licking up behind the body, flickering, with sparks rising off them */
function infernoFlames(p: Pix, g: BlobGeo) {
  const [top, bot] = rows(g);
  const t = g.t;
  // tongues of fire from the shoulders and the crown of the head; each its own height and flicker
  const tongues: [number, number, number][] = [
    [-0.78, 4, 0.0],
    [-0.42, 7, 1.7],
    [-0.08, 9, 0.6],
    [0.3, 7, 2.4],
    [0.7, 5, 1.1],
  ];
  for (const [u, hgt, ph] of tongues) {
    const fx = Math.round(g.x + u * (g.rx + 1));
    const flick = Math.sin(t * 11 + ph * 3) * 0.5 + Math.sin(t * 17 + ph) * 0.5;
    const h = Math.max(2, Math.round(hgt * g.s + flick * 1.6));
    const sp = span(g, top + Math.round(Math.abs(u) * 3));
    const base = sp ? top + Math.round(Math.abs(u) * 3) + 1 : top + 2;
    for (let k = 0; k < h; k++) {
      const y = base - k;
      const w = Math.max(0, Math.round((1 - k / h) * 2.2));
      const lean = Math.round(Math.sin(t * 6 + ph + k * 0.6) * (k / h) * 1.4);
      for (let i = -w; i <= w; i++) {
        const f = k / h;
        const c = Math.abs(i) === w ? (f > 0.55 ? INF.red : INF.orange) : f < 0.35 ? INF.yellow : f < 0.7 ? INF.orange : INF.red;
        p.px(fx + i + lean, y, c);
      }
    }
  }
  // the heat at the sides, all the way down
  for (let y = top + 2; y <= bot - 2; y++) {
    const sp = span(g, y);
    if (!sp) continue;
    const f = Math.sin(t * 13 + y * 1.3);
    if (f > 0.1) p.px(sp[0] - 1, y, f > 0.7 ? INF.orange : INF.red);
    if (Math.sin(t * 12 + y * 1.7 + 2) > 0.1) p.px(sp[1] + 1, y, INF.red);
  }
  // sparks rising
  for (let i = 0; i < 4; i++) {
    const ph = (t * 0.9 + i * 0.27) % 1;
    const sx = Math.round(g.x + Math.sin(i * 2.3 + t * 2) * (g.rx * 0.9));
    const sy = Math.round(top - 2 - ph * 9 * g.s);
    p.px(sx, sy, ph < 0.5 ? INF.hot : INF.orange);
  }
}

/** Inferno: two little horns, black-red, at the top of the head */
function infernoHorns(p: Pix, g: BlobGeo) {
  const [top] = rows(g);
  const sp = span(g, top + 1);
  if (!sp) return;
  // each horn curls up and out from the top of the head, a third of the way in from its edge
  // black against the fire, with the glow of it along their outer edge, and a hot tip
  const horn = ['T..', 'LD.', 'LDD', '.DD', '.DD'];
  const off = Math.round((sp[1] - sp[0]) * 0.2);
  const key = { D: INF.horn, L: INF.hornRim, T: INF.hot };
  stamp(p, sp[0] + off - 1, top - 4, horn, key);
  stamp(p, sp[1] - off - 1, top - 4, horn, key, true);
}

/* ------------------------------------------------------------------------------------------------ Golden */

const GD = {
  ink: '#4a2600',
  gold: '#ffd23a',
  goldLight: '#fff6c0',
  goldDark: '#c78612',
  ruby: '#e3203c',
  rubyLight: '#ff8a9a',
  sapphire: '#3a8cff',
  ermine: '#fbf7ee',
  spot: '#1a1418',
  robe: '#c2182e',
  robeDark: '#7a0c1c',
  spark: '#ffffff',
};

/** Golden: a royal red cape trimmed with ermine, falling behind the body to the ground (drawn behind it) */
function royalCape(p: Pix, g: BlobGeo) {
  const [, bot] = rows(g);
  const y0 = Math.round(g.cy - g.ry * 0.25);
  for (let y = y0; y <= bot; y++) {
    const sp = span(g, y);
    if (!sp) continue;
    const out = 2 + Math.min(2, Math.floor((y - y0) / 2));
    const a = sp[0] - out;
    const b = sp[1] + out;
    for (let x = a; x <= b; x++) {
      // the white fur along its outer edge and its hem, with the little black tails of ermine in it
      const fur = x === a || x === b || y === bot;
      const c = fur ? ((x * 3 + y * 5) % 7 === 0 ? GD.spot : GD.ermine) : x < g.x ? GD.robe : GD.robeDark;
      p.px(x, y, c);
    }
    p.px(a - 1, y, GD.ink);
    p.px(b + 1, y, GD.ink);
  }
}

/** Golden: a crown with a ruby between two sapphires, a polished shine, and sparkles around the whole blob */
function golden(p: Pix, g: BlobGeo) {
  const [top, bot] = rows(g);
  const cx = Math.round(g.x);
  // the crown: three points, the middle one tallest, a band set with a ruby between two sapphires
  const map = [
    '.....k.....',
    '.k..kGk..k.',
    'kGk.kGk.kGk',
    'kGGkGGGkGGk',
    'kLGGGGGGGDk',
    'kGBGGRGGBDk',
    'kkkkkkkkkkk',
  ];
  stamp(p, cx - 6, top - 5, map, { k: GD.ink, G: GD.gold, L: GD.goldLight, D: GD.goldDark, R: GD.ruby, B: GD.sapphire });
  // a glint on the ruby
  p.px(cx - 1, top - 1, GD.rubyLight);
  // polished: a bright star of light on the upper left of the body, and a second glint on the right
  const gy = Math.round(g.cy - g.ry * 0.62);
  const gx = Math.round(g.x - g.rx * 0.58);
  p.px(gx, gy, GD.spark);
  p.px(gx + 1, gy, GD.goldLight);
  p.px(gx, gy + 1, GD.goldLight);
  p.px(Math.round(g.x + g.rx * 0.62), Math.round(g.cy + g.ry * 0.05), GD.goldLight);
  void bot;
  // sparkles, here and there around the blob, coming and going
  for (let i = 0; i < 3; i++) {
    const ph = (g.t * 0.7 + i * 0.37) % 1;
    if (ph > 0.45) continue;
    const a = i * 2.4 + Math.floor(g.t * 0.7 + i * 0.37) * 1.7;
    const sx = Math.round(g.x + Math.cos(a) * (g.rx + 4));
    const sy = Math.round(g.cy + Math.sin(a) * (g.ry + 3));
    p.px(sx, sy, GD.spark);
    if (ph < 0.25) {
      p.px(sx - 1, sy, GD.gold);
      p.px(sx + 1, sy, GD.gold);
      p.px(sx, sy - 1, GD.gold);
      p.px(sx, sy + 1, GD.gold);
    }
  }
}
