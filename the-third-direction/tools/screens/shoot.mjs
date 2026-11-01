// Store screenshots from the real game, with its HUD: the bots play each fight and the page is captured in bursts.
//   npm run build:standalone
//   node tools/screens/shoot.mjs outDir [scene ...]
// A scene is a 2D guardian (gloom, thicket, marsh, bones, meadow), the open forest (forest), or a 3D boss (x, collector, mash).
// Pictures are 1080 x 1920 (a 540 x 960 phone at 2x). Pick the best of each burst by eye.
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const [outDir, ...only] = process.argv.slice(2);
const dist = path.resolve('dist-standalone');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});

const SCENES = {
  forest: { kind: 'forest' },
  gloom: { kind: '2d' }, thicket: { kind: '2d' }, marsh: { kind: '2d' }, bones: { kind: '2d' }, meadow: { kind: '2d' },
  x: { kind: '3d', boss: 0 }, collector: { kind: '3d', boss: 1 }, mash: { kind: '3d', boss: 2 },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, sc] of Object.entries(SCENES)) {
  if (only.length && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  await page.goto(`http://localhost:${port}/?debug`);
  await sleep(2500);
  await page.click('.dtile:nth-child(2)');
  await page.click('.play');
  await sleep(1500);
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  if (sc.kind === '2d') {
    await page.evaluate((id) => __bot.run(id, 1), name);
    await page.waitForFunction(() => __bot.report().state === 'fight', null, { timeout: 90000 }).catch(() => {});
    await sleep(3000);
  } else if (sc.kind === '3d') {
    await page.evaluate((b) => __bot3.run(b, 0, 1), sc.boss);
    await page.waitForFunction(() => __tt.act2.state === 'fight', null, { timeout: 120000 }).catch(() => {});
    await sleep(4000);
  } else {
    await sleep(4000);
  }
  for (let i = 0; i < 12; i++) {
    await page.screenshot({ path: path.join(dir, `${String(i).padStart(2, '0')}.png`) });
    await sleep(sc.kind === '3d' ? 2500 : 1500);
  }
  console.log('done', name);
  await ctx.close();
}
await browser.close();
server.close();
