import * as THREE from 'three';
import { TubeChain } from '../kit/chain';
import { SinewChain } from './collector-tube';
import { mix, rgb, scale, type RGB } from '../kit/noise';
import { skin } from '../kit/skin';
import { PAL, colorize, lathe, mergeGeos, paintLedger } from './collector-fx';

/** The pieces the Collector is assembled from: jointed arms with pincers, giant pins, a ledger, a stamp, the jar and its lid. */

const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);

/* ---------------------------------------------------------------- */
/* arms                                                              */
/* ---------------------------------------------------------------- */

/** The length of a pincer, in palm space. */
export const CLAW_LEN = 2.1;
const smoothstep01 = (t: number) => {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
};

function clawChain(side: number, mat: THREE.Material): TubeChain {
  const N = 10;
  const ch = new TubeChain(
    N,
    5,
    mat,
    (u) => 0.17 * Math.pow(1 - u, 0.8) + 0.03,
    (u, a) => {
      const k = u * u;
      return mix(mix(PAL.bone, PAL.boneShade, 0.25 + 0.2 * Math.sin(a * 2)), rgb(0x3a2412), k * 0.85);
    },
  );
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    ch.pts[i]!.set(side * (0.14 + 0.44 * Math.sin(Math.PI * u) - 0.11 * u), 0, 0.05 + CLAW_LEN * u);
  }
  ch.update();
  return ch;
}

/** One of his four long arms: shoulder, elbow, wrist, and a pincer. The elbow is solved from where the wrist should be. */
export class Arm {
  readonly chain: SinewChain;
  readonly hand = new THREE.Group();
  readonly shoulder = new THREE.Vector3();
  readonly elbow = new THREE.Vector3();
  /** where the wrist goes */
  readonly target = new THREE.Vector3();
  /** which way the elbow wants to bend */
  readonly pole = new THREE.Vector3(0, 1, 0);
  /** a bigger number stretches the arm longer (so it can reach across the arena) */
  stretch = 1;
  /** 0 = pincer wide open, 1 = closed */
  grip = 0.3;
  roll = 0;
  /** how much of the arm is drawn (the arm folds into his side in the entrance) */
  readonly fwd = new THREE.Vector3(0, 0, 1);
  private pivA = new THREE.Group();
  private pivB = new THREE.Group();
  private N = 22;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private perp = new THREE.Vector3();
  private smoothTmp: THREE.Vector3[];

  constructor(
    readonly L1: number,
    readonly L2: number,
    mat: THREE.Material,
    private ph: number,
  ) {
    const N = this.N;
    const rg = (u: number, a: number) => Math.cos(3 * (a + 2.2 * Math.PI * u));
    this.chain = new SinewChain(
      N,
      12,
      mat,
      (u) =>
        0.3 -
        0.1 * u +
        0.34 * Math.exp(-Math.pow(u / 0.09, 2)) +
        0.24 * Math.exp(-Math.pow((u - 0.5) / 0.055, 2)) +
        0.1 * Math.exp(-Math.pow((u - 0.93) / 0.05, 2)) +
        0.07 * Math.exp(-Math.pow((u - 0.28) / 0.1, 2)),
      (u, a) => {
        const r = rg(u, a);
        // the upper arm: dark worn leather with reddish sinew along the crests
        let c = mix(PAL.leatherDark, PAL.leather, 0.35 + 0.5 * (0.5 + 0.5 * r));
        c = mix(c, PAL.sinew, 0.3 * (0.5 + 0.5 * r) * (1 - smoothstep01(u / 0.5)));
        // the forearm: old yellow bone, dark in the grooves
        const bone = smoothstep01((u - 0.47) / 0.1);
        c = mix(c, mix(PAL.boneShade, PAL.bone, 0.45 + 0.5 * (0.5 + 0.5 * r)), bone * 0.9);
        if (r < -0.55) c = mix(c, PAL.vein, 0.55);
        // a stitched seam down one side
        if (Math.abs(a - Math.PI / 2) < 0.22) c = mix(c, rgb(0x120a06), 0.85);
        return scale(c, 0.8 + 0.2 * (0.5 + 0.5 * r));
      },
      (u, a) => 1 + (0.14 + 0.16 * smoothstep01((u - 0.45) / 0.25)) * rg(u, a),
    );    this.smoothTmp = Array.from({ length: N }, () => new THREE.Vector3());
    // the hand: a palm, a brass ring at the wrist and two curved pincers
    const palm = colorize(new THREE.SphereGeometry(0.36, 10, 8), mix(PAL.flesh, PAL.fleshPale, 0.4));
    const ring = new THREE.TorusGeometry(0.3, 0.09, 6, 14);
    ring.translate(0, 0, -0.18);
    colorize(ring, PAL.brass);
    const base = new THREE.Mesh(mergeGeos([palm, ring]), mat);
    this.hand.add(base);
    const cA = clawChain(1, mat);
    const cB = clawChain(-1, mat);
    this.pivA.add(cA.mesh);
    this.pivB.add(cB.mesh);
    this.hand.add(this.pivA, this.pivB);
    this.hand.scale.setScalar(1.55);
    this.chain.mesh.frustumCulled = false;
  }

  /** Solve the elbow, bend the tube through shoulder, elbow and wrist, and put the hand on the wrist. */
  update(t: number) {
    const { shoulder: S, target: H, elbow: E, N } = this;
    const d = this.a.subVectors(H, S);
    const dist = Math.max(0.01, d.length());
    const reachMax = (this.L1 + this.L2) * 0.992;
    const s = Math.max(this.stretch, dist / reachMax);
    const l1 = this.L1 * s;
    const l2 = this.L2 * s;
    d.multiplyScalar(1 / dist);
    const aa = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
    this.perp.copy(this.pole).addScaledVector(d, -this.pole.dot(d));
    if (this.perp.lengthSq() < 1e-6) this.perp.set(0, 1, 0).addScaledVector(d, -d.y);
    this.perp.normalize();
    E.copy(S).addScaledVector(d, aa).addScaledVector(this.perp, h);
    const uE = l1 / (l1 + l2);
    const pts = this.chain.pts;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      if (u <= uE) pts[i]!.lerpVectors(S, E, u / uE);
      else pts[i]!.lerpVectors(E, H, (u - uE) / (1 - uE));
    }
    // round the elbow off and let the arm breathe a little
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < N - 1; i++) this.smoothTmp[i]!.copy(pts[i - 1]!).add(pts[i + 1]!).addScaledVector(pts[i]!, 2).multiplyScalar(0.25);
      for (let i = 1; i < N - 1; i++) pts[i]!.copy(this.smoothTmp[i]!);
    }
    for (let i = 1; i < N - 1; i++) {
      const u = i / (N - 1);
      const w = Math.sin(t * 1.3 + i * 0.55 + this.ph) * 0.07 * Math.sin(u * Math.PI);
      pts[i]!.addScaledVector(this.perp, w);
    }
    this.chain.update();
    this.fwd.subVectors(H, pts[N - 3]!);
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, 1);
    this.fwd.normalize();
    this.hand.position.copy(H);
    this.hand.quaternion.setFromUnitVectors(Z, this.fwd);
    this.hand.rotateZ(this.roll);
    const open = 0.62 - 0.6 * this.grip;
    this.pivA.rotation.y = open;
    this.pivB.rotation.y = -open;
  }
}

/* ---------------------------------------------------------------- */
/* giant pins                                                        */
/* ---------------------------------------------------------------- */

/** A pin's height from its tip to the top of its bead, and how deep it is buried when it is stuck in the floor. */
export const PIN_H = 7.85;
export const PIN_BURY = 1.0;
/** Pins are drawn a little smaller than they are modelled: giants, but not so giant that they hide the fight. */
export const PIN_SCALE = 0.74;

/** A giant pin: a brass-steel needle, a collar and a ruby bead. The tip is at the origin, the bead is up +y. */
export function pinGeometry(): THREE.BufferGeometry {
  const shaft = lathe(
    [
      [0.001, 0],
      [0.06, 0.3],
      [0.22, 1.3],
      [0.29, 2.2],
      [0.29, 6.3],
      [0.37, 6.55],
      [0.001, 6.6],
    ],
    8,
  );
  colorize(shaft, (_x, y) => mix(rgb(0x8a8672), rgb(0x7a5c1c), Math.min(1, y / 7)));
  const collar = new THREE.TorusGeometry(0.42, 0.13, 4, 9);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 6.6, 0);
  colorize(collar, PAL.brass);
  const bead = new THREE.SphereGeometry(0.74, 10, 7);
  bead.translate(0, 7.08, 0);
  colorize(bead, (_x, y, _z, nx, ny, nz) => {
    // an amber bead like the liquid in his jar, with a wet highlight up and to the left (not red: red is what hurts)
    const hl = Math.max(0, nx * -0.45 + (ny * 0.6) + nz * 0.5);
    let c = mix(rgb(0x8a4a0a), rgb(0xe0a030), 0.45 + 0.5 * ny);
    c = mix(c, rgb(0xfff0c0), Math.pow(hl, 12));
    return c;
  });
  return mergeGeos([shaft, collar, bead]);
}

/** The floor around a stuck pin: a dark puncture and a ring of splinters, one flat piece. */
export function pinBaseGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const hole = new THREE.CircleGeometry(0.62, 14);
  hole.rotateX(-Math.PI / 2);
  hole.translate(0, 0.06, 0);
  colorize(hole, rgb(0x05030a));
  pieces.push(hole);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const sp = new THREE.ConeGeometry(0.14, 0.62 + 0.25 * ((i * 37) % 3), 4);
    sp.translate(0, 0.3, 0);
    sp.rotateZ(Math.cos(a) * 0.55);
    sp.rotateX(-Math.sin(a) * 0.55);
    sp.translate(Math.cos(a) * 0.52, 0, Math.sin(a) * 0.52);
    colorize(sp, rgb(0x6a5a98));
    pieces.push(sp);
  }
  return mergeGeos(pieces);
}

/* ---------------------------------------------------------------- */
/* held things                                                       */
/* ---------------------------------------------------------------- */

/** The ledger he writes your name in: leather cover, brass corners, two pages open toward you. */
export function makeLedger(): THREE.Group {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(
    mergeGeos([
      colorize(new THREE.BoxGeometry(3.7, 2.7, 0.16), PAL.leather),
      colorize(new THREE.BoxGeometry(0.22, 2.74, 0.28), PAL.leatherDark),
    ]),
    skin({ vertexColors: true, rim: 0xb07a3a, rimPower: 2.6 }),
  );
  cover.position.z = -0.18;
  g.add(cover);
  const paper = paintLedger();
  const front = new THREE.MeshBasicMaterial({ map: paper, color: 0xd8d0c0 });
  const edge = new THREE.MeshBasicMaterial({ color: 0x8a7a58 });
  const mats = [edge, edge, edge, edge, front, edge];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.rotation.y = sx * 0.2;
    const page = new THREE.Mesh(new THREE.BoxGeometry(1.72, 2.4, 0.12), mats);
    page.position.x = sx * 0.88;
    // the texture holds both pages; show half of it on each
    const geo = page.geometry.clone();
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, sx < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
    page.geometry = geo;
    pivot.add(page);
    g.add(pivot);
  }
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const corner = new THREE.Mesh(colorize(new THREE.BoxGeometry(0.5, 0.5, 0.3), PAL.brass), skin({ vertexColors: true, rim: 0xffd890, rimPower: 3 }));
      corner.position.set(sx * 1.75, sy * 1.28, -0.18);
      g.add(corner);
    }
  return g;
}

/** A rubber stamp with a brass cap and a red pad: the handle runs along +z (the hand's forward) and the pad faces +z too. */
export function makeStamp(): THREE.Group {
  const g = new THREE.Group();
  const m = skin({ vertexColors: true, rim: 0xffd890, rimPower: 2.8 });
  const handle = new THREE.CylinderGeometry(0.2, 0.26, 1.7, 8);
  handle.rotateX(Math.PI / 2);
  handle.translate(0, 0, -0.2);
  colorize(handle, mix(PAL.bone, PAL.boneShade, 0.3));
  const knob = new THREE.SphereGeometry(0.4, 10, 8);
  knob.translate(0, 0, -1.1);
  colorize(knob, PAL.brass);
  const cap = new THREE.CylinderGeometry(0.95, 1.05, 0.5, 14);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, 0.9);
  colorize(cap, PAL.brassDark);
  const pad = new THREE.CylinderGeometry(0.86, 0.86, 0.14, 14);
  pad.rotateX(Math.PI / 2);
  pad.translate(0, 0, 1.2);
  colorize(pad, rgb(0xb01830));
  g.add(new THREE.Mesh(mergeGeos([handle, knob, cap, pad]), m));
  return g;
}

/* ---------------------------------------------------------------- */
/* the jar that is his head                                          */
/* ---------------------------------------------------------------- */

/** The glass, as (radius, y) from the bottom up. Origin = the middle of the jar. A tall specimen jar, the eye pressed close to its glass. */
export const JAR_PROFILE: [number, number][] = [
  [0.001, -3.6],
  [0.9, -3.58],
  [1.55, -3.36],
  [2.0, -2.9],
  [2.2, -2.1],
  [2.3, -0.7],
  [2.3, 1.2],
  [2.2, 2.6],
  [2.0, 3.4],
  [1.86, 3.85],
  [1.82, 4.2],
  [1.95, 4.38],
  [2.0, 4.5],
];
/** Where the liquid stops. */
export const LIQUID_Y = 2.95;
export const JAR_MOUTH_Y = 4.5;
const JAR_BOTTOM = -3.6;

export function liquidProfile(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < JAR_PROFILE.length; i++) {
    const [r, y] = JAR_PROFILE[i]!;
    if (y <= LIQUID_Y) out.push([r * 0.95, y * 0.97]);
    else {
      const [r0, y0] = JAR_PROFILE[i - 1]!;
      const t = (LIQUID_Y - y0) / (y - y0);
      out.push([(r0 + (r - r0) * t) * 0.95, LIQUID_Y]);
      break;
    }
  }
  out.push([0.001, LIQUID_Y]);
  return out;
}

/** The glass radius at height y. */
export function jarRadius(y: number): number {
  const P = JAR_PROFILE;
  if (y <= P[0]![1]) return P[0]![0];
  for (let i = 1; i < P.length; i++) {
    if (y <= P[i]![1]) {
      const t = (y - P[i - 1]![1]) / (P[i]![1] - P[i - 1]![1]);
      return P[i - 1]![0] + (P[i]![0] - P[i - 1]![0]) * t;
    }
  }
  return P[P.length - 1]![0];
}

/** The brass shoe the jar sits in, and the collar round its mouth (one mesh, vertex-coloured). */
export function jarBrassGeometry(): THREE.BufferGeometry {
  const B = JAR_BOTTOM;
  const prof: [number, number][] = [
    [0.55, B - 2.0],
    [0.66, B - 1.5],
    [0.95, B - 1.0],
    [1.4, B - 0.5],
    [jarRadius(B + 0.2) + 0.1, B + 0.2],
    [jarRadius(B + 0.5) + 0.12, B + 0.5],
    [jarRadius(B + 0.9) + 0.14, B + 0.9],
    [jarRadius(B + 1.3) + 0.15, B + 1.3],
    [jarRadius(B + 1.5) + 0.1, B + 1.5],
    [jarRadius(B + 1.5) + 0.02, B + 1.48],
  ];
  const cup = lathe(prof, 28);
  colorize(cup, (x, y, z, nx, ny) => {
    const k = 0.5 + 0.4 * ny + 0.15 * Math.sin(Math.atan2(z, x) * 8 + y * 3);
    return mix(PAL.brassDark, PAL.brassLight, Math.max(0, Math.min(1, k * 0.8)));
  });
  const M = JAR_MOUTH_Y;
  const collar = lathe(
    [
      [1.8, M - 1.4],
      [2.0, M - 1.36],
      [2.12, M - 1.15],
      [2.12, M - 0.88],
      [2.22, M - 0.78],
      [2.08, M - 0.6],
      [1.84, M - 0.68],
    ],
    28,
  );
  colorize(collar, (_x, y) => mix(PAL.brassDark, PAL.brass, Math.min(1, Math.max(0, (y - (M - 1.4)) / 0.8))));
  // rivets round the rim of the shoe
  const pieces: THREE.BufferGeometry[] = [cup, collar];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = new THREE.SphereGeometry(0.11, 5, 4);
    const rr = jarRadius(B + 1.0) + 0.2;
    r.translate(Math.cos(a) * rr, B + 1.0, Math.sin(a) * rr);
    colorize(r, PAL.brassLight);
    pieces.push(r);
  }
  return mergeGeos(pieces);
}

/** The lid: a knurled brass cap with a knob. Origin at the bottom of the skirt; +y is up. */
export function lidGeometry(): THREE.BufferGeometry {
  const g = lathe(
    [
      [0.001, 1.5],
      [0.3, 1.46],
      [0.5, 1.3],
      [0.4, 1.12],
      [0.34, 1.0],
      [0.9, 0.98],
      [1.6, 0.94],
      [2.0, 0.82],
      [2.06, 0.62],
      [2.08, 0.05],
      [1.96, 0.0],
      [1.78, 0.06],
      [1.78, 0.5],
    ],
    36,
  );
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 1.85 && y > 0.04 && y < 0.7) {
      const k = 1 + 0.03 * Math.sin(Math.atan2(z, x) * 32);
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
  }
  g.computeVertexNormals();
  colorize(g, (x, y, z) => {
    const knurl = 0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 36);
    let c = mix(PAL.brassDark, PAL.brass, 0.4 + 0.5 * Math.min(1, y / 1.6));
    if (y > 0.05 && y < 0.7) c = mix(c, PAL.brassDark, knurl * 0.5);
    if (y > 1.2) c = mix(c, PAL.brassLight, 0.5);
    return c;
  });
  return g;
}

/** A tag for the glass, the one that says what is in the jar. */
export function paintPlaque(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8dcbc';
  g.fillRect(0, 0, 128, 48);
  g.strokeStyle = '#6a4a22';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 124, 44);
  g.strokeStyle = '#2a1a10';
  g.lineWidth = 2.6;
  g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = 13 + i * 11;
    g.beginPath();
    g.moveTo(10, y);
    let x = 10;
    const end = 60 + ((i * 53) % 50);
    while (x < end) {
      x += 3 + ((x * 7 + i) % 4);
      g.lineTo(x, y + (((x * 13 + i * 5) % 7) - 3) * 0.5);
    }
    g.stroke();
  }
  g.fillStyle = '#a81c2c';
  g.beginPath();
  g.arc(108, 24, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e8dcbc';
  g.fillRect(104, 22, 9, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export { Y as AXIS_Y, Z as AXIS_Z };
export type { RGB };
