import * as THREE from 'three';
import { rng, TAU } from '../core/util';

/**
 * The Fourth, as a three-dimensional eye can see it: only the shadow it casts here.
 *
 * A cube inside a cube, turning through itself the wrong way, its edges thick beams of cold violet light with a block of light
 * at every corner, the moments just past trailing behind it. In the middle hangs a great dark ball built of blocks, and in the
 * ball one eye: a slit of white fire, open. Thin orbits of light run round it, and dark shards of somewhere else tumble in its
 * pull. It is big. It is not in a hurry.
 */

const V4: number[][] = [];
for (let i = 0; i < 16; i++) V4.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
const EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) if (!(i & (1 << b))) EDGES.push([i, i | (1 << b)]);

/** an almond (a vesica), w wide and h tall */
export function almond(w: number, h: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    const x = Math.sin(t) * w * 0.5;
    const y = -Math.cos(t) * h * 0.5;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  for (let i = n; i >= 0; i--) {
    const t = (i / n) * Math.PI;
    s.lineTo(-Math.sin(t) * w * 0.5, -Math.cos(t) * h * 0.5);
  }
  return new THREE.ShapeGeometry(s);
}

let glowT: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowT) return glowT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowT = new THREE.CanvasTexture(c);
  glowT.colorSpace = THREE.SRGBColorSpace;
  return glowT;
}

/**
 * A cube inside a cube, turning through itself: the sixteen corners of a tesseract, turned in the fourth direction and seen in
 * perspective from it. Edges are beams; every corner has a block of light; the moments just past trail behind (`trails`).
 */
export class Tesseract {
  readonly group = new THREE.Group();
  private edges: THREE.InstancedMesh[] = [];
  private halo: THREE.InstancedMesh;
  private nodes: THREE.InstancedMesh;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private pts: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());

  constructor(private o: { color: number; node: number; trails: number; thick: number; nodeSize: number; S: number; fog?: boolean; halo?: number }) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const fog = o.fog ?? false;
    for (let k = 0; k <= o.trails; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color).multiplyScalar(k === 0 ? 2.2 : 1.2), transparent: k > 0, opacity: [1, 0.28, 0.15, 0.07][k] ?? 0.05, depthWrite: k === 0, toneMapped: false, fog });
      const m = new THREE.InstancedMesh(box, mat, EDGES.length);
      m.frustumCulled = false;
      this.edges.push(m);
      this.group.add(m);
    }
    // a soft burn round every beam (there is no bloom: the glow is drawn)
    this.halo = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: o.halo ?? 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog }), EDGES.length + 16);
    this.halo.frustumCulled = false;
    this.group.add(this.halo);
    this.nodes = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(o.node).multiplyScalar(2.4), toneMapped: false, fog }), 16);
    this.nodes.frustumCulled = false;
    this.group.add(this.nodes);
  }

  private project(t: number) {
    const a = t * 0.6;
    const b = t * 0.37;
    const c = t * 0.23;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    const S = this.o.S;
    for (let i = 0; i < 16; i++) {
      let [x, y, z, w] = V4[i]! as [number, number, number, number];
      let nx = x * ca - w * sa;
      let nw = x * sa + w * ca;
      x = nx;
      w = nw;
      const nz = z * cb - w * sb;
      nw = z * sb + w * cb;
      z = nz;
      w = nw;
      nx = x * cc - y * sc;
      const ny = x * sc + y * cc;
      const k = S / (3 - w);
      this.pts[i]!.set(nx * k, ny * k, z * k);
    }
  }

  /** `ang`: how far it has turned through itself; `time` spins the corner blocks */
  update(ang: number, time: number) {
    for (let k = 0; k < this.edges.length; k++) {
      this.project(ang - k * 0.16);
      const m = this.edges[k]!;
      const th = (k === 0 ? 1 : 0.8) * this.o.thick;
      EDGES.forEach(([i, j], e) => {
        const a = this.pts[i]!;
        const b = this.pts[j]!;
        this.v.subVectors(b, a);
        const len = this.v.length();
        this.q.setFromUnitVectors(this.up, this.v.normalize());
        this.v2.addVectors(a, b).multiplyScalar(0.5);
        this.m4.compose(this.v2, this.q, this.v.set(th, len, th));
        m.setMatrixAt(e, this.m4);
        if (k === 0) {
          this.m4.compose(this.v2, this.q, this.v.set(th * 3.2, len + th * 2, th * 3.2));
          this.halo.setMatrixAt(e, this.m4);
        }
      });
      m.instanceMatrix.needsUpdate = true;
      if (k === 0) {
        this.pts.forEach((p, i) => {
          this.q.setFromEuler(this.e.set(time * 0.7 + i, time * 0.5 + i * 2, 0));
          this.m4.compose(p, this.q, this.v.setScalar(this.o.nodeSize));
          this.nodes.setMatrixAt(i, this.m4);
          this.m4.compose(p, this.q, this.v.setScalar(this.o.nodeSize * 2.2));
          this.halo.setMatrixAt(EDGES.length + i, this.m4);
        });
        this.nodes.instanceMatrix.needsUpdate = true;
        this.halo.instanceMatrix.needsUpdate = true;
      }
    }
  }
}

export class FourthModel {
  readonly root = new THREE.Group();
  /** how big its shadow is (1 = its full size), its 4D turning, how open its eye is (0..1), its light (0..) */
  size = 1;
  ang = 0;
  eyeOpen = 1;
  glowK = 1;
  private cube: Tesseract;
  private ball: THREE.InstancedMesh;
  private eye = new THREE.Group();
  private eyeLid = new THREE.Group();
  private orbits: THREE.Mesh[] = [];
  private shards: THREE.InstancedMesh;
  private shardData: { r: number; a: number; y: number; sp: number; s: number; rx: number; ry: number }[] = [];
  private glow: THREE.Sprite;
  private light: THREE.PointLight;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();

  constructor(parent: THREE.Object3D) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    // the edges, and the same edges a moment ago, and before that; a block of light at every corner
    this.cube = new Tesseract({ color: 0xb89cff, node: 0xf2ecff, trails: 3, thick: 0.34, nodeSize: 1.0, S: 11 });
    this.root.add(this.cube.group);
    // the ball: blocks, dark as the space between stars, a few of them faintly lit from inside
    const R = 4.2;
    const S = 0.5;
    const cells: THREE.Vector3[] = [];
    for (let x = -R; x <= R; x += S) for (let y = -R; y <= R; y += S) for (let z = -R; z <= R; z += S) if (Math.abs(Math.hypot(x, y, z) - R) < S * 0.55) cells.push(new THREE.Vector3(x, y, z));
    this.ball = new THREE.InstancedMesh(new THREE.BoxGeometry(S * 0.96, S * 0.96, S * 0.96), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6, emissive: 0x0a0418 }), cells.length);
    const r = rng(77);
    const col = new THREE.Color();
    cells.forEach((p, i) => {
      // the blocks round the eye are pushed back: a socket
      const ex = (p.x * Math.cos(0.22) - p.y * Math.sin(0.22)) / 1.35;
      const ey = (p.x * Math.sin(0.22) + p.y * Math.cos(0.22)) / 3.1;
      const sock = p.z > R * 0.5 && ex * ex + ey * ey < 1;
      this.m4.compose(sock ? p.clone().multiplyScalar(0.86) : p, this.q.identity(), this.v.setScalar(1 + (r() - 0.5) * 0.15));
      this.ball.setMatrixAt(i, this.m4);
      const lit = r() < 0.07;
      col.setHex(lit ? 0x3a2470 : r() < 0.5 ? 0x0a0812 : 0x120e1c);
      if (!lit && p.y > R * 0.55 && r() < 0.6) col.setHex(0x2a2440);
      this.ball.setColorAt(i, col);
    });
    // the eye: a slit of white fire in a violet burn, a dark pupil down its middle
    const outer = new THREE.Mesh(almond(0.78, 3.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7a4aff).multiplyScalar(1.4), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    const inner = new THREE.Mesh(almond(0.52, 3.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf4eeff).multiplyScalar(2.6), toneMapped: false, fog: false }));
    inner.position.z = 0.02;
    const pupil = new THREE.Mesh(almond(0.09, 2.5), new THREE.MeshBasicMaterial({ color: 0x07030f, fog: false }));
    pupil.position.z = 0.04;
    this.eyeLid.add(outer, inner, pupil);
    this.eyeLid.rotation.z = -0.22;
    const burn = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xb08aff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    burn.scale.set(3.2, 6.5, 1);
    burn.position.z = 0.1;
    this.eyeLid.add(burn);
    this.eye.add(this.eyeLid);
    this.eye.position.z = R * 0.9;
    this.eye.scale.setScalar(1.6);
    const eyeHolder = new THREE.Group();
    // (the ball turns with its eye, so the socket is always round the eye)
    eyeHolder.add(this.eye, this.ball);
    this.root.add(eyeHolder);
    this.eyeHolder = eyeHolder;
    // thin orbits of light, tilted, each with a brighter run along it
    for (let i = 0; i < 3; i++) {
      const rr = 9.5 + i * 2.2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.03, 4, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb59aff).multiplyScalar(1.4), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      const run = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.08, 4, 60, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8dcff).multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      const g = new THREE.Group();
      g.add(ring, run);
      g.rotation.set(0.9 + i * 0.5, i * 1.1, 0.3 * i);
      this.orbits.push(run);
      this.root.add(g);
    }
    // dark shards of somewhere else, tumbling in its pull
    const N = 46;
    this.shards = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x0c0a14, emissive: 0x150a2a }), N);
    for (let i = 0; i < N; i++) this.shardData.push({ r: 9 + r() * 9, a: r() * TAU, y: (r() - 0.5) * 14, sp: (0.05 + r() * 0.12) * (r() < 0.5 ? -1 : 1), s: 0.3 + r() * r() * 2.2, rx: r() * 3, ry: r() * 3 });
    this.shards.frustumCulled = false;
    this.root.add(this.shards);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x8a5aff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.glow.scale.setScalar(34);
    this.root.add(this.glow);
    this.light = new THREE.PointLight(0x9a7aff, 60, 40, 1.6);
    this.light.position.set(0, 4, 10);
    this.root.add(this.light);
    this.root.visible = false;
    this.root.traverse((o) => (o.userData['noGround'] = true));
    parent.add(this.root);
  }

  private eyeHolder: THREE.Group;

  /** its eye turns to look at a point in the world */
  lookAt(x: number, y: number, z: number) {
    this.eyeHolder.lookAt(x, y, z);
  }

  update(time: number) {
    this.root.scale.setScalar(Math.max(0.001, this.size));
    this.cube.update(this.ang, time);
    // its eye: opens, and burns
    this.eyeLid.scale.set(1, Math.max(0.02, this.eyeOpen), 1);
    this.orbits.forEach((o, i) => (o.rotation.z = time * (0.5 + i * 0.25) * (i % 2 ? -1 : 1)));
    this.shardData.forEach((d, i) => {
      const a = d.a + time * d.sp;
      this.q.setFromEuler(this.e.set(d.rx + time * 0.3, d.ry + time * 0.2, 0));
      this.m4.compose(this.v.set(Math.cos(a) * d.r, d.y + Math.sin(time * 0.4 + i) * 0.4, Math.sin(a) * d.r), this.q, this.v2.setScalar(d.s));
      this.shards.setMatrixAt(i, this.m4);
    });
    this.shards.instanceMatrix.needsUpdate = true;
    this.glow.material.opacity = (0.5 + 0.1 * Math.sin(time * 2.3)) * this.glowK;
    this.light.intensity = 60 * this.glowK;
  }
}
