// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDashboardAnalysis } from "./useDashboardAnalysis";
import { useDashboardNavigation } from "./useDashboardNavigation";
import { useDashboardRecords } from "./useDashboardRecords";
import type { DashboardDataProvider } from "../data/dashboard-data-types";

vi.mock("../api/client", () => ({
  apiFetch: vi.fn().mockResolvedValue(null),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const provider: DashboardDataProvider = {
  mode: "real",
  getPatients: () => [],
  getImages: () => ({}),
};

describe("L2b dashboard hooks", () => {
  it("keeps navigation state independent and scrolls to a known section", () => {
    const section = document.createElement("section");
    section.id = "section-gallery";
    Object.defineProperty(section, "offsetTop", { value: 200, configurable: true });
    document.body.appendChild(section);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const { result } = renderHook(() => useDashboardNavigation());

    act(() => result.current.scrollToSection("gallery"));

    expect(result.current.activeSection).toBe("gallery");
    expect(scrollTo).toHaveBeenCalledWith({ top: -90, behavior: "smooth" });
  });

  it("rejects incomplete records and accepts a complete record through the provider pipeline", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useDashboardRecords(provider), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    });
    const labels = { today: "Today", defaultCondition: "Assessment" };

    let invalid: unknown;
    act(() => {
      invalid = result.current.addPatient({ firstName: "", lastName: "", phone: "", condition: "" }, labels);
    });
    expect(invalid).toBeNull();
    expect(result.current.patientList).toHaveLength(0);

    act(() => {
      result.current.addPatient({ firstName: "Sara", lastName: "Test", phone: "", condition: "" }, labels);
    });
    expect(result.current.patientList[0]?.firstName).toBe("Sara");
    expect(result.current.selectedPatient?.lastName).toBe("Test");
  });

  it("runs the real engine on a provided image and exposes provenance-carrying result", async () => {
    // 64x64 RGBA buffer: noise-free gradient the heuristic engine scores deterministically.
    const width = 64;
    const height = 64;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 230;
      data[i * 4 + 1] = 200;
      data[i * 4 + 2] = 190;
      data[i * 4 + 3] = 255;
    }
    const image = { data, width, height };

    const { result } = renderHook(() =>
      useDashboardAnalysis(
        { protocolSoothing: "Soothing", protocolMeso: "Meso" },
        {
          loadImage: async () => image,
          hashImage: async (img) => `sha-${img.data.byteLength}`,
        },
      ),
    );

    expect(result.current.result.state).toBe("empty");

    await act(async () => {
      await result.current.runAnalysis({ url: "https://cdn.example.com/real.jpg", galleryItemId: "g9" });
    });

    const state = result.current.result;
    if (state.state !== "ready") throw new Error("expected ready state");
    expect(state.data.scores.redness).toBeTypeOf("number");
    expect(state.data.recommendation).toMatch(/Meso|Soothing/);
    expect(state.provenance.imageHash).toMatch(/^sha-/);
    expect(state.provenance.modelVersion).toBe("heuristic-v0");
    expect(state.provenance.galleryItemId).toBe("g9");
  });

  it("transitions to error state without an image instead of fabricating a result", async () => {
    const { result } = renderHook(() =>
      useDashboardAnalysis({ protocolSoothing: "Soothing", protocolMeso: "Meso" }),
    );

    await act(async () => {
      await result.current.runAnalysis();
    });

    expect(result.current.result.state).toBe("error");
  });
});
