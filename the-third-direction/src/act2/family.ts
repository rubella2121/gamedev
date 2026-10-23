import * as THREE from 'three';
import { TAU } from '../core/util';
import { animateJelly, FATHER_LOOK, makeJelly, MOTHER_LOOK, type JellyRig } from './jelly';

/**
 * Mother and Father, in 3D, and the cage the Collector keeps them in.
 *
 * The parents are jellies like the Blob (jelly.ts), only bigger: Mother rosier, with her pink bow; Father a deeper amber, with a brow. The cage is a specimen cage of brass bars, hanging on a chain from the dark above the
 * arena, shut with three locks: one for each boss (red for X, amber for The Collector, pink for The Mash). Each boss that falls breaks
 * its lock; the last one drops the cage.
 */

export type ParentRig = JellyRig;

/** a parent: Mother (rosier, with her bow) or Father (bigger, a deeper amber, a worried brow); jellies like the Blob */
export function makeParent(mother: boolean): ParentRig {
  return makeJelly(mother ? MOTHER_LOOK : FATHER_LOOK);
}

/** how a parent moves: `walk` 0..1, `reach` stretches it up (a hug, a look up), `hop` a little bounce of joy */
export function animateParent(r: ParentRig, dt: number, time: number, walk: number, reach: number, hop: number, seed: number) {
  animateJelly(r, dt, time, walk, time * 9 + seed, reach, hop, seed);
}

/** the cage: brass bars, a dome, three locks on the door, a chain into the dark */
export class Cage {
  readonly g = new THREE.Group();
  readonly cage = new THREE.Group();
  readonly door = new THREE.Group();
  readonly mother: ParentRig;
  readonly father: ParentRig;
  readonly locks: { g: THREE.Group; glow: THREE.Sprite; mat: THREE.MeshLambertMaterial; broken: boolean; t: number }[] = [];
  private chain: THREE.Mesh;
  private inner: THREE.Sprite;
  /** where it hangs (the top of the chain is far above) */
  readonly hang = new THREE.Vector3(13, 23, -44);
  /** 0 = hanging, 1 = on the floor */
  drop = 0;
  /** where it lands */
  readonly ground = new THREE.Vector3(0, 0, -4);
  private swayT = 0;
  doorOpen = 0;

  /** while true the parents fidget in the cage on their own (a cutscene turns it off to move them itself) */
  auto = true;

  constructor(glowTex: THREE.Texture = softGlow()) {
    const R = 2.9;
    const H = 3.4;
    const brass = new THREE.MeshLambertMaterial({ color: 0xc9a24a, emissive: 0x3a2a08, emissiveIntensity: 0.8 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a2a1a, emissive: 0x120a04 });
    // the floor of the cage and its rim
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.2, R + 0.35, 0.35, 24), dark);
    base.position.y = 0.17;
    this.cage.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 6, 32), brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.36;
    this.cage.add(rim);
    const top = rim.clone();
    top.position.y = H;
    this.cage.add(top);
    // bars (the four at the front are the door's)
    const barG = new THREE.CylinderGeometry(0.06, 0.06, H, 5);
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const front = Math.abs(Math.sin(a) - 1) < 0.25 && Math.cos(a) > -0.5 && Math.cos(a) < 0.5;
      const b = new THREE.Mesh(barG, brass);
      b.position.set(Math.cos(a) * R, H / 2 + 0.2, Math.sin(a) * R);
      (front ? this.door : this.cage).add(b);
    }
    // the dome: curved ribs meeting at the hook
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const u = (k / 8) * (Math.PI / 2);
        pts.push(new THREE.Vector3(Math.cos(a) * R * Math.cos(u), H + Math.sin(u) * 1.6, Math.sin(a) * R * Math.cos(u)));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.06, 4), brass);
      this.cage.add(tube);
    }
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.09, 6, 14), brass);
    hook.position.y = H + 1.9;
    this.cage.add(hook);
    // the door: a frame and three locks across it, one per boss
    const lockCols = [0xff3a4a, 0xffcf5a, 0xff8aa8];
    for (let i = 0; i < 3; i++) {
      const lg = new THREE.Group();
      lg.position.set(0, 0.9 + i * 0.95, R + 0.15);
      const mat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a, emissive: lockCols[i]!, emissiveIntensity: 0.6 });
      const bodyL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.22), mat);
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 5, 10, Math.PI), brass);
      shackle.position.y = 0.22;
      lg.add(bodyL, shackle);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: lockCols[i]!, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      glow.scale.set(1.6, 1.6, 1);
      lg.add(glow);
      this.door.add(lg);
      this.locks.push({ g: lg, glow, mat, broken: false, t: 0 });
    }
    // a band of brass across the door
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.08), brass);
    band.position.set(0, H * 0.55, R + 0.05);
    this.door.add(band);
    this.cage.add(this.door);
    // the parents inside, and a warm light around them
    this.mother = makeParent(true);
    this.father = makeParent(false);
    this.mother.g.position.set(-1.1, 0.35, 0.35);
    this.father.g.position.set(1.15, 0.35, -0.3);
    this.mother.g.rotation.y = 0.2;
    this.father.g.rotation.y = -0.2;
    this.cage.add(this.mother.g, this.father.g);
    this.inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd070, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.inner.scale.set(9, 9, 1);
    this.inner.position.y = 1.6;
    this.cage.add(this.inner);
    this.g.add(this.cage);
    // the chain up into the dark
    this.chain = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 5), new THREE.MeshLambertMaterial({ color: 0x5a5060, emissive: 0x15121a }));
    this.g.add(this.chain);
    this.reset();
  }

  reset() {
    this.drop = 0;
    this.doorOpen = 0;
    for (const l of this.locks) {
      l.broken = false;
      l.t = 0;
      l.g.visible = true;
      l.g.scale.setScalar(1);
      l.glow.material.opacity = 0.55;
    }
    this.mother.g.position.set(-1.1, 0.35, 0.35);
    this.father.g.position.set(1.15, 0.35, -0.3);
    this.mother.g.rotation.set(0, 0.2, 0);
    this.father.g.rotation.set(0, -0.2, 0);
    this.cage.add(this.mother.g, this.father.g);
    this.chain.visible = true;
  }

  /** a lock comes apart (it flares, then is gone): returns its world position for the sparks */
  breakLock(i: number): THREE.Vector3 {
    const l = this.locks[i]!;
    l.broken = true;
    l.t = 0.001;
    return l.g.getWorldPosition(new THREE.Vector3());
  }

  /** the parents step out: they leave the cage and stand in the world (so they can walk to the Blob) */
  release(world: THREE.Group) {
    for (const p of [this.mother, this.father]) {
      const wp = p.g.getWorldPosition(new THREE.Vector3());
      world.add(p.g);
      p.g.position.copy(wp);
    }
  }

  get world(): THREE.Vector3 {
    return this.cage.getWorldPosition(new THREE.Vector3());
  }

  update(dt: number, time: number, parentsMove = this.auto) {
    this.swayT += dt;
    // hanging: it sways and turns a little; falling: it drops with a turn; landed: it rocks and settles
    const d = this.drop;
    const e = d * d;
    const pos = new THREE.Vector3().lerpVectors(this.hang, this.ground, e);
    const sway = (1 - d) * Math.sin(this.swayT * 0.9) * 0.06;
    this.cage.position.copy(pos);
    this.cage.rotation.set(sway, Math.sin(this.swayT * 0.35) * 0.25 * (1 - d) + d * 0.6, Math.cos(this.swayT * 0.7) * 0.05 * (1 - d) + (d > 0 && d < 1 ? 0.25 * Math.sin(d * 9) : 0));
    // the chain runs from the hook straight up into the dark (it goes with the cage once it has snapped)
    const top = this.hang.y + 60;
    const hookY = pos.y + 3.4 + 1.9;
    if (d <= 0) {
      this.chain.visible = true;
      this.chain.position.set(pos.x, (hookY + top) / 2, pos.z);
      this.chain.scale.set(1, top - hookY, 1);
    } else this.chain.visible = false;
    // the door (its bars and what is left of the locks) lifts up out of the way, like a portcullis
    const o = this.doorOpen;
    this.door.position.set(0, o * 4.2, o * 0.3);
    // broken locks: a flare, then they fall away
    for (const l of this.locks) {
      if (l.broken && l.t > 0) {
        l.t += dt;
        l.glow.material.opacity = Math.max(0, 1.4 - l.t * 1.2);
        l.g.scale.setScalar(Math.max(0.001, 1 + l.t * 0.6 - l.t * l.t * 1.4));
        if (l.t > 1.2) l.g.visible = false;
      } else if (!l.broken) l.glow.material.opacity = 0.45 + 0.15 * Math.sin(time * 3 + l.g.position.y);
    }
    this.inner.material.opacity = 0.38 + 0.08 * Math.sin(time * 1.7);
    if (parentsMove) {
      // inside: they wait, close together, and look worried
      animateParent(this.mother, dt, time, 0, 0.15 + 0.1 * Math.sin(time * 0.8), 0, 1);
      animateParent(this.father, dt, time, 0, 0.1, 0, 2.7);
    }
  }
}

let glowT: THREE.Texture | null = null;
function softGlow(): THREE.Texture {
  if (glowT) return glowT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowT = new THREE.CanvasTexture(c);
  glowT.colorSpace = THREE.SRGBColorSpace;
  return glowT;
}
