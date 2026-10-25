// Renders the long trailer's score (score.ts: the game's intro score, re-timed and grown) to a WAV.
//   node tools/trailer/score-render.mjs <cues.json> <out.wav>
// cues.json comes from `python3 tools/trailer/timeline.py --cues`.
import { chromium } from 'playwright-core';
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [cuesPath, outPath] = process.argv.slice(2);
const cues = JSON.parse(fs.readFileSync(cuesPath, 'utf8'));
const bundle = await build({ entryPoints: [path.join(here, 'score.ts')], bundle: true, write: false, format: 'iife', target: 'es2020', logLevel: 'error' });
const guess = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? (fs.existsSync(guess) ? guess : undefined), headless: true, args: ['--no-sandbox'] });
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('about:blank');
await page.addScriptTag({ content: bundle.outputFiles[0].text });
const t = Date.now();
const b64 = await page.evaluate((c) => window.__renderLong(c), cues);
fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
console.log(`score ${outPath}: ${cues.length} s in ${Date.now() - t} ms${errors.length ? '\nERRORS:\n' + errors.join('\n') : ''}`);
await browser.close();
