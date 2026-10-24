import * as THREE from 'three';
import { rng, TAU } from '../core/util';
import type { Arena } from './arena';
import { setFlatGround } from './ground';

/**
 * The Fold: where the Fourth keeps time. The Crater is folded away and the family stands on a disc of pale stone carved like the
 * face of a clock, in a violet dark. All round it, frozen in the air, hang pieces of the world they came from (a stone, a stump,
 * a tree with its earth still on it), each one repeated a few times along a line, fainter and fainter: the same thing at a few
 * moments at once. Great rings turn slowly round the disc, like the hands of something enormous.
 *
 * The floor is flat (see setFlatGround) and round: FOLD_R from the middle.
 */

export const FOLD_R = 15;
const BG = 0x0b0618;

export class Fold {
  readonly group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private frags: { g: THREE.Group; spin: number; bob: number; y: number }[] = [];
  private floorMat: THREE.ShaderMaterial;
  private skyMat: THREE.ShaderMaterial;
  /** what was showing before the fold, to put back after */
  private was = new Map<THREE.Object3D, boolean>();
  private fog: THREE.Fog | THREE.FogExp2 | null = null;
  private bg: THREE.Color | THREE.Texture | null = null;
  active = false;

  constructor(private scene: THREE.Scene) {
    // ---- the sky: violet dark, a clock face drawn faintly across it, slow streaks of time
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uT: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        varying vec3 vD; uniform float uT;
        void main(){
          float h = clamp(vD.y, -1.0, 1.0);
          vec3 c = mix(vec3(0.06, 0.03, 0.11), vec3(0.015, 0.01, 0.04), smoothstep(-0.2, 0.8, h));
          c += vec3(0.12, 0.05, 0.2) * exp(-abs(h) * 6.0) * 0.6;
          // a vast clock face behind the arena (looking toward -z)
          vec2 q = vec2(atan(vD.x, -vD.z), vD.y - 0.18) * 1.6;
          float r = length(q);
          float ring = exp(-pow((r - 0.9) * 40.0, 2.0)) + exp(-pow((r - 0.62) * 60.0, 2.0)) * 0.6;
          float a = atan(q.y, q.x);
          float tick = step(0.985, cos(a * 12.0)) * smoothstep(0.78, 0.82, r) * (1.0 - smoothstep(0.88, 0.9, r));
          float hand = exp(-pow(dot(q, vec2(sin(uT * 0.05), cos(uT * 0.05)).yx * vec2(1.0, -1.0)) * 50.0, 2.0)) * step(0.0, dot(q, vec2(sin(uT * 0.05), cos(uT * 0.05)))) * (1.0 - smoothstep(0.5, 0.6, r));
          c += vec3(0.55, 0.42, 0.9) * (ring + tick * 1.5 + hand) * 0.35 * smoothstep(-0.3, 0.1, vD.y + 0.25);
          // streaks
          float s = sin(vD.x * 7.0 + vD.y * 21.0 + uT * 0.3) * sin(vD.z * 5.0 - uT * 0.2);
          c += vec3(0.25, 0.15, 0.4) * smoothstep(0.92, 1.0, s) * 0.25;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(280, 32, 16), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.group.add(sky);

    // ---- the floor: pale stone, ringed and ticked like a clock, its seams glowing faintly violet
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uR: { value: FOLD_R } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vP; uniform float uT; uniform float uR;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          float r = length(vP);
          float a = atan(vP.y, vP.x);
          // stone: tiles in rings
          float ringI = floor(r / 1.6);
          float seg = floor((a + 3.14159) / 6.28318 * (8.0 + ringI * 6.0));
          float n = hash(vec2(ringI, seg));
          vec3 stone = mix(vec3(0.52, 0.5, 0.6), vec3(0.66, 0.64, 0.72), n) * (0.85 + 0.15 * hash(floor(vP * 3.0)));
          float seamR = 1.0 - smoothstep(0.0, 0.05, abs(fract(r / 1.6) - 0.5) * 1.6 - 0.75);
          float seamA = 1.0 - smoothstep(0.0, 0.04, abs(fract((a + 3.14159) / 6.28318 * (8.0 + ringI * 6.0)) - 0.5) * r * 0.4 - 0.19);
          vec3 c = stone * (1.0 - 0.35 * max(seamR, seamA));
          // the clock: two engraved circles, twelve ticks, and the numerals' places
          float ring1 = exp(-pow((r - uR * 0.92) * 6.0, 2.0));
          float ring2 = exp(-pow((r - uR * 0.55) * 8.0, 2.0));
          float tick = step(0.993, cos(a * 12.0)) * smoothstep(uR * 0.8, uR * 0.82, r) * (1.0 - smoothstep(uR * 0.9, uR * 0.92, r));
          vec3 glow = vec3(0.62, 0.48, 1.0);
          float pulse = 0.6 + 0.4 * sin(uT * 1.3 - r * 0.6);
          c = mix(c, glow * 0.9, clamp((ring1 + ring2 * 0.7 + tick) * 0.75, 0.0, 1.0) * pulse);
          // the rim: it glows, then it is gone
          c += glow * exp(-pow((r - uR - 0.4) * 3.0, 2.0)) * 0.9;
          c *= 0.7;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(FOLD_R + 1.2, 96), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.userData['noGround'] = true;
    this.group.add(floor);
    // its underside: the disc is a thick slab, hanging in nothing
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(FOLD_R + 1.2, FOLD_R - 2, 3.5, 64, 1, true), new THREE.MeshLambertMaterial({ color: 0x2a2238, emissive: 0x120a22 }));
    slab.position.y = -1.77;
    this.group.add(slab);

    // ---- the rings that turn round it
    for (let i = 0; i < 3; i++) {
      const r = 21 + i * 7;
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.12 + i * 0.05, 6, 160),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb9a2ff).multiplyScalar(0.8 - i * 0.18), transparent: true, opacity: 0.55, fog: false }),
      );
      m.rotation.set(Math.PI / 2 + 0.25 * (i - 1), 0.3 * i, 0);
      m.position.y = 2 + i * 3;
      this.rings.push(m);
      this.group.add(m);
    }

    // ---- pieces of the world they came from, frozen in the air, each one at a few moments at once
    const r = rng(404);
    const rock = new THREE.MeshLambertMaterial({ color: 0x4a4658, emissive: 0x0c0818 });
    const earth = new THREE.MeshLambertMaterial({ color: 0x3a3028, emissive: 0x0a0604 });
    const leaf = new THREE.MeshLambertMaterial({ color: 0x2c4a44, emissive: 0x06100c });
    const bark = new THREE.MeshLambertMaterial({ color: 0x2a2018, emissive: 0x080402 });
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * TAU + r() * 0.2;
      const d = 26 + r() * 34;
      const y = -6 + r() * 26;
      const piece = new THREE.Group();
      const kind = k % 3;
      if (kind === 0) {
        const s = 1 + r() * 2.2;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock);
        m.rotation.set(r() * 3, r() * 3, r() * 3);
        piece.add(m);
      } else {
        // a clod of earth, and on it a tree or a stump
        const s = 1.4 + r() * 1.6;
        const clod = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.6, 7), earth);
        clod.rotation.x = Math.PI;
        clod.position.y = -s * 0.8;
        piece.add(clod);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.26 * s, kind === 1 ? s * 2.4 : s * 0.6, 6), bark);
        trunk.position.y = kind === 1 ? s * 1.2 : s * 0.3;
        piece.add(trunk);
        if (kind === 1) {
          const crown = new THREE.Mesh(new THREE.ConeGeometry(s * 0.9, s * 2.2, 7), leaf);
          crown.position.y = s * 2.8;
          piece.add(crown);
        }
      }
      // the same piece, a moment earlier and earlier still, fainter along a line
      const holder = new THREE.Group();
      holder.add(piece);
      const dir = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 0.4, r() - 0.5).normalize().multiplyScalar(2.2 + r() * 1.5);
      for (let e = 1; e <= 3; e++) {
        const echo = piece.clone();
        echo.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            const mat = (m.material as THREE.MeshLambertMaterial).clone();
            mat.transparent = true;
            mat.opacity = 0.5 / e;
            mat.depthWrite = false;
            m.material = mat;
          }
        });
        echo.position.copy(dir).multiplyScalar(e);
        holder.add(echo);
      }
      holder.position.set(Math.sin(a) * d, y, Math.cos(a) * d);
      holder.rotation.y = r() * TAU;
      this.frags.push({ g: holder, spin: (r() - 0.5) * 0.08, bob: r() * TAU, y });
      this.group.add(holder);
    }
    this.group.visible = false;
    this.group.traverse((o) => (o.userData['noGround'] = true));
    scene.add(this.group);
  }

  /** fold the Crater away and stand the family in the Fold */
  enter(a: Arena) {
    if (this.active) return;
    this.active = true;
    setFlatGround(true);
    this.was.clear();
    const hide = (o: THREE.Object3D) => {
      this.was.set(o, o.visible);
      o.visible = false;
    };
    a.crater.setShown(false);
    hide(a.cage.g);
    a.pinned.forEach(hide);
    hide(a.clearing);
    // (the old forest's picture far below the Crater, and its frame)
    for (const o of a.world.children) if (o.position.y <= -50) hide(o);
    this.fog = this.scene.fog;
    this.bg = this.scene.background as THREE.Color | THREE.Texture | null;
    this.scene.fog = new THREE.FogExp2(BG, 0.011);
    this.scene.background = new THREE.Color(BG);
    this.group.visible = true;
  }

  /** unfold: the Crater comes back as it was */
  exit(a: Arena) {
    if (!this.active) return;
    this.active = false;
    setFlatGround(false);
    a.crater.setShown(true);
    for (const [o, v] of this.was) o.visible = v;
    this.was.clear();
    this.scene.fog = this.fog;
    this.scene.background = this.bg;
    this.group.visible = false;
  }

  update(dt: number, time: number) {
    if (!this.active) return;
    this.skyMat.uniforms['uT']!.value = time;
    this.floorMat.uniforms['uT']!.value = time;
    this.rings.forEach((m, i) => (m.rotation.z += dt * (0.05 + i * 0.03) * (i % 2 ? -1 : 1)));
    for (const f of this.frags) {
      f.g.rotation.y += f.spin * dt;
      f.g.position.y = f.y + Math.sin(time * 0.3 + f.bob) * 0.4;
    }
  }
}
