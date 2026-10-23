import * as THREE from 'three';

/**
 * Building blocks for the explorable map: everything is boxes (the arena's own look), collected into a few instanced meshes so the
 * whole map costs a handful of draw calls on a phone.
 */

const UNIT = new THREE.BoxGeometry(1, 1, 1);

/** Collects boxes (position, size, turn, colour) and turns them into one InstancedMesh. */
export class Boxes {
  private mats: THREE.Matrix4[] = [];
  private cols: number[] = [];
  private o = new THREE.Object3D();

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, ry = 0, rx = 0, rz = 0): void {
    const o = this.o;
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.scale.set(sx, sy, sz);
    o.updateMatrix();
    this.mats.push(o.matrix.clone());
    this.cols.push(color);
  }

  get count(): number {
    return this.mats.length;
  }

  mesh(mat: THREE.Material, geo: THREE.BufferGeometry = UNIT): THREE.InstancedMesh {
    const n = Math.max(1, this.mats.length);
    const m = new THREE.InstancedMesh(geo, mat, n);
    const c = new THREE.Color();
    this.mats.forEach((mt, i) => {
      m.setMatrixAt(i, mt);
      m.setColorAt(i, c.setHex(this.cols[i]!));
    });
    m.count = this.mats.length;
    m.frustumCulled = false;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return m;
  }
}

/** a soft round glow that always faces the camera (additive) */
export function glowSprite(color: number, size: number, opacity = 0.5): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}

/** a flat round pool of light on the floor (additive) */
export function lightPool(color: number, size: number, opacity = 0.35): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  return m;
}

let glowT: THREE.Texture | null = null;
function glowTex(): THREE.Texture {
  if (glowT) return glowT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  glowT = new THREE.CanvasTexture(c);
  glowT.colorSpace = THREE.SRGBColorSpace;
  return glowT;
}

/** a pale card with a few words on it, like the labels on the Collector's wall */
export function label(lines: string[], w: number, h: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8dcb8';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#5a4a3a';
  g.lineWidth = 6;
  g.strokeRect(3, 3, c.width - 6, c.height - 6);
  g.fillStyle = '#2a1a14';
  g.font = `bold ${Math.round(c.height / (lines.length + 1.2))}px monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, c.width / 2, ((i + 0.9) * c.height) / (lines.length + 0.8)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
}

/** seconds-based random helpers */
export const randIn = (r: () => number, a: number, b: number) => a + (b - a) * r();
