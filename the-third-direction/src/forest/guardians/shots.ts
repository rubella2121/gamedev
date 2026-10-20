import type { Pix } from '../../core/pix';
import { C } from '../../core/palette';
import { clamp, TAU } from '../../core/util';
import type { Hub } from '../types';

export type ShotKind = 'orb' | 'thorn' | 'petal' | 'note' | 'bone' | 'seed' | 'spark';

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** hit radius */
  r: number;
  life: number;
  age: number;
  kind: ShotKind;
  dmg: number;
  spin: number;
  /** turn toward the player at this rate (rad/s); 0 = fly straight */
  homing: number;
  /** fall down the screen (px/s^2): seeds and bone shards arc through the air */
  gravity: number;
  /** stays alive after hitting the player (does not vanish) */
  pierce: boolean;
  /** bounces off the arena wall instead of dying on it */
  bounce: boolean;
  tag?: string;
  /** called when it dies (a seed that becomes a flower) */
  onDie?: (s: Shot) => void;
  /** the player can clear it with a light pulse */
  pulsable: boolean;
}

export type ShotInit = Partial<Shot> & { x: number; y: number; vx: number; vy: number; kind: ShotKind };

/** Bullets: orbs, thorns, petals, notes, shards. They are cleared by a Nova and (some of them) by a pulse. */
export class Shots {
  list: Shot[] = [];

  add(s: ShotInit): Shot {
    const full: Shot = { r: 3.5, life: 4, age: 0, dmg: 1, spin: 0, homing: 0, gravity: 0, pierce: false, bounce: false, pulsable: false, ...s };
    this.list.push(full);
    return full;
  }

  clear(tag?: string) {
    this.list = tag ? this.list.filter((s) => s.tag !== tag) : [];
  }

  /** Remove every shot inside a ring (a Nova). Returns how many. */
  clearIn(x: number, y: number, R: number, onlyPulsable = false): number {
    let n = 0;
    this.list = this.list.filter((s) => {
      if (Math.hypot(s.x - x, (s.y - y) / 0.72) <= R && (!onlyPulsable || s.pulsable)) {
        n++;
        s.onDie?.(s);
        return false;
      }
      return true;
    });
    return n;
  }

  update(dt: number, hub: Hub) {
    const pl = hub.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]!;
      s.age += dt;
      s.life -= dt;
      if (s.homing > 0) {
        const want = Math.atan2(pl.y - 6 - s.y, pl.x - s.x);
        const cur = Math.atan2(s.vy, s.vx);
        let da = want - cur;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const turn = clamp(da, -s.homing * dt, s.homing * dt);
        const sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(cur + turn) * sp;
        s.vy = Math.sin(cur + turn) * sp;
      }
      s.vy += s.gravity * dt;
      const nx = s.x + s.vx * dt;
      const ny = s.y + s.vy * dt;
      let dead = s.life <= 0;
      if (!dead && !hub.land.isWalk(nx, ny)) {
        if (s.bounce) {
          if (!hub.land.isWalk(nx, s.y)) s.vx *= -1;
          if (!hub.land.isWalk(s.x, ny)) s.vy *= -1;
        } else dead = true;
      } else if (!dead) {
        s.x = nx;
        s.y = ny;
      }
      if (!dead && pl.dead <= 0 && !pl.hide && Math.hypot(pl.x - s.x, (pl.y - 5 - s.y) / 0.9) < s.r + 3.5) {
        hub.hurt(s.x, s.y, s.dmg);
        if (!s.pierce) dead = true;
      }
      if (dead) {
        s.onDie?.(s);
        this.list.splice(i, 1);
      }
    }
  }

  draw(p: Pix, camX: number, camY: number, t: number) {
    for (const s of this.list) {
      const sx = s.x - camX;
      const sy = s.y - camY;
      if (sx < -10 || sx > 226 || sy < -10 || sy > 394) continue;
      const a = s.life < 0.25 ? s.life * 4 : 1;
      p.alpha(a);
      this.drawShot(p, s, sx, sy, t);
      p.alpha(1);
    }
  }

  private drawShot(p: Pix, s: Shot, sx: number, sy: number, t: number) {
    const ang = Math.atan2(s.vy, s.vx);
    switch (s.kind) {
      case 'orb': {
        p.dither(sx, sy, s.r + 3, s.r + 3, C.cyanEye, 0.3);
        p.ellipse(sx, sy, s.r, s.r, '#0f4a58');
        p.ellipse(sx, sy, s.r - 1, s.r - 1, C.cyanEye);
        p.px(sx - 1, sy - 1, '#ffffff');
        break;
      }
      case 'thorn': {
        const l = s.r * 2.6;
        p.line(sx - Math.cos(ang) * l * 0.5, sy - Math.sin(ang) * l * 0.5, sx + Math.cos(ang) * l * 0.5, sy + Math.sin(ang) * l * 0.5, '#07101a', 3);
        p.line(sx - Math.cos(ang) * l * 0.4, sy - Math.sin(ang) * l * 0.4, sx + Math.cos(ang) * l * 0.5, sy + Math.sin(ang) * l * 0.5, '#8fb0c0', 1);
        p.px(sx + Math.cos(ang) * l * 0.5, sy + Math.sin(ang) * l * 0.5, '#f4efe0');
        p.px(sx - Math.cos(ang) * l * 0.5, sy - Math.sin(ang) * l * 0.5, C.red);
        break;
      }
      case 'petal': {
        const k = Math.floor((s.age * 14) % 4);
        const rx = k % 2 ? 2.2 : 3.4;
        p.ellipse(sx, sy, rx, 2.6, '#1f5f88');
        p.ellipse(sx, sy, rx - 1, 1.6, '#7fd8f5');
        p.px(sx + 1, sy - 1, '#ffffff');
        break;
      }
      case 'note': {
        p.dither(sx, sy, s.r + 3, s.r + 3, '#c9b6ff', 0.3);
        p.ellipse(sx, sy, s.r - 0.5, s.r - 1, '#a78cff');
        p.line(sx + s.r - 1, sy, sx + s.r - 1, sy - 6, '#efeaff', 1);
        p.px(sx, sy - 1, '#ffffff');
        break;
      }
      case 'bone': {
        const sp = s.age * 12 + s.spin;
        const dx = Math.cos(sp) * 3;
        const dy = Math.sin(sp) * 3;
        p.line(sx - dx, sy - dy, sx + dx, sy + dy, '#e8e0c8', 2);
        p.px(sx + dx, sy + dy, '#ffffff');
        break;
      }
      case 'seed': {
        p.ellipse(sx, sy, 2.4, 2.4, '#0e5a44');
        p.px(sx - 1, sy - 1, '#8fe29a');
        p.px(sx, sy - 3 - Math.sin(t * 8) * 0.5, '#ff8aa8');
        break;
      }
      case 'spark': {
        p.rect(sx - 1, sy - 1, 3, 3, '#ffe9a0');
        p.px(sx, sy, '#ffffff');
        break;
      }
    }
  }
}
