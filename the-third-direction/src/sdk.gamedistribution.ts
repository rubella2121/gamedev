/**
 * Stand-in for src/sdk.ts in the GameDistribution build (vite.gamedistribution.config.ts). Their HTML5 SDK is loaded by the
 * page (with `window.GD_OPTIONS`: the game's id, and an `onEvent` that hands every event to the listeners here). An ad is asked
 * for only at the natural breaks the game offers, always after a tap (Play, Continue, Play again, a boss picked; never in a
 * fight): a pre-roll the first time, mid-rolls after that, as often as their SDK allows. While one plays the game is paused and
 * silent (their SDK_GAME_PAUSE), and it goes on at SDK_GAME_START, or when the ad fails, or after 40 s at most. Saves go to
 * localStorage. If the SDK is not there (blocked, offline) every call does nothing and the game plays as usual.
 */
export const CREDIT = 'a boss rush in three directions';
/** a new player lands straight in the game (no splash, intro or home page): the portals that ask for it set this */
export const INSTANT = false;

import type { Rewarded } from './core/rewarded';

/* eslint-disable @typescript-eslint/no-explicit-any */
type GdEvent = { name: string; message?: string };
const win = window as unknown as { gdsdk?: any; __gdListeners?: ((e: GdEvent) => void)[] };

function listen(fn: (e: GdEvent) => void): () => void {
  const list = (win.__gdListeners ??= []);
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

let pauseGame: (() => void) | null = null;
let resumeGame: (() => void) | null = null;
/** paused by their SDK (an ad, or anything else it decides): undone at its SDK_GAME_START */
let held = false;

export function onLifecycle(onPause: () => void, onResume: () => void) {
  pauseGame = onPause;
  resumeGame = onResume;
  // (their SDK can pause the game by itself, too: it is always obeyed)
  listen((e) => {
    if (e.name === 'SDK_GAME_PAUSE' && !held) {
      held = true;
      pauseGame?.();
    } else if (e.name === 'SDK_GAME_START' && held) {
      held = false;
      resumeGame?.();
    }
  });
}

const PREFIX = 'ttd:';
const memory = new Map<string, string>();

export async function storageInit(): Promise<void> {}

export function storageGet(key: string): string | null {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v !== null) return v;
  } catch {
    /* storage blocked */
  }
  return memory.get(key) ?? null;
}

export function storageSet(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* storage blocked: keep it in memory for this visit */
  }
}

export function track(_name: string) {}

/** no share link: the game lives on many sites through GameDistribution, and none of them is "the" page */
export async function shareRun(_time: string, _deaths: number): Promise<boolean> {
  return false;
}

export async function submitClearTime(_seconds: number, _deaths: number): Promise<{ rank: number | null; total: number | null } | null> {
  return null;
}

/**
 * A natural break, after a tap: ask GameDistribution for an ad (their SDK decides whether one plays, and how often). Resolves
 * when the game may go on: the ad is over (SDK_GAME_START), it failed, none was shown, or 40 s have passed.
 */
export function adBreak(): Promise<void> | null {
  const sdk = win.gdsdk;
  if (!sdk || typeof sdk.showAd !== 'function') return null;
  return new Promise((done) => {
    let over = false;
    const end = () => {
      if (over) return;
      over = true;
      window.clearTimeout(guard);
      off();
      done();
      // (if their SDK paused the game and its SDK_GAME_START never comes, the game is not left stopped)
      window.setTimeout(() => {
        if (held) {
          held = false;
          resumeGame?.();
        }
      }, 1500);
    };
    const guard = window.setTimeout(() => {
      // (an ad that never says it ended: the game goes on anyway, and is not left paused)
      if (held) {
        held = false;
        resumeGame?.();
      }
      end();
    }, 40000);
    const off = listen((e) => {
      if (e.name === 'SDK_GAME_START' || e.name === 'SDK_ERROR' || e.name === 'AD_ERROR' || e.name === 'AD_SDK_CANCELED') end();
    });
    try {
      const r = sdk.showAd();
      if (r && typeof r.then === 'function') r.then(() => window.setTimeout(end, 0), () => end());
    } catch {
      end();
    }
  });
}

export function gameplay(_on: boolean) {}

export function onSiteMute(_fn: (muted: boolean) => void) {}

/* ---------------------------------------------------------------- rewarded ads */
let rewardedReady = false;
let preloading: Promise<boolean> | null = null;

/** ask GameDistribution to get a rewarded ad ready (true when one is) */
function preloadRewarded(): Promise<boolean> {
  const sdk = win.gdsdk;
  if (!sdk || typeof sdk.preloadAd !== 'function') return Promise.resolve(false);
  if (rewardedReady) return Promise.resolve(true);
  if (!preloading) {
    preloading = Promise.resolve()
      .then(() => sdk.preloadAd(sdk.AdType?.Rewarded ?? 'rewarded'))
      .then(
        () => (rewardedReady = true),
        () => (rewardedReady = false),
      )
      .then((ok) => {
        preloading = null;
        return ok;
      });
  }
  return preloading;
}
// (one is asked for as soon as their SDK is up, so it is ready by the time the player first falls)
listen((e) => {
  if (e.name === 'SDK_READY') void preloadRewarded();
});

/**
 * A rewarded ad that can be offered now (see core/rewarded.ts), or null when GameDistribution has none ready (asked for, at
 * most 1.5 s). Watching it pauses and silences the game (their SDK_GAME_PAUSE / SDK_GAME_START); it is earned at their
 * SDK_REWARDED_WATCH_COMPLETE.
 */
export function rewardedOffer(): Promise<Rewarded | null> | null {
  const sdk = win.gdsdk;
  if (!sdk || typeof sdk.showAd !== 'function' || typeof sdk.preloadAd !== 'function') return null;
  const late = new Promise<boolean>((ok) => window.setTimeout(() => ok(false), 1500));
  return Promise.race([preloadRewarded(), late]).then((ok) => (ok ? { watch: watchRewarded, skip: () => {} } : null));
}

function watchRewarded(): Promise<boolean> {
  const sdk = win.gdsdk;
  rewardedReady = false;
  return new Promise((done) => {
    let earned = false;
    let over = false;
    const end = () => {
      if (over) return;
      over = true;
      window.clearTimeout(guard);
      off();
      done(earned);
      // (the next one is asked for straight away; the game is never left paused)
      void preloadRewarded();
      window.setTimeout(() => {
        if (held) {
          held = false;
          resumeGame?.();
        }
      }, 1500);
    };
    const guard = window.setTimeout(end, 90000);
    const off = listen((e) => {
      if (e.name === 'SDK_REWARDED_WATCH_COMPLETE') earned = true;
      if (e.name === 'SDK_GAME_START' || e.name === 'SDK_ERROR' || e.name === 'AD_ERROR' || e.name === 'AD_SDK_CANCELED') end();
    });
    try {
      const r = sdk.showAd(sdk.AdType?.Rewarded ?? 'rewarded');
      if (r && typeof r.then === 'function') r.then(() => window.setTimeout(end, 0), () => end());
    } catch {
      end();
    }
  });
}
