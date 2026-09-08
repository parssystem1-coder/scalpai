import { expect, test } from "@playwright/test";

/**
 * @perf — M4 evidence: the gallery stays fast and DOM-bounded with 500 records
 * (dev-only ?mock=500 harness renders synthetic tiles without API/auth).
 * Virtualization must keep the rendered tile count bounded while scrolling.
 *
 * tsconfig.repo.json type-checks this file with the node lib only (no DOM lib,
 * on purpose), so the scroll container is reached through a Playwright locator
 * rather than `document` — no DOM global is named here.
 */
test("@perf gallery stays fast and virtualized with 500 records", async ({ page }) => {
  const t0 = Date.now();
  await page.goto("/patients/perf/gallery?mock=500");
  await page.locator("img").first().waitFor({ state: "visible" });
  const loadMs = Date.now() - t0;
  console.log(`[perf] first tile visible in ${loadMs}ms`);
  expect(loadMs).toBeLessThan(3000); // proxy for the mid-range reference device

  // only a window of tiles is mounted — never all 500
  const imgsBefore = await page.locator("img").count();
  expect(imgsBefore).toBeGreaterThan(0);
  expect(imgsBefore).toBeLessThanOrEqual(40);

  const scroller = page.locator("[data-testid='gallery-scroll']").first();
  for (let i = 0; i < 6; i++) {
    await scroller.evaluate((el) => {
      (el as unknown as { scrollTop: number }).scrollTop += 1600;
    });
    await page.waitForTimeout(150);
  }
  const imgsAfter = await page.locator("img").count();
  expect(imgsAfter).toBeGreaterThan(0);
  expect(imgsAfter).toBeLessThanOrEqual(60);

  // scroll position deep into the list proves rows beyond the first screen exist
  const scrolled = await scroller.evaluate((el) => (el as unknown as { scrollTop: number }).scrollTop);
  expect(scrolled).toBeGreaterThan(1000);
});
