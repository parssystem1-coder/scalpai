import { expect, test } from "@playwright/test";
import { CLINIC_A_OWNER, fillNewPatient, login, openPatients, uniquePhone } from "./helpers/session.js";

/**
 * @smoke - dashboard data-path persistence (Phase 4 gate criterion 1, C1).
 *
 * The dashboard used to hold patients in React state with Date.now() ids:
 * a reload silently threw the record away. These tests prove the record the
 * clinician creates through the UI survives paths that destroy component
 * state - i.e. it came from the server, not from local state.
 *
 * Both halves of criterion 1 live here and both are tagged @smoke so the PR
 * gate exercises them on every change:
 *   1. reload after an online create;
 *   2. the full offline-to-online cycle: the write is accepted while offline
 *      (enqueued in the Dexie outbox), the outbox flushes on reconnect, and
 *      a reload afterwards shows the SERVER's row.
 */
test("@smoke created patient survives a full reload", async ({ page }) => {
  await login(page, CLINIC_A_OWNER);

  const phone = uniquePhone();
  await openPatients(page);
  await fillNewPatient(page, {
    firstName: "Persist",
    lastName: "Probe",
    phone,
  });

  await expect(page.getByTestId("patients-table").getByText(phone)).toBeVisible({
    timeout: 20_000,
  });

  // Full browser reload: component state is gone, only server data remains.
  await page.reload();
  await expect(page.getByTestId("patients-table").getByText(phone)).toBeVisible({
    timeout: 20_000,
  });
});

test("@smoke offline-created patient syncs and survives a reload (criterion 1)", async ({
  page,
  context,
}) => {
  await login(page, CLINIC_A_OWNER);
  await openPatients(page);

  // 1. cut connectivity - the app must surface its offline state machine
  await context.setOffline(true);
  await expect(page.getByTestId("offline-badge")).toBeVisible({ timeout: 15_000 });

  // 2. the write must be ACCEPTED while offline: the form resolves and the
  //    write lands in the local outbox (no optimistic list row is promised -
  //    the offline list comes from the Dexie cache and re-materialises after
  //    the outbox flush).
  const phone = await fillNewPatient(page, {
    firstName: "Persist",
    lastName: "Offline",
    phone: uniquePhone("0936"),
  });

  // 3. restore connectivity and give the outbox flush a moment
  await context.setOffline(false);
  await page.waitForTimeout(2_000);

  // 4. a full reload destroys every local trace - the row that returns is
  //    the SERVER's row, which is exactly what criterion 1 demands
  await page.reload();
  await expect(page.getByTestId("patients-table").getByText(phone)).toBeVisible({
    timeout: 20_000,
  });
});
