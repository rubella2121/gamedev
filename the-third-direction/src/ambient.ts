/**
 * The living dark behind the title and the home page: fireflies drifting about and, now and then, a pair of red eyes opening in
 * the trees at the edge of the screen, blinking once, and closing. It is drawn on the forest's own 216 x 384 pixel grid, so it
 * matches the picture behind it.
 */
const W = 216;
const H = 384;

interface Fly {
  x: number;
  y: number;
  ax: number;
  ay: number;
  sp: number;
  ph: number;
  warm: boolean;
}

interface Eyes {
  x: number;
  y: number;
  age: number;
  life: number;
  blink: number;
  gap: number;
}

export class Ambient {
  readonly canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private flies: Fly[] = [];
  private eyes: Eyes[] = [];
  private nextEyes = 1.2;
  private last = 0;
  private seed = 1;

  constructor() {
    this.canvas.className = 'ambient';
    this.canvas.width = W;
    this.canvas.height = H;
    for (let i = 0; i < 26; i++) {
      this.flies.push({ x: this.rnd() * W, y: 40 + this.rnd() * (H - 60), ax: 6 + this.rnd() * 16, ay: 4 + this.rnd() * 10, sp: 0.25 + this.rnd() * 0.5, ph: this.rnd() * 6.28, warm: this.rnd() < 0.62 });
    }
  }

  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  draw(t: number) {
    const g = this.g;
    const dt = this.last ? Math.min(0.1, t - this.last) : 0;
    this.last = t;
    g.clearRect(0, 0, W, H);
    for (const f of this.flies) {
      const x = Math.round(f.x + Math.sin(t * f.sp + f.ph) * f.ax);
      const y = Math.round(f.y + Math.cos(t * f.sp * 0.8 + f.ph * 1.3) * f.ay);
      const glow = 0.5 + 0.5 * Math.sin(t * 1.6 + f.ph * 3);
      if (glow < 0.12) continue;
      const rgb = f.warm ? '255,226,130' : '140,240,255';
      g.fillStyle = `rgba(${rgb},${0.16 * glow})`;
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = `rgba(${rgb},${0.35 + 0.65 * glow})`;
      g.fillRect(x, y, 1, 1);
    }
    // eyes in the dark at the edges, where the trees are
    this.nextEyes -= dt;
    if (this.nextEyes <= 0 && this.eyes.length < 3) {
      this.nextEyes = 2.2 + this.rnd() * 3;
      const left = this.rnd() < 0.5;
      this.eyes.push({ x: left ? 8 + this.rnd() * 30 : W - 40 + this.rnd() * 30, y: 110 + this.rnd() * 190, age: 0, life: 3.2 + this.rnd() * 2, blink: 1.2 + this.rnd() * 1.4, gap: 5 + Math.round(this.rnd() * 2) });
    }
    for (let i = this.eyes.length - 1; i >= 0; i--) {
      const e = this.eyes[i]!;
      e.age += dt;
      if (e.age >= e.life) {
        this.eyes.splice(i, 1);
        continue;
      }
      const fade = Math.min(1, e.age / 0.6, (e.life - e.age) / 0.7);
      const shut = e.age > e.blink && e.age < e.blink + 0.14;
      if (shut) continue;
      const x = Math.round(e.x);
      const y = Math.round(e.y);
      g.fillStyle = `rgba(224,43,58,${0.14 * fade})`;
      g.fillRect(x - 2, y - 2, e.gap + 7, 6);
      for (const ex of [x, x + e.gap]) {
        g.fillStyle = `rgba(224,43,58,${0.95 * fade})`;
        g.fillRect(ex, y, 3, 2);
        g.fillStyle = `rgba(255,150,150,${fade})`;
        g.fillRect(ex + 1, y, 1, 1);
      }
    }
  }
}
