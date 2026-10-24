import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The moth, in 3D: a chunky little thing made of soft blocks, like the forest's pixels grown solid.
 *
 * A white furry body with a tuft on top, two big dark eyes with a glint of moonlight in each, two antennae bent like sevens that
 * glow, tiny brown legs, and on each side a long forewing and a round hindwing, each with a glowing spot. A soft halo round it all.
 * It faces +z (its face); the wings hinge at its sides and flap about the body's long axis.
 */

/** the size of one block */
const V = 0.05;

const WHITE = new THREE.Color(0xeef1f2);
const SHADE = new THREE.Color(0xc9d3d8);
const EDGE = new THREE.Color(0xfbfcfc);
const MOONLIT = new THREE.Color(0xa8f2ee);
const EYE = new THREE.Color(0x150f22);
const LEG = new THREE.Color(0x4a3326);


export interface Moth3D {
  root: THREE.Group;
  /** the wing hinges: side -1 left, 1 right; `hind` for the smaller back wings */
  wings: { pivot: THREE.Group; side: number; hind: boolean }[];
  halo: THREE.Sprite;
}

type Kind = 'fur' | 'dark' | 'glow';

/** blocks, gathered by material: fur (lit, with a soft glow of its own), dark (eyes and legs, lit only), and moonlight (glowing) */
class Blocks {
  private by: Record<Kind, THREE.BufferGeometry[]> = { fur: [], dark: [], glow: [] };
  add(x: number, y: number, z: number, kind: Kind, col: THREE.Color = WHITE, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.BoxGeometry(V * sx, V * sy, V * sz);
    g.translate(x, y, z);
    g.deleteAttribute('uv');
    const n = g.attributes['position']!.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.by[kind].push(g);
  }
  meshes(mats: Record<Kind, THREE.Material>): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const k of ['fur', 'dark', 'glow'] as Kind[]) {
      const list = this.by[k];
      if (!list.length) continue;
      out.push(new THREE.Mesh(mergeGeometries(list), mats[k]));
      list.forEach((g) => g.dispose());
    }
    return out;
  }
}

/** a little fixed noise, so the fur is not one flat colour */
const hash = (a: number, b: number, c: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

function softHalo(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a wing, lying flat in the x-y plane, reaching out along +x from its hinge: an oval with a lighter rim and a glowing spot */
function wing(b: Blocks, len: number, wid: number, spot: { u: number; r: number }) {
  const nx = Math.round(len / V);
  const ny = Math.round(wid / V);
  const sx = nx * spot.u;
  for (let i = 0; i < nx; i++) {
    for (let j = -ny; j <= ny; j++) {
      // an oval, a little fuller towards its tip
      const u = (i + 0.5) / nx;
      const half = ny * Math.sqrt(Math.max(0, 1 - Math.pow(2 * u - 1, 2))) * (0.75 + 0.35 * u);
      if (Math.abs(j) > half) continue;
      const x = (i + 0.5) * V;
      const y = j * V;
      const d = Math.hypot(i - sx, j) / Math.max(1, ny);
      if (d < spot.r) {
        b.add(x, y, 0, 'glow', WHITE, 1, 1, 1.3);
        continue;
      }
      // a soft ring of moonlight round the spot
      if (d < spot.r * 1.7) {
        b.add(x, y, 0, 'fur', MOONLIT.clone().lerp(WHITE, (d - spot.r) / (spot.r * 0.7)));
        continue;
      }
      const rim = Math.abs(j) > half - 1.2 || i >= nx - 1;
      const col = rim ? EDGE : u < 0.3 ? SHADE.clone().lerp(WHITE, u / 0.3) : WHITE.clone().lerp(SHADE, hash(i, j, 3) * 0.35);
      b.add(x, y, 0, 'fur', col);
    }
  }
}

export function buildMoth3D(): Moth3D {
  const root = new THREE.Group();
  const mats: Record<Kind, THREE.Material> = {
    fur: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xa9bfc6, emissiveIntensity: 0.8 }),
    dark: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff4ee).multiplyScalar(1.6), toneMapped: false }),
  };

  // the body: a soft block of fur, rounded at its corners, with a tuft on top
  const body = new Blocks();
  const BX = 4;
  const BY = 3;
  const BZ = 4;
  for (let i = -BX; i <= BX; i++)
    for (let j = -BY; j <= BY; j++)
      for (let k = -BZ; k <= BZ; k++) {
        // round off the corners
        const corner = (Math.abs(i) === BX ? 1 : 0) + (Math.abs(j) === BY ? 1 : 0) + (Math.abs(k) === BZ ? 1 : 0);
        if (corner >= 2) continue;
        // only the shell
        if (Math.abs(i) < BX && Math.abs(j) < BY && Math.abs(k) < BZ) continue;
        const shade = j < 0 ? SHADE.clone().lerp(WHITE, (j + BY) / BY) : WHITE;
        body.add(i * V, j * V, k * V, 'fur', shade.clone().lerp(SHADE, hash(i, j, k) * 0.25));
      }
  // the tuft
  for (let k = -1; k <= 2; k++) body.add(0, (BY + 1) * V, k * V, 'fur');
  body.add(0, (BY + 2) * V, V, 'fur', EDGE);
  // the eyes: big and dark, a little glint of moonlight up in each
  const fz = (BZ + 0.6) * V;
  for (const s of [-1, 1]) {
    const ex = s * 2 * V;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) body.add(ex + (i - 0.5) * V * s, (j - 1.5) * V, fz, 'dark', EYE, 1, 1, 0.4);
    body.add(ex + 0.5 * V * s, 0.5 * V, fz + 0.012, 'glow', WHITE, 0.75, 0.75, 0.4);
  }
  // legs: three pairs of little brown sticks under it
  for (const s of [-1, 1]) for (const k of [-2, 0, 2]) body.add(s * 2.4 * V, -(BY + 1.5) * V, k * V, 'dark', LEG, 0.8, 2.2, 0.8);
  // the antennae: up, then out, like sevens, glowing
  for (const s of [-1, 1]) {
    for (let j = 0; j < 4; j++) body.add(s * 1.3 * V, (BY + 1 + j) * V, BZ * 0.5 * V, 'glow', WHITE, 0.7, 1, 0.7);
    for (let i = 0; i < 3; i++) body.add(s * (1.3 + i) * V, (BY + 5) * V, BZ * 0.5 * V, 'glow', WHITE, 1, 0.7, 0.7);
  }
  for (const m of body.meshes(mats)) root.add(m);

  // the wings: a long forewing raised up and forward, a round hindwing lower down
  const wings: Moth3D['wings'] = [];
  for (const s of [-1, 1]) {
    for (const hind of [false, true]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * BX * V, hind ? -0.5 * V : 1.2 * V, hind ? -1.5 * V : 0.5 * V);
      const w = new Blocks();
      if (hind) wing(w, 0.4, 0.21, { u: 0.6, r: 0.3 });
      else wing(w, 0.62, 0.25, { u: 0.74, r: 0.3 });
      // tilted (the forewing up and out, the hindwing down), then mirrored for the left side
      const tilt = new THREE.Group();
      tilt.rotation.z = hind ? -0.45 : 0.32;
      for (const m of w.meshes(mats)) tilt.add(m);
      const holder = new THREE.Group();
      holder.scale.x = s;
      holder.add(tilt);
      pivot.add(holder);
      root.add(pivot);
      wings.push({ pivot, side: s, hind });
    }
  }

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softHalo(), color: 0x9ff4ee, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.setScalar(1.7);
  root.add(halo);
  root.traverse((o) => (o.userData['noGround'] = true));
  return { root, wings, halo };
}
