/**
 * The Third Direction: a live project card for a portfolio site.
 *
 * One ES module, no dependencies. The preview is a 13.5-second loop of real gameplay at 60 frames a second (ttd-preview.mp4 /
 * .webm, captured from the game frame by frame): all eight bosses, the five guardians of the 2D pixel forest, the world
 * tearing open onto the third dimension, and the three bosses of the 3D world.
 *
 *   <script type="module" src="/ttd-card.js"></script>
 *   <ttd-card></ttd-card>
 *
 * By default the card looks for ttd-preview.mp4, ttd-preview.webm and ttd-poster.jpg next to this file. Put them somewhere
 * else and say where with the attributes (see IMPLEMENT.md):
 *
 *   <ttd-card mp4="/media/ttd-preview.mp4" webm="/media/ttd-preview.webm" poster="/media/ttd-poster.jpg"></ttd-card>
 *
 * The card is a custom element with its own shadow DOM, so its styles cannot clash with the site's. It inherits the page's
 * font and reads optional --ttd-* tokens to match the site.
 *
 * The video only loads when the card comes near the screen, plays muted and on a loop, pauses off screen and in hidden tabs,
 * and for people who ask for reduced motion it waits on its poster and plays only while hovered.
 *
 * Only the preview is wanted (the site has its own card markup)? Use the exported function on your own <video>:
 *
 *   import { mountTTDVideo } from './ttd-card.js';
 *   const preview = mountTTDVideo(videoElement, { label: labelElement, bar: barElement });
 *   // later: preview.destroy();
 */

export const TTD_LINKS = {
  play: 'https://www.crazygames.com/game/the-third-direction-vjd',
  itch: 'https://gautam-jain.itch.io/the-third-direction',
  source: 'https://github.com/rubella2121/gamedev',
};

const here = (f) => {
  try { return new URL(f, import.meta.url).href; } catch { return f; }
};
export const TTD_MEDIA = {
  webm: here('./ttd-preview.webm'),
  mp4: here('./ttd-preview.mp4'),
  poster: here('./ttd-poster.jpg'),
};

/**
 * What is on screen when, in the preview loop (seconds from its start). The card shows it as a label on the video.
 * `dim` is the world the shot is in; `name` is the place or the boss. Made by tools/trailer/card-loop.py with the video:
 * change them together.
 */
export const TTD_SEGMENTS = [
  { t: 0.0, dim: '2D', name: 'Gloommother' },
  { t: 1.4, dim: '2D', name: 'Thornback King' },
  { t: 2.8, dim: '2D', name: 'Toll Queen' },
  { t: 4.2, dim: '2D', name: 'Bone Wyrm' },
  { t: 5.6, dim: '2D', name: 'Mimic Queen' },
  { t: 7.0, dim: '2D', name: 'X, in the sky' },
  { t: 7.33, dim: '3D', name: 'the world tears open' },
  { t: 8.67, dim: '3D', name: 'X, the Hollow' },
  { t: 10.33, dim: '3D', name: 'the Collector' },
  { t: 11.93, dim: '3D', name: 'the Mash' },
];

/* ------------------------------------------------------------------------------------------------ */
/* the preview                                                                                      */
/* ------------------------------------------------------------------------------------------------ */

/**
 * Run the gameplay loop in a <video>: load it when it comes near the screen, play it muted on a loop while it is on screen,
 * keep a label and a progress bar in step with it.
 * @param {HTMLVideoElement} video  with its <source data-src> children (or data-src) and poster already set
 * @param {{label?: HTMLElement, bar?: HTMLElement, hoverTarget?: HTMLElement, still?: boolean, segments?: {t:number, dim:string, name:string}[]}} [opts]
 *   label: gets the segment (data-dim="2D|3D", a <b> with the dimension and a <span> with the place or boss) when it changes
 *   bar: gets --p (0..1), how far through the loop it is
 *   hoverTarget: in reduced motion, hovering or focusing this plays the video (default: the video)
 *   still: force reduced-motion behaviour (default: follows prefers-reduced-motion)
 * @returns {{destroy(): void, play(): void, pause(): void}}
 */
export function mountTTDVideo(video, opts = {}) {
  const segs = opts.segments || TTD_SEGMENTS;
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const forced = typeof opts.still === 'boolean';
  let still = forced ? opts.still : !!(mq && mq.matches);
  const hoverEl = opts.hoverTarget || video;
  let near = false, shown = !document.hidden, hovered = false, loaded = false, raf = 0, lastSeg = -1;

  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');

  function load() {
    if (loaded) return;
    loaded = true;
    let changed = false;
    for (const s of video.querySelectorAll('source[data-src]')) { s.src = s.dataset.src; s.removeAttribute('data-src'); changed = true; }
    if (video.dataset.src) { video.src = video.dataset.src; video.removeAttribute('data-src'); changed = true; }
    video.preload = 'auto';
    if (changed) video.load();
  }
  function sync() {
    const d = video.duration;
    const t = video.currentTime;
    if (opts.bar && d > 0) opts.bar.style.setProperty('--p', (t / d).toFixed(4));
    if (opts.label && segs.length) {
      let i = 0;
      while (i < segs.length - 1 && t >= segs[i + 1].t) i++;
      if (i !== lastSeg) {
        lastSeg = i;
        const el = opts.label;
        el.dataset.dim = segs[i].dim;
        el.innerHTML = `<b>${segs[i].dim}</b><span>${segs[i].name}</span>`;
        el.classList.remove('swap');
        void el.offsetWidth;
        el.classList.add('swap');
      }
    }
  }
  function tick() {
    raf = requestAnimationFrame(tick);
    sync();
  }
  function update() {
    const want = near && shown && (!still || hovered);
    if (want) {
      load();
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
      if (!raf) raf = requestAnimationFrame(tick);
    } else {
      if (!video.paused) video.pause();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      sync();
    }
  }

  video.addEventListener('seeked', sync);
  video.addEventListener('loadedmetadata', sync);
  const onEnter = () => { hovered = true; if (still) update(); };
  const onLeave = () => { hovered = false; if (still) update(); };
  hoverEl.addEventListener('pointerenter', onEnter);
  hoverEl.addEventListener('pointerleave', onLeave);
  hoverEl.addEventListener('focusin', onEnter);
  hoverEl.addEventListener('focusout', onLeave);
  const onVis = () => { shown = !document.hidden; update(); };
  document.addEventListener('visibilitychange', onVis);
  const onMotion = () => { if (!forced) { still = !!(mq && mq.matches); update(); } };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMotion);
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => { near = es[es.length - 1].isIntersecting; update(); }, { rootMargin: '200px' })
    : null;
  if (io) io.observe(video); else near = true;
  sync();
  update();

  return {
    play() { hovered = true; near = true; update(); },
    pause() { video.pause(); },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      video.pause();
      video.removeEventListener('seeked', sync);
      video.removeEventListener('loadedmetadata', sync);
      hoverEl.removeEventListener('pointerenter', onEnter);
      hoverEl.removeEventListener('pointerleave', onLeave);
      hoverEl.removeEventListener('focusin', onEnter);
      hoverEl.removeEventListener('focusout', onLeave);
      document.removeEventListener('visibilitychange', onVis);
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMotion);
      if (io) io.disconnect();
    },
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* the card                                                                                         */
/* ------------------------------------------------------------------------------------------------ */

const CSS = `
:host { display: block; container: ttd / inline-size; color: var(--ttd-text, #e6edf3); }
* { box-sizing: border-box; }
.card {
  --a: var(--ttd-accent, #a3e635);
  --b: var(--ttd-border, #30363d);
  --t: var(--ttd-text, #e6edf3);
  --m: var(--ttd-muted, #7d8590);
  --mono: var(--ttd-mono, ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace);
  position: relative; isolation: isolate;
  display: grid; grid-template-columns: minmax(0, 1fr);
  border: 1px solid var(--b); border-radius: var(--ttd-radius, 14px);
  background: var(--ttd-surface, #0d1117);
  overflow: hidden;
  transition: border-color .25s ease, transform .25s ease, box-shadow .25s ease;
}
/* a line of light along the top edge and a soft spotlight, both under the pointer */
.card::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px; z-index: 2; pointer-events: none;
  background: radial-gradient(180px 1px at var(--mx, 50%) 0, var(--a), transparent);
  opacity: 0; transition: opacity .3s ease;
}
.card::after {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(460px circle at var(--mx, 50%) var(--my, 0%), color-mix(in srgb, var(--a) 7%, transparent), transparent 62%);
  opacity: 0; transition: opacity .3s ease;
}
.card:hover { border-color: color-mix(in srgb, var(--a) 32%, var(--b)); transform: translateY(-2px); box-shadow: 0 20px 44px -26px rgba(0, 0, 0, .85); }
.card:hover::before, .card:hover::after { opacity: 1; }

.body { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 18px; min-width: 0; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; }
.status {
  display: inline-flex; align-items: center; gap: 8px; padding: 5px 11px 5px 9px; border-radius: 999px;
  font: 600 12px/1 var(--mono); color: var(--a);
  background: color-mix(in srgb, var(--a) 9%, transparent); border: 1px solid color-mix(in srgb, var(--a) 34%, transparent);
}
.status i { width: 7px; height: 7px; border-radius: 50%; background: var(--a); animation: ping 2.4s ease-out infinite; }
@keyframes ping {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--a) 65%, transparent); }
  70%, 100% { box-shadow: 0 0 0 7px transparent; }
}
.year { font: 500 12px/1 var(--mono); color: var(--m); }
h3 {
  margin: 0; font-family: var(--ttd-display, inherit); font-weight: 700; color: var(--t);
  font-size: clamp(1.4rem, 1.05rem + 1.5cqi, 1.9rem); line-height: 1.08; letter-spacing: -0.015em; text-wrap: balance;
}
h3 a { color: inherit; text-decoration: none; }
h3 a:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; text-decoration-color: color-mix(in srgb, var(--a) 70%, transparent); }
.desc { margin: 0; color: var(--t); opacity: .9; font-size: .95rem; line-height: 1.55; max-width: 48ch; }
.stats { display: flex; flex-wrap: wrap; gap: 10px 26px; margin: 0; }
.stats div { display: flex; flex-direction: column-reverse; gap: 5px; }
.stats dt { font: 500 11px/1.2 var(--mono); color: var(--m); }
.stats dd { margin: 0; font: 700 22px/1 var(--mono); color: var(--t); font-variant-numeric: tabular-nums; }
.stack { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.stack li { font: 500 11px/1 var(--mono); color: var(--m); padding: 5px 8px; border: 1px solid var(--b); border-radius: 6px; }
.foot { margin-top: auto; padding-top: 2px; display: flex; align-items: center; justify-content: space-between; gap: 10px 16px; flex-wrap: wrap; }
.plat { font: 500 11.5px/1.5 var(--mono); color: var(--m); min-width: 0; }
.links { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.play {
  display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 8px;
  background: var(--a); color: #0d1117; font: 700 13px/1 var(--mono); text-decoration: none;
  transition: transform .2s ease, box-shadow .2s ease;
}
.play svg { width: 10px; height: 10px; }
.play:hover { transform: translateY(-1px); box-shadow: 0 8px 22px -10px var(--a); }
.ext { font: 500 12.5px/1 var(--mono); color: var(--m); text-decoration: none; }
.ext:hover { color: var(--t); }
a:focus-visible { outline: 2px solid var(--a); outline-offset: 3px; border-radius: 6px; }

.preview {
  position: relative; display: block; order: -1; margin: 10px 10px 0; aspect-ratio: 16 / 9;
  border-radius: 10px; overflow: hidden; background: #05060c; border: 1px solid rgba(255, 255, 255, .06); cursor: pointer;
}
.preview video { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; }
/* a little darkness at the top and bottom so the label and the hint read on any frame */
.preview::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(180deg, rgba(5, 6, 12, .4), transparent 24%, transparent 74%, rgba(5, 6, 12, .5));
}
.seg {
  position: absolute; left: 10px; top: 10px; z-index: 1; pointer-events: none;
  display: inline-flex; align-items: center; gap: 7px; padding: 4px 9px 4px 4px; border-radius: 7px;
  font: 600 11px/1 var(--mono); color: rgba(230, 237, 243, .95);
  background: rgba(5, 6, 12, .6); border: 1px solid rgba(255, 255, 255, .1);
}
.seg:empty { display: none; }
.seg b { padding: 3px 5px; border-radius: 4px; font-weight: 700; color: #0d1117; background: #7fd8f5; }
.seg[data-dim="3D"] b { background: #ff6a6a; }
.seg.swap { animation: swap .35s ease-out; }
@keyframes swap { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.bar { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; z-index: 1; background: rgba(255, 255, 255, .08); pointer-events: none; }
.bar i { position: absolute; inset: 0 auto 0 0; width: calc(var(--p, 0) * 100%); background: var(--a); box-shadow: 0 0 8px var(--a); }
.hint {
  position: absolute; right: 10px; bottom: 10px; z-index: 1; pointer-events: none;
  font: 600 11px/1 var(--mono); color: rgba(230, 237, 243, .9);
  padding: 5px 8px; border-radius: 6px; background: rgba(5, 6, 12, .6); border: 1px solid rgba(255, 255, 255, .1);
  opacity: 0; transform: translateY(3px); transition: opacity .25s ease, transform .25s ease;
}
.preview:hover .hint { opacity: 1; transform: none; }

@container ttd (min-width: 700px) {
  .card { grid-template-columns: minmax(0, 1fr) minmax(0, 1.12fr); }
  .body { padding: 24px 8px 22px 26px; }
  .preview { order: 2; margin: 12px; aspect-ratio: auto; min-height: 260px; }
}
@media (prefers-reduced-motion: reduce) {
  .card, .card::before, .card::after, .play, .hint { transition: none; }
  .card:hover, .play:hover { transform: none; }
  .status i, .seg.swap { animation: none; }
}
`;

const PLAY_ICON = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 0.8v8.4L9 5z" fill="currentColor"/></svg>';
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement;

/** <ttd-card play itch source webm mp4 poster></ttd-card>: every attribute is optional */
export class TTDCard extends Base {
  static get observedAttributes() { return ['play', 'itch', 'source', 'webm', 'mp4', 'poster']; }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
  }

  disconnectedCallback() {
    this.preview?.destroy();
    this.preview = null;
  }

  attributeChangedCallback() {
    if (this.shadowRoot && this.isConnected) this.render();
  }

  render() {
    this.preview?.destroy();
    const a = (k, d) => this.getAttribute(k) || d;
    const L = { play: a('play', TTD_LINKS.play), itch: a('itch', TTD_LINKS.itch), source: a('source', TTD_LINKS.source) };
    const M = { webm: a('webm', TTD_MEDIA.webm), mp4: a('mp4', TTD_MEDIA.mp4), poster: a('poster', TTD_MEDIA.poster) };
    const ext = 'target="_blank" rel="noopener"';
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
<article class="card" part="card">
  <div class="body">
    <div class="top">
      <span class="status"><i aria-hidden="true"></i>live on CrazyGames</span>
      <span class="year">2026 · web game</span>
    </div>
    <h3><a href="${esc(L.play)}" ${ext}>The Third Direction</a></h3>
    <p class="desc">A boss-rush action game: a hand-made pixel forest that breaks open into a full 3D arena. Eight bosses, three difficulty levels and one-thumb controls.</p>
    <dl class="stats">
      <div><dt>bosses</dt><dd>8</dd></div>
      <div><dt>difficulty levels</dt><dd>3</dd></div>
      <div><dt>thumb to play</dt><dd>1</dd></div>
    </dl>
    <ul class="stack" aria-label="Built with"><li>TypeScript</li><li>three.js</li><li>Canvas 2D</li><li>Vite</li></ul>
    <div class="foot">
      <span class="plat">HTML5 · Windows · macOS · Linux · Android</span>
      <span class="links">
        <a class="play" href="${esc(L.play)}" ${ext}>${PLAY_ICON}Play free</a>
        <a class="ext" href="${esc(L.itch)}" ${ext}>itch.io ↗</a>
        <a class="ext" href="${esc(L.source)}" ${ext}>code ↗</a>
      </span>
    </div>
  </div>
  <a class="preview" href="${esc(L.play)}" ${ext} tabindex="-1" aria-hidden="true">
    <video muted loop playsinline preload="none" poster="${esc(M.poster)}" disablepictureinpicture disableremoteplayback>
      <source data-src="${esc(M.mp4)}" type="video/mp4">
      <source data-src="${esc(M.webm)}" type="video/webm">
    </video>
    <span class="seg"></span>
    <span class="bar"><i></i></span>
    <span class="hint">play ↗</span>
  </a>
</article>`;
    const root = this.shadowRoot;
    const card = root.querySelector('.card');
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
    this.preview = mountTTDVideo(root.querySelector('video'), {
      label: root.querySelector('.seg'),
      bar: root.querySelector('.bar'),
      hoverTarget: card,
    });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ttd-card')) customElements.define('ttd-card', TTDCard);
