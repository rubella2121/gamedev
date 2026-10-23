import * as THREE from 'three';
import { TAU } from '../../core/util';

/**
 * The little monsters of the map, drawn the way the forest draws them:
 *   gloomling  a lump of dark with two cyan eyes (Gloom Hollow). It creeps after you in the dark and comes apart in light.
 *   skitter    a small thing of bone on six legs (Bone Wastes). Fast, and it never runs in a straight line.
 * One strike, one lance or a nova kills either, and each gives a little light, like the minions of the bosses.
 */

export type Kind = 'gloom' | 'skitter';

export interface Creature {
  kind: Kind;
  g: THREE.Group;
  alive: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** seconds alive */
  t: number;
  /** 0..1, how far it has come out of the dark (spawning) or gone back into it (dying) */
  fade: number;
  dying: boolean;
  /** a skitter's zig-zag */
  wig: number;
  /** after a bite it backs off for a moment */
  cool: number;
  legs: THREE.Mesh[];
  eyes: THREE.Mesh[];
  body: THREE.Mesh;
  mats: THREE.Material[];
}

const gloomBody = new THREE.SphereGeometry(0.75, 12, 9);
const eyeGeo = new THREE.BoxGeometry(0.16, 0.12, 0.06);
const legGeo = new THREE.BoxGeometry(0.08, 0.08, 0.7);

function makeGloom(): Creature {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x140c26, emissive: 0x0a0418, transparent: true, opacity: 1 });
  const body = new THREE.Mesh(gloomBody, mat);
  body.scale.set(1, 0.78, 1);
  body.position.y = 0.6;
  g.add(body);
  // a wisp of a tail and two small horns of dark
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 6), mat);
  tail.rotation.x = -Math.PI / 2.4;
  tail.position.set(0, 0.55, -0.75);
  g.add(tail);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9ff4ee, transparent: true, opacity: 1, fog: false });
  const eyes: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(sx * 0.24, 0.78, 0.66);
    e.rotation.z = sx * -0.25;
    g.add(e);
    eyes.push(e);
  }
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.05;
  g.add(shadow);
  g.visible = false;
  return { kind: 'gloom', g, alive: false, x: 0, z: 0, vx: 0, vz: 0, t: 0, fade: 0, dying: false, wig: 0, cool: 0, legs: [], eyes, body, mats: [mat, eyeMat, shadow.material as THREE.Material] };
}

function makeSkitter(): Creature {
  const g = new THREE.Group();
  const bone = new THREE.MeshLambertMaterial({ color: 0xe8e0c8, emissive: 0x2a2418, transparent: true, opacity: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.38, 0.95), bone);
  body.position.y = 0.55;
  g.add(body);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.42), bone);
  skull.position.set(0, 0.62, 0.62);
  g.add(skull);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, opacity: 1, fog: false });
  const eyes: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.scale.set(0.7, 0.9, 1);
    e.position.set(sx * 0.12, 0.66, 0.85);
    g.add(e);
    eyes.push(e);
  }
  const legs: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const k = i % 3;
    const l = new THREE.Mesh(legGeo, bone);
    l.position.set(side * 0.55, 0.38, (k - 1) * 0.36);
    l.rotation.y = side * (Math.PI / 2 - (k - 1) * 0.5);
    l.rotation.x = 0.5;
    g.add(l);
    legs.push(l);
  }
  g.visible = false;
  return { kind: 'skitter', g, alive: false, x: 0, z: 0, vx: 0, vz: 0, t: 0, fade: 0, dying: false, wig: Math.random() * TAU, cool: 0, legs, eyes, body, mats: [bone, eyeMat] };
}

export class Swarm {
  readonly all: Creature[] = [];

  constructor(parent: THREE.Group, gloom: number, skitter: number) {
    for (let i = 0; i < gloom; i++) this.all.push(makeGloom());
    for (let i = 0; i < skitter; i++) this.all.push(makeSkitter());
    for (const c of this.all) parent.add(c.g);
  }

  count(kind: Kind): number {
    return this.all.filter((c) => c.alive && c.kind === kind && !c.dying).length;
  }

  spawn(kind: Kind, x: number, z: number): Creature | null {
    const c = this.all.find((q) => !q.alive && q.kind === kind);
    if (!c) return null;
    c.alive = true;
    c.dying = false;
    c.x = x;
    c.z = z;
    c.vx = c.vz = 0;
    c.t = 0;
    c.fade = 0;
    c.cool = 0.8;
    c.g.visible = true;
    c.g.position.set(x, 0, z);
    this.paint(c);
    return c;
  }

  /** start to come apart (light, a hit); it is gone a moment later */
  kill(c: Creature) {
    if (!c.alive || c.dying) return;
    c.dying = true;
  }

  clear(kind?: Kind) {
    for (const c of this.all) {
      if (kind && c.kind !== kind) continue;
      c.alive = false;
      c.dying = false;
      c.g.visible = false;
    }
  }

  /** dissolve every one of a kind (the lanterns are lit, the bones are home) */
  dissolve(kind: Kind) {
    for (const c of this.all) if (c.kind === kind && c.alive) c.dying = true;
  }

  private paint(c: Creature) {
    const o = Math.max(0, Math.min(1, c.fade));
    for (const m of c.mats) (m as THREE.MeshBasicMaterial).opacity = c.kind === 'gloom' && m === c.mats[2] ? 0.45 * o : o;
  }

  /** move the bodies: how they look while they live (where they go is decided by the map) */
  animate(dt: number, time: number) {
    for (const c of this.all) {
      if (!c.alive) continue;
      c.t += dt;
      if (c.dying) {
        c.fade -= dt * 2.6;
        if (c.fade <= 0) {
          c.alive = false;
          c.g.visible = false;
          continue;
        }
      } else c.fade = Math.min(1, c.fade + dt * 1.6);
      this.paint(c);
      c.g.position.set(c.x, 0, c.z);
      const sp = Math.hypot(c.vx, c.vz);
      if (sp > 0.2) {
        const yaw = Math.atan2(c.vx, c.vz);
        let d = yaw - c.g.rotation.y;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        c.g.rotation.y += d * Math.min(1, dt * 10);
      }
      if (c.kind === 'gloom') {
        // it breathes, and stretches when it hurries
        const b = 1 + Math.sin(time * 5 + c.wig) * 0.06;
        c.body.scale.set(b, 0.78 / b + sp * 0.02, b + sp * 0.04);
        c.g.position.y = Math.sin(time * 3 + c.wig) * 0.06;
        // dying: it sinks into the floor and smears
        if (c.dying) c.g.scale.set(1 + (1 - c.fade) * 0.8, c.fade, 1 + (1 - c.fade) * 0.8);
        else c.g.scale.setScalar(0.5 + 0.5 * c.fade);
        // eyes blink now and then
        const blink = Math.sin(time * 1.3 + c.wig * 3) > 0.97 ? 0.1 : 1;
        for (const e of c.eyes) e.scale.y = blink;
      } else {
        // legs scurry
        c.legs.forEach((l, i) => (l.rotation.x = 0.5 + Math.sin(time * 22 + i * 1.7) * 0.45 * Math.min(1, sp / 3)));
        c.g.position.y = Math.abs(Math.sin(time * 18 + c.wig)) * 0.08 * Math.min(1, sp / 3);
        if (c.dying) c.g.scale.setScalar(Math.max(0.01, c.fade));
        else c.g.scale.setScalar(0.4 + 0.6 * c.fade);
      }
    }
  }
}
