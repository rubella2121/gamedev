import crestUrl from './assets/crest.webp';

/**
 * The title as the night logo (tools/brand, `crest`): X's three eyes above, every other boss in an arc behind the words.
 * It is one picture, so it moves as one: it rises in on the landing page, X's eyes glow with the heartbeat the old title
 * had (the landing page lights its own glow with `beat` too), it shudders once when the moon stares (`tearNow`), and the tap
 * blows it into the screen (`burst`). It answers to the same calls as the pixel logo (src/logo.ts), which the store
 * thumbnail still uses.
 */

/** where X's eyes sit in the picture, as fractions of its width and height */
const EYES = { x: 0.5, y: 0.085, w: 0.36, h: 0.12 };
/** how long the title takes to rise in */
const RISE = 1.1;

export class Crest {
  /** the element to put on the page (named for the pixel logo's canvas, which it replaces) */
  readonly canvas = document.createElement('div');
  private img = new Image();
  private glow = document.createElement('div');

  /** -1..1, from the pointer: the picture leans away from it */
  tilt = 0;
  /** -1..1, up and down */
  tiltY = 0;
  /** 0..1: how afraid the title is (its heart beats faster) */
  fear = 0;
  /** the heart's beat right now, 0..1 */
  beat = 0;
  /** no shudders, no rising in (prefers-reduced-motion) */
  still = false;
  /** (the pixel logo tears of its own accord unless calm; this one never does) */
  calm = false;
  /** (the pixel logo's heartbeat also brightened its depth; here the eyes always carry it) */
  beatDepth = true;
  /** (the pixel logo's resolution cap; a picture needs none) */
  maxDpr = 3;

  private born = -1;
  private burstAt = -1;
  private tear = 0;
  private beatT = 0.8;
  private last = 0;
  private sig = '';

  constructor() {
    this.canvas.className = 'logo crest';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'The Third Direction');
    this.img.src = crestUrl;
    this.img.alt = '';
    this.img.decoding = 'async';
    this.img.draggable = false;
    this.glow.className = 'cglow';
    this.glow.style.cssText = `left:${(EYES.x - EYES.w / 2) * 100}%;top:${(EYES.y - EYES.h / 2) * 100}%;width:${EYES.w * 100}%;height:${EYES.h * 100}%`;
    this.canvas.append(this.img, this.glow);
  }

  /** Rise in front of the viewer, starting at time `t`. */
  assemble(t: number) {
    if (this.still) return;
    this.born = t;
  }

  /** The tap: the title rushes into the screen and burns out. */
  burst(t: number) {
    this.burstAt = t;
  }

  /** One shudder, now. */
  tearNow() {
    if (!this.still) this.tear = Math.max(this.tear, 0.22);
  }

  /** Fit to a width in CSS pixels. */
  resize(cssWidth: number) {
    this.canvas.style.width = `${Math.round(cssWidth)}px`;
  }

  draw(t: number) {
    const dt = this.last ? Math.min(0.1, Math.max(0, t - this.last)) : 0;
    this.last = t;
    if (this.tear > 0) this.tear -= dt;
    // the heart: lub-dub, faster when afraid (never more than a beat a second, so nothing flashes more than twice a second)
    const period = 1.65 - 0.5 * this.fear;
    this.beatT += dt;
    if (this.beatT > period) this.beatT %= period;
    this.beat = Math.exp(-((this.beatT / 0.07) ** 2)) + 0.6 * Math.exp(-(((this.beatT - 0.25) / 0.07) ** 2));

    let op = 1;
    let scale = 1;
    let y = this.still ? 0 : Math.sin(t * 0.9) * 2;
    if (this.born >= 0) {
      const a = Math.min(1, Math.max(0, (t - this.born) / RISE));
      const e = 1 - (1 - a) ** 3;
      op = a;
      scale = 0.9 + 0.1 * e;
      y += (1 - e) * 24;
    }
    if (this.burstAt >= 0) {
      const b = Math.min(1, Math.max(0, (t - this.burstAt) / 0.7));
      scale *= 1 + 1.4 * b * b;
      op *= 1 - b;
    }
    const x = this.tilt * -5 + (this.tear > 0 ? (Math.sin(t * 97) > 0 ? 4 : -4) : 0);
    y += this.tiltY * -3;
    const glow = Math.min(1, 0.25 + 0.75 * this.beat * (0.6 + 0.4 * this.fear));
    // (only touch the page when something visible changed)
    const sig = `${op.toFixed(2)}|${scale.toFixed(3)}|${x.toFixed(1)}|${y.toFixed(1)}|${glow.toFixed(2)}|${this.tear > 0}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.canvas.style.opacity = op.toFixed(2);
    this.canvas.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${scale.toFixed(3)})`;
    this.glow.style.opacity = glow.toFixed(2);
    this.canvas.classList.toggle('torn', this.tear > 0);
  }
}
