import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, TAU } from '../core/util';
import { EAST, GROUND, groundY, STONE_RAMP, TERRACE_H, TREE_RAMP, WEST } from './ground';

/**
 * THE CRATER: where the 3D fights happen. A moonlit hollow in the same teal forest as the 2D part.
 *
 *   the floor      flat moss and earth, worn bare in the middle; the forest rises in a wall around it
 *   terraces       west (the Moonwell's) and east, low, with rocky cliff edges; up by a stone ramp and by a fallen tree
 *   cover          standing stones (they crumble, as the old pillars did), a hollow log and a giant stump (they do not)
 *   the ferns      a thicket to hide in: what hunts by sight loses you there
 *   the Moonwell   a pool of moonlight on the west terrace (it heals slowly: see features.ts)
 *
 * Everything static is merged into a few meshes (one per material), so the whole place is a handful of draw calls. Its shadows
 * are drawn once (`shadowDirty`), not every frame.
 */

/** the fighting floor: a circle of this radius, cut off on the boss's side (no nearer to him than the old floor went: the
 * Mash's bell reaches out to z = -17.3) */
export const FLOOR_R = 22;
export const FAR_Z = -17;
/** the Moonwell */
export const WELL = { x: -18.6, z: -5.5, r: 2.0 };
/** the fern thicket you can hide in */
export const FERNS = { x: 10.5, z: 11.5, r: 3.4 };
/** cover: standing stones (they crumble) and the log and stump (they do not) */
export const STONES: [number, number][] = [
  [5.3, 3.3],
  [-5.3, 3.3],
  [-4.6, -7.6],
  [5.6, -7.4],
  [12.4, -10.5],
  [-2.5, -13.6],
  [3.2, 13.5],
  [-13.5, 10.5],
];
export const LOG = { x: -9.6, z: -4.5, ang: 0.36, len: 7.2, r: 1.25 };
export const STUMP = { x: 9.6, z: -14.6, r: 1.9 };

export interface Cover {
  x: number;
  z: number;
  r: number;
  hp: number;
  alive: boolean;
  g: THREE.Group;
  /** it does not crumble (the log, the stump) */
  keep?: boolean;
}

const MOON_DIR = new THREE.Vector3(-0.22, 0.6, -1).normalize();

/* ---------------------------------------------------------------- */
/* small tools                                                       */
/* ---------------------------------------------------------------- */

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x: number, y: number, o = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < o; i++) {
    s += a * noise(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** a tileable texture of soft blots: fast to draw (no per-pixel noise), good enough for moss, bark and stone */
function blotTex(size: number, base: string, blots: [string, number, number, number][], repeat: [number, number], streak = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const r = rng(size + blots.length);
  for (const [col, n, rmin, rmax] of blots) {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = r() * size;
      const y = r() * size;
      const rad = rmin + r() * (rmax - rmin);
      // drawn again across the edges, so the texture tiles
      for (const ox of [-size, 0, size])
        for (const oy of [-size, 0, size]) {
          if (Math.abs(x + ox - size / 2) > size / 2 + rad || Math.abs(y + oy - size / 2) > size / 2 + rad * streak) continue;
          g.beginPath();
          g.ellipse(x + ox, y + oy, rad, rad * streak, 0, 0, TAU);
          g.fill();
        }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** geometries collected under one material, merged into one mesh at the end */
class Batch {
  private parts: THREE.BufferGeometry[] = [];
  constructor(private colors = false) {}
  add(geo: THREE.BufferGeometry, m?: THREE.Matrix4) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (this.colors && !g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
    if (!this.colors && g.getAttribute('color')) g.deleteAttribute('color');
    this.parts.push(g);
  }
  build(mat: THREE.Material, shadows = true): THREE.Mesh | null {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = shadows;
    m.receiveShadow = true;
    return m;
  }
}

/* ---------------------------------------------------------------- */
/* the land                                                          */
/* ---------------------------------------------------------------- */

/** the height of the land as it is drawn: the floor (see ground.ts) inside, the crater wall and the forest floor outside */
export function landY(x: number, z: number): number {
  // (in the Fourth's fold there is no crater: the floor is flat as far as you can see)
  if (GROUND.flat) return 0;
  const r = Math.hypot(x, z);
  let h = groundY(x, z);
  // the wall stands further back behind the boss (he needs the room), close everywhere else
  const north = sm(0.15, 0.7, -z / (r || 1));
  const start = 24 + north * 12;
  const w = sm(start, start + 12, r + fbm(x * 0.08, z * 0.08, 3) * 3);
  h += w * (6.5 + fbm(x * 0.04 + 3, z * 0.04, 3) * 3);
  // outside the fighting floor the ground is never quite flat
  if (r > FLOOR_R + 0.6) h += sm(FLOOR_R + 0.6, FLOOR_R + 4, r) * fbm(x * 0.3, z * 0.3, 3) * 0.35;
  return h;
}

export class Crater {
  readonly group = new THREE.Group();
  readonly cover: Cover[] = [];
  /** the trunks round the crater (where the Collector pins his specimens): foot, radius, height */
  readonly trunks: { x: number; y: number; z: number; r: number; h: number }[] = [];
  /** the shadows must be drawn again (the land has moved, a stone has fallen) */
  shadowDirty = true;
  private grassMat!: THREE.MeshLambertMaterial;
  private flowerMat!: THREE.MeshBasicMaterial;
  private fire!: THREE.Points;
  private fireBase: Float32Array = new Float32Array(0);
  private mist: THREE.Mesh[] = [];
  private glow = glowTex();
  private r = rng(17);
  readonly moonDir = MOON_DIR.clone();
  /** the sky's own objects (they live in the scene, not in the group) */
  private skyObjs: THREE.Object3D[] = [];
  private shown = true;

  constructor(private scene: THREE.Scene) {
    this.buildSky();
    this.buildLand();
    this.buildForest();
    this.buildProps();
    this.buildPlants();
    this.buildAir();
    this.group.traverse((o) => (o.userData['noGround'] = true));
  }

  private R(a: number, b: number) {
    return a + (b - a) * this.r();
  }

  /* ---- the sky: a gradient, stars and the moon ---- */

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(290, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uMoon: { value: MOON_DIR } },
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vD; uniform vec3 uMoon;
          void main(){
            float h = clamp(vD.y, -0.2, 1.0);
            vec3 c = mix(vec3(0.075,0.21,0.27), vec3(0.012,0.028,0.065), pow(max(h,0.0), 0.5));
            float m = max(dot(vD, uMoon), 0.0);
            c += vec3(0.4,0.8,0.85) * pow(m, 60.0) * 0.5 + vec3(0.2,0.5,0.55) * pow(m, 8.0) * 0.16;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);
    this.skyObjs.push(sky);
    const n = 900;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(this.R(-1, 1), this.R(0.12, 1), this.R(-1, 1)).normalize().multiplyScalar(270);
      p.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcff6ff, size: 1.5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75, depthWrite: false }));
    stars.frustumCulled = false;
    this.scene.add(stars);
    this.skyObjs.push(stars);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const cg = c.getContext('2d')!;
    const gr = cg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, '#f2fffd');
    gr.addColorStop(0.44, '#d0f8f2');
    gr.addColorStop(0.48, '#9ff4ee');
    gr.addColorStop(0.5, 'rgba(159,244,238,0)');
    cg.fillStyle = gr;
    cg.fillRect(0, 0, 128, 128);
    cg.globalAlpha = 0.1;
    cg.fillStyle = '#5a9a9a';
    const r = rng(3);
    for (let i = 0; i < 12; i++) {
      cg.beginPath();
      cg.arc(64 + (r() - 0.5) * 50, 64 + (r() - 0.5) * 50, 4 + r() * 9, 0, TAU);
      cg.fill();
    }
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false }));
    moon.position.copy(MOON_DIR).multiplyScalar(260);
    moon.scale.setScalar(46);
    this.scene.add(moon);
    this.skyObjs.push(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0x5fc8c0, fog: false, depthWrite: false, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending }));
    halo.position.copy(moon.position);
    halo.scale.setScalar(190);
    this.scene.add(halo);
    this.skyObjs.push(halo);
  }

  /* ---- the ground: a fine ring of mesh for the floor and the wall, a coarse one for the forest beyond ---- */

  private buildLand() {
    const detail = blotTex(
      256,
      '#8a8a8a',
      [
        ['rgba(40,40,40,0.18)', 260, 3, 14],
        ['rgba(255,255,255,0.12)', 220, 2, 9],
        ['rgba(20,20,20,0.25)', 500, 0.6, 2],
      ],
      [1, 1],
    );
    detail.repeat.set(18, 18);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail, bumpMap: detail, bumpScale: 0.9 });
    const colorAt = (x: number, z: number, h: number, slope: number, c: THREE.Color) => {
      const soil = new THREE.Color(0x3a2f22);
      const moss = new THREE.Color(0x335f47);
      const mossL = new THREE.Color(0x4a8560);
      const stone = new THREE.Color(0x4e555c);
      const teal = new THREE.Color(0x1f4c4e);
      const n1 = fbm(x * 0.15, z * 0.15) * 0.5 + 0.5;
      const n2 = fbm(x * 0.8 + 7, z * 0.8, 3) * 0.5 + 0.5;
      c.copy(soil).lerp(moss, sm(0.32, 0.62, n1));
      c.lerp(mossL, sm(0.6, 0.85, n2) * 0.45);
      c.lerp(teal, sm(0.45, 0.9, fbm(x * 0.05, z * 0.05) * 0.5 + 0.5) * 0.4);
      c.lerp(stone, sm(0.3, 0.9, slope));
      // a worn earth middle where the fights happen
      const r = Math.hypot(x, z);
      c.lerp(soil, (1 - sm(3, 12, r)) * 0.5 * (0.5 + 0.5 * n2));
      void h;
      return c;
    };
    const finish = (g: THREE.BufferGeometry) => {
      const p = g.getAttribute('position');
      const col = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        const e = 0.35;
        const slope = Math.min(1, Math.hypot(landY(x + e, z) - landY(x - e, z), landY(x, z + e) - landY(x, z - e)) / (2 * e) / 1.2);
        colorAt(x, z, p.getY(i), slope, c);
        col.set([c.r, c.g, c.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
    };
    // the fine ring: the floor, the terraces with their sharp edges, the foot of the wall
    const inner = new THREE.RingGeometry(0, 27, 170, 84);
    inner.rotateX(-Math.PI / 2);
    {
      const p = inner.getAttribute('position');
      for (let i = 0; i < p.count; i++) p.setY(i, landY(p.getX(i), p.getZ(i)));
      finish(inner);
    }
    const a = new THREE.Mesh(inner, mat);
    a.receiveShadow = true;
    this.group.add(a);
    // the coarse land beyond (pushed back in depth where the two meet, so the fine one wins)
    const outer = new THREE.PlaneGeometry(240, 240, 80, 80);
    outer.rotateX(-Math.PI / 2);
    {
      const p = outer.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        p.setY(i, Math.hypot(x, z) < 24.5 ? landY(x, z) - 3 : landY(x, z));
      }
      finish(outer);
    }
    const omat = mat.clone();
    omat.polygonOffset = true;
    omat.polygonOffsetFactor = 2;
    omat.polygonOffsetUnits = 4;
    const b = new THREE.Mesh(outer, omat);
    b.receiveShadow = true;
    this.group.add(b);
  }

  /* ---- the forest round the crater ---- */

  private barkMat(dark: boolean) {
    const t = blotTex(
      128,
      dark ? '#2a241e' : '#4a3d30',
      [
        ['rgba(0,0,0,0.35)', 160, 1, 3],
        ['rgba(255,255,255,0.08)', 120, 1, 2.5],
      ],
      [2, 3],
      6,
    );
    return new THREE.MeshLambertMaterial({ map: t, bumpMap: t, bumpScale: 1.5, color: dark ? 0x9a948c : 0xffffff });
  }

  /** a trunk along a gently bent line, wide at the foot, with roots splayed on the ground */
  private trunkGeos(base: THREE.Vector3, height: number, rad: number, lean: THREE.Vector2, out: Batch) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(new THREE.Vector3(base.x + lean.x * t * t * height + Math.sin(t * 5 + base.x) * 0.35, base.y + t * height, base.z + lean.y * t * t * height + Math.cos(t * 4 + base.z) * 0.35));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const seg = 14;
    const radial = 7;
    const tube = new THREE.TubeGeometry(curve, seg, rad, radial, false);
    const p = tube.getAttribute('position');
    const v = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const ring = Math.floor(i / (radial + 1));
      const t = ring / seg;
      curve.getPointAt(Math.min(1, t), c);
      v.fromBufferAttribute(p, i).sub(c);
      const k = (1 - t * 0.6) * (1 + 0.55 * Math.pow(1 - t, 10));
      v.multiplyScalar(k);
      p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
    }
    tube.computeVertexNormals();
    out.add(tube);
    const nr = 4 + Math.floor(this.r() * 3);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * TAU + this.R(-0.3, 0.3);
      const len = rad * this.R(2.6, 4.5);
      const rp: THREE.Vector3[] = [];
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        const x = base.x + Math.cos(a) * (rad * 0.6 + len * t);
        const z = base.z + Math.sin(a) * (rad * 0.6 + len * t);
        rp.push(new THREE.Vector3(x, landY(x, z) + rad * 1.5 * (1 - t) * (1 - t) - 0.1, z));
      }
      out.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp), 6, rad * 0.28 * this.R(0.8, 1.2), 5, false));
    }
    return curve.getPointAt(1);
  }

  private buildForest() {
    const bark = new Batch();
    const cards: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const canopy = (c: THREE.Vector3, r: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(this.R(-1, 1), this.R(-0.6, 1), this.R(-1, 1));
        if (v.length() > 1) continue;
        v.multiplyScalar(r).add(c);
        e.set(this.R(0, 3), this.R(0, 6), this.R(0, 3));
        q.setFromEuler(e);
        const s = this.R(2.4, 3.8);
        cards.push(m.compose(v, q, new THREE.Vector3(s, s, s)).clone());
      }
    };
    const N = 40;
    // the cage hangs in a gap in the forest (it must be seen, close up, from the floor): no trees in front of it
    const cageA = Math.atan2(-44, 13);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + this.R(-0.05, 0.05);
      const off = Math.abs(Math.atan2(Math.sin(a - cageA), Math.cos(a - cageA)));
      if (off < 0.42) continue;
      const north = -Math.sin(a) > 0.4;
      const r = this.R(north ? 46 : 41, north ? 66 : 60);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = this.R(26, 40);
      const rad = this.R(0.9, 1.6);
      this.trunks.push({ x, y: landY(x, z), z, r: rad, h });
      const top = this.trunkGeos(new THREE.Vector3(x, landY(x, z) - 0.3, z), h, rad, new THREE.Vector2(-x * 0.004, -z * 0.004), bark);
      canopy(top, this.R(6, 9), 60);
      canopy(top.clone().add(new THREE.Vector3(-x * 0.08, -6, -z * 0.08)), this.R(4, 6), 32);
      for (let b = 0; b < 2; b++) {
        const st = new THREE.Vector3(x, landY(x, z) + h * this.R(0.45, 0.8), z);
        const en = st.clone().add(new THREE.Vector3(-x * this.R(0.1, 0.2) + this.R(-3, 3), this.R(1, 5), -z * this.R(0.1, 0.2) + this.R(-3, 3)));
        const mid = st.clone().lerp(en, 0.5).add(new THREE.Vector3(0, this.R(-1, 2), 0));
        bark.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(st, mid, en), 6, this.R(0.18, 0.32), 5, false));
        canopy(en, this.R(3, 4.5), 22);
      }
    }
    const trunks = bark.build(this.barkMat(true));
    if (trunks) {
      this.group.add(trunks);
      this.heavy.push(trunks);
    }
    // leaves: cards cut out of a painted clump
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const lr = rng(8);
    for (let i = 0; i < 22; i++) {
      g.save();
      g.translate(16 + lr() * 96, 16 + lr() * 96);
      g.rotate(lr() * 7);
      const l = 10 + lr() * 12;
      g.fillStyle = `rgb(${(20 + lr() * 20) | 0},${(55 + lr() * 35) | 0},${(55 + lr() * 25) | 0})`;
      g.beginPath();
      g.ellipse(0, 0, l, l * 0.38, 0, 0, TAU);
      g.fill();
      g.restore();
    }
    const lt = new THREE.CanvasTexture(c);
    lt.colorSpace = THREE.SRGBColorSpace;
    const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: lt, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xa8c4bc }), cards.length);
    cards.forEach((mm, i) => leaves.setMatrixAt(i, mm));
    this.group.add(leaves);
    this.heavy.push(leaves);
  }

  /* ---- what stands in the crater ---- */

  /** a rough stone, mossy where it faces up */
  private rockGeo(sx: number, sy: number, sz: number, mossy = 0.6, detail = 1): THREE.BufferGeometry {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.getAttribute('position');
    const v = new THREE.Vector3();
    const o = this.R(0, 100);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      v.multiplyScalar(1 + fbm(v.x * 1.6 + o, v.y * 1.6 + v.z * 1.3, 3) * 0.3);
      v.y = Math.sign(v.y) * Math.pow(Math.abs(v.y), 0.8) * 0.9;
      v.set(v.x * sx, v.y * sy, v.z * sz);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const n = g.getAttribute('normal');
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    const base = new THREE.Color(0x626a72);
    const dark = new THREE.Color(0x40464c);
    const moss = new THREE.Color(0x356a4c);
    for (let i = 0; i < p.count; i++) {
      c.copy(base).lerp(dark, this.r() * 0.5);
      c.lerp(moss, sm(0.35, 0.85, n.getY(i)) * mossy);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }

  private stoneMat() {
    const t = blotTex(
      128,
      '#9a9a9a',
      [
        ['rgba(0,0,0,0.2)', 140, 2, 8],
        ['rgba(255,255,255,0.15)', 90, 1, 5],
      ],
      [2, 2],
    );
    return new THREE.MeshLambertMaterial({ vertexColors: true, map: t, bumpMap: t, bumpScale: 2 });
  }

  private buildProps() {
    const stone = new Batch(true);
    const bark = new Batch();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const put = (b: Batch, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
      q.setFromEuler(new THREE.Euler(rx, ry, rz));
      b.add(g, m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
    };
    const stoneMat = this.stoneMat();
    const barkMat = this.barkMat(false);

    // the terraces' cliff edges: a broken line of boulders
    const edge = (b: typeof WEST, n: number) => {
      for (let i = 0; i < n; i++) {
        // walk round the box's outline
        const per = 2 * (b.hx + b.hz);
        let s = (i / n) * per * 2;
        let x: number;
        let z: number;
        if (s < 2 * b.hx) {
          x = b.x - b.hx + s;
          z = b.z - b.hz;
        } else if ((s -= 2 * b.hx) < 2 * b.hz) {
          x = b.x + b.hx;
          z = b.z - b.hz + s;
        } else if ((s -= 2 * b.hz) < 2 * b.hx) {
          x = b.x + b.hx - s;
          z = b.z + b.hz;
        } else {
          s -= 2 * b.hx;
          x = b.x - b.hx;
          z = b.z + b.hz - s;
        }
        // not on the ramps, not out in the wall
        if (Math.hypot(x, z) > FLOOR_R + 2) continue;
        if (x < -9 && x > -15.5 && z > STONE_RAMP.z0 - 0.6 && z < STONE_RAMP.z1 + 0.6) continue;
        const tr = TREE_RAMP;
        const lx = tr.bx - tr.ax;
        const lz = tr.bz - tr.az;
        const t = Math.min(1, Math.max(0, ((x - tr.ax) * lx + (z - tr.az) * lz) / (lx * lx + lz * lz)));
        if (Math.hypot(x - (tr.ax + lx * t), z - (tr.az + lz * t)) < tr.half + 1.2) continue;
        // the boulders sit on the cliff line, half in the terrace (they are its face)
        const cx = x + (x > b.x ? -0.25 : 0.25) * (Math.abs(x - b.x) > b.hx - 0.1 ? 1 : 0);
        const cz = z + (z > b.z ? -0.25 : 0.25) * (Math.abs(z - b.z) > b.hz - 0.1 ? 1 : 0);
        put(stone, this.rockGeo(this.R(0.55, 0.95), this.R(0.45, 0.65), this.R(0.55, 0.9), 0.75), cx, this.R(0.1, 0.3), cz, this.R(0, 6));
      }
    };
    edge(WEST, 46);
    edge(EAST, 40);

    // the stone ramp: worn slabs, and broken posts at its sides
    {
      const s = STONE_RAMP;
      for (let i = 0; i < 8; i++) {
        const t = (i + 0.5) / 8;
        const x = s.x0 + (s.x1 - s.x0) * t;
        for (let j = 0; j < 3; j++) {
          const z = s.z0 + 0.5 + j * 1.0 + this.R(-0.08, 0.08);
          put(stone, this.rockGeo(0.42, 0.14, 0.52, 0.25), x, groundY(x, z) - 0.08, z, this.R(-0.15, 0.15));
        }
      }
      for (const [x, z, h] of [
        [s.x0 - 0.4, s.z0 - 0.45, 0.8],
        [s.x0 - 3, s.z0 - 0.45, 1.1],
        [s.x0 - 0.6, s.z1 + 0.45, 0.9],
        [s.x0 - 3.4, s.z1 + 0.45, 1.3],
      ] as [number, number, number][])
        put(stone, this.rockGeo(0.3, h, 0.3, 0.5), x, groundY(x, z) + h * 0.6, z);
    }

    // the fallen tree: its back is the way up to the east terrace (its top follows the floor's height there exactly)
    {
      const tr = TREE_RAMP;
      const a = new THREE.Vector3(tr.ax - (tr.bx - tr.ax) * 0.12, 0, tr.az - (tr.bz - tr.az) * 0.12);
      const b = new THREE.Vector3(tr.bx + (tr.bx - tr.ax) * 0.1, TERRACE_H.east, tr.bz + (tr.bz - tr.az) * 0.1);
      const R = 1.15;
      const curve = new THREE.LineCurve3(a.clone().setY(groundY(a.x, a.z) - R * 0.85), b.clone().setY(TERRACE_H.east - R * 0.85));
      const seg = 30;
      const radial = 12;
      const g = new THREE.TubeGeometry(curve, seg, R, radial, false);
      const p = g.getAttribute('position');
      const v = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        const t = Math.floor(i / (radial + 1)) / seg;
        curve.getPointAt(t, c);
        v.fromBufferAttribute(p, i).sub(c);
        v.multiplyScalar(1 + 0.06 * Math.sin(Math.atan2(v.y, v.x) * 6 + t * 30));
        p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
      }
      g.computeVertexNormals();
      bark.add(g);
      // the torn-up roots at its foot
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU;
        const st = a.clone().setY(0.3);
        const en = st.clone().add(new THREE.Vector3(Math.cos(ang) * this.R(0.9, 1.6), Math.abs(Math.sin(ang)) * this.R(0.5, 1.1), Math.sin(ang) * this.R(0.9, 1.6) - 0.4));
        bark.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(st, st.clone().lerp(en, 0.5).add(new THREE.Vector3(0, 0.6, 0)), en), 5, this.R(0.08, 0.2), 5, false));
      }
      // moss along its back
      for (let i = 0; i < 16; i++) {
        const t = this.R(0.1, 0.9);
        const x = tr.ax + (tr.bx - tr.ax) * t + this.R(-0.3, 0.3);
        const z = tr.az + (tr.bz - tr.az) * t + this.R(-0.3, 0.3);
        put(stone, this.rockGeo(this.R(0.25, 0.5), 0.06, this.R(0.25, 0.45), 1), x, groundY(x, z) + 0.02, z);
      }
    }

    // the hollow log (cover, three solid circles along it)
    {
      const L = LOG;
      const outer = new THREE.CylinderGeometry(L.r, L.r * 1.08, L.len, 16, 6, true);
      const inner = new THREE.CylinderGeometry(L.r * 0.74, L.r * 0.8, L.len, 16, 6, true);
      for (const g of [outer, inner]) {
        const p = g.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const k = 1 + fbm(Math.atan2(p.getZ(i), p.getX(i)) * 2, p.getY(i) * 0.6, 3) * 0.12;
          p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
        }
        g.computeVertexNormals();
      }
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(outer, barkMat));
      const innerM = new THREE.Mesh(inner, new THREE.MeshLambertMaterial({ color: 0x1a120c, side: THREE.BackSide }));
      grp.add(innerM);
      for (const s of [-1, 1]) {
        const rim = new THREE.Mesh(new THREE.RingGeometry(L.r * 0.74, L.r * 1.06, 16), new THREE.MeshLambertMaterial({ color: 0x5a4632, side: THREE.DoubleSide }));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = (s * L.len) / 2;
        grp.add(rim);
      }
      grp.rotation.set(0, L.ang, Math.PI / 2);
      grp.position.set(L.x, L.r * 0.92, L.z);
      grp.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      this.group.add(grp);
      const dx = Math.cos(L.ang);
      const dz = -Math.sin(L.ang);
      for (const t of [-2.4, 0, 2.4]) this.cover.push({ x: L.x + dx * t, z: L.z + dz * t, r: L.r, hp: Infinity, alive: true, g: grp, keep: true });
      for (let i = 0; i < 10; i++) {
        const t = this.R(-3, 3);
        put(stone, this.rockGeo(this.R(0.3, 0.6), 0.1, this.R(0.3, 0.5), 1), L.x + dx * t, L.r * 1.85, L.z + dz * t);
      }
    }

    // the giant stump (cover)
    {
      const S = STUMP;
      const st = new THREE.CylinderGeometry(S.r, S.r * 1.3, 2.8, 20, 3, true);
      const p = st.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 + 0.1 * Math.sin(a * 7) + 0.05 * Math.sin(a * 17);
        let y = p.getY(i);
        if (y > 1) y += Math.sin(a * 5) * 0.45 + 0.25 * Math.sin(a * 11);
        p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
      }
      st.computeVertexNormals();
      put(bark, st, S.x, 1.3, S.z);
      const top = new THREE.CircleGeometry(S.r * 0.98, 20);
      top.rotateX(-Math.PI / 2);
      put(bark, top, S.x, 2.6, S.z);
      this.trunkGeos(new THREE.Vector3(S.x, -0.2, S.z), 0.4, S.r, new THREE.Vector2(), bark);
      const g = new THREE.Group();
      this.cover.push({ x: S.x, z: S.z, r: S.r * 1.1, hp: Infinity, alive: true, g, keep: true });
      this.group.add(g);
    }

    // standing stones: the ruin of a ring. These crumble (a beam, a rolling shell) and stand again each phase.
    for (const [x, z] of STONES) {
      const g = new THREE.Group();
      const b = new Batch(true);
      const h = this.R(1.5, 2.1);
      b.add(this.rockGeo(0.62, h, 0.5, 0.5, 2), m.compose(new THREE.Vector3(0, h * 0.85, 0), q.setFromEuler(new THREE.Euler(this.R(-0.06, 0.06), this.R(0, 6), this.R(-0.08, 0.08))), new THREE.Vector3(1, 1, 1)));
      b.add(this.rockGeo(0.5, 0.3, 0.45, 0.8), m.compose(new THREE.Vector3(this.R(-0.6, 0.6), 0.12, this.R(-0.6, 0.6)), q.identity(), new THREE.Vector3(1, 1, 1)));
      const mesh = b.build(stoneMat);
      if (mesh) g.add(mesh);
      g.position.set(x, 0, z);
      this.group.add(g);
      this.cover.push({ x, z, r: 0.9, hp: 0.85, alive: true, g });
    }

    // the Moonwell's stonework: a ring of old stones and a broken arch over it
    {
      const W = WELL;
      const y = groundY(W.x, W.z);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        put(stone, this.rockGeo(0.42, 0.22, 0.32, 0.6), W.x + Math.cos(a) * (W.r + 0.15), y + 0.05, W.z + Math.sin(a) * (W.r + 0.15), -a);
      }
      for (const s of [-1, 1]) put(stone, this.rockGeo(0.36, 1.7, 0.36, 0.6), W.x - 1.4, y + 1.35, W.z + s * 2.7);
      const arch = new THREE.TorusGeometry(2.7, 0.26, 7, 16, Math.PI * 0.62);
      const n = arch.getAttribute('position').count;
      arch.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.42), 3));
      put(stone, arch, W.x - 1.4, y + 2.7, W.z, Math.PI / 2, 0, 0.15);
    }

    // root arches out of the crater wall (high: you pass under them)
    for (const [ax, az, bx, bz, h] of [
      [23, -17, 15, -12.5, 3.2],
      [-23, 12, -16.5, 16.5, 2.8],
      [9, 24, 2.5, 19.5, 2.6],
    ] as [number, number, number, number, number][]) {
      const a = new THREE.Vector3(ax, landY(ax, az) - 0.4, az);
      const b = new THREE.Vector3(bx, landY(bx, bz) - 0.5, bz);
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, h, 0));
      bark.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.6, 8, false));
      bark.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a.clone().add(new THREE.Vector3(0.7, 0, 0.9)), mid.clone().add(new THREE.Vector3(0.5, -0.7, 0.7)), b.clone().add(new THREE.Vector3(1.2, 0, 0.3))), 12, 0.32, 6, false));
    }

    // boulders scattered on the slopes of the wall
    for (let i = 0; i < 26; i++) {
      const a = this.R(0, TAU);
      const r = this.R(24.5, 34);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (z < -22 && Math.abs(x) < 16) continue;
      put(stone, this.rockGeo(this.R(0.8, 2), this.R(0.6, 1.4), this.R(0.8, 1.8), 0.7), x, landY(x, z) + 0.1, z, this.R(0, 6));
    }

    // lantern posts on the terraces, warm against the cold
    this.lanterns = [];
    for (const [x, z] of [
      [WEST.x - WEST.hx + 0.8, WEST.z - WEST.hz + 1.5],
      [WEST.x - WEST.hx + 0.6, WEST.z + WEST.hz - 1.2],
      [EAST.x + EAST.hx - 0.8, EAST.z - EAST.hz + 1.5],
      [EAST.x + EAST.hx - 0.6, EAST.z + EAST.hz - 1.2],
    ] as [number, number][]) {
      const y = groundY(x, z);
      const top = this.trunkGeos(new THREE.Vector3(x, y - 0.1, z), 4.4, 0.18, new THREE.Vector2(x > 0 ? -0.05 : 0.05, 0), bark);
      const lx = top.x + (x > 0 ? -0.9 : 0.9);
      this.lanterns.push(new THREE.Vector3(lx, top.y - 0.6, top.z));
      bark.add(new THREE.TubeGeometry(new THREE.LineCurve3(top, new THREE.Vector3(lx, top.y, top.z)), 2, 0.08, 4, false));
    }
    const lanM = new THREE.MeshBasicMaterial({ color: 0xffd090 });
    for (const p of this.lanterns) {
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.42, 6), lanM);
      lan.position.copy(p);
      this.group.add(lan);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffa850, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
      gl.position.copy(p);
      gl.scale.setScalar(2.6);
      this.group.add(gl);
    }

    const sMesh = stone.build(stoneMat);
    if (sMesh) this.group.add(sMesh);
    const bMesh = bark.build(barkMat);
    if (bMesh) this.group.add(bMesh);
  }

  /** where the lanterns hang (warm points of light) */
  lanterns: THREE.Vector3[] = [];

  /* ---- grass, flowers, ferns, mushrooms ---- */

  private buildPlants() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s3 = new THREE.Vector3();
    // grass: thin bent blades, thick at the edges and on the terraces, sparse in the worn middle
    {
      const blade = new THREE.PlaneGeometry(0.08, 0.55, 1, 2);
      blade.translate(0, 0.275, 0);
      const bp = blade.getAttribute('position');
      const bc = new Float32Array(bp.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < bp.count; i++) {
        const y = bp.getY(i) / 0.55;
        bp.setX(i, bp.getX(i) * (1 - y * 0.9));
        bp.setZ(i, y * y * 0.22);
        c.set(0x1b3d2e).lerp(new THREE.Color(0x5f9f74), y);
        bc.set([c.r, c.g, c.b], i * 3);
      }
      blade.setAttribute('color', new THREE.BufferAttribute(bc, 3));
      blade.computeVertexNormals();
      this.grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const N = 9000;
      const im = new THREE.InstancedMesh(blade, this.grassMat, N);
      let k = 0;
      for (let i = 0; i < N * 4 && k < N; i++) {
        const x = this.R(-34, 34);
        const z = this.R(-34, 34);
        const r = Math.hypot(x, z);
        if (r > 34) continue;
        const dens = fbm(x * 0.12, z * 0.12, 3) * 0.5 + 0.5;
        const middle = 1 - sm(5, 13, r);
        if (this.r() > sm(0.3, 0.68, dens) * (1 - middle * 0.85)) continue;
        if (Math.hypot(x - WELL.x, z - WELL.z) < WELL.r + 0.4) continue;
        // not on the ramps' stones or the fallen tree
        if (x < -8.8 && x > -15.5 && z > STONE_RAMP.z0 - 0.2 && z < STONE_RAMP.z1 + 0.2) continue;
        const y = landY(x, z);
        e.set(this.R(-0.25, 0.25), this.R(0, TAU), this.R(-0.25, 0.25));
        q.setFromEuler(e);
        const s = this.R(0.6, 1.35) * (0.75 + dens * 0.5);
        im.setMatrixAt(k++, m.compose(v.set(x, y - 0.03, z), q, s3.set(s, s, s)));
      }
      im.count = k;
      im.receiveShadow = true;
      this.group.add(im);
      this.heavy.push(im);
    }
    // the forest's own glowing blue flowers, in drifts
    {
      const stem = new THREE.CylinderGeometry(0.015, 0.02, 0.5, 3, 1, true);
      stem.translate(0, 0.25, 0);
      const bulb = new THREE.OctahedronGeometry(0.06, 0);
      const N = 1600;
      const stems = new THREE.InstancedMesh(stem, new THREE.MeshLambertMaterial({ color: 0x1d4a3a }), N);
      this.flowerMat = new THREE.MeshBasicMaterial({ color: 0x48b8e8 });
      const bulbs = new THREE.InstancedMesh(bulb, this.flowerMat, N);
      let k = 0;
      const drift = (cx: number, cz: number, r: number, n: number) => {
        for (let i = 0; i < n && k < N; i++) {
          const a = this.R(0, TAU);
          const d = Math.sqrt(this.r()) * r;
          const x = cx + Math.cos(a) * d;
          const z = cz + Math.sin(a) * d;
          if (Math.hypot(x - WELL.x, z - WELL.z) < WELL.r + 0.2) continue;
          const y = landY(x, z);
          const s = this.R(0.7, 1.5);
          q.setFromEuler(e.set(this.R(-0.2, 0.2), 0, this.R(-0.2, 0.2)));
          stems.setMatrixAt(k, m.compose(v.set(x, y, z), q, s3.set(s, s, s)));
          bulbs.setMatrixAt(k, m.compose(v.set(x, y + 0.5 * s, z), q, s3.set(s, s, s)));
          k++;
        }
      };
      drift(WELL.x, WELL.z, WELL.r + 2.2, 340);
      drift(-12, 15, 2.6, 110);
      drift(16, 7.5, 2.2, 90);
      drift(-20, -14, 2.6, 110);
      drift(20, -15, 2.6, 110);
      drift(-6, 18.5, 2, 70);
      for (let i = 0; i < 16; i++) {
        const a = this.R(0, TAU);
        const r = this.R(19.5, 27);
        drift(Math.cos(a) * r, Math.sin(a) * r, this.R(1, 2.4), 50);
      }
      stems.count = bulbs.count = k;
      this.group.add(stems, bulbs);
      this.heavy.push(stems, bulbs);
    }
    // ferns: the thicket you can hide in, and a few clumps elsewhere
    {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.strokeStyle = '#2f6b4a';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(64, 128);
      g.quadraticCurveTo(70, 64, 62, 3);
      g.stroke();
      for (let i = 0; i < 20; i++) {
        const t = i / 20;
        const y = 128 - t * 123;
        const x = 64 + Math.sin(t * 2) * 3;
        const l = (1 - t) * 36 + 5;
        for (const sd of [-1, 1]) {
          g.fillStyle = `rgb(${40 + t * 30},${100 + t * 40},${70 + t * 20})`;
          g.beginPath();
          g.ellipse(x + sd * l * 0.5, y - 3, l * 0.5, 2.6, sd * -0.35, 0, TAU);
          g.fill();
        }
      }
      const ft = new THREE.CanvasTexture(c);
      ft.colorSpace = THREE.SRGBColorSpace;
      const fg = new THREE.PlaneGeometry(0.75, 1);
      fg.translate(0, 0.5, 0);
      const list: THREE.Matrix4[] = [];
      const patch = (cx: number, cz: number, r: number, n: number, hmin: number, hmax: number) => {
        for (let i = 0; i < n; i++) {
          const a = this.R(0, TAU);
          const d = Math.sqrt(this.r()) * r;
          const x = cx + Math.cos(a) * d;
          const z = cz + Math.sin(a) * d;
          q.setFromEuler(e.set(this.R(-0.55, -0.15), this.R(0, TAU), 0, 'YXZ'));
          const s = this.R(hmin, hmax);
          list.push(m.compose(v.set(x, landY(x, z) - 0.05, z), q, s3.set(s * 0.85, s, s)).clone());
        }
      };
      patch(FERNS.x, FERNS.z, FERNS.r, 360, 1.4, 2.2);
      patch(-17, 16, 2.6, 110, 1.0, 1.7);
      patch(-21, -13, 2.2, 70, 1.0, 1.6);
      patch(21, -2.5, 1.8, 60, 1.0, 1.5);
      const ferns = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({ map: ft, alphaTest: 0.45, side: THREE.DoubleSide }), list.length);
      list.forEach((mm, i) => ferns.setMatrixAt(i, mm));
      ferns.receiveShadow = true;
      this.group.add(ferns);
    }
    // glowing mushrooms on the stump, the log and in the thicket
    {
      const cap = new THREE.SphereGeometry(0.22, 10, 5, 0, TAU, 0, Math.PI / 2);
      cap.scale(1, 0.5, 1);
      const stalk = new THREE.CylinderGeometry(0.05, 0.07, 0.3, 5);
      stalk.translate(0, 0.15, 0);
      cap.translate(0, 0.3, 0);
      const spots: [number, number, number][] = [];
      for (let i = 0; i < 12; i++) {
        const a = this.R(0, TAU);
        spots.push([STUMP.x + Math.cos(a) * (STUMP.r + 0.5), 0, STUMP.z + Math.sin(a) * (STUMP.r + 0.5)]);
      }
      for (let i = 0; i < 10; i++) {
        const t = this.R(-3, 3);
        spots.push([LOG.x + Math.cos(LOG.ang) * t + Math.sin(LOG.ang) * 1.7, 0, LOG.z - Math.sin(LOG.ang) * t + Math.cos(LOG.ang) * 1.7]);
      }
      for (let i = 0; i < 8; i++) spots.push([FERNS.x + this.R(-2, 2), 0, FERNS.z + this.R(-2, 2)]);
      if (!spots.length) return;
      const caps = new THREE.InstancedMesh(cap, new THREE.MeshBasicMaterial({ color: 0x4fe0d0 }), spots.length);
      const stalks = new THREE.InstancedMesh(stalk, new THREE.MeshLambertMaterial({ color: 0xc8dcd4 }), spots.length);
      spots.forEach(([x, , z], i) => {
        const s = this.R(0.6, 1.3);
        m.compose(v.set(x, landY(x, z), z), q.identity(), s3.set(s, s, s));
        caps.setMatrixAt(i, m);
        stalks.setMatrixAt(i, m);
      });
      this.group.add(caps, stalks);
    }
  }

  /* ---- the air: fireflies, mist, moonbeams ---- */

  private buildAir() {
    {
      const n = 160;
      const p = new Float32Array(n * 3);
      this.fireBase = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const x = this.R(-26, 26);
        const z = this.R(-26, 26);
        const y = landY(x, z) + this.R(0.5, 4);
        p.set([x, y, z], i * 3);
        this.fireBase.set([x, y, z, this.R(0, TAU)], i * 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.fire = new THREE.Points(g, new THREE.PointsMaterial({ map: this.glow, color: 0xd8ff9a, size: 0.32, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.fire.frustumCulled = false;
      this.group.add(this.fire);
    }
    {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const r = rng(4);
      for (let i = 0; i < 40; i++) {
        const x = 30 + r() * 68;
        const y = 40 + r() * 48;
        const rad = 12 + r() * 22;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(255,255,255,0.18)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
      }
      const mt = new THREE.CanvasTexture(c);
      for (let i = 0; i < 11; i++) {
        const x = this.R(-26, 26);
        const z = this.R(-30, 24);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.R(14, 24), this.R(6, 10)), new THREE.MeshBasicMaterial({ map: mt, color: 0x88c0c8, transparent: true, opacity: this.R(0.25, 0.45), depthWrite: false }));
        mesh.position.set(x, landY(x, z) + this.R(0.8, 2.2), z);
        mesh.rotation.y = this.R(-0.4, 0.4);
        mesh.userData['x0'] = x;
        mesh.userData['ph'] = this.R(0, TAU);
        this.mist.push(mesh);
        this.group.add(mesh);
      }
    }
    {
      // moonbeams through the canopy: soft planes that fade at the top and the sides
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      const sd = g.createLinearGradient(0, 0, 64, 0);
      sd.addColorStop(0, 'rgba(0,0,0,1)');
      sd.addColorStop(0.5, 'rgba(0,0,0,0)');
      sd.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = sd;
      g.fillRect(0, 0, 64, 64);
      const bt = new THREE.CanvasTexture(c);
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < 5; i++) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.R(2.5, 4.5), 40), new THREE.MeshBasicMaterial({ map: bt, color: 0x8fe0e8, transparent: true, opacity: this.R(0.05, 0.08), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        mesh.position.set(this.R(-18, 14), 19, this.R(-24, 6));
        mesh.quaternion.setFromUnitVectors(up, MOON_DIR);
        this.group.add(mesh);
      }
    }
  }

  /* ---------------------------------------------------------------- */

  /** (tests) hide the plants and the forest, so a computer with no graphics card can run a fight quickly */
  private heavy: THREE.Object3D[] = [];
  private lite = false;
  /** the whole place, its sky too, comes and goes (the Fourth folds it away) */
  setShown(on: boolean) {
    this.shown = on;
    this.group.visible = on && !this.lite && this.group.position.y > -25.9;
    for (const o of this.skyObjs) o.visible = on;
  }

  setLite(on: boolean) {
    this.lite = on;
    this.group.visible = this.shown && !on && this.group.position.y > -25.9;
    for (const o of this.heavy) o.visible = !on;
  }

  /** the world rises into place (u: 0 = far below and hidden, 1 = where it stands) */
  setRise(u: number) {
    const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
    this.group.visible = this.shown && u > 0.001 && !this.lite;
    const y = -(1 - e) * 26;
    if (this.group.position.y !== y) {
      this.group.position.y = y;
      // (the shadows are drawn for where it comes to rest, not for every step of the way up)
      if (e >= 1) this.shadowDirty = true;
    }
  }

  /** the ending: the crater blooms (u: 0 = as it is, 1 = in full flower) */
  setBloom(u: number) {
    const k = Math.min(1, Math.max(0, u));
    this.flowerMat.color.setRGB(0.28 + 0.5 * k, 0.72 + 0.2 * k, 0.91);
    this.grassMat.color.setRGB(1 + 0.25 * k, 1 + 0.35 * k, 1 + 0.2 * k);
  }

  update(dt: number, time: number) {
    const p = this.fire.geometry.getAttribute('position') as THREE.BufferAttribute;
    const b = this.fireBase;
    for (let i = 0; i < p.count; i++) {
      const ph = b[i * 4 + 3]!;
      p.setXYZ(i, b[i * 4]! + Math.sin(time * 0.4 + ph) * 1.2, b[i * 4 + 1]! + Math.sin(time * 0.9 + ph * 2) * 0.35, b[i * 4 + 2]! + Math.cos(time * 0.33 + ph) * 1.2);
    }
    p.needsUpdate = true;
    (this.fire.material as THREE.PointsMaterial).opacity = 0.6 + 0.4 * Math.sin(time * 2.1);
    for (const m of this.mist) m.position.x = (m.userData['x0'] as number) + Math.sin(time * 0.05 + (m.userData['ph'] as number)) * 3;
    void dt;
  }
}
