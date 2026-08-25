import { describe, expect, it } from "vitest";
import { sniffImageMime } from "../src/media/magic.js";

describe("magic bytes (rules §2)", () => {
  it("recognizes jpeg/png/webp signatures", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(16)]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(8)]);
    const webp = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4), Buffer.from("WEBP", "ascii"), Buffer.alloc(8)]);
    expect(sniffImageMime(jpeg)).toBe("jpeg");
    expect(sniffImageMime(png)).toBe("png");
    expect(sniffImageMime(webp)).toBe("webp");
  });

  it("rejects non-image content and tiny buffers", () => {
    expect(sniffImageMime(Buffer.from("<html>not an image</html>"))).toBeNull();
    expect(sniffImageMime(Buffer.from([0x00, 0x01]))).toBeNull();
  });
});
