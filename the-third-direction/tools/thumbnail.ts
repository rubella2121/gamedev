import { STORY } from '../src/core/story';
import { Logo } from '../src/logo';

/**
 * The store thumbnail (512 x 512), drawn from the game itself: a piece of its real picture (tools/thumbnail.mjs captures it), its own
 * voxel title, a pair of eyes in the dark or two, and the hero's name card from the story table. Run through
 * tools/thumbnail.mjs, which writes public/thumbnail.jpg.
 */

const S = 512;
const FONT = "'Liberation Mono', 'DejaVu Sans Mono', 'Courier New', monospace";

export interface ThumbOpts {
  /** the piece of the 216 x 384 picture to show: its top left corner, and its width and height (square) */
  crop: { x: number; y: number; w: number };
  /** pairs of red eyes in the dark: where (in the thumbnail's pixels) and how far apart */
  eyes: { x: number; y: number; gap: number }[];
  /** the title's width in pixels, and the moment of its swaying depth */
  logoWidth: number;
  logoAt: number;
}

function load(src: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.src = src;
  return im.decode().then(() => im);
}

function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  // centred text with letter spacing (the trailing space is not counted)
  (g as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
  const w = g.measureText(text).width - spacing;
  g.fillText(text, x - w / 2, y);
  (g as unknown as { letterSpacing: string }).letterSpacing = '0px';
}

async function compose(sceneUrl: string, o: ThumbOpts): Promise<string> {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const { x, y, w } = o.crop;

  // the game's own picture, every pixel made four pixels
  g.drawImage(await load(sceneUrl), x, y, w, w, 0, 0, S, S);
  // eyes opening in the dark at the edges, drawn the way the home page draws them
  const k = S / w;
  for (const e of o.eyes) {
    g.fillStyle = 'rgba(224, 43, 58, 0.16)';
    g.fillRect(e.x - 2 * k, e.y - 2 * k, (e.gap + 7) * k, 6 * k);
    for (const ex of [e.x, e.x + e.gap * k]) {
      g.fillStyle = 'rgb(224, 43, 58)';
      g.fillRect(ex, e.y, 3 * k, 2 * k);
      g.fillStyle = 'rgb(255, 150, 150)';
      g.fillRect(ex + k, e.y, k, k);
    }
  }

  // darker behind the title and the caption, and in the corners
  const top = g.createLinearGradient(0, 0, 0, 270);
  top.addColorStop(0, 'rgba(2, 4, 10, 0.78)');
  top.addColorStop(1, 'rgba(2, 4, 10, 0)');
  g.fillStyle = top;
  g.fillRect(0, 0, S, 270);
  const bottom = g.createLinearGradient(0, 410, 0, S);
  bottom.addColorStop(0, 'rgba(2, 4, 10, 0)');
  bottom.addColorStop(1, 'rgba(2, 4, 10, 0.88)');
  g.fillStyle = bottom;
  g.fillRect(0, 410, S, S - 410);
  const vig = g.createRadialGradient(S / 2, S * 0.56, S * 0.3, S / 2, S * 0.56, S * 0.78);
  vig.addColorStop(0, 'rgba(2, 4, 10, 0)');
  vig.addColorStop(1, 'rgba(2, 4, 10, 0.6)');
  g.fillStyle = vig;
  g.fillRect(0, 0, S, S);

  // the title
  const logo = new Logo();
  logo.resize(o.logoWidth);
  logo.draw(o.logoAt);
  const lw = logo.canvas.width;
  const lh = logo.canvas.height;
  g.drawImage(logo.canvas, Math.round((S - lw) / 2), 12);

  // the jam's theme, small, under it
  g.textBaseline = 'alphabetic';
  g.font = `bold 15px ${FONT}`;
  g.fillStyle = 'rgba(232, 255, 251, 0.8)';
  g.shadowColor = 'rgba(0, 0, 0, 0.9)';
  g.shadowBlur = 6;
  spaced(g, 'A MONSTER MASH', S / 2, 12 + lh + 20, 6.5);

  // the hero's name card, the way the game shows it
  g.font = `bold 27px ${FONT}`;
  g.fillStyle = '#ffe9a0';
  g.shadowColor = 'rgba(255, 214, 110, 0.75)';
  g.shadowBlur = 14;
  spaced(g, STORY.hero.name.toUpperCase(), S / 2, 463, 9);
  g.font = `italic 21px ${FONT}`;
  g.fillStyle = '#e8fffb';
  g.shadowColor = 'rgba(159, 244, 238, 0.7)';
  g.shadowBlur = 10;
  spaced(g, STORY.hero.sub, S / 2, 494, 1.5);
  g.shadowBlur = 0;

  return c.toDataURL('image/jpeg', 0.93);
}

(window as unknown as { __thumb: typeof compose }).__thumb = compose;
