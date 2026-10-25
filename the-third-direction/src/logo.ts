/**
 * The title as a pixel logo. Every letter is built from little cubes, and behind it hangs a red depth that sways, so the name
 * carries the idea of the game: a flat world that finds a third direction. It is drawn at the screen's own resolution, so the
 * cubes are crisp (whole pixels) whatever the phone, and a letter now and then tears sideways, like the forest does when X is near.
 *
 * A glint of light sweeps across the fronts now and then, and the depth leans away from the pointer in both directions. On the
 * landing page the title builds itself: the cubes pop in flat, one by one, and then the depth comes out of them (`assemble`); a
 * tap blows the depth out toward the back of the screen (`burst`).
 *
 * It is only painted again when something on it has moved by a whole pixel (the sway, the bob, the glint, a tear, the build), so
 * a phone does not redraw thousands of cubes thirty times a second to show the same picture.
 */

const GLYPH: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
};

interface Word {
  text: string;
  /** device pixels per cube */
  cell: number;
  /** device pixels of depth */
  depth: number;
  /** top of the word, device pixels */
  y: number;
  /** left of the word, device pixels */
  x: number;
  /** a different bob for every word */
  seed: number;
  /** the letters before this word (the title builds letter by letter, in reading order) */
  first: number;
}

const FRONT = '#f4efe0';
const LIGHT = '#fffdf2';
const SHADE = '#b9ae92';
const GAP = '#150a10';
const GLINT = '#ffffff';
const GLINT_SHADE = '#e9e2cc';

/** seconds from `assemble()` to the moment the depth comes out of the flat letters */
export const EXTRUDE_AT = 1.3;

/** the depth goes from a warm red next to the letter to near black far behind it; `hot` (a heartbeat) brightens the near end */
function depthColour(u: number, hot: number): string {
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * u);
  return `rgb(${lerp(206 + 49 * hot, 34)},${lerp(40 + 46 * hot, 4)},${lerp(58 + 38 * hot, 14)})`;
}

/** a number in 0..1 that is the same every time for the same cube */
function cubeHash(a: number, b: number, c: number, d: number) {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + d * 19.3) * 43758.5453;
  return h - Math.floor(h);
}

const easeOutBack = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
};

export class Logo {
  readonly canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private words: Word[] = [];
  private dpr = 1;
  private colours: string[] = [];
  private hotQ = -1;
  /** seconds left of a tear; the next one is `nextTear` seconds away */
  private tear = 0;
  private nextTear = 3.5;
  private last = 0;
  /** where the heartbeat is, in seconds into the current beat (it starts between beats, so a single still is the calm title) */
  private beatT = 0.8;
  /** when the next glint starts */
  private glintAt = 5;
  /** when the title started building itself (-1: it is already built) */
  private born = -1;
  /** when the tap blew it out (-1: not yet) */
  private burstAt = -1;
  /** what the last picture was made from (a frame that would be the same picture is not painted) */
  private sig = 0;
  private painted = false;
  private bobs: number[][] = [];
  /** -1..1, from the pointer: the depth leans away from it */
  tilt = 0;
  /** -1..1, up and down */
  tiltY = 0;
  /** 0..1: how afraid the title is (its heart beats faster) */
  fear = 0;
  /** the heart's beat right now, 0..1: the landing page lights its glow with it */
  beat = 0;
  /** no tears, no building itself (prefers-reduced-motion) */
  still = false;
  /** no tears of its own accord (the landing page tears it once, when the moon stares) */
  calm = false;
  /** the heartbeat also brightens the depth (the home page); off where something else shows it */
  beatDepth = true;
  /** the most device pixels per CSS pixel it is drawn at */
  maxDpr = 3;

  constructor(private compact = false) {
    this.canvas.className = 'logo';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'The Third Direction');
  }

  /** Build the title in front of the viewer, starting at time `t`: the cubes pop in flat, then the depth comes out of them. */
  assemble(t: number) {
    if (this.still) return;
    this.born = t;
    this.nextTear = EXTRUDE_AT + 3;
    this.glintAt = t + EXTRUDE_AT + 0.6;
  }

  /** The tap: the depth rushes away into the screen and the fronts go white-hot. */
  burst(t: number) {
    this.burstAt = t;
    if (!this.still) this.tear = 0.3;
  }

  /** One tear, now. */
  tearNow() {
    if (!this.still) this.tear = Math.max(this.tear, 0.18);
  }

  /** Fit the logo to a width in CSS pixels. */
  resize(cssWidth: number) {
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    const W = Math.floor(cssWidth * this.dpr);
    // 29 cubes across for THIRD, 53 for DIRECTION: both about four fifths of the width
    const cellT = Math.max(3, Math.floor((W * 0.8) / 29));
    const cellD = Math.max(2, Math.floor((W * 0.84) / 53));
    const cellE = Math.max(2, Math.floor(cellD * 0.62));
    const depthT = Math.round(cellT * 1.5);
    const depthD = Math.round(cellD * 1.7);
    const depthE = Math.max(2, Math.round(cellE * 1.5));
    const gap1 = Math.round(cellT * 0.55);
    const gap2 = Math.round(cellT * 0.9);
    const hE = 7 * cellE + depthE;
    const hT = 7 * cellT + depthT;
    const hD = 7 * cellD + depthD;
    const pad = Math.round(cellT * 0.5);
    const H = pad + hE + gap1 + hT + gap2 + hD + pad;
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${W / this.dpr}px`;
    this.canvas.style.height = `${H / this.dpr}px`;
    const wide = (text: string, cell: number) => (text.length * 6 - 1) * cell;
    let y = pad;
    this.words = [
      { text: 'THE', cell: cellE, depth: depthE, y, x: Math.round((W - wide('THE', cellE)) / 2), seed: 0.3, first: 0 },
      { text: 'THIRD', cell: cellT, depth: depthT, y: (y += hE + gap1), x: Math.round((W - wide('THIRD', cellT)) / 2), seed: 1.7, first: 3 },
      { text: 'DIRECTION', cell: cellD, depth: depthD, y: (y += hT + gap2), x: Math.round((W - wide('DIRECTION', cellD)) / 2), seed: 3.1, first: 8 },
    ];
    this.bobs = this.words.map((w) => new Array<number>(w.text.length).fill(0));
    this.colours = [];
    this.hotQ = -1;
    this.painted = false;
    this.draw(this.last);
  }

  /** Draw the logo at time `t` (seconds). */
  draw(t: number) {
    const dt = this.last ? Math.min(0.1, Math.max(0, t - this.last)) : 0;
    this.last = t;
    if (this.still || this.calm) {
      if (this.still) this.tear = 0;
      else if (this.tear > 0) this.tear -= dt;
    } else if (this.tear > 0) this.tear -= dt;
    else if ((this.nextTear -= dt * (1 + 3 * this.fear)) <= 0) {
      this.tear = 0.16;
      this.nextTear = 4 + ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) * 3;
    }
    // the heart: lub-dub, faster when afraid (never faster than a beat a second, so nothing on the page flashes more than twice a second)
    const period = 1.65 - 0.5 * this.fear;
    this.beatT += dt;
    if (this.beatT > period) this.beatT %= period;
    this.beat = Math.exp(-((this.beatT / 0.07) ** 2)) + 0.6 * Math.exp(-(((this.beatT - 0.25) / 0.07) ** 2));
    const A = this.born >= 0 ? t - this.born : 99;
    const B = this.burstAt >= 0 ? t - this.burstAt : -1;
    // how much of the depth is out: none while the cubes pop in, then out with an overshoot; the tap blows it far back
    let ext = A < 99 ? easeOutBack((A - EXTRUDE_AT) / 0.5) : 1;
    let hot = this.beatDepth ? 0.5 * this.beat * (0.6 + 0.4 * this.fear) : 0;
    if (A < 99) hot += 0.9 * Math.exp(-(((A - EXTRUDE_AT - 0.25) / 0.18) ** 2));
    if (B >= 0) {
      ext *= 1 + 7 * Math.pow(Math.min(1, B / 0.7), 2.4);
      hot += Math.min(1, B / 0.25);
    }
    const hotQ = Math.round(Math.min(1, hot) * 8);
    // the glint: a band of light sweeping across the fronts, from the top left
    if (!this.still && t > this.glintAt + 1.2) this.glintAt = t + 5.5 + ((Math.sin(t * 78.233) * 43758.5453) % 1 + 1) * 2.5;
    const gu = (t - this.glintAt) / 0.9;
    const span = this.canvas.width + this.canvas.height * 0.7;
    const glint = gu > 0 && gu < 1 ? -0.15 * span + gu * span * 1.3 : -1e9;
    // the depth swings slowly around "down and to the right", and leans away from the pointer
    const a = 0.95 + 0.34 * Math.sin(t * 0.55);
    let dx = Math.cos(a) - this.tilt * 0.55;
    let dy = Math.sin(a) - this.tiltY * 0.45;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // what the picture is made of, in whole pixels: if none of it changed, the canvas already shows it
    // (the bob steps eight times a second, which on a move of a pixel or two is not seen)
    const tb = Math.floor(t * 8) / 8;
    let sig = (hotQ * 131 + Math.round(glint / 8)) | 0;
    this.words.forEach((w, wi) => {
      const bobs = this.bobs[wi]!;
      for (let i = 0; i < bobs.length; i++) {
        bobs[i] = Math.round(Math.sin(tb * 1.3 + i * 0.9 + w.seed) * w.cell * 0.09);
        sig = (Math.imul(sig, 31) + bobs[i]!) | 0;
      }
      sig = (Math.imul(sig, 31) + Math.round(dx * w.depth * ext)) | 0;
      sig = (Math.imul(sig, 31) + Math.round(dy * w.depth * ext)) | 0;
    });
    const building = A < EXTRUDE_AT + 0.6;
    // (building, tearing and the burst change on every frame)
    if (building || B >= 0 || this.tear > 0) sig = (Math.imul(sig, 31) + Math.floor(t * 60)) | 0;
    if (this.painted && sig === this.sig) return;
    this.sig = sig;
    this.painted = true;

    if (hotQ !== this.hotQ || this.colours.length === 0) {
      this.hotQ = hotQ;
      const n = Math.max(...this.words.map((w) => w.depth)) + 1;
      this.colours = Array.from({ length: n }, (_, k) => depthColour(k / n, hotQ / 8));
    }
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.words.forEach((w, wi) => this.word(w, this.bobs[wi]!, t, dx, dy, ext, A, B, glint, span * 0.05, building));
  }

  private word(w: Word, bobs: number[], t: number, dx: number, dy: number, ext: number, A: number, B: number, glint: number, glintW: number, building: boolean) {
    const g = this.g;
    const { cell } = w;
    const inset = cell >= 6 ? Math.max(1, Math.round(cell / 10)) : 0;
    const bevel = Math.max(1, Math.round(cell / 9));
    const letters = [...w.text];
    // find every lit cube first, then paint the depth (far to near), then the fronts
    const cubes: { x: number; y: number; s: number; hot: boolean }[] = [];
    letters.forEach((ch, i) => {
      const rows = GLYPH[ch]!;
      const bob = bobs[i]!;
      for (let gy = 0; gy < 7; gy++) {
        // a tear shoves whole rows sideways
        const shove = this.tear > 0 && Math.sin(gy * 78.233 + Math.floor(t * 30) * 12.9898 + w.seed) > 0.55 ? Math.round((gy % 2 ? 1 : -1) * cell * 0.8) : 0;
        for (let gx = 0; gx < 5; gx++) {
          if (rows[gy]![gx] !== '#') continue;
          let s = 1;
          let drop = 0;
          let hot = false;
          if (building) {
            // each cube pops in on its own beat, in reading order, and drops the last little way into place
            const at = 0.08 + (w.first + i) * 0.045 + cubeHash(w.seed, i, gx, gy) * 0.22;
            const e = (A - at) / 0.14;
            if (e <= 0) continue;
            s = easeOutBack(e);
            drop = Math.round((1 - Math.min(1, e)) * -cell * 0.8);
            hot = A - at < 0.2;
          }
          cubes.push({ x: w.x + (i * 6 + gx) * cell + shove, y: w.y + gy * cell + bob + drop, s, hot });
        }
      }
    });
    // the depth, far to near; when it is deep (a big phone, or the tap) every other layer is skipped and the rest drawn thicker
    const depth = Math.round(w.depth * Math.max(0, ext));
    const n = this.colours.length;
    const stride = Math.max(1, Math.ceil(depth / 36));
    // after the tap the depth stops being a straight extrusion and runs to a vanishing point behind the middle of the title:
    // the whole name is pulled away into the screen
    const pull = B >= 0 ? Math.min(1, B / 0.3) : 0;
    const vx = this.canvas.width / 2;
    const vy = this.canvas.height * 0.55;
    for (let k = depth; k >= 1; k -= stride) {
      g.fillStyle = this.colours[Math.min(n - 1, Math.round((k / Math.max(1, depth)) * w.depth))]!;
      const ox = Math.round(dx * k);
      const oy = Math.round(dy * k);
      const grow = stride - 1;
      if (pull > 0) {
        const f = Math.min(0.97, (k / Math.max(1, depth)) * (0.35 + 0.62 * pull));
        const size = Math.max(1, Math.round(cell * (1 - f)));
        for (const c of cubes) {
          if (c.s < 1) continue;
          const px = c.x + (vx - c.x) * f + ox * (1 - pull);
          const py = c.y + (vy - c.y) * f + oy * (1 - pull);
          g.fillRect(Math.round(px + (cell - size) / 2), Math.round(py + (cell - size) / 2), size + grow, size + grow);
        }
        continue;
      }
      for (const c of cubes) {
        if (c.s < 1) continue;
        g.fillRect(c.x + ox - (dx < 0 ? grow : 0), c.y + oy - (dy < 0 ? grow : 0), cell + grow, cell + grow);
      }
    }
    const white = B >= 0 ? Math.min(1, B / 0.18) : 0;
    for (const c of cubes) {
      const size = Math.max(1, Math.round((cell - inset) * c.s));
      const x = c.x + Math.round(((cell - inset) - size) / 2);
      const y = c.y + Math.round(((cell - inset) - size) / 2);
      if (inset && c.s >= 1) {
        g.fillStyle = GAP;
        g.fillRect(c.x, c.y, cell, cell);
      }
      const lit = Math.abs(c.x + c.y * 0.7 - glint) < glintW;
      g.fillStyle = c.hot || white > 0.5 ? GLINT : lit ? GLINT : FRONT;
      g.fillRect(x, y, size, size);
      if (cell >= 5 && size >= 5) {
        g.fillStyle = LIGHT;
        g.fillRect(x, y, size, bevel);
        g.fillRect(x, y, bevel, size);
        g.fillStyle = lit || c.hot ? GLINT_SHADE : SHADE;
        g.fillRect(x, y + size - bevel, size, bevel);
        g.fillRect(x + size - bevel, y, bevel, size);
      }
    }
  }
}
