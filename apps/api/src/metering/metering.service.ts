import { Injectable } from "@nestjs/common";
import {
  bytesToMeteredMb,
  meterUsage,
  peekMetered,
  releaseUsage,
  resolveMeteredLimit,
  type MeterVerdict,
  type MeteredMetricName,
  type Tx,
} from "@scalpai/db";
import { EntitlementService } from "../entitlements/entitlement.service.js";
import { metrics } from "../common/metrics.js";

/**
 * متر کردن مصرف فاز ۵a (ADR-0046) — upload_mb، analyses، messages_sent.
 *
 * دو نکته‌ی طراحی که عمدی اند:
 *
 *   ۱) همه‌ی متدها `tx` می‌گیرند و خودشان تراکنش باز نمی‌کنند. قفلِ ردیف
 *      شمارنده باید در همان COMMITی آزاد شود که کار را می‌نویسد؛ متر کردن
 *      در یک تراکنش جدا، همان مسابقه‌ای است که فاز ۸ (H11) بست.
 *
 *   ۲) «متر نمی‌شود» و «سقف صفر» دو چیز متفاوتند. پلنی که کلید messages را
 *      ندارد، پیام را محدود نکرده — مطلقاً ممنوع نکرده. تفسیر دوم، کل
 *      aftercare را برای هر کلینیکی که کاتالوگش به‌روز نیست خاموش می‌کند.
 */
@Injectable()
export class MeteringService {
  constructor(private entitlements: EntitlementService) {}

  /** سقف این متریک برای این کلینیک. `null` = متر می‌شود ولی محدود نیست. */
  async limitFor(clinicId: string, metric: MeteredMetricName): Promise<number | null> {
    const entitlement = await this.entitlements.resolve(clinicId);
    const limits = (entitlement as { limits?: Record<string, unknown> } | null)?.limits ?? null;
    return resolveMeteredLimit(limits, metric);
  }

  /**
   * شمردن یک واقعه و برگرداندن حکم. فراخوان خودش تصمیم می‌گیرد با حکم
   * چه کند — متر کردن یک آپلودِ انجام‌شده نباید درخواست را بشکند، ولی رد
   * شدنِ messages_sent باید جلوی ارسال را بگیرد. یک تابع، دو معنای متفاوت،
   * پس تفسیر در محل مصرف می‌ماند.
   */
  async count(
    tx: Tx,
    clinicId: string,
    metric: MeteredMetricName,
    amount = 1,
  ): Promise<MeterVerdict> {
    const limit = await this.limitFor(clinicId, metric);
    const verdict = await meterUsage(tx, clinicId, metric, amount, limit);
    metrics.counter("scalpai_metered_total", {
      metric: verdict.metric,
      outcome: verdict.allowed ? "allowed" : "refused",
    });
    return verdict;
  }

  /** پس دادن واحدِ کاری که انجام نشد (پیامی که پروایدر رد کرد). */
  async refund(tx: Tx, clinicId: string, metric: MeteredMetricName, amount = 1): Promise<void> {
    await releaseUsage(tx, clinicId, metric, amount);
    metrics.counter("scalpai_metered_total", { metric, outcome: "refunded" });
  }

  /** مصرف دوره‌ی جاری به‌همراه سقفِ موثر — همان چیزی که صفحه مصرف لازم دارد. */
  async snapshot(
    tx: Tx,
    clinicId: string,
    metric: MeteredMetricName,
  ): Promise<{ metric: MeteredMetricName; used: number; limit: number | null; periodStart: string }> {
    const [snap, limit] = await Promise.all([
      peekMetered(tx, clinicId, metric),
      this.limitFor(clinicId, metric),
    ]);
    return { metric, used: snap.used, limit, periodStart: snap.periodStart };
  }

  /**
   * شمردن حجم آپلود برحسب مگابایت.
   *
   * گرد کردن به بالا و حداقل ۱: با گرد کردن به پایین، هر فایل زیر یک مگابایت
   * صفر متر می‌شود و هزار تمبنیل هم صفر می‌ماند.
   */
  async countUploadBytes(tx: Tx, clinicId: string, bytes: number): Promise<MeterVerdict> {
    return this.count(tx, clinicId, "upload_mb", bytesToMeteredMb(bytes));
  }
}
