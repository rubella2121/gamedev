// Renders views of a 3D monster from the lab into PNG files.
//   npm run gallery            (builds dist-gallery, including the lab)
//   node tools/lab-render.mjs <spec.json> <outDir>
// spec: { "model": "x", "shots": [ { "name": "front", "cam": { "pos": [0,10,12], "look": [0,8,-29], "fov": 50 }, "w": 432, "h": 768,
//         "poses": [["foot", 1]], "step": 0.5, "light": 80 } ] }
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist-gallery');
const [specPath, outDir] = process.argv.slice(2);
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
const executablePath = process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: 405, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`);
  else if (m.type() === 'log') console.log('log:', m.text());
});
await page.goto(`http://localhost:${port}/lab3d.html`, { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__lab, null, { timeout: 60000 });
} catch (e) {
  console.log('the lab page never became ready (did you run `npm run gallery` first?)\n' + errors.slice(0, 12).join('\n'));
  await browser.close();
  server.close();
  process.exit(1);
}
const ms = await page.evaluate((m) => window.__lab.load(m), spec.model);
const st = await page.evaluate(() => window.__lab.stats());
console.log(`built ${spec.model} in ${ms} ms`, st);
for (const s of spec.shots) {
  await page.evaluate((s) => {
    const L = window.__lab;
    if (s.light !== undefined) L.light(s.light);
    for (const [n, v] of s.poses ?? []) L.pose(n, v);
    if (s.step) L.step(1 / 30, Math.round(s.step * 30));
  }, s);
  const url = await page.evaluate((s) => window.__lab.shot(s.cam, s.w ?? 432, s.h ?? 768), s);
  fs.writeFileSync(path.join(outDir, `${s.name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('saved', s.name);
}
console.log('ERRORS:', errors.length ? '\n' + errors.slice(0, 12).join('\n') : 'none');
await browser.close();
server.close();
