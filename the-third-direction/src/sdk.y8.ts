/**
 * Stand-in for src/sdk.ts in the Y8 build (vite.y8.config.ts). Y8 hosts the game in a frame on its own page and runs its own
 * ads around it, so there is no SDK here: saved data goes to localStorage (falling back to memory where the browser blocks
 * it), there is no leaderboard, and the share button shares the run with a link to the Y8 page the game is played on (never
 * to another site).
 */
export const CREDIT = 'a boss rush in three directions';
/**
 * A portal's players expect to be playing at once: someone who has never played starts a run as the page opens, in the glade,
 * the story told in captions over it and then the tutorial. A returning player gets the home page (as on CrazyGames).
 */
export const INSTANT = true;

export function onLifecycle(onPause: () => void, onResume: () => void) {
  document.addEventListener('visibilitychange', () => (document.hidden ? onPause() : onResume()));
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

/**
 * A natural break (Play, Play again, a boss picked): a site with ads may show one here. Null when there is none to wait for,
 * so the game goes on in the same tap (a phone only lets sound start inside the tap itself); otherwise resolves when it can go on.
 */
export function adBreak(): Promise<void> | null {
  return null;
}

/** whether the player is playing now (not on a menu, not paused); a site that measures play is told */
export function gameplay(_on: boolean) {}

/** the site's own mute button, if it has one: `fn(true)` when it asks for silence */
export function onSiteMute(_fn: (muted: boolean) => void) {}
