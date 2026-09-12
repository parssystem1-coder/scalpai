// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDashboardModals } from "../hooks/useDashboardModals";
import { createDashboardEventBus } from "./dashboard-event-bus";

afterEach(cleanup);

describe("L2c dashboard state synchronization", () => {
  it("propagates modal visibility across hook consumers sharing one bus", () => {
    const bus = createDashboardEventBus();
    const first = renderHook(() => useDashboardModals(bus));
    const second = renderHook(() => useDashboardModals(bus));

    act(() => first.result.current.openEducation());
    expect(first.result.current.isEducationOpen).toBe(true);
    expect(second.result.current.isEducationOpen).toBe(true);

    act(() => second.result.current.closeEducation());
    expect(first.result.current.isEducationOpen).toBe(false);
    expect(second.result.current.isEducationOpen).toBe(false);
  });
});
