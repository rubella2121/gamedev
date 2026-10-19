import type { Hub, Zone } from '../types';
import type { ZoneId } from '../land';
import { BonesZone } from './bones';
import { GloomZone } from './gloom';
import { MarshZone } from './marsh';
import { MeadowZone } from './meadow';
import { ThicketZone } from './thicket';

/** A placeholder zone: it does nothing but remember whether it was finished. */
class StubZone implements Zone {
  cleared = false;
  constructor(readonly id: ZoneId) {}
  reset() {
    this.cleared = false;
  }
  onRespawn() {}
  complete() {
    this.cleared = true;
  }
  update() {}
}

export function makeZones(hub: Hub): Zone[] {
  return [new GloomZone(hub), new ThicketZone(hub), new MarshZone(hub), new BonesZone(hub), new MeadowZone(hub)];
}
