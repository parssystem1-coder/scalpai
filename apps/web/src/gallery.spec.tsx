// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import PatientGalleryPage from "./pages/PatientGalleryPage.js";

// Stub global fetch: the page must consume presigned http(s) URLs —
// rendering base64 data URIs is the v1 anti-pattern we never bring back.
const fetchMock = vi.fn(async () =>
  new Response(
    JSON.stringify({
      items: [
        {
          id: "g1",
          createdAt: new Date().toISOString(),
          quality: { blurVariance: 100 },
          thumbUrl: "http://127.0.0.1:9000/signed-thumb",
          viewUrl: "http://127.0.0.1:9000/signed-view",
        },
      ],
      nextCursor: null,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  ),
);

beforeAll(() => {
  class RO {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element): void {
      this.cb(
        [
          {
            target: el,
            contentRect: { width: 1024, height: 800, x: 0, y: 0, top: 0, left: 0, bottom: 800, right: 1024, toJSON() {} },
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal("ResizeObserver", RO);
});

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/patients/p1/gallery"]}>
        <PatientGalleryPage onLoggedOut={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("patient gallery page (M4)", () => {
  it("renders thumbs via presigned URLs — never base64", async () => {
    renderPage();
    await screen.findByText("گالری بیمار");
    const img = await vi.waitFor(() => {
      const el = document.querySelector("img");
      if (!el) throw new Error("img not rendered yet");
      return el;
    });
    expect(img.getAttribute("src")).toMatch(/^http/);
    expect(img.getAttribute("src")).not.toMatch(/^data:/);
  });

  it("offers an upload control", () => {
    renderPage();
    expect(screen.getByLabelText("انتخاب تصویر")).toBeTruthy();
  });
});
