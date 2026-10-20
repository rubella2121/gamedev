import * as THREE from 'three';

/**
 * How creatures are lit: a toon ramp with a few hard bands (it sits well next to the pixel art), painted per vertex, with
 * an optional rim of light so a dark monster still reads against a dark sky.
 */

const ramps = new Map<number, THREE.DataTexture>();

function ramp(steps: number): THREE.DataTexture {
  let t = ramps.get(steps);
  if (!t) {
    const data = new Uint8Array(steps);
    for (let i = 0; i < steps; i++) data[i] = Math.round(255 * (0.3 + 0.7 * (i / (steps - 1))));
    t = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    ramps.set(steps, t);
  }
  return t;
}

export interface SkinOpts {
  color?: number;
  vertexColors?: boolean;
  emissive?: number;
  emissiveIntensity?: number;
  /** colour of the rim light (0 for none) */
  rim?: number;
  rimPower?: number;
  steps?: number;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
}

export function skin(o: SkinOpts = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: o.color ?? 0xffffff,
    vertexColors: o.vertexColors ?? false,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    gradientMap: ramp(o.steps ?? 4),
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
  });
  if (o.rim) {
    const rimColor = new THREE.Color(o.rim);
    const power = o.rimPower ?? 2.6;
    m.onBeforeCompile = (sh) => {
      sh.uniforms['rimColor'] = { value: rimColor };
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform vec3 rimColor;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n    totalEmissiveRadiance += rimColor * pow(1.0 - saturate(dot(normalize(vViewPosition), normalize(normal))), ${power.toFixed(2)});`);
    };
    m.customProgramCacheKey = () => `rim${power}`;
  }
  return m;
}

/** Colour for something that glows (eyes, cores): never lit, never fogged to nothing. */
export function glow(color: number, o: { opacity?: number; additive?: boolean } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: o.opacity !== undefined || !!o.additive,
    opacity: o.opacity ?? 1,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !o.additive,
    fog: false,
  });
}

let haloTex: THREE.CanvasTexture | null = null;

/** A soft round glow that always faces the camera. */
export function halo(color: number, size: number, opacity = 0.8): THREE.Sprite {
  if (!haloTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
    haloTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}
