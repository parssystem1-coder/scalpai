import { describe, expect, it, vi } from "vitest";
import { PaymentService } from "./payment.service.js";
import type { BillingService } from "./billing.service.js";
import type { ZarinpalAdapter } from "@scalpai/notify";
import type { TenantScope } from "../tenancy/tenant.scope.js";

const invoice = { id: "invoice-1", state: "issued", total: "125000", paidAmount: "0" };
function setup() {
  const billing = { getInvoice: vi.fn().mockResolvedValue(invoice), pay: vi.fn().mockResolvedValue({ ...invoice, state: "paid" }) } as unknown as BillingService;
  const gateway = { requestPayment: vi.fn().mockResolvedValue("https://sandbox.zarinpal.com/pg/StartPay/AUTH-1"), verifyPayment: vi.fn().mockResolvedValue({ verified: true, authority: "AUTH-1", refId: "REF-1" }) } as unknown as ZarinpalAdapter;
  const scope = { requireCtx: vi.fn().mockReturnValue({ clinicId: "clinic-1", userId: "user-1", role: "receptionist" }) } as unknown as TenantScope;
  return { billing, gateway, service: new PaymentService(billing, scope, gateway) };
}

describe("PaymentService", () => {
  it("starts a payment and returns redirect data", async () => {
    const { service, gateway } = setup();
    await expect(service.start("invoice-1", "https://clinic/callback")).resolves.toMatchObject({ state: "redirect", authority: "AUTH-1" });
    expect(gateway.requestPayment).toHaveBeenCalledWith("invoice-1", 125000, "https://clinic/callback");
  });
  it("verifies a successful Zarinpal callback and pays the invoice", async () => {
    const { service, billing, gateway } = setup();
    await service.start("invoice-1");
    await expect(service.callback("invoice-1", "AUTH-1")).resolves.toMatchObject({ state: "paid", reference: "REF-1" });
    expect(gateway.verifyPayment).toHaveBeenCalledWith("AUTH-1", 125000);
    expect(billing.pay).toHaveBeenCalledWith("invoice-1", { amount: 125000, method: "gateway", reference: "REF-1" });
  });
  it("returns the same result for a duplicate callback after payment", async () => {
    const { service } = setup();
    await service.start("invoice-1");
    await service.callback("invoice-1", "AUTH-1");
    await expect(service.callback("invoice-1", "AUTH-1")).resolves.toMatchObject({ state: "paid" });
  });
  it("rejects an expired authority", async () => {
    vi.useFakeTimers();
    try {
      const { service } = setup();
      await service.start("invoice-1");
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      await expect(service.callback("invoice-1", "AUTH-1")).rejects.toMatchObject({ status: 409 });
    } finally { vi.useRealTimers(); }
  });
  it("rejects an invalid authority/signature before provider verification", async () => {
    const { service, gateway } = setup();
    await service.start("invoice-1");
    await expect(service.callback("invoice-1", "AUTH-TAMPERED")).rejects.toMatchObject({ status: 409 });
    expect(gateway.verifyPayment).not.toHaveBeenCalled();
  });
  it("passes the invoice amount to verification and prevents an amount mismatch from being paid", async () => {
    const { service, billing, gateway } = setup();
    gateway.verifyPayment = vi.fn().mockResolvedValue({ verified: false, authority: "AUTH-1", reason: "amount-mismatch" });
    await service.start("invoice-1");
    await expect(service.callback("invoice-1", "AUTH-1")).resolves.toMatchObject({ state: "failed", reason: "amount-mismatch" });
    expect(billing.pay).not.toHaveBeenCalled();
    expect(gateway.verifyPayment).toHaveBeenCalledWith("AUTH-1", 125000);
  });
  it("propagates a network error during verification", async () => {
    const { service, gateway } = setup();
    gateway.verifyPayment = vi.fn().mockRejectedValue(new Error("network unavailable"));
    await service.start("invoice-1");
    await expect(service.callback("invoice-1", "AUTH-1")).rejects.toThrow("network unavailable");
  });
  it("does not request a second authority when start is retried idempotently", async () => {
    const { service, gateway } = setup();
    const first = await service.start("invoice-1");
    const second = await service.start("invoice-1");
    expect(second).toEqual(first);
    expect(gateway.requestPayment).toHaveBeenCalledOnce();
  });
  it("charges only the outstanding amount for a partially paid invoice", async () => {
    const { service, gateway, billing } = setup();
    billing.getInvoice = vi.fn().mockResolvedValue({ ...invoice, state: "partially_paid", paidAmount: "25000" });
    await service.start("invoice-1");
    expect(gateway.requestPayment).toHaveBeenCalledWith("invoice-1", 100000, "");
  });
});
