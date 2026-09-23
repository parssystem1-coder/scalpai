import { Controller, ForbiddenException, Get } from "@nestjs/common";
import { METERED_METRICS, type UsageReportDto } from "@scalpai/shared";
import { Roles } from "../common/roles.guard.js";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { MeteringService } from "./metering.service.js";

/**
 * موج ۳ (D10) — صفحه‌ی مصرف پلن.
 *
 * یک `GET` فقط‌خواندنی که هر سه شمارنده‌ی فاز ۵a را با سقف موثر پلن می‌دهد.
 * سردرگمی سهمیه دقیقاً از همین‌جا شروع می‌شد که شمارنده‌ای در دیتابیس هست ولی
 * هیچ مسیری owner را به آن نمی‌رساند؛ گیت DoD #4 هم به‌جای UI راهنما، یک ۴۰۳
 * خام می‌داد. این endpoint عمداً خواندنی است: مصرفی را نشان می‌دهد که واقعاً
 * اتفاق افتاده، نه پیش‌بینی؛ و «متر نمی‌شود» را با `limit: null` صادقانه
 * منتقل می‌کند. قرارداد بدنه `UsageReport` در shared است — وب همان را
 * consume می‌کند.
 */
@Controller("metering")
export class MeteringController {
  constructor(
    private metering: MeteringService,
    private scope: TenantScope,
  ) {}

  @Get("usage")
  @Roles("owner")
  async usage(): Promise<UsageReportDto> {
    const ctx = TenantScope.current();
    if (!ctx) throw new ForbiddenException();
    const usage = await this.scope.tx((tx) =>
      Promise.all(METERED_METRICS.map((metric) => this.metering.snapshot(tx, ctx.clinicId, metric))),
    );
    return { periodStart: usage[0]?.periodStart ?? "", usage };
  }
}
