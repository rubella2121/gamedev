import * as THREE from 'three';
import type { Slicer } from '../kit/sdf';
import { CinderfoxModel, POSES, STAND, type FoxPose } from './cinderfox';
import { FoxFx, FX_KINDS, type FxKind } from './cinderfoxFx';

/**
 * For the model lab: `__lab.pose(name, value)` sets one thing, `__lab.pose('preset', n)` a whole pose, `__lab.pose('fx', n)` shows
 * one trick (1 toll, 2 veil, 3 charge, 4 lure, 5 sweep; 0 none) and `__lab.pose('fxphase', 0..1)` how far into it we are.
 * `glow` 0 turns off the light it throws (for silhouettes), `yaw` turns the fox and its tricks, `dash` moves the fox along the way it faces while the tricks stay where it began.
 */
export async function labCinderfox(slicer: Slicer, world: THREE.Group) {
  const fox = new CinderfoxModel();
  const fx = new FoxFx();
  fx.tips = fox.tips;
  world.add(fox.root, fx.root);
  await fox.build(slicer);
  let kind: FxKind | null = null;
  let phase = 0.5;
  const PRESETS = [POSES.stand, POSES.coil, POSES.leap, POSES.toll, POSES.veil, POSES.lure, POSES.sweep, POSES.stalk];
  return {
    update: (dt: number, t: number) => {
      fox.update(dt, t);
      fx.update(t);
    },
    pose(name: string, v = 1) {
      if (name === 'preset') fox.apply({ ...STAND, ...PRESETS[v] });
      else if (name === 'active') fox.apply({ active: v });
      else if (name === 'fx') fx.show((kind = v > 0 ? FX_KINDS[v - 1]! : null), phase);
      else if (name === 'fxphase') fx.show(kind, (phase = v));
      else if (name === 'glow') fox.setLights(v > 0);
      else if (name === 'yaw') fox.root.rotation.y = fx.root.rotation.y = v;
      else if (name === 'dash') fox.root.position.set(Math.sin(fox.root.rotation.y) * v, 0, Math.cos(fox.root.rotation.y) * v);
      else fox.apply({ [name]: v } as Partial<FoxPose>);
    },
  };
}
