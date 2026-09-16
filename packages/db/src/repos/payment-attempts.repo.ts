import { and, desc, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import { paymentAttempts } from "../schema.js";
import { appendAudit } from "./core.repo.js";
import { getInvoice, payInvoice } from "./billing.repo.js";
import type { Tx } from "../tenant.js";

/**
 * تلاش‌های پرداخت — لایه داده (بلاکر B3، مایگریشن 0021).
 *
 * این فایل جای چهار Map درون‌حافظه‌ی PaymentService را می‌گیرد. سه قاعده‌ی
 * مرکزی که هر تغییری در این فایل باید حفظشان کند:
 *
 *   ۱) هر گذارِ حالت compare-and-set است: شرط `status = <حالت قبلی>` داخل
 *      همان UPDATE می‌آید. خواندن و بعد نوشتن، یعنی دو رپلیکا می‌توانند هر دو
 *      یک تلاش را verify کنند و پرداخت دو بار روی فاکتور بنشیند.
 *
 *   ۲) یکتاییِ «یک تلاش فعال برای هر فاکتور» کار دیتابیس است نه کد. کد فقط
 *      ON CONFLICT DO NOTHING می‌زند و اگر ردیفی برنگشت، برنده را می‌خواند.
 *      (خطای 23505 تراکنش را abort می‌کند؛ با خطا نمی‌توان ادامه داد.)
 *
 *   ۳) تأییدِ تلاش و پرداختِ فاکتور در یک تراکنش commit می‌شوند
 *      (`settleVerifiedAttempt`). دو تراکنش جدا یعنی پنجره‌ای که در آن پول از
 *      حساب بیمار رفته، تلاش verified است و فاکتور هنوز پرداخت‌نشده.
 *
 * و یک قاعده‌ی منفی: هیچ تابعی در این فایل با پروایدر حرف نمی‌زند. تراکنش
 * روی I/O شبکه باز نمی‌ماند — تایم‌اوت درگاه نباید ردیف فاکتور را قفل کند.
 */

/** عمر یک authority. بیشتر از این، پرداخت درگاه هم منقضی است. */
export const PAYMENT_ATTEMPT_TTL_MS = 15 * 60 * 1000;

export type PaymentAttemptStatus =
  | "pending"
  | "started"
  | "callback_received"
  | "verified"
  | "failed"
  | "expired";

/** حالت‌های پایانی: هیچ گذاری از آن‌ها بیرون نمی‌رود. */
const TERMINAL: string[] = ["verified", "failed", "expired"];
/** حالت‌هایی که هنوز منتظر پروایدرند. */
const OPEN: string[] = ["pending", "started"];

export class PaymentAttemptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentAttemptError";
  }
}

export interface PaymentAttemptRecord {
  id: string;
  clinicId: string;
  invoiceId: string;
  authority: string;
  amount: number;
  redirectUrl: string | null;
  status: string;
  provider: string;
  providerRefId: string | null;
  errorReason: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = {
  id: paymentAttempts.id,
  clinicId: paymentAttempts.clinicId,
  invoiceId: paymentAttempts.invoiceId,
  authority: paymentAttempts.authority,
  amount: paymentAttempts.amount,
  redirectUrl: paymentAttempts.redirectUrl,
  status: paymentAttempts.status,
  provider: paymentAttempts.provider,
  providerRefId: paymentAttempts.providerRefId,
  errorReason: paymentAttempts.errorReason,
  expiresAt: paymentAttempts.expiresAt,
  createdAt: paymentAttempts.createdAt,
  updatedAt: paymentAttempts.updatedAt,
} as const;

/** numeric در درایور pg رشته برمی‌گرداند؛ ریال کسر ندارد. */
function money(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/* ══ خواندن ════════════════════════════════════════════════ */

/** تلاش متناظر یک authority — در هر حالتی، برای پاسخ به callback تکراری. */
export async function findAttemptByAuthority(
  tx: Tx,
  clinicId: string,
  authority: string,
): Promise<PaymentAttemptRecord | null> {
  if (authority.trim().length === 0) return null;
  const rows = await tx
    .select(COLUMNS)
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.clinicId, clinicId),
        eq(paymentAttempts.authority, authority),
        isNull(paymentAttempts.deletedAt),
      ),
    )
    .orderBy(desc(paymentAttempts.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** تلاش فعال (غیرپایانی) یک فاکتور — همان ردیفی که ایندکس یکتا نگه می‌دارد. */
export async function findActiveAttemptByInvoice(
  tx: Tx,
  clinicId: string,
  invoiceId: string,
): Promise<PaymentAttemptRecord | null> {
  const rows = await tx
    .select(COLUMNS)
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.clinicId, clinicId),
        eq(paymentAttempts.invoiceId, invoiceId),
        notInArray(paymentAttempts.status, TERMINAL),
        isNull(paymentAttempts.deletedAt),
      ),
    )
    .orderBy(desc(paymentAttempts.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * authority → clinic_id، از تابع SECURITY DEFINER مایگریشن 0021.
 *
 * تنها خوانش cross-tenant مسیر پرداخت: مسیر callback هویت‌شده نیست و بدون
 * clinic_id نمی‌تواند تراکنش RLS باز کند. چیزی جز هویت کلینیک برنمی‌گردد.
 */
export async function resolvePaymentAttemptClinic(tx: Tx, authority: string): Promise<string | null> {
  if (authority.trim().length === 0) return null;
  const res = await tx.execute(sql`SELECT fn_payment_attempt_clinic(${authority}) AS clinic_id`);
  const row = ((res as unknown as { rows?: Array<{ clinic_id: string | null }> }).rows ?? [])[0];
  return row?.clinic_id ?? null;
}

/* ══ ساخت و ادعا ═══════════════════════════════════════════ */

export async function createPendingAttempt(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  input: { invoiceId: string; amount: number; ttlMs?: number },
): Promise<PaymentAttemptRecord | null> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new PaymentAttemptError("payment attempt amount must be a positive integer in rials");
  }
  const ttl = input.ttlMs ?? PAYMENT_ATTEMPT_TTL_MS;
  const rows = await tx
    .insert(paymentAttempts)
    .values({
      clinicId,
      invoiceId: input.invoiceId,
      authority: "",
      amount: input.amount,
      status: "pending",
      expiresAt: new Date(Date.now() + ttl),
    })
    .onConflictDoNothing()
    .returning(COLUMNS);
  const row = rows[0];
  if (!row) return null;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "payment.attempt_open",
    entity: "payment_attempt",
    entityId: row.id,
    meta: { invoiceId: input.invoiceId, amount: input.amount, provider: row.provider },
  });
  return row;
}

export type AttemptClaim =
  | { outcome: "missing" }
  | { outcome: "paid" }
  | { outcome: "unpayable"; state: string }
  | { outcome: "no_amount" }
  | { outcome: "created"; attempt: PaymentAttemptRecord }
  | { outcome: "reused"; attempt: PaymentAttemptRecord }
  | { outcome: "in_progress"; attempt: PaymentAttemptRecord | null };

/**
 * ادعای حق شروع پرداخت برای یک فاکتور — یک تراکنش، بدون تماس با پروایدر.
 *
 * وضعیت فاکتور، مبلغ مانده، انقضای تلاش قبلی و ساخت ردیف تازه با هم commit
 * می‌شوند؛ وگرنه دو درخواست همزمان می‌توانند هر دو مانده را «کامل» ببینند.
 *
 *   reused      — تلاش زنده‌ای با redirect آماده هست: همان را برگردان
 *   in_progress — تلاشی هست ولی هنوز redirect ندارد (پروایدر در راه است)
 *   created     — ردیف pending ساخته شد؛ حالا و فقط حالا سراغ پروایدر برو
 */
export async function claimPaymentAttempt(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  input: { invoiceId: string; ttlMs?: number },
): Promise<AttemptClaim> {
  const invoice = await getInvoice(tx, clinicId, input.invoiceId);
  if (!invoice) return { outcome: "missing" };
  if (invoice.state === "paid") return { outcome: "paid" };
  if (invoice.state !== "issued" && invoice.state !== "partially_paid") {
    return { outcome: "unpayable", state: invoice.state };
  }

  const total = money(invoice.total);
  const paid = money(invoice.paidAmount);
  const amount = total - paid;
  if (!Number.isSafeInteger(amount) || amount <= 0) return { outcome: "no_amount" };

  const active = await findActiveAttemptByInvoice(tx, clinicId, input.invoiceId);
  if (active) {
    if (active.expiresAt.getTime() > Date.now()) {
      // مبلغِ تلاش زنده باید همان مانده باشد؛ وگرنه verify روی مبلغ می‌شکند و
      // بهتر است همان‌جا 409 بگیریم تا اینکه بیمار به درگاهِ مبلغ اشتباه برود.
      if (active.status === "started" && active.redirectUrl && active.amount === amount) {
        return { outcome: "reused", attempt: active };
      }
      return { outcome: "in_progress", attempt: active };
    }
    await markExpired(tx, clinicId, userId, active.id);
  }

  const created = await createPendingAttempt(tx, clinicId, userId, {
    invoiceId: input.invoiceId,
    amount,
    ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs }),
  });
  if (created) return { outcome: "created", attempt: created };

  // ایندکس یکتا ما را رد کرد: یک درخواست همزمان برنده شده است.
  const winner = await findActiveAttemptByInvoice(tx, clinicId, input.invoiceId);
  if (winner && winner.status === "started" && winner.redirectUrl && winner.amount === amount) {
    return { outcome: "reused", attempt: winner };
  }
  return { outcome: "in_progress", attempt: winner };
}

/* ══ گذارها (همه compare-and-set) ═════════════════════════════ */

/** pending → started. authority و redirect پیش از رسیدن به بیمار ثبت می‌شوند. */
export async function transitionToStarted(
  tx: Tx,
  clinicId: string,
  id: string,
  authority: string,
  redirectUrl: string,
): Promise<PaymentAttemptRecord | null> {
  if (authority.trim().length === 0) {
    throw new PaymentAttemptError("cannot start a payment attempt without an authority");
  }
  const rows = await tx
    .update(paymentAttempts)
    .set({ status: "started", authority, redirectUrl, updatedAt: sql`now()` })
    .where(
      and(
        eq(paymentAttempts.clinicId, clinicId),
        eq(paymentAttempts.id, id),
        eq(paymentAttempts.status, "pending"),
        isNull(paymentAttempts.deletedAt),
      ),
    )
    .returning(COLUMNS);
  return rows[0] ?? null;
}

/** pending | started → callback_received. برنده‌ی این UPDATE حق verify دارد و بس. */
export async function transitionToCallbackReceived(
  tx: Tx,
  clinicId: string,
  id: string,
): Promise<PaymentAttemptRecord | null> {
  const rows = await tx
    .update(paymentAttempts)
    .set({ status: "callback_received", updatedAt: sql`now()` })
    .where(
      and(
        eq(paymentAttempts.clinicId, clinicId),
        eq(paymentAttempts.id, id),
        inArray(paymentAttempts.status, OPEN),
        isNull(paymentAttempts.deletedAt),
      ),
    )
    .returning(COLUMNS);
  return rows[0] ?? null;
}

/** callback_received → verified. */
export async function transitionToVerified(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  id: string,
  providerRefId: string,
): Promise<PaymentAttemptRecord | null> {
  const rows = await tx
    .update(paymentAttempts)
    .set({ status: "verified", providerRefId, errorReason: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(paymentAttempts.clinicId, clinicId),
        eq(paymentAttempts.id, id),
        eq(paymentAttempts.status, "callback_received"),
        isNull(paymentAttempts.deletedAt),
      ),
    )
    .returning(COLUMNS);
  const row = rows[0];
  if (!row) return null;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "payment.attempt_verified",
    entity: "payment_attempt",
    entityId: row.id,
    meta: { invoiceId: row.invoiceId, amount: row.amount, provider: row.provider },
  });
  return row;
}

/** هر حالت غیرپایانی → failed. دلیل ذخیره می‌شود تا پاسخ callbackِ تکراری همان بماند. */
export async function transitionToFailed(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  id: string,
  reason: string,
): Promise<PaymentAttemptRecord | null> {
  const rows = await tx
    .update(paymentAttempts)
    .set({ status: "failed", errorReason: reason.slice(0, 300), updatedAt: sql`now()` })
    .where(
      and(
        eq(paymentAttempts.clinicId, clinicId),
        eq(paymentAttempts.id, id),
        notInArray(paymentAttempts.status, TERMINAL),
        isNull(paymentAttempts.deletedAt),
      ),
    )
    .returning(COLUMNS);
  const row = rows[0];
  if (!row) return null;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "payment.attempt_failed",
    entity: "payment_attempt",
    entityId: row.id,
    meta: { invoiceId: row.invoiceId, amount: row.amount, reason: row.errorReason },
  });
  return row;
}

/** pending | started → expired. انقضا تنبل است: روی خواندن اعمال می‌شود. */
export async function markExpired(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  id: string,
): Promise<PaymentAttemptRecord | null> {
  const rows = await tx
    .update(paymentAttempts)
    .set({ status: "expired", errorReason: "expired", updatedAt: sql`now()` })
    .where(
      and(
        eq(paymentAttempts.clinicId, clinicId),
        eq(paymentAttempts.id, id),
        inArray(paymentAttempts.status, OPEN),
        isNull(paymentAttempts.deletedAt),
      ),
    )
    .returning(COLUMNS);
  const row = rows[0];
  if (!row) return null;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "payment.attempt_expired",
    entity: "payment_attempt",
    entityId: row.id,
    meta: { invoiceId: row.invoiceId, amount: row.amount },
  });
  return row;
}

/**
 * جاروی تلاش‌هایی که کسی برنگشت. انقضای تنبل فقط ردیفی را می‌بندد که کسی
 * سراغش آمده؛ بدون این جارو، فاکتوری که بیمار وسط پرداخت رهایش کرد تا پایان
 * TTL جای ایندکس یکتا را اشغال می‌کند.
 */
export async function expireStalePaymentAttempts(
  tx: Tx,
  clinicId: string,
): Promise<PaymentAttemptRecord[]> {
  return tx
    .update(paymentAttempts)
    .set({ status: "expired", errorReason: "expired", updatedAt: sql`now()` })
    .where(
      and(
        eq(paymentAttempts.clinicId, clinicId),
        inArray(paymentAttempts.status, OPEN),
        lt(paymentAttempts.expiresAt, sql`now()`),
        isNull(paymentAttempts.deletedAt),
      ),
    )
    .returning(COLUMNS);
}

/* ══ ادعای callback ═════════════════════════════════════════ */

export type CallbackClaim =
  | { outcome: "unknown" }
  | { outcome: "expired"; attempt: PaymentAttemptRecord }
  | { outcome: "verified"; attempt: PaymentAttemptRecord }
  | { outcome: "failed"; attempt: PaymentAttemptRecord }
  | { outcome: "in_progress"; attempt: PaymentAttemptRecord }
  | { outcome: "claimed"; attempt: PaymentAttemptRecord };

/**
 * ورود یک callback: پیدا کردن تلاش، انقضای تنبل و گذار به callback_received.
 *
 * حالت‌های پایانی همان‌جا برگردانده می‌شوند و همین است که جای
 * `completedCallbacks` را می‌گیرد: پاسخِ یک callbackِ تکراری از ردیف دیتابیس
 * می‌آید نه از کشِ پانزده‌دقیقه‌ایِ حافظه، پس ری‌استارت آن را پاک نمی‌کند.
 */
export async function claimPaymentCallback(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  invoiceId: string,
  authority: string,
): Promise<CallbackClaim> {
  const attempt = await findAttemptByAuthority(tx, clinicId, authority);
  if (!attempt || attempt.invoiceId !== invoiceId) return { outcome: "unknown" };
  if (attempt.status === "verified") return { outcome: "verified", attempt };
  if (attempt.status === "failed") return { outcome: "failed", attempt };
  if (attempt.status === "expired") return { outcome: "expired", attempt };
  if (attempt.expiresAt.getTime() <= Date.now()) {
    const expired = await markExpired(tx, clinicId, userId, attempt.id);
    return { outcome: "expired", attempt: expired ?? attempt };
  }
  const claimed = await transitionToCallbackReceived(tx, clinicId, attempt.id);
  if (!claimed) return { outcome: "in_progress", attempt };
  return { outcome: "claimed", attempt: claimed };
}

/* ══ تسویه ═════════════════════════════════════════════════ */

/**
 * callback_received → verified و پرداخت فاکتور، در یک تراکنش.
 *
 * اگر دو تراکنش جدا بودند، یک خطای بین آن‌ها تلاشی verified و فاکتوری
 * پرداخت‌نشده باقی می‌گذاشت — دقیقاً همان چیزی که B3 درباره‌اش هشدار داد.
 * اگر payInvoice یک قاعده‌ی کاری را رد کند (`BillingError`)، کل تراکنش
 * برمی‌گردد و تلاش در callback_received می‌ماند تا فراخوان تصمیم بگیرد.
 */
export async function settleVerifiedAttempt(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  input: { attemptId: string; invoiceId: string; amount: number; reference: string },
) {
  const verified = await transitionToVerified(tx, clinicId, userId, input.attemptId, input.reference);
  if (!verified) return null;
  const invoice = await payInvoice(tx, clinicId, input.invoiceId, {
    amount: input.amount,
    method: "gateway",
    reference: input.reference,
  });
  if (!invoice) throw new PaymentAttemptError(`invoice ${input.invoiceId} disappeared while settling a payment`);
  return { attempt: verified, invoice };
}
