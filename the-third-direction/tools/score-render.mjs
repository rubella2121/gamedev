// Renders the trailer's score offline and writes what it did.
//   npm run gallery                       (builds dist-gallery, including the score lab)
//   node tools/score-render.mjs <outDir>
// Writes score.wav (listen to it), score.png (spectrogram with the cue times) and score.json (loudness for every half second).
import { chromium } from 'playwright-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist-gallery');
const [outDir] = process.argv.slice(2);
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
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined), headless: true, args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });
await page.goto(`http://localhost:${port}/scorelab.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__score, null, { timeout: 60000 });
const res = await page.evaluate(() => window.__score.render());
fs.writeFileSync(path.join(outDir, 'score.wav'), Buffer.from(res.wav, 'base64'));
fs.writeFileSync(path.join(outDir, 'score.png'), Buffer.from(res.png.split(',')[1], 'base64'));
fs.writeFileSync(path.join(outDir, 'score.json'), JSON.stringify(res.stats, null, 1));
const s = res.stats;
console.log(`rendered ${s.seconds}s in ${s.renderMs} ms: peak ${s.peakDb} dBFS, rms ${s.rmsDb} dBFS, clipped samples ${s.clippedSamples}, NaN ${s.nan}`);
console.log('ERRORS:', errors.length ? '\n' + errors.slice(0, 12).join('\n') : 'none');
await browser.close();
server.close();
