/**
 * Stand-in for src/sdk.ts in the Y8 build (vite.y8.config.ts), on Y8's minimal SDK, which the build's index.html loads from their
 * CDN and starts with this game's App ID and Game ID (`window.__y8Sdk` once it is ready). An ad is asked for only at the natural
 * breaks the game offers, always after a tap (Play, Continue, Play again, a boss picked; never in a fight): a "start" break the
 * first time, "next" after that, as often as Y8 allows. While one plays the game is paused and silent (their beforeAd/afterAd),
 * and it goes on when the break is done, when the ad fails, or after 40 s at most. Saves go to localStorage (falling back to
 * memory where the browser blocks it), there is no leaderboard, and the share button shares the run with a link to the Y8
 * page the game is played on (never to another site). If the SDK is not there (blocked, offline, testing) every call does
 * nothing and the game plays as usual.
 */
export const CREDIT = 'a boss rush in three directions';
/**
 * A portal's players expect to be playing at once: someone who has never played starts a run as the page opens, in the glade,
 * the story told in captions over it and then the tutorial. A returning player gets the home page (as on CrazyGames).
 */
export const INSTANT = true;

import type { Rewarded } from './core/rewarded';

/* eslint-disable @typescript-eslint/no-explicit-any */
const win = window as unknown as { __y8Sdk?: any };

let pauseGame: (() => void) | null = null;
let resumeGame: (() => void) | null = null;

export function onLifecycle(onPause: () => void, onResume: () => void) {
  // (the game pauses itself when the page is hidden; these are kept for the ads)
  pauseGame = onPause;
  resumeGame = onResume;
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

/** the Y8 page the game is played on (the frame's own address is a file on their servers, not a page to send anyone to) */
function page(): string {
  try {
    const r = document.referrer;
    if (/^https:\/\/([a-z0-9-]+\.)*y8\.com\//i.test(r)) return r;
  } catch {
    /* no referrer */
  }
  return '';
}

export async function shareRun(time: string, deaths: number): Promise<boolean> {
  const text = `I beat The Hollow in ${time} (${deaths} ${deaths === 1 ? 'death' : 'deaths'}) in The Third Direction. Can you?`;
  const url = page();
  try {
    if (navigator.share) {
      await navigator.share(url ? { title: 'The Third Direction', text, url } : { title: 'The Third Direction', text });
      return true;
    }
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    return true;
  } catch {
    return false;
  }
}

export async function submitClearTime(_seconds: number, _deaths: number): Promise<{ rank: number | null; total: number | null } | null> {
  return null;
}

let first = true;

/**
 * A natural break, after a tap: ask Y8 for an ad (their SDK decides whether one plays, and how often). Null when the SDK is not
 * there, so the game goes on in the same tap; otherwise resolves when the game may go on: the break is done (adBreakDone), the
 * call failed, the SDK answered without showing anything, or 40 s have passed.
 */
export function adBreak(): Promise<void> | null {
  const sdk = win.__y8Sdk;
  if (!sdk || typeof sdk.showAd !== 'function') return null;
  const type = first ? 'start' : 'next';
  first = false;
  return new Promise((done) => {
    let over = false;
    let held = false;
    const hold = () => {
      if (held) return;
      held = true;
      pauseGame?.();
    };
    const release = () => {
      if (!held) return;
      held = false;
      resumeGame?.();
    };
    const end = () => {
      if (over) return;
      over = true;
      window.clearTimeout(guard);
      // (an ad that never said it ended: the game is not left paused)
      release();
      done();
    };
    const guard = window.setTimeout(end, 40000);
    try {
      const r = sdk.showAd({
        type,
        name: type === 'start' ? 'game-start' : 'natural-break',
        beforeAd: hold,
        afterAd: release,
        adBreakDone: () => window.setTimeout(end, 0),
      });
      // (the call may settle before the break is over: go on then only if no ad has started)
      if (r && typeof r.then === 'function') r.then(() => window.setTimeout(() => !held && end(), 1500), () => end());
    } catch {
      end();
    }
  });
}

/** whether the player is playing now (not on a menu, not paused); a site that measures play is told */
export function gameplay(_on: boolean) {}

/** the site's own mute button, if it has one: `fn(true)` when it asks for silence */
export function onSiteMute(_fn: (muted: boolean) => void) {}

/** rewarded ads exist on this site (the wardrobe's skins are unlocked by watching them; elsewhere by playing) */
export const REWARDED = true;

/**
 * A rewarded ad that can be offered now (see core/rewarded.ts), or null when Y8 has none (it answers within 2 s). Y8 asks the
 * game to offer it (beforeReward) only when one is ready; the player watches it (showAdFn) or not. It is earned at adViewed;
 * the game is paused and silent from beforeAd to afterAd.
 */
export function rewardedOffer(): Promise<Rewarded | null> | null {
  const sdk = win.__y8Sdk;
  if (!sdk || typeof sdk.showAd !== 'function') return null;
  return new Promise((offer) => {
    let answered = false;
    let over = false;
    let earned = false;
    let held = false;
    let finish: ((earned: boolean) => void) | null = null;
    const answer = (r: Rewarded | null) => {
      if (answered) return;
      answered = true;
      window.clearTimeout(late);
      offer(r);
    };
    const hold = () => {
      if (held) return;
      held = true;
      pauseGame?.();
    };
    const release = () => {
      if (!held) return;
      held = false;
      resumeGame?.();
    };
    const end = () => {
      if (over) return;
      over = true;
      window.clearTimeout(guard);
      release();
      answer(null);
      const f = finish;
      finish = null;
      f?.(earned);
    };
    // (none offered in time: the player wakes at the checkpoint as usual)
    const late = window.setTimeout(() => answer(null), 2000);
    const guard = window.setTimeout(end, 90000);
    try {
      const r = sdk.showAd({
        type: 'reward',
        name: 'get-up-here',
        beforeAd: hold,
        afterAd: release,
        beforeReward: (showAdFn: () => void) => {
          if (answered) return;
          answer({
            watch: () =>
              new Promise<boolean>((f) => {
                finish = f;
                showAdFn();
              }),
            skip: () => {
              finish = null;
            },
          });
        },
        adDismissed: () => (earned = false),
        adViewed: () => (earned = true),
        adBreakDone: () => window.setTimeout(end, 0),
      });
      if (r && typeof r.catch === 'function') r.catch(() => end());
    } catch {
      end();
    }
  });
}
