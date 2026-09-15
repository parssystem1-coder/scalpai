import { Inject, Injectable, Optional } from "@nestjs/common";
import { errors } from "@scalpai/shared";
import { ZarinpalAdapter, type PaymentResult } from "@scalpai/notify";
import { BillingService } from "./billing.service.js";
import { TenantScope, type TenantCtx } from "../tenancy/tenant.scope.js";

export const ZARINPAL_GATEWAY = "ZARINPAL_GATEWAY";

interface PendingPayment {
  readonly invoiceId: string;
  readonly amount: number;
  readonly authority: string;
  readonly expiresAt: number;
  readonly redirectUrl: string;
  readonly tenant: TenantCtx;
}

type PaymentInvoice = Awaited<ReturnType<BillingService["pay"]>>;
type CallbackResponse =
  | { readonly state: "failed"; readonly reason: string }
  | { readonly state: "paid"; readonly invoice: PaymentInvoice; readonly reference: string };
type StartResponse =
  | { readonly state: "paid"; readonly invoice: Awaited<ReturnType<BillingService["getInvoice"]>> }
  | { readonly state: "redirect"; readonly redirectUrl: string; readonly authority: string };

/** Coordinates the payment state machine without holding a database transaction across provider I/O. */
@Injectable()
export class PaymentService {
  private readonly pending = new Map<string, PendingPayment>();
  private readonly startsInFlight = new Map<string, Promise<StartResponse>>();
  private readonly callbacksInFlight = new Map<string, Promise<CallbackResponse>>();
  private readonly completedCallbacks = new Map<string, { readonly expiresAt: number; readonly response: CallbackResponse }>();

  constructor(
    private readonly billing: BillingService,
    private readonly scope: TenantScope,
    @Optional() @Inject(ZARINPAL_GATEWAY) private readonly gateway: ZarinpalAdapter = new ZarinpalAdapter(),
  ) {}

  async start(invoiceId: string, callbackUrl = process.env.ZARINPAL_CALLBACK_URL ?? ""): Promise<StartResponse> {
    const inFlight = this.startsInFlight.get(invoiceId);
    if (inFlight) return inFlight;

    const work = this.startPayment(invoiceId, callbackUrl);
    this.startsInFlight.set(invoiceId, work);
    try {
      return await work;
    } finally {
      this.startsInFlight.delete(invoiceId);
    }
  }

  private async startPayment(invoiceId: string, callbackUrl: string): Promise<StartResponse> {
    const invoice = await this.billing.getInvoice(invoiceId);
    if (invoice.state === "paid") return { state: "paid", invoice };
    if (invoice.state !== "issued" && invoice.state !== "partially_paid") {
      throw errors.conflict(`invoice ${invoiceId} is '${invoice.state}' and cannot start a payment`);
    }

    const existing = this.pending.get(invoiceId);
    if (existing && existing.expiresAt > Date.now()) {
      return { state: "redirect", redirectUrl: existing.redirectUrl, authority: existing.authority };
    }

    const total = Number(invoice.total);
    const paid = Number(invoice.paidAmount ?? 0);
    const amount = total - paid;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(paid) || amount <= 0) {
      throw errors.conflict("invoice has no valid outstanding payment amount");
    }

    const redirectUrl = await this.gateway.requestPayment(invoiceId, amount, callbackUrl);
    const authority = new URL(redirectUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    if (!authority) throw errors.conflict("payment gateway returned no authority");

    const pending: PendingPayment = {
      invoiceId,
      amount,
      authority,
      expiresAt: Date.now() + 15 * 60 * 1000,
      redirectUrl,
      tenant: this.scope.requireCtx(),
    };
    this.pending.set(invoiceId, pending);
    return { state: "redirect", redirectUrl, authority };
  }

  async callback(invoiceId: string, authority: string, status = "OK"): Promise<CallbackResponse> {
    const key = `${invoiceId}:${authority}`;
    const completed = this.completedCallbacks.get(key);
    if (completed && completed.expiresAt > Date.now()) return completed.response;
    if (completed) this.completedCallbacks.delete(key);

    const inFlight = this.callbacksInFlight.get(key);
    if (inFlight) return inFlight;

    const work = this.processCallback(invoiceId, authority, status, key);
    this.callbacksInFlight.set(key, work);
    try {
      return await work;
    } finally {
      this.callbacksInFlight.delete(key);
    }
  }

  private async processCallback(
    invoiceId: string,
    authority: string,
    status: string,
    key: string,
  ): Promise<CallbackResponse> {
    const payment = this.pending.get(invoiceId);
    if (!payment || payment.authority !== authority || payment.expiresAt <= Date.now()) {
      throw errors.conflict("درخواست پرداخت منقضی شده است");
    }
    if (status !== "OK") return { state: "failed", reason: "cancelled" };

    const result: PaymentResult = await this.gateway.verifyPayment(authority, payment.amount);
    if (!result.verified) return { state: "failed", reason: result.reason ?? "verification-failed" };

    const pay = () =>
      this.billing.pay(invoiceId, {
        amount: payment.amount,
        method: "gateway",
        reference: result.refId ?? authority,
      });
    const invoice = await TenantScope.runWith(payment.tenant, pay);
    const response: CallbackResponse = { state: "paid", invoice, reference: result.refId ?? authority };
    if (this.pending.get(invoiceId)?.authority === authority) this.pending.delete(invoiceId);
    this.completedCallbacks.set(key, { expiresAt: Date.now() + 15 * 60 * 1000, response });
    return response;
  }
}
