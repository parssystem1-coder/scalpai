import { expect, test } from "@playwright/test";

/**
 * @offline & @license E2E tests:
 * Validates offline mutation enqueuing, Dexie IndexedDB persistence,
 * and automatic synchronization when re-establishing online connectivity.
 */
test.describe("ScalpAI Phase 3 Offline & Sync Tests", () => {
  test("@offline queue patient creation offline and sync upon reconnect", async ({ page, context }) => {
    await page.goto("/");

    // 1. Authenticate
    await page.getByLabel("ایمیل").fill("owner@clinic-a.test");
    await page.getByLabel("رمز عبور").fill("Dev12345!");
    await page.getByRole("button", { name: "ورود" }).click();

    await expect(page.getByRole("heading")).toContainText("بیماران");

    // 2. Go Offline
    await context.setOffline(true);

    const offlinePhone = `0935${String(Date.now()).slice(-7)}`;
    await page.getByPlaceholder("نام", { exact: true }).fill("آفلاین");
    await page.getByPlaceholder("نام خانوادگی").fill("تستی");
    await page.getByPlaceholder("09xxxxxxxxx").fill(offlinePhone);
    await page.getByRole("button", { name: "افزودن" }).click();

    // 3. Confirm offline pending state is rendered locally
    await expect(page.getByText(offlinePhone)).toBeVisible();

    // 4. Restore Connection and verify automatic sync
    await context.setOffline(false);

    // Let the auto-sync flush the Outbox
    await page.waitForTimeout(1500);

    // Reload page to verify data was persisted to server and loaded from server query
    await page.reload();
    await expect(page.getByText(offlinePhone)).toBeVisible();
  });
});
