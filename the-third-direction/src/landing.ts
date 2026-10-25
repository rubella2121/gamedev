/**
 * The landing page, the first thing anyone sees: a night in the forest, painted on the forest's own pixel grid (216 x 384).
 * A sky full of stars, a big pale moon, two tree lines with fog between them, tall trunks framing it all, and the family in a
 * clearing with a small light of their own. The layers sit at different depths and slide against each other when the pointer
 * moves, and drift slowly on their own, so the flat picture has a third direction.
 *
 * Things happen in it. The title builds itself and its depth comes out with a thump; eyes open in the dark between the trees
 * and follow you; the wind goes through the grass; the Mournmoth comes down from the moon to the baby; and now and then the
 * moon opens an eye and some of the stars turn out to be eyes too ("don't look up"). A tap sends out the baby's pulse of light,
 * the same as a tap in the game: the eyes snap shut, the fireflies scatter, and the intro begins.
 *
 * How it is drawn, for phones: the four pixel layers are small canvases (216 x 384 plus a margin), the light is one more at half
 * that size, and all of it is put together on ONE canvas, which is the only thing the page has to composite (no CSS blend modes,
 * filters or stacked full-screen layers: those are what make a phone flicker). Every light is a sprite baked once. The canvas is
 * at most about 0.9 megapixels, and if the phone cannot keep up the page steps itself down (fewer lights, a smaller canvas,
 * fewer frames) instead of stuttering.
 */
import { drawBlob, drawRedEyes, makeBush, makeFlower, makeRock } from './core/art';
import { C } from './core/palette';
import { Pix } from './core/pix';
import { clamp, easeOutCubic, hash2, rng, smooth, TAU } from './core/util';
import { EXTRUDE_AT } from './logo';

const W = 216;
const H = 384;
/** extra pixels around every layer, so a layer can slide without showing its edge */
const M = 12;
const LW = W + 2 * M;
const LH = H + 2 * M;
/** the light is drawn at half the pixel grid and scaled up smoothly */
const GS = 0.5;
const GW = Math.round(LW * GS);
const GH = Math.round(LH * GS);

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const MOON = { x: 108, y: 178, r: 26 };
/** where the baby stands (its light, and the pulse, come from here) */
const BABY = { x: 108, y: 282 };
/** the top of the clearing at scene x: highest in the middle, falling away to the sides */
const groundY = (x: number) => Math.round(293 + ((x - 108) / 108) ** 2 * 28 + Math.sin(x * 0.23) * 1.2);

/** back to front. The sky and the far trees are one layer: they are so far away that they move together. */
const LAYERS = ['back', 'mid', 'ground', 'near'] as const;
type LayerName = (typeof LAYERS)[number];
/** how far each layer slides, as a share of SWING */
const DEPTH: Record<LayerName, number> = { back: 0.1, mid: 0.36, ground: 0.6, near: 1 };
/** scene pixels of slide, at depth 1, for a full swing of the pointer */
const SWING = 9;

/** The opening of the page, in seconds from when it is shown. */
export const INTRO = {
  /** the title starts to build (Logo.assemble) */
  logo: 0.25,
  /** its depth comes out (EXTRUDE_AT later, at the top of its overshoot): the page shakes and eyes open all around */
  thump: 0.25 + EXTRUDE_AT + 0.16,
  /** the first time the moon opens its eye, after "don't look up" has been read and the calm picture has been seen */
  moon: 6.5,
  /** the Mournmoth's first visit */
  moth: 13,
};

/** toadstools glowing at the roots of the big trees */
const SHROOMS = [
  [14, 300],
  [19, 302],
  [200, 302],
  [195, 304],
  [205, 303],
];

const STAR_COLS = ['#d8ecff', '#9ff4ee', '#ffeccc', '#ffffff'];
const LEAF = '#040b14';
const FLY_WARM = '#ffe68c';
const FLY_COOL = '#96f5ff';

interface Star {
  x: number;
  y: number;
  b: number;
  sp: number;
  ph: number;
  /** 0 a point, 1 a point that flares into a small plus, 2 a big one with a cross */
  kind: 0 | 1 | 2;
  col: string;
}

interface Fly {
  hx: number;
  hy: number;
  ax: number;
  ay: number;
  sp: number;
  ph: number;
  warm: boolean;
  /** its depth, for the parallax (0.3 far .. 1 near) */
  d: number;
  /** pushed off its path (the pulse, the wind, a mouse's light), and its speed */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  /** where it is now, and how brightly it glows (this frame) */
  x: number;
  y: number;
  glow: number;
}

interface Eye {
  x: number;
  y: number;
  /** big ones are slit-pupilled pairs in the near dark; small ones are two pin-pricks far back */
  big: boolean;
  layer: 'far' | 'mid';
  age: number;
  life: number;
  blinks: number[];
  /** 0..1: scared shut by light */
  shut: number;
}

interface Kin {
  x: number;
  s: number;
  bow?: boolean;
  lx: number;
  ly: number;
  blinkT: number;
  nextBlink: number;
  glanceUntil: number;
  gx: number;
  gy: number;
  ph: number;
}

interface Blade {
  x: number;
  y: number;
  h: number;
  lean: number;
  ph: number;
  w: number;
  col: string;
  tip: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

/** where the Mournmoth is, and which wing beat (null while it is not here) */
type MothAt = { x: number; y: number; frame: number; u: number } | null;

interface Leaf {
  x: number;
  y: number;
  vx: number;
  ph: number;
  age: number;
}

/** the Mournmoth's wing beats, 9 x 7: W wing, L light, B body */
const MOTH = [
  ['.W.....W.', '.WW...WW.', '..WWBWW..', '...WBW...', '....B....', '.........', '.........'],
  ['.........', 'WW.....WW', 'LWW.B.WWL', '.WWWBWWW.', '..W.B.W..', '.........', '.........'],
  ['.........', '.........', '...WBW...', '..WWBWW..', '.WWLBLWW.', '.WW...WW.', '..W...W..'],
];
const MOTH_COL: Record<string, string> = { W: '#cfeee8', L: '#ffffff', B: '#9ff4ee' };

/** how the page is drawn at each quality: canvas pixels per scene pixel (a whole number where it can be: the pixel art stays
 * crisp and cannot shimmer), the least time between pictures, and which lights are drawn */
const QUALITY = [
  { k: 1.5, gap: 0.05, mist: false, rays: false, flies: 12, twinkle: 0, blades: 2 },
  { k: 2, gap: 0.04, mist: false, rays: true, flies: 24, twinkle: 30, blades: 1 },
  { k: 3, gap: 1 / 30, mist: true, rays: true, flies: 34, twinkle: 56, blades: 1 },
];

interface Sprites {
  warm: HTMLCanvasElement;
  cool: HTMLCanvasElement;
  red: HTMLCanvasElement;
  moth: HTMLCanvasElement;
  blue: HTMLCanvasElement;
  haloCool: HTMLCanvasElement;
  haloRed: HTMLCanvasElement;
  fan: HTMLCanvasElement;
  home: HTMLCanvasElement;
  mist: HTMLCanvasElement;
  bloom: HTMLCanvasElement;
  title: HTMLCanvasElement;
  vignette: HTMLCanvasElement;
}

export class Landing {
  /** the whole picture: the one canvas the page shows (device pixels, shown at the size of the stage) */
  readonly canvas = document.createElement('canvas');
  /** 0..1: how hard the moon is staring right now (the title's heart beats faster, the page darkens and reddens) */
  dread = 0;
  /** the title's heartbeat, 0..1 (set by whoever draws the title): the glow behind the title follows it */
  beat = 0;
  /** -1..1: where the picture is seen from (pointer, or the slow drift) */
  readonly view = { x: 0, y: 0 };
  /** how far the title should be moved to sit in the parallax, in CSS pixels (set by `draw`) */
  readonly titleAt = { x: 0, y: 0 };

  private sg: CanvasRenderingContext2D;
  /** the pixel layers */
  private layers: Record<LayerName, Pix>;
  /** the light, at half size */
  private glow = document.createElement('canvas');
  private gl: CanvasRenderingContext2D;
  private skyBase: HTMLCanvasElement;
  private moonImg: HTMLCanvasElement;
  private farBase: HTMLCanvasElement;
  private midBase: HTMLCanvasElement;
  private groundBase: HTMLCanvasElement;
  private nearBase: HTMLCanvasElement;
  private fog: HTMLCanvasElement[];
  private clouds: { img: HTMLCanvasElement; x0: number; y: number; sp: number }[] = [];
  private flowerOpen = makeFlower(true);
  private flowerShut = makeFlower(false);
  private sp: Sprites;

  private stars: Star[] = [];
  private starEyes: { x: number; y: number }[] = [];
  private flies: Fly[] = [];
  private eyes: Eye[] = [];
  private kin: Kin[];
  private back: Blade[] = [];
  private front: Blade[] = [];
  private fern: Blade[] = [];
  private flowers: { x: number; until: number; open: number }[] = [];
  private sparks: Spark[] = [];
  private leaves: Leaf[] = [];

  private aim = { x: 0, y: 0 };
  private aimAt = -99;
  private cursor: { x: number; y: number; at: number } | null = null;
  private now = 0;
  private last = 0;
  private seed = 7;

  /* the size of the picture */
  private cw = 0;
  private ch = 0;
  /** device pixels per scene pixel */
  private sc = 1;
  /** CSS pixels per scene pixel */
  private cssPerScene = 1;
  private cssW = 0;
  private dpr = 1;

  /* quality: how fast the phone really is, and what the page does about it */
  private q = 2;
  /** the time each of the last pictures took to make, and how long it was since the one before (a few seconds' worth) */
  private costs: number[] = [];
  private gaps: number[] = [];
  private judgeAt = 4.5;
  /** (tests) what the quality check saw, and when it stepped down */
  readonly trace: string[] = [];

  /* the director: when each thing last happened, and when it happens next */
  private moonAt = -99;
  private nextMoon = INTRO.moon;
  private mothAt = -99;
  private nextMoth = INTRO.moth;
  private shoot = { at: -99, x: 0, y: 0, vx: 0, vy: 0 };
  private nextShoot = 3.1;
  private gustAt = -99;
  private nextGust = 2.4;
  private hopAt = -99;
  private nextHop = 5.6;
  private nextEyes = 2.6;
  private nextBloom = 3;
  private thumped = false;
  private burstAt = -1;
  private sparkT = 0;

  constructor(private reduced = false) {
    this.layers = Object.fromEntries(LAYERS.map((n) => [n, new Pix(LW, LH)])) as Record<LayerName, Pix>;
    this.canvas.className = 'lscene';
    this.sg = this.canvas.getContext('2d', { alpha: false })!;
    this.glow.width = GW;
    this.glow.height = GH;
    this.gl = this.glow.getContext('2d')!;
    this.sp = {
      warm: glowSprite('255,214,120'),
      cool: glowSprite('150,245,255'),
      red: glowSprite('255,40,56'),
      moth: glowSprite('205,255,250'),
      blue: glowSprite('110,210,255'),
      haloCool: radialSprite(96, '150,240,235', [[0, 0.36], [0.236, 0.36], [0.465, 0.13], [1, 0]]),
      haloRed: radialSprite(96, '235,50,64', [[0, 0.36], [0.236, 0.36], [0.465, 0.13], [1, 0]]),
      fan: fanSprite(),
      home: radialSprite(64, '255,214,120', [[0, 0.44], [0.4, 0.16], [1, 0]], '255,170,80'),
      mist: mistSprite(),
      bloom: radialSprite(64, '255,236,170', [[0, 0.55], [1, 0]]),
      title: radialSprite(64, '224,43,58', [[0, 0.55], [0.45, 0.24], [1, 0]]),
      vignette: vignetteSprite(),
    };

    // the stars: thicker toward the top, more again along the band of dusk across the sky; none behind the moon. Most are baked
    // into the sky; the ones that twinkle are drawn every frame.
    const r = rng(7);
    const all: Star[] = [];
    const star = (x: number, y: number, dim: number) => {
      if (Math.hypot(x - MOON.x, y - MOON.y) < MOON.r + 3) return;
      const k = r();
      all.push({ x, y, b: (0.35 + r() * 0.65) * dim, sp: 0.5 + r() * 2.3, ph: r() * TAU, kind: k < 0.06 ? 2 : k < 0.3 ? 1 : 0, col: STAR_COLS[(r() * STAR_COLS.length) | 0]! });
    };
    for (let i = 0; i < 160; i++) star(-M + r() * LW, -M + Math.pow(r(), 1.5) * 248, 1);
    for (let i = 0; i < 80; i++) {
      const x = -M + r() * LW;
      star(x, 110 - 0.4167 * x + (r() - 0.5) * 34, 0.6);
    }
    // (the brightest and the ones with a cross twinkle: they are the ones the eye goes to)
    const ranked = [...all].sort((a, b) => b.b + b.kind * 0.4 - (a.b + a.kind * 0.4));
    this.stars = ranked.slice(0, QUALITY[2]!.twinkle);
    const still = ranked.slice(QUALITY[2]!.twinkle);
    // the stars that are not stars
    this.starEyes = [
      { x: 22, y: 10 },
      { x: 192, y: 14 },
      { x: 104, y: 6 },
      { x: 34, y: 150 },
      { x: 62, y: 192 },
      { x: 166, y: 142 },
      { x: 190, y: 194 },
      { x: 144, y: 212 },
    ];

    this.skyBase = this.makeSky(still);
    this.moonImg = this.makeMoon();
    this.farBase = this.makeFar();
    this.midBase = this.makeMid();
    this.groundBase = this.makeGround();
    this.nearBase = this.makeNear();
    this.fog = [this.makeFog(3, 30), this.makeFog(8, 22), this.makeFog(13, 14)];
    this.clouds = [
      { img: this.makeCloud(5, 104, 18), x0: 20, y: MOON.y - 14, sp: 2.4 },
      { img: this.makeCloud(9, 78, 14), x0: 200, y: MOON.y + 10, sp: 3.8 },
      { img: this.makeCloud(17, 124, 16), x0: 120, y: 112, sp: 1.6 },
    ];

    // fireflies: most around the clearing, some up in the air, a few close to the glass
    for (let i = 0; i < 34; i++) {
      const band = r();
      const hy = band < 0.5 ? 228 + r() * 70 : band < 0.8 ? 150 + r() * 80 : 300 + r() * 60;
      const d = band < 0.8 ? 0.35 + r() * 0.35 : 0.8 + r() * 0.25;
      this.flies.push({ hx: 6 + r() * 204, hy, ax: 5 + r() * 14, ay: 3 + r() * 9, sp: 0.25 + r() * 0.5, ph: r() * TAU, warm: r() < 0.62, d, ox: 0, oy: 0, vx: 0, vy: 0, x: 0, y: 0, glow: 0 });
    }

    this.kin = [
      { x: 79, s: 1.9, bow: true, lx: 0.6, ly: 0.2, blinkT: 0, nextBlink: 1.6, glanceUntil: 0, gx: 0, gy: 0, ph: 0 },
      { x: BABY.x, s: 1.15, lx: 0, ly: 0, blinkT: 0, nextBlink: 2.6, glanceUntil: 0, gx: 0, gy: 0, ph: 0.6 },
      { x: 137, s: 1.9, lx: -0.6, ly: 0.2, blinkT: 0, nextBlink: 3.3, glanceUntil: 0, gx: 0, gy: 0, ph: 1.3 },
    ];

    // grass on the lip of the clearing: a row behind the family and short tufts in front of their feet
    for (let x = -M; x < W + M; x += 2.4 + r() * 3.2) {
      const nearKin = Math.abs(x - BABY.x) < 46;
      const warm = Math.abs(x - BABY.x) < 34;
      const n = r() < 0.45 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        this.back.push({ x: x + (r() - 0.5) * 3, y: groundY(x) + 1, h: (nearKin ? 3 : 5) + r() * (nearKin ? 5 : 10), lean: (r() - 0.5) * 3, ph: r() * TAU, w: 1, col: '#0a2a31', tip: warm ? '#9a8a4a' : '#2a7a6c' });
      }
    }
    for (let x = BABY.x - 50; x < BABY.x + 50; x += 3 + r() * 4) {
      this.front.push({ x, y: groundY(x) + 3 + r() * 2, h: 2 + r() * 4, lean: (r() - 0.5) * 2, ph: r() * TAU, w: 1, col: '#071e25', tip: Math.abs(x - BABY.x) < 30 ? '#b8a456' : '#1f5c58' });
    }
    // tall dark ferns in the bottom corners, right against the glass
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const x = side < 0 ? -M + i * 8 + r() * 5 : W + M - i * 8 - r() * 5;
        this.fern.push({ x, y: H + M + 2, h: 26 + r() * 44 - i * 2.5, lean: side * -(4 + r() * 10), ph: r() * TAU, w: 3 + r() * 2.5, col: '#02050a', tip: '#0d2a33' });
      }
    }
    this.flowers = [44, 66, 96, 124, 150, 172].map((x, i) => ({ x, until: i === 2 || i === 3 ? 7 : 0, open: 0 }));
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /* ------------------------------------------------------------------------------------------------ size and speed */

  /** Fit the picture to the stage (CSS pixels, and the screen's device pixel ratio). */
  resize(cssW: number, dpr: number) {
    this.cssW = cssW;
    this.dpr = dpr;
    this.fit();
  }

  private fit() {
    // as many canvas pixels per scene pixel as the screen can show (a 3x phone does not need more than three for this), up to what
    // this quality allows
    const fits = this.cssW * Math.min(this.dpr, 2) / W;
    const k = fits >= 3 ? 3 : fits >= 2 ? 2 : Math.max(1.5, fits);
    const sc = Math.min(QUALITY[this.q]!.k, k);
    this.cssPerScene = this.cssW / W;
    const cw = Math.round(W * sc);
    const ch = Math.round(H * sc);
    // (setting a canvas' size clears it, even to the same size: a phone's address bar sliding in and out resizes the page again and
    // again, so only a real change counts, and the picture is put back at once, in the same moment, so no empty frame is ever shown)
    if (cw === this.cw && ch === this.ch) return;
    this.sc = sc;
    this.cw = cw;
    this.ch = ch;
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.compose(this.now);
  }

  /** The least time between two pictures (seconds): thirty a second, fewer on a phone that is busy, sixty while the pulse goes out. */
  get frameGap(): number {
    if (this.burstAt >= 0) return 1 / 60;
    return this.reduced ? 0.08 : QUALITY[this.q]!.gap;
  }

  /** the page stepped itself down (for tests, and so the page can say so) */
  get quality(): number {
    return this.q;
  }

  /** (tests) draw at a given quality, and stay there */
  forceQuality(q: number) {
    this.q = clamp(Math.round(q), 0, 2);
    this.judgeAt = 1e9;
    this.fit();
  }

  /**
   * Watch how long a picture takes and how often one is made: if the phone cannot keep up, give up something it will not miss.
   * It goes by the middle value of the last second or two, so one long pause (the game starting up, a garbage collection) does
   * not count, only a phone that is slow all the time. It only steps down, never back up: a page that changes its mind about its
   * look every few seconds is worse than a plainer one.
   */
  private judge(t: number, ms: number, gap: number) {
    this.costs.push(ms);
    this.gaps.push(gap);
    if (this.costs.length > 40) {
      this.costs.shift();
      this.gaps.shift();
    }
    if (this.q === 0 || this.burstAt >= 0 || this.costs.length < 20) return;
    const mid = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1]!;
    // (a picture that takes more than a frame and a half is too much for any phone: no need to wait for the start-up to settle)
    if (t > 1.5 && t < this.judgeAt && mid(this.costs) > 24) this.judgeAt = t;
    if (t < this.judgeAt) return;
    const cost = mid(this.costs);
    const gapNow = mid(this.gaps);
    // (a picture that takes a good part of a frame, or pictures that come at well under the rate they are asked for)
    const slow = cost > 9 || gapNow > QUALITY[this.q]!.gap * 1.45;
    if (this.trace.length < 24) this.trace.push(`${t.toFixed(1)}s q${this.q} cost ${cost.toFixed(1)}ms gap ${(gapNow * 1000).toFixed(0)}ms${slow ? ' -> step down' : ''}`);
    this.judgeAt = t + 1;
    if (!slow) return;
    // far too slow (a phone drawing the canvas on its processor): skip a step
    this.q = cost > 24 ? 0 : this.q - 1;
    this.costs = [];
    this.gaps = [];
    this.fit();
  }

  /* ------------------------------------------------------------------------------------------------ input */

  /** The pointer moved over the page: (u, v) in 0..1 of the stage. A mouse also carries a little light the eyes are afraid of. */
  point(u: number, v: number, mouse: boolean) {
    this.aim.x = clamp(u * 2 - 1, -1, 1);
    this.aim.y = clamp(v * 2 - 1, -1, 1);
    this.aimAt = this.now;
    if (mouse) this.cursor = { x: u * W, y: v * H, at: this.now };
  }

  unpoint() {
    this.cursor = null;
    this.aimAt = -99;
  }

  /** The tap: the baby's pulse of light goes out over everything. */
  burst(t: number) {
    if (this.burstAt >= 0) return;
    this.burstAt = t;
    for (const f of this.flies) {
      const dx = f.x - BABY.x;
      const dy = f.y - BABY.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 140 + 160 * this.rand();
      f.vx += (dx / d) * sp;
      f.vy += (dy / d) * sp;
    }
  }

  /** the pulse is going out */
  get busy() {
    return this.burstAt >= 0;
  }

  /* ------------------------------------------------------------------------------------------------ the parallax */

  private slide(d: number) {
    return { x: -this.view.x * SWING * d, y: -this.view.y * SWING * d * 0.7 };
  }

  /** the thump's shake, in scene pixels */
  private shake(t: number) {
    const u = t - INTRO.thump;
    if (this.reduced || u < 0 || u > 0.4) return { x: 0, y: 0 };
    const a = 1.1 * (1 - u / 0.4) ** 2;
    return { x: Math.sin(u * 91) * a, y: Math.cos(u * 77) * a };
  }

  /* ------------------------------------------------------------------------------------------------ the director */

  private direct(t: number, dt: number) {
    if (!this.thumped && t >= INTRO.thump) {
      this.thumped = true;
      if (!this.reduced) this.chorus(7, 1.5);
    }
    if (this.burstAt >= 0) return;
    const busy = t - this.moonAt < 5.4 || t - this.mothAt < 8.2;
    if (t >= this.nextMoon && !busy) {
      this.moonAt = t;
      this.nextMoon = t + (this.reduced ? 30 : 22) + this.rand() * 8;
    }
    if (t >= this.nextMoth && !busy) {
      this.mothAt = t;
      this.sparks = [];
      this.nextMoth = t + 19 + this.rand() * 7;
    }
    if (t >= this.nextShoot) {
      const left = this.rand() < 0.5;
      const high = this.rand() < 0.3;
      const sp = 150 + this.rand() * 60;
      const a = high ? 0.12 : 0.38 + this.rand() * 0.2;
      this.shoot = { at: t, x: left ? 70 - this.rand() * 40 : 146 + this.rand() * 40, y: high ? 6 + this.rand() * 10 : 128 + this.rand() * 18, vx: (left ? -1 : 1) * Math.cos(a) * sp, vy: Math.sin(a) * sp };
      this.nextShoot = t + 7 + this.rand() * 8;
    }
    if (t >= this.nextGust) {
      this.gustAt = t;
      this.nextGust = t + 6 + this.rand() * 5;
      if (!this.reduced) for (let i = 0; i < 2; i++) this.leaves.push({ x: this.rand() < 0.5 ? 10 + this.rand() * 40 : 170 + this.rand() * 40, y: 10 + this.rand() * 20, vx: 6 + this.rand() * 8, ph: this.rand() * TAU, age: 0 });
    }
    if (t >= this.nextHop) {
      this.hopAt = t;
      this.nextHop = t + 5 + this.rand() * 4;
    }
    if (t >= this.nextBloom) {
      const f = this.flowers[(this.rand() * this.flowers.length) | 0]!;
      f.until = Math.max(f.until, t + 3 + this.rand() * 3);
      this.nextBloom = t + 2.5 + this.rand() * 3;
    }
    if ((this.nextEyes -= dt) <= 0) {
      this.nextEyes = 2.4 + this.rand() * 3;
      if (this.eyes.filter((e) => e.big).length < 3) this.spawnEye(this.rand() < 0.7, 3 + this.rand() * 2.6);
    }
  }

  private spawnEye(big: boolean, life: number, delay = 0) {
    const left = this.rand() < 0.5;
    const x = big ? (left ? 16 + this.rand() * 40 : 160 + this.rand() * 40) : 10 + this.rand() * 196;
    const y = big ? 240 + this.rand() * 44 : 214 + this.rand() * 16;
    if (this.eyes.some((e) => Math.abs(e.x - x) < 16 && Math.abs(e.y - y) < 10)) return;
    const blinks = [0.8 + this.rand() * 1.2];
    if (this.rand() < 0.4) blinks.push(blinks[0]! + 0.22);
    this.eyes.push({ x, y, big, layer: big ? 'mid' : 'far', age: -delay, life, blinks, shut: 0 });
  }

  /** many eyes at once, all round the edges */
  private chorus(n: number, life: number) {
    for (let i = 0; i < n; i++) this.spawnEye(i % 3 !== 2, life + this.rand() * 0.6, this.rand() * 0.35);
  }

  /** the moon's stare: 0..1 open, and how the eye looks (scene pixels) */
  private moonEye(t: number) {
    const u = t - this.moonAt;
    if (u < 0 || u > 5.4) return { open: 0, lx: 0, ly: 0 };
    let open = smooth((u - 1.1) / 0.6) * (1 - smooth((u - 4)) );
    // it narrows once, as if it is making sure
    open *= 1 - 0.4 * Math.exp(-(((u - 2.7) / 0.14) ** 2));
    if (this.burstAt >= 0) open *= 1 - clamp((t - this.burstAt) / 0.12, 0, 1);
    let lx = 2.6 * Math.sin((u - 1.2) * 1.5);
    let ly = 3.2;
    if (this.cursor && t - this.cursor.at < 2) {
      lx = clamp((this.cursor.x - MOON.x) / 14, -4, 4);
      ly = clamp((this.cursor.y - MOON.y) / 14, -2, 4);
    }
    return { open, lx, ly };
  }

  /** how afraid the page is: it rises over a second as the moon opens its eye, and eases away over a second and a half */
  private dreadAt(t: number) {
    const u = t - this.moonAt;
    if (u < 0 || u > 5.4) return 0;
    const d = smooth((u - 0.3) / 1.1) * (1 - smooth((u - 3.9) / 1.4));
    return this.burstAt >= 0 ? d * (1 - clamp((t - this.burstAt) / 0.2, 0, 1)) : d;
  }

  /** the wind: a breath of it always, gusts now and then (none while the moon stares) */
  private wind(t: number) {
    return (0.25 + 0.75 * this.windGust(t)) * (1 - 0.8 * this.dread) * (this.reduced ? 0.4 : 1);
  }

  private windGust(t: number) {
    const u = t - this.gustAt;
    return u < 0 ? 0 : smooth(u / 0.8) * (1 - smooth((u - 1.6) / 1.6));
  }

  /** where the Mournmoth is (scene pixels) and which wing beat, or null when it is not here */
  private moth(t: number): MothAt {
    const u = t - this.mothAt;
    if (u < 0 || u > 8.2) return null;
    let x: number;
    let y: number;
    if (u < 2.6) {
      // down from the moon in a long lazy S
      const e = smooth(u / 2.6);
      x = MOON.x + 16 + (BABY.x - MOON.x - 16) * e + 22 * Math.sin(e * Math.PI * 1.5);
      y = MOON.y + 4 + (BABY.y - 20 - MOON.y - 4) * e;
    } else if (u < 5.6) {
      // round the baby, twice
      const a = (u - 2.6) * 2.3 - Math.PI / 2;
      x = BABY.x + 15 * Math.cos(a);
      y = BABY.y - 16 + 5 * Math.sin(a);
    } else {
      // and away, up past the trees
      const e = smooth((u - 5.6) / 2.6);
      const a = 3 * 2.3 - Math.PI / 2;
      const x0 = BABY.x + 15 * Math.cos(a);
      const y0 = BABY.y - 16 + 5 * Math.sin(a);
      x = x0 + (W + 20 - x0) * e + 10 * Math.sin(e * 5);
      y = y0 + (120 - y0) * e;
    }
    y += Math.sin(u * 13) * 1.2;
    const beat = Math.floor(u * 11) % 4;
    return { x, y, frame: beat === 3 ? 1 : beat, u };
  }

  /* ------------------------------------------------------------------------------------------------ drawing */

  /**
   * Make the picture for time `t` (seconds since the page was shown) and put it on the canvas. Sets `titleAt`.
   * Call it no more often than `frameGap`.
   */
  draw(t: number) {
    const t0 = performance.now();
    const rawDt = this.last ? t - this.last : 1 / 30;
    const dt = clamp(rawDt, 0, 0.1);
    this.last = t;
    this.now = t;
    // the point of view: where the pointer is, or, when nobody is steering, a slow drift like breathing
    if (this.reduced) {
      this.aim.x = this.aim.y = 0;
    } else if (t - this.aimAt > 2.5) {
      this.aim.x = 0.5 * Math.sin(t * 0.21) + 0.12 * Math.sin(t * 0.53);
      this.aim.y = 0.32 * Math.sin(t * 0.16 + 1.1);
    }
    const k = 1 - Math.exp(-dt * 2.8);
    this.view.x += (this.aim.x - this.view.x) * k;
    this.view.y += (this.aim.y - this.view.y) * k;

    this.direct(t, dt);
    this.dread = this.dreadAt(t);
    const eye = this.moonEye(t);
    const moth = this.moth(t);
    this.updateEyes(t, dt, moth);
    this.drawBack(t, eye);
    this.drawMid(t);
    this.drawGround(t, dt, moth);
    this.drawNear(t, dt);
    this.drawGlow(t, eye, moth);
    this.compose(t);
    this.judge(t, performance.now() - t0, rawDt);
  }

  /** the four pixel layers and the light, put together (the only thing the page has to show) */
  private compose(t: number) {
    const g = this.sg;
    const sc = this.sc;
    const sh = this.shake(t);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    for (const n of LAYERS) {
      if (n === 'near') {
        // the light goes over everything but the boughs and ferns right in front of the glass
        g.imageSmoothingEnabled = true;
        g.globalCompositeOperation = 'lighter';
        g.drawImage(this.glow, Math.round(-M * sc), Math.round(-M * sc), LW * sc, LH * sc);
        g.globalCompositeOperation = 'source-over';
      }
      g.imageSmoothingEnabled = false;
      const s = this.slide(DEPTH[n]);
      g.drawImage(this.layers[n].canvas, Math.round((s.x + sh.x - M) * sc), Math.round((s.y + sh.y - M) * sc), LW * sc, LH * sc);
    }
    // while the moon stares the whole picture goes dark and red
    if (this.dread > 0.01) {
      g.fillStyle = `rgba(70,4,14,${(0.36 * this.dread).toFixed(3)})`;
      g.fillRect(0, 0, this.cw, this.ch);
    }
    g.imageSmoothingEnabled = true;
    g.drawImage(this.sp.vignette, 0, 0, this.cw, this.ch);
    // it comes up out of black
    const up = 1 - smooth(t / 1.2);
    if (up > 0.004) {
      g.globalAlpha = up;
      g.fillStyle = '#000';
      g.fillRect(0, 0, this.cw, this.ch);
      g.globalAlpha = 1;
    }
    const st = this.slide(0.7);
    this.titleAt.x = (st.x + sh.x * 0.6) * this.cssPerScene;
    this.titleAt.y = (st.y + sh.y * 0.6) * this.cssPerScene;
  }

  private updateEyes(t: number, dt: number, moth: { x: number; y: number } | null) {
    const ring = this.ringR(t);
    for (let i = this.eyes.length - 1; i >= 0; i--) {
      const e = this.eyes[i]!;
      e.age += dt;
      const lit =
        (ring > 0 && Math.hypot(e.x - BABY.x, e.y - BABY.y) < ring) ||
        (moth !== null && Math.hypot(e.x - moth.x, e.y - moth.y) < 22) ||
        (this.cursor !== null && t - this.cursor.at < 1.5 && Math.hypot(e.x - this.cursor.x, e.y - this.cursor.y) < 30);
      if (lit && e.age > 0) e.shut = Math.min(1, e.shut + dt * 10);
      if (e.age > e.life || e.shut >= 1) this.eyes.splice(i, 1);
    }
  }

  private eyeOpen(e: Eye) {
    const a = e.age;
    if (a <= 0) return 0;
    let o = smooth(a / 0.3) * (1 - smooth((a - (e.life - 0.3)) / 0.3));
    for (const b of e.blinks) if (Math.abs(a - b) < 0.075) o *= 0.08;
    return o * (1 - e.shut);
  }

  /** the pulse's radius in scene pixels (0 before the tap) */
  private ringR(t: number) {
    if (this.burstAt < 0) return 0;
    return 6 + 340 * easeOutCubic((t - this.burstAt) / 0.75);
  }

  /** the sky, the moon and its eye, the clouds, and the far trees with their fog and the eyes among them */
  private drawBack(t: number, eye: { open: number; lx: number; ly: number }) {
    const p = this.layers.back;
    const g = p.ctx;
    const Q = QUALITY[this.q]!;
    g.globalAlpha = 1;
    g.drawImage(this.skyBase, 0, 0);
    // the stars that twinkle (the rest are in the picture)
    for (let i = 0; i < Q.twinkle; i++) {
      const s = this.stars[i]!;
      const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
      const a = s.b * tw;
      if (a < 0.08) continue;
      const x = Math.round(s.x + M);
      const y = Math.round(s.y + M);
      g.globalAlpha = a;
      g.fillStyle = s.col;
      g.fillRect(x, y, 1, 1);
      if (s.kind === 2 || (s.kind === 1 && tw > 0.86)) {
        const L = s.kind === 2 && tw > 0.75 ? 2 : 1;
        g.globalAlpha = a * 0.45;
        g.fillRect(x - L, y, L, 1);
        g.fillRect(x + 1, y, L, 1);
        g.fillRect(x, y - L, 1, L);
        g.fillRect(x, y + 1, 1, L);
      }
    }
    // the stars that are eyes: two points that, while the moon stares, turn red and open
    const u = t - this.moonAt;
    this.starEyes.forEach((se, i) => {
      const o = u < 0 || u > 5.4 ? 0 : smooth((u - 1.3 - i * 0.14) / 0.3) * (1 - smooth((u - 3.9 - i * 0.06) / 0.4)) * (this.burstAt >= 0 ? 0 : 1);
      const x = Math.round(se.x + M);
      const y = Math.round(se.y + M);
      if (o < 0.3) {
        g.globalAlpha = 0.55 + 0.25 * Math.sin(t * 1.3 + i);
        g.fillStyle = STAR_COLS[0]!;
        g.fillRect(x, y, 1, 1);
        g.fillRect(x + 4, y, 1, 1);
      } else {
        g.globalAlpha = o;
        g.fillStyle = C.redDark;
        g.fillRect(x - 2, y - 1, 9, 3);
        g.fillStyle = C.red;
        g.fillRect(x - 1, y, 3, 1);
        g.fillRect(x + 3, y, 3, 1);
        g.fillStyle = '#ffb4b4';
        g.fillRect(x, y, 1, 1);
        g.fillRect(x + 4, y, 1, 1);
      }
    });
    // a shooting star
    const su = t - this.shoot.at;
    if (su >= 0 && su < 0.6) {
      const sx = this.shoot.x + this.shoot.vx * su + M;
      const sy = this.shoot.y + this.shoot.vy * su + M;
      const sp = Math.hypot(this.shoot.vx, this.shoot.vy);
      const fade = 1 - smooth((su - 0.35) / 0.25);
      for (let k = 0; k < 12; k++) {
        g.globalAlpha = fade * (1 - k / 12) * (k === 0 ? 1 : 0.7);
        g.fillStyle = k < 2 ? '#ffffff' : '#bfefff';
        g.fillRect(Math.round(sx - (this.shoot.vx / sp) * k), Math.round(sy - (this.shoot.vy / sp) * k), 1, 1);
      }
    }
    // the moon, its eye, and the clouds going over it
    g.globalAlpha = 1;
    const mx = MOON.x + M;
    const my = MOON.y + M;
    g.drawImage(this.moonImg, Math.round(mx - this.moonImg.width / 2), Math.round(my - this.moonImg.height / 2));
    if (eye.open > 0.02) this.drawMoonEye(p, mx, my, eye.open, eye.lx, eye.ly);
    for (const c of this.clouds) {
      const span = LW + c.img.width + 40;
      const x = ((((c.x0 + t * c.sp) % span) + span) % span) - c.img.width - 20;
      g.globalAlpha = 0.86;
      g.drawImage(c.img, Math.round(x), Math.round(c.y + M));
    }
    g.globalAlpha = 1;
    // the far trees stand in front of the sky
    g.drawImage(this.farBase, 0, 0);
    this.drawEyes(p, 'far');
    this.drawFog(p, this.fog[0]!, 212 + M, t * 3.2 * (1 + 2 * this.windGust(t)), 0.22);
  }

  /**
   * The moon opens an eye: an almond-shaped opening in its face (the lids are the moon itself), a sickly white, a red iris with a
   * black slit that looks about, and a glint.
   */
  private drawMoonEye(p: Pix, x: number, y: number, open: number, lx: number, ly: number) {
    const g = p.ctx;
    const r = MOON.r;
    const hw = r * 0.8;
    const hh = r * 0.46 * open;
    x = Math.round(x);
    y = Math.round(y);
    // the shadow of the lids around the opening
    p.dither(x, y, hw + 3, hh + 3, '#1c4a52', 0.6);
    if (hh < 0.8) {
      p.rect(x - hw * 0.8, y, hw * 1.6, 1, '#2a0810');
      return;
    }
    const ir = r * 0.36;
    const icx = x + lx * open;
    const icy = y + ly * open * 0.55;
    const y0 = Math.floor(y - hh) - 1;
    const y1 = Math.ceil(y + hh) + 1;
    for (let row = y0; row <= y1; row++) {
      const v = (row + 0.5 - y) / (hh + 1);
      if (Math.abs(v) >= 1) continue;
      const half = (hw + 1) * Math.pow(1 - v * v, 0.75);
      const xa = Math.round(x - half);
      const xb = Math.round(x + half);
      // the lid's edge, then the white inside it
      g.fillStyle = '#2a0810';
      g.fillRect(xa, row, xb - xa, 1);
      const vi = (row + 0.5 - y) / hh;
      if (Math.abs(vi) >= 1) continue;
      const hi = hw * Math.pow(1 - vi * vi, 0.75);
      const a = Math.round(x - hi);
      const b = Math.round(x + hi);
      if (b <= a) continue;
      g.fillStyle = Math.abs(vi) > 0.7 ? '#bfae86' : '#eadfb8';
      g.fillRect(a, row, b - a, 1);
      // the iris and its slit, cut off by the lids
      const iy = (row + 0.5 - icy) / ir;
      if (Math.abs(iy) < 1) {
        const ih = ir * Math.sqrt(1 - iy * iy);
        const ia = Math.max(a, Math.round(icx - ih));
        const ib = Math.min(b, Math.round(icx + ih));
        if (ib > ia) {
          g.fillStyle = '#5a0a16';
          g.fillRect(ia, row, ib - ia, 1);
          if (ib - ia > 2) {
            g.fillStyle = iy < -0.3 ? '#ff5864' : iy < 0.45 ? '#d42634' : '#9a1626';
            g.fillRect(ia + 1, row, ib - ia - 2, 1);
          }
          const pw = Math.max(1, Math.round(ir * 0.24 * (1 - Math.abs(iy) * 0.55)));
          const pa = Math.max(ia, Math.round(icx - pw / 2));
          g.fillStyle = '#0a0306';
          g.fillRect(pa, row, Math.max(0, Math.min(pw, ib - pa)), 1);
        }
      }
    }
    // veins in the corners, and a glint
    g.fillStyle = '#c4404a';
    g.fillRect(Math.round(x - hw * 0.72), y, 3, 1);
    g.fillRect(Math.round(x + hw * 0.62), y - 1, 3, 1);
    if (hh > 3) p.px(icx - ir * 0.38, icy - ir * 0.42, '#ffffff');
  }

  private drawMid(t: number) {
    const p = this.layers.mid;
    const g = p.ctx;
    g.clearRect(0, 0, LW, LH);
    g.drawImage(this.midBase, 0, 0);
    this.drawEyes(p, 'mid');
    this.drawFog(p, this.fog[1]!, 262 + M, -t * 5 * (1 + 2 * this.windGust(t)), 0.17);
  }

  private drawFog(p: Pix, img: HTMLCanvasElement, y: number, offset: number, alpha: number) {
    const w = img.width;
    const x0 = ((offset % w) + w) % w;
    p.ctx.globalAlpha = alpha * (1 - 0.5 * this.dread);
    p.ctx.drawImage(img, -x0, y);
    p.ctx.drawImage(img, w - x0, y);
    p.ctx.globalAlpha = 1;
  }

  private drawEyes(p: Pix, layer: 'far' | 'mid') {
    const g = p.ctx;
    for (const e of this.eyes) {
      if (e.layer !== layer) continue;
      const o = this.eyeOpen(e);
      if (o <= 0.05) continue;
      const x = e.x + M;
      const y = e.y + M;
      if (e.big) {
        // they watch the mouse's light if there is one, the baby if not
        const tx = this.cursor && this.now - this.cursor.at < 2 ? this.cursor.x : BABY.x;
        drawRedEyes(p, x, y, o, clamp((tx - e.x) / 50, -1, 1), 1);
      } else {
        g.globalAlpha = o;
        g.fillStyle = C.red;
        g.fillRect(Math.round(x), Math.round(y), 2, 1);
        g.fillRect(Math.round(x + 4), Math.round(y), 2, 1);
        g.globalAlpha = 1;
      }
    }
  }

  private flyPos(f: Fly, t: number) {
    const slow = 1 - 0.6 * this.dread;
    const tt = t * slow;
    f.x = f.hx + Math.sin(tt * f.sp + f.ph) * f.ax + Math.sin(tt * f.sp * 2.3 + f.ph * 1.7) * f.ax * 0.35 + f.ox;
    f.y = f.hy + Math.cos(tt * f.sp * 0.8 + f.ph * 1.3) * f.ay + f.oy;
  }

  private drawGround(t: number, dt: number, moth: MothAt) {
    const p = this.layers.ground;
    const g = p.ctx;
    const Q = QUALITY[this.q]!;
    g.clearRect(0, 0, LW, LH);
    g.drawImage(this.groundBase, 0, 0);
    const wind = this.wind(t);
    const ring = this.ringR(t);

    // the flowers open for a while now and then, when the Mournmoth passes, and when the pulse goes over them
    for (const f of this.flowers) {
      const y = groundY(f.x);
      if (moth && Math.hypot(moth.x - f.x, moth.y - y) < 16) f.until = Math.max(f.until, t + 3);
      if (ring > 0 && Math.abs(f.x - BABY.x) < ring) f.until = t + 5;
      const want = t < f.until && this.dread < 0.3 ? 1 : 0;
      f.open += (want - f.open) * (1 - Math.exp(-dt * 5));
      g.drawImage(f.open > 0.5 ? this.flowerOpen : this.flowerShut, Math.round(f.x + M - 6), Math.round(y + M - 15));
    }
    this.drawBlades(p, this.back, t, wind, 1, Q.blades);

    // the family: they breathe and blink, glance at each other, look where something moves, and look up when the moon does
    const u = t - this.moonAt;
    const staring = u > 0.6 && u < 4.6 && this.burstAt < 0;
    const hu = (t - this.hopAt) / 0.52;
    const bu = this.burstAt >= 0 ? t - this.burstAt : -1;
    const cur = this.cursor && t - this.cursor.at < 2.5 ? this.cursor : null;
    this.kin.forEach((k, i) => {
      let tx: number;
      let ty: number;
      if (bu >= 0) {
        tx = i === 1 ? 0 : i === 0 ? 0.8 : -0.8;
        ty = i === 1 ? -0.4 : 0.3;
      } else if (staring && u > 0.6 + (i === 1 ? 0.25 : 0)) {
        tx = clamp((MOON.x - k.x) / 40, -1, 1);
        ty = -1;
      } else if (moth && moth.u > 0.6) {
        tx = clamp((moth.x - k.x) / 24, -1, 1);
        ty = clamp((moth.y - (BABY.y - 12)) / 14, -1, 1);
      } else if (i === 1 && cur) {
        tx = clamp((cur.x - k.x) / 40, -1, 1);
        ty = clamp((cur.y - (BABY.y - 8)) / 50, -1, 1);
      } else {
        if (t > k.glanceUntil + 2.5 + k.ph * 2) {
          // a glance: at the sky, at the dark, or straight out of the screen
          const r = this.rand();
          k.gx = r < 0.33 ? (this.rand() - 0.5) * 1.6 : 0;
          k.gy = r < 0.33 ? -0.7 : r < 0.66 ? 0.1 : 0;
          if (r >= 0.66) k.gx = (this.rand() < 0.5 ? -1 : 1) * 0.9;
          k.glanceUntil = t + 1.2 + this.rand() * 1.2;
        }
        const glancing = t < k.glanceUntil;
        if (i === 1) {
          tx = glancing ? k.gx : 0.75 * Math.sin(t * 0.42);
          ty = glancing ? k.gy : 0.25 * Math.sin(t * 0.33) - 0.1;
        } else {
          // the parents keep an eye on the baby
          tx = glancing ? k.gx : i === 0 ? 0.7 : -0.7;
          ty = glancing ? k.gy : 0.25;
        }
      }
      const e = 1 - Math.exp(-dt * 9);
      k.lx += (tx - k.lx) * e;
      k.ly += (ty - k.ly) * e;
      // blinking (not while staring at the moon: nobody blinks then)
      k.nextBlink -= dt;
      if (k.nextBlink <= 0 && !staring) {
        k.blinkT = 0.13;
        k.nextBlink = 1.8 + this.rand() * 3.6;
        if (this.rand() < 0.25) k.nextBlink = 0.3;
      }
      k.blinkT -= dt;
      let squash = 1 + 0.03 * Math.sin(t * 1.9 + k.ph * 3);
      let dx = 0;
      let dy = 0;
      if (staring) {
        // they tremble a little, and the parents lean in over the baby
        squash += 0.03 * Math.sin(t * 29 + i * 2);
        dx = (i === 0 ? 2 : i === 2 ? -2 : 0) * smooth((u - 0.8) / 0.7);
      }
      if (i === 1 && hu >= 0 && hu < 1 && bu < 0) {
        // the baby hops: down, up, and a squash on landing
        if (hu < 0.16) squash *= 1 - 0.18 * Math.sin((hu / 0.16) * Math.PI);
        else if (hu < 0.86) {
          squash *= 1.1;
          dy = -7 * Math.sin(((hu - 0.16) / 0.7) * Math.PI);
        } else squash *= 1 - 0.14 * Math.sin(((hu - 0.86) / 0.14) * Math.PI);
      }
      if (bu >= 0) {
        // the pulse: the baby stretches up as the light leaves it; the parents flinch
        squash *= i === 1 ? 1 + 0.3 * Math.exp(-bu / 0.12) : 1 - 0.1 * Math.exp(-bu / 0.2);
      }
      drawBlob(p, k.x + M + dx, groundY(k.x) + M + 1 + dy, { s: k.s, squash, lookX: k.lx, lookY: k.ly, blink: k.blinkT > 0 ? 1 : 0, bow: k.bow });
    });
    this.drawBlades(p, this.front, t, wind, 0.7, Q.blades);

    // the fireflies (each at its own depth: the layer slides as the ground does, they slide as their depth does)
    const sg = this.slide(DEPTH.ground);
    const dim = (1 - 0.7 * this.dread) * smooth((t - 0.3) / 1.2);
    for (let i = 0; i < this.flies.length; i++) {
      const f = this.flies[i]!;
      // pushed off course: the wind leans on them, a mouse's light draws them in, and they drift back
      f.vx += wind * 10 * dt;
      if (cur) {
        const dd = Math.hypot(cur.x - f.x, cur.y - f.y);
        if (dd < 60 && dd > 6) {
          f.vx += ((cur.x - f.x) / dd) * 26 * dt;
          f.vy += ((cur.y - f.y) / dd) * 26 * dt;
        }
      }
      f.vx -= f.ox * 0.8 * dt;
      f.vy -= f.oy * 0.8 * dt;
      const damp = Math.exp(-dt * (bu >= 0 ? 0.6 : 1.6));
      f.vx *= damp;
      f.vy *= damp;
      f.ox += f.vx * dt;
      f.oy += f.vy * dt;
      this.flyPos(f, t);
      f.glow = i < Q.flies ? (0.5 + 0.5 * Math.sin(t * 1.5 + f.ph * 3)) * dim * (bu >= 0 ? 1.4 : 1) : 0;
      if (f.glow < 0.1) continue;
      const sf = this.slide(f.d);
      const px = Math.round(f.x + M + sf.x - sg.x);
      const py = Math.round(f.y + M + sf.y - sg.y);
      g.fillStyle = f.warm ? FLY_WARM : FLY_COOL;
      g.globalAlpha = Math.min(1, 0.2 * f.glow);
      g.fillRect(px - 1, py, 3, 1);
      g.fillRect(px, py - 1, 1, 3);
      g.globalAlpha = Math.min(1, 0.35 + 0.65 * f.glow);
      g.fillRect(px, py, 1, 1);
    }
    g.globalAlpha = 1;

    // the Mournmoth and its trail of moon dust
    this.sparkT -= dt;
    if (moth && this.sparkT <= 0) {
      this.sparkT = 0.05;
      this.sparks.push({ x: moth.x + (this.rand() - 0.5) * 3, y: moth.y + 2, vx: (this.rand() - 0.5) * 8, vy: 4 + this.rand() * 8, age: 0, life: 0.6 + this.rand() * 0.5 });
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.age += dt;
      if (s.age > s.life) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      g.globalAlpha = 1 - s.age / s.life;
      g.fillStyle = s.age < s.life * 0.4 ? '#e8fffb' : C.moon;
      g.fillRect(Math.round(s.x + M), Math.round(s.y + M), 1, 1);
    }
    g.globalAlpha = 1;
    if (moth) {
      const rows = MOTH[moth.frame]!;
      const ox = Math.round(moth.x + M - 4);
      const oy = Math.round(moth.y + M - 3);
      rows.forEach((row, j) => {
        for (let k = 0; k < row.length; k++) {
          const c = MOTH_COL[row[k]!];
          if (c) {
            g.fillStyle = c;
            g.fillRect(ox + k, oy + j, 1, 1);
          }
        }
      });
    }

    // the pulse: a ring of light going out from the baby, the same as a tap in the game
    if (ring > 0) {
      const bu2 = t - this.burstAt;
      const fade = 1 - smooth((bu2 - 0.35) / 0.45);
      const cx = BABY.x + M;
      const cy = BABY.y - 6 + M;
      // its wake: a band of scattered light just inside the ring
      g.fillStyle = C.blobLight;
      for (let k = 0; k < 90; k++) {
        const a = (k / 90) * TAU + bu2 * 3;
        const rr = ring * (0.8 + 0.18 * hash2(k, Math.floor(bu2 * 30)));
        g.globalAlpha = 0.6 * fade * hash2(k * 7, 3);
        g.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 1, 1);
      }
      g.globalAlpha = fade;
      this.ringPx(g, cx, cy, ring, Math.max(2, 8 * (1 - bu2 / 0.75)), '#fff1a6');
      this.ringPx(g, cx, cy, ring + 3, 1, C.white);
      g.globalAlpha = 1;
    }
    // a low wisp of fog along the lip of the clearing, over their feet
    this.drawFog(p, this.fog[2]!, 286 + M, t * 6 * (1 + 2 * this.windGust(t)), 0.1);
  }

  /** a ring of whole pixels, `th` thick, only the rows that are on the layer */
  private ringPx(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, th: number, col: string) {
    g.fillStyle = col;
    const ri = Math.max(0, r - th);
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(LH - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      if (Math.abs(dy) > r) continue;
      const ho = Math.sqrt(r * r - dy * dy);
      const hi = Math.abs(dy) < ri ? Math.sqrt(ri * ri - dy * dy) : 0;
      const xo0 = Math.round(cx - ho);
      const xo1 = Math.round(cx + ho);
      if (hi <= 0) {
        g.fillRect(xo0, y, xo1 - xo0, 1);
      } else {
        const xi0 = Math.round(cx - hi);
        const xi1 = Math.round(cx + hi);
        g.fillRect(xo0, y, xi0 - xo0, 1);
        g.fillRect(xi1, y, xo1 - xi1, 1);
      }
    }
  }

  /** grass: each blade bends with the wind from its root, more toward the tip (a run of rows that line up is one rectangle) */
  private drawBlades(p: Pix, blades: Blade[], t: number, wind: number, k: number, every = 1) {
    const g = p.ctx;
    for (let bi = 0; bi < blades.length; bi += every) {
      const b = blades[bi]!;
      const sway = (Math.sin(t * 1.7 + b.x * 0.09 + b.ph) * (0.5 + wind) + wind * 2.4) * k;
      const rows = Math.max(2, Math.round(b.h));
      const by = Math.round(b.y + M);
      let start = 0;
      let rx = 0;
      let rw = 0;
      let rc = '';
      for (let j = 0; j <= rows; j++) {
        let x = 0;
        let w = 0;
        let c = '';
        if (j < rows) {
          const f = j / rows;
          w = Math.max(1, Math.round(b.w * (1 - f)));
          x = Math.round(b.x + M + (b.lean + sway * (b.h / 8)) * f * f - w / 2);
          c = j >= rows - 1 ? b.tip : b.col;
        }
        if (j > 0 && (j === rows || x !== rx || w !== rw || c !== rc)) {
          g.fillStyle = rc;
          g.fillRect(rx, by - (j - 1), rw, j - start);
          start = j;
        }
        rx = x;
        rw = w;
        rc = c;
      }
    }
  }

  private drawNear(t: number, dt: number) {
    const p = this.layers.near;
    const g = p.ctx;
    g.clearRect(0, 0, LW, LH);
    const wind = this.wind(t);
    // the boughs at the top shift a pixel in the wind
    g.drawImage(this.nearBase, Math.round(Math.sin(t * 0.9) * 0.6 + wind * 1.2), 0);
    this.drawBlades(p, this.fern, t, wind, 1.6);
    // a leaf or two let go in a gust and see-saw down
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const l = this.leaves[i]!;
      l.age += dt;
      l.x += (l.vx + wind * 14) * dt;
      l.y += 16 * dt;
      if (l.y > H + 10) {
        this.leaves.splice(i, 1);
        continue;
      }
      const sx = Math.round(l.x + M + Math.sin(l.age * 2.6 + l.ph) * 6);
      const sy = Math.round(l.y + M);
      const flat = Math.sin(l.age * 5.2 + l.ph) > 0;
      g.fillStyle = '#0b2a2c';
      g.fillRect(sx, sy, flat ? 3 : 1, flat ? 1 : 2);
      g.fillStyle = '#2a6a5a';
      g.fillRect(sx, sy, 1, 1);
    }
    // a mouse carries a little light of its own
    if (this.cursor && t - this.cursor.at < 3) {
      const a = 1 - smooth((t - this.cursor.at - 2) / 1);
      const sn = this.slide(DEPTH.near);
      const x = Math.round(this.cursor.x + M - sn.x);
      const y = Math.round(this.cursor.y + M - sn.y);
      g.globalAlpha = 0.35 * a;
      g.fillStyle = '#d8fffb';
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
      g.globalAlpha = a;
      g.fillRect(x, y, 1, 1);
      g.globalAlpha = 1;
    }
  }

  /** the light: sprites stamped on a canvas half the size of the pixel grid (it is laid over the picture with 'lighter') */
  private drawGlow(t: number, eye: { open: number; lx: number; ly: number }, moth: MothAt) {
    const g = this.gl;
    const Q = QUALITY[this.q]!;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, GW, GH);
    g.globalCompositeOperation = 'lighter';
    const light = smooth((t - 0.2) / 1.5);
    const dread = this.dread;
    const at = (x: number, y: number, d: number) => {
      const s = this.slide(d);
      return [(x + M + s.x) * GS, (y + M + s.y) * GS] as const;
    };
    const stamp = (img: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, a: number) => {
      if (a <= 0.004) return;
      g.globalAlpha = a > 1 ? 1 : a;
      g.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    };

    // a red glow behind the title that beats with its heart
    {
      const s = this.slide(0.7);
      const cx = (W / 2 + M + s.x) * GS;
      const cy = (66 + M + s.y) * GS;
      stamp(this.sp.title, cx, cy, 150, 78, (0.1 + 0.2 * this.beat * (0.6 + 0.4 * dread) + 0.12 * dread) * light);
    }
    // the moon's halo, red while it stares
    const [mx, my] = at(MOON.x, MOON.y, DEPTH.back);
    const hr = MOON.r * GS;
    const hs = hr * 3.6 * 2;
    stamp(this.sp.haloCool, mx, my, hs, hs, light * (1 - dread));
    stamp(this.sp.haloRed, mx, my, hs, hs, light * dread);
    if (eye.open > 0.05) stamp(this.sp.red, mx, my, hr * 2.8, hr * 2.8, eye.open);

    // rays from the moon, down onto the clearing
    if (Q.rays) {
      const k = light * (1 - 0.7 * dread) * (0.8 + 0.2 * Math.sin(t * 0.5));
      if (k > 0.01) {
        g.save();
        g.translate(mx, my);
        g.rotate(Math.sin(t * 0.13) * 0.03);
        g.globalAlpha = k;
        g.drawImage(this.sp.fan, -this.sp.fan.width / 2, 0);
        g.restore();
      }
    }

    // the family's own light (it shrinks while the moon stares, and goes out over everything with the pulse)
    const [bx, by] = at(BABY.x, BABY.y - 4, DEPTH.ground);
    const bu = this.burstAt >= 0 ? t - this.burstAt : -1;
    const flick = 1 + 0.06 * Math.sin(t * 7.3) + 0.04 * Math.sin(t * 13.1);
    const R = 54 * GS * flick * (1 - 0.35 * dread);
    stamp(this.sp.home, bx, by, R * 2, R * 2, light);

    // mist lit by the moon, in long soft banks drifting between the tree lines
    if (Q.mist) {
      const wg = 1 + 2 * this.windGust(t);
      for (const [fy, d, sp, k] of [
        [226, DEPTH.back, 2.2, 0.075],
        [270, DEPTH.mid, -3.4, 0.06],
        [300, DEPTH.ground, 4.2, 0.045],
      ] as const) {
        for (let i = 0; i < 4; i++) {
          const span = LW + 120;
          const fx = ((((i * span) / 4 + t * sp * wg) % span) + span) % span - 60;
          const [cx, cy] = at(fx, fy + Math.sin(t * 0.3 + i * 2) * 2, d);
          stamp(this.sp.mist, cx, cy, 120, 46, k * light * (1 - 0.5 * dread) * (0.7 + 0.3 * Math.sin(t * 0.4 + i * 1.7)));
        }
      }
    }
    for (const [sx, sy] of SHROOMS) {
      const [cx, cy] = at(sx!, sy! - 3, DEPTH.mid);
      stamp(this.sp.cool, cx, cy, 12, 12, (0.45 + 0.15 * Math.sin(t * 2 + sx!)) * light);
    }

    // fireflies
    for (const f of this.flies) {
      if (f.glow < 0.1) continue;
      const sf = this.slide(f.d);
      const rr = (f.d > 0.8 ? 7 : 4.5) * GS * 2;
      stamp(f.warm ? this.sp.warm : this.sp.cool, (f.x + M + sf.x) * GS, (f.y + M + sf.y) * GS, rr * 2, rr * 2, 0.7 * f.glow * light);
    }

    // the eyes in the dark glow red
    for (const e of this.eyes) {
      const o = this.eyeOpen(e);
      if (o <= 0.05) continue;
      const [ex, ey] = at(e.x + (e.big ? 0 : 3), e.y, e.big ? DEPTH.mid : DEPTH.back);
      const rr = (e.big ? 9 : 5) * GS * 2;
      stamp(this.sp.red, ex, ey, rr * 2, rr * 2, o * (e.big ? 0.5 : 0.35));
    }
    // ... and so do the stars that are eyes
    if (dread > 0.4) {
      for (const se of this.starEyes) {
        const [ex, ey] = at(se.x + 2, se.y, DEPTH.back);
        stamp(this.sp.red, ex, ey, 8, 8, 0.4 * dread);
      }
    }

    // the flowers that are open
    for (const f of this.flowers) {
      if (f.open < 0.1) continue;
      const [fx, fy] = at(f.x, groundY(f.x) - 9, DEPTH.ground);
      stamp(this.sp.blue, fx, fy, 18, 18, 0.5 * f.open * light);
    }

    if (moth) {
      const [ox, oy] = at(moth.x, moth.y, DEPTH.ground);
      stamp(this.sp.moth, ox, oy, 22, 22, 0.65);
    }
    if (this.cursor && t - this.cursor.at < 3) {
      const a = 1 - smooth((t - this.cursor.at - 2) / 1);
      stamp(this.sp.moth, (this.cursor.x + M) * GS, (this.cursor.y + M) * GS, 24, 24, 0.45 * a);
    }

    // the pulse: a bloom behind the ring and the ring itself
    if (bu >= 0) {
      const rr = this.ringR(t) * GS;
      const fade = 1 - smooth((bu - 0.3) / 0.5);
      stamp(this.sp.bloom, bx, by, Math.max(2, rr * 2), Math.max(2, rr * 2), fade);
      g.globalAlpha = 0.5 * fade;
      g.strokeStyle = 'rgb(255,244,200)';
      g.lineWidth = 12;
      g.beginPath();
      g.arc(bx, by, Math.max(1, rr), 0, TAU);
      g.stroke();
      g.globalAlpha = 0.9 * fade;
      g.lineWidth = 3;
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------------------------------------ the pictures, made once */

  /** the sky: near black at the top, deep teal down to the haze over the far trees, a faint band of dusk across it, and the stars that do not twinkle */
  private makeSky(still: Star[]): HTMLCanvasElement {
    const p = new Pix(LW, LH);
    const img = p.ctx.createImageData(LW, LH);
    const d = img.data;
    const stops: [number, number[]][] = [
      [-M, [2, 3, 9]],
      [90, [5, 9, 20]],
      [168, [8, 20, 34]],
      [226, [17, 46, 58]],
      [262, [10, 30, 40]],
      [H + M, [4, 12, 18]],
    ];
    const Q = 4;
    for (let y = 0; y < LH; y++) {
      const sy = y - M;
      let i = 0;
      while (i < stops.length - 2 && sy > stops[i + 1]![0]) i++;
      const [y0, a] = stops[i]!;
      const [y1, b] = stops[i + 1]!;
      const u = clamp((sy - y0) / (y1 - y0), 0, 1);
      for (let x = 0; x < LW; x++) {
        const sx = x - M;
        const dist = (sy - (110 - 0.4167 * sx)) / 1.08;
        const n = 0.5 + 0.25 * Math.sin(sx * 0.07 + sy * 0.03) + 0.25 * Math.sin(sx * 0.023 - sy * 0.09 + 1.7);
        const band = Math.exp(-((dist / 18) ** 2)) * n;
        const th = (BAYER[y & 3]![x & 3]! + 0.5) / 16;
        const q = (v: number) => {
          const lo = Math.floor(v / Q) * Q;
          return v - lo > th * Q ? lo + Q : lo;
        };
        const k = (y * LW + x) * 4;
        d[k] = q(a[0]! + (b[0]! - a[0]!) * u + band * 10);
        d[k + 1] = q(a[1]! + (b[1]! - a[1]!) * u + band * 4);
        d[k + 2] = q(a[2]! + (b[2]! - a[2]!) * u + band * 18);
        d[k + 3] = 255;
      }
    }
    p.ctx.putImageData(img, 0, 0);
    const g = p.ctx;
    for (const s of still) {
      const x = Math.round(s.x + M);
      const y = Math.round(s.y + M);
      g.fillStyle = s.col;
      g.globalAlpha = s.b * 0.8;
      g.fillRect(x, y, 1, 1);
      if (s.kind > 0 && s.b > 0.5) {
        g.globalAlpha = s.b * 0.3;
        g.fillRect(x - 1, y, 1, 1);
        g.fillRect(x + 1, y, 1, 1);
        g.fillRect(x, y - 1, 1, 1);
        g.fillRect(x, y + 1, 1, 1);
      }
    }
    g.globalAlpha = 1;
    return p.canvas;
  }

  /**
   * The moon: a ball lit from the upper left in five tones (dithered only where two tones meet), two dark seas, and craters with
   * a shadowed rim toward the light and a lit rim away from it.
   */
  private makeMoon(): HTMLCanvasElement {
    const r = MOON.r;
    const S = r * 2 + 4;
    const c = S / 2;
    const p = new Pix(S, S);
    const img = p.ctx.createImageData(S, S);
    const d = img.data;
    const TONE = [
      [30, 92, 100],
      [62, 150, 152],
      [118, 214, 208],
      [170, 246, 238],
      [226, 255, 250],
    ];
    const seas = [
      [-0.3, -0.08, 0.38, 0.24, 0.5],
      [0.2, 0.36, 0.3, 0.18, -0.35],
      [0.34, -0.36, 0.17, 0.12, 0.3],
    ];
    const craters = [
      [0.42, 0.04, 0.14],
      [-0.46, 0.44, 0.11],
      [0.02, -0.58, 0.09],
      [-0.08, 0.66, 0.08],
      [0.64, -0.2, 0.07],
      [-0.66, -0.36, 0.07],
      [0.16, 0.08, 0.06],
    ];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x + 0.5 - c) / r;
        const dy = (y + 0.5 - c) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const nz = Math.sqrt(1 - d2);
        // the light, with a narrow dither where one tone gives way to the next
        const l = -0.55 * dx - 0.5 * dy + 0.67 * nz + (BAYER[y & 3]![x & 3]! / 16 - 0.5) * 0.14;
        let tone = l > 0.8 ? 4 : l > 0.48 ? 3 : l > 0.1 ? 2 : l > -0.2 ? 1 : 0;
        for (const [sx, sy, rx, ry, rot] of seas) {
          const u = (dx - sx!) * Math.cos(rot!) + (dy - sy!) * Math.sin(rot!);
          const v = -(dx - sx!) * Math.sin(rot!) + (dy - sy!) * Math.cos(rot!);
          const wob = 0.12 * Math.sin(x * 1.3 + y * 0.7) + 0.08 * Math.sin(y * 1.9 - x * 0.4);
          if ((u / rx!) ** 2 + (v / ry!) ** 2 < 1 + wob) tone = Math.max(0, tone - 1);
        }
        for (const [cx, cy, cr] of craters) {
          const q = Math.hypot(dx - cx!, dy - cy!) / cr!;
          if (q > 1.2) continue;
          const side = ((dx - cx!) * 0.55 + (dy - cy!) * 0.5) / Math.max(1e-3, q * cr!);
          if (q < 0.72) tone = Math.max(0, tone - (side < -0.2 ? 2 : 1));
          else if (side > 0.25) tone = Math.min(4, tone + 1);
          else if (side < -0.25) tone = Math.max(0, tone - 1);
        }
        const col = TONE[tone]!;
        const k = (y * S + x) * 4;
        d[k] = col[0]!;
        d[k + 1] = col[1]!;
        d[k + 2] = col[2]!;
        d[k + 3] = 255;
      }
    }
    p.ctx.putImageData(img, 0, 0);
    return p.canvas;
  }

  /** a cloud: puffs along a flat bottom, biggest in the middle, its top caught by the moon */
  private makeCloud(seed: number, w: number, h: number): HTMLCanvasElement {
    const p = new Pix(w, h);
    const r = rng(seed);
    const n = Math.round(w / 9);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.2 + r() * 0.6) / n;
      const big = Math.sin(u * Math.PI);
      const rr = h * (0.14 + 0.32 * big) * (0.75 + 0.45 * r());
      p.ellipse(w * (0.06 + 0.88 * u), h - 2 - rr * 0.7, rr * 1.5, rr, '#0a1826');
    }
    p.ctx.clearRect(0, h - 2, w, 2);
    this.rimTop(p, '#3a6a74', w / 2, w, 1, '#1a3a48');
    return p.canvas;
  }

  /** the far tree line, pale with haze, and two trees standing up out of it between the big ones and the moon */
  private makeFar(): HTMLCanvasElement {
    const p = new Pix(LW, LH);
    const col = '#0e2836';
    this.tree(p, 21, 34 + M, 236 + M, 128 + M, 6, 1, col, col, 1);
    this.tree(p, 22, 184 + M, 236 + M, 120 + M, 7, -1, col, col, 1);
    this.treeline(p, 41, 232 + M, 26, col);
    this.rimToward(p, '#21505e', 0.55, 3);
    return p.canvas;
  }

  /** the near tree line, darker, and the two big old trees that frame the picture (their tops go out of it) */
  private makeMid(): HTMLCanvasElement {
    const p = new Pix(LW, LH);
    this.treeline(p, 52, 256 + M, 32, '#081822');
    this.tree(p, 31, M + 1, 304 + M, -10, 22, 1, '#040a12', LEAF, 2);
    this.tree(p, 32, M + 215, 306 + M, -10, 24, -1, '#040a12', LEAF, 2);
    this.rimToward(p, '#1b5160', 0.7, 5);
    // a few toadstools glowing at the roots
    for (const [x, y] of SHROOMS) {
      p.rect(x + M, y + M - 2, 1, 2, '#2a6a6a');
      p.rect(x + M - 1, y + M - 3, 3, 1, '#7fe8f0');
      p.px(x + M, y + M - 4, '#c8fbff');
    }
    return p.canvas;
  }

  /**
   * The clearing: a low rise of dark ground with its lip caught by the moon (and warm near the family), a worn path coming down
   * from them toward you, bushes and stones at the sides.
   */
  private makeGround(): HTMLCanvasElement {
    const p = new Pix(LW, LH);
    const img = p.ctx.createImageData(LW, LH);
    const d = img.data;
    const set = (k: number, c: number[]) => {
      d[k] = c[0]!;
      d[k + 1] = c[1]!;
      d[k + 2] = c[2]!;
      d[k + 3] = 255;
    };
    for (let x = 0; x < LW; x++) {
      const sx = x - M;
      const top = groundY(sx) + M;
      const warm = Math.max(0, 1 - Math.abs(sx - BABY.x) / 40);
      for (let y = top; y < LH; y++) {
        const sy = y - M;
        const u = (y - top) / 44;
        const th = BAYER[y & 3]![x & 3]! / 16;
        let c = u < 0.08 ? [13, 47, 56] : u < 1 ? (th < 1 - u ? [11, 39, 48] : [7, 26, 34]) : [6, 22, 32];
        // the path: narrow at their feet, wide at the bottom of the screen, its edges dithered
        const pw = 7 + (sy - 296) * 0.42;
        const pc = BABY.x + Math.sin((sy - 296) * 0.03) * 10;
        const e = 1 - Math.abs(sx - pc) / Math.max(1, pw);
        if (sy > 298 && e > 0 && th < e * 2.2) c = th < e * 0.8 ? [16, 52, 60] : [13, 44, 52];
        const n = hash2(x * 5, y * 3);
        if (n > 0.965) c = [18, 64, 74];
        else if (n < 0.03) c = [3, 17, 26];
        // the family's warmth on the ground near them
        if (warm > 0 && y - top < 10 && th < warm * (1 - (y - top) / 10) * 0.7) c = [58, 54, 34];
        set((y * LW + x) * 4, c);
      }
      set((top * LW + x) * 4, warm > 0.3 ? [140, 120, 60] : hash2(x, 99) > 0.3 ? [30, 92, 96] : [22, 74, 80]);
    }
    p.ctx.putImageData(img, 0, 0);
    // pebbles along the path
    const r = rng(61);
    for (let i = 0; i < 16; i++) {
      const sy = 304 + r() * 80;
      const sx = BABY.x + Math.sin((sy - 296) * 0.03) * 10 + (r() - 0.5) * (14 + (sy - 296) * 0.8);
      p.rect(sx + M, sy + M, 2, 1, '#1d4c56');
      p.px(sx + M, sy + M - 1, '#2a6470');
    }
    const bushes = [makeBush(501), makeBush(503), makeBush(507)];
    const rocks = [makeRock(701), makeRock(703)];
    p.blit(bushes[0]!, M - 6, groundY(4) + M - 13);
    p.blit(bushes[1]!, M + 20, groundY(30) + M - 11);
    p.blitFlip(bushes[2]!, M + 176, groundY(186) + M - 12);
    p.blit(rocks[0]!, M + 56, groundY(64) + M - 7);
    p.blitFlip(rocks[1]!, M + 156, groundY(164) + M - 8);
    return p.canvas;
  }

  /** boughs hanging in from the top corners, right in front of the glass, their edges lit by the moon */
  private makeNear(): HTMLCanvasElement {
    const p = new Pix(LW, LH);
    const r = rng(77);
    const col = '#02050b';
    const bough = (x: number, y: number, a: number, len: number, th: number, fork: number) => {
      let cx = x;
      let cy = y;
      const steps = Math.max(2, Math.floor(len / 3));
      for (let i = 0; i < steps; i++) {
        a += (r() - 0.5) * 0.5;
        const nx = cx + Math.cos(a) * 3;
        const ny = cy + Math.sin(a) * 3;
        p.line(cx, cy, nx, ny, col, Math.max(1, Math.round(th * (1 - i / (steps + 1)))));
        cx = nx;
        cy = ny;
        if (fork > 0 && i === Math.floor(steps * 0.45)) bough(cx, cy, a + (r() < 0.5 ? -1 : 1) * (0.6 + r() * 0.4), len * 0.5, Math.max(1, th - 2), fork - 1);
      }
      for (let l = 0; l < 4; l++) p.ellipse(cx + (r() - 0.5) * 12, cy + (r() - 0.5) * 7, 4 + r() * 4, 2.5 + r() * 2, col);
    };
    bough(-4, -6, 0.45, 60, 7, 2);
    bough(6, -8, 1.0, 36, 5, 1);
    bough(LW + 4, -6, Math.PI - 0.45, 56, 7, 2);
    bough(LW - 8, -8, Math.PI - 1.0, 34, 5, 1);
    this.rimToward(p, '#174450', 0.8, 9);
    return p.canvas;
  }

  /**
   * A strip of fog twice the layer's width (it wraps without a seam): soft lumps of it along the strip, thinning out at its top and
   * bottom, scattered rather than patterned so it reads as mist and not as a checkerboard.
   */
  private makeFog(seed: number, h: number): HTMLCanvasElement {
    const w = LW * 2;
    const p = new Pix(w, h);
    const img = p.ctx.createImageData(w, h);
    const d = img.data;
    const k = TAU / w;
    for (let y = 0; y < h; y++) {
      const env = Math.sin(((y + 0.5) / h) * Math.PI);
      for (let x = 0; x < w; x++) {
        const n = 0.5 + 0.28 * Math.sin(x * k * 3 + seed) + 0.22 * Math.sin(x * k * 8 + y * 0.25 + seed * 2);
        const a = env * env * n;
        if (a > 0.12 + hash2(x + seed * 131, y) * 0.95) {
          const i = (y * w + x) * 4;
          d[i] = 74;
          d[i + 1] = 140;
          d[i + 2] = 146;
          d[i + 3] = 255;
        }
      }
    }
    p.ctx.putImageData(img, 0, 0);
    return p.canvas;
  }

  /** a ragged line of tree tops (pines and round crowns), solid below `base` */
  private treeline(p: Pix, seed: number, base: number, amp: number, col: string) {
    const r = rng(seed);
    let x = -6;
    while (x < LW + 6) {
      if (r() < 0.7) {
        const h = amp * (0.45 + r() * 0.75);
        const w = 4 + r() * 5;
        const top = base - h;
        for (let y = Math.floor(top); y <= base; y++) {
          const u = (y - top) / h;
          const tier = (u * 3.5) % 1;
          const hw = Math.max(0, w * u * (0.55 + 0.45 * tier));
          p.rect(x - hw, y, hw * 2 + 1, 1, col);
        }
        x += w * (0.8 + r() * 0.9);
      } else {
        const rr = 4 + r() * 6;
        p.ellipse(x, base - rr * 0.5, rr, rr * 0.75, col);
        x += rr * (1.1 + r() * 0.5);
      }
    }
    p.rect(0, base, LW, LH - base, col);
  }

  /**
   * An old tree: a trunk that wavers and narrows from its flared roots to `top` (off the top of the picture for the big ones),
   * limbs that fork as they reach up and toward the middle, and clumps of leaves at their ends. `face` is the side the moon is on.
   */
  private tree(p: Pix, seed: number, x0: number, base: number, top: number, w0: number, face: 1 | -1, col: string, leaf: string, fork: number) {
    const r = rng(seed);
    let x = x0;
    const spine: [number, number, number][] = [];
    const tall = base - top;
    for (let y = base; y >= top; y -= 2) {
      const u = (base - y) / tall;
      x += Math.sin(y * 0.045 + seed) * 0.32 + face * 0.03;
      const flare = Math.max(0, 1 - (base - y) / 12);
      const w = Math.max(2, w0 * (1 - 0.5 * u) + flare * flare * w0 * 0.9);
      spine.push([x, y, w]);
      p.rect(x - w / 2, y, w, 2, col);
    }
    // roots, curling down into the ground on both sides
    for (let k = 0; k < 4; k++) {
      const dir = (k < 2 ? -1 : 1) * (0.7 + r() * 0.6);
      let rx = x0 + dir * w0 * 0.4;
      let ry = base - 4 - r() * 3;
      for (let s = 0; s < 6; s++) {
        rx += dir * 1.8;
        ry += 1;
        p.rect(rx - 1, ry, Math.max(1, Math.round(w0 * 0.18 - s * 0.35)), 2, col);
      }
    }
    const limb = (bx: number, by: number, a: number, len: number, th: number, depth: number) => {
      let cx = bx;
      let cy = by;
      const steps = Math.max(2, Math.floor(len / 3));
      for (let i = 0; i < steps; i++) {
        a += (r() - 0.5) * 0.42;
        const nx = cx + Math.cos(a) * 3;
        const ny = cy + Math.sin(a) * 3;
        p.line(cx, cy, nx, ny, col, Math.max(1, Math.round(th * (1 - i / (steps + 2)))));
        cx = nx;
        cy = ny;
        if (depth > 0 && i > steps * 0.35 && r() < 0.3) limb(cx, cy, a + (r() < 0.5 ? -1 : 1) * (0.45 + r() * 0.5), len * 0.55, Math.max(1, th * 0.6), depth - 1);
      }
      const n = depth === 0 ? 4 : 3;
      for (let l = 0; l < n; l++) p.ellipse(cx + (r() - 0.5) * 13, cy + (r() - 0.5) * 7, 4 + r() * 5, 3 + r() * 3, leaf);
    };
    const limbs = fork >= 2 ? 6 : 4;
    for (let k = 0; k < limbs; k++) {
      const [bx, by, bw] = spine[Math.min(spine.length - 1, Math.floor(spine.length * (0.3 + (0.62 * k) / limbs + r() * 0.04)))]!;
      const out = face * (0.55 + r() * 0.55);
      limb(bx, by, -Math.PI / 2 + out, (fork >= 2 ? 34 : 18) + r() * (fork >= 2 ? 26 : 12), Math.max(1.5, bw * 0.42), fork);
    }
    if (top > 0) for (let l = 0; l < 6; l++) p.ellipse(x + (r() - 0.5) * 18, top + (r() - 0.3) * 10, 5 + r() * 5, 4 + r() * 3, leaf);
  }

  /** light the top pixel of each column (more of them near `cx`, within `reach`), and the one under it more darkly */
  private rimTop(p: Pix, rim: string, cx: number, reach: number, floor = 0.15, under?: string) {
    const img = p.ctx.getImageData(0, 0, p.w, p.h);
    const d = img.data;
    const c = hex(rim);
    const c2 = under ? hex(under) : null;
    for (let x = 0; x < p.w; x++) {
      const chance = Math.max(floor, 1 - Math.abs(x - cx) / reach);
      for (let y = 0; y < p.h; y++) {
        const i = (y * p.w + x) * 4;
        if (d[i + 3]! === 0) continue;
        if (hash2(x, y + 7) < chance) {
          d[i] = c[0]!;
          d[i + 1] = c[1]!;
          d[i + 2] = c[2]!;
          if (c2 && y + 1 < p.h && d[i + p.w * 4 + 3]! > 0) {
            d[i + p.w * 4] = c2[0]!;
            d[i + p.w * 4 + 1] = c2[1]!;
            d[i + p.w * 4 + 2] = c2[2]!;
          }
        }
        break;
      }
    }
    p.ctx.putImageData(img, 0, 0);
  }

  /** moonlight: every edge pixel of a silhouette that faces the moon gets the rim colour (a layer-sized canvas, in layer pixels) */
  private rimToward(p: Pix, rim: string, chance: number, seed: number) {
    const img = p.ctx.getImageData(0, 0, p.w, p.h);
    const d = img.data;
    const src = new Uint8ClampedArray(d);
    const c = hex(rim);
    const mx = MOON.x + M;
    const my = MOON.y + M;
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const i = (y * p.w + x) * 4;
        if (src[i + 3]! === 0) continue;
        const vx = mx - x;
        const vy = my - y;
        const L = Math.hypot(vx, vy) || 1;
        const nx = x + Math.round((vx / L) * 1.4);
        const ny = y + Math.round((vy / L) * 1.4);
        if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) continue;
        if (src[(ny * p.w + nx) * 4 + 3]! === 0 && hash2(x * 3 + seed, y) < chance) {
          d[i] = c[0]!;
          d[i + 1] = c[1]!;
          d[i + 2] = c[2]!;
        }
      }
    }
    p.ctx.putImageData(img, 0, 0);
  }
}

function hex(c: string): number[] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** a soft round light, drawn once and stamped wherever it is needed */
function glowSprite(rgb: string, size = 32): HTMLCanvasElement {
  return radialSprite(size, rgb, [[0, 1], [0.25, 0.45], [1, 0]]);
}

/** a round light with its own falloff: `stops` are [position 0..1 from the middle, alpha]; the colour is `rgb` (or `outer` toward the edge) */
function radialSprite(size: number, rgb: string, stops: [number, number][], outer = rgb): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([p, a], i) => gr.addColorStop(p, `rgba(${i > 0 && i < stops.length - 1 ? outer : rgb},${a})`));
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

/** five rays from a point at the top middle, fanning down (the moon's light through the trees), 85 half-size pixels long */
function fanSprite(): HTMLCanvasElement {
  const L = 85;
  const c = document.createElement('canvas');
  c.width = L * 2;
  c.height = L;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + (i - 2) * 0.19;
    const half = 0.05 + 0.012 * Math.sin(i * 1.7);
    const k = 0.1 + 0.05 * Math.sin(i * 2.1);
    const lg = g.createLinearGradient(L, 0, L + Math.cos(a) * L, Math.sin(a) * L);
    lg.addColorStop(0, `rgba(170,250,245,${k})`);
    lg.addColorStop(1, 'rgba(170,250,245,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(L, 0);
    g.lineTo(L + Math.cos(a - half) * L, Math.sin(a - half) * L);
    g.lineTo(L + Math.cos(a + half) * L, Math.sin(a + half) * L);
    g.closePath();
    g.fill();
  }
  return c;
}

/** a long soft bank of mist: an ellipse of pale teal, thickest in the middle */
function mistSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  g.translate(64, 16);
  g.scale(1, 0.25);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(120,200,205,1)');
  gr.addColorStop(1, 'rgba(120,200,205,0)');
  g.fillStyle = gr;
  g.fillRect(-64, -64, 128, 128);
  return c;
}

/** the dark at the edges of the picture (small, and stretched over the whole canvas) */
function vignetteSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 54;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.translate(27, 48);
  g.scale(0.78 * 54, 0.64 * 96);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(0.5, 'rgba(0,0,0,0)');
  gr.addColorStop(0.8, 'rgba(1,2,6,0.45)');
  gr.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = gr;
  g.fillRect(-2, -2, 4, 4);
  return c;
}
