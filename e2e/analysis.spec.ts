import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fillNewPatient, loginAndOpenPatients, openFirstPatientGallery, uniquePhone } from "./helpers/session.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * @analysis - login -> create patient -> upload a real JPEG through the UI
 * (init / presigned PUT / complete) -> open the analysis page -> the heuristic
 * engine runs in-browser -> scores + elapsed shown -> expert confirm.
 * The elapsed assertion enforces the <3s budget on the reference device.
 */
test("@analysis upload, analyze under 3s, expert review", async ({ page }) => {
  await loginAndOpenPatients(page);

  const phone = await fillNewPatient(page, {
    firstName: "آنالیز",
    lastName: "سموک",
    phone: uniquePhone(),
  });
  await expect(page.getByTestId("patients-table").getByText(phone)).toBeVisible({ timeout: 20_000 });

  await openFirstPatientGallery(page);

  // upload through the real pipeline
  await page.setInputFiles("input[type='file']", join(here, "fixtures", "healthy.jpg"));
  const tile = page.locator("img").first();
  await tile.waitFor({ state: "visible", timeout: 20_000 });

  // open analysis page - engine runs client-side on the presigned image
  await tile.click();
  const elapsed = page.getByTestId("elapsed");
  await elapsed.waitFor({ timeout: 20_000 });
  // UI renders Persian digits (fa locale) - normalize before parsing
  const raw = (await elapsed.textContent()) ?? "0";
  const ms = Number(raw.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  console.log(`[analysis] client engine elapsed: ${ms}ms`);
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThan(3000); // 10.5 budget proxy

  await expect(page.getByTestId("score-redness")).toBeVisible();

  // expert review - Gold-label capture (wait for autosave to land first)
  await expect(page.getByTestId("review-status")).toContainText("saved:", { timeout: 20_000 });
  await page.getByTestId("confirm").click();
  await expect(page.getByTestId("saved")).toContainText("بازبینی ثبت گردید");
});
