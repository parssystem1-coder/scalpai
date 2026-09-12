import { describe, expect, it, vi } from "vitest";
import { createDashboardEventBus } from "./dashboard-event-bus";

describe("dashboard event bus", () => {
  it("delivers typed patient events and supports unsubscribe", () => {
    const bus = createDashboardEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe("patient:selected", listener);

    bus.emit("patient:selected", { patientId: "pat-1" });
    expect(listener).toHaveBeenCalledWith({ patientId: "pat-1" });

    unsubscribe();
    bus.emit("patient:selected", { patientId: "pat-2" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears every subscription without affecting future subscriptions", () => {
    const bus = createDashboardEventBus();
    const opened = vi.fn();
    bus.subscribe("modal:opened", opened);
    bus.clear();
    bus.emit("modal:opened", { modal: "education" });
    expect(opened).not.toHaveBeenCalled();

    const closed = vi.fn();
    bus.subscribe("modal:closed", closed);
    bus.emit("modal:closed", { modal: "education" });
    expect(closed).toHaveBeenCalledOnce();
  });
});
