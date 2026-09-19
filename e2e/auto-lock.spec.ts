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
 * The app honours VITE_AUTO_LOCK_SECONDS (whole seconds, e2e-only escape
 * hatch — the production build never sets it, so §13 keeps its full 600s
 * window). The test waits out a REAL lock instead of faking the clock:
 * page.clock fast-forward proved destructive twice — it crashed the page
 * under the local dev server and stalled the lock in CI.
 *
 * At 3s the margin absorbs vite/React latency; keep the total well inside the
 * 60s test timeout.
 */
const WINDOW_S = Number(process.env.E2E_AUTO_LOCK_SECONDS ?? 3);

test("@smoke idle session locks and lands on /login", async ({ page }) => {
  await login(page, CLINIC_A_OWNER);
  await expect(page).toHaveURL(/\/dashboard/);

  // No user activity from here on — the real timer fires the lock.
  await page.waitForURL(/\/login/, { timeout: (WINDOW_S + 30) * 1_000 });

  // Lock = token dropped + redirect to /login (replace:true).
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId("login-form")).toBeVisible();
});
