import { errors } from "@scalpai/shared";
import { envNumber } from "./state/kv.store.js";

/**
 * Bounded work admission — phase 8 (WEAKNESSES L4, ADR-0041).
 *
 * The rate limiter answers "how many requests per minute". It does NOT answer
 * "how many 50MB images may be decoding in this process at the same instant",
 * and that is the number that decides whether the box survives. Twenty accepted
 * uploads inside one window were twenty concurrent sharp pipelines, each holding
 * a full-size bitmap: comfortably an OOM on a 2GB container.
 *
 * So expensive work runs through a semaphore:
 *  - `permits` decode at once,
 *  - `maxQueue` wait their turn,
 *  - request `maxQueue + 1` is refused with 429 instead of being admitted into a
 *    queue that itself becomes the memory leak.
 */
export class Semaphore {
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    readonly permits: number,
    readonly maxQueue: number,
    private readonly label: string,
  ) {}

  get active(): number {
    return this.inFlight;
  }

  get queued(): number {
    return this.waiters.length;
  }

  /** `permits <= 0` disables the gate entirely (explicit opt-out, e.g. a CLI). */
  async acquire(): Promise<() => void> {
    if (this.permits <= 0) return () => undefined;
    if (this.inFlight < this.permits) {
      this.inFlight += 1;
      return this.releaser();
    }
    if (this.waiters.length >= this.maxQueue) {
      throw errors.tooManyRequests(`صف پردازش ${this.label} پر است؛ لطفاً کمی بعد دوباره تلاش کنید`);
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.inFlight += 1;
    return this.releaser();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return; // double release would hand out a permit twice
      released = true;
      this.inFlight -= 1;
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}

let imageGate: Semaphore | null = null;

/**
 * Process-wide gate for image decoding/encoding. Deliberately a module
 * singleton: the limit protects the PROCESS, so a per-request instance would
 * protect nothing.
 */
export function imageWorkGate(): Semaphore {
  if (!imageGate) {
    imageGate = new Semaphore(
      envNumber("IMAGE_MAX_CONCURRENCY", 2),
      envNumber("IMAGE_MAX_QUEUE", 16),
      "image",
    );
  }
  return imageGate;
}

/** Test hook: re-read the environment between cases. */
export function resetImageWorkGate(): void {
  imageGate = null;
}
