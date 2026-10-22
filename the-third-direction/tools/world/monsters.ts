import * as THREE from 'three';
import { fbm } from '../../src/act2/kit/noise';
import { rng } from '../../src/core/util';
import { blob, lathe, lin, merge, mixRgb, strip, tube, type Rgb } from './geo';
import { glowMat, std } from './shade';
import { glowSprite } from './fx';
import { V } from './g-common';

/**
 * The small monsters of the forest, from the 2D game's own creatures (src/core/art2.ts): the things you meet between the guardians, about the size of the Blob.
 * Local origin: on the ground under the creature, facing +z. Each one has the light of its place.
 */

const shadow = (r: number): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, fog: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.05;
  return m;
};

function castAll(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material !== undefined && !(m.material as THREE.Material).transparent) m.castShadow = true;
  });
}

/** a small crawling shadow with cyan eyes: dies to one pulse of light */
export function makeGloomling(): THREE.Group {
  const g = new THREE.Group();
  const night = (t: number, a: number, p: THREE.Vector3): Rgb => mixRgb(lin(0x010607), lin(0x0c2c34), Math.min(1, fbm(p.x * 2, p.y * 2, p.z * 2, 2, 4) * 1.3));
  const mat = std({ vertexColors: true, roughness: 0.8, rim: { color: 0x6ff0ff, k: 1.1 } });
  const body = new THREE.Mesh(blob(V(0, 0, 0), 1, 3, night, 6, 0.08, 1), mat);
  body.scale.set(1.15, 0.85, 1.35);
  body.position.y = 0.95;
  g.add(body);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), glowMat({ color: 0x8ff8ff }));
    e.scale.set(1, 1.35, 0.6);
    e.position.set(sx * 0.42, 1.2, 1.22);
    g.add(e);
    g.add(glowSprite(sx * 0.42, 1.2, 1.3, 1.6, 0x6ff0ff, 0.5));
    for (const k of [-1, 1]) g.add(new THREE.Mesh(tube([V(sx * 0.6, 0.45, k * 0.6), V(sx * 0.95, 0.35, k * 0.8 + 0.1), V(sx * 1.05, 0, k * 0.85)], [0.1, 0.08, 0.02], 4, night), mat));
  }
  g.add(shadow(1.8));
  castAll(g);
  return g;
}

/** a mouth in the ground made of roots: it snaps at anything that comes close, and a pulse stuns it */
export function makeRootmaw(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(12);
  const wood = (t: number, a: number): Rgb => mixRgb(lin(0x1a1008), lin(0x5a3a1a), a);
  const mat = std({ vertexColors: true, roughness: 0.85, vary: 0.4, bump: 1.2, rim: { color: 0xffa04a, k: 0.8 } });
  g.add(new THREE.Mesh(lathe([[3.0, 0.1], [2.6, -0.5], [1.8, -1.6], [0.8, -3]], 20, (t) => mixRgb(lin(0x4a0e08), lin(0x120402), t)), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x5a1004, emissiveIntensity: 0.9 })));
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.15;
    const d = V(Math.cos(a), 0, Math.sin(a));
    const len = 3.2 + r() * 1.2;
    const base = d.clone().multiplyScalar(2.7);
    const path = [base, base.clone().add(V(0, len * 0.5, 0)).addScaledVector(d, -0.4), base.clone().add(V(0, len, 0)).addScaledVector(d, -1.5)];
    parts.push(tube(path, [0.38, 0.26, 0.03], 5, wood));
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const d = V(Math.cos(a), 0, Math.sin(a));
    const path = new THREE.CatmullRomCurve3([d.clone().multiplyScalar(2.6).setY(0.2), d.clone().multiplyScalar(5.5).setY(0.5), d.clone().multiplyScalar(9 + r() * 3).setY(0)]).getPoints(8);
    parts.push(tube(path, path.map((_, k) => 0.6 * (1 - 0.8 * (k / 8))), 6, wood));
  }
  g.add(new THREE.Mesh(merge(parts), mat));
  g.add(glowSprite(0, 0.2, 0, 7, 0xff7a2a, 0.5));
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), glowMat({ color: 0xffb060 }));
    e.position.set(sx * 1.0, 0.7, 3.5);
    g.add(e);
  }
  castAll(g);
  return g;
}

/** a small armoured beetle that charges, and knocks itself out on trees */
export function makeThornback(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(33);
  const shell = (t: number, a: number, p: THREE.Vector3): Rgb => mixRgb(lin(0x1c130d), lin(0x4a3322), Math.min(1, fbm(p.x * 0.6, p.y * 0.6, p.z * 0.6, 3, 5) * 1.5));
  const mat = std({ vertexColors: true, roughness: 0.7, vary: 0.4, bump: 1.4, rim: { color: 0xffa04a, k: 0.8 } });
  const body = new THREE.Mesh(blob(V(0, 0, 0), 1, 3, shell, 2, 0.06, 1), mat);
  body.scale.set(1.5, 1.05, 2.1);
  body.position.y = 1.5;
  g.add(body);
  const head = new THREE.Mesh(blob(V(0, 0, 0), 1, 2, shell, 4, 0.06, 1), mat);
  head.scale.set(0.9, 0.7, 1.0);
  head.position.set(0, 1.0, 2.5);
  g.add(head);
  g.add(new THREE.Mesh(tube([V(0, 1.3, 3.3), V(0, 1.8, 4.1), V(0, 2.6, 4.5)], [0.35, 0.25, 0.02], 6, () => lin(0xc8a878)), mat));
  const th: THREE.BufferGeometry[] = [];
  const tips: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const ph = Math.pow(r(), 0.7) * 1.1;
    const base = V(Math.sin(ph) * Math.cos(a) * 1.45, 1.5 + Math.cos(ph) * 1.0, Math.sin(ph) * Math.sin(a) * 2.0);
    const dir = base.clone().sub(V(0, 1.5, 0)).normalize().add(V(0, 0.2, -0.3)).normalize();
    const L = 0.8 + r() * 0.9;
    const tip = base.clone().addScaledVector(dir, L);
    th.push(tube([base, tip], [0.2, 0.02], 5, () => lin(0x8a6a3a)));
    tips.push(tube([base.clone().lerp(tip, 0.6), tip], [0.07, 0.01], 4, () => lin(0xffa040)));
  }
  g.add(new THREE.Mesh(merge(th), mat), new THREE.Mesh(merge(tips), glowMat({ vertexColors: true })));
  for (const sx of [-1, 1]) {
    for (const z of [-1.0, 0.2, 1.3]) g.add(new THREE.Mesh(tube([V(sx * 1.2, 1.0, z), V(sx * 2.1, 1.3, z + 0.2), V(sx * 2.4, 0, z + 0.4)], [0.28, 0.2, 0.14], 5, shell), mat));
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), glowMat({ color: 0xffa040 }));
    e.position.set(sx * 0.5, 1.15, 3.1);
    g.add(e);
  }
  g.add(glowSprite(0, 1.6, 0, 4.5, 0xff8a22, 0.25));
  g.add(shadow(2.8));
  castAll(g);
  return g;
}

/** a winged eyeball that carries a bell: it only sees what moves; if it sees you, the bell rings */
export function makeBellwether(): THREE.Group {
  const g = new THREE.Group();
  const hover = 4.2;
  const eyeball = new THREE.Mesh(new THREE.SphereGeometry(1.6, 28, 20), new THREE.MeshStandardMaterial({ color: 0xece8ff, roughness: 0.3, emissive: 0x6a5aa8, emissiveIntensity: 0.55 }));
  eyeball.position.y = hover;
  g.add(eyeball);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: 0x6a4ad0 }));
  iris.position.set(0, hover, 1.58);
  g.add(iris);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), new THREE.MeshBasicMaterial({ color: 0x07030f }));
  pupil.position.set(0, hover, 1.6);
  g.add(pupil);
  const veins = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 6, 24), new THREE.MeshBasicMaterial({ color: 0xb09ae0 }));
  veins.position.set(0, hover, 1.45);
  g.add(veins);
  const feather = std({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x4a2a90, emissiveIntensity: 0.55, rim: { color: 0xf2e8ff, k: 0.6 } });
  const fs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (let f = 0; f < 6; f++) {
      const t = f / 5;
      const ang = (50 - 70 * t) * (Math.PI / 180);
      const len = 2.6 + 2.2 * Math.sin(t * 3 + 0.4);
      const dir = V(sx * Math.cos(ang), Math.sin(ang), -0.12).normalize();
      const start = V(sx * 1.4, hover + (t - 0.5) * 0.7, 0);
      const path = [0, 0.3, 0.6, 1].map((u) => start.clone().addScaledVector(dir, u * len).add(V(0, -u * u * 0.4, 0)));
      fs.push(strip(path, [0.3, 0.8, 0.8, 0.1], V(-dir.y, dir.x * sx, 0).normalize(), (u) => mixRgb(lin(0x7a5ad0), lin(0xece8ff), u), 0.08, 2));
    }
  }
  g.add(new THREE.Mesh(merge(fs), feather));
  g.add(new THREE.Mesh(tube([V(0, hover - 1.5, 0), V(0.05, hover - 2.4, 0.1)], [0.05, 0.05], 4, () => lin(0x8a7a4a)), std({ vertexColors: true })));
  const bell = new THREE.Mesh(lathe([[0.95, 0], [0.85, 0.6], [0.6, 1.3], [0.3, 1.7]], 20, () => lin(0xd8b45a)), new THREE.MeshStandardMaterial({ color: 0xd8b45a, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide, emissive: 0x3a2808, emissiveIntensity: 0.7 }));
  bell.position.set(0.05, hover - 4.1, 0.1);
  g.add(bell);
  g.add(glowSprite(0, hover, 1, 7, 0xb09ae0, 0.35));
  g.add(shadow(2.2));
  castAll(g);
  return g;
}

/** a bone-white critter on crooked legs: it marks where it will pounce, then leaps */
export function makeSkitterbone(): THREE.Group {
  const g = new THREE.Group();
  const bone = (t: number, a: number, p: THREE.Vector3): Rgb => mixRgb(lin(0xb2a68a), lin(0xf3ecd6), Math.min(1, fbm(p.x * 1.2, p.y * 1.2, p.z * 1.2, 2, 8) * 1.5));
  const mat = std({ vertexColors: true, roughness: 0.6, vary: 0.3, rim: { color: 0xf4efe0, k: 0.7 } });
  const body = new THREE.Mesh(blob(V(0, 0, 0), 1, 2, bone, 3, 0.1, 1), mat);
  body.scale.set(1.5, 0.6, 1.1);
  body.position.y = 1.5;
  g.add(body);
  for (let i = 0; i < 4; i++) g.add(new THREE.Mesh(tube([V(-1.0 + i * 0.66, 1.9, 0), V(-1.0 + i * 0.66, 1.9, 0.95), V(-1.0 + i * 0.66, 1.4, 1.1)], [0.12, 0.1, 0.05], 4, bone), mat));
  const skull = new THREE.Mesh(blob(V(0, 0, 0), 1, 2, bone, 5, 0.05, 1), mat);
  skull.scale.set(0.85, 0.7, 0.9);
  skull.position.set(0.2, 1.85, 1.35);
  g.add(skull);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0x0a0806 }));
    eye.position.set(0.2 + sx * 0.38, 1.98, 1.95);
    g.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat({ color: 0xff3040 }));
    glint.position.set(0.2 + sx * 0.38, 1.98, 2.1);
    g.add(glint);
    for (let i = 0; i < 3; i++) {
      const z = -0.5 + i * 0.7;
      g.add(new THREE.Mesh(tube([V(sx * 0.9, 1.5, z), V(sx * 2.0, 2.6, z + (i - 1) * 0.5), V(sx * 2.8 + (i - 1) * 0.3, 0, z + (i - 1) * 0.9)], [0.12, 0.1, 0.05], 4, bone), mat));
    }
  }
  g.add(shadow(2.2));
  castAll(g);
  return g;
}

/** a flower that looks friendly until it opens its mouth */
export function makeMimicBloom(open = 1): THREE.Group {
  const g = new THREE.Group();
  const petal = std({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x0a1650, emissiveIntensity: 0.5, rim: { color: 0x7aa8ff, k: 0.5 } });
  const stem = std({ vertexColors: true, roughness: 0.7, rim: { color: 0xff8aa8, k: 0.5 } });
  g.add(new THREE.Mesh(tube([V(0, 0, 0), V(0.2, 0.9, -0.2), V(0, 1.8, 0)], [0.22, 0.17, 0.15], 6, () => lin(0x1a6a58)), stem));
  const head = new THREE.Group();
  head.position.set(0, 2.0, 0);
  head.rotation.x = 0.5 * open;
  const ps: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const phi = (i / 9) * Math.PI * 2;
    const rd = V(Math.cos(phi), 0, Math.sin(phi));
    const path = [0, 0.4, 0.8, 1].map((u) => V(0, 0, 0).addScaledVector(rd, 0.5 + (0.9 + 0.5 * open) * u + 0.3 * u * u).add(V(0, 0.1 + 1.5 * u - 0.6 * u * u * u, 0)));
    ps.push(strip(path, [0.5, 1.0, 0.9, 0.1], V(-Math.sin(phi), 0, Math.cos(phi)), (u) => mixRgb(lin(0x1530c0), lin(0xaad8ff), u), 0.12, 3));
  }
  head.add(new THREE.Mesh(merge(ps), petal));
  head.add(new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), new THREE.MeshBasicMaterial({ color: 0x3a0818, side: THREE.DoubleSide })).rotateX(-Math.PI / 2));
  if (open > 0.3) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      head.add(new THREE.Mesh(tube([V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6), V(Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3)], [0.07, 0.01], 4, () => lin(0xffe8ee)), stem));
    }
    head.add(glowSprite(0, 0.1, 0, 3.2, 0xff4a8a, 0.55));
  } else {
    head.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), glowMat({ color: 0xffe0a0 })).translateY(0.05));
  }
  g.add(head);
  g.add(shadow(1.4));
  castAll(g);
  return g;
}

/** a tiny glowing Mournmoth (the friend): in the 2D game you free it from a cage of roots and its light shows which flowers bite */
export function makeMournmoth(): THREE.Group {
  const g = new THREE.Group();
  const wing = new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const inner = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const y = 1.8;
  for (const sx of [-1, 1]) {
    for (const [sy, sz, rot, op] of [[1.35, 0.9, 0.35, 1], [0.95, 0.65, -0.45, 0.8]] as [number, number, number, number][]) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(1, 28), op === 1 ? wing : inner);
      w.scale.set(sy * 1.5, sz, 1);
      w.position.set(sx * (sy * 1.5 * 0.95), y + (rot > 0 ? 0.4 : -0.3), 0);
      w.rotation.set(-0.15, sx * 0.25, sx * rot);
      g.add(w);
    }
    g.add(new THREE.Mesh(tube([V(sx * 0.1, y + 0.6, 0.3), V(sx * 0.35, y + 1.3, 0.5), V(sx * 0.7, y + 1.7, 0.4)], [0.025, 0.02, 0.01], 3, () => lin(0xe8fff8)), new THREE.MeshBasicMaterial({ color: 0xe8fff8 })));
  }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.8, 4, 10), new THREE.MeshBasicMaterial({ color: 0xf4efff }));
  body.position.y = y;
  g.add(body);
  g.add(glowSprite(0, y, 0, 9, 0xbff4ff, 0.4));
  const l = new THREE.PointLight(0xbff4ff, 30, 24, 1.6);
  l.position.set(0, y, 1);
  g.add(l);
  return g;
}

/** the tangle of roots that traps the moth */
export function makeRootCage(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(8);
  const wood = (t: number, a: number): Rgb => mixRgb(lin(0x1a1008), lin(0x4a3018), a);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const R = 2.4 + r() * 0.6;
    const path = new THREE.CatmullRomCurve3([V(Math.cos(a) * R, 0, Math.sin(a) * R), V(Math.cos(a + 0.5) * R * 0.8, 2.4, Math.sin(a + 0.5) * R * 0.8), V(Math.cos(a + 1.1) * R * 0.3, 4.6, Math.sin(a + 1.1) * R * 0.3)]).getPoints(10);
    parts.push(tube(path, path.map((_, k) => 0.32 * (1 - 0.7 * (k / 10))), 5, wood));
  }
  g.add(new THREE.Mesh(merge(parts), std({ vertexColors: true, roughness: 0.85, vary: 0.4, rim: { color: 0xbff4ff, k: 0.6 } })));
  return g;
}
