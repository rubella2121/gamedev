import * as THREE from 'three';

/**
 * Materials for the world mock-up: three's standard material with two additions that make a night forest look like one.
 *   - fog that is thicker near the ground, two-toned (a cool near haze, a lilac far one) and lit by the moon where you look towards it;
 *   - a little world-space noise in the colour and the surface, so a hillside is not a flat colour.
 * Every material in the world goes through `std()` (or `fogged()` for materials made elsewhere, like the creature kit's toon skin).
 */

export const ATMO = {
  /** below this height the haze is at full strength; above it, it thins by e^(-k per unit) */
  fogBaseY: { value: 0 },
  fogHeightK: { value: 0.05 },
  /** 0 = plain distance fog, 1 = all of the fog hugs the ground */
  fogHeightMix: { value: 0.6 },
  fogColorFar: { value: new THREE.Color(0x2a3a5c) },
  moonDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  moonColor: { value: new THREE.Color(0x9fd8ff) },
  inscatter: { value: 0.4 },
  /** a cool edge light on every surface that faces away from the camera (how a night forest keeps its silhouettes) */
  rimColor: { value: new THREE.Color(0x4a7ab0) },
  rimK: { value: 0 },
  /** how patchy the haze is (0 = even) and where it has drifted to */
  fogPatch: { value: 0 },
  fogSeed: { value: 0 },
};

const NOISE_GLSL = /* glsl */ `
  float wHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float wNoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(wHash(i + vec3(0,0,0)), wHash(i + vec3(1,0,0)), f.x), mix(wHash(i + vec3(0,1,0)), wHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(wHash(i + vec3(0,0,1)), wHash(i + vec3(1,0,1)), f.x), mix(wHash(i + vec3(0,1,1)), wHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float wFbm(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * wNoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

export interface DetailOpts {
  /** how much the colour varies with the noise (0 = none) */
  vary?: number;
  /** bump strength (0 = none) */
  bump?: number;
  /** noise scale in cycles per unit: x z (ground) and y (stretch up: bark) */
  scale?: [number, number];
  /** 0 = ground noise, 1 = streaks that run up and down (bark, bones) */
  streak?: number;
  /** holes: the surface is see-through where world noise (at `scale` cycles per unit) is below lo..hi (leaves, ragged cloth) */
  cut?: { scale: number; lo: number; hi: number; sy?: number };
  /** this material's own edge light (instead of the shot's): a colour and a strength */
  rim?: { color: number; k: number };
}

function inject(shader: THREE.WebGLProgramParametersWithUniforms, d: DetailOpts | null, additive = false) {
  for (const k of Object.keys(ATMO)) shader.uniforms[k] = (ATMO as Record<string, { value: unknown }>)[k]!;
  if (d?.rim) {
    shader.uniforms['rimColor'] = { value: new THREE.Color(d.rim.color) };
    shader.uniforms['rimK'] = { value: d.rim.k };
  }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      {
        vec4 mw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mw = instanceMatrix * mw;
        #endif
        vWPos = (modelMatrix * mw).xyz;
      }`,
    );
  const sc = d?.scale ?? [0.4, 0.4];
  const frag = `
    varying vec3 vWPos;
    uniform float fogBaseY; uniform float fogHeightK; uniform float fogHeightMix; uniform vec3 fogColorFar;
    uniform vec3 moonDir; uniform vec3 moonColor; uniform float inscatter; uniform vec3 rimColor; uniform float rimK; uniform float fogPatch; uniform float fogSeed;
    ${NOISE_GLSL}
    vec3 detailP(vec3 w){ return vec3(w.x * ${sc[0].toFixed(3)}, w.y * ${sc[1].toFixed(3)}, w.z * ${sc[0].toFixed(3)}); }
    float detailH(vec3 w){
      vec3 p = detailP(w);
      ${d?.streak ? 'p = vec3(w.x * 2.2, w.y * 0.5, w.z * 2.2);' : ''}
      return wFbm(p);
    }
    vec3 perturbW(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection){
      vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)); vec3 vSigmaY = normalize(dFdy(surf_pos.xyz)); vec3 vN = surf_norm;
      vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
      float fDet = dot(vSigmaX, R1) * faceDirection;
      vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
      return normalize(abs(fDet) * surf_norm - vGrad);
    }`;
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + frag);
  if (d?.cut) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      { float cn = wFbm(vWPos * vec3(${d.cut.scale.toFixed(3)}, ${(d.cut.scale * (d.cut.sy ?? 1)).toFixed(3)}, ${d.cut.scale.toFixed(3)})); diffuseColor.a = smoothstep(${d.cut.lo.toFixed(3)}, ${d.cut.hi.toFixed(3)}, cn); }`,
    );
  }
  if (d && (d.vary || d.bump)) {
    if (d.vary) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        { float dn = detailH(vWPos); float df = 1.0 - smoothstep(60.0, 300.0, vFogDepth); diffuseColor.rgb *= 1.0 + (dn - 0.5) * ${(d.vary * 2).toFixed(3)} * df; }`,
      );
    }
    if (d.bump) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        { float hh = detailH(vWPos); float df = 1.0 - smoothstep(25.0, 140.0, vFogDepth); vec2 dH = vec2(dFdx(hh), dFdy(hh)) * ${d.bump.toFixed(3)} * df; normal = perturbW(-vViewPosition, normal, dH, faceDirection); }`,
      );
    }
  }
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    `#include <emissivemap_fragment>
    if (rimK > 0.0) {
      vec3 rN = normalize(normal);
      float rim = pow(1.0 - clamp(dot(rN, normalize(vViewPosition)), 0.0, 1.0), 3.0);
      float side = clamp(dot(inverseTransformDirection(rN, viewMatrix), moonDir) * 0.5 + 0.5, 0.0, 1.0);
      totalEmissiveRadiance += rimColor * rim * (0.2 + 0.8 * side) * rimK;
    }`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <fog_fragment>',
    `#ifdef USE_FOG
      {
        float fd = vFogDepth;
        float hAvg = 0.5 * (cameraPosition.y + vWPos.y);
        float hf = exp(-max(hAvg - fogBaseY, 0.0) * fogHeightK);
        float dens = fogDensity * mix(1.0, hf * 2.2, fogHeightMix);
        if (fogPatch > 0.0) {
          vec3 mid = 0.5 * (cameraPosition + vWPos);
          dens *= mix(1.0, 0.35 + 1.3 * wFbm(vec3(mid.x * 0.016 + fogSeed, mid.y * 0.03, mid.z * 0.016)), fogPatch);
        }
        float fogFactor = 1.0 - exp(-dens * dens * fd * fd);
        vec3 vd = normalize(vWPos - cameraPosition);
        float sc = pow(max(dot(vd, moonDir), 0.0), 6.0) * inscatter;
        vec3 fc = mix(fogColor, fogColorFar, smoothstep(40.0, 360.0, fd)) + moonColor * sc * smoothstep(20.0, 200.0, fd);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, ${additive ? 'vec3(0.0)' : 'fc'}, clamp(fogFactor, 0.0, 1.0));
      }
    #endif`,
  );
}

/** Give any lit material the world's fog (and optionally the noise) */
export function fogged<T extends THREE.Material>(m: T, d: DetailOpts | null = null, additive = false): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    inject(shader, d, additive);
  };
  const key = m.customProgramCacheKey;
  m.customProgramCacheKey = () => `${key ? key.call(m) : ''}w${d ? JSON.stringify(d) : 'f'}${additive ? 'a' : ''}`;
  (m as unknown as { fog: boolean }).fog = true;
  return m;
}

export interface StdOpts extends DetailOpts {
  color?: number;
  vertexColors?: boolean;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  side?: THREE.Side;
  flatShading?: boolean;
  transparent?: boolean;
  opacity?: number;
}

export function std(o: StdOpts = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: o.color ?? 0xffffff,
    vertexColors: o.vertexColors ?? false,
    roughness: o.roughness ?? 0.9,
    metalness: o.metalness ?? 0,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    side: o.side ?? THREE.FrontSide,
    flatShading: o.flatShading ?? false,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
  });
  if (o.cut) m.alphaToCoverage = true;
  return fogged(m, o.vary || o.bump || o.cut || o.rim ? o : null);
}

/** Light that does not need lighting: glows, eyes, beams. Never fogged to nothing: it fades with distance by itself. */
export function emit(color: number, o: { opacity?: number; additive?: boolean; side?: THREE.Side; fog?: boolean } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: o.opacity !== undefined || !!o.additive,
    opacity: o.opacity ?? 1,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !o.additive,
    side: o.side ?? THREE.FrontSide,
    fog: o.fog ?? false,
  });
}

/** A glow that haze swallows with distance: additive, drawn unlit, in vertex colours or one colour. */
export function glowMat(o: { color?: number; vertexColors?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({
    color: o.color ?? 0xffffff,
    vertexColors: o.vertexColors ?? false,
    transparent: true,
    opacity: o.opacity ?? 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: o.side ?? THREE.FrontSide,
  });
  return fogged(m, null, true);
}
