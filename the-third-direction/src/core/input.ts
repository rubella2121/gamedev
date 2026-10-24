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
  /** true on the frame the button comes up */
  actionReleased = false;
  /** how long it had been held when it came up (0 on every other frame) */
  releasedAfter = 0;
  /** true on the press that is the second tap of a quick double tap */
  doubleTap = false;
  /**
   * Aiming: hold the action button and drag it, and the light flies the way you dragged (screen directions: x right, y down).
   * `aiming` while the drag is far enough to mean it; `aimedRelease` on the frame the button comes up after an aimed drag.
   */
  aiming = false;
  aimX = 0;
  aimY = -1;
  aimedRelease = false;
  private aimOX = 0;
  private aimOY = 0;
  private aimDX = 0;
  private aimDY = 0;
  private aimNow = false;
  usingTouch = false;
  moveEnabled = true;
  /** 3D camera: drag on the right side (any drag with a mouse), or Q / E. */
  cameraEnabled = false;
  camKey = 0;
  camReset = false;
  private camDX = 0;
  private camDY = 0;
  private camId = -1;
  private camLX = 0;
  private camLY = 0;

  private keys = new Set<string>();
  private joyId = -1;
  private joyOX = 0;
  private joyOY = 0;
  private joyX = 0;
  private joyY = 0;
  private btnId = -1;
  private prevDown = false;
  private lastHold = 0;
  private lastTapShort = false;
  private sinceTap = 9;
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
      this.startAim(e);
      try { this.btn.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      this.btn.classList.add('down');
    });
    this.btn.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.btnId) this.moveAim(e);
    });
    const btnUp = (e: PointerEvent) => {
      if (e.pointerId !== this.btnId) return;
      this.btnId = -1;
      this.btn.classList.remove('down');
      this.endAim();
    };
    this.btn.addEventListener('pointerup', btnUp);
    this.btn.addEventListener('pointercancel', btnUp);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const k = e.key.toLowerCase();
    const handled = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'enter', 'q', 'e', 'r'];
    if (handled.includes(k)) {
      e.preventDefault();
      if (down) {
        if (k === 'r' && !this.keys.has(k)) this.camReset = true;
        if ((k === ' ' || k === 'enter') && !this.keys.has(k)) this.latchT = 0.07;
        this.keys.add(k);
      } else this.keys.delete(k);
    }
  }

  private releaseAll() {
    this.keys.clear();
    this.aimNow = false;
    this.endAim();
    this.camId = -1;
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
    if (this.cameraEnabled && this.camId < 0 && (p.x > 0.62 || e.pointerType === 'mouse')) {
      // dragging here turns the camera; the on-screen button is what strikes
      this.camId = e.pointerId;
      this.camLX = e.clientX;
      this.camLY = e.clientY;
      try { this.layer.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      return;
    }
    if (p.x > 0.62) {
      // big action zone on the right
      if (this.actionEnabled && this.btnId < 0) {
        this.btnId = e.pointerId;
        this.latchT = 0.07;
        this.startAim(e);
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
    if (e.pointerId === this.btnId) {
      this.moveAim(e);
      return;
    }
    if (e.pointerId === this.camId) {
      this.camDX += e.clientX - this.camLX;
      this.camDY += e.clientY - this.camLY;
      this.camLX = e.clientX;
      this.camLY = e.clientY;
      return;
    }
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
    if (e.pointerId === this.camId) this.camId = -1;
    if (e.pointerId === this.joyId) {
      this.joyId = -1;
      this.joyX = this.joyY = 0;
      this.joyBase.classList.remove('on');
    }
    if (e.pointerId === this.btnId) {
      this.btnId = -1;
      this.btn.classList.remove('down');
      this.endAim();
    }
  }

  /* ---- aiming: drag the button ---- */

  private startAim(e: PointerEvent) {
    this.aimOX = e.clientX;
    this.aimOY = e.clientY;
    this.aimDX = this.aimDY = 0;
    this.aimNow = false;
  }

  private moveAim(e: PointerEvent) {
    const dx = e.clientX - this.aimOX;
    const dy = e.clientY - this.aimOY;
    const l = Math.hypot(dx, dy);
    // (a small wobble of the thumb is still a tap or a hold, not an aim)
    const dead = Math.max(14, this.btn.clientWidth * 0.22);
    if (l >= dead) {
      this.aimNow = true;
      this.aimX = dx / l;
      this.aimY = dy / l;
    } else if (l < dead * 0.6) this.aimNow = false;
    // the button follows the finger, a little way, and never off the screen
    const max = this.btn.clientWidth * 0.55 || 40;
    const k = l > max ? max / l : 1;
    const par = this.btn.offsetParent as HTMLElement | null;
    const left = this.btn.offsetLeft;
    const top = this.btn.offsetTop;
    const w = this.btn.offsetWidth;
    const pw = par ? par.clientWidth : 1e4;
    const ph = par ? par.clientHeight : 1e4;
    this.aimDX = clamp(dx * k, -left, pw - left - w);
    this.aimDY = clamp(dy * k, -top, ph - top - w);
    this.btn.style.setProperty('--dx', `${this.aimDX}px`);
    this.btn.style.setProperty('--dy', `${this.aimDY}px`);
    this.btn.classList.toggle('aim', l > 2);
  }

  private endAim() {
    this.btn.style.setProperty('--dx', '0px');
    this.btn.style.setProperty('--dy', '0px');
    this.btn.classList.remove('aim');
  }

  /** Show the contextual action button with a label, or hide it with null. */
  setAction(label: string | null) {
    this.actionEnabled = label !== null;
    if (label === null) {
      this.btn.classList.remove('show', 'down');
      this.btnId = -1;
      this.aimNow = false;
      this.endAim();
    } else {
      this.btn.textContent = label;
      this.btn.classList.add('show');
    }
  }

  /** The ring around the action button while a charged attack builds: u in 0..1, stage 0 = nothing yet, 1 = lance ready, 2 = nova ready. */
  setCharge(u: number, stage: 0 | 1 | 2) {
    this.btn.style.setProperty('--ch', String(Math.max(0, Math.min(1, u))));
    this.btn.classList.toggle('ch1', stage === 1);
    this.btn.classList.toggle('ch2', stage === 2);
    this.btn.classList.toggle('charging', u > 0.02);
  }

  /** Drag distance (in CSS pixels) since the last call, then reset. */
  takeCam(): { dx: number; dy: number } {
    const r = { dx: this.camDX, dy: this.camDY };
    this.camDX = this.camDY = 0;
    return r;
  }

  setCameraEnabled(on: boolean) {
    this.cameraEnabled = on;
    if (!on) {
      this.camId = -1;
      this.camDX = this.camDY = 0;
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
    this.camKey = (this.keys.has('e') ? 1 : 0) - (this.keys.has('q') ? 1 : 0);
    this.moveX = clamp(mx, -1, 1);
    this.moveY = clamp(my, -1, 1);

    const keyAction = this.keys.has(' ') || this.keys.has('enter');
    // a short latch so a very quick tap (down+up inside one frame) is never missed
    this.latchT = Math.max(0, this.latchT - dt);
    this.actionDown = (keyAction || this.btnId >= 0 || this.latchT > 0) && this.actionEnabled;
    this.actionPressed = this.actionDown && !this.prevDown;
    this.actionReleased = !this.actionDown && this.prevDown;
    this.sinceTap += dt;
    this.doubleTap = false;
    if (this.actionPressed) {
      if (this.sinceTap < 0.34 && this.lastTapShort) this.doubleTap = true;
      this.sinceTap = 0;
    }
    if (this.actionDown) this.actionHold += dt;
    else {
      if (this.prevDown) this.lastHold = this.actionHold;
      this.actionHold = 0;
    }
    this.releasedAfter = this.actionReleased ? this.lastHold : 0;
    // aiming lasts while the button is down and dragged; the release after an aim is an aimed throw
    this.aimedRelease = this.actionReleased && this.aiming;
    this.aiming = this.actionDown && this.btnId >= 0 && this.aimNow;
    if (!this.actionDown) this.aimNow = false;
    if (this.actionReleased) this.lastTapShort = this.lastHold < 0.2;
    this.prevDown = this.actionDown;
  }
}
