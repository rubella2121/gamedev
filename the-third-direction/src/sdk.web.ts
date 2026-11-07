/**
 * Stand-in for src/sdk.ts in the web build (itch.io and other sites, no RUN SDK).
 * Saved data goes to localStorage, and falls back to memory where the browser blocks it.
 * There is no leaderboard; sharing uses the browser's share sheet or the clipboard.
 */
export const CREDIT = 'a boss rush in three directions';

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

export async function shareRun(time: string, deaths: number): Promise<boolean> {
  const text = `I beat The Hollow in ${time} (${deaths} ${deaths === 1 ? 'death' : 'deaths'}) in The Third Direction. Can you?`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'The Third Direction', text, url: location.href });
      return true;
    }
    await navigator.clipboard.writeText(`${text} ${location.href}`);
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
