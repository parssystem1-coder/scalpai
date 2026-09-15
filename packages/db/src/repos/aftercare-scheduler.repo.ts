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
