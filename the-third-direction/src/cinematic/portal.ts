import * as THREE from 'three';

/**
 * A hole in the forest with the 3D world behind it.
 *
 * The 3D scene is drawn into its own picture at the screen's real resolution, then laid over the forest (which stays crisp pixel
 * art) through a ragged opening: a claw-tear when a guardian falls, the portal at the Edge. Inside the opening it is smooth and
 * deep; at the rim the light bends a little (the colours split) and glows. Positions are in the forest's own pixels (0..W, 0..H).
 */

export interface PortalView {
  /** centre and radii of the opening, in forest pixels */
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** turned by this angle (radians) */
  ang: number;
  /** how ragged the edge is (0 = a clean ellipse) */
  jag: number;
  /** the rim's light, 0..1 */
  glow: number;
  /** the rim's colour */
  color: number;
}

export class PortalLayer {
  readonly mesh: THREE.Mesh;
  private rt: THREE.WebGLRenderTarget;
  private mat: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  constructor(W: number, H: number) {
    this.rt = new THREE.WebGLRenderTarget(W * 2, H * 2, { samples: 4 });
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(W, H) },
        uC: { value: new THREE.Vector2() },
        uR: { value: new THREE.Vector2(1, 1) },
        uAng: { value: 0 },
        uJag: { value: 0.1 },
        uGlow: { value: 1 },
        uCol: { value: new THREE.Color(0x9ff4ee) },
        uTime: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform vec2 uRes, uC, uR;
        uniform float uAng, uJag, uGlow, uTime;
        uniform vec3 uCol;
        varying vec2 vUv;
        void main() {
          vec2 p = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y) - uC;
          float c = cos(uAng), s = sin(uAng);
          vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y) / uR;
          float d = length(q);
          float a = atan(q.y, q.x);
          // a ragged edge that crawls
          float n = 0.5 * sin(a * 7.0 + uTime * 3.1) + 0.3 * sin(a * 13.0 - uTime * 2.3) + 0.2 * sin(a * 29.0 + uTime * 6.7);
          float edge = 1.0 + uJag * n;
          // distances in forest pixels along this ray, so a thin tear and a wide one get the same rim
          float rp = length(p) / max(d, 1e-4);
          float o = (d - edge) * rp;
          if (o > 14.0) discard;
          if (o > 0.0) {
            // a soft glow just outside the opening
            float g = exp(-o / 3.5);
            gl_FragColor = vec4(uCol * 1.4, g * 0.7 * uGlow);
            #include <colorspace_fragment>
            return;
          }
          // inside: the 3D world, bent a little at the rim, its colours split there
          float rim = 1.0 - smoothstep(0.0, 7.0, -o);
          vec2 dir = normalize(p + 1e-5);
          vec2 sd = vec2(dir.x, -dir.y) / uRes;
          vec2 uv = vUv + sd * 4.0 * rim;
          vec3 col;
          col.r = texture2D(tScene, uv + sd * 1.5 * rim).r;
          col.g = texture2D(tScene, uv).g;
          col.b = texture2D(tScene, uv - sd * 1.5 * rim).b;
          // a thin hot edge, and a little light spilling in
          float hot = 1.0 - smoothstep(0.0, 1.6, -o);
          col = mix(col, uCol * 1.6, (rim * rim * 0.35 + hot * 0.8) * uGlow);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.mat);
    this.mesh.position.z = 0.5;
    this.mesh.renderOrder = 10;
    this.mesh.visible = false;
  }

  /** draw the 3D scene into the portal's picture, at the size the screen is being drawn */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.getDrawingBufferSize(this.size);
    if (this.rt.width !== this.size.x || this.rt.height !== this.size.y) this.rt.setSize(this.size.x, this.size.y);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
  }

  set(v: PortalView | null, time: number) {
    this.mesh.visible = !!v;
    if (!v) return;
    const u = this.mat.uniforms;
    (u['uC']!.value as THREE.Vector2).set(v.x, v.y);
    (u['uR']!.value as THREE.Vector2).set(Math.max(0.5, v.rx), Math.max(0.5, v.ry));
    u['uAng']!.value = v.ang;
    u['uJag']!.value = v.jag;
    u['uGlow']!.value = v.glow;
    (u['uCol']!.value as THREE.Color).setHex(v.color);
    u['uTime']!.value = time;
  }
}
