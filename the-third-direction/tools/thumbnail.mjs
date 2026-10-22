// Makes the store thumbnail, public/thumbnail.jpg (512 x 512), from the game itself.
//   npm run build:standalone && npm run gallery      (the game with its test hooks, and the tool page)
//   node tools/thumbnail.mjs [out.jpg]               (set CHROMIUM_PATH if Chromium is somewhere unusual)
// 1. the game's real picture at the moment the shadow looms over the family (Mother's bow and all) is captured from dist-standalone;
// 2. tools/thumbnail.ts draws the title, a pair of eyes in the dark and the hero's name card over it, and saves a JPEG.
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] ?? path.join(root, 'public', 'thumbnail.jpg'));

/** seconds into the opening: the shadow has begun to loom, the family look up, the clearing still glows */
const OPENING_AT = Number(process.env.OPENING_AT ?? 8.2);
const OPTS = {
  crop: { x: 44, y: 106, w: 128 },
  eyes: [
    { x: 22, y: 338, gap: 5 },
    { x: 430, y: 292, gap: 6 },
  ],
  logoWidth: 436,
  logoAt: 0.9,
};

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
function serve(dist) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(dist, p);
      if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': mime[path.extname(f)] ?? 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

for (const d of ['dist-standalone', 'dist-gallery']) {
  if (!fs.existsSync(path.join(root, d))) {
    console.log(`${d} is missing: run npm run build:standalone and npm run gallery first`);
    process.exit(1);
  }
}
const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('console', (m) => ['error'].includes(m.type()) && errors.push(`[${m.type()}] ${m.text()}`));
};

// 1. the picture
const game = await serve(path.join(root, 'dist-standalone'));
const gp = await (await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1 })).newPage();
watch(gp);
await gp.goto(`http://localhost:${game.port}/?debug`, { waitUntil: 'load' });
await gp.waitForFunction(() => window.__tt && window.__tt.act1, null, { timeout: 60000 });
await gp.waitForTimeout(1200);
const scene = await gp.evaluate((ot) => {
  const f = window.__tt.act1;
  f.previewMode = false;
  f.mode = 'opening';
  f.ot = ot;
  f.time = 0.4;
  f.render();
  return f.p.canvas.toDataURL('image/png');
}, OPENING_AT);
game.server.close();

// 2. the card
const tool = await serve(path.join(root, 'dist-gallery'));
const tp = await (await browser.newContext({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 })).newPage();
watch(tp);
await tp.goto(`http://localhost:${tool.port}/thumbnail.html`, { waitUntil: 'load' });
await tp.waitForFunction(() => window.__thumb, null, { timeout: 60000 });
const jpg = await tp.evaluate(([s, o]) => window.__thumb(s, o), [scene, OPTS]);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(jpg.split(',')[1], 'base64'));
console.log('saved', out, `${(fs.statSync(out).size / 1024).toFixed(0)} KB`, errors.length ? '\nERRORS:\n' + errors.slice(0, 6).join('\n') : '');
tool.server.close();
await browser.close();
