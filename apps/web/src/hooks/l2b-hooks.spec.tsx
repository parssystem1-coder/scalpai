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

  it("runs the analysis pipeline and exposes a stable render result", async () => {
    const { result } = renderHook(() =>
      useDashboardAnalysis({
        caliberHealthy: "Healthy",
        caliberStandard: (microns) => `${microns} µm`,
        protocolPeptide: "Peptide",
        protocolSoothing: "Soothing",
        protocolMeso: "Meso",
      }),
    );

    await act(async () => {
      await result.current.runAnalysis();
    });

    expect(result.current.result.scores.redness).toBeTypeOf("number");
    expect(result.current.result.recommendation).toMatch(/Meso|Soothing/);
  });
});
