// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, clearAccessToken, getAccessToken, setAccessToken } from "./client.js";

/**
 * The web transport (WEAKNESSES H1, engineering-rules §3).
 *
 * Two things are worth a regression test here and both are easy to break by
 * accident: WHERE the access token is allowed to live, and the exact header set
 * a request goes out with. `fetch` is stubbed - this suite never touches a
 * network.
 */

interface Recorded {
  url: string;
  init: RequestInit;
}

interface StubbedResponse {
  status?: number;
  body?: unknown;
  /** Simulate a body that is not JSON at all (a proxy error page, a 204). */
  unparseable?: boolean;
}

function stubFetch(response: StubbedResponse): Recorded[] {
  const calls: Recorded[] = [];
  const impl = (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    calls.push({ url: String(input), init });
    const status = response.status ?? 200;
    const fake = {
      ok: status >= 200 && status < 300,
      status,
      json: (): Promise<unknown> =>
        response.unparseable === true
          ? Promise.reject(new Error("body is not JSON"))
          : Promise.resolve(response.body ?? null),
    };
    return Promise.resolve(fake as unknown as Response);
  };
  vi.stubGlobal("fetch", impl);
  return calls;
}

function headersOf(call: Recorded): Record<string, string | undefined> {
  return (call.init.headers ?? {}) as Record<string, string | undefined>;
}

beforeEach(() => {
  clearAccessToken();
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("access token custody (WEAKNESSES H1)", () => {
  it("starts empty and round-trips through sessionStorage", () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken("token-abc");
    expect(getAccessToken()).toBe("token-abc");
    expect(sessionStorage.getItem("scalpai_access_token")).toBe("token-abc");
  });

  it("clears the token from memory AND from storage", () => {
    setAccessToken("token-abc");
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
    expect(sessionStorage.getItem("scalpai_access_token")).toBeNull();
  });

  it("never writes the token to localStorage, remember-me or not", () => {
    setAccessToken("token-abc", true);
    expect(localStorage.length).toBe(0);
  });
});

describe("apiFetch request shape", () => {
  it("prefixes the versioned base path", async () => {
    const calls = stubFetch({ body: { items: [] } });
    await apiFetch("/patients");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/v1/patients");
  });

  it("omits content-type when there is no body (Fastify 400s on a bodyless JSON POST)", async () => {
    const calls = stubFetch({ body: null });
    await apiFetch("/auth/logout", { method: "POST" });
    expect(headersOf(calls[0]!)["content-type"]).toBeUndefined();
  });

  it("sends the JSON content-type only when a body exists", async () => {
    const calls = stubFetch({ body: null });
    await apiFetch("/patients", { method: "POST", body: JSON.stringify({ gender: "male" }) });
    expect(headersOf(calls[0]!)["content-type"]).toBe("application/json");
  });

  it("attaches the bearer token only once one is set", async () => {
    const anonymous = stubFetch({ body: null });
    await apiFetch("/patients");
    expect(headersOf(anonymous[0]!).authorization).toBeUndefined();

    setAccessToken("token-abc");
    const authenticated = stubFetch({ body: null });
    await apiFetch("/patients");
    expect(headersOf(authenticated[0]!).authorization).toBe("Bearer token-abc");
  });

  it("lets an explicit header win over the defaults", async () => {
    setAccessToken("token-abc");
    const calls = stubFetch({ body: null });
    await apiFetch("/gallery", { headers: { authorization: "Bearer override" } });
    expect(headersOf(calls[0]!).authorization).toBe("Bearer override");
  });
});

describe("ApiError (engineering-rules §3, ADR-0040)", () => {
  it("carries status, code, message and the details half of the error body", async () => {
    stubFetch({
      status: 400,
      body: { code: "MUTATION_INVALID", message: "بخشی از درخواست معتبر نیست", details: { indexes: [0, 2] } },
    });
    const thrown: unknown = await apiFetch("/sync/push", { method: "POST", body: "{}" }).catch(
      (err: unknown) => err,
    );
    expect(thrown).toBeInstanceOf(ApiError);
    const error = thrown as ApiError;
    expect(error.status).toBe(400);
    expect(error.code).toBe("MUTATION_INVALID");
    expect(error.message).toBe("بخشی از درخواست معتبر نیست");
    // The sync client needs this to blame individual mutations instead of the
    // whole batch.
    expect(error.details).toEqual({ indexes: [0, 2] });
  });

  it("falls back to a generic code and message when the body is not JSON", async () => {
    stubFetch({ status: 502, unparseable: true });
    const error = (await apiFetch("/patients").catch((err: unknown) => err)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe("ERROR");
    expect(error.message).toBe("خطای نامشخص");
    expect(error.details).toBeUndefined();
  });

  it("returns the parsed body on success", async () => {
    stubFetch({ body: { items: [{ id: "p1" }] } });
    const body = await apiFetch<{ items: { id: string }[] }>("/patients");
    expect(body.items[0]?.id).toBe("p1");
  });
});
