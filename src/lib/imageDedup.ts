/**
 * imageDedup.ts — فاز ۰٫۴
 *
 * جلوگیری از فراخوانی تکراری و بی‌فایدهٔ سرویس AI روی تصویری که قبلاً
 * تحلیل شده است. انگیزه: هر فراخوانی هزینه/سهمیهٔ API مصرف می‌کند و روی
 * سرویس‌های رایگان به rate-limit می‌خورد؛ ضمن اینکه نتایج تکراری آرشیو
 * بیمار را شلوغ می‌کند.
 *
 * محدودهٔ عمدی: این ماژول فقط *تشخیص* می‌دهد و تصمیم نهایی با کاربر است
 * (ممکن است عمداً بخواهد با مدل دیگری دوباره تحلیل کند).
 */

export interface PriorAnalysisLike {
  id: string;
  clientId: string;
  type: string;
  galleryItemId?: string;
  createdAt: string;
}

export interface DuplicateAnalysisInfo {
  analysisId: string;
  createdAt: string;
  /** چند تحلیل قبلی روی همین تصویر وجود دارد */
  count: number;
}

/**
 * آیا این تصویر قبلاً برای همین مشتری با همین نوع تحلیل، تحلیل شده است؟
 * جدیدترین تحلیل قبلی برگردانده می‌شود.
 */
export function findPriorAnalysisForImage(
  analyses: PriorAnalysisLike[] | undefined | null,
  params: { clientId: string; galleryItemId: string; type: string },
): DuplicateAnalysisInfo | null {
  if (!analyses?.length) return null;
  if (!params.galleryItemId || !params.clientId) return null;

  const matches = analyses.filter(a =>
    a.type === params.type
    && a.clientId === params.clientId
    && a.galleryItemId === params.galleryItemId,
  );
  if (matches.length === 0) return null;

  const newest = matches.reduce((best, cur) =>
    cur.createdAt.localeCompare(best.createdAt) > 0 ? cur : best,
  );
  return {
    analysisId: newest.id,
    createdAt: newest.createdAt,
    count: matches.length,
  };
}

/**
 * هش سبک و پایدار از محتوای تصویر (base64) — برای تشخیص آپلود مجدد
 * *همان* فایل با شناسهٔ گالری متفاوت.
 *
 * عمداً از کل رشته استفاده نمی‌کنیم (برای تصاویر چندمگابایتی کند است)؛
 * ترکیب طول + نمونه‌برداری یکنواخت، برای تشخیص فایل یکسان کافی است و
 * برخورد تصادفی عملاً ناممکن است. این یک هش رمزنگاری‌شده نیست و برای
 * هیچ هدف امنیتی استفاده نمی‌شود.
 */
export function hashImagePayload(base64: string): string {
  if (!base64) return '';
  const payload = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
  const len = payload.length;
  const samples = 4096;
  const step = Math.max(1, Math.floor(len / samples));

  let h1 = 2166136261;
  let h2 = 5381;
  for (let i = 0; i < len; i += step) {
    const c = payload.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 = (Math.imul(h2, 33) + c) | 0;
  }
  return `${len.toString(36)}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
}
