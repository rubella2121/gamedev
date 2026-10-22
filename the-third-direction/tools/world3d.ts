import * as THREE from 'three';
import { makeSky } from './world/sky';
import { ATMO } from './world/shade';
import { defaultGrade, Post, type Grade } from './world/post';
import { rng } from '../src/core/util';
import { SHOTS } from './world/shots';
import { buildCast } from './world/cast';
import type { CastEntry, CastName, Ctx } from './world/ctx';

/**
 * The 3D part's world as a scene you can put a camera in: the Pressed Garden and everything around it. tools/world-render.mjs drives it (window.__world) and saves the pictures.
 * Concept art, not game code: nothing in src/ uses it (it only reads the game's own models and painters).
 */

export interface ShotSpec {
  cam: { pos: [number, number, number]; look: [number, number, number]; fov?: number; roll?: number };
  w?: number;
  h?: number;
  /** supersampling: the picture is drawn this many times bigger and the page returns it as it is (shrink it afterwards) */
  ss?: number;
  /** a set of things to add for this shot (see tools/world/shots.ts) and its numbers */
  build?: string;
  params?: Record<string, number | string | boolean>;
  fog?: { density: number; color?: number; far?: number; baseY?: number; heightK?: number; heightMix?: number; inscatter?: number };
  /** patchy drifting haze: 0 even, 1 very patchy; the seed moves it about */
  fogPatch?: number;
  fogSeed?: number;
  /** cool edge light on everything that faces away from us */
  rim?: { color?: number; k: number };
  /** the key light (cyan in the arena): `rel` puts it [degrees to the right of where the camera looks, degrees above the horizon] */
  key?: { dir?: [number, number, number]; rel?: [number, number]; color?: number; intensity?: number };
  /** a violet light from behind the scene */
  back?: { dir?: [number, number, number]; color?: number; intensity?: number };
  sky?: { zenith?: number; horizon?: number; below?: number; stars?: number; haze?: number; hazeA?: number; hazeB?: number };
  grade?: Partial<{ [K in keyof Grade]: Grade[K] extends THREE.Color ? [number, number, number] : Grade[K] }>;
  /** where the key light's shadows are cast for: the centre and half-size of the lit area */
  shadow?: { center: [number, number, number]; size: number };
  /** the sky's fill light (what lifts the shadows) and a soft light from the camera's side */
  amb?: { sky?: number; ground?: number; k?: number };
  fill?: { color?: number; k?: number };
  /** also return a picture of the distance to everything (for depth of field and haze in post) */
  depth?: boolean;
}

const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.3, 4000);
const sky = makeSky();
scene.add(sky.mesh);
const hemi = new THREE.HemisphereLight(0x8a78c8, 0x2a2048, 0.9);
scene.add(hemi);
const fill = new THREE.DirectionalLight(0x6a8ac0, 0);
scene.add(fill, fill.target);
const back = new THREE.DirectionalLight(0xb060ff, 1.2);
scene.add(back, back.target);
const key = new THREE.DirectionalLight(0x9fe8ff, 2.2);
key.castShadow = true;
scene.add(key, key.target);
scene.fog = new THREE.FogExp2(0x120a22, 0.004);

let post: Post | null = null;
let dynamic: THREE.Group | null = null;
let postSize = '';
let cast: Partial<Record<CastName, CastEntry>> = {};
const content = new THREE.Group();
scene.add(content);

/** distance from the camera, in three bytes (red = the coarse part), up to DEPTH_FAR units; anything beyond is white */
export const DEPTH_FAR = 2000;
const depthMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  toneMapped: false,
  vertexShader: /* glsl */ `varying float vDist;
    void main(){
      #include <begin_vertex>
      #include <project_vertex>
      vDist = -mvPosition.z;
    }`,
  fragmentShader: /* glsl */ `precision highp float; varying float vDist;
    void main(){
      float d = clamp(vDist / ${DEPTH_FAR.toFixed(1)}, 0.0, 0.99999);
      vec3 e = vec3(d, fract(d * 255.0), fract(d * 255.0 * 255.0));
      e.xy -= e.yz / 255.0;
      gl_FragColor = vec4(e, 1.0);
    }`,
});

const world = {
  scene,
  content,
  /** `cast`: which of the game's monsters to build (x, collector, mash, fox); it takes a few seconds each */
  async init(o: { cast?: CastName[] } = {}) {
    const t0 = performance.now();
    cast = await buildCast(o.cast ?? []);
    return Math.round(performance.now() - t0);
  },

  render(s: ShotSpec): { beauty: string; depth?: string; rays: { x: number; y: number; k: number; color: number; r: number }[]; anchors: Record<string, { x: number; y: number; d: number }> } {
    const ss = s.ss ?? 1;
    const w = Math.round((s.w ?? 1280) * ss);
    const h = Math.round((s.h ?? 720) * ss);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = s.cam.fov ?? 45;
    camera.position.set(...s.cam.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(...s.cam.look);
    if (s.cam.roll) camera.rotateZ(s.cam.roll);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    hemi.color.setHex(s.amb?.sky ?? 0x8a78c8);
    hemi.groundColor.setHex(s.amb?.ground ?? 0x2a2048);
    hemi.intensity = s.amb?.k ?? 0.9;
    // a soft light that comes from where the camera is, so that nothing facing us is pure black
    fill.color.setHex(s.fill?.color ?? 0x6a8ac0);
    fill.intensity = s.fill?.k ?? 0;
    fill.position.copy(camera.position).add(new THREE.Vector3(8, 14, 6));
    fill.target.position.set(...s.cam.look);
    // the key light: a cold cyan one that throws the shadows
    const md = new THREE.Vector3(...(s.key?.dir ?? [-0.35, 0.8, 0.5])).normalize();
    if (s.key?.rel) {
      const f = new THREE.Vector3();
      camera.getWorldDirection(f);
      const yaw = Math.atan2(f.x, f.z) + (s.key.rel[0] * Math.PI) / 180;
      const el = (s.key.rel[1] * Math.PI) / 180;
      md.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
    }
    const kc = s.key?.color ?? 0x9fe8ff;
    key.color.setHex(kc);
    key.intensity = s.key?.intensity ?? 2.2;
    const sc = s.shadow ?? { center: [0, 0, 0] as [number, number, number], size: 60 };
    key.target.position.set(...sc.center);
    key.position.copy(md).multiplyScalar(400).add(key.target.position);
    const sh = key.shadow;
    sh.mapSize.set(4096, 4096);
    sh.camera.left = -sc.size;
    sh.camera.right = sc.size;
    sh.camera.top = sc.size;
    sh.camera.bottom = -sc.size;
    sh.camera.near = 20;
    sh.camera.far = 900;
    sh.bias = -0.0004;
    sh.normalBias = Math.max(0.1, sc.size * 0.003);
    sh.camera.updateProjectionMatrix();
    sh.needsUpdate = true;
    const bd = new THREE.Vector3(...(s.back?.dir ?? [0.4, 0.6, -0.9])).normalize();
    back.color.setHex(s.back?.color ?? 0xb060ff);
    back.intensity = s.back?.intensity ?? 1.2;
    back.position.copy(bd).multiplyScalar(300).add(new THREE.Vector3(...sc.center));
    back.target.position.set(...sc.center);

    const f = s.fog ?? { density: 0.004 };
    const fc = new THREE.Color(f.color ?? 0x120a22);
    (scene.fog as THREE.FogExp2).color.copy(fc);
    (scene.fog as THREE.FogExp2).density = f.density;
    ATMO.fogColorFar.value.setHex(f.far ?? 0x2a1a4a);
    ATMO.fogBaseY.value = f.baseY ?? 0;
    ATMO.fogHeightK.value = f.heightK ?? 0.05;
    ATMO.fogHeightMix.value = f.heightMix ?? 0;
    ATMO.inscatter.value = f.inscatter ?? 0;
    ATMO.moonDir.value.copy(md);
    ATMO.moonColor.value.setHex(kc);
    ATMO.fogPatch.value = s.fogPatch ?? 0;
    ATMO.fogSeed.value = s.fogSeed ?? 0;
    ATMO.rimK.value = s.rim?.k ?? 0;
    ATMO.rimColor.value.setHex(s.rim?.color ?? 0x7a6ad0);

    sky.set({
      zenith: s.sky?.zenith ?? 0x080414,
      horizon: s.sky?.horizon ?? 0x1c1036,
      below: s.sky?.below ?? 0x0a0618,
      stars: s.sky?.stars ?? 0.012,
      haze: s.sky?.haze ?? 0.5,
      hazeA: s.sky?.hazeA ?? 0x2a1a5a,
      hazeB: s.sky?.hazeB ?? 0x123a4a,
    });
    sky.mesh.position.copy(camera.position);

    // what this shot adds, rebuilt every time (the built monsters are kept: they are taken out first so they are not disposed with it)
    if (dynamic) {
      for (const e of Object.values(cast)) e.group.removeFromParent();
      content.remove(dynamic);
      dynamic.traverse((o) => {
        const m = o as THREE.InstancedMesh;
        if (m.isInstancedMesh) m.dispose();
      });
    }
    dynamic = new THREE.Group();
    const extraRays: { pos: [number, number, number]; k: number; color: number; r: number }[] = [];
    const anchors: Record<string, THREE.Vector3> = {};
    const ctx: Ctx = {
      add: (o, flags) => {
        if (flags?.noDepth) o.userData['noDepth'] = true;
        dynamic!.add(o);
        return o;
      },
      rand: rng(7),
      p: s.params ?? {},
      cam: camera,
      scene,
      cast,
      rays: extraRays,
      anchors,
      md,
    };
    if (s.build) {
      const b = SHOTS[s.build];
      if (!b) throw new Error(`no shot builder "${s.build}"`);
      b(ctx);
    }
    content.add(dynamic);

    const keySize = `${w}x${h}`;
    if (!post || postSize !== keySize) {
      post?.dispose();
      post = new Post(renderer, scene, camera, w, h, 4);
      postSize = keySize;
    }
    const g = defaultGrade();
    if (s.grade) {
      for (const [k, v] of Object.entries(s.grade)) {
        const cur = (g as unknown as Record<string, unknown>)[k];
        if (cur instanceof THREE.Color) (cur as THREE.Color).setRGB(...(v as [number, number, number]));
        else (g as unknown as Record<string, unknown>)[k] = v;
      }
    }
    post.apply(g);
    post.render();
    const beauty = canvas.toDataURL('image/png');
    // where the lights that throw shafts are on the picture (0..1 from the top left)
    const rays: { x: number; y: number; k: number; color: number; r: number }[] = [];
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    for (const rs of extraRays) {
      const p3 = new THREE.Vector3(...rs.pos);
      const q = p3.clone().project(camera);
      if (q.z < 1 && fwd.dot(p3.clone().sub(camera.position).normalize()) > 0) rays.push({ x: q.x * 0.5 + 0.5, y: 0.5 - q.y * 0.5, k: rs.k, color: rs.color, r: rs.r });
    }
    const pinned: Record<string, { x: number; y: number; d: number }> = {};
    for (const [name, p3] of Object.entries(anchors)) {
      const q = p3.clone().project(camera);
      if (q.z < 1 && fwd.dot(p3.clone().sub(camera.position).normalize()) > 0) pinned[name] = { x: q.x * 0.5 + 0.5, y: 0.5 - q.y * 0.5, d: p3.distanceTo(camera.position) };
    }
    if (!s.depth) return { beauty, rays, anchors: pinned };

    // the depth picture: every solid thing drawn with a material that writes its distance, no glow, no sky
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const hide = o.userData['noDepth'] || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite;
      if (hide && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    });
    sky.mesh.visible = false;
    scene.overrideMaterial = depthMat;
    const bg = scene.background;
    scene.background = null;
    const prevFog = scene.fog;
    scene.fog = null;
    renderer.setClearColor(0xffffff, 1);
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    const depth = canvas.toDataURL('image/png');
    renderer.shadowMap.autoUpdate = true;
    renderer.setClearColor(0x000000, 0);
    scene.overrideMaterial = null;
    scene.background = bg;
    scene.fog = prevFog;
    sky.mesh.visible = true;
    for (const o of hidden) o.visible = true;
    return { beauty, depth, rays, anchors: pinned };
  },

  /** step the animation of a built monster (for settling a tail or a pose before a shot) */
  step(name: CastName, dt: number, n = 1) {
    const e = cast[name];
    for (let i = 0; i < n; i++) e?.api?.update?.(dt, i * dt);
  },

  stats() {
    let tris = 0;
    let meshes = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        meshes++;
        const gg = m.geometry;
        const n = (gg.index ? gg.index.count : gg.getAttribute('position').count) / 3;
        tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
      }
    });
    return { tris: Math.round(tris), meshes, calls: renderer.info.render.calls };
  },
};

(window as unknown as { __world: typeof world }).__world = world;
