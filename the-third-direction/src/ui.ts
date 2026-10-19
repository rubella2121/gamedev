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
    for (let i = 0; i < 3; i++) {
      this.heartsEl.insertAdjacentHTML(
        'beforeend',
        '<svg class="heart" viewBox="0 0 7 6"><path d="M1 0h2v1H1z M4 0h2v1H4z M0 1h7v2H0z M1 3h5v1H1z M2 4h3v1H2z M3 5h1v1H3z"/></svg>',
      );
    }
    this.titleEl = mk('title');
    this.titleEl.innerHTML = 'The Third<br>Direction';
    this.skipEl = mk('skip', 'button') as HTMLButtonElement;
    this.skipEl.textContent = 'Skip ▸';
    this.skipEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSkip?.();
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

  hearts(n: number | null) {
    if (n === null) {
      this.heartsEl.classList.remove('show');
      return;
    }
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

  showStart(onStart: () => void, onShowcase?: () => void) {
    this.startEl.innerHTML = '';
    const hint = document.createElement('div');
    hint.className = 'small pulse';
    hint.textContent = 'best with sound on';
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = 'Start';
    b.addEventListener('click', () => {
      this.startEl.classList.add('hide');
      onStart();
    });
    this.startEl.append(b);
    if (onShowcase) {
      const s = document.createElement('button');
      s.className = 'btn ghost';
      s.textContent = 'Quick showcase';
      s.addEventListener('click', () => {
        this.startEl.classList.add('hide');
        onShowcase();
      });
      this.startEl.append(s);
    }
    this.startEl.append(hint);
    this.startEl.classList.remove('hide');
  }

  showEnd(line: string, time: string, deaths: number, onAgain: () => void, onShare: () => Promise<boolean>): HTMLElement {
    this.endEl.innerHTML = '';
    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = line;
    const t = document.createElement('div');
    t.className = 'stat';
    t.innerHTML = `time <b>${time}</b>`;
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `deaths <b>${deaths}</b>`;
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
    const rank = document.createElement('div');
    rank.className = 'stat rank';
    this.endEl.append(big, t, d, rank, b, share);
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
