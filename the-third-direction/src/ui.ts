import { Ambient } from './ambient';
import { drawBlob } from './core/art';
import { bestTime, PRESETS, type DiffId } from './core/difficulty';
import { makeSprite, type Pix } from './core/pix';
import { STORY } from './core/story';
import { fmtTime } from './core/util';
import { Logo } from './logo';

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
  /** is the sound on right now (the switch starts there) */
  sound?: boolean;
}

/** a tiny pixel icon from rows of '#', as an inline SVG: crisp, and it takes the text colour */
function icon(rows: string[]): string {
  let d = '';
  rows.forEach((r, y) => {
    for (const m of r.matchAll(/#+/g)) d += `M${m.index} ${y}h${m[0].length}v1h-${m[0].length}z`;
  });
  return `<svg class="pi" viewBox="0 0 ${rows[0]!.length} ${rows.length}" shape-rendering="crispEdges" fill="currentColor"><path d="${d}"/></svg>`;
}

const ICON = {
  play: ['##......', '####....', '######..', '########', '######..', '####....', '##......'],
  speaker: ['...#.....', '..##.#...', '###.#.#..', '###.#.#..', '###.#.#..', '..##.#...', '...#.....'],
  muted: ['...#.....', '..##.#.#.', '###..#...', '###.#.#..', '###..#...', '..##.#.#.', '...#.....'],
  skull: ['.#####.', '#######', '##.#.##', '##.#.##', '#######', '.#####.', '.#.#.#.', '.#####.'],
  help: ['.#####.', '##...##', '.....##', '...###.', '..##...', '.......', '..##...'],
  share: ['...#...', '..###..', '.#.#.#.', '...#...', '#..#..#', '#.....#', '#######'],
  menu: ['#######', '.......', '#######', '.......', '#######'],
};

const HEART_SVG = '<svg class="heart" viewBox="0 0 7 6"><path d="M1 0h2v1H1z M4 0h2v1H4z M0 1h7v2H0z M1 3h5v1H1z M2 4h3v1H2z M3 5h1v1H3z"/></svg>';

/** The three bosses of the 3D act, for the picker on the home page (names and colours match the fights). */
const BOSSES = [
  { name: 'X, the Hollow', sub: 'it fell in from the third dimension', colour: '#ff3a4a' },
  { name: 'The Collector', sub: 'he wanted you on his wall', colour: '#ffcf5a' },
  { name: 'The Mash', sub: 'every guardian, stitched back together', colour: '#ff8aa8' },
];

/** The how-to rows: a little picture of the gesture, what it is called, what it does. */
const GESTURES = [
  { pic: '<circle cx="12" cy="12" r="10" fill="none" stroke="#9ff4ee" stroke-width="1.6" opacity=".55"/><circle cx="15.5" cy="8.5" r="4.2" fill="#f2d36b"/>', name: 'Move', text: 'Drag on the left side of the screen. Or WASD / arrow keys.' },
  { pic: '<circle cx="12" cy="12" r="3.4" fill="#f2d36b"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="#9ff4ee" stroke-width="1.6" opacity=".7"/><circle cx="12" cy="12" r="10.6" fill="none" stroke="#9ff4ee" stroke-width="1" opacity=".3"/>', name: 'Tap', text: 'A pulse of light. In the 3D arena: a claw strike.' },
  { pic: '<circle cx="6" cy="12" r="3.4" fill="#f2d36b"/><path d="M11 12h10M17 8l4 4-4 4" fill="none" stroke="#9ff4ee" stroke-width="1.8"/>', name: 'Hold, let go', text: 'A Light Lance: a bolt of light that flies far.' },
  { pic: '<circle cx="12" cy="12" r="3.2" fill="#ff9ad0"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" stroke="#ffe9a0" stroke-width="1.8"/>', name: 'Hold longer', text: 'With all three light orbs full: a Nova, light all around you.' },
  { pic: '<path d="M3 6l6 6-6 6M12 6l6 6-6 6" fill="none" stroke="#9ff4ee" stroke-width="2"/>', name: 'Double-tap', text: 'A dash. You cannot be hurt while you do it, but it spends a charge and charges come back slowly.' },
  { pic: '<path d="M19 8a8 8 0 1 0 1 6" fill="none" stroke="#9ff4ee" stroke-width="1.8"/><path d="M20 3v5h-5" fill="none" stroke="#9ff4ee" stroke-width="1.8"/>', name: 'Camera', text: 'In 3D: drag on the right side, or Q / E. R recentres.' },
];

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
  private dashEl: HTMLElement;
  private goalEl: HTMLElement;
  private goalKey: string | null = null;
  private dashKey = '';
  private dashTimer = 0;
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
  /** cutscene subtitles: who is talking, and what they say */
  private subEl!: HTMLElement;
  private subTimer = 0;
  private onRecenter: (() => void) | null = null;
  private onSkip: (() => void) | null = null;
  /** the animation loop of the splash and the home page (logo, fireflies, eyes), and what to do when the stage is resized */
  private fxRaf = 0;
  private onFit: (() => void) | null = null;

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
    this.goalEl = mk('goal');
    this.phaseEl = mk('phase');
    this.heartsEl = mk('hearts');
    this.buildHearts(3);
    this.bossEl = mk('bossbar');
    this.lightEl = mk('lightmeter');
    this.dashEl = mk('dashmeter');
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
    this.subEl = mk('sub');
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

    const fit = () => {
      this.stage.style.setProperty('--u', `${this.stage.clientWidth / 100}px`);
      this.onFit?.();
    };
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

  /**
   * The "tap to begin" screen before the trailer (browsers need a tap before they play sound). "skip intro" (or Escape) goes straight to
   * the home page instead; Enter or Space begins like a tap.
   */
  showSplash(onTap: () => void, onSkip: () => void) {
    const el = this.splashEl;
    el.innerHTML = '';
    const mk = (cls: string, text = '') => {
      const e = document.createElement('div');
      e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    const amb = new Ambient();
    const logo = new Logo();
    const fam = new Family();
    const sp = mk('sp');
    const hint = mk('sb', 'tap to begin');
    const snd = mk('ss');
    snd.innerHTML = `${icon(ICON.speaker)}best with sound on`;
    const skip = document.createElement('button');
    skip.className = 'sk';
    skip.textContent = 'skip intro ▸';
    sp.append(logo.canvas, fam.canvas, hint, snd, skip);
    el.append(amb.canvas, sp);
    el.classList.remove('hide');
    const leave = () => {
      el.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', key);
      el.classList.add('out');
      window.setTimeout(() => {
        el.classList.add('hide');
        el.classList.remove('out');
      }, 450);
    };
    const go = (e: Event) => {
      e.stopPropagation();
      leave();
      onTap();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        leave();
        onSkip();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        leave();
        onTap();
      }
    };
    el.addEventListener('pointerdown', go);
    window.addEventListener('keydown', key);
    // the button must not start the intro: it is the way out of it
    skip.addEventListener('pointerdown', (e) => e.stopPropagation());
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      leave();
      onSkip();
    });
    this.runFx(el, logo, amb, 0.9, fam);
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

  /** Is this the hint on screen right now? (so a timer can take down its own hint and nobody else's) */
  hintIs(text: string): boolean {
    return this.hintEl.classList.contains('show') && this.hintEl.textContent === text;
  }

  /** The goal in one line, under the five dots, while you are out on the roads (null hides it). It also hides with the hearts. */
  goal(text: string | null) {
    if (text === this.goalKey) return;
    this.goalKey = text;
    if (text === null) {
      this.goalEl.classList.remove('show');
    } else {
      this.goalEl.textContent = text;
      this.goalEl.classList.add('show');
    }
  }

  /**
   * The first time anyone plays: what is happening, in plain words, over the forest. `onDone` runs when they tap Got it.
   * The same words are at the top of How to play.
   */
  briefing(onDone: () => void) {
    const card = document.createElement('div');
    card.className = 'brief';
    card.innerHTML = `<div class="bn"><b>${STORY.hero.name}</b><i>${STORY.hero.sub}</i></div><div class="bl">${STORY.brief.map((l) => `<p>${l}</p>`).join('')}</div>`;
    const ok = document.createElement('button');
    ok.className = 'sclose';
    ok.textContent = 'Got it';
    ok.addEventListener('click', () => {
      card.classList.add('gone');
      window.setTimeout(() => card.remove(), 400);
      onDone();
    });
    card.append(ok);
    this.stage.appendChild(card);
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
      this.goal(null);
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

  /** Dash charges, under the light meter (they show and hide with it): `n` ready out of `max`, the next one `frac` of the way back. */
  dashes(n: number, max: number, frac: number) {
    const key = `${n}/${max}/${Math.round(frac * 24)}`;
    if (key === this.dashKey) return;
    this.dashKey = key;
    if (this.dashEl.children.length !== max) this.dashEl.innerHTML = '<i></i>'.repeat(max);
    Array.from(this.dashEl.children).forEach((e, i) => {
      const f = i < n ? 1 : i === n ? frac : 0;
      (e as HTMLElement).style.setProperty('--f', String(f));
      e.classList.toggle('full', f >= 1);
    });
  }

  /** The player asked for a dash and has none: the row shakes. */
  dashEmpty() {
    this.dashEl.classList.add('nope');
    window.clearTimeout(this.dashTimer);
    this.dashTimer = window.setTimeout(() => this.dashEl.classList.remove('nope'), 320);
  }

  /** Light meter: three orbs that fill as you hurt things. Full means a Nova is ready. */
  light(v: number | null) {
    this.dashEl.classList.toggle('show', v !== null);
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

  /**
   * A cutscene subtitle, the way big games do it: the speaker's name in their colour, the line under it, low on the screen above the letterbox.
   * `who` null is the world talking (no name, in italics). Works while the cinematic layer is on (narration is muted then).
   */
  sub(who: string | null, text: string | null, ms = 2600, colour = '#ffe9a0') {
    window.clearTimeout(this.subTimer);
    if (text === null) {
      this.subEl.classList.remove('show');
      return;
    }
    this.subEl.innerHTML = '';
    if (who) {
      const n = document.createElement('b');
      n.textContent = who;
      n.style.color = colour;
      this.subEl.append(n);
    }
    const t = document.createElement('span');
    t.textContent = text;
    this.subEl.append(t);
    this.subEl.classList.toggle('world', !who);
    this.subEl.classList.remove('show');
    void this.subEl.offsetWidth;
    this.subEl.classList.add('show');
    this.subTimer = window.setTimeout(() => this.subEl.classList.remove('show'), ms);
  }

  /** wider letterbox bars for an in-game cutscene (the trailer keeps the thin ones) */
  widescreen(on: boolean) {
    this.cineEl.classList.toggle('wide', on);
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

  /** The home page: the logo, Play, the three difficulties, and the trailer, the boss picker and the how-to. */
  showStart(o: HomeOptions) {
    const el = this.startEl;
    el.innerHTML = '';
    const mk = (cls: string, text = '', tag = 'div') => {
      const e = document.createElement(tag);
      e.className = cls;
      if (text) e.textContent = text;
      return e;
    };
    const amb = new Ambient();
    const logo = new Logo();
    const home = mk('home');

    // the sound switch lives in the corner, where thumbs expect it
    const snd = mk('snd', '', 'button');
    snd.setAttribute('aria-label', 'sound');
    let on = o.sound ?? true;
    const paint = () => {
      snd.innerHTML = icon(on ? ICON.speaker : ICON.muted);
      snd.classList.toggle('off', !on);
    };
    paint();
    snd.addEventListener('click', () => {
      on = !on;
      paint();
      o.onSound(on);
    });

    const tag = mk('tag', "don't look up");
    const premise = mk('premise', 'a baby blob, lost in a forest of monsters. beat five guardians. find the third dimension.');
    const spacer = mk('spacer');

    const wrap = mk('playwrap');
    const play = mk('play', '', 'button');
    play.innerHTML = `<span>${icon(ICON.play)}Play</span>`;
    play.addEventListener('click', () => {
      el.classList.add('hide');
      o.onPlay();
    });
    wrap.append(play);

    // three cards, one per difficulty: hearts are what you get, the last line is what it is for (or your best time)
    const ids: DiffId[] = ['gentle', 'normal', 'nightmare'];
    const diffs = mk('diffs');
    const blurb = mk('blurb');
    const tiles = ids.map((id) => {
      const d = PRESETS[id];
      const best = bestTime(id);
      const t = mk('dtile', '', 'button');
      t.innerHTML = `<b>${d.label}</b><span class="pips">${HEART_SVG.repeat(d.hearts)}</span><i>${best !== null ? `best ${fmtTime(best)}` : d.ranked ? 'ranked' : 'for the story'}</i>`;
      diffs.append(t);
      return t;
    });
    const refresh = (id: DiffId) => {
      tiles.forEach((t, i) => t.classList.toggle('on', ids[i] === id));
      blurb.textContent = PRESETS[id].blurb;
    };
    tiles.forEach((t, i) =>
      t.addEventListener('click', () => {
        o.onDifficulty(ids[i]!);
        refresh(ids[i]!);
      }),
    );
    refresh(o.difficulty);

    const row = mk('row');
    const pill = (label: string, rows: string[], fn: () => void) => {
      const b = mk('pill', '', 'button');
      b.innerHTML = `${icon(rows)}<span>${label}</span>`;
      b.addEventListener('click', fn);
      row.append(b);
    };
    if (o.onIntro) {
      pill('Trailer', ICON.play, () => {
        el.classList.add('hide');
        o.onIntro!();
      });
    }
    pill('Fight a boss', ICON.skull, () => this.showShowcase(o));
    pill('How to play', ICON.help, () => this.showHowTo());

    const foot = mk('foot', 'RUN October Jam · Monster Mash');
    home.append(amb.canvas, snd, logo.canvas, tag, premise, spacer, wrap, diffs, blurb, row, foot);
    el.append(home);
    el.classList.remove('hide');
    this.runFx(el, logo, amb, 0.92);
  }

  /** The animation of the splash and the home page: the logo's depth sways, the fireflies drift, eyes open in the dark. */
  private runFx(el: HTMLElement, logo: Logo, amb: Ambient, width: number, fam?: Family) {
    this.stopFx();
    const size = () => logo.resize(this.stage.clientWidth * width);
    this.onFit = size;
    size();
    // (a property, so showing the page again replaces the old handler instead of stacking another)
    el.onpointermove = (e) => {
      const r = this.stage.getBoundingClientRect();
      logo.tilt = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
    };
    const t0 = performance.now();
    let drawn = 0;
    const tick = (now: number) => {
      if (!el.isConnected || el.classList.contains('hide')) {
        this.fxRaf = 0;
        return;
      }
      this.fxRaf = requestAnimationFrame(tick);
      // thirty frames a second is plenty for something this slow
      if (now - drawn < 32) return;
      drawn = now;
      const t = (now - t0) / 1000;
      logo.draw(t);
      amb.draw(t);
      fam?.draw(t);
    };
    this.fxRaf = requestAnimationFrame(tick);
  }

  private stopFx() {
    if (this.fxRaf) cancelAnimationFrame(this.fxRaf);
    this.fxRaf = 0;
    this.onFit = null;
  }

  /** Pick a boss to fight right now, skipping the story (these runs are never ranked). */
  private showShowcase(o: HomeOptions) {
    const card = document.createElement('div');
    card.className = 'sheet';
    card.innerHTML = '<div class="sh">Fight a boss</div><div class="ssub">Skip the forest. The next boss follows if you win.<br>These runs are not ranked.</div>';
    BOSSES.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'bcard';
      btn.style.setProperty('--bc', b.colour);
      btn.innerHTML = `<b>${b.name}</b><i>${b.sub}</i>`;
      btn.addEventListener('click', () => {
        this.startEl.classList.add('hide');
        card.remove();
        o.onShowcase(i);
      });
      card.append(btn);
    });
    const close = document.createElement('button');
    close.className = 'sclose';
    close.textContent = 'Back';
    close.addEventListener('click', () => card.remove());
    card.append(close);
    this.startEl.append(card);
  }

  /** Controls and tips, shown over the home page. */
  private showHowTo() {
    const card = document.createElement('div');
    card.className = 'sheet';
    const rows = GESTURES.map((g) => `<div class="hrow"><svg viewBox="0 0 24 24">${g.pic}</svg><div><b>${g.name}</b><span>${g.text}</span></div></div>`).join('');
    card.innerHTML = `<div class="sh">How to play</div><div class="hgoal">${STORY.brief.join(' ')}</div><div class="hlist">${rows}</div><div class="htip">Stay in the light. Freeze in the reeds.<br>Every monster has a weak point: wait for it to show.</div>`;
    const close = document.createElement('button');
    close.className = 'sclose';
    close.textContent = 'Got it';
    close.addEventListener('click', () => card.remove());
    card.append(close);
    this.startEl.append(card);
  }

  showEnd(line: string, time: string, deaths: number, mode: string, newBest: boolean, onAgain: () => void, onShare: () => Promise<boolean>, onMenu: () => void): HTMLElement {
    const mk = (cls: string, tag = 'div') => {
      const e = document.createElement(tag);
      e.className = cls;
      return e;
    };
    this.endEl.innerHTML = '';
    const big = mk('big');
    big.textContent = line;
    const stats = mk('stats');
    stats.innerHTML = `<div><i>time</i><b>${time}</b>${newBest ? '<em>new best</em>' : ''}</div><div><i>deaths</i><b>${deaths}</b></div>`;
    const m = mk('small');
    m.textContent = mode;
    const rank = mk('stat rank');
    const wrap = mk('playwrap');
    const again = mk('play', 'button');
    again.innerHTML = `<span>${icon(ICON.play)}Play again</span>`;
    again.addEventListener('click', () => {
      this.endEl.classList.add('hide');
      onAgain();
    });
    wrap.append(again);
    const row = mk('row');
    const share = mk('pill', 'button');
    share.innerHTML = `${icon(ICON.share)}<span>Share</span>`;
    share.addEventListener('click', () => {
      void onShare().then((ok) => {
        share.querySelector('span')!.textContent = ok ? 'Shared' : 'Share';
      });
    });
    const menu = mk('pill', 'button');
    menu.innerHTML = `${icon(ICON.menu)}<span>Menu</span>`;
    menu.addEventListener('click', onMenu);
    row.append(share, menu);
    this.endEl.append(big, stats, m, rank, wrap, row);
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

/** Two big lights and a small one, curled up together: the opening's picture, as a small breathing sprite. */
class Family {
  private p: Pix = makeSprite(76, 36);
  readonly canvas = this.p.canvas;

  constructor() {
    this.canvas.className = 'family';
    this.draw(0);
  }

  draw(t: number) {
    const p = this.p;
    p.ctx.clearRect(0, 0, 76, 36);
    const blink = (k: number) => (Math.sin(t * 0.9 + k * 2.4) > 0.97 ? 1 : 0);
    drawBlob(p, 21, 33, { s: 1.55, squash: 1 + 0.03 * Math.sin(t * 1.9), blink: blink(0), bow: true });
    drawBlob(p, 55, 33, { s: 1.55, squash: 1 + 0.03 * Math.sin(t * 1.9 + 1.3), blink: blink(1) });
    drawBlob(p, 38, 34, { s: 0.95, squash: 1 + 0.05 * Math.sin(t * 2.6 + 0.6), blink: blink(2) });
  }
}
