import { describe, expect, it, vi } from "vitest";
import { PaymentService } from "./payment.service.js";
import type { PaymentAttemptsRepository } from "./payment-attempts.repository.js";
import type { BillingService } from "./billing.service.js";
import type { ZarinpalAdapter } from "@scalpai/notify";

const TTL_MS = 15 * 60 * 1000;
const CLINIC_ID = "clinic-1";

interface FakeRow {
  id: string;
  invoiceId: string;
  authority: string;
  amount: number;
  redirectUrl: string | null;
  status: string;
  providerRefId: string | null;
  errorReason: string | null;
  expiresAt: Date;
}

const TERMINAL = ["verified", "failed", "expired"];

/**
 * جایگزین درون‌حافظه‌ای ریپوی payment_attempts.
 *
 * عمداً یک mock ساده نیست: همان قواعدی را اجرا می‌کند که Postgres اجرا می‌کند —
 * یکتایی تلاش فعال برای هر فاکتور، compare-and-set روی هر گذار، و بی‌گذار بودن
 * حالت‌های پایانی. وگرنه تست، ماشین حالت را نمی‌سنجد بلکه ماک را می‌سنجد.
 */
class FakeAttempts {
  readonly rows: FakeRow[] = [];
  private seq = 0;

  constructor(
    private readonly invoice: { state: string; total: string; paidAmount: string },
    private readonly paid: { calls: Array<{ invoiceId: string; amount: number; reference: string }> },
  ) {}

  private outstanding(): number {
    return Number(this.invoice.total) - Number(this.invoice.paidAmount);
  }

  private active(invoiceId: string): FakeRow | null {
    return this.rows.find((r) => r.invoiceId === invoiceId && !TERMINAL.includes(r.status)) ?? null;
  }

  private byId(id: string): FakeRow | null {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  claim(invoiceId: string) {
    if (this.invoice.state === "paid") return Promise.resolve({ outcome: "paid" as const });
    if (this.invoice.state !== "issued" && this.invoice.state !== "partially_paid") {
      return Promise.resolve({ outcome: "unpayable" as const, state: this.invoice.state });
    }
    const amount = this.outstanding();
    if (!Number.isSafeInteger(amount) || amount <= 0) return Promise.resolve({ outcome: "no_amount" as const });

    const active = this.active(invoiceId);
    if (active) {
      if (active.expiresAt.getTime() > Date.now()) {
        if (active.status === "started" && active.redirectUrl && active.amount === amount) {
          return Promise.resolve({ outcome: "reused" as const, attempt: active });
        }
        return Promise.resolve({ outcome: "in_progress" as const, attempt: active });
      }
      active.status = "expired";
      active.errorReason = "expired";
    }
    const row: FakeRow = {
      id: `attempt-${++this.seq}`,
      invoiceId,
      authority: "",
      amount,
      redirectUrl: null,
      status: "pending",
      providerRefId: null,
      errorReason: null,
      expiresAt: new Date(Date.now() + TTL_MS),
    };
    this.rows.push(row);
    return Promise.resolve({ outcome: "created" as const, attempt: row });
  }

  start(id: string, authority: string, redirectUrl: string) {
    const row = this.byId(id);
    if (!row || row.status !== "pending") return Promise.resolve(null);
    row.status = "started";
    row.authority = authority;
    row.redirectUrl = redirectUrl;
    return Promise.resolve(row);
  }

  receiveCallback(invoiceId: string, authority: string) {
    const row = this.rows.find((r) => r.authority === authority && r.authority !== "") ?? null;
    if (!row || row.invoiceId !== invoiceId) return Promise.resolve({ outcome: "unknown" as const });
    if (row.status === "verified") return Promise.resolve({ outcome: "verified" as const, attempt: row });
    if (row.status === "failed") return Promise.resolve({ outcome: "failed" as const, attempt: row });
    if (row.status === "expired") return Promise.resolve({ outcome: "expired" as const, attempt: row });
    if (row.expiresAt.getTime() <= Date.now()) {
      row.status = "expired";
      row.errorReason = "expired";
      return Promise.resolve({ outcome: "expired" as const, attempt: row });
    }
    if (row.status === "callback_received") return Promise.resolve({ outcome: "in_progress" as const, attempt: row });
    row.status = "callback_received";
    return Promise.resolve({ outcome: "claimed" as const, attempt: row });
  }

  fail(id: string, reason: string) {
    const row = this.byId(id);
    if (!row || TERMINAL.includes(row.status)) return Promise.resolve(null);
    row.status = "failed";
    row.errorReason = reason;
    return Promise.resolve(row);
  }

  settle(id: string, invoiceId: string, amount: number, reference: string) {
    const row = this.byId(id);
    if (!row || row.status !== "callback_received") return Promise.resolve(null);
    row.status = "verified";
    row.providerRefId = reference;
    this.paid.calls.push({ invoiceId, amount, reference });
    this.invoice.state = "paid";
    this.invoice.paidAmount = String(Number(this.invoice.paidAmount) + amount);
    return Promise.resolve({ attempt: row, invoice: { id: invoiceId, state: "paid" } });
  }

  resolveClinicId(authority: string) {
    const row = this.rows.find((r) => r.authority === authority && r.authority !== "");
    return Promise.resolve(row ? CLINIC_ID : null);
  }
}

function setup(overrides: { state?: string; total?: string; paidAmount?: string } = {}) {
  const invoice = {
    state: overrides.state ?? "issued",
    total: overrides.total ?? "125000",
    paidAmount: overrides.paidAmount ?? "0",
  };
  const paid = { calls: [] as Array<{ invoiceId: string; amount: number; reference: string }> };
  const billing = {
    getInvoice: vi.fn().mockResolvedValue({ id: "invoice-1", ...invoice }),
  } as unknown as BillingService;
  const gateway = {
    requestPayment: vi.fn().mockResolvedValue("https://sandbox.zarinpal.com/pg/StartPay/AUTH-1"),
    verifyPayment: vi.fn().mockResolvedValue({ verified: true, authority: "AUTH-1", refId: "REF-1" }),
  } as unknown as ZarinpalAdapter;
  const attempts = new FakeAttempts(invoice, paid);
  const service = new PaymentService(
    billing,
    attempts as unknown as PaymentAttemptsRepository,
    gateway,
  );
  return { attempts, billing, gateway, invoice, paid, service };
}

describe("PaymentService (B3: DB-backed state machine)", () => {
  it("opens a persisted attempt and returns the redirect data", async () => {
    const { service, gateway, attempts } = setup();
    await expect(service.start("invoice-1", "https://clinic/callback")).resolves.toMatchObject({
      state: "redirect",
      authority: "AUTH-1",
    });
    expect(gateway.requestPayment).toHaveBeenCalledWith("invoice-1", 125000, "https://clinic/callback");
    expect(attempts.rows).toHaveLength(1);
    expect(attempts.rows[0]).toMatchObject({ status: "started", authority: "AUTH-1", amount: 125000 });
  });

  it("reuses the stored redirect instead of minting a second authority", async () => {
    const { service, gateway, attempts } = setup();
    const first = await service.start("invoice-1");
    const second = await service.start("invoice-1");
    expect(second).toEqual(first);
    expect(gateway.requestPayment).toHaveBeenCalledOnce();
    expect(attempts.rows).toHaveLength(1);
  });

  it("refuses to start a payment for an invoice that is not issued", async () => {
    const { service, gateway } = setup({ state: "draft" });
    await expect(service.start("invoice-1")).rejects.toMatchObject({ status: 409 });
    expect(gateway.requestPayment).not.toHaveBeenCalled();
  });

  it("charges only the outstanding amount of a partially paid invoice", async () => {
    const { service, gateway } = setup({ state: "partially_paid", paidAmount: "25000" });
    await service.start("invoice-1");
    expect(gateway.requestPayment).toHaveBeenCalledWith("invoice-1", 100000, "");
  });

  it("verifies a successful callback and settles the invoice in one step", async () => {
    const { service, gateway, attempts, paid } = setup();
    await service.start("invoice-1");
    await expect(service.callback("invoice-1", "AUTH-1")).resolves.toMatchObject({
      state: "paid",
      reference: "REF-1",
    });
    expect(gateway.verifyPayment).toHaveBeenCalledWith("AUTH-1", 125000);
    expect(paid.calls).toEqual([{ invoiceId: "invoice-1", amount: 125000, reference: "REF-1" }]);
    expect(attempts.rows[0]).toMatchObject({ status: "verified", providerRefId: "REF-1" });
  });

  it("answers a duplicate callback from the row and never verifies twice", async () => {
    const { service, gateway, paid } = setup();
    await service.start("invoice-1");
    await service.callback("invoice-1", "AUTH-1");
    await expect(service.callback("invoice-1", "AUTH-1")).resolves.toMatchObject({ state: "paid" });
    expect(gateway.verifyPayment).toHaveBeenCalledOnce();
    expect(paid.calls).toHaveLength(1);
  });

  it("marks a cancelled callback failed without calling the provider", async () => {
    const { service, gateway, attempts, paid } = setup();
    await service.start("invoice-1");
    await expect(service.callback("invoice-1", "AUTH-1", "NOK")).resolves.toMatchObject({
      state: "failed",
      reason: "cancelled",
    });
    expect(gateway.verifyPayment).not.toHaveBeenCalled();
    expect(attempts.rows[0]).toMatchObject({ status: "failed", errorReason: "cancelled" });
    expect(paid.calls).toHaveLength(0);
  });

  it("does not pay an invoice the provider refused to verify", async () => {
    const { service, gateway, attempts, paid } = setup();
    gateway.verifyPayment = vi
      .fn()
      .mockResolvedValue({ verified: false, authority: "AUTH-1", reason: "amount-mismatch" });
    await service.start("invoice-1");
    await expect(service.callback("invoice-1", "AUTH-1")).resolves.toMatchObject({
      state: "failed",
      reason: "amount-mismatch",
    });
    expect(paid.calls).toHaveLength(0);
    expect(attempts.rows[0]).toMatchObject({ status: "failed", errorReason: "amount-mismatch" });
  });

  it("expires an attempt nobody came back for and refuses its callback", async () => {
    const { service, attempts } = setup();
    await service.start("invoice-1");
    attempts.rows[0]!.expiresAt = new Date(Date.now() - 1);
    await expect(service.callback("invoice-1", "AUTH-1")).rejects.toMatchObject({ status: 409 });
    expect(attempts.rows[0]).toMatchObject({ status: "expired" });
  });

  it("lets a new attempt start once the previous one expired", async () => {
    const { service, attempts, gateway } = setup();
    await service.start("invoice-1");
    attempts.rows[0]!.expiresAt = new Date(Date.now() - 1);
    await expect(service.start("invoice-1")).resolves.toMatchObject({ state: "redirect" });
    expect(attempts.rows).toHaveLength(2);
    expect(attempts.rows[0]).toMatchObject({ status: "expired" });
    expect(gateway.requestPayment).toHaveBeenCalledTimes(2);
  });

  it("rejects an unknown or tampered authority before touching the provider", async () => {
    const { service, gateway } = setup();
    await service.start("invoice-1");
    await expect(service.callback("invoice-1", "AUTH-TAMPERED")).rejects.toMatchObject({ status: 409 });
    expect(gateway.verifyPayment).not.toHaveBeenCalled();
  });

  it("never mints two authorities for concurrent starts", async () => {
    const { service, gateway, attempts } = setup();
    const results = await Promise.allSettled([service.start("invoice-1"), service.start("invoice-1")]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(gateway.requestPayment).toHaveBeenCalledOnce();
    expect(attempts.rows).toHaveLength(1);
  });

  it("frees the attempt when the provider request fails, so a retry can start a new one", async () => {
    const { service, gateway, attempts } = setup();
    gateway.requestPayment = vi.fn().mockRejectedValue(new Error("payment provider unreachable"));
    await expect(service.start("invoice-1")).rejects.toThrow("payment provider unreachable");
    expect(attempts.rows[0]).toMatchObject({ status: "failed", errorReason: "gateway-request-failed" });
  });

  it("propagates a provider error during verification and keeps the attempt claimable", async () => {
    const { service, gateway, attempts } = setup();
    await service.start("invoice-1");
    gateway.verifyPayment = vi.fn().mockRejectedValue(new Error("network unavailable"));
    await expect(service.callback("invoice-1", "AUTH-1")).rejects.toThrow("network unavailable");
    expect(attempts.rows[0]).toMatchObject({ status: "callback_received" });
  });

  it("enforces compare-and-set: a transition from the wrong state does not apply", async () => {
    const { service, attempts } = setup();
    await service.start("invoice-1");
    const id = attempts.rows[0]!.id;
    await expect(attempts.start(id, "AUTH-2", "https://sandbox.zarinpal.com/pg/StartPay/AUTH-2")).resolves.toBeNull();
    await expect(attempts.settle(id, "invoice-1", 125000, "REF-2")).resolves.toBeNull();
    expect(attempts.rows[0]).toMatchObject({ status: "started", authority: "AUTH-1" });
  });
});
