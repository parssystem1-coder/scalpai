import { and, eq, sql } from "drizzle-orm";
import { usageCounters } from "../schema.js";
import type { Tx } from "../tenant.js";

/**
 * متر کردن مصرف فاز ۵a (ADR-0046).
 *
 * تنها درِ ورود به شمارنده‌های `upload_mb` / `analyses` / `messages_sent`.
 *
 * چرا یک فایل جدا و نه چند کلید در QUOTA_SPECS: متریک‌های فاز ۸ دروازه‌ی مجوز
 * دارند (QuotaGuard جلوی درخواست را می‌گیرد)، ولی این‌ها شمارشِ پس از واقعه
 * هم هستند: ۱۰۰ مگابایت آپلودِ انجام‌شده را نمی‌توان پس گرفت، فقط می‌توان
 * شمرد. قوطی کردنِ هر دو در یک سطح، در فاز ۸ دقیقاً همان باگی بود که H11
 * درباره‌اش نوشته شد.
 *
 * مکانیزم پشتِ کار همان `fn_usage_consume` فاز ۸ است: بررسی و افزایش در یک
 * دستور زیر قفل ردیف، و دوره از ساعت کلینیک نه UTC ثابت.
 */

export class MeteringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeteringError";
  }
}

export interface MeteredSpec {
  /** همان usage_counters.metric — باید مو به مو با METERED_METRICS در shared یکی باشد. */
  readonly metric: string;
  /** کلیدهای سقف در پلن، به ترتیب اولویت. اولین مقدار قابل استفاده می‌برد. */
  readonly limitKeys: readonly string[];
  /** واحدِ شمارنده، فقط برای پیام خطای قابل فهم. */
  readonly unit: string;
}

export const METERING_SPECS = {
  upload_mb: {
    metric: "upload_mb",
    limitKeys: ["upload_mb_per_month", "upload_mb"],
    unit: "MB",
  },
  analyses: {
    metric: "analyses",
    limitKeys: ["analyses_per_month", "analyses"],
    unit: "analysis",
  },
  messages_sent: {
    metric: "messages_sent",
    limitKeys: ["messages_per_month", "messages_sent"],
    unit: "message",
  },
} as const satisfies Record<string, MeteredSpec>;

export type MeteredMetricName = keyof typeof METERING_SPECS;

export function isMeteredMetricName(value: string): value is MeteredMetricName {
  return Object.prototype.hasOwnProperty.call(METERING_SPECS, value);
}

/**
 * سقف این متریک از روی محدودیت‌های پلن. `null` یعنی متر نمی‌شود.
 *
 * مقدار منفی، اعشاری یا غیرعددی = «متر نمی‌شود» و نه «صفر» — همان قاعده‌ی
 * resolveQuotaLimit. رد کردن همه‌ی پیام‌ها به‌خاطر یک ردیف خرابِ کاتالوگ،
 * خرابی بدتری است.
 */
export function resolveMeteredLimit(
  limits: Record<string, unknown> | null | undefined,
  metric: MeteredMetricName,
): number | null {
  if (!limits) return null;
  for (const key of METERING_SPECS[metric].limitKeys) {
    const raw = limits[key];
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) continue;
    return raw;
  }
  return null;
}

function rowsOf<T>(result: unknown): T[] {
  return (result as { rows?: T[] }).rows ?? [];
}

export interface MeterVerdict {
  allowed: boolean;
  metric: string;
  /** مقدار شمارنده پس از افزایش موفق، یا مقدار دست‌نخورده در صورت رد. */
  used: number;
  limit: number | null;
  periodStart: string;
}

/**
 * افزایش اتمیک یک شمارنده.
 *
 * باید در همان تراکنشی فراخوانی شود که کار را می‌نویسد: قفل تا COMMIT نگه
 * داشته می‌شود و دقیقاً همین چیز جفتِ «بررسی + ثبت» را تقسیم‌ناپذیر می‌کند.
 * متر کردن در یک تراکنش جدا، دوباره همان مسابقه است.
 */
export async function meterUsage(
  tx: Tx,
  clinicId: string,
  metric: MeteredMetricName,
  amount: number,
  limit: number | null,
): Promise<MeterVerdict> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new MeteringError("metered amount must be a non-negative integer");
  }
  const spec = METERING_SPECS[metric];
  const res = await tx.execute(sql`
    SELECT allowed, used::bigint AS used, period_start::text AS period_start
      FROM fn_usage_consume(${clinicId}::uuid, ${spec.metric}, ${amount}::bigint, ${limit}::bigint)
  `);
  const row = rowsOf<{ allowed: boolean; used: string | number; period_start: string }>(res)[0];
  if (!row) throw new MeteringError(`metering returned no verdict for '${spec.metric}'`);
  return {
    allowed: row.allowed === true,
    metric: spec.metric,
    used: Number(row.used),
    limit,
    periodStart: row.period_start,
  };
}

/**
 * پس دادن یک واحد. پیامی که پروایدر رد کرد، سهمیه را نباید بسوزاند —
 * همان دلیلی که releaseQuota برای آپلود ردشده وجود دارد.
 */
export async function releaseUsage(
  tx: Tx,
  clinicId: string,
  metric: MeteredMetricName,
  amount: number,
): Promise<number> {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new MeteringError("metered amount must be a non-negative integer");
  }
  const spec = METERING_SPECS[metric];
  const res = await tx.execute(
    sql`SELECT fn_usage_release(${clinicId}::uuid, ${spec.metric}, ${amount}::bigint)::bigint AS value`,
  );
  return Number(rowsOf<{ value: string | number }>(res)[0]?.value ?? 0);
}

/** خواندن فقط‌خواندنی یک شمارنده در دوره جاری کلینیک. */
export async function peekUsage(tx: Tx, clinicId: string, metric: MeteredMetricName): Promise<number> {
  const spec = METERING_SPECS[metric];
  const period = await tx.execute(
    sql`SELECT fn_clinic_period_start(${clinicId}::uuid)::text AS period_start`,
  );
  const periodStart = rowsOf<{ period_start: string }>(period)[0]?.period_start;
  if (!periodStart) throw new MeteringError("metering period could not be resolved for this clinic");
  const rows = await tx
    .select({ value: usageCounters.value })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.clinicId, clinicId),
        eq(usageCounters.metric, spec.metric),
        eq(usageCounters.periodStart, periodStart),
      ),
    )
    .limit(1);
  return rows[0]?.value ?? 0;
}

/**
 * تبدیل بایت به مگابایت، با گرد کردن به بالا و حداقل ۱.
 *
 * گرد کردن به بالا عمدی است: با Math.floor، هر فایل زیر یک مگابایت صفر متر
 * می‌شود و یک کلینیک می‌تواند بی‌نهایت تمبنیل بفرستد و هیچ سقفی را لمس
 * نکند.
 */
export function bytesToMeteredMb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.max(1, Math.ceil(bytes / (1024 * 1024)));
}
