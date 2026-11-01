/**
 * Renders the brand art from tools/brand/brand.html into brand/: logo.png (transparent), cover.png (itch.io, 630 x 500
 * at twice the size), icon.png (1080 square) and banner.png (itch.io page banner). Run: node tools/brand/render.mjs
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../brand');
mkdirSync(out, { recursive: true });

const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync(guess) ? guess : undefined),
  // the page draws its own image files onto a canvas and exports it: allow that from file://
  args: ['--allow-file-access-from-files', '--disable-web-security', '--no-sandbox'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error(e));
await page.goto('file://' + path.join(here, 'brand.html'));
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['logo', 'cover', 'icon', 'banner']) {
  const url = await page.evaluate((n) => window.render(n), name);
  writeFileSync(path.join(out, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', `brand/${name}.png`);
}
await browser.close();
