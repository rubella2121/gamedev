import { clamp } from './util';

/**
 * Unified input: WASD/arrows + Space on desktop, floating touch joystick + one contextual
 * action button on phones. The right 38% of the screen also acts as a big action zone.
 */
export class Input {
  moveX = 0;
  moveY = 0;
  actionDown = false;
  actionPressed = false;
  actionHold = 0;
  usingTouch = false;
  moveEnabled = true;

  private keys = new Set<string>();
  private joyId = -1;
  private joyOX = 0;
  private joyOY = 0;
  private joyX = 0;
  private joyY = 0;
  private btnId = -1;
  private prevDown = false;
  private latchT = 0;
  private actionEnabled = false;
  private layer: HTMLElement;
  private joyBase: HTMLElement;
  private joyKnob: HTMLElement;
  private btn: HTMLElement;

  constructor(stage: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    this.btn = document.createElement('div');
    this.btn.className = 'abtn';
    stage.appendChild(this.layer);
    stage.appendChild(this.joyBase);
    stage.appendChild(this.btn);

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());

    this.layer.addEventListener('pointerdown', (e) => this.onDown(e));
    this.layer.addEventListener('pointermove', (e) => this.onMove(e));
    this.layer.addEventListener('pointerup', (e) => this.onUp(e));
    this.layer.addEventListener('pointercancel', (e) => this.onUp(e));
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.usingTouch = e.pointerType !== 'mouse' || this.usingTouch;
      this.btnId = e.pointerId;
      this.latchT = 0.07;
      try { this.btn.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      this.btn.classList.add('down');
    });
    const btnUp = (e: PointerEvent) => {
      if (e.pointerId !== this.btnId) return;
      this.btnId = -1;
      this.btn.classList.remove('down');
    };
    this.btn.addEventListener('pointerup', btnUp);
    this.btn.addEventListener('pointercancel', btnUp);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const k = e.key.toLowerCase();
    const handled = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'enter'];
    if (handled.includes(k)) {
      e.preventDefault();
      if (down) {
        if ((k === ' ' || k === 'enter') && !this.keys.has(k)) this.latchT = 0.07;
        this.keys.add(k);
      } else this.keys.delete(k);
    }
  }

  private releaseAll() {
    this.keys.clear();
    this.joyId = -1;
    this.btnId = -1;
    this.joyX = this.joyY = 0;
    this.joyBase.classList.remove('on');
    this.btn.classList.remove('down');
  }

  private rel(e: PointerEvent) {
    const r = this.layer.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
  }

  private onDown(e: PointerEvent) {
    e.preventDefault();
    if (e.pointerType !== 'mouse') this.usingTouch = true;
    const p = this.rel(e);
    if (p.x > 0.62) {
      // big action zone on the right
      if (this.actionEnabled && this.btnId < 0) {
        this.btnId = e.pointerId;
        this.latchT = 0.07;
        try { this.layer.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        this.btn.classList.add('down');
      }
      return;
    }
    if (this.joyId >= 0) return;
    this.joyId = e.pointerId;
    try { this.layer.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    this.joyOX = e.clientX;
    this.joyOY = e.clientY;
    this.joyX = this.joyY = 0;
    const stageRect = this.layer.getBoundingClientRect();
    this.joyBase.style.left = `${e.clientX - stageRect.left}px`;
    this.joyBase.style.top = `${e.clientY - stageRect.top}px`;
    this.joyKnob.style.transform = 'translate(-50%, -50%)';
    if (this.moveEnabled) this.joyBase.classList.add('on');
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId !== this.joyId) return;
    const max = 34;
    let dx = e.clientX - this.joyOX;
    let dy = e.clientY - this.joyOY;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    this.joyX = dx / max;
    this.joyY = dy / max;
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private onUp(e: PointerEvent) {
    if (e.pointerId === this.joyId) {
      this.joyId = -1;
      this.joyX = this.joyY = 0;
      this.joyBase.classList.remove('on');
    }
    if (e.pointerId === this.btnId) {
      this.btnId = -1;
      this.btn.classList.remove('down');
    }
  }

  /** Show the contextual action button with a label, or hide it with null. */
  setAction(label: string | null) {
    this.actionEnabled = label !== null;
    if (label === null) {
      this.btn.classList.remove('show', 'down');
      this.btnId = -1;
    } else {
      this.btn.textContent = label;
      this.btn.classList.add('show');
    }
  }

  setMoveEnabled(on: boolean) {
    this.moveEnabled = on;
    if (!on) this.joyBase.classList.remove('on');
  }

  update(dt: number) {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) ky -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) ky += 1;
    let mx = kx;
    let my = ky;
    if (kx !== 0 && ky !== 0) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }
    const jl = Math.hypot(this.joyX, this.joyY);
    if (jl > 0.18) {
      const k = Math.min(1, (jl - 0.18) / 0.6) / jl;
      mx = this.joyX * k;
      my = this.joyY * k;
    }
    if (!this.moveEnabled) mx = my = 0;
    this.moveX = clamp(mx, -1, 1);
    this.moveY = clamp(my, -1, 1);

    const keyAction = this.keys.has(' ') || this.keys.has('enter');
    // a short latch so a very quick tap (down+up inside one frame) is never missed
    this.latchT = Math.max(0, this.latchT - dt);
    this.actionDown = (keyAction || this.btnId >= 0 || this.latchT > 0) && this.actionEnabled;
    this.actionPressed = this.actionDown && !this.prevDown;
    this.actionHold = this.actionDown ? this.actionHold + dt : 0;
    this.prevDown = this.actionDown;
  }
}
