/**
 * featureRecompute.ts — موج ۱ (W1-4)
 *
 * مکانیزم «بازمحاسبهٔ فیچر نمونه‌های آموزشی از روی تصویر خام گالری».
 *
 * چرا وجود دارد؟ هر بار که فرمول استخراج فیچر عوض می‌شود (مثلاً سگمنتیشن
 * Otsu در فاز ۲)، `FEATURE_VERSION` باید بامپ شود تا استخر آموزشی با دو
 * توزیع متفاوتِ یک‌جا مخلوط نشود. اما بامپ نسخه به‌تنهایی یعنی همهٔ
 * برچسب‌های متخصصِ قبلی از چرخهٔ آموزش خارج می‌شوند — داده‌ای که گران‌ترین
 * دارایی پروژه است. چون تصویر خام در گالری باقی می‌ماند، می‌توان فیچرها را
 * با فرمول جدید دوباره محاسبه کرد بدون اینکه برچسب متخصص از دست برود.
 *
 * نکتهٔ دامنه:
 *  - تاریخچهٔ بالینی (`Analysis`های ذخیره‌شده) دست‌نخورده می‌ماند؛ فقط
 *    `TrainingSample.features` و `featureVersion` بازنویسی می‌شوند.
 *  - نمونه‌های بدون تصویر خام (یا تصویر پاک‌شده) بازنشسته (legacy) می‌مانند و
 *    طبق `isSampleEligibleForTraining` خودبه‌خود از آموزش خارج می‌شوند.
 *  - ماژول از محیط اجرا بی‌خبر است: واکشی تصویر و استخراج فیچر تزریق‌پذیرند تا
 *    هم در renderer (با canvas) و هم در تست (با ساختگی) قابل استفاده باشد.
 */

import type { TrainingSample } from '../db/types';
import type { ScalpFeatureSnapshot } from '../db/types';
import { extractImageFeatures, FEATURE_VERSION } from './scalpFeatures';

export interface RecomputePlan {
  /** نمونه‌هایی که تصویر خام دارند و نسخه‌شان قدیمی است — قابل ارتقا */
  upgradable: TrainingSample[];
  /** نمونه‌های قدیمی بدون تصویر خام — بازنشسته می‌مانند (خارج از آموزش) */
  noImage: TrainingSample[];
  /** نمونه‌هایی که از قبل روی نسخهٔ فعلی‌اند — بدون نیاز به کار */
  current: TrainingSample[];
}

export interface FeatureUpdate {
  sampleId: string;
  features: ScalpFeatureSnapshot;
  featureVersion: string;
}

export interface RecomputeSummary {
  /** کل نمونه‌های برنامه‌ریزی‌شده برای ارتقا */
  planned: number;
  /** موفق بازمحاسبه‌شده */
  recomputed: number;
  /** قدیمی بدون تصویر خام (از ابتدا) */
  skippedNoImage: number;
  /** تصویر در دسترس نبود یا استخراج شکست خورد */
  failed: number;
  canceled: boolean;
}

export interface RecomputeDeps {
  /** واکشی data URL کامل تصویر گالری — null یعنی فایل در دسترس نیست */
  getImageUrl: (galleryItemId: string) => Promise<string | null>;
  /**
   * استخراج فیچر از data URL — پیش‌فرض موتور واقعی `extractImageFeatures`.
   * در تست، نسخهٔ ساختگی تزریق می‌شود (بدون نیاز به canvas مرورگر).
   */
  extractMetrics?: (imageUrl: string) => Promise<ScalpFeatureSnapshot>;
}

/**
 * طبقه‌بندی نمونه‌ها بر اساس نیاز به بازمحاسبه.
 * قاعده: هر نمونه‌ای که `featureVersion` متفاوت از FEATURE_VERSION فعلی دارد و
 * تصویر خامش در گالری موجود است (galleryItemId)، کاندید ارتقاست — چه نسخهٔ
 * legacy باشد (v3) چه نسخهٔ میانی (v3.2)؛ هر دو با فرمول فعلی یکی می‌شوند.
 */
export function planFeatureRecompute(samples: TrainingSample[]): RecomputePlan {
  const upgradable: TrainingSample[] = [];
  const noImage: TrainingSample[] = [];
  const current: TrainingSample[] = [];

  for (const s of samples) {
    if (s.featureVersion === FEATURE_VERSION) {
      current.push(s);
    } else if (s.galleryItemId) {
      upgradable.push(s);
    } else {
      noImage.push(s);
    }
  }

  return { upgradable, noImage, current };
}

/**
 * اجرای دسته‌ای بازمحاسبه — با تسلیم دوره‌ای به حلقهٔ رویداد تا UI فریز نشود،
 * قابلیت لغو در میانه، و جداسازی شکست هر نمونه از بقیه (یک تصویر خراب کل
 * دسته را از کار نمی‌اندازد).
 */
export async function runFeatureRecomputeBatch(
  samples: TrainingSample[],
  deps: RecomputeDeps,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
): Promise<{ updates: FeatureUpdate[]; summary: RecomputeSummary }> {
  const plan = planFeatureRecompute(samples);
  const updates: FeatureUpdate[] = [];
  let failed = 0;
  let skippedNoImage = plan.noImage.length;
  let canceled = false;

  const total = plan.upgradable.length;
  const extract =
    deps.extractMetrics ??
    (async (url: string): Promise<ScalpFeatureSnapshot> =>
      (await extractImageFeatures(url)).metrics);

  for (let i = 0; i < total; i++) {
    if (shouldCancel?.()) {
      canceled = true;
      break;
    }
    const sample = plan.upgradable[i];
    try {
      const url = await deps.getImageUrl(sample.galleryItemId!);
      if (!url) {
        skippedNoImage++;
      } else {
        const features = await extract(url);
        updates.push({ sampleId: sample.id, features, featureVersion: FEATURE_VERSION });
      }
    } catch {
      failed++;
    }
    onProgress?.(i + 1, total);
    // تسلیم به حلقهٔ رویداد — حتی با صدها نمونه، UI پاسخ‌گو می‌ماند
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  return {
    updates,
    summary: {
      planned: total,
      recomputed: updates.length,
      skippedNoImage,
      failed,
      canceled,
    },
  };
}
