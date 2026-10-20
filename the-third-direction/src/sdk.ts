import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

/** Thin, failure-proof wrappers around the RUN SDK so the game also runs outside the RUN app. */
export function onLifecycle(onPause: () => void, onResume: () => void) {
  try {
    RundotGameAPI.lifecycles.onPause(onPause);
    RundotGameAPI.lifecycles.onResume(onResume);
  } catch (e) {
    console.warn('[sdk] lifecycles unavailable', e);
  }
}

/**
 * Saved data (settings, best times, progress). RUN games run in a sandbox where localStorage is blocked,
 * so everything goes through RUN's appStorage. After `storageInit()` reads are instant (from a cache);
 * writes update the cache at once and are saved in the background.
 */
const cache = new Map<string, string>();

export async function storageInit(): Promise<void> {
  try {
    const all = await RundotGameAPI.appStorage.getAllData();
    for (const [k, v] of Object.entries(all ?? {})) cache.set(k, v);
  } catch (e) {
    console.warn('[sdk] storage unavailable, saving in memory only', e);
  }
}

export function storageGet(key: string): string | null {
  return cache.get(key) ?? null;
}

export function storageSet(key: string, value: string): void {
  cache.set(key, value);
  try {
    void RundotGameAPI.appStorage.setItem(key, value).catch(() => {});
  } catch {
    /* running outside RUN */
  }
}

export function track(name: string) {
  try {
    RundotGameAPI.analytics.recordCustomEvent(name);
  } catch {
    /* running outside RUN */
  }
}

/**
 * Share the run: the native share sheet in the RUN app, a copied link on the web.
 * Resolves to false if sharing is not available.
 */
export async function shareRun(time: string, deaths: number): Promise<boolean> {
  try {
    await RundotGameAPI.social.shareLinkAsync({
      shareParams: { time, deaths: String(deaths) },
      metadata: {
        title: 'I looked up.',
        description: `I beat The Hollow in ${time} (${deaths} ${deaths === 1 ? 'death' : 'deaths'}). Can you?`,
      },
      slug: 'The Third Direction',
    });
    return true;
  } catch (e) {
    console.warn('[sdk] share unavailable', e);
    return false;
  }
}

/**
 * Send the clear time (seconds) to the RUN leaderboard. The board is configured in
 * rundot/leaderboard.config.json as "lowest is best". Resolves to the player's rank, or null.
 */
export async function submitClearTime(seconds: number, deaths: number): Promise<{ rank: number | null; total: number | null } | null> {
  try {
    const score = Math.max(1, Math.round(seconds));
    const res = await RundotGameAPI.leaderboard.submitScore({ score, duration: score, metadata: { deaths } });
    if (!res.accepted) {
      // keep-best board: a slower run is a harmless no-op, but we can still show the standing
      const mine = await RundotGameAPI.leaderboard.getMyRank();
      return { rank: mine.rank ?? null, total: mine.totalPlayers ?? null };
    }
    const mine = await RundotGameAPI.leaderboard.getMyRank();
    return { rank: res.rank ?? mine.rank ?? null, total: mine.totalPlayers ?? null };
  } catch (e) {
    console.warn('[sdk] leaderboard unavailable', e);
    return null;
  }
}
