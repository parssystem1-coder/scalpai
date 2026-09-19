import { expect, test } from "@playwright/test";
import { CLINIC_A_OWNER, login, uniquePhone } from "./helpers/session.js";

/**
 * @smoke — dashboard data-path persistence (Phase 4 gate criterion 1, C1).
 *
 * The dashboard used to hold patients in React state with Date.now() ids:
 * a reload silently threw the record away. This test proves the record the
 * clinician creates through the UI survives a full page reload — i.e. it came
 * from the server, not from component state.
 */
test("@smoke created patient survives a full reload", async ({ page }) => {
  await login(page, CLINIC_A_OWNER);

  const phone = uniquePhone();
  await page.goto("/patients");
  await page.getByTestId("patient-first-name").fill("Persist");
  await page.getByTestId("patient-last-name").fill("Probe");
  await page.getByTestId("patient-phone").fill(phone);
  await page.getByTestId("patient-add").click();

  await expect(page.getByTestId("patients-table").getByText(phone)).toBeVisible({
    timeout: 20_000,
  });

  // Full browser reload: component state is gone, only server data remains.
  await page.reload();
  await expect(page.getByTestId("patients-table").getByText(phone)).toBeVisible({
    timeout: 20_000,
  });
});
