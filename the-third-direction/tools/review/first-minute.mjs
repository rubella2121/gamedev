// The first minute, as a new player sees it on CrazyGames: the CrazyGames build (npm run build:crazygames), their SDK replaced
// by a stand-in, a first visit (nothing saved), played in real time with real key presses by a player who reads what the game
// says and does it (a short pause to read each new instruction, then the lights, the lamps, the shades...; after the tutorial,
// the arrow). It records the page as a video (Chrome's screencast, put together by ffmpeg), a screenshot a second, and when each
// thing happened.
//   node tools/review/first-minute.mjs dist-crazygames <outDir> [desktop|phone] [seconds]
// (?debug&instant&tutorial gives the build's own new-player start with the game reachable from here as window.__tt)
import { chromium } from 'playwright-core';
import { execFileSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const [distArg, outArg, mode = 'desktop', secArg = '75'] = process.argv.slice(2);
const dist = path.resolve(distArg);
const out = path.resolve(outArg);
const SECONDS = Number(secArg);
fs.mkdirSync(path.join(out, 'shots'), { recursive: true });

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f)) {
    res.writeHead(404);
    res.end('nf');
    return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

// their SDK v3, as far as the game uses it: it starts, keeps saves in memory, and its ads finish at once
const STUB = `window.CrazyGames = { SDK: {
  init: () => Promise.resolve(),
  game: { loadingStart() {}, loadingStop() {}, gameplayStart() { (window.__cg = window.__cg || []).push(['gameplayStart', performance.now()]) }, gameplayStop() { (window.__cg = window.__cg || []).push(['gameplayStop', performance.now()]) }, happytime() {}, settings: { muteAudio: false }, addSettingsChangeListener() {} },
  data: (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; })(),
  ad: { requestAd: (type, cb) => { (window.__cg = window.__cg || []).push(['ad:' + type, performance.now()]); cb?.adStarted?.(); setTimeout(() => cb?.adFinished?.(), 50); }, hasAdblock: () => Promise.resolve(false) },
  user: { getUser: () => Promise.resolve(null), isUserAccountAvailable: false },
  environment: 'local',
} };`;

const VIEW = mode === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 720 };
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const ctx = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 1,
  ...(mode === 'phone' ? { isMobile: true, hasTouch: true } : {}),
});
await ctx.route('https://sdk.crazygames.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
const page = await ctx.newPage();
// the screen as it changes, frame by frame, each with the moment it was shown
const FR = path.join(out, 'frames');
fs.rmSync(FR, { recursive: true, force: true });
fs.mkdirSync(FR, { recursive: true });
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', (f) => {
  const n = frames.length;
  fs.writeFileSync(path.join(FR, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
  frames.push(f.metadata.timestamp);
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: VIEW.width, maxHeight: VIEW.height, everyNthFrame: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});

const log = [];
const T0 = Date.now();
const now = () => (Date.now() - T0) / 1000;
const note = (what) => {
  log.push([+now().toFixed(2), what]);
  console.log(now().toFixed(2).padStart(6), what);
};
await page.goto(`http://localhost:${port}/?debug&instant&tutorial`, { waitUntil: 'load' });
note('page loaded');
await page.waitForFunction(() => window.__tt && window.__tt.act1 && window.__tt.act1.mode === 'play', null, { timeout: 120000 });
note('in the game, can move');

/* ------------------------------------------------------------------------------------------------ the player */

const held = new Set();
const press = async (keys) => {
  for (const k of held) if (!keys.has(k)) await page.keyboard.up(k);
  for (const k of keys) if (!held.has(k)) await page.keyboard.down(k);
  held.clear();
  for (const k of keys) held.add(k);
};
const toward = (dx, dy) => {
  const k = new Set();
  const d = Math.hypot(dx, dy) || 1;
  if (dx / d > 0.38) k.add('ArrowRight');
  if (dx / d < -0.38) k.add('ArrowLeft');
  if (dy / d > 0.38) k.add('ArrowDown');
  if (dy / d < -0.38) k.add('ArrowUp');
  return k;
};
const tap = async (ms = 70) => {
  await page.keyboard.down('Space');
  await page.waitForTimeout(ms);
  await page.keyboard.up('Space');
};
const holdSpace = async (ms) => {
  await page.keyboard.down('Space');
  await page.waitForTimeout(ms);
  await page.keyboard.up('Space');
};

const state = () =>
  page.evaluate(() => {
    const a = window.__tt.act1;
    const t = a.tut;
    const pl = a.player;
    const ui = document.querySelector('.tut, .tutorial, [class*="tut"]');
    return {
      mode: a.mode,
      gstate: window.__tt.state,
      pl: { x: pl.x, y: pl.y, hearts: pl.hearts, light: pl.light, dashCd: pl.dashCd },
      tut: t ? { i: t.i, id: t.step.id, count: t.count, need: t.step.need, done: t.doneT, motes: t.motes, lamps: t.lamps, shades: t.shades } : null,
      tutText: ui ? ui.textContent.trim().slice(0, 200) : null,
      arena: !!a.arena,
      zone: (a.zones.find((z) => z.guardian && z.guardian.state !== 'gone' && z.guardian.state !== 'idle') || {}).id || null,
      // (where the arrow points: the nearest guardian zone not yet beaten, at its entry; src/forest/land.ts ZONES)
      goal: (() => {
        const E = { gloom: [462, 1250], thicket: [408, 962], marsh: [872, 962], bones: [848, 1250], meadow: [850, 1672] };
        let best = null;
        for (const z of a.zones) {
          if (z.cleared || !E[z.id]) continue;
          const [x, y] = E[z.id];
          const d = Math.hypot(pl.x - x, pl.y - y);
          if (!best || d < best.d) best = { x, y, d, id: z.id };
        }
        return best;
      })(),
      cg: window.__cg || [],
    };
  });

let lastStep = '';
let stepSeen = 0;
let busyUntil = 0;
let lastShot = -1;
let lastPos = null;
let stuckT = 0;
let sidestep = 0;
let sideUntil = 0;
let tutorialOver = false;
let fightSeen = false;
while (now() < SECONDS) {
  const s = await state();
  const t = now();
  // a screenshot a second
  const sec = Math.floor(t);
  if (sec !== lastShot) {
    lastShot = sec;
    await page.screenshot({ path: path.join(out, 'shots', `s${String(sec).padStart(3, '0')}.png`) });
  }
  const key = s.tut ? `${s.tut.id}${s.tut.done >= 0 ? ':done' : ''}` : s.mode;
  if (key !== lastStep) {
    note(`state ${key}${s.tut ? ` (${s.tut.count}/${s.tut.need})` : ''}`);
    lastStep = key;
    stepSeen = t;
  }
  if (s.tut === null && lastStep !== 'play' && !tutorialOver && log.some((l) => String(l[1]).startsWith('state move'))) {
    tutorialOver = true;
    note('tutorial over');
  }
  if (s.arena && !fightSeen) {
    fightSeen = true;
    note(`first fight: ${s.zone ?? 'guardian'}`);
  }
  if (t < busyUntil) {
    await page.waitForTimeout(40);
    continue;
  }
  // stuck against something: step to one side for a moment
  if (lastPos && Math.hypot(s.pl.x - lastPos.x, s.pl.y - lastPos.y) < 0.4 && held.size > 0) stuckT += 0.06;
  else stuckT = 0;
  lastPos = { ...s.pl };
  let keys = new Set();
  const tu = s.tut;
  const reading = t - stepSeen < 1.4; // a new instruction: read it first
  if (!tu) {
    if (!tutorialOver) {
      // the captions before the tutorial: a new player looks, and moves a little
      if (t % 4 > 2.6) keys = toward(Math.sin(t), 0.4);
    } else if (s.goal) {
      // after the tutorial: follow the arrow
      keys = toward(s.goal.x - s.pl.x, s.goal.y - s.pl.y);
    }
  } else if (tu.done >= 0 || reading) {
    keys = new Set();
  } else if (tu.id === 'move') {
    const m = tu.motes.filter((q) => !q.got).sort((a, b) => Math.hypot(a.x - s.pl.x, a.y - s.pl.y) - Math.hypot(b.x - s.pl.x, b.y - s.pl.y))[0];
    if (m) keys = toward(m.x - s.pl.x, m.y + 4 - s.pl.y);
  } else if (tu.id === 'pulse') {
    const l = tu.lamps.filter((q) => q.lit === 0).sort((a, b) => Math.hypot(a.x - s.pl.x, a.y - s.pl.y) - Math.hypot(b.x - s.pl.x, b.y - s.pl.y))[0];
    if (l) {
      const d = Math.hypot(l.x - s.pl.x, l.y - 6 - s.pl.y);
      if (d > 22) keys = toward(l.x - s.pl.x, l.y - 6 - s.pl.y);
      else {
        await press(new Set());
        await tap();
        busyUntil = now() + 0.6;
        continue;
      }
    }
  } else if (tu.id === 'lance') {
    const sh = tu.shades.filter((q) => q.hit === 0)[0];
    if (sh) {
      const d = Math.hypot(sh.x - s.pl.x, sh.y - 5 - s.pl.y);
      if (d > 48) keys = toward(sh.x - s.pl.x, sh.y - 5 - s.pl.y);
      else {
        // face it (a step toward it), then hold and let go
        await press(toward(sh.x - s.pl.x, sh.y - 5 - s.pl.y));
        await page.waitForTimeout(90);
        await press(new Set());
        await holdSpace(650);
        busyUntil = now() + 0.9;
        continue;
      }
    }
  } else if (tu.id === 'dash') {
    if (s.pl.dashCd <= 0) {
      await press(toward(1, -0.2));
      await tap(60);
      await page.waitForTimeout(90);
      await tap(60);
      await page.waitForTimeout(250);
      await press(new Set());
      busyUntil = now() + 1.0;
      continue;
    }
  } else if (tu.id === 'nova') {
    await press(new Set());
    await holdSpace(1600);
    busyUntil = now() + 1.0;
    continue;
  } else if (tu.id === 'hearts' || tu.id === 'way') {
    // a card to read, then Next
    if (t - stepSeen > 3.0) {
      await tap();
      busyUntil = now() + 0.5;
      continue;
    }
  }
  if (stuckT > 0.5 && keys.size) {
    sidestep = sidestep ? -sidestep : 1;
    sideUntil = t + 0.7;
    stuckT = 0;
  }
  if (t < sideUntil) keys = toward(sidestep, -0.6);
  await press(keys);
  await page.waitForTimeout(60);
}
await press(new Set());
const fin = await state();
note(`end: ${fin.mode}${fin.tut ? ' tutorial ' + fin.tut.id : ''}, hearts ${fin.pl.hearts}`);
fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify({ mode, view: VIEW, log, sdk: fin.cg, errors }, null, 1));
await cdp.send('Page.stopScreencast').catch(() => {});
await ctx.close();
await browser.close();
// the frames, each held until the next, as a 30 fps video
const list = frames.map((t, i) => `file 'frames/f${String(i).padStart(5, '0')}.jpg'\nduration ${Math.max(0.001, (frames[i + 1] ?? t + 0.1) - t).toFixed(4)}`).join('\n');
fs.writeFileSync(path.join(out, 'frames.txt'), list + `\nfile 'frames/f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(out, 'frames.txt'), '-vf', 'fps=30,pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(out, `first-minute-${mode}.mp4`)]);
console.log('frames', frames.length, 'over', (frames.at(-1) - frames[0]).toFixed(1), 's');
server.close();
console.log('errors', errors.length, errors.slice(0, 5));
