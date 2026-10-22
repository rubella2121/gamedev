/**
 * The title as a pixel logo. Every letter is built from little cubes, and behind it hangs a red depth that sways, so the name
 * carries the idea of the game: a flat world that finds a third direction. It is drawn at the screen's own resolution, so the
 * cubes are crisp (whole pixels) whatever the phone, and a letter now and then tears sideways, like the forest does when X is near.
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
}

const FRONT = '#f4efe0';
const LIGHT = '#fffdf2';
const SHADE = '#b9ae92';
const GAP = '#150a10';

/** the depth goes from a warm red next to the letter to near black far behind it */
function depthColour(u: number): string {
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * u);
  return `rgb(${lerp(206, 34)},${lerp(40, 4)},${lerp(58, 14)})`;
}

export class Logo {
  readonly canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private words: Word[] = [];
  private dpr = 1;
  private colours: string[] = [];
  /** seconds left of a tear; the next one is `nextTear` seconds away */
  private tear = 0;
  private nextTear = 3.5;
  private last = 0;
  /** -1..1, from the pointer: the depth leans away from it */
  tilt = 0;

  constructor(private compact = false) {
    this.canvas.className = 'logo';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'The Third Direction');
  }

  /** Fit the logo to a width in CSS pixels. */
  resize(cssWidth: number) {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
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
      { text: 'THE', cell: cellE, depth: depthE, y, x: Math.round((W - wide('THE', cellE)) / 2), seed: 0.3 },
      { text: 'THIRD', cell: cellT, depth: depthT, y: (y += hE + gap1), x: Math.round((W - wide('THIRD', cellT)) / 2), seed: 1.7 },
      { text: 'DIRECTION', cell: cellD, depth: depthD, y: (y += hT + gap2), x: Math.round((W - wide('DIRECTION', cellD)) / 2), seed: 3.1 },
    ];
    const n = Math.max(depthT, depthD, depthE) + 1;
    this.colours = Array.from({ length: n }, (_, k) => depthColour(k / n));
    this.draw(0);
  }

  /** Draw the logo at time `t` (seconds). */
  draw(t: number) {
    const g = this.g;
    const dt = this.last ? Math.min(0.1, t - this.last) : 0;
    this.last = t;
    if (this.tear > 0) this.tear -= dt;
    else if ((this.nextTear -= dt) <= 0) {
      this.tear = 0.16;
      this.nextTear = 4 + ((Math.sin(t * 12.9898) * 43758.5453) % 1 + 1) * 3;
    }
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // the depth swings slowly around "down and to the right", and leans away from the pointer
    const a = 0.95 + 0.34 * Math.sin(t * 0.55) - this.tilt * 0.45;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (const w of this.words) this.word(w, t, dx, dy);
  }

  private word(w: Word, t: number, dx: number, dy: number) {
    const g = this.g;
    const { cell, depth } = w;
    const inset = cell >= 6 ? Math.max(1, Math.round(cell / 10)) : 0;
    const bevel = Math.max(1, Math.round(cell / 9));
    const size = cell - inset;
    const letters = [...w.text];
    // find every lit cube first, then paint the depth (far to near), then the fronts
    const cubes: { x: number; y: number }[] = [];
    letters.forEach((ch, i) => {
      const rows = GLYPH[ch]!;
      const bob = Math.round(Math.sin(t * 1.3 + i * 0.9 + w.seed) * cell * 0.09);
      for (let gy = 0; gy < 7; gy++) {
        // a tear shoves whole rows sideways
        const shove = this.tear > 0 && Math.sin(gy * 78.233 + Math.floor(t * 30) * 12.9898 + w.seed) > 0.55 ? Math.round((gy % 2 ? 1 : -1) * cell * 0.8) : 0;
        for (let gx = 0; gx < 5; gx++) {
          if (rows[gy]![gx] !== '#') continue;
          cubes.push({ x: w.x + (i * 6 + gx) * cell + shove, y: w.y + gy * cell + bob });
        }
      }
    });
    for (let k = depth; k >= 1; k--) {
      g.fillStyle = this.colours[Math.min(this.colours.length - 1, k)]!;
      const ox = Math.round(dx * k);
      const oy = Math.round(dy * k);
      for (const c of cubes) g.fillRect(c.x + ox, c.y + oy, cell, cell);
    }
    for (const c of cubes) {
      if (inset) {
        g.fillStyle = GAP;
        g.fillRect(c.x, c.y, cell, cell);
      }
      g.fillStyle = FRONT;
      g.fillRect(c.x, c.y, size, size);
      if (cell >= 5) {
        g.fillStyle = LIGHT;
        g.fillRect(c.x, c.y, size, bevel);
        g.fillRect(c.x, c.y, bevel, size);
        g.fillStyle = SHADE;
        g.fillRect(c.x, c.y + size - bevel, size, bevel);
        g.fillRect(c.x + size - bevel, c.y, bevel, size);
      }
    }
  }
}
