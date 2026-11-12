/**
 * The Blob on a layer of its own, for the song edit's effects (an aura round it, an outline, the Blob popping out of the frame,
 * words behind it). capture.mjs puts this in the page (bundled by esbuild) for a shot with `layers`, and after every frame:
 *
 *  - 2D (the forest): __layer2d() draws the Blob again, alone, with the game's own drawBlob at the same place, size, look, blink
 *    and skin, on a transparent canvas the forest's size (216 x 384). The forest's canvas itself is saved as it is (PNG, every
 *    pixel exact), so the film can enlarge both by whole numbers and they stay one picture.
 *  - 3D (the Crater): __layer3d() draws the frame again with nothing in it but the Blob (and what it wears), once on black and
 *    once on white: where the two agree the Blob covers the pixel, where they differ it lets the ground through, and by how much
 *    (alpha = 1 - (white - black)); its colour is what it gave on black over that alpha. What glows (flames, sparkles) is drawn
 *    again on its own, on black, behind the Blob's black shape, to be added over whatever the film puts behind.
 * Both say where the Blob is on the screen, so the film can follow it.
 */
import { drawBlob } from '../../src/core/art';
import type { SkinId } from '../../src/core/blobskins';
import { Pix } from '../../src/core/pix';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const WIN = window as unknown as Record<string, Any>;

/* ------------------------------------------------------------------------------------------------ 2D */

let one: Pix | null = null;

/** the skin the save says the Blob wears (the capture's test build keeps its save in window.name) */
function skin(): SkinId {
  try {
    return (JSON.parse(window.name)['tt.skin'] as SkinId) || 'default';
  } catch {
    return 'default';
  }
}

WIN.__layer2d = () => {
  const a = WIN.__tt.act1;
  const pl = a.player;
  one ??= new Pix();
  one.ctx.clearRect(0, 0, one.w, one.h);
  // where the forest drew it (its camera rounded to whole pixels; the capture keeps the forest's own shake off)
  const x = pl.x - Math.round(a.camX);
  const y = pl.y - Math.round(a.camY);
  const t = a.time;
  const pinned = a.mode === 'pinned' || a.mode === 'rift';
  const flick = pl.invuln > 0 && Math.floor(t * 16) % 2 === 0;
  const shown = a.mode !== 'opening' && a.mode !== 'dive' && (pinned || (!pl.hide && !flick));
  if (shown) drawBlob(one, x, y, { squash: pl.squash, lookX: pl.lookX, lookY: pl.lookY, blink: pl.blink, skin: skin(), t, shadow: false });
  return { png: one.canvas.toDataURL('image/png'), x, y, shown, mode: a.mode };
};

/* ------------------------------------------------------------------------------------------------ 3D */

let grab: HTMLCanvasElement | null = null;
let black: Any = null;

/** the renderer's picture, read back now (straight after a render, before the browser clears it) */
function read(r: Any): ImageData {
  const c = r.domElement as HTMLCanvasElement;
  grab ??= document.createElement('canvas');
  if (grab.width !== c.width || grab.height !== c.height) {
    grab.width = c.width;
    grab.height = c.height;
  }
  const g = grab.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, grab.width, grab.height);
  g.drawImage(c, 0, 0);
  return g.getImageData(0, 0, grab.width, grab.height);
}

const ADDITIVE = 2; // THREE.AdditiveBlending
const glowing = (o: Any) => !!o.material && !Array.isArray(o.material) && o.material.blending === ADDITIVE;
const drawable = (o: Any) => o.isMesh || o.isSprite || o.isPoints || o.isLine;

WIN.__layer3d = (withGlow: boolean) => {
  const tt = WIN.__tt;
  const r = tt.renderer;
  const a = tt.act2.arena;
  const scene = a.scene;
  const cam = a.camera;
  const mine = new Set<Any>();
  a.player.traverse((o: Any) => mine.add(o));
  // everything that is not the Blob goes, and (for now) what glows
  const hidden: Any[] = [];
  scene.traverse((o: Any) => {
    if (!drawable(o) || !o.visible) return;
    if (!mine.has(o) || glowing(o)) {
      o.visible = false;
      hidden.push(o);
    }
  });
  const bg = scene.background;
  scene.background = null;
  // (the renderer's clear colour, read into a colour of the game's own: the scene's background is one)
  const clear = bg && bg.isColor ? r.getClearColor(bg.clone()) : null;
  const clearA = r.getClearAlpha();
  const shadowAuto = r.shadowMap.autoUpdate;
  r.shadowMap.autoUpdate = false;
  r.shadowMap.needsUpdate = false;
  r.setClearColor(0x000000, 1);
  r.render(scene, cam);
  const k = read(r);
  r.setClearColor(0xffffff, 1);
  r.render(scene, cam);
  const w = read(r);
  // the cutout: alpha from the difference, colour from the black one
  const out = new ImageData(k.width, k.height);
  const K = k.data;
  const Wd = w.data;
  const O = out.data;
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0, p = 0; i < K.length; i += 4, p++) {
    const d = (Wd[i]! - K[i]! + Wd[i + 1]! - K[i + 1]! + Wd[i + 2]! - K[i + 2]!) / 3;
    const al = Math.max(0, Math.min(255, 255 - d));
    if (al < 2) continue;
    const s = 255 / al;
    O[i] = Math.min(255, K[i]! * s);
    O[i + 1] = Math.min(255, K[i + 1]! * s);
    O[i + 2] = Math.min(255, K[i + 2]! * s);
    O[i + 3] = al;
    if (al > 60) {
      const x = p % k.width;
      const y = (p / k.width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  grab!.getContext('2d')!.putImageData(out, 0, 0);
  const png = grab!.toDataURL('image/png');
  // what glows: the Blob's own glowing things, on black, the Blob a black shape in front of what is behind it
  let glow: string | null = null;
  if (withGlow) {
    const lit: Any[] = [];
    const swapped: [Any, Any][] = [];
    a.player.traverse((o: Any) => {
      if (!drawable(o)) return;
      if (glowing(o)) {
        if (hidden.includes(o)) {
          o.visible = true;
          lit.push(o);
        }
      } else if (o.visible && o.material) {
        if (!black) {
          let Basic: Any = null;
          scene.traverse((q: Any) => {
            if (!Basic && q.material && !Array.isArray(q.material) && q.material.isMeshBasicMaterial) Basic = q.material.constructor;
          });
          black = new Basic({ color: 0x000000 });
        }
        swapped.push([o, o.material]);
        o.material = black;
      }
    });
    if (lit.length) {
      r.setClearColor(0x000000, 1);
      r.render(scene, cam);
      glow = r.domElement.toDataURL('image/jpeg', 0.92);
    }
    for (const [o, m] of swapped) o.material = m;
    for (const o of lit) o.visible = false;
  }
  // put everything back
  for (const o of hidden) o.visible = true;
  scene.background = bg;
  r.setClearColor(clear ?? 0x05060c, clearA);
  r.shadowMap.autoUpdate = shadowAuto;
  // where the Blob is on the screen (its middle, and the box it fills)
  const v = a.player.position.clone();
  v.y += 0.9;
  v.project(cam);
  return {
    png,
    glow,
    x: Math.round(((v.x + 1) / 2) * k.width),
    y: Math.round(((1 - v.y) / 2) * k.height),
    box: maxX >= 0 ? [minX, minY, maxX, maxY] : null,
    w: k.width,
    h: k.height,
  };
};
