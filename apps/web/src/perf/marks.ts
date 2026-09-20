/**
 * Hologram performance marks (Phase 4 remediation C12 / F20).
 *
 * One thin module so mark/measure call sites can never drift apart and the
 * whole feature can be disabled in one place:
 *
 *  - no-op under the vitest suite (`import.meta.env.MODE === "test"`), so the
 *    web tests stay free of timing entries;
 *  - inert when the user prefers reduced motion — measuring an animation the
 *    user asked the app not to play would only record noise;
 *  - never throws: performance entries are observation code, not a feature.
 *
 * `measure()` also records a `measure:hologram:ttfr` event so
 * `performance.getEntriesByName("hologram:ttfr")` in the @perf e2e finds the
 * real duration of the first rendered 3D frame.
 */

const HOLOGRAM_START = "hologram:mount:start";
const HOLOGRAM_FIRST_FRAME = "hologram:first-frame";
export const HOLOGRAM_TTFR = "hologram:ttfr";

function enabled(): boolean {
  // e2e-only escape hatch (same pattern as VITE_AUTO_LOCK_SECONDS): lets the
  // unit suite exercise the real mark/measure path; production never sets it.
  if (import.meta.env?.VITE_PERF_MARKS === "1") {
    return typeof performance !== "undefined" && typeof performance.mark === "function";
  }
  if (typeof import.meta === "undefined" || import.meta.env?.MODE === "test") return false;
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    return false;
  }
  return typeof performance !== "undefined" && typeof performance.mark === "function";
}

export function markHologramMountStart(): void {
  if (!enabled()) return;
  try {
    performance.mark(HOLOGRAM_START);
  } catch {
    /* observation code must never break rendering */
  }
}

export function markHologramFirstFrame(): void {
  if (!enabled()) return;
  try {
    performance.mark(HOLOGRAM_FIRST_FRAME);
    const [start] = performance.getEntriesByName(HOLOGRAM_START, "mark");
    if (start) {
      performance.measure(HOLOGRAM_TTFR, HOLOGRAM_START, HOLOGRAM_FIRST_FRAME);
    }
  } catch {
    /* observation code must never break rendering */
  }
}
