// Renders one reference page (character.html, map.html, ...) to a PNG with headless Chromium.
//   node render.mjs character.html blob-character-sheet.png [width height]
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const [page, outPng, w = 1800, h = 1240] = process.argv.slice(2);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined), headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await (await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 })).newPage();
const errors = [];
pg.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
pg.on('pageerror', (e) => errors.push('pageerror ' + e.message));
await pg.goto(`http://localhost:${server.address().port}/concept-art/3d-reference/${page}`, { waitUntil: 'load' });
await pg.waitForFunction(() => window.__done, null, { timeout: 120000 });
await pg.waitForTimeout(300);
await pg.locator("#sheet").screenshot({ path: path.join(here, outPng) });
console.log('saved', outPng, errors.length ? '\nERRORS:\n' + errors.slice(0, 8).join('\n') : '');
await browser.close();
server.close();
