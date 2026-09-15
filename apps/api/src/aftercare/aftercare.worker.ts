import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { DbService, listDueClinics, type DueClinic } from "@scalpai/db";
import { scrubForLog } from "@scalpai/shared";
import { metrics } from "../common/metrics.js";
import { envNumber } from "../common/state/kv.store.js";
import { TenantScope, type TenantCtx } from "../tenancy/tenant.scope.js";
import { AftercareService } from "./aftercare.service.js";
import { resolveQueueDriver, type AftercareQueuePort } from "./queue.port.js";

/**
 * ورکر aftercare (فاز ۵a / ADR-0046).
 *
 * چند تصمیم که موقع ریویو مهم اند:
 *
 *   ۱) پیش‌فرض خاموش است (`AFTERCARE_WORKER_ENABLED`). چند راپلیکای وب و یک
 *      راپلیکای ورکر، الگوی معمول دیپلوی است؛ درست بودن به این وابسته
 *      نیست (SKIP LOCKED هر دو حالت را پوشش می‌دهد)، ولی غافلگیر شدن باز
 *      غافلگیر شدن است.
 *
 *   ۲) خطای یک کلینیک، تکلیف بقیه را تعیین نمی‌کند. هر کلینیک درون scope و
 *      try/catch خودش اجرا می‌شود. یک قالب خراب در یک کلینیک، نباید پیگیری
 *      همه‌ی کلینیک‌های دیگر را متوقف کند.
 *
 *   ۳) همه‌ی خطاها از `scrubForLog` می‌گذرند. پیام خطای یک پروایدر پیامک
 *      خیلی راحت می‌تواند شماره مخاطب را برگرداند.
 *
 *   ۴) کانتکست tenant با `userId: ""` ساخته می‌شود. این عمدی است:
 *      `withTenant` وقتی userId تهی باشد `app.user_id` را ست نمی‌کند، پس هیچ
 *      تریگری نمی‌خواهد یک رشته‌ی غیر-uuid مانند "system" را cast کند. کارِ
 *      خودکار کاربر ندارد و وانمود کردنِ یک کاربر، audit را دروغگو می‌کند.
 */
@Injectable()
export class AftercareWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private queue: AftercareQueuePort | null = null;

  constructor(
    private db: DbService,
    private service: AftercareService,
  ) {}

  static isEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return (env.AFTERCARE_WORKER_ENABLED ?? "").trim().toLowerCase() === "true";
  }

  private clinicsPerTick(): number {
    return envNumber("AFTERCARE_CLINICS_PER_TICK", 200);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!AftercareWorker.isEnabled()) return;
    this.queue = resolveQueueDriver(process.env, (err) => this.report("tick", err));
    await this.queue.start(() => this.tick());
    metrics.counter("scalpai_aftercare_worker_started_total", { driver: this.queue.driver });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.stop();
    this.queue = null;
  }

  /**
   * یک دور: کدام کلینیک‌ها کار دارند، بعد هر کدام درون مرز خودش.
 *
   * فهرست کلینیک از `withClient` می‌آید (بدون app.clinic_id) و از دل یک تابع
   * SECURITY DEFINER که فقط هویت کلینیک می‌دهد. هر چیز دیگری درون
   * `TenantScope.runWith` و RLS کامل اجرا می‌شود.
   */
  async tick(): Promise<void> {
    const clinics = await this.db.withClient((tx) => listDueClinics(tx, this.clinicsPerTick()));
    if (clinics.length === 0) return;

    let handled = 0;
    for (const clinic of clinics) {
      try {
        handled += await this.runClinic(clinic);
      } catch (err) {
        // یک کلینیک خراب، پیگیری بقیه را نباید زمین بزند
        this.report("clinic", err instanceof Error ? err : new Error(String(err)));
      }
    }
    metrics.counter("scalpai_aftercare_ticks_total", { clinics: String(clinics.length) });
    if (handled > 0) metrics.counter("scalpai_aftercare_steps_total", { handled: String(handled) });
  }

  private runClinic(clinic: DueClinic): Promise<number> {
    const ctx: TenantCtx = { clinicId: clinic.clinicId, userId: "", role: "system" };
    return TenantScope.runWith(ctx, () => this.service.runDue(ctx, clinic.name));
  }

  /** هیچ خطایی خام لاگ نمی‌شود: پیام پروایدر می‌تواند شماره داخلش باشد. */
  private report(stage: string, err: Error): void {
    metrics.counter("scalpai_aftercare_errors_total", { stage });
    console.error("aftercare worker error", { stage, error: scrubForLog(err) });
  }
}
