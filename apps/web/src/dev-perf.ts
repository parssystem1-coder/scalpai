/** Dev-only perf harness gate — compiled out of production bundles. */
export function isMockPerf(): boolean {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).has("mock");
}
