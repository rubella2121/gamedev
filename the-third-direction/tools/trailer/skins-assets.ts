/**
 * The skins reel's pictures (trailer-video/src/shorts/Skins.tsx), drawn by the game's own code:
 *  - px:       the Blob in each skin as pixel art (core/art.ts drawBlob + core/blobskins.ts), breathing, blinking, its skin
 *              flickering and flapping: a strip of 60 frames (2 s), each 64 x 64, to be shown hugely enlarged
 *  - turn:     each skin on the 3D jelly (act2/jelly.ts + act2/skins3d.ts), turning, lit like the arena
 *  - golden:   Golden alone in a spotlight; crown: its crown by itself, turning, to come down out of the dark onto its head
 *  - carousel: all five on a ring that turns
 * A 3D frame is two pictures: the solid things on a transparent ground, and (for what glows: flames, sparks, sparkles) their
 * light alone on black, to be added over whatever the film puts behind (a screen blend).
 *
 *   node tools/trailer/skins-assets.mjs <out dir>
 */
import * as THREE from 'three';
import { animateJelly, BLOB_LOOK, makeJelly, type JellyRig } from '../../src/act2/jelly';
import { dressJelly, type Dressed } from '../../src/act2/skins3d';
import { drawBlob } from '../../src/core/art';
import type { SkinId } from '../../src/core/blobskins';
import { Pix } from '../../src/core/pix';

const TAU = Math.PI * 2;
type Win = Record<string, unknown>;
const WIN = window as unknown as Win;

/* ------------------------------------------------------------------------------------------------ pixel strips */

/** 60 frames of the Blob in `skin`, side by side: a 2 s loop (one breath, a blink, the skin's own motion) */
WIN.__px = (skin: SkinId, lookY = 0.2) => {
  const N = 60;
  const p = new Pix(64 * N, 64);
  p.ctx.clearRect(0, 0, p.w, p.h);
  for (let f = 0; f < N; f++) {
    const one = new Pix(64, 64);
    one.ctx.clearRect(0, 0, 64, 64);
    drawBlob(one, 32, 54, { s: 1.6, skin, t: f / 30, squash: 1 + 0.035 * Math.sin((TAU * f) / N), blink: f >= 44 && f <= 46 ? 1 : 0, lookY, shadow: false });
    p.ctx.drawImage(one.canvas, f * 64, 0);
  }
  return p.canvas.toDataURL('image/png');
};

/* ------------------------------------------------------------------------------------------------ 3D */

let r!: THREE.WebGLRenderer;
let scene!: THREE.Scene;
let cam!: THREE.PerspectiveCamera;
type Body = { rig: JellyRig; d: Dressed; seed: number };
let bodies: Body[] = [];
let step: (f: number) => void = () => {};
const black = new THREE.MeshBasicMaterial({ color: 0x000000 });

function env(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#04070f');
  gr.addColorStop(0.45, '#123848');
  gr.addColorStop(0.55, '#0c2230');
  gr.addColorStop(1, '#05080a');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 64);
  const m = g.createRadialGradient(80, 18, 0, 80, 18, 10);
  m.addColorStop(0, 'rgba(232,255,251,1)');
  m.addColorStop(1, 'rgba(159,244,238,0)');
  g.fillStyle = m;
  g.fillRect(60, 0, 40, 40);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stage(size: number, light: 'arena' | 'spot') {
  if (!r) {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setPixelRatio(1);
  }
  r.setSize(size, size);
  scene = new THREE.Scene();
  scene.environment = env();
  if (light === 'arena') {
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.AmbientLight(0x6f9ab8, 1.0));
    const key = new THREE.DirectionalLight(0xc0ecff, 2.2);
    key.position.set(-8, 14, 10);
    scene.add(key);
    const rim1 = new THREE.DirectionalLight(0x8a7aff, 1.5);
    rim1.position.set(10, 6, -12);
    scene.add(rim1);
    const rim2 = new THREE.DirectionalLight(0x5fe8dc, 1.0);
    rim2.position.set(-10, 5, -10);
    scene.add(rim2);
    const warm = new THREE.PointLight(0xffd070, 16, 16, 1.6);
    warm.position.set(0, 3.4, 4.5);
    scene.add(warm);
  } else {
    // one light from straight above, as on a stage, and a little gold coming back off the floor
    scene.environmentIntensity = 0.35;
    scene.add(new THREE.AmbientLight(0x404858, 0.5));
    const spot = new THREE.SpotLight(0xfff0d0, 260, 30, 0.42, 0.55, 1.4);
    spot.position.set(0, 10, 2.2);
    spot.target.position.set(0, 0.6, 0);
    scene.add(spot, spot.target);
    const bounce = new THREE.PointLight(0xffb040, 6, 8, 1.6);
    bounce.position.set(0, 0.2, 2.6);
    scene.add(bounce);
    const rim = new THREE.DirectionalLight(0xffe0a0, 1.2);
    rim.position.set(0, 4, -10);
    scene.add(rim);
  }
  bodies = [];
}

function body(skin: SkinId, seed: number): Body {
  const rig = makeJelly(BLOB_LOOK);
  const d = dressJelly(rig, skin);
  scene.add(rig.g);
  const b = { rig, d, seed };
  bodies.push(b);
  return b;
}

/** move everything to film time t (the jelly's breath and blinks, the skins' flames, flaps and sparkles) */
function live(t: number) {
  for (const b of bodies) {
    animateJelly(b.rig, 1 / 30, t, 0, 0, 0, 0, b.seed);
    b.d.tick(t);
  }
}

const isGlow = (o: THREE.Object3D) => {
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !!m && !Array.isArray(m) && m.blending === THREE.AdditiveBlending;
};

/** the frame as two pictures: solid things on transparent, and the glowing things' light on black (or null if none glow) */
function shoot(): { solid: string; glow: string | null } {
  const glows: THREE.Object3D[] = [];
  const solids: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh && !(o as THREE.Sprite).isSprite) return;
    if (isGlow(o)) glows.push(o);
    else if ((o as THREE.Mesh).isMesh) solids.push([o as THREE.Mesh, (o as THREE.Mesh).material]);
  });
  const vis = glows.map((o) => o.visible);
  glows.forEach((o) => (o.visible = false));
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const solid = r.domElement.toDataURL('image/png');
  glows.forEach((o, i) => (o.visible = vis[i]!));
  let glow: string | null = null;
  if (glows.some((o) => o.visible)) {
    for (const [m] of solids) m.material = black;
    r.setClearColor(0x000000, 1);
    r.render(scene, cam);
    glow = r.domElement.toDataURL('image/png');
    for (const [m, mat] of solids) m.material = mat;
  }
  return { solid, glow };
}

/** set up one of the shots; returns how many frames it has */
WIN.__setup3d = (job: string) => {
  if (job.startsWith('turn-')) {
    // one skin, turning: from three-quarters to its right, round to its other side, under a radian a second
    const skin = job.slice(5) as SkinId;
    stage(900, 'arena');
    cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    cam.position.set(0, 2.1, 8.6);
    cam.lookAt(0, 1.2, 0);
    const b = body(skin, 1.3);
    step = (f) => {
      b.rig.g.rotation.y = -0.55 + (0.95 * f) / 30;
      live(2.0 + f / 30);
    };
    return 100;
  }
  if (job === 'golden' || job === 'crown') {
    // Golden under its spotlight, turning slowly; the crown alone is the same frame with nothing but the crown in it, turning
    // faster as it comes down so that it is turned exactly as Golden's is when it lands (frame 0 of 'golden')
    stage(900, 'spot');
    cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    cam.position.set(0, 2.1, 8.6);
    cam.lookAt(0, 1.2, 0);
    const b = body('golden', 2.1);
    const crownOnly = job === 'crown';
    if (crownOnly) {
      b.rig.body.children.forEach((c) => {
        if (c !== b.d.group) c.visible = false;
      });
      b.d.group.children.forEach((c) => (c.visible = (c as THREE.Group).isGroup === true && !(c as THREE.Mesh).isMesh));
    }
    const N = crownOnly ? 90 : 90;
    step = (f) => {
      b.rig.g.rotation.y = crownOnly ? -0.25 - 2.4 * (1 - f / (N - 1)) ** 2 : -0.25 + (0.45 * f) / 30;
      live(crownOnly ? 0.4 + f / 30 : 3.4 + f / 30);
    };
    return N;
  }
  if (job === 'carousel') {
    // all five on a ring, each facing out, the ring turning slowly; the camera a little above, the nearest one in front
    stage(1080, 'arena');
    cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    cam.position.set(0, 5.0, 13.8);
    cam.lookAt(0, 1.0, 0);
    const ring = new THREE.Group();
    scene.add(ring);
    const skins: SkinId[] = ['golden', 'explorer', 'knight', 'wizard', 'inferno'];
    const R = 2.7;
    skins.forEach((s, i) => {
      const b = body(s, i * 1.7);
      const a = (i / 5) * TAU;
      b.rig.g.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
      b.rig.g.rotation.y = a;
      scene.remove(b.rig.g);
      ring.add(b.rig.g);
    });
    step = (f) => {
      ring.rotation.y = -0.15 - (0.32 * f) / 30;
      live(1.0 + f / 30);
    };
    return 150;
  }
  throw new Error('no job ' + job);
};

WIN.__frame3d = (f: number) => {
  step(f);
  return shoot();
};
