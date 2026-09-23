import { describe, expect, it } from "vitest";
import { QUOTA_SPECS, isQuotaName, resolveQuotaLimit } from "./quota.repo.js";

describe("QUOTA_SPECS.messages (wave 3 D11)", () => {
  it("meters the same counter as phase-5a metering (messages_sent)", () => {
    expect(QUOTA_SPECS.messages.metric).toBe("messages_sent");
    expect(QUOTA_SPECS.messages.kind).toBe("flow");
  });

  it("reads the same plan keys as metering.repo — guard and counter must never disagree", () => {
    expect(resolveQuotaLimit({ messages_per_month: 500 }, "messages")).toBe(500);
    expect(resolveQuotaLimit({ messages_sent: 250 }, "messages")).toBe(250);
    // اولین کلید قابل استفاده می‌برد — همان قاعده metering
    expect(resolveQuotaLimit({ messages_per_month: 500, messages_sent: 250 }, "messages")).toBe(500);
  });

  it("treats malformed plan values as unmetered, not zero", () => {
    expect(resolveQuotaLimit({ messages_per_month: -5 }, "messages")).toBeNull();
    expect(resolveQuotaLimit({ messages_per_month: 1.5 }, "messages")).toBeNull();
    expect(resolveQuotaLimit({ messages_per_month: "500" }, "messages")).toBeNull();
    expect(resolveQuotaLimit({}, "messages")).toBeNull();
  });

  it("is a real quota name so a typo'd decorator cannot silently disable metering", () => {
    expect(isQuotaName("messages")).toBe(true);
  });
});
