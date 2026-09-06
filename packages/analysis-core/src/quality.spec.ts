import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { rgbaToGray, computeQuality, QUALITY_THRESHOLDS, type GrayImage } from "./index.js";

/** Deterministic pseudo-noise scene — stands in for a real macro photo. */
function noisyScene(width = 480, height = 360): sharp.Sharp {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0xffffffff);
  for (let i = 0; i < width * height; i++) {
    const v = Math.floor(rand() * 255);
    raw[i * 3] = v;
    raw[i * 3 + 1] = v;
    raw[i * 3 + 2] = v;
  }
  return sharp(raw, { raw: { width, height, channels: 3 } });
}

async function render(pipeline: sharp.Sharp): Promise<GrayImage> {
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return rgbaToGray(data, info.width, info.height);
}

describe("quality gate (§10.1)", () => {
  it("accepts a sharp, well-lit, non-empty frame", async () => {
    const verdict = computeQuality(await render(noisyScene()));
    expect(verdict.status).toBe("pass");
    expect(verdict.metrics.blurVariance).toBeGreaterThan(QUALITY_THRESHOLDS.minBlurVariance);
    expect(verdict.reasons).toEqual([]);
  });

  it("rejects an intentionally blurred frame (DoD fixture)", async () => {
    const verdict = computeQuality(await render(noisyScene().blur(6)));
    expect(verdict.status).toBe("reject");
    expect(verdict.metrics.blurVariance).toBeLessThan(QUALITY_THRESHOLDS.minBlurVariance);
    expect(verdict.reasons.some((r) => r.includes("تار"))).toBe(true);
  });

  it("rejects a too-dark frame", async () => {
    const verdict = computeQuality(await render(noisyScene().modulate({ brightness: 0.12 })));
    expect(verdict.status).toBe("reject");
    expect(verdict.metrics.brightnessMean).toBeLessThan(QUALITY_THRESHOLDS.minBrightness);
    expect(verdict.reasons.some((r) => r.includes("نور"))).toBe(true);
  });

  it("rejects a washed-out overbright frame", async () => {
    const verdict = computeQuality(await render(noisyScene().linear(2.2, 120)));
    expect(verdict.status).toBe("reject");
    expect(verdict.metrics.brightnessMean).toBeGreaterThan(QUALITY_THRESHOLDS.maxBrightness);
  });

  it("rejects an empty flat frame (framing)", async () => {
    const flat = sharp({ create: { width: 480, height: 360, channels: 3, background: { r: 128, g: 128, b: 128 } } });
    const verdict = computeQuality(await render(flat));
    expect(verdict.status).toBe("reject");
    expect(verdict.metrics.edgePixelRatio).toBeLessThan(QUALITY_THRESHOLDS.minEdgeRatio);
    expect(verdict.reasons.some((r) => r.includes("کادر"))).toBe(true);
  });

  it("is deterministic for identical inputs", async () => {
    const a = computeQuality(await render(noisyScene()));
    const b = computeQuality(await render(noisyScene()));
    expect(b.metrics).toEqual(a.metrics);
  });

  it("refuses images too small to analyse", async () => {
    const tiny = await render(noisyScene(8, 8));
    expect(() => computeQuality(tiny)).toThrow(/too small/);
  });
});
