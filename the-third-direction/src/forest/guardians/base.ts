import { bossHp, D } from '../../core/difficulty';
import { burst } from '../../core/art';
import { clamp } from '../../core/util';
import type { ArenaDef } from '../land';
import type { Drawable, Hub, Lance, Nova, Rect } from '../types';
import { Hazards } from './hazards';
import { Shots } from './shots';

export type GState = 'intro' | 'fight' | 'dying' | 'gone';

/**
 * What every zone guardian shares: pips of health split into phases, a hit that has a flash and a sound and fills the
 * light meter, an entrance (name card, voice, the player held still), and a death (slow motion, a long falling apart,
 * then back to the glade). A guardian only has to say what it does in each phase and how it looks.
 */
export abstract class Guardian {
  readonly hz = new Hazards();
  readonly shots = new Shots();
  state: GState = 'intro';
  /** seconds in the current state */
  st = 0;
  /** seconds since the fight began */
  t = 0;
  /** seconds in the current phase (starts again when a phase restarts) */
  pt = 0;
  hp: number;
  readonly maxHp: number;
  phase = 0;
  readonly pips: number[];
  /** a white flash on the body after a hit */
  flash = 0;
  /** invulnerable for this many seconds after a hit */
  iframes = 0;
  protected abstract readonly introLen: number;
  protected abstract readonly dyingLen: number;
  protected readonly pl;

  constructor(
    protected hub: Hub,
    protected a: ArenaDef,
    readonly name: string,
    readonly sub: string,
    readonly colour: string,
    base: number[],
    private onVictory: () => void,
  ) {
    this.pips = base.map((b) => bossHp(b));
    this.maxHp = this.pips.reduce((x, y) => x + y, 0);
    this.hp = this.maxHp;
    this.pl = hub.player;
  }

  /** the arena's fixed points */
  protected get cx() {
    return this.a.x;
  }

  /** health at which the current phase ends */
  protected get phaseFloor(): number {
    let f = 0;
    for (let i = this.phase + 1; i < this.pips.length; i++) f += this.pips[i]!;
    return f;
  }

  protected get phaseStartHp(): number {
    return this.phaseFloor + this.pips[this.phase]!;
  }

  /** called when the player arrives in the arena */
  begin() {
    this.state = 'intro';
    this.st = 0;
    this.t = 0;
    this.pt = 0;
    this.phase = 0;
    this.hp = this.maxHp;
    this.hub.holdPlayer(this.introLen);
    this.bar();
    this.onIntro();
    window.setTimeout(() => this.hub.ui.bossTitle(this.name, this.sub, this.colour), 900);
  }

  protected bar() {
    this.hub.ui.bossBar(this.name, this.hp, this.maxHp, this.colour);
  }

  update(dt: number) {
    this.t += dt;
    this.st += dt;
    this.pt += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    if (this.state === 'intro') {
      this.updateIntro(dt);
      if (this.st >= this.introLen) {
        this.state = 'fight';
        this.st = 0;
        this.pt = 0;
        this.startPhase();
      }
    } else if (this.state === 'fight') {
      this.hz.update(dt, this.hub);
      this.shots.update(dt, this.hub);
      this.updateFight(dt);
    } else if (this.state === 'dying') {
      this.updateDying(dt);
      if (this.st >= this.dyingLen) {
        this.state = 'gone';
        this.hub.ui.bossBar(null);
        this.onVictory();
      }
    }
  }

  /** The guardian takes `n` pips of damage at (x, y). Returns true if it counted. */
  protected damage(n: number, x: number, y: number): boolean {
    if (this.state !== 'fight' || this.iframes > 0 || this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - n);
    this.iframes = 0.7;
    this.flash = 0.3;
    this.hub.audio.bossHit();
    this.hub.shake(6);
    this.hub.addLight(0.7);
    burst(this.hub.parts, x, y, 18, [this.colour, '#ffffff', '#ffe9a0'], 70, 1);
    this.bar();
    if (this.hp <= 0) this.die();
    else if (this.hp <= this.phaseFloor) {
      this.phase++;
      this.pt = 0;
      this.hz.clear();
      this.shots.clear();
      this.startPhase();
    } else this.onHurt();
    return true;
  }

  private die() {
    this.state = 'dying';
    this.st = 0;
    this.hz.clear();
    this.shots.clear();
    this.hub.slowmo(0.3, 1.8);
    this.hub.ui.flash(0.9, 700);
    this.hub.audio.bossDie();
    this.hub.shake(14);
    this.onDie();
  }

  /** The player died and came back to the arena entrance: the phase starts over, with its health restored. */
  onPlayerDied() {
    if (this.state === 'gone' || this.state === 'dying') return;
    this.hp = this.phaseStartHp;
    this.hz.clear();
    this.shots.clear();
    this.pt = 0;
    this.iframes = 0;
    this.bar();
    this.hub.holdPlayer(0.9);
    this.restartPhase();
  }

  /** Debug: jump to the start of a phase. */
  debugSkipTo(phase: number) {
    this.phase = phase;
    this.hp = this.phaseStartHp;
    this.pt = 0;
    this.hz.clear();
    this.shots.clear();
    if (this.state === 'intro') {
      this.state = 'fight';
      this.st = 0;
    }
    this.bar();
    this.startPhase();
  }

  /** Is the player close enough to a point to hurt it with a pulse? */
  protected pulseReach(x: number, y: number, R: number, px: number, py: number, rad: number): boolean {
    return Math.hypot(px - x, (py - y) / 0.8) <= R + rad;
  }

  /* ---- what a guardian fills in ---- */
  protected onIntro(): void {}
  protected abstract updateIntro(dt: number): void;
  protected abstract startPhase(): void;
  protected abstract restartPhase(): void;
  protected abstract updateFight(dt: number): void;
  protected onHurt(): void {}
  protected abstract onDie(): void;
  protected abstract updateDying(dt: number): void;
  abstract onPulse(x: number, y: number, R: number): void;
  onLance(_l: Lance): boolean {
    return false;
  }
  onNova(_n: Nova): void {}
  lanceTarget(): { x: number; y: number } | null {
    return null;
  }
  colliders(): Rect[] {
    return [];
  }
  ground(): void {}
  abstract push(list: Drawable[]): void;
  overlay(): void {}
  /** keep the camera on this point */
  abstract focus(): { x: number; y: number };

  protected static tele(s: number): number {
    return s * D.tele;
  }

  protected static clamp01(v: number): number {
    return clamp(v, 0, 1);
  }
}
