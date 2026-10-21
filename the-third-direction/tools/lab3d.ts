import * as THREE from 'three';
import { Slicer } from '../src/act2/kit/sdf';
import { registerModels } from './lab-models';

/**
 * A viewing room for the 3D monsters: the game's sky, fog and lights, a model on a patch of floor, and a camera you
 * place by hand. `render.mjs`-style scripts call window.__lab.shot(...) and save the PNGs.
 */

const BG = 0x120a22;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 48, 160);
const ambient = new THREE.AmbientLight(0x8a78c8, 1.25);
scene.add(ambient);
const key = new THREE.DirectionalLight(0x9fe8ff, 1.9);
key.position.set(-6, 14, 8);
scene.add(key);
const back = new THREE.DirectionalLight(0xb060ff, 1.6);
back.position.set(6, 10, -14);
scene.add(back);
const red = new THREE.PointLight(0xff2a40, 0, 30, 1.4);
red.position.set(0, 14, -10);
scene.add(red);
const floorMat = new THREE.MeshLambertMaterial({ color: 0x2e2252 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(18.3, 48), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.4;
scene.add(floor);

const world = new THREE.Group();
scene.add(world);

const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x05060c, 1);
const camera = new THREE.PerspectiveCamera(64, 9 / 16, 0.1, 320);

type Builder = (slicer: Slicer, world: THREE.Group) => Promise<{ update?: (dt: number, t: number) => void; pose?: (name: string, v?: number) => void } | void>;
const builders: Record<string, Builder> = {};
let current: { update?: (dt: number, t: number) => void; pose?: (name: string, v?: number) => void } | void = undefined;
let time = 0;

interface Cam {
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
}

const lab = {
  register(name: string, b: Builder) {
    builders[name] = b;
  },
  async load(name: string): Promise<number> {
    while (world.children.length) world.remove(world.children[0]!);
    const sl = new Slicer();
    const t0 = performance.now();
    const p = builders[name]!(sl, world);
    // build in 8 ms slices like the game does, so the timing here is the timing there
    let slices = 0;
    const tick = () => {
      sl.run(8);
      slices++;
    };
    while (sl.busy) {
      tick();
      await new Promise((r) => setTimeout(r, 0));
    }
    current = await p;
    time = 0;
    void slices;
    return Math.round(performance.now() - t0);
  },
  light(v: number) {
    red.intensity = v;
  },
  /** the arena's own lighting ('arena', the default) or a night lit by the creature itself ('fire') */
  env(name: string) {
    const fire = name === 'fire';
    const bg = fire ? 0x07060a : BG;
    scene.background = new THREE.Color(bg);
    (scene.fog as THREE.Fog).color.set(bg);
    (scene.fog as THREE.Fog).near = fire ? 30 : 48;
    (scene.fog as THREE.Fog).far = fire ? 90 : 160;
    renderer.setClearColor(fire ? 0x07060a : 0x05060c, 1);
    ambient.color.set(fire ? 0x262030 : 0x8a78c8);
    ambient.intensity = fire ? 0.9 : 1.25;
    key.color.set(fire ? 0x8fb8ff : 0x9fe8ff);
    key.intensity = fire ? 1.35 : 1.9;
    if (fire) key.position.set(-7, 9, -9);
    else key.position.set(-6, 14, 8);
    back.color.set(fire ? 0x7a5aa0 : 0xb060ff);
    back.intensity = fire ? 0.55 : 1.6;
    if (fire) back.position.set(9, 5, -7);
    else back.position.set(6, 10, -14);
    floorMat.color.set(fire ? 0x1a1620 : 0x2e2252);
    // a night lit by the creature has no floor of its own: the ground is whatever its light and its effects paint
    floor.visible = !fire;
  },
  pose(name: string, v?: number) {
    if (current && current.pose) current.pose(name, v);
  },
  step(dt: number, n = 1) {
    for (let i = 0; i < n; i++) {
      time += dt;
      if (current && current.update) current.update(dt, time);
    }
  },
  shot(cam: Cam, w = 432, h = 768): string {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = cam.fov ?? 64;
    camera.position.set(...cam.pos);
    camera.lookAt(...cam.look);
    camera.updateProjectionMatrix();
    world.traverse((o) => {
      if (o.userData['billboard']) o.lookAt(camera.position);
    });
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  },
  stats(): { tris: number; meshes: number; big: string[] } {
    let tris = 0;
    let meshes = 0;
    const big: { n: number; name: string }[] = [];
    world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.visible !== false) {
        meshes++;
        const g = m.geometry;
        const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
        tris += n * inst;
        if (n * inst > 3000) big.push({ n: Math.round(n * inst), name: `${g.type}${(m as THREE.InstancedMesh).isInstancedMesh ? ' x' + inst : ''}` });
      }
    });
    big.sort((a, b) => b.n - a.n);
    return { tris: Math.round(tris), meshes, big: big.slice(0, 12).map((b) => `${b.name}:${b.n}`) };
  },
};

(window as unknown as { __lab: typeof lab }).__lab = lab;

registerModels(lab);
