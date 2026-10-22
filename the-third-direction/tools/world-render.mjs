// Renders the pictures of the Pressed World concept (docs/3D-WORLD.md) with headless Chromium, using the in-engine renderer page tools/world3d.ts.
//   npm run gallery                                       (builds dist-gallery/world3d.html)
//   python3 tools/world-shots.py specs.json [shotName ...]   (writes a spec; or write one by hand)
//   node tools/world-render.mjs <spec.json> <outDir> [shotName ...]
// spec: { "init": { "cast": ["x", "collector", "mash", "fox"] }, "shots": [ { "name": "x", "build": "garden", "params": {...}, "w": 1280, "h": 720, "ss": 1,
//   "cam": { "pos": [0,8,25], "look": [0,4,0], "fov": 64 }, "fog": {...}, "key": {...}, "grade": {...}, "depth": true, "post": { "rays": {...}, "dof": {...}, "glow": 0.3 } } ] }
// (see ShotSpec in tools/world3d.ts and the builders in tools/world/shots.ts). With `ss` > 1 the page draws bigger and this script shrinks the picture back (smoother edges).
// A shot with `depth` also saves <name>.depth.png, and with `post` tools/world-post.py (python3 with numpy and PIL) adds god rays, depth of field and glow from it.
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

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

for (const s of spec.shots) {
  if (only.length && !only.includes(s.name)) continue;
  const t1 = Date.now();
  const out = await page.evaluate((s) => window.__world.render(s), s);
  const w = s.w ?? 1280;
  const h = s.h ?? 720;
  for (const [suffix, url] of [['', out.beauty], ['.depth', out.depth]]) {
    if (!url) continue;
    const file = path.join(outDir, `${s.name}${suffix || (out.depth ? '.raw' : '')}.png`);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    // a picture drawn bigger is shrunk back here (smoother edges); the depth picture is shrunk with a plain box filter so distances do not smear
    if ((s.ss ?? 1) > 1) {
      const filt = suffix ? 'BOX' : 'LANCZOS';
      execFileSync('python3', ['-c', `from PIL import Image; im=Image.open(${JSON.stringify(file)}).convert('RGB'); im=im.resize((${w},${h}), Image.${filt}); im.save(${JSON.stringify(file)})`]);
    }
  }
  fs.writeFileSync(path.join(outDir, `${s.name}.rays.json`), JSON.stringify({ rays: out.rays, anchors: out.anchors, post: s.post ?? {} }));
  if (out.depth) {
    const ex = execFileSync;
    const raw = path.join(outDir, `${s.name}.raw.png`);
    const final = path.join(outDir, `${s.name}.png`);
    if (s.post) ex('python3', [path.join(root, 'tools', 'world-post.py'), raw, path.join(outDir, `${s.name}.depth.png`), path.join(outDir, `${s.name}.rays.json`), final], { stdio: 'inherit' });
    else fs.copyFileSync(raw, final);
  }
  console.log(`saved ${s.name} (${w}x${h} x${s.ss ?? 1}${out.depth ? ' + depth' : ''}) in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
}
console.log('stats', JSON.stringify(await page.evaluate(() => window.__world.stats())));
console.log('ERRORS:', errors.length ? '\n' + errors.slice(0, 10).join('\n') : 'none', `(total ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
await browser.close();
server.close();
