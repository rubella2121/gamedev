import type * as THREE from 'three';
import type { Slicer } from '../src/act2/kit/sdf';
import { labCollector } from '../src/act2/models/collector';
import { labMash } from '../src/act2/models/mash';
import { labX } from '../src/act2/models/x';

type Builder = (slicer: Slicer, world: THREE.Group) => Promise<{ update?: (dt: number, t: number) => void; pose?: (name: string, v?: number) => void } | void>;

/** Every model the lab can show. */
export function registerModels(lab: { register: (name: string, b: Builder) => void }) {
  lab.register('x', labX);
  lab.register('collector', labCollector);
  lab.register('mash', labMash);
}
