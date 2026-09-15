import { Injectable } from "@nestjs/common";
import { errors } from "@scalpai/shared";
import { ZarinpalAdapter, type PaymentResult } from "@scalpai/notify";
import { BillingService } from "./billing.service.js";

interface PendingPayment { readonly invoiceId: string; readonly amount: number; readonly authority: string; readonly expiresAt: number; readonly redirectUrl: string }

/** Coordinates the payment state machine without holding a database transaction across provider I/O. */
@Injectable()
export class PaymentService {
  private readonly pending = new Map<string, PendingPayment>();
  private readonly gateway = new ZarinpalAdapter();
  constructor(private readonly billing: BillingService) {}

  async start(invoiceId: string, callbackUrl = process.env.ZARINPAL_CALLBACK_URL ?? "") {
    const invoice = await this.billing.getInvoice(invoiceId);
    if (invoice.state === "paid") return { state: "paid" as const, invoice };
    const existing = this.pending.get(invoiceId);
    if (existing && existing.expiresAt > Date.now()) return { state: "redirect" as const, redirectUrl: existing.redirectUrl, authority: existing.authority };
    const redirectUrl = await this.gateway.requestPayment(invoiceId, Number(invoice.total), callbackUrl);
    const authority = new URL(redirectUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    const pending: PendingPayment = { invoiceId, amount: Number(invoice.total), authority, expiresAt: Date.now() + 15 * 60 * 1000, redirectUrl };
    this.pending.set(invoiceId, pending);
    return { state: "redirect" as const, redirectUrl, authority };
  }

  async callback(invoiceId: string, authority: string, status = "OK") {
    const payment = this.pending.get(invoiceId);
    if (!payment || payment.authority !== authority || payment.expiresAt <= Date.now()) throw errors.conflict("درخواست پرداخت منقضی شده است");
    if (status !== "OK") return { state: "failed" as const, reason: "cancelled" };
    const result: PaymentResult = await this.gateway.verifyPayment(authority, payment.amount);
    if (!result.verified) return { state: "failed" as const, reason: result.reason ?? "verification-failed" };
    const invoice = await this.billing.pay(invoiceId, { amount: payment.amount, method: "gateway", reference: result.refId ?? authority });
    this.pending.delete(invoiceId);
    return { state: "paid" as const, invoice, reference: result.refId ?? authority };
  }
}
