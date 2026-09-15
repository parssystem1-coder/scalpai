/**
 * HTTP boundary for provider adapters. Keeping fetch behind this port makes
 * provider behavior deterministic in unit tests and prevents test suites from
 * making real network calls.
 */
export interface HttpResponse<T> {
  readonly status: number;
  readonly ok: boolean;
  readonly json: () => Promise<T>;
}

export interface HttpClientPort {
  post<T>(url: string, body: URLSearchParams, signal?: AbortSignal): Promise<HttpResponse<T>>;
}

export const fetchHttpClient: HttpClientPort = {
  async post<T>(url: string, body: URLSearchParams, signal?: AbortSignal) {
    const response = await fetch(url, {
      method: "POST",
      body,
      signal,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    return {
      status: response.status,
      ok: response.ok,
      json: async () => {
        const payload: unknown = await response.json();
        return payload as T;
      },
    };
  },
};
