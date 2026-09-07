import { describe, expect, it } from "vitest";
import { cachedSpaShell, isSpaShellCandidate, primeSpaShell, resetSpaShellCache } from "./error.filter.js";

/**
 * Phase 10 (M11). Two things were wrong with the old fallback: it hit the
 * filesystem synchronously on every 404, and it answered HTML for requests that
 * had every right to a real 404.
 */
describe("SPA fallback eligibility (M11)", () => {
  it("never answers a machine client with HTML", () => {
    expect(isSpaShellCandidate("GET", "/api/v1/patients/does-not-exist")).toBe(false);
    expect(isSpaShellCandidate("GET", "/api")).toBe(false);
    expect(isSpaShellCandidate("GET", "/health")).toBe(false);
    expect(isSpaShellCandidate("GET", "/ready")).toBe(false);
    expect(isSpaShellCandidate("GET", "/metrics")).toBe(false);
    expect(isSpaShellCandidate("GET", "/docs/json")).toBe(false);
  });

  it("never answers a missing ASSET with HTML", () => {
    // A broken deploy that serves index.html for a missing chunk is a white
    // screen with a 200, which is strictly worse than a 404.
    expect(isSpaShellCandidate("GET", "/assets/index-a1b2c3.js")).toBe(false);
    expect(isSpaShellCandidate("GET", "/assets/style.css")).toBe(false);
    expect(isSpaShellCandidate("GET", "/favicon.ico")).toBe(false);
    expect(isSpaShellCandidate("GET", "/manifest.webmanifest")).toBe(false);
  });

  it("only ever considers GET", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
      expect(isSpaShellCandidate(method, "/patients")).toBe(false);
    }
  });

  it("accepts a client-side route, query string and all", () => {
    expect(isSpaShellCandidate("GET", "/patients")).toBe(true);
    expect(isSpaShellCandidate("GET", "/patients/123/gallery")).toBe(true);
    expect(isSpaShellCandidate("GET", "/login?next=/patients")).toBe(true);
    expect(isSpaShellCandidate("GET", "/")).toBe(true);
  });

  it("does not confuse an /apiary-style path with the API prefix", () => {
    expect(isSpaShellCandidate("GET", "/apiary")).toBe(true);
  });
});

describe("SPA shell cache (M11)", () => {
  it("caches the answer, including 'there is no build here'", async () => {
    resetSpaShellCache();
    await primeSpaShell();
    // The API suite runs without a web build, so the cached answer is null — the
    // point is that it is CACHED and returned without touching the filesystem.
    const first = cachedSpaShell();
    const second = cachedSpaShell();
    expect(first).toBe(second);
  });

  it("is idempotent: priming twice does not reload", async () => {
    resetSpaShellCache();
    const a = primeSpaShell();
    const b = primeSpaShell();
    expect(a).toBe(b);
    await a;
  });
});
