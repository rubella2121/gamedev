/**
 * Renders the live "Aurora" wallpaper (aurora.ts) into a seamless MP4 loop for Wallpaper Engine.
 *   node tools/brand/live/render.mjs [width] [height] [fps] [out.mp4]      (defaults: 2560 1440 30 brand/wallpapers/live/aurora-live-1440p.mp4)
 *   node tools/brand/live/render.mjs 1920 1080 30 /tmp/x.mp4 --frames 0,360,719   (just those frames, as PNGs next to the out file)
 * Frame n is drawn at t = n / fps, for n = 0 .. LOOP * fps - 1: the frame after the last is frame 0 again.
 */
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const args = process.argv.slice(2);
const only = args.includes('--frames') ? args[args.indexOf('--frames') + 1].split(',').map(Number) : null;
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--frames'));
const W = Number(pos[0] ?? 2560), H = Number(pos[1] ?? 1440), FPS = Number(pos[2] ?? 30);
const out = path.resolve(pos[3] ?? path.join(root, 'brand/wallpapers/live/aurora-live-1440p.mp4'));
const LOOP = 24;
fs.mkdirSync(path.dirname(out), { recursive: true });

const js = path.join(path.dirname(out), '.aurora-live.js');
execFileSync(path.join(root, 'node_modules/.bin/esbuild'), [path.join(here, 'aurora.ts'), '--bundle', '--format=iife', `--outfile=${js}`, '--log-level=warning']);
const sprite = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'tools/brand/sprites', n + '.png')).toString('base64');

const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error(m.text()));
await page.setContent('<html><body style="margin:0;background:#000"></body></html>');
await page.evaluate((s) => (window.__sprites = s), { 'tree-a': sprite('tree-a'), 'tree-b': sprite('tree-b'), 'tree-c': sprite('tree-c') });
await page.addScriptTag({ path: js });
await page.evaluate(([w, h]) => window.__setup(w, h), [W, H]);
fs.unlinkSync(js);

const total = LOOP * FPS;
const grab = (n) => page.evaluate((t) => { window.__frame(t); return window.__out.toDataURL('image/png'); }, n / FPS);
if (only) {
  for (const n of only) {
    const f = out.replace(/\.mp4$/, '') + `-f${String(n).padStart(4, '0')}.png`;
    fs.writeFileSync(f, Buffer.from((await grab(n)).split(',')[1], 'base64'));
    console.log('saved', f);
  }
} else {
  // H.264, high quality, yuv420p (what every player and Wallpaper Engine take), +faststart; the grain is still, so it compresses
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'film', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', String(FPS * 2),
    '-movflags', '+faststart', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let n = 0; n < total; n++) {
    const png = Buffer.from((await grab(n)).split(',')[1], 'base64');
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (n % 30 === 0) console.log(`frame ${n}/${total}  ${((Date.now() - t0) / 1000 / (n + 1)).toFixed(2)} s/frame`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', out, `${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}
await browser.close();
