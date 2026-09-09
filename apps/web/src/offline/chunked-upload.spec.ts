// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { abortUpload, getPendingUploads, uploadChunked, type PendingUploadState } from "./chunked-upload.js";

/**
 * Resumable media upload (WEAKNESSES H7/H12, ADR-0041).
 *
 * Nobody is signed in in this suite, so there is no scoped Dexie database and
 * the durable pointer is a no-op - which is exactly the interesting case: the
 * upload must still work end to end, driven only by what the SERVER says the
 * part geometry is. Every request is routed through a stub, so the byte windows,
 * the signature-expiry retry and the completion body are all asserted directly.
 */

const SIZE = 12 * 1024 * 1024;
const PART = 5 * 1024 * 1024;

interface SliceCall {
  start: number;
  end: number;
}

/** A File stand-in: chunked-upload only needs name/size/type/slice. */
function fakeFile(name: string, size: number, mime = "image/jpeg") {
  const slices: SliceCall[] = [];
  const file = {
    name,
    size,
    type: mime,
    slice(start: number, end: number): Blob {
      slices.push({ start, end });
      return { size: end - start } as unknown as Blob;
    },
  };
  return { file: file as unknown as File, slices };
}

interface Call {
  url: string;
  method: string;
  body: unknown;
}

interface Reply {
  status?: number;
  body?: unknown;
  etag?: string;
}

type Route = [RegExp, (call: Call) => Reply];

/** First matching route wins, so a specific failure can shadow a generic success. */
function router(routes: Route[]): Call[] {
  const calls: Call[] = [];
  const impl = (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const call: Call = {
      url: String(input),
      method: (init.method ?? "GET").toUpperCase(),
      body: init.body,
    };
    calls.push(call);
    for (const [pattern, handle] of routes) {
      if (!pattern.test(call.url)) continue;
      const reply = handle(call);
      const status = reply.status ?? 200;
      const etag = reply.etag;
      const response = {
        ok: status >= 200 && status < 300,
        status,
        headers: {
          get: (name: string): string | null =>
            name.toLowerCase() === "etag" && etag !== undefined ? etag : null,
        },
        json: (): Promise<unknown> => Promise.resolve(reply.body ?? null),
      };
      return Promise.resolve(response as unknown as Response);
    }
    throw new Error(`unrouted request: ${call.method} ${call.url}`);
  };
  vi.stubGlobal("fetch", impl);
  return calls;
}

function openSinglePart(): Record<string, unknown> {
  return {
    id: "g1",
    sessionId: "s1",
    key: "clinic-a/p1/g1.jpg",
    multipart: false,
    sizeBytes: 2048,
    partSizeBytes: 8 * 1024 * 1024,
    totalParts: 1,
    expiresAt: "2026-01-01T00:00:00.000Z",
    uploadUrl: "https://bucket.example/put/g1",
  };
}

function partUrls(prefix: string): Array<{ partNumber: number; url: string; bytes: number }> {
  return [1, 2, 3].map((partNumber) => ({
    partNumber,
    url: `https://bucket.example/${prefix}/${partNumber}`,
    bytes: PART,
  }));
}

function openMultipart(seeded: boolean): Record<string, unknown> {
  return {
    id: "g2",
    sessionId: "s2",
    key: "clinic-a/p1/g2.jpg",
    multipart: true,
    sizeBytes: SIZE,
    partSizeBytes: PART,
    totalParts: 3,
    expiresAt: "2026-01-01T00:00:00.000Z",
    ...(seeded ? { parts: partUrls("part") } : {}),
  };
}

/** `"etag-3"` for `.../part/3` - quoted, because S3 quotes ETags. */
function etagFor(url: string): string {
  return `"etag-${url.slice(-1)}"`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pending uploads with nobody signed in", () => {
  it("answers empty instead of throwing", async () => {
    expect(await getPendingUploads()).toEqual([]);
  });
});

describe("single-part upload", () => {
  it("opens a session, PUTs the file once and completes it", async () => {
    const { file } = fakeFile("scalp.jpg", 2048);
    const calls = router([
      [/\/api\/v1\/patients\/p1\/gallery\/uploads$/, () => ({ body: openSinglePart() })],
      [/^https:\/\/bucket\.example\/put\/g1$/, () => ({ etag: '"single"' })],
      [/\/api\/v1\/gallery\/g1\/complete$/, () => ({ body: { ok: true } })],
    ]);
    const progress: number[] = [];

    await uploadChunked(file, "p1", (pct) => progress.push(pct));

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/v1/patients/p1/gallery/uploads",
      "PUT https://bucket.example/put/g1",
      "POST /api/v1/gallery/g1/complete",
    ]);
    expect(progress).toEqual([100]);
  });

  it("refuses a single-part session the server gave no upload url for", async () => {
    const { file } = fakeFile("scalp.jpg", 2048);
    router([
      [
        /\/gallery\/uploads$/,
        () => ({ body: { ...openSinglePart(), uploadUrl: undefined } }),
      ],
    ]);
    await expect(uploadChunked(file, "p1")).rejects.toThrow(/upload url/);
  });

  it("surfaces a failed PUT instead of reporting success", async () => {
    const { file } = fakeFile("scalp.jpg", 2048);
    router([
      [/\/gallery\/uploads$/, () => ({ body: openSinglePart() })],
      [/^https:\/\/bucket\.example\/put\/g1$/, () => ({ status: 500 })],
    ]);
    await expect(uploadChunked(file, "p1")).rejects.toThrow(/upload failed: 500/);
  });
});

describe("multipart upload (WEAKNESSES H7)", () => {
  it("slices on the shared part geometry and completes with every etag", async () => {
    const { file, slices } = fakeFile("big.jpg", SIZE);
    const calls = router([
      [/\/api\/v1\/patients\/p1\/gallery\/uploads$/, () => ({ body: openMultipart(true) })],
      [/^https:\/\/bucket\.example\/part\/\d+$/, (call) => ({ etag: etagFor(call.url) })],
      [/\/api\/v1\/gallery\/uploads\/s2\/complete$/, () => ({ body: { ok: true } })],
    ]);
    const progress: number[] = [];

    await uploadChunked(file, "p1", (pct) => progress.push(pct));

    // partRange() from @scalpai/shared is the ONLY definition of these windows.
    expect(slices).toEqual([
      { start: 0, end: PART },
      { start: PART, end: 2 * PART },
      { start: 2 * PART, end: SIZE },
    ]);
    // The open response seeded the first window, so no extra minting round trip.
    expect(calls.some((c) => c.url.endsWith("/parts"))).toBe(false);
    expect(progress).toEqual([0, 33, 67, 100, 100]);

    const complete = calls.find((c) => c.url.endsWith("/uploads/s2/complete"));
    expect(complete).toBeDefined();
    expect(JSON.parse(String(complete!.body))).toEqual({
      parts: [
        { partNumber: 1, etag: "etag-1" },
        { partNumber: 2, etag: "etag-2" },
        { partNumber: 3, etag: "etag-3" },
      ],
    });
  });

  it("re-mints the window once when the bucket refuses an expired signature", async () => {
    const { file } = fakeFile("big.jpg", SIZE);
    const calls = router([
      [/\/api\/v1\/patients\/p1\/gallery\/uploads$/, () => ({ body: openMultipart(true) })],
      [
        /\/api\/v1\/gallery\/uploads\/s2\/parts$/,
        () => ({ body: { parts: partUrls("fresh"), totalParts: 3 } }),
      ],
      // The seeded URL for part 1 has expired.
      [/^https:\/\/bucket\.example\/part\/1$/, () => ({ status: 403 })],
      [/^https:\/\/bucket\.example\/(part|fresh)\/\d+$/, (call) => ({ etag: etagFor(call.url) })],
      [/\/api\/v1\/gallery\/uploads\/s2\/complete$/, () => ({ body: { ok: true } })],
    ]);

    await uploadChunked(file, "p1");

    const urls = calls.map((c) => c.url);
    expect(urls).toContain("https://bucket.example/part/1");
    // Exactly one fresh window - not one per part.
    expect(urls.filter((u) => u.endsWith("/uploads/s2/parts"))).toHaveLength(1);
    // The retry, and the rest of the window, use the re-minted signatures.
    expect(urls).toContain("https://bucket.example/fresh/1");
    expect(urls).toContain("https://bucket.example/fresh/2");
    expect(urls).toContain("https://bucket.example/fresh/3");
    expect(urls.some((u) => u.endsWith("/uploads/s2/complete"))).toBe(true);
  });

  it("fails loudly when a part is refused twice", async () => {
    const { file } = fakeFile("big.jpg", SIZE);
    router([
      [/\/api\/v1\/patients\/p1\/gallery\/uploads$/, () => ({ body: openMultipart(true) })],
      [/\/parts$/, () => ({ body: { parts: partUrls("part"), totalParts: 3 } })],
      [/^https:\/\/bucket\.example\/part\/1$/, () => ({ status: 403 })],
      [/^https:\/\/bucket\.example\/part\/\d+$/, (call) => ({ etag: etagFor(call.url) })],
    ]);
    await expect(uploadChunked(file, "p1")).rejects.toThrow(/part 1 was refused twice/);
  });

  it("throws on a part failure that is not a signature problem", async () => {
    const { file } = fakeFile("big.jpg", SIZE);
    router([
      [/\/api\/v1\/patients\/p1\/gallery\/uploads$/, () => ({ body: openMultipart(true) })],
      [/^https:\/\/bucket\.example\/part\/1$/, () => ({ status: 500 })],
    ]);
    // A missing part must never be completed over silently.
    await expect(uploadChunked(file, "p1")).rejects.toThrow(/part upload failed: 500/);
  });
});

describe("abortUpload", () => {
  it("tells the server to drop the session", async () => {
    const calls = router([[/\/api\/v1\/gallery\/uploads\/s9$/, () => ({ body: { ok: true } })]]);
    const record: PendingUploadState = {
      key: "g9",
      sessionId: "s9",
      patientId: "p1",
      fileName: "scalp.jpg",
      fileSize: 2048,
      mime: "image/jpeg",
      partSizeBytes: PART,
      totalParts: 1,
      multipart: false,
      partEtags: {},
      createdAt: 1,
      updatedAt: 1,
    };

    await abortUpload(record);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("/api/v1/gallery/uploads/s9");
  });
});
