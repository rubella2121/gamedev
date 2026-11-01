// Frames the chosen screenshots with a hook line (tools/brand/brand.html, `framed`).
//   node tools/screens/frame.mjs     reads tools/screens/picks.json, writes brand/screens/framed/<name>.jpg
// picks.json: [{ "name": "...", "words": "a line with a [gold] word", "tag": "SMALL LINE UNDER IT" }], pictures from brand/screens/<name>.jpg
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const picks = JSON.parse(fs.readFileSync(path.join(here, 'picks.json'), 'utf8'));
const out = path.join(root, 'brand/screens/framed');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error(e));
await page.goto('file://' + path.join(root, 'tools/brand/brand.html'));
for (const p of picks) {
  const src = 'file://' + path.join(root, 'brand/screens', `${p.name}.jpg`);
  const url = await page.evaluate(([s, w, t]) => window.render('framed', s, w, t), [src, p.words, p.tag ?? '']);
  fs.writeFileSync(path.join(out, `${p.name}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', `brand/screens/framed/${p.name}.jpg`);
}
await browser.close();
