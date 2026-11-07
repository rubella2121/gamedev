/** No-op stand-in for src/sdk.ts, used by the standalone (non-RUN) preview build. */
/** the credit line under the title and on the end card */
export const CREDIT = 'RUN October Jam · Monster Mash';

export function onLifecycle(_onPause: () => void, _onResume: () => void) {}
/**
 * The standalone preview keeps saved data in memory, and in `window.name` so it survives a reload in the same tab.
 * (Browser storage is blocked inside RUN games, and the real build uses RUN's appStorage instead.)
 */
let saved: Record<string, string> = {};
try {
  saved = JSON.parse(window.name || '{}') as Record<string, string>;
} catch {
  saved = {};
}
export async function storageInit(): Promise<void> {}
export function storageGet(key: string): string | null {
  return saved[key] ?? null;
}
export function storageSet(key: string, value: string): void {
  saved[key] = value;
  try {
    window.name = JSON.stringify(saved);
  } catch {
    /* ignore */
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
