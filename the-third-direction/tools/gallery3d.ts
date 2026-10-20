import * as THREE from 'three';
import { Arena, BOSS_Z } from '../src/act2/arena';
import { makeSprite } from '../src/core/pix';
import { hash2, rng, TAU } from '../src/core/util';
import { card, type Shot } from './cards';

/**
 * Concept renders for the 3D bosses, built on the game's real arena (the same platform, wall, pillars, lights and
 * player model). X is the real boss; the others are sketches built from boxes, the way X is.
 */

let arena: Arena | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let glCanvas: HTMLCanvasElement | null = null;
const extras = new THREE.Group();

function ctx3d() {
  if (!arena) {
    arena = new Arena();
    arena.world.add(extras);
    glCanvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x05060c, 1);
  }
  return { arena, renderer: renderer!, glCanvas: glCanvas! };
}

interface Cam {
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
}

function shot(cam: Cam, w: number, h: number): HTMLCanvasElement {
  const { arena: a, renderer: r, glCanvas: cv } = ctx3d();
  r.setSize(w, h, false);
  const c = a.camera;
  c.aspect = w / h;
  c.fov = cam.fov ?? 55;
  c.position.set(...cam.pos);
  c.lookAt(...cam.look);
  c.updateProjectionMatrix();
  // billboards face the camera
  extras.traverse((o) => {
    if (o.userData['billboard']) o.lookAt(c.position);
  });
  r.render(a.scene, c);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(cv, 0, 0);
  return out;
}

function clearExtras() {
  while (extras.children.length) {
    const o = extras.children[0]!;
    extras.remove(o);
  }
}

/** Put the arena back to how the fight against X finds it. */
function reset(opts: { x: boolean; wall: boolean; pillars?: boolean; forest?: number }) {
  const { arena: a } = ctx3d();
  clearExtras();
  a.boss.visible = opts.x;
  a.player.visible = true;
  a.foot.visible = false;
  a.hideShadow();
  a.setGaze(false);
  a.setCore(false);
  a.lanes.forEach((l) => (l.visible = false));
  a.arms.forEach((m) => (m.visible = false));
  for (const p of a.pinned) p.visible = opts.wall;
  a.tint(opts.forest ?? 0);
  a.setClearing(opts.forest ? 1 : 0);
  a.restorePillars();
  a.setRise(1);
  a.setHead(0);
  a.setJaw(0);
  a.setRedLight(0);
  a.player.position.set(0, 0, 12);
  a.player.rotation.set(0, 0, 0);
  for (const pd of a.pillarData) pd.g.visible = opts.pillars !== false && pd.alive;
}

const lam = (c: number, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e, emissiveIntensity: e ? 0.8 : 0 });
const bas = (c: number, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = extras) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function ball(r: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = extras, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function ringOnFloor(x: number, z: number, r: number, col = 0xff3a4a, th = 0.35, parent: THREE.Object3D = extras) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - th, r, 40), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.09, z);
  parent.add(m);
  const d = new THREE.Mesh(new THREE.CircleGeometry(r - th, 40), new THREE.MeshBasicMaterial({ color: 0x20040a, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  d.rotation.x = -Math.PI / 2;
  d.position.set(x, 0.07, z);
  parent.add(d);
}

function shadowDisc(x: number, z: number, r: number, parent: THREE.Object3D = extras) {
  const d = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshBasicMaterial({ color: 0x02030a, transparent: true, opacity: 0.6 }));
  d.rotation.x = -Math.PI / 2;
  d.position.set(x, 0.1, z);
  parent.add(d);
}

/** A faint copy of the player: the same model with every surface turned into a see-through glow. */
function ghostOf(a: Arena, x: number, y: number, z: number, ry: number, col: number, op: number) {
  const g = a.player.clone(true);
  const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.material = mat;
  });
  g.position.set(x, y, z);
  g.rotation.y = ry;
  extras.add(g);
  return g;
}

/* ------------------------------------------------------------------ */
/* X, the Hollow (the real boss)                                       */
/* ------------------------------------------------------------------ */

function xScene(kind: 'hero' | 'face' | 'stomp'): HTMLCanvasElement {
  const { arena: a } = ctx3d();
  reset({ x: true, wall: true });
  a.setRise(1);
  a.update(0, 3.2);
  if (kind === 'hero') {
    // the rake: red lanes across the floor, the baby blob dodging between them
    a.player.position.set(-3.5, 0, 3);
    a.player.rotation.y = Math.PI * 0.12;
    a.animatePlayer(0.016, 3.2, 1, 0.4, 0, false);
    for (let i = 0; i < 9; i++) {
      const z = -24 + i * 3.6;
      const l = a.lanes[i]!;
      l.position.set(0, 0.08, z);
      l.visible = i !== 6 && i !== 7 && i !== 8;
      const arm = a.arms[i]!;
      arm.visible = l.visible && i % 2 === 0;
      arm.position.set(i % 4 === 0 ? -10 : 8, 0.6, z);
      arm.rotation.y = i % 4 === 0 ? 0 : Math.PI;
    }
    a.setRedLight(70);
    return shot({ pos: [2.5, 4.2, 13], look: [0, 13.5, -29], fov: 64 }, 432, 768);
  }
  if (kind === 'face') {
    a.player.visible = false;
    a.setRedLight(120);
    return shot({ pos: [-3, 16.5, -5], look: [0, 17, BOSS_Z], fov: 46 }, 540, 400);
  }
  // the stomp: a foot the size of a house, a shadow that closes on the player
  a.player.position.set(2, 0, 4);
  a.player.rotation.y = Math.PI;
  a.animatePlayer(0.016, 3.2, 1, 1.2, 0, false);
  a.foot.visible = true;
  a.foot.position.set(2, 9, 4);
  a.setShadow(2, 4, 4.2, 0.85, true);
  a.setRedLight(20);
  return shot({ pos: [-13, 8.5, 17], look: [1, 6, 3], fov: 58 }, 540, 400);
}

/* ------------------------------------------------------------------ */
/* The Moon                                                            */
/* ------------------------------------------------------------------ */

function moonTexture(blink = 0): THREE.CanvasTexture {
  const S = 160;
  const p = makeSprite(S, S);
  const c = S / 2;
  // a halo, in bands
  for (let i = 0; i < 7; i++) {
    p.alpha(0.05);
    p.ellipse(c, c, 78 - i * 3.5, 78 - i * 3.5, '#e8e0ff');
  }
  p.alpha(1);
  // the disc, lit from the upper left
  p.ellipse(c, c, 62, 62, '#8f86bf');
  p.ellipse(c - 2, c - 2, 60, 60, '#b4acd8');
  p.ellipse(c - 5, c - 5, 54, 54, '#d6d0ee');
  p.ellipse(c - 9, c - 9, 44, 44, '#ece8fa');
  p.dither(c - 12, c - 12, 30, 30, '#ffffff', 0.35);
  // craters
  const r = rng(9);
  for (let i = 0; i < 13; i++) {
    const a = r() * TAU;
    const d = 33 + r() * 25;
    const x = c + Math.cos(a) * d;
    const y = c + Math.sin(a) * d;
    if (Math.hypot(x - c, y - c) > 56) continue;
    const rr = 3 + r() * 6;
    p.ellipse(x, y, rr, rr * 0.9, '#a39bcc');
    p.ellipse(x - 1, y - 1, rr - 1.4, (rr - 1.4) * 0.9, '#8f86bf');
    p.px(x + rr * 0.7, y + rr * 0.5, '#f4f0ff');
  }
  // veins creeping in from the edge
  for (let i = 0; i < 18; i++) {
    let a = (i / 18) * TAU + r() * 0.2;
    let x = c + Math.cos(a) * 60;
    let y = c + Math.sin(a) * 60;
    const len = 8 + r() * 12;
    for (let k = 0; k < len; k++) {
      a += (r() - 0.5) * 0.5;
      x -= Math.cos(a) * 1.1;
      y -= Math.sin(a) * 1.1;
      p.px(x, y, k < len * 0.6 ? '#e04a6a' : '#b83050');
    }
  }
  // the eye: gold iris, black slit
  p.ellipse(c, c, 26, 26, '#4a2a06');
  p.ellipse(c, c, 25, 25, '#d49a2a');
  p.ellipse(c, c, 22, 22, '#f0c850');
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    p.line(c + Math.cos(a) * 9, c + Math.sin(a) * 9, c + Math.cos(a) * 22, c + Math.sin(a) * 22, i % 2 ? '#c8861e' : '#ffe9a0', 1);
  }
  p.ellipse(c, c, 12, 15, '#8a4a10');
  p.ellipse(c, c, 4.2, 22, '#05060c');
  p.rect(c - 1, c - 18, 1, 36, '#2a1a3a');
  p.px(c - 12, c - 14, '#ffffff');
  p.px(c - 11, c - 15, '#ffffff');
  p.px(c - 11, c - 14, '#ffffff');
  // the lids: they close the moon from above and below into a slit (blink 0 = wide open)
  if (blink > 0.02) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x - c;
        const dy = y - c;
        const d2 = dx * dx + dy * dy;
        if (d2 > 62 * 62) continue;
        const h = (1 - blink) * 62 * Math.sqrt(Math.max(0, 1 - (dx / 62) * (dx / 62)));
        const ad = Math.abs(dy);
        if (ad > h) p.px(x, y, ad < h + 1.5 ? '#8a6ae8' : ad < h + 3 ? '#3a2a66' : '#160c2a');
      }
    }
  }
  return texFrom(p.canvas);
}

function texFrom(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function moonBody(blink = 0) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), new THREE.MeshBasicMaterial({ map: moonTexture(blink), transparent: true, alphaTest: 0.02, fog: false, depthWrite: false }));
  m.userData['billboard'] = true;
  g.add(m);
  g.position.set(0, 25, -46);
  extras.add(g);
  // two rings of tiny cubes, like the ticks of a clock
  const ringMat = lam(0x9a8ad8, 0x4a3a98);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    const big = i % 7 === 0;
    const c = box(big ? 2.2 : 1.1, big ? 2.2 : 1.1, big ? 2.2 : 1.1, ringMat, Math.cos(a) * 29, 25 + Math.sin(a) * 29, -46 + Math.sin(a * 3) * 1.5);
    c.rotation.set(a, a * 0.7, 0);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.2;
    const c = box(0.8, 0.8, 0.8, lam(0xe8e0ff, 0x9a8ad8), Math.cos(a) * 34, 25 + Math.sin(a) * 34, -46);
    c.rotation.set(a * 2, a, 0);
  }
  return g;
}

function fallingCube(x: number, y: number, z: number, size = 2.6) {
  const c = box(size, size, size, lam(0x2a1a4a, 0x1a0a30), x, y, z);
  c.rotation.set(0.4, 0.7, 0.2);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(c.geometry), new THREE.LineBasicMaterial({ color: 0xff5a7a }));
  c.add(edges);
  return c;
}

function moonScene(kind: 'hero' | 'echo' | 'fall'): HTMLCanvasElement {
  const { arena: a } = ctx3d();
  reset({ x: false, wall: false, forest: 1, pillars: kind === 'hero' });
  a.setRise(1);
  const moonLight = new THREE.PointLight(0xd8d0ff, 380, 120, 1.2);
  moonLight.position.set(0, 26, -30);
  extras.add(moonLight);
  moonBody(kind === 'fall' ? 0.5 : 0);
  if (kind === 'hero') {
    // the player has jumped; three echoes of where they were follow, each a little fainter
    a.player.position.set(1.5, 2.4, 6);
    a.player.rotation.y = Math.PI * 0.05;
    a.animatePlayer(0.016, 3.2, 0, 0.4, 0, false);
    shadowDisc(1.5, 6, 1.1);
    ghostOf(a, -3.2, 0, 10.5, 0.3, 0x9ff4ee, 0.75);
    ghostOf(a, -6.8, 0, 8.4, 0.9, 0x9ff4ee, 0.55);
    ghostOf(a, -8.8, 0, 4.6, 1.4, 0x9ff4ee, 0.38);
    // dots of the path they took
    for (let i = 0; i < 18; i++) {
      const u = i / 18;
      const x = -9.5 + u * 11;
      const z = 0.5 + Math.sin(u * 3.3) * 5 + u * 6;
      box(0.35, 0.35, 0.35, bas(0x9ff4ee, 0.7 - u * 0.4), x, 0.25, z);
    }
    // cubes already falling
    ringOnFloor(6, -4, 2.4);
    ringOnFloor(-3, -9, 2.4);
    fallingCube(6, 9, -4);
    fallingCube(-3, 14, -9);
    return shot({ pos: [0, 8.8, 24], look: [0, 14, -20], fov: 66 }, 432, 768);
  }
  if (kind === 'echo') {
    a.player.position.set(3, 0, 3);
    a.player.rotation.y = Math.PI * 0.4;
    a.animatePlayer(0.016, 3.2, 1, 0.4, 0, false);
    ghostOf(a, -1, 0, 6, 0.2, 0x9ff4ee, 0.8);
    ghostOf(a, -4.5, 0, 3.5, 0.6, 0x9ff4ee, 0.6);
    ghostOf(a, -6.5, 0, -1, 1.2, 0x9ff4ee, 0.42);
    ghostOf(a, -5, 0, -5.5, 1.9, 0x9ff4ee, 0.28);
    for (let i = 0; i < 30; i++) {
      const u = i / 30;
      const ang = u * 5.0;
      box(0.3, 0.3, 0.3, bas(0x9ff4ee, 0.8 - u * 0.55), 3 - u * 12 + Math.sin(ang) * 1.2, 0.22, 3 + Math.cos(u * 4) * 5 - u * 9);
    }
    return shot({ pos: [11, 9, 14], look: [-2, 2, 0], fov: 56 }, 540, 400);
  }
  // falling cubes, each over its own red ring
  a.player.position.set(0, 0, 6);
  a.player.rotation.y = Math.PI;
  a.animatePlayer(0.016, 3.2, 0, 0.4, 0, false);
  const spots: [number, number, number][] = [[-5, -2, 3], [5, 0, 8], [-1, -6, 15], [8, -8, 22], [-9, 4, 6]];
  for (const [x, z, y] of spots) {
    ringOnFloor(x, z, 2.5);
    fallingCube(x, y, z);
    shadowDisc(x, z, 1.3);
  }
  ringOnFloor(0, 6, 1.6, 0xffe9a0, 0.25);
  return shot({ pos: [-12, 15, 16], look: [0, 6, -2], fov: 56 }, 540, 400);
}

/* ------------------------------------------------------------------ */
/* shared bits for the sketched bosses                                  */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number];

/** A box stretched between two points. */
function rod(a: V3, b: V3, th: number, m: THREE.Material, parent: THREE.Object3D = extras) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(th, th, A.distanceTo(B)), m);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), B.clone().sub(A).normalize());
  parent.add(mesh);
  return mesh;
}

function cone(r: number, h: number, m: THREE.Material, x: number, y: number, z: number, rz = 0, rx = 0, parent: THREE.Object3D = extras, seg = 5) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, 0, rz);
  parent.add(mesh);
  return mesh;
}

const glass = () => new THREE.MeshLambertMaterial({ color: 0xbff4ff, emissive: 0x2a6a7a, emissiveIntensity: 0.6, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false });

/* ------------------------------------------------------------------ */
/* The Mash: every guardian at once                                      */
/* ------------------------------------------------------------------ */

function addMash() {
  const g = new THREE.Group();
  g.position.set(0, 0, BOSS_Z);
  extras.add(g);
  const dark = lam(0x2a1a48, 0x0a0618);
  const cyan = bas(0x6ff0ff);
  const r = rng(12);
  // the shadow of the Gloommother: a heap of black with a hundred cyan eyes
  box(10, 24, 6, dark, 0, 2, 0, g);
  for (const sx of [-1, 1]) ball(3.8, dark, sx * 5.2, 12.5, 0, g, 12);
  ball(4.4, dark, -3, -6, 0.3, g, 12);
  ball(4.4, dark, 3.4, -5, 0.3, g, 12);
  for (let i = 0; i < 60; i++) {
    const front = r() < 0.7;
    const big = r() < 0.2;
    const x = front ? (r() - 0.5) * 9.4 : (r() < 0.5 ? -1 : 1) * 5.1;
    const y = -6 + r() * 19;
    const z = front ? 3.1 : (r() - 0.5) * 5.4;
    box(big ? 0.55 : 0.34, big ? 0.55 : 0.34, 0.2, cyan, x, y, z, g);
  }

  // the Mimic Queen is his face: a flower of petals around a maw of teeth
  const face = new THREE.Group();
  face.position.set(0, 14.2, 3.2);
  g.add(face);
  for (let ring = 0; ring < 2; ring++) {
    const n = 11 - ring * 2;
    const len = 6.4 - ring * 1.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ring * 0.3;
      const d = len / 2 + 2.4;
      const petal = box(1.9 - ring * 0.3, len, 0.5, lam(ring ? 0x3a92b8 : 0x2d7da0, 0x0a2a3a), Math.cos(a) * d, Math.sin(a) * d, -0.3 + ring * 0.5, face);
      petal.rotation.z = a - Math.PI / 2;
      const tip = box(1.5 - ring * 0.3, 1.4, 0.45, lam(0x9fe8ff, 0x3a8aa8), Math.cos(a) * (d + len / 2 - 0.3), Math.sin(a) * (d + len / 2 - 0.3), -0.3 + ring * 0.5, face);
      tip.rotation.z = a - Math.PI / 2;
    }
  }
  const maw = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.9, 24), lam(0x2a0610));
  maw.rotation.x = Math.PI / 2;
  maw.position.z = 0.6;
  face.add(maw);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.5, 6, 24), lam(0x9a2a3a, 0x4a0a14));
  rim.position.z = 1;
  face.add(rim);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.3, 20), lam(0xc04a5a, 0x6a1a2a));
  throat.rotation.x = Math.PI / 2;
  throat.position.z = 1.15;
  face.add(throat);
  ball(1.1, lam(0xff8aa8, 0x8a2a4a), 0.4, -0.8, 1.5, face, 8);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const t = box(0.5, 1.3, 0.5, lam(0xf4efe0, 0x5a5a4a), Math.cos(a) * 2.85, Math.sin(a) * 2.85, 1.35, face);
    t.rotation.z = a + Math.PI / 2;
  }
  // her lure, glowing pink, dangling in front of the maw
  const pink = lam(0x2d7da0);
  const pts: V3[] = [[1.8, 5.6, 0.6], [3.6, 8, 3], [2.4, 7.2, 6.2], [0.6, 3.6, 7]];
  for (let i = 1; i < pts.length; i++) rod(pts[i - 1]!, pts[i]!, 0.45, pink, face);
  ball(0.85, bas(0xffb0c8), 0.6, 3.2, 7, face, 8);
  const lureLight = new THREE.PointLight(0xff8aa8, 60, 16, 1.6);
  lureLight.position.set(0.6, 3.2, 8);
  face.add(lureLight);

  // the Toll Queen's bell hangs from his chest
  const bellMat = new THREE.MeshLambertMaterial({ color: 0xd9a93a, emissive: 0x6a4a10, emissiveIntensity: 0.7, side: THREE.DoubleSide });
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 4.7, 7.2, 20, 1, true), bellMat);
  bell.position.set(0, 2.6, 4.3);
  g.add(bell);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.5, 6, 24), lam(0xf0d070, 0x8a6a20));
  lip.rotation.x = Math.PI / 2;
  lip.position.set(0, -1, 4.3);
  g.add(lip);
  for (let i = 0; i < 3; i++) box(0.5, 1.2, 0.2, lam(0x5a3e12), -2.4 + i * 2.4, 2.4, 6.3 - Math.abs(i - 1) * 0.5, g);
  ball(1.1, lam(0xc9b6ff, 0x9a7aff), 0, -1.9, 4.3, g, 8);
  for (let k = 0; k < 4; k++) box(0.5, 0.7, 0.3, lam(0x9a9aaa), 0, 6.6 + k * 0.9, 3.9 - k * 0.2, g);
  // and her winged eye watches from above his head
  const eyeG = new THREE.Group();
  eyeG.position.set(0, 27.4, 1.5);
  g.add(eyeG);
  ball(2.5, bas(0xece8ff), 0, 0, 0, eyeG, 14);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(1.55, 18), bas(0x6a4ad0));
  iris.position.z = 2.45;
  eyeG.add(iris);
  const gold = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.75, 18), bas(0xe0b84a));
  gold.position.z = 2.47;
  eyeG.add(gold);
  box(0.3, 2.3, 0.1, bas(0x05060c), 0, 0, 2.5, eyeG);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const a = 0.15 + i * 0.2;
      const f = box(0.6, 6.2 - i * 0.2, 0.25, lam(i % 2 ? 0x8f84d8 : 0xb9b0f0, 0x4a3a98), sx * (3.2 + Math.sin(a) * 3.1), 0.5 - Math.cos(a) * 3.1 + 2.4, 0, eyeG);
      f.rotation.z = -sx * (Math.PI / 2 - a * 0.8) + (sx < 0 ? Math.PI : 0) * 0;
    }
  }

  // the Thornback King's shell on his left shoulder, crowned in thorns
  const shell = new THREE.Mesh(new THREE.SphereGeometry(5.4, 18, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1a2c3c, emissive: 0x0a1a2a, emissiveIntensity: 0.6 }));
  shell.position.set(-9.4, 9.6, 0.4);
  shell.scale.set(1, 0.95, 1.1);
  g.add(shell);
  for (let i = 0; i < 7; i++) {
    const phi = -0.95 + i * 0.32;
    cone(0.62, 5.4, lam(0xbcd0dc, 0x4a6a7a), -9.4 + Math.sin(phi) * 5, 9.6 + Math.cos(phi) * 5, 0.4, -phi, 0, g);
  }
  for (const [x, y, ln] of [[-11.5, 11.2, 2.6], [-7.5, 12.8, 2.2], [-9.4, 8.2, 3]] as [number, number, number][]) {
    const c = box(0.2, ln, 0.2, bas(0xff3040), x, y, 5.4, g);
    c.rotation.z = (x + y) * 0.4;
  }
  // his horn grows from the flower's brow
  cone(0.9, 8, lam(0x27425a, 0x0a1a2a), 3.4, 24.4, 3, -0.5, 0, g);

  // the Bone Wyrm is his spine, arching over the right shoulder to a skull
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(6, -4, 0.5), new THREE.Vector3(14, 5, 0), new THREE.Vector3(15.5, 17, 0.5), new THREE.Vector3(11, 26, 3), new THREE.Vector3(6.5, 27.6, 6.8)]);
  const bone = lam(0xd8d0b8, 0x4a4638);
  for (let i = 0; i <= 15; i++) {
    const p = curve.getPoint(i / 15);
    const rr = 0.9 + 0.6 * Math.sin((i / 15) * Math.PI) + (i > 12 ? 0.3 : 0);
    ball(rr, bone, p.x, p.y, p.z, g, 8);
    cone(0.35, 1.6, bone, p.x + 0.4, p.y + rr + 0.5, p.z, -0.4, 0, g, 4);
  }
  const sk = new THREE.Group();
  sk.position.set(6.2, 27.2, 7.4);
  sk.rotation.set(0.5, -0.4, 0);
  g.add(sk);
  box(3.8, 2.8, 4.4, bone, 0, 0, 0, sk);
  const jaw = box(3.3, 0.9, 3.8, lam(0xb8ae94), 0, -2, 0.5, sk);
  jaw.rotation.x = 0.35;
  for (let i = -2; i <= 2; i++) {
    box(0.4, 0.8, 0.4, lam(0xffffff, 0x888888), i * 0.7, -1.4, 2.2, sk);
    box(0.4, 0.8, 0.4, lam(0xffffff, 0x888888), i * 0.7, -1.8, 2.3, sk).rotation.x = 0.35;
  }
  for (const sx of [-1, 1]) {
    ball(0.7, bas(0xff3040), sx * 1.05, 0.5, 2.1, sk, 8);
  }
  const wyrmLight = new THREE.PointLight(0xff4050, 40, 14, 1.6);
  wyrmLight.position.set(6.5, 26, 10);
  g.add(wyrmLight);
  return g;
}

function mashScene(kind: 'hero' | 'face' | 'bone'): HTMLCanvasElement {
  const { arena: a } = ctx3d();
  reset({ x: false, wall: true });
  a.setRise(1);
  addMash();
  a.setRedLight(35);
  const key = new THREE.PointLight(0xfff0e0, 230, 90, 1.25);
  key.position.set(1, 22, 12);
  extras.add(key);
  if (kind === 'hero') {
    a.player.position.set(-4, 0, 7);
    a.player.rotation.y = Math.PI * 0.1;
    a.animatePlayer(0.016, 3.2, 1, 0.4, 0, false);
    return shot({ pos: [4, 7, 17], look: [0, 13.5, -27], fov: 66 }, 432, 768);
  }
  a.player.visible = false;
  if (kind === 'face') return shot({ pos: [0, 11, -3], look: [0, 10.5, -26], fov: 52 }, 540, 400);
  return shot({ pos: [19, 21, -6], look: [7, 18.5, -27], fov: 50 }, 540, 400);
}

/* ------------------------------------------------------------------ */
/* The Collector                                                        */
/* ------------------------------------------------------------------ */

function giantPin(x: number, z: number, h: number, tipY: number, head = 0xe02b3a) {
  const steel = lam(0xc8d0d8, 0x3a4048);
  rod([x, tipY, z], [x, tipY + h, z], 0.42, steel);
  cone(0.3, 1.4, steel, x, tipY + 0.5, z, Math.PI);
  ball(1.05, lam(head, 0x4a0a14), x, tipY + h + 0.9, z, extras, 10);
  ball(0.4, bas(0xffffff), x - 0.3, tipY + h + 1.3, z + 0.4, extras, 6);
}

function addCollector() {
  const g = new THREE.Group();
  g.position.set(0, 0, BOSS_Z);
  extras.add(g);
  const wood = lam(0x4a2c18, 0x1a0c04);
  const woodHi = lam(0x7a4a28, 0x2a1808);
  const brass = lam(0xd9a93a, 0x6a4a10);
  const brassDark = lam(0x8a6420, 0x2a1a04);
  const r = rng(33);
  box(10.4, 22, 5.6, wood, 0, 2, 0, g);
  // a hundred little drawers, some pulled open, each holding something he collected
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 10; row++) {
      const x = -3.7 + col * 2.46;
      const y = -7.6 + row * 2.05;
      const open = (col * 7 + row * 3) % 11 === 0;
      box(2.15, 1.8, open ? 2.2 : 0.5, woodHi, x, y, open ? 3.7 : 2.95, g);
      ball(0.22, brass, x, y, open ? 4.9 : 3.3, g, 6);
      if (open) {
        const c = [0x6ff0ff, 0xff8aa8, 0xffe9a0, 0xb9b0f0][(col + row) % 4]!;
        for (let k = 0; k < 3; k++) box(0.5, 0.5, 0.5, bas(c), x + (r() - 0.5) * 1.2, y + 1.15, 3.6 + r() * 1.2, g);
      }
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(1.9, 3.4, 1.9, brassDark, sx * 3.8, -10.5, sz * 1.7, g);
  for (const sx of [-1, 1]) box(0.5, 22.4, 0.5, brass, sx * 5.2, 2, 2.9, g);
  box(5.4, 1.3, 0.3, bas(0xf4efe0), 0, 12.2, 3.2, g);
  for (let i = 0; i < 3; i++) box(4.2 - i * 0.7, 0.18, 0.1, bas(0x3a2a1a), 0, 12.5 - i * 0.35, 3.4, g);
  // the head: a bell jar with a giant red eye inside
  const collar = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.6, 8, 28), brass);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 13.2, 0);
  g.add(collar);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 1.2, 24), brassDark);
  base.position.set(0, 14, 0);
  g.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.6, 24, 16, 0, TAU, 0, Math.PI / 2), glass());
  dome.position.y = 14.6;
  g.add(dome);
  const knob = ball(0.7, brass, 0, 19.4, 0, g, 8);
  void knob;
  box(0.35, 6, 0.1, bas(0xffffff, 0.55), -2.6, 17.6, 3.4, g).rotation.z = -0.35;
  box(0.25, 2.6, 0.1, bas(0xffffff, 0.4), -1.6, 18.8, 3.9, g).rotation.z = -0.2;
  ball(2.4, bas(0xffeeee), 0, 17, 0.2, g, 14);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(1.35, 18), bas(0xe02b3a));
  iris.position.set(0, 17, 2.6);
  g.add(iris);
  box(0.28, 2.1, 0.1, bas(0x05060c), 0, 17, 2.66, g);
  for (let i = 0; i < 9; i++) {
    const c = [0x6ff0ff, 0xff8aa8, 0xffe9a0][i % 3]!;
    box(0.5, 0.5, 0.5, bas(c), (r() - 0.5) * 6.6, 15.4 + r() * 3.4, (r() - 0.5) * 4.6, g).rotation.set(r() * 3, r() * 3, 0);
  }
  // arms of brass pipe: one raises a giant pin, the other holds an empty jar
  for (const sx of [-1, 1]) {
    ball(1.3, brassDark, sx * 6.4, 11.6, 0, g, 8);
    rod([sx * 6.4, 11.6, 0], [sx * 12, 13, 2.5], 1.2, brass, g);
    ball(1, brassDark, sx * 12, 13, 2.5, g, 8);
    rod([sx * 12, 13, 2.5], [sx * 14.5, 8, 7], 1.05, brass, g);
  }
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 5.4, 18, 1, true), glass());
  jar.position.set(-14.5, 5, 7);
  g.add(jar);
  const jarTop = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 8, 0, TAU, 0, Math.PI / 2), glass());
  jarTop.position.set(-14.5, 7.7, 7);
  g.add(jarTop);
  const jr = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 6, 20), brass);
  jr.rotation.x = Math.PI / 2;
  jr.position.set(-14.5, 2.3, 7);
  g.add(jr);
  // the giant pin in the right hand
  rod([14.5, 20, 7], [14.5, 2, 7], 0.5, lam(0xc8d0d8, 0x3a4048), g);
  ball(1.2, lam(0xe02b3a, 0x4a0a14), 14.5, 20.8, 7, g, 10);
  cone(0.35, 1.6, lam(0xc8d0d8), 14.5, 1.4, 7, Math.PI, 0, g);
  return g;
}

function collectorScene(kind: 'hero' | 'head' | 'jar'): HTMLCanvasElement {
  const { arena: a } = ctx3d();
  reset({ x: false, wall: true });
  a.setRise(1);
  addCollector();
  const lamp = new THREE.PointLight(0xffd98a, 260, 70, 1.4);
  lamp.position.set(4, 16, -10);
  extras.add(lamp);
  if (kind === 'hero') {
    a.player.position.set(-3, 0, 8);
    a.player.rotation.y = Math.PI * 0.12;
    a.animatePlayer(0.016, 3.2, 1, 0.4, 0, false);
    // pins coming down, with their rings
    ringOnFloor(10, -2, 2.2);
    giantPin(10, -2, 9, 5.5);
    ringOnFloor(-11, -8, 2.2);
    giantPin(-11, -8, 9, 11);
    giantPin(8, -11, 9, 0.2);
    giantPin(-9, 2, 9, 0.2);
    return shot({ pos: [4, 7, 17], look: [0, 11.5, -27], fov: 66 }, 432, 768);
  }
  if (kind === 'head') {
    a.player.visible = false;
    return shot({ pos: [-4, 17, -4], look: [0, 16, -27], fov: 46 }, 540, 400);
  }
  // the jar comes down over the baby blob and a label is pinned to it
  a.player.position.set(2, 0, 6);
  a.player.rotation.y = Math.PI * 0.9;
  a.animatePlayer(0.016, 3.2, 0, 0.4, 0, false);
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.6, 20, 1, true), glass());
  jar.position.set(2, 1.8, 6);
  extras.add(jar);
  const jt = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 8, 0, TAU, 0, Math.PI / 2), glass());
  jt.position.set(2, 3.6, 6);
  extras.add(jt);
  const jb = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.3, 6, 22), lam(0xd9a93a, 0x6a4a10));
  jb.rotation.x = Math.PI / 2;
  jb.position.set(2, 0.3, 6);
  extras.add(jb);
  ball(0.45, lam(0xd9a93a, 0x6a4a10), 2, 6.4, 6, extras, 6);
  const label = box(2.2, 1.3, 0.1, bas(0xf4efe0), 2, 1.4, 8.45);
  label.rotation.x = -0.1;
  for (let i = 0; i < 3; i++) box(1.7 - i * 0.4, 0.14, 0.05, bas(0x3a2a1a), 2, 1.75 - i * 0.3, 8.52);
  ringOnFloor(2, 6, 3.2, 0xffe9a0, 0.25);
  for (const [x, z, y] of [[-6, 3, 0.2], [8, 9, 0.2], [-2, 14, 0.2]] as V3[]) giantPin(x, z, 6, y);
  giantPin(10, 2, 8, 10);
  ringOnFloor(10, 2, 2.2);
  return shot({ pos: [-9, 6.5, 17], look: [2, 2, 6], fov: 54 }, 540, 400);
}

/* ------------------------------------------------------------------ */

function frame(scene: HTMLCanvasElement, shots: Shot[]) {
  return { scene, shots };
}

const x3 = (): string => {
  const f = frame(xScene('hero'), [
    { canvas: xScene('face'), label: 'the face: sixteen red eyes and three that watch', k: 1 },
    { canvas: xScene('stomp'), label: 'the stomp: a shadow closes in, then the foot', k: 1 },
  ]);
  return card({
    name: 'X, the Hollow',
    tag: 'IN THE GAME NOW',
    hero: { canvas: f.shots[0]!.canvas },
    zone: 'The Third Direction · boss 1 · in the game now',
    accent: '#ff4a5a',
    tagline: 'A shadow that fell in from the third dimension and pinned your forest to its wall.',
    lines: [
      ['Foot', 'A shadow shrinks on the floor, then a foot the size of a house stamps it flat. Leave the circle.'],
      ['Rake', 'Nine bony arms rake the floor in lanes. Slip through the gaps between the red lines.'],
      ['Gaze', 'He turns his three eyes and a beam sweeps the floor. Stand behind a pillar.'],
      ['Jaws', 'Rings bloom under your feet, then teeth. In the last phase his core shows: strike it.'],
    ],
    ...f,
    lift: false,
  });
};

const moon3 = (): string => {
  const f = frame(moonScene('hero'), [
    { canvas: moonScene('echo'), label: 'echoes: your own past self comes for you', k: 1 },
    { canvas: moonScene('fall'), label: 'fall: cubes come down on the red rings', k: 1 },
  ]);
  return card({
    name: 'The Moon',
    tag: 'FINAL BOSS · A · B · C',
    hero: { canvas: f.scene, crop: [0, 70, 432, 320] },
    zone: 'Final boss · "The Fourth Direction"',
    accent: '#f0c850',
    tagline: 'The third direction was depth. The fourth is time, and the moon has been watching all along.',
    lines: [
      ['Echo', 'Every few seconds your own last moves replay as ghosts. Do not cross your old path, and do not stand still.'],
      ['Fall', 'Cubes drop from the sky over red rings. You can now JUMP: hop the shockwave when it ripples out.'],
      ['Eclipse', 'The moon closes its eye and the lights die. Pulse the stones awake to see where the ghosts run.'],
      ['Weak point', 'The golden eye, in the one second after it blinks. Hit it from the top of a jump.'],
    ],
    ...f,
    lift: false,
  });
};

const mash3 = (): string => {
  const f = frame(mashScene('hero'), [
    { canvas: mashScene('face'), label: "the mimic's face, the queen's bell", k: 1 },
    { canvas: mashScene('bone'), label: "the wyrm's spine, the thorn king's shell", k: 1 },
  ]);
  return card({
    name: 'The Mash',
    tag: 'ALT FINALE',
    hero: { canvas: f.scene, crop: [0, 90, 432, 320] },
    zone: 'Alternate finale · the Monster Mash',
    accent: '#ff8aa8',
    tagline: 'Every guardian you beat, stitched back together by X into one thing that should not move.',
    lines: [
      ['Mash', 'Each phase he borrows one guardian: the bell tolls, the spine arches, the shell charges.'],
      ['Remix', 'Later he plays two at once: a toll ring AND a charge lane on the same floor.'],
      ['Callback', 'Every move is one you already beat, so the forest has taught you how to read him.'],
      ['Weak point', 'Whichever mouth is open. The flower opens last and is the only one that can be hurt.'],
    ],
    ...f,
    lift: false,
  });
};

const collector3 = (): string => {
  const f = frame(collectorScene('hero'), [
    { canvas: collectorScene('head'), label: 'the curator: a jar for a head, a red eye inside', k: 1 },
    { canvas: collectorScene('jar'), label: 'the jar comes down. the label is already written', k: 1 },
  ]);
  return card({
    name: 'The Collector',
    tag: 'ALT FINALE',
    hero: { canvas: f.shots[0]!.canvas },
    zone: 'Alternate finale · the one behind the wall',
    accent: '#ffd98a',
    tagline: 'He did not want you dead. He wanted you on his wall, with a label.',
    lines: [
      ['Pins', 'Giant pins fall over red rings and stay in the floor as obstacles. The arena fills up as you fight.'],
      ['Jar', 'A glass jar drops over you. Hold the pulse to crack it before he screws the lid on.'],
      ['Drawers', 'His drawers slide open and release the things he collected: little copies of the forest monsters.'],
      ['Weak point', 'The eye in the jar, when he lifts the lid to look at his catch.'],
    ],
    ...f,
    lift: false,
  });
};

export const builders3d: Record<string, () => string> = {
  x: x3,
  moon: moon3,
  mash: mash3,
  collector: collector3,
};

void hash2;
void BOSS_Z;
