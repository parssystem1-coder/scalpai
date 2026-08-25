import { expect, test } from "@playwright/test";

/**
 * @perf — M4 evidence: the gallery stays fast and DOM-bounded with 500 records
 * (dev-only ?mock=500 harness renders synthetic tiles without API/auth).
 * Virtualization must keep the rendered tile count bounded while scrolling.
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

  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      const el = document.querySelector("[data-testid='gallery-scroll']") as HTMLElement | null;
      if (el) el.scrollTop += 1600;
    });
    await page.waitForTimeout(150);
  }
  const imgsAfter = await page.locator("img").count();
  expect(imgsAfter).toBeGreaterThan(0);
  expect(imgsAfter).toBeLessThanOrEqual(60);

  // scroll position deep into the list proves rows beyond the first screen exist
  const scrolled = await page.evaluate(() => {
    const el = document.querySelector("[data-testid='gallery-scroll']");
    return el ? el.scrollTop : -1;
  });
  expect(scrolled).toBeGreaterThan(1000);
});
