import type { Sfx } from '../core/audio';
import { bossHp } from '../core/difficulty';
import type { UI } from '../ui';
import type * as THREE from 'three';
import type { Arena } from './arena';
import type { Slicer } from './kit/sdf';

/**
 * What a 3D boss needs from the fight, and what every 3D boss shares. A boss only says what it does in each phase,
 * where it can be hurt, and what is about to hurt you; the fight (act2.ts) owns the player, the camera and the hearts.
 */

/** A bolt of light thrown with a held button. */
export interface Lance3 {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
  dead?: boolean;
}

/** A ring of light that bursts out of the player. */
export interface Nova3 {
  x: number;
  z: number;
  t: number;
  /** current radius (grows to `max`) */
  R: number;
  max: number;
}

/** Something that can be hurt right now. A strike must reach it; a lance must pass within `r` (3D). */
export interface Weak {
  x: number;
  y: number;
  z: number;
  /** horizontal reach of a strike from the player's feet */
  reach: number;
  /** radius of the target for lances, in 3D */
  r: number;
  tag: string;
}

/** Something that is about to hurt, for bots and debugging. `at` is seconds until it is live. */
export interface Danger {
  shape: 'disc' | 'ring' | 'lane' | 'cone' | 'box';
  x: number;
  z: number;
  /** disc/ring: radius; box: half width */
  r?: number;
  /** ring thickness */
  w?: number;
  /** lane/cone/box: direction (radians, 0 = +z) and length */
  ang?: number;
  len?: number;
  half?: number;
  at: number;
  dur: number;
}

/** A solid column on the floor that blocks the player and the light. */
export interface Solid {
  x: number;
  z: number;
  r: number;
  alive: boolean;
  /** called when light hits it: return true if it was consumed (the lance stops) */
  onLight?: (kind: 'lance' | 'nova') => boolean;
}

export interface Env {
  arena: Arena;
  audio: Sfx;
  ui: UI;
  /** the player right now */
  p: { x: number; z: number; vx: number; vz: number; dead: boolean; invuln: number };
  time: number;
  solids: Solid[];
  hurt(fromX: number, fromZ: number, dmg?: number): void;
  shake(v: number): void;
  hitStop(s: number): void;
  addLight(n: number): void;
  refillHearts(): void;
  /** the boss's next phase has begun (the fall counter for the phase starts clean) */
  phaseBegan(): void;
  /** a hit has landed on the boss: slow the world for a heartbeat */
  slowmo(scale: number, secs: number): void;
  /** while true the player cannot walk or dash (a jar over them), but can still strike, throw and burst light */
  trap(on: boolean): void;
  /** push the player this frame, in units per second (a wind, a pull); walls and columns still stop them */
  pull(vx: number, vz: number): void;
  /** the fight asks the boss to put the camera somewhere (null = the player's) */
  camLook: { x: number; y: number; z: number } | null;
}

export type BState = 'intro' | 'fight' | 'dying' | 'gone';

export abstract class Boss3D {
  state: BState = 'intro';
  /** seconds in the current state / since the fight began / in the current phase */
  st = 0;
  t = 0;
  pt = 0;
  hp: number;
  maxHp: number;
  phase = 0;
  /** hits per phase at the difficulty chosen when the fight begins */
  pips: number[];
  private readonly baseHits: number[];
  /** invulnerable for this long after a hit */
  iframes = 0;
  protected abstract readonly introLen: number;
  protected abstract readonly dyingLen: number;
  /** true once its model has been built */
  abstract ready(): boolean;

  constructor(
    protected env: Env,
    readonly id: string,
    readonly name: string,
    readonly sub: string,
    readonly colour: string,
    base: number[],
    protected onVictory: () => void,
  ) {
    this.baseHits = base;
    this.pips = base.map((b) => bossHp(b));
    this.maxHp = this.pips.reduce((a, b) => a + b, 0);
    this.hp = this.maxHp;
  }

  /** Health follows the difficulty chosen on the home page, which can be after the bosses were made. */
  protected rescale() {
    this.pips = this.baseHits.map((b) => bossHp(b));
    this.maxHp = this.pips.reduce((a, b) => a + b, 0);
    this.hp = this.maxHp;
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

  /** build the model a few milliseconds at a time (the fight waits for it if it has to) */
  build(_slicer: Slicer): Promise<void> {
    return Promise.resolve();
  }

  /** the trailer cut away from this boss: its timers (a name card, a line it was going to say) must not fire into the next shot */
  cut = false;

  /** the root object the ending can flatten and fade */
  flattenRoot(): THREE.Object3D | null {
    return null;
  }

  /** the fight begins: the model appears and the entrance plays */
  begin(titleDelay = 900, quiet = false) {
    this.cut = false;
    this.rescale();
    this.state = 'intro';
    this.st = 0;
    this.t = 0;
    this.pt = 0;
    this.phase = 0;
    this.iframes = 0;
    this.bar();
    this.onBegin();
    // starting over after too many falls: the entrance plays again, but without the name card
    if (!quiet) window.setTimeout(() => !this.cut && this.env.ui.bossTitle(this.name, this.sub, this.colour), titleDelay);
  }

  protected bar() {
    this.env.ui.bossBar(this.name, this.hp, this.maxHp, this.colour);
  }

  update(dt: number) {
    this.t += dt;
    this.st += dt;
    this.pt += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    if (this.state === 'intro') {
      this.updateIntro(dt);
      if (this.st >= this.introLen) {
        this.state = 'fight';
        this.st = 0;
        this.pt = 0;
        this.env.refillHearts();
        this.startPhase();
      }
    } else if (this.state === 'fight') this.updateFight(dt);
    else if (this.state === 'dying') {
      this.updateDying(dt);
      if (this.st >= this.dyingLen) {
        this.state = 'gone';
        this.env.ui.bossBar(null);
        this.onVictory();
      }
    }
    this.animate(dt);
  }

  /**
   * The boss takes `n` pips of damage at (x, y, z). Returns true if it counted. When it ends a phase the next one
   * starts at once (after `onPhaseEnd`), when it ends the boss the death plays.
   */
  protected damage(n: number, x: number, y: number, z: number): boolean {
    if (this.state !== 'fight' || this.iframes > 0 || this.hp <= 0) return false;
    const { env } = this;
    this.hp = Math.max(0, this.hp - n);
    this.iframes = 0.6;
    env.audio.bossHit();
    env.shake(0.9);
    env.hitStop(0.14);
    env.addLight(1);
    env.arena.burst3(x, y, z, 26, [0xffffff, 0xffe9a0, this.hex()], 9);
    this.onHit(x, y, z);
    this.bar();
    if (this.hp <= 0) {
      this.state = 'dying';
      this.st = 0;
      env.audio.bossDie();
      env.shake(1.6);
      env.ui.flash(0.9, 700);
      env.slowmo(0.25, 1.8);
      this.onDie();
    } else if (this.hp <= this.phaseFloor) {
      this.phase++;
      this.pt = 0;
      this.env.phaseBegan();
      this.env.refillHearts();
      this.onPhaseEnd();
      this.startPhase();
    }
    return true;
  }

  private hex(): number {
    return parseInt(this.colour.replace('#', ''), 16) || 0xff6a6a;
  }

  /** The player died and came back: the phase starts over with its health restored. */
  onPlayerDied() {
    if (this.state === 'gone' || this.state === 'dying') return;
    this.hp = this.phaseStartHp;
    this.pt = 0;
    this.iframes = 0;
    this.bar();
    this.restartPhase();
  }

  /** Debug: jump to the start of a phase. */
  debugSkipTo(phase: number) {
    this.phase = phase;
    this.hp = this.phaseStartHp;
    this.pt = 0;
    this.env.phaseBegan();
    if (this.state === 'intro') {
      this.state = 'fight';
      this.st = 0;
    }
    this.bar();
    this.startPhase();
  }

  /* ---- what a boss fills in ---- */
  protected abstract onBegin(): void;
  protected abstract updateIntro(dt: number): void;
  protected abstract startPhase(): void;
  protected abstract restartPhase(): void;
  protected abstract updateFight(dt: number): void;
  protected onHit(_x: number, _y: number, _z: number): void {}
  protected onPhaseEnd(): void {}
  protected abstract onDie(): void;
  protected abstract updateDying(dt: number): void;
  /** every frame, whatever the state: idle animation of the model */
  protected abstract animate(dt: number): void;

  /** things that can be hurt right now */
  abstract weak(): Weak[];
  /** a strike (claw) from the player landed on `w` */
  hitBy(kind: 'strike' | 'lance' | 'nova', w: Weak): boolean {
    return this.damage(1, w.x, w.y, w.z) && kind !== undefined;
  }
  /** what is about to hurt, for bots */
  abstract dangers(): Danger[];
  /** light passes through the boss: returns true if it was stopped (absorbed) */
  onLance(_l: Lance3): boolean {
    return false;
  }
  onNova(_n: Nova3): void {}
  /** the player's claw swings (called when the swing lands, from the player's feet, facing (fx, fz)) */
  onPlayerStrike(_x: number, _z: number, _fx: number, _fz: number): void {}
  /** where the camera should look when it is not following the player (an entrance, a death) */
  cinematic(): { x: number; y: number; z: number; dist: number } | null {
    return null;
  }
  /** take its model out of the world */
  abstract hide(): void;
  /** put its model in the world, built if it needs to be */
  abstract show(): void;
}
