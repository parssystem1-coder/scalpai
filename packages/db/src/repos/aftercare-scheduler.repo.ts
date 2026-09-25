import { sql } from "drizzle-orm";
import type { Tx } from "../tenant.js";

/**
 * کشف کلینیک‌های دارای کارِ سررسیده — تنها خواندنِ فاز ۵a که درون مرز
 * یک tenant اجرا نمی‌شود (ADR-0046).
 *
 * در فایل جدا است تا کنار ریپوی تنانت‌اسکوپ aftercare ننشیند و شبیه یک دعوت
 * به نوشتن تابع‌های مشابه به نظر نرسد. پشتِ آن `fn_aftercare_due_clinics` است
 * (0018)، که فقط هویت کلینیک می‌دهد — هیچ داده‌ی بیمار یا پیامی.
 *
 * این تابع با `DbService.withClient` فراخوانی می‌شود (بدون app.clinic_id)، و هر
 * کاری که بعد از آن می‌آید در یک تراکنش per-clinic و RLS‌دار انجام می‌شود.
 */

export interface DueClinic {
  clinicId: string;
  name: string;
  timezone: string;
}

/** سقف کلینیک در هر tick. همان سقفی که تابع SQL هم اعمال می‌کند. */
export const DUE_CLINIC_LIMIT_MAX = 1000;

export async function listDueClinics(tx: Tx, limit = 200): Promise<DueClinic[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > DUE_CLINIC_LIMIT_MAX) {
    throw new Error(`clinic discovery limit must be between 1 and ${DUE_CLINIC_LIMIT_MAX}`);
  }
  const res = await tx.execute(sql`
    SELECT clinic_id, clinic_name, clinic_timezone
      FROM fn_aftercare_due_clinics(${limit}::integer)
  `);
  const rows =
    (res as unknown as { rows?: Array<{ clinic_id: string; clinic_name: string; clinic_timezone: string }> }).rows ?? [];
  return rows.map((row) => ({
    clinicId: row.clinic_id,
    name: row.clinic_name,
    timezone: row.clinic_timezone,
  }));
}

/* ══ موج ۴ (D15) — یادآوری جلسه مشتق از sessions.start_at ═══════════════ */

/** نقاط یادآوری پیش‌فرض: T−۲۴ ساعت و T−۲ ساعت. (ADR-0055: واحد ساعت است.) */
export const SESSION_REMINDER_OFFSETS = [24, 2] as const;

export interface ClaimedSessionReminder {
  sessionId: string;
  patientId: string;
  startAt: Date;
  offsetHours: number;
  messageId: string;
  duplicate: boolean;
}

/**
 * برداشتن یادآوری‌های سررسیده جلسه — مستقیم روی `fn_aftercare_claim_session_reminders`
 * (0023). قفلِ کار، INSERT پیام با کلید یکتاست: دو ورکر هرگز دو پیام نمی‌سازند.
 *
 * ردیف‌های duplicate هم برمی‌گردند: پیامِ ساخته‌شده توسط ورکر دیگری که هنوز
 * queued مانده باید توسط همین tick ارسال شود — وگرنه اگر ورکر اول بعد از ساخت
 * ردیف مرد، یادآوری هرگز نمی‌رود. ارسالِ duplicate بی‌خطر است: PATCH همان ردیف،
 * نه ردیف دوم.
 */
export async function claimDueSessionReminders(
  tx: Tx,
  clinicId: string,
  offsets: readonly number[] = SESSION_REMINDER_OFFSETS,
): Promise<ClaimedSessionReminder[]> {
  if (offsets.length === 0 || offsets.length > 10 || offsets.some((o) => !Number.isInteger(o) || o < 0 || o > 720)) {
    throw new Error("session reminder offsets must be integers between 0 and 720 (max 10 entries)");
  }
  const res = await tx.execute(sql`
    SELECT session_id, patient_id, start_at, offset_hours, message_id, duplicate
      FROM fn_aftercare_claim_session_reminders(${clinicId}::uuid, ${sql.raw(`ARRAY[${offsets.join(",")}]::integer[]`)})
  `);
  const rows =
    (res as unknown as {
      rows?: Array<{
        session_id: string;
        patient_id: string;
        start_at: Date | string;
        offset_hours: number;
        message_id: string;
        duplicate: boolean;
      }>;
    }).rows ?? [];
  return rows.map((row) => ({
    sessionId: row.session_id,
    patientId: row.patient_id,
    startAt: new Date(row.start_at),
    offsetHours: Number(row.offset_hours),
    messageId: row.message_id,
    duplicate: Boolean(row.duplicate),
  }));
}
