import * as THREE from 'three';
import { rng } from '../../src/core/util';
import { halo } from '../../src/act2/kit/skin';

/** Light you can see: beams through the trees, glow pools on the ground, fireflies and drifting spores. */

const softTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (!t) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.3, 'rgba(255,255,255,0.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
    }
    return t;
  };
})();

/** A beam of light: a soft open cone from `top` down to the ground, brightest where it leaves the sky and fading at its edges. */
export function beam(top: THREE.Vector3, bottom: THREE.Vector3, rTop: number, rBottom: number, color: number, k = 0.35): THREE.Mesh {
  const len = top.distanceTo(bottom);
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, 28, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: k } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vH = uv.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uK; varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float h = smoothstep(0.0, 0.18, vH) * (0.35 + 0.65 * vH); gl_FragColor = vec4(uColor * e * h * uK, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  const mid = top.clone().add(bottom).multiplyScalar(0.5);
  m.position.copy(mid);
  const dir = top.clone().sub(bottom).normalize();
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  m.renderOrder = 5;
  return m;
}

/** A pool of glow on the ground (a flat soft disc). */
export function glowPool(x: number, y: number, z: number, radius: number, color: number, opacity = 0.5): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: softTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.08, z);
  m.renderOrder = 4;
  return m;
}

export function glowSprite(x: number, y: number, z: number, size: number, color: number, opacity = 0.8): THREE.Sprite {
  const s = halo(color, size, opacity);
  s.position.set(x, y, z);
  return s;
}

/** Fireflies and spores: points of light in a box, in a few colours. */
export function motes(center: THREE.Vector3, half: THREE.Vector3, n: number, colors: number[], size = 0.22, seed = 11, yMin?: number): THREE.Points {
  const r = rng(seed);
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    pos[i * 3] = center.x + (r() - 0.5) * 2 * half.x;
    pos[i * 3 + 1] = Math.max(yMin ?? -1e9, center.y + (r() - 0.5) * 2 * half.y);
    pos[i * 3 + 2] = center.z + (r() - 0.5) * 2 * half.z;
    c.setHex(colors[Math.floor(r() * colors.length)]!);
    const k = 0.5 + r() * 0.9;
    col[i * 3] = c.r * k;
    col[i * 3 + 1] = c.g * k;
    col[i * 3 + 2] = c.b * k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size, map: softTex(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false });
  const p = new THREE.Points(g, m);
  p.renderOrder = 6;
  p.frustumCulled = false;
  return p;
}
