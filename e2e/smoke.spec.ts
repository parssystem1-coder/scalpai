import { expect, test } from "@playwright/test";

/**
 * @smoke — the golden path through the browser, against the REAL local stack:
 * login (clinic A owner) → create patient → row appears in the list.
 */
test("@smoke login then create patient and see it listed", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("ایمیل").fill("owner@clinic-a.test");
  await page.getByLabel("رمز عبور").fill("Dev12345!");
  await page.getByRole("button", { name: "ورود" }).click();

  await expect(page.getByRole("heading")).toContainText("بیماران");

  const phone = `0912${String(Date.now()).slice(-7)}`;
  await page.getByPlaceholder("نام", { exact: true }).fill("Smoke");
  await page.getByPlaceholder("نام خانوادگی").fill("Test");
  await page.getByPlaceholder("09xxxxxxxxx").fill(phone);
  await page.getByRole("button", { name: "افزودن" }).click();

  await expect(page.getByText(phone)).toBeVisible();
});
