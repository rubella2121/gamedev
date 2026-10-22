import * as THREE from 'three';

/** The void of the third dimension: a deep violet gradient, coloured stars, and a faint haze of colour, on a big inside-out sphere. */

export interface SkyOpts {
  zenith: number;
  horizon: number;
  below: number;
  /** star density, 0 = none */
  stars: number;
  /** how strong the faint colour clouds are */
  haze: number;
  /** the colours of the haze */
  hazeA: number;
  hazeB: number;
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
      uStars: { value: 0.01 },
      uHaze: { value: 0.4 },
      uHazeA: { value: new THREE.Color() },
      uHazeB: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uBelow; uniform float uStars; uniform float uHaze; uniform vec3 uHazeA; uniform vec3 uHazeB;
      float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h31(i), h31(i+vec3(1,0,0)), f.x), mix(h31(i+vec3(0,1,0)), h31(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h31(i+vec3(0,0,1)), h31(i+vec3(1,0,1)), f.x), mix(h31(i+vec3(0,1,1)), h31(i+vec3(1,1,1)), f.x), f.y), f.z); }
      float fb(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * n3(p); p = p * 2.1 + 7.3; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.6));
        col = mix(col, uBelow, smoothstep(0.0, -0.45, h));
        // slow drifts of colour in the void
        float cl = fb(d * 2.2 + 3.0) * fb(d * 1.1 + 11.0);
        float m = smoothstep(0.12, 0.5, cl) * uHaze;
        col = mix(col, mix(uHazeA, uHazeB, fb(d * 3.7 + 1.0)), m * 0.5);
        // stars: points of cyan, white, violet and pink
        vec3 sp = d * 260.0; vec3 cell = floor(sp);
        float r = h31(cell);
        vec3 off = vec3(h31(cell + 3.1), h31(cell + 7.7), h31(cell + 1.3)) - 0.5;
        float sd = length(fract(sp) - 0.5 - off * 0.6);
        float star = step(1.0 - uStars, r) * smoothstep(0.24, 0.0, sd) * (0.5 + 1.2 * h31(cell + 9.0));
        float k = h31(cell + 5.5);
        vec3 sc = k < 0.4 ? vec3(0.62, 0.96, 0.93) : k < 0.7 ? vec3(0.91, 1.0, 0.98) : k < 0.9 ? vec3(0.72, 0.54, 1.0) : vec3(1.0, 0.48, 0.6);
        col += sc * star;
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
    mat.uniforms['uStars']!.value = o.stars;
    mat.uniforms['uHaze']!.value = o.haze;
    (u['uHazeA']!.value as THREE.Color).setHex(o.hazeA);
    (u['uHazeB']!.value as THREE.Color).setHex(o.hazeB);
  };
  return { mesh, set };
}
