/**
 * Saves the boss and blob sprites (tools/sprites.ts) into tools/brand/sprites/ for the brand art.
 * Run: npm run gallery && node tools/brand/sprites.mjs
 */
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../dist-gallery');
const out = path.join(here, 'sprites');
fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`http://localhost:${server.address().port}/sprites.html`);
await page.waitForFunction(() => window.__sprites, null, { timeout: 60000 });
// (names on the command line: only those, e.g. the wallpaper pack's large ones: x-4k collector-4k mash-4k)
const all = await page.evaluate((names) => window.__sprites.render(names), process.argv.slice(2));
for (const [k, url] of Object.entries(all)) {
  fs.writeFileSync(path.join(out, `${k}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', `tools/brand/sprites/${k}.png`);
}
await browser.close();
server.close();
