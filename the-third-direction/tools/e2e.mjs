// Tiny browser test runner (headless Chromium through playwright-core).
//   npm run build:standalone                  (builds dist-standalone: the game with the test bots compiled in)
//   QS='?debug' node tools/e2e.mjs dist-standalone steps.json outDir
// steps.json is a list of steps, run in order: {wait: ms} {click: selector} {eval: js} {evalFile: path} {until: js, timeout: ms}
// {shot: name} (PNG into outDir) {press: key} {hold: {key, ms}} {keyDown: key} {keyUp: key}. `?debug` exposes window.__tt (the game),
// window.__bot (2D guardian bots) and window.__bot3 (3D boss bots), see src/dev.
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const [distArg, scriptPath, outDir] = process.argv.slice(2);
const dist = path.resolve(distArg);
fs.mkdirSync(outDir, { recursive: true });
const steps = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
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
const ctx = await browser.newContext({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/${process.env.QS || "?debug"}`, { waitUntil: 'load' });
for (const s of steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.click) await page.click(s.click);
  if (s.save) { const d = await page.evaluate(s.save.expr); fs.writeFileSync(path.join(outDir, s.save.file), Buffer.from(d.split(',')[1], 'base64')); console.log('saved', s.save.file); }
  if (s.keyDown) await page.keyboard.down(s.keyDown);
  if (s.keyUp) await page.keyboard.up(s.keyUp);
  if (s.press) await page.keyboard.press(s.press);
  if (s.hold) { await page.keyboard.down(s.hold.key); await page.waitForTimeout(s.hold.ms); await page.keyboard.up(s.hold.key); }
  if (s.until) { try { await page.waitForFunction(s.until, null, { timeout: s.timeout || 15000, polling: 50 }); } catch (e) { console.log('until timeout:', s.until); } }
  if (s.evalFile) { try { const r = await page.evaluate(fs.readFileSync(s.evalFile, 'utf8')); if (r !== undefined) console.log('evalFile>', JSON.stringify(r)); } catch (e) { console.log('evalFile error:', e.message); } }
  if (s.eval) { try { const r = await page.evaluate(s.eval); if (r !== undefined) console.log('eval>', JSON.stringify(r)); } catch (e) { console.log('eval error:', e.message); } }
  if (s.shot) await page.screenshot({ path: path.join(outDir, `${s.shot}.png`) });
}
console.log('ERRORS:', errors.length ? '\n' + errors.slice(0, 20).join('\n') : 'none');
await browser.close();
server.close();
