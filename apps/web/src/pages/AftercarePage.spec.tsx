// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AftercarePage } from "./AftercarePage.js";

const { apiFetch, ApiError } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("../api/client.js", () => ({ apiFetch, ApiError }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "fa" } }),
}));
vi.mock("../i18n.js", () => ({ default: { addResourceBundle: vi.fn() } }));

const SEQ = {
  id: "seq-1",
  name: "مسیر پیگیری",
  description: null,
  trigger: "manual",
  serviceId: null,
  locale: "fa",
  steps: [{ offsetHours: 24, channel: "kavenegar", templateKey: "aftercare.day1" }],
  active: true,
};

const ENROLL = {
  id: "en-1",
  sequenceId: "seq-1",
  patientId: "pat-1",
  state: "active",
  currentStep: 0,
  stepsSnapshot: SEQ.steps,
  nextRunAt: null,
};

function renderPage() {
  return render(<AftercarePage />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AftercarePage (D12)", () => {
  it("lists sequences and enrollments", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/aftercare/sequences")) return [SEQ];
      if (path.startsWith("/aftercare/enrollments")) return [ENROLL];
      if (path === "/services") return [{ id: "svc-1", name: "لیزر مو" }];
      return [{ id: "pat-1", firstName: "زهرا", lastName: "محمدی", phone: "09121234567" }];
    });
    renderPage();
    expect(await screen.findByTestId("seq-seq-1")).toBeTruthy();
    expect(await screen.findByTestId("enroll-en-1")).toBeTruthy();
  });

  it("creates a sequence with one step, honoring the active-needs-steps rule", async () => {
    apiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path === "/aftercare/sequences" && init?.method === "POST") {
        const dto = JSON.parse(init.body ?? "{}");
        expect(dto.name).toBe("دنباله تازه");
        expect(dto.steps).toEqual([{ offsetHours: 48, channel: "smsir", templateKey: "aftercare.day3" }]);
        expect(dto.active).toBe(true);
        return { id: "seq-2" };
      }
      if (path.startsWith("/aftercare/sequences")) return [SEQ];
      if (path.startsWith("/aftercare/enrollments")) return [];
      if (path === "/services") return [];
      return [];
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText("aftercare.name"), { target: { value: "دنباله تازه" } });
    fireEvent.change(screen.getByLabelText("aftercare.offsetHours"), { target: { value: "48" } });
    fireEvent.change(screen.getByLabelText("aftercare.channel"), { target: { value: "smsir" } });
    fireEvent.change(screen.getByLabelText("aftercare.template"), { target: { value: "aftercare.day3" } });
    fireEvent.click(screen.getByText("aftercare.createSequence"));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/aftercare/sequences", expect.objectContaining({ method: "POST" })),
    );
  });

  it("requires serviceId in the UI when trigger=session_completed", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/aftercare/sequences")) return [];
      if (path.startsWith("/aftercare/enrollments")) return [];
      if (path === "/services") return [{ id: "svc-1", name: "لیزر مو" }];
      return [];
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText("aftercare.name"), { target: { value: "سشن" } });
    fireEvent.change(screen.getByTestId("seq-trigger"), { target: { value: "session_completed" } });
    // سرویس اجباری رندر شده و خالی رد می‌شود (required)
    expect(screen.getByLabelText("aftercare.service")).toBeTruthy();
  });

  it("enrolls a patient into an active sequence", async () => {
    apiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path === "/aftercare/enrollments" && init?.method === "POST") {
        expect(JSON.parse(init.body ?? "{}")).toEqual({ sequenceId: "seq-1", patientId: "pat-1" });
        return { id: "en-2" };
      }
      if (path.startsWith("/aftercare/sequences")) return [SEQ];
      if (path.startsWith("/aftercare/enrollments")) return [];
      if (path === "/services") return [];
      return [{ id: "pat-1", firstName: "زهرا", lastName: "محمدی", phone: "09121234567" }];
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText("aftercare.sequence"), { target: { value: "seq-1" } });
    fireEvent.change(screen.getByLabelText("aftercare.patient"), { target: { value: "pat-1" } });
    fireEvent.click(screen.getByText("aftercare.enroll"));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/aftercare/enrollments", expect.objectContaining({ method: "POST" })),
    );
  });

  it("shows the upgrade CTA when the quota guard refuses enrollment (403 QUOTA_EXCEEDED)", async () => {
    apiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path === "/aftercare/enrollments" && init?.method === "POST") {
        throw new ApiError(403, "QUOTA_EXCEEDED", "quota");
      }
      if (path.startsWith("/aftercare/sequences")) return [SEQ];
      if (path.startsWith("/aftercare/enrollments")) return [];
      if (path === "/services") return [];
      return [{ id: "pat-1", firstName: "زهرا", lastName: "محمدی", phone: "09121234567" }];
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText("aftercare.sequence"), { target: { value: "seq-1" } });
    fireEvent.change(screen.getByLabelText("aftercare.patient"), { target: { value: "pat-1" } });
    fireEvent.click(screen.getByText("aftercare.enroll"));
    expect(await screen.findByTestId("aftercare-quota-cta")).toBeTruthy();
  });

  it("pauses an active enrollment", async () => {
    apiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path?.endsWith("/actions") && init?.method === "POST") {
        expect(JSON.parse(init.body ?? "{}")).toEqual({ action: "pause" });
        return { ok: true };
      }
      if (path.startsWith("/aftercare/sequences")) return [SEQ];
      if (path.startsWith("/aftercare/enrollments")) return [ENROLL];
      if (path === "/services") return [];
      return [];
    });
    renderPage();
    fireEvent.click(await screen.findByText("aftercare.pause"));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/aftercare/enrollments/en-1/actions", expect.objectContaining({ method: "POST" })),
    );
  });
});
