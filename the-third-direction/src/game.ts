import * as THREE from 'three';
import { Act1 } from './act1/act1';
import { Act2 } from './act2/act2';
import { Input } from './core/input';
import { Sfx } from './core/audio';
import { H, W } from './core/pix';
import { fmtTime } from './core/util';
import { onLifecycle, submitClearTime, track } from './sdk';
import { UI } from './ui';

type State = 'menu' | 'act1' | 'boom' | 'arena' | 'ending' | 'end';

export class Game {
  readonly ui: UI;
  readonly input: Input;
  readonly audio = new Sfx();
  readonly stats = { deaths: 0 };
  state: State = 'menu';
  private renderer!: THREE.WebGLRenderer;
  private scene2d = new THREE.Scene();
  private cam2d = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0, 10);
  private tex2d!: THREE.CanvasTexture;
  private act1!: Act1;
  private act2!: Act2;
  private last = 0;
  private paused = false;
  private runStart = 0;
  private flash3D = 0;
  private showcaseRun = false;
  fps = 0;
  private fpsN = 0;
  private fpsT = 0;

  constructor(root: HTMLElement) {
    this.ui = new UI(root);
    this.input = new Input(this.ui.stage);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.ui.view, antialias: false, powerPreference: 'high-performance' });
    } catch {
      this.ui.noWebGL();
      return;
    }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.setClearColor(0x05060c, 1);

    this.act1 = new Act1({ audio: this.audio, ui: this.ui, input: this.input, stats: this.stats });
    this.tex2d = new THREE.CanvasTexture(this.act1.p.canvas);
    this.tex2d.minFilter = this.tex2d.magFilter = THREE.NearestFilter;
    this.tex2d.generateMipmaps = false;
    this.tex2d.colorSpace = THREE.SRGBColorSpace;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.tex2d, toneMapped: false }));
    this.scene2d.add(quad);
    this.cam2d.position.z = 5;

    this.act2 = new Act2({ audio: this.audio, ui: this.ui, input: this.input, stats: this.stats });
    this.act2.onEnd = () => this.onEnd();
    this.act1.onBoom = () => this.beginBoom();
    this.act1.onTeaserFlash = () => {
      this.act2.prepareTeaser();
      this.flash3D = 0.2;
    };
    this.act1.start();
    this.act1.previewMode = true;
    this.ui.showStart(() => this.begin(), () => this.showcase());

    onLifecycle(
      () => this.setPaused(true),
      () => this.setPaused(false),
    );
    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    requestAnimationFrame((t) => this.frame(t));
  }

  private setPaused(p: boolean) {
    this.paused = p;
    if (this.audio.ctx) void (p ? this.audio.ctx.suspend() : this.audio.ctx.resume());
    this.last = 0;
  }

  private begin() {
    this.showcaseRun = false;
    this.audio.start();
    track('game_start');
    this.stats.deaths = 0;
    this.runStart = performance.now();
    this.act1.previewMode = false;
    this.act1.start();
    this.ui.moon(false);
    this.state = 'act1';
  }

  private beginBoom() {
    this.state = 'boom';
    track('boom');
    this.act2.begin(this.act1.p.canvas);
  }

  private onEnd() {
    this.state = 'end';
    track('game_complete');
    const s = this.summary();
    const rankEl = this.ui.showEnd('i can look up now.', s.time, s.deaths, () => this.restart());
    // the showcase skips the story, so its time never goes on the leaderboard
    if (!this.showcaseRun) {
      void submitClearTime(this.elapsed, s.deaths).then((r) => {
        if (r && r.rank) rankEl.innerHTML = `rank <b>#${r.rank}</b>${r.total ? ` of ${r.total}` : ''}`;
      });
    }
  }

  /** Debug: jump to the boom (builds a fake edge frame first). */
  debugBoom() {
    this.begin();
    this.act1.skipOpening();
    this.act1.warp('edge');
    this.act1.render();
    this.beginBoom();
  }

  /** Quick Showcase: jump straight to the boom and the boss fight. */
  showcase() {
    this.audio.start();
    this.showcaseRun = true;
    track('showcase');
    this.stats.deaths = 0;
    this.runStart = performance.now();
    this.act1.previewMode = false;
    this.act1.start();
    this.act1.skipOpening();
    this.act1.prepareShowcase();
    this.act1.render();
    this.ui.fade(0, 0);
    this.beginBoom();
  }

  debugFight(phase = 0) {
    this.debugBoom();
    this.act2.skipToFight(phase);
    this.state = 'arena';
  }

  restart() {
    this.ui.hideEnd();
    this.begin();
  }

  get elapsed() {
    return (performance.now() - this.runStart) / 1000;
  }

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    if (this.paused) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT >= 1) {
      this.fps = Math.round(this.fpsN / this.fpsT);
      this.fpsN = 0;
      this.fpsT = 0;
    }
    this.last = now;
    this.input.update(dt);
    this.audio.update(dt);
    if (this.state === 'boom' || this.state === 'arena' || this.state === 'ending' || this.state === 'end') {
      this.act2.update(dt);
      if (this.state === 'boom' && this.act2.state === 'fight') this.state = 'arena';
      if (this.state === 'arena' && this.act2.state === 'ending') this.state = 'ending';
      this.renderer.render(this.act2.arena.scene, this.act2.arena.camera);
    } else if (this.state === 'act1' || this.state === 'menu') {
      if (this.state === 'act1') this.act1.update(dt);
      this.act1.render();
      this.tex2d.needsUpdate = true;
      if (this.flash3D > 0) {
        this.flash3D -= dt;
        this.renderer.render(this.act2.arena.scene, this.act2.arena.camera);
      } else {
        this.renderer.render(this.scene2d, this.cam2d);
      }
    }
  }

  summary() {
    return { time: fmtTime(this.elapsed), deaths: this.stats.deaths };
  }
}
