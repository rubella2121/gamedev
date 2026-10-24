import type * as THREE from 'three';
import type { Slicer } from '../src/act2/kit/sdf';
import { labCinderfox } from '../src/act2/models/cinderfoxLab';
import { labCollector } from '../src/act2/models/collector';
import { labMash } from '../src/act2/models/mash';
import { labX } from '../src/act2/models/x';
import { buildMoth3D } from '../src/act2/moth3d';

type Builder = (slicer: Slicer, world: THREE.Group) => Promise<{ update?: (dt: number, t: number) => void; pose?: (name: string, v?: number) => void } | void>;

/** Every model the lab can show. */
export function registerModels(lab: { register: (name: string, b: Builder) => void }) {
  lab.register('x', labX);
  lab.register('collector', labCollector);
  lab.register('mash', labMash);
  lab.register('cinderfox', labCinderfox);
  // the moth: poses 'flap' (0..1 through a wingbeat) and 'yaw'
  lab.register('moth', async (_s, world) => {
    const m = buildMoth3D();
    m.root.scale.setScalar(4);
    m.root.position.y = 2;
    world.add(m.root);
    const flap = (u: number) => {
      for (const w of m.wings) {
        const f = Math.sin(u * Math.PI * 2 - (w.hind ? 0.6 : 0));
        w.pivot.rotation.z = w.side * ((w.hind ? 0.1 : 0.25) + 0.62 * (w.hind ? 0.75 : 1) * f);
      }
    };
    flap(0.25);
    return {
      pose(name: string, v = 1) {
        if (name === 'flap') flap(v);
        else if (name === 'yaw') m.root.rotation.y = v;
      },
    };
  });
}
