import * as THREE from 'three';
import type { Arena } from './arena';
import { halo } from './kit/skin';

/**
 * What the arena gives you, so a long fight is a fight and not a wall of luck:
 *   wells     a ring of cold flowers: stand in one to heal a heart and gather light. They wilt, then grow back.
 *   pads      stone plates with an arrow: step on one and you are thrown along the ring, untouchable for a moment.
 *   crystals  hit one with a strike, a lance or a nova and it bursts into light for you. They grow back.
 */

export interface FeatureEnv {
  /** the player */
  p: { x: number; z: number; dead: boolean };
  hearts: number;
  maxHearts: number;
  light: number;
  heal(n: number): void;
  addLight(n: number): void;
  /** fling the player along (dx, dz) for `dist` units, untouchable while it lasts */
  launch(dx: number, dz: number, dist: number): void;
  sfx: { warm(): void; chime(): void; dash(): void; click(): void };
}

interface Well {
  x: number;
  z: number;
  /** 0 = wilted, 1 = ready */
  ready: number;
  g: THREE.Group;
  flowers: THREE.Group[];
  shaft: THREE.Mesh;
  glow: THREE.Sprite;
}
interface Pad {
  x: number;
  z: number;
  dx: number;
  dz: number;
  cd: number;
  arrow: THREE.Mesh;
  g: THREE.Group;
}
interface Crystal {
  x: number;
  z: number;
  /** 0 = gone, 1 = whole */
  grow: number;
  t: number;
  g: THREE.Group;
  body: THREE.Mesh;
  glow: THREE.Sprite;
}

const WELL_R = 14.5;
const PAD_R = 9.5;

export class Features {
  readonly wells: Well[] = [];
  readonly pads: Pad[] = [];
  readonly crystals: Crystal[] = [];
  private root = new THREE.Group();
  private padLock = 0;
  private time = 0;

  constructor(private arena: Arena) {
    arena.world.add(this.root);
    // wells: two on the near half, one out on the far left (a trip with a price)
    // (the middle of the far edge is left empty: that is where the boss stands, and a column of light would hide its body)
    for (const a of [(30 * Math.PI) / 180, (150 * Math.PI) / 180, (213 * Math.PI) / 180]) this.addWell(Math.cos(a) * WELL_R, Math.sin(a) * WELL_R);
    // pads: four on the middle ring, each throws you clockwise along it
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const x = Math.cos(a) * PAD_R;
      const z = Math.sin(a) * PAD_R;
      // clockwise seen from above (+x to +z to -x ...) is the tangent (-sin, cos)
      this.addPad(x, z, -Math.sin(a), Math.cos(a));
    }
    for (const [x, z] of [
      [11.3, 11.3],
      [-11.3, 11.3],
      [11.3, -11.3],
      [-11.3, -11.3],
    ] as [number, number][])
      this.addCrystal(x, z);
    this.root.visible = false;
  }

  show(on: boolean) {
    this.root.visible = on;
  }

  reset() {
    for (const w of this.wells) w.ready = 1;
    for (const p of this.pads) p.cd = 0;
    for (const c of this.crystals) {
      c.grow = 1;
      c.t = 0;
    }
    this.padLock = 0;
  }

  /** Fill the wells and crystals again (a new phase begins). */
  refresh() {
    for (const w of this.wells) w.ready = Math.max(w.ready, 0.999);
    for (const c of this.crystals) if (c.grow < 1) c.grow = Math.max(c.grow, 0.6);
  }

  /* ---------------------------------------------------------------- */

  private addWell(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.95, 36), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), new THREE.MeshBasicMaterial({ color: 0x1b5a7a, transparent: true, opacity: 0.55, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    g.add(disc);
    const stem = new THREE.MeshLambertMaterial({ color: 0x0a2e30 });
    const bulb = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, fog: false });
    const flowers: THREE.Group[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const f = new THREE.Group();
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 5), stem);
      st.position.y = 0.45;
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), bulb);
      bl.position.y = 1.0;
      f.add(st, bl);
      f.position.set(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7);
      flowers.push(f);
      g.add(f);
    }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    shaft.position.y = 3;
    g.add(shaft);
    const glow = halo(0x9fe8ff, 5.5, 0.5);
    glow.position.y = 1.1;
    g.add(glow);
    this.root.add(g);
    this.wells.push({ x, z, ready: 1, g, flowers, shaft, glow });
  }

  private addPad(x: number, z: number, dx: number, dz: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(dx, dz);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 2.6), new THREE.MeshLambertMaterial({ color: 0x2a2048 }));
    plate.position.y = 0.04;
    g.add(plate);
    const rim = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.6, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, fog: false }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.14;
    g.add(rim);
    // two chevrons pointing along the throw (+z in the pad's own space)
    const sh = new THREE.Shape();
    sh.moveTo(0, 0.7);
    sh.lineTo(0.7, -0.05);
    sh.lineTo(0.4, -0.05);
    sh.lineTo(0, 0.35);
    sh.lineTo(-0.4, -0.05);
    sh.lineTo(-0.7, -0.05);
    sh.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0x6fe8ff, side: THREE.DoubleSide, fog: false }));
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.15, -0.35);
    g.add(arrow);
    const arrow2 = arrow.clone();
    arrow2.position.z = 0.4;
    g.add(arrow2);
    this.root.add(g);
    this.pads.push({ x, z, dx, dz, cd: 0, arrow, g });
  }

  private addCrystal(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const geo = new THREE.OctahedronGeometry(0.7, 0);
    geo.scale(0.8, 1.6, 0.8);
    const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xb8fff6, fog: false }));
    body.position.y = 1.6;
    g.add(body);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff }));
    edge.position.y = 1.6;
    g.add(edge);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x3a2a62 }));
    base.position.y = 0.2;
    g.add(base);
    const glow = halo(0x7ff4ee, 4, 0.55);
    glow.position.y = 1.6;
    g.add(glow);
    this.root.add(g);
    this.crystals.push({ x, z, grow: 1, t: 0, g, body, glow });
  }

  /* ---------------------------------------------------------------- */

  /** Light has reached (x, z) with a reach of r (a strike, a lance, a nova). Returns true if it shattered a crystal. */
  hit(x: number, z: number, r: number, env: FeatureEnv): boolean {
    let any = false;
    for (const c of this.crystals) {
      if (c.grow < 1) continue;
      if (Math.hypot(c.x - x, c.z - z) > r + 0.7) continue;
      c.grow = 0;
      c.t = 0;
      any = true;
      env.addLight(1);
      env.sfx.chime();
      this.arena.burst3(c.x, 1.6, c.z, 16, [0xb8fff6, 0xffffff, 0x7ff4ee], 7);
    }
    return any;
  }

  update(dt: number, env: FeatureEnv) {
    this.time += dt;
    this.padLock = Math.max(0, this.padLock - dt);
    const p = env.p;
    for (const w of this.wells) {
      if (w.ready < 1) w.ready = Math.min(1, w.ready + dt / 24);
      const on = !p.dead && w.ready >= 1 && Math.hypot(p.x - w.x, p.z - w.z) < 1.9;
      if (on && (env.hearts < env.maxHearts || env.light < 3)) {
        w.ready = 0;
        if (env.hearts < env.maxHearts) env.heal(1);
        env.addLight(1.5);
        env.sfx.warm();
        this.arena.burst3(w.x, 1.2, w.z, 18, [0x9fe8ff, 0xffffff, 0x7fd8f5], 5);
      }
      const k = 0.18 + 0.82 * w.ready;
      w.flowers.forEach((f, i) => f.scale.setScalar(Math.max(0.15, k + Math.sin(this.time * 2 + i) * 0.03 * w.ready)));
      (w.shaft.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.13 * w.ready;
      w.glow.material.opacity = 0.12 + 0.4 * w.ready + 0.06 * Math.sin(this.time * 3);
    }
    for (const pad of this.pads) {
      pad.cd = Math.max(0, pad.cd - dt);
      const near = !p.dead && Math.hypot(p.x - pad.x, p.z - pad.z) < 1.35;
      if (near && pad.cd <= 0 && this.padLock <= 0) {
        pad.cd = 1.4;
        this.padLock = 0.7;
        env.launch(pad.dx, pad.dz, 8.5);
        env.sfx.dash();
        this.arena.burst3(pad.x, 0.4, pad.z, 10, [0x6fe8ff, 0xffffff], 6);
      }
      const hot = pad.cd > 0 ? 0.25 : 0.75 + 0.25 * Math.sin(this.time * 4);
      (pad.arrow.material as THREE.MeshBasicMaterial).color.setRGB(0.3 * hot, 0.9 * hot, 1 * hot);
    }
    for (const c of this.crystals) {
      if (c.grow < 1) {
        c.t += dt;
        if (c.t > 14) c.grow = Math.min(1, c.grow + dt * 1.2);
      }
      c.g.visible = c.grow > 0.02;
      const s = Math.max(0.001, c.grow);
      c.body.scale.setScalar(s);
      c.body.rotation.y = this.time * 0.8;
      c.body.position.y = 1.6 + Math.sin(this.time * 1.6 + c.x) * 0.12;
      c.glow.position.y = c.body.position.y;
      c.glow.material.opacity = 0.55 * s;
    }
  }
}
