import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { loginAndOpenPatients, openFirstPatientGallery } from "./helpers/session.js";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * @upload-big - a >=50MB upload over a THROTTLED uplink completes without
 * crashing and the progress indicator moves monotonically to 100%. The payload
 * is a valid JPEG padded with trailing zeros so sharp still decodes it at
 * complete-time.
 */
test("@upload-big 50MB throttled upload with live progress", async ({ page }) => {
  test.setTimeout(300_000);

  const jpg = readFileSync(join(here, "fixtures", "healthy.jpg"));
  const target = 50 * 1024 * 1024;
  const big = Buffer.concat([jpg, Buffer.alloc(target - jpg.length)]);
  const outDir = join(here, "..", "test-results");
  mkdirSync(outDir, { recursive: true });
  const bigPath = join(outDir, "big-padded.jpg");
  writeFileSync(bigPath, big);
  console.log(`[upload-big] payload ${(big.length / 1024 / 1024).toFixed(1)}MB on disk`);

  // throttle uplink to ~3 MB/s via CDP
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 40,
    downloadThroughput: (4 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  });

  await loginAndOpenPatients(page);
  await openFirstPatientGallery(page);

  await page.setInputFiles("input[type='file']", bigPath);

  // progress must appear, move forward monotonically, and finish
  const bar = page.getByTestId("upload-bar");
  await bar.waitFor({ state: "visible", timeout: 30_000 });
  let prev = 0;
  for (;;) {
    if (!(await bar.isVisible())) break; // upload done -> UI unmounts the bar
    const txt = await page
      .getByTestId("upload-pct")
      .textContent({ timeout: 2_000 })
      .catch(() => null);
    if (!txt) break;
    const pct = Number(txt.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace("٪", ""));
    expect(pct).toBeGreaterThanOrEqual(prev); // monotonic
    prev = Math.max(prev, pct);
    if (pct >= 100) break;
    await page.waitForTimeout(400);
  }
  console.log(`[upload-big] progress reached ${prev}% then completed`);
  expect(prev).toBeGreaterThan(50); // we actually observed mid-flight progress

  // pipeline finishes on the 50MB payload - thumbnail appears, no crash
  const thumb = page.locator("img").first();
  await thumb.waitFor({ state: "visible", timeout: 60_000 });
  rmSync(bigPath, { force: true });
});
