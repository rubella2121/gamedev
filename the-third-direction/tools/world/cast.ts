import * as THREE from 'three';
import { Slicer } from '../../src/act2/kit/sdf';
import { labX } from '../../src/act2/models/x';
import { labCollector } from '../../src/act2/models/collector';
import { labMash } from '../../src/act2/models/mash';
import { labCinderfox } from '../../src/act2/models/cinderfoxLab';
import type { CastEntry, CastName } from './ctx';

/**
 * The monsters of the 3D part, built by the game's own model code and not changed: X, the Collector (with his pins, his jar and the things from his drawers), the Mash, and the Cinderfox.
 * Each lands in a group with the same layout as in the arena (the boss stands at z = -29, the middle of the platform is the origin), so a builder only has to move the group.
 */
const BUILD: Record<CastName, (sl: Slicer, g: THREE.Group) => Promise<CastEntry['api']>> = {
  x: labX,
  collector: labCollector,
  mash: labMash,
  fox: labCinderfox,
};

export async function buildCast(names: CastName[]): Promise<Partial<Record<CastName, CastEntry>>> {
  const out: Partial<Record<CastName, CastEntry>> = {};
  for (const n of names) {
    const group = new THREE.Group();
    const sl = new Slicer();
    const p = BUILD[n](sl, group);
    let done = false;
    void p.then(() => {
      done = true;
    });
    // the game builds in 8 ms slices between frames; here there is no frame to spare, so pump the queue until the model says it is done
    while (!done) {
      sl.run(40);
      await new Promise((r) => setTimeout(r, 0));
    }
    out[n] = { group, api: await p };
  }
  return out;
}
