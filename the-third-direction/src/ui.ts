import { PRESETS, type DiffId } from './core/difficulty';

export interface HomeOptions {
  onPlay: () => void;
  /** jump straight to a boss's fight: 0 = X, 1 = The Collector, 2 = The Mash */
  onShowcase: (boss: number) => void;
  /** play the cinematic intro again */
  onIntro?: () => void;
  onSound: (on: boolean) => void;
  onDifficulty: (id: DiffId) => void;
  difficulty: DiffId;
  best: () => string | null;
}

/** All DOM overlays: captions, hints, hearts, title card, start and end screens. */
/** Who is speaking: the blob's own thoughts, its family's voices, or the world itself (see src/core/story.ts). */
export type Tone = 'thought' | 'warm' | 'world';

interface Narration {
  text: string;
  ms: number;
  tone: Tone;
  /** shown in the middle of the screen instead of near the top (the ending, where the moon is up there) */
  low?: boolean;
  /** a line that has waited longer than this is no longer true, so it is dropped */
  until: number;
}

export class UI {
  readonly stage: HTMLElement;
  readonly view: HTMLCanvasElement;
  private fadeEl: HTMLElement;
  private flashEl: HTMLElement;
  private redEl: HTMLElement;
  private captionEl: HTMLElement;
  private hintEl: HTMLElement;
  private heartsEl: HTMLElement;
  private phaseEl: HTMLElement;
  private skipEl: HTMLButtonElement;
  private titleEl: HTMLElement;
  private startEl: HTMLElement;
  private endEl: HTMLElement;
  private moonEl: HTMLElement;
  private bossEl: HTMLElement;
  private lightEl: HTMLElement;
  private speechEl: HTMLElement;
  private bossTitleEl: HTMLElement;
  private speechTimer = 0;
  private bossHpMax = 0;
  private capTimer = 0;
  private cardEl: HTMLElement;
  private fallsEl: HTMLElement;
  private splashEl: HTMLElement;
  private cineEl: HTMLElement;
  private cardEl2: HTMLElement;
  private endCardEl: HTMLElement;
  private grain: HTMLCanvasElement;
  private grainOn = false;
  private cineTimer = 0;
  /** the trailer is playing: no HUD, no hints, no story lines of the game itself */
  private mute = false;
  private lastBossTitle = { name: '', at: 0 };
  private cardTimer = 0;
  private nq: Narration[] = [];
  private nowN: Narration | null = null;
  private busyUntil = 0;
  private pumpTimer = 0;
  private heartMax = 3;
  private recenterEl: HTMLButtonElement;
  private onRecenter: (() => void) | null = null;
  private onSkip: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    this.view = document.createElement('canvas');
    this.view.className = 'view';
    this.stage.appendChild(this.view);
    parent.appendChild(this.stage);

    const mk = (cls: string, tag = 'div') => {
      const e = document.createElement(tag);
      e.className = cls;
      this.stage.appendChild(e);
      return e;
    };
    this.moonEl = mk('moon');
    this.redEl = mk('layer redflash');
    this.fadeEl = mk('layer fade');
    this.flashEl = mk('layer flash');
    this.captionEl = mk('caption');
    this.hintEl = mk('hint');
    this.phaseEl = mk('phase');
    this.heartsEl = mk('hearts');
    this.buildHearts(3);
    this.bossEl = mk('bossbar');
    this.lightEl = mk('lightmeter');
    this.speechEl = mk('speech');
    this.cardEl = mk('zonecard');
    this.fallsEl = mk('falls');
    this.cineEl = mk('cine');
    this.cineEl.innerHTML = '<div class="cvig"></div><div class="bar top"></div><div class="bar bot"></div>';
    this.grain = document.createElement('canvas');
    this.grain.className = 'cgrain';
    this.grain.width = 72;
    this.grain.height = 128;
    this.cineEl.appendChild(this.grain);
    this.cardEl2 = mk('tcard');
    this.endCardEl = mk('tend');
    this.endCardEl.innerHTML = '<div class="tt"><span>The Third</span><span>Direction</span></div><div class="tg">don\'t look up</div><div class="tf">RUN October Jam · Monster Mash</div>';
    this.splashEl = mk('splash hide');
    this.bossTitleEl = mk('bosstitle');
    this.titleEl = mk('title');
    this.titleEl.innerHTML = 'The Third<br>Direction';
    this.skipEl = mk('skip', 'button') as HTMLButtonElement;
    this.skipEl.textContent = 'Skip ▸';
    this.skipEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSkip?.();
    });
    this.recenterEl = mk('recenter', 'button') as HTMLButtonElement;
    this.recenterEl.textContent = '◎';
    this.recenterEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRecenter?.();
    });
    this.startEl = mk('start hide');
    this.endEl = mk('endcard hide');

    const fit = () => this.stage.style.setProperty('--u', `${this.stage.clientWidth / 100}px`);
    fit();
    new ResizeObserver(fit).observe(this.stage);
  }

  fade(opacity: number, ms = 400) {
    this.fadeEl.style.transition = `opacity ${ms}ms linear`;
    this.fadeEl.style.opacity = String(opacity);
  }

  flash(strength = 1, ms = 450) {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(strength);
    void this.flashEl.offsetWidth;
    this.flashEl.style.transition = `opacity ${ms}ms ease-out`;
    this.flashEl.style.opacity = '0';
  }

  red(strength = 0.5, ms = 300) {
    this.redEl.style.transition = 'none';
    this.redEl.style.opacity = String(strength);
    void this.redEl.offsetWidth;
    this.redEl.style.transition = `opacity ${ms}ms ease-out`;
    this.redEl.style.opacity = '0';
  }

  /** Show a line now. Monsters and prompts use this: it never waits, and it cuts a narration short (a cut line is gone, not replayed late). */
  caption(text: string | null, holdMs = 2600, low = false, tone: Tone = 'world') {
    this.nowN = null;
    this.show(text, holdMs, low, tone);
    this.busyUntil = text !== null && holdMs > 0 ? performance.now() + holdMs + 300 : 0;
    this.schedulePump(this.busyUntil - performance.now());
  }

  /**
   * A line of the story. Lines wait their turn (a new one never stomps the one being read), and one that waited too long is
   * dropped. `thought` is the blob, `warm` is Mother or Father, `world` is the forest talking.
   */
  narrate(text: string, ms = 2800, tone: Tone = 'thought', low = false) {
    if (this.mute) return;
    this.nq.push({ text, ms, tone, low, until: performance.now() + 7000 });
    this.pump();
  }

  /** Forget everything waiting and hide what is showing (a restart, a skip, the end of a scene). */
  narrateClear() {
    this.nq = [];
    this.nowN = null;
    window.clearTimeout(this.pumpTimer);
    this.pumpTimer = 0;
    this.busyUntil = 0;
    this.show(null, 0, false, 'world');
  }

  private schedulePump(inMs: number) {
    window.clearTimeout(this.pumpTimer);
    this.pumpTimer = this.nq.length ? window.setTimeout(() => this.pump(), Math.max(30, inMs)) : 0;
  }

  private pump() {
    window.clearTimeout(this.pumpTimer);
    this.pumpTimer = 0;
    const now = performance.now();
    if (now < this.busyUntil) return this.schedulePump(this.busyUntil - now + 30);
    this.nowN = null;
    while (this.nq.length && this.nq[0]!.until < now) this.nq.shift();
    const n = this.nq.shift();
    if (!n) return;
    this.nowN = n;
    this.show(n.text, n.ms, !!n.low, n.tone);
    this.busyUntil = now + n.ms + 300;
    this.pumpTimer = window.setTimeout(() => {
      if (this.nowN === n) this.nowN = null;
      this.pump();
    }, n.ms + 300);
  }

  private show(text: string | null, holdMs: number, low: boolean, tone: Tone) {
    window.clearTimeout(this.capTimer);
    this.captionEl.classList.toggle('low', low);
    for (const t of ['thought', 'warm', 'world']) this.captionEl.classList.toggle(`tone-${t}`, t === tone);
    if (text === null) {
      this.captionEl.classList.remove('show');
      return;
    }
    this.captionEl.textContent = text;
    this.captionEl.classList.add('show');
    if (holdMs > 0) this.capTimer = window.setTimeout(() => this.captionEl.classList.remove('show'), holdMs);
  }

  /** Nightmare: how many falls you have had in this fight, out of how many it takes to start over. null hides it. */
  falls(n: number | null, max = 4) {
    if (n === null) {
      this.fallsEl.classList.remove('show');
      return;
    }
    if (this.fallsEl.childElementCount !== max) {
      this.fallsEl.innerHTML = '<b>falls</b>' + '<i></i>'.repeat(max);
    }
    const pips = this.fallsEl.querySelectorAll('i');
    pips.forEach((p, i) => p.classList.toggle('on', i < n));
    this.fallsEl.classList.toggle('last', n >= max - 1);
    this.fallsEl.classList.add('show');
  }

  /* ------------------------------ the cinematic intro ------------------------------ */

  /** The trailer takes over the screen: letterbox bars, vignette and film grain on; the HUD, hints and the game's own story lines off. */
  cinematic(on: boolean) {
    this.mute = on;
    this.stage.classList.toggle('cinematic', on);
    this.cineEl.classList.toggle('on', on);
    if (on) {
      this.hint(null);
      this.narrateClear();
      this.hearts(null);
      this.light(null);
      this.falls(null);
      this.bossBar(null);
      this.startGrain();
    } else {
      this.grainOn = false;
      window.clearInterval(this.cineTimer);
      this.endCard(false);
      this.card(null);
    }
  }

  /** film grain: a tiny noise canvas redrawn a few times a second, scaled up and blended over the picture */
  private startGrain() {
    if (this.grainOn) return;
    this.grainOn = true;
    const g = this.grain.getContext('2d');
    if (!g) return;
    const img = g.createImageData(this.grain.width, this.grain.height);
    window.clearInterval(this.cineTimer);
    this.cineTimer = window.setInterval(() => {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, 70);
  }

  /** a small card of text in the middle of the screen: a line above and a larger line below (null clears it) */
  card(lines: { small: string; big: string } | null, holdMs = 2200) {
    if (!lines) {
      this.cardEl2.classList.remove('show');
      return;
    }
    this.cardEl2.innerHTML = '';
    const a = document.createElement('i');
    a.textContent = lines.small;
    const b = document.createElement('b');
    b.textContent = lines.big;
    this.cardEl2.append(a, b);
    this.cardEl2.style.setProperty('--hold', `${holdMs}ms`);
    this.cardEl2.classList.remove('show');
    void this.cardEl2.offsetWidth;
    this.cardEl2.classList.add('show');
  }

  /** the closing title card; `step` reveals it: 1 the title, 2 the tagline, 3 the small line, 0 nothing */
  endCard(on: boolean, step = 3) {
    this.endCardEl.classList.toggle('show', on);
    this.endCardEl.dataset['step'] = String(on ? step : 0);
  }

  /** a white-hot burst of light behind the title (CSS only) */
  flare() {
    this.cineEl.classList.remove('flare');
    void this.cineEl.offsetWidth;
    this.cineEl.classList.add('flare');
  }

  /** the "tap to begin" screen before the trailer (browsers need a tap before they play sound) */
  showSplash(onTap: () => void) {
    const el = this.splashEl;
    el.innerHTML = '<div class="sp"><div class="sg"></div><div class="st">The Third<br>Direction</div><div class="sb">tap to begin</div><div class="ss">best with sound on</div></div>';
    el.classList.remove('hide');
    const go = (e: Event) => {
      e.stopPropagation();
      el.removeEventListener('pointerdown', go);
      el.classList.add('out');
      window.setTimeout(() => {
        el.classList.add('hide');
        el.classList.remove('out');
      }, 450);
      onTap();
    };
    el.addEventListener('pointerdown', go);
  }

  /** A place name with one line under it, when you first step into somewhere new. */
  zoneCard(name: string, sub: string, holdMs = 3600) {
    window.clearTimeout(this.cardTimer);
    this.cardEl.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = name;
    const i = document.createElement('i');
    i.textContent = sub;
    this.cardEl.append(b, i);
    this.cardEl.style.setProperty('--hold', `${holdMs}ms`);
    this.cardEl.classList.remove('show');
    void this.cardEl.offsetWidth;
    this.cardEl.classList.add('show');
    this.cardTimer = window.setTimeout(() => this.cardEl.classList.remove('show'), holdMs + 200);
  }

  hint(text: string | null) {
    if (this.mute && text !== null) return;
    if (text === null) {
      this.hintEl.classList.remove('show');
    } else {
      this.hintEl.textContent = text;
      this.hintEl.classList.add('show');
    }
  }

  private buildHearts(max: number) {
    this.heartsEl.innerHTML = '';
    this.heartMax = max;
    for (let i = 0; i < max; i++) {
      this.heartsEl.insertAdjacentHTML(
        'beforeend',
        '<svg class="heart" viewBox="0 0 7 6"><path d="M1 0h2v1H1z M4 0h2v1H4z M0 1h7v2H0z M1 3h5v1H1z M2 4h3v1H2z M3 5h1v1H3z"/></svg>',
      );
    }
  }

  /** Show n hearts out of `max` (the difficulty decides the maximum). */
  hearts(n: number | null, max?: number) {
    if (n === null) {
      this.heartsEl.classList.remove('show');
      return;
    }
    if (max !== undefined && max !== this.heartMax) this.buildHearts(max);
    this.heartsEl.classList.add('show');
    Array.from(this.heartsEl.children).forEach((h, i) => h.classList.toggle('lost', i >= n));
  }

  /** The boss's name and health pips at the top of the screen (null hides it). */
  bossBar(name: string | null, hp = 0, max = 0, colour = '#ff6a6a') {
    if (name === null) {
      this.bossEl.classList.remove('show');
      this.bossHpMax = 0;
      return;
    }
    if (max !== this.bossHpMax || this.bossEl.dataset['name'] !== name) {
      this.bossHpMax = max;
      this.bossEl.dataset['name'] = name;
      this.bossEl.style.setProperty('--bc', colour);
      this.bossEl.innerHTML = `<div class="bn">${name}</div><div class="bp">${'<i></i>'.repeat(max)}</div>`;
    }
    Array.from(this.bossEl.querySelectorAll('.bp i')).forEach((e, i) => e.classList.toggle('off', i >= hp));
    this.bossEl.classList.add('show');
  }

  /** Light meter: three orbs that fill as you hurt things. Full means a Nova is ready. */
  light(v: number | null) {
    if (v === null) {
      this.lightEl.classList.remove('show');
      return;
    }
    if (!this.lightEl.firstChild) this.lightEl.innerHTML = '<i></i><i></i><i></i>';
    this.lightEl.classList.add('show');
    Array.from(this.lightEl.children).forEach((e, i) => {
      const f = Math.max(0, Math.min(1, v - i));
      (e as HTMLElement).style.setProperty('--f', String(f));
      e.classList.toggle('full', f >= 1);
    });
    this.lightEl.classList.toggle('ready', v >= 3);
  }

  /** A line a monster says: shown big, in the monster's colour. */
  speech(text: string | null, holdMs = 2600, tone = '#ff6a6a') {
    window.clearTimeout(this.speechTimer);
    if (text === null) {
      this.speechEl.classList.remove('show');
      return;
    }
    this.speechEl.textContent = text;
    this.speechEl.style.setProperty('--sc', tone);
    this.speechEl.classList.remove('show');
    void this.speechEl.offsetWidth;
    this.speechEl.classList.add('show');
    if (holdMs > 0) this.speechTimer = window.setTimeout(() => this.speechEl.classList.remove('show'), holdMs);
  }

  /** The name card that slams in when a boss wakes up. */
  bossTitle(name: string, sub: string, colour = '#ff6a6a') {
    const now = performance.now();
    if (this.lastBossTitle.name === name && now - this.lastBossTitle.at < 1600) return;
    this.lastBossTitle = { name, at: now };
    this.bossTitleEl.innerHTML = `<div class="bt">${name}</div><div class="bs">${sub}</div>`;
    this.bossTitleEl.style.setProperty('--tc', colour);
    this.bossTitleEl.classList.remove('show');
    void this.bossTitleEl.offsetWidth;
    this.bossTitleEl.classList.add('show');
  }

  hideBossTitle() {
    this.bossTitleEl.classList.remove('show');
  }

  phase(text: string | null) {
    if (text === null) this.phaseEl.classList.remove('show');
    else {
      this.phaseEl.textContent = text;
      this.phaseEl.classList.add('show');
    }
  }

  /** The small camera-recentre button shown during the 3D fight. */
  recenter(show: boolean, cb?: () => void) {
    this.onRecenter = cb ?? null;
    this.recenterEl.classList.toggle('show', show);
  }

  skip(show: boolean, cb?: () => void) {
    this.onSkip = cb ?? null;
    this.skipEl.classList.toggle('show', show);
  }

  title() {
    this.titleEl.classList.remove('show');
    void this.titleEl.offsetWidth;
    this.titleEl.classList.add('show');
  }

  moon(show: boolean) {
    this.moonEl.classList.toggle('show', show);
    if (!show) this.moonEl.classList.remove('blink');
  }

  moonBlink() {
    this.moonEl.classList.add('blink');
  }

  /** The home page: title, Play, difficulty, how to play, showcase and a sound switch. */
  showStart(o: HomeOptions) {
    const el = this.startEl;
    el.innerHTML = '';
    const mk = (cls: string, text = '', tag = 'div') => {
      const e = document.createElement(tag);
      e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    const home = mk('home');
    const eyebrow = mk('eyebrow', 'RUN October Jam · Monster Mash');
    const logo = mk('logo');
    logo.innerHTML = 'The Third<br><span>Direction</span>';
    const tag = mk('tag', "don't look up");
    const spacer = mk('spacer');

    const play = mk('btn play', 'Play', 'button');
    play.addEventListener('click', () => {
      el.classList.add('hide');
      o.onPlay();
    });

    const diff = mk('diff');
    const seg = mk('seg');
    const blurb = mk('blurb');
    const ids: DiffId[] = ['gentle', 'normal', 'nightmare'];
    const refresh = (id: DiffId) => {
      Array.from(seg.children).forEach((c, i) => c.classList.toggle('on', ids[i] === id));
      blurb.textContent = PRESETS[id].blurb;
    };
    ids.forEach((id) => {
      const b = mk('segbtn', PRESETS[id].label, 'button');
      b.addEventListener('click', () => {
        o.onDifficulty(id);
        refresh(id);
      });
      seg.append(b);
    });
    refresh(o.difficulty);
    diff.append(seg, blurb);

    const row = mk('row');
    const how = mk('btn ghost', 'How to play', 'button');
    how.addEventListener('click', () => this.showHowTo());
    const show = mk('btn ghost', 'Quick showcase', 'button');
    show.addEventListener('click', () => this.showShowcase(o));
    row.append(how, show);

    const foot = mk('foot');
    const best = mk('small', o.best() ? `best ${o.best()}` : 'best with sound on');
    const sound = mk('chip', 'sound on', 'button');
    let on = true;
    sound.addEventListener('click', () => {
      on = !on;
      sound.textContent = on ? 'sound on' : 'sound off';
      o.onSound(on);
    });
    if (o.onIntro) {
      const intro = mk('chip', '▶ intro', 'button');
      intro.addEventListener('click', () => {
        el.classList.add('hide');
        o.onIntro!();
      });
      foot.append(best, intro, sound);
    } else foot.append(best, sound);

    home.append(eyebrow, logo, tag, spacer, play, diff, row, foot);
    el.append(home);
    el.classList.remove('hide');
  }

  /** Pick a boss to fight right now, skipping the story (these runs are never ranked). */
  private showShowcase(o: HomeOptions) {
    const card = document.createElement('div');
    card.className = 'howto';
    const h = document.createElement('div');
    h.className = 'hh';
    h.textContent = 'Quick showcase';
    const t = document.createElement('div');
    t.className = 'htip';
    t.innerHTML = 'Skip the forest and fight a boss now.<br>The next one follows if you win.';
    card.append(h, t);
    const names = ['X, the Hollow', 'The Collector', 'The Mash'];
    names.forEach((n, i) => {
      const b = document.createElement('button');
      b.className = 'btn play';
      b.textContent = n;
      b.addEventListener('click', () => {
        this.startEl.classList.add('hide');
        card.remove();
        o.onShowcase(i);
      });
      card.append(b);
    });
    const close = document.createElement('button');
    close.className = 'btn ghost';
    close.textContent = 'Back';
    close.addEventListener('click', () => card.remove());
    card.append(close);
    this.startEl.append(card);
  }

  /** Controls and tips, shown over the home page. */
  private showHowTo() {
    const card = document.createElement('div');
    card.className = 'howto';
    card.innerHTML = `
      <div class="hh">How to play</div>
      <div class="hrow"><b>Move</b><span>drag on the left side of the screen<br>or WASD / arrow keys</span></div>
      <div class="hrow"><b>Act</b><span>the glowing button, or Space.<br>Tap: pulse of light, or a strike in 3D.</span></div>
      <div class="hrow"><b>Lance</b><span>hold it, then let go:<br>a bolt of light that flies far.</span></div>
      <div class="hrow"><b>Nova</b><span>three orbs full? hold longer:<br>a burst of light all around you.</span></div>
      <div class="hrow"><b>Dash</b><span>double-tap: a quick dodge<br>you cannot be hurt in.</span></div>
      <div class="hrow"><b>Camera</b><span>in 3D, drag on the right side<br>or Q / E. R recentres.</span></div>
      <div class="htip">Stay in the light. Freeze in the reeds.<br>Every monster has a weak point: wait for it to show.</div>`;
    const close = document.createElement('button');
    close.className = 'btn ghost';
    close.textContent = 'Close';
    close.addEventListener('click', () => card.remove());
    card.append(close);
    this.startEl.append(card);
  }

  showEnd(line: string, time: string, deaths: number, mode: string, newBest: boolean, onAgain: () => void, onShare: () => Promise<boolean>, onMenu: () => void): HTMLElement {
    this.endEl.innerHTML = '';
    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = line;
    const t = document.createElement('div');
    t.className = 'stat';
    t.innerHTML = `time <b>${time}</b>${newBest ? ' <i>new best</i>' : ''}`;
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `deaths <b>${deaths}</b>`;
    const m = document.createElement('div');
    m.className = 'small';
    m.textContent = mode;
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = 'Play again';
    b.addEventListener('click', () => {
      this.endEl.classList.add('hide');
      onAgain();
    });
    const share = document.createElement('button');
    share.className = 'btn ghost';
    share.textContent = 'Share';
    share.addEventListener('click', () => {
      void onShare().then((ok) => {
        share.textContent = ok ? 'Shared' : 'Share';
      });
    });
    const menu = document.createElement('button');
    menu.className = 'btn ghost';
    menu.textContent = 'Menu';
    menu.addEventListener('click', onMenu);
    const rank = document.createElement('div');
    rank.className = 'stat rank';
    this.endEl.append(big, t, d, m, rank, b, share, menu);
    this.endEl.classList.remove('hide');
    return rank;
  }

  hideEnd() {
    this.endEl.classList.add('hide');
  }

  noWebGL() {
    const e = document.createElement('div');
    e.className = 'nogl';
    e.textContent = 'This game needs WebGL. Please try another browser or device.';
    this.stage.appendChild(e);
  }
}
