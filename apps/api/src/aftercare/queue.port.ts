import { envNumber } from "../common/state/kv.store.js";

/**
 * پورتِ صف ورکر aftercare (فاز ۵a / ADR-0046).
 *
 * چرا پورت و نه مستقیماً BullMQ:
 *
 * BullMQ هنوز در این مخزن وابستگی نیست و package-lock.json آن را نمی‌شناسد.
 * افزودن یک پکیج به package.json بدون بازسازی lockfile، `npm ci` را می‌شکند —
 * یعنی کل CI، نه فقط این مادول. پس ورکر با یک پورت حرف می‌زند و دو درایور
 * دارد:
 *
 *   • `interval` (پیش‌فرض) — یک تایمر درون‌پروسسی. برای دیپلوی تک‌راپلیکا
 *     کافی است، چون خودِ برداشتن کار در دیتابیس و با SKIP LOCKED اتمیک است.
 *     چند راپلیکا هم همین را اجرا کنند، باز هم دو پیام نمی‌رود — فقط
 *     پرس‌وجوی بی‌حاصل بیشتر می‌شود.
 *   • `bullmq` — مادول در زمان اجرا با specifier غیرلیترال رزولو می‌شود، پس
 *     typecheck بدون نصب بودنش رد می‌شود و نبودنش در رانتایم یک خطای
 *     صریح می‌دهد نه یک ورکرِ بی‌صدا خاموش.
 *
 * حالت سوم عمداً وجود ندارد: «اگر BullMQ نبود، بی‌صدا برگرد به interval».
 * اپراتوری که درایور توزیع‌شده خواسته، باید بفهمد که نگرفته.
 */

export type AftercareTick = () => Promise<void>;

export interface AftercareQueuePort {
  readonly driver: string;
  start(tick: AftercareTick): Promise<void>;
  stop(): Promise<void>;
}

export class QueuePortError extends Error {
  constructor(message: string) {
    super(`aftercare-queue: ${message}`);
    this.name = "QueuePortError";
  }
}

export const AFTERCARE_QUEUE_NAME = "aftercare-due";

/** فاصله بیدار شدن. والد زمان‌بندی دیتابیس است، این فقط دقت سررسید است. */
export function tickIntervalMs(): number {
  return envNumber("AFTERCARE_TICK_MS", 60_000);
}

/**
 * درایور درون‌پروسسی. دو محافط دارد که معمولاً فراموش می‌شوند:
 *
 *   ۱) `unref()` — تایمر نباید خروج پروسه را نگه دارد، وگرنه SIGTERM در
 *      کوبرنتیز به kill اجباری تبدیل می‌شود.
 *   ۲) قفل هم‌پوشانی — اگر یک tick طولانی‌تر از فاصله طول بکشد، tick بعدی
 *      رد می‌شود. بدون آن، یک دیتابیس کند به یک توده‌ی tick موازی تبدیل
 *      می‌شود و خودش را بیشتر کند می‌کند.
 */
export class IntervalQueueDriver implements AftercareQueuePort {
  readonly driver = "interval";
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly intervalMs: number = tickIntervalMs(),
    private readonly onError: (err: Error) => void = () => {},
  ) {}

  start(tick: AftercareTick): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void tick()
        .catch((err: unknown) => this.onError(err instanceof Error ? err : new Error(String(err))))
        .finally(() => {
          this.running = false;
        });
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

/** حداقل چیزی که از bullmq لازم داریم. عمداً ریز است تا وابستگی سطحی بماند. */
interface BullModuleLike {
  Queue: new (name: string, opts: unknown) => {
    add: (name: string, data: unknown, opts: unknown) => Promise<unknown>;
    close: () => Promise<void>;
  };
  Worker: new (name: string, processor: () => Promise<void>, opts: unknown) => {
    on: (event: string, listener: (err: Error) => void) => void;
    close: () => Promise<void>;
  };
}

/**
 * درایور BullMQ. یک repeatable job می‌سازد و یک worker روی همان صف.
 *
 * `const specifier = "bullmq"` عمدی است: با specifier لیترال، تایپ‌چک می‌خواهد
 * مادول را رزولو کند و بیلد روی مخزنی که هنوز نصبش نکرده می‌شکند.
 */
export class BullQueueDriver implements AftercareQueuePort {
  readonly driver = "bullmq";
  private queue: InstanceType<BullModuleLike["Queue"]> | null = null;
  private worker: InstanceType<BullModuleLike["Worker"]> | null = null;

  constructor(
    private readonly redisUrl: string,
    private readonly intervalMs: number = tickIntervalMs(),
    private readonly onError: (err: Error) => void = () => {},
  ) {}

  async start(tick: AftercareTick): Promise<void> {
    const specifier = "bullmq";
    let mod: BullModuleLike;
    try {
      mod = await import(specifier) as BullModuleLike;
    } catch {
      throw new QueuePortError(
        "AFTERCARE_QUEUE_DRIVER=bullmq but the 'bullmq' package is not installed. " +
          "Run `npm install bullmq --workspace=@scalpai/app-api` (and commit the lockfile), " +
          "or unset the variable to use the in-process interval driver.",
      );
    }

    const connection = { connection: { url: this.redisUrl } };
    this.queue = new mod.Queue(AFTERCARE_QUEUE_NAME, connection);
    // jobId ثابت: ریستارت سرویس یک repeatable job دوم نمی‌سازد
    await this.queue.add(
      "tick",
      {},
      { repeat: { every: this.intervalMs }, jobId: AFTERCARE_QUEUE_NAME, removeOnComplete: 50, removeOnFail: 100 },
    );
    this.worker = new mod.Worker(AFTERCARE_QUEUE_NAME, async () => {
      await tick();
    }, connection);
    this.worker.on("failed", (err: Error) => this.onError(err));
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.worker = null;
    this.queue = null;
  }
}

/**
 * انتخاب درایور. مقدار ناشناخته خطاست نه پیش‌فرض: یک غلط املایی در متغیر
 * محیطی نباید به «همه چیز خوب است» ترجمه شود.
 */
export function resolveQueueDriver(
  env: NodeJS.ProcessEnv = process.env,
  onError: (err: Error) => void = () => {},
): AftercareQueuePort {
  const requested = (env.AFTERCARE_QUEUE_DRIVER ?? "interval").trim().toLowerCase();
  if (requested === "interval") return new IntervalQueueDriver(tickIntervalMs(), onError);
  if (requested === "bullmq") {
    const url = env.REDIS_URL?.trim();
    if (!url) throw new QueuePortError("AFTERCARE_QUEUE_DRIVER=bullmq requires REDIS_URL");
    return new BullQueueDriver(url, tickIntervalMs(), onError);
  }
  throw new QueuePortError(`unknown AFTERCARE_QUEUE_DRIVER '${requested}' (expected 'interval' or 'bullmq')`);
}
