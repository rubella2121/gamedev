import * as THREE from 'three';
import { fbm } from '../../src/act2/kit/noise';
import { rng } from '../../src/core/util';
import { lin, merge, mixRgb, tube, type Rgb } from './geo';
import { fogged, glowMat, std } from './shade';
import { beam, glowSprite } from './fx';
import { makeRibbon } from './blob';
import { ZONES3, HUB3, ROADS3 } from './layout';
import { V } from './g-common';

/** More set pieces: the signpost at the crossroads, the Seal, a sky full of eyes with a crack in it, beacons of light, the pink trail, the floor markings of a fight. */

/** a chunk of stone: a subdivided box shaken by noise, so pillars and lintels look quarried */
export function rockBox(w: number, h: number, d: number, seed: number, col: (t: number, a: number) => Rgb, rough = 0.12): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 8, Math.max(2, Math.round(h / 1.6)), 8);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const colors: number[] = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 0.4 + seed, v.y * 0.4, v.z * 0.4 + seed * 0.7, 3, 5) - 0.5;
    const k = 1 + n * rough * 2;
    v.x *= k;
    v.z *= k;
    v.y += n * rough * 1.5;
    p.setXYZ(i, v.x, v.y, v.z);
    const c = col((v.y / h) + 0.5, n + 0.5);
    colors.push(c[0], c[1], c[2]);
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const stone = (t: number, a: number): Rgb => mixRgb(lin(0x1c2228), lin(0x4a545e), a * 0.9);

/** the waystone at the crossroads: five arms, one to each place, each wearing that place's colour; the pink ribbon is tied round the top */
export function makeSignpost(): THREE.Group {
  const g = new THREE.Group();
  const wood = std({ vertexColors: true, roughness: 0.85, vary: 0.4, bump: 1.2, rim: { color: 0xffc860, k: 0.3 } });
  g.add(new THREE.Mesh(rockBox(1.5, 9, 1.5, 3, stone, 0.1).translate(0, 4.5, 0), wood));
  g.add(new THREE.Mesh(rockBox(2.8, 0.9, 2.8, 4, stone, 0.1).translate(0, 0.45, 0), wood));
  const order: [string, number][] = [['gloom', 0], ['thicket', 1], ['marsh', 2], ['bones', 3], ['meadow', 4]];
  for (const [id, i] of order) {
    const z = ZONES3.find((q) => q.id === id)!;
    const dx = z.entry.x - HUB3.x;
    const dz = z.entry.z - HUB3.z;
    const plank = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.5);
    shape.lineTo(3.6, -0.5);
    shape.lineTo(4.5, 0);
    shape.lineTo(3.6, 0.5);
    shape.lineTo(0, 0.5);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
    geo.translate(0.6, 0, -0.11);
    const colors: number[] = [];
    const pos = geo.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      const c = mixRgb(lin(0x2a2018), lin(0x5a4630), fbm(pos.getX(k) * 2, pos.getY(k) * 2, pos.getZ(k) * 2, 2, i) * 1.3);
      colors.push(c[0], c[1], c[2]);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    plank.add(new THREE.Mesh(geo, wood));
    const band = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), glowMat({ color: z.hue, side: THREE.DoubleSide, opacity: 0.95 }));
    band.position.set(4.3, 0, 0.14);
    plank.add(band);
    const rune = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.26, 20), glowMat({ color: z.hue, side: THREE.DoubleSide, opacity: 0.9 }));
    rune.position.set(2.4, 0, 0.14);
    plank.add(rune);
    plank.position.set(0, 3.2 + i * 1.0, 0);
    plank.rotation.y = Math.atan2(-dz, dx);
    g.add(plank);
    g.add(glowSprite(Math.cos(Math.atan2(-dz, dx)) * 3.8, 3.2 + i * 1.0, -Math.sin(Math.atan2(-dz, dx)) * 3.8, 2.4, z.hue, 0.45));
  }
  const rb = makeRibbon(3.2, 0.7);
  rb.position.set(0.7, 9.2, 0);
  rb.rotation.y = 0.6;
  g.add(rb);
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
  return g;
}

/**
 * The Seal: a gate that shuts the road to the Edge. Two pillars, a lintel with five sockets (one for each guardian's light) and a door of thorns that opens when all five are lit.
 * `lit` says how many sockets are lit (0..5). Local: the gate faces +z.
 */
export function makeSeal(lit = 5): THREE.Group {
  const g = new THREE.Group();
  const rock = std({ vertexColors: true, roughness: 0.9, vary: 0.5, bump: 1.8, rim: { color: 0x9fb0d0, k: 0.45 } });
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    parts.push(rockBox(6.4, 30, 6.4, 7 + sx, stone, 0.1).translate(sx * 15, 15, 0));
    parts.push(rockBox(9, 3, 9, 8 + sx, stone, 0.1).translate(sx * 15, 1.5, 0));
    parts.push(rockBox(7.4, 2.4, 7.4, 9 + sx, stone, 0.1).translate(sx * 15, 31, 0));
  }
  parts.push(rockBox(40, 6, 7.2, 11, stone, 0.08).translate(0, 33.5, 0));
  parts.push(rockBox(30, 3.4, 6.4, 12, stone, 0.08).translate(0, 38.2, 0));
  g.add(new THREE.Mesh(merge(parts), rock));
  // the sockets and what lights them
  const hues = [0x6ff0ff, 0xffa04a, 0xd9b8ff, 0xf4efe0, 0xff8aa8];
  hues.forEach((h, i) => {
    const x = (i - 2) * 6.4;
    const y = 33.6 - Math.abs(i - 2) * 0.0;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.4, 8, 24), std({ color: 0x2a2e36, roughness: 0.6, metalness: 0.5 }));
    ring.position.set(x, y, 3.7);
    g.add(ring);
    const on = i < lit;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 1), on ? new THREE.MeshBasicMaterial({ color: h }) : new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.3 }));
    gem.position.set(x, y, 3.8);
    g.add(gem);
    if (on) {
      g.add(glowSprite(x, y, 4.4, 5.6, h, 0.4));
      const l = new THREE.PointLight(h, 26, 40, 1.6);
      l.position.set(x, y - 1, 7);
      g.add(l);
    }
  });
  // the door: black thorn vines grown across it, a seam of light between the leaves
  const r = rng(19);
  const vines: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const x0 = -12 + r() * 24;
    const pts = [V(x0, 0.5, 2), V(x0 + (r() - 0.5) * 8, 10 + r() * 6, 2.8), V(x0 + (r() - 0.5) * 14, 18 + r() * 8, 2.4), V((r() - 0.5) * 20, 27 + r() * 3, 2.6)];
    const path = new THREE.CatmullRomCurve3(pts).getPoints(16);
    vines.push(tube(path, path.map((_, k) => 0.55 * (1 - 0.55 * (k / 16))), 5, (t, a) => mixRgb(lin(0x05090a), lin(0x14282a), a)));
    for (let t = 0; t < 4; t++) {
      const k = 3 + t * 3;
      const p0 = path[k]!;
      vines.push(tube([p0, p0.clone().add(V((r() - 0.5) * 2.4, 0.8 + r() * 1.4, 0.8 + r()))], [0.22, 0.01], 4, () => lin(0x14282a)));
    }
  }
  g.add(new THREE.Mesh(merge(vines), std({ vertexColors: true, roughness: 0.7, rim: { color: 0xf4efe0, k: 0.6 } })));
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 28), glowMat({ color: 0xf4efe0, opacity: 0.7, side: THREE.DoubleSide }));
  seam.position.set(0, 15, 1.9);
  g.add(seam);
  g.add(glowSprite(0, 15, 3, 16, 0xf4efe0, 0.08));
  g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
  return g;
}

const dotTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (!t) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.7)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      t = new THREE.CanvasTexture(c);
    }
    return t;
  };
})();

/** the sky of eyes: every star is a pair of eyes, a few are open wide, and far to the north one is huge */
export function skyEyes(center: THREE.Vector3, o: { n?: number; below?: boolean; huge?: [number, number, number]; color?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const r = rng(404);
  const n = o.n ?? 320;
  const pos: number[] = [];
  const col: number[] = [];
  const size: number[] = [];
  const c = new THREE.Color();
  const R = 1250;
  for (let i = 0; i < n; i++) {
    const az = r() * Math.PI * 2;
    const el = (o.below ? -1 + 2 * r() : 0.03 + r() * 0.97) * (Math.PI / 2);
    const dir = V(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const side = V(Math.cos(az), 0, -Math.sin(az));
    const gap = 0.0048 + r() * 0.004;
    const big = r() < 0.07;
    for (const s of [-1, 1]) {
      const d = dir.clone().addScaledVector(side, s * gap * (big ? 1.7 : 1)).normalize();
      pos.push(center.x + d.x * R, center.y + d.y * R, center.z + d.z * R);
      c.setHex(r() < 0.55 ? (o.color ?? 0xff6a6a) : 0xfff0e0);
      const k = (big ? 1.2 : 0.5) + r() * 0.5;
      col.push(c.r * k, c.g * k, c.b * k);
      size.push(big ? 11 : 4.5 + r() * 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { uMap: { value: dotTex() } },
    vertexShader: /* glsl */ `attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 1200.0 / -mv.z * 0.55; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform sampler2D uMap; varying vec3 vC; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * t.a, 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -5;
  g.add(pts);
  if (o.huge) {
    // one great eye, half open, low over the horizon
    const dir = V(o.huge[0], o.huge[1], o.huge[2]).normalize();
    const eye = new THREE.Group();
    const lid = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0x14060a, transparent: true, opacity: 0.0, fog: false }));
    eye.add(lid);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    lens.scale.set(140, 52, 1);
    eye.add(lens);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x050204, fog: false }));
    pupil.scale.set(11, 50, 1);
    pupil.position.z = 0.5;
    eye.add(pupil);
    const halo = glowSprite(0, 0, -1, 520, 0xff2a3a, 0.35);
    eye.add(halo);
    eye.position.copy(center).addScaledVector(dir, 1100);
    eye.lookAt(center);
    eye.renderOrder = -4;
    g.add(eye);
  }
  return g;
}

/** a crack in the sky: a jagged line of white light, with the world coming apart into cubes along it */
export function skyCrack(center: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, seed = 5): THREE.Group {
  const g = new THREE.Group();
  const r = rng(seed);
  const pts: THREE.Vector3[] = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = from.clone().lerp(to, t);
    const jit = (1 - Math.abs(t - 0.5) * 1.2) * 0.085;
    p.add(V((r() - 0.5) * jit, (r() - 0.5) * jit * 0.7, (r() - 0.5) * jit));
    pts.push(p);
  }
  const R = 1100;
  const world = pts.map((p) => center.clone().add(p.clone().normalize().multiplyScalar(R)));
  g.add(new THREE.Mesh(tube(world, world.map((_, i) => 1.4 + 1.8 * Math.sin((i / N) * Math.PI)), 5, () => lin(0xffffff), false), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })));
  g.add(new THREE.Mesh(tube(world, world.map((_, i) => 9 + 12 * Math.sin((i / N) * Math.PI)), 6, () => lin(0x9a8aff), false), new THREE.MeshBasicMaterial({ color: 0x4a3aa8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
  for (const w of world.filter((_, i) => i % 3 === 0)) g.add(glowSprite(w.x, w.y, w.z, 120, 0xb8a8ff, 0.35));
  // cubes: the world coming apart
  for (let i = 0; i < 90; i++) {
    const w = world[Math.floor(r() * world.length)]!;
    const s = 2 + r() * r() * 14;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.62 + r() * 0.1, 0.5, 0.75 + r() * 0.2), fog: false, transparent: true, opacity: 0.9 }));
    cube.position.copy(w).add(V((r() - 0.5) * 160, (r() - 0.5) * 160 - 20, (r() - 0.5) * 160));
    cube.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(cube);
  }
  return g;
}

/** a tall thin pillar of light that stands on a guardian's arena and shows up through the mist, so you always know where you are going */
export function beacon(x: number, y: number, z: number, hue: number, h = 170, k = 0.28): THREE.Mesh {
  return beam(V(x, y + h, z), V(x, y, z), 2.6, 7.5, hue, k);
}

/** a dotted trail of pink light along the roads: the thread you follow to find them */
export function trail(gy: (x: number, z: number) => number, roads: number[] = [0, 1, 2, 3, 5]): THREE.Points {
  const pos: number[] = [];
  for (const ri of roads) {
    const rd = ROADS3[ri]!;
    for (let i = 0; i + 1 < rd.pts.length; i++) {
      const a = rd.pts[i]!;
      const b = rd.pts[i + 1]!;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.floor(L / 3.2);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        pos.push(x + Math.sin(z * 0.3) * rd.hw * 0.3, gy(x, z) + 0.55, z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ size: 2.4, map: dotTex(), color: 0xff7ab8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false });
  const p = new THREE.Points(geo, m);
  p.frustumCulled = false;
  return p;
}

/** what a guardian's attack looks like on the floor before it lands: a ring of light with a gap you can step through, or a lane */
export function telegraph(kind: 'ring' | 'lane' | 'cone', hue: number, a: number, b: number, o: { gap?: number; gapAt?: number; len?: number; op?: number } = {}): THREE.Mesh {
  let geo: THREE.BufferGeometry;
  if (kind === 'ring') {
    const gap = o.gap ?? 0.9;
    geo = new THREE.RingGeometry(a, b, 96, 1, (o.gapAt ?? 0) + gap / 2, Math.PI * 2 - gap);
  } else if (kind === 'lane') {
    geo = new THREE.PlaneGeometry(a, o.len ?? 40);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -(o.len ?? 40) / 2);
  } else {
    geo = new THREE.CircleGeometry(b, 48, -Math.PI / 2 - a / 2, a);
    geo.rotateX(-Math.PI / 2);
  }
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hue, transparent: true, opacity: o.op ?? 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  if (kind === 'ring') m.rotation.x = -Math.PI / 2;
  m.renderOrder = 4;
  return m;
}

void fogged;
