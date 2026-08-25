import { describe, expect, it } from "vitest";
import { createEngine, heuristicEngine, type RgbaImage } from "./index.js";

interface SceneOpts {
  red?: number;
  noise?: number;
}

function scene(opts: SceneOpts = {}, w = 96, h = 96): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  const red = opts.red ?? 0;
  const noise = opts.noise ?? 0;
  let seed = 5;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0xffffffff);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < w * h; i++) {
    const n = (rand() - 0.5) * 2 * noise;
    data[i * 4] = clamp(120 + red + n);
    data[i * 4 + 1] = clamp(120 - red / 2 + n);
    data[i * 4 + 2] = clamp(120 - red / 2 + n);
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

describe("heuristic engine v0", () => {
  it("is deterministic for identical inputs", async () => {
    const a = await heuristicEngine.analyze({ image: scene() });
    const b = await heuristicEngine.analyze({ image: scene() });
    expect(b).toEqual(a);
  });

  it("scores a red-dominant frame higher on redness", async () => {
    const neutral = await heuristicEngine.analyze({ image: scene() });
    const red = await heuristicEngine.analyze({ image: scene({ red: 70 }) });
    expect(red.scores.redness).toBeGreaterThan(neutral.scores.redness);
    expect(red.severity).toBeGreaterThanOrEqual(neutral.severity);
  });

  it("scores noisy frames higher on flakeTexture than smooth ones", async () => {
    const smooth = await heuristicEngine.analyze({ image: scene({ noise: 2 }) });
    const noisy = await heuristicEngine.analyze({ image: scene({ noise: 90 }) });
    expect(noisy.scores.flakeTexture).toBeGreaterThan(smooth.scores.flakeTexture);
  });

  it("rejects undersized inputs", async () => {
    await expect(heuristicEngine.analyze({ image: scene({}, 8, 8) })).rejects.toThrow(/too small/);
  });

  it("factory exposes only the heuristic backend today", () => {
    expect(createEngine().backend).toBe("heuristic");
    // @ts-expect-error onnx backend arrives in phase 6
    expect(() => createEngine({ backend: "onnx" })).toThrow(/unknown analysis backend/);
  });

  it("keeps every score inside the shared contract bounds", async () => {
    const out = await heuristicEngine.analyze({ image: scene({ red: 100, noise: 127 }) });
    for (const v of Object.values(out.scores)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(out.modelVersion).toBe("heuristic-v0");
  });
});
