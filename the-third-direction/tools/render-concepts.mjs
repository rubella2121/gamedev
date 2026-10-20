// Renders the boss concept cards into concept-art/*.png with headless Chromium.
// Usage: npm run concepts   (set CHROMIUM_PATH if Chromium is not in the usual place)
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist-gallery');
const out = path.join(root, 'concept-art');
fs.mkdirSync(out, { recursive: true });

const FILES = [
  ['sheet', '00-overview'],
  ['gloommother', '01-gloommother'],
  ['king', '02-thornback-king'],
  ['queen', '03-toll-queen'],
  ['wyrm', '04-bone-wyrm'],
  ['mimicq', '05-mimic-queen'],
  ['x', '06-x-the-hollow'],
  ['moon', '07-the-moon'],
  ['mash', '08-the-mash'],
  ['collector', '09-the-collector'],
];

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: 405, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/gallery.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__gallery, null, { timeout: 15000 });
for (const [key, name] of FILES) {
  const url = await page.evaluate((k) => window.__gallery.render(k), key);
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('saved', `concept-art/${name}.png`);
}
await browser.close();
server.close();
