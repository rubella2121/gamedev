import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** What makes a render look like a picture: bloom on the lights, then (in display colours) a split-tone grade, vignette and a little film grain. */

export interface Grade {
  bloom: number;
  bloomRadius: number;
  bloomThreshold: number;
  exposure: number;
  /** colour pushed into the shadows and into the highlights */
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
  aberration: number;
}

export const defaultGrade = (): Grade => ({
  bloom: 0.55,
  bloomRadius: 0.8,
  bloomThreshold: 0.78,
  exposure: 1.0,
  shadowTint: new THREE.Color(0.9, 1.0, 1.12),
  highlightTint: new THREE.Color(1.1, 1.02, 0.9),
  contrast: 1.08,
  saturation: 1.05,
  vignette: 0.55,
  grain: 0.035,
  aberration: 0.0025,
});

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uShadow: { value: new THREE.Color() },
    uHigh: { value: new THREE.Color() },
    uContrast: { value: 1 },
    uSat: { value: 1 },
    uVig: { value: 0.5 },
    uGrain: { value: 0.03 },
    uCA: { value: 0.002 },
    uSeed: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uShadow; uniform vec3 uHigh; uniform float uContrast; uniform float uSat; uniform float uVig; uniform float uGrain; uniform float uCA; uniform float uSeed; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p + 19.19); return fract(p.x * p.y); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + d * uCA * r2 * 8.0).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - d * uCA * r2 * 8.0).b;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(uShadow, uHigh, smoothstep(0.08, 0.75, l));
      c = (c - 0.5) * uContrast + 0.5;
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l2), c, uSat);
      float v = smoothstep(0.25, 0.95, length(d * vec2(1.15, 1.0)) * 1.35);
      c *= 1.0 - uVig * v * v;
      c += (hash(vUv * uRes + uSeed) - 0.5) * uGrain * (1.0 - l2 * 0.5);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export class Post {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number, samples = 4) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.8, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.grade.uniforms['uRes']!.value.set(w, h);
  }

  setCamera(camera: THREE.Camera, scene: THREE.Scene) {
    const rp = this.composer.passes[0] as RenderPass;
    rp.camera = camera;
    rp.scene = scene;
  }

  apply(g: Grade) {
    this.bloom.strength = g.bloom;
    this.bloom.radius = g.bloomRadius;
    this.bloom.threshold = g.bloomThreshold;
    this.renderer.toneMappingExposure = g.exposure;
    const u = this.grade.uniforms as Record<string, { value: unknown }>;
    (u['uShadow']!.value as THREE.Color).copy(g.shadowTint);
    (u['uHigh']!.value as THREE.Color).copy(g.highlightTint);
    u['uContrast']!.value = g.contrast;
    u['uSat']!.value = g.saturation;
    u['uVig']!.value = g.vignette;
    u['uGrain']!.value = g.grain;
    u['uCA']!.value = g.aberration;
  }

  render() {
    (this.grade.uniforms['uSeed'] as { value: number }).value = Math.random() * 100;
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
