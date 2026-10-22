import * as THREE from 'three';
import { buildTerrain } from './world/terrain';
import { makeSky } from './world/sky';
import { ATMO } from './world/shade';
import { defaultGrade, Post, type Grade } from './world/post';
import { plantTrees, treeMeshes, type Plant } from './world/plant';
import { CRATER, height } from './world/layout';
import { rng } from '../src/core/util';
import { SHOTS, type Ctx } from './world/shots';

/**
 * The 3D world mock-up: the whole forest as a scene you can put a camera in. tools/world-render.mjs drives it (window.__world) and saves the pictures.
 * Concept art, not game code: nothing in src/ uses it.
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
  moon?: { dir: [number, number, number]; color?: number; size?: number; intensity?: number };
  sky?: { zenith?: number; horizon?: number; below?: number; stars?: number; cloud?: number };
  grade?: Partial<{ [K in keyof Grade]: Grade[K] extends THREE.Color ? [number, number, number] : Grade[K] }>;
  /** where the moon's shadows are cast for: the centre and half-size of the lit area */
  shadow?: { center: [number, number, number]; size: number };
  /** the sky's fill light (what lifts the shadows) and a soft light from the camera's side */
  amb?: { sky?: number; ground?: number; k?: number };
  fill?: { color?: number; k?: number };
  /** how far (in units) the detailed, the plain and the farthest props are drawn */
  detail?: { lod0?: number; lod1?: number; maxDist?: number };
  /** also return a picture of the distance to everything (for depth of field and haze in post) */
  depth?: boolean;
  /** 1 (default) the crater where the foot landed, 0 the glade as it was */
  crater?: number;
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
const hemi = new THREE.HemisphereLight(0x3a5a8a, 0x14201c, 0.55);
scene.add(hemi);
const fill = new THREE.DirectionalLight(0x6a8ac0, 0);
scene.add(fill, fill.target);
const moon = new THREE.DirectionalLight(0xbfdcff, 2.4);
moon.castShadow = true;
scene.add(moon, moon.target);
scene.fog = new THREE.FogExp2(0x0b1a26, 0.004);

let post: Post | null = null;
let plants: Plant[] = [];
let dynamic: THREE.Group | null = null;
let postSize = '';
const content = new THREE.Group();
scene.add(content);
const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
let terrain: THREE.Mesh | null = null;
let terrainStep = 1.2;

const world = {
  scene,
  content,
  async init(o: { step?: number } = {}) {
    const t0 = performance.now();
    terrainStep = o.step ?? 1.2;
    terrain = buildTerrain({ step: terrainStep });
    content.add(terrain);
    plants = plantTrees();
    return Math.round(performance.now() - t0);
  },

  /** the crater where the foot came down, or (0) the glade before it did: rebuilds the ground when it changes */
  setCrater(k: number) {
    if (CRATER.k === k) return;
    CRATER.k = k;
    if (terrain) {
      content.remove(terrain);
      terrain.geometry.dispose();
    }
    terrain = buildTerrain({ step: terrainStep });
    content.add(terrain);
  },

  render(s: ShotSpec): { beauty: string; depth?: string } {
    world.setCrater(s.crater ?? 1);
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

    hemi.color.setHex(s.amb?.sky ?? 0x3a5a8a);
    hemi.groundColor.setHex(s.amb?.ground ?? 0x14201c);
    hemi.intensity = s.amb?.k ?? 0.55;
    // a soft light that comes from where the camera is, so that nothing facing us is pure black
    fill.color.setHex(s.fill?.color ?? 0x6a8ac0);
    fill.intensity = s.fill?.k ?? 0;
    fill.position.copy(camera.position).add(new THREE.Vector3(8, 14, 6));
    fill.target.position.set(...s.cam.look);
    // the moon: a low cool light that throws long shadows
    const md = new THREE.Vector3(...(s.moon?.dir ?? [-0.5, 0.55, -0.7])).normalize();
    const mc = s.moon?.color ?? 0xbfdcff;
    moon.color.setHex(mc);
    moon.intensity = s.moon?.intensity ?? 2.4;
    const sc = s.shadow ?? { center: [0, 0, 0] as [number, number, number], size: 260 };
    moon.target.position.set(...sc.center);
    moon.position.copy(md).multiplyScalar(500).add(moon.target.position);
    const sh = moon.shadow;
    sh.mapSize.set(4096, 4096);
    sh.camera.left = -sc.size;
    sh.camera.right = sc.size;
    sh.camera.top = sc.size;
    sh.camera.bottom = -sc.size;
    sh.camera.near = 50;
    sh.camera.far = 1100;
    sh.bias = -0.0004;
    sh.normalBias = Math.max(0.12, sc.size * 0.004);
    sh.camera.updateProjectionMatrix();
    sh.needsUpdate = true;

    const f = s.fog ?? { density: 0.006 };
    const fc = new THREE.Color(f.color ?? 0x0b1a26);
    (scene.fog as THREE.FogExp2).color.copy(fc);
    (scene.fog as THREE.FogExp2).density = f.density;
    ATMO.fogColorFar.value.setHex(f.far ?? 0x2a3a5c);
    ATMO.fogBaseY.value = f.baseY ?? 0;
    ATMO.fogHeightK.value = f.heightK ?? 0.05;
    ATMO.fogHeightMix.value = f.heightMix ?? 0.6;
    ATMO.inscatter.value = f.inscatter ?? 0.4;
    ATMO.moonDir.value.copy(md);
    ATMO.moonColor.value.setHex(mc);
    ATMO.fogPatch.value = s.fogPatch ?? 0;
    ATMO.fogSeed.value = s.fogSeed ?? 0;
    ATMO.rimK.value = s.rim?.k ?? 0;
    ATMO.rimColor.value.setHex(s.rim?.color ?? 0x4a7ab0);

    sky.set({
      zenith: s.sky?.zenith ?? 0x050a1c,
      horizon: s.sky?.horizon ?? 0x16304a,
      below: s.sky?.below ?? 0x0b1a26,
      moonDir: md,
      moonColor: mc,
      moonSize: s.moon?.size ?? 0.05,
      stars: s.sky?.stars ?? 0.012,
      cloud: s.sky?.cloud ?? 0.6,
    });
    sky.mesh.position.copy(camera.position);

    // what is in front of the camera: the trees (near ones detailed), rebuilt for every shot, and whatever this shot's builder adds
    if (dynamic) {
      content.remove(dynamic);
      dynamic.traverse((o) => {
        const m = o as THREE.InstancedMesh;
        if (m.isInstancedMesh) m.dispose();
      });
    }
    dynamic = new THREE.Group();
    const shotPlants = plants.slice();
    const rand = rng(7);
    const ctx: Ctx = {
      add: (o, flags) => {
        if (flags?.noDepth) o.userData['noDepth'] = true;
        dynamic!.add(o);
        return o;
      },
      gy: height,
      plants: shotPlants,
      rand,
      p: s.params ?? {},
      cam: camera,
      md,
    };
    if (s.build) {
      const b = SHOTS[s.build];
      if (!b) throw new Error(`no shot builder "${s.build}"`);
      b(ctx);
    }
    dynamic.add(treeMeshes(shotPlants, camera, { lod0: s.detail?.lod0 ?? 70, lod1: s.detail?.lod1 ?? 190, maxDist: s.detail?.maxDist ?? 700 }));
    content.add(dynamic);

    const key = `${w}x${h}`;
    if (!post || postSize !== key) {
      post?.dispose();
      post = new Post(renderer, scene, camera, w, h, 4);
      postSize = key;
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
    if (!s.depth) return { beauty };

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
    return { beauty, depth };
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
