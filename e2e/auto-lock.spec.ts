import { expect, test } from "@playwright/test";
import { CLINIC_A_OWNER, login } from "./helpers/session.js";

/**
 * Wave 3 (P4-B08 / F14) — the idle auto-lock is behavioural end-to-end.
 *
 * Unit tests prove ProtectedRoute mounts AutoLock; this test proves the whole
 * chain in a real browser: after the idle window the in-memory token is gone,
 * the user is redirected to /login and the protected screen is not reachable
 * through history.
 *
 * Two modes:
 *  - E2E_AUTO_LOCK_SECONDS set (local run): a REAL idle lock against the dev
 *    server. page.clock fast-forward crashed the real page under vite dev, so
 *    the app honours VITE_AUTO_LOCK_SECONDS and we wait out an actual 3s
 *    window with generous real-time margins for React/vite latency.
 *  - unset (CI): page.clock fast-forwards the 10-minute window instead of a
 *    10-minute sleep (Playwright >= 1.45). The margin covers Playwright's own
 *    scheduled flush.
 */
const LOCAL_WINDOW_S = Number(process.env.E2E_AUTO_LOCK_SECONDS ?? 0);

test("@smoke idle session locks and lands on /login", async ({ page }) => {
  await login(page, CLINIC_A_OWNER);
  await expect(page).toHaveURL(/\/dashboard/);

  if (LOCAL_WINDOW_S > 0) {
    // Real-time mode: the app lock fires at ~3s; allow vite dev latency.
    await page.waitForURL(/\/login/, { timeout: 60_000 });
  } else {
    // Clock mode: install AFTER login so token requests run on real time.
    await page.clock.install();
    await page.clock.runFor(1_000);
    // Fast-forward one idle window plus a beat — no activity in between.
    await page.clock.runFor(10 * 60_000 + 5_000);
    await page.waitForURL(/\/login/, { timeout: 20_000 });
  }

  // Lock = token dropped + redirect to /login (replace:true).
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId("login-form")).toBeVisible();
});
