import { expect, test } from "@playwright/test";
import { fillNewPatient, loginAndOpenPatients, uniquePhone } from "./helpers/session.js";

/**
 * @smoke - the golden path through the browser against the REAL local stack:
 * login (clinic A owner) at /login -> patients page -> create patient -> the row
 * appears in the list. This is the one e2e test every PR must pass (H15).
 */
test("@smoke login then create patient and see it listed", async ({ page }) => {
  await loginAndOpenPatients(page);

  const phone = await fillNewPatient(page, { firstName: "Smoke", lastName: "Test", phone: uniquePhone() });

  await expect(page.getByTestId("patients-table").getByText(phone)).toBeVisible({ timeout: 20_000 });
});
