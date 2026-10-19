/** No-op stand-in for src/sdk.ts, used by the standalone (non-RUN) preview build. */
export function onLifecycle(_onPause: () => void, _onResume: () => void) {}
export function track(_name: string) {}
export async function submitClearTime(_seconds: number, _deaths: number): Promise<{ rank: number | null; total: number | null } | null> {
  return null;
}
