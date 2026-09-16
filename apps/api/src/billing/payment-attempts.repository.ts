import { Injectable } from "@nestjs/common";
import {
  DbService,
  claimPaymentAttempt,
  claimPaymentCallback,
  expireStalePaymentAttempts,
  resolvePaymentAttemptClinic,
  settleVerifiedAttempt,
  transitionToFailed,
  transitionToStarted,
  type AttemptClaim,
  type CallbackClaim,
  type PaymentAttemptRecord,
} from "@scalpai/db";
import { TenantScope } from "../tenancy/tenant.scope.js";

/**
 * مرز تراکنش ماشین حالت پرداخت (بلاکر B3) — همان نقشی که BillingRepository
 * برای فاکتور دارد.
 *
 * دو نکته‌ی طراحی:
 *
 *   ۱) هر متد یک تراکنش کوتاه است و هیچ تراکنشی روی تماس با درگاه باز
 *      نمی‌ماند. تایم‌اوت ده‌ثانیه‌ای زرین‌پال نباید ردیف فاکتور را قفل نگه دارد
 *      و یک کانکشن استخر را بسوزاند.
 *
 *   ۲) `resolveClinicId` عمداً از `TenantScope` نمی‌گذرد. مسیر callback درگاه
 *      @Public() است، نه JWT دارد و نه امضای HMAC — پس هنوز clinicId ای وجود
 *      ندارد که بتوان با آن تراکنش RLS باز کرد. تابع SECURITY DEFINER
 *      مایگریشن 0021 فقط هویت کلینیک را می‌دهد و بقیه‌ی کار داخل تراکنش
 *      کلینیک‌محور انجام می‌شود.
 */
@Injectable()
export class PaymentAttemptsRepository {
  constructor(
    private readonly db: DbService,
    private readonly scope: TenantScope,
  ) {}

  /** وضعیت فاکتور + مانده + ساختِ یا بازاستفاده‌ی تلاش فعال، در یک تراکنش. */
  claim(invoiceId: string): Promise<AttemptClaim> {
    return this.scope.tx((tx, ctx) => claimPaymentAttempt(tx, ctx.clinicId, ctx.userId, { invoiceId }));
  }

  /** pending → started. پیش از اینکه redirect به بیمار برسد commit می‌شود. */
  start(id: string, authority: string, redirectUrl: string): Promise<PaymentAttemptRecord | null> {
    return this.scope.tx((tx, ctx) => transitionToStarted(tx, ctx.clinicId, id, authority, redirectUrl));
  }

  receiveCallback(invoiceId: string, authority: string): Promise<CallbackClaim> {
    return this.scope.tx((tx, ctx) =>
      claimPaymentCallback(tx, ctx.clinicId, ctx.userId, invoiceId, authority),
    );
  }

  fail(id: string, reason: string): Promise<PaymentAttemptRecord | null> {
    return this.scope.tx((tx, ctx) => transitionToFailed(tx, ctx.clinicId, ctx.userId, id, reason));
  }

  /** تأیید تلاش و پرداخت فاکتور — یک تراکنش، یک commit. */
  settle(id: string, invoiceId: string, amount: number, reference: string) {
    return this.scope.tx((tx, ctx) =>
      settleVerifiedAttempt(tx, ctx.clinicId, ctx.userId, {
        attemptId: id,
        invoiceId,
        amount,
        reference,
      }),
    );
  }

  /** جاروی تلاش‌هایی که کسی برنگشت (قابل فراخوانی از ops/worker). */
  expireStale(): Promise<PaymentAttemptRecord[]> {
    return this.scope.tx((tx, ctx) => expireStalePaymentAttempts(tx, ctx.clinicId));
  }

  /** تنها خوانش cross-tenant این مسیر: authority → clinic_id و نه چیز دیگر. */
  resolveClinicId(authority: string): Promise<string | null> {
    return this.db.withClient((tx) => resolvePaymentAttemptClinic(tx, authority));
  }
}
