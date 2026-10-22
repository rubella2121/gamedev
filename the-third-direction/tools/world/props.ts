import * as THREE from 'three';
import { rng } from '../../src/core/util';
import { pinGeometry } from '../../src/act2/models/collector-parts';
import { lin, mixRgb, mulRgb, tube } from './geo';
import { glowMat, std } from './shade';
import { glowPool, glowSprite } from './fx';
import { BoxBatch } from './cubes';
import { makeLantern } from './pieces';
import { makeLabel } from './wall';
import { V } from './g-common';

/** The furniture of the Pressed Garden, drawn the way the arena draws it (src/act2/features.ts), plus the things the explorable map adds: hearths, a locked gate, giant pins. */

/** a healing well: a ring of cold flowers round a pool, with a column of light (the arena's own) */
export function makeWell(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.95, 36), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), new THREE.MeshBasicMaterial({ color: 0x1b5a7a, transparent: true, opacity: 0.55, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  g.add(disc);
  const stem = std({ color: 0x0a2e30, roughness: 0.8 });
  const bulb = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, fog: false });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const f = new THREE.Group();
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 5), stem);
    st.position.y = 0.45;
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), bulb);
    bl.position.y = 1.0;
    f.add(st, bl);
    f.position.set(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7);
    g.add(f);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  shaft.position.y = 3;
  g.add(shaft);
  g.add(glowSprite(0, 1.2, 0, 4, 0x9fe8ff, 0.4));
  const l = new THREE.PointLight(0x9fe8ff, 30, 14, 1.6);
  l.position.set(0, 1.5, 0);
  g.add(l);
  return g;
}

/** a surge pad: a stone plate with an arrow; step on it and you are thrown along the ring (the arrow points the way) */
export function makePad(): THREE.Group {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 2.4), std({ color: 0x5a4a8a, roughness: 0.7, rim: { color: 0x9fe8ff, k: 0.4 } }));
  plate.position.y = 0.15;
  plate.receiveShadow = true;
  g.add(plate);
  const sh = new THREE.Shape();
  sh.moveTo(-0.5, -0.7);
  sh.lineTo(0.5, -0.7);
  sh.lineTo(0.5, 0.1);
  sh.lineTo(1.0, 0.1);
  sh.lineTo(0, 1.1);
  sh.lineTo(-1.0, 0.1);
  sh.lineTo(-0.5, 0.1);
  sh.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(sh), glowMat({ color: 0x9fe8ff, side: THREE.DoubleSide, opacity: 0.9 }));
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.y = 0.33;
  g.add(arrow);
  g.add(glowSprite(0, 0.6, 0, 4, 0x9fe8ff, 0.25));
  return g;
}

/** a light crystal: hit it and it bursts into light for you (the arena's own) */
export function makeCrystal(s = 1, seed = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed * 13 + 5);
  const b = new BoxBatch();
  for (let i = 0; i < 5; i++) {
    const h = (1.4 + r() * 1.8) * s;
    const a = r() * 6.28;
    const d = i === 0 ? 0 : 0.5 * s;
    const c = r() < 0.8 ? lin(0x7fe8ff) : lin(0xb88aff);
    b.box(Math.cos(a) * d, h / 2, Math.sin(a) * d, (0.4 + r() * 0.3) * s, h, (0.4 + r() * 0.3) * s, c, mulRgb(c, 0.7), mulRgb(c, 0.5), r() * 3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3);
  }
  g.add(new THREE.Mesh(b.geometry(), std({ vertexColors: true, roughness: 0.25, emissive: 0x2a8a9a, emissiveIntensity: 1.3, rim: { color: 0xc0f8ff, k: 0.8 } })));
  g.add(glowSprite(0, 1.2 * s, 0, 5 * s, 0x7fe8ff, 0.45));
  return g;
}

/** a hearth: a lantern post, a ring of stones and a pool of warm light. The Cinderfox does not enter it. */
export function makeHearth(): THREE.Group {
  const g = new THREE.Group();
  const lan = makeLantern(0xffb05a, 5);
  g.add(lan);
  const b = new BoxBatch();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const c = lin(0x4a3d6a);
    b.box(Math.cos(a) * 2.6, 0.3, Math.sin(a) * 2.6, 1.1, 0.6, 0.9, mulRgb(c, 1.2), mulRgb(c, 0.7), mulRgb(c, 0.5), -a);
  }
  const m = new THREE.Mesh(b.geometry(), std({ vertexColors: true, roughness: 0.85, rim: { color: 0xffb05a, k: 0.6 } }));
  m.castShadow = true;
  g.add(m);
  g.add(glowPool(0, 0, 0, 9, 0xffb05a, 0.4));
  return g;
}

/** a giant pin of the Collector's (the same shape as his), tip at the origin and the bead up +y, scaled up */
export function makePin(s = 1): THREE.Mesh {
  const m = new THREE.Mesh(pinGeometry(), std({ vertexColors: true, roughness: 0.4, metalness: 0.5, rim: { color: 0xffd890, k: 0.6 } }));
  m.scale.setScalar(s);
  m.castShadow = true;
  return m;
}

/** a gate the Collector has pinned shut: two pillars, a lintel, a door of dark boards and two giant pins crossed over it with a label */
export function makeGate(o: { w?: number; h?: number; label?: string[] } = {}): THREE.Group {
  const g = new THREE.Group();
  const w = o.w ?? 10;
  const h = o.h ?? 14;
  const stone = std({ vertexColors: true, roughness: 0.9, vary: 0.2, rim: { color: 0xa890f0, k: 0.5 } });
  const b = new BoxBatch();
  const c = lin(0x4a3d6a);
  for (const sx of [-1, 1]) for (let k = 0; k < Math.round(h / 1.05); k++) b.box(sx * (w / 2 + 0.8), 0.52 + k * 1.05, 0, 1.6 - (k % 2) * 0.1, 1.05, 1.6, mulRgb(c, k === Math.round(h / 1.05) - 1 ? 1.4 : 1.1), mulRgb(c, 0.7), mulRgb(c, 0.5));
  b.box(0, h + 0.3, 0, w + 4.2, 1.2, 1.8, mulRgb(c, 1.4), mulRgb(c, 0.8), mulRgb(c, 0.5));
  const door = lin(0x1c1430);
  for (let k = 0; k < 6; k++) b.box(-w / 2 + (k + 0.5) * (w / 6), h / 2, -0.2, w / 6 - 0.15, h, 0.5, mulRgb(door, 1.2 + (k % 2) * 0.2), mulRgb(door, 0.8), mulRgb(door, 0.5));
  const m = new THREE.Mesh(b.geometry(), stone);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  // the pins, crossed
  for (const sx of [-1, 1]) {
    const pin = makePin(h / 8);
    pin.position.set(sx * w * 0.38, h * 0.12, 0.9);
    pin.rotation.z = -sx * 1.0;
    g.add(pin);
  }
  const label = makeLabel(o.label ?? ['NOT FOR', 'REMOVAL'], 7, 3);
  label.position.set(0, h * 0.52, 1.6);
  g.add(label);
  g.add(glowSprite(0, h * 0.5, 1, w * 1.4, 0xffb05a, 0.25));
  void mixRgb;
  void tube;
  void V;
  return g;
}

/** the landing seal: the gold ring on the first tile, where the fight starts and respawns */
export function makeLandingSeal(): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 36), new THREE.MeshBasicMaterial({ color: 0xffd878, side: THREE.DoubleSide, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);
  g.add(glowPool(0, 0, 0, 3.4, 0xffd878, 0.45));
  return g;
}
