import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { aftercareEnrollments, aftercareSequences } from "../schema.js";
import type { Tx } from "../tenant.js";

/**
 * موتور Aftercare — لایه داده (فاز ۵a / ADR-0046).
 *
 * هر دستور `clinicId` دارد. RLS لایه دوم است نه تنها لایه — یک ریپویی که
 * فقط به RLS تکیه کند، در اولین مسیری که با نقش migrate اجرا می‌شود (ورکر،
 * اسکریپت، تست) کل دیتابیس را می‌بیند.
 *
 * دو تصمیم مرکزی:
 *
 *   ۱) گام‌ها در لحظه ثبت‌نام snapshot می‌شوند. ویرایش یک دنباله برنامه‌ی
 *      بیمارانِ در جریان را تکان نمی‌دهد.
 *
 *   ۲) `nextRunAt` از `startedAt + offsetHours` محاسبه می‌شود، نه از «الان + فاصله
 *      تا گام بعدی». با فاصله‌ی نسبی، یک worker که دو ساعت دیر بیدار شده
 *      همه‌ی گام‌های بعد را دو ساعت جلو می‌برد و خطا جمع می‌شود.
 */

export class AftercareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AftercareError";
  }
}

export interface AftercareStepRow {
  offsetHours: number;
  channel: string;
  templateKey: string;
  vars?: Record<string, string>;
}

export interface SequenceRow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  serviceId: string | null;
  locale: string;
  steps: AftercareStepRow[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const sequenceColumns = {
  id: aftercareSequences.id,
  name: aftercareSequences.name,
  description: aftercareSequences.description,
  trigger: aftercareSequences.trigger,
  serviceId: aftercareSequences.serviceId,
  locale: aftercareSequences.locale,
  steps: aftercareSequences.steps,
  active: aftercareSequences.active,
  createdAt: aftercareSequences.createdAt,
  updatedAt: aftercareSequences.updatedAt,
} as const;

function asSteps(value: unknown): AftercareStepRow[] {
  return Array.isArray(value) ? (value as AftercareStepRow[]) : [];
}

/* ── sequences ───────────────────────────────────────────────────── */

export interface SequenceCreateInput {
  name: string;
  description?: string | undefined;
  trigger: string;
  serviceId?: string | undefined;
  locale: string;
  steps: AftercareStepRow[];
  active: boolean;
}

export async function createSequence(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  input: SequenceCreateInput,
): Promise<SequenceRow> {
  const rows = await tx
    .insert(aftercareSequences)
    .values({
      clinicId,
      name: input.name,
      description: input.description ?? null,
      trigger: input.trigger,
      serviceId: input.serviceId ?? null,
      locale: input.locale,
      steps: input.steps,
      active: input.active,
      createdBy: userId,
    })
    .returning(sequenceColumns);
  const row = rows[0];
  if (!row) throw new AftercareError("sequence insert returned no row");
  return { ...row, steps: asSteps(row.steps) };
}

export async function listSequences(
  tx: Tx,
  clinicId: string,
  page: { limit: number; offset: number },
): Promise<SequenceRow[]> {
  const rows = await tx
    .select(sequenceColumns)
    .from(aftercareSequences)
    .where(and(eq(aftercareSequences.clinicId, clinicId), isNull(aftercareSequences.deletedAt)))
    .orderBy(desc(aftercareSequences.createdAt))
    .limit(page.limit)
    .offset(page.offset);
  return rows.map((row) => ({ ...row, steps: asSteps(row.steps) }));
}

export async function getSequence(tx: Tx, clinicId: string, id: string): Promise<SequenceRow | null> {
  const rows = await tx
    .select(sequenceColumns)
    .from(aftercareSequences)
    .where(
      and(
        eq(aftercareSequences.clinicId, clinicId),
        eq(aftercareSequences.id, id),
        isNull(aftercareSequences.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? { ...row, steps: asSteps(row.steps) } : null;
}

export interface SequencePatch {
  name?: string | undefined;
  description?: string | null | undefined;
  trigger?: string | undefined;
  serviceId?: string | null | undefined;
  locale?: string | undefined;
  steps?: AftercareStepRow[] | undefined;
  active?: boolean | undefined;
}

export async function updateSequence(
  tx: Tx,
  clinicId: string,
  id: string,
  patch: SequencePatch,
): Promise<SequenceRow | null> {
  // فقط فیلدهای فرستاده‌شده. فرستادن undefined به درایزل یعنی ستون را NULL کن
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.trigger !== undefined) set.trigger = patch.trigger;
  if (patch.serviceId !== undefined) set.serviceId = patch.serviceId;
  if (patch.locale !== undefined) set.locale = patch.locale;
  if (patch.steps !== undefined) set.steps = patch.steps;
  if (patch.active !== undefined) set.active = patch.active;
  if (Object.keys(set).length === 0) return getSequence(tx, clinicId, id);

  const rows = await tx
    .update(aftercareSequences)
    .set(set)
    .where(
      and(
        eq(aftercareSequences.clinicId, clinicId),
        eq(aftercareSequences.id, id),
        isNull(aftercareSequences.deletedAt),
      ),
    )
    .returning(sequenceColumns);
  const row = rows[0];
  return row ? { ...row, steps: asSteps(row.steps) } : null;
}

/**
 * soft-delete دنباله و لغو هر ثبت‌نام فعالِ روی آن، در یک تراکنش.
 *
 * حذف دنباله بدون لغو ثبت‌نام‌ها، یک مشت ردیف فعال باقی می‌گذارد که همچنان
 * پیام می‌فرستند و کاربر فکر می‌کند خاموشش کرده — بدترین نوع باگ.
 */
export async function softDeleteSequence(tx: Tx, clinicId: string, id: string): Promise<boolean> {
  const rows = await tx
    .update(aftercareSequences)
    .set({ deletedAt: sql`now()`, active: false })
    .where(
      and(
        eq(aftercareSequences.clinicId, clinicId),
        eq(aftercareSequences.id, id),
        isNull(aftercareSequences.deletedAt),
      ),
    )
    .returning({ id: aftercareSequences.id });
  if (rows.length === 0) return false;

  await tx
    .update(aftercareEnrollments)
    .set({
      state: "cancelled",
      nextRunAt: null,
      cancelledAt: sql`now()`,
      cancelReason: "sequence deleted",
    })
    .where(
      and(
        eq(aftercareEnrollments.clinicId, clinicId),
        eq(aftercareEnrollments.sequenceId, id),
        eq(aftercareEnrollments.state, "active"),
      ),
    );
  return true;
}

/* ── enrollments ────────────────────────────────────────────────── */

export interface EnrollmentRow {
  id: string;
  sequenceId: string;
  patientId: string;
  sessionId: string | null;
  state: string;
  currentStep: number;
  stepsSnapshot: AftercareStepRow[];
  locale: string;
  startedAt: Date;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  attempts: number;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

const enrollmentColumns = {
  id: aftercareEnrollments.id,
  sequenceId: aftercareEnrollments.sequenceId,
  patientId: aftercareEnrollments.patientId,
  sessionId: aftercareEnrollments.sessionId,
  state: aftercareEnrollments.state,
  currentStep: aftercareEnrollments.currentStep,
  stepsSnapshot: aftercareEnrollments.stepsSnapshot,
  locale: aftercareEnrollments.locale,
  startedAt: aftercareEnrollments.startedAt,
  nextRunAt: aftercareEnrollments.nextRunAt,
  lastRunAt: aftercareEnrollments.lastRunAt,
  attempts: aftercareEnrollments.attempts,
  completedAt: aftercareEnrollments.completedAt,
  cancelledAt: aftercareEnrollments.cancelledAt,
} as const;

function hydrate(row: {
  stepsSnapshot: unknown;
  [key: string]: unknown;
}): EnrollmentRow {
  return { ...(row as unknown as EnrollmentRow), stepsSnapshot: asSteps(row.stepsSnapshot) };
}

/** زمان اجرای یک گام، همیشه نسبت به مبدأ ثبت‌نام. خطا جمع نمی‌شود. */
export function stepRunAt(startedAt: Date, step: AftercareStepRow | undefined): Date | null {
  if (!step) return null;
  return new Date(startedAt.getTime() + step.offsetHours * 3_600_000);
}

export interface EnrollmentCreateInput {
  sequenceId: string;
  patientId: string;
  sessionId?: string | undefined;
  locale?: string | undefined;
  /** مبدأ محاسبه offsetHours. پیش‌فرض اکنون. */
  startAt?: Date | undefined;
}

/**
 * ثبت‌نام. دنباله باید موجود، زنده و فعال باشد.
 *
 * برخورد با یکتایی جزئی `aftercare_enrollments_active_uq` به `null` تبدیل می‌شود
 * نه به خطا: ثبت‌نام دوباره‌ی همان بیمار در همان دنباله یک دوباره‌کلیک است،
 * نه یک خطای سرور.
 */
export async function createEnrollment(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  input: EnrollmentCreateInput,
): Promise<EnrollmentRow | null> {
  const sequence = await getSequence(tx, clinicId, input.sequenceId);
  if (!sequence) throw new AftercareError("sequence not found");
  if (!sequence.active) throw new AftercareError("sequence is not active");
  if (sequence.steps.length === 0) throw new AftercareError("sequence has no steps");

  const startedAt = input.startAt ?? new Date();
  const firstRunAt = stepRunAt(startedAt, sequence.steps[0]);

  const rows = await tx
    .insert(aftercareEnrollments)
    .values({
      clinicId,
      sequenceId: sequence.id,
      patientId: input.patientId,
      sessionId: input.sessionId ?? null,
      state: "active",
      currentStep: 0,
      stepsSnapshot: sequence.steps,
      locale: input.locale ?? sequence.locale,
      startedAt,
      nextRunAt: firstRunAt,
      enrolledBy: userId,
    })
    .onConflictDoNothing()
    .returning(enrollmentColumns);
  const row = rows[0];
  return row ? hydrate(row) : null;
}

export interface EnrollmentFilter {
  patientId?: string | undefined;
  sequenceId?: string | undefined;
  state?: string | undefined;
  limit: number;
  offset: number;
}

export async function listEnrollments(tx: Tx, clinicId: string, filter: EnrollmentFilter): Promise<EnrollmentRow[]> {
  const conditions = [eq(aftercareEnrollments.clinicId, clinicId)];
  if (filter.patientId) conditions.push(eq(aftercareEnrollments.patientId, filter.patientId));
  if (filter.sequenceId) conditions.push(eq(aftercareEnrollments.sequenceId, filter.sequenceId));
  if (filter.state) conditions.push(eq(aftercareEnrollments.state, filter.state));

  const rows = await tx
    .select(enrollmentColumns)
    .from(aftercareEnrollments)
    .where(and(...conditions))
    .orderBy(desc(aftercareEnrollments.createdAt))
    .limit(filter.limit)
    .offset(filter.offset);
  return rows.map(hydrate);
}

export async function getEnrollment(tx: Tx, clinicId: string, id: string): Promise<EnrollmentRow | null> {
  const rows = await tx
    .select(enrollmentColumns)
    .from(aftercareEnrollments)
    .where(and(eq(aftercareEnrollments.clinicId, clinicId), eq(aftercareEnrollments.id, id)))
    .limit(1);
  const row = rows[0];
  return row ? hydrate(row) : null;
}

export type EnrollmentAction = "pause" | "resume" | "cancel";

/**
 * تغییر حالت. `resume` زمان اجرای بعدی را از همان گامِ جاری بازمی‌سازد. اگر
 * مدتی متوقف بوده و زمان گام گذشته، بلافاصله سررسید می‌شود — این درست‌تر
 * از جلو بردن کل برنامه است: پیامِ روز سوم روز سوم معنا دارد.
 */
export async function setEnrollmentState(
  tx: Tx,
  clinicId: string,
  id: string,
  action: EnrollmentAction,
  reason?: string,
): Promise<EnrollmentRow | null> {
  const current = await getEnrollment(tx, clinicId, id);
  if (!current) return null;

  const set: Record<string, unknown> = {};
  if (action === "pause") {
    if (current.state !== "active") throw new AftercareError("only an active enrollment can be paused");
    set.state = "paused";
    set.nextRunAt = null;
  } else if (action === "resume") {
    if (current.state !== "paused") throw new AftercareError("only a paused enrollment can be resumed");
    const step = current.stepsSnapshot[current.currentStep];
    if (!step) {
      set.state = "completed";
      set.nextRunAt = null;
      set.completedAt = sql`now()`;
    } else {
      set.state = "active";
      set.nextRunAt = stepRunAt(current.startedAt, step);
    }
  } else {
    if (current.state === "completed" || current.state === "cancelled") return current;
    set.state = "cancelled";
    set.nextRunAt = null;
    set.cancelledAt = sql`now()`;
    set.cancelReason = reason ?? "cancelled by staff";
  }

  const rows = await tx
    .update(aftercareEnrollments)
    .set(set)
    .where(and(eq(aftercareEnrollments.clinicId, clinicId), eq(aftercareEnrollments.id, id)))
    .returning(enrollmentColumns);
  const row = rows[0];
  return row ? hydrate(row) : null;
}

export interface ClaimedEnrollment {
  enrollmentId: string;
  sequenceId: string;
  patientId: string;
  sessionId: string | null;
  currentStep: number;
  stepsSnapshot: AftercareStepRow[];
  locale: string;
  attempts: number;
}

/** بیشترین تلاش پیش از رها کردن یک گام. حلقه بی‌پایان بدتر از یک پیام نرفته است. */
export const AFTERCARE_MAX_ATTEMPTS = 5;
export const AFTERCARE_CLAIM_LIMIT_MAX = 500;

/**
 * برداشتن اتمیک کارهای سررسیده — یک دستور، با FOR UPDATE SKIP LOCKED درون
 * `fn_aftercare_claim_due`. هر پیاده‌سازی دومرحله‌ای (بخوان → بنویس) دو worker را
 * روی همان ردیف می‌نشاند و بیمار دو پیام می‌گیرد.
 */
export async function claimDueEnrollments(tx: Tx, clinicId: string, limit: number): Promise<ClaimedEnrollment[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > AFTERCARE_CLAIM_LIMIT_MAX) {
    throw new AftercareError(`claim limit must be between 1 and ${AFTERCARE_CLAIM_LIMIT_MAX}`);
  }
  const res = await tx.execute(sql`
    SELECT enrollment_id, sequence_id, patient_id, session_id,
           current_step, steps_snapshot, locale, attempts
      FROM fn_aftercare_claim_due(${clinicId}::uuid, ${limit}::integer)
  `);
  const rows =
    (res as {
      rows?: Array<{
        enrollment_id: string;
        sequence_id: string;
        patient_id: string;
        session_id: string | null;
        current_step: number;
        steps_snapshot: unknown;
        locale: string;
        attempts: number;
      }>;
    }).rows ?? [];
  return rows.map((row) => ({
    enrollmentId: row.enrollment_id,
    sequenceId: row.sequence_id,
    patientId: row.patient_id,
    sessionId: row.session_id,
    currentStep: Number(row.current_step),
    stepsSnapshot: asSteps(row.steps_snapshot),
    locale: row.locale,
    attempts: Number(row.attempts),
  }));
}

/**
 * یک گام جلو رفتن. اگر گام بعدی وجود نداشت، ثبت‌نام تمام می‌شود و از صف
 * خارج می‌شود (`next_run_at = NULL`) — قید queue_chk در 0017 همین را اجبار می‌کند.
 */
export async function advanceEnrollment(tx: Tx, clinicId: string, id: string): Promise<EnrollmentRow | null> {
  const current = await getEnrollment(tx, clinicId, id);
  if (!current) return null;

  const nextStepIndex = current.currentStep + 1;
  const nextStep = current.stepsSnapshot[nextStepIndex];
  const set: Record<string, unknown> =
    nextStep === undefined
      ? {
          currentStep: current.stepsSnapshot.length,
          state: "completed",
          nextRunAt: null,
          completedAt: sql`now()`,
          attempts: 0,
        }
      : {
          currentStep: nextStepIndex,
          nextRunAt: stepRunAt(current.startedAt, nextStep),
          attempts: 0,
        };

  const rows = await tx
    .update(aftercareEnrollments)
    .set(set)
    .where(and(eq(aftercareEnrollments.clinicId, clinicId), eq(aftercareEnrollments.id, id)))
    .returning(enrollmentColumns);
  const row = rows[0];
  return row ? hydrate(row) : null;
}

/**
 * یک گام شکست خورد. تا سقف تلاش، عقب می‌اندازیم (backoff خطی برحسب
 * تلاش)؛ بعد از آن گام رها و به گام بعد می‌رویم. گیر کردن روی یک گام،
 * کل دنباله را می‌کشد.
 */
export async function deferEnrollment(
  tx: Tx,
  clinicId: string,
  id: string,
  attempts: number,
): Promise<EnrollmentRow | null> {
  if (attempts >= AFTERCARE_MAX_ATTEMPTS) return advanceEnrollment(tx, clinicId, id);
  const delayMinutes = Math.min(attempts, AFTERCARE_MAX_ATTEMPTS) * 15;
  const rows = await tx
    .update(aftercareEnrollments)
    .set({ nextRunAt: sql`now() + (${delayMinutes}::integer * interval '1 minute')` })
    .where(
      and(
        eq(aftercareEnrollments.clinicId, clinicId),
        eq(aftercareEnrollments.id, id),
        eq(aftercareEnrollments.state, "active"),
      ),
    )
    .returning(enrollmentColumns);
  const row = rows[0];
  return row ? hydrate(row) : null;
}
