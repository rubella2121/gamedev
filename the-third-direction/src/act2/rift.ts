import * as THREE from 'three';

/**
 * The tear in the sky the Blob falls out of.
 *
 * One quad that always faces the camera. Inside the ragged opening is the flat world it came from (the forest's last picture,
 * kept as hard pixels, far away and dimmer toward the rim); at the rim the light is white-hot; outside it a soft bloom with slow
 * rays bleeds into the night. When X comes through after you, the light turns his red.
 */
export class SkyRift {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private flat: THREE.CanvasTexture | null = null;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      // premultiplied: the opening covers the sky, its light adds to it
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        tFlat: { value: null },
        uHas: { value: 0 },
        uTime: { value: 0 },
        uRed: { value: 0 },
        uSize: { value: new THREE.Vector2(26, 34) },
        uR: { value: new THREE.Vector2(3.3, 6.6) },
        uCool: { value: new THREE.Color(0x9ff4ee) },
        uHot: { value: new THREE.Color(0xff3a48) },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tFlat;
        uniform float uHas, uTime, uRed;
        uniform vec2 uSize, uR;
        uniform vec3 uCool, uHot;
        varying vec2 vUv;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 p = (vUv - 0.5) * uSize;
          vec2 q = p / uR;
          float d = length(q);
          float a = atan(q.y, q.x);
          float n = 0.5 * sin(a * 7.0 + uTime * 1.7) + 0.3 * sin(a * 13.0 - uTime * 2.3) + 0.2 * sin(a * 31.0 + uTime * 5.1);
          float edge = 1.0 + 0.11 * n;
          vec3 light = mix(uCool, uHot, uRed);
          vec3 col = vec3(0.0);
          float alpha = 0.0;
          if (d < edge) {
            // the flat world, far behind the sky: hard pixels, swaying a little, darker toward the rim
            vec3 far = vec3(0.02, 0.05, 0.07);
            if (uHas > 0.5) {
              vec2 fu = vec2(0.5) + vec2(p.x / (uR.x * 2.3), p.y / (uR.y * 2.15)) + vec2(sin(uTime * 0.7), cos(uTime * 0.5)) * 0.01;
              far = texture2D(tFlat, fu).rgb * 0.85;
            }
            float deep = smoothstep(0.25, 1.0, d / edge);
            col = mix(far, far * 0.25 + light * 0.08, deep * 0.8);
            // the rim: white-hot, thin
            float rim = smoothstep(edge - 0.16, edge, d);
            col += mix(light, vec3(1.0), 0.55) * rim * rim * 2.2;
            alpha = 1.0;
          } else {
            float o = d - edge;
            // a tight bloom, a wide haze, and slow rays leaking out of the tear
            float glow = exp(-o * 5.0) * 0.95 + exp(-o * 1.3) * 0.28;
            float rays = pow(0.5 + 0.5 * sin(a * 9.0 + 2.0 * sin(a * 3.0 + uTime * 0.4) + uTime * 0.25), 7.0) * exp(-o * 1.1) * 0.55;
            float grain = 0.9 + 0.2 * hash(floor(vUv * 420.0) + floor(uTime * 12.0));
            col = light * (glow + rays) * grain;
            // the quad's own edge never shows
            vec2 e = abs(vUv - 0.5) * 2.0;
            col *= 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));
          }
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(26, 34), this.mat);
    quad.renderOrder = 5;
    quad.frustumCulled = false;
    this.group.add(quad);
    this.group.visible = false;
    this.group.traverse((o) => (o.userData['noGround'] = true));
  }

  /** what shows through: the forest's last picture */
  setFlat(c: HTMLCanvasElement) {
    if (this.flat) this.flat.dispose();
    const t = new THREE.CanvasTexture(c);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    this.flat = t;
    this.mat.uniforms['tFlat']!.value = t;
    this.mat.uniforms['uHas']!.value = 1;
  }

  /** time, and how much of his red is in the light (0..1) */
  update(time: number, red: number) {
    this.mat.uniforms['uTime']!.value = time;
    this.mat.uniforms['uRed']!.value = red;
  }
}
