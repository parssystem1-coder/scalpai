/**
 * outOfDistribution.ts — فاز ۴٫۳
 *
 * تشخیص «این تصویر شبیه چیزی نیست که مدل روی آن آموزش دیده».
 *
 * چرا مهم است؟ مدل محلی روی هر ورودی‌ای عددی برمی‌گرداند — حتی روی عکس دست،
 * دیوار، یا تصویری با نورپردازی کاملاً متفاوت. بدون سنجش OOD، آن خروجی با
 * همان اطمینان ظاهری نمایش داده می‌شود که خروجی یک نمونهٔ کاملاً معمولی.
 *
 * روش: فاصلهٔ z-score نرمال‌شده نسبت به میانگین/انحراف‌معیار فیچرهای آموزشی
 * (همان `featureMeans`/`featureStds` که از قبل در متادیتای مدل ذخیره می‌شود).
 * عمداً از Mahalanobis کامل استفاده نشده چون ماتریس کوواریانس با دیتاست کوچک
 * فعلی بدحالت (ill-conditioned) می‌شود و نتیجه‌اش از این روش سادهٔ قطری
 * بی‌ثبات‌تر خواهد بود. این یک انتخاب آگاهانه است، نه ساده‌سازی از سر تنبلی.
 */

/** بالاتر از این فاصله، ورودی مشکوک به خارج‌از‌توزیع است */
export const OOD_WARN_DISTANCE = 2.5;
/** بالاتر از این، به‌شدت غیرعادی */
export const OOD_STRONG_DISTANCE = 4;

export type OodLevel = 'inRange' | 'borderline' | 'outOfRange';

export interface OodAssessment {
  level: OodLevel;
  /** میانگین قدرمطلق z-score روی همهٔ ابعاد فیچر */
  meanAbsZ: number;
  /** بیشترین انحراف مشاهده‌شده */
  maxAbsZ: number;
  /** اندیس ابعادی که بیشترین انحراف را دارند (برای عیب‌یابی) */
  topDeviatingIndices: number[];
  /** آیا اصلاً قابل ارزیابی بود؟ (نیازمند آمار آموزشی سازگار) */
  evaluated: boolean;
}

const NOT_EVALUATED: OodAssessment = {
  level: 'inRange',
  meanAbsZ: 0,
  maxAbsZ: 0,
  topDeviatingIndices: [],
  evaluated: false,
};

/**
 * سنجش فاصلهٔ یک بردار فیچر تا توزیع دادهٔ آموزشی.
 *
 * اگر آمار آموزشی موجود/سازگار نباشد، `evaluated: false` برمی‌گردد و هرگز
 * هشدار کاذب تولید نمی‌شود — «نمی‌دانم» با «عادی است» یکی گرفته نمی‌شود.
 */
export function assessOutOfDistribution(
  featureVector: number[] | null | undefined,
  means: number[] | null | undefined,
  stds: number[] | null | undefined,
): OodAssessment {
  if (!featureVector?.length || !means?.length || !stds?.length) return NOT_EVALUATED;
  if (featureVector.length !== means.length || means.length !== stds.length) return NOT_EVALUATED;

  const zs: number[] = [];
  for (let i = 0; i < featureVector.length; i++) {
    const v = featureVector[i];
    const m = means[i];
    const sd = stds[i];
    if (!Number.isFinite(v) || !Number.isFinite(m) || !Number.isFinite(sd)) continue;
    // std صفر/خیلی کوچک یعنی آن بُعد در آموزش ثابت بوده؛ تقسیم بر آن
    // z را به بی‌نهایت می‌برد و کل سنجش را بی‌معنا می‌کند.
    const safeSd = Math.abs(sd) < 1e-6 ? 1 : Math.abs(sd);
    zs.push(Math.abs((v - m) / safeSd));
  }
  if (!zs.length) return NOT_EVALUATED;

  const meanAbsZ = zs.reduce((a, b) => a + b, 0) / zs.length;
  const maxAbsZ = Math.max(...zs);

  const topDeviatingIndices = zs
    .map((z, i) => ({ z, i }))
    .sort((a, b) => b.z - a.z)
    .slice(0, 3)
    .filter(x => x.z >= OOD_WARN_DISTANCE)
    .map(x => x.i);

  let level: OodLevel = 'inRange';
  if (meanAbsZ >= OOD_STRONG_DISTANCE || maxAbsZ >= OOD_STRONG_DISTANCE * 1.5) {
    level = 'outOfRange';
  } else if (meanAbsZ >= OOD_WARN_DISTANCE || maxAbsZ >= OOD_STRONG_DISTANCE) {
    level = 'borderline';
  }

  return { level, meanAbsZ, maxAbsZ, topDeviatingIndices, evaluated: true };
}
