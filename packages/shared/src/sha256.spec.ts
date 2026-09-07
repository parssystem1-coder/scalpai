import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { isSha256Hex, sha256Hex, sha256HexOfText } from "./sha256.js";

/**
 * Phase 10 (H13). The provenance digest is only worth something if the browser
 * and the server compute the SAME value, so this suite pins our portable
 * implementation against node:crypto across every padding boundary.
 */
describe("portable sha256 (H13)", () => {
  it("matches the FIPS 180-4 published vectors", () => {
    expect(sha256HexOfText("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256HexOfText("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("agrees with node:crypto on every padding boundary", () => {
    // 55/56 and 63/64 are where the 1-block vs 2-block padding decision flips.
    for (const size of [0, 1, 54, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) % 256;
      const expected = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
      expect(sha256Hex(bytes), `size=${size}`).toBe(expected);
    }
  });

  it("agrees with node:crypto on an image-sized buffer", () => {
    // 1024x256 RGBA is the order of magnitude AnalysisPage actually hashes.
    const bytes = new Uint8Array(1024 * 256 * 4);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) % 251;
    expect(sha256Hex(bytes)).toBe(createHash("sha256").update(Buffer.from(bytes)).digest("hex"));
  });

  it("hashes non-ASCII text as UTF-8", () => {
    const text = "پرونده بیمار";
    expect(sha256HexOfText(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });

  it("accepts Uint8ClampedArray (canvas ImageData) without copying semantics", () => {
    const clamped = new Uint8ClampedArray([1, 2, 3, 250, 251, 252]);
    expect(sha256Hex(clamped)).toBe(sha256Hex(new Uint8Array([1, 2, 3, 250, 251, 252])));
  });

  it("recognises well-formed digests only", () => {
    expect(isSha256Hex(sha256HexOfText("x"))).toBe(true);
    expect(isSha256Hex(sha256HexOfText("x").toUpperCase())).toBe(false);
    expect(isSha256Hex("deadbeef")).toBe(false);
  });
});
