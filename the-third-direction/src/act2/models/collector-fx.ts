import * as THREE from 'three';
import { fbm, ridge, rgb, type RGB } from '../kit/noise';

/**
 * Small things the Collector is made of that the creature kit does not have: glass that looks like glass, murky liquid,
 * paper labels that flutter in the wind, soft steam, a bloodshot eye painted in code, and a few geometry helpers.
 * Everything is drawn in code (canvas, shaders, procedural geometry); nothing is loaded.
 */

/** A stable pseudo-random number in 0..1 (the same for the same inputs, so a model never changes between runs). */
export const rnd = (i: number, k = 0) => (((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1) + 1) % 1;

/* ---------------------------------------------------------------- */
/* geometry helpers                                                  */
/* ---------------------------------------------------------------- */

/** Paint every vertex of a geometry with one colour, or with a function of its position. */
export function colorize(g: THREE.BufferGeometry, c: RGB | ((x: number, y: number, z: number, nx: number, ny: number, nz: number) => RGB)): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = typeof c === 'function' ? c(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0) : c;
    a[i * 3] = v[0];
    a[i * 3 + 1] = v[1];
    a[i * 3 + 2] = v[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Glue static geometries together into one (one draw call). Missing colours become white. */
export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    const c = g.getAttribute('position').count;
    nv += c;
    ni += g.index ? g.index.count : c;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3).fill(1);
  const uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const c = g.getAttribute('color');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      if (nrm) {
        nor[(vo + i) * 3] = nrm.getX(i);
        nor[(vo + i) * 3 + 1] = nrm.getY(i);
        nor[(vo + i) * 3 + 2] = nrm.getZ(i);
      }
      if (c) {
        col[(vo + i) * 3] = c.getX(i);
        col[(vo + i) * 3 + 1] = c.getY(i);
        col[(vo + i) * 3 + 2] = c.getZ(i);
      }
      if (u) {
        uv[(vo + i) * 2] = u.getX(i);
        uv[(vo + i) * 2 + 1] = u.getY(i);
      }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io++] = i + vo;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Bend a profile into a solid of revolution around y: points are (radius, y). Normals face outward for a bottom-to-top profile. */
export function lathe(profile: [number, number][], segs = 32): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const g = new THREE.LatheGeometry(pts, segs);
  return g;
}

/* ---------------------------------------------------------------- */
/* glass and liquid                                                  */
/* ---------------------------------------------------------------- */

const GLASS_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 nn = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    nn = mat3(instanceMatrix) * nn;
  #endif
  vec4 mv = modelViewMatrix * p;
  vN = normalize(normalMatrix * nn);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;

const GLASS_FS = /* glsl */ `
uniform vec3 uTint;
uniform vec3 uRim;
uniform float uAlpha;
uniform float uFade;
uniform float uGlint;
uniform float uDirt;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vn2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  if (!gl_FrontFacing) n = -n;
  float nv = clamp(dot(n, v), 0.0, 1.0);
  float fr = pow(1.0 - nv, 2.3);
  vec3 r = reflect(-v, n);
  vec3 d1 = r - normalize(vec3(-0.5, 0.42, 0.75));
  d1.y *= 0.3;
  float h1 = (1.0 - smoothstep(0.04, 0.38, length(d1))) * 0.8;
  vec3 d2 = r - normalize(vec3(0.66, -0.05, 0.75));
  d2.y *= 0.55;
  float h2 = (1.0 - smoothstep(0.03, 0.22, length(d2))) * 0.5;
  float sp = (h1 + h2) * uGlint;
  // years of grime: dark streaks that run down the glass and a film of dirt
  float ang = atan(vP.z, vP.x);
  float streak = vn2(vec2(ang * 7.0, vP.y * 0.55));
  streak = smoothstep(0.58, 0.9, streak);
  float film = vn2(vec2(ang * 2.0 + vP.y * 0.4, vP.y * 1.7)) * 0.5 + vn2(vP.xy * 3.0 + vP.zz) * 0.5;
  float dirt = streak * 0.45 + smoothstep(0.55, 0.85, film) * 0.22;
  vec3 col = mix(uTint + uRim * fr * 1.15, vec3(0.05, 0.035, 0.015), dirt * uDirt) + vec3(1.0) * sp * (1.0 - dirt * 0.6);
  float a = uAlpha + fr * 0.55 + sp * 0.85 + dirt * uDirt * 0.5;
  if (!gl_FrontFacing) a *= 0.55;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.94) * uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Glass: nearly clear in the middle, bright at the edges, with two soft window reflections. Draw it after everything inside it. */
export function glassMaterial(o: { tint?: number; rim?: number; alpha?: number; glint?: number; dirt?: number } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTint: { value: new THREE.Color(o.tint ?? 0x16323a) },
      uRim: { value: new THREE.Color(o.rim ?? 0x9fe8ff) },
      uAlpha: { value: o.alpha ?? 0.07 },
      uFade: { value: 1 },
      uGlint: { value: o.glint ?? 1 },
      uDirt: { value: o.dirt ?? 0 },
    },
    vertexShader: GLASS_VS,
    fragmentShader: GLASS_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
}

const LIQ_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;

const LIQ_FS = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform float uAlpha;
uniform float uTime;
uniform float uY0;
uniform float uY1;
uniform float uFade;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float h = clamp((vP.y - uY0) / (uY1 - uY0), 0.0, 1.0);
  vec3 col = mix(uBottom, uTop, h * h);
  float c = sin(vP.x * 2.6 + uTime * 0.7 + sin(vP.y * 1.7 + uTime * 0.5) * 1.5) * sin(vP.z * 2.4 - uTime * 0.6 + vP.y);
  col += uTop * 0.1 * c;
  vec3 n = normalize(vN);
  float fr = pow(1.0 - abs(dot(n, normalize(vV))), 2.0);
  float top = smoothstep(0.9, 0.98, n.y);
  col += uTop * (fr * 0.35 + top * 0.5);
  gl_FragColor = vec4(col, (uAlpha + fr * 0.22 + top * 0.25) * uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Murky amber liquid: darker at the bottom, a bright skin at the top, slow caustic ripples. */
export function liquidMaterial(y0: number, y1: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(0xffa83a) },
      uBottom: { value: new THREE.Color(0x4a2204) },
      uAlpha: { value: 0.34 },
      uTime: { value: 0 },
      uY0: { value: y0 },
      uY1: { value: y1 },
      uFade: { value: 1 },
    },
    vertexShader: LIQ_VS,
    fragmentShader: LIQ_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: false,
  });
}

/* ---------------------------------------------------------------- */
/* paper labels                                                      */
/* ---------------------------------------------------------------- */

const LABEL_VS = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFall;
attribute float aTile;
varying vec2 vUv;
varying vec3 vCol;
varying float vShade;
void main() {
  float free = 1.0 - uv.y;
  vec4 p = vec4(position, 1.0);
  vec3 ip = instanceMatrix[3].xyz;
  float ph = ip.x * 1.7 + ip.y * 0.9 + ip.z * 2.3;
  float s1 = sin(uTime * 2.1 + ph + free * 3.2);
  float s2 = sin(uTime * 3.9 + ph * 1.7 + free * 6.0);
  p.z += (s1 * 0.26 + s2 * 0.09) * free * free * uAmp;
  p.x += s2 * 0.07 * free * uAmp;
  vUv = vec2((uv.x + aTile) * 0.25, uv.y);
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vShade = mix(0.72, 1.0, uv.y);
  vec4 wp = instanceMatrix * p;
  // when the Collector dies the labels let go and drift down like snow
  float spd = 1.5 + 4.5 * fract(sin(dot(ip.xz + ip.y, vec2(12.9898, 78.233))) * 43758.5453);
  wp.y -= uFall * spd;
  wp.x += sin(uTime * 1.7 + ph) * 0.9 * min(uFall, 1.5);
  wp.z += cos(uTime * 1.3 + ph * 1.3) * 0.9 * min(uFall, 1.5);
  gl_Position = projectionMatrix * modelViewMatrix * wp;
}`;

const LABEL_FS = /* glsl */ `
uniform sampler2D map;
uniform float uBright;
uniform float uFade;
varying vec2 vUv;
varying vec3 vCol;
varying float vShade;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  gl_FragColor = vec4(t.rgb * vCol * vShade * uBright * uFade, 1.0);
  #include <colorspace_fragment>
}`;

/** Paper tags that hang from a pin and sway: needs an InstancedMesh with an `aTile` instanced attribute (0..3). */
export function labelMaterial(map: THREE.Texture, amp: number, bright = 0.9): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uTime: { value: 0 }, uAmp: { value: amp }, uBright: { value: bright }, uFade: { value: 1 }, uFall: { value: 0 } },
    vertexShader: LABEL_VS,
    fragmentShader: LABEL_FS,
    side: THREE.DoubleSide,
    fog: false,
  });
}

/** A tag with its top edge on y = 0, hanging down by `h` (uv.y = 1 at the top, 0 at the free end). */
export function labelGeometry(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h, 1, 4);
  g.translate(0, -h / 2, 0);
  return g;
}

/** Four hand-labelled tags side by side (64x128 each): plain, wax seal, a red cross, a stain and a crossing-out. */
export function paintLabelAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  const papers = ['#eadfc2', '#e2d2a8', '#ddd3bc', '#ecdcb4'];
  for (let t = 0; t < 4; t++) {
    const ox = t * 64;
    g.save();
    g.translate(ox, 0);
    // the tag: a long rectangle with its top corners cut off
    g.beginPath();
    g.moveTo(6, 24);
    g.lineTo(20, 4);
    g.lineTo(44, 4);
    g.lineTo(58, 24);
    g.lineTo(58, 124);
    g.lineTo(6, 124);
    g.closePath();
    g.fillStyle = papers[t]!;
    g.fill();
    g.clip();
    // age: blotches and a darker edge
    for (let i = 0; i < 7; i++) {
      const x = 8 + rnd(i, t + 3) * 48;
      const y = 10 + rnd(i, t + 9) * 110;
      const r = 5 + rnd(i, t + 1) * 14;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(120,80,30,0.28)');
      grd.addColorStop(1, 'rgba(120,80,30,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(90,60,25,0.8)';
    g.lineWidth = 3;
    g.stroke();
    // the string hole and its red thread
    g.fillStyle = '#2a1a10';
    g.beginPath();
    g.arc(32, 16, 4.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7a1a22';
    g.beginPath();
    g.arc(32, 16, 2.2, 0, Math.PI * 2);
    g.fill();
    // handwriting
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const y = 38 + i * 12;
      const len = 22 + rnd(i, t * 7 + 1) * 18;
      g.beginPath();
      g.moveTo(12, y);
      let x = 12;
      while (x < 12 + len) {
        const nx = x + 3 + rnd(i * 13 + x, t) * 4;
        g.quadraticCurveTo((x + nx) / 2, y + (rnd(x, i + t) - 0.5) * 7, nx, y + (rnd(nx, i) - 0.5) * 2);
        x = nx;
      }
      g.stroke();
    }
    if (t === 1) {
      // a wax seal
      g.fillStyle = '#9a1824';
      g.beginPath();
      g.arc(32, 104, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c4303a';
      g.beginPath();
      g.arc(30, 102, 4, 0, Math.PI * 2);
      g.fill();
    } else if (t === 2) {
      // a red cross
      g.strokeStyle = '#b01c2a';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(14, 84);
      g.lineTo(50, 116);
      g.moveTo(50, 84);
      g.lineTo(14, 116);
      g.stroke();
    } else if (t === 3) {
      g.strokeStyle = '#b01c2a';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(8, 62);
      g.lineTo(56, 56);
      g.stroke();
    }
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 2;
  return tex;
}

/** The ledger: two pages of columns and tiny writing, 128x96. */
export function paintLedger(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6d9b8';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = 'rgba(110,70,30,0.2)';
  for (let i = 0; i < 8; i++) {
    const x = rnd(i, 4) * 128;
    const y = rnd(i, 7) * 96;
    g.beginPath();
    g.arc(x, y, 6 + rnd(i, 1) * 10, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(60,35,15,0.9)';
  g.fillRect(63, 0, 2, 96);
  g.strokeStyle = '#33210f';
  g.lineWidth = 1.4;
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < 12; i++) {
      const y = 8 + i * 7;
      g.beginPath();
      g.moveTo(6 + p * 64, y);
      let x = 6 + p * 64;
      const end = x + 20 + rnd(i, p + 3) * 34;
      while (x < end) {
        x += 2 + rnd(x, i) * 3;
        g.lineTo(x, y + (rnd(x * 3, i) - 0.5) * 2.6);
      }
      g.stroke();
    }
  }
  g.strokeStyle = '#a01c2a';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(70, 22);
  g.lineTo(122, 22);
  g.moveTo(70, 50);
  g.lineTo(122, 50);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------------------------------------------------------- */
/* the eye                                                           */
/* ---------------------------------------------------------------- */

/** Angular radius of the iris around the front of the eyeball, in radians. */
export const IRIS = 0.62;

/**
 * The bloodshot eye, painted per pixel on an equirectangular map (the sphere's front is at u = 0.25, v = 0.5):
 * a yellowed ball, veins that thicken toward the corners, a glowing iris of radial fibres. A generator, so it builds in slices.
 */
export function* paintEyeGen(): Generator<void, THREE.CanvasTexture, void> {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    const cl = Math.cos(lat);
    const py = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const phi = ((x + 0.5) / W) * Math.PI * 2;
      const px = -Math.cos(phi) * cl;
      const pz = Math.sin(phi) * cl;
      // angular distance from the front (+z) and the angle around it
      const ang = Math.acos(Math.max(-1, Math.min(1, pz)));
      const around = Math.atan2(py, px);
      let r: number;
      let gg: number;
      let b: number;
      // the white: yellowed and mottled, pinker away from the front
      const m = fbm(px * 2.4, py * 2.4, pz * 2.4, 3, 5);
      const edge = Math.min(1, Math.max(0, (ang - 0.7) / 1.1));
      r = 226 - 14 * m + 14 * edge;
      gg = 204 - 40 * m - 40 * edge;
      b = 160 - 50 * m - 50 * edge;
      // veins
      const v = ridge(px * 2.2 + 3, py * 2.2, pz * 2.2, 3, 15);
      const thr = 0.9 - 0.07 * Math.min(1, Math.max(0, (ang - 0.5) / 0.9));
      if (v > thr) {
        const k = Math.min(1, (v - thr) / (1 - thr));
        r = r + (150 - r) * k;
        gg = gg + (14 - gg) * k;
        b = b + (24 - b) * k;
      }
      const v2 = ridge(px * 4.6, py * 4.6 + 1, pz * 4.6, 2, 31);
      if (v2 > 0.93 && ang > 0.5) {
        const k = Math.min(1, (v2 - 0.93) / 0.07) * 0.8;
        r = r + (170 - r) * k;
        gg = gg + (20 - gg) * k;
        b = b + (30 - b) * k;
      }
      // the iris: a hot ring of fibres, bright by the pupil, dark at its rim
      if (ang < IRIS) {
        const t = ang / IRIS;
        const fib = 0.5 + 0.5 * Math.sin(around * 34 + fbm(px * 6, py * 6, pz * 6, 2, 9) * 7);
        const fib2 = 0.5 + 0.5 * Math.sin(around * 71 + 2.0);
        const inner = [255, 200, 70];
        const mid = [240, 74, 30];
        const outer = [120, 14, 20];
        const k1 = Math.min(1, t / 0.55);
        const k2 = Math.max(0, (t - 0.55) / 0.45);
        let ir = inner[0]! + (mid[0]! - inner[0]!) * k1 + (outer[0]! - mid[0]!) * k2;
        let ig = inner[1]! + (mid[1]! - inner[1]!) * k1 + (outer[1]! - mid[1]!) * k2;
        let ib = inner[2]! + (mid[2]! - inner[2]!) * k1 + (outer[2]! - mid[2]!) * k2;
        const f = 0.62 + 0.28 * fib + 0.1 * fib2;
        ir *= f;
        ig *= f;
        ib *= f;
        // the limbal ring
        const ring = Math.min(1, Math.max(0, (t - 0.86) / 0.14));
        ir *= 1 - 0.75 * ring;
        ig *= 1 - 0.8 * ring;
        ib *= 1 - 0.8 * ring;
        const soft = Math.min(1, Math.max(0, (IRIS - ang) / 0.035));
        r = r + (ir - r) * soft;
        gg = gg + (ig - gg) * soft;
        b = b + (ib - b) * soft;
      }
      const o = (y * W + x) * 4;
      d[o] = r;
      d[o + 1] = gg;
      d[o + 2] = b;
      d[o + 3] = 255;
    }
    if ((y & 7) === 7) yield;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

/** A vertical slit with pointed ends, unit height and unit half-width (scale x to dilate). */
export function slitGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    pts.push(new THREE.Vector2(1 - t * t, t));
  }
  for (let i = N - 1; i > 0; i--) {
    const t = -1 + (2 * i) / N;
    pts.push(new THREE.Vector2(-(1 - t * t), t));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(pts));
}

/* ---------------------------------------------------------------- */
/* soft particles: steam, ink, drops                                 */
/* ---------------------------------------------------------------- */

const PT_VS = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 color;
uniform float uScale;
varying float vA;
varying vec3 vC;
void main() {
  vA = alpha;
  vC = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const PT_FS = /* glsl */ `
varying float vA;
varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.0, 1.0, d));
  a *= a;
  gl_FragColor = vec4(vC, a * vA);
  #include <colorspace_fragment>
}`;

/** The soft-point material the particle pools use. */
export function softPointsMaterial(additive: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 768 / (2 * Math.tan((32 * Math.PI) / 180)) } },
    vertexShader: PT_VS,
    fragmentShader: PT_FS,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false,
  });
}

/** A fixed set of glows (one per slot) in one draw call: set a slot's size, alpha and colour, move nothing. */
export class GlowSet {
  readonly points: THREE.Points;
  private size: Float32Array;
  private alpha: Float32Array;
  private col: Float32Array;
  private g = new THREE.BufferGeometry();

  constructor(positions: [number, number, number][], additive = true) {
    const n = positions.length;
    const pos = new Float32Array(n * 3);
    positions.forEach((p, i) => pos.set(p, i * 3));
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.col = new Float32Array(n * 3).fill(1);
    this.g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(this.g, softPointsMaterial(additive));
    this.points.frustumCulled = false;
    this.points.renderOrder = 19;
  }

  set(i: number, size: number, alpha: number, c?: RGB) {
    this.size[i] = size;
    this.alpha[i] = alpha;
    if (c) this.col.set(c, i * 3);
  }

  commit() {
    (this.g.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
    (this.g.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** A pool of soft round particles drawn in one call. */
export class SoftPoints {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private col: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grow: Float32Array;
  private a0: Float32Array;
  private s0: Float32Array;
  private drag: Float32Array;
  private next = 0;
  private g: THREE.BufferGeometry;
  private ay: number;

  constructor(n: number, additive: boolean, gravity = 0) {
    this.n = n;
    this.ay = gravity;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.col = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.grow = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.g = new THREE.BufferGeometry();
    this.g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 768 / (2 * Math.tan((32 * Math.PI) / 180)) } },
      vertexShader: PT_VS,
      fragmentShader: PT_FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: false,
    });
    this.points = new THREE.Points(this.g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, c: RGB, alpha: number, drag = 0.6) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.s0[i] = size;
    this.grow[i] = grow;
    this.a0[i] = alpha;
    this.col[i * 3] = c[0];
    this.col[i * 3 + 1] = c[1];
    this.col[i * 3 + 2] = c[2];
    this.drag[i] = drag;
    this.size[i] = size;
    this.alpha[i] = 0;
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i]! -= dt;
      const u = 1 - Math.max(0, this.life[i]!) / this.maxLife[i]!;
      const k = Math.exp(-this.drag[i]! * dt);
      this.vel[i * 3] = this.vel[i * 3]! * k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * k + this.ay * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2]! * k;
      this.pos[i * 3] = this.pos[i * 3]! + this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1] = this.pos[i * 3 + 1]! + this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2] = this.pos[i * 3 + 2]! + this.vel[i * 3 + 2]! * dt;
      this.size[i] = this.s0[i]! * (1 + this.grow[i]! * u);
      // fade in quickly, out slowly
      this.alpha[i] = this.a0[i]! * Math.min(1, u * 8) * (1 - u) * (1 - u);
    }
    (this.g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.g.getAttribute('size') as THREE.BufferAttribute).needsUpdate = true;
    (this.g.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    (this.g.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Colours the Collector is painted with (linear). */
export const PAL = {
  leatherDark: rgb(0x2a1a08),
  leather: rgb(0x6a4412),
  leatherLight: rgb(0x8a6020),
  flesh: rgb(0x7a5a20),
  fleshPale: rgb(0xa88a40),
  sinew: rgb(0xa04810),
  vein: rgb(0x3a1004),
  brass: rgb(0xd9a93a),
  brassDark: rgb(0x7a5a1c),
  brassLight: rgb(0xffdf8a),
  verdigris: rgb(0x4a9c7a),
  bone: rgb(0xe0b868),
  boneShade: rgb(0xa07830),
  ink: rgb(0x0a0612),
  inkSheen: rgb(0x2a2438),
  paper: rgb(0xeadfc2),
};
