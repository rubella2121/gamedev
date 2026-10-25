import { PortalLayer } from './cinematic/portal';
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
  /** paused by the player (the pause button), and by the page being hidden */
  private userPaused = false;
  private sysPaused = false;
  private runStart = 0;
  private res = '';
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
      // anti-aliased: the 3D part is drawn smooth and sharp; the forest (a single full-screen picture) is not affected
      this.renderer = new THREE.WebGLRenderer({ canvas: this.ui.view, antialias: true, powerPreference: 'high-performance' });
    } catch {
      this.ui.noWebGL();
      return;
    }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.renderer.setClearColor(0x05060c, 1);
    // the Crater's shadows are drawn when it asks (when the land has settled, when a stone falls), not every frame
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

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
    this.ui.onPause = () => this.pause();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (this.userPaused) this.resume();
        else if (this.canPause()) this.pause();
      }
    });
    // (where the driver can, shaders are built off the main thread: see Act2.prewarm)
    this.act2.warmUp = (scene, camera) => {
      if (this.renderer.extensions.has('KHR_parallel_shader_compile')) void this.renderer.compileAsync(scene, camera).catch(() => undefined);
      else this.renderer.compile(scene, camera);
    };
    this.act1.onBoom = () => this.beginBoom(0, true);
    // (the forest's glimpses of the 3D world are drawn through the tear itself now: see drawForest)
    this.act1.onTeaserFlash = null;
    this.scene2d.add(this.portal.mesh);
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
    this.ui.showSplash(
      () => this.playTrailer(260),
      () => this.skipIntro(),
    );
  }

  /** "skip intro" on the splash: straight to the home page. The tap that skipped it also unlocks the sound. */
  private skipIntro() {
    this.audio.start();
    storageSet(INTRO_KEY, '1');
    this.state = 'menu';
    this.showHome();
  }

  /**
   * the cinematic intro (from the splash, or from the home page). `after` (ms) is how long to wait before it starts: from the
   * landing page the tap sends out a pulse of light and a flash first, and the intro's own set-up (the score is built then) would
   * stall that. The sound is unlocked at once, in the tap itself: browsers only allow it there.
   */
  private playTrailer(after = 0) {
    this.audio.start();
    this.trailerSound = this.audio.level > 0;
    // the intro plays by itself once: someone who leaves halfway does not get it forced on them again (the home page can replay it)
    storageSet(INTRO_KEY, '1');
    track('intro');
    const go = () => {
      // (if the page was sent to the background in that moment the intro does not start out of step with nothing: the home page it is)
      if (this.paused) {
        this.state = 'menu';
        this.showHome();
        return;
      }
      this.state = 'trailer';
      this.act1.previewMode = false;
      this.trailer.begin();
    };
    if (after > 0) window.setTimeout(go, after);
    else go();
  }

  private finishTrailer() {
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
      onScene: (id) => (id === 'edge' ? this.playEdge() : id === 'ending' ? this.playEnding() : id === 'fourth' ? this.playFourth() : this.playGlimpses()),
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
  /**
   * How finely to draw. 1: the forest's own pixel grid (scaled up, crisp). 'hd': the 3D part at the screen's real resolution
   * (up to 1.5 device pixels per CSS pixel, and at most about 1.2 million pixels, so a phone keeps its frame rate).
   */
  private setRes(k: number | 'hd') {
    let w = W;
    let h = H;
    if (k === 'hd') {
      const rect = this.ui.view.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      h = Math.max(H, Math.round((rect.height || H * 2) * dpr));
      h = Math.min(h, Math.round(Math.sqrt((this.hdBudget * H) / W)));
      w = Math.round((h * W) / H);
    } else {
      w = W * k;
      h = H * k;
    }
    const key = `${w}x${h}`;
    if (this.res === key) return;
    this.res = key;
    this.renderer.setSize(w, h, false);
    // the forest is pixel art and stays crisp; the 3D part is smooth
    this.ui.view.classList.toggle('smooth', k === 'hd');
  }

  /** how many pixels the 3D part may use: it steps down when frames are slow and back up when there is room */
  private hdBudget = 1.2e6;
  private slowT = 0;
  private fastT = 0;

  /** a phone that cannot keep up gets fewer pixels (never fewer than the old pixel-art size), one that can gets them back */
  private tuneRes(dt: number, frameMs: number) {
    if (frameMs > 24) {
      this.slowT += dt;
      this.fastT = 0;
    } else if (frameMs < 13) {
      this.fastT += dt;
      this.slowT = 0;
    } else this.slowT = this.fastT = 0;
    // (never below twice the forest's own size: the 3D part should not look like pixel art, even on a slow phone)
    if (this.slowT > 1.5 && this.hdBudget > 4 * W * H) {
      this.hdBudget = Math.max(4 * W * H, this.hdBudget * 0.7);
      this.slowT = 0;
    } else if (this.fastT > 4 && this.hdBudget < 1.2e6) {
      this.hdBudget = Math.min(1.2e6, this.hdBudget * 1.25);
      this.fastT = 0;
    }
  }

  /** the 3D world, through the forest */
  private portal = new PortalLayer(W, H);
  private glimpseShot = -1;

  /**
   * The forest. When it is torn open (a guardian has just fallen, or the rift at the Edge), the screen is drawn at its real
   * resolution: the forest stays crisp pixel art, and through the opening the real 3D world shows, smooth and deep.
   */
  private drawForest(dt: number) {
    const pv = this.state === 'act1' ? this.act1.portalView() : null;
    if (!pv) {
      if (this.glimpseShot >= 0) {
        this.glimpseShot = -1;
        this.portal.set(null, 0);
      }
      this.setRes(1);
      this.act1.render();
      this.tex2d.needsUpdate = true;
      this.renderer.render(this.scene2d, this.cam2d);
      return;
    }
    this.setRes('hd');
    if (pv.shot !== this.glimpseShot) {
      this.glimpseShot = pv.shot;
      this.act2.prepareGlimpse(pv.shot);
    }
    this.act2.glimpse(pv.u, dt);
    if (this.act2.arena.takeShadowDirty()) this.renderer.shadowMap.needsUpdate = true;
    this.portal.capture(this.renderer, this.act2.arena.scene, this.act2.arena.camera);
    this.act1.render();
    this.tex2d.needsUpdate = true;
    this.portal.set(pv.view, performance.now() / 1000);
    this.renderer.render(this.scene2d, this.cam2d);
  }

  /** draw the 3D part (and its shadows, when the Crater asks for them) */
  private render3D() {
    this.setRes('hd');
    if (this.act2.arena.takeShadowDirty()) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.act2.arena.scene, this.act2.arena.camera);
  }

  /** the page went to the background (or came back): the game stops while nobody can see it */
  private setPaused(p: boolean) {
    this.sysPaused = p;
    // a trailer that was interrupted does not come back: it would be out of step with its music
    if (p && this.state === 'trailer') this.trailer.skip();
    this.applyPause();
  }

  /** stopped if the page is hidden or the player paused (coming back to the page never undoes the player's pause) */
  private applyPause() {
    const p = this.sysPaused || this.userPaused;
    if (p === this.paused) return;
    this.paused = p;
    if (this.audio.ctx) void (p ? this.audio.ctx.suspend() : this.audio.ctx.resume());
    this.last = 0;
  }

  /** while you are playing (the forest, a 3D fight, the ending), not on the home page or the end card */
  private canPause(): boolean {
    return (this.state === 'act1' || this.state === 'boom' || this.state === 'arena' || this.state === 'ending') && !this.act1.previewMode;
  }

  /** the pause button, or P / Esc: everything stops, and the pause menu opens */
  pause() {
    if (this.userPaused || !this.canPause()) return;
    this.userPaused = true;
    this.applyPause();
    this.ui.pauseButton(false);
    this.ui.showPause({
      onResume: () => this.resume(),
      onHome: () => {
        this.resume();
        this.home();
      },
    });
  }

  resume() {
    if (!this.userPaused) return;
    this.userPaused = false;
    this.ui.hidePause();
    this.applyPause();
  }

  private begin() {
    this.showcaseRun = false;
    this.reel = null;
    this.audio.start();
    track('game_start');
    this.stats.deaths = 0;
    this.runStart = performance.now();
    this.act1.previewMode = false;
    this.act1.start();
    // the first-time card is for a run that began here, with the Play button (not the trailer, not the showcase)
    this.act1.briefNext = true;
    this.ui.moon(false);
    this.state = 'act1';
  }

  /** into 3D: a real run gets the film (the fall, the cage); the showcase and the debug jumps get the quick boom */
  private beginBoom(boss = 0, cinematic = false) {
    this.state = 'boom';
    track('boom');
    this.act2.begin(this.act1.p.canvas, boss, cinematic);
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

  /** Debug: go to the Edge of the forest (every guardian down), where X comes down and the rift opens. */
  debugEdge() {
    this.begin();
    this.act1.skipOpening();
    this.act1.debugEdge();
  }

  /** New scenes: straight to the Edge with every guardian down. X comes into the forest, the portal, the fall into 3D, his fight. */
  playEdge() {
    this.begin();
    this.showcaseRun = true;
    this.act1.briefNext = false;
    this.act1.skipOpening();
    this.act1.debugEdge();
  }

  /** New scenes: the ending film (the last lock breaks, the family is free), then the end card. Not ranked. */
  playEnding() {
    this.showcase(this.act2.lastBoss);
    this.act2.skipToEnding();
    this.state = 'arena';
  }

  /** New scenes: the last boss. The three are beaten and the family is together; then the Fourth comes. Not ranked. */
  playFourth() {
    this.showcase(this.act2.lastBoss);
    this.act2.skipToFourth();
    this.state = 'arena';
  }

  /** New scenes: the forest, and the five glimpses of the 3D world one after another (you can walk about while they play). */
  playGlimpses() {
    this.begin();
    this.showcaseRun = true;
    this.act1.briefNext = false;
    this.act1.skipOpening();
    this.act1.warp('hub');
    this.act2.buildBosses();
    this.reel = { n: 0, wait: 1.2 };
  }

  /** the glimpses reel: the next one a moment after the last has closed (game time, so a slow phone sees each one whole) */
  private reel: { n: number; wait: number } | null = null;
  private updateReel(dt: number) {
    const r = this.reel;
    if (!r) return;
    if (this.state !== 'act1') {
      this.reel = null;
      return;
    }
    if (this.act1.glimpsing) return;
    r.wait -= dt;
    if (r.wait > 0) return;
    r.n++;
    this.act1.debugGlimpse(r.n);
    r.wait = 1.0;
    if (r.n >= 5) this.reel = null;
  }

  /** Debug: the glimpse of the 3D world that follows the `n`th guardian (1..5), right now. */
  debugGlimpse(n: number) {
    this.act1.debugGlimpse(n);
  }

  /** Debug: jump to the boom (builds a fake edge frame first). */
  debugBoom(cinematic = false) {
    this.begin();
    this.act1.skipOpening();
    this.act1.warp('edge');
    this.act1.render();
    this.beginBoom(0, cinematic);
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
    // (from the end card, or from the pause menu in the middle of anything: a fight, a scene)
    if (this.state === 'boom' || this.state === 'arena' || this.state === 'ending') this.act2.stop();
    this.ui.narrateClear();
    this.ui.hideEnd();
    this.ui.hearts(null);
    this.ui.light(null);
    this.ui.bossBar(null);
    this.ui.falls(null);
    this.ui.hint(null);
    this.ui.goal(null);
    this.ui.skip(false);
    this.ui.sub(null, null);
    this.ui.widescreen(false);
    this.ui.cinematic(false);
    this.ui.fade(0, 0);
    this.input.setAction(null);
    this.input.setCharge(0, 0);
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

  /** (tools: the trailer capture) the clock is driven by hand: no frames of its own; `tick` moves the game on and draws */
  private manual = false;

  manualClock(on: boolean) {
    this.manual = on;
    this.last = 0;
  }

  /** (tools) move the game on by exactly `dt` and draw one frame */
  tick(dt: number) {
    this.step(dt);
  }

  /** (tools: the trailer capture) runs after the world has moved and before it is drawn, e.g. to place a camera of its own */
  beforeDraw: (() => void) | null = null;

  private frame(now: number) {
    requestAnimationFrame((t) => this.frame(t));
    this.ui.pauseButton(!this.paused && this.canPause());
    if (this.paused || this.manual) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    // (the 3D part tunes its resolution to the phone: see tuneRes)
    if (this.last && (this.state === 'arena' || this.state === 'boom' || this.state === 'ending')) this.tuneRes(dt, now - this.last);
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT >= 1) {
      this.fps = Math.round(this.fpsN / this.fpsT);
      this.fpsN = 0;
      this.fpsT = 0;
    }
    this.last = now;
    this.step(dt);
  }

  /** one frame: everything moves on by `dt` (times the debug speed), then it is drawn */
  private step(dt: number) {
    const n = Math.max(1, Math.round(this.debugSpeed));
    for (let k = 0; k < n; k++) {
      this.input.update(dt);
      this.audio.update(dt);
      if (this.state === 'boom' || this.state === 'arena' || this.state === 'ending' || this.state === 'end') {
        this.act2.update(dt);
        if (this.state === 'boom' && this.act2.state === 'fight') this.state = 'arena';
        if (this.state === 'arena' && this.act2.state === 'ending') this.state = 'ending';
      } else if (this.state === 'act1') {
        this.act1.update(dt);
        this.updateReel(dt);
      }
      else if (this.state === 'trailer') this.trailer.update(dt);
    }
    // the 3D monsters are built a few milliseconds at a time while you are still in the forest
    if (this.state === 'act1' || this.state === 'menu' || this.state === 'trailer' || this.state === 'splash') {
      // spend spare time only: a slow frame means the phone is busy, so the monsters wait
      const spare = this.state === 'menu' ? 6 : dt < 0.02 ? 4 : dt < 0.028 ? 1.5 : 0;
      if (spare > 0) this.act2.pump(spare);
    }
    if (this.debugRenderEvery > 1 && this.frameN++ % this.debugRenderEvery !== 0) return;
    this.beforeDraw?.();
    if (this.state === 'boom' || this.state === 'arena' || this.state === 'ending' || this.state === 'end') {
      this.render3D();
    } else if (this.state === 'trailer') {
      const layer = this.trailer.layer;
      if (layer === '2d') {
        this.setRes(1);
        this.act1.render();
        this.trailer.post2d(this.act1.p);
        this.tex2d.needsUpdate = true;
        this.renderer.render(this.scene2d, this.cam2d);
      } else if (layer === '3d') {
        this.render3D();
      } else {
        this.renderer.clear();
      }
    } else if (this.state === 'act1' || this.state === 'menu') {
      this.drawForest(dt);
    }
    // (on the landing page the forest is not drawn at all: the page covers it, and a phone needs the time for the page's own picture)
  }

  summary() {
    return { time: fmtTime(this.elapsed), deaths: this.stats.deaths };
  }
}
