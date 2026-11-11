/**
 * Renders the wallpaper pack from tools/brand/wallpapers.html into brand/wallpapers/desktop (3840 x 2160) and
 * brand/wallpapers/phone (1440 x 3120), and zips it (the-third-direction-wallpapers.zip, the free download on itch.io).
 *   node tools/brand/sprites.mjs x-4k x-bust-4k collector-4k mash-4k     (once: the 3D bosses, large; after npm run gallery)
 *   node tools/brand/wallpapers.mjs [name ...] [--preview] [--desktop | --phone]
 *   node tools/brand/wallpapers.mjs --extras [name ...] [--preview]
 * --preview draws at a quarter of the size into brand/wallpapers/preview (for looking at a change quickly).
 * --extras draws the ones that are not in the pack (made on request) into brand/wallpapers/extras, for a 4K phone (2160 x 3840).
 */
import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const preview = flags.has('--preview');
const k = preview ? 0.25 : 1;
const out = path.resolve(here, '../../brand/wallpapers');
const extras = flags.has('--extras');
const SIZES = (extras ? [['extras', 2160, 3840]] : [
  ['desktop', 3840, 2160],
  ['phone', 1440, 3120],
]).filter(([n]) => (!flags.has('--desktop') && !flags.has('--phone')) || flags.has('--' + n));

const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync(guess) ? guess : undefined),
  // the page draws its own image files into WebGL and onto canvases, and exports them: allow that from file://
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
await page.goto('file://' + path.join(here, 'wallpapers.html'));
const all = await page.evaluate((x) => (x ? window.extras() : window.names()), extras);
const names = args.filter((a) => !a.startsWith('--'));
for (const name of names.length ? names : all) {
  const n = String(all.indexOf(name) + 1).padStart(2, '0');
  for (const [kind, w, h] of SIZES) {
    const dir = path.join(out, preview ? 'preview' : kind);
    mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    const url = await page.evaluate(([nm, W, H]) => window.render(nm, W, H), [name, Math.round(w * k), Math.round(h * k)]);
    const file = path.join(dir, preview ? `${n}-${name}-${kind}.jpg` : `${n}-${name}.jpg`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(path.resolve(here, '../..'), file), `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}
await browser.close();
if (!preview && !extras && !names.length && SIZES.length === 2) {
  const zip = path.resolve(here, '../../the-third-direction-wallpapers.zip');
  execFileSync('rm', ['-f', zip]);
  execFileSync('zip', ['-qr', zip, 'desktop', 'phone'], { cwd: out });
  console.log('zipped the-third-direction-wallpapers.zip');
}
