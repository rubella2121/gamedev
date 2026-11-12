// The trailer's footage, frame by frame, from the real game (headless Chromium, no GPU needed).
//   npm run build:standalone
//   node tools/trailer/capture.mjs dist-standalone tools/trailer/shots.mjs outDir [shotName ...]
// Each shot sets the game up through its debug hooks (window.__tt, __bot, __bot3) with the clock running, waits until it is
// ready, then takes the clock over: every frame moves the game on by exactly 1/30 s (Game.tick) and the canvas is saved as a
// JPEG (outDir/<shot>/00001.jpg ...). A shot's `skin` puts that skin on the Blob. A slow software renderer only makes it take longer; the footage is still 30 frames a
// second of game time. The canvas holds the game only: no HUD, no captions (the trailer adds its own words).
//
// A shot with `layers` also saves the Blob on a layer of its own (layers.ts), for the song edit's effects:
//   '2d'  the forest as its own pixels (00001.png, 216 x 384, exact), the Blob alone over transparent (b00001.png), and, while
//         the forest is torn open onto the 3D world or the 3D has taken over, the screen as it is (h00001.jpg); the forest's
//         shake and the Blob's hit-flicker are left out (the edit shakes on its own beats), and its HUD is not drawn
//   '3d'  the frame (00001.jpg), the Blob cut out of it (m00001.png, transparent round it) and, with `glow`, the light of what
//         it wears that glows, on black (g00001.jpg); the moth and the moth's shield are left out of every frame
// and layers.json: for each frame where the Blob is on the screen (and, in 2D, whether it is drawn and whether there is an h).
import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

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
// the layers' own code (the game's drawBlob and Pix), bundled for the page
const here = path.dirname(fileURLToPath(import.meta.url));
const layersJs = path.join(os.tmpdir(), `tt-layers-${process.pid}.js`);
if (SHOTS.some((s) => s.layers && (!only.length || only.includes(s.name)))) {
  execFileSync(path.resolve(here, '../../node_modules/.bin/esbuild'), [path.join(here, 'layers.ts'), '--bundle', '--format=iife', `--outfile=${layersJs}`, '--log-level=warning']);
}
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
  // (a shot can ask for a bigger picture: the 3D is drawn at the page's size, within the shot's pixel budget)
  const [vw, vh] = shot.viewport ?? [540, 960];
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  // a shot can dress the Blob: the save says it owns every skin and wears this one (the test build keeps its save in window.name)
  if (shot.skin) {
    await ctx.addInitScript((skin) => {
      window.name = JSON.stringify({ 'tt.skins': 'explorer,knight,wizard,inferno,golden', 'tt.skin': skin, 'tt.tutorial': '1', 'tt.briefed': '1', 'tt.intro': '1' });
    }, shot.skin);
  }
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
  const L = shot.layers;
  if (L) {
    await page.addScriptTag({ path: layersJs });
    // (after the shot's own camera, every frame: the forest's shake off, the hit-flicker held back while it draws; no moth)
    await page.evaluate(`(() => { const bd = __tt.beforeDraw;
      __tt.beforeDraw = () => { if (bd) bd();
        if (__tt.state === 'act1') { const a = __tt.act1; a.shakeV = 0; window.__inv = a.player.invuln; a.player.invuln = 0; }
        const A = __tt.act2 && __tt.act2.arena; if (A && A.moth) { A.moth.visible = false; if (A.shieldMesh) A.shieldMesh.visible = false; } };
      if (__tt.act1) { __tt.act1.drawHud = () => {}; __tt.act1.drawCompass = () => {}; }
      return 1 })()`);
  }
  const before = L ? "if (window.__inv !== undefined && __tt.state === 'act1') { __tt.act1.player.invuln = window.__inv; window.__inv = undefined; }" : '';
  const meta = [];
  const save = (name, url) => fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
  // a shot can run the game slower than the film (dt 1/60 is half speed): real slow motion, every frame drawn
  const dt = shot.dt ?? 1 / 30;
  for (let i = 0; i < (shot.warm ?? 0); i++) await page.evaluate(`__tt.tick(${dt})`);
  let saved = 0;
  for (let i = 0; i < shot.frames; i++) {
    const n = String(i + 1).padStart(5, '0');
    if (L === '2d') {
      const r = await page.evaluate(`(() => { ${before} ${shot.each ?? ''}; __tt.tick(${dt});
        const hd = __tt.state !== 'act1' || !!__tt.act1.portalView();
        const b = __tt.state === 'act1' ? __layer2d() : null;
        return { px: __tt.state === 'act1' ? __tt.act1.p.canvas.toDataURL('image/png') : null, hd: hd ? __tt.renderer.domElement.toDataURL('image/jpeg', 0.93) : null, b } })()`);
      if (r.px) save(`${n}.png`, r.px);
      if (r.hd) save(`h${n}.jpg`, r.hd);
      if (r.b) save(`b${n}.png`, r.b.png);
      meta.push(r.b ? { x: r.b.x, y: r.b.y, shown: r.b.shown, mode: r.b.mode, hd: !!r.hd } : { shown: false, hd: !!r.hd, px: !!r.px });
    } else {
      const data = await page.evaluate(`(() => { ${before} ${shot.each ?? ''}; __tt.tick(${dt}); return __tt.renderer.domElement.toDataURL('image/jpeg', 0.93) })()`);
      save(`${n}.jpg`, data);
      if (L === '3d') {
        const m = await page.evaluate(`__layer3d(${!!shot.glow})`);
        save(`m${n}.png`, m.png);
        if (m.glow) save(`g${n}.jpg`, m.glow);
        meta.push({ x: m.x, y: m.y, box: m.box, glow: !!m.glow, w: m.w, h: m.h });
      }
    }
    saved++;
    if (shot.stop && (await page.evaluate(shot.stop))) break;
  }
  if (L) fs.writeFileSync(path.join(dir, 'layers.json'), JSON.stringify(meta));
  console.log(`${shot.name}: ${saved} frames in ${Math.round((Date.now() - t0) / 1000)} s`);
  await ctx.close();
}
await browser.close();
server.close();
fs.rmSync(layersJs, { force: true });
