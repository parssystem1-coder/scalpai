import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * @analysis — DoD scenario of phase 2: login → create patient → upload a real
 * JPEG through the UI (init/presigned-PUT/complete) → open the analysis page →
 * heuristic engine runs in-browser → scores + elapsed shown → expert confirm.
 * The elapsed assertion enforces the <3s budget on the reference device.
 */
test("@analysis upload, analyze under 3s, expert review", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("ایمیل").fill("owner@clinic-a.test");
  await page.getByLabel("رمز عبور").fill("Dev12345!");
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(page.getByRole("heading")).toContainText("بیماران");

  const phone = `0912${String(Date.now()).slice(-7)}`;
  await page.getByPlaceholder("نام", { exact: true }).fill("آنالیز");
  await page.getByPlaceholder("نام خانوادگی").fill("سموک");
  await page.getByPlaceholder("09xxxxxxxxx").fill(phone);
  await page.getByRole("button", { name: "افزودن" }).click();
  await expect(page.getByText(phone)).toBeVisible();

  // open the gallery of the topmost patient row (newest first)
  await page.locator("tbody a").first().click();
  await expect(page.getByRole("heading")).toContainText("گالری");

  // upload through the real pipeline
  await page.setInputFiles("input[aria-label='انتخاب تصویر']", join(here, "fixtures", "healthy.jpg"));
  const tile = page.locator("img").first();
  await tile.waitFor({ state: "visible", timeout: 15_000 });

  // open analysis page — engine runs client-side on the presigned image
  await tile.click();
  const elapsed = page.getByTestId("elapsed");
  await elapsed.waitFor({ timeout: 15_000 });
  // UI renders Persian digits (fa locale) — normalize before parsing
  const raw = (await elapsed.textContent()) ?? "0";
  const ms = Number(raw.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  console.log(`[analysis] client engine elapsed: ${ms}ms`);
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThan(3000); // §10.5 budget proxy

  await expect(page.getByTestId("score-redness")).toBeVisible();

  // expert review — Gold-label capture (wait for autosave to land first)
  await expect(page.getByTestId("review-status")).toContainText("saved:", { timeout: 15_000 });
  await page.getByTestId("confirm").click();
  await expect(page.getByTestId("saved")).toContainText("بازبینی ثبت گردید");
});
