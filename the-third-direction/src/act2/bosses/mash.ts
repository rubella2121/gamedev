import * as THREE from 'three';
import { Boss3D, type Danger, type Env, type Weak } from '../fight';
import type { Slicer } from '../kit/sdf';

/** PLACEHOLDER: the real Mash replaces this file. It just stands in so the sequence can be tested. */
export class MashBoss extends Boss3D {
  protected introLen = 1;
  protected dyingLen = 1;
  private built = true;

  constructor(env: Env, _world: THREE.Group, onVictory: () => void) {
    super(env, 'mash', 'The Mash', 'every guardian, stitched back together', '#ff8aa8', [2, 2, 2], onVictory);
  }

  ready() {
    return this.built;
  }

  build(_slicer: Slicer) {
    return Promise.resolve();
  }

  show() {}
  hide() {}
  protected onBegin() {}
  protected updateIntro() {}
  protected startPhase() {}
  protected restartPhase() {}
  protected updateFight() {
    if (this.pt > 1) this.damage(1, 0, 3, -20);
  }
  protected onDie() {}
  protected updateDying() {}
  protected animate() {}
  weak(): Weak[] {
    return [];
  }
  dangers(): Danger[] {
    return [];
  }
}
