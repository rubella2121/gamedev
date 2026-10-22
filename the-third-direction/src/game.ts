import * as THREE from 'three';
import { Act2 } from './act2/act2';
import { Forest } from './forest/forest';
import { Input } from './core/input';
import { Sfx } from './core/audio';
import { bestTime, D, loadDifficulty, recordTime, setDifficulty } from './core/difficulty';
import { H, W } from './core/pix';
import { fmtTime } from './core/util';
import { onLifecycle, shareRun, storageGet, storageInit, storageSet, submitClearTime, track } from './sdk';
import { Trailer } from './cinematic/trailer';
import { makeScore } from './cinematic/scoreHook';
import { UI } from './ui';

type State = 'splash' | 'trailer' | 'menu' | 'act1' | 'boom' | 'arena' | 'ending' | 'end';

/** set once the intro has been seen (or skipped), so it only plays by itself the first time */
const INTRO_KEY = 'tt.intro';

export class Game {
  readonly ui: UI;
  readonly input: Input;
  readonly audio = new Sfx();
  readonly stats = { deaths: 0, bonus: 0 };
  state: State = 'menu';
  private renderer!: THREE.WebGLRenderer;
  private scene2d = new THREE.Scene();
  private cam2d = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0, 10);
  private tex2d!: THREE.CanvasTexture;
  private act1!: Forest;
  private act2!: Act2;
  private last = 0;
  private paused = false;
  private runStart = 0;
  private flash3D = 0;
  private res = 1;
  private showcaseRun = false;
  private trailer!: Trailer;
  /** the player wants sound for the intro (the score has a bus of its own, so it has to be told) */
  private trailerSound = true;
  /** (tests) run the simulation this many times per frame */
  debugSpeed = 1;
  /** (tests) draw only every Nth frame, so a bot can run the game fast on a computer with no GPU */
  debugRenderEvery = 1;
  private frameN = 0;
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

    const ctx = { audio: this.audio, ui: this.ui, input: this.input, stats: this.stats };
    this.act1 = new Forest(ctx);
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
    this.trailer = new Trailer({
      ui: this.ui,
      audio: this.audio,
      act1: this.act1,
      act2: this.act2,
      score: () => (this.trailerSound ? makeScore(this.audio) : null),
      zoom2d: (z) => this.setZoom(z),
      onDone: () => this.finishTrailer(),
    });
    this.act1.start();
    this.act1.previewMode = true;
    this.ui.skip(false);
    // saved settings load first; the first visit gets the cinematic intro (after a tap, because sound needs one), later visits the home page
    void storageInit().then(() => {
      loadDifficulty();
      if (this.state !== 'menu') return;
      // test builds (?debug) go straight to the home page; add &intro to see the first-visit flow
      const q = new URLSearchParams(location.search);
      if (storageGet(INTRO_KEY) || (q.has('debug') && !q.has('intro'))) this.showHome();
      else this.showSplash();
    });

    onLifecycle(
      () => this.setPaused(true),
      () => this.setPaused(false),
    );
    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    requestAnimationFrame((t) => this.frame(t));
  }

  /** "tap to begin": the first visit. The tap also unlocks the sound for the trailer. */
  private showSplash() {
    this.state = 'splash';
    this.ui.showSplash(() => this.playTrailer());
  }

  /** the cinematic intro (from the splash, or from the home page) */
  private playTrailer() {
    this.audio.start();
    this.trailerSound = this.audio.level > 0;
    track('intro');
    this.state = 'trailer';
    this.act1.previewMode = false;
    this.trailer.begin();
  }

  private finishTrailer() {
    storageSet(INTRO_KEY, '1');
    this.setZoom(1);
    this.act1.start();
    this.act1.previewMode = true;
    this.ui.skip(false);
    this.ui.fade(0, 0);
    this.state = 'menu';
    this.showHome();
  }

  private setZoom(z: number) {
    if (this.cam2d.zoom === z) return;
    this.cam2d.zoom = z;
    this.cam2d.updateProjectionMatrix();
  }

  private showHome() {
    this.ui.showStart({
      onPlay: () => this.begin(),
      onIntro: () => this.playTrailer(),
      onShowcase: (boss) => this.showcase(boss),
      onSound: (on) => this.audio.setMaster(on ? 0.9 : 0),
      onDifficulty: (id) => setDifficulty(id),
      difficulty: D.id,
      sound: this.audio.level > 0,
      best: () => {
        const b = bestTime(D.id);
        return b === null ? null : `${D.label.toLowerCase()} ${fmtTime(b)}`;
      },
    });
  }

  /** The 2D forest is drawn at 216x384; the 3D world gets twice that so the character reads well. */
  private setRes(k: number) {
    if (this.res === k) return;
    this.res = k;
    this.renderer.setSize(W * k, H * k, false);
  }

  private setPaused(p: boolean) {
    this.paused = p;
    // a trailer that was interrupted does not come back: it would be out of step with its music
    if (p && this.state === 'trailer') this.trailer.skip();
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

  private beginBoom(boss = 0) {
    this.state = 'boom';
    track('boom');
    this.act2.begin(this.act1.p.canvas, boss);
  }

  private onEnd() {
    this.state = 'end';
    track('game_complete');
    const s = this.summary();
    // the showcase skips the story, so its time is never recorded or ranked
    const newBest = !this.showcaseRun && recordTime(D.id, this.elapsed);
    const rankEl = this.ui.showEnd('i can look up now.', s.time, s.deaths, D.label, newBest, () => this.restart(), () => shareRun(s.time, s.deaths), () => this.home());
    if (!this.showcaseRun && D.ranked) {
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
  showcase(boss = 0) {
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
    this.beginBoom(boss);
  }

  debugFight(phase = 0, boss = 0) {
    this.debugBoom();
    this.act2.skipToFight(phase, boss);
    this.state = 'arena';
  }

  restart() {
    this.ui.narrateClear();
    this.ui.hideEnd();
    this.begin();
  }

  /** Back to the home page (used by the end card). */
  home() {
    this.ui.narrateClear();
    this.ui.hideEnd();
    this.ui.hearts(null);
    this.ui.recenter(false);
    this.ui.moon(false);
    this.input.setCameraEnabled(false);
    this.audio.silence(0.4);
    this.state = 'menu';
    this.act1.start();
    this.act1.previewMode = true;
    this.ui.skip(false);
    this.showHome();
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
    const n = Math.max(1, Math.round(this.debugSpeed));
    for (let k = 0; k < n; k++) {
      this.input.update(dt);
      this.audio.update(dt);
      if (this.state === 'boom' || this.state === 'arena' || this.state === 'ending' || this.state === 'end') {
        this.act2.update(dt);
        if (this.state === 'boom' && this.act2.state === 'fight') this.state = 'arena';
        if (this.state === 'arena' && this.act2.state === 'ending') this.state = 'ending';
      } else if (this.state === 'act1') this.act1.update(dt);
      else if (this.state === 'trailer') this.trailer.update(dt);
    }
    // the 3D monsters are built a few milliseconds at a time while you are still in the forest
    if (this.state === 'act1' || this.state === 'menu' || this.state === 'trailer' || this.state === 'splash') {
      // spend spare time only: a slow frame means the phone is busy, so the monsters wait
      const spare = this.state === 'menu' || this.state === 'splash' ? 6 : dt < 0.02 ? 4 : dt < 0.028 ? 1.5 : 0;
      if (spare > 0) this.act2.pump(spare);
    }
    if (this.debugRenderEvery > 1 && this.frameN++ % this.debugRenderEvery !== 0) return;
    if (this.state === 'boom' || this.state === 'arena' || this.state === 'ending' || this.state === 'end') {
      this.setRes(2);
      this.renderer.render(this.act2.arena.scene, this.act2.arena.camera);
    } else if (this.state === 'trailer') {
      const layer = this.trailer.layer;
      if (layer === '2d') {
        this.setRes(1);
        this.act1.render();
        this.trailer.post2d(this.act1.p);
        this.tex2d.needsUpdate = true;
        this.renderer.render(this.scene2d, this.cam2d);
      } else if (layer === '3d') {
        this.setRes(2);
        this.renderer.render(this.act2.arena.scene, this.act2.arena.camera);
      } else {
        this.renderer.clear();
      }
    } else if (this.state === 'act1' || this.state === 'menu' || this.state === 'splash') {
      this.setRes(1);
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
