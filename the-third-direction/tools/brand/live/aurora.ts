/**
 * "Aurora" (wallpaper 12, tools/brand/wallpapers.html) brought to life: a seamless loop for Wallpaper Engine.
 *
 * The picture is the wallpaper's own: the same five curtains of light (one in each guardian's colour), the same stars, the same
 * forest along the bottom (the same trees, where they were), the same Blob in its glow. Only time is added, and everything that
 * moves comes back to where it was after LOOP seconds, exactly:
 *  - the curtains: their rays drift, fold and ripple, light runs along them, they reach higher and lower, they brighten and fade;
 *    their lower hems (the ridges that read as mountains) stay put
 *  - the stars twinkle, a faint mist drifts above the trees, motes of dust float, a few sparks of light wander near the Blob
 *  - the treetops sway by a single pixel now and then
 *  - the Blob breathes (the game's own squash), blinks twice, and its glow pulses
 * Noise that changes is sampled round a circle in its own space, and every rhythm is a whole number of cycles per loop.
 *
 * `window.__setup(W, H)` once, then `window.__frame(t)` draws the frame at t seconds into the canvas `window.__out`.
 */
import { drawBlob } from '../../../src/core/art';
import { Pix } from '../../../src/core/pix';

export const LOOP = 24;
const TAU = Math.PI * 2;

type Win = { __sprites: Record<string, string>; __setup: (w: number, h: number) => Promise<void>; __frame: (t: number) => void; __out: HTMLCanvasElement };
const WIN = window as unknown as Win;

/* ------------------------------------------------------------------------------------------------ WebGL: the sky */

const PRE = `#version 300 es
precision highp float;
uniform vec2 R;
uniform float TH;
out vec4 o;
#define Q vec2(gl_FragCoord.x, R.y - gl_FragCoord.y)
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p + n + 17.17)); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; mat2 m = mat2(.8, -.6, .6, .8);
  for (int i = 0; i < 6; i++) { s += a * vn(p); p = m * p * 2.03 + 11.7; a *= .5; } return s; }
// a point going round a circle once per loop (k times), starting at the origin: noise sampled along it changes and comes back
vec2 orb(float k, float ph, float r){ return r * vec2(cos(k * TH + ph) - cos(ph), sin(k * TH + ph) - sin(ph)); }
`;

/**
 * Pass 1: everything about a curtain that depends only on the column (its hem, how far up it reaches, its rays, the light along
 * it), worked out once per column instead of once per pixel. W x 5, one row per curtain: (hem, reach, rays, along).
 */
const PROFILE = `${PRE}
const float BASE[5] = float[5](.30, .40, .47, .56, .64);
void main(){
  int i = int(gl_FragCoord.y);
  float seed = float(i + 1);
  float ph = seed * 1.37;
  vec2 p = vec2((gl_FragCoord.x - .5 * R.x) / min(R.x, R.y), 0.);
  // the hem: exactly the wallpaper's (the ridges stay where they are)
  float y = BASE[i] + .11 * sin(p.x * 1.7 + seed * 3.) + .16 * (fbm(vec2(p.x * 1.1 + seed * 7., seed)) - .5) + .03 * sin(p.x * 7. + seed);
  // how far up it reaches: it stretches and settles
  float up = (5.5 + 3. * fbm(vec2(p.x * 3., seed + 2.) + orb(1., ph * 2.3, .45))) * (1. + .09 * sin(TH + seed * 2.3));
  // the rays: they drift and fold (the noise goes round a circle), and a slow ripple runs through them
  float rx = p.x * 46. + seed * 13. + fbm(vec2(p.x * 4., seed) + orb(1., ph * 2., .35)) * 6.;
  vec2 dr = orb(1., ph, 1.);
  rx += 2.2 * dr.x + .45 * sin(2. * TH + ph * 3.) + .8 * sin(p.x * 9. - 2. * TH + seed);
  float rays = .45 + .55 * pow(vn(vec2(rx, seed + .55 * dr.y)), 1.6);
  // the light along it: drifting patches, and a soft wave that crosses the sky once a loop
  float along = .55 + .45 * fbm(vec2(p.x * 2. + seed * 5., 4.) + orb(1., ph * 1.7, .6));
  along *= (1. + .16 * sin(p.x * 2.2 - TH + seed * 2.)) * (1. + .1 * sin(TH + seed * 1.7));
  o = vec4(y, up, rays, along);
}`;

/** Pass 2: the sky, at full size: the night, its stars (twinkling), the five curtains (from the profiles), a mist low down */
const SKY = `${PRE}
uniform sampler2D P;
uniform float U;
const vec3 COL[5] = vec3[5](vec3(.44, .94, 1.) * .95, vec3(1., .69, .34) * .7, vec3(.79, .65, 1.) * .85, vec3(1., .44, .63) * .8, vec3(.5, 1., .7) * .6);
void main(){
  vec2 uv = Q / R;
  vec2 p = vec2((Q.x - .5 * R.x) / min(R.x, R.y), Q.y / R.y);
  vec3 c = mix(vec3(.008, .012, .035), vec3(.02, .05, .11), uv.y);
  vec2 g = Q / (9. * U), id = floor(g); float r = h21(id);
  if (r > .955) {
    // each star twinkles at its own pace (1 to 4 times a loop)
    float tw = 1. + .45 * sin(floor(1. + fract(r * 17.) * 4.) * TH + fract(r * 91.) * 6.283);
    c += vec3(.85, .92, 1.) * smoothstep(1., 0., length(fract(g) - h22(id)) * 9.) * fract(r * 53.) * .9 * tw;
  }
  int x = int(gl_FragCoord.x);
  for (int i = 0; i < 5; i++) {
    vec4 v = texelFetch(P, ivec2(x, i), 0);
    float d = p.y - v.x;
    float body = d > 0. ? exp(-d * 60.) : exp(d * v.y);
    c += COL[i] * body * v.z * v.w;
  }
  // a faint mist drifting over the forest, lit by the curtains above it
  float hz = .6 * vn(vec2(p.x * 1.3, p.y * 3.) + orb(1., .4, .9)) + .4 * vn(vec2(p.x * 3.1, p.y * 6.) + orb(2., 2.1, .7));
  float band = smoothstep(.5, .78, p.y) * (1. - smoothstep(.86, .95, p.y));
  c += vec3(.10, .34, .33) * hz * band * .055;
  o = vec4(c, 1.);
}`;

/** what glows: the sky where it is brighter than C, at a quarter of the size */
const CUT = `${PRE}
uniform sampler2D T; uniform float C;
void main(){ vec4 t = texture(T, gl_FragCoord.xy / R); float l = max(t.r, max(t.g, t.b)); o = vec4(t.rgb * smoothstep(C, C + .25, l), 1.); }`;

/** a gaussian blur along D (in texels), sigma S texels */
const BLUR = `${PRE}
uniform sampler2D T; uniform vec2 D; uniform float S;
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec3 s = vec3(0.); float w = 0.;
  int n = int(ceil(S * 3.));
  for (int i = -n; i <= n; i++) { float k = exp(-float(i * i) / (2. * S * S)); s += texture(T, uv + D * float(i) / R).rgb * k; w += k; }
  o = vec4(s / w, 1.);
}`;

/** the sky with its bloom added (as the wallpaper's 'lighter' at 0.5), to the screen */
const OUT = `${PRE}
uniform sampler2D T; uniform sampler2D B; uniform float A;
void main(){ vec2 uv = gl_FragCoord.xy / R; o = vec4(min(vec3(1.), texture(T, uv).rgb + A * texture(B, uv).rgb), 1.); }`;

/** film grain, once (it does not move: grain that crawled would be noise) */
const GRAIN = `${PRE}
uniform float S; void main(){ float n = h21(Q + S * 91.7); o = vec4(vec3(n), 1.); }`;

let gl!: WebGL2RenderingContext;
let glc!: HTMLCanvasElement;
const progs: Record<string, WebGLProgram> = {};

function program(src: string): WebGLProgram {
  const mk = (type: number, s: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, s);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) + '\n' + s);
    return sh;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }'));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, src));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

type Target = { fb: WebGLFramebuffer | null; tex: WebGLTexture | null; w: number; h: number };
function target(w: number, h: number, float: boolean): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const f = float ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete');
  return { fb, tex, w, h };
}

/** run a pass into `to`; R is its size, unless `res` says otherwise (the profiles are W x 5 but work in the frame's units) */
function run(name: string, to: Target, uni: Record<string, number | number[]>, tex: Record<string, WebGLTexture | null> = {}, res?: [number, number]) {
  const p = progs[name]!;
  gl.useProgram(p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
  gl.viewport(0, 0, to.w, to.h);
  gl.uniform2f(gl.getUniformLocation(p, 'R'), res ? res[0] : to.w, res ? res[1] : to.h);
  for (const [k, v] of Object.entries(uni)) {
    const l = gl.getUniformLocation(p, k);
    if (l === null) continue;
    if (typeof v === 'number') gl.uniform1f(l, v);
    else gl.uniform2fv(l, v);
  }
  let unit = 0;
  for (const [k, t] of Object.entries(tex)) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(gl.getUniformLocation(p, k), unit++);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ------------------------------------------------------------------------------------------------ the picture */

function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  return [c, c.getContext('2d')!];
}
const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
};
const img = (src: string) =>
  new Promise<HTMLImageElement>((ok, no) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = no;
    i.src = src;
  });

let W = 0;
let H = 0;
let u = 1;
let k = 1;
let gy = 0;
let profile!: Target;
let sky!: Target;
let quarter!: Target;
let quarter2!: Target;
let screen!: Target;
let grain!: HTMLCanvasElement;
let vignette!: HTMLCanvasElement;
let out!: HTMLCanvasElement;
let ox!: CanvasRenderingContext2D;
type Tree = { im: HTMLCanvasElement; x: number; y: number; n: number; ph: number; ph2: number };
const trees: Tree[] = [];
type Mote = { x: number; y: number; ax: number; ay: number; kx: number; ky: number; px: number; py: number; r: number; a: number; kf: number; pf: number; warm: boolean };
const motes: Mote[] = [];
/** where the Blob's 60 x 40 picture goes (the wallpaper's sprite is its tight crop: 26 x 20) */
let blobAt = { x: 0, y: 0 };
const blobPix = new Pix(60, 40);

WIN.__setup = async (w: number, h: number) => {
  W = w;
  H = h;
  u = Math.min(W, H) / 1080;
  k = Math.max(1, Math.round(3 * u));
  gy = H - 120 * u;
  glc = document.createElement('canvas');
  glc.width = W;
  glc.height = H;
  gl = glc.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false })!;
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets');
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  for (const [n, s] of Object.entries({ PROFILE, SKY, CUT, BLUR, OUT, GRAIN })) progs[n] = program(s);
  profile = target(W, 5, true);
  sky = target(W, H, false);
  quarter = target(Math.ceil(W / 4), Math.ceil(H / 4), false);
  quarter2 = target(Math.ceil(W / 4), Math.ceil(H / 4), false);
  screen = { fb: null, tex: null, w: W, h: H };

  // the grain (the wallpaper's: seed 37) and the vignette, made once
  run('GRAIN', screen, { S: 37 });
  [grain] = cv(W, H);
  grain.getContext('2d')!.drawImage(glc, 0, 0);
  let vx: CanvasRenderingContext2D;
  [vignette, vx] = cv(W, H);
  const v = vx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  vx.fillStyle = v;
  vx.fillRect(0, 0, W, H);

  // the forest: the wallpaper's own trees, black, exactly where it put them (the same random numbers, in the same order)
  const dark = (im: HTMLImageElement) => {
    const [t, g] = cv(im.width, im.height);
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#02040a';
    g.fillRect(0, 0, im.width, im.height);
    return t;
  };
  const S = WIN.__sprites;
  const kinds = [dark(await img(S['tree-a']!)), dark(await img(S['tree-b']!)), dark(await img(S['tree-c']!))];
  const r = rnd(3);
  const sway = rnd(77);
  for (let px = -20 * k; px < W; px += Math.round((14 + r() * 22) * k)) {
    if (Math.abs(px + 24 * k - W / 2) < 60 * k) continue;
    const im = kinds[Math.floor(r() * 3)]!;
    trees.push({ im, x: px, y: Math.round(gy - im.height * k + (4 + r() * 8) * k), n: 1 + Math.floor(sway() * 3), ph: sway() * TAU, ph2: sway() * TAU });
  }
  // the Blob: the game's own drawing (the wallpaper's sprite is the same thing, cropped); find the crop to put it where it was
  drawBlob(blobPix, 30, 34, { s: 1.6, lookY: -1, shadow: false });
  const d = blobPix.ctx.getImageData(0, 0, 60, 40).data;
  let bx = 60;
  let by = 40;
  for (let yy = 0; yy < 40; yy++) for (let xx = 0; xx < 60; xx++) if (d[(yy * 60 + xx) * 4 + 3]! > 0) { bx = Math.min(bx, xx); by = Math.min(by, yy); }
  blobAt = { x: Math.round(W / 2 - 13 * k) - bx * k, y: Math.round(gy - 18 * k) - by * k };

  // dust in the air, and a few sparks of light near the Blob
  const m = rnd(5);
  for (let i = 0; i < 70; i++)
    motes.push({ x: m() * W, y: H * (0.06 + m() * 0.82), ax: (10 + m() * 34) * u, ay: (8 + m() * 26) * u, kx: 1 + Math.floor(m() * 2), ky: 1 + Math.floor(m() * 2), px: m() * TAU, py: m() * TAU, r: (0.8 + m() * 1.6) * u, a: 0.05 + m() * 0.16, kf: 1 + Math.floor(m() * 3), pf: m() * TAU, warm: false });
  for (let i = 0; i < 9; i++)
    motes.push({ x: W / 2 + (m() - 0.5) * 150 * k, y: gy - (6 + m() * 50) * k, ax: (6 + m() * 14) * k, ay: (4 + m() * 10) * k, kx: 1 + Math.floor(m() * 2), ky: 1 + Math.floor(m() * 3), px: m() * TAU, py: m() * TAU, r: (0.9 + m() * 0.9) * u, a: 0.12 + m() * 0.2, kf: 1 + Math.floor(m() * 3), pf: m() * TAU, warm: true });

  [out, ox] = cv(W, H);
  WIN.__out = out;
};

WIN.__frame = (t: number) => {
  const th = (TAU * t) / LOOP;
  // the sky (and its bloom: the wallpaper's 40 px blur of what is brighter than 0.3, added at half strength)
  run('PROFILE', profile, { TH: th }, {}, [W, H]);
  run('SKY', sky, { TH: th, U: u }, { P: profile.tex });
  run('CUT', quarter, { C: 0.3 }, { T: sky.tex });
  const sig = (40 * u) / 4;
  run('BLUR', quarter2, { D: [1, 0], S: sig }, { T: quarter.tex });
  run('BLUR', quarter, { D: [0, 1], S: sig }, { T: quarter2.tex });
  run('OUT', screen, { A: 0.5 }, { T: sky.tex, B: quarter.tex });
  const x = ox;
  x.globalCompositeOperation = 'source-over';
  x.globalAlpha = 1;
  x.drawImage(glc, 0, 0);

  // the ground, and the trees (their tops sway by one pixel at most, each tree at its own pace)
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#02040a';
  x.fillRect(0, gy, W, H - gy);
  for (const tr of trees) {
    const h = tr.im.height;
    const w = tr.im.width;
    const s = 0.65 * Math.sin(tr.n * th + tr.ph) + 0.35 * Math.sin(2 * tr.n * th + tr.ph2);
    let j0 = 0;
    let off0 = Math.round(1.2 * s);
    for (let j = 1; j <= h; j++) {
      const off = j < h ? Math.round(1.2 * Math.pow((h - j) / h, 2.2) * s) : NaN;
      if (off !== off0) {
        x.drawImage(tr.im, 0, j0, w, j - j0, tr.x + off0 * k, tr.y + j0 * k, w * k, (j - j0) * k);
        j0 = j;
        off0 = off;
      }
    }
  }

  // the Blob's glow: it breathes with it, and a wider, fainter light swells and fades around it
  const breath = Math.sin((TAU * t) / 4);
  const glowA = 0.45 * (1 + 0.16 * Math.sin((TAU * t) / 8));
  const gr = 40 * k * (1 + 0.04 * Math.sin((TAU * t) / 8 - 0.6));
  x.save();
  x.globalCompositeOperation = 'lighter';
  const halo = x.createRadialGradient(W / 2, gy - 6 * k, 0, W / 2, gy - 6 * k, 95 * k);
  halo.addColorStop(0, `rgba(255,214,110,${0.09 * (0.5 - 0.5 * Math.cos((TAU * t) / 12))})`);
  halo.addColorStop(1, 'rgba(255,214,110,0)');
  x.fillStyle = halo;
  x.fillRect(W / 2 - 100 * k, gy - 100 * k, 200 * k, 200 * k);
  const gl2 = x.createRadialGradient(W / 2, gy - 6 * k, 0, W / 2, gy - 6 * k, gr);
  gl2.addColorStop(0, `rgba(255,214,110,${glowA})`);
  gl2.addColorStop(1, 'rgba(255,214,110,0)');
  x.fillStyle = gl2;
  x.fillRect(W / 2 - gr - 5 * k, gy - gr - 10 * k, 2 * gr + 10 * k, 2 * gr + 10 * k);
  x.restore();
  // the Blob itself: breathing (the game's squash: a pixel taller, a pixel wider), blinking twice a loop
  const blink = [6.2, 17.4].some((b) => t >= b && t < b + 0.15) ? 1 : 0;
  blobPix.ctx.clearRect(0, 0, 60, 40);
  drawBlob(blobPix, 30, 34, { s: 1.6, lookY: -1, shadow: false, squash: 1 + 0.035 * breath, blink });
  x.imageSmoothingEnabled = false;
  x.drawImage(blobPix.canvas, blobAt.x, blobAt.y, 60 * k, 40 * k);

  // the dust and the sparks
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    const mx = m.x + m.ax * Math.sin(m.kx * th + m.px);
    const my = m.y + m.ay * Math.sin(m.ky * th + m.py);
    const a = m.a * (0.6 + 0.4 * Math.sin(m.kf * th + m.pf));
    const rr = m.r * 3;
    const g = x.createRadialGradient(mx, my, 0, mx, my, rr);
    const col = m.warm ? '255,226,150' : '200,236,255';
    g.addColorStop(0, `rgba(${col},${a})`);
    g.addColorStop(0.35, `rgba(${col},${a * 0.45})`);
    g.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = g;
    x.fillRect(mx - rr, my - rr, 2 * rr, 2 * rr);
  }
  x.restore();

  // the finish: the wallpaper's grain (still) and vignette
  x.save();
  x.globalCompositeOperation = 'overlay';
  x.globalAlpha = 0.08;
  x.drawImage(grain, 0, 0);
  x.restore();
  x.drawImage(vignette, 0, 0);
};
