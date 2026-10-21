import * as THREE from 'three';
import { TubeChain } from '../kit/chain';
import { rgb, scale, type RGB } from '../kit/noise';
import { glow, halo, skin } from '../kit/skin';
import { TAILS } from './cinderfox';

/**
 * The five tricks of the Cinderfox as pictures: the telegraph on the ground and the thing in the air. CONCEPT: nothing in the game
 * plays these yet (see docs/CINDERFOX.md); they exist so the reference sheet shows the real look, and so the first implementation
 * has a starting point. Everything here lives in the fox's own frame: it stands at the origin and faces +z, the way it hunts.
 */

export type FxKind = 'toll' | 'veil' | 'charge' | 'lure' | 'sweep';
/** same order as TAILS: the tail that blazes is the trick that comes */
export const FX_KINDS: FxKind[] = ['toll', 'veil', 'charge', 'lure', 'sweep'];

const D2R = Math.PI / 180;

/* ---------------------------------------------------------------- */
/* textures                                                          */
/* ---------------------------------------------------------------- */

const texCache = new Map<string, THREE.CanvasTexture>();
function tex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
}

/** a round puff: solid in the middle, fading to nothing */
const softTex = () =>
  tex('soft', 128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  });

/** a lump of smoke: a handful of soft circles piled up, so each puff has its own billows */
const puffTex = () =>
  tex('puff', 256, 256, (g) => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 18; i++) {
      const a = rnd() * 6.283;
      const d = rnd() * 60;
      const x = 128 + Math.cos(a) * d;
      const y = 128 + Math.sin(a) * d;
      const R = 32 + rnd() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, R);
      grd.addColorStop(0, 'rgba(255,255,255,0.6)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.32)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
  });

/** one tongue of flame, fat at the foot and drawn out to a point; sprites that use it stand on their feet (centre 0.5, 0.04) */
const flameTex = () =>
  tex('flame', 64, 128, (g) => {
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 7;
    const grd = g.createLinearGradient(0, 124, 0, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(32, 122);
    g.bezierCurveTo(10, 120, 8, 92, 19, 70);
    g.bezierCurveTo(26, 56, 22, 34, 31, 6);
    g.bezierCurveTo(35, 30, 44, 42, 45, 72);
    g.bezierCurveTo(54, 98, 52, 120, 32, 122);
    g.fill();
  });

const flame = (color: number, opacity: number) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.center.set(0.5, 0.04);
  return s;
};

/** a ring that is bright on its outer edge and trails off inward (the ring is a RingGeometry with an inner radius of 0.86) */
const ringTex = () =>
  tex('ring', 256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0.86 * 128, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    grd.addColorStop(0.9, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });

/** the lane of the charge: bright edges and chevrons that point the way it will run (far end at the top) */
const laneTex = () =>
  tex('lane', 64, 256, (g) => {
    const side = g.createLinearGradient(0, 0, 64, 0);
    side.addColorStop(0, 'rgba(255,255,255,0.95)');
    side.addColorStop(0.1, 'rgba(255,255,255,0.35)');
    side.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    side.addColorStop(0.9, 'rgba(255,255,255,0.35)');
    side.addColorStop(1, 'rgba(255,255,255,0.95)');
    g.fillStyle = side;
    g.fillRect(0, 0, 64, 256);
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 5;
    g.lineJoin = 'miter';
    for (let y = 18; y < 256; y += 42) {
      g.beginPath();
      g.moveTo(10, y + 16);
      g.lineTo(32, y);
      g.lineTo(54, y + 16);
      g.stroke();
    }
  });

/** the floor of the sweep: faint near the fox, bright along the far edge, where the needles fly */
const sectorTex = () =>
  tex('sector', 256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0.05)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    grd.addColorStop(0.9, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.97, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
  });

const additive = (o: THREE.MeshBasicMaterialParameters) =>
  new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, ...o });

/** a flat piece of ground: x across, z along, centred on the origin, texture running from -z (bottom) to +z (top) */
function ground(w: number, l: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.PI);
  return g;
}

/* ---------------------------------------------------------------- */
/* a stand-in for the player                                         */
/* ---------------------------------------------------------------- */

/** A gold egg with eyes, 1.8 tall like the Blob, so the pictures have a scale. It faces +z. */
export function blobStandIn(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), skin({ color: 0xfff0b0, emissive: 0xc89a30, rim: 0x7fe8ff, rimPower: 2.4 }));
  body.scale.set(0.8, 0.9, 0.8);
  body.position.y = 0.95;
  g.add(body);
  // the belly lantern
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff1a6 }));
  belly.scale.set(0.42, 0.36, 0.12);
  belly.position.set(0, 0.62, 0.68);
  g.add(belly);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.scale.set(0.15, 0.2, 0.1);
    eye.position.set(sx * 0.3, 1.08, 0.7);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3a1020 }));
    pupil.scale.set(0.58, 0.72, 0.4);
    pupil.position.set(0, -0.04, 0.6);
    eye.add(pupil);
    g.add(eye);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin({ color: 0xe6b84a, emissive: 0x5a3a0a }));
    foot.scale.set(0.26, 0.12, 0.34);
    foot.position.set(sx * 0.34, 0.1, 0.12);
    g.add(foot);
  }
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a6 }));
  tuft.position.set(0, 2.1, 0);
  tuft.rotation.z = 0.2;
  g.add(tuft);
  const h = halo(0xffe08a, 4.2, 0.35);
  h.position.y = 1.1;
  g.add(h);
  return g;
}

/* ---------------------------------------------------------------- */
/* the effects                                                       */
/* ---------------------------------------------------------------- */

export class FoxFx {
  readonly root = new THREE.Group();
  /** the player stand-in, put where the trick is aimed */
  readonly blob = blobStandIn();
  private kind: FxKind | null = null;
  private phase = 0;
  private time = 0;

  // toll
  private rings: { mesh: THREE.Mesh; sparks: THREE.Sprite[]; tongues: THREE.Sprite[] }[] = [];
  // veil
  private smoke: { s: THREE.Sprite; a: number; r: number; y: number; k: number; sp: number }[] = [];
  private smokeGlow: THREE.Sprite[] = [];
  // charge
  private lane!: THREE.Mesh;
  private target!: THREE.Mesh;
  private flames: { outer: THREE.Sprite; core: THREE.Sprite; h: THREE.Sprite; z: number; x: number; k: number }[] = [];
  // lure
  private wisps: { grp: THREE.Group; flame: THREE.Mesh; thread: TubeChain; base: THREE.Vector3; ph: number }[] = [];
  // sweep
  private sector!: THREE.Mesh;
  private needles: THREE.Mesh[] = [];
  private ash: { s: THREE.Sprite; a: number; r: number; y: number; k: number }[] = [];

  /** where the tails end (the lure's threads are tied to the pink one); the model fills this in */
  tips: THREE.Vector3[] = TAILS.map(() => new THREE.Vector3(0, 4, -3.5));

  constructor() {
    this.root.add(this.blob);
    this.blob.visible = false;
    this.buildToll();
    this.buildVeil();
    this.buildCharge();
    this.buildLure();
    this.buildSweep();
    this.hide();
  }

  /* ---- toll: three rings of fire, each with a gap, the gaps turning ---- */
  private buildToll() {
    const hue = TAILS[0].hue;
    for (let i = 0; i < 3; i++) {
      // the gap is 62 degrees wide, centred on a direction that turns 36 degrees with every toll
      const gapC = 90 * D2R + (i - 1) * 36 * D2R;
      const gap = 62 * D2R;
      const geo = new THREE.RingGeometry(0.86, 1, 160, 1, -gapC + gap / 2, Math.PI * 2 - gap);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, additive({ map: ringTex(), color: new THREE.Color(hue).multiplyScalar(1.7) }));
      const sparks: THREE.Sprite[] = [];
      for (let k = 0; k < 14; k++) {
        const s = halo(hue, 0.5, 0.85);
        sparks.push(s);
        this.root.add(s);
      }
      const tongues: THREE.Sprite[] = [];
      for (let k = 0; k < 30; k++) {
        const t = flame(hue, 0.8);
        tongues.push(t);
        this.root.add(t);
      }
      this.root.add(mesh);
      this.rings.push({ mesh, sparks, tongues });
    }
  }

  private layoutToll() {
    const phase = this.phase;
    this.rings.forEach((r, i) => {
      // ring i is born at i * 0.2 and grows for the rest of the trick
      const age = phase - i * 0.2;
      const on = age > 0;
      r.mesh.visible = on;
      r.sparks.forEach((s) => (s.visible = on));
      r.tongues.forEach((t) => (t.visible = on));
      if (!on) return;
      const R = 1.8 + age * 15;
      const fade = Math.max(0, 1 - R / 13);
      const gapC = 90 * D2R + (i - 1) * 36 * D2R;
      const gap = 62 * D2R;
      r.mesh.scale.setScalar(R);
      r.mesh.position.y = 0.04;
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * fade + 0.05;
      r.sparks.forEach((s, k) => {
        const a = gapC + gap / 2 + ((k + 0.5) / r.sparks.length) * (Math.PI * 2 - gap);
        const wob = Math.sin(this.time * 6 + k * 2.1 + i) * 0.5;
        s.position.set(Math.cos(a) * R * 0.99, 0.35 + wob * 0.18 + (k % 3) * 0.12, Math.sin(a) * R * 0.99);
        s.scale.setScalar(0.5 + (k % 4) * 0.12);
        (s.material as THREE.SpriteMaterial).opacity = 0.85 * fade;
      });
      // a low fire licks along the ring, lower as it spreads and thins
      r.tongues.forEach((tg, k) => {
        const a = gapC + gap / 2 + ((k + 0.5) / r.tongues.length) * (Math.PI * 2 - gap);
        const lick = 0.6 + 0.4 * Math.abs(Math.sin(this.time * 7 + k * 1.9 + i * 2.3));
        const hgt = (0.9 + 1.5 * fade) * lick * (0.7 + 0.5 * Math.abs(Math.sin(k * 12.9898)));
        tg.position.set(Math.cos(a) * R * 0.97, 0.02, Math.sin(a) * R * 0.97);
        tg.scale.set(hgt * 0.55 + 0.3, hgt, 1);
        (tg.material as THREE.SpriteMaterial).opacity = 0.9 * fade + 0.1;
      });
    });
  }

  /* ---- veil: a cloud the fox is hidden in, only the eyes and the tail-light show ---- */
  private buildVeil() {
    const mat = (c: number, o: number) => new THREE.SpriteMaterial({ map: puffTex(), color: c, transparent: true, opacity: o, depthWrite: false, fog: false });
    for (let i = 0; i < 46; i++) {
      const low = i % 3 === 0;
      const warm = i % 2 === 0;
      const s = new THREE.Sprite(mat(low ? 0x3a3444 : warm ? 0x544848 : 0x3e4660, low ? 0.55 : 0.94));
      this.root.add(s);
      this.smoke.push({ s, a: i * 2.399, r: low ? 3 + (i % 5) * 0.9 : 0.3 + ((i * 37) % 100) / 50, y: low ? 0.5 : 0.4 + ((i * 53) % 100) / 38, k: low ? 3.4 + (i % 4) * 0.5 : 2.4 + ((i * 17) % 10) / 6, sp: 0.1 + (i % 7) * 0.02 });
    }
    // a little of the gloom tail's light caught inside the cloud
    for (let i = 0; i < 4; i++) {
      const h = halo(i % 2 ? TAILS[1].hue : 0xff7a2a, 4.2, 0.34);
      this.smokeGlow.push(h);
      this.root.add(h);
    }
  }

  private layoutVeil() {
    const k = Math.min(1, this.phase * 1.6);
    this.smoke.forEach((m, i) => {
      const a = m.a + this.time * m.sp;
      const spread = 0.4 + 0.6 * k;
      // the cloud sits on the body and behind it, and leaves the head and the tails clear
      const x = Math.cos(a) * m.r * spread;
      const z = 0.5 + Math.sin(a) * m.r * spread * 0.95;
      const hidden = z > 1.3 && m.y > 2.4;
      const size = m.k * (0.5 + 0.5 * k);
      // keep every puff off the floor, or the floor slices it
      m.s.position.set(x, Math.max(m.y * (0.6 + 0.4 * k), size * 0.5 - 0.3), hidden ? z - 1.8 : z);
      m.s.scale.setScalar(size);
      m.s.visible = true;
      void i;
    });
    this.smokeGlow.forEach((h, i) => {
      h.position.set(-1 + i * 0.7, 2.4 + (i % 2) * 0.5, -1.4 + (i % 3) * 0.5);
      h.visible = true;
    });
  }

  /* ---- charge: the lane it will run along, and the fire it leaves behind ---- */
  private buildCharge() {
    const lt = laneTex();
    lt.wrapT = THREE.RepeatWrapping;
    this.lane = new THREE.Mesh(ground(3.2, 15), additive({ map: lt, color: new THREE.Color(TAILS[2].hue).multiplyScalar(1.3) }));
    this.lane.position.set(0, 0.05, 9.5);
    this.root.add(this.lane);
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), additive({ map: ringTex(), color: 0xffd08a }));
    this.target.geometry.rotateX(-Math.PI / 2);
    this.target.position.set(0, 0.06, 15);
    this.target.scale.setScalar(2.2);
    this.root.add(this.target);
    for (let i = 0; i < 40; i++) {
      const outer = flame(0xff6a1a, 0.9);
      const core = flame(0xffd27a, 0.95);
      const h = halo(0xff8a2a, 1.8, 0.45);
      this.root.add(outer, core, h);
      this.flames.push({ outer, core, h, z: 0, x: 0, k: 0.7 + ((i * 29) % 10) / 14 });
    }
  }

  private layoutCharge() {
    // phase 0 is the telegraph (only the lane), phase 1 is the end of the run: the fire stretches from where it began to where it is
    const run = Math.max(0, Math.min(1, this.phase));
    const reach = 2 + run * 11;
    this.flames.forEach((f, i) => {
      const u = i / (this.flames.length - 1);
      f.z = 1.5 + u * (reach - 1.5);
      f.x = Math.sin(i * 12.9898) * 0.95;
      const on = run > 0.02;
      f.outer.visible = f.core.visible = f.h.visible = on;
    });
    (this.lane.material as THREE.MeshBasicMaterial).opacity = 0.85;
  }

  /* ---- lure: three wisps that float ahead, tied to the pink tail with a thread ---- */
  private buildLure() {
    const hue = TAILS[3].hue;
    const spots: [number, number, number][] = [
      [-3.4, 1.9, 6.4],
      [0.6, 2.5, 8.6],
      [3.6, 1.7, 6.0],
    ];
    spots.forEach((p, i) => {
      const grp = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), glow(0xfff0f4));
      core.scale.setScalar(0.22);
      grp.add(core);
      const h = halo(hue, 2.4, 0.8);
      grp.add(h);
      const h2 = halo(0xffffff, 0.9, 0.7);
      grp.add(h2);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 8), additive({ color: hue, opacity: 0.7 }));
      flame.position.y = 0.45;
      grp.add(flame);
      const thread = new TubeChain(18, 4, additive({ vertexColors: true, opacity: 0.8 }), (u) => 0.035 * (1 - 0.5 * u), (u): RGB => scale(rgb(hue), 0.25 + 0.5 * (1 - u)));
      this.root.add(grp, thread.mesh);
      this.wisps.push({ grp, flame, thread, base: new THREE.Vector3(...p), ph: i * 2.1 });
    });
  }

  private layoutLure() {
    const tip = this.tips[3]!;
    this.wisps.forEach((w, i) => {
      const bob = Math.sin(this.time * 1.6 + w.ph) * 0.18;
      const drift = this.phase * 1.2;
      w.grp.position.set(w.base.x * (1 + 0.1 * drift), w.base.y + bob, w.base.z + drift);
      w.flame.scale.set(1, 0.9 + 0.25 * Math.sin(this.time * 9 + w.ph), 1);
      const A = tip;
      const B = w.grp.position;
      // the thread sags, and sways a little
      w.thread.pts.forEach((p, k) => {
        const u = k / (w.thread.pts.length - 1);
        p.lerpVectors(A, B, u);
        p.y += Math.sin(u * Math.PI) * 1.8 + Math.sin(u * 5 + this.time * 2 + i) * 0.06;
        p.x += Math.sin(u * 3 + i) * 0.35 * Math.sin(u * Math.PI);
      });
      w.thread.update();
    });
  }

  /* ---- sweep: a fan of ash in front of the swung tail, and bone needles at its far edge ---- */
  private buildSweep() {
    const hue = TAILS[4].hue;
    const R = 8;
    const g = new THREE.CircleGeometry(R, 72, -75 * D2R, 150 * D2R);
    g.rotateX(-Math.PI / 2);
    this.sector = new THREE.Mesh(g, additive({ map: sectorTex(), color: hue }));
    this.sector.position.set(0, 0.05, -0.4);
    this.root.add(this.sector);
    for (let i = 0; i < 9; i++) {
      const n = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xf0e6c8, fog: false }));
      this.needles.push(n);
      this.root.add(n);
    }
    for (let i = 0; i < 22; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color: 0xb8ad94, transparent: true, opacity: 0.16, depthWrite: false, fog: false }));
      this.ash.push({ s, a: (-70 + ((i * 53) % 140)) * D2R, r: 1.5 + ((i * 37) % 100) / 16, y: 0.3 + ((i * 29) % 10) / 9, k: 1.4 + ((i * 17) % 10) / 6 });
      this.root.add(s);
    }
  }

  private layoutSweep() {
    // the sweep goes round the fox's right side, from behind it to in front (angles from +x towards +z)
    const k = Math.max(0.05, Math.min(1, this.phase));
    const R = 8;
    this.needles.forEach((n, i) => {
      const a = (-70 + (i / (this.needles.length - 1)) * 140) * D2R;
      const r = R * (0.62 + 0.4 * k) - (i % 2) * 0.7;
      n.position.set(Math.cos(a) * r, 0.55 + (i % 3) * 0.12, -0.4 + Math.sin(a) * r);
      // the cone's axis is +y; lay it along the radial direction, point outward
      n.rotation.set(0, 0, 0);
      n.rotateY(-a);
      n.rotateZ(-Math.PI / 2);
      n.visible = true;
    });
    this.ash.forEach((m) => {
      m.s.position.set(Math.cos(m.a) * m.r, m.y, -0.4 + Math.sin(m.a) * m.r);
      m.s.scale.setScalar(m.k);
    });
  }

  /* ---- showing one ---- */

  hide() {
    this.kind = null;
    this.root.children.forEach((c) => (c.visible = false));
  }

  /** Show one trick at a point in its run (0..1), and put the player stand-in where it is aimed. */
  show(kind: FxKind | null, phase = 0.5) {
    this.hide();
    this.kind = kind;
    this.phase = phase;
    if (!kind) return;
    const on = (list: THREE.Object3D[]) => list.forEach((o) => (o.visible = true));
    this.blob.visible = true;
    switch (kind) {
      case 'toll':
        this.layoutToll();
        this.blob.position.set(0, 0, 6.8);
        this.blob.rotation.y = Math.PI;
        break;
      case 'veil':
        on(this.smoke.map((m) => m.s));
        this.layoutVeil();
        this.blob.position.set(4.6, 0, 4.8);
        this.blob.rotation.y = Math.PI * 0.85;
        break;
      case 'charge':
        on([this.lane, this.target]);
        this.layoutCharge();
        this.blob.position.set(0, 0, 14.6);
        this.blob.rotation.y = Math.PI;
        break;
      case 'lure':
        on(this.wisps.flatMap((w) => [w.grp, w.thread.mesh]));
        this.layoutLure();
        this.blob.position.set(0.4, 0, 13);
        this.blob.rotation.y = Math.PI;
        break;
      case 'sweep':
        on([this.sector, ...this.needles, ...this.ash.map((m) => m.s)]);
        this.layoutSweep();
        this.blob.position.set(6.4, 0, 1.6);
        this.blob.rotation.y = -Math.PI * 0.6;
        break;
    }
    this.blob.visible = true;
    this.blob.traverse((o) => (o.visible = true));
    this.update(this.time);
  }

  update(t: number) {
    this.time = t;
    switch (this.kind) {
      case 'toll':
        this.layoutToll();
        break;
      case 'veil':
        this.layoutVeil();
        break;
      case 'charge': {
        this.layoutCharge();
        this.flames.forEach((f, i) => {
          const fl = (0.7 + 0.55 * Math.abs(Math.sin(i * 7.31))) * (0.85 + 0.25 * Math.sin(t * 9 + i * 1.7) + 0.12 * Math.sin(t * 23 + i));
          f.outer.position.set(f.x, 0.02, f.z);
          f.outer.scale.set(1.1 * fl * f.k + 0.3, 2.1 * fl * f.k, 1);
          f.core.position.set(f.x, 0.02, f.z);
          f.core.scale.set(0.55 * fl * f.k + 0.15, 1.2 * fl * f.k, 1);
          f.h.position.set(f.x, 0.5, f.z);
        });
        (this.lane.material as THREE.MeshBasicMaterial).map!.offset.y = -(t * 0.6) % 1;
        (this.target.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.3 * Math.sin(t * 8);
        break;
      }
      case 'lure':
        this.layoutLure();
        break;
      case 'sweep':
        this.layoutSweep();
        break;
      default:
        break;
    }
  }
}
