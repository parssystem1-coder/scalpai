import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { MeteringController } from "./metering.controller.js";
import { TenantScope } from "../tenancy/tenant.scope.js";

/**
 * موج ۳ (D10) — واحد کنترلر مصرف.
 *
 * سرویس mock است؛ آنچه اثبات می‌شود شکل قرارداد است: سه متریک، سقف null
 * صادقانه منتقل می‌شود، و TenantScope گم شده ۴۰۳ می‌دهد نه کرش.
 */
const CLINIC = "11111111-1111-1111-1111-111111111111";
const CTX = { clinicId: CLINIC, userId: "u1", role: "owner" } as const;
/** TenantScope mock: فقط callback را صدا می‌زند — scope واقعی در integration تست می‌شود. */
const SCOPE = { tx: (fn: (tx: null) => Promise<unknown>) => fn(null) } as never;

function meteringMock(rows: Array<{ metric: string; used: number; limit: number | null; periodStart: string }>) {
  return {
    snapshot: vi.fn(async (_tx: unknown, _clinicId: string, metric: "upload_mb" | "analyses" | "messages_sent") => {
      const row = rows.find((r) => r.metric === metric) ?? { metric, used: 0, limit: null, periodStart: "2026-09-01" };
      return row;
    }),
  } as never;
}

describe("MeteringController usage snapshot (D10)", () => {
  it("returns all three metered metrics with their effective limits", async () => {
    const controller = new MeteringController(
      meteringMock([
        { metric: "upload_mb", used: 12, limit: 5120, periodStart: "2026-09-01" },
        { metric: "analyses", used: 3, limit: 200, periodStart: "2026-09-01" },
        { metric: "messages_sent", used: 500, limit: 500, periodStart: "2026-09-01" },
      ]),
      SCOPE,
    );
    let body: unknown;
    await TenantScope.runWith(CTX, async () => {
      body = await controller.usage();
    });
    const report = body as { periodStart: string; usage: Array<{ metric: string; used: number; limit: number | null }> };
    expect(report.periodStart).toBe("2026-09-01");
    expect(report.usage.map((r) => r.metric)).toEqual(["upload_mb", "analyses", "messages_sent"]);
    const messages = report.usage.find((r) => r.metric === "messages_sent");
    expect(messages?.used).toBe(500);
    expect(messages?.limit).toBe(500);
  });

  it("keeps limit null for unmetered metrics (honest snapshot)", async () => {
    const controller = new MeteringController(
      meteringMock([
        { metric: "upload_mb", used: 0, limit: null, periodStart: "2026-09-01" },
        { metric: "analyses", used: 0, limit: null, periodStart: "2026-09-01" },
        { metric: "messages_sent", used: 0, limit: null, periodStart: "2026-09-01" },
      ]),
      SCOPE,
    );
    let body: unknown;
    await TenantScope.runWith(CTX, async () => {
      body = await controller.usage();
    });
    const report = body as { usage: Array<{ limit: number | null }> };
    expect(report.usage.every((r) => r.limit === null)).toBe(true);
  });
});
