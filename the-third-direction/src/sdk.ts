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

export function track(name: string) {
  try {
    RundotGameAPI.analytics.recordCustomEvent(name);
  } catch {
    /* running outside RUN */
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
