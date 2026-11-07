/**
 * Stand-in for src/sdk.ts in the CrazyGames build (vite.crazygames.config.ts), on their HTML5 SDK v3, which the build's
 * index.html loads from their CDN. It tells CrazyGames when the game has loaded and when the player is playing, shows a
 * midgame ad only at the natural breaks the game offers (Play, Play again, a boss picked; never in a fight) with the game
 * paused and silent while it plays, and saves through their data module (so saves follow a signed-in player), falling back
 * to localStorage. If the SDK is not there (testing, or blocked), every call quietly does nothing and the game plays as usual.
 */
export const CREDIT = 'a boss rush in three directions';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const sdk = (): Any => (window as unknown as { CrazyGames?: { SDK?: Any } }).CrazyGames?.SDK;

let ready = false;
let pauseGame: (() => void) | null = null;
let resumeGame: (() => void) | null = null;

// the game is loading from the moment this module runs
try {
  sdk()?.game?.loadingStart?.();
} catch {
  /* no SDK */
}

export function onLifecycle(onPause: () => void, onResume: () => void) {
  // (the game pauses itself when the page is hidden; these are kept for the ads)
  pauseGame = onPause;
  resumeGame = onResume;
}

const PREFIX = 'ttd:';
const memory = new Map<string, string>();

/** start the SDK (it is ready when its init resolves; give up after a few seconds so the game never waits on it) */
export async function storageInit(): Promise<void> {
  const s = sdk();
  if (s?.init) {
    try {
      await Promise.race([s.init(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 4000))]);
      ready = true;
    } catch (e) {
      console.warn('[sdk] CrazyGames SDK did not start', e);
    }
  }
  try {
    if (ready) sdk()?.game?.loadingStop?.();
  } catch {
    /* ignore */
  }
}

function data(): Any | null {
  return ready ? (sdk()?.data ?? null) : null;
}

export function storageGet(key: string): string | null {
  try {
    const d = data();
    const v = d ? d.getItem(PREFIX + key) : localStorage.getItem(PREFIX + key);
    if (v !== null && v !== undefined) return String(v);
  } catch {
    /* storage blocked */
  }
  return memory.get(key) ?? null;
}

export function storageSet(key: string, value: string): void {
  memory.set(key, value);
  try {
    const d = data();
    if (d) d.setItem(PREFIX + key, value);
    else localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage blocked: keep it in memory for this visit */
  }
}

export function track(name: string) {
  // a clear of the whole game is a moment of joy
  if (name === 'game_complete') {
    try {
      if (ready) sdk()?.game?.happytime?.();
    } catch {
      /* ignore */
    }
  }
}

/** no share link: the game's page on CrazyGames is the place to share */
export async function shareRun(_time: string, _deaths: number): Promise<boolean> {
  return false;
}

export async function submitClearTime(_seconds: number, _deaths: number): Promise<{ rank: number | null; total: number | null } | null> {
  return null;
}

/**
 * A natural break: ask CrazyGames for a midgame ad (they decide whether one is shown, and never in the first minutes).
 * The game is paused and silent while it plays; it goes on when the ad ends, fails, or is not filled, and after 40 s at most.
 */
export function adBreak(): Promise<void> | null {
  const s = sdk();
  if (!ready || !s?.ad?.requestAd) return null;
  return new Promise((done) => {
    let paused = false;
    let over = false;
    const end = () => {
      if (over) return;
      over = true;
      clearTimeout(guard);
      if (paused) resumeGame?.();
      done();
    };
    const guard = setTimeout(end, 40000);
    try {
      s.ad.requestAd('midgame', {
        adStarted: () => {
          paused = true;
          pauseGame?.();
        },
        adFinished: end,
        adError: end,
      });
    } catch {
      end();
    }
  });
}

let playing = false;
/** tell CrazyGames whether the player is playing now */
export function gameplay(on: boolean) {
  if (on === playing || !ready) return;
  playing = on;
  try {
    const g = sdk()?.game;
    if (on) g?.gameplayStart?.();
    else g?.gameplayStop?.();
  } catch {
    /* ignore */
  }
}
