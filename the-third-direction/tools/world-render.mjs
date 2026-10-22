// Renders pictures of the 3D world mock-up (tools/world3d.ts) with headless Chromium.
//   npm run gallery
//   node tools/world-render.mjs <spec.json> <outDir> [shotName ...]
// spec: { "shots": [ { "name": "overview", "w": 1280, "h": 720, "ss": 1, "cam": { "pos": [0,300,380], "look": [0,0,0], "fov": 40 }, "fog": {...}, "moon": {...}, ... } ] }
// (see ShotSpec in tools/world3d.ts). With `ss` > 1 the page draws bigger and this script shrinks the picture back (smoother edges).
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist-gallery');
const [specPath, outDir, ...only] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

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
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--js-flags=--max-old-space-size=8192'],
});
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text().slice(0, 400)}`);
  else if (m.type() === 'log') console.log('log:', m.text());
});
await page.goto(`http://localhost:${port}/world3d.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__world, null, { timeout: 120000 });
const t0 = Date.now();
const init = await page.evaluate(([o]) => window.__world.init(o), [spec.init ?? {}]);
console.log(`init ${init} ms`, JSON.stringify(await page.evaluate(() => window.__world.stats())));

// Python's PIL shrinks supersampled pictures: it is the one image tool both here and in the sheets
const requireHere = createRequire(import.meta.url);
void requireHere;
for (const s of spec.shots) {
  if (only.length && !only.includes(s.name)) continue;
  const t1 = Date.now();
  const out = await page.evaluate((s) => window.__world.render(s), s);
  const w = s.w ?? 1280;
  const h = s.h ?? 720;
  const { execFileSync } = await import('child_process');
  for (const [suffix, url] of [['', out.beauty], ['.depth', out.depth]]) {
    if (!url) continue;
    const file = path.join(outDir, `${s.name}${suffix}.png`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    // a picture drawn bigger is shrunk back here (smoother edges); the depth picture is shrunk with a plain box filter so distances do not smear
    if ((s.ss ?? 1) > 1) {
      const filt = suffix ? 'BOX' : 'LANCZOS';
      execFileSync('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(file)}).convert('RGB'); im=im.resize((${w},${h}), Image.${filt}); im.save(${JSON.stringify(file)})`]);
    }
  }
  console.log(`saved ${s.name} (${w}x${h} x${s.ss ?? 1}${out.depth ? ' + depth' : ''}) in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
}
console.log('stats', JSON.stringify(await page.evaluate(() => window.__world.stats())));
console.log('ERRORS:', errors.length ? '\n' + errors.slice(0, 10).join('\n') : 'none', `(total ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
await browser.close();
server.close();
