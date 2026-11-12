/**
 * Renders the skins reel's pictures (skins-assets.ts) into <out>: px/<skin>.png (pixel strips), 3d/<job>/s000.png (solid,
 * transparent) and 3d/<job>/g000.png (the light of what glows, on black, where anything glows).
 *   node tools/trailer/skins-assets.mjs ../trailer-video/public/skins [job ...]     (jobs: px turn-<skin> golden crown carousel)
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const [outArg, ...want] = process.argv.slice(2);
const out = path.resolve(outArg);
const SKINS = ['explorer', 'knight', 'wizard', 'inferno', 'golden'];
const jobs = want.length ? want : ['px', ...SKINS.map((s) => 'turn-' + s), 'golden', 'crown', 'carousel'];
const js = path.join(out, '.skins-assets.js');
fs.mkdirSync(out, { recursive: true });
execFileSync(path.join(root, 'node_modules/.bin/esbuild'), [path.join(here, 'skins-assets.ts'), '--bundle', '--format=iife', `--outfile=${js}`, '--log-level=warning']);
const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.setContent('<html><body style="margin:0;background:#000"></body></html>');
await page.addScriptTag({ path: js });
fs.unlinkSync(js);
const save = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
for (const job of jobs) {
  const t0 = Date.now();
  if (job === 'px') {
    fs.mkdirSync(path.join(out, 'px'), { recursive: true });
    for (const s of ['default', ...SKINS]) save(path.join(out, 'px', `${s}.png`), await page.evaluate((s) => window.__px(s), s));
    save(path.join(out, 'px', 'default-up.png'), await page.evaluate(() => window.__px('default', -1)));
    // and each frame on its own (px/<skin>/00.png ..), which the film shows one at a time (an image it can wait for)
    for (const s of ['default', ...SKINS, 'default-up']) {
      fs.mkdirSync(path.join(out, 'px', s), { recursive: true });
      const frames = await page.evaluate(async (src) => {
        const im = new Image();
        im.src = src;
        await im.decode();
        return Array.from({ length: im.width / 64 }, (_, i) => {
          const c = document.createElement('canvas');
          c.width = c.height = 64;
          c.getContext('2d').drawImage(im, -i * 64, 0);
          return c.toDataURL('image/png');
        });
      }, 'data:image/png;base64,' + fs.readFileSync(path.join(out, 'px', `${s}.png`)).toString('base64'));
      frames.forEach((u, i) => save(path.join(out, 'px', s, `${String(i).padStart(2, '0')}.png`), u));
    }
    console.log('px', ((Date.now() - t0) / 1000).toFixed(1), 's');
    continue;
  }
  const dir = path.join(out, '3d', job);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const n = await page.evaluate((j) => window.__setup3d(j), job);
  let glows = 0;
  for (let f = 0; f < n; f++) {
    const { solid, glow } = await page.evaluate((f) => window.__frame3d(f), f);
    const id = String(f).padStart(3, '0');
    save(path.join(dir, `s${id}.png`), solid);
    if (glow) {
      save(path.join(dir, `g${id}.png`), glow);
      glows++;
    }
  }
  console.log(job, n, 'frames', glows ? `(+${glows} glow)` : '', ((Date.now() - t0) / 1000).toFixed(1), 's');
}
await browser.close();
