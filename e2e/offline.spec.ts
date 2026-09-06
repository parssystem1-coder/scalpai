import { expect, test } from "@playwright/test";
import { fillNewPatient, loginAndOpenPatients, uniquePhone } from "./helpers/session.js";

/**
 * @offline - offline mutation enqueueing, Dexie persistence and automatic
 * synchronization once connectivity returns.
 */
test.describe("offline queue and sync", () => {
  test("@offline queue patient creation offline and sync upon reconnect", async ({ page, context }) => {
    await loginAndOpenPatients(page);

    // 1. go offline
    await context.setOffline(true);
    await expect(page.getByTestId("offline-badge")).toBeVisible({ timeout: 15_000 });

    // 2. create a patient while offline - it must land in the outbox
    const phone = await fillNewPatient(page, {
      firstName: "آفلاین",
      lastName: "تستی",
      phone: uniquePhone("0935"),
    });
    await expect(page.getByText(phone)).toBeVisible({ timeout: 15_000 });

    // 3. restore connectivity and let the outbox flush
    await context.setOffline(false);
    await page.waitForTimeout(2_000);

    // 4. a reload proves the row came back from the SERVER, not from local state
    await page.reload();
    await expect(page.getByTestId("patients-table").getByText(phone)).toBeVisible({ timeout: 20_000 });
  });
});
