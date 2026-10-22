import * as THREE from 'three';

/** The night sky: a gradient, stars, thin clouds and the moon, on a big inside-out sphere. */

export interface SkyOpts {
  zenith: number;
  horizon: number;
  below: number;
  moonDir: THREE.Vector3;
  moonColor: number;
  /** angular radius of the moon, in radians */
  moonSize: number;
  stars: number;
  cloud: number;
}

export function makeSky(): { mesh: THREE.Mesh; set: (o: SkyOpts) => void } {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBelow: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3(0, 0.3, -1) },
      uMoonColor: { value: new THREE.Color() },
      uMoonSize: { value: 0.05 },
      uStars: { value: 0.01 },
      uCloud: { value: 0.5 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uBelow; uniform vec3 uMoonDir; uniform vec3 uMoonColor;
      uniform float uMoonSize; uniform float uStars; uniform float uCloud;
      float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fb(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.1 + 7.3; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
        col = mix(col, uBelow, smoothstep(0.0, -0.3, h));
        // stars
        vec3 sp = d * 220.0; vec3 cell = floor(sp);
        float r = h31(cell);
        vec3 off = vec3(h31(cell + 3.1), h31(cell + 7.7), h31(cell + 1.3)) - 0.5;
        float sd = length(fract(sp) - 0.5 - off * 0.6);
        float star = step(1.0 - uStars, r) * smoothstep(0.22, 0.0, sd) * (0.5 + 1.2 * h31(cell + 9.0));
        col += vec3(0.8, 0.9, 1.0) * star * smoothstep(0.0, 0.25, h);
        // clouds: thin streaks, lit from the moon's side
        vec2 cp = d.xz / (abs(d.y) + 0.35);
        float cl = fb(vec3(cp * 1.7, 1.3)) * fb(vec3(cp * 0.6 + 4.0, 2.0));
        float cm = smoothstep(0.16, 0.42, cl) * smoothstep(-0.02, 0.25, h) * uCloud;
        float toMoon = max(dot(d, uMoonDir), 0.0);
        vec3 ccol = mix(uHorizon * 0.9, uMoonColor * 0.85, pow(toMoon, 3.0) * 0.9 + 0.1);
        col = mix(col, ccol, cm * 0.65);
        // the moon
        float md = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
        float disc = smoothstep(uMoonSize, uMoonSize * 0.97, md);
        vec3 mp = vec3((d - uMoonDir) * (1.0 / uMoonSize) * 2.0);
        float surf = 0.78 + 0.22 * fb(mp * 1.4 + 3.0) - 0.18 * smoothstep(0.55, 0.9, fb(mp * 3.0 + 9.0));
        float limb = 0.82 + 0.18 * (1.0 - smoothstep(0.0, uMoonSize, md));
        col = mix(col, uMoonColor * surf * limb * 1.5, disc);
        float halo = exp(-md * (6.0 / max(uMoonSize * 6.0, 0.05)));
        col += uMoonColor * (halo * 0.35 + exp(-md * 3.0) * 0.05) * (1.0 - disc * 0.5) * (1.0 - cm * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  const set = (o: SkyOpts) => {
    const u = mat.uniforms as Record<string, { value: never }>;
    (u['uZenith']!.value as THREE.Color).setHex(o.zenith);
    (u['uHorizon']!.value as THREE.Color).setHex(o.horizon);
    (u['uBelow']!.value as THREE.Color).setHex(o.below);
    (u['uMoonDir']!.value as THREE.Vector3).copy(o.moonDir).normalize();
    (u['uMoonColor']!.value as THREE.Color).setHex(o.moonColor);
    mat.uniforms['uMoonSize']!.value = o.moonSize;
    mat.uniforms['uStars']!.value = o.stars;
    mat.uniforms['uCloud']!.value = o.cloud;
  };
  return { mesh, set };
}
