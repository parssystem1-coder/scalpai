import { Inject, Injectable, Optional } from "@nestjs/common";
import { errors } from "@scalpai/shared";
import { BillingError } from "@scalpai/db";
import { ZarinpalAdapter, type PaymentResult } from "@scalpai/notify";
import { BillingService } from "./billing.service.js";
import { PaymentAttemptsRepository } from "./payment-attempts.repository.js";
import { TenantScope } from "../tenancy/tenant.scope.js";

export const ZARINPAL_GATEWAY = "ZARINPAL_GATEWAY";

/**
 * شناسه سیستمی مسیر callback — همان قرارداد WebhookGuard. درگاه کاربر نیست،
 * ولی audit باید بداند که کدام مسیر ردیف را عوض کرده است.
 */
const PAYMENT_SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

type PaymentInvoice = Awaited<ReturnType<BillingService["pay"]>>;
type CallbackResponse =
  | { readonly state: "failed"; readonly reason: string }
  | { readonly state: "paid"; readonly invoice: PaymentInvoice; readonly reference: string };
type StartResponse =
  | { readonly state: "paid"; readonly invoice: Awaited<ReturnType<BillingService["getInvoice"]>> }
  | { readonly state: "redirect"; readonly redirectUrl: string; readonly authority: string };

/**
 * ماشین حالت پرداخت (بلاکر B3، جدول payment_attempts در 0021).
 *
 * قبلاً حالت در چهار Map درون‌حافظه بود:
 *   pending • startsInFlight • callbacksInFlight • completedCallbacks
 * و هر چهار دقیقاً همان چیزی بودند که ریویو فاز ۵AB رد کرد: ری‌استارت =
 * اقتدارِ گم‌شده، رپلیکای دوم = دو authority برای یک فاکتور، و callback موفقی که
 * جایی ذخیره نمی‌شد.
 *
 * ترتیب عمدی است و مهم:
 *
 *   start:    claim (تراکنش) → requestPayment (بی‌تراکنش) → started (تراکنش)
 *   callback: claim (تراکنش) → verifyPayment (بی‌تراکنش) → verified + پرداخت (یک تراکنش)
 *
 * تراکنش روی I/O درگاه باز نمی‌ماند، و authority پیش از رسیدن redirect به بیمار
 * commit می‌شود — پس بیمار نمی‌تواند پولی بدهد که ما authority اش را نداریم.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly billing: BillingService,
    private readonly attempts: PaymentAttemptsRepository,
    @Optional() @Inject(ZARINPAL_GATEWAY) private readonly gateway: ZarinpalAdapter = new ZarinpalAdapter(),
  ) {}

  async start(invoiceId: string, callbackUrl = process.env.ZARINPAL_CALLBACK_URL ?? ""): Promise<StartResponse> {
    const claim = await this.attempts.claim(invoiceId);

    if (claim.outcome === "missing") throw errors.notFound();
    if (claim.outcome === "paid") {
      return { state: "paid", invoice: await this.billing.getInvoice(invoiceId) };
    }
    if (claim.outcome === "unpayable") {
      throw errors.conflict(`invoice ${invoiceId} is '${claim.state}' and cannot start a payment`);
    }
    if (claim.outcome === "no_amount") {
      throw errors.conflict("invoice has no valid outstanding payment amount");
    }
    if (claim.outcome === "reused") {
      // همان authority قبلی. این جای «startsInFlight» را گرفته است و برخلاف آن،
      // بین رپلیکاها هم کار می‌کند.
      return { state: "redirect", redirectUrl: claim.attempt.redirectUrl ?? "", authority: claim.attempt.authority };
    }
    if (claim.outcome === "in_progress") {
      throw errors.conflict("یک درخواست پرداخت برای این فاکتور در جریان است");
    }

    const attempt = claim.attempt;
    let redirectUrl: string;
    try {
      redirectUrl = await this.gateway.requestPayment(invoiceId, attempt.amount, callbackUrl);
    } catch (err) {
      // تلاشی که درگاه قبولش نکرد نباید تا پایان TTL جای ایندکس یکتا را
      // اشغال کند — منشی باید بتواند بلافاصله دوباره تلاش کند.
      await this.release(attempt.id, "gateway-request-failed");
      throw err;
    }

    const authority = extractAuthority(redirectUrl);
    if (!authority) {
      await this.release(attempt.id, "no-authority");
      throw errors.conflict("payment gateway returned no authority");
    }

    const started = await this.attempts.start(attempt.id, authority, redirectUrl);
    if (!started) throw errors.conflict("وضعیت درخواست پرداخت تغییر کرده است");
    return { state: "redirect", redirectUrl, authority };
  }

  /**
   * بازگشت از درگاه. این مسیر هویت‌شده نیست، پس اول کلینیکِ صاحب authority
   * پیدا می‌شود و بعد همه‌ی کار داخل context همان کلینیک انجام می‌شود. قبلاً این
   * context از Map درون‌حافظه می‌آمد که با ری‌استارت خالی می‌شد.
   */
  async callback(invoiceId: string, authority: string, status = "OK"): Promise<CallbackResponse> {
    const clinicId = await this.attempts.resolveClinicId(authority);
    if (!clinicId) throw errors.conflict("درخواست پرداخت یافت نشد");
    return TenantScope.runWith({ clinicId, userId: PAYMENT_SYSTEM_USER_ID, role: "system" }, () =>
      this.settle(invoiceId, authority, status),
    );
  }

  private async settle(invoiceId: string, authority: string, status: string): Promise<CallbackResponse> {
    const claim = await this.attempts.receiveCallback(invoiceId, authority);

    if (claim.outcome === "unknown") throw errors.conflict("درخواست پرداخت یافت نشد");
    if (claim.outcome === "expired") throw errors.conflict("درخواست پرداخت منقضی شده است");
    if (claim.outcome === "in_progress") throw errors.conflict("پردازش این پرداخت در جریان است");

    // callback تکراری: پاسخ از ردیف می‌آید، نه از کش پانزده‌دقیقه‌ای حافظه.
    if (claim.outcome === "failed") {
      return { state: "failed", reason: claim.attempt.errorReason ?? "verification-failed" };
    }
    if (claim.outcome === "verified") {
      return {
        state: "paid",
        invoice: await this.billing.getInvoice(invoiceId),
        reference: claim.attempt.providerRefId ?? authority,
      };
    }

    const attempt = claim.attempt;
    if (status !== "OK") {
      await this.attempts.fail(attempt.id, "cancelled");
      return { state: "failed", reason: "cancelled" };
    }

    const result: PaymentResult = await this.gateway.verifyPayment(authority, attempt.amount);
    if (!result.verified) {
      const reason = result.reason ?? "verification-failed";
      await this.attempts.fail(attempt.id, reason);
      return { state: "failed", reason };
    }

    const reference = result.refId ?? authority;
    let settled: Awaited<ReturnType<PaymentAttemptsRepository["settle"]>>;
    try {
      settled = await this.attempts.settle(attempt.id, invoiceId, attempt.amount, reference);
    } catch (err) {
      // پول گرفته شده ولی فاکتور قبولش نمی‌کند (مانده وسط کار عوض شده).
      // تلاش failed می‌شود تا درگاه بی‌نهایت تلاش مجدد نکند، و ۴۰۹ می‌گوید
      // که این یک قاعده‌ی کاری است نه خرابی سرور — مورد برای تطبیق دستی می‌ماند.
      if (err instanceof BillingError) {
        await this.release(attempt.id, "invoice-rejected-payment");
        throw errors.conflict(err.message);
      }
      throw err;
    }
    if (!settled) throw errors.conflict("وضعیت این پرداخت پیش از تسویه تغییر کرده است");
    return { state: "paid", invoice: settled.invoice, reference };
  }

  /** بستن یک تلاش ناتمام. خطای این کار نباید خطای اصلی را بپوشاند. */
  private async release(id: string, reason: string): Promise<void> {
    try {
      await this.attempts.fail(id, reason);
    } catch {
      /* خطای اصلی مهم‌تر است؛ جاروی expireStale هم این ردیف را می‌بندد. */
    }
  }
}

/**
 * authority از مسیر redirect. خراب بودن URL پروایدر یک قاعده‌ی کاری است
 * (۴۰۹) نه یک ۵۰۰.
 */
function extractAuthority(redirectUrl: string): string {
  try {
    const last = new URL(redirectUrl).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last);
  } catch {
    return "";
  }
}
