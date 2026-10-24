// The trailer's footage, frame by frame, from the real game (headless Chromium, no GPU needed).
//   npm run build:standalone
//   node tools/trailer/capture.mjs dist-standalone tools/trailer/shots.mjs outDir [shotName ...]
// Each shot sets the game up through its debug hooks (window.__tt, __bot, __bot3) with the clock running, waits until it is
// ready, then takes the clock over: every frame moves the game on by exactly 1/30 s (Game.tick) and the canvas is saved as a
// JPEG (outDir/<shot>/00001.jpg ...). A slow software renderer only makes it take longer; the footage is still 30 frames a
// second of game time. The canvas holds the game only: no HUD, no captions (the trailer adds its own words).
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const [distArg, shotsPath, outDir, ...only] = process.argv.slice(2);
const dist = path.resolve(distArg);
const { SHOTS } = await import(path.resolve(shotsPath));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});

for (const shot of SHOTS) {
  if (only.length && !only.includes(shot.name)) continue;
  const dir = path.join(outDir, shot.name);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${shot.name}] pageerror ${e.message}`));
  await page.goto(`http://localhost:${port}/?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__tt, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  const t0 = Date.now();
  // set up, with the game's own clock
  await page.evaluate(`(() => { const g = __tt; g.tuneRes = () => {}; g.hdBudget = ${shot.budget ?? 5.3e5}; document.querySelectorAll('.start,.splash').forEach((e) => e.classList.add('hide')); ${shot.setup}; return 1 })()`);
  if (shot.until) await page.waitForFunction(shot.until, null, { timeout: shot.timeout ?? 600000, polling: 100 });
  // the clock is ours now
  await page.evaluate(`(() => { __tt.manualClock(true); ${shot.atStart ?? ''}; return 1 })()`);
  const dt = 1 / 30;
  for (let i = 0; i < (shot.warm ?? 0); i++) await page.evaluate(`__tt.tick(${dt})`);
  let saved = 0;
  for (let i = 0; i < shot.frames; i++) {
    const data = await page.evaluate(`(() => { ${shot.each ?? ''}; __tt.tick(${dt}); return __tt.renderer.domElement.toDataURL('image/jpeg', 0.93) })()`);
    fs.writeFileSync(path.join(dir, String(i + 1).padStart(5, '0') + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
    saved++;
    if (shot.stop && (await page.evaluate(shot.stop))) break;
  }
  console.log(`${shot.name}: ${saved} frames in ${Math.round((Date.now() - t0) / 1000)} s`);
  await ctx.close();
}
await browser.close();
server.close();
