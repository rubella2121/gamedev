/** No-op stand-in for src/sdk.ts, used by the standalone (non-RUN) preview build. */
export function onLifecycle(_onPause: () => void, _onResume: () => void) {}
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
