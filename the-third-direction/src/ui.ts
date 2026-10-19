import { PRESETS, type DiffId } from './core/difficulty';

export interface HomeOptions {
  onPlay: () => void;
  onShowcase: () => void;
  onSound: (on: boolean) => void;
  onDifficulty: (id: DiffId) => void;
  difficulty: DiffId;
  best: () => string | null;
}

/** All DOM overlays: captions, hints, hearts, title card, start and end screens. */
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
  private capTimer = 0;
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

  caption(text: string | null, holdMs = 2600, low = false) {
    window.clearTimeout(this.capTimer);
    this.captionEl.classList.toggle('low', low);
    if (text === null) {
      this.captionEl.classList.remove('show');
      return;
    }
    this.captionEl.textContent = text;
    this.captionEl.classList.add('show');
    if (holdMs > 0) this.capTimer = window.setTimeout(() => this.captionEl.classList.remove('show'), holdMs);
  }

  hint(text: string | null) {
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
    show.addEventListener('click', () => {
      el.classList.add('hide');
      o.onShowcase();
    });
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
    foot.append(best, sound);

    home.append(eyebrow, logo, tag, spacer, play, diff, row, foot);
    el.append(home);
    el.classList.remove('hide');
  }

  /** Controls and tips, shown over the home page. */
  private showHowTo() {
    const card = document.createElement('div');
    card.className = 'howto';
    card.innerHTML = `
      <div class="hh">How to play</div>
      <div class="hrow"><b>Move</b><span>drag on the left side of the screen<br>or WASD / arrow keys</span></div>
      <div class="hrow"><b>Act</b><span>the glowing button, or Space.<br>It only appears when it is useful.</span></div>
      <div class="hrow"><b>Camera</b><span>in 3D, drag on the right side<br>or Q / E. R recentres.</span></div>
      <div class="htip">Stay in the light. Freeze in the reeds.<br>When X gets stuck, strike.</div>`;
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
